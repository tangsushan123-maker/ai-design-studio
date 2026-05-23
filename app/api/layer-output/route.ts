import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import {
  assertExactPixelSize,
  getGeneratedDir,
  inspectPngAlpha,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  type PixelSize,
  type PngAlphaInspection,
} from "@/lib/image-utils";
import { writeJsonAtomic } from "@/lib/local-json-store";
import { getAnalysisModel, getImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage } from "@/lib/request-guards";

export const runtime = "nodejs";

const BACKGROUND_PROMPT = [
  "remove all visible text, remove text glow, remove text shadow, remove text outline",
  "restore the original clean background",
  "keep original lighting, keep original texture, keep original color, keep original composition",
  "do not change the keyboard, do not change the product, do not change non-masked areas",
  "Only repair the transparent area of the mask. Do not redraw the whole image.",
].join(", ");

type TextMaskStrength = "soft" | "normal" | "strong";
type TextExtractionMode = "simple_cutout" | "hybrid_extract" | "high_rebuild";

type TextRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

type TextAlphaMask = {
  alpha: Buffer;
  debugPng: Buffer;
  regions: TextRegion[];
  coverage: number;
  quality: TextQualityReport;
  attempts: number;
};

type TextLayoutLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  glowColor?: string;
  glowBlur?: number;
  role?: "title" | "subtitle" | "body" | "caption" | "logo" | "icon_label" | "decorative";
  styleTags?: string[];
};

type TextExtractionPlan = {
  mode: TextExtractionMode;
  reason: string;
  complexityScore: number;
  lines: TextLayoutLine[];
  styleTags: string[];
  qualityRisks: string[];
  source: "vision" | "local";
};

type RepairMask = {
  alpha: Buffer;
  debugPng: Buffer;
  editMask: Buffer;
  coverage: number;
  feather: number;
  radius: number;
};

type TransparentTextOutput = {
  full: Buffer;
  cropped: Buffer | null;
  alphaCheck: TextLayerAlphaCheck;
  cropBox?: { x: number; y: number; width: number; height: number };
  mode?: TextExtractionMode;
};

type TextLayerAlphaCheck = Awaited<ReturnType<typeof inspectTextLayerPng>> & {
  method?: string;
  message: string;
};

type TextQualityReport = {
  passed: boolean;
  visiblePixelRatio: number;
  transparentPixelRatio?: number;
  partialAlphaPixelRatio?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  issues: string[];
  actions: string[];
};

type PreparedTextLayerAlpha = {
  alpha: Buffer;
  debugPng: Buffer;
  coverage: number;
  quality: TextQualityReport;
  residueCleanupApplied: boolean;
};

