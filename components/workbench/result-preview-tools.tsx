"use client";

import { useCallback, useRef, useState } from "react";
import { ImageFrame } from "./image-frame";

export type PngLayerExportLayer = {
  filename: string;
  name: string;
  zIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  x: number;
  y: number;
  opacity: number;
  blendMode: string;
  visible: boolean;
  note: string;
  kind: string;
  url: string;
  fileSizeBytes: number;
  hasAlpha: boolean;
  transparentPixelRatio: number;
};

export type PngLayerExportMode = "fast" | "ai_precise";

export type PngLayerExportResult = {
  mode: PngLayerExportMode;
  canvasWidth: number;
  canvasHeight: number;
  layerCount: number;
  layers: PngLayerExportLayer[];
  durationMs: number;
  warnings?: string[];
  message: string;
};

export type ImageComparisonAsset = {
  id: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  prompt?: string;
  variant?: number;
  ratio?: {
    width: number;
    height: number;
  };
  mode?: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  generatedAt?: string;
  outputSize?: {
    width: number;
    height: number;
  };
  fileName?: string;
  savedPath?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  sourceLabel?: string;
  tags?: string[];
  colorTags?: string[];
  nodeOperation?: string;
  width?: number;
  height?: number;
  source?: string;
};

export function ImageComparisonSlider({
  after,
  before,
  onSplitChange,
  split,
}: {
  after: ImageComparisonAsset;
  before: ImageComparisonAsset;
  onSplitChange: (value: number) => void;
  split: number;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const clampedSplit = Math.max(6, Math.min(94, split));
  const updateFromClientX = useCallback((clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    onSplitChange(Math.max(6, Math.min(94, Math.round(next))));
  }, [onSplitChange]);

  return (
    <div
      ref={frameRef}
      className="relative h-full w-full cursor-ew-resize select-none overflow-hidden bg-transparent"
      onPointerDown={(event) => {
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromClientX(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging) updateFromClientX(event.clientX);
      }}
      onPointerUp={(event) => {
        setDragging(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <ImageFrame alt={after.fileName || after.id} className="absolute inset-0 h-full w-full border-0 bg-transparent" fit="contain" image={after} loading="eager" preserveRatio={false} variant="original" style={{ height: "100%", width: "100%" }} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - clampedSplit}% 0 0)` }}>
        <ImageFrame alt={before.fileName || before.id} className="absolute inset-0 h-full w-full border-0 bg-transparent" fit="contain" image={before} loading="eager" preserveRatio={false} variant="original" style={{ height: "100%", width: "100%" }} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.38),0_0_18px_rgba(116,227,197,0.55)]" style={{ left: `${clampedSplit}%` }} />
      <div className="pointer-events-none absolute z-10 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/45 bg-black/45 text-[13px] font-semibold text-white shadow-[0_10px_32px_rgba(0,0,0,0.42)] backdrop-blur-xl" style={{ left: `${clampedSplit}%`, top: "50%", transform: "translate(-50%, -50%)" }}>
        ↔
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/14 bg-black/42 px-2.5 py-1 text-[10px] font-semibold text-white/82 backdrop-blur-xl">优化前</div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-[#74e3c5]/24 bg-[#071411]/62 px-2.5 py-1 text-[10px] font-semibold text-[#adf8e5] backdrop-blur-xl">优化后</div>
      <input
        aria-label="优化前后对比"
        className="absolute bottom-3 left-4 right-4 z-20 h-1 cursor-ew-resize appearance-none rounded-full bg-white/18 accent-[#74e3c5] opacity-65"
        max={94}
        min={6}
        onChange={(event) => onSplitChange(Number(event.target.value))}
        type="range"
        value={clampedSplit}
      />
    </div>
  );
}
