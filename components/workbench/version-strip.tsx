"use client";

import type { CSSProperties } from "react";
import { ImageFrame } from "@/components/workbench/image-frame";

type VersionStripItem = {
  id: string;
  image: {
    id?: string;
    fileName?: string;
    url: string;
    originalUrl?: string;
    thumbnailUrl?: string;
    previewUrl?: string;
  };
  ratioStyle: CSSProperties;
  selected?: boolean;
  subtitle: string;
  title: string;
};

export function VersionStrip({
  accentClassName,
  items,
  label,
  onSelect,
}: {
  accentClassName: string;
  items: VersionStripItem[];
  label: string;
  onSelect: (itemId: string) => void;
}) {
  return (
    <section className="min-w-0">
      <div className="apple-caption mb-2 font-semibold">{label}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            className={`min-w-[156px] overflow-hidden rounded-[18px] border text-left transition ${
              item.selected ? accentClassName : "border-white/10 bg-white/[0.04] hover:bg-white/[0.06]"
            }`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <ImageFrame alt={item.image.fileName || item.image.id || item.id} image={item.image} ratioStyle={item.ratioStyle} variant="thumbnail" />
            <div className="p-2.5">
              <div className="truncate text-[11px] font-semibold text-white/80">{item.title}</div>
              <div className="apple-caption mt-1 truncate">{item.subtitle}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
