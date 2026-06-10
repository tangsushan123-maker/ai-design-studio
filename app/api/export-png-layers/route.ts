import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { ensureGeneratedDir, getGeneratedDir, getGeneratedProjectRelativeDir, getGeneratedUrl, parseDataUrl, readImageMetadata, readPublicImageUrl } from "@/lib/image-utils";
import { resolveImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, startTaskRunHeartbeat, taskRunResponseMeta, taskTraceFromJson, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

type ExportMode = "fast" | "ai_precise";
type InputLayerKind = "background" | "subject" | "person" | "product" | "main_visual" | "auxiliary" | "text" | "logo" | "qr" | "decoration";

type InputLayer = {
  id?: string;
  kind?: InputLayerKind;
  label?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  align?: "left" | "center" | "right";
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  visible?: boolean;
  role?: string;
};

type LayerManifestItem = {
  filename: string;
  name: string;
  zIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  x: number;
  y: number;
  opacity: number;
  blendMode: "normal" | "screen" | "multiply";
  visible: boolean;
  note: string;
  kind: string;
  url: string;
  fileSizeBytes: number;
  hasAlpha: boolean;
  transparentPixelRatio: number;
  opaquePixelRatio: number;
};

type ExportLayerSpec = {
  filename: string;
  name: string;
  kind: string;
  note: string;
  render: () => Promise<Buffer>;
  fallback?: () => Promise<Buffer>;
  zIndex?: number;
  opacity?: number;
  blendMode?: LayerManifestItem["blendMode"];
  visible?: boolean;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  let stopTaskHeartbeat = () => {};
  try {
    const body = await parsePngLayerExportPayload(request);
    taskTrace = taskTraceFromJson(body as Record<string, unknown>, "png_layers", "/api/export-png-layers");
    await recordTaskRunStarted(taskTrace);
    stopTaskHeartbeat = startTaskRunHeartbeat(taskTrace, "PNG 分层仍在处理：正在拆分和保存图层。");
    if (!body.imageUrl && !body.imageData) {
      await recordTaskRunFailed(taskTrace, "请提供要导出分层的图片。");
      return NextResponse.json({ error: "请提供要导出分层的图片。" }, { status: 400 });
    }

    const mode = normalizeExportMode(body.mode);
    const source = body.imageData ? parseDataUrl(body.imageData) : await readPublicImageUrl(body.imageUrl || "");
    const imageModel = resolveImageModel(body.imageModel, body.model);
    const sourceMeta = await readImageMetadata(source);
    const canvasWidth = sourceMeta.width || 1;
    const canvasHeight = sourceMeta.height || 1;
    const basePng = await sharp(source)
      .rotate()
      .resize(canvasWidth, canvasHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    const baseRaw = await sharp(basePng).ensureAlpha().raw().toBuffer();
    const sourceLayers = normalizeInputLayers(body.layers || [], canvasWidth, canvasHeight);

    await ensureGeneratedDir();
    const packId = `layers-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const packRoot = path.join(getGeneratedProjectRelativeDir(taskTrace?.projectId, "layer-packs"), packId);
    const relativeRoot = path.join(packRoot, "project_layers");
    const absoluteRoot = path.join(getGeneratedDir(), relativeRoot);
    await mkdir(absoluteRoot, { recursive: true });

    const specs = buildExportLayerSpecs({
      baseRaw,
      basePng,
      canvasHeight,
      canvasWidth,
      imageModel,
      layers: sourceLayers,
      mode,
    });
    const manifest: LayerManifestItem[] = [];
    const renderedLayers: Buffer[] = [];
    const warnings: string[] = [];

    for (let index = 0; index < specs.length; index += 1) {
      const spec = specs[index];
      const renderResult = await renderLayerWithFallback(spec);
      if (renderResult.warning) warnings.push(renderResult.warning);
      const png = await normalizeLayerPng(renderResult.png, canvasWidth, canvasHeight);
      const validation = await inspectLayerPng(png, canvasWidth, canvasHeight);
      if (validation.width !== canvasWidth || validation.height !== canvasHeight || !validation.hasAlpha) {
        throw new Error(`图层 ${spec.filename} 尺寸或 alpha 通道异常，已停止导出。`);
      }
      const layerPath = path.join(absoluteRoot, spec.filename);
      await writeFile(layerPath, png);
      renderedLayers.push(png);
      const url = getGeneratedUrl(path.join(relativeRoot, spec.filename));
      manifest.push({
        filename: spec.filename,
        name: spec.name,
        zIndex: spec.zIndex ?? index + 1,
        canvasWidth,
        canvasHeight,
        x: 0,
        y: 0,
        opacity: spec.opacity ?? 1,
        blendMode: spec.blendMode ?? "normal",
        visible: spec.visible ?? true,
        note: renderResult.warning ? `${spec.note} ${renderResult.warning}` : spec.note,
        kind: spec.kind,
        url,
        fileSizeBytes: png.byteLength,
        hasAlpha: validation.hasAlpha,
        transparentPixelRatio: validation.transparentPixelRatio,
        opaquePixelRatio: validation.opaquePixelRatio,
      });
    }

    const backgroundLayerIndex = manifest.findIndex((layer) => layer.kind === "background");
    const foregroundMaskLayers = manifest
      .map((layer, index) => ({ layer, png: renderedLayers[index] }))
      .filter((item) => item.layer.kind !== "background" && item.png);
    if (mode === "ai_precise" && backgroundLayerIndex >= 0 && renderedLayers[backgroundLayerIndex] && foregroundMaskLayers.length) {
      const cleanedBackground = await removeForegroundMasksFromBackground({
        backgroundPng: renderedLayers[backgroundLayerIndex],
        maskPngs: foregroundMaskLayers.map((item) => item.png),
        width: canvasWidth,
        height: canvasHeight,
      });
      const validation = await inspectLayerPng(cleanedBackground, canvasWidth, canvasHeight);
      const layer = manifest[backgroundLayerIndex];
      const layerPath = path.join(absoluteRoot, layer.filename);
      await writeFile(layerPath, cleanedBackground);
      renderedLayers[backgroundLayerIndex] = cleanedBackground;
      layer.fileSizeBytes = cleanedBackground.byteLength;
      layer.hasAlpha = validation.hasAlpha;
      layer.transparentPixelRatio = validation.transparentPixelRatio;
      layer.opaquePixelRatio = validation.opaquePixelRatio;
      layer.note = `${layer.note} 已用文字层和人物层遮罩做本地背景残留清理，减少合成时重复文字/人物。`;
    }

    for (let index = manifest.length - 1; index >= 0; index -= 1) {
      const layer = manifest[index];
      if (layer.kind === "background" || layer.opaquePixelRatio > 0.0002) continue;
      manifest.splice(index, 1);
      renderedLayers.splice(index, 1);
    }

    const safeBaseName = sanitizeFileBase(body.fileName || "design");
    const foregroundLayers = manifest.filter((layer) => layer.kind !== "background");
    const usefulForegroundLayers = foregroundLayers.filter((layer) => layer.opaquePixelRatio > 0.0002);
    const hasUsefulForegroundLayers = usefulForegroundLayers.length > 0;
    const textLayer = manifest.find((layer) => layer.kind === "text");
    if (!textLayer && mode === "ai_precise") {
      warnings.push("模型没有返回可用文字层：如果原图有文字，请复查文字是否被误归到其他层或没有分离出来。");
    }
    if (!hasUsefulForegroundLayers) {
      warnings.push("未识别到可用的前景图层：当前结果主要来自背景层，请复查模型是否正确拆分文字和人物。");
    }
    const compositeLayerBuffers = manifest
      .map((layer, index) => ({ layer, png: renderedLayers[index] }))
      .filter((item): item is { layer: LayerManifestItem; png: Buffer } => Boolean(item.png))
      .filter((item) => item.layer.visible !== false)
      .sort((a, b) => a.layer.zIndex - b.layer.zIndex)
      .map((item) => item.png);
    const compositePng = await compositePngLayers(compositeLayerBuffers, canvasWidth, canvasHeight);
    const compositeFilename = "00_composite_preview.png";
    await writeFile(path.join(absoluteRoot, compositeFilename), compositePng);
    const compositeUrl = getGeneratedUrl(path.join(relativeRoot, compositeFilename));
    const reconstruction = await inspectLayerPackageReconstruction(basePng, compositePng, canvasWidth, canvasHeight, hasUsefulForegroundLayers);
    if (!hasUsefulForegroundLayers) {
      warnings.push("建议使用已配置 API Key 的智能分层，或先做参考图重制/设计分析，让系统获得文字和人物区域。");
    } else if (reconstruction.score < 92) {
      warnings.push(`叠加还原度 ${reconstruction.score}%，建议放大检查文字、人物边缘，并按需使用快速分层或手动精修。`);
    }
    const normalizedWarnings = compactLayerWarnings(warnings);
    const qualityReport = {
      reconstruction,
      warnings: normalizedWarnings,
      mode,
      canvasWidth,
      canvasHeight,
      generatedAt: new Date().toISOString(),
    };
    const manifestFilename = "layers.json";
    const reportFilename = "quality_report.json";
    const manifestJson = Buffer.from(JSON.stringify({ canvasWidth, canvasHeight, layers: manifest }, null, 2));
    const reportJson = Buffer.from(JSON.stringify(qualityReport, null, 2));
    await writeFile(path.join(absoluteRoot, manifestFilename), manifestJson);
    await writeFile(path.join(absoluteRoot, reportFilename), reportJson);
    const zipFileName = `${safeBaseName}-png-layers-${mode}.zip`;
    const zip = buildStoredZip([
      ...manifest.map((layer, index) => ({ filename: layer.filename, content: renderedLayers[index] })),
      { filename: compositeFilename, content: compositePng },
      { filename: manifestFilename, content: manifestJson },
      { filename: reportFilename, content: reportJson },
    ]);
    await writeFile(path.join(absoluteRoot, zipFileName), zip);
    const zipUrl = getGeneratedUrl(path.join(relativeRoot, zipFileName));
    const layerFileSizeBytes = manifest.reduce((sum, layer) => sum + (layer.fileSizeBytes || 0), 0);
    const capabilityStatus = normalizedWarnings.length || !hasUsefulForegroundLayers || reconstruction.score < 92 ? "needs_review" : "ready";
    const completionMessage = !hasUsefulForegroundLayers
      ? "PNG 分层包已保存，但未得到可用前景层，不能按完整分层交付。"
      : normalizedWarnings.length
        ? `PNG 分层已生成 ${manifest.length} 层，存在 ${normalizedWarnings.length} 条复查提示。`
        : `PNG 分层已生成 ${manifest.length} 层，叠加还原检查通过。`;
    const layerResult = {
      mode,
      canvasWidth,
      canvasHeight,
      layerCount: manifest.length,
      layers: manifest,
      durationMs: Date.now() - startedAt,
      capabilityStatus,
      warnings: normalizedWarnings,
      compositeUrl,
      reconstruction,
      zipFileName,
      zipFileSizeBytes: zip.byteLength,
      zipUrl,
      message: completionMessage,
    };
    const layerOutput = {
      id: packId,
      url: body.imageUrl || manifest[0]?.url || "",
      originalUrl: body.imageUrl || manifest[0]?.url || "",
      fileName: `${safeBaseName}-png-layers-${mode}`,
      mode: `PNG 分层 · ${mode}`,
      model: imageModel,
      outputSize: { width: canvasWidth, height: canvasHeight },
      fileSizeBytes: layerFileSizeBytes,
      nodeOperation: "png_layers",
      materialType: "PNG分层",
      targetSize: `${canvasWidth}×${canvasHeight}`,
      projectId: taskTrace?.projectId,
      generatedAt: new Date().toISOString(),
      pngLayerExport: layerResult,
    };

    await recordTaskRunFinished(taskTrace, {
      model: imageModel,
      message: completionMessage,
      outputs: [layerOutput],
    });
    return NextResponse.json({
      ...taskRunResponseMeta(taskTrace, startedAt, [layerOutput]),
      ...layerResult,
    });
  } catch (error) {
    if (error instanceof InvalidPngLayerExportPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const apiError = toApiError(error, "PNG 分层导出失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  } finally {
    stopTaskHeartbeat();
  }

  });
}

class InvalidPngLayerExportPayloadError extends Error {}

async function parsePngLayerExportPayload(request: Request): Promise<{
  imageUrl?: string;
  imageData?: string;
  fileName?: string;
  mode?: ExportMode;
  imageModel?: string;
  model?: string;
  layers?: InputLayer[];
}> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidPngLayerExportPayloadError("PNG 分层请求格式不正确。");
    }
    return body as {
      imageUrl?: string;
      imageData?: string;
      fileName?: string;
      mode?: ExportMode;
      imageModel?: string;
      model?: string;
      layers?: InputLayer[];
    };
  } catch (error) {
    if (error instanceof InvalidPngLayerExportPayloadError) throw error;
    throw new InvalidPngLayerExportPayloadError("PNG 分层 JSON 无法解析，请检查请求内容后重试。");
  }
}

function normalizeExportMode(value: unknown): ExportMode {
  return value === "fast" ? "fast" : "ai_precise";
}

function compactLayerWarnings(warnings: string[]) {
  const output: string[] = [];
  for (const warning of warnings) {
    if (!output.includes(warning)) output.push(warning);
  }
  return output;
}

function normalizeInputLayers(layers: InputLayer[], canvasWidth: number, canvasHeight: number) {
  return layers
    .filter((layer) => layer && layer.kind)
    .map((layer) => ({
      ...layer,
      x: clampNumber(layer.x, 0, 100, 0),
      y: clampNumber(layer.y, 0, 100, 0),
      width: clampNumber(layer.width, 0.2, 100, 100),
      height: clampNumber(layer.height, 0.2, 100, 100),
      fontSize: Math.max(8, Math.min(Math.max(canvasWidth, canvasHeight), Number(layer.fontSize) || Math.round(canvasHeight * 0.05))),
      visible: layer.visible !== false,
    }));
}

function buildExportLayerSpecs(input: {
  baseRaw: Buffer;
  basePng: Buffer;
  canvasWidth: number;
  canvasHeight: number;
  imageModel: string;
  layers: InputLayer[];
  mode: ExportMode;
}): ExportLayerSpec[] {
  const textLayers = input.layers.filter((layer) => layer.kind === "text" && layer.text);
  const subjectLayers = input.layers.filter((layer) => ["subject", "person", "product", "main_visual"].includes(layer.kind || ""));
  const cleanupRects = [...textLayers, ...subjectLayers]
    .map((layer) => rectFromLayer(layer, input.canvasWidth, input.canvasHeight, input.mode === "ai_precise" ? 16 : 10))
    .filter((rect): rect is PixelRect => Boolean(rect));

  return [
    {
      filename: "01_background.png",
      name: "背景层",
      kind: "background",
      zIndex: 1,
      note: input.mode === "ai_precise" ? "AI 三层分包：去除文字和人物后补全干净背景，保留非文字设计氛围。" : "快速背景层：只清理可识别文字/人物占位区域。",
      fallback: () => createCleanBackgroundLayer(input.baseRaw, input.canvasWidth, input.canvasHeight, cleanupRects, input.mode),
      render: () => input.mode === "ai_precise"
        ? createAiPngLayer({
            sourcePng: input.basePng,
            width: input.canvasWidth,
            height: input.canvasHeight,
            imageModel: input.imageModel,
            filename: "01_background.png",
            transparent: false,
            prompt: [
              "Create the clean background layer for a 3-layer PNG export.",
              "Edit the input design into a clean full-canvas background layer.",
              "Remove every readable text, number, slogan, label, typography element, logo text, and every human/person figure.",
              "Reconstruct the hidden areas naturally so the background looks clean: matching color, gradients, texture, lighting, perspective, material, grain, and edge continuity.",
              "Keep non-text background atmosphere, panels, gradients, abstract shapes, and decorative background graphics only when they are not part of text or a person.",
              "No readable text. No person. Same canvas, same framing, no crop, no padding, no shift.",
            ].join("\n"),
          })
        : createCleanBackgroundLayer(input.baseRaw, input.canvasWidth, input.canvasHeight, cleanupRects, input.mode),
    },
    {
      filename: "02_text.png",
      name: "文字层",
      kind: "text",
      zIndex: 3,
      note: input.mode === "ai_precise" ? "智能分层：高保真提取文字视觉，清理透明底并保持同画布位置。" : "快速模式使用可编辑文字数据重建透明文字层。",
      fallback: () => createTextLayer(input.canvasWidth, input.canvasHeight, textLayers),
      render: () => input.mode === "ai_precise"
        ? createAiTextVisualTransparentLayer(input.basePng, input.canvasWidth, input.canvasHeight, input.imageModel)
        : createTextLayer(input.canvasWidth, input.canvasHeight, textLayers),
    },
    {
      filename: "03_person.png",
      name: "人物层",
      kind: "person",
      zIndex: 2,
      note: input.mode === "ai_precise" ? "AI 三层分包：保留人物、IP、产品和非文字主视觉，透明背景，同画布位置不偏移。" : "快速模式不导出矩形人物假图层，请使用 AI 精细分层。",
      fallback: () => createTransparentLayer(input.canvasWidth, input.canvasHeight),
      render: () => input.mode === "ai_precise"
        ? createAiPersonVisualTransparentLayer(input.basePng, input.canvasWidth, input.canvasHeight, input.imageModel)
        : createTransparentLayer(input.canvasWidth, input.canvasHeight),
    },
    {
      filename: "04_person_only.png",
      name: "单独人物层",
      kind: "person_only",
      zIndex: 4,
      visible: false,
      note: input.mode === "ai_precise" ? "附加层：只保留人物/IP/角色本体，方便 PS 单独移动或精修；不参与成品叠加预览。" : "快速模式不导出单独人物层，请使用 AI 精细分层。",
      fallback: () => createTransparentLayer(input.canvasWidth, input.canvasHeight),
      render: () => input.mode === "ai_precise"
        ? createAiPersonOnlyTransparentLayer(input.basePng, input.canvasWidth, input.canvasHeight, input.imageModel)
        : createTransparentLayer(input.canvasWidth, input.canvasHeight),
    },
  ];
}

type PixelRect = { left: number; top: number; width: number; height: number };

async function renderLayerWithFallback(spec: ExportLayerSpec) {
  try {
    return { png: await spec.render(), warning: "" };
  } catch (error) {
    if (!spec.fallback) throw error;
    const reason = error instanceof Error ? error.message : String(error || "未知错误");
    return {
      png: await spec.fallback(),
      warning: layerFallbackWarning(spec, reason),
    };
  }
}

function layerFallbackWarning(spec: ExportLayerSpec, reason: string) {
  if (spec.kind === "person") {
    return `人物层未生成可用内容，已保留背景和文字层。可能是原图没有明显非文字主视觉，或上游接口临时失败。原因：${reason}`;
  }
  return `图层 ${spec.filename} AI 生成失败，已使用兜底层。原因：${reason}`;
}

function rectFromLayer(layer: InputLayer, canvasWidth: number, canvasHeight: number, padding = 0): PixelRect | null {
  const left = Math.floor((clampNumber(layer.x, 0, 100, 0) / 100) * canvasWidth) - padding;
  const top = Math.floor((clampNumber(layer.y, 0, 100, 0) / 100) * canvasHeight) - padding;
  const width = Math.ceil((clampNumber(layer.width, 0.2, 100, 0) / 100) * canvasWidth) + padding * 2;
  const height = Math.ceil((clampNumber(layer.height, 0.2, 100, 0) / 100) * canvasHeight) + padding * 2;
  const right = Math.min(canvasWidth, Math.max(0, left) + width);
  const bottom = Math.min(canvasHeight, Math.max(0, top) + height);
  const clampedLeft = Math.max(0, left);
  const clampedTop = Math.max(0, top);
  const clampedWidth = right - clampedLeft;
  const clampedHeight = bottom - clampedTop;
  if (clampedWidth < 2 || clampedHeight < 2) return null;
  return { left: clampedLeft, top: clampedTop, width: clampedWidth, height: clampedHeight };
}

async function createCleanBackgroundLayer(baseRaw: Buffer, width: number, height: number, cleanupRects: PixelRect[], mode: ExportMode) {
  if (!cleanupRects.length) return rawRgbaToPng(baseRaw, width, height);
  const blurRadius = mode === "ai_precise" ? Math.max(22, Math.round(Math.min(width, height) * 0.035)) : Math.max(12, Math.round(Math.min(width, height) * 0.018));
  const blurred = await sharp(baseRaw, { raw: { width, height, channels: 4 } })
    .blur(blurRadius)
    .raw()
    .toBuffer();
  const output = Buffer.from(baseRaw);
  for (const rect of cleanupRects) {
    for (let y = rect.top; y < rect.top + rect.height; y += 1) {
      for (let x = rect.left; x < rect.left + rect.width; x += 1) {
        const index = (y * width + x) * 4;
        output[index] = blurred[index] || 0;
        output[index + 1] = blurred[index + 1] || 0;
        output[index + 2] = blurred[index + 2] || 0;
        output[index + 3] = 255;
      }
    }
  }
  return rawRgbaToPng(output, width, height);
}

async function createTextLayer(width: number, height: number, layers: InputLayer[]) {
  const visibleTextLayers = layers.filter((layer) => layer.text?.trim());
  if (!visibleTextLayers.length) return createTransparentLayer(width, height);
  const elements = visibleTextLayers.map((layer, index) => renderTextSvgElement(layer, width, height, index)).join("\n");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="rgba(0,0,0,0.45)"/></filter></defs>`,
    elements,
    "</svg>",
  ].join("\n");
  return sharp(Buffer.from(svg)).ensureAlpha().png({ compressionLevel: 9, palette: false }).toBuffer();
}

function renderTextSvgElement(layer: InputLayer, canvasWidth: number, canvasHeight: number, index: number) {
  const rect = rectFromLayer(layer, canvasWidth, canvasHeight, 0) || { left: 0, top: 0, width: canvasWidth, height: canvasHeight };
  const fontSize = Math.max(10, Math.round(Number(layer.fontSize) || canvasHeight * 0.05));
  const lineHeight = fontSize * (Number(layer.lineHeight) || 1.15);
  const anchor = layer.align === "left" ? "start" : layer.align === "right" ? "end" : "middle";
  const x = layer.align === "left" ? rect.left : layer.align === "right" ? rect.left + rect.width : rect.left + rect.width / 2;
  const y = rect.top + Math.max(0, Math.min(rect.height - fontSize, 0));
  const lines = String(layer.text || "").split("\n").filter(Boolean);
  const fill = escapeXml(layer.color || "#ffffff");
  const weight = Math.round(Number(layer.fontWeight) || (index === 0 ? 800 : 650));
  const strokeWidth = Math.max(0, Number(layer.strokeWidth) || 0);
  const stroke = escapeXml(layer.strokeColor || "rgba(0,0,0,0.42)");
  const filter = Number(layer.shadowBlur || 0) > 0 ? ` filter="url(#softShadow)"` : "";
  return [
    `<g${filter}>`,
    ...lines.map((line, lineIndex) => {
      const currentY = y + lineIndex * lineHeight + fontSize;
      const common = `x="${x.toFixed(2)}" y="${currentY.toFixed(2)}" text-anchor="${anchor}" font-family="Arial, 'Helvetica Neue', sans-serif" font-size="${fontSize}" font-weight="${weight}" letter-spacing="${Number(layer.letterSpacing) || 0}"`;
      const content = escapeXml(line);
      return [
        strokeWidth ? `<text ${common} fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round">${content}</text>` : "",
        `<text ${common} fill="${fill}">${content}</text>`,
      ].filter(Boolean).join("\n");
    }),
    "</g>",
  ].join("\n");
}

async function createTransparentLayer(width: number, height: number) {
  return rawRgbaToPng(Buffer.alloc(width * height * 4), width, height);
}

async function createAiTextVisualTransparentLayer(
  sourcePng: Buffer,
  width: number,
  height: number,
  imageModel: string,
) {
  const textPrompt = [
    "Create a full-canvas text-only visual layer from the input design.",
    "Render only original visible readable text pixels: Chinese, English, numbers, slogans, labels, title, subtitle, small info text, logo text, and text inside badges/buttons.",
      "Keep original text positions, scale, line breaks, color, stroke, shadow, glow, weight, spacing, perspective, softness, and hierarchy.",
      "Keep the original text positions, scale, line breaks, color, stroke, shadow, glow, outline, weight, spacing, perspective, edge softness, and hierarchy.",
    "Do not translate, rewrite, correct, invent, add, or remove characters.",
    "Do not include background, people, products, non-text icons, panels, photos, gradients, decorations, or texture blocks.",
    "Same full canvas and same text positions. No crop, no padding, no shift.",
  ].join("\n");

  const chromaCandidate = await createAiPngLayer({
    filename: "02_text.png",
    height,
    imageModel,
    prompt: [
      textPrompt,
      "Output on a perfectly solid chroma magenta background (#ff00ff).",
      "Every non-text pixel must be pure #ff00ff. No checkerboard, gradients, panels, icons, photos, or decorations.",
      "Render text in original visual colors/effects. Do not use magenta for text.",
    ].join("\n"),
    sourcePng,
    transparent: false,
    width,
  });
  const keyed = await keyOutChromaBackground(chromaCandidate, width, height, { r: 255, g: 0, b: 255 });
  const cleaned = await cleanTransparentLayerMatte(keyed, width, height, "text");
  return ensureUsefulTextLayer(cleaned, width, height);
}

async function createAiPersonVisualTransparentLayer(
  sourcePng: Buffer,
  width: number,
  height: number,
  imageModel: string,
) {
  // Keep the PNG three-layer strategy model-driven: background, text, and foreground visual
  // are generated as visual layers, then normalized to same-canvas transparent PNGs.
  const chromaCandidate = await createAiPngLayer({
    filename: "03_person.png",
    height,
    imageModel,
    prompt: [
      "Create a full-canvas non-text foreground visual layer from the input design.",
      "This is the third Photoshop delivery layer: foreground visual / person / IP / product / main visual, on a transparent background after chroma keying.",
      "Keep every visible non-text foreground element: human/person, doctor, child, face, body, clothing, cartoon or IP character, mascot, illustrated organ character, product, package, device, chair, prop, central photo, central illustration, main visual, icon, badge shape, card shape, button shape, title backplate, text backplate, decorative frame, glow frame, foreground platform, and foreground light ring.",
      "For cards, buttons, badges, and backplates: keep the shape, border, glow, icon, and material; remove only the readable text glyphs from them.",
      "Do not render Chinese characters, English letters, numbers, slogans, labels, phone numbers, addresses, QR codes, or any readable typography in this layer. Text belongs only to 02_text.png.",
      "Keep original position, size, proportion, crop, color, edge softness, lighting, material, shadows, reflections, and approximate visual details unchanged.",
      "Use the exact same full canvas size. No crop, no padding, no resize, no shift, no redesign, no new elements.",
      "Output on a perfectly solid chroma magenta background (#ff00ff). Every pixel outside the requested foreground visual layer must be pure #ff00ff.",
      "If there is absolutely no non-text foreground visual content, return a pure #ff00ff full-canvas image.",
    ].join("\n"),
    sourcePng,
    transparent: false,
    width,
  });
  const keyed = await keyOutChromaBackground(chromaCandidate, width, height, { r: 255, g: 0, b: 255 });
  const cleaned = await cleanTransparentLayerMatte(keyed, width, height, "person");
  return ensureUsefulTransparentLayer(cleaned, width, height);
}

async function createAiPersonOnlyTransparentLayer(
  sourcePng: Buffer,
  width: number,
  height: number,
  imageModel: string,
) {
  const chromaCandidate = await createAiPngLayer({
    filename: "04_person_only.png",
    height,
    imageModel,
    prompt: [
      "Create a full-canvas person/IP-character-only layer from the input design.",
      "Keep only the visible character or person body: human/person, doctor, child, face, body, clothing, hair, skin, hands, glasses, accessories worn by the character, cartoon mascot, IP character, illustrated organ character, and chair or small prop directly attached to the character pose.",
      "Exclude every surrounding design element: background, title backplate, text backplate, card shape, button shape, badge shape, icon, decorative frame, glow frame, platform, light ring, product panel, logo, QR code, readable text, numbers, labels, address, phone, and all typography.",
      "Keep original character identity, pose, expression, proportion, crop, approximate position, color, lighting, edge softness, and shadow details.",
      "Use the exact same full canvas size. No crop, no padding, no resize, no shift, no redesign, no new elements.",
      "Output on a perfectly solid chroma magenta background (#ff00ff). Every pixel outside the requested character/person must be pure #ff00ff.",
      "If there is absolutely no person, mascot, IP character, or illustrated organ character, return a pure #ff00ff full-canvas image.",
    ].join("\n"),
    sourcePng,
    transparent: false,
    width,
  });
  const keyed = await keyOutChromaBackground(chromaCandidate, width, height, { r: 255, g: 0, b: 255 });
  const cleaned = await cleanTransparentLayerMatte(keyed, width, height, "person");
  return ensureUsefulTransparentLayer(cleaned, width, height);
}

async function createAiPngLayer(input: {
  filename: string;
  height: number;
  imageModel: string;
  prompt: string;
  sourcePng: Buffer;
  transparent: boolean;
  width: number;
}) {
  const openai = getOpenAI();
  const imageFile = await toFile(input.sourcePng, "source-design.png", { type: "image/png" });
  const result = await runQueuedImageModelRequestWithRetry(
    { label: `PNG分层/${input.filename}/${input.imageModel}`, maxAttempts: 1 },
    () => openai.images.edit({
      model: input.imageModel,
      image: imageFile,
      prompt: [
        input.prompt,
        "",
        `Canvas requirement: output must be ${input.width}x${input.height}, same full canvas, same element positions, no crop, no padding, no shifted layout.`,
        input.transparent
          ? "Transparency requirement: output a true transparent PNG layer with alpha. Never use white, black, gray, or checkerboard fake transparency. Empty areas must be alpha 0."
          : "Background requirement: output a full opaque background PNG layer.",
      ].join("\n"),
      size: "auto",
      output_format: "png",
      background: input.transparent ? "transparent" : "opaque",
      quality: "high",
      n: 1,
    }, imageRequestOptions()),
  );
  const item = result.data?.[0];
  if (!item) throw new Error(`AI 没有返回 ${input.filename} 图层。`);
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  return normalizeLayerPng(raw, input.width, input.height);
}

async function ensureUsefulTransparentLayer(buffer: Buffer, width: number, height: number) {
  const direct = await normalizeLayerPng(buffer, width, height);
  const directCheck = await inspectLayerPng(direct, width, height);
  if (directCheck.transparentPixelRatio >= 0.06) return direct;

  const keyed = await keyOutCornerBackground(direct, width, height);
  const keyedCheck = await inspectLayerPng(keyed, width, height);
  if (keyedCheck.transparentPixelRatio >= 0.06) return keyed;

  return createTransparentLayer(width, height);
}

async function ensureUsefulTextLayer(buffer: Buffer, width: number, height: number) {
  const direct = await normalizeLayerPng(buffer, width, height);
  const directCheck = await inspectLayerPng(direct, width, height);
  if (directCheck.transparentPixelRatio >= 0.55 && directCheck.opaquePixelRatio >= 0.0002) return direct;

  const keyed = await keyOutCornerBackground(direct, width, height);
  const keyedCheck = await inspectLayerPng(keyed, width, height);
  if (keyedCheck.transparentPixelRatio >= 0.55 && keyedCheck.opaquePixelRatio >= 0.0002) return keyed;

  throw new Error("AI 没有生成可用文字 PNG 图层。");
}

async function keyOutCornerBackground(buffer: Buffer, width: number, height: number) {
  const { data } = await sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sample = sampleCornerColor(data, width, height);
  const output = Buffer.from(data);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const distance = colorDistance(output[index] || 0, output[index + 1] || 0, output[index + 2] || 0, sample.r, sample.g, sample.b);
    if (distance < 34) {
      output[index + 3] = 0;
    } else if (distance < 72) {
      const alpha = output[index + 3] || 255;
      output[index + 3] = Math.round(alpha * ((distance - 34) / 38));
    }
  }
  return rawRgbaToPng(output, width, height);
}

async function keyOutChromaBackground(
  buffer: Buffer,
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
) {
  const { data } = await sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const corner = sampleCornerColor(data, width, height);
  const useCorner = colorDistance(corner.r, corner.g, corner.b, color.r, color.g, color.b) < 92;
  const key = useCorner ? corner : color;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const r = output[index] || 0;
    const g = output[index + 1] || 0;
    const b = output[index + 2] || 0;
    const distance = colorDistance(r, g, b, key.r, key.g, key.b);
    const magentaStrength = chromaMagentaStrength(r, g, b);
    if (distance < 42 || magentaStrength >= 0.86) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
    } else if (distance < 118 || magentaStrength >= 0.45) {
      const alpha = output[index + 3] || 255;
      const distanceAlpha = distance < 118 ? (distance - 42) / 76 : 1;
      const magentaAlpha = magentaStrength >= 0.45 ? 1 - ((magentaStrength - 0.45) / 0.41) : 1;
      output[index + 3] = Math.round(alpha * Math.max(0, Math.min(1, Math.min(distanceAlpha, magentaAlpha))));
    }
  }
  return rawRgbaToPng(output, width, height);
}

