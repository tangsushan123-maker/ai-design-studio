import { deliveryFileNameForFormat } from "@/lib/workbench-downloads";
import type { ImageAsset } from "@/components/workbench/workbench-types";

export async function copyImageToClipboard(image: ImageAsset) {
  if (!window.isSecureContext || !navigator.clipboard || !("ClipboardItem" in window)) {
    throw new Error("当前浏览器不支持直接复制图片，请先下载。");
  }
  const blob = await imageUrlToPngBlob(image.url);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "NotAllowedError"
      ? "浏览器没有允许复制图片，请点一下页面后重试，或使用下载。"
      : "复制图片失败，当前浏览器可能限制了图片剪贴板。请先下载。");
  }
}

export async function copyTextToClipboard(text: string) {
  if (!text.trim()) throw new Error("没有可复制的 Prompt。");
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("复制 Prompt 失败，浏览器阻止了剪贴板权限。");
}

export async function downloadImageFile(image: ImageAsset, format: "png" | "jpg" | "webp", fileNameOverride?: string) {
  const blob = format === "jpg" ? await imageUrlToJpegBlob(image.url) : format === "webp" ? await imageUrlToWebpBlob(image.url) : await imageUrlToPngBlob(image.url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  const baseName = fileNameOverride || image.fileName || "design.png";
  link.download = deliveryFileNameForFormat(baseName, format);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

export async function downloadRemoteFile(url: string, fileName: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("下载文件失败。");
  await downloadBlob(await response.blob(), fileName);
}

async function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

async function imageUrlToPngBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法复制。");
  const sourceBlob = await response.blob();
  return convertBlobToPng(sourceBlob);
}

async function imageUrlToJpegBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法下载 JPG。");
  const sourceBlob = await response.blob();
  if (sourceBlob.type === "image/jpeg") return sourceBlob;
  return convertBlobToJpeg(sourceBlob);
}

async function imageUrlToWebpBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法下载 WebP。");
  const sourceBlob = await response.blob();
  if (sourceBlob.type === "image/webp") return sourceBlob;
  return convertBlobToWebp(sourceBlob);
}

function toAbsoluteImageUrl(url: string) {
  if (url.startsWith("data:")) return url;
  return new URL(url, window.location.origin).toString();
}

async function convertBlobToPng(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("复制图片失败。");
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("复制图片失败。"));
    }, "image/png");
  });
}

async function convertBlobToJpeg(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("导出 JPG 失败。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("导出 JPG 失败。"));
    }, "image/jpeg", 0.96);
  });
}

async function convertBlobToWebp(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("导出 WebP 失败。");
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("导出 WebP 失败。"));
    }, "image/webp", 0.92);
  });
}
