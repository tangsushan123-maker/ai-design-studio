import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import { buildImageEditPrompt, IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  assertExactPixelSize,
  type ExactFitMode,
  getOpenAIRequestedSize,
  getTargetPixels,
  type PixelSize,
  parseDataUrl,
  processToExactSize,
  processToTarget,
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
import { parseProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const formData = await request.formData();
    const uploadedImage = formData.get("image");
    const sourceUrl = String(formData.get("sourceUrl") ?? "");
    const promptText = String(formData.get("prompt") ?? "");
    const modeLabel = String(formData.get("modeLabel") ?? "图生图 / 改图");
    const direction = String(formData.get("direction") ?? "四周");
    const isOutpaint = modeLabel.includes("扩图");
    const isAiResize = modeLabel.includes("AI改尺寸") || modeLabel.includes("4K导出");
    const exactSize = String(formData.get("exactSize") ?? "") === "true";
    const fitMode = String(formData.get("fitMode") ?? "smart_relayout");
    const processingFitMode: ExactFitMode = fitMode === "pad" ? "pad" : "crop";

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
      return NextResponse.json({ error: "请上传参考图或选择已生成图片。" }, { status: 400 });
    }

    const aspectRatio = String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue;
    const customWidth = Number(formData.get("customWidth") || 0) || undefined;
    const customHeight = Number(formData.get("customHeight") || 0) || undefined;
    const quality = String(formData.get("quality") ?? "standard") as QualityValue;
    const adType = String(formData.get("adType") ?? "通用设计");
    const sourceAnalysis = String(formData.get("sourceAnalysis") ?? "");
    const protectionContext = parseProtectionContext(formData.get("protectionContext"));
    const brandReferenceImages = await readBrandReferenceImages(formData);
    const keepOriginalRatio = String(formData.get("keepOriginalRatio") ?? "") === "true";
    const modelOverride = String(formData.get("model") ?? "").trim();
    const originalRatio = await getImageRatio(imageBuffer);
    const ratio = keepOriginalRatio ? originalRatio : resolveRatio(aspectRatio, customWidth, customHeight);
    const outputRatioLabel = keepOriginalRatio
      ? ratioLabel(aspectRatio, customWidth, customHeight, originalRatio)
      : exactSize && customWidth && customHeight
        ? ratioLabel(aspectRatio, customWidth, customHeight, { width: customWidth, height: customHeight })
        : ratioLabel(aspectRatio, customWidth, customHeight);
    const generatedAt = new Date().toISOString();
    const outputSize = exactSize && customWidth && customHeight ? { width: customWidth, height: customHeight } : getTargetPixels(ratio, quality);
    const shouldUseAiOutpaint = (isOutpaint || (isAiResize && fitMode === "smart_outpaint")) && !keepOriginalRatio;
    const task = isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image";
    const isCreativeImageToImage = task === "image_to_image";
    const sanitizedPromptText = isCreativeImageToImage ? sanitizeLegacyImageToImagePrompt(promptText) : promptText.trim();
    const userPrompt = sanitizedPromptText || (isCreativeImageToImage
      ? IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST
      : "内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。");

    const prompt = buildImageEditPrompt({
      task,
      userPrompt,
      adType,
      aspectRatioLabel: outputRatioLabel,
      targetSize: `${outputSize.width}×${outputSize.height}`,
      quality,
      sourceAnalysis,
      keepOriginalRatio,
      fitMode,
      direction,
      creativeRedesign: isCreativeImageToImage,
      creativeVariant: "headline",
      protectionContext,
    });

    const model = modelOverride || getImageModel();
    const targetCount = modeLabel.includes("AI改尺寸") || modeLabel.includes("4K") ? 1 : 2;
    const promptVariants = Array.from({ length: targetCount }, (_, index) =>
      isCreativeImageToImage
        ? buildImageEditPrompt({
            task,
            userPrompt,
            adType,
            aspectRatioLabel: outputRatioLabel,
            targetSize: `${outputSize.width}×${outputSize.height}`,
            quality,
            sourceAnalysis,
            keepOriginalRatio,
            fitMode,
            direction,
            creativeRedesign: true,
            creativeVariant: index === 1 ? "subject" : "headline",
            protectionContext,
          })
        : prompt,
    );
    const responsePrompt = isCreativeImageToImage ? promptVariants.join("\n\n---\n\n") : prompt;
    if (isAiResize && (fitMode === "crop" || fitMode === "pad")) {
      const processed = exactSize && customWidth && customHeight
        ? await processToExactSize(imageBuffer, outputSize, "png", processingFitMode)
        : await processToTarget(imageBuffer, ratio, quality, "png");
      const actual = await readImageMetadata(processed);
      if (exactSize) assertExactPixelSize({ width: actual.width, height: actual.height }, outputSize);
      const saved = await saveImageBuffer(processed, "png", {
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
      const image = {
        id: saved.fileName,
        url: saved.url,
        originalUrl: saved.originalUrl,
        thumbnailUrl: saved.thumbnailUrl,
        previewUrl: saved.previewUrl,
        prompt,
        variant: 1,
        ratio,
        mode: fitMode === "crop" ? "居中裁切改尺寸" : "留白填充改尺寸",
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
        nodeOperation: "resize",
        fitMode,
      };
      await saveImageMetadata(saved.fileName, image);
      return NextResponse.json({ images: [image], prompt: responsePrompt, model });
    }

    const preparedOutpaint = shouldUseAiOutpaint ? await prepareOutpaintInput(imageBuffer, ratio, direction) : null;
    const openai = getOpenAI();
    const requests = promptVariants.map(async (requestPrompt) => {
      const editImageBuffer = preparedOutpaint?.image ?? imageBuffer;
      const file = await toFile(editImageBuffer, preparedOutpaint ? "outpaint-canvas.png" : fileName, { type: preparedOutpaint ? "image/png" : mimeType });
      const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
      const mask = preparedOutpaint ? await toFile(preparedOutpaint.mask, "outpaint-mask.png", { type: "image/png" }) : undefined;
      const result = await withTimeout(
        openai.images.edit({
          model,
          image: brandFiles.length ? ([file, ...brandFiles] as never) : file,
          ...(mask ? { mask } : {}),
          input_fidelity: (isCreativeImageToImage ? "low" : "high") as "low" | "high",
          output_format: "png" as const,
          background: "opaque" as const,
          prompt: requestPrompt,
          size: (preparedOutpaint ? "auto" : keepOriginalRatio ? "auto" : getOpenAIRequestedSize(ratio, quality, model)) as "1024x1024",
          quality: quality === "standard" ? "medium" : "high",
          n: 1,
        }),
        180000,
        "图片模型响应超时，请稍后重试或换一个更快的模型。",
      );
      return {
        prompt: requestPrompt,
        items: result.data ?? [],
      };
    });
    const settledResults = await Promise.allSettled(requests);
    const resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }> = settledResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items.map((item) => ({ ...item, prompt: result.value.prompt })) : [],
    );

    if (!resultItems.length) {
      const failed = settledResults.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return NextResponse.json({ error: "图片接口没有返回可用方案。" }, { status: 500 });
    }

    const images = await Promise.all(
      resultItems.slice(0, targetCount).map(async (item, index) => {
        const imagePrompt = item.prompt || prompt;
        const raw = await imageResultToBuffer(item.b64_json, item.url);
        const processed = exactSize && customWidth && customHeight
          ? await processToExactSize(raw, { width: customWidth, height: customHeight }, "png", processingFitMode)
          : await processToTarget(raw, ratio, quality, "png");
        const actual = await readImageMetadata(processed);
        if (exactSize) assertExactPixelSize({ width: actual.width, height: actual.height }, outputSize);
        const saved = await saveImageBuffer(processed, "png", {
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
        const image = {
          id: saved.fileName,
          url: saved.url,
          originalUrl: saved.originalUrl,
          thumbnailUrl: saved.thumbnailUrl,
          previewUrl: saved.previewUrl,
          prompt: imagePrompt,
          variant: index + 1,
          ratio,
          mode: modeLabel,
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
          nodeOperation: isOutpaint ? "outpaint" : isAiResize ? "resize" : modeLabel === "图生图" ? "image_to_image" : "edit_image",
          fitMode,
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );

    return NextResponse.json({ images, prompt: responsePrompt, model });
  } catch (error) {
    const apiError = toApiError(error, "改图失败。");
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

function sanitizeLegacyImageToImagePrompt(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isLegacyImageToImageDefault(line))
    .join("\n");
}

function isLegacyImageToImageDefault(line: string) {
  return /内容不减，比例不变，优化版式，生成(?:专业清晰的)?新版设计。?$/.test(line) ||
    /内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。?$/.test(line) ||
    /保持主体结构和主要版式不变，只优化我接下来指定的部分。?$/.test(line);
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
  if (!response.ok) throw new Error("下载生成图片失败。");
  return Buffer.from(await response.arrayBuffer());
}

async function prepareOutpaintInput(input: Buffer, ratio: PixelSize, direction: string) {
  const target = outpaintCanvasSize(ratio);
  const resized = await sharp(input)
    .resize(target.width, target.height, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const imageWidth = meta.width || target.width;
  const imageHeight = meta.height || target.height;
  const placement = outpaintPlacement(direction, target, { width: imageWidth, height: imageHeight });

  const canvas = await sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: placement.left, top: placement.top }])
    .png()
    .toBuffer();

  const protectedArea = await sharp({
    create: {
      width: imageWidth,
      height: imageHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const mask = await sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: protectedArea, left: placement.left, top: placement.top }])
    .png()
    .toBuffer();

  return { image: canvas, mask };
}

function outpaintCanvasSize(ratio: PixelSize): PixelSize {
  const value = Math.max(0.1, ratio.width / ratio.height);
  const longEdge = 2048;
  if (value >= 1) {
    return {
      width: longEdge,
      height: Math.max(180, Math.round(longEdge / value)),
    };
  }

  return {
    width: Math.max(180, Math.round(longEdge * value)),
    height: longEdge,
  };
}

function outpaintPlacement(direction: string, canvas: PixelSize, image: PixelSize) {
  let left = Math.round((canvas.width - image.width) / 2);
  let top = Math.round((canvas.height - image.height) / 2);

  if (direction.includes("右")) left = 0;
  if (direction.includes("左")) left = canvas.width - image.width;
  if (direction.includes("下")) top = 0;
  if (direction.includes("上")) top = canvas.height - image.height;

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
