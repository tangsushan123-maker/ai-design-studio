import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { aspectRatios, type AspectRatioValue, type QualityValue } from "./design-options";
import { writeJsonAtomic } from "./local-json-store";

export type PixelSize = {
  width: number;
  height: number;
};

export type ExactFitMode = "smart_outpaint" | "crop" | "pad";
export type ImageVariantKind = "thumbnail" | "preview";

const generatedDir = path.join(process.cwd(), "public", "generated");
const imageVariantSpecs: Record<ImageVariantKind, { longEdge: number; quality: number }> = {
  thumbnail: { longEdge: 300, quality: 78 },
  preview: { longEdge: 1200, quality: 84 },
};

export function getGeneratedDir() {
  return generatedDir;
}

export async function ensureGeneratedDir() {
  await mkdir(generatedDir, { recursive: true });
}

export function getGeneratedPath(fileName: string) {
  return path.join(generatedDir, fileName);
}

export function getGeneratedUrl(fileName: string) {
  return `/generated/${fileName}`;
}

export function getImageVariantFileName(fileName: string, kind: ImageVariantKind) {
  const parsed = path.parse(fileName);
  const relativeDir = parsed.dir ? `${parsed.dir}${path.sep}` : "";
  return path.join("_variants", kind, `${relativeDir}${parsed.name}.webp`);
}

export function getImageVariantUrl(fileName: string, kind: ImageVariantKind) {
  return getGeneratedUrl(getImageVariantFileName(fileName, kind));
}

export function getImageVariantApiUrl(publicUrl: string, kind: ImageVariantKind) {
  return `/api/image-preview?kind=${kind}&src=${encodeURIComponent(publicUrl)}`;
}

export function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) {
    return Buffer.from(dataUrl, "base64");
  }
  return Buffer.from(match[2], "base64");
}

export async function saveImageBuffer(
  buffer: Buffer,
  extension = "png",
  options?: {
    ratioLabel?: string;
    quality?: QualityValue;
  },
) {
  await ensureGeneratedDir();
  const date = new Date();
  const dateText = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const ratioText = sanitizeFilePart(options?.ratioLabel || "design");
  const qualityText = options?.quality || "standard";
  const fileName = `design-${dateText}-${ratioText}-${qualityText}-${randomUUID().slice(0, 8)}.${extension}`;
  const fullPath = getGeneratedPath(fileName);
  await writeBufferAtomic(fullPath, buffer);
  const variants = await ensureImageVariants(fileName, buffer).catch(() => ({
    thumbnailUrl: getImageVariantApiUrl(getGeneratedUrl(fileName), "thumbnail"),
    previewUrl: getImageVariantApiUrl(getGeneratedUrl(fileName), "preview"),
  }));
  return {
    fileName,
    path: fullPath,
    url: getGeneratedUrl(fileName),
    originalUrl: getGeneratedUrl(fileName),
    thumbnailUrl: variants.thumbnailUrl,
    previewUrl: variants.previewUrl,
  };
}

async function writeBufferAtomic(filePath: string, buffer: Buffer) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buffer);
  await copyFile(filePath, `${filePath}.bak`).catch(() => {});
  await rename(tempPath, filePath);
}

export async function saveImageMetadata(fileName: string, metadata: Record<string, unknown>) {
  await ensureGeneratedDir();
  const metadataPath = getGeneratedPath(`${fileName}.json`);
  await writeJsonAtomic(metadataPath, {
    ...metadata,
    fileName,
    savedPath: getGeneratedPath(fileName),
    originalUrl: typeof metadata.originalUrl === "string" ? metadata.originalUrl : getGeneratedUrl(fileName),
    thumbnailUrl: typeof metadata.thumbnailUrl === "string" ? metadata.thumbnailUrl : getImageVariantUrl(fileName, "thumbnail"),
    previewUrl: typeof metadata.previewUrl === "string" ? metadata.previewUrl : getImageVariantUrl(fileName, "preview"),
  });
}

