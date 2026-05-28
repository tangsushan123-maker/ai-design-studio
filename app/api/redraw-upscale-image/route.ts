import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  parseDataUrl,
  getOpenAIRequestedSize,
  readImageMetadata,
  readPublicImageUrl,
  ratioLabel,
  resolveRatio,
  saveImageBuffer,
  saveImageMetadata,
  type PixelSize,
} from "@/lib/image-utils";
import { resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { parseProtectionContext, type ProtectionContext } from "@/lib/design-production";
import { buildHdRedrawPrompt } from "@/lib/prompt";
import { inspectImageQuality } from "@/lib/image-quality";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, taskTraceFromJson, type TaskRunTrace } from "@/lib/task-run-ledger";
import sharp from "sharp";
import { withCurrentConfigUser } from "@/lib/request-config-user";
import { readBrandReferenceImages } from "@/lib/brand-reference-images";

export const runtime = "nodejs";

type QualityEnhanceMode = "standard" | "plus" | "creative";

type RedrawInput = {
  imageBuffer: Buffer;
  fileName: string;
  mimeType: string;
  aspectRatio: AspectRatioValue;
  customWidth?: number;
  customHeight?: number;
  quality: QualityValue;
  format: "png" | "jpg" | "webp";
  keepOriginalRatio: boolean;
  exactSize?: boolean;
  prompt?: string;
  imageModel?: string;
  model?: string;
  enhancementMode: QualityEnhanceMode;
  sourceCompareUrl?: string;
  protectionContext?: ProtectionContext;
  brandReferenceImages?: Array<{ buffer: Buffer; fileName: string; mimeType: string }>;
  taskTrace?: TaskRunTrace;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("multipart/form-data")
      ? await parseMultipartInput(request)
      : await parseJsonInput(request);
    taskTrace = input.taskTrace || null;
    await recordTaskRunStarted(taskTrace || {});

    const imageModel = resolveImageModel(input.imageModel, input.model);
    const originalRatio = await getImageRatio(input.imageBuffer);
    const ratio = input.keepOriginalRatio
      ? originalRatio
      : resolveRatio(input.aspectRatio, input.customWidth, input.customHeight);

    const sourceSize = {
      width: originalRatio.width,
      height: originalRatio.height,
    };
    const requestedOutputSize = input.exactSize && input.customWidth && input.customHeight
      ? { width: input.customWidth, height: input.customHeight }
      : resolveQualityEnhanceTarget(sourceSize, input.quality);
    const requestedOfficialSize = resolveQualityEnhanceOfficialSize(requestedOutputSize, input.quality, imageModel);
    const officialTarget = normalizeOfficialQualityEnhanceTarget(requestedOfficialSize, input.quality);
    const outputSize = officialTarget.outputSize || requestedOutputSize;
    const effectiveQuality = officialTarget.quality || input.quality;
    const wasTargetAdjusted = Boolean(officialTarget.outputSize && (
      officialTarget.outputSize.width !== requestedOutputSize.width ||
      officialTarget.outputSize.height !== requestedOutputSize.height ||
      effectiveQuality !== input.quality
    ));
    const outputRatioLabel = input.keepOriginalRatio
      ? ratioLabel("custom", outputSize.width, outputSize.height, ratio)
      : ratioLabel(input.aspectRatio, input.customWidth, input.customHeight);
    const prompt = buildHdRedrawPrompt({
      task: "hd_redraw",
      userPrompt: input.prompt,
      aspectRatioLabel: outputRatioLabel,
      targetSize: `${outputSize.width}×${outputSize.height}`,
      quality: effectiveQuality,
      keepOriginalRatio: input.keepOriginalRatio,
      enhancementMode: input.enhancementMode,
      protectionContext: input.protectionContext,
    });

    const openai = getOpenAI();
    const officialSize = requestedOfficialSize;
    const file = await toFile(input.imageBuffer, input.fileName, { type: input.mimeType });
    const brandFiles = await Promise.all((input.brandReferenceImages || []).map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
    const result = await runQueuedImageModelRequestWithRetry(
      { label: `画质增强/${imageModel}` },
      () => openai.images.edit({
        model: imageModel,
        image: brandFiles.length ? ([file, ...brandFiles] as never) : file,
        prompt,
        size: officialSize as "1024x1024",
        quality: "high",
        ...(supportsConfigurableImageInputFidelity(imageModel) ? { input_fidelity: "high" as const } : {}),
        output_format: "png",
        background: "opaque",
        n: 1,
      }, imageRequestOptions()),
    );

    const item = result.data?.[0];
    if (!item) {
      return NextResponse.json({ error: "AI 重绘没有返回图片。" }, { status: 500 });
    }

    const raw = await imageResultToBuffer(item.b64_json, item.url);
    const output = await encodeQualityEnhanceOutput(raw, input.format);
    const actual = await readImageMetadata(output);
    const saved = await saveImageBuffer(output, input.format, {
      ratioLabel: outputRatioLabel,
      quality: effectiveQuality,
      projectId: input.protectionContext?.version?.projectId || taskTrace?.projectId,
      storageKind: "results",
    });
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality: effectiveQuality,
      ratio,
      expectedSize: outputSize,
      fileSizeBytes: saved.fileSizeBytes,
      aspectRatio: outputRatioLabel,
      protectionContext: input.protectionContext,
      sourceImage: input.imageBuffer,
      operation: "hd_redraw",
    });

    const payload = {
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      fileName: saved.fileName,
      format: input.format,
      model: imageModel,
      prompt,
      ratio,
      aspectRatio: outputRatioLabel,
      quality: effectiveQuality,
      generatedAt: new Date().toISOString(),
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: saved.fileSizeBytes,
      source: "ai-hd-redraw",
      sourceCompareUrl: input.sourceCompareUrl,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: input.protectionContext?.version?.projectId || taskTrace?.projectId,
      mode: `画质增强 · ${qualityEnhanceModeLabel(input.enhancementMode)}`,
      enhancementMode: input.enhancementMode,
      qualityEnhance: {
        mode: input.enhancementMode,
        target: effectiveQuality === "2k" ? "2K" : effectiveQuality === "4k" ? "4K" : "官方原生高清",
        requestedTarget: `${requestedOutputSize.width}×${requestedOutputSize.height}`,
        targetAdjusted: wasTargetAdjusted,
        ratioProtected: requestedOfficialSize === "auto",
        workflow: qualityEnhanceWorkflowLabel(input.enhancementMode),
        postProcess: qualityEnhancePostProcessLabel(input.enhancementMode),
        officialSize,
        superResolution: "official_gpt_image_edit",
      },
      protectionContext: input.protectionContext,
      version: input.protectionContext?.version,
      nodeOperation: "hd_redraw",
      sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
      sourceRequestId: taskTrace?.requestId,
      sourceNodeId: taskTrace?.nodeId,
      sourceNodeName: taskTrace?.nodeName,
      sourceNodeKind: taskTrace?.nodeKind,
    };
    await saveImageMetadata(saved.fileName, payload);

    await recordTaskRunFinished(taskTrace, { outputs: [payload], model: imageModel, message: "画质增强完成，服务端已保存高清结果。" });
    return NextResponse.json({ ...payload, ...taskRunResponseMeta(taskTrace, startedAt, [payload]), image: payload, images: [payload] });
  } catch (error) {
    if (error instanceof InvalidRedrawUpscalePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const apiError = toApiError(error, "画质增强失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }

  });
}

