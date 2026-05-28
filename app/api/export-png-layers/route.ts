import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { ensureGeneratedDir, getGeneratedDir, getGeneratedProjectRelativeDir, getGeneratedUrl, parseDataUrl, readImageMetadata, readPublicImageUrl } from "@/lib/image-utils";
import { resolveImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromJson, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

type ExportMode = "fast" | "ai_precise";
type InputLayerKind = "background" | "subject" | "text" | "logo" | "qr" | "decoration";

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
};

type ExportLayerSpec = {
  filename: string;
  name: string;
  kind: string;
  note: string;
  render: () => Promise<Buffer>;
  fallback?: () => Promise<Buffer>;
  opacity?: number;
  blendMode?: LayerManifestItem["blendMode"];
  visible?: boolean;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  try {
    const body = await parsePngLayerExportPayload(request);
    taskTrace = taskTraceFromJson(body as Record<string, unknown>, "png_layers", "/api/export-png-layers");
    await recordTaskRunStarted(taskTrace);
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
      const layerStat = await stat(layerPath);
      const url = getGeneratedUrl(path.join(relativeRoot, spec.filename));
      manifest.push({
        filename: spec.filename,
        name: spec.name,
        zIndex: index + 1,
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
        fileSizeBytes: layerStat.size,
        hasAlpha: validation.hasAlpha,
        transparentPixelRatio: validation.transparentPixelRatio,
      });
    }

    const safeBaseName = sanitizeFileBase(body.fileName || "design");
    const layerFileSizeBytes = manifest.reduce((sum, layer) => sum + (layer.fileSizeBytes || 0), 0);
    const layerResult = {
      mode,
      canvasWidth,
      canvasHeight,
      layerCount: manifest.length,
      layers: manifest,
      durationMs: Date.now() - startedAt,
      warnings,
      message: warnings.length ? `PNG 三层已生成，${warnings.length} 层使用兜底。` : "PNG 三层已生成。",
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
      materialType: "PNG三层",
      targetSize: `${canvasWidth}×${canvasHeight}`,
      projectId: taskTrace?.projectId,
      generatedAt: new Date().toISOString(),
      pngLayerExport: layerResult,
    };

    await recordTaskRunFinished(taskTrace, {
      model: imageModel,
      message: warnings.length ? `PNG 三层完成，${warnings.length} 层使用兜底。` : "PNG 三层完成，三张单层 PNG 已保存。",
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
  const subjectLayers = input.layers.filter((layer) => layer.kind === "subject");
  const cleanupRects = [...textLayers, ...subjectLayers]
    .map((layer) => rectFromLayer(layer, input.canvasWidth, input.canvasHeight, input.mode === "ai_precise" ? 16 : 10))
    .filter((rect): rect is PixelRect => Boolean(rect));

  return [
    {
      filename: "01_background.png",
      name: "背景层",
      kind: "background",
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
      note: input.mode === "ai_precise" ? "AI 三层分包：只提取所有可见文字像素，透明背景，同画布位置不偏移。" : "快速模式使用可编辑文字数据重建透明文字层。",
      fallback: () => createTextLayer(input.canvasWidth, input.canvasHeight, textLayers),
      render: () => input.mode === "ai_precise"
        ? createAiTextVisualTransparentLayer(input.basePng, input.canvasWidth, input.canvasHeight, input.imageModel)
        : createTextLayer(input.canvasWidth, input.canvasHeight, textLayers),
    },
    {
      filename: "03_person.png",
      name: "人物层",
      kind: "person",
      note: input.mode === "ai_precise" ? "AI 三层分包：只保留人物/医生/人像，透明背景，同画布位置不偏移。" : "快速模式不导出矩形人物假图层，请使用 AI 精细分层。",
      fallback: () => createTransparentLayer(input.canvasWidth, input.canvasHeight),
      render: () => input.mode === "ai_precise"
        ? createAiPersonVisualTransparentLayer(input.basePng, input.canvasWidth, input.canvasHeight, input.imageModel)
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
      warning: `图层 ${spec.filename} AI 生成失败，已使用兜底层。原因：${reason}`,
    };
  }
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
  // Keep the PNG three-layer strategy model-driven: background, text, and person
  // are generated as visual layers, then normalized to same-canvas transparent PNGs.
  const chromaCandidate = await createAiPngLayer({
    filename: "03_person.png",
    height,
    imageModel,
    prompt: [
      "Create a full-canvas AI-generated person-only visual layer from the input design.",
      "The person itself is an image layer for background, text, and person same-canvas transparent PNGs.",
      "Create a full-canvas person-only visual layer from the input design.",
      "Render only human/person pixels on a perfectly solid chroma magenta background (#ff00ff): face, hair, skin, hands, body, and clothing fabric.",
      "Keep the original person identity, expression, pose, clothing style, lighting direction, scale, crop, and approximate position.",
      "Exclude all background, products, objects, readable text, logos, QR codes, icons, labels, cards, panels, banners, decorations, frames, props, and abstract graphics.",
      "Every non-person design element must be pure #ff00ff, even when it touches or overlaps the body.",
      "If a foreground graphic covers part of the person, generate a clean natural continuation of the visible clothing/body shape behind it. Do not add cards, text, icons, or props.",
      "Use the exact same full canvas size and keep the person in the same visual area. Do not crop, pad, resize, or shift the layer.",
      "Same full canvas and same visual area. No crop, no padding, no shift.",
      "If there is no person, return a pure #ff00ff full-canvas image.",
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
    const distance = colorDistance(output[index] || 0, output[index + 1] || 0, output[index + 2] || 0, key.r, key.g, key.b);
    if (distance < 42) {
      output[index + 3] = 0;
    } else if (distance < 96) {
      const alpha = output[index + 3] || 255;
      output[index + 3] = Math.round(alpha * ((distance - 42) / 54));
    }
  }
  return rawRgbaToPng(output, width, height);
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
