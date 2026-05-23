import { NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  parseDataUrl,
  readPublicImageUrl,
  ratioLabel,
  resolveRatio,
  saveImageBuffer,
  saveImageMetadata,
  readImageMetadata,
  type PixelSize,
} from "@/lib/image-utils";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { parseProtectionContext, type ProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";
import sharp from "sharp";

export const runtime = "nodejs";

type LosslessTargetPolicy = "long_edge" | "short_edge" | "scale" | "requested_long_edge";

type LosslessExportCheck = {
  mode: "lossless_upscale";
  usedAi: false;
  passed: boolean;
  originalSize: PixelSize;
  outputSize: PixelSize;
  ratioDelta: number;
  targetPolicy: LosslessTargetPolicy;
  message: string;
  issues: string[];
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return await upscaleUploadedImage(request);
    }

    const body = (await request.json()) as {
      imageUrl?: string;
      imageData?: string;
      aspectRatio: AspectRatioValue;
      customWidth?: number;
      customHeight?: number;
      quality: QualityValue;
      format?: "png" | "jpg";
      model?: string;
      protectionContext?: ProtectionContext;
      exactSize?: boolean;
      targetLongEdge?: number;
      targetShortEdge?: number;
      scale?: string;
    };

    if (!body.imageUrl && !body.imageData) {
      return NextResponse.json({ error: "请提供要导出的图片。" }, { status: 400 });
    }

    const input = body.imageData ? parseDataUrl(body.imageData) : await readPublicImageUrl(body.imageUrl ?? "");
    const format = body.format === "jpg" ? "jpg" : "png";
    const quality = normalizeExportQuality(body.quality);
    const originalSize = await readImageMetadata(input);
    const original = { width: originalSize.width || 1, height: originalSize.height || 1 };
    const losslessTarget = resolveLosslessUpscaleTarget(original, {
      quality,
      customWidth: body.customWidth,
      customHeight: body.customHeight,
      targetLongEdge: body.targetLongEdge,
      targetShortEdge: body.targetShortEdge,
      scale: body.scale,
    });
    const ratio = original;
    const outputSize = losslessTarget.size;
    const output = await losslessUpscaleImage(input, outputSize, format);
    const losslessExportCheck = await inspectLosslessExport(input, output, outputSize, losslessTarget.policy);
    const saved = await saveImageBuffer(output, format, {
      ratioLabel: ratioLabel("custom", outputSize.width, outputSize.height, ratio),
      quality,
    });
    const savedStat = await stat(saved.path);
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality,
      ratio,
      expectedSize: outputSize,
      fileSizeBytes: savedStat.size,
      aspectRatio: ratioLabel("custom", outputSize.width, outputSize.height, ratio),
      protectionContext: body.protectionContext,
    });

    const payload = {
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      fileName: saved.fileName,
      format,
      ratio,
      aspectRatio: ratioLabel("custom", outputSize.width, outputSize.height, ratio),
      quality,
      generatedAt: new Date().toISOString(),
      outputSize,
      expectedOutputSize: outputSize,
      qualityCheck: {
        ...qualityCheck,
        losslessExport: losslessExportCheck,
      },
      fileSizeBytes: savedStat.size,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: body.protectionContext?.version?.projectId,
      mode: "4K无损导出",
      prompt: "保持原图画面不变，只按原比例放大尺寸；未调用 AI 重绘。",
      protectionContext: body.protectionContext,
      version: body.protectionContext?.version,
      nodeOperation: "upscale_4k",
      model: "none",
      usedAi: false,
      targetPolicy: losslessTarget.policy,
    };
    await saveImageMetadata(saved.fileName, payload);

    return NextResponse.json(payload);
  } catch (error) {
    const apiError = toApiError(error, "4K无损导出失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

async function upscaleUploadedImage(request: Request) {
  const startedAt = Date.now();
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "请上传要导出的图片。" }, { status: 400 });
  }

  assertSupportedImage(image);

  const aspectRatio = String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue;
  const customWidth = Number(formData.get("customWidth") || 0) || undefined;
  const customHeight = Number(formData.get("customHeight") || 0) || undefined;
  const quality = normalizeExportQuality(formData.get("quality"));
  const format = String(formData.get("format") ?? "png") === "jpg" ? "jpg" : "png";
  const keepOriginalRatio = String(formData.get("keepOriginalRatio") ?? "") === "true";
  const exactSize = String(formData.get("exactSize") ?? "") === "true";
  const targetLongEdge = Number(formData.get("targetLongEdge") || 0) || undefined;
  const targetShortEdge = Number(formData.get("targetShortEdge") || 0) || undefined;
  const scale = String(formData.get("scale") ?? "");
  const protectionContext = parseProtectionContext(formData.get("protectionContext"));
  const input = Buffer.from(await image.arrayBuffer());
  const originalRatio = await getImageRatio(input);
  const ratio = originalRatio;
  if (!keepOriginalRatio && exactSize && customWidth && customHeight) {
    const requestedRatio = resolveRatio(aspectRatio, customWidth, customHeight);
    const originalValue = originalRatio.width / Math.max(1, originalRatio.height);
    const requestedValue = requestedRatio.width / Math.max(1, requestedRatio.height);
    if (Math.abs(originalValue - requestedValue) / Math.max(0.0001, originalValue) > 0.005) {
      return NextResponse.json({
        error: "固定尺寸会改变原图比例，可能裁切或留边。请使用“改尺寸/智能改版”，或切回“4K无损导出”。",
      }, { status: 400 });
    }
  }
  const losslessTarget = resolveLosslessUpscaleTarget(originalRatio, {
    quality,
    customWidth,
    customHeight,
    targetLongEdge,
    targetShortEdge,
    scale,
  });
  const outputSize = keepOriginalRatio || !exactSize
    ? losslessTarget.size
    : { width: customWidth || losslessTarget.size.width, height: customHeight || losslessTarget.size.height };
  const output = await losslessUpscaleImage(input, outputSize, format);
  const losslessExportCheck = await inspectLosslessExport(input, output, outputSize, losslessTarget.policy);
  const outputRatioLabel = keepOriginalRatio
    ? ratioLabel("custom", outputSize.width, outputSize.height, originalRatio)
    : ratioLabel(aspectRatio, customWidth, customHeight);
  const saved = await saveImageBuffer(output, format, {
    ratioLabel: outputRatioLabel,
    quality,
  });
  const savedStat = await stat(saved.path);
  const qualityCheck = await inspectImageQuality(saved.path, {
    quality,
    ratio,
    expectedSize: outputSize,
    fileSizeBytes: savedStat.size,
    aspectRatio: outputRatioLabel,
    protectionContext,
  });

  const payload = {
    url: saved.url,
    originalUrl: saved.originalUrl,
    thumbnailUrl: saved.thumbnailUrl,
    previewUrl: saved.previewUrl,
    fileName: saved.fileName,
    format,
    ratio,
    aspectRatio: outputRatioLabel,
    quality,
    generatedAt: new Date().toISOString(),
    outputSize,
    expectedOutputSize: outputSize,
    qualityCheck: {
      ...qualityCheck,
      losslessExport: losslessExportCheck,
    },
    fileSizeBytes: savedStat.size,
    source: "uploaded-image",
    savedPath: saved.path,
    durationMs: Date.now() - startedAt,
      projectId: protectionContext.version?.projectId,
      mode: "4K无损导出",
      prompt: "保持原图画面不变，只按原比例放大尺寸；未调用 AI 重绘。",
      protectionContext,
      version: protectionContext.version,
      nodeOperation: "upscale_4k",
      model: "none",
      usedAi: false,
      targetPolicy: losslessTarget.policy,
    };
  await saveImageMetadata(saved.fileName, payload);

  return NextResponse.json(payload);
}