class InvalidRedrawUpscalePayloadError extends Error {}

async function parseMultipartInput(request: Request): Promise<RedrawInput> {
  const formData = await request.formData();
  const image = formData.get("image");
  const sourceUrl = String(formData.get("sourceUrl") ?? "");

  if (!(image instanceof File) && !sourceUrl) {
    throw new Error("请上传要 AI 重绘的图片。");
  }

  if (image instanceof File) {
    assertSupportedImage(image);
  }
  const imageBuffer = image instanceof File
    ? Buffer.from(await image.arrayBuffer())
    : await readPublicImageUrl(sourceUrl);
  const fileName = image instanceof File ? image.name || "design.png" : sourceUrl.split("/").pop() || "design.png";
  const mimeType = image instanceof File ? image.type || "image/png" : mimeTypeFromFileName(fileName);

  return {
    imageBuffer,
    fileName,
    mimeType,
    aspectRatio: String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue,
    customWidth: Number(formData.get("customWidth") || 0) || undefined,
    customHeight: Number(formData.get("customHeight") || 0) || undefined,
    quality: String(formData.get("quality") ?? "standard") as QualityValue,
    format: normalizeOutputFormat(formData.get("format")),
    keepOriginalRatio: String(formData.get("keepOriginalRatio") ?? "") === "true",
    exactSize: String(formData.get("exactSize") ?? "") === "true",
    prompt: String(formData.get("prompt") ?? ""),
    imageModel: String(formData.get("imageModel") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    enhancementMode: normalizeEnhancementMode(formData.get("enhancementMode")),
    sourceCompareUrl: isLocalGeneratedUrl(sourceUrl) ? sourceUrl : undefined,
    protectionContext: parseProtectionContext(formData.get("protectionContext")),
    brandReferenceImages: await readBrandReferenceImages(formData),
    taskTrace: taskTraceFromFormData(formData, "hd_redraw", "/api/redraw-upscale-image"),
  };
}

function mimeTypeFromFileName(fileName: string) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}

