"use client";

import { ArrowDownToLine, Brush, ShieldCheck, Sparkles } from "lucide-react";
import { qualityBadgeLabel, qualityDeliveryTone } from "@/lib/workbench-delivery";
import { downloadImageFile } from "@/components/workbench/workbench-file-actions";
import type { ImageAsset } from "@/components/workbench/workbench-types";

export type LightboxEditTool = "optimize" | "mask" | "resize" | "upscale";

type LightboxDeliveryPanelProps = {
  image: ImageAsset;
  actionBusy: boolean;
  activeEditTool: LightboxEditTool | null;
  onEditToolChange: (tool: LightboxEditTool | null) => void;
  onRunAction: (label: string, action: () => void | Promise<void>) => Promise<void>;
  onShowQualityCheck: () => void;
};

const EDIT_TOOLS: Array<[LightboxEditTool, string]> = [
  ["optimize", "二次优化"],
  ["mask", "局部修改"],
  ["resize", "AI改版适配"],
  ["upscale", "画质增强"],
];

export function LightboxDeliveryPanel({
  image,
  actionBusy,
  activeEditTool,
  onEditToolChange,
  onRunAction,
  onShowQualityCheck,
}: LightboxDeliveryPanelProps) {
  const deliveryIssues = image.qualityCheck?.issues || [];
  const deliveryActions = image.qualityCheck?.actions || [];
  const isDeliveryReady = image.qualityCheck?.deliverability === "ready" || image.qualityCheck?.status === "passed";
  const primaryDeliverySuggestion = deliveryActions[0]
    || (isDeliveryReady ? "可下载交付，也可以继续做 PNG 分层或局部精修。" : "建议先做画质增强并放大检查文字、Logo、二维码。");

  return (
    <>
      <section className={`apple-surface-section border p-3 ${isDeliveryReady ? "border-[#74e3c5]/18 bg-[#74e3c5]/[0.06]" : "border-[#ffd166]/18 bg-[#ffd166]/[0.07]"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="apple-section-title">下一步建议</div>
            <div className="apple-caption mt-1 line-clamp-2">
              {primaryDeliverySuggestion}
            </div>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${qualityDeliveryTone(image.qualityCheck?.deliverability)}`}>
            {image.qualityCheck?.deliverabilityLabel || qualityBadgeLabel(image)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="apple-button-primary flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold disabled:opacity-55"
            disabled={actionBusy}
            onClick={() => onEditToolChange("upscale")}
            type="button"
          >
            <Sparkles className="size-3.5" />
            画质增强
          </button>
          <button
            className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55"
            disabled={actionBusy}
            onClick={() => onEditToolChange("mask")}
            type="button"
          >
            <Brush className="size-3.5" />
            局部修改
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("下载 PNG", () => downloadImageFile(image, "png"))} type="button">
            <ArrowDownToLine className="size-3.5" />
            下载成品
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px]" onClick={onShowQualityCheck} type="button">
            <ShieldCheck className="size-3.5" />
            看质检
          </button>
        </div>
        {deliveryIssues.length ? (
          <div className="mt-2 rounded-[12px] border border-white/10 bg-black/15 px-2.5 py-2 text-[11px] leading-5 text-white/54">
            {deliveryIssues.slice(0, 2).map((issue) => (
              <div className="line-clamp-1" key={issue}>{issue}</div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="apple-surface-section p-3">
        <div className="apple-section-title">编辑当前方案</div>
        <div className="apple-caption mt-1">按交付问题选择增强、局部改、AI改版适配或二次优化。</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {EDIT_TOOLS.map(([value, label]) => (
            <button
              className={`${activeEditTool === value ? "apple-button-primary font-semibold" : "apple-button"} px-3 py-2 text-[11px] disabled:opacity-55`}
              disabled={actionBusy}
              key={value}
              onClick={() => onEditToolChange(activeEditTool === value ? null : value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
