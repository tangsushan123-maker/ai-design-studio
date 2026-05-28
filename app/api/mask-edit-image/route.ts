import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import { toApiError } from "@/lib/api-errors";
import type { QualityValue } from "@/lib/design-options";
import {
  assertExactPixelSize,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  ratioLabel,
  saveImageBuffer,
  saveImageMetadata,
} from "@/lib/image-utils";
import { resolveImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import { assertSupportedImage } from "@/lib/request-guards";
import { parseProtectionContext, type ProtectionContext } from "@/lib/design-production";
import { inspectImageQuality } from "@/lib/image-quality";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
import sharp from "sharp";
import { withCurrentConfigUser } from "@/lib/request-config-user";
import { readBrandReferenceImages } from "@/lib/brand-reference-images";

export const runtime = "nodejs";

type MaskTaskMode = "cleanup" | "replace" | "style_blend" | "text_remove" | "text_replace" | "text_repair" | "enhance";
type MaskRegionType = "auto" | "background" | "text" | "face" | "product" | "logo" | "qrcode" | "decoration" | "unknown";
type MaskProtectionStrength = "strict" | "standard" | "creative";
type MaskEdgeBlend = "weak" | "standard" | "strong";

type PreparedMask = {
  binaryAlpha: Buffer;
  blendAlpha: Buffer;
  editMaskPng: Buffer;
  components: MaskComponent[];
  coverage: number;
  clientCoverage: number;
  coverageDrift: number;
  editablePixels: number;
  rawPixels: number;
  cleanedPixels: number;
  solidPixels: number;
  candidateName: string;
  expandRadius: number;
  featherRadius: number;
  bbox: MaskBoundingBox | null;
};

type MaskEditQualityReport = {
  status: "passed" | "warning" | "failed";
  label: string;
  message: string;
  outsideDiffMean: number;
  outsideChangedPixelRatio: number;
  insideDiffMean: number;
  insideChangedPixelRatio: number;
  boundaryDiffMean: number;
  maskCoverage: number;
  maskComponentCount: number;
  unchangedComponentCount: number;
  componentReports: MaskComponentReport[];
  issues: string[];
  suggestions: string[];
};

type MaskComponent = MaskBoundingBox & {
  index: number;
  pixelCount: number;
  pixels: number[];
};

type MaskComponentReport = {
  index: number;
  bbox: MaskBoundingBox;
  pixelCount: number;
  diffMean: number;
  changedPixelRatio: number;
  originalDetailMean: number;
  finalDetailMean: number;
  detailRetention: number;
  status: "changed" | "weak" | "residue_risk";
};

type MaskBoundingBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;

  try {
    const formData = await request.formData();
    taskTrace = taskTraceFromFormData(formData, "mask_edit", "/api/mask-edit-image");
    await recordTaskRunStarted(taskTrace);
    const promptText = String(formData.get("prompt") ?? "");
    const sourceUrl = String(formData.get("sourceUrl") ?? "");
    const uploadedImage = formData.get("image");
    const mask = formData.get("mask");
    const maskUrl = String(formData.get("maskUrl") ?? "");
    const quality = String(formData.get("quality") ?? "standard") as QualityValue;
    const imageModel = resolveImageModel(formData.get("imageModel"), formData.get("model"));
    const customWidth = Number(formData.get("customWidth") || 0) || undefined;
    const customHeight = Number(formData.get("customHeight") || 0) || undefined;
    const preserveOutsideMask = String(formData.get("preserveOutsideMask") ?? "true") !== "false";
    const taskMode = parseMaskTaskMode(formData.get("taskMode"));
    const regionType = parseMaskRegionType(formData.get("regionType"));
    const protectionStrength = parseMaskProtectionStrength(formData.get("protectionStrength"));
    const edgeBlend = parseMaskEdgeBlend(formData.get("edgeBlend"));
    const clientMaskPixelCount = Math.max(0, Number(formData.get("maskPixelCount") || 0) || 0);
    const clientMaskCoverage = clamp(Number(formData.get("maskCoverage") || 0) || 0, 0, 1);
    const protectionContext = parseProtectionContext(formData.get("protectionContext"));
    const brandReferenceImages = await readBrandReferenceImages(formData);

    if (requiresSpecificInstruction(taskMode) && !promptText.trim()) {
      await recordTaskRunFailed(taskTrace, taskMode === "replace" ? "请写清楚要替换成什么；具体产品建议先上传参考图。" : "请写清楚要替换/修复的新文字内容。");
      return NextResponse.json({ error: taskMode === "replace" ? "请写清楚要替换成什么；具体产品建议先上传参考图。" : "请写清楚要替换/修复的新文字内容。" }, { status: 400 });
    }

    if (!(mask instanceof File) && !maskUrl) {
      await recordTaskRunFailed(taskTrace, "请先涂抹要修改的区域。");
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
      await recordTaskRunFailed(taskTrace, "请选择要局部修改的图片。");
      return NextResponse.json({ error: "请选择要局部修改的图片。" }, { status: 400 });
    }

    const originalMeta = await readImageMetadata(imageBuffer);
    const maskBuffer = mask instanceof File ? Buffer.from(await mask.arrayBuffer()) : await readPublicImageUrl(maskUrl);
    const maskMeta = await readImageMetadata(maskBuffer);
    if (maskMeta.width !== originalMeta.width || maskMeta.height !== originalMeta.height) {
      await recordTaskRunFailed(taskTrace, "蒙版尺寸必须和原图一致，请重新涂抹后再试。");
      return NextResponse.json({ error: "蒙版尺寸必须和原图一致，请重新涂抹后再试。" }, { status: 400 });
    }

    const outputSize = customWidth && customHeight ? { width: customWidth, height: customHeight } : { width: originalMeta.width, height: originalMeta.height };
    const outputRatioLabel = ratioLabel("custom", outputSize.width, outputSize.height, outputSize);
    const preparedMask = await prepareControlledMask(maskBuffer, outputSize, {
      protectionStrength,
      edgeBlend,
      taskMode,
      regionType,
      clientMaskCoverage,
      clientMaskPixelCount,
    });
    if (!preparedMask.editablePixels) {
      const emptyMaskMessage = "当前保存的涂抹蒙版为空，请重新打开“局部 AI 修改”并重新涂抹后生成。";
      await recordTaskRunFailed(taskTrace, emptyMaskMessage);
      return NextResponse.json({ error: emptyMaskMessage }, { status: 400 });
    }
    const maskWarning = validateMaskCoverage(preparedMask, taskMode, regionType);
    if (maskWarning) {
      await recordTaskRunFailed(taskTrace, maskWarning);
      return NextResponse.json({ error: maskWarning }, { status: 400 });
    }
    const generatedAt = new Date().toISOString();
    const basePrompt = buildControlledMaskEditPrompt({
      userPrompt: promptText,
      taskMode,
      regionType,
      protectionStrength,
      edgeBlend,
      outputSize,
      protectionContext,
      maskComponents: preparedMask.components,
    });

    const openai = getOpenAI();
    const imageFile = await toFile(imageBuffer, fileName, { type: mimeType });
    const brandFiles = await Promise.all(brandReferenceImages.map((item, index) => toFile(item.buffer, item.fileName || `brand-asset-${index + 1}.png`, { type: item.mimeType })));
    const runAttempt = async (attemptMask: PreparedMask, attemptPrompt: string, attemptProtectionStrength: MaskProtectionStrength) => {
      const maskFile = await toFile(attemptMask.editMaskPng, "controlled-mask.png", { type: "image/png" });
      const result = await runQueuedImageModelRequestWithRetry(
        { label: `局部 AI 修改/${imageModel}` },
        () => openai.images.edit({
          model: imageModel,
          image: brandFiles.length ? ([imageFile, ...brandFiles] as never) : imageFile,
          mask: maskFile,
          prompt: attemptPrompt,
          size: "auto",
          output_format: "png",
          background: "opaque",
          quality: quality === "standard" ? "medium" : "high",
          n: 1,
        }, imageRequestOptions()),
      );

      const item = result.data?.[0];
      if (!item) {
        throw new Error("局部修改没有返回结果。");
      }

      const raw = await imageResultToBuffer(item.b64_json, item.url);
      const processed = await processToExactSize(raw, outputSize, "png", "safe_full_bleed");
      const protectedComposite = preserveOutsideMask
        ? await composeControlledMaskedEdit(imageBuffer, processed, attemptMask, outputSize)
        : processed;
      const composited = shouldApplyDeterministicText(taskMode, promptText)
        ? await applyDeterministicTextOverlay(protectedComposite, imageBuffer, attemptMask, outputSize, {
            text: extractDeterministicText(promptText),
            mode: taskMode,
          })
        : protectedComposite;
      const qualityReport = await inspectMaskEditQuality(imageBuffer, composited, attemptMask, outputSize, {
        taskMode,
        regionType,
        protectionStrength: attemptProtectionStrength,
        preserveOutsideMask,
        userPrompt: promptText,
      });
      return { composited, qualityReport };
    };

    let activeMask = preparedMask;
    let activePrompt = basePrompt;
    let activeProtectionStrength = protectionStrength;
    let activeEdgeBlend = edgeBlend;
    let attempt = await runAttempt(activeMask, activePrompt, activeProtectionStrength);
    if (shouldRetryMaskEditAttempt(attempt.qualityReport, taskMode, promptText)) {
      activeProtectionStrength = retryMaskProtectionStrength(taskMode, protectionStrength);
      activeEdgeBlend = retryMaskEdgeBlend(edgeBlend);
      activeMask = await prepareControlledMask(maskBuffer, outputSize, {
        protectionStrength: activeProtectionStrength,
        edgeBlend: activeEdgeBlend,
        taskMode,
        regionType,
        clientMaskCoverage,
        clientMaskPixelCount,
      });
      activePrompt = buildControlledMaskEditPrompt({
        userPrompt: promptText,
        taskMode,
        regionType,
        protectionStrength: activeProtectionStrength,
        edgeBlend: activeEdgeBlend,
        outputSize,
        protectionContext,
        maskComponents: activeMask.components,
        retryLevel: 1,
      });
      attempt = await runAttempt(activeMask, activePrompt, activeProtectionStrength);
    }
    let localCleanupFallbackApplied = false;
    if (shouldUseLocalCleanupFallback(attempt.qualityReport, taskMode, promptText)) {
      const fallbackComposite = await buildLocalCleanupFallback(imageBuffer, activeMask, outputSize);
      const fallbackReport = await inspectMaskEditQuality(imageBuffer, fallbackComposite, activeMask, outputSize, {
        taskMode,
        regionType,
        protectionStrength: activeProtectionStrength,
        preserveOutsideMask,
        userPrompt: promptText,
      });
      if (shouldApplyLocalCleanupFallback(fallbackReport, attempt.qualityReport, taskMode)) {
        localCleanupFallbackApplied = true;
        attempt = {
          composited: fallbackComposite,
          qualityReport: {
            ...fallbackReport,
            suggestions: [...fallbackReport.suggestions, "AI 局部生成变化不足，已切换本地清理兜底。"],
          },
        };
      }
    }

    const composited = attempt.composited;
    let maskQuality = attempt.qualityReport;
    const componentInteriorChangeIsWeak =
      maskQuality.status === "failed" &&
      !maskQuality.issues.some((issue) => issue.includes("mask 外")) &&
      maskQuality.issues.some((issue) => /^第 .+ 个涂抹区域几乎没有变化。$/.test(issue));
    const onlyInteriorChangeIsWeak =
      maskQuality.status === "failed" &&
      !maskQuality.issues.some((issue) => issue.includes("mask 外")) &&
      maskQuality.issues.some((issue) => issue === "mask 内区域几乎没有变化。") &&
      (taskMode === "cleanup" || taskMode === "text_remove");
    if (localCleanupFallbackApplied && maskQuality.status === "failed") {
      maskQuality = {
        ...maskQuality,
        status: "warning",
        label: "已返回本地清理兜底",
        message: "AI 局部生成变化较弱，已保存本地清理兜底结果；如仍有残留，请扩大涂抹范围后再运行。",
        suggestions: [
          ...maskQuality.suggestions,
          "AI 局部生成变化不足时已切换到本地清理兜底。",
        ],
      };
    } else if (componentInteriorChangeIsWeak) {
      maskQuality = {
        ...maskQuality,
        message: "部分涂抹区域没有生效。系统已按每个涂抹块检查到残留，请扩大未清理区域的涂抹范围后重试。",
        suggestions: [
          ...maskQuality.suggestions,
          "这类漏处理结果不会再作为完整成功结果保存。",
        ],
      };
    } else if (onlyInteriorChangeIsWeak) {
      maskQuality = {
        ...maskQuality,
        message: "AI 返回结果与原图几乎一致，局部去除没有生效。请把文字、阴影和描边完整涂满后重试。",
        suggestions: [
          ...maskQuality.suggestions,
          "这类无变化结果不会再作为成功结果保存。",
        ],
      };
    }
    const actual = await readImageMetadata(composited);
    assertExactPixelSize({ width: actual.width, height: actual.height }, outputSize);
    if (preserveOutsideMask && maskQuality.status === "failed") {
      await recordTaskRunFailed(taskTrace, maskQuality.message);
      return NextResponse.json({
        error: maskQuality.message,
        qualityReport: maskQuality,
      }, { status: 422 });
    }
    const saved = await saveImageBuffer(composited, "png", {
      ratioLabel: outputRatioLabel,
      quality,
      projectId: protectionContext.version?.projectId || taskTrace?.projectId,
      storageKind: "results",
    });
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality,
      ratio: outputSize,
      expectedSize: outputSize,
      fileSizeBytes: saved.fileSizeBytes,
      aspectRatio: outputRatioLabel,
      protectionContext,
    });
    const image = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt: activePrompt,
      variant: 1,
      ratio: outputSize,
      mode: "局部 AI 修改",
      model: imageModel,
      aspectRatio: outputRatioLabel,
      quality,
      generatedAt,
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: saved.fileSizeBytes,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: protectionContext.version?.projectId || taskTrace?.projectId,
      protectionContext,
      version: protectionContext.version,
      nodeOperation: "mask_edit",
      sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
      sourceRequestId: taskTrace?.requestId,
      sourceNodeId: taskTrace?.nodeId,
      sourceNodeName: taskTrace?.nodeName,
      sourceNodeKind: taskTrace?.nodeKind,
      preserveOutsideMask,
      maskFeather: activeMask.featherRadius,
      maskExpand: activeMask.expandRadius,
      maskCandidateName: activeMask.candidateName,
      maskClientCoverage: Number(activeMask.clientCoverage.toFixed(6)),
      maskPreparedCoverage: Number(activeMask.coverage.toFixed(6)),
      maskCoverageDrift: Number(activeMask.coverageDrift.toFixed(3)),
      maskRawPixels: activeMask.rawPixels,
      maskCleanedPixels: activeMask.cleanedPixels,
      maskSolidPixels: activeMask.solidPixels,
      maskComponentCount: activeMask.components.length,
      maskTaskMode: taskMode,
      maskRegionType: regionType,
      protectionStrength: activeProtectionStrength,
      edgeBlend: activeEdgeBlend,
      deterministicTextApplied: shouldApplyDeterministicText(taskMode, promptText),
      localCleanupFallbackApplied,
      maskProtectionCheck: maskQuality,
    };
    await saveImageMetadata(saved.fileName, image);

    await recordTaskRunFinished(taskTrace, { outputs: [image], model: imageModel, message: "局部 AI 修改完成，服务端已保存结果。" });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, [image]), images: [image], prompt: activePrompt, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "局部修改失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }

  });
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error("下载局部修改图片失败。");
  return Buffer.from(await response.arrayBuffer());
}

