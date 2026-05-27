"use client";

import { Maximize2, Plus, Search, Sparkles, Star, Trash2, X } from "lucide-react";
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
  onAddToCanvas,
  onDelete,
  onDrag,
  onLoadMore,
  onPreview,
  onResize,
  onToggleFavorite,
  onUpscale,
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
  onDelete?: (image: HistoryPanelImage) => void | Promise<unknown>;
  onPreview: (image: HistoryPanelImage) => void;
  onResize: (image: HistoryPanelImage) => void;
  onToggleFavorite: (image: HistoryPanelImage) => void | Promise<unknown>;
  onUpscale: (image: HistoryPanelImage) => void;
  qualityBadgeLabel: (image: HistoryPanelImage) => string;
  qualityTone: (image: HistoryPanelImage) => string;
}) {
  const [filter, setFilter] = useState<(typeof resultFilterTabs)[number]>("项目");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(resultPageSize);
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deletingKey, setDeletingKey] = useState("");
  const [favoritingKey, setFavoritingKey] = useState("");
  const normalizedQuery = query.trim();

  const orderedImages = useMemo(() => [...images].sort(compareHistoryImages), [images]);
  const filteredImages = useMemo(
    () => orderedImages.filter((image) => historyMatchesFilter(image, filter, projectId) && historyMatchesQuery(image, normalizedQuery)),
    [filter, historyMatchesFilter, historyMatchesQuery, normalizedQuery, orderedImages, projectId],
  );
  const filterCounts = useMemo(() => {
    const counts = Object.fromEntries(resultFilterTabs.map((item) => [item, 0])) as Record<(typeof resultFilterTabs)[number], number>;
    orderedImages.forEach((image) => {
      if (!historyMatchesQuery(image, normalizedQuery)) return;
      resultFilterTabs.forEach((item) => {
        if (historyMatchesFilter(image, item, projectId)) counts[item] += 1;
      });
    });
    return counts;
  }, [historyMatchesFilter, historyMatchesQuery, normalizedQuery, orderedImages, projectId]);
  const visibleImages = useMemo(() => filteredImages.slice(0, visibleCount), [filteredImages, visibleCount]);
  const hasMoreLocal = filteredImages.length > visibleImages.length;
  const hasMore = hasMoreLocal || hasMoreFromServer;

  if (!images.length) return emptyState || null;

  function runInlineAction(label: string, action: () => void) {
    setActionMessage(null);
    action();
    setActionMessage({ tone: "success", text: `${label}已提交。` });
  }

  async function deleteImage(image: HistoryPanelImage) {
    if (!onDelete || deletingKey) return;
    const key = historyImageKey(image);
    setDeletingKey(key);
    setActionMessage(null);
    try {
      await onDelete(image);
      setActionMessage({ tone: "success", text: "删除已提交。" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "删除失败。" });
    } finally {
      setDeletingKey("");
    }
  }

  async function toggleFavorite(image: HistoryPanelImage) {
    if (favoritingKey) return;
    const key = historyImageKey(image);
    const nextFavorite = !image.favorite;
    setFavoritingKey(key);
    setActionMessage(null);
    try {
      await onToggleFavorite(image);
      setActionMessage({ tone: "success", text: nextFavorite ? "已收藏。" : "已取消收藏。" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "收藏状态保存失败。" });
    } finally {
      setFavoritingKey("");
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="apple-panel sticky top-0 z-10 rounded-[18px] p-2">
        <div className="grid grid-cols-4 gap-1">
          {resultFilterTabs.map((item) => (
            <button
              className={`apple-segment flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] transition ${filter === item ? "apple-segment-active" : ""}`}
              key={item}
              onClick={() => {
                setFilter(item);
                setVisibleCount(resultPageSize);
              }}
              type="button"
            >
              <span>{item}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${filter === item ? "bg-black/10 text-[#07121f]/62" : "bg-white/10 text-white/42"}`}>
                {filterCounts[item]}
              </span>
            </button>
          ))}
        </div>
        {visibleCount > resultPageSize ? (
          <button className="apple-segment mt-2 w-full px-2 py-1.5 text-[10px]" onClick={() => setVisibleCount(resultPageSize)} type="button">
            收起到 16 张
          </button>
        ) : null}
        <label className="mt-2 flex h-8 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-2.5 text-[11px] text-white/58 focus-within:border-[#8fa7ff]/40 focus-within:bg-white/[0.075]">
          <Search className="size-3.5 shrink-0 text-white/38" />
          <input
            className="min-w-0 flex-1 bg-transparent text-white/72 outline-none placeholder:text-white/30"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(resultPageSize);
            }}
            placeholder="搜索模型、来源、质检、Prompt"
            value={query}
          />
          {query ? (
            <button
              aria-label="清空搜索"
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-white/42 transition hover:bg-white/10 hover:text-white/72"
              onClick={() => {
                setQuery("");
                setVisibleCount(resultPageSize);
              }}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>
      </div>

      {actionMessage ? (
        <div className={`rounded-[14px] border px-3 py-2 text-[10px] leading-4 ${
          actionMessage.tone === "success"
            ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
            : "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
        }`}>
          {actionMessage.text}
        </div>
      ) : null}

      {!filteredImages.length ? (
        <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.035] p-6 text-center text-[12px] text-white/44">
          <div>没有匹配的结果。</div>
          {filter !== "全部" || normalizedQuery ? (
            <button
              className="apple-button mt-3 px-3 py-1.5 text-[11px]"
              onClick={() => {
                setFilter("全部");
                setQuery("");
              }}
              type="button"
            >
              清空筛选
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
              className={`absolute right-2.5 top-2.5 z-10 flex size-6 items-center justify-center rounded-full border border-white/16 shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur-xl transition disabled:opacity-55 ${image.favorite ? "bg-[rgba(102,76,19,0.86)] text-[#ffe1a0]" : "bg-[rgba(18,23,32,0.58)] text-white/82 hover:bg-[rgba(28,34,46,0.82)]"}`}
              disabled={Boolean(favoritingKey)}
              onClick={(event) => {
                event.stopPropagation();
                void toggleFavorite(image);
              }}
              title={image.favorite ? "取消收藏" : "收藏"}
              type="button"
            >
              <Star className={`size-3 ${favoritingKey === historyImageKey(image) ? "animate-pulse" : ""} ${image.favorite ? "fill-current" : ""}`} />
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
              <div className="mt-1.5 grid grid-cols-4 gap-1">
                <button
                  aria-label="加入画布"
                  className="apple-button flex h-7 items-center justify-center text-white/62"
                  onClick={(event) => {
                    event.stopPropagation();
                    runInlineAction("加入画布", () => onAddToCanvas(image));
                  }}
                  title="加入画布"
                  type="button"
                >
                  <Plus className="size-3" />
                </button>
                <button
                  aria-label="改尺寸"
                  className="apple-button flex h-7 items-center justify-center text-white/62"
                  onClick={(event) => {
                    event.stopPropagation();
                    runInlineAction("改尺寸", () => onResize(image));
                  }}
                  title="改尺寸"
                  type="button"
                >
                  <Maximize2 className="size-3" />
                </button>
                <button
                  aria-label="画质增强"
                  className="apple-button flex h-7 items-center justify-center text-white/62"
                  onClick={(event) => {
                    event.stopPropagation();
                    runInlineAction("画质增强", () => onUpscale(image));
                  }}
                  title="画质增强"
                  type="button"
                >
                  <Sparkles className="size-3" />
                </button>
                {onDelete ? (
                  <button
                    aria-label="删除图片"
                    className="apple-button flex h-7 items-center justify-center text-[#ffb4a8] disabled:opacity-45"
                    disabled={Boolean(deletingKey)}
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteImage(image);
                    }}
                    title="删除图片"
                    type="button"
                  >
                    {deletingKey === historyImageKey(image) ? <X className="size-3 animate-pulse" /> : <Trash2 className="size-3" />}
                  </button>
                ) : null}
              </div>
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

function historyImageKey(image: Pick<HistoryPanelImage, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

function compareHistoryImages(a: HistoryPanelImage, b: HistoryPanelImage) {
  const generatedDiff = new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  if (generatedDiff) return generatedDiff;
  const nameA = a.fileName || a.id || a.url;
  const nameB = b.fileName || b.id || b.url;
  return nameB.localeCompare(nameA);
}
