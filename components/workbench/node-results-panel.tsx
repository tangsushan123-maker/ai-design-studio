"use client";

import { memo, type CSSProperties, type ReactNode } from "react";
import { Images } from "lucide-react";
import { DeliveryStatusBadge } from "@/components/workbench/delivery-status-badge";
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
    actions?: string[];
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
    return (
      <EmptyPanel
        icon={<Images className="size-8" />}
        title="暂无结果"
        description="当前节点还没有可预览图片；运行节点后会显示方案缩略图和交付状态。"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((image, index) => {
        const firstIssue = image.qualityCheck?.issues?.[0];
        const firstAction = image.qualityCheck?.actions?.[0];
        return (
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
          <div className="mt-1.5 truncate px-1 text-[11px] font-semibold text-white/64">
            {image.branchLabel || `方案 ${image.variant || index + 1}`}
          </div>
          <div className="mt-1 flex items-center gap-1 px-1">
            <span className="min-w-0 flex-1 truncate text-[11px] text-white/38">
              {imageSourceSummary(image, nodeOperationLabel)}
            </span>
            <DeliveryStatusBadge image={image} />
          </div>
          {firstIssue ? (
            <div className="mt-1 line-clamp-1 px-1 text-[11px] text-[#ffe1a0]/76">
              {firstIssue}
            </div>
          ) : null}
          {firstAction ? (
            <div className="mt-1 line-clamp-1 rounded-[10px] border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/50">
              建议：{firstAction}
            </div>
          ) : null}
        </button>
        );
      })}
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