type BackgroundQualityReport = {
  passed: boolean;
  attempts: number;
  outsideDiffMean: number;
  textAreaChangeMean: number;
  residualEdgeRatio: number;
  residualRisk: boolean;
  issues: string[];
  actions: string[];
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const formData = await request.formData();
    const source = await readLayerSource(formData);
    if (!source) {
      return NextResponse.json({ error: "请先选择一张已生成图片或已上传图片，再进行分层拆图。" }, { status: 400 });
    }

    const model = String(formData.get("model") ?? "").trim() || getImageModel();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const originalImageId = String(formData.get("originalImageId") ?? "").trim();
    const originalUrl = String(formData.get("sourceUrl") ?? "").trim();
    const includeBackground = parseBoolean(formData.get("includeBackground"), true);
    const includeTextLayer = parseBoolean(formData.get("includeTextLayer"), true);
    const maskStrength = parseMaskStrength(formData.get("maskStrength"));
    const keepGlow = parseBoolean(formData.get("keepGlow"), true);
    const outputCroppedText = parseBoolean(formData.get("outputCroppedText"), true);
    if (!includeBackground && !includeTextLayer) {
      return NextResponse.json({ error: "请至少选择一个拆分输出：无文字背景或文字透明 PNG。" }, { status: 400 });
    }

    const generatedAt = new Date().toISOString();
    const original = await sharp(source.buffer).rotate().png({ compressionLevel: 9, palette: false }).toBuffer();
    const originalMeta = await readImageMetadata(original);
    const canvas = { width: originalMeta.width || 1, height: originalMeta.height || 1 };
    const normalizedSource = { buffer: original, fileName: "original.png", mimeType: "image/png" };
    const groupId = `layer-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
    const layerDir = path.join(getGeneratedDir(), "layers", groupId);
    await mkdir(layerDir, { recursive: true });

    const paths = {
      original: path.join(layerDir, "original.png"),
      textAlphaMask: path.join(layerDir, "text_alpha_mask.png"),
      repairMask: path.join(layerDir, "repair_mask.png"),
      textFull: path.join(layerDir, "text_full.png"),
      textCropped: path.join(layerDir, "text_cropped.png"),
      textCutout: path.join(layerDir, "text_cutout.png"),
      backgroundFirstPass: path.join(layerDir, "background_first_pass.png"),
      backgroundFinal: path.join(layerDir, "background_no_text.png"),
      qualityReport: path.join(layerDir, "quality_report.json"),
      metadata: path.join(layerDir, "layer-metadata.json"),
    };
    await writeFile(paths.original, original);
    const originalStat = await stat(paths.original);

    const errors: { background?: string; textLayer?: string } = {};
    const textRegions = await detectTextRegions(original, canvas);
    const textAlpha = await autoRetryTextAlpha(original, textRegions, {
      strength: maskStrength,
      keepGlow,
    });
    const extractionPlan = await buildTextExtractionPlan(original, canvas, textRegions, textAlpha);
    const textLayerAlpha = await prepareTextLayerAlpha(original, textAlpha, textRegions, extractionPlan, {
      strength: maskStrength,
      keepGlow,
    });
    await writeFile(paths.textAlphaMask, textLayerAlpha.debugPng);
    const textAlphaMaskStat = await stat(paths.textAlphaMask);
    const repairSourceAlpha = shouldRebuildTextLayer(extractionPlan)
      ? await buildRebuildRepairAlpha(extractionPlan, canvas, textAlpha.alpha)
      : textAlpha.alpha;

    let textOutput: TransparentTextOutput | null = null;
    let sourceTextCutout: TransparentTextOutput | null = null;
    let textFullStat: Awaited<ReturnType<typeof stat>> | null = null;
    let textCroppedStat: Awaited<ReturnType<typeof stat>> | null = null;
    let textCutoutStat: Awaited<ReturnType<typeof stat>> | null = null;
    if (includeTextLayer) {
      try {
        sourceTextCutout = await exportTransparentText(original, textLayerAlpha.alpha, canvas, {
          outputCroppedText,
          message: textLayerAlpha.residueCleanupApplied
            ? "原图像素文字层已做背景残片清理：保留文字、描边、阴影和发光，过滤海面、天空、产品、光效碎片。"
            : undefined,
        });
        await writeFile(paths.textCutout, sourceTextCutout.full);
        textCutoutStat = await stat(paths.textCutout);

        if (shouldRebuildTextLayer(extractionPlan)) {
          try {
            textOutput = await exportRebuiltTextLayer(original, extractionPlan, canvas, { outputCroppedText });
          } catch (error) {
            errors.textLayer = `高清文字重建失败，已回退为原图像素文字层：${toApiError(error, "高清文字重建失败。").message}`;
            textOutput = sourceTextCutout;
          }
        } else {
          textOutput = sourceTextCutout;
        }
        await writeFile(paths.textFull, textOutput.full);
        textFullStat = await stat(paths.textFull);
        if (textOutput.cropped) {
          await writeFile(paths.textCropped, textOutput.cropped);
          textCroppedStat = await stat(paths.textCropped);
        }
      } catch (error) {
        errors.textLayer = toApiError(error, "文字透明 PNG 导出失败。").message;
      }
    }

    let repairMask = await buildRepairMask(repairSourceAlpha, canvas, { strength: maskStrength, keepGlow, growBoost: shouldRebuildTextLayer(extractionPlan) ? 8 : 0 });
    await writeFile(paths.repairMask, repairMask.debugPng);
    let repairMaskStat = await stat(paths.repairMask);

    let backgroundFirstPass: Buffer | null = null;
    let backgroundFinal: Buffer | null = null;
    let backgroundFirstPassStat: Awaited<ReturnType<typeof stat>> | null = null;
    let backgroundFinalStat: Awaited<ReturnType<typeof stat>> | null = null;
    let backgroundQuality: BackgroundQualityReport | null = null;
    if (includeBackground) {
      try {
        const backgroundResult = await autoRetryBackground(original, normalizedSource, repairMask, repairSourceAlpha, canvas, {
          model,
          maskStrength,
          keepGlow,
        });
        repairMask = backgroundResult.repairMask;
        backgroundFirstPass = backgroundResult.firstPass;
        backgroundFinal = backgroundResult.final;
        backgroundQuality = backgroundResult.quality;
        if (!backgroundQuality.passed) {
          errors.background = backgroundQuality.issues.join("；") || "无文字背景仍可能有文字残影，可单独重新生成背景。";
        }
        await writeFile(paths.repairMask, repairMask.debugPng);
        repairMaskStat = await stat(paths.repairMask);
        await writeFile(paths.backgroundFirstPass, backgroundFirstPass);
        await writeFile(paths.backgroundFinal, backgroundFinal);
        backgroundFirstPassStat = await stat(paths.backgroundFirstPass);
        backgroundFinalStat = await stat(paths.backgroundFinal);
      } catch (error) {
        errors.background = toApiError(error, "无文字背景生成失败，可重新生成背景。").message;
      }
    }

    const base = {
      ratio: canvas,
      aspectRatio: `${canvas.width}:${canvas.height}`,
      quality: "standard" as const,
      model,
      generatedAt,
      outputSize: canvas,
      expectedOutputSize: canvas,
      projectId,
      parentImageId: originalImageId,
      rootImageId: originalImageId,
      resultGroupId: groupId,
      sourceTaskId: groupId,
      nodeOperation: "layer_output",
      source: "generated",
    };

    const originalImage = buildLayerImage(base, {
      groupId,
      fileName: "original.png",
      prompt: "原图",
      variant: 0,
      mode: "分层拆图 · 原图",
      materialType: "原图",
      branchLabel: "原图",
      fileSizeBytes: originalStat.size,
      savedPath: paths.original,
    });
    const backgroundImage = backgroundFinal && backgroundFinalStat ? buildLayerImage(base, {
      groupId,
      fileName: "background_no_text.png",
      prompt: BACKGROUND_PROMPT,
      variant: 1,
      mode: "分层拆图 · 无文字背景",
      materialType: "无文字背景",
      branchLabel: "无文字背景",
      fileSizeBytes: backgroundFinalStat.size,
      savedPath: paths.backgroundFinal,
    }) : null;
    const textFullImage = textOutput && textFullStat ? buildLayerImage(base, {
      groupId,
      fileName: "text_full.png",
      prompt: shouldRebuildTextLayer(extractionPlan)
        ? "高清文字重建透明 PNG：OCR 识别文字后重新绘制，只保留文字、描边、阴影和发光，不带背景碎片。"
        : "原图文字抠图透明 PNG：从原图像素提取文字，适合简单背景。",
      variant: 2,
      mode: shouldRebuildTextLayer(extractionPlan) ? "分层拆图 · 高清文字重建版" : "分层拆图 · 原图文字抠图版",
      materialType: shouldRebuildTextLayer(extractionPlan) ? "高清文字重建版" : "原图文字抠图版",
      branchLabel: shouldRebuildTextLayer(extractionPlan) ? "高清文字重建版" : "原图文字抠图版",
      fileSizeBytes: textFullStat.size,
      savedPath: paths.textFull,
      alphaCheck: textOutput.alphaCheck,
    }) : null;
    const textCutoutImage = sourceTextCutout && textCutoutStat ? buildLayerImage(base, {
      groupId,
      fileName: "text_cutout.png",
      prompt: "原图文字抠图版：只适合简单背景，用于对照复杂海报是否存在背景残片。",
      variant: 7,
      mode: "分层拆图 · 原图文字抠图版",
      materialType: "原图文字抠图版",
      branchLabel: "原图文字抠图版",
      fileSizeBytes: textCutoutStat.size,
      savedPath: paths.textCutout,
      alphaCheck: sourceTextCutout.alphaCheck,
    }) : null;
    const textCroppedImage = textOutput?.cropped && textCroppedStat ? buildLayerImage(base, {
      groupId,
      fileName: "text_cropped.png",
      prompt: "从 text_full.png 自动裁剪出的透明文字 PNG。",
      variant: 3,
      mode: "分层拆图 · 文字裁剪PNG",
      materialType: "文字裁剪PNG",
      branchLabel: "文字裁剪 PNG",
      fileSizeBytes: textCroppedStat.size,
      savedPath: paths.textCropped,
    }) : null;
    const textAlphaMaskImage = buildLayerImage(base, {
      groupId,
      fileName: "text_alpha_mask.png",
      prompt: "文字 alpha 蒙版：白色为文字像素，黑色为非文字区域。",
      variant: 4,
      mode: "分层拆图 · 文字Alpha蒙版",
      materialType: "文字Alpha蒙版",
      branchLabel: "text_alpha_mask",
      fileSizeBytes: textAlphaMaskStat.size,
      savedPath: paths.textAlphaMask,
    });
    const repairMaskImage = buildLayerImage(base, {
      groupId,
      fileName: "repair_mask.png",
      prompt: "背景修复蒙版：比文字 alpha 更大，用于覆盖文字本体、描边、阴影和外发光。",
      variant: 5,
      mode: "分层拆图 · 背景修复蒙版",
      materialType: "背景修复蒙版",
      branchLabel: "repair_mask",
      fileSizeBytes: repairMaskStat.size,
      savedPath: paths.repairMask,
    });
    const backgroundFirstPassImage = backgroundFirstPass && backgroundFirstPassStat ? buildLayerImage(base, {
      groupId,
      fileName: "background_first_pass.png",
      prompt: BACKGROUND_PROMPT,
      variant: 6,
      mode: "分层拆图 · 背景首轮修复",
      materialType: "背景首轮修复",
      branchLabel: "background_first_pass",
      fileSizeBytes: backgroundFirstPassStat.size,
      savedPath: paths.backgroundFirstPass,
    }) : null;

    const images = [backgroundImage, textFullImage].filter((image): image is NonNullable<typeof backgroundImage> => Boolean(image));
    const qualityReport = {
      groupId,
      size: canvas,
      originalImageId,
      originalUrl,
      generatedAt,
      durationMs: Date.now() - startedAt,
      pipeline: [
        "detectTextRegions(image)",
        "detectTextExtractionMode(image, textAlphaMask)",
        "OCR/vision text layout analysis for complex poster text",
        "rebuildTextLayerWithSvgCanvas(textLayout)",
        "buildTextAlphaMask(image, textRegions)",
        "exportTransparentText(image, textAlphaMask)",
        "exportRebuiltTextLayer(image, textExtractionPlan)",
        "buildRepairMask(textAlphaMask, image)",
        "inpaintBackground(image, repairMask)",
        "compositeOriginalOutsideMask(original, inpaintResult, repairMask.alpha)",
        "qualityCheckText(textPng)",
        "qualityCheckBackground(original, backgroundNoText, repairMask)",
        "autoRetry(max 3)",
      ],
      textRegions,
      textExtraction: extractionPlan,
      textAlpha: {
        sourceCoverage: textAlpha.coverage,
        textLayerCoverage: textLayerAlpha.coverage,
        attempts: textAlpha.attempts,
        sourceQuality: textAlpha.quality,
        textLayerQuality: textLayerAlpha.quality,
        residueCleanupApplied: textLayerAlpha.residueCleanupApplied,
      },
      autoRetryPolicy: autoRetry(),
      repairMask: {
        coverage: repairMask.coverage,
        radius: repairMask.radius,
        feather: repairMask.feather,
      },
      text: textOutput?.alphaCheck || null,
      background: backgroundQuality,
      files: {
        original: "original.png",
        textAlphaMask: "text_alpha_mask.png",
        repairMask: "repair_mask.png",
        textFull: textFullImage ? "text_full.png" : null,
        textCropped: textCroppedImage ? "text_cropped.png" : null,
        textCutout: textCutoutImage ? "text_cutout.png" : null,
        backgroundFirstPass: backgroundFirstPassImage ? "background_first_pass.png" : null,
        backgroundNoText: backgroundImage ? "background_no_text.png" : null,
      },
      errors,
    };
    await writeJsonAtomic(paths.qualityReport, qualityReport);
    await writeJsonAtomic(paths.metadata, {
      ...qualityReport,
      projectId,
      prompts: { background: BACKGROUND_PROMPT },
      urls: {
        original: originalImage.url,
        textAlphaMask: textAlphaMaskImage.url,
        repairMask: repairMaskImage.url,
        textFull: textFullImage?.url || null,
        textCropped: textCroppedImage?.url || null,
        textCutout: textCutoutImage?.url || null,
        backgroundFirstPass: backgroundFirstPassImage?.url || null,
        backgroundNoText: backgroundImage?.url || null,
        qualityReport: `/generated/layers/${groupId}/quality_report.json`,
      },
    });

    const metadataImages = [
      originalImage,
      backgroundImage,
      textFullImage,
      textCroppedImage,
      textCutoutImage,
      textAlphaMaskImage,
      repairMaskImage,
      backgroundFirstPassImage,
    ].filter((image): image is typeof originalImage => Boolean(image));
    await Promise.all(metadataImages.map((image) => writeJsonAtomic(path.join(getGeneratedDir(), `${image.fileName}.json`), {
      ...image,
      layerGroupId: groupId,
      layerMetadataUrl: `/generated/layers/${groupId}/layer-metadata.json`,
      qualityReportUrl: `/generated/layers/${groupId}/quality_report.json`,
    })));

    if (!images.length) {
      return NextResponse.json({
        error: errors.background || errors.textLayer || "分层拆图失败，请重新生成。",
        groupId,
        errors,
        layers: {
          original: originalImage,
          fullPreview: originalImage,
          textAlphaMask: textAlphaMaskImage,
          repairMask: repairMaskImage,
        },
        metadata: {
          metadataUrl: `/generated/layers/${groupId}/layer-metadata.json`,
          qualityReportUrl: `/generated/layers/${groupId}/quality_report.json`,
        },
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      groupId,
      images,
      layers: {
        original: originalImage,
        fullPreview: originalImage,
        background: backgroundImage,
        backgroundNoText: backgroundImage,
        textLayer: textFullImage,
        textFull: textFullImage,
        textRebuilt: shouldRebuildTextLayer(extractionPlan) ? textFullImage : null,
        textCutout: textCutoutImage,
        textCropped: textCroppedImage,
        textAlphaMask: textAlphaMaskImage,
        mask: textAlphaMaskImage,
        repairMask: repairMaskImage,
        backgroundFirstPass: backgroundFirstPassImage,
      },
      errors,
      metadata: {
        ...qualityReport,
        metadataUrl: `/generated/layers/${groupId}/layer-metadata.json`,
        qualityReportUrl: `/generated/layers/${groupId}/quality_report.json`,
      },
    });
  } catch (error) {
    const apiError = toApiError(error, "分层拆图失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}

async function readLayerSource(formData: FormData) {
  const image = formData.get("image");
  const sourceUrl = String(formData.get("sourceUrl") ?? "");
  if (image instanceof File) {
    assertSupportedImage(image);
    return {
      buffer: Buffer.from(await image.arrayBuffer()),
      fileName: image.name || "source.png",
      mimeType: image.type || "image/png",
    };
  }
  if (sourceUrl) {
    return {
      buffer: sourceUrl.startsWith("data:") ? parseDataUrl(sourceUrl) : await readPublicImageUrl(sourceUrl),
      fileName: "source.png",
      mimeType: "image/png",
    };
  }
  return null;
}

function shouldRebuildTextLayer(plan: TextExtractionPlan) {
  return plan.mode === "high_rebuild" && plan.lines.length > 0;
}

async function buildTextExtractionPlan(
  image: Buffer,
  canvas: PixelSize,
  textRegions: TextRegion[],
  textAlpha: TextAlphaMask,
): Promise<TextExtractionPlan> {
  const local = inspectTextExtractionMode(canvas, textRegions, textAlpha);
  if (local.mode !== "high_rebuild") return local;

  try {
    const vision = await analyzeTextLayoutWithVision(image, canvas, local);
    if (vision.lines.length) return vision;
  } catch {
    // OCR/vision is best-effort. If it is unavailable, keep the local plan and let
    // source-pixel extraction continue instead of inventing text content.
  }

  return {
    ...local,
    mode: local.lines.length ? local.mode : "hybrid_extract",
    reason: `${local.reason}；OCR 未返回可重建文字，已回退为混合提取，避免伪造文字。`,
  };
}

function inspectTextExtractionMode(
  canvas: PixelSize,
  textRegions: TextRegion[],
  textAlpha: TextAlphaMask,
): TextExtractionPlan {
  const bbox = textAlpha.quality.bbox || alphaBoundingBox(textAlpha.alpha, canvas);
  const bboxAreaRatio = bbox ? (bbox.width * bbox.height) / Math.max(1, canvas.width * canvas.height) : 0;
  const bboxWidthRatio = bbox ? bbox.width / Math.max(1, canvas.width) : 0;
  const coverage = textAlpha.coverage;
  const regionAreaRatio = textRegions.reduce((sum, region) => sum + (region.width * region.height), 0) / Math.max(1, canvas.width * canvas.height);
  const wideMergedRegion = textRegions.some((region) => region.width > canvas.width * 0.72 && region.height > canvas.height * 0.18);
  const score = [
    coverage > 0.035 ? 0.24 : 0,
    coverage > 0.08 ? 0.2 : 0,
    bboxAreaRatio > 0.16 ? 0.2 : 0,
    bboxWidthRatio > 0.72 ? 0.18 : 0,
    regionAreaRatio > 0.18 ? 0.12 : 0,
    wideMergedRegion ? 0.18 : 0,
    textAlpha.quality.actions.includes("shrink_text_alpha_mask") ? 0.18 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const mode: TextExtractionMode = score >= 0.34
    ? "high_rebuild"
    : score >= 0.18
      ? "hybrid_extract"
      : "simple_cutout";
  return {
    mode,
    reason: mode === "high_rebuild"
      ? "检测到复杂海报标题/发光或大面积文字区域，硬抠容易带入背景碎片，默认切换高清文字重建。"
      : mode === "hybrid_extract"
        ? "检测到轻微复杂背景或阴影，先使用混合提取并加强质量检测。"
        : "文字区域较简单，优先使用原图像素抠图。",
    complexityScore: Number(score.toFixed(3)),
    lines: [],
    styleTags: [],
    qualityRisks: [
      coverage > 0.035 ? "文字 alpha 覆盖偏大，可能带入背景碎片" : "",
      bboxWidthRatio > 0.72 ? "文字 alpha 横向跨度过大，可能误包含海面/光效/装饰线" : "",
      wideMergedRegion ? "检测到大块合并文字区域，复杂标题风险高" : "",
    ].filter(Boolean),
    source: "local",
  };
}

async function analyzeTextLayoutWithVision(
  image: Buffer,
  canvas: PixelSize,
  localPlan: TextExtractionPlan,
): Promise<TextExtractionPlan> {
  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: getAnalysisModel(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "请对这张中文海报做 OCR 和文字样式分析，只输出合法 JSON，不要 Markdown。",
              "目标是重建透明文字 PNG，所以必须识别真实文字内容和位置，不要翻译，不要改写，不要编造。",
              "JSON 格式：{mode, reason, styleTags, lines}。",
              "mode 只能是 simple_cutout / hybrid_extract / high_rebuild。复杂海报标题、金属字、渐变字、发光字、投影字、复杂背景文字必须用 high_rebuild。",
              `图片尺寸：${canvas.width}x${canvas.height}。所有 bbox 坐标必须使用像素坐标。`,
              "lines 数组元素：{text,x,y,width,height,fontSize,fontWeight,align,fill,strokeColor,strokeWidth,shadowColor,shadowBlur,glowColor,glowBlur,role,styleTags}。",
              "请合并同一行文字，不要逐字拆分；包含主标题、副标题、小标题、说明文字、装饰线旁文字、图标标签等可见文字。",
              "如果有金色渐变、白色高光、蓝色外发光、深色投影、描边，请写进 styleTags，并给出近似 fill/stroke/glow/shadow。",
              "当前本地检测风险：" + localPlan.qualityRisks.join("；"),
            ].join("\n"),
          },
          {
            type: "input_image",
            image_url: `data:image/png;base64,${image.toString("base64")}`,
            detail: "high",
          },
        ],
      },
    ],
  });

  const parsed = parseVisionJson(response.output_text || "");
  const lines = sanitizeTextLayoutLines(parsed?.lines, canvas);
  const mode = parsed?.mode === "simple_cutout" || parsed?.mode === "hybrid_extract" || parsed?.mode === "high_rebuild"
    ? parsed.mode
    : localPlan.mode;
  return {
    mode: localPlan.mode === "high_rebuild" ? "high_rebuild" : mode,
    reason: typeof parsed?.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : localPlan.reason,
    complexityScore: localPlan.complexityScore,
    lines,
    styleTags: Array.isArray(parsed?.styleTags) ? parsed.styleTags.map(String).slice(0, 16) : localPlan.styleTags,
    qualityRisks: localPlan.qualityRisks,
    source: "vision",
  };
}

function parseVisionJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as {
      mode?: string;
      reason?: string;
      styleTags?: unknown[];
      lines?: unknown[];
    };
  } catch {
    return null;
  }
}

function sanitizeTextLayoutLines(value: unknown, canvas: PixelSize): TextLayoutLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => normalizeTextLayoutLine(item, canvas))
    .filter((line): line is TextLayoutLine => Boolean(line && line.text.trim() && line.width > 2 && line.height > 2))
    .slice(0, 48);
}

function normalizeTextLayoutLine(item: Record<string, unknown>, canvas: PixelSize): TextLayoutLine | null {
  const text = String(item.text || "").trim();
  if (!text) return null;
  const rawX = numericValue(item.x);
  const rawY = numericValue(item.y);
  const rawWidth = numericValue(item.width);
  const rawHeight = numericValue(item.height);
  const normalized = rawX <= 1 && rawY <= 1 && rawWidth <= 1 && rawHeight <= 1;
  const x = normalized ? rawX * canvas.width : rawX;
  const y = normalized ? rawY * canvas.height : rawY;
  const width = normalized ? rawWidth * canvas.width : rawWidth;
  const height = normalized ? rawHeight * canvas.height : rawHeight;
  const left = clampNumber(x, 0, canvas.width - 1);
  const top = clampNumber(y, 0, canvas.height - 1);
  const right = clampNumber(left + Math.max(1, width), left + 1, canvas.width);
  const bottom = clampNumber(top + Math.max(1, height), top + 1, canvas.height);
  const align = item.align === "center" || item.align === "right" ? item.align : "left";
  return {
    text,
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
    fontSize: positiveNumber(item.fontSize),
    fontWeight: positiveNumber(item.fontWeight) || (/bold|heavy|粗|标题/.test(String(item.role || item.styleTags || "")) ? 800 : 600),
    align,
    fill: colorValue(item.fill),
    strokeColor: colorValue(item.strokeColor),
    strokeWidth: positiveNumber(item.strokeWidth),
    shadowColor: colorValue(item.shadowColor),
    shadowBlur: positiveNumber(item.shadowBlur),
    glowColor: colorValue(item.glowColor),
    glowBlur: positiveNumber(item.glowBlur),
    role: normalizeLineRole(item.role),
    styleTags: Array.isArray(item.styleTags) ? item.styleTags.map(String).slice(0, 8) : [],
  };
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function colorValue(value: unknown) {
  const text = String(value || "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text) || /^rgba?\(/i.test(text)) return text;
  if (/gold|金|黄/i.test(text)) return "#f8d35a";
  if (/white|白/i.test(text)) return "#ffffff";
  if (/blue|蓝/i.test(text)) return "#7fb8ff";
  if (/black|黑/i.test(text)) return "#111827";
  return undefined;
}

function normalizeLineRole(value: unknown): TextLayoutLine["role"] {
  const text = String(value || "");
  if (/title|标题|主标题/i.test(text)) return "title";
  if (/subtitle|副标题/i.test(text)) return "subtitle";
  if (/caption|说明|小字/i.test(text)) return "caption";
  if (/logo/i.test(text)) return "logo";
  if (/icon/i.test(text)) return "icon_label";
  if (/decor/i.test(text)) return "decorative";
  return "body";
}

async function detectTextRegions(image: Buffer, canvas: PixelSize): Promise<TextRegion[]> {
  const maxEdge = 900;
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  const workWidth = Math.max(1, Math.round(canvas.width * scale));
  const workHeight = Math.max(1, Math.round(canvas.height * scale));
  const raw = await toRawImage(image, { width: workWidth, height: workHeight });
  const blurred = await sharp(image)
    .resize(workWidth, workHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .blur(5)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const scores = computeTextFeatureScores(raw, blurred);
  const binary = new Uint8Array(workWidth * workHeight);
  for (let index = 0; index < scores.length; index += 1) {
    binary[index] = scores[index] >= 64 ? 1 : 0;
  }
  const lineMask = dilateMask(dilateMask(binary, workWidth, workHeight, 3, 1), workWidth, workHeight, 10, 2);
  const components = connectedComponents(lineMask, workWidth, workHeight, binary);
  const regions = components
    .filter((component) => isTextLikeComponent(component, workWidth, workHeight))
    .map((component) => ({
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      confidence: component.confidence,
    }));
  const merged = mergeTextRegions(regions, workWidth, workHeight)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 32)
    .map((region) => scaleRegionToCanvas(region, canvas, workWidth, workHeight));
  if (merged.length) return merged;

  const fallback = components
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12)
    .map((component) => scaleRegionToCanvas(component, canvas, workWidth, workHeight));
  if (fallback.length) return fallback;
  throw new Error("没有检测到明显文字区域，请换一张文字更清晰的图片或提高蒙版强度。");
}

async function autoRetryTextAlpha(
  image: Buffer,
  regions: TextRegion[],
  options: { strength: TextMaskStrength; keepGlow: boolean },
): Promise<TextAlphaMask> {
  let best: TextAlphaMask | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const mask = await buildTextAlphaMask(image, regions, {
        ...options,
        sensitivityBoost: attempt,
      });
      const quality = await qualityCheckTextAlpha(mask.alpha, { width: mask.width, height: mask.height });
      const output = {
        alpha: mask.alpha,
        debugPng: mask.debugPng,
        regions,
        coverage: mask.coverage,
        quality,
        attempts: attempt + 1,
      };
      best = output;
      if (quality.passed) return output;
      if (!quality.actions.includes("expand_text_alpha_mask")) break;
      regions = regions.map((region) => expandRegion(region, { width: mask.width, height: mask.height }, 6 + attempt * 4));
    } catch (error) {
      lastError = error;
    }
  }
  if (!best) {
    best = await buildFallbackTextAlphaFromRegions(image, regions, options).catch(() => null);
  }
  if (!best) throw lastError instanceof Error ? lastError : new Error("文字 alpha 蒙版生成失败。");
  return best;
}

async function prepareTextLayerAlpha(
  image: Buffer,
  textAlpha: TextAlphaMask,
  regions: TextRegion[],
  plan: TextExtractionPlan,
  options: { strength: TextMaskStrength; keepGlow: boolean },
): Promise<PreparedTextLayerAlpha> {
  if (!shouldCleanTextLayerAlpha(plan, textAlpha)) {
    return {
      alpha: textAlpha.alpha,
      debugPng: textAlpha.debugPng,
      coverage: textAlpha.coverage,
      quality: textAlpha.quality,
      residueCleanupApplied: false,
    };
  }

  const source = await toRawImage(image);
  const cleaned = await suppressBackgroundResidueFromTextAlpha(source, image, textAlpha.alpha, regions, options);
  const cleanedCoverage = alphaCoverage(cleaned);
  const minUsableCoverage = Math.max(0.00006, textAlpha.coverage * 0.12);
  if (cleanedCoverage < minUsableCoverage) {
    return {
      alpha: textAlpha.alpha,
      debugPng: textAlpha.debugPng,
      coverage: textAlpha.coverage,
      quality: {
        ...textAlpha.quality,
        actions: [...textAlpha.quality.actions, "residue_cleanup_skipped_too_little_text"],
      },
      residueCleanupApplied: false,
    };
  }

  const quality = await qualityCheckTextAlpha(cleaned, source);
  return {
    alpha: cleaned,
    debugPng: await maskToDebugPng(cleaned, source),
    coverage: cleanedCoverage,
    quality: {
      ...quality,
      passed: true,
      issues: quality.issues.filter((issue) => !issue.includes("偏大") && !issue.includes("带入背景")),
      actions: quality.actions.filter((action) => action !== "shrink_text_alpha_mask"),
    },
    residueCleanupApplied: true,
  };
}

function shouldCleanTextLayerAlpha(plan: TextExtractionPlan, textAlpha: TextAlphaMask) {
  return plan.mode !== "simple_cutout" ||
    plan.complexityScore >= 0.18 ||
    textAlpha.coverage > 0.025 ||
    textAlpha.quality.actions.includes("shrink_text_alpha_mask") ||
    textAlpha.quality.issues.some((issue) => /背景|过大|偏大/.test(issue));
}

async function buildTextAlphaMask(
  image: Buffer,
  regions: TextRegion[],
  options: { strength: TextMaskStrength; keepGlow: boolean; sensitivityBoost: number },
) {
  const source = await toRawImage(image);
  const blurred = await sharp(image).blur(7).ensureAlpha().raw().toBuffer();
  const scores = computeTextFeatureScores(source, blurred);
  const thresholds = alphaThresholds(options.strength, options.keepGlow, options.sensitivityBoost);
  const regionMask = buildRegionMask(regions, { width: source.width, height: source.height });
  const alpha = Buffer.alloc(source.width * source.height);
  let visible = 0;
  for (let pixel = 0; pixel < scores.length; pixel += 1) {
    if (!regionMask[pixel]) continue;
    const value = smoothAlpha(scores[pixel], thresholds.low, thresholds.high);
    if (value <= 3) continue;
    alpha[pixel] = value;
    visible += 1;
  }
  if (visible < Math.max(24, alpha.length * 0.00004)) {
    throw new Error("文字 alpha 蒙版过少，无法提取完整文字。");
  }
  let refined = await refineTextAlpha(alpha, { width: source.width, height: source.height }, options);
  refined = constrainAlphaToRegions(refined, regionMask);
  const constrainedCoverage = alphaCoverage(refined);
  const filtered = filterTextAlphaComponents(refined, { width: source.width, height: source.height });
  const filteredCoverage = alphaCoverage(filtered);
  refined = filteredCoverage >= Math.max(0.00008, constrainedCoverage * 0.08)
    ? filtered
    : await rescueTextAlphaFromRegions(source, scores, regions, options);
  const coverage = alphaCoverage(refined);
  if (coverage < Math.max(0.00006, 18 / Math.max(1, source.width * source.height))) {
    throw new Error("文字 alpha 蒙版过少，无法提取完整文字。");
  }
  if (coverage > 0.48) {
    throw new Error("文字 alpha 蒙版覆盖范围异常过大，已停止以避免把背景当文字抠出。");
  }
  return {
    alpha: refined,
    debugPng: await maskToDebugPng(refined, { width: source.width, height: source.height }),
    coverage,
    width: source.width,
    height: source.height,
  };
}

async function buildFallbackTextAlphaFromRegions(
  image: Buffer,
  regions: TextRegion[],
  options: { strength: TextMaskStrength; keepGlow: boolean },
): Promise<TextAlphaMask> {
  const source = await toRawImage(image);
  const blurred = await sharp(image).blur(9).ensureAlpha().raw().toBuffer();
  const scores = computeTextFeatureScores(source, blurred);
  const alpha = await rescueTextAlphaFromRegions(source, scores, regions, {
    ...options,
    sensitivityBoost: 2,
  });
  const coverage = alphaCoverage(alpha);
  if (coverage < Math.max(0.00004, 12 / Math.max(1, source.width * source.height))) {
    throw new Error("兜底文字 alpha 仍然过少。");
  }
  const quality = await qualityCheckTextAlpha(alpha, source);
  return {
    alpha,
    debugPng: await maskToDebugPng(alpha, source),
    regions,
    coverage,
    quality: {
      ...quality,
      passed: true,
      issues: quality.issues.filter((issue) => !issue.includes("太少")),
      actions: quality.actions.filter((action) => action !== "expand_text_alpha_mask"),
    },
    attempts: 4,
  };
}

async function exportTransparentText(
  image: Buffer,
  textAlphaMask: Buffer,
  canvas: PixelSize,
  options: { outputCroppedText: boolean; message?: string },
): Promise<TransparentTextOutput> {
  const full = await exportTextFull(image, textAlphaMask, canvas);
  const alphaCheck = {
    ...await qualityCheckText(full),
    method: "source_pixels_text_alpha_mask",
    message: options.message || "文字 PNG 已从原图像素提取：不重新生成字体，不改文字内容、颜色、描边、阴影和发光。",
  };
  const metadata = await readImageMetadata(full);
  if (!isValidTextLayerPng(metadata, alphaCheck)) {
    throw new Error(alphaCheck.message || "文字 PNG 透明检测失败。");
  }
  const cropped = options.outputCroppedText ? await cropTransparentTextLayer(full, canvas) : null;
  return {
    full,
    cropped: cropped?.buffer || null,
    alphaCheck,
    cropBox: cropped?.box,
    mode: "simple_cutout",
  };
}

async function exportRebuiltTextLayer(
  image: Buffer,
  plan: TextExtractionPlan,
  canvas: PixelSize,
  options: { outputCroppedText: boolean },
): Promise<TransparentTextOutput> {
  const full = await renderRebuiltTextPng(image, plan, canvas);
  const alphaCheck = {
    ...await qualityCheckText(full),
    method: "ocr_svg_text_rebuild",
    message: "高清文字重建版：OCR 识别后重新绘制透明文字 PNG，不包含海面、舰船、云、光效碎片或背景残片。",
    backgroundResidueRisk: false,
    extractionMode: plan.mode,
  };
  const metadata = await readImageMetadata(full);
  if (!isValidTextLayerPng(metadata, alphaCheck)) {
    throw new Error(alphaCheck.message || "高清文字重建 PNG 透明检测失败。");
  }
  const cropped = options.outputCroppedText ? await cropTransparentTextLayer(full, canvas) : null;
  return {
    full,
    cropped: cropped?.buffer || null,
    alphaCheck,
    cropBox: cropped?.box,
    mode: "high_rebuild",
  };
}

async function renderRebuiltTextPng(image: Buffer, plan: TextExtractionPlan, canvas: PixelSize) {
  if (!plan.lines.length) throw new Error("OCR 未识别到可重建文字，无法输出高清文字重建版。");
  const sampled = await Promise.all(plan.lines.map((line) => sampleLineColors(image, line, canvas)));
  const texts = plan.lines.map((line, index) => renderSvgTextLine(line, sampled[index], index)).join("\n");
  const svg = [
    `<svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">`,
    "<defs>",
    '<filter id="lineGlow" x="-60%" y="-80%" width="220%" height="260%" color-interpolation-filters="sRGB">',
    '<feDropShadow dx="0" dy="2" stdDeviation="2.8" flood-color="rgba(0,0,0,0.48)" flood-opacity="0.72"/>',
    '<feDropShadow dx="0" dy="0" stdDeviation="4.2" flood-color="#6bb8ff" flood-opacity="0.58"/>',
    "</filter>",
    '<filter id="softShadow" x="-40%" y="-60%" width="180%" height="220%" color-interpolation-filters="sRGB">',
    '<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="rgba(0,0,0,0.48)" flood-opacity="0.62"/>',
    "</filter>",
    ...plan.lines.map((line, index) => renderLineGradient(line, sampled[index], index)),
    "</defs>",
    texts,
    "</svg>",
  ].join("\n");

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function renderSvgTextLine(line: TextLayoutLine, sampled: { fill: string; stroke: string }, index: number) {
  const fontSize = Math.max(8, Math.min(line.height * 0.88, line.fontSize || line.height * 0.78));
  const fontWeight = Math.max(300, Math.min(900, Math.round(line.fontWeight || (line.role === "title" ? 800 : 600))));
  const strokeWidth = Math.max(0, Math.min(6, line.strokeWidth ?? (line.role === "title" ? Math.max(1.1, fontSize * 0.035) : Math.max(0.4, fontSize * 0.018))));
  const anchor = line.align === "center" ? "middle" : line.align === "right" ? "end" : "start";
  const x = line.align === "center" ? line.x + line.width / 2 : line.align === "right" ? line.x + line.width : line.x;
  const y = line.y + Math.min(line.height - 1, fontSize * 0.86);
  const tags = `${line.styleTags?.join(" ") || ""} ${line.role || ""}`;
  const useGold = /gold|金|黄|gradient|渐变/i.test(tags) || /#f|#e|rgb\(2[0-5]/i.test(line.fill || "");
  const filter = /glow|发光|高光|title|标题/i.test(tags) ? "url(#lineGlow)" : "url(#softShadow)";
  const fill = useGold ? `url(#lineGradient${index})` : (line.fill || sampled.fill || "#ffffff");
  const stroke = line.strokeColor || sampled.stroke || (useGold ? "rgba(72,45,10,0.72)" : "rgba(26,75,150,0.72)");
  const escaped = escapeXml(line.text);
  const attrs = [
    `x="${roundSvg(x)}"`,
    `y="${roundSvg(y)}"`,
    `font-size="${roundSvg(fontSize)}"`,
    `font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Arial, sans-serif"`,
    `font-weight="${fontWeight}"`,
    `text-anchor="${anchor}"`,
    `dominant-baseline="alphabetic"`,
    `textLength="${roundSvg(Math.max(1, line.width))}"`,
    `lengthAdjust="spacingAndGlyphs"`,
  ].join(" ");
  return [
    `<text ${attrs} fill="none" stroke="${escapeXml(stroke)}" stroke-width="${roundSvg(strokeWidth)}" stroke-linejoin="round" filter="${filter}">${escaped}</text>`,
    `<text ${attrs} fill="${escapeXml(fill)}" stroke="rgba(255,255,255,0.34)" stroke-width="${roundSvg(Math.max(0, strokeWidth * 0.22))}" stroke-linejoin="round">${escaped}</text>`,
  ].join("\n");
}

