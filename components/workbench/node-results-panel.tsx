"use client";

import { memo, type CSSProperties, type ReactNode } from "react";
import { Images } from "lucide-react";
import { ImageFrame } from "@/components/workbench/image-frame";

export type NodeResultImage = {
  id: string;
  url: string;
  prompt?: string;
  variant?: number;
  branchLabel?: string;
  fileName?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  alphaCheck?: {
    hasTransparentPixels?: boolean;
  };
  qualityCheck?: {
    status?: string;
    label?: string;
    deliverability?: "ready" | "needs_review" | "not_ready";
    deliverabilityLabel?: string;
    issues?: string[];
  };
};

function NodeResultsPanelComponent<TImage extends NodeResultImage>({
  compactThumbStyle,
  imageSourceSummary,
  images,
  nodeOperationLabel,
  onPreview,
  shouldShowCheckerboard,
}: {
  images: TImage[];
  compactThumbStyle: (image: TImage, maxWidth: number, maxHeight: number) => CSSProperties;
  imageSourceSummary: (image: TImage, labelForOperation?: (value?: string) => string) => string;
  nodeOperationLabel: (value?: string) => string;
  shouldShowCheckerboard: (image: TImage | null | undefined) => boolean;
  onPreview: (image: TImage) => void;
}) {
  if (!images.length) {
    return <EmptyPanel icon={<Images className="size-8" />} title="暂无结果" description="" />;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((image, index) => (
        <button
          className="apple-surface-section group min-w-0 overflow-hidden p-1.5 text-left transition hover:bg-white/[0.07]"
          key={`${image.id}-${index}`}
          onClick={() => onPreview(image)}
          title={image.branchLabel || image.fileName || `方案 ${image.variant || index + 1}`}
          type="button"
        >
          <ImageFrame
            alt={image.branchLabel || image.fileName || `方案 ${image.variant || index + 1}`}
            className="rounded-[14px] border-white/8"
            fit="contain"
            image={image}
            preserveRatio={false}
            showCheckerboard={shouldShowCheckerboard(image)}
            style={{ ...compactThumbStyle(image, 124, 76), margin: "0 auto" }}
            variant="thumbnail"
          />
          <div className="mt-1.5 truncate px-1 text-[10px] font-semibold text-white/64">
            {image.branchLabel || `方案 ${image.variant || index + 1}`}
          </div>
          <div className="mt-1 flex items-center gap-1 px-1">
            <span className="min-w-0 flex-1 truncate text-[9px] text-white/34">
              {imageSourceSummary(image, nodeOperationLabel)}
            </span>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${resultQualityClass(image)}`}>
              {resultQualityLabel(image)}
            </span>
          </div>
          {image.qualityCheck?.issues?.length ? (
            <div className="mt-1 line-clamp-1 px-1 text-[9px] text-[#ffe1a0]/72">
              {image.qualityCheck.issues[0]}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export const NodeResultsPanel = memo(NodeResultsPanelComponent) as typeof NodeResultsPanelComponent;

function EmptyPanel({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <div className="apple-surface-section flex min-h-[170px] flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 text-white/30">{icon}</div>
      <div className="text-[13px] font-semibold text-white/72">{title}</div>
      {description ? <p className="mt-1 max-w-[210px] text-[11px] leading-5 text-white/38">{description}</p> : null}
    </div>
  );
}

function resultQualityLabel(image: NodeResultImage) {
  if (image.qualityCheck?.deliverabilityLabel) return compactQualityLabel(image.qualityCheck.deliverabilityLabel);
  if (image.qualityCheck?.label) return compactQualityLabel(image.qualityCheck.label);
  if (image.qualityCheck?.status === "passed") return "可交付";
  if (image.qualityCheck?.status) return "需复查";
  return "待检查";
}

function compactQualityLabel(label: string) {
  return label.replace(/\s/g, "").replace("建议复查", "复查").replace("不可交付", "未达标");
}

function resultQualityClass(image: NodeResultImage) {
  const status = image.qualityCheck?.deliverability || image.qualityCheck?.status;
  if (status === "ready" || status === "passed") return "border-[#74e3c5]/20 bg-[#74e3c5]/10 text-[#adf8e5]";
  if (status === "not_ready" || status === "failed" || status === "empty" || status === "size_insufficient" || status === "white_border" || status === "ratio_mismatch") {
    return "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]";
  }
  return "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]";
}
