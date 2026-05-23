"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { ImageFrame } from "@/components/workbench/image-frame";

type ResultImage = {
  id?: string;
  fileName?: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
};

export function ResultVariantCard({
  badgeLabel,
  description,
  image,
  imageRatioStyle,
  meta,
  onDelete,
  onDownload,
  onFork,
  onLayerOutputNode,
  onOptimize,
  onPreview,
  onResize,
  title,
}: {
  badgeLabel: string;
  description: string;
  image: ResultImage;
  imageRatioStyle: CSSProperties;
  meta: string;
  onDelete?: () => void;
  onDownload?: () => void;
  onFork?: () => void;
  onLayerOutputNode?: () => void;
  onOptimize?: () => void;
  onPreview: () => void;
  onResize?: () => void;
  title: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  void badgeLabel;
  void description;
  void meta;
  const secondaryActions = [
    onResize ? { label: "改尺寸", onClick: onResize } : null,
    onDownload ? { label: "下载", onClick: onDownload } : null,
    onLayerOutputNode ? { label: "分层拆图", onClick: onLayerOutputNode } : null,
    onFork ? { label: "复制方案", onClick: onFork } : null,
    onDelete ? { label: "删除", onClick: onDelete, danger: true } : null,
  ].filter(Boolean) as Array<{ label: string; onClick: () => void; danger?: boolean }>;

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-result-menu-root='true']")) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  return (
    <article className="apple-surface-section relative mb-3 break-inside-avoid p-2.5 text-left shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition hover:bg-white/[0.06]">
      <button className="relative block w-full text-left" onClick={onPreview} type="button">
        <ImageFrame alt={image.fileName || image.id || "结果图"} className="rounded-[18px] border border-white/10" image={image} ratioStyle={imageRatioStyle} variant="preview" />
      </button>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white/84">{title}</div>
        </div>
        {onOptimize ? (
          <button className="apple-button-primary shrink-0 px-3 py-2 text-[11px] font-semibold" onClick={onOptimize} type="button">
            <Pencil className="mr-1 inline size-3.5" />
            编辑
          </button>
        ) : null}
      </div>
      {secondaryActions.length ? (
        <button className="apple-button mt-2 flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px]" data-result-menu-root="true" onClick={() => setMenuOpen((value) => !value)} title="更多操作" type="button">
          <MoreHorizontal className="size-3.5" />
          更多
        </button>
      ) : null}
      {menuOpen && secondaryActions.length ? (
        <div className="apple-menu absolute bottom-12 right-2 z-20 w-[138px] overflow-hidden p-1.5" data-result-menu-root="true">
          {secondaryActions.map((action) => (
            <button
              className={`block w-full rounded-xl px-3 py-2 text-left text-[11px] font-medium transition ${
                action.danger ? "text-[#ffb4a8] hover:bg-[#ff6b5f]/14" : "text-white/82 hover:bg-white/[0.1]"
              }`}
              key={action.label}
              onClick={() => {
                setMenuOpen(false);
                action.onClick();
              }}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
