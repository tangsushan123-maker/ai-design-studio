import { type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { formatFileSize } from "@/lib/workbench-format";
import { ImageFrame } from "@/components/workbench/image-frame";
import { compactImageMeta, imageNodeTitle } from "@/components/workbench/workbench-labels";
import { imageRatio } from "@/components/workbench/workbench-image-metrics";
import {
  designOptimizationStrengthLabel,
  designOptimizationStrengthParam,
  pngLayerExportModeLabel,
  pngLayerExportModeParam,
  qualityEnhanceModeLabel,
  qualityEnhanceModeParam,
  referenceRemakeModeLabel,
  referenceRemakeModeParam,
  resizeFitModeLabel,
} from "@/components/workbench/workbench-operation-params";
import { SummaryLine } from "@/components/workbench/workbench-small-ui";
import { resizePresets } from "@/components/workbench/workbench-config";
import {
  defaultTextReferenceConfig,
  normalizeTextReferenceConfigs,
  textReferenceRoleDescription,
} from "@/components/workbench/workbench-text-references";
import { defaultTargetSizeForRatio } from "@/components/workbench/workbench-node-prompts";
import { numericParam, qualityParam, ratioOptionLabel, ratioParam, stringParam } from "@/components/workbench/workbench-utils";
import { upscaleTargetDisplayLabel } from "@/components/workbench/workbench-upscale";
import type { FlowNode, ImageAsset, NodeRenderLevel, WorkflowNodeData } from "@/components/workbench/workbench-types";

export function resolveNodeRenderLevel(input: { isLargeWorkflow: boolean; isLowZoom: boolean; selected: boolean }): NodeRenderLevel {
  if (input.isLowZoom) return input.selected ? "compact" : "mini";
  if (input.isLargeWorkflow && !input.selected) return "compact";
  return "full";
}

export function NodeSummary({ data }: { data: WorkflowNodeData }) {
  const params = data.params;
  if (data.kind === "text_to_image") {
    const references = textReferenceNodeItems(data);
    const prompt = stringParam(params.prompt) || "未填写";
    return <SummaryLine label={references.length ? `参考 ${references.length}` : "文生图"} value={references.length ? `已引用图片 · ${prompt}` : prompt} />;
  }
  if (data.kind === "fuse_images") return <SummaryLine label="AI合成" value={stringParam(params.fusionMode) || "主体入景"} />;
  if (data.kind === "outpaint") return <SummaryLine label="AI扩图" value={`${stringParam(params.direction) || "四周"} · ${stringParam(params.targetRatio) || "16:9"}`} />;
  if (data.kind === "mask_edit") return <SummaryLine label="局部 AI 修改" value={stringParam(params.prompt) || "涂抹区域 + 一句话指令"} />;
  if (data.kind === "resize") return <SummaryLine label="AI改版适配" value={`${stringParam(params.targetSize) || defaultTargetSizeForRatio(ratioParam(params.targetRatio))} · ${resizeFitModeLabel(stringParam(params.fitMode))}`} />;
  if (data.kind === "hd_redraw") return <SummaryLine label="画质增强" value={`${qualityEnhanceModeLabel(qualityEnhanceModeParam(params.enhancementMode))} · ${upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}`} />;
  if (data.kind === "upscale_4k") return <SummaryLine label="画质增强" value={`${resizeFitModeLabel(stringParam(params.fitMode))} · ${upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}`} />;
  if (data.kind === "reference_remake") return <SummaryLine label="参考图重制" value={`${referenceRemakeModeLabel(referenceRemakeModeParam(params.mode))} · ${qualityParam(params.quality).toUpperCase()}`} />;
  if (data.kind === "design_optimize") return <SummaryLine label="设计优化" value={`${designOptimizationStrengthLabel(designOptimizationStrengthParam(params.strength))} · ${qualityParam(params.quality).toUpperCase()}`} />;
  if (data.kind === "png_layers") return <SummaryLine label="PNG分层" value={pngLayerExportModeLabel(pngLayerExportModeParam(params.mode))} />;
  if (data.kind === "output") return <SummaryLine label="格式" value={(stringParam(params.format) || "png").toUpperCase()} />;
  return <SummaryLine label="要求" value={stringParam(params.prompt) || "在右侧填写参数"} />;
}

export function operationNodeSubtitle(data: WorkflowNodeData, fallback?: string, referenceCount = 0) {
  if (data.kind === "text_to_image" && referenceCount) {
    return `已引用 ${referenceCount} 张图片参考，生成时会一起发送给模型。`;
  }
  if (data.kind === "text_to_image") return "文字生成，可连接图片参考。";
  return data.subtitle || fallback || "";
}

export function CompactOutputSummary({ images }: { images: ImageAsset[] }) {
  const firstImage = images[0];
  if (firstImage?.pngLayerExport) {
    const layerBytes = firstImage.pngLayerExport.layers.reduce((sum, layer) => sum + (layer.fileSizeBytes || 0), 0);
    return (
      <div className="flex min-w-0 items-baseline gap-1.5 px-0.5 py-0.5">
        <div className="shrink-0 truncate text-[11px] font-semibold text-white/86">PNG三层</div>
        <div className="apple-caption min-w-0 truncate text-[11px]">
          {firstImage.pngLayerExport.layerCount} 层 · {formatFileSize(layerBytes)}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 px-0.5 py-0.5">
      <div className="shrink-0 truncate text-[11px] font-semibold text-white/86">
        {images.length > 1 ? `${images.length} 个方案` : imageNodeTitle(firstImage, "方案一")}
      </div>
      {firstImage ? <div className="apple-caption min-w-0 truncate text-[11px]">{compactImageMeta(firstImage)}</div> : null}
    </div>
  );
}

export function operationNodeWidth(data: WorkflowNodeData, outputs: ImageAsset[]) {
  if (data.kind === "output") return 206;
  if (outputs.length > 1) return 224;
  if (outputs.length === 1 && outputs[0]) {
    const ratio = imageRatio(outputs[0]);
    if (ratio < 0.78) return 208;
    if (ratio > 1.65) return 224;
    return 216;
  }
  if (data.kind === "resize" || data.kind === "upscale_4k" || data.kind === "hd_redraw") return 218;
  if (data.kind === "png_layers") return 222;
  if (data.kind === "text_to_image" || data.kind === "image_to_image") return 216;
  return 216;
}

export function textReferenceNodeItems(data: WorkflowNodeData) {
  const refs = data.textReferencePreviews;
  if (!Array.isArray(refs)) return [];
  return refs.filter((item): item is { handle: string; label: string; role: TextReferenceRole; weight: TextReferenceWeight; image: ImageAsset } => Boolean(item && typeof item === "object" && (item as { image?: ImageAsset }).image));
}

function isVisibleTextReferenceRole(role: TextReferenceRole) {
  return role === "direct_use" ||
    role === "person" ||
    role === "product" ||
    role === "subject" ||
    role === "background" ||
    role === "logo" ||
    role === "ip" ||
    role === "decoration";
}

function updateTextReferenceMode(data: WorkflowNodeData, nodeId: string, index: number, role: TextReferenceRole) {
  const refs = textReferenceNodeItems(data);
  const current = normalizeTextReferenceConfigs(data.params.referenceConfigs);
  const next = refs.map((item, itemIndex) => {
    const existing = current[itemIndex] || current.find((config) => config.handle === item.handle) || defaultTextReferenceConfig(item.handle, itemIndex, item.image);
    return {
      handle: item.handle,
      role: itemIndex === index ? role : existing.role,
      weight: existing.weight,
    };
  });
  data.onParamChange?.(nodeId, "referenceConfigs", next);
}

export function TextReferenceQuickControls({
  data,
  nodeId,
  references,
}: {
  data: WorkflowNodeData;
  nodeId: string;
  references: ReturnType<typeof textReferenceNodeItems>;
}) {
  if (!references.length) {
    return (
      <div className="mt-1.5 rounded-[13px] border border-white/10 bg-white/[0.035] p-1.5">
        <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px]">
          <span className="font-medium text-white/58">图片用途</span>
          <span className="text-white/32">最近图片</span>
        </div>
        <div className="nodrag grid grid-cols-2 gap-1">
          <button
            className="h-8 rounded-[11px] border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-white/66 transition hover:bg-white/[0.1]"
            onClick={() => data.onUseCanvasImageAsTextReference?.(nodeId, "direct_use")}
            type="button"
          >
            引用
          </button>
          <button
            className="h-8 rounded-[11px] border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-white/66 transition hover:bg-white/[0.1]"
            onClick={() => data.onUseCanvasImageAsTextReference?.(nodeId, "style")}
            type="button"
          >
            参考
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1.5 space-y-1.5 rounded-[13px] border border-white/10 bg-white/[0.035] p-1.5">
      <div className="flex items-center justify-between px-0.5 text-[11px]">
        <span className="font-medium text-white/58">图片用途</span>
        <span className="text-white/36">{references.length}/5</span>
      </div>
      {references.slice(0, 3).map((item, index) => {
        const visible = isVisibleTextReferenceRole(item.role);
        return (
          <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-1.5" key={`${item.handle}-${index}`}>
            <ImageFrame alt={item.label} className="rounded-[8px]" fit="cover" image={item.image} preserveRatio={false} variant="thumbnail" style={{ height: 28, width: 28 }} />
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium text-white/68">图 {index + 1}</div>
              <div className="truncate text-[11px] text-white/34">{textReferenceRoleDescription(item.role)}</div>
            </div>
            <div className="nodrag grid grid-cols-2 overflow-hidden rounded-[10px] border border-white/10 bg-black/18 text-[11px]">
              <button
                className={`h-7 px-2 transition ${visible ? "bg-white text-[#08111d]" : "text-white/48 hover:bg-white/[0.08]"}`}
                onClick={() => updateTextReferenceMode(data, nodeId, index, "direct_use")}
                type="button"
              >
                引用
              </button>
              <button
                className={`h-7 px-2 transition ${!visible ? "bg-white text-[#08111d]" : "text-white/48 hover:bg-white/[0.08]"}`}
                onClick={() => updateTextReferenceMode(data, nodeId, index, "style")}
                type="button"
              >
                参考
              </button>
            </div>
          </div>
        );
      })}
      {references.length > 3 ? <div className="px-0.5 text-[11px] text-white/34">还有 {references.length - 3} 张在右侧参数里设置</div> : null}
    </div>
  );
}

export function maskEditorInitialMaskUrl(node: FlowNode) {
  const maskDataUrl = stringParam(node.data.params.maskDataUrl);
  if (maskDataUrl) return maskDataUrl;
  if (node.data.params.maskValidated === true && numericParam(node.data.params.maskPixelCount) > 0) {
    return stringParam(node.data.params.maskImageUrl);
  }
  return "";
}

export function isLegacyUnvalidatedMask(node: FlowNode) {
  if (node.data.kind !== "mask_edit") return false;
  return Boolean(
    stringParam(node.data.params.maskImageUrl) &&
      !stringParam(node.data.params.maskDataUrl) &&
      node.data.params.maskValidated !== true,
  );
}

export function maskEditBadge(data: WorkflowNodeData) {
  const hasMask = Boolean(stringParam(paramsValue(data, "maskDataUrl")) || stringParam(paramsValue(data, "maskImageUrl")));
  if (!hasMask) return null;
  const pixelCount = numericParam(paramsValue(data, "maskPixelCount"));
  const coverage = numericParam(paramsValue(data, "maskCoverage"));
  const validated = paramsValue(data, "maskValidated") === true && pixelCount > 0;
  if (!validated) return { valid: false, label: "需重新确认涂抹" };
  const percent = coverage > 0 ? ` ${formatMaskCoveragePercent(coverage)}` : "";
  return { valid: true, label: `已涂抹${percent}` };
}

function paramsValue(data: WorkflowNodeData, key: string) {
  return data.params?.[key];
}

function formatMaskCoveragePercent(coverage: number) {
  const percent = Math.max(0, coverage * 100);
  return `${percent.toFixed(percent < 1 ? 2 : 1)}%`;
}

export function InlineChipRow({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] text-white/38">{label}</span>
      {options.map((option) => (
        <button
          className={`rounded-full px-2 py-1 text-[11px] transition ${
            value === option ? "bg-white text-black" : "border border-white/10 bg-white/[0.045] text-white/52 hover:bg-white/[0.08]"
          }`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {ratioOptionLabel(option)}
        </button>
      ))}
    </div>
  );
}

type RatioPresetGridOption = string | {
  label?: string;
  ratio?: string;
  value: string;
};

export function RatioPresetGrid({
  className = "",
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onChange: (value: string) => void;
  options: RatioPresetGridOption[];
  value: string;
}) {
  return (
    <div className={className}>
      <span className="mb-2 block text-[11px] text-white/38">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => {
          const normalized = normalizeRatioGridOption(option);
          const selected = value === normalized.value;
          const displayLabel = ratioOptionLabel(normalized.label || normalized.value);
          return (
            <button
              className={`flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-[18px] border px-1.5 text-[17px] font-semibold transition ${
                selected
                  ? "border-white/75 bg-white text-[#07121f] shadow-[0_16px_38px_rgba(255,255,255,0.18)]"
                  : "border-white/10 bg-white/[0.055] text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/18 hover:bg-white/[0.09] hover:text-white/74"
              }`}
              key={normalized.value}
              onClick={() => onChange(normalized.value)}
              type="button"
            >
              <RatioGlyph ratio={normalized.ratio || normalized.value} selected={selected} />
              <span className={`whitespace-nowrap ${displayLabel === "9.75:1" ? "text-[12px]" : displayLabel.length >= 3 ? "text-[14px]" : ""}`}>{displayLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function normalizeRatioGridOption(option: RatioPresetGridOption) {
  if (typeof option === "string") return { value: option, label: option, ratio: option };
  return {
    value: option.value,
    label: option.label || option.value,
    ratio: option.ratio || option.value,
  };
}

export function SizePresetSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <RatioPresetGrid
      label={label}
      value={value}
      options={resizePresets.map((preset) => ({
        label: preset.label,
        ratio: preset.targetRatio,
        value: preset.label,
      }))}
      onChange={onChange}
    />
  );
}

export function RatioGlyph({ ratio, selected }: { ratio: string; selected: boolean }) {
  const [rawWidth, rawHeight] = ratio === "auto" || ratio === "custom" || ratio === "自定义"
    ? [5, 4]
    : ratio.split(":").map((item) => Number(item) || 1);
  const width = Math.max(9, Math.min(24, rawWidth >= rawHeight ? 24 : Math.round((rawWidth / rawHeight) * 24)));
  const height = Math.max(9, Math.min(24, rawHeight > rawWidth ? 24 : Math.round((rawHeight / rawWidth) * 24)));
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-7 shrink-0 items-center justify-center ${selected ? "text-[#07121f]" : "text-white/58"}`}
    >
      <span
        className={`block rounded-[4px] border ${selected ? "border-[#07121f]/70 bg-[#07121f]/7" : "border-current bg-white/[0.035]"}`}
        style={{ height, width }}
      />
    </span>
  );
}
