"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { Copy, Images, RefreshCcw, RotateCcw, Search, Star, Trash2, X } from "lucide-react";
import { ImageFrame } from "@/components/workbench/image-frame";
import { imageManagerMatchesSearch } from "@/lib/workbench-image-manager";

export type ImageDeletionProtection = {
  protected: boolean;
  canDelete: boolean;
  reasons: string[];
  usedByNodes: number;
  usedByNodeNames: string[];
  isProjectAsset: boolean;
  isFavorite: boolean;
  isLayerPack: boolean;
  isTrashed: boolean;
};

export type ImageManagerImage = {
  id: string;
  url: string;
  prompt: string;
  variant: number;
  branchLabel?: string;
  fileName?: string;
  generatedAt?: string;
  materialType?: string;
  mode?: string;
  nodeOperation?: string;
  outputSize?: {
    width: number;
    height: number;
  };
  pngLayerExport?: unknown;
  ratio?: {
    width: number;
    height: number;
  };
  source?: string;
  sourceNodeKind?: string;
  sourceNodeName?: string;
  sourceRequestId?: string;
  sourceStrategyTitle?: string;
  sourceTaskId?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  originalUrl?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  favorite?: boolean;
  trashed?: boolean;
  qualityCheck?: {
    deliverability?: string;
    status?: string;
  };
  alphaCheck?: {
    hasTransparentPixels?: boolean;
  };
};

type ImageManagerNode<TImage extends ImageManagerImage> = {
  id: string;
  data: {
    title?: string;
    image?: TImage | null;
    output?: TImage | null;
    outputs?: TImage[];
  };
};

type ImageManagerFilter = "全部" | "收藏" | "回收站";

const imageManagerFilters: ImageManagerFilter[] = ["全部", "收藏", "回收站"];

