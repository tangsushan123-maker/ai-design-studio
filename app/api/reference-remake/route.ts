import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import type { QualityValue } from "@/lib/design-options";
import type { ProtectionContext } from "@/lib/design-production";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import {
  getOpenAIConstrainedTargetPixels,
  getOpenAIRequestedSize,
  getTargetPixels,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  saveImageBuffer,
  saveImageMetadata,
  type PixelSize,
} from "@/lib/image-utils";
import { inspectImageQuality } from "@/lib/image-quality";
import { getAnalysisModel, resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, startTaskRunHeartbeat, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

type ReferenceRemakeMode = "fast" | "precise";

type ReferenceTextLayer = {
  name: string;
  content: string;
  position?: string;
  style?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color?: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
  weight?: "regular" | "medium" | "bold" | "heavy";
};

type ReferenceRemakeAnalysis = {
  design_type: string;
  aspect_ratio: string;
  primary_color: string;
  secondary_color: string;
  style: string;
  background_style: string;
  layout: Record<string, string>;
  text_layers: ReferenceTextLayer[];
  image_layers: string[];
  canvas?: {
    width?: number;
    height?: number;
    ratio?: string;
  };
  design_bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  risks?: string[];
};

type NormalizedBbox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FlatAssetOutputMode = "none" | "white_label" | "full_artwork";

type ReferenceRemakeInput = {
  imageBuffer: Buffer;
  fileName: string;
  mimeType: string;
  mode: ReferenceRemakeMode;
  quality: QualityValue;
  prompt: string;
  textOverride: string;
  imageModel?: string;
  model?: string;
  taskTrace?: TaskRunTrace;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  let stopTaskHeartbeat = () => {};
  try {
    const input = await parseMultipartInput(request);
    taskTrace = input.taskTrace || null;
    await recordTaskRunStarted(taskTrace);
    stopTaskHeartbeat = startTaskRunHeartbeat(taskTrace, "参考图重制仍在处理：正在分析版式并生成高清结果。");

    const openai = getOpenAI();
    const imageModel = resolveImageModel(input.imageModel, input.model);
    const photoRatio = await getImageRatio(input.imageBuffer);
    const provisionalOutputSize = getTargetPixels(photoRatio, input.quality);
    const analysis = mergeTextOverrideLayers(
      await analyzeReferenceDesign(openai, input, photoRatio, provisionalOutputSize),
      input.textOverride,
    );
    const detectedDesignBbox = await detectColorfulDesignBbox(input.imageBuffer).catch(() => undefined);
    const effectiveDesignBbox = chooseReferenceDesignBbox(analysis, detectedDesignBbox);
    const effectiveAnalysis = effectiveDesignBbox ? { ...analysis, design_bbox: effectiveDesignBbox } : analysis;
    const targetDesignRatio = resolveReferenceDesignRatio(effectiveAnalysis, photoRatio);
    const outputSize = /gpt-image-2/i.test(imageModel)
      ? getOpenAIConstrainedTargetPixels(targetDesignRatio, input.quality)
      : getTargetPixels(targetDesignRatio, input.quality);
    const outputRatioLabel = `${targetDesignRatio.width}x${targetDesignRatio.height}`;
    const referenceAsset = await isolateReferenceDesignAsset(input.imageBuffer, effectiveDesignBbox, input.mimeType, input.fileName);
    const prompt = buildReferenceRemakePrompt({
      analysis: effectiveAnalysis,
      imageModel,
      mode: input.mode,
      outputSize,
      quality: input.quality,
      sourcePrompt: input.prompt,
      targetDesignRatio,
    });

    const resultItem = await createReferenceRemakeImage({
      imageBuffer: referenceAsset.buffer,
      imageModel,
      mimeType: referenceAsset.mimeType,
      mode: input.mode,
      outputSize,
      prompt,
      sourceFileName: referenceAsset.fileName || input.fileName,
      sourceRatio: targetDesignRatio,
      quality: input.quality,
    });
    const raw = await imageResultToBuffer(resultItem.b64_json, resultItem.url);
    const normalized = await normalizeGeneratedResult(raw, outputSize);
    const assetNormalized = await normalizeFlatAssetOutput(normalized, outputSize, effectiveAnalysis);
    const finalPng = input.mode === "precise"
      ? await compositeDetectedText(assetNormalized, outputSize, effectiveAnalysis.text_layers)
      : assetNormalized;
    const [actual, saved] = await Promise.all([
      readImageMetadata(finalPng),
      saveImageBuffer(finalPng, "png", {
        ratioLabel: outputRatioLabel,
        quality: input.quality,
        projectId: taskTrace?.projectId,
        storageKind: "results",
      }),
    ]);
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality: input.quality,
      ratio: targetDesignRatio,
      expectedSize: outputSize,
      fileSizeBytes: saved.fileSizeBytes,
      aspectRatio: outputRatioLabel,
      operation: "reference_remake",
      protectionContext: buildReferenceRemakeProtectionContext(effectiveAnalysis),
    });
    const payload = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt,
      variant: 1,
      ratio: targetDesignRatio,
      mode: `参考图重制 · ${referenceRemakeModeLabel(input.mode)}`,
      model: imageModel,
      aspectRatio: outputRatioLabel,
      quality: input.quality,
      generatedAt: new Date().toISOString(),
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: saved.fileSizeBytes,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: taskTrace?.projectId,
      nodeOperation: "reference_remake",
      sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
      sourceRequestId: taskTrace?.requestId,
      sourceNodeId: taskTrace?.nodeId,
      sourceNodeName: taskTrace?.nodeName,
      sourceNodeKind: taskTrace?.nodeKind,
      referenceRemake: {
        mode: input.mode,
        analysis: effectiveAnalysis,
        textLayers: effectiveAnalysis.text_layers,
        targetDesignRatio,
        isolatedDesignReference: referenceAsset.isolated,
        workflow: input.mode === "precise"
          ? "AI 分析参考图 → AI 重制无关键文字视觉 → 程序绘制真实文字 → 高清 PNG 输出"
          : "AI 分析参考图 → AI 快速复刻同风格高清设计 → 高清 PNG 输出",
      },
    };
    await saveImageMetadata(saved.fileName, payload);
    await recordTaskRunFinished(taskTrace, { outputs: [payload], model: imageModel, message: "参考图重制完成，服务端已保存结果。" });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, [payload]), image: payload, images: [payload], analysis, prompt, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "参考图重制失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  } finally {
    stopTaskHeartbeat();
  }

  });
}

