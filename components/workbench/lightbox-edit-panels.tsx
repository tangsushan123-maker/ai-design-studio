"use client";

import type { AspectRatioValue } from "@/lib/design-options";
import { exportFormatParam, qualityEnhanceModeDescription, qualityEnhanceModeFromFitMode } from "@/components/workbench/workbench-operation-params";
import { inferSimpleMaskEditIntent, maskQuickActions } from "@/components/workbench/mask-editing";
import { AutoResizeTextarea, MiniInput } from "@/components/workbench/workbench-small-ui";
import { InlineChipRow, RatioPresetGrid } from "@/components/workbench/workbench-node-ui";
import { resizePresets } from "@/components/workbench/workbench-config";
import { parseTargetSize } from "@/components/workbench/workbench-utils";
import { isValidUpscaleTarget, qualityForQualityEnhanceTarget } from "@/components/workbench/workbench-upscale";
import type { HistoryMaskEditOptions, HistoryResizeOptions, HistoryUpscaleOptions, ImageAsset } from "@/components/workbench/workbench-types";
import type { LightboxEditTool } from "@/components/workbench/lightbox-delivery-panel";

type LightboxEditPanelsProps = {
  activeActionLabel: string;
  activeEditTool: LightboxEditTool | null;
  actionBusy: boolean;
  image: ImageAsset;
  optimizePrompt: string;
  maskPrompt: string;
  resizeRatio: AspectRatioValue;
  resizeSize: string;
  resizeFitMode: HistoryResizeOptions["fitMode"];
  qualityEnhanceTargets: string[];
  activeUpscaleSize: string;
  upscaleFitMode: HistoryUpscaleOptions["fitMode"];
  upscaleFormat: "png" | "jpg" | "webp";
  onEditImage: (prompt?: string) => void;
  onMaskEdit: (options: HistoryMaskEditOptions) => void;
  onOptimizePromptChange: (value: string) => void;
  onMaskPromptChange: (value: string) => void;
  onResize: (options: HistoryResizeOptions) => void;
  onResizeFitModeChange: (value: HistoryResizeOptions["fitMode"]) => void;
  onResizeRatioChange: (value: AspectRatioValue) => void;
  onResizeSizeChange: (value: string) => void;
  onRunAction: (label: string, action: () => void | Promise<void>) => Promise<void>;
  onUpscale: (options: HistoryUpscaleOptions) => void;
  onUpscaleFitModeChange: (value: HistoryUpscaleOptions["fitMode"]) => void;
  onUpscaleFormatChange: (value: "png" | "jpg" | "webp") => void;
  onUpscaleSizeChange: (value: string) => void;
};

