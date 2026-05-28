import type {
  DesignComparisonMode,
  DesignOptimizationStrength,
  QualityEnhanceMode,
  ReferenceRemakeMode,
} from "@/components/workbench/workbench-types";
import type { PngLayerExportMode } from "@/components/workbench/result-preview-tools";

export function resizeFitModeLabel(value: string) {
  if (value === "smart_relayout") return "智能改版";
  if (value === "smart_outpaint") return "扩图补画";
  if (value === "keep_ratio") return "Standard";
  if (value === "standard_enhance" || value === "faithful_enhance") return "Standard";
  if (value === "plus_enhance") return "Plus";
  if (value === "creative_redraw" || value === "texture_redraw" || value === "ai_redraw") return "Creative";
  if (value === "crop" || value === "pad") return "智能改版";
  return "智能改版";
}

export function resizeFitModeValue(label: string) {
  if (label === "智能改版") return "smart_relayout";
  if (label === "扩图补画" || label === "智能扩图") return "smart_outpaint";
  if (label === "保持比例放大") return "standard_enhance";
  if (label === "Standard" || label === "文字优先高清修复" || label === "保真增强") return "standard_enhance";
  if (label === "Plus" || label === "图文双清晰增强") return "plus_enhance";
  if (label === "Creative" || label === "AI高清重绘" || label === "质感重绘") return "creative_redraw";
  return "smart_relayout";
}

export function isAiQualityEnhanceFitMode(value: string) {
  return value === "ai_redraw" || value === "faithful_enhance" || value === "texture_redraw" || value === "standard_enhance" || value === "plus_enhance" || value === "creative_redraw";
}

export function qualityEnhanceModeParam(value: unknown): QualityEnhanceMode {
  if (value === "plus" || value === "plus_enhance") return "plus";
  if (value === "creative" || value === "texture" || value === "texture_redraw" || value === "creative_redraw" || value === "ai_redraw") return "creative";
  return "standard";
}

export function qualityEnhanceModeFromFitMode(fitMode: string, params: Record<string, unknown>): QualityEnhanceMode {
  if (fitMode === "creative_redraw" || fitMode === "texture_redraw" || fitMode === "ai_redraw") return "creative";
  if (fitMode === "plus_enhance") return "plus";
  if (fitMode === "standard_enhance" || fitMode === "faithful_enhance") return "standard";
  return qualityEnhanceModeParam(params.enhancementMode);
}

export function qualityEnhanceModeLabel(mode: QualityEnhanceMode) {
  if (mode === "plus") return "Plus";
  if (mode === "creative") return "Creative";
  return "Standard";
}

export function qualityEnhanceModeDescription(mode: QualityEnhanceMode) {
  if (mode === "plus") return "Plus：图文双清晰增强。文字区域保真，画面区域增强质感，适合商业海报、电商图、产品图。";
  if (mode === "creative") return "Creative：质感高清重绘。画面更惊艳，适合无字主视觉、食品、产品、背景，不适合重文字图。";
  return "Standard：文字优先高清修复。适合海报、详情页、截图和大量文字图，重点文字清楚，不变字，不乱改。";
}

export function qualityEnhanceModeValue(label: string) {
  if (label === "Plus") return "plus";
  if (label === "Creative") return "creative";
  return "standard";
}

export function pngLayerExportModeParam(value: unknown): PngLayerExportMode {
  return value === "fast" ? "fast" : "ai_precise";
}

export function pngLayerExportModeLabel(mode: PngLayerExportMode) {
  return mode === "fast" ? "快速三层" : "AI三层精准";
}

export function referenceRemakeModeParam(value: unknown): ReferenceRemakeMode {
  return value === "precise" ? "precise" : "fast";
}

export function referenceRemakeModeLabel(mode: ReferenceRemakeMode) {
  return mode === "precise" ? "精准重制" : "快速复刻";
}

export function referenceRemakeModeValue(label: string): ReferenceRemakeMode {
  return label === "精准重制" ? "precise" : "fast";
}

export function designOptimizationStrengthParam(value: unknown): DesignOptimizationStrength {
  if (value === "bold") return "bold";
  if (value === "professional") return "professional";
  return "conservative";
}

export function designOptimizationStrengthLabel(value: DesignOptimizationStrength) {
  if (value === "bold") return "大幅优化";
  if (value === "professional") return "专业优化";
  return "保守优化";
}

export function designOptimizationStrengthValue(label: string): DesignOptimizationStrength {
  if (label === "大幅优化") return "bold";
  if (label === "专业优化") return "professional";
  return "conservative";
}

export function designComparisonModeParam(value: unknown): DesignComparisonMode {
  if (value === "side_by_side" || value === "stacked" || value === "final_only") return value;
  return "auto";
}

export function designComparisonModeLabel(value: DesignComparisonMode) {
  if (value === "side_by_side") return "左右对比";
  if (value === "stacked") return "上下对比";
  if (value === "final_only") return "单独成品";
  return "自动对比";
}

export function designComparisonModeValue(label: string): DesignComparisonMode {
  if (label === "左右对比") return "side_by_side";
  if (label === "上下对比") return "stacked";
  if (label === "单独成品") return "final_only";
  return "auto";
}

export function qualityEnhanceDefaultPrompt(mode: QualityEnhanceMode) {
  if (mode === "creative") {
    return "Creative 质感高清重绘：适合无字主视觉、食品、产品和背景。保持大构图与主体不变，增强纹理、材质、高光、阴影、反射、景深和商业摄影质感；不适合重文字图。";
  }
  if (mode === "plus") {
    return "Plus 图文双清晰增强：文字区域保持原文、原位置和原排版，画面区域增强产品质感、光影、材质和背景细节，最后输出 4K/8K。";
  }
  return "Standard 文字优先高清修复：适合海报、详情页、截图和大量文字图。重点提升文字清晰度、小字可读性和边缘锐度，不变字、不乱改。";
}

export function exportFormatParam(value: unknown): "png" | "jpg" | "webp" {
  return value === "jpg" || value === "jpeg" ? "jpg" : value === "webp" ? "webp" : "png";
}
