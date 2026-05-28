"use client";

import { qualityBadgeLabel, qualityDeliveryTone } from "@/lib/workbench-delivery";
import { DetailLine } from "@/components/workbench/workbench-small-ui";
import type { ImageAsset } from "@/components/workbench/workbench-types";

type SourceDetailLine = {
  label: string;
  value: string;
};

type LightboxInfoPanelProps = {
  image: ImageAsset;
  actionBusy: boolean;
  actualSizeLabel: string;
  expectedSizeLabel: string;
  branchVersionCount: number;
  showPromptDetails: boolean;
  sourceDetailLines: SourceDetailLine[];
  onCopyImage: (image: ImageAsset) => Promise<void>;
  onCopyPrompt: (prompt: string) => Promise<void>;
  onPromptDetailsToggle: () => void;
  onRunAction: (label: string, action: () => void | Promise<void>) => Promise<void>;
};

export function LightboxInfoPanel({
  image,
  actionBusy,
  actualSizeLabel,
  expectedSizeLabel,
  branchVersionCount,
  showPromptDetails,
  sourceDetailLines,
  onCopyImage,
  onCopyPrompt,
  onPromptDetailsToggle,
  onRunAction,
}: LightboxInfoPanelProps) {
  return (
    <>
      <section className="apple-surface-section p-3">
        <div className="apple-section-title">详情</div>
        <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-white/52">
          {expectedSizeLabel && expectedSizeLabel !== actualSizeLabel ? <DetailLine label="目标" value={expectedSizeLabel} /> : null}
          <DetailLine label="模型" value={image.model || "unknown"} />
          <DetailLine label="质检" value={qualityBadgeLabel(image)} />
          {image.qualityCheck?.clarityCheckLabel ? <DetailLine label="清晰度" value={image.qualityCheck.clarityCheckLabel} /> : null}
          {image.qualityCheck?.deliverabilityLabel ? <DetailLine label="交付" value={image.qualityCheck.deliverabilityLabel} /> : null}
          {image.qualityEnhance?.workflow ? <DetailLine label="流程" value={image.qualityEnhance.workflow} /> : null}
          <DetailLine label="版本" value={`${branchVersionCount} 个版本`} />
          {image.sourceStrategyTitle ? <DetailLine label="来源" value={image.sourceStrategyTitle} /> : null}
          {sourceDetailLines.map((line) => (
            <DetailLine key={line.label} label={line.label} value={line.value} />
          ))}
        </div>
      </section>

      {image.qualityCheck?.fourKCheckItems?.length ? (
        <section className="apple-surface-section p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="apple-section-title">交付检查</div>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${qualityDeliveryTone(image.qualityCheck.deliverability)}`}>
              {image.qualityCheck.deliverabilityLabel || qualityBadgeLabel(image)}
            </span>
          </div>
          <div className="mt-2 grid gap-1.5">
            {image.qualityCheck.fourKCheckItems.slice(0, 8).map((item) => (
              <div className="flex items-start justify-between gap-2 rounded-[12px] border border-white/8 bg-white/[0.035] px-2.5 py-2 text-[11px] leading-5" key={item.label}>
                <div className="min-w-0">
                  <div className="font-semibold text-white/70">{item.label}</div>
                  {item.detail ? <div className="mt-0.5 line-clamp-2 text-white/38">{item.detail}</div> : null}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 ${item.passed ? "border-[#74e3c5]/18 bg-[#74e3c5]/12 text-[#adf8e5]" : "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]"}`}>
                  {item.passed ? "通过" : "复查"}
                </span>
              </div>
            ))}
          </div>
          {image.qualityCheck.textDetailLabel ? (
            <div className={`mt-2 rounded-[12px] border px-2.5 py-2 text-[11px] leading-5 ${image.qualityCheck.textDetailRisk ? "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]" : "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"}`}>
              {image.qualityCheck.textDetailLabel}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="apple-surface-section p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="apple-section-title">生成 Prompt</div>
          <button className="apple-button rounded-full px-2.5 py-1 text-[11px]" onClick={onPromptDetailsToggle} type="button">
            {showPromptDetails ? "收起" : "展开"}
          </button>
        </div>
        <div className={`mt-2 overflow-auto rounded-[14px] border border-white/10 bg-white/[0.055] p-2 text-[11px] leading-5 text-white/42 ${showPromptDetails ? "max-h-[240px]" : "max-h-[92px]"}`}>
          {image.prompt || "没有记录 Prompt。"}
        </div>
        <div className="mt-2 flex gap-2">
          <button className="apple-button flex-1 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">复制 Prompt</button>
          <button className="apple-button flex-1 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void onRunAction("复制图片", () => onCopyImage(image))} type="button">复制图片</button>
        </div>
      </section>

      {image.qualityCheck?.issues?.length ? (
        <div className="rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 p-3 text-[11px] leading-5 text-[#ffc1b8]">
          <div className="mb-1 font-semibold">质检提醒</div>
          {image.qualityCheck.issues.slice(0, 4).map((issue) => <div key={issue}>· {issue}</div>)}
        </div>
      ) : (
        <div className="rounded-[14px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 p-3 text-[11px] leading-5 text-[#adf8e5]">
          质检正常。
        </div>
      )}
      {image.maskProtectionCheck ? (
        <div className={`rounded-[14px] border p-3 text-[11px] leading-5 ${
          image.maskProtectionCheck.status === "failed"
            ? "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
            : image.maskProtectionCheck.status === "warning"
              ? "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]"
              : "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
        }`}
        >
          <div className="mb-1 font-semibold">局部修改质检</div>
          <div>{image.maskProtectionCheck.message || image.maskProtectionCheck.label || "mask 外已锁定。"}</div>
          {image.maskProtectionCheck.maskComponentCount ? (
            <div className="mt-1 opacity-80">
              已检查 {image.maskProtectionCheck.maskComponentCount} 个涂抹区域
              {image.maskProtectionCheck.unchangedComponentCount ? `，${image.maskProtectionCheck.unchangedComponentCount} 个疑似未生效` : ""}
            </div>
          ) : null}
          {image.maskProtectionCheck.issues?.length ? (
            <div className="mt-1">
              {image.maskProtectionCheck.issues.slice(0, 4).map((issue) => <div key={issue}>· {issue}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
