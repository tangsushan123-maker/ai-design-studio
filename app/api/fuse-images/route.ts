import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  getOpenAIImageSize,
  getOpenAIRequestedSize,
  getTargetPixels,
  isNativeAspectRatioMismatchError,
  parseDataUrl,
  processToTarget,
  readPublicImageUrl,
  ratioLabel,
  resolveRatio,
  saveImageBuffer,
  saveImageMetadata,
} from "@/lib/image-utils";
import { resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { parseProtectionContext } from "@/lib/design-production";
import { buildFuseImagesPrompt } from "@/lib/prompt";
import { inspectImageQuality } from "@/lib/image-quality";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";
import { readBrandReferenceImages } from "@/lib/brand-reference-images";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;

  try {
    const formData = await request.formData();
    taskTrace = taskTraceFromFormData(formData, "fuse_images", "/api/fuse-images");
    await recordTaskRunStarted(taskTrace);
    const promptText = String(formData.get("prompt") ?? "");
    const [first, second] = await Promise.all([
      readImageInput(formData, "imageA", "sourceUrlA", "subject-source.png"),
      readImageInput(formData, "imageB", "sourceUrlB", "scene-source.png"),
    ]);

    if (!first || !second) {
      await recordTaskRunFailed(taskTrace, "请先连接图1主体来源和图2场景来源。");
      return NextResponse.json({ error: "请先连接图1主体来源和图2场景来源。" }, { status: 400 });
    }

    const aspectRatio = String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue;
    const customWidth = Number(formData.get("customWidth") || 0) || undefined;
    const customHeight = Number(formData.get("customHeight") || 0) || undefined;
    const quality = String(formData.get("quality") ?? "standard") as QualityValue;
    const keepOriginalRatio = String(formData.get("keepOriginalRatio") ?? "") === "true";
    const imageModel = resolveImageModel(formData.get("imageModel"), formData.get("model"));
    const protectionContext = parseProtectionContext(formData.get("protectionContext"));
    const brandReferenceImages = await readBrandReferenceImages(formData);
    const originalRatio = await getImageRatio(second.buffer);
    const ratio = keepOriginalRatio ? originalRatio : resolveRatio(aspectRatio, customWidth, customHeight);
    const outputRatioLabel = keepOriginalRatio
      ? ratioLabel(aspectRatio, customWidth, customHeight, originalRatio)
      : ratioLabel(aspectRatio, customWidth, customHeight);
    const outputSize = getTargetPixels(ratio, quality);
    const generatedAt = new Date().toISOString();
    const preparedSceneCanvas = !keepOriginalRatio && ratioMismatch(originalRatio, ratio)
      ? await prepareFusionTargetCanvas(second.buffer, outputSize)
      : null;

    const targetCount = wantsMultipleImageOutputs(promptText) ? 2 : 1;
    const promptVariants = (["natural", "advertising"] as const).slice(0, targetCount).map((compositeVariant) => buildFuseImagesPrompt({
      task: "fuse",
      userPrompt: promptText,
      aspectRatioLabel: outputRatioLabel,
      targetSize: `${outputSize.width}×${outputSize.height}`,
      quality,
      keepOriginalRatio,
      fusionMode: promptText,
      compositeVariant,
      protectionContext,
    }));
    const responsePrompt = promptVariants.join("\n\n---\n\n");

    const openai = getOpenAI();
    const brandFilesPromise = Promise.all(brandReferenceImages.map((item, index) => (
      toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })
    )));
    const createFuseRequestWithSize = async (requestPrompt: string, requestSize: string) => {
      const imageA = await toFile(first.buffer, first.fileName, { type: first.mimeType });
      const imageB = await toFile(preparedSceneCanvas || second.buffer, preparedSceneCanvas ? "target-ratio-scene.png" : second.fileName, { type: preparedSceneCanvas ? "image/png" : second.mimeType });
      const brandFiles = await brandFilesPromise;
      const result = await runQueuedImageModelRequestWithRetry(
        { label: `AI合成/${imageModel}` },
        () => openai.images.edit({
          model: imageModel,
          image: [imageA, imageB, ...brandFiles] as never,
          ...(supportsConfigurableImageInputFidelity(imageModel) ? { input_fidelity: "high" as const } : {}),
          output_format: "png" as const,
          background: "opaque" as const,
          prompt: requestPrompt,
          size: requestSize as "1024x1024",
          quality: quality === "standard" ? "medium" : "high",
          n: 1,
        }, imageRequestOptions()),
      );
      return {
        prompt: requestPrompt,
        items: result.data ?? [],
      };
    };
    const createFuseRequest = async (requestPrompt: string) => {
      const requestedSize = keepOriginalRatio || preparedSceneCanvas ? "auto" : getOpenAIRequestedSize(ratio, quality, imageModel);
      try {
        return await createFuseRequestWithSize(requestPrompt, requestedSize);
      } catch (error) {
        if (requestedSize === "auto" || !shouldRetryFuseSizeWithNativeFallback(error)) throw error;
        return createFuseRequestWithSize(
          buildFuseModelNativeSizeFallbackPrompt(requestPrompt, outputRatioLabel, outputSize),
          getOpenAIImageSize(ratio),
        );
      }
    };
    const requests = promptVariants.map(createFuseRequest);
    const settledResults = await Promise.allSettled(requests);
    const resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }> = settledResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items.map((item) => ({ ...item, prompt: result.value.prompt })) : [],
    );

    if (!resultItems.length) {
      const failed = settledResults.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return NextResponse.json({ error: "AI合成没有返回可用方案。" }, { status: 500 });
    }

    const processedSettled = await Promise.allSettled(
      resultItems.slice(0, targetCount).map(async (item, index) => {
        const imagePrompt = item.prompt || promptVariants[index] || responsePrompt;
        const processContext = {
          ratio,
          quality,
          outputSize,
          outputRatioLabel,
          protectionContext,
        };
        let lastRatioMismatchItem: { b64_json?: string | null; url?: string | null; prompt: string } | null = item;
        let final = await processFuseResult(item, imagePrompt, processContext).catch((error) => {
          if (isNativeAspectRatioMismatchError(error)) return null;
          throw error;
        });
        if (!final || shouldRetryFuseQuality(final.qualityCheck)) {
          for (let attempt = 1; attempt <= 2 && (!final || shouldRetryFuseQuality(final.qualityCheck)); attempt += 1) {
            const retryPrompt = final
              ? buildFuseCompositionRetryPrompt(imagePrompt, outputRatioLabel, outputSize)
              : buildFuseNativeRatioRetryPrompt(imagePrompt, outputRatioLabel, outputSize);
            const retryResponse = await createFuseRequest(retryPrompt).catch(() => null);
            const retryItem = retryResponse?.items?.[0]
              ? { ...retryResponse.items[0], prompt: retryPrompt }
              : null;
            if (retryItem) {
              lastRatioMismatchItem = retryItem;
              const retry = await processFuseResult(retryItem, retryPrompt, processContext).catch(() => null);
              if (retry && (!final || !shouldRetryFuseQuality(retry.qualityCheck) || fuseRiskValue(retry.qualityCheck) < fuseRiskValue(final.qualityCheck))) {
                final = retry;
              }
            }
          }
        }
        if (!final && lastRatioMismatchItem) {
          final = await processFuseResult(lastRatioMismatchItem, lastRatioMismatchItem.prompt || imagePrompt, processContext, {
            allowSafeRatioFallback: true,
          });
        }
        if (!final) {
          throw new Error(`AI合成连续返回非 ${outputRatioLabel} 原生比例图片，已阻止裁切兜底。请重新运行。`);
        }
        const saved = await saveImageBuffer(final.processed, "png", {
          ratioLabel: outputRatioLabel,
          quality,
          projectId: protectionContext.version?.projectId || taskTrace?.projectId,
          storageKind: "results",
        });
        const qualityCheck = await inspectImageQuality(saved.path, {
          quality,
          ratio,
          expectedSize: outputSize,
          fileSizeBytes: saved.fileSizeBytes,
          aspectRatio: outputRatioLabel,
          protectionContext,
          operation: "fuse_images",
          safeMarginPercent: 16,
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
          mode: "AI合成",
          model: imageModel,
          aspectRatio: outputRatioLabel,
          quality,
          generatedAt,
          outputSize,
          expectedOutputSize: outputSize,
          qualityCheck,
          fileSizeBytes: saved.fileSizeBytes,
          savedPath: saved.path,
          durationMs: Date.now() - startedAt,
          projectId: protectionContext.version?.projectId || taskTrace?.projectId,
          protectionContext,
          version: protectionContext.version,
          nodeOperation: "fuse_images",
          sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
          sourceRequestId: taskTrace?.requestId,
          sourceNodeId: taskTrace?.nodeId,
          sourceNodeName: taskTrace?.nodeName,
          sourceNodeKind: taskTrace?.nodeKind,
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );
    const images = processedSettled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    if (!images.length) {
      const failed = processedSettled.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return NextResponse.json({ error: "AI合成后处理没有得到可用方案。" }, { status: 500 });
    }

    await recordTaskRunFinished(taskTrace, { outputs: images, model: imageModel, message: `AI合成完成，生成 ${images.length} 张。` });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, images), images, prompt: responsePrompt, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "AI合成失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }

  });
}

