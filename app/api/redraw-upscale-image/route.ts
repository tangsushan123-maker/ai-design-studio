import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  assertExactPixelSize,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  ratioLabel,
  resolveRatio,
  saveImageBuffer,
  saveImageMetadata,
} from "@/lib/image-utils";
import { getImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { parseProtectionContext, type ProtectionContext } from "@/lib/design-production";
import { buildHdRedrawPrompt } from "@/lib/prompt";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

type RedrawInput = {
  imageBuffer: Buffer;
  fileName: string;
  mimeType: string;
  aspectRatio: AspectRatioValue;
  customWidth?: number;
  customHeight?: number;
  quality: QualityValue;
  format: "png" | "jpg";
  keepOriginalRatio: boolean;
  exactSize?: boolean;
  prompt?: string;
  model?: string;
  protectionContext?: ProtectionContext;
  brandReferenceImages?: Array<{ buffer: Buffer; fileName: string; mimeType: string }>;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("multipart/form-data")
      ? await parseMultipartInput(request)
      : await parseJsonInput(request);

    const originalRatio = await getImageRatio(input.imageBuffer);
    const ratio = input.keepOriginalRatio
      ? originalRatio
      : resolveRatio(input.aspectRatio, input.customWidth, input.customHeight);
    const outputRatioLabel = input.keepOriginalRatio
      ? ratioLabel(input.aspectRatio, input.customWidth, input.customHeight, originalRatio)
      : ratioLabel(input.aspectRatio, input.customWidth, input.customHeight);

    const sourceSize = {
      width: originalRatio.width,
      height: originalRatio.height,
    };
    const outputSize = input.exactSize && input.customWidth && input.customHeight
      ? { width: input.customWidth, height: input.customHeight }
      : sourceSize;
    const prompt = buildHdRedrawPrompt({
      task: "hd_redraw",
      userPrompt: input.prompt,
      aspectRatioLabel: outputRatioLabel,
      targetSize: `${outputSize.width}×${outputSize.height}`,
      quality: "standard",
      keepOriginalRatio: input.keepOriginalRatio,
      protectionContext: input.protectionContext,
    });

    const openai = getOpenAI();
    const model = input.model?.trim() || getImageModel();
    const file = await toFile(input.imageBuffer, input.fileName, { type: input.mimeType });
    const brandFiles = await Promise.all((input.brandReferenceImages || []).map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
    const result = await openai.images.edit({
      model,
      image: brandFiles.length ? ([file, ...brandFiles] as never) : file,
      prompt,
      size: "auto",
      quality: "high",
      input_fidelity: "high",
      output_format: "png",
      background: "opaque",
      n: 1,
    });

    const item = result.data?.[0];
    if (!item) {
      return NextResponse.json({ error: "AI 重绘没有返回图片。" }, { status: 500 });
    }

    const raw = await imageResultToBuffer(item.b64_json, item.url);
    const rawMeta = await readImageMetadata(raw);
    const rawRatio = rawMeta.width / Math.max(1, rawMeta.height);
    const targetRatio = outputSize.width / Math.max(1, outputSize.height);
    const fitMode = Math.abs(rawRatio - targetRatio) / targetRatio <= 0.04 ? "crop" : "smart_outpaint";
    const output = await processToExactSize(raw, outputSize, input.format, fitMode);
    const actual = await readImageMetadata(output);
    assertExactPixelSize({ width: actual.width, height: actual.height }, outputSize);
    const saved = await saveImageBuffer(output, input.format, {
      ratioLabel: outputRatioLabel,
      quality: "standard",
    });
    const savedStat = await stat(saved.path);
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality: "standard",
      ratio,
      expectedSize: outputSize,
      fileSizeBytes: savedStat.size,
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
      model,
      prompt,
      ratio,
      aspectRatio: outputRatioLabel,
      quality: "standard",
      generatedAt: new Date().toISOString(),
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: savedStat.size,
      source: "ai-hd-redraw",
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: input.protectionContext?.version?.projectId,
      mode: "高清重绘",
      protectionContext: input.protectionContext,
      version: input.protectionContext?.version,
      nodeOperation: "hd_redraw",
    };
    await saveImageMetadata(saved.fileName, payload);

    return NextResponse.json(payload);
  } catch (error) {
    const apiError = toApiError(error, "AI 高清重绘 失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

async function parseMultipartInput(request: Request): Promise<RedrawInput> {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    throw new Error("请上传要 AI 重绘的图片。");
  }

  assertSupportedImage(image);

  return {
    imageBuffer: Buffer.from(await image.arrayBuffer()),
    fileName: image.name || "design.png",
    mimeType: image.type || "image/png",
    aspectRatio: String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue,
    customWidth: Number(formData.get("customWidth") || 0) || undefined,
    customHeight: Number(formData.get("customHeight") || 0) || undefined,
    quality: String(formData.get("quality") ?? "standard") as QualityValue,
    format: String(formData.get("format") ?? "png") === "jpg" ? "jpg" : "png",
    keepOriginalRatio: String(formData.get("keepOriginalRatio") ?? "") === "true",
    exactSize: String(formData.get("exactSize") ?? "") === "true",
    prompt: String(formData.get("prompt") ?? ""),
    model: String(formData.get("model") ?? "") || undefined,
    protectionContext: parseProtectionContext(formData.get("protectionContext")),
    brandReferenceImages: await readBrandReferenceImages(formData),
  };
}

async function parseJsonInput(request: Request): Promise<RedrawInput> {
  const body = (await request.json()) as {
    imageUrl?: string;
    aspectRatio: AspectRatioValue;
    customWidth?: number;
    customHeight?: number;
    quality?: QualityValue;
    format?: "png" | "jpg";
    keepOriginalRatio?: boolean;
    exactSize?: boolean;
    prompt?: string;
    model?: string;
    protectionContext?: ProtectionContext;
  };

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
    format: body.format === "jpg" ? "jpg" : "png",
    keepOriginalRatio: Boolean(body.keepOriginalRatio),
    exactSize: Boolean(body.exactSize),
    prompt: body.prompt,
    model: body.model,
    protectionContext: body.protectionContext,
  };
}

async function readBrandReferenceImages(formData: FormData) {
  const refs: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];
  for (let index = 1; index <= 3; index += 1) {
    const item = await readBrandReferenceImage(formData, index);
    if (item) refs.push(item);
  }
  return refs;
}

async function readBrandReferenceImage(formData: FormData, index: number) {
  const file = formData.get(`brandAsset_${index}`);
  const sourceUrl = String(formData.get(`brandAssetUrl_${index}`) ?? "");
  if (file instanceof File) {
    assertSupportedImage(file);
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || `brand-asset-${index}.png`,
      mimeType: file.type || "image/png",
    };
  }
  if (sourceUrl) {
    return {
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: `brand-asset-${index}.png`,
      mimeType: "image/png",
    };
  }
  return null;
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error("下载 AI 重绘图片失败。");
  return Buffer.from(await response.arrayBuffer());
}