function chromaMagentaStrength(r: number, g: number, b: number) {
  if (r < 135 || b < 115) return 0;
  const magentaLead = Math.min(r - g, b - g);
  if (magentaLead <= 18) return 0;
  const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
  return Math.max(0, Math.min(1, (magentaLead / 150) * 0.72 + saturation * 0.28));
}

async function cleanTransparentLayerMatte(buffer: Buffer, width: number, height: number, kind: "text" | "person") {
  const { data } = await sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);
  const transparentBelow = kind === "text" ? 54 : 22;
  const hardenAbove = kind === "text" ? 220 : 246;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const alpha = output[index + 3] || 0;
    if (alpha <= transparentBelow) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
    } else if (alpha >= hardenAbove) {
      output[index + 3] = 255;
    } else {
      const normalized = (alpha - transparentBelow) / Math.max(1, hardenAbove - transparentBelow);
      output[index + 3] = Math.round(255 * Math.max(0, Math.min(1, normalized)));
    }
  }
  return rawRgbaToPng(output, width, height);
}

async function removeForegroundMasksFromBackground(input: {
  backgroundPng: Buffer;
  height: number;
  maskPngs: Buffer[];
  width: number;
}) {
  const blurRadius = Math.max(16, Math.round(Math.min(input.width, input.height) * 0.022));
  const featherRadius = Math.max(4, Math.round(Math.min(input.width, input.height) * 0.006));
  const expandRadius = Math.max(5, Math.round(Math.min(input.width, input.height) * 0.008));
  const [backgroundRaw, blurredRaw, mask] = await Promise.all([
    sharp(input.backgroundPng)
      .resize(input.width, input.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(input.backgroundPng)
      .resize(input.width, input.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .blur(blurRadius)
      .ensureAlpha()
      .raw()
      .toBuffer(),
    combinedAlphaMask(input.maskPngs, input.width, input.height),
  ]);
  const expandedMask = dilateMask(mask, input.width, input.height, expandRadius);
  const featheredMask = boxBlurMask(expandedMask, input.width, input.height, featherRadius);
  const output = Buffer.from(backgroundRaw);
  const total = input.width * input.height;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const maskValue = Math.max(expandedMask[pixel] || 0, featheredMask[pixel] || 0);
    if (maskValue <= 4) continue;
    const index = pixel * 4;
    const strength = Math.min(1, maskValue / 255);
    output[index] = Math.round((output[index] || 0) * (1 - strength) + (blurredRaw[index] || 0) * strength);
    output[index + 1] = Math.round((output[index + 1] || 0) * (1 - strength) + (blurredRaw[index + 1] || 0) * strength);
    output[index + 2] = Math.round((output[index + 2] || 0) * (1 - strength) + (blurredRaw[index + 2] || 0) * strength);
    output[index + 3] = 255;
  }
  return rawRgbaToPng(output, input.width, input.height);
}

async function combinedAlphaMask(maskPngs: Buffer[], width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const png of maskPngs) {
    const raw = await sharp(png)
      .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const alpha = raw[pixel * 4 + 3] || 0;
      if (alpha > mask[pixel]) mask[pixel] = alpha;
    }
  }
  return mask;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      for (let currentX = left; currentX <= right; currentX += 1) {
        const value = mask[row + currentX] || 0;
        if (value > max) max = value;
      }
      horizontal[row + x] = max;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let max = 0;
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      for (let currentY = top; currentY <= bottom; currentY += 1) {
        const value = horizontal[currentY * width + x] || 0;
        if (value > max) max = value;
      }
      output[y * width + x] = max;
    }
  }
  return output;
}

function boxBlurMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      for (let currentX = left; currentX <= right; currentX += 1) {
        sum += mask[row + currentX] || 0;
        count += 1;
      }
      horizontal[row + x] = Math.round(sum / Math.max(1, count));
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      const top = Math.max(0, y - radius);
      const bottom = Math.min(height - 1, y + radius);
      for (let currentY = top; currentY <= bottom; currentY += 1) {
        sum += horizontal[currentY * width + x] || 0;
        count += 1;
      }
      output[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return output;
}

function sampleCornerColor(data: Buffer, width: number, height: number) {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const radius = Math.max(4, Math.round(Math.min(width, height) * 0.035));
  const sampleRect = (left: number, top: number) => {
    for (let y = top; y < Math.min(height, top + radius); y += 1) {
      for (let x = left; x < Math.min(width, left + radius); x += 1) {
        const index = (y * width + x) * 4;
        samples.push({ r: data[index] || 0, g: data[index + 1] || 0, b: data[index + 2] || 0 });
      }
    }
  };
  sampleRect(0, 0);
  sampleRect(Math.max(0, width - radius), 0);
  sampleRect(0, Math.max(0, height - radius));
  sampleRect(Math.max(0, width - radius), Math.max(0, height - radius));
  const count = Math.max(1, samples.length);
  return {
    r: Math.round(samples.reduce((sum, item) => sum + item.r, 0) / count),
    g: Math.round(samples.reduce((sum, item) => sum + item.g, 0) / count),
    b: Math.round(samples.reduce((sum, item) => sum + item.b, 0) / count),
  };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2),
  );
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error("下载 PNG 分层图片失败。");
  return Buffer.from(await response.arrayBuffer());
}