function normalizeExportQuality(value: unknown): QualityValue {
  return value === "2k" || value === "standard" || value === "4k" ? value : "4k";
}

function resolveLosslessUpscaleTarget(
  original: PixelSize,
  options: {
    quality: QualityValue;
    customWidth?: number;
    customHeight?: number;
    targetLongEdge?: number;
    targetShortEdge?: number;
    scale?: string;
  },
): { size: PixelSize; policy: LosslessTargetPolicy } {
  const width = Math.max(1, Math.round(original.width));
  const height = Math.max(1, Math.round(original.height));
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const requestedScale = Number(String(options.scale || "").replace(/[^\d.]/g, "")) || 0;

  if (options.targetShortEdge && options.targetShortEdge > 0) {
    const scale = options.targetShortEdge / Math.max(1, shortEdge);
    return { size: scalePixelSize(original, scale), policy: "short_edge" };
  }

  if (options.targetLongEdge && options.targetLongEdge > 0) {
    const scale = options.targetLongEdge / Math.max(1, longEdge);
    return { size: scalePixelSize(original, scale), policy: "long_edge" };
  }

  if (requestedScale > 0) {
    return { size: scalePixelSize(original, requestedScale), policy: "scale" };
  }

  if (options.customWidth && options.customHeight) {
    const requestedLongEdge = Math.max(options.customWidth, options.customHeight);
    const scale = requestedLongEdge / Math.max(1, longEdge);
    return { size: scalePixelSize(original, scale), policy: "requested_long_edge" };
  }

  const targetLongEdge = options.quality === "2k" ? 2048 : 3840;
  return {
    size: scalePixelSize(original, targetLongEdge / Math.max(1, longEdge)),
    policy: "long_edge",
  };
}

