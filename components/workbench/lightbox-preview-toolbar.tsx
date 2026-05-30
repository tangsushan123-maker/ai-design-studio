"use client";

import { Minus, Plus } from "lucide-react";
import type { MouseEvent } from "react";

type LightboxPreviewToolbarProps = {
  previewZoom: number;
  onPreviewZoomChange: (value: number) => void;
};

const PREVIEW_ZOOM_PRESETS = [1.5, 2] as const;

function clampPreviewZoom(nextZoom: number) {
  return Math.max(0.5, Math.min(3, Number(nextZoom.toFixed(2))));
}

export function LightboxPreviewToolbar({
  previewZoom,
  onPreviewZoomChange,
}: LightboxPreviewToolbarProps) {
  const previewZoomLabel = previewZoom ? `${Math.round(previewZoom * 100)}%` : "适应";

  function changePreviewZoom(nextZoom: number) {
    onPreviewZoomChange(clampPreviewZoom(nextZoom));
  }

  function handleZoomClick(event: MouseEvent<HTMLButtonElement>, nextZoom: number) {
    event.preventDefault();
    event.stopPropagation();
    changePreviewZoom(nextZoom);
  }

  function handlePresetClick(event: MouseEvent<HTMLButtonElement>, nextZoom: number) {
    event.preventDefault();
    event.stopPropagation();
    onPreviewZoomChange(nextZoom);
  }

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-white/10 bg-white/[0.04] px-2.5 py-2">
      <div className="text-[11px] font-semibold text-white/70">查看：{previewZoomLabel}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${previewZoom === 0 ? "border-white/35 bg-white text-black" : "text-white/70"}`}
          onClick={(event) => handlePresetClick(event, 0)}
          type="button"
        >
          适应
        </button>
        <button
          className="apple-button rounded-full px-2.5 py-1 text-[11px] text-white/70"
          onClick={(event) => handlePresetClick(event, 1)}
          type="button"
        >
          原尺寸
        </button>
        {PREVIEW_ZOOM_PRESETS.map((value) => (
          <button
            className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${previewZoom === value ? "border-white/35 bg-white text-black" : "text-white/70"}`}
            key={value}
            onClick={(event) => handlePresetClick(event, value)}
            type="button"
          >
            {Math.round(value * 100)}%
          </button>
        ))}
        <button
          aria-label="缩小图片"
          className="apple-button flex size-7 items-center justify-center rounded-full text-white/70"
          disabled={(previewZoom || 1) <= 0.5}
          onClick={(event) => handleZoomClick(event, (previewZoom || 1) - 0.25)}
          type="button"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          aria-label="放大图片"
          className="apple-button flex size-7 items-center justify-center rounded-full text-white/70"
          disabled={(previewZoom || 1) >= 3}
          onClick={(event) => handleZoomClick(event, (previewZoom || 1) + 0.25)}
          type="button"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