async function parseJsonInput(request: Request): Promise<RedrawInput> {
  const body = await parseRedrawUpscaleJsonPayload(request);

  if (!body.imageUrl) {
    throw new Error("请提供要 AI 重绘的图片。");
  }

  return {
    imageBuffer: await readPublicImageUrl(body.imageUrl),
    fileName: "design.png",
    mimeType: "image/png",
    aspectRatio: body.aspectRatio,
    customWidth: body.customWidth,
    customHeight: body.customHeight,
    quality: body.quality || "standard",
    format: normalizeOutputFormat(body.format),
    keepOriginalRatio: Boolean(body.keepOriginalRatio),
    exactSize: Boolean(body.exactSize),
    prompt: body.prompt,
    imageModel: body.imageModel,
    model: body.model,
    enhancementMode: normalizeEnhancementMode(body.enhancementMode),
    sourceCompareUrl: isLocalGeneratedUrl(body.sourceCompareUrl || body.imageUrl) ? (body.sourceCompareUrl || body.imageUrl) : undefined,
    protectionContext: body.protectionContext,
    taskTrace: taskTraceFromJson(body as Record<string, unknown>, "hd_redraw", "/api/redraw-upscale-image"),
  };
}

async function parseRedrawUpscaleJsonPayload(request: Request): Promise<{
    imageUrl?: string;
    aspectRatio: AspectRatioValue;
    customWidth?: number;
    customHeight?: number;
    quality?: QualityValue;
    format?: "png" | "jpg" | "webp";
    keepOriginalRatio?: boolean;
    exactSize?: boolean;
    prompt?: string;
    imageModel?: string;
    model?: string;
    enhancementMode?: string;
    sourceCompareUrl?: string;
    protectionContext?: ProtectionContext;
    requestId?: string;
    taskId?: string;
    projectId?: string;
    nodeId?: string;
    nodeName?: string;
    nodeKind?: string;
  }> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidRedrawUpscalePayloadError("画质增强请求格式不正确。");
    }
    return body as {
      imageUrl?: string;
      aspectRatio: AspectRatioValue;
      customWidth?: number;
      customHeight?: number;
      quality?: QualityValue;
      format?: "png" | "jpg" | "webp";
      keepOriginalRatio?: boolean;
      exactSize?: boolean;
      prompt?: string;
      imageModel?: string;
      model?: string;
      enhancementMode?: string;
      sourceCompareUrl?: string;
      protectionContext?: ProtectionContext;
      requestId?: string;
      taskId?: string;
      projectId?: string;
      nodeId?: string;
      nodeName?: string;
      nodeKind?: string;
    };
  } catch (error) {
    if (error instanceof InvalidRedrawUpscalePayloadError) throw error;
    throw new InvalidRedrawUpscalePayloadError("画质增强 JSON 无法解析，请检查请求内容后重试。");
  }
}

