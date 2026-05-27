import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import { buildImageEditPrompt, IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  assertExactPixelSize,
  type ExactFitMode,
  getOpenAIImageSize,
  getOpenAIRequestedSize,
  getTargetPixels,
  isNativeAspectRatioMismatchError,
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
import { getAnalysisModel, resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { parseProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  try {
    const formData = await request.formData();
    taskTrace = taskTraceFromFormData(formData, "edit_image", "/api/edit-image");
    await recordTaskRunStarted(taskTrace);
    const uploadedImage = formData.get("image");
    const sourceUrl = String(formData.get("sourceUrl") ?? "");
    const promptText = String(formData.get("prompt") ?? "");
    const modeLabel = String(formData.get("modeLabel") ?? "图生图 / 改图");
    const direction = String(formData.get("direction") ?? "四周");
    const isOutpaint = modeLabel.includes("扩图");
    const isLegacyQualityExport = /^4K\s*\u5bfc\u51fa$/.test(modeLabel);
    const isAiResize = modeLabel.includes("AI改尺寸") || isLegacyQualityExport;
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
      await recordTaskRunFailed(taskTrace, "请上传参考图或选择已生成图片。");
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
    const imageModel = resolveImageModel(formData.get("imageModel"), formData.get("model"));
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
      ? "strict_full_bleed"
      : processingFitMode;
    const sanitizedPromptText = isCreativeImageToImage
      ? sanitizeLegacyImageToImagePrompt(promptText)
      : isSmartResize
        ? sanitizeSmartResizePrompt(promptText)
        : promptText.trim();
    const userPrompt = sanitizedPromptText || (isCreativeImageToImage
      ? IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST
      : isSmartResize
        ? "按目标尺寸重新设计新版式。原图只作为主题、品牌色、核心内容和素材参考，文字、Logo、主体、卖点和视觉重心必须按新画布重新排版，不要保留原图坐标。"
        : "保留原图核心内容、主体、文字、Logo、电话、地址和品牌识别，只优化光影、背景质感、清晰度和商业完成度。");

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

    const targetCount = modeLabel.includes("AI改尺寸") || modeLabel.includes("4K")
      ? 1
      : isCreativeImageToImage || wantsMultipleImageOutputs(promptText)
        ? 2
        : 1;
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
        projectId: protectionContext.version?.projectId || taskTrace?.projectId,
        storageKind: "results",
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
        model: imageModel,
        aspectRatio: outputRatioLabel,
        quality,
        generatedAt,
        outputSize: { width: actual.width, height: actual.height },
        expectedOutputSize: outputSize,
        qualityCheck,
        fileSizeBytes: savedStat.size,
        savedPath: saved.path,
        durationMs: Date.now() - startedAt,
        projectId: protectionContext.version?.projectId || taskTrace?.projectId,
        protectionContext,
        version: protectionContext.version,
        nodeOperation: "resize",
        sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
        sourceRequestId: taskTrace?.requestId,
        sourceNodeId: taskTrace?.nodeId,
        sourceNodeName: taskTrace?.nodeName,
        sourceNodeKind: taskTrace?.nodeKind,
        fitMode,
      };
      await saveImageMetadata(saved.fileName, image);
      await recordTaskRunFinished(taskTrace, { outputs: [image], model: imageModel, message: "改尺寸完成，服务端已保存结果。" });
      return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, [image]), images: [image], prompt: responsePrompt, model: imageModel, imageModel });
    }

    const shouldPrepareTargetCanvas = !keepOriginalRatio && (
      shouldUseAiOutpaint ||
      isSmartResize ||
      (isCreativeImageToImage && ratioMismatch(originalRatio, ratio))
    );
    const preparedTargetCanvas = shouldPrepareTargetCanvas ? await prepareOutpaintInput(imageBuffer, ratio, direction, isSmartResize ? outputSize : undefined) : null;
    const openai = getOpenAI();
    let creativeEditFallbackSummary: Promise<string> | null = null;
    const getCreativeEditFallbackSummary = () => {
      creativeEditFallbackSummary ||= summarizeCreativeEditSourceImage(openai, imageBuffer, mimeType, userPrompt);
      return creativeEditFallbackSummary;
    };
    const createEditRequestWithSize = async (requestPrompt: string, requestSize: string) => {
      const editImageBuffer = preparedTargetCanvas?.image ?? imageBuffer;
      const file = await toFile(editImageBuffer, preparedTargetCanvas ? "target-ratio-canvas.png" : fileName, { type: preparedTargetCanvas ? "image/png" : mimeType });
      const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
      const mask = shouldUseAiOutpaint && preparedTargetCanvas ? await toFile(preparedTargetCanvas.mask, "outpaint-mask.png", { type: "image/png" }) : undefined;
      const inputFidelity = (isCreativeImageToImage || isSmartResize) ? "low" : "high";
      const runEditRequest = () => runQueuedImageModelRequestWithRetry(
        { label: `${modeLabel}/${imageModel}` },
        () => openai.images.edit({
          model: imageModel,
          image: brandFiles.length ? ([file, ...brandFiles] as never) : file,
          ...(mask ? { mask } : {}),
          ...(supportsConfigurableImageInputFidelity(imageModel) ? { input_fidelity: inputFidelity as "low" | "high" } : {}),
          output_format: "png" as const,
          background: "opaque" as const,
          prompt: requestPrompt,
          size: requestSize as "1024x1024",
          quality: quality === "standard" ? "medium" : "high",
          n: 1,
        }, imageRequestOptions()),
      );
      const result = await withTimeout(
        runEditRequest().catch(async (error) => {
          if (!(isCreativeImageToImage || isSmartResize) || !shouldFallbackCreativeImageEdit(error)) throw error;
          const summary = await getCreativeEditFallbackSummary();
          const fallbackSize = requestSize === "auto" ? getOpenAIRequestedSize(ratio, quality, imageModel) : requestSize;
          const fallbackPrompt = isSmartResize
            ? buildSmartResizeGenerateFallbackPrompt(requestPrompt, summary, outputRatioLabel, outputSize)
            : buildCreativeImageEditFallbackPrompt(requestPrompt, summary, outputRatioLabel, outputSize);
          return runQueuedImageModelRequestWithRetry(
            { label: `${isSmartResize ? "改比例" : "图生图"}/摘要降级/${imageModel}` },
            () => openai.images.generate({
              model: imageModel,
              prompt: fallbackPrompt,
              size: fallbackSize as "1024x1024",
              quality: quality === "standard" ? "medium" : "high",
              n: 1,
            }, imageRequestOptions()),
          );
        }),
        30 * 60 * 1000,
        "图片模型排队或响应超过 30 分钟仍未返回，请稍后重试或换一个更快的模型。",
      );
      return {
        prompt: requestPrompt,
        items: result.data ?? [],
      };
    };
    const createEditRequest = async (requestPrompt: string) => {
      const requestedSize = preparedTargetCanvas ? "auto" : keepOriginalRatio ? "auto" : getOpenAIRequestedSize(ratio, quality, imageModel);
      try {
        return await createEditRequestWithSize(requestPrompt, requestedSize);
      } catch (error) {
        if (requestedSize === "auto" || !shouldRetryEditSizeWithNativeFallback(error)) throw error;
        return createEditRequestWithSize(
          buildEditModelNativeSizeFallbackPrompt(requestPrompt, outputRatioLabel, outputSize),
          getOpenAIImageSize(ratio),
        );
      }
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

    const processedSettled = await Promise.allSettled(
      resultItems.slice(0, targetCount).map(async (item, index) => {
        const imagePrompt = item.prompt || prompt;
        const processContext = {
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
        } as EditResultProcessContext;
        let lastRatioMismatchItem: { b64_json?: string | null; url?: string | null; prompt: string } | null = item;
        let final = await processEditResult(item, imagePrompt, processContext).catch((error) => {
          if (isNativeAspectRatioMismatchError(error)) return null;
          throw error;
        });
        if ((isCreativeImageToImage || isGeneratedResize || isOutpaint) && (!final || final.qualityCheck.compositionRisk)) {
          for (let attempt = 1; attempt <= 2 && (!final || final.qualityCheck.compositionRisk); attempt += 1) {
            const retryPrompt = !final
              ? buildNativeEditRatioRetryPrompt(imagePrompt, attempt, outputRatioLabel, outputSize)
              : (isAiResize || isOutpaint)
                ? buildResizeCompositionRetryPrompt(imagePrompt, attempt, outputRatioLabel, outputSize, fitMode)
                : buildImageToImageCompositionRetryPrompt(imagePrompt, attempt);
            const retryResponse = await createEditRequest(retryPrompt).catch(() => null);
            const retryItem = retryResponse?.items?.[0]
              ? { ...retryResponse.items[0], prompt: retryPrompt }
              : null;
            if (retryItem) {
              lastRatioMismatchItem = retryItem;
              const retry = await processEditResult(retryItem, retryPrompt, processContext).catch((error) => {
                if (isNativeAspectRatioMismatchError(error)) return null;
                return null;
              });
              if (retry && (!final || !retry.qualityCheck.compositionRisk || compositionRiskValue(retry.qualityCheck) < compositionRiskValue(final.qualityCheck))) {
                final = retry;
              }
            }
          }
        }
        if (!final && lastRatioMismatchItem) {
          final = await processEditResult(lastRatioMismatchItem, lastRatioMismatchItem.prompt || imagePrompt, processContext, {
            allowSafeRatioFallback: true,
          });
        }
        if (!final) {
          throw new Error(`模型连续返回非 ${outputRatioLabel} 原生比例图片，已阻止裁切兜底。请重新运行，或改用“扩图补画”处理比例差异。`);
        }
        const saved = await saveImageBuffer(final.processed, "png", {
          ratioLabel: outputRatioLabel,
          quality,
          projectId: protectionContext.version?.projectId || taskTrace?.projectId,
          storageKind: "results",
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
          model: imageModel,
          aspectRatio: outputRatioLabel,
          quality,
          generatedAt,
          outputSize: { width: final.actual.width, height: final.actual.height },
          expectedOutputSize: outputSize,
          qualityCheck,
          fileSizeBytes: savedStat.size,
          savedPath: saved.path,
          durationMs: Date.now() - startedAt,
          projectId: protectionContext.version?.projectId || taskTrace?.projectId,
          protectionContext,
          version: protectionContext.version,
          nodeOperation: isOutpaint ? "outpaint" : isAiResize ? "resize" : modeLabel === "图生图" ? "image_to_image" : "edit_image",
          sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
          sourceRequestId: taskTrace?.requestId,
          sourceNodeId: taskTrace?.nodeId,
          sourceNodeName: taskTrace?.nodeName,
          sourceNodeKind: taskTrace?.nodeKind,
          fitMode,
          outputFitMode: resultFitMode,
          resizeRecoveryMode: isSmartResize && preparedTargetCanvas ? "target_canvas_relayout" : undefined,
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );
    let images = processedSettled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const fillErrors: unknown[] = processedSettled.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    for (let attempt = 1; images.length < targetCount && attempt <= targetCount * 2; attempt += 1) {
      const variantIndex = images.length;
      const basePrompt = promptVariants[variantIndex] || promptVariants[0] || prompt;
      const fillPrompt = buildMissingEditVariantRetryPrompt(basePrompt, attempt, targetCount, outputRatioLabel, outputSize, isAiResize ? "resize" : isOutpaint ? "outpaint" : "image_to_image");
      const retryResponse = await createEditRequest(fillPrompt).catch((error) => {
        fillErrors.push(error);
        return null;
      });
      const retryItem = retryResponse?.items?.[0] ? { ...retryResponse.items[0], prompt: fillPrompt } : null;
      if (!retryItem) continue;
      const processContext = {
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
      } as EditResultProcessContext;
      const final = await processEditResult(retryItem, fillPrompt, processContext).catch((error) => {
        fillErrors.push(error);
        return null;
      });
      if (!final) continue;
      const saved = await saveImageBuffer(final.processed, "png", {
        ratioLabel: outputRatioLabel,
        quality,
        projectId: protectionContext.version?.projectId || taskTrace?.projectId,
        storageKind: "results",
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
        safeMarginPercent: editSafeMarginPercent(processContext),
      });
      const qualityCheck = tightenImageToImageCompositionRisk(savedQualityCheck, processContext);
      const variant = images.length + 1;
      const image = {
        id: saved.fileName,
        url: saved.url,
        originalUrl: saved.originalUrl,
        thumbnailUrl: saved.thumbnailUrl,
        previewUrl: saved.previewUrl,
        prompt: final.prompt,
        variant,
        ratio,
        mode: modeLabel,
        model: imageModel,
        aspectRatio: outputRatioLabel,
        quality,
        generatedAt,
        outputSize: { width: final.actual.width, height: final.actual.height },
        expectedOutputSize: outputSize,
        qualityCheck,
        fileSizeBytes: savedStat.size,
        savedPath: saved.path,
        durationMs: Date.now() - startedAt,
        projectId: protectionContext.version?.projectId || taskTrace?.projectId,
        protectionContext,
        version: protectionContext.version,
        nodeOperation: isOutpaint ? "outpaint" : isAiResize ? "resize" : modeLabel === "图生图" ? "image_to_image" : "edit_image",
        sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
        sourceRequestId: taskTrace?.requestId,
        sourceNodeId: taskTrace?.nodeId,
        sourceNodeName: taskTrace?.nodeName,
        sourceNodeKind: taskTrace?.nodeKind,
        fitMode,
        outputFitMode: resultFitMode,
        resizeRecoveryMode: isSmartResize && preparedTargetCanvas ? "target_canvas_relayout" : undefined,
      };
      await saveImageMetadata(saved.fileName, image);
      images = [...images, image];
    }
    if (!images.length) {
      const failed = processedSettled.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return NextResponse.json({ error: "改图后处理没有得到可用方案。" }, { status: 500 });
    }
    if (images.length < targetCount) {
      const lastError = fillErrors[fillErrors.length - 1];
      const reason = lastError instanceof Error ? lastError.message : String(lastError || "图片模型没有返回足够可用方案。");
      const partialWarning = `本次只生成 ${images.length}/${targetCount} 张可用方案，已先展示可用结果；建议重新运行补齐第二张。最后原因：${reason}`;
      await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `${modeLabel} 完成但方案未补齐：${partialWarning}` });
      return NextResponse.json({
        ...taskRunResponseMeta(taskTrace, startedAt, images, "partial"),
        images,
        prompt: responsePrompt,
        model: imageModel,
        imageModel,
        partial: true,
        warning: partialWarning,
        expectedCount: targetCount,
      });
    }

    await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `${modeLabel} 完成，生成 ${images.length} 张。` });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, images), images, prompt: responsePrompt, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "改图失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
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
  options: { allowSafeRatioFallback?: boolean } = {},
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const processWithFitMode = (fitMode: ExactFitMode) => context.exactSize && context.customWidth && context.customHeight
    ? processToExactSize(raw, { width: context.customWidth, height: context.customHeight }, "png", fitMode)
    : processToTarget(raw, context.ratio, context.quality, "png", fitMode);
  const processed = await processWithFitMode(context.fitMode).catch(async (error) => {
    if (!options.allowSafeRatioFallback || context.fitMode !== "strict_full_bleed" || !isNativeAspectRatioMismatchError(error)) throw error;
    throw new Error(`模型返回比例不符合 ${context.outputRatioLabel}，系统已阻止裁切、拉伸、留白和磨砂补边兜底。`);
  });
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
  const checked = tightenImageToImageCompositionRisk(qualityCheck, context);
  return { actual, processed, prompt, qualityCheck: checked };
}