export async function ensureImageVariants(fileName: string, inputBuffer?: Buffer) {
  const source = inputBuffer || await readFile(getGeneratedPath(fileName));
  const [thumbnail, preview] = await Promise.all([
    ensureImageVariant(fileName, "thumbnail", source),
    ensureImageVariant(fileName, "preview", source),
  ]);
  return {
    thumbnailUrl: thumbnail.url,
    previewUrl: preview.url,
  };
}

export async function ensureImageVariant(fileName: string, kind: ImageVariantKind, inputBuffer?: Buffer) {
  await ensureGeneratedDir();
  const variantFileName = getImageVariantFileName(fileName, kind);
  const variantPath = getGeneratedPath(variantFileName);
  const variantUrl = getGeneratedUrl(variantFileName);
  const exists = await readFile(variantPath).then(() => true).catch(() => false);
  if (exists) return { fileName: variantFileName, path: variantPath, url: variantUrl };

  const source = inputBuffer || await readFile(getGeneratedPath(fileName));
  const spec = imageVariantSpecs[kind];
  const output = await sharp(source)
    .rotate()
    .resize({
      width: spec.longEdge,
      height: spec.longEdge,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: spec.quality, effort: 4 })
    .toBuffer();
  await mkdir(path.dirname(variantPath), { recursive: true });
  await writeBufferAtomic(variantPath, output);
  return { fileName: variantFileName, path: variantPath, url: variantUrl };
}