async function parseMultipartInput(request: Request): Promise<ReferenceRemakeInput> {
  const formData = await request.formData();
  const image = formData.get("image");
  const sourceUrl = String(formData.get("sourceUrl") ?? "");
  if (!(image instanceof File) && !sourceUrl) throw new Error("请上传或连接一张参考图。");
  if (image instanceof File) assertSupportedImage(image);
  const imageBuffer = image instanceof File
    ? Buffer.from(await image.arrayBuffer())
    : await readPublicImageUrl(sourceUrl);
  const fileName = image instanceof File ? image.name || "reference.png" : sourceUrl.split("/").pop() || "reference.png";
  const mimeType = image instanceof File ? image.type || "image/png" : mimeTypeFromFileName(fileName);
  return {
    imageBuffer,
    fileName,
    mimeType,
    mode: normalizeReferenceRemakeMode(formData.get("mode")),
    quality: normalizeQuality(formData.get("quality")),
    prompt: String(formData.get("prompt") ?? ""),
    textOverride: String(formData.get("textOverride") ?? formData.get("confirmedTextLayers") ?? ""),
    imageModel: String(formData.get("imageModel") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    taskTrace: taskTraceFromFormData(formData, "reference_remake", "/api/reference-remake"),
  };
}

async function analyzeReferenceDesign(
  openai: ReturnType<typeof getOpenAI>,
  input: ReferenceRemakeInput,
  sourceRatio: PixelSize,
  outputSize: PixelSize,
): Promise<ReferenceRemakeAnalysis> {
  const fallback = referenceRemakeAnalysisFallback(sourceRatio, outputSize);
  try {
    const response = await openai.responses.create({
      model: getAnalysisModel(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "请分析这张手机拍摄的设计参考图，并只输出 JSON，不要输出解释。",
                "这不是高清修复任务，而是后续要按参考图比例、配色、版式、风格和信息层级重新生成干净高清设计。",
                "请尽量忽略拍摄透视、反光、污渍、桌面背景、木门、墙面、手、阴影和模糊，只理解设计物本身。",
                "重要：aspect_ratio 和 canvas 必须表示画面中设计物/标识牌/优惠券/工牌/包装正面本身的比例，不是手机照片整张画布比例。",
                "如果参考图里是横向标识牌、横向券、横向展板，即使手机照片是竖拍，也要把 canvas 判断为横向设计比例。",
                "如果设计物有白色外边距或白底，必须在背景风格中标明白底/白边距；不要把木门、桌面、墙面当成背景风格。",
                "JSON 字段必须包含：design_type, aspect_ratio, primary_color, secondary_color, style, background_style, layout, text_layers, image_layers, canvas, design_bbox, risks。",
                "design_bbox 表示原手机照片里主要设计物本体的外接框，使用相对于原照片的 0-1 坐标 x,y,width,height；不要包含木门、桌面、手和环境。",
                "text_layers 每项必须包含 name, content, position, style, bbox。text_layers 的 bbox 使用最终正视重制设计画布的 0-1 坐标，不是手机照片坐标。",
                "请尽量识别中文主标题、副标题、说明文字、价格、编号、日期、电话、地址、姓名、部门等关键文字；看不清时 content 写“待确认”，不要编造。",
                `原图比例约为 ${sourceRatio.width}:${sourceRatio.height}，计划输出 ${outputSize.width}x${outputSize.height}。`,
                input.prompt ? `用户补充要求：${input.prompt}` : "",
              ].filter(Boolean).join("\n"),
            },
            {
              type: "input_image",
              image_url: `data:${input.mimeType || "image/png"};base64,${input.imageBuffer.toString("base64")}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 1800,
    }, { timeout: 45_000 });
    return normalizeReferenceRemakeAnalysis(parseJsonObject(response.output_text || ""), fallback);
  } catch {
    return fallback;
  }
}

function buildReferenceRemakePrompt(input: {
  analysis: ReferenceRemakeAnalysis;
  imageModel: string;
  mode: ReferenceRemakeMode;
  outputSize: PixelSize;
  quality: QualityValue;
  sourcePrompt: string;
  targetDesignRatio: PixelSize;
}) {
  const { analysis, mode, outputSize, targetDesignRatio } = input;
  const textPolicy = mode === "precise"
    ? [
        "Precise remake mode:",
        "Generate the clean background, main visual, illustration/IP/person/product placeholders, decorations, lighting and atmosphere only.",
        "Do not generate key readable Chinese text, numbers, prices, dates, phone numbers, addresses, hospital names, brand names, IDs, QR codes, or rules.",
        "Leave clean visual areas for real programmatic typography. Avoid fake text, garbled text, random letters, and invented logos.",
      ].join("\n")
    : [
        "Fast remake mode:",
        "Generate a complete high-resolution same-style design for quick preview. Readable text may be approximated, but keep the original hierarchy and visual rhythm.",
        "Do not preserve photo artifacts. Do not reproduce glare, stains, table background, wooden door background, wall background, hand, perspective skew, shooting shadow, blur, or compression damage.",
      ].join("\n");
  const flatAssetPolicy = buildFlatDesignAssetPolicy(analysis);
  return [
    "Create a clean high-resolution design remake based on the reference image.",
    "This is not photo restoration and not simple upscaling. Understand the reference design, then recreate a clean commercial design in the same style.",
    "",
    `Canvas: ${outputSize.width} x ${outputSize.height}. Target design ratio: ${targetDesignRatio.width}:${targetDesignRatio.height}. Design natively for this canvas. No crop, no blurred side extension, no frosted padding.`,
    `Design type: ${analysis.design_type || "unknown design"}.`,
    `Style keywords: ${analysis.style || "clean commercial design"}.`,
    `Primary color: ${analysis.primary_color || "match reference"}. Secondary color: ${analysis.secondary_color || "match reference"}.`,
    `Background style: ${analysis.background_style || "clean rebuilt background"}.`,
    `Layout map: ${JSON.stringify(analysis.layout || {})}.`,
    `Main visual layers: ${(analysis.image_layers || []).join(", ") || "match reference visual hierarchy"}.`,
    `Text hierarchy to reserve: ${analysis.text_layers.map((layer) => `${layer.name}:${layer.content}@${layer.position || "auto"}`).join(" | ") || "keep clear text hierarchy"}.`,
    input.sourcePrompt ? `User instruction: ${input.sourcePrompt}` : "",
    "",
    flatAssetPolicy,
    "",
    textPolicy,
    "",
    "Must remove camera-photo artifacts: perspective distortion, glare, stains, table background, wooden door, wall, hand, shooting shadows, blur, noise, dirty edges.",
    "Must preserve the reference design object's approximate ratio, color system, layout hierarchy, visual tone, subject positions, icon/IP/person/product/logo areas, and information hierarchy.",
    "If the phone photo is vertical but the design object is horizontal, output the horizontal design object. Do not rotate a horizontal coupon or sign into a vertical poster.",
    "Use refined commercial lighting, clean edges, natural depth, polished material details, and print-ready clarity.",
    "Avoid cheap template look, clutter, irrelevant objects, wood grain behind a sign unless it is part of the printed design, fake QR codes, invented brand logos, malformed Chinese text, misspellings, bad cropping, distorted products, unnatural faces, random extra elements, and wrong orientation.",
  ].filter(Boolean).join("\n");
}

function buildFlatDesignAssetPolicy(analysis: ReferenceRemakeAnalysis) {
  const outputMode = flatAssetOutputMode(analysis);
  if (outputMode === "none") {
    return [
      "Output policy:",
      "Recreate the designed artwork itself in a clean front-facing view.",
      "Ignore the physical shooting environment unless the environment is explicitly part of the intended final design.",
    ].join("\n");
  }
  if (outputMode === "white_label") {
    return [
      "Flat sign/label asset policy:",
      "Output must be a clean white-background design asset, not a mockup and not a scene.",
      "Place only the sign/label artwork from the photo in the center of a white canvas. The artwork should be large, straight, front-facing and easy to download/use.",
      "Do not generate wooden doors, walls, tables, hands, shadows, room lighting, product-photo backgrounds, or a sign stuck on a surface.",
      "Preserve the blue sign area, white icon circle, text block hierarchy, and approximate proportions. Keep the design content complete with safe margins.",
    ].join("\n");
  }
  return [
    "Flat artwork asset policy:",
    "The output must be the cleaned front-facing design artwork itself, not a photo mockup and not a scene.",
    "Remove all real-world surroundings outside the design object: wooden door, wall, table, desk, hand, camera shadow, glare and skew.",
    "For a red/gold coupon, card, ticket, poster or banner, preserve the horizontal artwork ratio, red field proportion, rounded corners and information hierarchy.",
    "Keep icons, logo areas and text blocks in their original relative positions; do not stretch the red area or compress the white margin.",
  ].join("\n");
}

function flatAssetOutputMode(analysis: ReferenceRemakeAnalysis): FlatAssetOutputMode {
  const designText = `${analysis.design_type || ""} ${analysis.style || ""} ${analysis.background_style || ""} ${(analysis.image_layers || []).join(" ")}`;
  if (/标识牌|标牌|标识|贴纸|标签|指示牌|提示牌|sign|label|sticker/i.test(designText)) return "white_label";
  if (/优惠券|体检券|门票|工牌|卡片|展板|宣传单|横幅|海报|包装|券|coupon|ticket|badge|card|poster|banner|package/i.test(designText)) return "full_artwork";
  return "none";
}

async function createReferenceRemakeImage(input: {
  imageBuffer: Buffer;
  imageModel: string;
  mimeType: string;
  mode: ReferenceRemakeMode;
  outputSize: PixelSize;
  prompt: string;
  sourceFileName: string;
  sourceRatio: PixelSize;
  quality: QualityValue;
}) {
  const openai = getOpenAI();
  const canvas = await createTargetCanvas(input.outputSize);
  const [canvasFile, referenceFile] = await Promise.all([
    toFile(canvas, `target-canvas-${input.outputSize.width}x${input.outputSize.height}.png`, { type: "image/png" }),
    toFile(input.imageBuffer, input.sourceFileName || "reference.png", { type: input.mimeType || "image/png" }),
  ]);
  const requestedSize = getOpenAIRequestedSize(input.sourceRatio, input.quality, input.imageModel);
  const response = await runQueuedImageModelRequestWithRetry(
    { label: `参考图重制/${referenceRemakeModeLabel(input.mode)}/${input.imageModel}` },
    () => openai.images.edit({
      model: input.imageModel,
      image: [canvasFile, referenceFile] as never,
      prompt: [
        "The first image is a blank target canvas. The second image is the phone-shot reference design.",
        "Use the second image only as design reference; recreate a clean design on the first canvas.",
        input.prompt,
      ].join("\n\n"),
      size: requestedSize as "1024x1024",
      quality: input.quality === "standard" ? "medium" : "high",
      output_format: "png",
      background: "opaque",
      ...(supportsConfigurableImageInputFidelity(input.imageModel) ? { input_fidelity: "low" as const } : {}),
      n: 1,
    }, imageRequestOptions()),
  );
  const item = response.data?.[0];
  if (!item) throw new Error("参考图重制没有返回图片。");
  return item;
}

async function normalizeGeneratedResult(raw: Buffer, outputSize: PixelSize) {
  const metadata = await sharp(raw).metadata();
  const sourceWidth = metadata.width || outputSize.width;
  const sourceHeight = metadata.height || outputSize.height;
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
  const targetRatio = outputSize.width / Math.max(1, outputSize.height);
  const ratioDelta = Math.abs(sourceRatio - targetRatio) / Math.max(0.0001, targetRatio);
  if (ratioDelta <= 0.018) return processToExactSize(raw, outputSize, "png", "strict_full_bleed");
  return fitImageOnCleanWhiteCanvas(raw, outputSize);
}

async function fitImageOnCleanWhiteCanvas(raw: Buffer, outputSize: PixelSize) {
  const resized = await sharp(raw)
    .resize(outputSize.width, outputSize.height, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((outputSize.width - resized.info.width) / 2);
  const top = Math.round((outputSize.height - resized.info.height) / 2);
  return sharp({
    create: {
      width: outputSize.width,
      height: outputSize.height,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: resized.data, left: Math.max(0, left), top: Math.max(0, top) }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function normalizeFlatAssetOutput(inputBuffer: Buffer, outputSize: PixelSize, analysis: ReferenceRemakeAnalysis) {
  const outputMode = flatAssetOutputMode(analysis);
  if (outputMode === "none") return inputBuffer;
  const bbox = await detectColorfulDesignBbox(inputBuffer).catch(() => undefined);
  if (!bbox) return inputBuffer;
  const area = bbox.width * bbox.height;
  const shouldNormalize = outputMode === "white_label"
    ? area < 0.72
    : area < 0.78 || Math.abs(bbox.width / Math.max(0.001, bbox.height) - outputSize.width / Math.max(1, outputSize.height)) > 0.18;
  if (!shouldNormalize) return inputBuffer;

  const isolated = await isolateReferenceDesignAsset(inputBuffer, bbox, "image/png", "generated-flat-asset.png");
  if (!isolated.isolated) return inputBuffer;
  if (outputMode === "white_label") {
    return placeAssetOnWhiteCanvas(isolated.buffer, outputSize, 0.86, 0.72);
  }
  return placeAssetOnWhiteCanvas(isolated.buffer, outputSize, 0.96, 0.9);
}

async function placeAssetOnWhiteCanvas(assetBuffer: Buffer, outputSize: PixelSize, maxWidthRatio: number, maxHeightRatio: number) {
  const maxWidth = Math.round(outputSize.width * maxWidthRatio);
  const maxHeight = Math.round(outputSize.height * maxHeightRatio);
  const resized = await sharp(assetBuffer)
    .resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((outputSize.width - resized.info.width) / 2);
  const top = Math.round((outputSize.height - resized.info.height) / 2);
  return sharp({
    create: {
      width: outputSize.width,
      height: outputSize.height,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: resized.data, left: Math.max(0, left), top: Math.max(0, top) }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function isolateReferenceDesignAsset(imageBuffer: Buffer, bbox: ReferenceRemakeAnalysis["design_bbox"] | undefined, mimeType: string, fileName: string) {
  const originalAsset = { buffer: imageBuffer, mimeType: mimeType || "image/png", fileName: fileName || "reference.png", isolated: false };
  const normalized = normalizeBbox(bbox);
  if (!normalized) return originalAsset;
  if (normalized.width * normalized.height > 0.92) return originalAsset;
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return originalAsset;

  const left = Math.max(0, Math.floor(normalized.x * width));
  const top = Math.max(0, Math.floor(normalized.y * height));
  const cropWidth = Math.min(width - left, Math.ceil(normalized.width * width));
  const cropHeight = Math.min(height - top, Math.ceil(normalized.height * height));
  if (cropWidth < 48 || cropHeight < 48) return originalAsset;

  const buffer = await sharp(imageBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
  return { buffer, mimeType: "image/png", fileName: "isolated-reference-design.png", isolated: true };
}

async function compositeDetectedText(basePng: Buffer, outputSize: PixelSize, layers: ReferenceTextLayer[]) {
  const visibleLayers = layers.filter((layer) => layer.content && layer.content !== "待确认");
  if (!visibleLayers.length) return basePng;
  const svg = buildTextOverlaySvg(outputSize, visibleLayers);
  return sharp(basePng)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0, blend: "over" }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function buildTextOverlaySvg(size: PixelSize, layers: ReferenceTextLayer[]) {
  const defs = [
    "<filter id=\"softShadow\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\">",
    "<feDropShadow dx=\"0\" dy=\"3\" stdDeviation=\"3\" flood-color=\"#000000\" flood-opacity=\"0.28\"/>",
    "</filter>",
  ].join("");
  const text = layers.map((layer, index) => renderTextLayerSvg(layer, size, index)).join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    `<defs>${defs}</defs>`,
    text,
    "</svg>",
  ].join("\n");
}

function renderTextLayerSvg(layer: ReferenceTextLayer, size: PixelSize, index: number) {
  const rect = rectFromTextLayer(layer, size, index);
  const fontSize = Math.round(layer.fontSize || inferFontSize(layer, rect, size));
  const fill = layer.color || inferTextColor(layer);
  const stroke = shouldUseTextStroke(layer) ? ` stroke="${inferTextStrokeColor(layer)}" stroke-width="${Math.max(1, Math.round(fontSize * 0.08))}" paint-order="stroke"` : "";
  const weight = layer.weight === "heavy" ? 900 : layer.weight === "bold" ? 800 : layer.weight === "medium" ? 650 : 600;
  const anchor = layer.align === "left" ? "start" : layer.align === "right" ? "end" : "middle";
  const x = layer.align === "left" ? rect.left : layer.align === "right" ? rect.left + rect.width : rect.left + rect.width / 2;
  const lines = wrapText(layer.content, Math.max(4, Math.floor(rect.width / Math.max(1, fontSize * 0.9))));
  const lineHeight = Math.round(fontSize * 1.16);
  const totalHeight = lineHeight * lines.length;
  const startY = Math.round(rect.top + Math.max(fontSize, (rect.height - totalHeight) / 2 + fontSize));
  return [
    `<g filter="url(#softShadow)" opacity="0.98">`,
    ...lines.map((line, lineIndex) =>
      `<text x="${Math.round(x)}" y="${startY + lineIndex * lineHeight}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}"${stroke}>${escapeXml(line)}</text>`,
    ),
    "</g>",
  ].join("\n");
}

function rectFromTextLayer(layer: ReferenceTextLayer, size: PixelSize, index: number) {
  const bbox = normalizeBbox(layer.bbox);
  if (bbox) {
    return {
      left: Math.round(bbox.x * size.width),
      top: Math.round(bbox.y * size.height),
      width: Math.round(bbox.width * size.width),
      height: Math.round(bbox.height * size.height),
    };
  }
  const position = `${layer.position || layer.name || ""}`.toLowerCase();
  if (/top_left|left_top|左上/.test(position)) return percentRect(size, 0.08, 0.08 + index * 0.08, 0.42, 0.12);
  if (/top_right|upper_right|right_top|右上/.test(position)) return percentRect(size, 0.54, 0.08 + index * 0.08, 0.38, 0.12);
  if (/bottom_left|左下/.test(position)) return percentRect(size, 0.08, 0.78, 0.38, 0.12);
  if (/bottom_right|右下/.test(position)) return percentRect(size, 0.54, 0.78, 0.38, 0.12);
  if (/top|顶部|上方/.test(position)) return percentRect(size, 0.18, 0.08 + index * 0.08, 0.64, 0.12);
  if (/bottom|底部|下方/.test(position)) return percentRect(size, 0.18, 0.76 - index * 0.08, 0.64, 0.12);
  return percentRect(size, 0.18, Math.min(0.68, 0.34 + index * 0.12), 0.64, 0.16);
}

function percentRect(size: PixelSize, x: number, y: number, width: number, height: number) {
  return {
    left: Math.round(x * size.width),
    top: Math.round(y * size.height),
    width: Math.round(width * size.width),
    height: Math.round(height * size.height),
  };
}

function inferFontSize(layer: ReferenceTextLayer, rect: { width: number; height: number }, size: PixelSize) {
  const name = `${layer.name || ""}${layer.style || ""}`;
  const base = /主标题|title|大字|立体/.test(name) ? 0.074 : /副标题|subtitle|价格|编号/.test(name) ? 0.046 : 0.032;
  const byCanvas = Math.max(size.width, size.height) * base;
  return Math.max(18, Math.min(rect.height * 0.62, byCanvas));
}

function inferTextColor(layer: ReferenceTextLayer) {
  const style = `${layer.name || ""} ${layer.style || ""}`;
  if (/金|gold|黄/.test(style)) return "#f6d779";
  if (/红|red/.test(style)) return "#cf2424";
  if (/蓝|blue/.test(style)) return "#185ee8";
  if (/黑|black/.test(style)) return "#151515";
  return "#ffffff";
}

function inferTextStrokeColor(layer: ReferenceTextLayer) {
  const fill = inferTextColor(layer);
  return fill === "#ffffff" ? "#6d1e1e" : "#ffffff";
}

function shouldUseTextStroke(layer: ReferenceTextLayer) {
  return /描边|立体|金|白字|标题|title/i.test(`${layer.name || ""} ${layer.style || ""}`);
}

function wrapText(text: string, maxChars: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const lines: string[] = [];
  for (let cursor = 0; cursor < clean.length; cursor += maxChars) {
    lines.push(clean.slice(cursor, cursor + maxChars));
  }
  return lines.slice(0, 4);
}

function mergeTextOverrideLayers(analysis: ReferenceRemakeAnalysis, textOverride: string) {
  const parsed = parseTextOverrideLayers(textOverride);
  if (!parsed.length) return analysis;
  const merged = [...analysis.text_layers];
  parsed.forEach((layer, index) => {
    const matchIndex = merged.findIndex((item) => item.name === layer.name);
    if (matchIndex >= 0) {
      merged[matchIndex] = { ...merged[matchIndex], ...layer, content: layer.content || merged[matchIndex].content };
    } else if (merged[index]) {
      merged[index] = { ...merged[index], ...layer, content: layer.content || merged[index].content };
    } else {
      merged.push(layer);
    }
  });
  return { ...analysis, text_layers: merged };
}

function parseTextOverrideLayers(value: string): ReferenceTextLayer[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = parseJsonObject(trimmed);
  if (Array.isArray(parsed)) return normalizeTextLayerList(parsed);
  const layers: ReferenceTextLayer[] = [];
  for (const rawLine of trimmed.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [name, ...rest] = line.split(/[：:]/);
    const layer = normalizeTextLayer({ name: name || `文字${layers.length + 1}`, content: rest.join(":") || line });
    if (layer) layers.push(layer);
  }
  return layers;
}

function normalizeTextLayerList(value: unknown[]) {
  const layers: ReferenceTextLayer[] = [];
  for (const item of value) {
    const layer = normalizeTextLayer(item);
    if (layer) layers.push(layer);
  }
  return layers;
}

function chooseReferenceDesignBbox(analysis: ReferenceRemakeAnalysis, detected?: NormalizedBbox) {
  const aiBbox = normalizeBbox(analysis.design_bbox);
  if (!detected) return aiBbox;
  const mode = flatAssetOutputMode(analysis);
  if (mode !== "none") return detected;
  if (!aiBbox) return detected;
  const aiArea = aiBbox.width * aiBbox.height;
  const detectedArea = detected.width * detected.height;
  return aiArea > detectedArea * 1.6 ? detected : aiBbox;
}

async function detectColorfulDesignBbox(imageBuffer: Buffer): Promise<NormalizedBbox | undefined> {
  const resized = await sharp(imageBuffer)
    .resize(900, 900, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.nearest,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = resized.info.width;
  const height = resized.info.height;
  const channels = resized.info.channels;
  if (!width || !height || channels < 3) return undefined;

  const mask = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    const r = resized.data[offset] || 0;
    const g = resized.data[offset + 1] || 0;
    const b = resized.data[offset + 2] || 0;
    if (isLikelyDesignColor(r, g, b)) mask[index] = 1;
  }

  const queue = new Int32Array(width * height);
  let best: { area: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    mask[start] = 2;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= mask.length || mask[neighbor] !== 1) continue;
        const neighborX = neighbor % width;
        if ((neighbor === current - 1 && neighborX !== x - 1) || (neighbor === current + 1 && neighborX !== x + 1)) continue;
        mask[neighbor] = 2;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
    if (!best || area > best.area) best = { area, minX, minY, maxX, maxY };
  }

  if (!best) return undefined;
  const areaRatio = best.area / Math.max(1, width * height);
  if (areaRatio < 0.0015 || areaRatio > 0.82) return undefined;
  const padX = Math.round((best.maxX - best.minX + 1) * 0.08);
  const padY = Math.round((best.maxY - best.minY + 1) * 0.08);
  const minX = Math.max(0, best.minX - padX);
  const minY = Math.max(0, best.minY - padY);
  const maxX = Math.min(width - 1, best.maxX + padX);
  const maxY = Math.min(height - 1, best.maxY + padY);
  return {
    x: minX / width,
    y: minY / height,
    width: Math.max(0.001, (maxX - minX + 1) / width),
    height: Math.max(0.001, (maxY - minY + 1) / height),
  };
}

function isLikelyDesignColor(r: number, g: number, b: number) {
  const blue = b > 100 && b > r + 45 && b > g + 15;
  const red = r > 115 && r > g + 45 && r > b + 45 && g < 170;
  const green = g > 105 && g > r + 35 && g > b + 35;
  return blue || red || green;
}

function resolveReferenceDesignRatio(analysis: ReferenceRemakeAnalysis, photoRatio: PixelSize): PixelSize {
  const candidates = [
    ratioFromBbox(analysis.design_bbox),
    ratioFromDesignType(analysis),
    ratioFromText(analysis.aspect_ratio),
    ratioFromCanvas(analysis.canvas),
  ].filter((item): item is PixelSize => Boolean(item));
  return candidates[0] || normalizeReferenceRatio(photoRatio.width, photoRatio.height);
}

function ratioFromCanvas(canvas?: ReferenceRemakeAnalysis["canvas"]) {
  if (!canvas) return null;
  const width = numberValue(canvas.width);
  const height = numberValue(canvas.height);
  if (width && height) return normalizeReferenceRatio(width, height);
  return ratioFromText(stringValue(canvas.ratio));
}

function ratioFromText(value: string) {
  const text = value.trim();
  if (!text) return null;
  const explicit = text.match(/(\d+(?:\.\d+)?)\s*(?::|x|×|比|\/)\s*(\d+(?:\.\d+)?)/i);
  if (explicit) {
    const width = Number(explicit[1]);
    const height = Number(explicit[2]);
    if (width > 0 && height > 0) return normalizeReferenceRatio(width, height);
  }
  const numeric = text.match(/(?:ratio|比例|约为|约)\s*(\d+(?:\.\d+)?)\s*(?::\s*1)?/i);
  if (numeric) {
    const ratio = Number(numeric[1]);
    if (ratio > 0) return normalizeReferenceRatio(ratio, 1);
  }
  if (/横版|横向|宽幅|横幅|landscape|wide/i.test(text)) return normalizeReferenceRatio(2, 1);
  if (/竖版|竖向|portrait|vertical/i.test(text)) return normalizeReferenceRatio(9, 16);
  return null;
}

function ratioFromBbox(bbox?: ReferenceRemakeAnalysis["design_bbox"]) {
  const normalized = normalizeBbox(bbox);
  if (!normalized) return null;
  return normalizeReferenceRatio(normalized.width, normalized.height);
}

function ratioFromDesignType(analysis: ReferenceRemakeAnalysis) {
  const text = `${analysis.design_type || ""} ${analysis.style || ""} ${analysis.background_style || ""}`;
  if (/优惠券|体检券|门票|券|横版|横向|标识牌|标牌|标签|横幅|coupon|ticket|sign|label|banner/i.test(text)) return normalizeReferenceRatio(2.05, 1);
  if (/工牌|证件|竖版|竖向|badge|portrait|vertical/i.test(text)) return normalizeReferenceRatio(9, 16);
  return null;
}

function normalizeReferenceRatio(width: number, height: number): PixelSize {
  const rawRatio = width / Math.max(1, height);
  const ratio = Math.max(0.2, Math.min(5.5, Number.isFinite(rawRatio) ? rawRatio : 1));
  if (ratio >= 1) return { width: Math.round(ratio * 1000), height: 1000 };
  return { width: 1000, height: Math.round(1000 / ratio) };
}

function normalizeReferenceRemakeAnalysis(value: unknown, fallback: ReferenceRemakeAnalysis): ReferenceRemakeAnalysis {
  if (!value || typeof value !== "object") return fallback;
  const data = value as Record<string, unknown>;
  const textLayers = Array.isArray(data.text_layers)
    ? normalizeTextLayerList(data.text_layers)
    : fallback.text_layers;
  return {
    design_type: stringValue(data.design_type) || fallback.design_type,
    aspect_ratio: stringValue(data.aspect_ratio) || fallback.aspect_ratio,
    primary_color: stringValue(data.primary_color) || fallback.primary_color,
    secondary_color: stringValue(data.secondary_color) || fallback.secondary_color,
    style: stringValue(data.style) || fallback.style,
    background_style: stringValue(data.background_style) || fallback.background_style,
    layout: normalizeStringRecord(data.layout) || fallback.layout,
    text_layers: textLayers,
    image_layers: stringArray(data.image_layers, fallback.image_layers),
    canvas: typeof data.canvas === "object" && data.canvas ? data.canvas as ReferenceRemakeAnalysis["canvas"] : fallback.canvas,
    design_bbox: normalizeBbox(data.design_bbox),
    risks: stringArray(data.risks, []),
  };
}

function stringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items: string[] = [];
  for (const item of value) {
    const text = stringValue(item);
    if (text) items.push(text);
  }
  return items.length ? items : fallback;
}

function normalizeTextLayer(value: unknown): ReferenceTextLayer | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const content = stringValue(data.content);
  return {
    name: stringValue(data.name) || "文字层",
    content,
    position: stringValue(data.position),
    style: stringValue(data.style),
    bbox: normalizeBbox(data.bbox),
    color: stringValue(data.color),
    fontSize: numberValue(data.fontSize),
    align: data.align === "left" || data.align === "right" || data.align === "center" ? data.align : undefined,
    weight: data.weight === "regular" || data.weight === "medium" || data.weight === "bold" || data.weight === "heavy" ? data.weight : undefined,
  };
}

function referenceRemakeAnalysisFallback(sourceRatio: PixelSize, outputSize: PixelSize): ReferenceRemakeAnalysis {
  return {
    design_type: "参考图设计稿",
    aspect_ratio: `${sourceRatio.width}:${sourceRatio.height}`,
    primary_color: "参考图主色",
    secondary_color: "参考图辅助色",
    style: "按参考图风格重制，干净高清，商业设计感",
    background_style: "重建干净背景，去除拍摄反光、透视和污渍",
    layout: {
      center: "主视觉和标题信息区",
      bottom: "补充信息区",
    },
    text_layers: [],
    image_layers: ["重建背景", "主视觉元素", "装饰元素", "光影氛围"],
    canvas: { width: outputSize.width, height: outputSize.height, ratio: `${sourceRatio.width}:${sourceRatio.height}` },
    design_bbox: undefined,
    risks: ["参考图文字可能需要用户确认"],
  };
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeBbox(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const x = clamp01(numberValue(data.x) ?? 0);
  const y = clamp01(numberValue(data.y) ?? 0);
  const width = clamp01(numberValue(data.width) ?? 0);
  const height = clamp01(numberValue(data.height) ?? 0);
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, stringValue(item)]));
}

async function createTargetCanvas(size: PixelSize) {
  return sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载参考图重制结果失败。");
  return Buffer.from(await response.arrayBuffer());
}

function referenceRemakeModeLabel(mode: ReferenceRemakeMode) {
  return mode === "precise" ? "精准重制" : "快速复刻";
}

function buildReferenceRemakeProtectionContext(analysis: ReferenceRemakeAnalysis): ProtectionContext {
  const protectedTexts = analysis.text_layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.content && layer.content !== "待确认")
    .slice(0, 16)
    .map(({ layer, index }) => ({
      id: `reference_text_${index + 1}`,
      text: layer.content,
      kind: /电话|地址|价格|日期|编号|姓名|部门/.test(`${layer.name} ${layer.content}`) ? "other" as const : "title" as const,
      importance: index < 4 ? "high" as const : "normal" as const,
      reason: `${layer.name || "参考图文字"}需要按原图核对。`,
    }));
  const protectedAssets = analysis.image_layers
    .filter((layer) => /logo|Logo|LOGO|二维码|QR|qr|标志|品牌/.test(layer))
    .slice(0, 8)
    .map((layer, index) => ({
      id: `reference_asset_${index + 1}`,
      type: /二维码|QR|qr/.test(layer) ? "qr" as const : "logo" as const,
      label: layer,
      importance: "high" as const,
      instruction: "保持参考图资产识别关系；不清晰时交付前人工核对，不要编造新资产。",
    }));
  return { protectedTexts, protectedAssets };
}

function normalizeReferenceRemakeMode(value: unknown): ReferenceRemakeMode {
  return value === "precise" ? "precise" : "fast";
}

function normalizeQuality(value: unknown): QualityValue {
  return value === "4k" || value === "2k" ? value : "standard";
}

function mimeTypeFromFileName(fileName: string) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
