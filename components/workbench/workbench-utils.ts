import { type AspectRatioValue, type QualityValue } from "@/lib/design-options";

export const ratioOptions: AspectRatioValue[] = ["1:1", "4:5", "3:4", "4:3", "16:9", "9:16", "9.75:1", "custom"];
export const adaptiveRatioOptions: AspectRatioValue[] = ["auto", "1:1", "4:5", "3:4", "4:3", "16:9", "9:16", "9.75:1", "custom"];
const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 32) || "design";
}

export function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function isAspectRatioValue(value: unknown): value is AspectRatioValue {
  return value === "auto" || value === "1:1" || value === "4:5" || value === "3:4" || value === "4:3" || value === "16:9" || value === "9:16" || value === "9.75:1" || value === "custom";
}

export function stringParam(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function numericParam(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function inferRatioFromPrompt(prompt: string): AspectRatioValue | null {
  if (!prompt.trim()) return null;
  if (/小红书|3[:：]4/.test(prompt)) return "3:4";
  if (/4[:：]3/.test(prompt)) return "4:3";
  if (/抖音|视频号|竖版|竖屏|9[:：]16/.test(prompt)) return "9:16";
  if (/横版|横屏|16[:：]9/.test(prompt)) return "16:9";
  if (/朋友圈|方图|头像|1[:：]1/.test(prompt)) return "1:1";
  if (/4[:：]5/.test(prompt)) return "4:5";
  if (/超宽|9\\.75[:：]1/.test(prompt)) return "9.75:1";
  if (/主视觉|KV|kv|横幅|banner|头图|展板|大屏|电子屏|PPT|ppt|背景图|官网首屏|发布会/.test(prompt)) return "16:9";
  if (/海报|招募|招聘|宣传|封面|展架|易拉宝|水牌|展页|折页/.test(prompt)) return "3:4";
  if (/短视频|视频封面|手机海报|手机封面|竖构图|竖图/.test(prompt)) return "9:16";
  if (/logo|Logo|LOGO|icon|Icon|头像|贴纸|徽章/.test(prompt)) return "1:1";
  return null;
}

export function resolveAdaptiveRatioFromPrompt(prompt: string): AspectRatioValue {
  return inferRatioFromPrompt(prompt) || "16:9";
}

export function ratioOptionLabel(value: string) {
  if (value === "auto") return "自适应";
  if (value === "custom") return "自定义";
  return value;
}

export function ratioParam(value: unknown): AspectRatioValue {
  const text = stringParam(value);
  if (text === "auto" || text === "1:1" || text === "4:5" || text === "3:4" || text === "4:3" || text === "16:9" || text === "9:16" || text === "9.75:1" || text === "custom") return text;
  return "1:1";
}

export function resolveRequestedAspectRatio(value: unknown, prompt: string): AspectRatioValue {
  const ratio = ratioParam(value);
  return ratio === "auto" ? resolveAdaptiveRatioFromPrompt(prompt) : ratio;
}

export function qualityParam(value: unknown): QualityValue {
  if (value === "2k" || value === "4k" || value === "standard") return value;
  return "standard";
}

export function customSize(params: Record<string, unknown>) {
  const targetSize = stringParam(params.targetSize);
  return parseTargetSize(targetSize);
}

export function parseTargetSize(value: string) {
  const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return { width: undefined, height: undefined };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function inferRatioFromTargetSize(value: string): AspectRatioValue {
  const match = value.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) return "custom";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return "custom";
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  if (Math.abs(ratio - 4 / 5) < 0.02) return "4:5";
  if (Math.abs(ratio - 3 / 4) < 0.02) return "3:4";
  if (Math.abs(ratio - 4 / 3) < 0.02) return "4:3";
  if (Math.abs(ratio - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(ratio - 9.75) < 0.04) return "9.75:1";
  return "custom";
}

export function isSupportedImageFile(file: File) {
  return supportedImageTypes.has(file.type);
}

export function firstSupportedImageFile(files: FileList | File[]) {
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file && isSupportedImageFile(file)) return file;
  }
  return null;
}

export function hasClipboardImageFile(clipboardData: DataTransfer | null) {
  if (!clipboardData) return false;
  const items = Array.from(clipboardData.items || []);
  return (
    items.some((item) => item.kind === "file" && supportedImageTypes.has(item.type)) ||
    Array.from(clipboardData.files || []).some((file) => supportedImageTypes.has(file.type))
  );
}

export function hasClipboardImageCandidate(clipboardData: DataTransfer | null) {
  if (!clipboardData) return false;
  const items = Array.from(clipboardData.items || []);
  return (
    items.some((item) => item.kind === "file" && supportedImageTypes.has(item.type)) ||
    Array.from(clipboardData.files || []).some((file) => supportedImageTypes.has(file.type)) ||
    items.some((item) => item.kind === "string" && ["text/html", "text/uri-list"].includes(item.type))
  );
}

export async function getImageFileFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) return null;
  const imageItem = Array.from(clipboardData.items || []).find((item) => item.kind === "file" && supportedImageTypes.has(item.type));
  const imageBlob = imageItem?.getAsFile() || Array.from(clipboardData.files || []).find((file) => supportedImageTypes.has(file.type));
  if (imageBlob) return blobToFile(imageBlob, "pasted-image");

  const html = await getClipboardString(clipboardData, "text/html");
  const imageSrc = extractImageSrc(html);
  const urlText = imageSrc || (await getClipboardString(clipboardData, "text/uri-list"));
  const imageUrl = normalizeClipboardImageUrl(urlText);
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:image/")) return dataUrlToFile(imageUrl);
  return remoteImageUrlToFile(imageUrl);
}

export function getClipboardString(clipboardData: DataTransfer, type: string) {
  const item = Array.from(clipboardData.items || []).find((entry) => entry.kind === "string" && entry.type === type);
  if (!item) return Promise.resolve("");
  return new Promise<string>((resolve) => item.getAsString((value) => resolve(value || "")));
}

export function dataUrlToFile(dataUrl: string) {
  return fetch(dataUrl).then((response) => response.blob()).then((blob) => blobToFile(blob, "pasted-image"));
}

export async function fileFromImageUrl(url: string, fallbackName: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("读取图片失败。");
  const blob = await response.blob();
  const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.replace("image/", "") || "png";
  const fileName = fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`;
  return new File([blob], fileName, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });
}

export function isLocalGeneratedUrl(url?: string) {
  return Boolean(url && url.startsWith("/generated/"));
}

function extractImageSrc(html: string) {
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
}

function normalizeClipboardImageUrl(value: string) {
  const candidate = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (!candidate) return "";
  if (candidate.startsWith("data:image/")) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {}
  return "";
}

async function remoteImageUrlToFile(url: string) {
  const response = await fetch("/api/import-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "无法读取剪贴板里的图片链接，请改用拖拽或本地上传。");
  }
  return blobToFile(await response.blob(), "pasted-image");
}

function blobToFile(blob: Blob, baseName: string) {
  const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.replace("image/", "") || "png";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([blob], `${baseName}-${timestamp}.${extension}`, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });
}
