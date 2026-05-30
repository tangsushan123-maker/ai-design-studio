import { comparisonImageFromSourceUrl, stripComparisonImage } from "@/components/workbench/workbench-image-lifecycle";
import { friendlyDisplayError } from "@/components/workbench/workbench-labels";
import { dataUrlToFile, fileFromImageUrl, localGeneratedSourceUrlForImage } from "@/components/workbench/workbench-utils";
import type { ImageComparisonAsset } from "@/components/workbench/result-preview-tools";
import type { GeneratedImage, ImageAsset } from "@/components/workbench/workbench-types";

type NormalizedImageTaskResponse = {
  error?: string;
  images: GeneratedImage[];
  requestId?: string;
  projectId?: string;
  status?: string;
  retryable?: boolean;
  elapsedMs?: number;
  errorReason?: string;
};

export async function appendImageToForm(formData: FormData, image: ImageAsset, fileKey: string, urlKey: string, fallbackName: string) {
  if (image.file) {
    formData.append(fileKey, image.file);
    return;
  }
  const sourceUrl = localGeneratedSourceUrlForImage(image);
  if (sourceUrl) {
    formData.append(urlKey, sourceUrl);
    return;
  }
  const displayUrl = image.url || image.originalUrl || image.previewUrl || image.thumbnailUrl;
  if (!displayUrl) throw new Error("这张图片缺少可读取的原图地址。");
  formData.append(fileKey, await fileFromImageUrl(displayUrl, image.fileName || fallbackName));
}

export async function imageSourcePayloadForPngLayerExport(image: ImageAsset) {
  const sourceUrl = localGeneratedSourceUrlForImage(image);
  if (sourceUrl) return { imageUrl: sourceUrl };
  if (image.url.startsWith("data:image/")) return { imageData: image.url };
  const displayUrl = image.url || image.originalUrl || image.previewUrl || image.thumbnailUrl;
  if (!displayUrl) throw new Error("这张图片缺少可读取的原图地址。");
  const source = image.file || await fileFromImageUrl(displayUrl, image.fileName || "source.png");
  return { imageData: await blobToDataUrl(source) };
}

export async function appendDataUrlToForm(formData: FormData, dataUrl: string, fileKey: string, fallbackName: string) {
  const file = await dataUrlToFile(dataUrl);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.replace("image/", "") || "png";
  const fileName = file.name || `${fallbackName.replace(/\.[^.]+$/, "")}.${extension}`;
  formData.append(fileKey, new File([file], fileName, { type: file.type || "image/png", lastModified: Date.now() }));
}

export async function imagesFromResponse(response: Response) {
  const data = normalizeImageTaskResponse(await readJsonResponse(response));
  if (!response.ok && !data.images.length) {
    const retryHint = data.retryable ? "（可重试）" : "";
    throw new Error(friendlyDisplayError(data.errorReason || data.error || `节点运行失败（HTTP ${response.status}）。${retryHint}`));
  }
  return data.images.map((image) => ({ ...image, source: "generated" as const }));
}

export async function imageFromSingleResponse(response: Response, modeLabel: string, fallbackPrompt: string, fallbackError: string) {
  const data = normalizeImageTaskResponse(await readJsonResponse(response));
  if (!response.ok || !data.images.length) {
    throw new Error(friendlyDisplayError(data.errorReason || data.error || fallbackError));
  }
  return imageFromSavedResponse(data.images[0], modeLabel, fallbackPrompt);
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      error: response.status >= 500
        ? `服务暂时不可用（HTTP ${response.status}），可能是模型代理或上游接口超时。`
        : `接口返回格式异常（HTTP ${response.status}）。`,
    };
  }
}

function normalizeImageTaskResponse(data: Record<string, unknown>): NormalizedImageTaskResponse {
  const candidates = [
    data.images,
    data.outputs,
    data.image,
    data.output,
  ];
  const seen = new Set<string>();
  const images: GeneratedImage[] = [];
  for (const candidate of candidates) {
    const items = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
    for (const item of items) {
      if (!isImageAssetLike(item)) continue;
      const image = item as GeneratedImage;
      const key = image.id || image.fileName || image.savedPath || image.url || image.originalUrl;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      images.push(image);
    }
  }
  return {
    error: typeof data.error === "string" ? data.error : undefined,
    errorReason: typeof data.errorReason === "string" ? data.errorReason : undefined,
    requestId: typeof data.requestId === "string" ? data.requestId : undefined,
    projectId: typeof data.projectId === "string" ? data.projectId : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    retryable: typeof data.retryable === "boolean" ? data.retryable : undefined,
    elapsedMs: typeof data.elapsedMs === "number" ? data.elapsedMs : undefined,
    images,
  };
}

function imageFromSavedResponse(data: GeneratedImage & { url: string }, modeLabel: string, fallbackPrompt: string): ImageAsset {
  const now = new Date().toISOString();
  return {
    id: data.fileName || data.url || `${Date.now()}`,
    url: data.url,
    prompt: data.prompt || fallbackPrompt,
    variant: data.variant || 1,
    ratio: data.ratio,
    mode: data.mode || modeLabel,
    model: data.model,
    aspectRatio: data.aspectRatio,
    quality: data.quality,
    generatedAt: data.generatedAt || now,
    outputSize: data.outputSize,
    originalUrl: data.originalUrl,
    thumbnailUrl: data.thumbnailUrl,
    previewUrl: data.previewUrl,
    expectedOutputSize: data.expectedOutputSize,
    qualityCheck: data.qualityCheck,
    qualityEnhance: data.qualityEnhance,
    pngLayerExport: data.pngLayerExport,
    fileName: data.fileName,
    savedPath: data.savedPath,
    durationMs: data.durationMs,
    fileSizeBytes: data.fileSizeBytes,
    alphaCheck: data.alphaCheck,
    nodeOperation: data.nodeOperation,
    projectId: data.projectId,
    parentImageId: data.parentImageId,
    rootImageId: (data as ImageAsset).rootImageId,
    branchId: (data as ImageAsset).branchId,
    branchLabel: (data as ImageAsset).branchLabel,
    resultGroupId: (data as ImageAsset).resultGroupId,
    nextImageIds: data.nextImageIds,
    sourceTaskId: data.sourceTaskId,
    sourceRequestId: (data as ImageAsset).sourceRequestId,
    sourceNodeId: (data as ImageAsset).sourceNodeId,
    sourceNodeName: (data as ImageAsset).sourceNodeName,
    sourceNodeKind: (data as ImageAsset).sourceNodeKind,
    maskProtectionCheck: data.maskProtectionCheck,
    protectionContext: data.protectionContext,
    version: data.version,
    strategyPackageId: (data as ImageAsset).strategyPackageId,
    sourceStrategyTitle: (data as ImageAsset).sourceStrategyTitle,
    materialPlanItemId: (data as ImageAsset).materialPlanItemId,
    materialType: (data as ImageAsset).materialType,
    targetSize: (data as ImageAsset).targetSize,
    materialCopy: (data as ImageAsset).materialCopy,
    materialScene: (data as ImageAsset).materialScene,
    compareBefore: (data as ImageAsset).compareBefore
      ? stripComparisonImage((data as ImageAsset).compareBefore as ImageComparisonAsset)
      : data.sourceCompareUrl
        ? comparisonImageFromSourceUrl(data.sourceCompareUrl, data)
        : undefined,
    favorite: data.favorite,
    source: "generated",
  };
}

function isImageAssetLike(value: unknown): value is GeneratedImage & { url: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片数据失败。"));
    reader.readAsDataURL(blob);
  });
}
