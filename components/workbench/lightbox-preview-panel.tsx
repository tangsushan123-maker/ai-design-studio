"use client";

import { ImageFrame } from "@/components/workbench/image-frame";
import { LightboxPreviewToolbar } from "@/components/workbench/lightbox-preview-toolbar";
import { ImageComparisonSlider, type ImageComparisonAsset, type PngLayerExportLayer } from "@/components/workbench/result-preview-tools";
import { largePreviewFrameStyle, pngLayerDisplayName, pngLayerPreviewImage, zoomedPreviewFrameStyle } from "@/components/workbench/workbench-image-display";
import type { ImageAsset } from "@/components/workbench/workbench-types";

type LightboxPreviewPanelProps = {
  activePngLayer: PngLayerExportLayer | null;
  compareBefore: ImageComparisonAsset | null;
  compareSplit: number;
  image: ImageAsset;
  previewZoom: number;
  showQualityComparison: boolean;
  onCompareSplitChange: (value: number) => void;
  onPreviewZoomChange: (value: number) => void;
};

export function LightboxPreviewPanel({
  activePngLayer,
  compareBefore,
  compareSplit,
  image,
  previewZoom,
  showQualityComparison,
  onCompareSplitChange,
  onPreviewZoomChange,
}: LightboxPreviewPanelProps) {
  const previewFrameStyle = previewZoom
    ? zoomedPreviewFrameStyle(image, previewZoom)
    : largePreviewFrameStyle(image);

  return (
    <div className="min-h-0 p-2 sm:p-3">
      <LightboxPreviewToolbar previewZoom={previewZoom} onPreviewZoomChange={onPreviewZoomChange} />
      <div className={`relative h-[calc(100%-46px)] min-h-[320px] overflow-auto bg-transparent p-2 ${previewZoom ? "flex items-start justify-start" : "flex items-center justify-center"}`}>
        <div className="relative mx-auto overflow-hidden rounded-[18px] border border-white/10 bg-transparent shadow-[0_20px_70px_rgba(0,0,0,0.32)]" style={previewFrameStyle}>
          {activePngLayer ? (
            <div className="relative h-full w-full">
              <ImageFrame
                alt={activePngLayer.name || activePngLayer.filename}
                className="h-full w-full border-0 bg-transparent"
                fit="contain"
                image={pngLayerPreviewImage(activePngLayer)}
                loading="eager"
                preserveRatio={false}
                showCheckerboard
                variant="original"
                style={{ height: "100%" }}
              />
              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/14 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/82 backdrop-blur-xl">
                {pngLayerDisplayName(activePngLayer)}
              </div>
            </div>
          ) : showQualityComparison && compareBefore ? (
            <ImageComparisonSlider
              after={image}
              before={compareBefore}
              split={compareSplit}
              onSplitChange={onCompareSplitChange}
            />
          ) : (
            <ImageFrame alt={image.fileName || image.id} className="h-full w-full border-0 bg-transparent" fit="contain" image={image} loading="eager" preserveRatio={false} variant="original" style={{ height: "100%" }} />
          )}
        </div>
      </div>
    </div>
  );
}
