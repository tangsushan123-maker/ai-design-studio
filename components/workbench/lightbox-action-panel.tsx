"use client";

import { ArrowDownToLine, Check, ChevronDown, FileImage, Images, ShieldCheck, Trash2, Wand2 } from "lucide-react";
import type { ImageAsset } from "@/components/workbench/workbench-types";
import { downloadImageFile } from "@/components/workbench/workbench-file-actions";

type LightboxActionPanelProps = {
  image: ImageAsset;
  actionBusy: boolean;
  activeActionLabel: string;
  confirmActionLabel: string;
  deliverySummary: string;
  qualityReviewSummary: string;
  sidebarTab: "actions" | "info";
  showMoreActions: boolean;
  onCopyImage: (image: ImageAsset) => Promise<void>;
  onCopyPrompt: (prompt: string) => Promise<void>;
  onDelete: () => void;
  onKeep: () => void;
  onRunAction: (label: string, action: () => void | Promise<void>) => Promise<void>;
  onRunConfirmedAction: (label: string, action: () => void | Promise<void>) => Promise<void>;
  onSidebarTabChange: (tab: "actions" | "info") => void;
  onToggleMoreActions: () => void;
};

export function LightboxActionPanel({
  image,
  actionBusy,
  activeActionLabel,
  confirmActionLabel,
  deliverySummary,
  qualityReviewSummary,
  sidebarTab,
  showMoreActions,
  onCopyImage,
  onCopyPrompt,
  onDelete,
  onKeep,
  onRunAction,
  onRunConfirmedAction,
  onSidebarTabChange,
  onToggleMoreActions,
}: LightboxActionPanelProps) {
  return (
    <section className="apple-surface-section p-3">
      <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-white/10 bg-white/[0.055] p-1">
        {[
          ["actions", "操作"],
          ["info", "详情"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`apple-segment px-2 py-1.5 text-[11px] ${sidebarTab === value ? "apple-segment-active" : ""}`}
            onClick={() => onSidebarTabChange(value as "actions" | "info")}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="apple-button-primary flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("保留此版", onKeep)} type="button">
          <Check className="size-3.5" />
          {activeActionLabel === "保留此版" ? "保留中..." : "保留此版"}
        </button>
        <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("下载 PNG", () => downloadImageFile(image, "png"))} type="button">
          <ArrowDownToLine className="size-3.5" />
          {activeActionLabel === "下载 PNG" ? "下载中..." : "下载 PNG"}
        </button>
        <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制图片", () => onCopyImage(image))} type="button">
          <Images className="size-3.5" />
          {activeActionLabel === "复制图片" ? "复制中..." : "复制图片"}
        </button>
        <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={onToggleMoreActions} type="button">
          <ChevronDown className={`size-3.5 transition ${showMoreActions ? "rotate-180" : ""}`} />
          {showMoreActions ? "收起更多" : "更多"}
        </button>
      </div>
      {showMoreActions ? (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-[16px] border border-white/10 bg-white/[0.05] p-2">
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("下载 JPG", () => downloadImageFile(image, "jpg"))} type="button">
            <ArrowDownToLine className="size-3.5" />
            {activeActionLabel === "下载 JPG" ? "下载中..." : "下载 JPG"}
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("下载 WebP", () => downloadImageFile(image, "webp"))} type="button">
            <ArrowDownToLine className="size-3.5" />
            {activeActionLabel === "下载 WebP" ? "下载中..." : "下载 WebP"}
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制交付摘要", () => onCopyPrompt(deliverySummary))} type="button">
            <FileImage className="size-3.5" />
            交付摘要
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制质检摘要", () => onCopyPrompt(qualityReviewSummary))} type="button">
            <ShieldCheck className="size-3.5" />
            质检摘要
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">
            <Wand2 className="size-3.5" />
            复制 Prompt
          </button>
          <button className="apple-button-danger flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunConfirmedAction("删除当前图", onDelete)} type="button">
            <Trash2 className="size-3.5" />
            {activeActionLabel === "删除当前图" ? "删除中..." : confirmActionLabel === "删除当前图" ? "确认删除" : "删除当前图"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
