import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import {
  buildDesignDirectorBriefFallback,
  buildDesignDirectorBriefRequestPrompt,
  buildDesignDirectorImagePrompt,
  normalizeDesignDirectorBrief,
  shouldUseStrongTextReferenceMode,
  type DesignDirectorBrief,
} from "@/lib/prompt";
import {
  assertExactPixelSize,
  getOpenAIImageSize,
  getOpenAIRequestedSize,
  getTargetPixels,
  isNativeAspectRatioMismatchError,
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
import { getOpenAI } from "@/lib/openai";
import { getAnalysisModel, resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import type { DesignRequest, TextReferenceImage } from "@/lib/design-options";
import { normalizeProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, taskTraceFromJson, type TaskRunTrace } from "@/lib/task-run-ledger";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

const designBriefCache = new Map<string, { createdAt: number; value: DesignDirectorBrief }>();
const designBriefCacheTtlMs = 1000 * 60 * 30;
const designBriefCacheMaxItems = 80;

export async function POST(request: Request) {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    const multipart = contentType.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const rawBody = multipart ? designRequestFromFormData(formData as FormData) : await parseTextToImageJsonPayload(request);
    taskTrace = formData
      ? taskTraceFromFormData(formData, "text_to_image", "/api/generate-image")
      : taskTraceFromJson(rawBody as Record<string, unknown>, "text_to_image", "/api/generate-image");
    await recordTaskRunStarted(taskTrace);
    const body = normalizeTextToImageRequest(rawBody);
    if (!body.prompt?.trim()) {
      await recordTaskRunFailed(taskTrace, "请输入文字需求。");
      return NextResponse.json({ error: "请输入文字需求。" }, { status: 400 });
    }

    const ratio = resolveRatio(body.aspectRatio, body.customWidth, body.customHeight);
    const exactSize = Boolean(body.exactSize && body.customWidth && body.customHeight);
    const protectionContext = normalizeProtectionContext(body.protectionContext);
    const openai = getOpenAI();
    const imageModel = resolveImageModel(body.imageModel, body.model);
    const size = getOpenAIRequestedSize(ratio, body.quality, imageModel);
    const outputSize = exactSize && body.customWidth && body.customHeight
      ? { width: body.customWidth, height: body.customHeight }
      : getTargetPixels(ratio, body.quality);
    const outputRatioLabel = ratioLabel(body.aspectRatio, body.customWidth, body.customHeight);
    const generatedAt = new Date().toISOString();
    const referenceImages = formData ? await readReferenceImages(formData) : [];
    const referenceFiles = await Promise.all(referenceImages.map((item, index) => toFile(item.buffer, item.fileName || `text-reference-${index + 1}.png`, { type: item.mimeType })));
    const hasReferenceFiles = referenceFiles.length > 0;
    const strongReferenceMode = hasReferenceFiles && shouldUseStrongTextReferenceMode(body.prompt);
    const generationProfile = textToImageGenerationProfile(body, hasReferenceFiles);
    let referenceFallbackSummary: Promise<string> | null = null;
    const getReferenceFallbackSummary = () => {
      referenceFallbackSummary ||= summarizeTextReferenceImages(openai, body, referenceImages);
      return referenceFallbackSummary;
    };
    const referenceSummaryForBrief = hasReferenceFiles ? await getReferenceFallbackSummary() : "";
    const bodyWithReferenceAnalysis = referenceSummaryForBrief
      ? {
          ...body,
          sourceAnalysis: [body.sourceAnalysis, referenceSummaryForBrief].filter(Boolean).join("\n"),
        }
      : body;
    const designBrief = await createDesignDirectorBrief(openai, { ...bodyWithReferenceAnalysis, protectionContext }, outputRatioLabel, hasReferenceFiles);
    const promptDirections = selectPromptDirections(designBrief);
    const targetCanvasFirst = shouldUseTextToImageTargetCanvasFirst(size, outputSize);

    const targetCount = generationProfile.targetCount;
    const prompts = Array.from({ length: targetCount }, (_, index) =>
      buildDesignDirectorImagePrompt({
        ...bodyWithReferenceAnalysis,
        protectionContext,
        variantDirection: index === 0 ? "stable" : "creative",
      }, designBrief, promptDirections[index] || promptDirections[0]),
    );
    const createImageRequestWithSize = async (requestPrompt: string, requestSize: string, requestCount = 1) => {
      if (referenceFiles.length) {
        const summary = await getReferenceFallbackSummary();
        const referencePrompt = buildTextReferenceSummaryGenerationPrompt(requestPrompt, body.referenceImages || [], summary, outputRatioLabel, outputSize, strongReferenceMode);
        return runQueuedImageModelRequestWithRetry(
          { label: `文生图/图片参考编辑/${imageModel}` },
          () => openai.images.edit({
            model: imageModel,
            image: referenceFiles.length > 1 ? (referenceFiles as never) : referenceFiles[0],
            prompt: referencePrompt,
            size: requestSize as "1024x1024",
            ...(supportsConfigurableImageInputFidelity(imageModel) ? { input_fidelity: strongReferenceMode ? "high" : "low" } : {}),
            output_format: "png",
            background: "opaque",
            quality: body.quality === "standard" ? "medium" : "high",
            n: requestCount,
          }, imageRequestOptions()),
        );
      }

      return runQueuedImageModelRequestWithRetry(
        { label: `文生图/纯文字/${imageModel}` },
        () => openai.images.generate({
          model: imageModel,
          prompt: requestPrompt,
          size: requestSize as "1024x1024",
          quality: body.quality === "standard" ? "medium" : "high",
          n: requestCount,
        }, imageRequestOptions()),
      );
    };
    const createImageRequest = async (requestPrompt: string, requestCount = 1) => {
      try {
        return await createImageRequestWithSize(requestPrompt, size, requestCount);
      } catch (error) {
        if (!shouldRetryImageSizeWithNativeFallback(error)) throw error;
        return createImageRequestWithSize(
          buildModelNativeSizeFallbackPrompt(requestPrompt, outputRatioLabel, outputSize),
          getOpenAIImageSize(ratio),
          requestCount,
        );
      }
    };
    const createTargetCanvasRequest = async (requestPrompt: string, requestCount = 1) => {
      const canvas = await createTextToImageTargetCanvas(outputSize);
      const canvasFile = await toFile(canvas, `target-canvas-${outputSize.width}x${outputSize.height}.png`, { type: "image/png" });
      const promptForCanvas = referenceFiles.length
        ? buildTextReferenceSummaryGenerationPrompt(requestPrompt, body.referenceImages || [], await getReferenceFallbackSummary(), outputRatioLabel, outputSize, strongReferenceMode)
        : requestPrompt;
      return runQueuedImageModelRequestWithRetry(
        { label: `文生图/目标画布兜底/${imageModel}` },
        () => openai.images.edit({
          model: imageModel,
          image: referenceFiles.length ? ([canvasFile, ...referenceFiles] as never) : canvasFile,
          prompt: buildTextToImageCanvasFallbackPrompt(promptForCanvas, outputRatioLabel, outputSize),
          ...(supportsConfigurableImageInputFidelity(imageModel) ? { input_fidelity: strongReferenceMode ? "high" : "low" } : {}),
          size: "auto" as const,
          quality: body.quality === "standard" ? "medium" : "high",
          output_format: "png" as const,
          background: "opaque" as const,
          n: requestCount,
        }, imageRequestOptions()),
      );
    };
    let resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }> = [];
    let firstRequestError: unknown = null;
    const batchPrompt = buildTextToImageBatchPrompt(prompts, targetCount);
    if (targetCount > 1 && supportsImageRequestBatchCount(imageModel, hasReferenceFiles)) {
      const batchResult = await (targetCanvasFirst ? createTargetCanvasRequest(batchPrompt, targetCount) : createImageRequest(batchPrompt, targetCount)).catch((error) => {
        firstRequestError ||= error;
        return null;
      });
      resultItems = (batchResult?.data ?? []).slice(0, targetCount).map((item) => ({ ...item, prompt: batchPrompt }));
    }
    if (resultItems.length < targetCount) {
      const remainingPrompts = prompts.slice(resultItems.length);
      const requests = remainingPrompts.map((requestPrompt) => targetCanvasFirst ? createTargetCanvasRequest(requestPrompt) : createImageRequest(requestPrompt));
      const settledResults = await Promise.allSettled(requests);
      const failed = settledResults.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") firstRequestError ||= failed.reason;
      resultItems = [
        ...resultItems,
        ...settledResults.flatMap((result, index) =>
          result.status === "fulfilled" ? (result.value.data ?? []).map((item) => ({ ...item, prompt: remainingPrompts[index] || prompts[0] })) : [],
        ),
      ].slice(0, targetCount);
    }

    if (!resultItems.length) {
      if (firstRequestError) throw firstRequestError;
      return NextResponse.json({ error: "图片接口没有返回可用方案。" }, { status: 500 });
    }

    const settledImages = await Promise.allSettled(
      resultItems.slice(0, targetCount).map(async (item, index) => {
        const imagePrompt = item.prompt || prompts[0];
        const processContext = {
          body,
          exactSize,
          outputSize,
          ratio,
          outputRatioLabel,
          protectionContext,
        };
        let lastRatioMismatchItem: { b64_json?: string | null; url?: string | null; prompt: string } | null = item;
        const first = await processTextToImageResult(item, imagePrompt, processContext).catch((error) => {
          if (isNativeAspectRatioMismatchError(error)) return null;
          throw error;
        });
        let final = first;
        if (!final || shouldRetryTextToImageQuality(final.qualityCheck)) {
          for (let attempt = 1; attempt <= generationProfile.maxRetries && (!final || shouldRetryTextToImageQuality(final.qualityCheck)); attempt += 1) {
            const retryPrompt = final
              ? buildCompositionRetryPrompt(imagePrompt, attempt)
              : buildNativeRatioRetryPrompt(imagePrompt, attempt, outputRatioLabel, outputSize);
            const retryResponse = await createImageRequest(retryPrompt).catch(() => null);
            const retryItem = retryResponse?.data?.[0]
              ? { ...retryResponse.data[0], prompt: retryPrompt }
              : null;
            if (retryItem) {
              lastRatioMismatchItem = retryItem;
              const retry = await processTextToImageResult(retryItem, retryPrompt, processContext).catch((error) => {
                if (isNativeAspectRatioMismatchError(error)) return null;
                return null;
              });
              if (retry && (!final || !shouldRetryTextToImageQuality(retry.qualityCheck) || textToImageRiskValue(retry.qualityCheck) < textToImageRiskValue(final.qualityCheck))) {
                final = retry;
              }
            }
          }
        }
        let canvasFallbackUsed = false;
        if (!final) {
          const fallbackResponse = await createTargetCanvasRequest(imagePrompt).catch(() => null);
          const fallbackItem = fallbackResponse?.data?.[0]
            ? { ...fallbackResponse.data[0], prompt: buildTextToImageCanvasFallbackPrompt(imagePrompt, outputRatioLabel, outputSize) }
            : null;
          if (fallbackItem) {
            lastRatioMismatchItem = fallbackItem;
            const fallback = await processTextToImageResult(fallbackItem, fallbackItem.prompt, processContext).catch((error) => {
              if (isNativeAspectRatioMismatchError(error)) return null;
              return null;
            });
            if (fallback) {
              final = fallback;
              canvasFallbackUsed = true;
            }
          }
        }
        if (!final && lastRatioMismatchItem) {
          final = await processTextToImageResult(lastRatioMismatchItem, lastRatioMismatchItem.prompt || imagePrompt, processContext, {
            allowSafeRatioFallback: true,
          });
        }
        if (!final) {
          throw new Error(`模型连续返回非 ${outputRatioLabel} 原生比例图片，已阻止裁切兜底。请重新生成或换一个更稳定的图片模型。`);
        }

        const saved = await saveImageBuffer(final.processed, "png", {
          ratioLabel: outputRatioLabel,
          quality: body.quality,
          projectId: protectionContext.version?.projectId || taskTrace?.projectId,
          storageKind: "results",
        });
        const savedStat = await stat(saved.path);
        const savedQualityCheck = await inspectImageQuality(saved.path, {
          quality: body.quality,
          ratio,
          expectedSize: outputSize,
          fileSizeBytes: savedStat.size,
          aspectRatio: outputRatioLabel,
          protectionContext,
          operation: "text_to_image",
          safeMarginPercent: textToImageSafeMarginPercent({ body, ratio }),
        });
        const qualityCheck = tightenTextToImageCompositionRisk(savedQualityCheck, {
          body,
          exactSize,
          outputSize,
          ratio,
          outputRatioLabel,
          protectionContext,
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
          mode: "文生图",
          model: imageModel,
          aspectRatio: outputRatioLabel,
          quality: body.quality,
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
          nodeOperation: "text_to_image",
          sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
          sourceRequestId: taskTrace?.requestId,
          sourceNodeId: taskTrace?.nodeId,
          sourceNodeName: taskTrace?.nodeName,
          sourceNodeKind: taskTrace?.nodeKind,
          designBrief,
          designDirection: promptDirections[index] || promptDirections[0],
          generationProfile: {
            ...generationProfile,
            canvasFallbackUsed,
            targetCanvasFirst,
          },
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );
    let images = settledImages.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const fillErrors: unknown[] = settledImages.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    for (let attempt = 1; images.length < targetCount && attempt <= targetCount * 2; attempt += 1) {
      const variantIndex = images.length;
      const fillPrompt = buildMissingTextVariantRetryPrompt(prompts[variantIndex] || prompts[0], attempt, targetCount, outputRatioLabel, outputSize);
      const fillResponse = await (targetCanvasFirst ? createTargetCanvasRequest(fillPrompt) : createImageRequest(fillPrompt)).catch((error) => {
        fillErrors.push(error);
        return null;
      });
      const fillItem = fillResponse?.data?.[0] ? { ...fillResponse.data[0], prompt: fillPrompt } : null;
      if (!fillItem) continue;
      const processContext = {
        body,
        exactSize,
        outputSize,
        ratio,
        outputRatioLabel,
        protectionContext,
      };
      const final = await processTextToImageResult(fillItem, fillPrompt, processContext).catch((error) => {
        fillErrors.push(error);
        return null;
      });
      if (!final) continue;
      const saved = await saveImageBuffer(final.processed, "png", {
        ratioLabel: outputRatioLabel,
        quality: body.quality,
        projectId: protectionContext.version?.projectId || taskTrace?.projectId,
        storageKind: "results",
      });
      const savedStat = await stat(saved.path);
      const savedQualityCheck = await inspectImageQuality(saved.path, {
        quality: body.quality,
        ratio,
        expectedSize: outputSize,
        fileSizeBytes: savedStat.size,
        aspectRatio: outputRatioLabel,
        protectionContext,
        operation: "text_to_image",
        safeMarginPercent: textToImageSafeMarginPercent({ body, ratio }),
      });
      const qualityCheck = tightenTextToImageCompositionRisk(savedQualityCheck, {
        body,
        exactSize,
        outputSize,
        ratio,
        outputRatioLabel,
        protectionContext,
      });
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
        mode: "文生图",
        model: imageModel,
        aspectRatio: outputRatioLabel,
        quality: body.quality,
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
        nodeOperation: "text_to_image",
        sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
        sourceRequestId: taskTrace?.requestId,
        sourceNodeId: taskTrace?.nodeId,
        sourceNodeName: taskTrace?.nodeName,
        sourceNodeKind: taskTrace?.nodeKind,
        designBrief,
        designDirection: promptDirections[variant - 1] || promptDirections[0],
        generationProfile: {
          ...generationProfile,
          canvasFallbackUsed: targetCanvasFirst,
          targetCanvasFirst,
          fillAttempt: attempt,
        },
      };
      await saveImageMetadata(saved.fileName, image);
      images = [...images, image];
    }
    if (!images.length) {
      const firstError = settledImages.find((result) => result.status === "rejected");
      if (firstError?.status === "rejected") throw firstError.reason;
      return NextResponse.json({ error: "图片后处理没有得到可用方案。" }, { status: 500 });
    }
    if (images.length < targetCount) {
      const lastError = fillErrors[fillErrors.length - 1];
      const reason = lastError instanceof Error ? lastError.message : String(lastError || "图片模型没有返回足够可用方案。");
      const partialWarning = `本次只生成 ${images.length}/${targetCount} 张可用方案，已先展示可用结果；建议重新运行补齐第二张。最后原因：${reason}`;
      await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `文生图完成但方案未补齐：${partialWarning}` });
      return NextResponse.json({
        ...taskRunResponseMeta(taskTrace, startedAt, images, "partial"),
        images,
        prompt: prompts.join("\n\n---\n\n"),
        designBrief,
        generationProfile: { ...generationProfile, targetCanvasFirst },
        size,
        model: imageModel,
        imageModel,
        partial: true,
        warning: partialWarning,
        expectedCount: targetCount,
      });
    }

    await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `文生图完成，生成 ${images.length} 张。` });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, images), images, prompt: prompts.join("\n\n---\n\n"), designBrief, generationProfile: { ...generationProfile, targetCanvasFirst }, size, model: imageModel, imageModel });
  } catch (error) {
    if (error instanceof InvalidTextToImagePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const apiError = toApiError(error, "生成失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

class InvalidTextToImagePayloadError extends Error {}

async function parseTextToImageJsonPayload(request: Request): Promise<DesignRequest> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidTextToImagePayloadError("文生图请求格式不正确。");
    }
    return body as DesignRequest;
  } catch (error) {
    if (error instanceof InvalidTextToImagePayloadError) throw error;
    throw new InvalidTextToImagePayloadError("文生图 JSON 无法解析，请检查请求内容后重试。");
  }
}