async function summarizeCreativeEditSourceImage(
  openai: ReturnType<typeof getOpenAI>,
  imageBuffer: Buffer,
  mimeType: string,
  userPrompt: string,
) {
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
                "请分析这张图生图参考图，输出简洁中文说明，供后续广告创意改版生图使用。",
                "请说明：设计类型、行业、主题、主色调、版式结构、核心文字、主体元素、品牌识别、必须保留的信息、可以重新设计的方向。",
                "不要编造电话、地址、Logo 或二维码；无法识别的信息请写“未识别”。",
                `用户改版需求：${userPrompt || "参考原图重新设计一版广告画面。"}`,
              ].join("\n"),
            },
            {
              type: "input_image",
              image_url: `data:${mimeType || "image/png"};base64,${imageBuffer.toString("base64")}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 1200,
    }, { timeout: 18_000 });
    return response.output_text?.trim() || "原图已作为图生图参考，需保留主题、核心文案、品牌色和主体识别。";
  } catch {
    return "原图已作为图生图参考，需保留主题、核心文案、品牌色和主体识别；不要编造电话、地址、Logo 或二维码。";
  }
}

function buildCreativeImageEditFallbackPrompt(prompt: string, sourceSummary: string, ratioText: string, target: PixelSize) {
  const core = compactRetryPrompt(prompt);
  return [
    "Generate a new commercial design based on the input image analysis.",
    `Core request:\n${core}`,
    `Target canvas: ${ratioText}, ${target.width}x${target.height}.`,
    "Preserve the source theme, core copy meaning, brand color direction, subject identity, and important selling points.",
    "Redesign layout, subject placement, selling point grouping, background lighting, and visual center.",
    `Source analysis:\n${sourceSummary}`,
    "Avoid fake institution info, phone, address, logo, QR code, cropping, side blur padding, frosted edges.",
  ].join("\n");
}

function buildSmartResizeGenerateFallbackPrompt(prompt: string, sourceSummary: string, ratioText: string, target: PixelSize) {
  const core = compactRetryPrompt(prompt);
  return [
    "Generate a smart relayout for a new canvas based on the source image analysis.",
    `Core request:\n${core}`,
    `Target canvas: ${ratioText}, ${target.width}x${target.height}. Redesign for this new size; do not keep old coordinates.`,
    "Re-layout title, subject, selling points, logo/QR/info area using the new canvas reading order and safe margins.",
    "Preserve source theme, brand color, subject/IP/product identity, and core copy meaning.",
    `Source analysis:\n${sourceSummary}`,
    "Avoid crop, edge-pressed content, half-poster, blur/frosted padding, centered small image, copied old layout, fake phone/address/logo/QR.",
  ].join("\n");
}

function shouldFallbackCreativeImageEdit(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /502|503|504|bad gateway|gateway timeout|timeout|timed out|fetch failed|upstream|no body|images\\.edit|image edit/i.test(message);
}

function buildResizeCompositionRetryPrompt(prompt: string, attempt: number, ratioText: string, target: PixelSize, fitMode: string) {
  const core = compactRetryPrompt(prompt);
  const targetRatio = target.width / Math.max(1, target.height);
  const isPortrait = targetRatio < 0.92;
  const orientationFix = isPortrait
    ? "竖版：左右 18% 只放背景；标题、主体边缘、手脚、Logo、二维码和底部信息进中心安全区。"
    : "横版：上下 18% 只放背景；标题顶部、主体底部、页脚和二维码进中心安全区。";
  const modeFix = fitMode === "smart_outpaint"
    ? "扩图补画重试：保留原版式和原视觉重心，只向四周或指定方向补全背景、空间和光影，不要重排文字。 Outpaint retry: keep original layout and visual center; extend background, space, and lighting only."
    : "智能改版重试：按目标画布重新排版，不照搬原图坐标；标题、主体、卖点和 Logo 必须服从新尺寸阅读顺序。 Smart relayout retry: use the target canvas reading order; do not copy old coordinates.";
  return [
    "Regenerate the resize result after composition QA failed.",
    `Core request:\n${core}`,
    `Retry ${attempt}: native ${ratioText}, target ${target.width}x${target.height}.`,
    modeFix,
    "Fix: full poster visible, complete subject/text visible, no cropping, zoom out, larger safe margins; edges should be background only.",
    orientationFix,
    attempt >= 2 ? "Second retry: make the whole layout 20% smaller, move footer info inward, keep only background at edges." : "",
    "Avoid half poster, side/top blur padding, frosted edges, blank margins, text/subject touching edges.",
  ].join("\n");
}

function buildNativeEditRatioRetryPrompt(prompt: string, attempt: number, ratioText: string, target: PixelSize) {
  const core = compactRetryPrompt(prompt);
  return [
    "Regenerate the same edit with corrected native canvas.",
    `Core request:\n${core}`,
    `Retry ${attempt}: native ${ratioText}, target ${target.width}x${target.height}.`,
    "Keep subject/person/product/text/logo/QR complete, zoom out, and place all important elements inside safe margins.",
    "Avoid crop, centered smaller image, blur padding, frosted edges, white/black border, stretched background.",
  ].join("\n");
}

function buildMissingEditVariantRetryPrompt(prompt: string, attempt: number, targetCount: number, ratioText: string, target: PixelSize, task: "image_to_image" | "resize" | "outpaint") {
  const core = compactRetryPrompt(prompt);
  const taskText = task === "resize" ? "改比例" : task === "outpaint" ? "扩图补画" : "图生图";
  return [
    `Generate one additional usable ${taskText} candidate.`,
    `Core request:\n${core}`,
    `Need ${targetCount} total candidates; retry ${attempt}. Native ${ratioText}, target ${target.width}x${target.height}.`,
    "Keep key subject/person/product/logo/QR/text complete and visible; do not crop, press content to edges, or return another ratio.",
    "No blur/frosted padding and no centered small image.",
  ].join("\n");
}

function buildEditModelNativeSizeFallbackPrompt(prompt: string, ratioText: string, target: PixelSize) {
  const core = compactRetryPrompt(prompt);
  return [
    "Generate the same edit with extra safe margins for system size adaptation.",
    `Core request:\n${core}`,
    `Final system output will be ${ratioText}, ${target.width}x${target.height}.`,
    "Place subject/title/logo/product/person/QR safely away from edges and leave natural background around them.",
    "Avoid edge-touching important content, oversized full-bleed subject, border, blur/frosted padding, centered small image.",
  ].join("\n");
}

function shouldRetryEditSizeWithNativeFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid.*size|unsupported.*size|size.*unsupported|size.*invalid|invalid_image_size|unsupported_image_size|尺寸.*不支持|不支持.*尺寸/i.test(message);
}

function buildImageToImageCompositionRetryPrompt(prompt: string, attempt = 1) {
  const core = compactRetryPrompt(prompt);
  return [
    "Regenerate the image-to-image result after composition QA failed.",
    `Core request:\n${core}`,
    `Retry ${attempt}: zoom out; make title and subject smaller; keep all text/subject/banner content complete.`,
    "For ultra-wide canvas, keep the finished design inside the vertical center safe band and move title/logo/subject/selling points/footer away from top/bottom edges.",
    attempt >= 2 ? "Second retry: title 20% smaller, subject 15% smaller, edges only background texture." : "",
  ].join("\n");
}

function compactRetryPrompt(prompt: string, maxLength = 1800) {
  const cleaned = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(- )?(Avoid:|禁止|自动|补齐|模型尺寸兜底|目标画布|Retry \d|Regenerate)/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned || prompt.slice(0, maxLength);
  return `${cleaned.slice(0, maxLength).trim()}...`;
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

function sanitizeSmartResizePrompt(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isConservativeSmartResizeLine(line))
    .join("\n");
}

function isLegacyImageToImageDefault(line: string) {
  return /内容不减，比例不变，优化版式，生成(?:专业清晰的)?新版设计。?$/.test(line) ||
    /内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。?$/.test(line) ||
    /保持主体结构和主要版式不变，只优化我接下来指定的部分。?$/.test(line);
}

function isConservativeSmartResizeLine(line: string) {
  return /内容不减，比例不变，优化版式，生成(?:专业清晰的)?新版设计。?$/.test(line) ||
    /内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。?$/.test(line) ||
    /保持原图比例和构图方向，只按目标尺寸导出，不改变版式和未指定内容。?$/.test(line);
}

function ratioMismatch(a: PixelSize, b: PixelSize) {
  const first = a.width / Math.max(1, a.height);
  const second = b.width / Math.max(1, b.height);
  return Math.abs(first - second) / Math.max(0.0001, second) > 0.012;
}

function wantsMultipleImageOutputs(text: string) {
  return /(?:两张|2张|两个|2个|双方案|多方案|多版|方案一|方案二|A\/B|AB|variants?)/i.test(text);
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

async function prepareOutpaintInput(input: Buffer, ratio: PixelSize, direction: string, targetCanvas?: PixelSize) {
  const target = targetCanvas
    ? { width: Math.max(1, Math.round(targetCanvas.width)), height: Math.max(1, Math.round(targetCanvas.height)) }
    : outpaintCanvasSize(ratio);
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