function parseMaskTaskMode(value: FormDataEntryValue | null): MaskTaskMode {
  if (value === "replace" || value === "style_blend" || value === "text_remove" || value === "text_replace" || value === "text_repair" || value === "enhance") return value;
  return "cleanup";
}

function parseMaskRegionType(value: FormDataEntryValue | null): MaskRegionType {
  if (value === "background" || value === "text" || value === "face" || value === "product" || value === "logo" || value === "qrcode" || value === "decoration" || value === "unknown") return value;
  return "auto";
}

function parseMaskProtectionStrength(value: FormDataEntryValue | null): MaskProtectionStrength {
  if (value === "strict" || value === "creative") return value;
  return "standard";
}

function parseMaskEdgeBlend(value: FormDataEntryValue | null): MaskEdgeBlend {
  if (value === "weak" || value === "strong") return value;
  return "standard";
}

function requiresSpecificInstruction(mode: MaskTaskMode) {
  return mode === "replace" || mode === "text_replace" || mode === "text_repair";
}

function validateMaskCoverage(mask: PreparedMask, mode: MaskTaskMode, regionType: MaskRegionType) {
  if (!mask.bbox || mask.coverage <= 0) {
    if (mask.rawPixels <= 0 || mask.candidateName === "empty") {
      return "当前保存的涂抹蒙版为空，请重新打开“局部 AI 修改”并重新涂抹后生成。";
    }
    return "涂抹区域太小，请稍微扩大涂抹范围后重新生成。";
  }
  const maxCoverage = maskMaxCoverage(mode, regionType);
  if (mask.coverage > maxCoverage) {
    return `涂抹区域接近整图，局部修改会变成全图重绘；请缩小到画面 ${(maxCoverage * 100).toFixed(0)}% 以内。`;
  }
  return "";
}

