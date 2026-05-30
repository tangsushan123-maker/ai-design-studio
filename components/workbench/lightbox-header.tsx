"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";

type LightboxHeaderProps = {
  meta: string;
  canNavigate?: boolean;
  title: string;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

export function LightboxHeader({ meta, canNavigate = false, title, onClose, onNext, onPrevious }: LightboxHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <button className="apple-button rounded-full px-2.5 py-1 text-[11px]" onClick={onClose} type="button">返回结果</button>
        </div>
        <div className="truncate text-[14px] font-semibold text-white/88">{title}</div>
        {meta ? <div className="apple-meta mt-0.5">{meta}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        {canNavigate ? (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button aria-label="上一张" className="flex size-7 items-center justify-center rounded-full text-white/58 transition hover:bg-white/10 hover:text-white/88" onClick={onPrevious} title="上一张（←）" type="button">
              <ChevronLeft className="size-4" />
            </button>
            <button aria-label="下一张" className="flex size-7 items-center justify-center rounded-full text-white/58 transition hover:bg-white/10 hover:text-white/88" onClick={onNext} title="下一张（→）" type="button">
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
        <button aria-label="关闭预览" className="apple-button flex size-8 items-center justify-center text-white/62" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
