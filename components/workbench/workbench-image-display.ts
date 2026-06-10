import type { ImageAsset } from "@/components/workbench/workbench-types";
import type { PngLayerExportLayer } from "@/components/workbench/result-preview-tools";

export function imageRatioStyle(image: Pick<ImageAsset, "outputSize" | "width" | "height"> | null | undefined) {
  const width = image?.outputSize?.width || image?.width || 1;
  const height = image?.outputSize?.height || image?.height || 1;
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
  };
}

export function largePreviewFrameStyle(image: Pick<ImageAsset, "outputSize" | "width" | "height"> | null | undefined) {
  const width = image?.outputSize?.width || image?.width || 1;
  const height = image?.outputSize?.height || image?.height || 1;
  const ratio = Math.max(0.18, Math.min(8, width / Math.max(1, height)));
  const heightBudget = ratio < 0.76 ? "(94vh - 220px)" : ratio > 2.4 ? "(94vh - 260px)" : "(94vh - 240px)";
  const maxWidth = ratio < 0.76 ? 460 : ratio > 2.4 ? 920 : ratio > 1.18 ? 840 : 640;
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
    width: `min(100%, ${maxWidth}px, calc(${heightBudget} * ${ratio}))`,
    maxWidth: "100%",
    maxHeight: `calc${heightBudget}`,
  };
}

export function zoomedPreviewFrameStyle(image: Pick<ImageAsset, "outputSize" | "width" | "height"> | null | undefined, zoom: number) {
  const width = Math.max(1, image?.outputSize?.width || image?.width || 1);
  const height = Math.max(1, image?.outputSize?.height || image?.height || 1);
  const scaledWidth = Math.round(width * zoom);
  const scaledHeight = Math.round(height * zoom);
  return {
    aspectRatio: `${width} / ${height}`,
    width: `${scaledWidth}px`,
    height: `${scaledHeight}px`,
    minWidth: `${scaledWidth}px`,
    minHeight: `${scaledHeight}px`,
    flexShrink: 0,
    maxWidth: "none",
    maxHeight: "none",
  };
}

export function pngLayerPreviewImage(layer: PngLayerExportLayer) {
  return {
    url: layer.url,
    originalUrl: layer.url,
    previewUrl: layer.url,
    thumbnailUrl: layer.url,
  };
}

export function pngLayerDisplayName(layer: Pick<PngLayerExportLayer, "filename" | "kind" | "name">) {
  if (layer.kind === "background" || layer.filename.includes("background")) return "背景层";
  if (layer.kind === "text" || layer.filename.includes("text")) return "文字层";
  if (layer.kind === "subject" || layer.filename.includes("subject")) return "主体层";
  if (layer.kind === "person_only" || layer.filename.includes("person_only")) return "单独人物层";
  if (layer.kind === "person" || layer.filename.includes("person")) return "人物层";
  if (layer.kind === "product" || layer.filename.includes("product")) return "产品层";
  if (layer.kind === "main_visual" || layer.filename.includes("main_visual")) return "图片主视觉层";
  if (layer.kind === "auxiliary" || layer.filename.includes("auxiliary")) return "辅助元素层";
  return layer.name || layer.filename;
}