type TextToImageProcessContext = {
  body: DesignRequest;
  exactSize: boolean;
  outputSize: { width: number; height: number };
  ratio: { width: number; height: number };
  outputRatioLabel: string;
  protectionContext: ReturnType<typeof normalizeProtectionContext>;
};

async function createDesignDirectorBrief(
  openai: ReturnType<typeof getOpenAI>,
  body: DesignRequest,
  ratioText: string,
  hasReferenceFiles = false,
): Promise<DesignDirectorBrief> {
  cleanupDesignBriefCache();
  const cacheKey = designBriefCacheKey(body, ratioText, hasReferenceFiles);
  const cached = designBriefCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < designBriefCacheTtlMs) return cached.value;
  const fallback = buildDesignDirectorBriefFallback(body);
  if (shouldUseFastDesignBrief(body, hasReferenceFiles)) {
    rememberDesignBrief(cacheKey, fallback);
    return fallback;
  }
  try {
    const response = await openai.responses.create({
      model: getAnalysisModel(),
      input: buildDesignDirectorBriefRequestPrompt(body, ratioText),
      max_output_tokens: 1800,
    }, { timeout: 5500 });
    const brief = normalizeDesignDirectorBrief(parseDesignBriefJson(response.output_text || ""), fallback);
    rememberDesignBrief(cacheKey, brief);
    return brief;
  } catch {
    rememberDesignBrief(cacheKey, fallback);
    return fallback;
  }
}

