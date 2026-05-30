import type { ImageAsset } from "@/components/workbench/workbench-types";

export function imageRatio(image: ImageAsset | null) {
  const width = image?.outputSize?.width || image?.width || image?.ratio?.width || 1;
  const height = image?.outputSize?.height || image?.height || image?.ratio?.height || 1;
  return Math.max(0.08, Math.min(12, width / Math.max(1, height)));
}

export function shouldShowCheckerboard(image: ImageAsset | null | undefined) {
  const text = `${image?.mode || ""} ${image?.fileName || ""} ${image?.materialType || ""}`.toLowerCase();
  return Boolean(image?.alphaCheck?.hasTransparentPixels || /透明|transparent|alpha|cutout|text-layer|文字层/.test(text));
}

export function compactThumbStyle(image: ImageAsset, maxWidth: number, maxHeight: number) {
  const ratio = imageRatio(image);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return {
    height: Math.max(42, Math.round(height)),
    width: Math.max(42, Math.round(width)),
  };
}

export function imageNodePreviewMetrics(image: ImageAsset | null) {
  if (!image) {
    return {
      previewWidth: 180,
      previewHeight: 116,
      nodeWidth: 198,
      estimatedNodeHeight: 168,
    };
  }

  const ratio = imageRatio(image);
  const nodeWidth = ratio >= 2.8 ? 160 : ratio >= 1.35 ? 166 : ratio >= 0.82 ? 156 : 146;
  const previewHeight = ratio >= 2.8 ? 70 : ratio >= 1.35 ? 82 : ratio >= 0.82 ? 94 : 106;
  const previewWidth = Math.max(48, Math.min(nodeWidth - 14, Math.round(previewHeight * ratio)));
  return {
    previewWidth,
    previewHeight,
    nodeWidth,
    estimatedNodeHeight: previewHeight + 48,
  };
}
