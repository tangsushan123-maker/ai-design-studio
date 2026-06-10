import type { AspectRatioValue } from "@/lib/design-options";
import { resizePresets } from "@/components/workbench/workbench-config";
import { imageRatio } from "@/components/workbench/workbench-image-metrics";
import { qualityEnhanceDefaultTargetForImage, qualityForQualityEnhanceTarget } from "@/components/workbench/workbench-upscale";
import type { ImageAsset, NodeKind, WorkflowNodeData } from "@/components/workbench/workbench-types";
import { parseTargetSize, ratioParam, stringParam } from "@/components/workbench/workbench-utils";

export type ImageRecommendation = {
  label: string;
  reason: string;
  type: NodeKind;
  handle: string;
  params?: Record<string, unknown>;
};

export function buildImageRecommendations(image: ImageAsset | null): ImageRecommendation[] {
  const ratio = imageRatio(image);
  const size = Math.max(image?.outputSize?.width || image?.width || 0, image?.outputSize?.height || image?.height || 0);
  const recommendations: ImageRecommendation[] = [];

  if (!image) {
    return [
      { label: "先上传图片", reason: "图片节点还没有素材。", type: "image_input", handle: "source" },
    ];
  }

  const qualityEnhanceTarget = qualityEnhanceDefaultTargetForImage(image);
  const qualityEnhanceQuality = qualityForQualityEnhanceTarget(qualityEnhanceTarget);
  if (size && size < 1800) {
    recommendations.push({ label: "画质增强", reason: "当前长边偏小，先用文字修复模式修清文字和边缘，并保持原比例。", type: "hd_redraw", handle: "image", params: { quality: qualityEnhanceQuality, targetSize: qualityEnhanceTarget, enhancementMode: "standard" } });
  } else {
    recommendations.push({ label: "画质增强", reason: "保持构图和原比例，增强文字、边缘和商业质感。", type: "hd_redraw", handle: "image", params: { quality: qualityEnhanceQuality, targetSize: qualityEnhanceTarget, enhancementMode: "standard" } });
  }

  if (ratio > 1.25) {
    recommendations.push({ label: "转 9:16", reason: "转成竖版比例。", type: "resize", handle: "image", params: { targetRatio: "9:16", targetSize: "1080x1920", sizePreset: "9:16", fitMode: "smart_relayout" } });
  } else if (ratio < 0.8) {
    recommendations.push({ label: "转 16:9", reason: "转成横版比例。", type: "resize", handle: "image", params: { targetRatio: "16:9", targetSize: "1920x1080", sizePreset: "16:9", fitMode: "smart_relayout" } });
  } else {
    recommendations.push({ label: "转 3:4", reason: "转成常用竖图比例。", type: "resize", handle: "image", params: { targetRatio: "3:4", targetSize: "1080x1440", sizePreset: "3:4", fitMode: "smart_relayout" } });
  }

  recommendations.push({ label: "局部 AI 修改", reason: "涂哪里改哪里，未涂抹内容保持不变。", type: "mask_edit", handle: "image" });
  recommendations.push({ label: "设计优化", reason: "识别行业和版式问题，优化层级、留白、颜色和商业质感。", type: "design_optimize", handle: "image", params: { strength: "professional", quality: "2k" } });
  recommendations.push({ label: "参考图重制", reason: "把拍照参考图重做成干净高清同风格设计稿。", type: "reference_remake", handle: "image", params: { mode: "fast", quality: "2k" } });
  recommendations.push({ label: "PNG 分层", reason: "把当前成品图拆成背景、文字、人物 3 层，方便导入 PS 检查和微调。", type: "png_layers", handle: "image", params: { mode: "ai_precise" } });
  recommendations.push({ label: "AI合成", reason: "作为图1主体，再连接图2场景自然合成。", type: "fuse_images", handle: "imageA" });
  return recommendations.slice(0, 5);
}