function ImageManagerPanelComponent<TImage extends ImageManagerImage, TNode extends ImageManagerNode<TImage>>({
  historyHasMore,
  historyLoadingMore,
  imageDeletionProtection,
  images,
  mergeImages,
  nodeOperationLabel,
  nodes,
  onCopyImage,
  onDelete,
  onLoadMore,
  onLoadMoreTrash,
  onPermanentDelete,
  onPreview,
  onRestore,
  onToggleFavorite,
  projectAssets,
  shouldShowCheckerboard,
  trashHasMore,
  trashImages,
  trashLoadingMore,
}: {
  images: TImage[];
  historyHasMore: boolean;
  historyLoadingMore: boolean;
  nodes: TNode[];
  projectAssets: TImage[];
  trashHasMore: boolean;
  trashImages: TImage[];
  trashLoadingMore: boolean;
  imageDeletionProtection: (image: TImage, nodes: TNode[], projectAssets: TImage[]) => ImageDeletionProtection;
  mergeImages: (incoming: TImage[], current: TImage[]) => TImage[];
  nodeOperationLabel: (value?: string) => string;
  shouldShowCheckerboard: (image: TImage | null | undefined) => boolean;
  onCopyImage: (image: TImage) => void | Promise<unknown>;
  onDelete: (image: TImage) => void | Promise<unknown>;
  onLoadMore: () => void;
  onLoadMoreTrash: () => void;
  onPermanentDelete: (image: TImage) => void | Promise<unknown>;
  onPreview: (image: TImage) => void;
  onRestore: (image: TImage) => void | Promise<unknown>;
  onToggleFavorite: (image: TImage) => void | Promise<unknown>;
}) {
  const [filter, setFilter] = useState<ImageManagerFilter>("全部");
  const [query, setQuery] = useState("");
  const [copyingKey, setCopyingKey] = useState("");
  const [favoritingKey, setFavoritingKey] = useState("");
  const [rowActionKey, setRowActionKey] = useState("");
  const [confirmActionKey, setConfirmActionKey] = useState("");
  const [loadingMoreKey, setLoadingMoreKey] = useState("");
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const normalizedQuery = query.trim();
  const managedImages = useMemo(() => {
    const trashedImages = trashImages.map((image) => ({ ...image, trashed: true })) as TImage[];
    return mergeImages(trashedImages, images);
  }, [images, mergeImages, trashImages]);
  const managedRows = useMemo(
    () => managedImages.map((image) => ({ image, protection: imageDeletionProtection(image, nodes, projectAssets) })),
    [imageDeletionProtection, managedImages, nodes, projectAssets],
  );
  const filteredRows = useMemo(
    () => managedRows.filter((row) => imageManagerMatchesFilter(row.protection, filter) && imageManagerMatchesSearch(row.image, row.protection, normalizedQuery, nodeOperationLabel)),
    [filter, managedRows, nodeOperationLabel, normalizedQuery],
  );

  function clearSelected() {
    setConfirmActionKey("");
  }

  async function copyImage(image: TImage) {
    const key = imageManagerKey(image);
    if (copyingKey) return;
    setCopyingKey(key);
    setActionMessage(null);
    try {
      await onCopyImage(image);
      setActionMessage({ tone: "success", text: "图片已复制。" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "复制失败。" });
    } finally {
      setCopyingKey("");
    }
  }

  async function runRowAction(label: string, image: TImage, action: () => void | Promise<unknown>) {
    const key = `${label}:${imageManagerKey(image)}`;
    if (rowActionKey) return;
    setRowActionKey(key);
    setActionMessage(null);
    try {
      await action();
      setActionMessage({ tone: "success", text: `${label}已提交。` });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : `${label}失败。` });
    } finally {
      setRowActionKey("");
    }
  }

  async function runConfirmedRowAction(label: string, image: TImage, action: () => void | Promise<unknown>) {
    const key = `${label}:${imageManagerKey(image)}`;
    if (confirmActionKey !== key) {
      setConfirmActionKey(key);
      setActionMessage({ tone: "success", text: `再点一次确认${label}。` });
      return;
    }
    setConfirmActionKey("");
    await runRowAction(label, image, action);
  }

  async function toggleFavorite(image: TImage) {
    const key = imageManagerKey(image);
    if (favoritingKey) return;
    setFavoritingKey(key);
    setActionMessage(null);
    try {
      await onToggleFavorite(image);
      setActionMessage({ tone: "success", text: image.favorite ? "已取消收藏。" : "已收藏。" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "收藏状态保存失败。" });
    } finally {
      setFavoritingKey("");
    }
  }

  async function loadMoreImages(kind: "history" | "trash", action: () => void | Promise<unknown>) {
    if (loadingMoreKey) return;
    setLoadingMoreKey(kind);
    try {
      await action();
    } finally {
      window.setTimeout(() => setLoadingMoreKey(""), 250);
    }
  }

  if (!managedImages.length) {
    if (historyLoadingMore || trashLoadingMore) {
      return (
        <div className="apple-surface-section flex items-center justify-center gap-2 p-6 text-[12px] text-white/54">
          <RefreshCcw className="size-3.5 animate-spin" />
          正在加载本地图片库...
        </div>
      );
    }
    return <EmptyPanel icon={<Images className="size-8" />} title="暂无图片" description="生成或上传图片后，这里会显示项目图片。" />;
  }

  return (
    <div className="space-y-3">
      <div className="apple-panel sticky top-0 z-10 rounded-[18px] p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="text-[13px] font-semibold text-white/82">项目图片</div>
          <div className="apple-pill px-2 py-1 text-[11px]">{filteredRows.length}/{managedRows.length}</div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {imageManagerFilters.map((item) => (
            <button
              className={`apple-segment min-w-0 truncate px-1.5 py-1.5 text-[11px] transition ${filter === item ? "apple-segment-active" : ""}`}
              key={item}
              onClick={() => {
                setFilter(item);
                clearSelected();
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <label className="mt-1.5 flex h-8 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-2.5 text-[11px] text-white/58 focus-within:border-[#8fa7ff]/40 focus-within:bg-white/[0.075]">
          <Search className="size-3.5 shrink-0 text-white/38" />
          <input
            className="min-w-0 flex-1 bg-transparent text-white/72 outline-none placeholder:text-white/30"
            onChange={(event) => {
              setQuery(event.target.value);
              clearSelected();
            }}
            placeholder="搜索图片"
            value={query}
          />
          {query ? (
            <button
              aria-label="清空图片搜索"
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-white/42 transition hover:bg-white/10 hover:text-white/72"
              onClick={() => {
                setQuery("");
                clearSelected();
              }}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>
      </div>

      {actionMessage ? (
        <div className={`rounded-[14px] border px-3 py-2 text-[11px] leading-5 ${
          actionMessage.tone === "success"
            ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
            : "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
        }`}>
          {actionMessage.text}
        </div>
      ) : null}

      {!filteredRows.length ? (
        <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.035] p-6 text-center text-[12px] text-white/44">
          当前筛选没有图片。
          {filter !== "全部" || normalizedQuery ? (
            <button
              className="apple-button mt-3 px-3 py-1.5 text-[11px]"
              onClick={() => {
                setFilter("全部");
                setQuery("");
                clearSelected();
              }}
              type="button"
            >
              清空筛选
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {filteredRows.map(({ image, protection }) => (
          <article className="apple-surface-section min-w-0 overflow-hidden p-1.5" key={imageManagerKey(image)}>
            <button className="relative block w-full overflow-hidden rounded-[14px] text-left" onClick={() => onPreview(image)} type="button">
              <ImageFrame
                alt={imageManagerTitle(image)}
                className="rounded-[14px] border-white/8"
                fit="contain"
                image={image}
                preserveRatio={false}
                showCheckerboard={shouldShowCheckerboard(image)}
                style={{ height: 112 }}
                variant="thumbnail"
              />
            </button>

            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {protection.isTrashed ? (
                <button
                  aria-label={rowActionKey === `恢复图片:${imageManagerKey(image)}` ? "恢复中" : "恢复"}
                  className="apple-button col-span-2 flex h-8 min-w-0 items-center justify-center gap-1 text-[11px] text-[#adf8e5] disabled:opacity-45"
                  disabled={Boolean(rowActionKey)}
                  onClick={() => void runRowAction("恢复图片", image, () => onRestore(image))}
                  title={rowActionKey === `恢复图片:${imageManagerKey(image)}` ? "恢复中" : "恢复"}
                  type="button"
                >
                  {rowActionKey === `恢复图片:${imageManagerKey(image)}` ? <RefreshCcw className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                  <span className="truncate">{rowActionKey === `恢复图片:${imageManagerKey(image)}` ? "恢复中" : "恢复"}</span>
                </button>
              ) : (
                <button
                  aria-label={image.favorite ? "取消收藏" : "收藏"}
                  className={`apple-button flex h-8 min-w-0 items-center justify-center gap-1 px-1.5 text-[11px] disabled:opacity-45 ${image.favorite ? "text-[#ffe1a0]" : ""}`}
                  disabled={Boolean(favoritingKey)}
                  onClick={() => void toggleFavorite(image)}
                  title={favoritingKey === imageManagerKey(image) ? (image.favorite ? "取消中" : "收藏中") : image.favorite ? "已收藏" : "收藏"}
                  type="button"
                >
                  <Star className={`size-3.5 ${favoritingKey === imageManagerKey(image) ? "animate-pulse" : ""} ${image.favorite ? "fill-current" : ""}`} />
                  <span className="hidden truncate min-[420px]:inline">{image.favorite ? "已藏" : "收藏"}</span>
                </button>
              )}
              {!protection.isTrashed ? (
                <button
                  aria-label={copyingKey === imageManagerKey(image) ? "复制中" : "复制"}
                  className="apple-button flex h-8 min-w-0 items-center justify-center gap-1 px-1.5 text-[11px] disabled:opacity-45"
                  disabled={Boolean(copyingKey)}
                  onClick={() => void copyImage(image)}
                  title={copyingKey === imageManagerKey(image) ? "复制中" : "复制"}
                  type="button"
                >
                  {copyingKey === imageManagerKey(image) ? <RefreshCcw className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
                  <span className="hidden truncate min-[420px]:inline">复制</span>
                </button>
              ) : null}
              <button
                aria-label={
                  rowActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                    ? "处理中"
                    : confirmActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                      ? "确认删除"
                      : protection.isTrashed ? "彻底删除" : "删除"
                }
                className="apple-button flex h-8 min-w-0 items-center justify-center gap-1 px-1.5 text-[11px] text-[#ffb4a8] disabled:cursor-not-allowed disabled:text-white/28"
                disabled={Boolean(rowActionKey) || (!protection.canDelete && !protection.isTrashed)}
                onClick={() => void runConfirmedRowAction(protection.isTrashed ? "彻底删除图片" : "删除图片", image, () => protection.isTrashed ? onPermanentDelete(image) : onDelete(image))}
                title={
                  rowActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                    ? "处理中"
                    : confirmActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                      ? "再次点击确认删除"
                    : protection.isTrashed ? "从回收站彻底删除" : protection.canDelete ? "移到回收站" : "正在使用，暂不能删除"
                }
                type="button"
              >
                {rowActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}` ? <RefreshCcw className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                <span className="hidden truncate min-[420px]:inline">{confirmActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}` ? "确认" : "删除"}</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      {filter !== "回收站" && historyHasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={historyLoadingMore || Boolean(loadingMoreKey)}
          onClick={() => void loadMoreImages("history", onLoadMore)}
          type="button"
        >
          {historyLoadingMore || loadingMoreKey === "history" ? "加载中..." : "加载更多历史图片"}
        </button>
      ) : null}
      {filter === "回收站" && trashHasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={trashLoadingMore || Boolean(loadingMoreKey)}
          onClick={() => void loadMoreImages("trash", onLoadMoreTrash)}
          type="button"
        >
          {trashLoadingMore || loadingMoreKey === "trash" ? "加载中..." : "加载更多回收站图片"}
        </button>
      ) : null}
    </div>
  );
}

export const ImageManagerPanel = memo(ImageManagerPanelComponent) as typeof ImageManagerPanelComponent;

function EmptyPanel({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <div className="apple-surface-section flex min-h-[170px] flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 text-white/30">{icon}</div>
      <div className="text-[13px] font-semibold text-white/72">{title}</div>
      {description ? <p className="mt-1 max-w-[210px] text-[11px] leading-5 text-white/38">{description}</p> : null}
    </div>
  );
}

function imageManagerKey(image: Pick<ImageManagerImage, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

function imageManagerMatchesFilter(protection: ImageDeletionProtection, filter: ImageManagerFilter) {
  if (protection.isTrashed) return filter === "回收站";
  if (filter === "收藏") return protection.isFavorite;
  if (filter === "回收站") return false;
  return true;
}

function imageManagerTitle(image: ImageManagerImage) {
  return image.fileName?.split("/").pop() || image.id || "图片";
}