export function LightboxEditPanels({
  activeActionLabel,
  activeEditTool,
  actionBusy,
  image,
  optimizePrompt,
  maskPrompt,
  resizeRatio,
  resizeSize,
  resizeFitMode,
  qualityEnhanceTargets,
  activeUpscaleSize,
  upscaleFitMode,
  upscaleFormat,
  onEditImage,
  onMaskEdit,
  onOptimizePromptChange,
  onMaskPromptChange,
  onResize,
  onResizeFitModeChange,
  onResizeRatioChange,
  onResizeSizeChange,
  onRunAction,
  onUpscale,
  onUpscaleFitModeChange,
  onUpscaleFormatChange,
  onUpscaleSizeChange,
}: LightboxEditPanelsProps) {
  if (!activeEditTool) return null;

  if (activeEditTool === "optimize") {
    return (
      <section className="apple-surface-section p-3">
        <div className="apple-section-title">二次优化设置</div>
        <div className="apple-caption mt-1">只写这次要改什么。</div>
        <AutoResizeTextarea
          className="apple-textarea mt-2 min-h-[84px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
          maxHeight={320}
          onChange={(event) => onOptimizePromptChange(event.target.value)}
          placeholder="例如：保持构图和人物不变，减弱过亮装饰，标题更清楚。"
          value={optimizePrompt}
        />
        <button
          className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
          disabled={!optimizePrompt.trim() || actionBusy}
          onClick={() => void onRunAction("创建二次优化节点", () => onEditImage(optimizePrompt.trim()))}
          type="button"
        >
          {activeActionLabel === "创建二次优化节点" ? "创建中..." : "创建二次优化节点"}
        </button>
      </section>
    );
  }

  if (activeEditTool === "mask") {
    return (
      <section className="apple-surface-section p-3">
        <div className="apple-section-title">局部 AI 修改</div>
        <div className="apple-caption mt-1">像生成式填充一样：涂抹区域，输入一句话，点击生成。</div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {maskQuickActions.map((action) => (
            <button
              className="apple-button truncate px-2 py-1.5 text-[11px] text-white/66"
              key={action.label}
              onClick={() => onMaskPromptChange(action.prompt)}
              title={action.prompt}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
        <AutoResizeTextarea
          className="apple-textarea mt-2 min-h-[84px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
          maxHeight={320}
          onChange={(event) => onMaskPromptChange(event.target.value)}
          placeholder="例如：去掉这里 / 换成蓝色科技背景 / 去掉文字并补全背景"
          value={maskPrompt}
        />
        <button
          className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
          disabled={!maskPrompt.trim() || actionBusy}
          onClick={() => void onRunAction("打开局部修改", () => {
            const prompt = maskPrompt.trim();
            onMaskEdit({
              prompt,
              quality: image.quality === "4k" ? "2k" : image.quality || "standard",
              ...inferSimpleMaskEditIntent(prompt),
            });
          })}
          type="button"
        >
          {activeActionLabel === "打开局部修改" ? "打开中..." : "进入涂抹"}
        </button>
      </section>
    );
  }

  if (activeEditTool === "resize") {
    return (
      <section className="apple-surface-section p-3">
        <div className="apple-section-title">AI改版适配</div>
        <div className="apple-caption mt-1">选择目标尺寸，模型会理解画面后重新适配版式。</div>
        <RatioPresetGrid
          className="mt-2"
          label="比例"
          value={resizeRatio}
          options={resizePresets.map((preset) => ({
            label: preset.label,
            ratio: preset.targetRatio,
            value: preset.targetRatio,
          }))}
          onChange={(nextRatio) => {
            const preset = resizePresets.find((item) => item.targetRatio === nextRatio);
            onResizeRatioChange(nextRatio as AspectRatioValue);
            if (preset) onResizeSizeChange(preset.targetSize);
          }}
        />
        <div className={`mt-2 ${resizeRatio === "custom" ? "grid grid-cols-2 gap-2" : ""}`}>
          {resizeRatio === "custom" ? <MiniInput label="自定义宽高" value={resizeSize} onChange={onResizeSizeChange} /> : null}
          <label className="block">
            <span className="apple-field-label mb-1 block">处理方式</span>
            <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={resizeFitMode} onChange={(event) => onResizeFitModeChange(event.target.value as HistoryResizeOptions["fitMode"])}>
              <option value="smart_relayout">智能重排</option>
              <option value="smart_outpaint">保守扩图</option>
            </select>
          </label>
        </div>
        <button
          className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
          disabled={!parseTargetSize(resizeSize).width || !parseTargetSize(resizeSize).height || actionBusy}
          onClick={() => void onRunAction("创建适配任务", () => onResize({ targetRatio: resizeRatio, targetSize: resizeSize, fitMode: resizeFitMode, quality: "standard" }))}
          type="button"
        >
          {activeActionLabel === "创建适配任务" ? "创建中..." : "按此尺寸智能适配"}
        </button>
      </section>
    );
  }

  return (
    <section className="apple-surface-section p-3">
      <div className="apple-section-title">AI 画质增强</div>
      <div className="apple-caption mt-1">文字修复保文字，图文增强兼顾文字和画面，质感重绘适合无字主视觉。</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {qualityEnhanceTargets.map((value) => (
          <button className={`${activeUpscaleSize === value ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[11px]`} key={value} onClick={() => onUpscaleSizeChange(value)} type="button">
            {value}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniInput label="输出目标" value={activeUpscaleSize} onChange={onUpscaleSizeChange} />
        <label className="block">
          <span className="apple-field-label mb-1 block">处理方式</span>
          <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={upscaleFitMode} onChange={(event) => onUpscaleFitModeChange(event.target.value as HistoryUpscaleOptions["fitMode"])}>
            <option value="standard_enhance">文字修复</option>
            <option value="plus_enhance">图文增强</option>
            <option value="creative_redraw">质感重绘</option>
          </select>
        </label>
      </div>
      <div className="mt-2">
        <InlineChipRow label="导出格式" value={upscaleFormat} options={["png", "jpg", "webp"]} onChange={(value) => onUpscaleFormatChange(exportFormatParam(value))} />
      </div>
      <div className="mt-2 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[11px] leading-5 text-[#ffe1a3]">
        {qualityEnhanceModeDescription(qualityEnhanceModeFromFitMode(upscaleFitMode, {}))}
      </div>
      <button
        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
        disabled={!isValidUpscaleTarget(activeUpscaleSize) || actionBusy}
        onClick={() => void onRunAction("创建 AI 画质增强任务", () => onUpscale({ targetSize: activeUpscaleSize, fitMode: upscaleFitMode, quality: qualityForQualityEnhanceTarget(activeUpscaleSize), format: upscaleFormat }))}
        type="button"
      >
        {activeActionLabel === "创建 AI 画质增强任务" ? "创建中..." : "创建 AI 画质增强任务"}
      </button>
    </section>
  );
}
