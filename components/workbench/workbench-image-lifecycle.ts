import type { ImageDeletionProtection } from "@/components/workbench/image-manager-panel";
import {
  generatedFileNameForImage,
  imageReferencesMatch,
  isPngLayerPackImage,
  nodeImageReferences,
} from "@/components/workbench/workbench-image-collection";
import type { ImageComparisonAsset } from "@/components/workbench/result-preview-tools";
import type { FlowNode, GeneratedImage, ImageAsset } from "@/components/workbench/workbench-types";

export function sanitizeSerializableImageUrl(url?: string) {
  if (!url?.startsWith("data:image/")) return url;
  return undefined;
}

export function findDataImagePath(value: unknown, path = "$", visited = new WeakSet<object>()): string {
  if (typeof value === "string") return value.startsWith("data:image/") ? path : "";
  if (!value || typeof value !== "object") return "";
  if (visited.has(value)) return "";
  visited.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findDataImagePath(value[index], `${path}[${index}]`, visited);
      if (match) return match;
    }
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    const match = findDataImagePath(child, `${path}.${key}`, visited);
    if (match) return match;
  }
  return "";
}

export function stripImageFile(image: ImageAsset): ImageAsset {
  const { file, ...rest } = image;
  void file;
  return {
    ...rest,
    url: sanitizeSerializableImageUrl(rest.url) || rest.originalUrl || rest.previewUrl || rest.thumbnailUrl || "",
    originalUrl: sanitizeSerializableImageUrl(rest.originalUrl),
    thumbnailUrl: sanitizeSerializableImageUrl(rest.thumbnailUrl),
    previewUrl: sanitizeSerializableImageUrl(rest.previewUrl),
    compareBefore: rest.compareBefore ? stripComparisonImage(rest.compareBefore) : undefined,
  };
}

export function imageForComparison(image: ImageAsset): ImageComparisonAsset {
  const clean = stripImageFile(image);
  return stripComparisonImage({
    id: clean.id,
    url: clean.originalUrl || clean.url,
    originalUrl: clean.originalUrl,
    thumbnailUrl: clean.thumbnailUrl,
    previewUrl: clean.previewUrl,
    prompt: clean.prompt || "",
    variant: clean.variant || 1,
    ratio: clean.ratio,
    mode: clean.mode || "优化前",
    model: clean.model,
    aspectRatio: clean.aspectRatio,
    quality: clean.quality,
    generatedAt: clean.generatedAt,
    outputSize: clean.outputSize || (clean.width && clean.height ? { width: clean.width, height: clean.height } : undefined),
    fileName: clean.fileName,
    savedPath: clean.savedPath,
    durationMs: clean.durationMs,
    fileSizeBytes: clean.fileSizeBytes,
    sourceLabel: clean.sourceLabel,
    tags: clean.tags,
    colorTags: clean.colorTags,
    nodeOperation: clean.nodeOperation,
    width: clean.width,
    height: clean.height,
    source: clean.source,
  });
}

export function comparisonImageFromSourceUrl(url: string, image: GeneratedImage): ImageComparisonAsset {
  return stripComparisonImage({
    id: `${image.fileName || image.id || "quality"}_before`,
    url,
    prompt: image.prompt || "",
    variant: image.variant || 1,
    ratio: image.ratio,
    mode: "优化前",
    aspectRatio: image.aspectRatio,
    quality: image.quality,
    outputSize: image.outputSize,
    fileName: url.split("/").pop() || "before.png",
    nodeOperation: image.nodeOperation,
    source: "generated",
  });
}

export function stripComparisonImage(image: ImageComparisonAsset): ImageComparisonAsset {
  return {
    ...image,
    url: sanitizeSerializableImageUrl(image.url) || image.originalUrl || image.previewUrl || image.thumbnailUrl || "",
    originalUrl: sanitizeSerializableImageUrl(image.originalUrl),
    thumbnailUrl: sanitizeSerializableImageUrl(image.thumbnailUrl),
    previewUrl: sanitizeSerializableImageUrl(image.previewUrl),
  };
}

export function imageDeletionProtection(image: ImageAsset, nodes: FlowNode[], projectAssets: ImageAsset[]): ImageDeletionProtection {
  const isTrashed = Boolean(image.trashed || generatedFileNameForImage(image).startsWith("_trash/"));
  const isFavorite = Boolean(image.favorite);
  const isProjectAsset = projectAssets.some((asset) => imageReferencesMatch(asset, image));
  const usedByNodeNames = nodes
    .filter((node) => nodeImageReferences(node).some((item) => imageReferencesMatch(item, image)))
    .map((node) => node.data.title || node.id);
  const isLayerPack = isPngLayerPackImage(image);
  const reasons = [
    isFavorite ? "收藏" : "",
    isProjectAsset ? "项目素材" : "",
    usedByNodeNames.length ? `节点引用 ${usedByNodeNames.length}` : "",
  ].filter(Boolean);
  const protectedImage = reasons.length > 0;
  return {
    protected: protectedImage,
    canDelete: isTrashed || !protectedImage,
    reasons,
    usedByNodes: usedByNodeNames.length,
    usedByNodeNames,
    isProjectAsset,
    isFavorite,
    isLayerPack,
    isTrashed,
  };
}
