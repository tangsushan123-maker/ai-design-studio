import sharp from "sharp";

export const maxUploadBytes = 50 * 1024 * 1024;
export const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function assertSupportedImage(file: File) {
  if (!supportedImageTypes.has(file.type)) {
    throw new Error("图片格式不支持，请上传 PNG、JPG 或 WebP。");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("图片文件过大，请上传小于 50MB 的图片。");
  }
}

export async function getImageRatio(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;

  return {
    width,
    height,
  };
}
