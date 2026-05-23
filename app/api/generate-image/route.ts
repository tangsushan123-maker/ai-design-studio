import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import { buildDesignPrompt } from "@/lib/prompt";
import {
  assertExactPixelSize,
  getOpenAIRequestedSize,
  getTargetPixels,
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
import { getImageModel } from "@/lib/model-config";
import type { DesignRequest, TextReferenceImage } from "@/lib/design-options";
import { normalizeProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { stat } from "node:fs/promises";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    const multipart = contentType.includes("multipart/form-data");
    const formData = multipart ? await request.formData() : null;
    const rawBody = multipart ? designRequestFromFormData(formData as FormData) : ((await request.json()) as DesignRequest);
    const body = normalizeTextToImageRequest(rawBody);
    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "请输入文字需求。" }, { status: 400 });
    }

    const ratio = resolveRatio(body.aspectRatio, body.customWidth, body.customHeight);
    const exactSize = Boolean(body.exactSize && body.customWidth && body.customHeight);
    const protectionContext = normalizeProtectionContext(body.protectionContext);
    const prompt = buildDesignPrompt({ ...body, protectionContext });
    const openai = getOpenAI();
    const model = body.model?.trim() || getImageModel();
    const size = getOpenAIRequestedSize(ratio, body.quality, model);
    const outputSize = exactSize && body.customWidth && body.customHeight
      ? { width: body.customWidth, height: body.customHeight }
      : getTargetPixels(ratio, body.quality);
    const outputRatioLabel = ratioLabel(body.aspectRatio, body.customWidth, body.customHeight);
    const generatedAt = new Date().toISOString();
    const referenceImages = formData ? await readReferenceImages(formData) : [];
    const referenceFiles = await Promise.all(referenceImages.map((item, index) => toFile(item.buffer, item.fileName || `text-reference-${index + 1}.png`, { type: item.mimeType })));

    const targetCount = 2;
    const prompts = Array.from({ length: targetCount }, (_, index) =>
      buildDesignPrompt({
        ...body,
        protectionContext,
        variantDirection: index === 0 ? "stable" : "creative",
      }),
    );
    const createImageRequest = (requestPrompt: string) =>
      referenceFiles.length
        ? openai.images.edit({
            model,
            image: referenceFiles as never,
            prompt: requestPrompt,
            input_fidelity: "high" as const,
            size: size as "1024x1024",
            quality: body.quality === "standard" ? "medium" : "high",
            n: 1,
          })
        : openai.images.generate({
            model,
            prompt: requestPrompt,
            size: size as "1024x1024",
            quality: body.quality === "standard" ? "medium" : "high",
            n: 1,
          });
    const requests = prompts.map(createImageRequest);
    const settledResults = await Promise.allSettled(requests);
    const resultItems: Array<{ b64_json?: string | null; url?: string | null; prompt: string }> = settledResults.flatMap((result, index) =>
      result.status === "fulfilled" ? (result.value.data ?? []).map((item) => ({ ...item, prompt: prompts[index] || prompt })) : [],
    );

    if (!resultItems.length) {
      const failed = settledResults.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return NextResponse.json({ error: "图片接口没有返回可用方案。" }, { status: 500 });
    }

    const images = await Promise.all(
      resultItems.slice(0, targetCount).map(async (item, index) => {
        const imagePrompt = item.prompt || prompt;
        const first = await processTextToImageResult(item, imagePrompt, {
          body,
          exactSize,
          outputSize,
          ratio,
          outputRatioLabel,
          protectionContext,
        });
        let final = first;
        if (shouldRetryTextToImageQuality(first.qualityCheck)) {
          for (let attempt = 1; attempt <= 2 && shouldRetryTextToImageQuality(final.qualityCheck); attempt += 1) {
            const retryPrompt = buildCompositionRetryPrompt(imagePrompt, attempt);
            const retryResponse = await createImageRequest(retryPrompt).catch(() => null);
            const retryItem = retryResponse?.data?.[0]
              ? { ...retryResponse.data[0], prompt: retryPrompt }
              : null;
            if (retryItem) {
              const retry = await processTextToImageResult(retryItem, retryPrompt, {
                body,
                exactSize,
                outputSize,
                ratio,
                outputRatioLabel,
                protectionContext,
              }).catch(() => null);
              if (retry && (!shouldRetryTextToImageQuality(retry.qualityCheck) || textToImageRiskValue(retry.qualityCheck) < textToImageRiskValue(final.qualityCheck))) {
                final = retry;
              }
            }
          }
        }

        const saved = await saveImageBuffer(final.processed, "png", {
          ratioLabel: outputRatioLabel,
          quality: body.quality,
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
          model,
          aspectRatio: outputRatioLabel,
          quality: body.quality,
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
          nodeOperation: "text_to_image",
        };
        await saveImageMetadata(saved.fileName, image);
        return image;
      }),
    );

    return NextResponse.json({ images, prompt: prompts.join("\n\n---\n\n"), size, model });
  } catch (error) {
    const apiError = toApiError(error, "生成失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
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

async function processTextToImageResult(
  item: { b64_json?: string | null; url?: string | null },
  prompt: string,
  context: TextToImageProcessContext,
) {
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const textToImageFitMode = "safe_no_crop";
  const processed = context.exactSize && context.body.customWidth && context.body.customHeight
    ? await processToExactSize(raw, { width: context.body.customWidth, height: context.body.customHeight }, "png", textToImageFitMode)
    : await processToTarget(raw, context.ratio, context.body.quality, "png", textToImageFitMode);
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
  return { actual, processed, prompt, qualityCheck: tightenTextToImageCompositionRisk(qualityCheck, context) };
}

function buildCompositionRetryPrompt(prompt: string, attempt = 1) {
  return [
    prompt,
    "",
    `自动审稿失败 ${attempt}：上一版疑似裁切、贴边、比例异常、白边或模糊补边。`,
    "重生要求：zoom out；主体和标题缩小 10%-20%；重要元素进入中心 76% 安全区；四周 18% 只放背景/出血装饰；Logo 只做 6%-12% 品牌识别；卖点最多 3-5 个。",
    "禁止：裁切主体/文字、底部信息压边、白边、黑边、透明边、模糊/磨砂/玻璃补边、居中缩小图。",
    attempt >= 2 ? "第二次重试：主体和标题再缩小 25%，边缘只保留背景。" : "",
  ].join("\n");
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