function textToImageGenerationProfile(body: DesignRequest, hasReferenceFiles = false) {
  if (hasReferenceFiles) {
    return { label: "参考精修", targetCount: 2, maxRetries: 0, briefMode: "ai_cached", modelCallPolicy: "dual_variants_fast_reference" };
  }
  if (body.quality === "4k") {
    return { label: "正式高清", targetCount: 2, maxRetries: 2, briefMode: "ai_cached", modelCallPolicy: "dual_variants_quality_retry" };
  }
  if (body.quality === "2k") {
    return { label: "标准出图", targetCount: 2, maxRetries: 1, briefMode: "ai_cached", modelCallPolicy: "dual_variants_retry_if_needed" };
  }
  return { label: "快速预览", targetCount: 2, maxRetries: 1, briefMode: "rules_cached", modelCallPolicy: "fast_dual_variants" };
}

function shouldUseFastDesignBrief(body: DesignRequest, hasReferenceFiles = false) {
  if (shouldForceAiPosterPlanning(body)) return false;
  return body.quality === "standard" && !hasReferenceFiles && !body.referenceImages?.length;
}

function shouldForceAiPosterPlanning(body: DesignRequest) {
  const text = `${body.adType || ""}\n${body.prompt || ""}`.trim();
  const compact = text.replace(/\s+/g, "");
  return compact.length <= 42 ||
    /海报|主视觉|活动|节日|端午|中秋|春节|新年|营销|促销|宣传|小红书|朋友圈/.test(text);
}