export async function ensureImageVariantForPublicUrl(publicUrl: string, kind: ImageVariantKind) {
  if (!publicUrl.startsWith("/generated/")) {
    throw new Error("只支持处理本地生成的图片 URL。");
  }
  const relativePath = decodeURIComponent(publicUrl.replace(/^\/generated\//, ""));
  if (relativePath.split(/[\\/]/).some((part) => part === "..") || relativePath.startsWith("_variants/")) {
    throw new Error("图片路径不合法。");
  }
  const fullPath = path.resolve(generatedDir, relativePath);
  if (!fullPath.startsWith(generatedDir + path.sep)) {
    throw new Error("图片路径不合法。");
  }
  return ensureImageVariant(relativePath, kind);
}

export function resolveRatio(
  aspectRatio: AspectRatioValue,
  customWidth?: number,
  customHeight?: number,
): PixelSize {
  if (aspectRatio === "auto") {
    return normalizeRatio(16, 9);
  }
  if (aspectRatio === "custom" && customWidth && customHeight) {
    return normalizeRatio(customWidth, customHeight);
  }

  const ratio = aspectRatios.find((item) => item.value === aspectRatio);
  return normalizeRatio(ratio?.width ?? 1, ratio?.height ?? 1);
}

export function ratioLabel(
  aspectRatio: AspectRatioValue,
  customWidth?: number,
  customHeight?: number,
  exactRatio?: PixelSize,
) {
  if (exactRatio && exactRatio.width && exactRatio.height) {
    return `${Math.round(exactRatio.width)}x${Math.round(exactRatio.height)}`;
  }

  if (aspectRatio === "auto") {
    return "auto";
  }

  if (aspectRatio === "custom") {
    return `${customWidth || 1}x${customHeight || 1}`;
  }

  return aspectRatio.replace(":", "x").replace(".", "p");
}

function normalizeRatio(width: number, height: number): PixelSize {
  return {
    width: Math.max(1, Number(width) || 1),
    height: Math.max(1, Number(height) || 1),
  };
}

export function getOpenAIImageSize(ratio: PixelSize) {
  const value = ratio.width / ratio.height;
  if (value > 1.15) return "1536x1024";
  if (value < 0.87) return "1024x1536";
  return "1024x1024";
}

export function getOpenAIRequestedSize(ratio: PixelSize, quality: QualityValue, model: string) {
  if (/gpt-image-2/i.test(model)) {
    const target = getTargetPixels(ratio, quality);
    const ratioValue = target.width / Math.max(1, target.height);
    const isSquare = Math.abs(ratioValue - 1) < 0.08;
    const isWide169 = Math.abs(ratioValue - 16 / 9) < 0.12;
    const isTall916 = Math.abs(ratioValue - 9 / 16) < 0.12;

    if (quality === "4k" && isWide169) return "3840x2160";
    if (quality === "4k" && isTall916) return "2160x3840";
    if (quality === "2k" && isSquare) return "2048x2048";
    if (quality === "2k" && isWide169) return "2048x1152";
    if (quality === "2k" && isTall916) return "1152x2048";
  }

  return getOpenAIImageSize(ratio);
}

export function getTargetPixels(ratio: PixelSize, quality: QualityValue): PixelSize {
  const ratioValue = ratio.width / ratio.height;
  const isSquare = Math.abs(ratioValue - 1) < 0.08;
  const isWide169 = Math.abs(ratioValue - 16 / 9) < 0.12;
  const isTall916 = Math.abs(ratioValue - 9 / 16) < 0.12;

  if (quality === "4k") {
    if (isSquare) return { width: 4096, height: 4096 };
    if (isWide169) return { width: 3840, height: 2160 };
    if (isTall916) return { width: 2160, height: 3840 };
    const longEdge = 3840;
    if (ratioValue >= 1) {
      return {
        width: longEdge,
        height: Math.max(1, Math.round(longEdge / ratioValue)),
      };
    }

    return {
      width: Math.max(1, Math.round(longEdge * ratioValue)),
      height: longEdge,
    };
  }

  const longEdge = quality === "2k" ? 2048 : 1536;

  if (ratioValue >= 1) {
    return {
      width: longEdge,
      height: Math.max(1, Math.round(longEdge / ratioValue)),
    };
  }

  return {
    width: Math.max(1, Math.round(longEdge * ratioValue)),
    height: longEdge,
  };
}

export async function processToTarget(
  inputBuffer: Buffer,
  ratio: PixelSize,
  quality: QualityValue,
  format: "png" | "jpg" = "png",
  fitMode: ExactFitMode = "crop",
) {
  return processToExactCanvas(inputBuffer, getTargetPixels(ratio, quality), format, fitMode);
}

export async function processToExactSize(
  inputBuffer: Buffer,
  target: PixelSize,
  format: "png" | "jpg" = "png",
  fitMode: ExactFitMode = "smart_outpaint",
) {
  return processToExactCanvas(inputBuffer, target, format, fitMode);
}

async function processToExactCanvas(
  inputBuffer: Buffer,
  target: PixelSize,
  format: "png" | "jpg" = "png",
  fitMode: ExactFitMode = "smart_outpaint",
) {
  const normalizedTarget = {
    width: Math.max(1, Math.round(target.width)),
    height: Math.max(1, Math.round(target.height)),
  };
  const preparedInput = await removeSuspiciousWhiteBorder(inputBuffer);

  if (fitMode === "pad") {
    return buildOutpaintedCanvas(preparedInput, normalizedTarget, format);
  }

  if (fitMode === "smart_outpaint") {
    return buildOutpaintedCanvas(preparedInput, normalizedTarget, format);
  }

  return highQualityResize(preparedInput, normalizedTarget, format, "cover");
}

async function buildOutpaintedCanvas(inputBuffer: Buffer, target: PixelSize, format: "png" | "jpg" = "png") {
  const background = await sharp(inputBuffer)
    .resize(target.width, target.height, {
      fit: "cover",
      kernel: sharp.kernel.lanczos3,
    })
    .blur(32)
    .modulate({ brightness: 0.92, saturation: 0.72 })
    .toBuffer();

  const foreground = await sharp(inputBuffer)
    .resize(target.width, target.height, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  const pipeline = sharp(background)
    .composite([{ input: foreground, gravity: "center" }]);

  return finalizeHighQuality(pipeline, format);
}

async function highQualityResize(
  inputBuffer: Buffer,
  target: PixelSize,
  format: "png" | "jpg" = "png",
  fit: "cover" | "inside" = "cover",
) {
  const pipeline = sharp(inputBuffer)
    .resize(target.width, target.height, {
      fit,
      position: "attention",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    });

  return finalizeHighQuality(pipeline, format);
}

function finalizeHighQuality(pipeline: sharp.Sharp, format: "png" | "jpg") {
  const output = pipeline
    .modulate({ brightness: 1.01, saturation: 1.02 })
    .sharpen({ sigma: 0.9, m1: 1.05, m2: 1.75, x1: 2, y2: 10, y3: 18 });

  return format === "jpg"
    ? output.flatten({ background: "#ffffff" }).jpeg({ quality: 96, mozjpeg: true }).toBuffer()
    : output.png({ compressionLevel: 9, palette: false }).toBuffer();
}

export async function readImageMetadata(input: Buffer | string) {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format,
    size: typeof input === "string" ? undefined : input.byteLength,
  };
}

export type PngAlphaInspection = {
  hasAlphaChannel: boolean;
  hasTransparentPixels: boolean;
  transparentPixelRatio: number;
  partialAlphaPixelRatio: number;
};

export async function inspectPngAlpha(input: Buffer | string): Promise<PngAlphaInspection> {
  const metadata = await sharp(input).metadata();
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = Math.max(1, info.width * info.height);
  let transparent = 0;
  let partial = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] || 0;
    if (alpha < 255) transparent += 1;
    if (alpha > 0 && alpha < 255) partial += 1;
  }

  return {
    hasAlphaChannel: Boolean(metadata.hasAlpha),
    hasTransparentPixels: transparent > 0,
    transparentPixelRatio: transparent / pixelCount,
    partialAlphaPixelRatio: partial / pixelCount,
  };
}

