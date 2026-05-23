import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import type { QualityValue } from "@/lib/design-options";
import {
  assertExactPixelSize,
  composeMaskedEdit,
  countEditableMaskPixels,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  ratioLabel,
  saveImageBuffer,
  saveImageMetadata,
} from "@/lib/image-utils";
import { getImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage } from "@/lib/request-guards";
import { parseProtectionContext } from "@/lib/design-production";
import { buildMaskEditPrompt } from "@/lib/prompt";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const promptText = String(formData.get("prompt") ?? "");
    const sourceUrl = String(formData.get("sourceUrl") ?? "");
    const uploadedImage = formData.get("image");
    const mask = formData.get("mask");
    const maskUrl = String(formData.get("maskUrl") ?? "");
    const quality = String(formData.get("quality") ?? "standard") as QualityValue;
    const model = String(formData.get("model") ?? "").trim() || getImageModel();
    const customWidth = Number(formData.get("customWidth") || 0) || undefined;
    const customHeight = Number(formData.get("customHeight") || 0) || undefined;
    const preserveOutsideMask = String(formData.get("preserveOutsideMask") ?? "true") !== "false";
    const maskFeather = Math.max(8, Math.min(20, Number(formData.get("maskFeather") || 12) || 12));
    const protectionContext = parseProtectionContext(formData.get("protectionContext"));
    const brandReferenceImages = await readBrandReferenceImages(formData);

    if (!promptText.trim()) {
      return NextResponse.json({ error: "请输入要改什么。" }, { status: 400 });
    }

    if (!(mask instanceof File) && !maskUrl) {
      return NextResponse.json({ error: "请先涂抹要修改的区域。" }, { status: 400 });
    }

    let imageBuffer: Buffer;
    let fileName = "design.png";
    let mimeType = "image/png";

    if (uploadedImage instanceof File) {
      assertSupportedImage(uploadedImage);
      imageBuffer = Buffer.from(await uploadedImage.arrayBuffer());
      fileName = uploadedImage.name || fileName;
      mimeType = uploadedImage.type || mimeType;
    } else if (sourceUrl) {
      imageBuffer = await readPublicImageUrl(sourceUrl);
    } else {
      return NextResponse.json({ error: "请选择要局部修改的图片。" }, { status: 400 });
    }

    const originalMeta = await readImageMetadata(imageBuffer);
    const maskBuffer = mask instanceof File ? Buffer.from(await mask.arrayBuffer()) : await readPublicImageUrl(maskUrl);
    const maskMeta = await readImageMetadata(maskBuffer);
    if (maskMeta.width !== originalMeta.width || maskMeta.height !== originalMeta.height) {
      return NextResponse.json({ error: "蒙版尺寸必须和原图一致，请重新涂抹后再试。" }, { status: 400 });
    }

    const outputSize = customWidth && customHeight ? { width: customWidth, height: customHeight } : { width: originalMeta.width, height: originalMeta.height };
    const outputRatioLabel = ratioLabel("custom", outputSize.width, outputSize.height, outputSize);
    const editableArea = await countEditableMaskPixels(maskBuffer, outputSize);
    if (!editableArea) {
      return NextResponse.json({ error: "请先涂抹要修改的区域。" }, { status: 400 });
    }
    const generatedAt = new Date().toISOString();
    const prompt = buildMaskEditPrompt({
      task: "mask_edit",
      userPrompt: promptText,
      aspectRatioLabel: outputRatioLabel,
      targetSize: `${outputSize.width}×${outputSize.height}`,
      quality,
      keepOriginalRatio: true,
      protectionContext,
    });

    const openai = getOpenAI();
    const imageFile = await toFile(imageBuffer, fileName, { type: mimeType });
    const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
    const maskFile = await toFile(maskBuffer, "mask.png", { type: "image/png" });
    const result = await openai.images.edit({
      model,
      image: brandFiles.length ? ([imageFile, ...brandFiles] as never) : imageFile,
      mask: maskFile,
      prompt,
      size: "auto",
      output_format: "png",
      background: "opaque",
      quality: quality === "standard" ? "medium" : "high",
      n: 1,
    });

    const item = result.data?.[0];
    if (!item) {
      return NextResponse.json({ error: "局部修改没有返回结果。" }, { status: 500 });
    }

    const raw = await imageResultToBuffer(item.b64_json, item.url);
    const processed = await processToExactSize(raw, outputSize, "png", "smart_outpaint");
    const composited = preserveOutsideMask
      ? await composeMaskedEdit(imageBuffer, processed, maskBuffer, outputSize, { feather: maskFeather })
      : processed;
    const actual = await readImageMetadata(composited);
    assertExactPixelSize({ width: actual.width, height: actual.height }, outputSize);
    const saved = await saveImageBuffer(composited, "png", {
      ratioLabel: outputRatioLabel,
      quality,
    });
    const savedStat = await stat(saved.path);
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality,
      ratio: outputSize,
      expectedSize: outputSize,
      fileSizeBytes: savedStat.size,
      aspectRatio: outputRatioLabel,
      protectionContext,
    });
    const image = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt,
      variant: 1,
      ratio: outputSize,
      mode: "局部涂抹修改",
      model,
      aspectRatio: outputRatioLabel,
      quality,
      generatedAt,
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: savedStat.size,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: protectionContext.version?.projectId,
      protectionContext,
      version: protectionContext.version,
      nodeOperation: "mask_edit",
      preserveOutsideMask,
      maskFeather,
      maskProtectionCheck: preserveOutsideMask
        ? {
            status: "passed",
            label: "未涂抹区域已锁定",
            message: "最终保存前已用原图像素强制覆盖 mask 外区域。",
          }
        : {
            status: "pending",
            label: "未锁定外区",
            message: "用户关闭了未涂抹区域锁定。",
          },
    };
    await saveImageMetadata(saved.fileName, image);

    return NextResponse.json({ images: [image], prompt, model });
  } catch (error) {
    const apiError = toApiError(error, "局部修改失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
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
  if (!response.ok) throw new Error("下载局部修改图片失败。");
  return Buffer.from(await response.arrayBuffer());
}