function designBriefCacheKey(body: DesignRequest, ratioText: string, hasReferenceFiles = false) {
  return JSON.stringify({
    prompt: body.prompt,
    adType: body.adType,
    ratioText,
    hasReferenceFiles,
    aspectRatio: body.aspectRatio,
    customWidth: body.customWidth || 0,
    customHeight: body.customHeight || 0,
    sourceAnalysis: body.sourceAnalysis || "",
    referenceImages: (body.referenceImages || []).map((item) => ({
      id: item.id,
      role: item.role,
      weight: item.weight,
      fileName: item.fileName,
    })),
  });
}

function rememberDesignBrief(key: string, value: DesignDirectorBrief) {
  designBriefCache.set(key, { createdAt: Date.now(), value });
  if (designBriefCache.size <= designBriefCacheMaxItems) return;
  const oldest = [...designBriefCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
  if (oldest) designBriefCache.delete(oldest);
}

function cleanupDesignBriefCache() {
  const now = Date.now();
  for (const [key, item] of designBriefCache.entries()) {
    if (now - item.createdAt > designBriefCacheTtlMs) designBriefCache.delete(key);
  }
}

function parseDesignBriefJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function selectPromptDirections(brief: DesignDirectorBrief) {
  const recommended = brief.directions.find((item) => item.id === brief.recommendedDirectionId) || brief.directions[0];
  const alternate = brief.directions
    .filter((item) => item.id !== recommended.id)
    .sort((a, b) => b.score - a.score)[0] || recommended;
  return [recommended, alternate];
}

function supportsImageRequestBatchCount(model: string, hasReferenceFiles = false) {
  if (hasReferenceFiles) return false;
  return !/dall-e-3/i.test(model);
}

function buildTextToImageBatchPrompt(prompts: string[], targetCount: number) {
  const primary = limitPromptText(prompts[0] || "", 2200);
  if (targetCount <= 1) return primary;
  return [
    primary,
    "",
    `【多候选输出】本次请求需要返回 ${targetCount} 张候选图。`,
    "方案 1：稳定商业、信息清晰、落地性强。",
    "方案 2：同一需求下更有创意记忆点，但仍克制、完整、相关；不要重复方案 1。",
    "两张都必须符合目标比例、安全区、无裁切、无磨砂补边和少文字策略。",
    prompts[1] ? `方案 2 只参考以下差异方向，不要重复整段规则：\n${limitPromptText(prompts[1], 760)}` : "",
  ].filter(Boolean).join("\n");
}

async function summarizeTextReferenceImages(
  openai: ReturnType<typeof getOpenAI>,
  body: DesignRequest,
  references: Array<{ buffer: Buffer; fileName: string; mimeType: string }>,
) {
  const fallback = referenceManifestFallbackSummary(body.referenceImages || [], references);
  if (!references.length) return fallback;

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
                "请分析这些文生图参考图，输出简洁中文说明，供后续图片生成模型使用。",
                "请按参考图编号说明：设计类型、行业、主题、主色调、版式结构、核心文字、主体元素、需要保留的元素、可优化方向。",
                "必须尽量识别中文主标题、活动名称、活动对象、日期、优惠/权益、机构名、人物关系、产品或服务类型；看不清时说明不确定，不要改成无关行业。",
                "如果某张图只是 logo、IP、人物、背景或风格参考，请明确它的用途。不要编造电话、地址、Logo 或二维码。",
                "参考图角色清单：",
                referenceManifestFallbackSummary(body.referenceImages || [], references),
              ].join("\n"),
            },
            ...references.slice(0, 5).map((item) => ({
              type: "input_image" as const,
              image_url: `data:${item.mimeType || "image/png"};base64,${item.buffer.toString("base64")}`,
              detail: "high" as const,
            })),
          ],
        },
      ],
      max_output_tokens: 1200,
    }, { timeout: 18_000 });
    return response.output_text?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function referenceManifestFallbackSummary(manifest: TextReferenceImage[], references: Array<{ fileName: string }>) {
  const roleById = new Map(manifest.map((item, index) => [item.fileName || item.label || item.id || `${index + 1}`, item]));
  return references
    .slice(0, 5)
    .map((item, index) => {
      const matched = roleById.get(item.fileName) || manifest[index];
      const role = matched ? textReferenceRoleText(matched.role) : "只做参考";
      const weight = matched ? textReferenceWeightText(matched.weight) : "中";
      const label = matched?.label || item.fileName || `参考图${index + 1}`;
      return `参考图${index + 1}：${label}，用途：${role}，权重：${weight}`;
    })
    .join("\n") || "没有可用参考图说明。";
}