export async function removeBackgroundToTransparentPng(
  inputBuffer: Buffer,
  options?: {
    tolerance?: number;
    edgeFeather?: number;
  },
) {
  const tolerance = Math.max(10, Math.min(92, Math.round(options?.tolerance ?? 34)));
  const edgeFeather = Math.max(0, Math.min(4, Number(options?.edgeFeather ?? 1.6)));
  const source = await sharp(inputBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = source;
  const pixelCount = info.width * info.height;
  const backgroundColors = sampleBackgroundColors(data, info.width, info.height);
  const backgroundLimit = tolerance * tolerance;
  const softLimit = (tolerance + 22 + edgeFeather * 8) ** 2;
  const transparent = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (pixel: number) => {
    if (transparent[pixel]) return;
    transparent[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  const isBackgroundPixel = (pixel: number) => {
    const index = pixel * 4;
    const alpha = data[index + 3] || 0;
    if (alpha < 32) return true;
    return colorDistanceToAny(data[index] || 0, data[index + 1] || 0, data[index + 2] || 0, backgroundColors) <= backgroundLimit;
  };

  for (let x = 0; x < info.width; x += 1) {
    const top = x;
    const bottom = (info.height - 1) * info.width + x;
    if (isBackgroundPixel(top)) enqueue(top);
    if (isBackgroundPixel(bottom)) enqueue(bottom);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    const left = y * info.width;
    const right = y * info.width + info.width - 1;
    if (isBackgroundPixel(left)) enqueue(left);
    if (isBackgroundPixel(right)) enqueue(right);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    if (x > 0) {
      const next = pixel - 1;
      if (!transparent[next] && isBackgroundPixel(next)) enqueue(next);
    }
    if (x < info.width - 1) {
      const next = pixel + 1;
      if (!transparent[next] && isBackgroundPixel(next)) enqueue(next);
    }
    if (y > 0) {
      const next = pixel - info.width;
      if (!transparent[next] && isBackgroundPixel(next)) enqueue(next);
    }
    if (y < info.height - 1) {
      const next = pixel + info.width;
      if (!transparent[next] && isBackgroundPixel(next)) enqueue(next);
    }
  }

  const output = Buffer.from(data);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    if (transparent[pixel]) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
      continue;
    }

    if (!touchesTransparentNeighbor(transparent, pixel, info.width, info.height)) continue;
    const distance = colorDistanceToAny(output[index] || 0, output[index + 1] || 0, output[index + 2] || 0, backgroundColors);
    if (distance <= backgroundLimit || distance > softLimit) continue;
    const blend = Math.max(0, Math.min(1, (distance - backgroundLimit) / Math.max(1, softLimit - backgroundLimit)));
    output[index + 3] = Math.min(output[index + 3] || 255, Math.max(36, Math.round(255 * blend)));
  }

  return sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

export function assertExactPixelSize(actual: PixelSize, expected: PixelSize) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`生成结果尺寸不标准：实际 ${actual.width}×${actual.height}，目标 ${expected.width}×${expected.height}。请重试或重新选择更适合的输出方式。`);
  }
}

