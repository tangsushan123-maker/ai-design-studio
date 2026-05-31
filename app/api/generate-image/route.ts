import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
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
import { imageRequestOptions, isTransientImageRequestError, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import type { DesignRequest, TextReferenceImage } from "@/lib/design-options";
import {
  buildFallbackDesignPlan,
  type DesignPlan,
} from "@/lib/design-plan";
import { normalizeProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, startTaskRunHeartbeat, taskRunResponseMeta, taskTraceFromFormData, taskTraceFromJson, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";
import { mapWithConcurrency } from "@/lib/async-utils";

export const runtime = "nodejs";
const textReferenceInputReadConcurrency = 4;
const textReferenceModelMaxEdge = 1600;
const textReferenceModelMaxBytes = 3 * 1024 * 1024;
type UploadedReferenceImage = { buffer: Buffer; fileName: string; mimeType: string };
type ReferenceImageInput = { fileKey: string; urlKey: string; fallbackFileName: string };

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  let stopTaskHeartbeat = () => {};
  try {
    const contentType = request.headers.get("content-type") || "";
    const multipart = contentType.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const rawBody = multipart ? designRequestFromFormData(formData as FormData) : await parseTextToImageJsonPayload(request);
    taskTrace = formData
      ? taskTraceFromFormData(formData, "text_to_image", "/api/generate-image")
      : taskTraceFromJson(rawBody as Record<string, unknown>, "text_to_image", "/api/generate-image");
    await recordTaskRunStarted(taskTrace);
    stopTaskHeartbeat = startTaskRunHeartbeat(taskTrace, "文生图仍在处理：正在策划提示词或生成图片。");
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
    const strongReferenceMode = hasReferenceFiles && hasDirectUseReference(body.referenceImages);
    const generationProfile = textToImageGenerationProfile(body, hasReferenceFiles);
    let referenceFallbackSummary: Promise<string> | null = null;
    const getReferenceFallbackSummary = () => {
      referenceFallbackSummary ||= summarizeTextReferenceImages(openai, body, referenceImages);
      return referenceFallbackSummary;
    };
    const designPlan = buildFallbackDesignPlan({
      userPrompt: body.prompt,
      industry: body.adType && body.adType !== "通用设计" ? body.adType : undefined,
      referenceImages: body.referenceImages as unknown as Array<Record<string, unknown>>,
      referenceAnalysis: body.sourceAnalysis || "",
      options: {
        aspectRatio: body.aspectRatio,
        customWidth: body.customWidth || outputSize.width,
        customHeight: body.customHeight || outputSize.height,
        mode: "fast",
        textMode: body.textMode || "ai_text_preview",
      },
    });
    const targetCanvasFirst = shouldUseTextToImageTargetCanvasFirst(size, outputSize);

    const targetCount = generationProfile.targetCount;
    const prompts = buildPromptsFromDesignPlan(designPlan, body, targetCount, { outputRatioLabel, outputSize });
    const createImageRequestWithSize = async (requestPrompt: string, requestSize: string, requestCount = 1) => {
      if (referenceFiles.length) {
        const referencePrompt = buildDirectTextReferencePrompt(requestPrompt, body.referenceImages || [], outputRatioLabel, outputSize, strongReferenceMode);
        try {
          return await runQueuedImageModelRequestWithRetry(
            { label: `文生图/图片参考编辑/${imageModel}`, maxAttempts: 2, retryDelayMs: 2500 },
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
        } catch (error) {
          if (!isTransientImageRequestError(error)) throw error;
          const summary = await getReferenceFallbackSummary();
          const fallbackPrompt = buildReferenceUploadFallbackPrompt(referencePrompt, summary, outputRatioLabel, outputSize, strongReferenceMode);
          return runQueuedImageModelRequestWithRetry(
            { label: `文生图/参考图摘要兜底/${imageModel}`, maxAttempts: 1 },
            () => openai.images.generate({
              model: imageModel,
              prompt: fallbackPrompt,
              size: requestSize as "1024x1024",
              quality: body.quality === "standard" ? "medium" : "high",
              n: requestCount,
            }, imageRequestOptions()),
          );
        }
      }

      return runQueuedImageModelRequestWithRetry(
        { label: `文生图/纯文字/${imageModel}`, maxAttempts: 2, retryDelayMs: 2500 },
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
    let targetCanvasFilePromise: Promise<Awaited<ReturnType<typeof toFile>>> | null = null;
    const getTargetCanvasFile = () => {
      targetCanvasFilePromise ||= createTextToImageTargetCanvas(outputSize).then((canvas) =>
        toFile(canvas, `target-canvas-${outputSize.width}x${outputSize.height}.png`, { type: "image/png" }),
      );
      return targetCanvasFilePromise;
    };
    const createTargetCanvasRequest = async (requestPrompt: string, requestCount = 1) => {
      const canvasFile = await getTargetCanvasFile();
      const promptForCanvas = referenceFiles.length
        ? buildDirectTextReferencePrompt(requestPrompt, body.referenceImages || [], outputRatioLabel, outputSize, strongReferenceMode)
        : requestPrompt;
      return runQueuedImageModelRequestWithRetry(
        { label: `文生图/目标画布兜底/${imageModel}`, maxAttempts: 2, retryDelayMs: 2500 },
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
    const resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }> = [];
    let firstRequestError: unknown = null;
    const requests = prompts.slice(0, targetCount).map((requestPrompt) =>
      targetCanvasFirst ? createTargetCanvasRequest(requestPrompt) : createImageRequest(requestPrompt),
    );
    const settledResults = await Promise.allSettled(requests);
    const failed = settledResults.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") firstRequestError ||= failed.reason;
    appendGeneratedResultItems(resultItems, settledResults, prompts, prompts[0], targetCount);

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
            allowQualityFailedOriginal: true,
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
        const savedQualityCheck = await inspectImageQuality(saved.path, {
          quality: body.quality,
          ratio,
          expectedSize: outputSize,
          fileSizeBytes: saved.fileSizeBytes,
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
          fileSizeBytes: saved.fileSizeBytes,
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
          designPlan,
          designDirection: designPlan.designDirections[index] || null,
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
    const settledImageResults = collectSettledImages(settledImages);
    let images = settledImageResults.images;
    const fillErrors = settledImageResults.errors;
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
      const final = await processTextToImageResult(fillItem, fillPrompt, processContext, { allowQualityFailedOriginal: true }).catch((error) => {
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
      const savedQualityCheck = await inspectImageQuality(saved.path, {
        quality: body.quality,
        ratio,
        expectedSize: outputSize,
        fileSizeBytes: saved.fileSizeBytes,
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
        fileSizeBytes: saved.fileSizeBytes,
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
        designPlan,
        designDirection: designPlan.designDirections[variant - 1] || null,
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
      const partialWarning = `本次只生成 ${images.length}/${targetCount} 张可用方案，已先展示可用结果；建议重新运行补齐缺失方案。最后原因：${reason}`;
      await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `文生图完成但方案未补齐：${partialWarning}` });
      return NextResponse.json({
        ...taskRunResponseMeta(taskTrace, startedAt, images, "partial"),
        images,
        prompt: prompts.join("\n\n---\n\n"),
        designPlan,
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
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, images), images, prompt: prompts.join("\n\n---\n\n"), designPlan, generationProfile: { ...generationProfile, targetCanvasFirst }, size, model: imageModel, imageModel });
  } catch (error) {
    if (error instanceof InvalidTextToImagePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const apiError = toApiError(error, "生成失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  } finally {
    stopTaskHeartbeat();
  }
  });
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

function buildPromptsFromDesignPlan(plan: DesignPlan, body: DesignRequest, targetCount: number, context: { outputRatioLabel: string; outputSize: { width: number; height: number } }) {
  void plan;
  return Array.from({ length: targetCount }, (_, index) => [
    "任务：根据用户要求和输入图片自行分析，直接生成最终图片。",
    `用户原始要求：${body.prompt}`,
    `目标比例/尺寸：${context.outputRatioLabel}，${context.outputSize.width}×${context.outputSize.height}。`,
    body.aspectRatio === "auto" ? "用户选择自适应：请根据内容自行判断画面比例，但最终按上面的系统目标输出。" : "用户已选择固定比例/尺寸：最终画面必须服从这个尺寸。",
    body.textMode === "background_only" ? "用户要求无文字/底图：输出无文字背景图。" : "如果用户明确给了标题、文案、人名、电话、地址等内容，请按用户原文理解和使用；不要擅自编造用户没给的真实信息。",
    buildPromptAssetPolicyFromProtection(body),
    textToImageVariantDirection(index),
  ].filter(Boolean).join("\n"));
}

function textToImageVariantDirection(index: number) {
  const directions = [
    "方案A：偏清晰直接、好理解、适合投放。",
    "方案B：偏高级、有创意、有品牌感；不要只是和方案A换颜色。",
    "方案C：强化主体记忆点和视觉冲击，构图、层级、背景处理要明显区别于前两个方案。",
    "方案D：偏商业成品交付感，信息组织更稳、更精致，避免和前面方案同构。",
    "方案E：偏社媒传播感，节奏更鲜明，但仍保持品牌和用户给定事实准确。",
    "方案F：偏极简高级感，减少杂乱元素，用留白、光影和重点信息形成差异。",
  ];
  return directions[index] || `方案${index + 1}：必须和前面方案明显不同，但不要改变用户要求、品牌和真实信息。`;
}

function buildPromptAssetPolicyFromProtection(body: DesignRequest) {
  const context = normalizeProtectionContext(body.protectionContext);
  const texts = context.protectedTexts || [];
  const assets = context.protectedAssets || [];
  const brandRules = context.brandProfile?.rules || [];
  const realInfo = [
    ...texts.map((item) => `${item.kind}：${item.text}`),
    ...assets.map((item) => `${item.type}：${item.label}`),
  ].slice(0, 12);
  return [
    realInfo.length
      ? `素材库真实信息：${realInfo.join("；")}。需要使用时必须逐字/按图使用这些资料。`
      : "",
    brandRules.length
      ? `素材库规则：${brandRules.slice(0, 10).join("；")}`
      : "",
    "禁止编造：不要自己生成不存在的电话、地址、二维码、Logo、医院/机构代码、预约热线或联系卡片。二维码不要重绘成假码；Logo不要画成乱码。",
  ].filter(Boolean).join("\n");
}

function textToImageGenerationProfile(body: DesignRequest, hasReferenceFiles = false) {
  const targetCount = normalizeVariantCount(body.variantCount);
  if (hasReferenceFiles) {
    return { label: "参考精修", targetCount, maxRetries: 0, briefMode: "ai_cached", modelCallPolicy: targetCount > 1 ? "dual_variants_fast_reference" : "single_fast_reference" };
  }
  if (body.quality === "4k") {
    return { label: "正式高清", targetCount, maxRetries: 1, briefMode: "ai_cached", modelCallPolicy: targetCount > 1 ? "dual_variants_quality_retry" : "single_quality_retry" };
  }
  if (body.quality === "2k") {
    return { label: "标准出图", targetCount, maxRetries: 1, briefMode: "ai_cached", modelCallPolicy: targetCount > 1 ? "dual_variants_retry_if_needed" : "single_retry_if_needed" };
  }
  return { label: "快速预览", targetCount, maxRetries: 0, briefMode: "rules_cached", modelCallPolicy: targetCount > 1 ? "fast_dual_variants" : "fast_single_variant" };
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
      const styleRule = matched?.styleReference ? "，弱参考：只学习风格、配色、构图节奏和商业质感，不复制具体内容" : "";
      return `参考图${index + 1}：${label}，用途：${role}，权重：${weight}${styleRule}`;
    })
    .join("\n") || "没有可用参考图说明。";
}

function buildDirectTextReferencePrompt(
  prompt: string,
  manifest: TextReferenceImage[],
  ratioText: string,
  target: { width: number; height: number },
  strongReferenceMode = false,
) {
  return [
    "任务：根据用户要求和所有输入图片自行分析，直接生成最终图片。",
    `用户原始要求：${compactReferenceImagePrompt(prompt, 2400)}`,
    `目标比例/尺寸：${ratioText} / ${target.width}×${target.height}。`,
    strongReferenceMode ? "参数里标记为引用/人物/产品/主体/背景/Logo/IP 的图片，需要作为可见素材或核心依据进入结果。" : "参数里标记为参考的图片，只作为风格、构图、色彩、字体或氛围参考。",
    manifest.length
      ? manifest.map((item, index) => `参考图${index + 1}：${item.label || item.fileName || item.id}，用途：${textReferenceRoleText(item.role)}，权重：${textReferenceWeightText(item.weight)}${item.styleReference ? "，弱参考：只学习风格、配色、构图节奏和商业质感，不复制具体主体/文字/Logo/二维码" : ""}`).join("\n")
      : "未提供结构化角色。",
    "如果用户给了明确文案，按用户原文理解和使用；不要擅自编造用户没给的电话、地址、二维码、Logo、人名或机构信息。",
  ].join("\n");
}

function buildReferenceUploadFallbackPrompt(
  prompt: string,
  referenceSummary: string,
  ratioText: string,
  target: { width: number; height: number },
  strongReferenceMode: boolean,
) {
  return [
    "参考图上传到图片编辑模型时出现临时上游错误，本次改用参考图分析摘要生成，不能直接照搬原图像素。",
    strongReferenceMode
      ? "用户选择了引用原图：请最大程度保留参考图摘要里的真实场景、主体、透视、人物/产品关系和画面氛围；如果无法精准复现，不要编造电话、地址、二维码或Logo。"
      : "用户选择了参考图：只参考摘要里的风格、构图、色调、信息层级和主视觉方向。",
    `目标画布必须是 ${ratioText} / ${target.width}×${target.height}。`,
    "",
    "【参考图摘要】",
    limitPromptText(referenceSummary, 1600),
    "",
    "【原始设计提示词】",
    limitPromptText(prompt, 2600),
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
    direct_use: "引用原图",
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

function hasDirectUseReference(references?: TextReferenceImage[]) {
  return Boolean(references?.some((item) => ["direct_use", "person", "product", "subject", "background", "logo", "ip"].includes(item.role)));
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
  options: { allowSafeRatioFallback?: boolean; allowQualityFailedOriginal?: boolean } = {},
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const textToImageFitMode = "strict_full_bleed";
  const processWithMode = (fitMode: "strict_full_bleed") => context.exactSize && context.body.customWidth && context.body.customHeight
    ? processToExactSize(raw, { width: context.body.customWidth, height: context.body.customHeight }, "png", fitMode)
    : processToTarget(raw, context.ratio, context.body.quality, "png", fitMode);
  let qualityFailedOriginalReason = "";
  const processed = await processWithMode(textToImageFitMode).catch(async (error) => {
    if (options.allowQualityFailedOriginal && isNativeAspectRatioMismatchError(error)) {
      qualityFailedOriginalReason = `模型原始比例不符合 ${context.outputRatioLabel}，已作为质检未过结果展示。`;
      return sharp(raw).rotate().png({ compressionLevel: 6, palette: false }).toBuffer();
    }
    if (options.allowSafeRatioFallback && isNativeAspectRatioMismatchError(error)) {
      throw new Error(`模型返回比例不符合 ${context.outputRatioLabel}，系统已阻止裁切、拉伸、留白和磨砂补边兜底。`);
    }
    throw error;
  });
  const actual = await readImageMetadata(processed);
  if (!qualityFailedOriginalReason) {
    assertExactPixelSize({ width: actual.width, height: actual.height }, context.outputSize);
  }
  const qualityCheck = await inspectImageQuality(processed, {
    quality: context.body.quality,
    ratio: context.ratio,
    expectedSize: context.outputSize,
    aspectRatio: context.outputRatioLabel,
    protectionContext: context.protectionContext,
    operation: "text_to_image",
    safeMarginPercent: textToImageSafeMarginPercent(context),
  });
  const checked = qualityFailedOriginalReason
    ? {
        ...tightenTextToImageCompositionRisk(qualityCheck, context),
        issues: [qualityFailedOriginalReason, ...(qualityCheck.issues || [])],
        actions: ["已展示未通过质检的模型原图，可按原比例重新生成", ...(qualityCheck.actions || [])],
      }
    : tightenTextToImageCompositionRisk(qualityCheck, context);
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
    variantCount: normalizeVariantCount(body.variantCount),
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
    variantCount: normalizeVariantCount(formData.get("variantCount")),
    imageModel: String(formData.get("imageModel") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    keepOriginalRatio: String(formData.get("keepOriginalRatio") ?? "") === "true",
    sourceAnalysis: String(formData.get("sourceAnalysis") ?? ""),
    referenceImages: parseReferenceManifest(formData.get("referenceManifest")),
    designPlan: parseDesignPlanField(formData.get("designPlan")),
    imagePrompt: String(formData.get("imagePrompt") ?? "") || undefined,
    negativePrompt: String(formData.get("negativePrompt") ?? "") || undefined,
    textMode: parseTextModeField(formData.get("textMode")),
    compositionCompleteness: String(formData.get("compositionCompleteness") ?? "更完整"),
    safeMargin: String(formData.get("safeMargin") ?? "15%"),
    cameraDistance: String(formData.get("cameraDistance") ?? "中景"),
    subjectScale: String(formData.get("subjectScale") ?? "中"),
    previewFit: "contain",
    protectionContext: parseProtectionContext(formData.get("protectionContext")),
  };
}

function normalizeVariantCount(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(2, Math.round(numeric)));
}

function parseDesignPlanField(value: FormDataEntryValue | null): DesignPlan | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as DesignPlan : undefined;
  } catch {
    return undefined;
  }
}

function parseTextModeField(value: FormDataEntryValue | null): DesignRequest["textMode"] {
  if (typeof value !== "string") return undefined;
  return value === "background_only" || value === "ai_text_preview" || value === "real_text_overlay" ? value : undefined;
}

function appendGeneratedResultItems(
  resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }>,
  settledResults: PromiseSettledResult<{ data?: Array<{ b64_json?: string | null; url?: string | null }> | null }>[],
  prompts: string[],
  fallbackPrompt: string,
  targetCount: number,
) {
  for (let index = 0; index < settledResults.length && resultItems.length < targetCount; index += 1) {
    const result = settledResults[index];
    if (result.status !== "fulfilled") continue;
    for (const item of result.value.data ?? []) {
      resultItems.push({ ...item, prompt: prompts[index] || fallbackPrompt });
      if (resultItems.length >= targetCount) break;
    }
  }
}

function collectSettledImages<T>(settledImages: PromiseSettledResult<T>[]) {
  const images: T[] = [];
  const errors: unknown[] = [];
  for (const result of settledImages) {
    if (result.status === "fulfilled") {
      images.push(result.value);
    } else {
      errors.push(result.reason);
    }
  }
  return { images, errors };
}

function parseReferenceManifest(value: FormDataEntryValue | null): TextReferenceImage[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as TextReferenceImage[];
    if (!Array.isArray(parsed)) return [];
    const references: TextReferenceImage[] = [];
    for (const item of parsed) {
      if (!item?.label) continue;
      references.push(item);
      if (references.length >= 5) break;
    }
    return references;
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

async function readReferenceImages(formData: FormData): Promise<UploadedReferenceImage[]> {
  const inputs: ReferenceImageInput[] = [
    ...Array.from({ length: 5 }, (_, offset) => {
      const index = offset + 1;
      return {
        fileKey: `referenceImage_${index}`,
        urlKey: `referenceImageUrl_${index}`,
        fallbackFileName: `text-reference-${index}.png`,
      };
    }),
    ...Array.from({ length: 3 }, (_, offset) => {
      const index = offset + 1;
      return {
        fileKey: `brandAsset_${index}`,
        urlKey: `brandAssetUrl_${index}`,
        fallbackFileName: `brand-asset-${index}.png`,
      };
    }),
    ...Array.from({ length: 3 }, (_, offset) => {
      const index = offset + 1;
      return {
        fileKey: `styleReference_${index}`,
        urlKey: `styleReferenceUrl_${index}`,
        fallbackFileName: `favorite-style-${index}.png`,
      };
    }),
  ];
  const refs = await mapWithConcurrency(inputs, textReferenceInputReadConcurrency, (input) => (
    readImageInput(formData, input.fileKey, input.urlKey, input.fallbackFileName)
  ));
  return refs.filter((item): item is UploadedReferenceImage => item !== null);
}

async function readImageInput(formData: FormData, fileKey: string, urlKey: string, fallbackFileName: string): Promise<UploadedReferenceImage | null> {
  const file = formData.get(fileKey);
  const sourceUrl = String(formData.get(urlKey) ?? "");
  if (file instanceof File) {
    return prepareReferenceImageForModel({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || fallbackFileName,
      mimeType: file.type || "image/png",
    });
  }
  if (sourceUrl) {
    return prepareReferenceImageForModel({
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: fallbackFileName,
      mimeType: "image/png",
    });
  }
  return null;
}

async function prepareReferenceImageForModel(image: UploadedReferenceImage): Promise<UploadedReferenceImage> {
  try {
    const meta = await sharp(image.buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const needsResize = Math.max(width, height) > textReferenceModelMaxEdge;
    const needsCompress = image.buffer.byteLength > textReferenceModelMaxBytes;
    if (!needsResize && !needsCompress) return image;

    const base = sharp(image.buffer, { limitInputPixels: false })
      .rotate()
      .resize({
        width: textReferenceModelMaxEdge,
        height: textReferenceModelMaxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (meta.hasAlpha) {
      return {
        buffer: await base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
        fileName: withImageExtension(image.fileName, "png"),
        mimeType: "image/png",
      };
    }

    return {
      buffer: await base.jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
      fileName: withImageExtension(image.fileName, "jpg"),
      mimeType: "image/jpeg",
    };
  } catch {
    return image;
  }
}

function withImageExtension(fileName: string, extension: "jpg" | "png") {
  const cleanName = fileName.trim() || `text-reference.${extension}`;
  return /\.[a-z0-9]+$/i.test(cleanName)
    ? cleanName.replace(/\.[a-z0-9]+$/i, `.${extension}`)
    : `${cleanName}.${extension}`;
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error("下载生成图片失败。");
  return Buffer.from(await response.arrayBuffer());
}
