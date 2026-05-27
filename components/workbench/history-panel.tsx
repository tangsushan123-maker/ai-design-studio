"use client";

import { Star } from "lucide-react";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { DeliveryStatusBadge } from "@/components/workbench/delivery-status-badge";
import { ImageFrame } from "@/components/workbench/image-frame";

type HistoryPanelImage = {
  id: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  generatedAt?: string;
  model?: string;
  mode?: string;
  nodeOperation?: string;
  projectId?: string;
  sourceTaskId?: string;
  sourceRequestId?: string;
  sourceNodeId?: string;
  sourceNodeName?: string;
  sourceNodeKind?: string;
  favorite?: boolean;
  qualityCheck?: {
    importantContentRisk?: boolean;
    importantContentLabel?: string;
    status?: string;
    label?: string;
    deliverability?: "ready" | "needs_review" | "not_ready";
    deliverabilityLabel?: string;
    issues?: string[];
  };
  sourceStrategyTitle?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
};

const resultFilterTabs = ["今日", "收藏", "项目", "全部"] as const;
const resultPageSize = 16;

export function HistoryPanel({
  images,
  hasMoreFromServer = false,
  loadingMore = false,
  projectId,
  emptyState,
  historyMatchesFilter,
  historyMatchesQuery,
  nodeOperationLabel,
  onDrag,
  onLoadMore,
  onPreview,
  onToggleFavorite,
  qualityBadgeLabel,
  qualityTone,
}: {
  images: HistoryPanelImage[];
  hasMoreFromServer?: boolean;
  loadingMore?: boolean;
  projectId: string;
  emptyState?: ReactNode;
  formatFileSize: (bytes?: number) => string;
  historyMatchesFilter: (image: HistoryPanelImage, filter: string, projectId: string) => boolean;
  historyMatchesQuery: (image: HistoryPanelImage, query: string) => boolean;
  nodeOperationLabel: (value?: string) => string;
  onAddToCanvas: (image: HistoryPanelImage) => void;
  onDrag: (event: DragEvent<HTMLElement>, image: HistoryPanelImage) => void;
  onLoadMore?: () => void;
  onDelete?: (image: HistoryPanelImage) => void;
  onPreview: (image: HistoryPanelImage) => void;
  onResize: (image: HistoryPanelImage) => void;
  onToggleFavorite: (image: HistoryPanelImage) => void;
  onUpscale: (image: HistoryPanelImage) => void;
  qualityBadgeLabel: (image: HistoryPanelImage) => string;
  qualityTone: (image: HistoryPanelImage) => string;
}) {
  const [filter, setFilter] = useState<(typeof resultFilterTabs)[number]>("项目");
  const [visibleCount, setVisibleCount] = useState(resultPageSize);

  const orderedImages = useMemo(() => [...images].sort(compareHistoryImages), [images]);
  const filteredImages = useMemo(
    () => orderedImages.filter((image) => historyMatchesFilter(image, filter, projectId) && historyMatchesQuery(image, "")),
    [filter, historyMatchesFilter, historyMatchesQuery, orderedImages, projectId],
  );
  const visibleImages = useMemo(() => filteredImages.slice(0, visibleCount), [filteredImages, visibleCount]);
  const hasMoreLocal = filteredImages.length > visibleImages.length;
  const hasMore = hasMoreLocal || hasMoreFromServer;

  if (!images.length) return emptyState || null;

  return (
    <div className="space-y-2.5">
      <div className="apple-panel sticky top-0 z-10 rounded-[18px] p-2">
        <div className="grid grid-cols-4 gap-1">
          {resultFilterTabs.map((item) => (
            <button
              className={`apple-segment px-2 py-1.5 text-[11px] transition ${filter === item ? "apple-segment-active" : ""}`}
              key={item}
              onClick={() => {
                setFilter(item);
                setVisibleCount(resultPageSize);
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        {visibleCount > resultPageSize ? (
          <button className="apple-segment mt-2 w-full px-2 py-1.5 text-[10px]" onClick={() => setVisibleCount(resultPageSize)} type="button">
            收起到 16 张
          </button>
        ) : null}
      </div>

      {!filteredImages.length ? (
        <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.035] p-6 text-center text-[12px] text-white/44">
          <div>没有匹配的结果。</div>
          {filter !== "全部" ? (
            <button className="apple-button mt-3 px-3 py-1.5 text-[11px]" onClick={() => setFilter("全部")} type="button">
              查看全部
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {visibleImages.map((image) => (
          <article
            className={`apple-surface-section group relative z-0 min-w-0 overflow-visible p-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.14)] ${qualityTone(image)}`}
            draggable
            key={image.id}
            onDragStart={(event) => onDrag(event, image)}
          >
            <button aria-label={`预览${historyCardTitle(image)}`} className="relative block w-full overflow-hidden rounded-[14px] text-left" onClick={() => onPreview(image)} type="button">
              <ImageFrame
                alt={historyCardTitle(image)}
                className="rounded-[14px] border-white/8"
                fit="contain"
                image={image}
                preserveRatio={false}
                style={{ height: 82 }}
                variant="thumbnail"
              />
            </button>

            <button
              aria-label={image.favorite ? "取消收藏" : "收藏"}
              className={`absolute right-2.5 top-2.5 z-10 flex size-6 items-center justify-center rounded-full border border-white/16 shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur-xl transition ${image.favorite ? "bg-[rgba(102,76,19,0.86)] text-[#ffe1a0]" : "bg-[rgba(18,23,32,0.58)] text-white/82 hover:bg-[rgba(28,34,46,0.82)]"}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFavorite(image);
              }}
              title={image.favorite ? "取消收藏" : "收藏"}
              type="button"
            >
              <Star className={`size-3 ${image.favorite ? "fill-current" : ""}`} />
            </button>

            <div className="px-1 pb-1 pt-1.5">
              <button className="block w-full min-w-0 text-left" onClick={() => onPreview(image)} type="button">
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/64">{historyCardTitle(image)}</div>
                    <DeliveryStatusBadge image={image} fallbackLabel={qualityBadgeLabel(image)} />
                  </div>
                  <div className="mt-0.5 truncate text-[9px] text-white/34">{historySourceLine(image, nodeOperationLabel)}</div>
                  {image.qualityCheck?.issues?.length ? (
                    <div className="mt-0.5 truncate text-[9px] text-[#ffe1a0]/72">{image.qualityCheck.issues[0]}</div>
                  ) : null}
                </div>
              </button>
            </div>
          </article>
        ))}
      </div>
      {hasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={loadingMore}
          onClick={() => {
            if (hasMoreLocal) {
              setVisibleCount((count) => count + resultPageSize);
              return;
            }
            onLoadMore?.();
          }}
          type="button"
        >
          {loadingMore ? "加载中..." : "查看更多"}
        </button>
      ) : null}
    </div>
  );
}

function historyCardTitle(image: HistoryPanelImage) {
  if (image.materialType) return image.materialType;
  if (image.mode && image.mode !== "本地历史") return image.mode;
  return image.fileName?.split("/").pop() || "结果图片";
}

function historySourceLine(image: HistoryPanelImage, nodeOperationLabel: (value?: string) => string) {
  const operation = nodeOperationLabel(image.sourceNodeKind || image.nodeOperation);
  const node = image.sourceNodeName ? `节点 ${image.sourceNodeName}` : "";
  const request = image.sourceRequestId ? `请求 ${shortTraceId(image.sourceRequestId)}` : image.sourceTaskId ? `任务 ${shortTraceId(image.sourceTaskId)}` : "";
  return [operation, node, request].filter(Boolean).join(" · ") || "来源未记录";
}

function shortTraceId(id: string) {
  const clean = id.replace(/^req_/, "").replace(/^task_/, "");
  return clean.length <= 8 ? clean : clean.slice(-8);
}

function compareHistoryImages(a: HistoryPanelImage, b: HistoryPanelImage) {
  const generatedDiff = new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  if (generatedDiff) return generatedDiff;
  const nameA = a.fileName || a.id || a.url;
  const nameB = b.fileName || b.id || b.url;
  return nameB.localeCompare(nameA);
}