export async function countEditableMaskPixels(maskBuffer: Buffer, target: PixelSize) {
  const { data } = await sharp(maskBuffer)
    .resize(target.width, target.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 128) count += 1;
  }
  return count;
}

export async function composeMaskedEdit(
  originalBuffer: Buffer,
  editedBuffer: Buffer,
  maskBuffer: Buffer,
  target: PixelSize,
  options?: { feather?: number },
) {
  const feather = Math.max(1, Math.round(options?.feather ?? 12));
  const original = await sharp(originalBuffer)
    .resize(target.width, target.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const edited = await sharp(editedBuffer)
    .resize(target.width, target.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const editableMask = await sharp(maskBuffer)
    .resize(target.width, target.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .extractChannel("alpha")
    .threshold(128)
    .negate()
    .blur(feather / 4)
    .raw()
    .toBuffer();

  const output = Buffer.allocUnsafe(original.length);
  for (let index = 0, pixel = 0; index < original.length; index += 4, pixel += 1) {
    const alpha = editableMask[pixel] / 255;
    if (alpha <= 0) {
      output[index] = original[index];
      output[index + 1] = original[index + 1];
      output[index + 2] = original[index + 2];
      output[index + 3] = original[index + 3];
      continue;
    }

    if (alpha >= 1) {
      output[index] = edited[index];
      output[index + 1] = edited[index + 1];
      output[index + 2] = edited[index + 2];
      output[index + 3] = edited[index + 3];
      continue;
    }

    output[index] = Math.round(original[index] * (1 - alpha) + edited[index] * alpha);
    output[index + 1] = Math.round(original[index + 1] * (1 - alpha) + edited[index + 1] * alpha);
    output[index + 2] = Math.round(original[index + 2] * (1 - alpha) + edited[index + 2] * alpha);
    output[index + 3] = Math.round(original[index + 3] * (1 - alpha) + edited[index + 3] * alpha);
  }

  return sharp(output, {
    raw: {
      width: target.width,
      height: target.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

export async function readPublicImageUrl(url: string) {
  if (!url.startsWith("/generated/")) {
    throw new Error("只支持处理本地生成的图片 URL。");
  }

  try {
    const relativePath = decodeURIComponent(url.replace(/^\/generated\//, ""));
    if (relativePath.split(/[\\/]/).some((part) => part === "..")) {
      throw new Error("图片路径不合法。");
    }
    const fullPath = path.resolve(generatedDir, relativePath);
    if (!fullPath.startsWith(generatedDir + path.sep)) {
      throw new Error("图片路径不合法。");
    }
    return await readFile(fullPath);
  } catch {
    throw new Error("找不到这张结果图片，可能已经被删除。");
  }
}

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "x").replace(/^x|x$/g, "").toLowerCase();
}

function sampleBackgroundColors(data: Buffer, width: number, height: number) {
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const pushPixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    const alpha = data[index + 3] || 0;
    if (alpha < 24) return;
    samples.push({
      r: data[index] || 0,
      g: data[index + 1] || 0,
      b: data[index + 2] || 0,
    });
  };
  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 24));
  for (let x = 0; x < width; x += stepX) {
    pushPixel(x, 0);
    pushPixel(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    pushPixel(0, y);
    pushPixel(width - 1, y);
  }
  if (!samples.length) return [{ r: 255, g: 255, b: 255 }];

  const center = {
    r: median(samples.map((sample) => sample.r)),
    g: median(samples.map((sample) => sample.g)),
    b: median(samples.map((sample) => sample.b)),
  };
  const corners = [
    readPixelColor(data, width, 0, 0),
    readPixelColor(data, width, width - 1, 0),
    readPixelColor(data, width, 0, height - 1),
    readPixelColor(data, width, width - 1, height - 1),
  ];
  return [center, ...corners];
}

function readPixelColor(data: Buffer, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return {
    r: data[index] || 0,
    g: data[index + 1] || 0,
    b: data[index + 2] || 0,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function colorDistanceToAny(r: number, g: number, b: number, colors: Array<{ r: number; g: number; b: number }>) {
  return Math.min(...colors.map((color) => (r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2));
}

function touchesTransparentNeighbor(mask: Uint8Array, pixel: number, width: number, height: number) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  return (
    (x > 0 && mask[pixel - 1]) ||
    (x < width - 1 && mask[pixel + 1]) ||
    (y > 0 && mask[pixel - width]) ||
    (y < height - 1 && mask[pixel + width])
  );
}

async function removeSuspiciousWhiteBorder(inputBuffer: Buffer) {
  const border = await detectWhiteBorder(inputBuffer);
  if (!border.hasWhiteBorder) return inputBuffer;

  try {
    const trimmed = await sharp(inputBuffer)
      .trim({ background: "#ffffff", threshold: 14 })
      .toBuffer();
    const originalMeta = await sharp(inputBuffer).metadata();
    const trimmedMeta = await sharp(trimmed).metadata();
    const originalArea = Math.max(1, (originalMeta.width || 0) * (originalMeta.height || 0));
    const trimmedArea = Math.max(1, (trimmedMeta.width || 0) * (trimmedMeta.height || 0));

    if (!trimmedMeta.width || !trimmedMeta.height) return inputBuffer;
    if (trimmedArea < originalArea * 0.35) return inputBuffer;
    return trimmed;
  } catch {
    return inputBuffer;
  }
}

async function detectWhiteBorder(input: Buffer | string) {
  const sample = await sharp(input)
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = sample;
  const borderSize = Math.max(3, Math.round(Math.min(info.width, info.height) * 0.06));
  let borderNearWhite = 0;
  let borderPixels = 0;
  let centerNearWhite = 0;
  let centerPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index] || 0;
      const g = data[index + 1] || r;
      const b = data[index + 2] || r;
      const nearWhite = r > 238 && g > 238 && b > 238 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
      const isBorder = x < borderSize || y < borderSize || x >= info.width - borderSize || y >= info.height - borderSize;
      if (isBorder) {
        borderPixels += 1;
        if (nearWhite) borderNearWhite += 1;
      } else {
        centerPixels += 1;
        if (nearWhite) centerNearWhite += 1;
      }
    }
  }

  const borderRatio = borderNearWhite / Math.max(1, borderPixels);
  const centerRatio = centerNearWhite / Math.max(1, centerPixels);
  return {
    hasWhiteBorder: borderRatio > 0.78 && borderRatio - centerRatio > 0.32,
    borderRatio,
    centerRatio,
  };
}