function wantsMultipleImageOutputs(text: string) {
  return /(?:两张|2张|两个|2个|双方案|多方案|多版|方案一|方案二|A\/B|AB|variants?)/i.test(text);
}

type FuseResultProcessContext = {
  ratio: { width: number; height: number };
  quality: QualityValue;
  outputSize: { width: number; height: number };
  outputRatioLabel: string;
  protectionContext: ReturnType<typeof parseProtectionContext>;
};

async function processFuseResult(
  item: { b64_json?: string | null; url?: string | null },
  prompt: string,
  context: FuseResultProcessContext,
  options: { allowSafeRatioFallback?: boolean } = {},
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const processed = await processToTarget(raw, context.ratio, context.quality, "png", "strict_full_bleed").catch((error) => {
    if (!options.allowSafeRatioFallback || !isNativeAspectRatioMismatchError(error)) throw error;
    throw new Error(`模型返回比例不符合 ${context.outputRatioLabel}，系统已阻止裁切、拉伸、留白和磨砂补边兜底。`);
  });
  const qualityCheck = await inspectImageQuality(processed, {
    quality: context.quality,
    ratio: context.ratio,
    expectedSize: context.outputSize,
    aspectRatio: context.outputRatioLabel,
    protectionContext: context.protectionContext,
    operation: "fuse_images",
    safeMarginPercent: 16,
  });
  return { processed, prompt, qualityCheck };
}

function buildFuseNativeRatioRetryPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  return [
    "Regenerate the composite with corrected native canvas.",
    `Core request:\n${core}`,
    `Target: ${ratioText}, ${target.width}x${target.height}.`,
    "The subject from image 1 must be complete inside image 2 scene; subject/logo/title/QR/product edges cannot touch edges or be cropped.",
    "Avoid another ratio, centered smaller image, blur/frosted padding, cropped subject.",
  ].join("\n");
}

function buildFuseCompositionRetryPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  return [
    "Regenerate the composite after composition QA failed.",
    `Core request:\n${core}`,
    `Target: ${ratioText}, ${target.width}x${target.height}.`,
    "Full composition, complete subject visible, no cropping, zoom out, larger safe margins.",
    "Place subject/hair/hands/feet/product/logo/QR/title/footer inside safe area; edges should be scene background and lighting only.",
    "Keep lighting, contact shadow, perspective, color temperature, and edge softness matched.",
  ].join("\n");
}

function buildFuseModelNativeSizeFallbackPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  const core = compactRetryPrompt(prompt);
  return [
    "Generate the same composite with extra safe margins for system size adaptation.",
    `Core request:\n${core}`,
    `Final system output will be ${ratioText}, ${target.width}x${target.height}.`,
    "Place subject/title/logo/product/QR safely away from edges and leave more natural scene background around them.",
    "Avoid edge-touching important content, oversized subject, borders, blur/frosted padding, centered smaller image.",
  ].join("\n");
}

function compactRetryPrompt(prompt: string, maxLength = 1600) {
  const cleaned = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(- )?(Avoid:|禁止|自动|模型尺寸兜底|Regenerate)/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= maxLength) return cleaned || prompt.slice(0, maxLength);
  return `${cleaned.slice(0, maxLength).trim()}...`;
}

function shouldRetryFuseSizeWithNativeFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid.*size|unsupported.*size|size.*unsupported|size.*invalid|invalid_image_size|unsupported_image_size|尺寸.*不支持|不支持.*尺寸/i.test(message);
}

function ratioMismatch(a: { width: number; height: number }, b: { width: number; height: number }) {
  const first = a.width / Math.max(1, a.height);
  const second = b.width / Math.max(1, b.height);
  return Math.abs(first - second) / Math.max(0.0001, second) > 0.012;
}

async function prepareFusionTargetCanvas(input: Buffer, target: { width: number; height: number }) {
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
  return sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite([{
      input: resized,
      left: Math.max(0, Math.round((target.width - imageWidth) / 2)),
      top: Math.max(0, Math.round((target.height - imageHeight) / 2)),
    }])
    .png({ compressionLevel: 6, palette: false })
    .toBuffer();
}

function shouldRetryFuseQuality(qualityCheck: Awaited<ReturnType<typeof inspectImageQuality>>) {
  const maxEdgeRatio = Math.max(
    qualityCheck.edgeContentRatio || 0,
    ...Object.values(qualityCheck.edgeContentRatios || {}).map((value) => Number(value) || 0),
  );
  return Boolean(
    qualityCheck.compositionRisk ||
      qualityCheck.hasWhiteBorder ||
      qualityCheck.ratioMatched === false ||
      qualityCheck.suspectedBlurredPadding ||
      maxEdgeRatio > 0.32,
  );
}

function fuseRiskValue(qualityCheck: Awaited<ReturnType<typeof inspectImageQuality>>) {
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

async function readImageInput(formData: FormData, fileKey: string, urlKey: string, fallbackName: string) {
  const image = formData.get(fileKey);
  const sourceUrl = String(formData.get(urlKey) ?? "");

  if (image instanceof File) {
    assertSupportedImage(image);
    return {
      buffer: Buffer.from(await image.arrayBuffer()),
      fileName: image.name || fallbackName,
      mimeType: image.type || "image/png",
    };
  }

  if (sourceUrl) {
    return {
      buffer: await readPublicImageUrl(sourceUrl),
      fileName: fallbackName,
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
  if (!response.ok) throw new Error("下载合成图片失败。");
  return Buffer.from(await response.arrayBuffer());
}