function buildTextReferenceSummaryGenerationPrompt(
  prompt: string,
  manifest: TextReferenceImage[],
  referenceSummary: string,
  ratioText: string,
  target: { width: number; height: number },
  strongReferenceMode = false,
) {
  const wantsBrandOrContact = /logo|Logo|LOGO|品牌|标志|电话|地址|联系方式|二维码|QR|qr|机构|公司|医院|门店|客户|项目|素材|真实信息/i.test(prompt);
  return [
    strongReferenceMode
      ? "带参考图的文生图强参考模式：参考图会作为真实图片输入给图片模型，必须以第 1 张参考图为主参考生成。"
      : "带参考图的文生图稳定模式：参考图会作为真实图片输入给图片模型，并结合结构化说明生成成品图。",
    strongReferenceMode
      ? "第 1 张参考图的活动主题、核心文案、人物/产品/服务、版式骨架、色彩关系和信息层级必须明显进入结果；只替换用户明确要求修改的部分。"
      : "不要当成无参考图；必须按参考图角色使用人物、产品、IP、背景、风格、构图或色彩。",
    `目标画布：${ratioText} / ${target.width}×${target.height}。按目标比例原生构图，不裁切，不加磨砂补边。`,
    "",
    "【用户需求与设计约束】",
    compactReferenceImagePrompt(prompt, 2400),
    "",
    "【参考图角色】",
    manifest.length
      ? manifest.map((item, index) => `参考图${index + 1}：${item.label || item.fileName || item.id}，用途：${textReferenceRoleText(item.role)}，权重：${textReferenceWeightText(item.weight)}`).join("\n")
      : "未提供结构化角色。",
    "",
    "【参考图分析】",
    limitPromptText(referenceSummary, 1800),
    "",
    "【禁止项】",
    wantsBrandOrContact
      ? "不要编造电话、地址、Logo、二维码、真实机构信息或医疗承诺；不要生成乱码小字；不要复制低清参考图噪点；不要输出边框、白边、黑边、模糊补边或居中小图。"
      : "不要添加用户未要求的品牌、电话、地址、二维码或活动信息；不要生成乱码小字；不要复制低清参考图噪点；不要输出边框、白边、黑边、模糊补边或居中小图。",
  ].join("\n");
}

