"use client";

import { MoreHorizontal, Pencil, Star } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
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
  favorite?: boolean;
  qualityCheck?: {
    importantContentRisk?: boolean;
    importantContentLabel?: string;
    status?: string;
    label?: string;
  };
  sourceStrategyTitle?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
};

type GroupedHistory = {
  label: string;
  images: HistoryPanelImage[];
};

export function HistoryPanel({
  images,
  hasMoreFromServer = false,
  loadingMore = false,
  projectId,
  emptyState,
  formatFileSize,
  formatGeneratedAt,
  groupHistoryImages,
  historyMatchesFilter,
  historyMatchesQuery,
  imageRatioStyle,
  nodeOperationLabel,
  onAddToCanvas,
  onDrag,
  onLayerOutputNode,
  onLoadMore,
  onDelete,
  onPreview,
  onResize,
  onToggleFavorite,
  onUpscale,
  qualityBadgeLabel,
  qualityTone,
  canLayerOutput,
}: {
  images: HistoryPanelImage[];
  hasMoreFromServer?: boolean;
  loadingMore?: boolean;
  projectId: string;
  emptyState?: ReactNode;
  formatFileSize: (bytes?: number) => string;
  formatGeneratedAt: (value?: string) => string;
  groupHistoryImages: (images: HistoryPanelImage[], groupBy: string) => GroupedHistory[];
  historyMatchesFilter: (image: HistoryPanelImage, filter: string, projectId: string) => boolean;
  historyMatchesQuery: (image: HistoryPanelImage, query: string) => boolean;
  imageRatioStyle: (image: HistoryPanelImage) => CSSProperties;
  nodeOperationLabel: (value?: string) => string;
  onAddToCanvas: (image: HistoryPanelImage) => void;
  onDrag: (event: DragEvent<HTMLElement>, image: HistoryPanelImage) => void;
  onLayerOutputNode?: (image: HistoryPanelImage) => void;
  onLoadMore?: () => void;
  onDelete?: (image: HistoryPanelImage) => void;
  onPreview: (image: HistoryPanelImage) => void;
  onResize: (image: HistoryPanelImage) => void;
  onToggleFavorite: (image: HistoryPanelImage) => void;
  onUpscale: (image: HistoryPanelImage) => void;
  qualityBadgeLabel: (image: HistoryPanelImage) => string;
  qualityTone: (image: HistoryPanelImage) => string;
  canLayerOutput?: (image: HistoryPanelImage) => boolean;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [filter, setFilter] = useState("本项目");
  const [groupBy, setGroupBy] = useState("不分组");
  const [query, setQuery] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);

  const orderedImages = useMemo(() => [...images].sort(compareHistoryImages), [images]);
  const filteredImages = useMemo(
    () => orderedImages.filter((image) => historyMatchesFilter(image, filter, projectId) && historyMatchesQuery(image, query)),
    [filter, historyMatchesFilter, historyMatchesQuery, orderedImages, projectId, query],
  );
  const visibleImages = useMemo(() => filteredImages.slice(0, visibleCount), [filteredImages, visibleCount]);
  const groupedImages = useMemo(() => groupHistoryImages(visibleImages, groupBy), [groupBy, groupHistoryImages, visibleImages]);
  const hasMoreLocal = filteredImages.length > visibleImages.length;
  const hasMore = hasMoreLocal || hasMoreFromServer;

  useEffect(() => {
    if (!openMenuId) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-history-menu-root='true']")) return;
      setOpenMenuId(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openMenuId]);

  if (!images.length) return emptyState || null;

  return (
    <div className="space-y-2.5">
      <div className="apple-panel sticky top-0 z-10 rounded-[18px] p-2.5">
        <div className="apple-caption flex items-center justify-end gap-2 px-1 text-white/42">
          <div className="flex items-center gap-1.5">
            <button className="apple-segment px-2 py-1 text-[10px]" onClick={() => setToolsOpen((value) => !value)} type="button">
              {toolsOpen ? "收起筛选" : "筛选"}
            </button>
            {visibleCount > 8 ? (
              <button className="apple-segment px-2 py-1 text-[10px]" onClick={() => setVisibleCount(8)} type="button">
                收起
              </button>
            ) : null}
          </div>
        </div>
        {toolsOpen ? (
          <div className="mt-2 space-y-2">
            <input
              className="apple-input h-9 w-full rounded-full px-3.5 text-[12px] text-white/76 outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索图片或提示词"
              value={query}
            />
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {["全部", "今天", "最近7天", "本项目", "4K", "横版", "竖版", "方图", "成功", "失败", "已收藏"].map((item) => (
                <button
                  className={`apple-segment shrink-0 px-2.5 py-1.5 text-[11px] transition ${filter === item ? "apple-segment-active" : ""}`}
                  key={item}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="apple-caption flex items-center gap-1.5 overflow-x-auto">
              <span className="shrink-0">分组</span>
              {["不分组", "日期", "项目", "尺寸", "操作", "质检"].map((item) => (
                <button
                  className={`apple-segment shrink-0 px-2.5 py-1 text-[11px] ${groupBy === item ? "apple-segment-active" : ""}`}
                  key={item}
                  onClick={() => setGroupBy(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
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

      {groupedImages.map((group) => (
        <section className="space-y-2" key={group.label}>
          {groupBy !== "不分组" ? <div className="apple-caption px-1 font-semibold">{group.label} · {group.images.length}</div> : null}
          <div className="columns-1 gap-2.5 sm:columns-2 [column-fill:_balance]">
            {group.images.map((image) => (
              <article
                className={`apple-surface-section group relative z-0 mb-2.5 break-inside-avoid overflow-visible p-1.5 shadow-[0_14px_42px_rgba(0,0,0,0.16)] ${qualityTone(image)}`}
                draggable
                key={image.id}
                onDragStart={(event) => onDrag(event, image)}
              >
                <button aria-label={`预览${historyCardTitle(image)}`} className="relative block w-full overflow-hidden rounded-[18px] text-left" onClick={() => onPreview(image)} type="button">
                  <ImageFrame alt={historyCardTitle(image)} image={image} ratioStyle={imageRatioStyle(image)} variant="preview" />
                  {image.qualityCheck?.importantContentRisk ? (
                    <span className="absolute left-2 top-2 rounded-full border border-[#ffd166]/20 bg-[rgba(84,58,12,0.66)] px-2 py-1 text-[10px] text-[#ffe1a0] shadow-[0_8px_24px_rgba(0,0,0,0.26)] backdrop-blur-xl">
                      重要信息
                    </span>
                  ) : null}
                  {image.projectId === projectId ? <span className="apple-pill-accent absolute bottom-2 left-2 px-2 py-1 text-[10px] backdrop-blur-xl">当前项目</span> : null}
                </button>

                <button
                  aria-label={image.favorite ? "取消收藏" : "收藏"}
                  className={`absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full border border-white/18 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-xl transition ${image.favorite ? "bg-[rgba(102,76,19,0.86)] text-[#ffe1a0]" : "bg-[rgba(18,23,32,0.74)] text-white/92 hover:bg-[rgba(28,34,46,0.94)]"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(image);
                  }}
                  title={image.favorite ? "取消收藏" : "收藏"}
                  type="button"
                >
                  <Star className={`size-3.5 ${image.favorite ? "fill-current" : ""}`} />
                </button>

                <PanelIconButton
                  className="absolute right-12 top-3 z-10 border border-white/18 bg-[rgba(18,23,32,0.74)] text-[14px] leading-none text-white/92 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-xl hover:bg-[rgba(28,34,46,0.94)]"
                  dataHistoryMenuRoot
                  icon={<MoreHorizontal className="size-4" />}
                  label="图片操作"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId((current) => (current === image.id ? null : image.id));
                  }}
                />

                {openMenuId === image.id ? (
                  <div className="apple-menu absolute right-3 top-12 z-30 w-[152px] overflow-hidden p-1.5" data-history-menu-root="true">
                    {onLayerOutputNode && (canLayerOutput?.(image) ?? true) ? (
                      <MenuActionButton label="分层拆图" onClick={() => { setOpenMenuId(null); onLayerOutputNode(image); }} />
                    ) : null}
                    <MenuActionButton label="改尺寸" onClick={() => { setOpenMenuId(null); onResize(image); }} />
                    <MenuActionButton label="4K" onClick={() => { setOpenMenuId(null); onUpscale(image); }} />
                    <MenuActionButton label={image.favorite ? "取消收藏" : "收藏"} onClick={() => { setOpenMenuId(null); onToggleFavorite(image); }} />
                    {onDelete ? <MenuActionButton danger label="删除" onClick={() => { setOpenMenuId(null); onDelete(image); }} /> : null}
                  </div>
                ) : null}

                <div className="space-y-1.5 px-1.5 pb-1.5 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-white/78">{historyCardTitle(image)}</div>
                      <div className="apple-caption mt-0.5 truncate">{formatGeneratedAt(image.generatedAt)}</div>
                    </div>
                    <button className="apple-button-primary flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold" onClick={() => onAddToCanvas(image)} type="button">
                      <Pencil className="size-3" />
                      编辑
                    </button>
                  </div>
                  {toolsOpen ? (
                    <div className="apple-caption flex flex-wrap items-center gap-x-2 gap-y-1 text-white/42">
                      {[qualityBadgeLabel(image), image.targetSize, image.model, image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : "", nodeOperationLabel(image.nodeOperation || image.mode)]
                        .filter((item) => item && item !== "unknown")
                        .map((item) => <span key={`${image.id}-${item}`}>{item}</span>)}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {hasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={loadingMore}
          onClick={() => {
            if (hasMoreLocal) {
              setVisibleCount((count) => count + 8);
              return;
            }
            onLoadMore?.();
          }}
          type="button"
        >
          {loadingMore ? "加载中..." : "加载更多"}
        </button>
      ) : null}
    </div>
  );
}

function PanelIconButton({
  className = "",
  dataHistoryMenuRoot = false,
  icon,
  label,
  onClick,
}: {
  className?: string;
  dataHistoryMenuRoot?: boolean;
  icon: ReactNode;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`apple-button flex size-8 items-center justify-center text-white/56 transition ${className}`}
      data-history-menu-root={dataHistoryMenuRoot ? "true" : undefined}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

function historyCardTitle(image: HistoryPanelImage) {
  if (image.materialType === "无文字背景") return "无文字背景";
  if (image.materialType === "文字透明PNG") return "文字透明 PNG";
  if (image.materialType) return image.materialType;
  if (image.mode && image.mode !== "本地历史") return image.mode.replace(/^分层拆图\s*·\s*/u, "");
  return image.fileName?.split("/").pop() || "结果图片";
}

function compareHistoryImages(a: HistoryPanelImage, b: HistoryPanelImage) {
  const generatedDiff = new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  if (generatedDiff) return generatedDiff;
  const nameA = a.fileName || a.id || a.url;
  const nameB = b.fileName || b.id || b.url;
  return nameB.localeCompare(nameA);
}

function MenuActionButton({
  danger = false,
  label,
  onClick,
}: {
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-[12px] font-medium transition ${
        danger ? "text-[#ffb4a8] hover:bg-[#ff6b5f]/14" : "text-white/88 hover:bg-white/[0.1]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