async function rawRgbaToPng(raw: Buffer, width: number, height: number) {
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function normalizeLayerPng(buffer: Buffer, width: number, height: number) {
  return sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function inspectLayerPng(buffer: Buffer, expectedWidth: number, expectedHeight: number) {
  const metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .resize(expectedWidth, expectedHeight, { fit: "fill", kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let opaque = 0;
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] || 0) < 255) transparent += 1;
    if ((data[index] || 0) > 24) opaque += 1;
  }
  return {
    width: metadata.width || info.width,
    height: metadata.height || info.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    transparentPixelRatio: transparent / Math.max(1, info.width * info.height),
    opaquePixelRatio: opaque / Math.max(1, info.width * info.height),
  };
}

async function compositePngLayers(layers: Buffer[], width: number, height: number) {
  const [background, ...overlays] = layers;
  if (!background) return createTransparentLayer(width, height);
  return sharp(background)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .composite(overlays.map((input) => ({ input, blend: "over" as const })))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function inspectLayerPackageReconstruction(original: Buffer, composite: Buffer, width: number, height: number, hasUsefulForegroundLayers = true) {
  const [source, rebuilt] = await Promise.all([
    sharp(original).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
    sharp(composite).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
  ]);
  let totalDifference = 0;
  for (let index = 0; index < source.length; index += 4) {
    totalDifference += Math.abs((source[index] || 0) - (rebuilt[index] || 0));
    totalDifference += Math.abs((source[index + 1] || 0) - (rebuilt[index + 1] || 0));
    totalDifference += Math.abs((source[index + 2] || 0) - (rebuilt[index + 2] || 0));
  }
  const maxDifference = Math.max(1, width * height * 3 * 255);
  const score = Math.max(0, Math.min(100, Math.round((1 - totalDifference / maxDifference) * 100)));
  return {
    score,
    label: !hasUsefulForegroundLayers ? "分层不完整" : score >= 96 ? "还原优秀" : score >= 92 ? "可交付，建议复查" : "需要复查",
    textCheck: "文字层已清理为透明底，请放大确认中文、数字和边缘效果。",
    edgeCheck: "人物层已清理为透明底，请检查人物、IP、产品、卡片和图标边缘是否混入背景。",
  };
}

function buildStoredZip(files: Array<{ filename: string; content: Buffer }>) {
  const localChunks: Buffer[] = [];
  const directoryChunks: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.filename.replace(/\\/g, "/"));
    const checksum = crc32(file.content);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.content.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localChunks.push(local, file.content);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(file.content.length, 20);
    directory.writeUInt32LE(file.content.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);
    directoryChunks.push(directory);
    offset += local.length + file.content.length;
  }
  const directorySize = directoryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localChunks, ...directoryChunks, end]);
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFileBase(value: string) {
  const parsed = path.parse(value);
  return (parsed.name || "design").replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").replace(/^-|-$/g, "") || "design";
}
