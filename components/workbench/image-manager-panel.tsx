"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { ArrowDownToLine, Images, Plus, RefreshCcw, Search, ShieldCheck, Star, Trash2, X } from "lucide-react";
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

type ImageManagerFilter = "全部" | "收藏" | "项目素材" | "节点引用" | "PNG三层" | "可清理" | "回收站";

const imageManagerFilters: ImageManagerFilter[] = ["全部", "收藏", "项目素材", "节点引用", "PNG三层", "可清理", "回收站"];

function ImageManagerPanelComponent<TImage extends ImageManagerImage, TNode extends ImageManagerNode<TImage>>({
  downloadRemoteFile,
  formatFileSize,
  formatGeneratedAt,
  historyHasMore,
  historyLoadingMore,
  imageDeletionProtection,
  imageSizeLabel,
  imageSourceSummary,
  images,
  mergeImages,
  nodeOperationLabel,
  nodes,
  onAddToCanvas,
  onBatchDelete,
  onBatchPermanentDelete,
  onBatchRestore,
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
  downloadRemoteFile: (url: string, fileName: string) => Promise<void>;
  formatFileSize: (bytes?: number) => string;
  formatGeneratedAt: (value?: string) => string;
  imageDeletionProtection: (image: TImage, nodes: TNode[], projectAssets: TImage[]) => ImageDeletionProtection;
  imageSizeLabel: (image: TImage) => string;
  imageSourceSummary: (image: TImage, labelForOperation?: (value?: string) => string) => string;
  mergeImages: (incoming: TImage[], current: TImage[]) => TImage[];
  nodeOperationLabel: (value?: string) => string;
  shouldShowCheckerboard: (image: TImage | null | undefined) => boolean;
  onAddToCanvas: (image: TImage) => void;
  onBatchDelete: (images: TImage[]) => void | Promise<unknown>;
  onBatchPermanentDelete: (images: TImage[]) => void | Promise<unknown>;
  onBatchRestore: (images: TImage[]) => void | Promise<unknown>;
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
  const [batchActionLabel, setBatchActionLabel] = useState("");
  const [downloadingKey, setDownloadingKey] = useState("");
  const [favoritingKey, setFavoritingKey] = useState("");
  const [rowActionKey, setRowActionKey] = useState("");
  const [confirmActionKey, setConfirmActionKey] = useState("");
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const normalizedQuery = query.trim();
  const managedImages = useMemo(() => {
    const trashedImages = trashImages.map((image) => ({ ...image, trashed: true })) as TImage[];
    const projectAssetImages = projectAssets.map((image) => ({ ...image, source: "asset" })) as TImage[];
    return mergeImages(trashedImages, mergeImages(images, projectAssetImages));
  }, [images, mergeImages, projectAssets, trashImages]);
  const managedRows = useMemo(
    () => managedImages.map((image) => ({ image, protection: imageDeletionProtection(image, nodes, projectAssets) })),
    [imageDeletionProtection, managedImages, nodes, projectAssets],
  );
  const stats = useMemo(() => imageManagerStats(managedRows), [managedRows]);
  const filteredRows = useMemo(
    () => managedRows.filter((row) => imageManagerMatchesFilter(row.protection, filter) && imageManagerMatchesSearch(row.image, row.protection, normalizedQuery, nodeOperationLabel)),
    [filter, managedRows, nodeOperationLabel, normalizedQuery],
  );
  const selectableRows = useMemo(
    () => filteredRows.filter((row) => imageManagerRowSelectable(row.protection)),
    [filteredRows],
  );
  const activeKeys = useMemo(() => new Set(managedRows.map((row) => imageManagerKey(row.image))), [managedRows]);
  const selectedRows = useMemo(
    () => managedRows.filter((row) => activeKeys.has(imageManagerKey(row.image)) && selectedKeys.has(imageManagerKey(row.image))),
    [activeKeys, managedRows, selectedKeys],
  );

  const selectedImages = selectedRows.map((row) => row.image);
  const selectedTrashCount = selectedRows.filter((row) => row.protection.isTrashed).length;
  const selectedCleanableCount = selectedRows.filter((row) => row.protection.canDelete && !row.protection.isTrashed).length;
  const allVisibleSelectableSelected = Boolean(selectableRows.length && selectableRows.every((row) => selectedKeys.has(imageManagerKey(row.image))));

  function toggleSelected(image: TImage) {
    const key = imageManagerKey(image);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectVisible() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      selectableRows.forEach((row) => next.add(imageManagerKey(row.image)));
      return next;
    });
  }

  function clearSelected() {
    setSelectedKeys(new Set());
  }

  function toggleVisibleSelection() {
    if (allVisibleSelectableSelected) {
      const visibleKeys = new Set(selectableRows.map((row) => imageManagerKey(row.image)));
      setSelectedKeys((current) => new Set(Array.from(current).filter((key) => !visibleKeys.has(key))));
      return;
    }
    selectVisible();
  }

  async function downloadImage(image: TImage) {
    const key = imageManagerKey(image);
    if (downloadingKey) return;
    setDownloadingKey(key);
    setActionMessage(null);
    try {
      await downloadRemoteFile(image.url, imageManagerDownloadName(image));
      setActionMessage({ tone: "success", text: `已开始下载 ${imageManagerDownloadName(image)}。` });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "下载失败。" });
    } finally {
      setDownloadingKey("");
    }
  }

  async function runBatchAction(label: string, action: () => void | Promise<unknown>) {
    if (batchActionLabel) return;
    setBatchActionLabel(label);
    setActionMessage(null);
    try {
      await action();
      clearSelected();
      setActionMessage({ tone: "success", text: `${label}已提交。` });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : `${label}失败。` });
    } finally {
      setBatchActionLabel("");
    }
  }

  async function runConfirmedBatchAction(label: string, action: () => void | Promise<unknown>) {
    const key = `${label}:${selectedKeysKey(selectedKeys)}`;
    if (confirmActionKey !== key) {
      setConfirmActionKey(key);
      setActionMessage({ tone: "success", text: `再点一次确认${label}。` });
      return;
    }
    setConfirmActionKey("");
    await runBatchAction(label, action);
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

  if (!managedImages.length) {
    if (historyLoadingMore || trashLoadingMore) {
      return (
        <div className="apple-surface-section flex items-center justify-center gap-2 p-6 text-[12px] text-white/54">
          <RefreshCcw className="size-3.5 animate-spin" />
          正在加载本地图片库...
        </div>
      );
    }
    return <EmptyPanel icon={<Images className="size-8" />} title="暂无图片" description="生成或上传图片后，这里会显示来源、保护状态和可清理项。" />;
  }

  return (
    <div className="space-y-3">
      <section className="apple-surface-section space-y-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-white/84">图片管理</div>
            <div className="apple-caption mt-1">
              先保护收藏、项目素材和节点引用；当前显示 {filteredRows.length}/{managedRows.length} 张。
            </div>
          </div>
          <ShieldCheck className="size-4 shrink-0 text-[#74e3c5]" />
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <ImageManagerStat label="图片" value={String(stats.totalCount)} />
          <ImageManagerStat label="占用" value={stats.totalBytes ? formatFileSize(stats.totalBytes) : "未记录"} />
          <ImageManagerStat label="保护" value={String(stats.protectedCount)} />
          <ImageManagerStat label="可清理" value={String(stats.cleanableCount)} tone={stats.cleanableCount ? "cleanable" : "muted"} />
          <ImageManagerStat label="回收站" value={String(stats.trashCount)} tone={stats.trashCount ? "cleanable" : "muted"} />
        </div>
      </section>

      <div className="apple-panel sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-[18px] p-1.5">
        {imageManagerFilters.map((item) => (
          <button
            className={`apple-segment px-2 py-1.5 text-[11px] transition ${filter === item ? "apple-segment-active" : ""}`}
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
        <label className="col-span-3 mt-1 flex h-8 items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.05] px-2.5 text-[11px] text-white/58 focus-within:border-[#8fa7ff]/40 focus-within:bg-white/[0.075]">
          <Search className="size-3.5 shrink-0 text-white/38" />
          <input
            className="min-w-0 flex-1 bg-transparent text-white/72 outline-none placeholder:text-white/30"
            onChange={(event) => {
              setQuery(event.target.value);
              clearSelected();
            }}
            placeholder="搜索文件、来源、保护状态"
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

      <div className="apple-surface-section flex flex-wrap items-center gap-1.5 p-2">
        <button
          className="apple-button h-8 px-2.5 text-[10px] text-white/66 disabled:opacity-40"
          disabled={!selectableRows.length}
          onClick={toggleVisibleSelection}
          type="button"
        >
          {allVisibleSelectableSelected ? "取消本页" : "选择本页"}
        </button>
        <button
          className="apple-button h-8 px-2.5 text-[10px] text-white/50 disabled:opacity-40"
          disabled={!selectedRows.length}
          onClick={clearSelected}
          type="button"
        >
          清空选择
        </button>
        <span className="apple-caption ml-auto text-[10px]">
          已选 {selectedRows.length} 张
        </span>
        {filter === "回收站" ? (
          <>
            <button
              className="apple-pill-accent h-8 px-2.5 text-[10px] disabled:opacity-40"
              disabled={!selectedTrashCount || Boolean(batchActionLabel)}
              onClick={() => void runBatchAction("批量恢复", () => onBatchRestore(selectedImages))}
              type="button"
            >
              {batchActionLabel === "批量恢复" ? "恢复中..." : "批量恢复"}
            </button>
            <button
              className="apple-button h-8 px-2.5 text-[10px] text-[#ffb4a8] disabled:opacity-40"
              disabled={!selectedTrashCount || Boolean(batchActionLabel)}
              onClick={() => void runConfirmedBatchAction("批量彻删", () => onBatchPermanentDelete(selectedImages))}
              type="button"
            >
              {batchActionLabel === "批量彻删" ? "删除中..." : confirmActionKey === `批量彻删:${selectedKeysKey(selectedKeys)}` ? "确认彻删" : "批量彻删"}
            </button>
          </>
        ) : (
          <button
            className="apple-button h-8 px-2.5 text-[10px] text-[#ffb4a8] disabled:opacity-40"
            disabled={!selectedCleanableCount || Boolean(batchActionLabel)}
            onClick={() => void runConfirmedBatchAction("批量移到回收站", () => onBatchDelete(selectedImages))}
            type="button"
          >
            {batchActionLabel === "批量移到回收站" ? "移动中..." : confirmActionKey === `批量移到回收站:${selectedKeysKey(selectedKeys)}` ? "确认移入回收站" : "批量移到回收站"}
          </button>
        )}
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

      <div className="space-y-2">
        {filteredRows.map(({ image, protection }) => (
          <article className="apple-surface-section overflow-hidden p-2.5" key={imageManagerKey(image)}>
            <div className="grid grid-cols-[22px_74px_minmax(0,1fr)] gap-2.5">
              <label className="flex pt-1" title={imageManagerRowSelectable(protection) ? "选择图片" : `受保护：${protection.reasons.join("、") || "不可批量操作"}`}>
                <input
                  checked={selectedKeys.has(imageManagerKey(image))}
                  className="size-4 accent-[#74e3c5] disabled:opacity-30"
                  disabled={!imageManagerRowSelectable(protection)}
                  onChange={() => toggleSelected(image)}
                  type="checkbox"
                />
              </label>
              <button className="block overflow-hidden rounded-[14px] text-left" onClick={() => onPreview(image)} type="button">
                <ImageFrame
                  alt={imageManagerTitle(image)}
                  className="rounded-[14px] border-white/8"
                  fit="contain"
                  image={image}
                  preserveRatio={false}
                  showCheckerboard={shouldShowCheckerboard(image)}
                  style={{ height: 74, width: 74 }}
                  variant="thumbnail"
                />
              </button>
              <div className="min-w-0">
                <button className="block w-full min-w-0 text-left" onClick={() => onPreview(image)} type="button">
                  <div className="truncate text-[11px] font-semibold text-white/76">{imageManagerTitle(image)}</div>
                  <div className="mt-1 truncate text-[9px] text-white/36">{imageSourceSummary(image, nodeOperationLabel)}</div>
                  <div className="mt-0.5 truncate text-[9px] text-white/32">
                    {[imageSizeLabel(image), image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : "", formatGeneratedAt(image.generatedAt)].filter(Boolean).join(" · ")}
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {imageManagerTags(protection).map((tag) => (
                    <span className={imageManagerTagClass(tag.tone)} key={tag.label}>{tag.label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-1">
              <button className="apple-button flex h-8 items-center justify-center text-[10px]" onClick={() => onPreview(image)} type="button">
                预览
              </button>
              {protection.isTrashed ? (
                <button
                  className="apple-button flex h-8 items-center justify-center gap-1 text-[10px] text-[#adf8e5] disabled:opacity-45"
                  disabled={Boolean(rowActionKey)}
                  onClick={() => void runRowAction("恢复图片", image, () => onRestore(image))}
                  type="button"
                >
                  {rowActionKey === `恢复图片:${imageManagerKey(image)}` ? <RefreshCcw className="size-3 animate-spin" /> : <RefreshCcw className="size-3" />}
                  {rowActionKey === `恢复图片:${imageManagerKey(image)}` ? "恢复中" : "恢复"}
                </button>
              ) : (
                <button className="apple-button flex h-8 items-center justify-center gap-1 text-[10px]" onClick={() => onAddToCanvas(image)} type="button">
                  <Plus className="size-3" />
                  画布
                </button>
              )}
              {protection.isTrashed ? (
                <span className="apple-button flex h-8 items-center justify-center text-[10px] text-white/28">已删除</span>
              ) : (
                <button
                  className={`apple-button flex h-8 items-center justify-center gap-1 text-[10px] disabled:opacity-45 ${image.favorite ? "text-[#ffe1a0]" : ""}`}
                  disabled={Boolean(favoritingKey)}
                  onClick={() => void toggleFavorite(image)}
                  type="button"
                >
                  <Star className={`size-3 ${favoritingKey === imageManagerKey(image) ? "animate-pulse" : ""} ${image.favorite ? "fill-current" : ""}`} />
                  {favoritingKey === imageManagerKey(image) ? (image.favorite ? "取消中" : "收藏中") : image.favorite ? "已藏" : "收藏"}
                </button>
              )}
              <button
                className="apple-button flex h-8 items-center justify-center gap-1 text-[10px] disabled:opacity-45"
                disabled={Boolean(downloadingKey)}
                onClick={() => void downloadImage(image)}
                type="button"
              >
                {downloadingKey === imageManagerKey(image) ? <RefreshCcw className="size-3 animate-spin" /> : <ArrowDownToLine className="size-3" />}
                {downloadingKey === imageManagerKey(image) ? "下载中" : "下载"}
              </button>
              <button
                className="apple-button flex h-8 items-center justify-center gap-1 text-[10px] text-[#ffb4a8] disabled:cursor-not-allowed disabled:text-white/28"
                disabled={Boolean(rowActionKey) || (!protection.canDelete && !protection.isTrashed)}
                onClick={() => void runConfirmedRowAction(protection.isTrashed ? "彻底删除图片" : "删除图片", image, () => protection.isTrashed ? onPermanentDelete(image) : onDelete(image))}
                title={protection.isTrashed ? "从回收站彻底删除" : protection.canDelete ? "移到回收站" : `受保护：${protection.reasons.join("、")}`}
                type="button"
              >
                {rowActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}` ? <RefreshCcw className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                {rowActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                  ? "处理中"
                  : confirmActionKey === `${protection.isTrashed ? "彻底删除图片" : "删除图片"}:${imageManagerKey(image)}`
                    ? "确认"
                    : protection.isTrashed ? "彻删" : "删除"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {filter !== "回收站" && historyHasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={historyLoadingMore}
          onClick={onLoadMore}
          type="button"
        >
          {historyLoadingMore ? "加载中..." : "加载更多历史图片"}
        </button>
      ) : null}
      {filter === "回收站" && trashHasMore ? (
        <button
          className="apple-button w-full rounded-[18px] px-3 py-3 text-[12px] text-white/70"
          disabled={trashLoadingMore}
          onClick={onLoadMoreTrash}
          type="button"
        >
          {trashLoadingMore ? "加载中..." : "加载更多回收站图片"}
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

function ImageManagerStat({ label, value, tone = "normal" }: { label: string; value: string; tone?: "normal" | "cleanable" | "muted" }) {
  const valueTone = tone === "cleanable" ? "text-[#ffe1a0]" : tone === "muted" ? "text-white/46" : "text-white/82";
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.035] px-2 py-2 text-center">
      <div className={`truncate text-[11px] font-semibold ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[9px] text-white/34">{label}</div>
    </div>
  );
}

function imageManagerKey(image: Pick<ImageManagerImage, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

function selectedKeysKey(keys: Set<string>) {
  return Array.from(keys).sort().join("|");
}

function imageManagerRowSelectable(protection: ImageDeletionProtection) {
  return protection.isTrashed || (protection.canDelete && !protection.protected);
}

function imageManagerStats<TImage extends ImageManagerImage>(rows: Array<{ image: TImage; protection: ImageDeletionProtection }>) {
  return rows.reduce(
    (stats, row) => {
      stats.totalCount += 1;
      stats.totalBytes += row.image.fileSizeBytes || 0;
      if (row.protection.protected) stats.protectedCount += 1;
      if (row.protection.canDelete && !row.protection.isTrashed) stats.cleanableCount += 1;
      if (row.protection.isProjectAsset) stats.projectAssetCount += 1;
      if (row.protection.usedByNodes) stats.nodeReferencedCount += 1;
      if (row.protection.isLayerPack) stats.layerPackCount += 1;
      if (row.protection.isTrashed) stats.trashCount += 1;
      return stats;
    },
    {
      totalCount: 0,
      totalBytes: 0,
      protectedCount: 0,
      cleanableCount: 0,
      projectAssetCount: 0,
      nodeReferencedCount: 0,
      layerPackCount: 0,
      trashCount: 0,
    },
  );
}

function imageManagerMatchesFilter(protection: ImageDeletionProtection, filter: ImageManagerFilter) {
  if (protection.isTrashed) return filter === "回收站";
  if (filter === "收藏") return protection.isFavorite;
  if (filter === "项目素材") return protection.isProjectAsset;
  if (filter === "节点引用") return protection.usedByNodes > 0;
  if (filter === "PNG三层") return protection.isLayerPack;
  if (filter === "可清理") return protection.canDelete && !protection.isTrashed;
  if (filter === "回收站") return false;
  return true;
}

function imageManagerTitle(image: ImageManagerImage) {
  if (image.materialType) return image.materialType;
  if (image.branchLabel) return image.branchLabel;
  if (image.nodeOperation === "png_layers" || image.pngLayerExport) return "PNG三层";
  if (image.mode && image.mode !== "本地历史") return image.mode;
  return image.fileName?.split("/").pop() || image.id || "图片";
}

function imageManagerTags(protection: ImageDeletionProtection) {
  const tags: Array<{ label: string; tone: "safe" | "info" | "warning" | "muted" }> = [];
  if (protection.isFavorite) tags.push({ label: "收藏", tone: "warning" });
  if (protection.isTrashed) tags.push({ label: "回收站", tone: "warning" });
  if (protection.isProjectAsset) tags.push({ label: "项目素材", tone: "safe" });
  if (protection.usedByNodes) tags.push({ label: `节点引用 ${protection.usedByNodes}`, tone: "info" });
  if (protection.isLayerPack) tags.push({ label: "PNG三层", tone: "info" });
  if (!tags.length) tags.push({ label: "可清理", tone: "muted" });
  return tags;
}

function imageManagerTagClass(tone: "safe" | "info" | "warning" | "muted") {
  if (tone === "safe") return "rounded-full border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-2 py-0.5 text-[9px] text-[#adf8e5]";
  if (tone === "warning") return "rounded-full border border-[#ffd166]/18 bg-[#ffd166]/10 px-2 py-0.5 text-[9px] text-[#ffe1a0]";
  if (tone === "info") return "rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[9px] text-white/54";
  return "rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[9px] text-white/38";
}

function imageManagerDownloadName(image: ImageManagerImage) {
  return image.fileName?.split("/").pop() || image.id || "image.png";
}