async function prepareControlledMask(
  maskBuffer: Buffer,
  target: { width: number; height: number },
  options: {
    protectionStrength: MaskProtectionStrength;
    edgeBlend: MaskEdgeBlend;
    taskMode?: MaskTaskMode;
    regionType?: MaskRegionType;
    clientMaskCoverage?: number;
    clientMaskPixelCount?: number;
  },
): Promise<PreparedMask> {
  const source = await sharp(maskBuffer)
    .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = target.width * target.height;
  const candidate = buildEditableMaskCandidate(source.data, target);
  const raw = candidate.raw;
  const editablePixels = candidate.count;

  const minSide = Math.min(target.width, target.height);
  const expandRadius = maskExpandRadius(options.protectionStrength, minSide);
  const featherRadius = maskFeatherRadius(options.edgeBlend, minSide);
  const minPixels = minimumUsableMaskPixels(target, options.taskMode || "cleanup", options.regionType || "auto");
  const rawPixels = countMaskPixels(raw, 8);
  let cleaned = await maskSharp(raw, target)
    .blur(Math.max(0.4, minSide * 0.0009))
    .threshold(18)
    .blur(Math.max(0.35, minSide * 0.0006))
    .threshold(18)
    .greyscale()
    .raw()
    .toBuffer()
    .then((buffer) => toSingleChannelMaskBuffer(buffer, target));
  const cleanedPixels = countMaskPixels(cleaned, 8);
  if (shouldUseRawMaskAfterCleanup(rawPixels, cleanedPixels, minPixels)) {
    cleaned = raw;
  }
  let binaryAlpha = await maskSharp(cleaned, target)
    .blur(expandRadius)
    .threshold(8)
    .greyscale()
    .raw()
    .toBuffer()
    .then((buffer) => toSingleChannelMaskBuffer(buffer, target));
  let solidPixels = countMaskPixels(binaryAlpha, 8);
  let bbox = maskBoundingBox(binaryAlpha, target, 8);
  if (rawPixels > 0 && solidPixels === 0) {
    binaryAlpha = raw;
    solidPixels = rawPixels;
    bbox = maskBoundingBox(binaryAlpha, target, 8);
  }
  const clientCoverage = normalizedClientMaskCoverage(options, target);
  if (shouldUseRawMaskForCoverageDrift(solidPixels / Math.max(1, pixelCount), clientCoverage)) {
    binaryAlpha = cleanedPixels > 0 ? cleaned : raw;
    solidPixels = countMaskPixels(binaryAlpha, 8);
    bbox = maskBoundingBox(binaryAlpha, target, 8);
  }
  if (solidPixels > 0 && solidPixels < minPixels) {
    binaryAlpha = await expandBinaryMaskToMinimum(binaryAlpha, target, minPixels, minSide);
    solidPixels = countMaskPixels(binaryAlpha, 8);
    bbox = maskBoundingBox(binaryAlpha, target, 8);
  }
  const blendAlpha = await maskSharp(binaryAlpha, target)
    .blur(featherRadius)
    .greyscale()
    .raw()
    .toBuffer()
    .then((buffer) => toSingleChannelMaskBuffer(buffer, target));
  const editMaskPng = await alphaToTransparentEditMask(binaryAlpha, target);
  const components = findMaskComponents(binaryAlpha, target, 8);
  const coverage = solidPixels / Math.max(1, pixelCount);
  return {
    binaryAlpha,
    blendAlpha,
    editMaskPng,
    components,
    coverage,
    clientCoverage,
    coverageDrift: clientCoverage > 0 ? coverage / clientCoverage : 1,
    editablePixels,
    rawPixels,
    cleanedPixels,
    solidPixels,
    candidateName: candidate.name,
    expandRadius,
    featherRadius,
    bbox,
  };
}

