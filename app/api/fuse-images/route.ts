import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import type { AspectRatioValue, QualityValue } from "@/lib/design-options";
import {
  getOpenAIRequestedSize,
  getTargetPixels,
  parseDataUrl,
  processToTarget,
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
import { buildFuseImagesPrompt } from "@/lib/prompt";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const promptText = String(formData.get("prompt") ?? "");
    const first = await readImageInput(formData, "imageA", "sourceUrlA", "subject-source.png");
    const second = await readImageInput(formData, "imageB", "sourceUrlB", "scene-source.png");

    if (!first || !second) {
      return NextResponse.json({ error: "请先连接图1主体来源和图2场景来源。" }, { status: 400 });
    }

    const aspectRatio = String(formData.get("aspectRatio") ?? "1:1") as AspectRatioValue;
    const customWidth = Number(formData.get("customWidth") || 0) || undefined;
    const customHeight = Number(formData.get("customHeight") || 0) || undefined;
    const quality = String(formData.get("quality") ?? "standard") as QualityValue;
    const keepOriginalRatio = String(formData.get("keepOriginalRatio") ?? "") === "true";
    const model = String(formData.get("model") ?? "").trim() || getImageModel();
    const protectionContext = parseProtectionContext(formData.get("protectionContext"));
    const brandReferenceImages = await readBrandReferenceImages(formData);
    const originalRatio = await getImageRatio(second.buffer);
    const ratio = keepOriginalRatio ? originalRatio : resolveRatio(aspectRatio, customWidth, customHeight);
    const outputRatioLabel = keepOriginalRatio
      ? ratioLabel(aspectRatio, customWidth, customHeight, originalRatio)
      : ratioLabel(aspectRatio, customWidth, customHeight);
    const outputSize = getTargetPixels(ratio, quality);
    const generatedAt = new Date().toISOString();

    const promptVariants = (["natural", "advertising"] as const).map((compositeVariant) => buildFuseImagesPrompt({
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
    const createFuseRequest = async (requestPrompt: string) => {
      const imageA = await toFile(first.buffer, first.fileName, { type: first.mimeType });
      const imageB = await toFile(second.buffer, second.fileName, { type: second.mimeType });
      const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
      const result = await openai.images.edit({
        model,
        image: [imageA, imageB, ...brandFiles] as never,
        input_fidelity: "high" as const,
        output_format: "png" as const,
        background: "opaque" as const,
        prompt: requestPrompt,
        size: (keepOriginalRatio ? "auto" : getOpenAIRequestedSize(ratio, quality, model)) as "1024x1024",
        quality: quality === "standard" ? "medium" : "high",
        n: 1,
      });
      return {
        prompt: requestPrompt,
        items: result.data ?? [],
      };
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

    const images = await Promise.all(
      resultItems.slice(0, 2).map(async (item, index) => {
        const imagePrompt = item.prompt || promptVariants[index] || responsePrompt;
        let final = await processFuseResult(item, imagePrompt, {
          ratio,
          quality,
          outputSize,
          outputRatioLabel,
          protectionContext,
        });
        if (shouldRetryFuseQuality(final.qualityCheck)) {
          const retryPrompt = buildFuseCompositionRetryPrompt(imagePrompt, outputRatioLabel, outputSize);
          const retryResponse = await createFuseRequest(retryPrompt).catch(() => null);
          const retryItem = retryResponse?.items?.[0]
            ? { ...retryResponse.items[0], prompt: retryPrompt }
            : null;
          if (retryItem) {
            const retry = await processFuseResult(retryItem, retryPrompt, {
              ratio,
              quality,
              outputSize,
              outputRatioLabel,
              protectionContext,
            }).catch(() => null);
            if (retry && (!shouldRetryFuseQuality(retry.qualityCheck) || fuseRiskValue(retry.qualityCheck) < fuseRiskValue(final.qualityCheck))) {
              final = retry;
            }
          }
        }
        const saved = await saveImageBuffer(final.processed, "png", {
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
          model,
          aspectRatio: outputRatioLabel,
          quality,
          generatedAt,
          outputSize,
          expectedOutputSize: outputSize,
          qualityCheck,
          fileSizeBytes: savedStat.size,
          savedPath: saved.path,
          durationMs: Date.now() - startedAt,
          projectId: protectionContext.version?.projectId,
          protectionContext,
          version: protectionContext.version,
          nodeOperation: "fuse_images",
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );

    return NextResponse.json({ images, prompt: responsePrompt, model });
  } catch (error) {
    const apiError = toApiError(error, "AI合成失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
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
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const processed = await processToTarget(raw, context.ratio, context.quality, "png", "safe_no_crop");
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

function buildFuseCompositionRetryPrompt(prompt: string, ratioText: string, target: { width: number; height: number }) {
  return [
    prompt,
    "",
    "自动构图复查：上一版 AI 合成疑似主体、Logo、标题或边缘信息贴边/被裁。",
    `目标画幅：${ratioText}，目标尺寸 ${target.width}×${target.height}。`,
    "重新合成：full composition, complete subject visible, no cropping, zoom out, larger safe margins.",
    "主体、头发/手脚、产品包装、Logo、二维码、标题和底部信息放入中心 76% 安全区；四周 16%-18% 只放背景和光影。",
    "保持光影、接触阴影、透视和色温匹配。",
  ].join("\n");
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

async function readBrandReferenceImages(formData: FormData) {
  const refs: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];
  for (let index = 1; index <= 3; index += 1) {
    const item = await readImageInput(formData, `brandAsset_${index}`, `brandAssetUrl_${index}`, `brand-asset-${index}.png`);
    if (item) refs.push(item);
  }
  return refs;
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
