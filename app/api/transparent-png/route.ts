import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import {
  ensureImageVariants,
  getGeneratedDir,
  getGeneratedUrl,
  inspectPngAlpha,
  parseDataUrl,
  readImageMetadata,
  readPublicImageUrl,
  removeBackgroundToTransparentPng,
  saveImageMetadata,
} from "@/lib/image-utils";
import { getImageModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { maxUploadBytes, supportedImageTypes } from "@/lib/request-guards";

export const runtime = "nodejs";

type TransparentCutoutMode = "auto" | "real_cutout" | "ai_regenerate";
type TransparentCutoutType = "auto" | "person" | "product" | "logo_icon" | "text_title" | "ip";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName = "transparent-source.png";
    let sourceUrl = "";
    let tolerance = 34;
    let mode: TransparentCutoutMode = "real_cutout";
    let cutoutType: TransparentCutoutType = "auto";
    let model = getImageModel();

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image");
      sourceUrl = String(formData.get("sourceUrl") || "");
      tolerance = Number(formData.get("tolerance") || tolerance) || tolerance;
      mode = parseCutoutMode(formData.get("mode"));
      cutoutType = parseCutoutType(formData.get("cutoutType"));
      model = String(formData.get("model") || "").trim() || model;

      if (file instanceof File) {
        if (!supportedImageTypes.has(file.type)) {
          return NextResponse.json({ error: "图片格式不支持，请上传 PNG、JPG 或 WebP。" }, { status: 400 });
        }
        if (file.size > maxUploadBytes) {
          return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
        }
        buffer = Buffer.from(await file.arrayBuffer());
        fileName = file.name || fileName;
      } else if (sourceUrl) {
        buffer = await readImageFromSourceUrl(sourceUrl);
      } else {
        return NextResponse.json({ error: "没有收到可处理的图片。" }, { status: 400 });
      }
    } else {
      const body = (await request.json().catch(() => ({}))) as { imageUrl?: string; tolerance?: number; mode?: string; cutoutType?: string; model?: string };
      sourceUrl = String(body.imageUrl || "");
      tolerance = Number(body.tolerance || tolerance) || tolerance;
      mode = parseCutoutMode(body.mode);
      cutoutType = parseCutoutType(body.cutoutType);
      model = String(body.model || "").trim() || model;
      if (!sourceUrl) return NextResponse.json({ error: "没有收到可处理的图片。" }, { status: 400 });
      buffer = await readImageFromSourceUrl(sourceUrl);
    }

    if (buffer.byteLength > maxUploadBytes) {
      return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
    }

    const originalAlpha = await inspectPngAlpha(buffer).catch(() => ({
      hasAlphaChannel: false,
      hasTransparentPixels: false,
      transparentPixelRatio: 0,
        partialAlphaPixelRatio: 0,
    }));
    const recommendation = await analyzeCutoutRecommendation(buffer, cutoutType, originalAlpha);
    const effectiveMode: Exclude<TransparentCutoutMode, "auto"> = mode === "auto" ? recommendation.mode : mode;
    const transparentPng = effectiveMode === "ai_regenerate"
      ? await generateAiTransparentPng(buffer, { cutoutType, model })
      : await removeBackgroundToTransparentPng(buffer, { tolerance });
    const [metadata, alphaCheck] = await Promise.all([
      readImageMetadata(transparentPng),
      inspectPngAlpha(transparentPng),
    ]);
    const opaqueBackground = await inspectOpaqueBackground(transparentPng);
    const alphaMessage = transparentAlphaMessage(metadata.format, alphaCheck, opaqueBackground);

    if (!isValidTransparentPng(metadata.format, alphaCheck, opaqueBackground)) {
      return NextResponse.json(
        {
          error: effectiveMode === "real_cutout"
            ? "当前图片背景较复杂，真实抠图效果可能不理想，建议使用 AI重生透明图。"
            : "AI重生透明图没有得到真实透明背景，请重新生成。",
          alphaCheck: { ...alphaCheck, ...opaqueBackground, message: alphaMessage },
          originalAlpha,
          recommendation,
          mode: effectiveMode,
          cutoutType,
        },
        { status: 422 },
      );
    }

    const saved = await saveCutoutTransparentPng(transparentPng);
    const now = new Date().toISOString();
    const warning = effectiveMode === "real_cutout" && recommendation.mode === "ai_regenerate"
      ? "系统判断当前图片可能更适合 AI重生透明图；如边缘不干净，请切换 AI重生。"
      : "";
    const image = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt: effectiveMode === "ai_regenerate" ? buildAiRegeneratePrompt(cutoutType) : "真实抠图：从原图提取主体并移除背景，输出透明 PNG",
      variant: 1,
      mode: effectiveMode === "ai_regenerate" ? "AI重生透明图" : "真实抠图透明 PNG",
      model: effectiveMode === "ai_regenerate" ? model : "local-sharp",
      generatedAt: now,
      outputSize: { width: metadata.width || 1, height: metadata.height || 1 },
      width: metadata.width || 1,
      height: metadata.height || 1,
      fileName: saved.fileName,
      savedPath: saved.path,
      fileSizeBytes: transparentPng.byteLength,
      nodeOperation: "remove_background",
      transparentCutoutMode: effectiveMode,
      cutoutType,
      sourceTaskId: saved.groupId,
      branchLabel: "透明 PNG",
      source: "generated",
      alphaCheck: {
        ...alphaCheck,
        ...opaqueBackground,
        message: alphaMessage || "已验证：导出 PNG 包含真实透明像素，不包含预览棋盘格。",
      },
      recommendation,
      warning,
    };

    await saveImageMetadata(saved.fileName, {
      ...image,
      originalFileName: fileName,
      sourceUrl,
      originalAlpha,
      alphaCheck: image.alphaCheck,
      recommendation,
      warning,
    });

    return NextResponse.json({
      ok: true,
      image,
      alphaCheck: image.alphaCheck,
      originalAlpha,
      recommendation,
      mode: effectiveMode,
      cutoutType,
      warning,
    });
  } catch (error) {
    const apiError = toApiError(error, "透明 PNG 处理失败。");
    return NextResponse.json(
      {
        error: apiError.message,
      },
      { status: apiError.status },
    );
  }
}