export function buildOutpaintPrompt(params: Record<string, unknown>) {
  const userPrompt = stringParam(params.prompt);
  const direction = stringParam(params.direction) || "四周";
  const targetRatio = stringParam(params.targetRatio) || "16:9";
  const targetSize = stringParam(params.targetSize);
  return [
    userPrompt || "用户没有额外要求，请根据输入图片自行分析并扩展成目标画面。",
    `目标比例/尺寸：${targetRatio}${targetSize ? ` / ${targetSize}` : ""}；扩展方向：${direction}。`,
  ].join("\n");
}

export function buildResizePrompt(params: Record<string, unknown>, ratio: AspectRatioValue) {
  const targetSize = stringParam(params.targetSize) || defaultTargetSizeForRatio(ratio);
  const preset = stringParam(params.sizePreset) || resizePresetLabelFromParams(params);
  const fitMode = stringParam(params.fitMode) || "smart_relayout";
  const userPrompt = stringParam(params.prompt);
  return [
    userPrompt || "用户没有额外要求，请根据输入图片自行分析，并按目标尺寸原生重新设计版式和画面。",
    `任务：AI 改版适配，不是拉伸变形、不是裁切、不是简单缩放。目标：${preset}，${targetSize}。`,
    `处理方式：${fitMode}；必须让标题、主体、卖点、背景和留白重新适配目标画布。`,
    "字体、Logo、二维码、人物/IP、产品保持自然比例；可以重排和重画，但不能横向拉宽或纵向压扁。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function resizeTargetOrientationPrompt(targetSize: string, ratio: AspectRatioValue) {
  const parsed = parseTargetSize(targetSize);
  const vertical = Boolean(parsed.width && parsed.height && parsed.height > parsed.width) || ["9:16", "3:4", "4:5"].includes(ratio);
  const horizontal = Boolean(parsed.width && parsed.height && parsed.width > parsed.height) || ["16:9", "4:3", "3:2"].includes(ratio);
  if (vertical) {
    return " 竖版新设计：标题放上方或中上方居中安全区，主体放中部或中下部，信息区放标题下方或底部；原横版右侧文字位置不能照搬。";
  }
  if (horizontal) {
    return " 横版新设计：标题、主体、卖点按横向阅读动线重新分区，不能把原竖版画面机械裁切或放大。";
  }
  return " 方图新设计：围绕中心视觉焦点重新平衡标题、主体和卖点，不能照搬原边缘位置。";
}

export function activeResizePresetLabel(data: WorkflowNodeData) {
  return resizePresetLabelFromParams(data.params);
}

export function resizePresetLabelFromParams(params: Record<string, unknown>) {
  const targetSize = stringParam(params.targetSize);
  const targetRatio = ratioParam(params.targetRatio);
  return resizePresets.find((preset) => preset.targetSize === targetSize)?.label || targetRatio;
}

export function defaultTargetSizeForRatio(value: AspectRatioValue) {
  if (value === "auto") return "1920x1080";
  if (value === "custom") return "1920x1080";
  if (value === "4:3") return "1440x1080";
  if (value === "9.75:1") return "3900x400";
  return resizePresets.find((preset) => preset.targetRatio === value)?.targetSize || "1920x1080";
}

export function textToImageCompositionCompleteness(params: Record<string, unknown>) {
  const value = stringParam(params.compositionCompleteness);
  return ["标准", "更完整", "大留白", "全身/全物体"].includes(value) ? value : "更完整";
}

export function textToImageSafeMargin(params: Record<string, unknown>) {
  const value = stringParam(params.safeMargin);
  return ["5%", "10%", "15%", "20%"].includes(value) ? value : "15%";
}

export function textToImageCameraDistance(params: Record<string, unknown>) {
  const value = stringParam(params.cameraDistance);
  return ["近景", "中景", "远景", "自动"].includes(value) ? value : "中景";
}

export function textToImageSubjectScale(params: Record<string, unknown>) {
  const value = stringParam(params.subjectScale);
  return ["大", "中", "小"].includes(value) ? value : "中";
}

export function textToImagePreviewFit(_params?: Record<string, unknown>): "contain" {
  void _params;
  return "contain";
}
