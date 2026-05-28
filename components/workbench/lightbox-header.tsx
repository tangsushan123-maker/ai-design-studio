"use client";

import { X } from "lucide-react";

type LightboxHeaderProps = {
  meta: string;
  title: string;
  onClose: () => void;
};

export function LightboxHeader({ meta, title, onClose }: LightboxHeaderProps) {
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
        <button aria-label="关闭预览" className="apple-button flex size-8 items-center justify-center text-white/62" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