function countMaskPixels(alpha: Buffer, threshold: number) {
  let count = 0;
  for (const value of alpha) {
    if (value > threshold) count += 1;
  }
  return count;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function maskSharp(alpha: Buffer, target: { width: number; height: number }) {
  return sharp(toSingleChannelMaskBuffer(alpha, target), { raw: { width: target.width, height: target.height, channels: 1 } });
}

function toSingleChannelMaskBuffer(buffer: Buffer, target: { width: number; height: number }) {
  const expected = target.width * target.height;
  if (buffer.length === expected) return buffer;
  if (expected > 0 && buffer.length % expected === 0) {
    const channels = buffer.length / expected;
    if (channels === 3 || channels === 4) {
      const output = Buffer.alloc(expected);
      for (let pixel = 0; pixel < expected; pixel += 1) {
        output[pixel] = buffer[pixel * channels] || 0;
      }
      return output;
    }
  }
  return buffer.subarray(0, expected);
}

function normalizedClientMaskCoverage(
  options: { clientMaskCoverage?: number; clientMaskPixelCount?: number },
  target: { width: number; height: number },
) {
  const pixelCount = Math.max(1, target.width * target.height);
  const pixelCoverage = Math.max(0, Number(options.clientMaskPixelCount || 0)) / pixelCount;
  const explicitCoverage = clamp(Number(options.clientMaskCoverage || 0), 0, 1);
  if (explicitCoverage > 0 && pixelCoverage > 0) return Math.min(explicitCoverage, pixelCoverage);
  return explicitCoverage || pixelCoverage || 0;
}

function shouldUseRawMaskForCoverageDrift(preparedCoverage: number, clientCoverage: number) {
  if (clientCoverage <= 0) return false;
  if (preparedCoverage <= 0.12) return false;
  const maxReasonable = Math.max(clientCoverage * 3.5, clientCoverage + 0.08);
  return preparedCoverage > maxReasonable;
}

function shouldUseRawMaskAfterCleanup(rawPixels: number, cleanedPixels: number, minPixels: number) {
  if (rawPixels <= 0) return false;
  if (cleanedPixels <= 0) return true;
  const lostTooMuchPaint = cleanedPixels < Math.max(10, Math.round(rawPixels * 0.16));
  const fellBelowUsableFloor = cleanedPixels < Math.max(10, Math.round(minPixels * 0.2));
  return lostTooMuchPaint && fellBelowUsableFloor;
}

type EditableMaskCandidate = {
  name: string;
  raw: Buffer;
  count: number;
  coverage: number;
  edgeCoverage: number;
};

function buildEditableMaskCandidate(data: Buffer, target: { width: number; height: number }): EditableMaskCandidate {
  const pixelCount = Math.max(1, target.width * target.height);
  const alphaHistogram = new Uint32Array(256);
  for (let index = 3; index < data.length; index += 4) {
    alphaHistogram[data[index] || 0] += 1;
  }
  let dominantAlpha = 255;
  let dominantCount = -1;
  for (let alpha = 0; alpha < alphaHistogram.length; alpha += 1) {
    if (alphaHistogram[alpha] > dominantCount) {
      dominantAlpha = alpha;
      dominantCount = alphaHistogram[alpha];
    }
  }
  const alphaCutoff = dominantAlpha >= 250 ? 250 : Math.max(1, dominantAlpha - 1);
  const alphaHole = emptyMaskCandidate("alpha_hole", pixelCount);
  const whitePaint = emptyMaskCandidate("white_paint", pixelCount);
  const blackPaint = emptyMaskCandidate("black_paint", pixelCount);
  const redPaint = emptyMaskCandidate("red_paint", pixelCount);
  const colorPaint = emptyMaskCandidate("color_paint", pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const r = data[index] || 0;
    const g = data[index + 1] || 0;
    const b = data[index + 2] || 0;
    const alpha = data[index + 3] || 0;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    if (alpha < alphaCutoff) markMaskCandidate(alphaHole, pixel, target);
    if (alpha > 8 && luma > 180) markMaskCandidate(whitePaint, pixel, target);
    if (alpha > 8 && luma < 72) markMaskCandidate(blackPaint, pixel, target);
    if (alpha > 8 && isEditorRedMaskPixel(r, g, b)) markMaskCandidate(redPaint, pixel, target);
    if (alpha > 8 && saturation > 48 && luma > 42 && luma < 230) markMaskCandidate(colorPaint, pixel, target);
  }

  const candidates = [alphaHole, whitePaint, blackPaint, redPaint, colorPaint].map((candidate) => finalizeMaskCandidate(candidate, pixelCount, target));
  const nearFullWhiteMask = candidates.find((candidate) => candidate.name === "white_paint" && candidate.coverage >= 0.96);
  const tinyBlackResidue = candidates.find((candidate) => candidate.name === "black_paint" && candidate.coverage > 0 && candidate.coverage <= 0.04);
  if (nearFullWhiteMask && tinyBlackResidue && !candidates.some((candidate) => (candidate.name === "alpha_hole" || candidate.name === "red_paint" || candidate.name === "color_paint") && candidate.coverage > 0.0001)) {
    return nearFullWhiteMask;
  }
  const usable = candidates
    .filter((candidate) => candidate.count > 0)
    .filter((candidate) => candidate.coverage < 0.96);
  if (!usable.length) return finalizeMaskCandidate(emptyMaskCandidate("empty", pixelCount), pixelCount, target);

  const explicitRedPaint = usable.find((candidate) =>
    candidate.name === "red_paint" &&
    candidate.count >= Math.max(8, pixelCount * 0.000002) &&
    candidate.coverage <= 0.9,
  );
  if (explicitRedPaint) return explicitRedPaint;

  const strongAlpha = usable.find((candidate) =>
    candidate.name === "alpha_hole" &&
    candidate.count >= Math.max(4, pixelCount * 0.000002) &&
    candidate.coverage <= 0.9,
  );
  if (strongAlpha) return strongAlpha;

  return usable.sort((a, b) => maskCandidateScore(a) - maskCandidateScore(b))[0];
}

function emptyMaskCandidate(name: string, pixelCount: number): EditableMaskCandidate {
  return {
    name,
    raw: Buffer.alloc(pixelCount),
    count: 0,
    coverage: 0,
    edgeCoverage: 0,
  };
}

function markMaskCandidate(candidate: EditableMaskCandidate, pixel: number, target: { width: number; height: number }) {
  if (candidate.raw[pixel]) return;
  candidate.raw[pixel] = 255;
  candidate.count += 1;
  if (isMaskEdgePixel(pixel, target)) candidate.edgeCoverage += 1;
}

function finalizeMaskCandidate(candidate: EditableMaskCandidate, pixelCount: number, target: { width: number; height: number }) {
  return {
    ...candidate,
    coverage: candidate.count / Math.max(1, pixelCount),
    edgeCoverage: candidate.edgeCoverage / maskEdgePixelCount(target),
  };
}

function maskCandidateScore(candidate: EditableMaskCandidate) {
  const usefulCoverage = Math.min(candidate.coverage, 1 - candidate.coverage);
  const coverageScore = Math.abs(usefulCoverage - 0.08);
  const edgeScore = candidate.edgeCoverage * 2.4;
  const tinyPenalty = candidate.count < 8 ? 4 : 0;
  return coverageScore + edgeScore + tinyPenalty;
}

function isEditorRedMaskPixel(r: number, g: number, b: number) {
  return r > 160 && g >= 32 && g < 140 && b >= 32 && b < 150 && r - Math.max(g, b) > 70;
}

function isMaskEdgePixel(pixel: number, target: { width: number; height: number }) {
  const x = pixel % target.width;
  const y = Math.floor(pixel / target.width);
  const band = maskEdgeBand(target);
  return x < band || y < band || x >= target.width - band || y >= target.height - band;
}

function maskEdgeBand(target: { width: number; height: number }) {
  return Math.max(2, Math.round(Math.min(target.width, target.height) * 0.025));
}

function maskEdgePixelCount(target: { width: number; height: number }) {
  const band = maskEdgeBand(target);
  const innerWidth = Math.max(0, target.width - band * 2);
  const innerHeight = Math.max(0, target.height - band * 2);
  return Math.max(1, target.width * target.height - innerWidth * innerHeight);
}

function minimumUsableMaskPixels(target: { width: number; height: number }, mode: MaskTaskMode, regionType: MaskRegionType) {
  const pixelCount = target.width * target.height;
  const minSide = Math.min(target.width, target.height);
  const minDiameter = minimumMaskDiameter(mode, regionType, minSide);
  const circlePixels = Math.PI * Math.pow(minDiameter / 2, 2);
  const ratioPixels = pixelCount * minimumMaskCoverage(mode, regionType);
  return Math.round(Math.max(80, Math.min(pixelCount * 0.018, Math.max(circlePixels, ratioPixels))));
}

function minimumMaskDiameter(mode: MaskTaskMode, regionType: MaskRegionType, minSide: number) {
  const scale = Math.max(1, minSide / 1000);
  if (mode === "enhance" || regionType === "face" || regionType === "logo" || regionType === "qrcode") return Math.round(12 * scale);
  if (mode === "text_remove" || mode === "text_replace" || mode === "text_repair" || regionType === "text") return Math.round(26 * scale);
  if (mode === "replace") return Math.round(30 * scale);
  return Math.round(20 * scale);
}

function minimumMaskCoverage(mode: MaskTaskMode, regionType: MaskRegionType) {
  if (mode === "enhance" || regionType === "face" || regionType === "logo" || regionType === "qrcode") return 0.00006;
  if (mode === "text_remove" || mode === "text_replace" || mode === "text_repair" || regionType === "text") return 0.00022;
  if (mode === "replace") return 0.00032;
  return 0.00014;
}

function maskMaxCoverage(mode: MaskTaskMode, regionType: MaskRegionType) {
  if (mode === "style_blend" || mode === "enhance") return 0.9;
  if (mode === "replace" || regionType === "product" || regionType === "background") return 0.82;
  if (mode === "text_remove" || mode === "text_replace" || mode === "text_repair" || regionType === "text") return 0.78;
  return 0.84;
}

async function expandBinaryMaskToMinimum(alpha: Buffer, target: { width: number; height: number }, minPixels: number, minSide: number) {
  let current = alpha;
  let radius = Math.max(1.2, Math.round(minSide * 0.006));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    current = await maskSharp(current, target)
      .blur(radius)
      .threshold(3)
      .greyscale()
      .raw()
      .toBuffer()
      .then((buffer) => toSingleChannelMaskBuffer(buffer, target));
    if (countMaskPixels(current, 8) >= minPixels) return current;
    radius *= 1.65;
  }
  return current;
}