function compactReferenceImagePrompt(prompt: string, maxLength: number) {
  const cleaned = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isNoisyReferencePromptLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limitPromptText(cleaned || prompt, maxLength);
}

function isNoisyReferencePromptLine(line: string) {
  return /当前项目素材库|已收录|未引用其他项目素材库|未启用公共风格规则|素材来源规则|项目素材备注|待联网补全|缺少品牌素材|当前项目还没有完整品牌资产|以上为旧任务|\.png\s*\/|\.webp\s*\/|\.jpg\s*\//i.test(line);
}

function limitPromptText(text: string, maxLength: number) {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}\n（以上内容已压缩，保留核心需求和约束。）`;
}

function textReferenceRoleText(role?: TextReferenceImage["role"]) {
  const labels: Record<TextReferenceImage["role"], string> = {
    person: "使用人物",
    product: "使用产品",
    subject: "使用主体",
    background: "使用背景",
    style: "参考风格",
    composition: "参考构图",
    color: "参考色调",
    typography: "参考文字排版",
    logo: "使用 logo",
    ip: "使用 IP 形象",
    decoration: "使用装饰元素",
    reference_only: "只做参考",
  };
  return role ? labels[role] || "只做参考" : "只做参考";
}

function textReferenceWeightText(weight?: TextReferenceImage["weight"]) {
  if (weight === "high") return "高";
  if (weight === "low") return "低";
  return "中";
}

function shouldUseTextToImageTargetCanvasFirst(requestedSize: string, target: { width: number; height: number }) {
  const match = requestedSize.match(/^(\d+)x(\d+)$/i);
  if (!match) return false;
  const nativeRatio = Number(match[1]) / Math.max(1, Number(match[2]));
  const targetRatio = target.width / Math.max(1, target.height);
  return Math.abs(nativeRatio - targetRatio) / Math.max(0.0001, targetRatio) > 0.012;
}

async function processTextToImageResult(
  item: { b64_json?: string | null; url?: string | null },
  prompt: string,
  context: TextToImageProcessContext,
  options: { allowSafeRatioFallback?: boolean } = {},
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const textToImageFitMode = "strict_full_bleed";
  const processWithMode = (fitMode: "strict_full_bleed") => context.exactSize && context.body.customWidth && context.body.customHeight
    ? processToExactSize(raw, { width: context.body.customWidth, height: context.body.customHeight }, "png", fitMode)
    : processToTarget(raw, context.ratio, context.body.quality, "png", fitMode);
  const processed = await processWithMode(textToImageFitMode).catch((error) => {
    if (options.allowSafeRatioFallback && isNativeAspectRatioMismatchError(error)) {
      throw new Error(`模型返回比例不符合 ${context.outputRatioLabel}，系统已阻止裁切、拉伸、留白和磨砂补边兜底。`);
    }
    throw error;
  });
  const actual = await readImageMetadata(processed);
  assertExactPixelSize({ width: actual.width, height: actual.height }, context.outputSize);
  const qualityCheck = await inspectImageQuality(processed, {
    quality: context.body.quality,
    ratio: context.ratio,
    expectedSize: context.outputSize,
    aspectRatio: context.outputRatioLabel,
    protectionContext: context.protectionContext,
    operation: "text_to_image",
    safeMarginPercent: textToImageSafeMarginPercent(context),
  });
  const checked = tightenTextToImageCompositionRisk(qualityCheck, context);
  return { actual, processed, prompt, qualityCheck: checked };
}

function buildNativeRatioRetryPrompt(prompt: string, attempt: number, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  const importantElements = importantElementsForRetry(prompt);
  return [
    "Regenerate the same commercial design with corrected native canvas.",
    `Core request:\n${core}`,
    `Retry ${attempt}: native ${ratioText}, target ${target.width}x${target.height}.`,
    `Design natively for this canvas from the start: full composition, complete ${importantElements} inside safe margins.`,
    "No crop recovery, no side blur padding, no frosted edges, no centered smaller image, no white/black border.",
  ].join("\n");
}

function buildMissingTextVariantRetryPrompt(prompt: string, attempt: number, targetCount: number, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  const importantElements = importantElementsForRetry(prompt);
  return [
    "Generate one additional usable candidate for the same request.",
    `Core request:\n${core}`,
    `Need ${targetCount} total candidates; retry ${attempt}. Native ${ratioText}, target ${target.width}x${target.height}.`,
    "Make this candidate visually distinct in layout, main visual, or creative memory point.",
    `Complete image only: no cropped ${importantElements}, no side blur padding, no frosted edges, no centered small image.`,
  ].join("\n");
}

function buildTextToImageCanvasFallbackPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  const importantElements = importantElementsForRetry(prompt);
  return [
    "Edit this blank target canvas into the final commercial design.",
    `Core request:\n${core}`,
    `Canvas is fixed: ${ratioText}, ${target.width}x${target.height}. Fill the whole canvas natively.`,
    "Do not return another ratio. Do not place a smaller centered image. No border, blank margin, blur padding, or frosted edge.",
    `Keep ${importantElements} complete inside safe margins; put only natural background/texture/bleed decoration near edges.`,
  ].join("\n");
}

function buildModelNativeSizeFallbackPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  const importantElements = importantElementsForRetry(prompt);
  return [
    "Generate the same design with extra safe margins for system size adaptation.",
    `Core request:\n${core}`,
    `Final system output will be ${ratioText}, ${target.width}x${target.height}.`,
    `Place ${importantElements} safely away from edges; leave more natural background around the design.`,
    "No edge-touching important content, no full-bleed oversized subject, no border, no blur/frosted padding, no centered smaller image.",
  ].join("\n");
}

function shouldRetryImageSizeWithNativeFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid.*size|unsupported.*size|size.*unsupported|size.*invalid|invalid_image_size|unsupported_image_size|尺寸.*不支持|不支持.*尺寸/i.test(message);
}

async function createTextToImageTargetCanvas(target: { width: number; height: number }) {
  return sharp({
    create: {
      width: Math.max(1, Math.round(target.width)),
      height: Math.max(1, Math.round(target.height)),
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png({ compressionLevel: 6, palette: false })
    .toBuffer();
}

function buildCompositionRetryPrompt(prompt: string, attempt = 1) {
  const core = compactRetryPrompt(prompt);
  const importantElements = importantElementsForRetry(prompt);
  return [
    "Regenerate the same design after composition QA failed.",
    `Core request:\n${core}`,
    `Retry ${attempt}: 主体和标题缩小 10%-20%；keep important elements inside the center safe area; 四周 18% 只放背景/出血装饰；edges should be background/bleed decoration only.`,
    `版式修正：按 4/8/12 栅格重排；${importantElements} 必须落在清晰对齐轴；组内近、组间远，避免随机漂浮和错位。`,
    "Use a clean grid and alignment axes; reduce clutter; keep selling points limited and readable.",
    attempt >= 2 ? "Second retry: make subject/title another 20% smaller and keep only background near edges." : "",
    "Avoid cropped subject/text, edge-pressed footer, wrong ratio, white/black/transparent border, 模糊/磨砂/玻璃补边, centered smaller image.",
  ].join("\n");
}

function importantElementsForRetry(prompt: string) {
  return /logo|Logo|LOGO|品牌|标志|电话|地址|联系方式|二维码|QR|qr|机构|公司|医院|门店|客户|项目|素材|真实信息/i.test(prompt)
    ? "subject/title/requested text/logo/product/person/QR/contact"
    : "subject/title/requested text/person/product";
}

function compactRetryPrompt(prompt: string, maxLength = 1800) {
  const cleaned = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(- )?(Design QA before final image|Avoid:|negative prompt|自动|补齐|目标画布兜底|模型尺寸兜底|Retry \d|Regenerate)/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned || prompt.slice(0, maxLength);
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function shouldRetryTextToImageQuality(qualityCheck: Awaited<ReturnType<typeof inspectImageQuality>>) {
  return Boolean(
    qualityCheck.compositionRisk ||
      qualityCheck.hasWhiteBorder ||
      qualityCheck.ratioMatched === false ||
      qualityCheck.suspectedBlurredPadding ||
      (qualityCheck.edgeContentRatio || 0) > 0.38,
  );
}

function textToImageRiskValue(qualityCheck: Awaited<ReturnType<typeof inspectImageQuality>>) {
  const maxEdgeRatio = Math.max(
    qualityCheck.edgeContentRatio || 0,
    ...Object.values(qualityCheck.edgeContentRatios || {}).map((value) => Number(value) || 0),
  );
  return (qualityCheck.compositionRisk ? 1 : 0) +
    (qualityCheck.hasWhiteBorder ? 1 : 0) +
    (qualityCheck.ratioMatched === false ? 1 : 0) +
    (qualityCheck.suspectedBlurredPadding ? 1 : 0) +
    maxEdgeRatio;
}

function safeMarginPercent(value?: string) {
  const parsed = Number(String(value || "").replace("%", ""));
  return [5, 10, 15, 20].includes(parsed) ? parsed : 15;
}

function textToImageSafeMarginPercent(context: Pick<TextToImageProcessContext, "body" | "ratio">) {
  const ratioValue = context.ratio.width / Math.max(1, context.ratio.height);
  const base = safeMarginPercent(context.body.safeMargin);
  if (ratioValue < 0.92) return Math.max(base, 20);
  if (ratioValue > 1.08) return Math.max(base, ratioValue > 2.2 ? 18 : 18);
  return base;
}

function tightenTextToImageCompositionRisk<T extends {
  compositionRisk?: boolean;
  compositionRiskLabel?: string;
  edgeContentRatio?: number;
  edgeHotSide?: string;
  edgeContentRatios?: Record<string, number>;
  issues?: string[];
  actions?: string[];
  status?: string;
  label?: string;
}>(qualityCheck: T, context: TextToImageProcessContext): T {
  if (qualityCheck.compositionRisk) return qualityCheck;
  const ratioValue = context.ratio.width / Math.max(1, context.ratio.height);
  const isPortrait = ratioValue < 0.92;
  const isLandscape = ratioValue > 1.08;
  const topRatio = qualityCheck.edgeContentRatios?.top ?? (qualityCheck.edgeHotSide === "top" ? qualityCheck.edgeContentRatio || 0 : 0);
  const bottomRatio = qualityCheck.edgeContentRatios?.bottom ?? (qualityCheck.edgeHotSide === "bottom" ? qualityCheck.edgeContentRatio || 0 : 0);
  const leftRatio = qualityCheck.edgeContentRatios?.left ?? (qualityCheck.edgeHotSide === "left" ? qualityCheck.edgeContentRatio || 0 : 0);
  const rightRatio = qualityCheck.edgeContentRatios?.right ?? (qualityCheck.edgeHotSide === "right" ? qualityCheck.edgeContentRatio || 0 : 0);
  const edgeRisks = [
    { name: "左侧", risky: isPortrait && leftRatio > 0.18, ratio: leftRatio },
    { name: "右侧", risky: isPortrait && rightRatio > 0.18, ratio: rightRatio },
    { name: "顶部", risky: topRatio > (isPortrait ? 0.2 : isLandscape ? 0.18 : 0.24), ratio: topRatio },
    { name: "底部", risky: bottomRatio > (isPortrait ? 0.2 : isLandscape ? 0.2 : 0.24), ratio: bottomRatio },
  ].filter((item) => item.risky);
  if (!edgeRisks.length) return qualityCheck;
  const worst = edgeRisks.sort((a, b) => b.ratio - a.ratio)[0];
  const issue = `文生图${worst.name}高对比内容偏多，疑似标题、主体、IP/产品边缘或底部信息贴边/被裁切。`;
  return {
    ...qualityCheck,
    status: "composition_risk",
    label: `${context.outputSize.width}×${context.outputSize.height}｜构图贴边`,
    compositionRisk: true,
    compositionRiskLabel: issue,
    issues: [...(qualityCheck.issues || []), issue],
    actions: [...(qualityCheck.actions || []), "自动重试：缩小主体和标题，增加四周安全边距"],
  };
}

function normalizeTextToImageRequest(body: DesignRequest): DesignRequest {
  const text = `${body.adType || ""}\n${body.prompt || ""}\n${body.sourceAnalysis || ""}`;
  const hasCustomSize = Boolean(body.customWidth && body.customHeight && body.exactSize);
  return {
    ...body,
    aspectRatio: hasCustomSize ? "custom" : body.aspectRatio === "auto" ? inferTextToImageAspectRatio(text) : body.aspectRatio,
    compositionCompleteness: body.compositionCompleteness || "更完整",
    safeMargin: body.safeMargin || "15%",
    cameraDistance: body.cameraDistance || "中景",
    subjectScale: body.subjectScale || "中",
    previewFit: "contain",
  };
}

function inferTextToImageAspectRatio(text: string): DesignRequest["aspectRatio"] {
  if (/9\.75\s*[:：]\s*1|超宽|长屏|电子屏|大屏|横幅屏/.test(text)) return "9.75:1";
  if (/9\s*[:：]\s*16|抖音|视频号|竖版|竖屏|手机海报|手机封面|竖构图|竖图/.test(text)) return "9:16";
  if (/16\s*[:：]\s*9|横版|横屏|视频封面|宽屏|官网首屏|发布会|PPT|ppt|KV|kv|主视觉|banner|横幅|头图/.test(text)) return "16:9";
  if (/4\s*[:：]\s*3/.test(text)) return "4:3";
  if (/3\s*[:：]\s*4|小红书|海报|招募|招聘|宣传|展架|易拉宝|水牌|展页|折页/.test(text)) return "3:4";
  if (/4\s*[:：]\s*5/.test(text)) return "4:5";
  if (/1\s*[:：]\s*1|朋友圈|方图|正方形|头像|logo|Logo|LOGO|icon|Icon|徽章|贴纸/.test(text)) return "1:1";
  return "16:9";
}

function designRequestFromFormData(formData: FormData): DesignRequest {
  return {
    prompt: String(formData.get("prompt") ?? ""),
    adType: String(formData.get("adType") ?? "通用设计"),
    aspectRatio: String(formData.get("aspectRatio") ?? "1:1") as DesignRequest["aspectRatio"],
    customWidth: Number(formData.get("customWidth") || 0) || undefined,
    customHeight: Number(formData.get("customHeight") || 0) || undefined,
    exactSize: String(formData.get("exactSize") ?? "") === "true",
    quality: String(formData.get("quality") ?? "standard") as DesignRequest["quality"],
    imageModel: String(formData.get("imageModel") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    keepOriginalRatio: String(formData.get("keepOriginalRatio") ?? "") === "true",
    sourceAnalysis: String(formData.get("sourceAnalysis") ?? ""),
    referenceImages: parseReferenceManifest(formData.get("referenceManifest")),
    compositionCompleteness: String(formData.get("compositionCompleteness") ?? "更完整"),
    safeMargin: String(formData.get("safeMargin") ?? "15%"),
    cameraDistance: String(formData.get("cameraDistance") ?? "中景"),
    subjectScale: String(formData.get("subjectScale") ?? "中"),
    previewFit: "contain",
    protectionContext: parseProtectionContext(formData.get("protectionContext")),
  };
}

function parseReferenceManifest(value: FormDataEntryValue | null): TextReferenceImage[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as TextReferenceImage[];
    return Array.isArray(parsed) ? parsed.filter((item) => Boolean(item?.label)).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function parseProtectionContext(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return normalizeProtectionContext(JSON.parse(value));
  } catch {
    return {};
  }
}

async function readReferenceImages(formData: FormData) {
  const refs: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];
  for (let index = 1; index <= 5; index += 1) {
    const item = await readImageInput(formData, `referenceImage_${index}`, `referenceImageUrl_${index}`, `text-reference-${index}.png`);
    if (item) refs.push(item);
  }
  for (let index = 1; index <= 3; index += 1) {
    const item = await readImageInput(formData, `brandAsset_${index}`, `brandAssetUrl_${index}`, `brand-asset-${index}.png`);
    if (item) refs.push(item);
  }
  return refs;
}

async function readImageInput(formData: FormData, fileKey: string, urlKey: string, fallbackFileName: string) {
  const file = formData.get(fileKey);
  const sourceUrl = String(formData.get(urlKey) ?? "");
  if (file instanceof File) {
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || fallbackFileName,
      mimeType: file.type || "image/png",
    };
  }
  if (sourceUrl) {
    return {
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: fallbackFileName,
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