async function readImageFromSourceUrl(sourceUrl: string) {
  if (sourceUrl.startsWith("/generated/")) {
    return readPublicImageUrl(sourceUrl);
  }

  if (sourceUrl.startsWith("data:image/")) {
    return parseDataUrl(sourceUrl);
  }

  throw new Error("只支持处理本地项目图片资源。请先上传图片再抠图。");
}

async function saveCutoutTransparentPng(buffer: Buffer) {
  const groupId = `cutout-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
  const fileName = `cutouts/${groupId}/cutout-transparent.png`;
  const fullPath = path.join(getGeneratedDir(), fileName);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  const variants = await ensureImageVariants(fileName, buffer).catch(() => ({
    thumbnailUrl: `/api/image-preview?kind=thumbnail&src=${encodeURIComponent(getGeneratedUrl(fileName))}`,
    previewUrl: `/api/image-preview?kind=preview&src=${encodeURIComponent(getGeneratedUrl(fileName))}`,
  }));
  const fileStat = await stat(fullPath);
  return {
    groupId,
    fileName,
    path: fullPath,
    url: getGeneratedUrl(fileName),
    originalUrl: getGeneratedUrl(fileName),
    thumbnailUrl: variants.thumbnailUrl,
    previewUrl: variants.previewUrl,
    size: fileStat.size,
  };
}

async function generateAiTransparentPng(
  sourceBuffer: Buffer,
  input: {
    cutoutType: TransparentCutoutType;
    model: string;
  },
) {
  const sourceMeta = await readImageMetadata(sourceBuffer);
  const source = {
    buffer: sourceBuffer,
    fileName: "source.png",
    mimeType: "image/png",
  };
  const file = await toFile(source.buffer, source.fileName, { type: source.mimeType });
  const result = await getOpenAI().images.edit({
    model: input.model,
    image: file,
    prompt: buildAiRegeneratePrompt(input.cutoutType),
    size: "auto",
    quality: "high",
    input_fidelity: "high",
    output_format: "png",
    background: "transparent",
    n: 1,
  });
  const item = result.data?.[0];
  if (!item) throw new Error("图片模型没有返回透明 PNG。");
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const normalized = await normalizeTransparentCanvas(raw, {
    width: sourceMeta.width || 1,
    height: sourceMeta.height || 1,
  });
  const firstCheck = await inspectPngAlpha(normalized);
  if (firstCheck.hasTransparentPixels) return normalized;
  return removeBackgroundToTransparentPng(normalized, { tolerance: 52, edgeFeather: 1.2 });
}

async function normalizeTransparentCanvas(input: Buffer, canvas: { width: number; height: number }) {
  const foreground = await sharp(input)
    .rotate()
    .ensureAlpha()
    .resize(canvas.width, canvas.height, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, gravity: "center" }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function buildAiRegeneratePrompt(cutoutType: TransparentCutoutType) {
  if (cutoutType === "text_title") {
    return "请参考输入图片中的文字设计，重新生成同样风格的文字透明 PNG。保留文字内容、字体效果、颜色、描边、阴影、渐变和立体感。背景必须是真透明 alpha 通道，不要生成任何背景元素，不要白底、黑底或棋盘格。";
  }
  if (cutoutType === "product") {
    return "请参考输入图片中的产品，重新生成干净的产品透明 PNG。保持产品形状、颜色、包装、Logo 和材质识别，不要让产品变形，不要改变包装文字。背景必须是真透明 alpha 通道，不要白底、黑底或棋盘格。";
  }
  if (cutoutType === "person") {
    return "请参考输入图片中的人物，重新生成干净的人物透明 PNG。保持人物五官、发型、服装、姿态和身体比例，背景透明，边缘自然。背景必须是真透明 alpha 通道，不要白底、黑底或棋盘格。";
  }
  if (cutoutType === "logo_icon") {
    return "请参考输入图片中的 Logo 或 Icon，重新生成干净的透明 PNG。保持标识形状、颜色、比例、边缘锐度和识别度，不要改变品牌图形。背景必须是真透明 alpha 通道，不要白底、黑底或棋盘格。";
  }
  if (cutoutType === "ip") {
    return "请参考输入图片中的 IP 形象，重新生成干净的透明 PNG。保持角色外观、颜色、比例、表情和风格识别度，重建干净边缘。背景必须是真透明 alpha 通道，不要白底、黑底或棋盘格。";
  }
  return "请参考输入图片中的主体，重新生成一个干净的透明背景 PNG。保留主体的外观、颜色、风格、比例和识别度，但不要保留原图背景。请重建干净边缘，避免毛边、脏边和背景残留。背景必须是真透明 alpha 通道，不要白底、黑底或棋盘格。";
}

async function analyzeCutoutRecommendation(
  input: Buffer,
  cutoutType: TransparentCutoutType,
  originalAlpha: { hasAlphaChannel?: boolean; hasTransparentPixels?: boolean },
) {
  const sample = await sharp(input)
    .rotate()
    .ensureAlpha()
    .resize(72, 72, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = sample;
  const edgeColors: Array<[number, number, number]> = [];
  const centerColors: Array<[number, number, number]> = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const alpha = data[index + 3] || 0;
      if (alpha < 24) continue;
      const color: [number, number, number] = [data[index] || 0, data[index + 1] || 0, data[index + 2] || 0];
      if (x < 5 || y < 5 || x >= info.width - 5 || y >= info.height - 5) edgeColors.push(color);
      else if (x > info.width * 0.25 && x < info.width * 0.75 && y > info.height * 0.25 && y < info.height * 0.75) centerColors.push(color);
    }
  }
  const edgeStd = colorStd(edgeColors);
  const centerStd = colorStd(centerColors);
  const simpleBackground = edgeStd < 18 || edgeDominance(edgeColors) > 0.72;
  const forceAi = cutoutType === "person" || cutoutType === "text_title" || cutoutType === "ip";
  const likelyComplex = forceAi || edgeStd > 42 || (edgeStd > 28 && centerStd > 38);
  const mode: Exclude<TransparentCutoutMode, "auto"> = originalAlpha.hasTransparentPixels || (simpleBackground && !likelyComplex) ? "real_cutout" : "ai_regenerate";
  return {
    mode,
    confidence: Math.max(0.52, Math.min(0.94, mode === "real_cutout" ? 0.9 - edgeStd / 120 : 0.58 + edgeStd / 100)),
    reason: mode === "real_cutout"
      ? "背景边缘颜色较统一，适合真实抠图并保留原图主体。"
      : "背景或边缘较复杂，建议用 AI重生透明图获得更干净边缘。",
    edgeComplexity: Number(edgeStd.toFixed(1)),
  };
}

function colorStd(colors: Array<[number, number, number]>) {
  if (!colors.length) return 0;
  const mean = colors.reduce((sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]], [0, 0, 0]).map((value) => value / colors.length);
  const variance = colors.reduce((sum, color) => {
    const distance = ((color[0] - mean[0]) ** 2 + (color[1] - mean[1]) ** 2 + (color[2] - mean[2]) ** 2) / 3;
    return sum + distance;
  }, 0) / colors.length;
  return Math.sqrt(variance);
}

function edgeDominance(colors: Array<[number, number, number]>) {
  if (!colors.length) return 0;
  const buckets = new Map<string, number>();
  colors.forEach((color) => {
    const key = color.map((value) => Math.round(value / 24) * 24).join(",");
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return Math.max(...buckets.values()) / colors.length;
}

async function inspectOpaqueBackground(input: Buffer) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .resize(96, 96, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
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
    const grey = Math.abs(r - g) < 8 && Math.abs(g - b) < 8;
    if (a > 248 && grey && r >= 120 && r <= 235) checker += 1;
  }
  const opaqueRatio = opaque / Math.max(1, total);
  return {
    hasOpaqueWhiteBackground: opaqueRatio > 0.9 && white / Math.max(1, total) > 0.72,
    hasOpaqueBlackBackground: opaqueRatio > 0.9 && black / Math.max(1, total) > 0.72,
    hasCheckerboardBackground: opaqueRatio > 0.9 && checker / Math.max(1, total) > 0.72,
  };
}

function isValidTransparentPng(
  format: string | undefined,
  alpha: Awaited<ReturnType<typeof inspectPngAlpha>>,
  background: Awaited<ReturnType<typeof inspectOpaqueBackground>>,
) {
  return format === "png" &&
    alpha.hasAlphaChannel &&
    alpha.hasTransparentPixels &&
    !background.hasOpaqueWhiteBackground &&
    !background.hasOpaqueBlackBackground &&
    !background.hasCheckerboardBackground;
}

function transparentAlphaMessage(
  format: string | undefined,
  alpha: Awaited<ReturnType<typeof inspectPngAlpha>>,
  background: Awaited<ReturnType<typeof inspectOpaqueBackground>>,
) {
  if (format !== "png") return "输出不是 PNG。";
  if (!alpha.hasAlphaChannel) return "透明 PNG 没有 alpha 通道。";
  if (!alpha.hasTransparentPixels) return "透明 PNG 没有检测到透明像素。";
  if (background.hasOpaqueWhiteBackground) return "透明 PNG 疑似带白底。";
  if (background.hasOpaqueBlackBackground) return "透明 PNG 疑似带黑底。";
  if (background.hasCheckerboardBackground) return "透明 PNG 疑似把棋盘格背景导出了。";
  return "已验证：导出 PNG 包含真实透明像素，不包含白底、黑底或棋盘格。";
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载透明 PNG 失败。");
  return Buffer.from(await response.arrayBuffer());
}

function parseCutoutMode(value: unknown): TransparentCutoutMode {
  const text = String(value || "").trim();
  if (text === "auto" || text === "ai_regenerate" || text === "real_cutout") return text;
  return "real_cutout";
}

function parseCutoutType(value: unknown): TransparentCutoutType {
  const text = String(value || "").trim();
  if (text === "person" || text === "product" || text === "logo_icon" || text === "text_title" || text === "ip") return text;
  return "auto";
}