function maskBoundingBox(alpha: Buffer, target: { width: number; height: number }, threshold: number): MaskBoundingBox | null {
  let left = target.width;
  let right = -1;
  let top = target.height;
  let bottom = -1;
  for (let y = 0; y < target.height; y += 1) {
    for (let x = 0; x < target.width; x += 1) {
      const value = alpha[y * target.width + x] || 0;
      if (value <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function findMaskComponents(alpha: Buffer, target: { width: number; height: number }, threshold: number): MaskComponent[] {
  const pixelCount = target.width * target.height;
  const visited = new Uint8Array(pixelCount);
  const components: MaskComponent[] = [];
  const minComponentPixels = Math.max(18, Math.round(pixelCount * 0.000012));
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || (alpha[start] || 0) <= threshold) continue;
    const stack = [start];
    const pixels: number[] = [];
    visited[start] = 1;
    let left = target.width;
    let right = -1;
    let top = target.height;
    let bottom = -1;

    while (stack.length) {
      const pixel = stack.pop() as number;
      pixels.push(pixel);
      const x = pixel % target.width;
      const y = Math.floor(pixel / target.width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= target.width || ny >= target.height) continue;
        const next = ny * target.width + nx;
        if (visited[next] || (alpha[next] || 0) <= threshold) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    if (pixels.length < minComponentPixels) continue;
    components.push({
      index: components.length + 1,
      left,
      top,
      right,
      bottom,
      width: right - left + 1,
      height: bottom - top + 1,
      pixelCount: pixels.length,
      pixels,
    });
  }

  return components
    .sort((a, b) => (a.top - b.top) || (a.left - b.left))
    .slice(0, 24)
    .map((component, index) => ({ ...component, index: index + 1 }));
}

function maskExpandRadius(strength: MaskProtectionStrength, minSide: number) {
  const scale = Math.max(1, minSide / 1000);
  if (strength === "strict") return Math.max(2, Math.min(8, Math.round(4 * scale)));
  if (strength === "creative") return Math.max(16, Math.min(44, Math.round(26 * scale)));
  return Math.max(6, Math.min(18, Math.round(11 * scale)));
}

function maskFeatherRadius(edgeBlend: MaskEdgeBlend, minSide: number) {
  const scale = Math.max(1, minSide / 1000);
  if (edgeBlend === "weak") return Math.max(4, Math.min(10, Math.round(6 * scale)));
  if (edgeBlend === "strong") return Math.max(20, Math.min(62, Math.round(34 * scale)));
  return Math.max(8, Math.min(22, Math.round(14 * scale)));
}

async function alphaToTransparentEditMask(alpha: Buffer, target: { width: number; height: number }) {
  const rgba = Buffer.alloc(target.width * target.height * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const index = pixel * 4;
    rgba[index] = 255;
    rgba[index + 1] = 255;
    rgba[index + 2] = 255;
    rgba[index + 3] = 255 - (alpha[pixel] || 0);
  }
  return sharp(rgba, { raw: { width: target.width, height: target.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function composeControlledMaskedEdit(
  originalBuffer: Buffer,
  editedBuffer: Buffer,
  mask: PreparedMask,
  target: { width: number; height: number },
) {
  const [original, edited] = await Promise.all([
    sharp(originalBuffer)
      .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(editedBuffer)
      .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  const output = Buffer.allocUnsafe(original.length);
  for (let index = 0, pixel = 0; index < original.length; index += 4, pixel += 1) {
    const alpha = Math.max(0, Math.min(1, (mask.blendAlpha[pixel] || 0) / 255));
    if (alpha <= 0.003) {
      original.copy(output, index, index, index + 4);
      continue;
    }
    output[index] = Math.round(original[index] * (1 - alpha) + edited[index] * alpha);
    output[index + 1] = Math.round(original[index + 1] * (1 - alpha) + edited[index + 1] * alpha);
    output[index + 2] = Math.round(original[index + 2] * (1 - alpha) + edited[index + 2] * alpha);
    output[index + 3] = Math.round(original[index + 3] * (1 - alpha) + edited[index + 3] * alpha);
  }
  return sharp(output, { raw: { width: target.width, height: target.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function shouldApplyDeterministicText(mode: MaskTaskMode, prompt: string) {
  return (mode === "text_replace" || mode === "text_repair") && Boolean(extractDeterministicText(prompt));
}

function extractDeterministicText(prompt: string) {
  return prompt
    .replace(/^新文字[:：]/, "")
    .replace(/^正确文字[:：]/, "")
    .replace(/^文字内容[:：]/, "")
    .trim()
    .slice(0, 80);
}

async function applyDeterministicTextOverlay(
  baseBuffer: Buffer,
  originalBuffer: Buffer,
  mask: PreparedMask,
  target: { width: number; height: number },
  options: { text: string; mode: MaskTaskMode },
) {
  const text = options.text.trim();
  const bbox = mask.bbox;
  if (!text || !bbox || bbox.width < 8 || bbox.height < 8) return baseBuffer;
  const padding = Math.max(4, Math.round(Math.min(bbox.width, bbox.height) * 0.08));
  const box = {
    left: Math.max(0, bbox.left + padding),
    top: Math.max(0, bbox.top + padding),
    width: Math.max(8, bbox.width - padding * 2),
    height: Math.max(8, bbox.height - padding * 2),
  };
  const lines = wrapDeterministicText(text, box.width, box.height);
  const maxChars = Math.max(1, ...lines.map((line) => line.length));
  const fontSize = Math.max(
    12,
    Math.min(
      Math.round(box.height / Math.max(1.35, lines.length * 1.28)),
      Math.round(box.width / Math.max(1.15, maxChars * 0.72)),
    ),
  );
  const palette = await sampleTextPalette(originalBuffer, mask, target);
  const lineHeight = Math.round(fontSize * 1.22);
  const totalHeight = lineHeight * lines.length;
  const startY = box.top + Math.max(fontSize, Math.round((box.height - totalHeight) / 2) + fontSize);
  const svgLines = lines
    .map((line, index) => `<text x="${box.left + box.width / 2}" y="${startY + index * lineHeight}" text-anchor="middle">${escapeSvgText(line)}</text>`)
    .join("");
  const strokeWidth = Math.max(1, Math.round(fontSize * 0.055));
  const shadowBlur = Math.max(2, Math.round(fontSize * 0.16));
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${target.width}" height="${target.height}">
      <defs>
        <filter id="localTextShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="${Math.max(1, Math.round(fontSize * 0.08))}" stdDeviation="${shadowBlur}" flood-color="${palette.shadow}" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
         font-size="${fontSize}"
         font-weight="${options.mode === "text_repair" ? 700 : 650}"
         fill="${palette.fill}"
         stroke="${palette.stroke}"
         stroke-width="${strokeWidth}"
         paint-order="stroke fill"
         filter="url(#localTextShadow)">
        ${svgLines}
      </g>
    </svg>
  `);
  const rendered = await sharp(baseBuffer)
    .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .composite([{ input: svg, blend: "over" }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return composeControlledMaskedEdit(baseBuffer, rendered, mask, target);
}

function wrapDeterministicText(text: string, boxWidth: number, boxHeight: number) {
  const explicitLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines.slice(0, 4);
  const clean = explicitLines[0] || text.trim();
  const maxLines = Math.max(1, Math.min(4, Math.floor(boxHeight / 28)));
  const estimatedChars = Math.max(4, Math.floor(boxWidth / 34));
  if (clean.length <= estimatedChars || maxLines === 1) return [clean];
  const lines: string[] = [];
  let rest = clean;
  while (rest && lines.length < maxLines) {
    const remainingSlots = maxLines - lines.length;
    const take = lines.length === maxLines - 1 ? rest.length : Math.ceil(rest.length / remainingSlots);
    lines.push(rest.slice(0, take));
    rest = rest.slice(take);
  }
  return lines;
}

async function sampleTextPalette(originalBuffer: Buffer, mask: PreparedMask, target: { width: number; height: number }) {
  const original = await sharp(originalBuffer)
    .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  let lumaSum = 0;
  let count = 0;
  for (let pixel = 0; pixel < mask.binaryAlpha.length; pixel += 1) {
    if ((mask.binaryAlpha[pixel] || 0) <= 8) continue;
    const index = pixel * 4;
    lumaSum += 0.299 * (original[index] || 0) + 0.587 * (original[index + 1] || 0) + 0.114 * (original[index + 2] || 0);
    count += 1;
  }
  const luma = lumaSum / Math.max(1, count);
  return luma > 145
    ? { fill: "#1a1d24", stroke: "rgba(255,255,255,0.78)", shadow: "#000000" }
    : { fill: "#ffffff", stroke: "rgba(0,0,0,0.62)", shadow: "#000000" };
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function inspectMaskEditQuality(
  originalBuffer: Buffer,
  finalBuffer: Buffer,
  mask: PreparedMask,
  target: { width: number; height: number },
  options: {
    taskMode: MaskTaskMode;
    regionType: MaskRegionType;
    protectionStrength: MaskProtectionStrength;
    preserveOutsideMask: boolean;
    userPrompt: string;
  },
): Promise<MaskEditQualityReport> {
  const [original, final] = await Promise.all([
    sharp(originalBuffer)
      .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(finalBuffer)
      .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
  ]);
  let outsideDiff = 0;
  let outsideCount = 0;
  let outsideChanged = 0;
  let insideDiff = 0;
  let insideCount = 0;
  let insideChanged = 0;
  let boundaryDiff = 0;
  let boundaryCount = 0;
  for (let pixel = 0; pixel < mask.blendAlpha.length; pixel += 1) {
    const index = pixel * 4;
    const diff = colorDiff(original, final, index);
    const alpha = mask.blendAlpha[pixel] || 0;
    const solidAlpha = mask.binaryAlpha[pixel] || 0;
    if (alpha <= 1) {
      outsideDiff += diff;
      outsideCount += 1;
      if (diff > 2.2) outsideChanged += 1;
    } else if (alpha > 8 && alpha < 247) {
      boundaryDiff += diff;
      boundaryCount += 1;
    }
    if (solidAlpha > 8) {
      insideDiff += diff;
      insideCount += 1;
      if (diff > 6) insideChanged += 1;
    }
  }
  const outsideDiffMean = outsideDiff / Math.max(1, outsideCount);
  const outsideChangedPixelRatio = outsideChanged / Math.max(1, outsideCount);
  const insideDiffMean = insideDiff / Math.max(1, insideCount);
  const insideChangedPixelRatio = insideChanged / Math.max(1, insideCount);
  const boundaryDiffMean = boundaryDiff / Math.max(1, boundaryCount);
  const componentReports = inspectMaskComponentReports(original, final, mask, target, options);
  const weakComponents = componentReports.filter((component) => component.status === "weak");
  const residueComponents = componentReports.filter((component) => component.status === "residue_risk");
  const issues: string[] = [];
  const suggestions: string[] = [];
  if (options.preserveOutsideMask && (outsideDiffMean > 0.6 || outsideChangedPixelRatio > 0.0008)) {
    issues.push("mask 外区域发生变化。");
    suggestions.push("请检查强制合成逻辑，重新用原图像素覆盖 mask 外区域。");
  }
  const weakRequiredInteriorChange =
    insideDiffMean < 1.4 ||
    (insideDiffMean < 3.2 && insideChangedPixelRatio < 0.018);
  if (requiresVisibleInteriorChange(options.taskMode, options.userPrompt) && weakRequiredInteriorChange) {
    issues.push("mask 内区域几乎没有变化。");
    suggestions.push("系统会扩大 mask 并强化清理提示重试；如果仍失败，请把要去掉的物体、阴影和边缘完整涂满。");
  }
  if (requiresVisibleInteriorChange(options.taskMode, options.userPrompt) && weakComponents.length) {
    issues.push(`第 ${weakComponents.map((component) => component.index).join("、")} 个涂抹区域几乎没有变化。`);
    suggestions.push("系统会按每个涂抹块重新强化生成；如果仍失败，请把该块文字、Logo、阴影和描边完整涂满。");
  }
  if ((options.taskMode === "text_remove" || options.taskMode === "cleanup") && residueComponents.length) {
    issues.push(`第 ${residueComponents.map((component) => component.index).join("、")} 个涂抹区域疑似仍有文字/Logo 残留。`);
    suggestions.push("请扩大残留区域的涂抹范围，覆盖文字描边、阴影、Logo 圆章和发光边缘后重试。");
  }
  if (boundaryDiffMean > 92 && options.protectionStrength !== "creative") {
    issues.push("涂抹边缘差异较大，可能有硬边、色差或拼贴感。");
    suggestions.push("提高边缘融合，或略微扩大 mask 后重试。");
  }
  if ((options.taskMode === "text_replace" || options.taskMode === "text_repair") && options.regionType !== "text") {
    issues.push("当前任务是文字处理，但区域类型不是文字。");
    suggestions.push("请将区域类型切换为文字，并确认新文字内容。");
  }
  if (options.regionType === "logo" || options.regionType === "qrcode") {
    suggestions.push(options.regionType === "logo" ? "Logo 建议用上传素材覆盖，避免 AI 重绘变形。" : "二维码必须使用真实二维码，AI 生成二维码不可用。");
  }
  const failed = issues.some((issue) => issue.includes("mask 外") || issue.includes("几乎没有变化"));
  const warning = issues.length > 0;
  return {
    status: failed ? "failed" : warning ? "warning" : "passed",
    label: failed ? "局部保护失败" : warning ? "可用但建议优化" : "局部修改合格",
    message: failed
      ? issues.join("；")
      : warning
        ? `${issues.join("；")} ${suggestions[0] || ""}`.trim()
        : "mask 外已强制锁定，局部边缘融合检查通过。",
    outsideDiffMean: Number(outsideDiffMean.toFixed(4)),
    outsideChangedPixelRatio: Number(outsideChangedPixelRatio.toFixed(6)),
    insideDiffMean: Number(insideDiffMean.toFixed(4)),
    insideChangedPixelRatio: Number(insideChangedPixelRatio.toFixed(6)),
    boundaryDiffMean: Number(boundaryDiffMean.toFixed(3)),
    maskCoverage: Number(mask.coverage.toFixed(6)),
    maskComponentCount: mask.components.length,
    unchangedComponentCount: weakComponents.length,
    componentReports,
    issues,
    suggestions,
  };
}

function inspectMaskComponentReports(
  original: Buffer,
  final: Buffer,
  mask: PreparedMask,
  target: { width: number; height: number },
  options: {
    taskMode: MaskTaskMode;
    userPrompt: string;
  },
): MaskComponentReport[] {
  return mask.components.map((component) => {
    let diffSum = 0;
    let changed = 0;
    for (const pixel of component.pixels) {
      const index = pixel * 4;
      const diff = colorDiff(original, final, index);
      diffSum += diff;
      if (diff > 6) changed += 1;
    }
    const diffMean = diffSum / Math.max(1, component.pixelCount);
    const changedPixelRatio = changed / Math.max(1, component.pixelCount);
    const originalDetailMean = componentDetailMean(original, mask.binaryAlpha, component, target);
    const finalDetailMean = componentDetailMean(final, mask.binaryAlpha, component, target);
    const detailRetention = finalDetailMean / Math.max(1, originalDetailMean);
    const weak =
      requiresVisibleInteriorChange(options.taskMode, options.userPrompt) &&
      (diffMean < 1.35 || (diffMean < 3.2 && changedPixelRatio < 0.018));
    const residueRisk =
      !weak &&
      (options.taskMode === "text_remove" || options.taskMode === "cleanup") &&
      originalDetailMean >= 9 &&
      finalDetailMean >= 8 &&
      detailRetention >= 0.72 &&
      changedPixelRatio < 0.68;
    return {
      index: component.index,
      bbox: {
        left: component.left,
        top: component.top,
        right: component.right,
        bottom: component.bottom,
        width: component.width,
        height: component.height,
      },
      pixelCount: component.pixelCount,
      diffMean: Number(diffMean.toFixed(4)),
      changedPixelRatio: Number(changedPixelRatio.toFixed(6)),
      originalDetailMean: Number(originalDetailMean.toFixed(4)),
      finalDetailMean: Number(finalDetailMean.toFixed(4)),
      detailRetention: Number(detailRetention.toFixed(4)),
      status: weak ? "weak" : residueRisk ? "residue_risk" : "changed",
    };
  });
}

function componentDetailMean(
  image: Buffer,
  maskAlpha: Buffer,
  component: MaskComponent,
  target: { width: number; height: number },
) {
  let detail = 0;
  let count = 0;
  for (const pixel of component.pixels) {
    const x = pixel % target.width;
    const y = Math.floor(pixel / target.width);
    if (x + 1 < target.width && (maskAlpha[pixel + 1] || 0) > 8) {
      detail += colorDiffBetweenPixels(image, pixel, pixel + 1);
      count += 1;
    }
    if (y + 1 < target.height && (maskAlpha[pixel + target.width] || 0) > 8) {
      detail += colorDiffBetweenPixels(image, pixel, pixel + target.width);
      count += 1;
    }
  }
  return detail / Math.max(1, count);
}

function colorDiffBetweenPixels(buffer: Buffer, pixelA: number, pixelB: number) {
  const a = pixelA * 4;
  const b = pixelB * 4;
  const dr = (buffer[a] || 0) - (buffer[b] || 0);
  const dg = (buffer[a + 1] || 0) - (buffer[b + 1] || 0);
  const db = (buffer[a + 2] || 0) - (buffer[b + 2] || 0);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function colorDiff(a: Buffer, b: Buffer, index: number) {
  const dr = (a[index] || 0) - (b[index] || 0);
  const dg = (a[index + 1] || 0) - (b[index + 1] || 0);
  const db = (a[index + 2] || 0) - (b[index + 2] || 0);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function shouldRetryMaskEditAttempt(report: MaskEditQualityReport, mode: MaskTaskMode, userPrompt: string) {
  return requiresVisibleInteriorChange(mode, userPrompt) && report.issues.some((issue) => issue.includes("几乎没有变化"));
}

function shouldUseLocalCleanupFallback(report: MaskEditQualityReport, mode: MaskTaskMode, userPrompt: string) {
  return (mode === "cleanup" || mode === "text_remove") &&
    requiresVisibleInteriorChange(mode, userPrompt) &&
    report.issues.some((issue) => issue.includes("几乎没有变化"));
}

function shouldApplyLocalCleanupFallback(fallback: MaskEditQualityReport, previous: MaskEditQualityReport, mode: MaskTaskMode) {
  if (fallback.issues.some((issue) => issue.includes("mask 外"))) return false;
  if ((mode === "cleanup" || mode === "text_remove") && previous.insideDiffMean < 0.5 && fallback.insideDiffMean > 0.05) return true;
  if ((mode === "cleanup" || mode === "text_remove") && previous.insideChangedPixelRatio < 0.002 && fallback.insideChangedPixelRatio > 0.0008) return true;
  if (fallback.insideDiffMean > previous.insideDiffMean + 0.15) return true;
  if (previous.insideDiffMean < 0.5 && fallback.insideChangedPixelRatio > 0.002) return true;
  return fallback.status !== "failed" && fallback.insideDiffMean > 0.5;
}

async function buildLocalCleanupFallback(originalBuffer: Buffer, mask: PreparedMask, target: { width: number; height: number }) {
  const minSide = Math.min(target.width, target.height);
  const baseBlur = Math.max(28, Math.min(96, Math.round(minSide * 0.055)));
  const medianSize = Math.max(3, Math.min(13, Math.round(minSide * 0.008) | 1));
  const softBackground = await sharp(originalBuffer)
    .resize(target.width, target.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .median(medianSize)
    .blur(baseBlur)
    .modulate({ brightness: 1.012, saturation: 0.86 })
    .png({ compressionLevel: 6, palette: false })
    .toBuffer();
  const fallbackBlendAlpha = await maskSharp(mask.binaryAlpha, target)
    .blur(Math.max(3, Math.round(minSide * 0.008)))
    .greyscale()
    .raw()
    .toBuffer()
    .then((buffer) => toSingleChannelMaskBuffer(buffer, target));
  return composeControlledMaskedEdit(originalBuffer, softBackground, {
    ...mask,
    blendAlpha: fallbackBlendAlpha,
  }, target);
}

function requiresVisibleInteriorChange(mode: MaskTaskMode, userPrompt: string) {
  if (mode === "replace" || mode === "text_remove" || mode === "text_replace" || mode === "text_repair") return true;
  if (mode === "cleanup") return /去掉|删除|移除|擦除|清除|修干净|补成|不要|remove|delete|erase|clean/i.test(userPrompt);
  return false;
}

function retryMaskProtectionStrength(mode: MaskTaskMode, current: MaskProtectionStrength): MaskProtectionStrength {
  if (mode === "cleanup" || mode === "text_remove" || mode === "replace") {
    if (current === "strict") return "standard";
    return "creative";
  }
  return current === "creative" ? "creative" : "standard";
}

function retryMaskEdgeBlend(current: MaskEdgeBlend): MaskEdgeBlend {
  return current === "weak" ? "standard" : "strong";
}

function buildControlledMaskEditPrompt(input: {
  userPrompt: string;
  taskMode: MaskTaskMode;
  regionType: MaskRegionType;
  protectionStrength: MaskProtectionStrength;
  edgeBlend: MaskEdgeBlend;
  outputSize: { width: number; height: number };
  protectionContext: ProtectionContext;
  maskComponents: MaskComponent[];
  retryLevel?: number;
}) {
  const taskLine = maskTaskInstruction(input.taskMode, input.userPrompt);
  return [
    taskLine,
    "",
    input.retryLevel
      ? "Retry instruction: the previous attempt looked almost unchanged. Complete the requested edit in every masked region."
      : "",
    "Generative fill rule: edit only the masked area. Treat the white mask as the user's selected region.",
    "Preserve the unmasked area exactly; it will be pasted back from the original image by the system.",
    "Align the new masked content with surrounding pixels: color, texture, lighting, perspective, grain, and edge continuity.",
    "Mask priority: if text, brand-like marks, logo-like marks, stains, objects, or decorations are inside the mask and the user asks to remove/clean them, remove them from the mask; do not protect or restore masked typography.",
    maskComponentPrompt(input.maskComponents, input.outputSize, input.taskMode),
    maskRegionInstruction(input.regionType, input.taskMode),
    maskEdgeInstruction(input.edgeBlend),
    `Output size must stay ${input.outputSize.width}x${input.outputSize.height}.`,
    buildMaskEditProtectionPrompt(input.protectionContext, input.taskMode),
    maskForbiddenInstruction(input.taskMode),
  ]
    .filter(Boolean)
    .join("\n");
}

function maskComponentPrompt(components: MaskComponent[], target: { width: number; height: number }, mode: MaskTaskMode) {
  if (!components.length) return "";
  const removalTask = mode === "cleanup" || mode === "text_remove" || mode === "text_replace" || mode === "text_repair";
  const action = removalTask ? "complete the requested cleanup/removal in" : "complete the requested edit in";
  const summary = components
    .slice(0, 8)
    .map((component) => {
      const centerX = ((component.left + component.right + 1) / 2) / Math.max(1, target.width);
      const centerY = ((component.top + component.bottom + 1) / 2) / Math.max(1, target.height);
      const widthPercent = (component.width / Math.max(1, target.width)) * 100;
      const heightPercent = (component.height / Math.max(1, target.height)) * 100;
      return `#${component.index} ${maskPositionLabel(centerX, centerY)}, about ${widthPercent.toFixed(1)}% x ${heightPercent.toFixed(1)}% of the canvas`;
    })
    .join("; ");
  return [
    `The mask contains ${components.length} separate selected region${components.length > 1 ? "s" : ""}: ${summary}.`,
    `You must ${action} every selected region. Do not ignore small masked islands, upper-corner marks, vertical text, brand-like words, logo-like marks, stamps, or decorations if they are inside the mask.`,
  ].join("\n");
}

function maskPositionLabel(centerX: number, centerY: number) {
  const horizontal = centerX < 0.34 ? "left" : centerX > 0.66 ? "right" : "center";
  const vertical = centerY < 0.34 ? "top" : centerY > 0.66 ? "bottom" : "middle";
  return `${vertical}-${horizontal}`;
}

function buildMaskEditProtectionPrompt(context: ProtectionContext, taskMode: MaskTaskMode) {
  const protectedTexts = (context.protectedTexts || []).filter((item) => item.text).slice(0, 8);
  const protectedAssets = (context.protectedAssets || []).filter((item) => item.label).slice(0, 8);
  const brand = context.brandProfile;
  const maskOverride = taskMode === "cleanup" || taskMode === "text_remove" || taskMode === "text_replace" || taskMode === "text_repair";
  const lines = [
    "Local protection scope: preservation rules apply only outside the mask.",
    maskOverride ? "Inside the mask, follow the user's edit instruction first. Do not protect or restore masked text that the user selected for removal." : "",
    protectedTexts.length
      ? [
          "Protected text outside the mask:",
          ...protectedTexts.map((item) => `- ${item.text}`),
        ].join("\n")
      : "",
    protectedAssets.length
      ? [
          "Protected visual assets outside the mask:",
          ...protectedAssets.map((item) => `- ${item.label}: ${item.instruction}`),
        ].join("\n")
      : "",
    brand?.name ? `Brand outside the mask: ${brand.name}. Do not invent new brand text.` : "",
    brand?.colors?.length ? `Keep the surrounding brand color direction outside the mask: ${brand.colors.join(", ")}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function maskTaskInstruction(mode: MaskTaskMode, userPrompt: string) {
  const request = userPrompt.trim();
  if (mode === "replace") {
    return [
      "Task: Local object replacement.",
      `Replace only the masked area with: ${request}.`,
      "Match perspective, scale, lighting, shadow direction, material, color temperature, and commercial design style.",
      "Do not invent brand text, fake labels, fake logos, or fake QR codes.",
    ].join("\n");
  }
  if (mode === "style_blend") {
    return [
      "Task: Local style blending.",
      request ? `Adjust the masked area according to: ${request}.` : "Make the masked area visually consistent with the surrounding design.",
      "Unify color, texture, lighting, grain, material, and design language without changing semantic content.",
    ].join("\n");
  }
  if (mode === "text_remove") {
    return [
      "Task: Remove text inside the masked area.",
      "Remove only the text covered by the mask.",
      "Fill the area with clean background matching the surrounding design.",
      "The masked area must become a clean background area with no readable characters, no typography, no button label, no slogan, no fake Chinese text, no replacement words, and no text-like strokes.",
      "Do not generate new text. Do not replace old text with different text. Do not keep a red label/button unless it contains no text-like marks.",
    ].join("\n");
  }
  if (mode === "text_replace") {
    return [
      "Task: Remove old text inside the masked area and reconstruct clean background.",
      `New text requested by user: ${request}.`,
      "Do not let AI render the final Chinese text. Remove old text and prepare a clean background for deterministic text rendering.",
    ].join("\n");
  }
  if (mode === "text_repair") {
    return [
      "Task: Repair text area inside the mask by cleaning artifacts and preparing a clean base.",
      `Confirmed text content: ${request}.`,
      "Do not invent or rewrite text. Preserve nearby typography outside the mask.",
    ].join("\n");
  }
  if (mode === "enhance") {
    return [
      "Task: Local quality and lighting enhancement.",
      request ? `Enhancement request: ${request}.` : "Enhance only sharpness, material texture, lighting, highlights, shadows, color consistency, and detail quality.",
      "Keep original structure, object identity, text, logo, and layout unchanged.",
      "Do not replace objects. Do not add new elements. Do not change text or faces.",
    ].join("\n");
  }
  return [
    "Task: Local cleanup and background reconstruction.",
    request ? `Cleanup request: ${request}.` : "Remove unwanted content inside the mask and reconstruct clean background.",
    "Reconstruct the masked area to match surrounding color, texture, lighting, perspective, grain, and design style.",
    "Do not add new objects. Do not add new text.",
  ].join("\n");
}

function maskRegionInstruction(region: MaskRegionType, mode: MaskTaskMode) {
  const common = "Region rule:";
  if (region === "background") return `${common} The mask is background. Repaint only texture, light, space, and gradient. Do not add text, logo, people, products, or main subject.`;
  if (region === "text") return `${common} The mask contains text. Use only the selected text task mode. Remove all masked text-like marks when this is a removal task. Do not invent text or render random characters.`;
  if (region === "face") return `${common} The mask touches a face. Preserve identity, facial structure, age, expression, hairstyle, and skin tone. Only minor cleanup or lighting enhancement is allowed.`;
  if (region === "product") return `${common} The mask touches a product. Preserve product perspective, brand identity, package structure, material, and readable labels. Do not invent packaging text.`;
  if (region === "logo" && (mode === "cleanup" || mode === "text_remove")) return `${common} The mask touches a logo-like or brand mark selected for cleanup. Remove only the masked logo-like/brand-mark area and reconstruct background; do not affect any unmasked logo.`;
  if (region === "logo") return `${common} The mask touches a logo. Do not redraw or deform the logo. If replacement is needed, use uploaded logo material instead of AI imagination.`;
  if (region === "qrcode" && (mode === "cleanup" || mode === "text_remove")) return `${common} The mask touches a QR-like area selected for cleanup. Remove only the masked QR-like area and reconstruct background; do not affect any unmasked QR code.`;
  if (region === "qrcode") return `${common} The mask touches a QR code. Do not generate or redraw QR codes with AI; keep or replace with a real QR code asset.`;
  if (region === "decoration") return `${common} The mask is decoration. Local redraw is allowed, but do not affect text, face, logo, QR code, product, or main subject.`;
  return mode.startsWith("text_") ? `${common} Treat the mask as a text area and protect all text outside it.` : `${common} Region type is uncertain. Use conservative local editing and avoid changing protected content.`;
}

function maskForbiddenInstruction(mode: MaskTaskMode) {
  const common = "Forbidden: full image redesign, global color change, changing unmasked text, changing unmasked faces, changing unmasked logo, changing unmasked QR code, fake brand labels, fake QR codes, random new text, cropped composition, side padding, hard patch edges.";
  if (mode === "cleanup" || mode === "text_remove" || mode === "text_replace" || mode === "text_repair") {
    return `${common} Also forbidden: preserving or recreating removed text/logo-like marks inside the mask, leaving readable character residue, or cleaning only some masked regions while ignoring another masked region.`;
  }
  return common;
}

function maskEdgeInstruction(edgeBlend: MaskEdgeBlend) {
  if (edgeBlend === "weak") return "Edge blending: weak. Keep boundary tight and precise.";
  if (edgeBlend === "strong") return "Edge blending: strong. Use broad seamless blending to avoid visible patch edges, color mismatch, and residue.";
  return "Edge blending: standard. Blend the mask boundary naturally with surrounding color, light, texture, and grain.";
}