function isLocalGeneratedUrl(value: string | undefined) {
  return Boolean(value?.startsWith("/generated/"));
}

function normalizeEnhancementMode(value: unknown): QualityEnhanceMode {
  if (value === "plus" || value === "plus_enhance") return "plus";
  if (value === "creative" || value === "texture" || value === "texture_redraw" || value === "creative_redraw" || value === "ai_redraw") return "creative";
  return "standard";
}

function qualityEnhanceModeLabel(mode: QualityEnhanceMode) {
  if (mode === "plus") return "Plus";
  if (mode === "creative") return "Creative";
  return "Standard";
}

function qualityEnhanceWorkflowLabel(mode: QualityEnhanceMode) {
  if (mode === "plus") return "图文双清晰增强 + 文字保真 + 画面质感增强 + 高质量导出";
  if (mode === "creative") return "质感高清重绘 + 细节/材质增强 + 高质量导出";
  return "文字优先高清修复 + 清晰度/边缘优化 + 高质量导出";
}

function qualityEnhancePostProcessLabel(mode: QualityEnhanceMode) {
  if (mode === "creative") return "官方 GPT Image 高保真编辑输出，不做本地超分或锐化";
  if (mode === "plus") return "官方 GPT Image 图文保真编辑输出，不做本地超分或锐化";
  return "官方 GPT Image 文字优先保真编辑输出，不做本地超分或锐化";
}

function normalizeOutputFormat(value: unknown): "png" | "jpg" | "webp" {
  if (value === "jpg" || value === "jpeg") return "jpg";
  if (value === "webp") return "webp";
  return "png";
}

function resolveQualityEnhanceTarget(source: PixelSize, quality: QualityValue): PixelSize {
  const requestedLongEdge = quality === "2k" ? 2048 : quality === "4k" ? 3840 : Math.max(source.width, source.height);
  const longEdge = Math.max(requestedLongEdge, Math.max(source.width, source.height));
  return fitPixelSizeToLongEdge(source, longEdge);
}

function resolveQualityEnhanceOfficialSize(target: PixelSize, quality: QualityValue, imageModel: string) {
  const officialSize = getOpenAIRequestedSize(target, quality, imageModel);
  if (officialSizeWouldDistortRatio(officialSize, target)) return "auto";
  return officialSize;
}

function officialSizeWouldDistortRatio(officialSize: string, target: PixelSize) {
  const match = officialSize.match(/^(\d+)x(\d+)$/);
  if (!match) return false;
  const officialRatio = Number(match[1]) / Math.max(1, Number(match[2]));
  const targetRatio = target.width / Math.max(1, target.height);
  return Math.abs(officialRatio - targetRatio) / Math.max(0.01, targetRatio) > 0.035;
}

function fitPixelSizeToLongEdge(source: PixelSize, longEdge: number): PixelSize {
  const width = Math.max(1, Math.round(source.width));
  const height = Math.max(1, Math.round(source.height));
  const scale = Math.max(1, longEdge) / Math.max(1, Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function normalizeOfficialQualityEnhanceTarget(officialSize: string, requestedQuality: QualityValue): { outputSize?: PixelSize; quality?: QualityValue } {
  const match = officialSize.match(/^(\d+)x(\d+)$/);
  if (!match) return {};
  const outputSize = { width: Number(match[1]), height: Number(match[2]) };
  const longEdge = Math.max(outputSize.width, outputSize.height);
  const quality: QualityValue = longEdge >= 3840
    ? "4k"
    : longEdge >= 2048
      ? "2k"
      : requestedQuality === "standard"
        ? "standard"
        : "standard";
  return { outputSize, quality };
}

async function encodeQualityEnhanceOutput(input: Buffer, format: "png" | "jpg" | "webp") {
  const pipeline = sharp(input).rotate();
  if (format === "jpg") return pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 98, mozjpeg: true }).toBuffer();
  if (format === "webp") return pipeline.webp({ quality: 96, effort: 5 }).toBuffer();
  return pipeline.png({ compressionLevel: 6, palette: false }).toBuffer();
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error("下载 AI 重绘图片失败。");
  return Buffer.from(await response.arrayBuffer());
}