function scalePixelSize(original: PixelSize, scale: number): PixelSize {
  const safeScale = Math.max(0.01, Number.isFinite(scale) ? scale : 1);
  return {
    width: Math.max(1, Math.round(original.width * safeScale)),
    height: Math.max(1, Math.round(original.height * safeScale)),
  };
}

async function losslessUpscaleImage(input: Buffer, target: PixelSize, format: "png" | "jpg") {
  const pipeline = sharp(input)
    .rotate()
    .resize({
      width: Math.max(1, Math.round(target.width)),
      height: Math.max(1, Math.round(target.height)),
      fit: "fill",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    });

  return format === "jpg"
    ? pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 98, mozjpeg: true }).toBuffer()
    : pipeline.png({ compressionLevel: 6, palette: false }).toBuffer();
}

async function inspectLosslessExport(
  originalInput: Buffer,
  outputInput: Buffer,
  expectedSize: PixelSize,
  targetPolicy: LosslessTargetPolicy,
): Promise<LosslessExportCheck> {
  const [originalMetadata, outputMetadata] = await Promise.all([
    readImageMetadata(originalInput),
    readImageMetadata(outputInput),
  ]);
  const originalSize = { width: originalMetadata.width || 1, height: originalMetadata.height || 1 };
  const outputSize = { width: outputMetadata.width || 1, height: outputMetadata.height || 1 };
  const originalRatio = originalSize.width / Math.max(1, originalSize.height);
  const outputRatio = outputSize.width / Math.max(1, outputSize.height);
  const ratioDelta = Math.abs(outputRatio - originalRatio) / Math.max(0.0001, originalRatio);
  const issues: string[] = [];

  if (outputSize.width !== expectedSize.width || outputSize.height !== expectedSize.height) {
    issues.push(`输出尺寸 ${outputSize.width}x${outputSize.height} 与目标尺寸 ${expectedSize.width}x${expectedSize.height} 不一致。`);
  }
  if (ratioDelta > 0.005) {
    issues.push("输出图宽高比变化超过 0.5%，已判定为失败。");
  }

  return {
    mode: "lossless_upscale",
    usedAi: false,
    passed: issues.length === 0,
    originalSize,
    outputSize,
    ratioDelta: Number(ratioDelta.toFixed(6)),
    targetPolicy,
    message: issues.length
      ? "无损导出质检未通过：比例或尺寸异常。"
      : "无损导出质检通过：未调用 AI，未裁切，按原比例放大。",
    issues,
  };
}
