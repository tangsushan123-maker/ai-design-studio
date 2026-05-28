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
    recommendations.push({ label: "画质增强", reason: "当前长边偏小，先用 Standard 修清文字和边缘，并保持原比例。", type: "hd_redraw", handle: "image", params: { quality: qualityEnhanceQuality, targetSize: qualityEnhanceTarget, enhancementMode: "standard" } });
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
  recommendations.push({ label: "PNG 三层", reason: "把当前成品图拆成背景、文字、人物三张同尺寸透明 PNG。", type: "png_layers", handle: "image", params: { mode: "ai_precise" } });
  recommendations.push({ label: "AI合成", reason: "作为图1主体，再连接图2场景自然合成。", type: "fuse_images", handle: "imageA" });
  return recommendations.slice(0, 5);
}

export function buildOutpaintPrompt(params: Record<string, unknown>) {
  const userPrompt = stringParam(params.prompt);
  const direction = stringParam(params.direction) || "四周";
  const targetRatio = stringParam(params.targetRatio) || "16:9";
  const targetSize = stringParam(params.targetSize);
  return [
    userPrompt || "保持原图核心内容，扩展成完整新比例设计稿。",
    `AI 扩图：目标 ${targetRatio}${targetSize ? ` / ${targetSize}` : ""}，方向 ${direction}。`,
    "向外补全背景、光影、空间和版式延展；不要拉伸、白边、模糊边框或裁掉主体。",
    "保留原图真实标题、人物、产品、Logo、二维码和关键信息，不自行发明。",
  ].join("\n");
}

export function buildResizePrompt(params: Record<string, unknown>, ratio: AspectRatioValue) {
  const targetSize = stringParam(params.targetSize) || defaultTargetSizeForRatio(ratio);
  const preset = stringParam(params.sizePreset) || resizePresetLabelFromParams(params);
  const fitMode = stringParam(params.fitMode) || "smart_relayout";
  const userPrompt = stringParam(params.prompt);
  const targetOrientation = resizeTargetOrientationPrompt(targetSize, ratio);
  return [
    userPrompt ? `用户改尺寸要求：${userPrompt}` : "",
    "AI 改尺寸 / resize 重绘。",
    fitMode === "keep_ratio"
      ? "保持原图比例和构图方向，只按目标尺寸导出，不改变版式和未指定内容。"
      : fitMode === "smart_outpaint"
        ? `扩展成 ${preset}，目标尺寸 ${targetSize}，保留原版式和视觉重心，只向四周补全背景、空间和光影。`
        : `重新设计成 ${preset}，目标尺寸 ${targetSize}，版式、层级、留白、文字位置和视觉重心必须按新尺寸重新排版。`,
    fitMode === "keep_ratio"
      ? "保持比例放大：不要加边、裁切或改比例。"
      : fitMode === "pad"
      ? "补背景保完整：可补充背景，但不能白边或空边。"
      : fitMode === "crop"
        ? "安全裁切：主体和文字必须留在安全区。"
      : fitMode === "smart_outpaint"
          ? "扩图补画：保持原构图，向外补全背景和内容，禁止白边。"
          : "智能改版：新尺寸新排版，原图只作为主题、品牌色、主体素材和核心信息参考；不要照搬原标题位置、主体位置或原坐标。",
    fitMode === "smart_relayout"
      ? `构图：先识别元素和信息层级，再重排阅读顺序；重要元素进中心 76% 安全区，四周 18% 只放背景和出血装饰。${targetOrientation}`
      : "",
    fitMode === "keep_ratio"
      ? "目标：真实目标像素尺寸，文字不变形。"
      : "目标：适配目标比例，主体、文字和品牌信息完整安全。",
    fitMode === "smart_relayout"
      ? "延续原图核心内容、标题含义、人物、产品、电话、地址、Logo 和二维码的识别度；允许按新尺寸重新安排位置，不要自行生成真实信息。"
      : "保留原图核心内容、标题、人物、产品、电话、地址、Logo 和二维码；不要自行生成真实信息。",
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