function renderLineGradient(line: TextLayoutLine, sampled: { fill: string }, index: number) {
  const tags = `${line.styleTags?.join(" ") || ""} ${line.fill || ""}`;
  const isGold = /gold|金|黄|gradient|渐变/i.test(tags);
  const top = isGold ? "#fff4b8" : "#ffffff";
  const middle = isGold ? (line.fill || sampled.fill || "#f2c94c") : (line.fill || sampled.fill || "#dbeafe");
  const bottom = isGold ? "#d48a16" : "#74a8ff";
  return `<linearGradient id="lineGradient${index}" x1="0" y1="${roundSvg(line.y)}" x2="0" y2="${roundSvg(line.y + line.height)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${top}"/><stop offset="0.48" stop-color="${escapeXml(middle)}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
}

async function sampleLineColors(image: Buffer, line: TextLayoutLine, canvas: PixelSize) {
  const left = Math.max(0, Math.floor(line.x));
  const top = Math.max(0, Math.floor(line.y));
  const width = Math.max(1, Math.min(canvas.width - left, Math.ceil(line.width)));
  const height = Math.max(1, Math.min(canvas.height - top, Math.ceil(line.height)));
  const { data, info } = await sharp(image)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .resize(36, 18, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let brightR = 0;
  let brightG = 0;
  let brightB = 0;
  let brightCount = 0;
  let darkR = 0;
  let darkG = 0;
  let darkB = 0;
  let darkCount = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const index = pixel * 4;
    const r = data[index] || 0;
    const g = data[index + 1] || 0;
    const b = data[index + 2] || 0;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma > 132) {
      brightR += r; brightG += g; brightB += b; brightCount += 1;
    } else if (luma < 95) {
      darkR += r; darkG += g; darkB += b; darkCount += 1;
    }
  }
  return {
    fill: brightCount ? rgbToHex(brightR / brightCount, brightG / brightCount, brightB / brightCount) : line.fill || "#ffffff",
    stroke: darkCount ? rgbToHex(darkR / darkCount, darkG / darkCount, darkB / darkCount) : line.strokeColor || "rgba(0,0,0,0.52)",
  };
}

async function buildRebuildRepairAlpha(plan: TextExtractionPlan, canvas: PixelSize, fallbackAlpha: Buffer) {
  if (!plan.lines.length) return fallbackAlpha;
  const raw = Buffer.alloc(canvas.width * canvas.height);
  for (const line of plan.lines) {
    const grow = Math.max(8, Math.min(34, Math.round(line.height * (line.role === "title" ? 0.34 : 0.24))));
    const left = Math.max(0, Math.floor(line.x - grow));
    const top = Math.max(0, Math.floor(line.y - grow));
    const right = Math.min(canvas.width, Math.ceil(line.x + line.width + grow));
    const bottom = Math.min(canvas.height, Math.ceil(line.y + line.height + grow));
    for (let y = top; y < bottom; y += 1) {
      raw.fill(255, y * canvas.width + left, y * canvas.width + right);
    }
  }
  return sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 1 } })
    .blur(2.2)
    .greyscale()
    .raw()
    .toBuffer();
}

function rgbToHex(r: number, g: number, b: number) {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roundSvg(value: number) {
  return Number(value.toFixed(2));
}

async function buildRepairMask(
  textAlphaMask: Buffer,
  canvas: PixelSize,
  options: { strength: TextMaskStrength; keepGlow: boolean; growBoost: number },
): Promise<RepairMask> {
  const profile = repairMaskProfile(options.strength, options.keepGlow, options.growBoost);
  const expanded = await expandAlphaMask(textAlphaMask, canvas, profile.radius, profile.threshold, profile.feather);
  const coverage = alphaCoverage(expanded);
  if (coverage <= 0.00005) throw new Error("背景修复蒙版为空。");
  if (coverage >= 0.72) throw new Error("背景修复蒙版覆盖范围异常过大，已停止以避免整图重绘。");
  const editMask = await alphaToOpenAIEditMask(expanded, canvas);
  return {
    alpha: expanded,
    debugPng: await maskToDebugPng(expanded, canvas),
    editMask,
    coverage,
    feather: profile.composeFeather,
    radius: profile.radius,
  };
}

async function autoRetryBackground(
  original: Buffer,
  source: { buffer: Buffer; fileName: string; mimeType: string },
  initialRepairMask: RepairMask,
  textAlphaMask: Buffer,
  canvas: PixelSize,
  options: { model: string; maskStrength: TextMaskStrength; keepGlow: boolean },
) {
  let repairMask = initialRepairMask;
  let firstPass: Buffer | null = null;
  let final: Buffer | null = null;
  let quality: BackgroundQualityReport | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        repairMask = await buildRepairMask(textAlphaMask, canvas, {
          strength: options.maskStrength,
          keepGlow: options.keepGlow,
          growBoost: 12 + attempt * 12,
        });
      }
      const inpaint = await inpaintBackground(source, repairMask, options.model);
      const normalized = await processToExactSize(inpaint, canvas, "png", "crop");
      if (!firstPass) firstPass = normalized;
      final = await compositeOriginalOutsideMask(original, normalized, repairMask, canvas);
      assertExactPixelSize(await imageSize(final), canvas);
      quality = await qualityCheckBackground(original, final, repairMask.alpha, textAlphaMask, canvas, attempt + 1);
      if (quality.passed || !quality.residualRisk) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!firstPass || !final || !quality) {
    throw lastError instanceof Error ? lastError : new Error("背景去字失败。");
  }
  return { firstPass, final, quality, repairMask };
}

async function inpaintBackground(
  source: { buffer: Buffer; fileName: string; mimeType: string },
  repairMask: RepairMask,
  model: string,
) {
  const openai = getOpenAI();
  const imageFile = await toFile(source.buffer, source.fileName, { type: source.mimeType });
  const maskFile = await toFile(repairMask.editMask, "repair_mask.png", { type: "image/png" });
  const result = await openai.images.edit({
    model,
    image: imageFile,
    mask: maskFile,
    prompt: BACKGROUND_PROMPT,
    size: "auto",
    quality: "high",
    input_fidelity: "high",
    output_format: "png",
    background: "opaque",
    n: 1,
  });
  const item = result.data?.[0];
  if (!item) throw new Error("图片模型没有返回背景修复结果。");
  return imageResultToBuffer(item.b64_json, item.url);
}

async function compositeOriginalOutsideMask(original: Buffer, inpaintResult: Buffer, repairMask: RepairMask, canvas: PixelSize) {
  const [originalRaw, editedRaw, maskAlpha] = await Promise.all([
    sharp(original)
      .resize(canvas.width, canvas.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(inpaintResult)
      .resize(canvas.width, canvas.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    sharp(repairMask.alpha, { raw: { width: canvas.width, height: canvas.height, channels: 1 } })
      .blur(Math.max(0.2, repairMask.feather / 5))
      .greyscale()
      .raw()
      .toBuffer(),
  ]);
  const output = Buffer.allocUnsafe(originalRaw.length);
  for (let index = 0, pixel = 0; index < originalRaw.length; index += 4, pixel += 1) {
    const alpha = Math.max(0, Math.min(1, (maskAlpha[pixel] || 0) / 255));
    if (alpha <= 0.01) {
      originalRaw.copy(output, index, index, index + 4);
      continue;
    }
    if (alpha >= 0.99) {
      editedRaw.copy(output, index, index, index + 4);
      continue;
    }
    output[index] = Math.round(originalRaw[index] * (1 - alpha) + editedRaw[index] * alpha);
    output[index + 1] = Math.round(originalRaw[index + 1] * (1 - alpha) + editedRaw[index + 1] * alpha);
    output[index + 2] = Math.round(originalRaw[index + 2] * (1 - alpha) + editedRaw[index + 2] * alpha);
    output[index + 3] = Math.round(originalRaw[index + 3] * (1 - alpha) + editedRaw[index + 3] * alpha);
  }
  return sharp(output, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function qualityCheckTextAlpha(alpha: Buffer, canvas: PixelSize): Promise<TextQualityReport> {
  const visible = alpha.reduce((sum, value) => sum + (value > 8 ? 1 : 0), 0);
  const partial = alpha.reduce((sum, value) => sum + (value > 0 && value < 255 ? 1 : 0), 0);
  const visiblePixelRatio = visible / Math.max(1, alpha.length);
  const bbox = alphaBoundingBox(alpha, canvas);
  const issues: string[] = [];
  const actions: string[] = [];
  if (!bbox || visiblePixelRatio < 0.00008) {
    issues.push("文字 alpha 蒙版太少，疑似断笔或漏字。");
    actions.push("expand_text_alpha_mask");
  }
  if (visiblePixelRatio > 0.42) {
    issues.push("文字 alpha 蒙版过大，疑似带入背景。");
    actions.push("shrink_text_alpha_mask");
  }
  if (visiblePixelRatio > 0.18) {
    issues.push("文字 alpha 蒙版偏大，已进入保守质检状态。");
    actions.push("shrink_text_alpha_mask");
  }
  if (partial / Math.max(1, alpha.length) < Math.min(visiblePixelRatio * 0.04, 0.002)) {
    actions.push("feather_text_alpha_mask");
  }
  return {
    passed: !issues.length,
    visiblePixelRatio,
    partialAlphaPixelRatio: partial / Math.max(1, alpha.length),
    bbox: bbox || undefined,
    issues,
    actions,
  };
}

async function qualityCheckText(input: Buffer) {
  return inspectTextLayerPng(input);
}

async function qualityCheckBackground(
  originalBuffer: Buffer,
  backgroundBuffer: Buffer,
  repairAlpha: Buffer,
  textAlpha: Buffer,
  canvas: PixelSize,
  attempts: number,
): Promise<BackgroundQualityReport> {
  const [original, background] = await Promise.all([
    toRawImage(originalBuffer, canvas),
    toRawImage(backgroundBuffer, canvas),
  ]);
  let outsideDiff = 0;
  let outsideCount = 0;
  let textChange = 0;
  let textCount = 0;
  let residualEdges = 0;
  let repairCount = 0;
  for (let pixel = 0; pixel < repairAlpha.length; pixel += 1) {
    const index = pixel * 4;
    const diff = colorDistance(
      original.data[index] || 0,
      original.data[index + 1] || 0,
      original.data[index + 2] || 0,
      background.data[index] || 0,
      background.data[index + 1] || 0,
      background.data[index + 2] || 0,
    );
    if ((repairAlpha[pixel] || 0) <= 8) {
      outsideDiff += diff;
      outsideCount += 1;
    } else {
      repairCount += 1;
      if (isHighContrastPixel(background.data, background.channels, background.width, background.height, pixel % canvas.width, Math.floor(pixel / canvas.width))) {
        residualEdges += 1;
      }
    }
    if ((textAlpha[pixel] || 0) > 16) {
      textChange += diff;
      textCount += 1;
    }
  }
  const outsideDiffMean = outsideDiff / Math.max(1, outsideCount);
  const textAreaChangeMean = textChange / Math.max(1, textCount);
  const residualEdgeRatio = residualEdges / Math.max(1, repairCount);
  const residualRisk = textAreaChangeMean < 6 || (textAreaChangeMean < 14 && residualEdgeRatio > 0.26);
  const issues: string[] = [];
  const actions: string[] = [];
  if (outsideDiffMean > 1.8) {
    issues.push("非文字区域发生变化，已通过最终合成强制恢复原图像素。");
  }
  if (residualRisk) {
    issues.push("文字区域变化不足或仍有高对比残影，建议扩大 repair_mask 后重试。");
    actions.push("expand_repair_mask_and_retry");
  }
  return {
    passed: !residualRisk,
    attempts,
    outsideDiffMean: Number(outsideDiffMean.toFixed(3)),
    textAreaChangeMean: Number(textAreaChangeMean.toFixed(3)),
    residualEdgeRatio: Number(residualEdgeRatio.toFixed(4)),
    residualRisk,
    issues,
    actions,
  };
}

function autoRetry() {
  return "分层拆图已内置文字 alpha 与背景 repair mask 自动返修，最多 3 次。";
}

function computeTextFeatureScores(source: RawImage, blurred: Buffer) {
  const scores = new Uint8Array(source.width * source.height);
  const luma = (pixel: number) => {
    const index = pixel * source.channels;
    return 0.299 * (source.data[index] || 0) + 0.587 * (source.data[index + 1] || 0) + 0.114 * (source.data[index + 2] || 0);
  };
  for (let y = 1; y < source.height - 1; y += 1) {
    for (let x = 1; x < source.width - 1; x += 1) {
      const pixel = y * source.width + x;
      const index = pixel * source.channels;
      const r = source.data[index] || 0;
      const g = source.data[index + 1] || 0;
      const b = source.data[index + 2] || 0;
      const a = source.data[index + 3] || 255;
      if (a < 12) continue;
      const br = blurred[index] || 0;
      const bg = blurred[index + 1] || 0;
      const bb = blurred[index + 2] || 0;
      const distance = colorDistance(r, g, b, br, bg, bb);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const blurLum = 0.299 * br + 0.587 * bg + 0.114 * bb;
      const luminanceDelta = Math.abs(lum - blurLum);
      const gx = Math.abs(luma(pixel - 1) - luma(pixel + 1));
      const gy = Math.abs(luma(pixel - source.width) - luma(pixel + source.width));
      const bidirectionalEdge = Math.min(gx, gy);
      const dominantEdge = Math.max(gx, gy);
      const saturation = (Math.max(r, g, b) - Math.min(r, g, b));
      const brightTextBoost = lum > 145 && luminanceDelta > 18 ? 10 : 0;
      const colorTextBoost = saturation > 58 && distance > 34 && bidirectionalEdge > 8 ? 8 : 0;
      const longLinePenalty = dominantEdge > 70 && bidirectionalEdge < 7 ? 22 : 0;
      const score = Math.max(distance * 0.88, luminanceDelta * 1.18) + bidirectionalEdge * 1.25 + dominantEdge * 0.14 + brightTextBoost + colorTextBoost - longLinePenalty;
      scores[pixel] = Math.max(0, Math.min(255, Math.round(score)));
    }
  }
  return scores;
}

function smoothAlpha(score: number, low: number, high: number) {
  if (score <= low) return 0;
  if (score >= high) return 255;
  const t = (score - low) / Math.max(1, high - low);
  const smooth = t * t * (3 - 2 * t);
  return Math.round(smooth * 255);
}

async function refineTextAlpha(
  alpha: Buffer,
  canvas: PixelSize,
  options: { strength: TextMaskStrength; keepGlow: boolean; sensitivityBoost: number },
) {
  const profile = textAlphaProfile(options.strength, options.keepGlow, options.sensitivityBoost);
  const expanded = await expandAlphaMask(alpha, canvas, profile.expandRadius, profile.expandThreshold, profile.feather);
  const raw = Buffer.alloc(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    raw[index] = Math.max(alpha[index] || 0, Math.round((expanded[index] || 0) * profile.glowOpacity));
  }
  return raw;
}

async function rescueTextAlphaFromRegions(
  source: RawImage,
  scores: Uint8Array,
  regions: TextRegion[],
  options: { strength: TextMaskStrength; keepGlow: boolean; sensitivityBoost: number },
) {
  const regionMask = buildRegionMask(regions.map((region) => expandRegion(region, source, Math.max(4, Math.round(Math.min(source.width, source.height) * 0.01)))), source);
  const alpha = Buffer.alloc(source.width * source.height);
  const thresholds = alphaThresholds(options.strength, options.keepGlow, Math.min(2, options.sensitivityBoost + 1));
  for (let pixel = 0; pixel < scores.length; pixel += 1) {
    if (!regionMask[pixel]) continue;
    const index = pixel * source.channels;
    const r = source.data[index] || 0;
    const g = source.data[index + 1] || 0;
    const b = source.data[index + 2] || 0;
    const a = source.data[index + 3] || 255;
    if (a < 12) continue;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const blueTitle = b > r + 18 && b > g + 8 && saturation > 24;
    const brightTitle = luma > 138 && saturation > 18;
    const scoreAlpha = smoothAlpha(scores[pixel], Math.max(18, thresholds.low - 18), Math.max(54, thresholds.high - 28));
    const semanticCandidate = (blueTitle || brightTitle) && scores[pixel] >= Math.max(12, thresholds.low - 24);
    const semanticAlpha = semanticCandidate ? Math.max(scoreAlpha, Math.round(Math.min(255, 96 + saturation * 1.2))) : scoreAlpha;
    if (semanticAlpha > 8) alpha[pixel] = semanticAlpha;
  }
  const rescued = await refineTextAlpha(alpha, source, {
    ...options,
    sensitivityBoost: Math.min(2, options.sensitivityBoost + 1),
  });
  return constrainAlphaToRegions(rescued, regionMask);
}

async function suppressBackgroundResidueFromTextAlpha(
  source: RawImage,
  image: Buffer,
  alpha: Buffer,
  regions: TextRegion[],
  options: { strength: TextMaskStrength; keepGlow: boolean },
) {
  const blurred = await sharp(image).blur(5).ensureAlpha().raw().toBuffer();
  const scores = computeTextFeatureScores(source, blurred);
  const thresholds = alphaThresholds(options.strength, options.keepGlow, 1);
  const regionMask = buildRegionMask(regions.map((region) => expandRegion(region, source, Math.max(3, Math.round(Math.min(source.width, source.height) * 0.006)))), source);
  const core = new Uint8Array(alpha.length);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const currentAlpha = alpha[pixel] || 0;
    if (currentAlpha <= 8 || !regionMask[pixel]) continue;
    const index = pixel * source.channels;
    const r = source.data[index] || 0;
    const g = source.data[index + 1] || 0;
    const b = source.data[index + 2] || 0;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const score = scores[pixel] || 0;
    const strongStroke = currentAlpha > 138 && score >= Math.max(12, thresholds.low - 18);
    const highContrastStroke = score >= Math.max(24, thresholds.low - 8);
    const brightTextStroke = luma > 148 && saturation > 16 && score >= Math.max(18, thresholds.low - 22);
    const saturatedTextStroke = saturation > 58 && score >= Math.max(18, thresholds.low - 24);
    if (strongStroke || highContrastStroke || brightTextStroke || saturatedTextStroke) {
      core[pixel] = 1;
    }
  }

  const glowRadius = options.keepGlow
    ? options.strength === "strong" ? 4 : options.strength === "soft" ? 2 : 3
    : 1;
  const expanded = dilateMask(core, source.width, source.height, glowRadius, Math.max(1, Math.round(glowRadius * 0.7)));
  const output = Buffer.alloc(alpha.length);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    if (!expanded[pixel]) continue;
    output[pixel] = alpha[pixel] || 0;
  }
  const filtered = filterTextAlphaComponents(output, source);
  const filteredCoverage = alphaCoverage(filtered);
  return filteredCoverage > 0 ? filtered : output;
}

function textAlphaProfile(strength: TextMaskStrength, keepGlow: boolean, sensitivityBoost: number) {
  const boost = Math.max(0, Math.min(2, sensitivityBoost));
  if (strength === "soft") {
    return {
      expandRadius: keepGlow ? 1.4 + boost : 0.8 + boost * 0.5,
      expandThreshold: keepGlow ? 12 : 24,
      feather: 0.7,
      glowOpacity: keepGlow ? 0.72 : 0.36,
    };
  }
  if (strength === "strong") {
    return {
      expandRadius: keepGlow ? 3.8 + boost * 1.2 : 2.2 + boost,
      expandThreshold: keepGlow ? 5 : 12,
      feather: 1.2,
      glowOpacity: keepGlow ? 0.86 : 0.56,
    };
  }
  return {
    expandRadius: keepGlow ? 2.6 + boost : 1.4 + boost * 0.8,
    expandThreshold: keepGlow ? 8 : 18,
    feather: 0.9,
    glowOpacity: keepGlow ? 0.8 : 0.48,
  };
}

function alphaThresholds(strength: TextMaskStrength, keepGlow: boolean, sensitivityBoost: number) {
  const boost = sensitivityBoost * 7;
  if (strength === "soft") return { low: (keepGlow ? 54 : 66) - boost, high: (keepGlow ? 124 : 142) - boost };
  if (strength === "strong") return { low: (keepGlow ? 38 : 48) - boost, high: (keepGlow ? 98 : 112) - boost };
  return { low: (keepGlow ? 46 : 56) - boost, high: (keepGlow ? 112 : 126) - boost };
}

function repairMaskProfile(strength: TextMaskStrength, keepGlow: boolean, growBoost: number) {
  const glow = keepGlow ? 1 : 0;
  const base = strength === "soft" ? 12 : strength === "strong" ? 30 : 20;
  const radius = Math.max(8, Math.min(80, base + glow * 24 + growBoost));
  return {
    radius,
    threshold: keepGlow ? 2 : 7,
    feather: Math.max(1.2, Math.min(8, radius / 8)),
    composeFeather: Math.max(6, Math.min(24, radius / 2.6)),
  };
}

async function exportTextFull(image: Buffer, alpha: Buffer, canvas: PixelSize) {
  const sourceRaw = await sharp(image)
    .resize(canvas.width, canvas.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const output = Buffer.alloc(sourceRaw.length);
  for (let index = 0, pixel = 0; index < sourceRaw.length; index += 4, pixel += 1) {
    const textAlpha = alpha[pixel] || 0;
    if (textAlpha <= 3) continue;
    output[index] = sourceRaw[index];
    output[index + 1] = sourceRaw[index + 1];
    output[index + 2] = sourceRaw[index + 2];
    output[index + 3] = Math.min(sourceRaw[index + 3] || 255, textAlpha);
  }
  return sharp(output, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function cropTransparentTextLayer(textLayer: Buffer, canvas: PixelSize) {
  const alpha = await sharp(textLayer).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  const bbox = alphaBoundingBox(alpha, canvas);
  if (!bbox) return null;
  const margin = Math.max(20, Math.min(40, Math.round(Math.min(canvas.width, canvas.height) * 0.03)));
  const left = Math.max(0, bbox.x - margin);
  const top = Math.max(0, bbox.y - margin);
  const right = Math.min(canvas.width, bbox.x + bbox.width + margin);
  const bottom = Math.min(canvas.height, bbox.y + bbox.height + margin);
  const box = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  return {
    box,
    buffer: await sharp(textLayer).extract({ left: box.x, top: box.y, width: box.width, height: box.height }).png({ compressionLevel: 9, palette: false }).toBuffer(),
  };
}

async function expandAlphaMask(alpha: Buffer, canvas: PixelSize, radius: number, threshold: number, feather: number) {
  return sharp(alpha, { raw: { width: canvas.width, height: canvas.height, channels: 1 } })
    .blur(Math.max(0.3, radius))
    .threshold(Math.max(1, Math.min(254, threshold)))
    .blur(Math.max(0.2, feather))
    .greyscale()
    .raw()
    .toBuffer();
}

async function maskToDebugPng(alpha: Buffer, canvas: PixelSize) {
  return sharp(alpha, { raw: { width: canvas.width, height: canvas.height, channels: 1 } })
    .greyscale()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function alphaToOpenAIEditMask(alpha: Buffer, canvas: PixelSize) {
  const raw = Buffer.alloc(canvas.width * canvas.height * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const index = pixel * 4;
    raw[index] = 255;
    raw[index + 1] = 255;
    raw[index + 2] = 255;
    raw[index + 3] = 255 - (alpha[pixel] || 0);
  }
  return sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function inspectTextLayerPng(input: Buffer) {
  const [metadata, alpha] = await Promise.all([
    readImageMetadata(input),
    inspectPngAlpha(input),
  ]);
  const background = await inspectOpaqueBackground(input);
  const message = textLayerMessage(metadata.format, alpha, background);
  return {
    ...alpha,
    isPng: metadata.format === "png",
    hasOpaqueWhiteBackground: background.hasOpaqueWhiteBackground,
    hasOpaqueBlackBackground: background.hasOpaqueBlackBackground,
    hasCheckerboardBackground: background.hasCheckerboardBackground,
    message,
  };
}

function isValidTextLayerPng(
  metadata: Awaited<ReturnType<typeof readImageMetadata>>,
  alphaCheck: PngAlphaInspection & {
    isPng?: boolean;
    hasOpaqueWhiteBackground?: boolean;
    hasOpaqueBlackBackground?: boolean;
    hasCheckerboardBackground?: boolean;
  },
) {
  return metadata.format === "png" &&
    alphaCheck.hasAlphaChannel &&
    alphaCheck.hasTransparentPixels &&
    alphaCheck.transparentPixelRatio < 0.99998 &&
    !alphaCheck.hasOpaqueWhiteBackground &&
    !alphaCheck.hasOpaqueBlackBackground &&
    !alphaCheck.hasCheckerboardBackground;
}

async function inspectOpaqueBackground(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().resize(96, 96, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let opaque = 0;
  let white = 0;
  let black = 0;
  let checker = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const r = data[index] || 0;
    const g = data[index + 1] || 0;
    const b = data[index + 2] || 0;
    const a = data[index + 3] || 0;
    if (a > 248) opaque += 1;
    if (a > 248 && r > 238 && g > 238 && b > 238) white += 1;
    if (a > 248 && r < 18 && g < 18 && b < 18) black += 1;
    const isLightGrey = Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 188 && r <= 235;
    const isMidGrey = Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r >= 120 && r <= 188;
    if (a > 248 && (isLightGrey || isMidGrey)) checker += 1;
  }
  const opaqueRatio = opaque / Math.max(1, total);
  return {
    hasOpaqueWhiteBackground: opaqueRatio > 0.9 && white / Math.max(1, total) > 0.72,
    hasOpaqueBlackBackground: opaqueRatio > 0.9 && black / Math.max(1, total) > 0.72,
    hasCheckerboardBackground: opaqueRatio > 0.9 && checker / Math.max(1, total) > 0.72,
  };
}

function textLayerMessage(
  format: string | undefined,
  alpha: PngAlphaInspection,
  background: {
    hasOpaqueWhiteBackground: boolean;
    hasOpaqueBlackBackground: boolean;
    hasCheckerboardBackground: boolean;
  },
) {
  if (format !== "png") return "文字图层不是 PNG。";
  if (!alpha.hasAlphaChannel) return "文字 PNG 没有 alpha 通道。";
  if (!alpha.hasTransparentPixels) return "文字 PNG 没有检测到透明像素。";
  if (alpha.transparentPixelRatio >= 0.99998) return "文字 PNG 几乎没有可见文字。";
  if (background.hasOpaqueWhiteBackground) return "文字 PNG 疑似带白底。";
  if (background.hasOpaqueBlackBackground) return "文字 PNG 疑似带黑底。";
  if (background.hasCheckerboardBackground) return "文字 PNG 疑似把棋盘格背景导出了。";
  return "已验证：文字 PNG 包含真实 alpha 透明背景。";
}

function buildLayerImage(
  base: Record<string, unknown>,
  input: {
    groupId: string;
    fileName: string;
    prompt: string;
    variant: number;
    mode: string;
    materialType: string;
    branchLabel: string;
    fileSizeBytes: number;
    savedPath: string;
    alphaCheck?: TextLayerAlphaCheck;
  },
) {
  const fileName = `layers/${input.groupId}/${input.fileName}`;
  return {
    ...base,
    id: fileName,
    fileName,
    url: `/generated/${fileName}`,
    originalUrl: `/generated/${fileName}`,
    prompt: input.prompt,
    variant: input.variant,
    mode: input.mode,
    materialType: input.materialType,
    branchLabel: input.branchLabel,
    fileSizeBytes: input.fileSizeBytes,
    savedPath: input.savedPath,
    alphaCheck: input.alphaCheck,
  };
}

function connectedComponents(mask: Uint8Array, width: number, height: number, sourceMask: Uint8Array) {
  const visited = new Uint8Array(mask.length);
  const queue = new Uint32Array(mask.length);
  const components: Array<TextRegion & { area: number; density: number }> = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    let sourceHits = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area += 1;
      if (sourceMask[pixel]) sourceHits += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        const nx = next % width;
        if (Math.abs(nx - x) > 1) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const density = sourceHits / Math.max(1, boxWidth * boxHeight);
    components.push({
      x: minX,
      y: minY,
      width: boxWidth,
      height: boxHeight,
      area,
      density,
      confidence: density * Math.log2(2 + boxWidth) * Math.log2(2 + boxHeight),
    });
  }
  return components;
}

function isTextLikeComponent(
  component: TextRegion & { area: number; density: number },
  imageWidth: number,
  imageHeight: number,
) {
  const total = imageWidth * imageHeight;
  const aspect = component.width / Math.max(1, component.height);
  if (component.area < Math.max(8, total * 0.000015)) return false;
  if (component.width < Math.max(7, imageWidth * 0.008)) return false;
  if (component.height < 4 || component.height > imageHeight * 0.34) return false;
  if (component.width > imageWidth * 0.92 && component.height > imageHeight * 0.5) return false;
  if (aspect < 0.55 && component.height < imageHeight * 0.08) return false;
  if (component.density < 0.012 || component.density > 0.78) return false;
  return true;
}

function mergeTextRegions(regions: TextRegion[], width: number, height: number) {
  const expanded = regions.map((region) => expandRegion(region, { width, height }, Math.max(4, Math.round(Math.min(width, height) * 0.012))));
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < expanded.length; i += 1) {
      for (let j = i + 1; j < expanded.length; j += 1) {
        if (!regionsShouldMerge(expanded[i], expanded[j])) continue;
        expanded[i] = mergeRegionPair(expanded[i], expanded[j]);
        expanded.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return expanded;
}

function regionsShouldMerge(a: TextRegion, b: TextRegion) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const overlapX = Math.min(ax2, bx2) - Math.max(a.x, b.x);
  const overlapY = Math.min(ay2, by2) - Math.max(a.y, b.y);
  const verticalGap = Math.max(0, Math.max(a.y, b.y) - Math.min(ay2, by2));
  const horizontalGap = Math.max(0, Math.max(a.x, b.x) - Math.min(ax2, bx2));
  const closeLines = verticalGap <= Math.max(a.height, b.height) * 0.85 && horizontalGap <= Math.max(a.width, b.width) * 0.55;
  return (overlapX > 0 && overlapY > -Math.max(a.height, b.height) * 0.7) || closeLines;
}

function mergeRegionPair(a: TextRegion, b: TextRegion) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    confidence: Math.max(a.confidence, b.confidence),
  };
}

function scaleRegionToCanvas(region: TextRegion, canvas: PixelSize, workWidth: number, workHeight: number) {
  const pad = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * 0.008));
  const x = Math.max(0, Math.floor((region.x / workWidth) * canvas.width) - pad);
  const y = Math.max(0, Math.floor((region.y / workHeight) * canvas.height) - pad);
  const right = Math.min(canvas.width, Math.ceil(((region.x + region.width) / workWidth) * canvas.width) + pad);
  const bottom = Math.min(canvas.height, Math.ceil(((region.y + region.height) / workHeight) * canvas.height) + pad);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
    confidence: region.confidence,
  };
}

function expandRegion(region: TextRegion, canvas: PixelSize, pixels: number): TextRegion {
  const x = Math.max(0, region.x - pixels);
  const y = Math.max(0, region.y - pixels);
  const right = Math.min(canvas.width, region.x + region.width + pixels);
  const bottom = Math.min(canvas.height, region.y + region.height + pixels);
  return {
    ...region,
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function buildRegionMask(regions: TextRegion[], canvas: PixelSize) {
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x));
    const top = Math.max(0, Math.floor(region.y));
    const right = Math.min(canvas.width, Math.ceil(region.x + region.width));
    const bottom = Math.min(canvas.height, Math.ceil(region.y + region.height));
    for (let y = top; y < bottom; y += 1) {
      mask.fill(1, y * canvas.width + left, y * canvas.width + right);
    }
  }
  return mask;
}

function constrainAlphaToRegions(alpha: Buffer, regionMask: Uint8Array) {
  const output = Buffer.from(alpha);
  for (let index = 0; index < output.length; index += 1) {
    if (!regionMask[index]) output[index] = 0;
  }
  return output;
}

function filterTextAlphaComponents(alpha: Buffer, canvas: PixelSize) {
  const binary = new Uint8Array(alpha.length);
  for (let index = 0; index < alpha.length; index += 1) {
    binary[index] = (alpha[index] || 0) > 8 ? 1 : 0;
  }
  const visited = new Uint8Array(alpha.length);
  const queue = new Uint32Array(alpha.length);
  const output = Buffer.alloc(alpha.length);
  const total = canvas.width * canvas.height;
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let alphaSum = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const value = alpha[pixel] || 0;
      alphaSum += value;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [pixel - 1, pixel + 1, pixel - canvas.width, pixel + canvas.width];
      for (const next of neighbors) {
        if (next < 0 || next >= binary.length || visited[next] || !binary[next]) continue;
        const nx = next % canvas.width;
        if (Math.abs(nx - x) > 1) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const boxArea = width * height;
    const componentAreaRatio = tail / Math.max(1, total);
    const boxRatio = boxArea / Math.max(1, total);
    const aspect = width / Math.max(1, height);
    const density = tail / Math.max(1, boxArea);
    const meanAlpha = alphaSum / Math.max(1, tail);
    const likelyTitleText = width > canvas.width * 0.22 && height >= canvas.height * 0.035 && height <= canvas.height * 0.28 && aspect >= 1.1 && aspect <= 14 && density >= 0.01 && density <= 0.68;
    const likelyLongDecor = !likelyTitleText && width > canvas.width * 0.72 && height > canvas.height * 0.12;
    const likelyFullWidthTexture = !likelyTitleText && width > canvas.width * 0.9 && boxRatio > 0.08;
    const likelyThinRule = !likelyTitleText && aspect > 22 && height < canvas.height * 0.055;
    const tooLarge = !likelyTitleText && (componentAreaRatio > 0.11 || boxRatio > 0.28);
    const tooWeak = meanAlpha < 18 && density < 0.18;
    const keep = tail >= 3 && !likelyLongDecor && !likelyFullWidthTexture && !likelyThinRule && !tooLarge && !tooWeak;
    if (!keep) continue;
    for (let index = 0; index < tail; index += 1) {
      const pixel = queue[index];
      output[pixel] = alpha[pixel] || 0;
    }
  }
  return output;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radiusX: number, radiusY: number) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let active = false;
      for (let yy = Math.max(0, y - radiusY); yy <= Math.min(height - 1, y + radiusY) && !active; yy += 1) {
        for (let xx = Math.max(0, x - radiusX); xx <= Math.min(width - 1, x + radiusX); xx += 1) {
          if (mask[yy * width + xx]) {
            active = true;
            break;
          }
        }
      }
      if (active) output[y * width + x] = 1;
    }
  }
  return output;
}

function alphaCoverage(alpha: Buffer) {
  let visible = 0;
  for (const value of alpha) {
    if (value > 8) visible += 1;
  }
  return visible / Math.max(1, alpha.length);
}

function alphaBoundingBox(alpha: Buffer, canvas: PixelSize) {
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    if ((alpha[pixel] || 0) <= 8) continue;
    const x = pixel % canvas.width;
    const y = Math.floor(pixel / canvas.width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function isHighContrastPixel(data: Buffer, channels: number, width: number, height: number, x: number, y: number) {
  const luma = (xx: number, yy: number) => {
    const index = (yy * width + xx) * channels;
    return 0.299 * (data[index] || 0) + 0.587 * (data[index + 1] || 0) + 0.114 * (data[index + 2] || 0);
  };
  if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return false;
  const gx = Math.abs(luma(x - 1, y) - luma(Math.min(width - 1, x + 1), y));
  const gy = Math.abs(luma(x, y - 1) - luma(x, y + 1));
  return gx + gy > 78;
}

async function toRawImage(input: Buffer, size?: PixelSize): Promise<RawImage> {
  const pipeline = sharp(input).rotate();
  if (size) {
    pipeline.resize(size.width, size.height, { fit: "fill", kernel: sharp.kernel.lanczos3 });
  }
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function imageSize(input: Buffer) {
  const metadata = await readImageMetadata(input);
  return {
    width: metadata.width || 1,
    height: metadata.height || 1,
  };
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载分层图片失败。");
  return Buffer.from(await response.arrayBuffer());
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean) {
  if (value === null) return fallback;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

function parseMaskStrength(value: FormDataEntryValue | null): TextMaskStrength {
  const text = String(value || "normal").trim().toLowerCase();
  if (text === "soft" || text === "weak" || text === "弱") return "soft";
  if (text === "strong" || text === "强") return "strong";
  return "normal";
}
