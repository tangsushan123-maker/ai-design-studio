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
    const requestedFitMode = String(formData.get("fitMode") ?? "smart_relayout");
    const fitMode = requestedFitMode === "crop" || requestedFitMode === "pad" ? "smart_relayout" : requestedFitMode;
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
    const isSmartResize = isAiResize && fitMode === "smart_relayout";
    const isGeneratedResize = isSmartResize || shouldUseAiOutpaint;
    const resultFitMode: ExactFitMode = (isCreativeImageToImage || isGeneratedResize || isOutpaint)
      ? "safe_no_crop"
      : processingFitMode;
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
        : await processToTarget(imageBuffer, ratio, quality, "png", processingFitMode);
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

    const preparedTargetCanvas = isGeneratedResize && !keepOriginalRatio ? await prepareOutpaintInput(imageBuffer, ratio, direction) : null;
    const openai = getOpenAI();
    const createEditRequest = async (requestPrompt: string) => {
      const editImageBuffer = preparedTargetCanvas?.image ?? imageBuffer;
      const file = await toFile(editImageBuffer, preparedTargetCanvas ? "target-ratio-canvas.png" : fileName, { type: preparedTargetCanvas ? "image/png" : mimeType });
      const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
      const mask = shouldUseAiOutpaint && preparedTargetCanvas ? await toFile(preparedTargetCanvas.mask, "outpaint-mask.png", { type: "image/png" }) : undefined;
      const result = await withTimeout(
        openai.images.edit({
          model,
          image: brandFiles.length ? ([file, ...brandFiles] as never) : file,
          ...(mask ? { mask } : {}),
          input_fidelity: (isCreativeImageToImage ? "low" : "high") as "low" | "high",
          output_format: "png" as const,
          background: "opaque" as const,
          prompt: requestPrompt,
          size: (preparedTargetCanvas ? "auto" : keepOriginalRatio ? "auto" : getOpenAIRequestedSize(ratio, quality, model)) as "1024x1024",
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
    };
    const requests = promptVariants.map(createEditRequest);
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
        let final = await processEditResult(item, imagePrompt, {
          exactSize,
          customWidth,
          customHeight,
          ratio,
          quality,
          outputSize,
          outputRatioLabel,
          protectionContext,
          fitMode: resultFitMode,
          operation: isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image",
        });
        if ((isCreativeImageToImage || isGeneratedResize || isOutpaint) && final.qualityCheck.compositionRisk) {
          for (let attempt = 1; attempt <= 2 && final.qualityCheck.compositionRisk; attempt += 1) {
            const retryPrompt = (isAiResize || isOutpaint)
              ? buildResizeCompositionRetryPrompt(imagePrompt, attempt, outputRatioLabel, outputSize)
              : buildImageToImageCompositionRetryPrompt(imagePrompt, attempt);
            const retryResponse = await createEditRequest(retryPrompt).catch(() => null);
            const retryItem = retryResponse?.items?.[0]
              ? { ...retryResponse.items[0], prompt: retryPrompt }
              : null;
            if (retryItem) {
              const retry = await processEditResult(retryItem, retryPrompt, {
                exactSize,
                customWidth,
                customHeight,
                ratio,
                quality,
                outputSize,
                outputRatioLabel,
                protectionContext,
                fitMode: resultFitMode,
                operation: isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image",
              }).catch(() => null);
              if (retry && (!retry.qualityCheck.compositionRisk || compositionRiskValue(retry.qualityCheck) < compositionRiskValue(final.qualityCheck))) {
                final = retry;
              }
            }
          }
        }
        const saved = await saveImageBuffer(final.processed, "png", {
          ratioLabel: outputRatioLabel,
          quality,
        });
        const savedStat = await stat(saved.path);
        const savedQualityCheck = await inspectImageQuality(saved.path, {
          quality,
          ratio,
          expectedSize: outputSize,
          fileSizeBytes: savedStat.size,
          aspectRatio: outputRatioLabel,
          protectionContext,
          operation: isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image",
          safeMarginPercent: editSafeMarginPercent({
            exactSize,
            customWidth,
            customHeight,
            ratio,
            quality,
            outputSize,
            outputRatioLabel,
            protectionContext,
            fitMode: resultFitMode,
            operation: isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image",
          }),
        });
        const qualityCheck = tightenImageToImageCompositionRisk(savedQualityCheck, {
          exactSize,
          customWidth,
          customHeight,
          ratio,
          quality,
          outputSize,
          outputRatioLabel,
          protectionContext,
          fitMode: resultFitMode,
          operation: isOutpaint ? "outpaint" : isAiResize ? "resize" : "image_to_image",
        });
        const image = {
          id: saved.fileName,
          url: saved.url,
          originalUrl: saved.originalUrl,
          thumbnailUrl: saved.thumbnailUrl,
          previewUrl: saved.previewUrl,
          prompt: final.prompt,
          variant: index + 1,
          ratio,
          mode: modeLabel,
          model,
          aspectRatio: outputRatioLabel,
          quality,
          generatedAt,
          outputSize: { width: final.actual.width, height: final.actual.height },
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
          outputFitMode: resultFitMode,
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

type EditResultProcessContext = {
  exactSize: boolean;
  customWidth?: number;
  customHeight?: number;
  ratio: PixelSize;
  quality: QualityValue;
  outputSize: PixelSize;
  outputRatioLabel: string;
  protectionContext: ReturnType<typeof parseProtectionContext>;
  fitMode: ExactFitMode;
  operation: "image_to_image" | "resize" | "outpaint";
};

async function processEditResult(
  item: { b64_json?: string | null; url?: string | null },
  prompt: string,
  context: EditResultProcessContext,
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const processed = context.exactSize && context.customWidth && context.customHeight
    ? await processToExactSize(raw, { width: context.customWidth, height: context.customHeight }, "png", context.fitMode)
    : await processToTarget(raw, context.ratio, context.quality, "png", context.fitMode);
  const actual = await readImageMetadata(processed);
  if (context.exactSize) assertExactPixelSize({ width: actual.width, height: actual.height }, context.outputSize);
  const qualityCheck = await inspectImageQuality(processed, {
    quality: context.quality,
    ratio: context.ratio,
    expectedSize: context.outputSize,
    aspectRatio: context.outputRatioLabel,
    protectionContext: context.protectionContext,
    operation: context.operation,
    safeMarginPercent: editSafeMarginPercent(context),
  });
  return { actual, processed, prompt, qualityCheck: tightenImageToImageCompositionRisk(qualityCheck, context) };
}

function buildResizeCompositionRetryPrompt(prompt: string, attempt: number, ratioText: string, target: PixelSize) {
  const targetRatio = target.width / Math.max(1, target.height);
  const isPortrait = targetRatio < 0.92;
  const orientationFix = isPortrait
    ? "竖版：左右 18% 只放背景；标题、主体边缘、手脚、Logo、二维码和底部信息进中心安全区。"
    : "横版：上下 18% 只放背景；标题顶部、主体底部、页脚和二维码进中心安全区。";
  return [
    prompt,
    "",
    `自动构图复查 ${attempt}：上一版改比例疑似裁切或贴边。`,
    `目标：${ratioText} / ${target.width}×${target.height}，生成完整成品设计。`,
    "修正：full poster visible, complete subject/text visible, no cropping, zoom out, larger safe margins；重要元素放中心 76%，四周 18% 只放背景。",
    orientationFix,
    "禁止：半张海报、两侧/上下磨砂补边、模糊补边、空白边、文字或主体触边。",
    attempt >= 2 ? "第二次重试：整体再缩小 20%，底部信息上移，边缘只放背景。" : "",
  ].join("\n");
}

function buildImageToImageCompositionRetryPrompt(prompt: string, attempt = 1) {
  return [
    prompt,
    "",
    `自动构图复查 ${attempt}：上一版图生图疑似文字、主体或边缘信息被裁。`,
    "修正：zoom out；标题和主体缩小；完整文字/主体/横幅可见；四周至少 12% 只放背景。",
    "超宽图：把完整成品放在垂直中心安全带，标题、Logo、主体、卖点和底部信息远离上下边缘。",
    attempt >= 2 ? "第二次重试：标题缩小 20%，主体缩小 15%，边缘只放背景纹理。" : "",
  ].join("\n");
}

function tightenImageToImageCompositionRisk<T extends {
  compositionRisk?: boolean;
  compositionRiskLabel?: string;
  edgeContentRatio?: number;
  edgeHotSide?: string;
  edgeContentRatios?: Record<string, number>;
  issues?: string[];
  actions?: string[];
  status?: string;
  label?: string;
}>(qualityCheck: T, context: EditResultProcessContext): T {
  const ratioValue = context.ratio.width / Math.max(1, context.ratio.height);
  const isWideBanner = context.operation === "image_to_image" && ratioValue > 2.2;
  const isResizeTask = context.operation === "resize";
  const isResizeLandscape = isResizeTask && ratioValue > 1.08;
  const isResizePortrait = isResizeTask && ratioValue < 0.92;
  const topRatio = qualityCheck.edgeContentRatios?.top ?? (qualityCheck.edgeHotSide === "top" ? qualityCheck.edgeContentRatio || 0 : 0);
  const bottomRatio = qualityCheck.edgeContentRatios?.bottom ?? (qualityCheck.edgeHotSide === "bottom" ? qualityCheck.edgeContentRatio || 0 : 0);
  const leftRatio = qualityCheck.edgeContentRatios?.left ?? (qualityCheck.edgeHotSide === "left" ? qualityCheck.edgeContentRatio || 0 : 0);
  const rightRatio = qualityCheck.edgeContentRatios?.right ?? (qualityCheck.edgeHotSide === "right" ? qualityCheck.edgeContentRatio || 0 : 0);
  const topEdgeRisk = isWideBanner && topRatio > 0.22;
  const bottomEdgeRisk = isWideBanner && bottomRatio > 0.28;
  const resizeTopRisk = isResizeTask && topRatio > (isResizePortrait ? 0.2 : 0.18);
  const resizeBottomRisk = isResizeTask && bottomRatio > (isResizePortrait ? 0.2 : 0.2);
  const resizeLeftRisk = (isResizePortrait || isResizeLandscape) && leftRatio > (isResizePortrait ? 0.18 : 0.2);
  const resizeRightRisk = (isResizePortrait || isResizeLandscape) && rightRatio > (isResizePortrait ? 0.18 : 0.2);
  const edgeRisks = [
    { name: "左侧", risky: resizeLeftRisk, ratio: leftRatio },
    { name: "右侧", risky: resizeRightRisk, ratio: rightRatio },
    { name: "顶部", risky: topEdgeRisk || resizeTopRisk, ratio: topRatio },
    { name: "底部", risky: bottomEdgeRisk || resizeBottomRisk, ratio: bottomRatio },
  ].filter((item) => item.risky);
  if (!edgeRisks.length || qualityCheck.compositionRisk) return qualityCheck;
  const worst = edgeRisks.sort((a, b) => b.ratio - a.ratio)[0];
  const taskName = context.operation === "resize" ? "改比例" : "图生图";
  const issue = `${taskName}${worst.name}高对比内容偏多，疑似标题、主体、IP/产品边缘或底部信息贴边/被裁切。`;
  return {
    ...qualityCheck,
    status: "composition_risk",
    label: `${context.outputSize.width}×${context.outputSize.height}｜构图贴边`,
    compositionRisk: true,
    compositionRiskLabel: issue,
    issues: [...(qualityCheck.issues || []), issue],
    actions: [...(qualityCheck.actions || []), "自动重试：缩小标题和主体，增加四周安全边距"],
  };
}

function editSafeMarginPercent(context: EditResultProcessContext) {
  const ratioValue = context.ratio.width / Math.max(1, context.ratio.height);
  if (context.operation === "resize") return ratioValue < 0.92 ? 20 : 18;
  if (context.operation === "image_to_image" && ratioValue > 2.2) return 16;
  return 12;
}

function compositionRiskValue(qualityCheck: { compositionRisk?: boolean; edgeContentRatio?: number; edgeContentRatios?: Record<string, number> }) {
  const maxEdgeRatio = Math.max(
    qualityCheck.edgeContentRatio || 0,
    ...Object.values(qualityCheck.edgeContentRatios || {}).map((value) => Number(value) || 0),
  );
  return (qualityCheck.compositionRisk ? 1 : 0) + maxEdgeRatio;
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
