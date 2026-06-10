export type MaskEditTaskMode = "cleanup" | "replace" | "style_blend" | "text_remove" | "text_replace" | "text_repair" | "enhance";
export type MaskEditRegionType = "auto" | "background" | "text" | "face" | "product" | "logo" | "qrcode" | "decoration" | "unknown";
export type MaskEditProtectionStrength = "strict" | "standard" | "creative";
export type MaskEditEdgeBlend = "weak" | "standard" | "strong";

export const maskQuickActions: Array<{
  label: string;
  mode: MaskEditTaskMode;
  prompt: string;
  protection: MaskEditProtectionStrength;
  region?: MaskEditRegionType;
  edge?: MaskEditEdgeBlend;
}> = [
  { label: "去掉补背景", mode: "cleanup", prompt: "去掉这里并补全背景", protection: "strict", region: "auto", edge: "weak" },
  { label: "去掉文字", mode: "text_remove", prompt: "去掉文字并补全背景", protection: "strict", region: "text", edge: "weak" },
  { label: "替换成新内容", mode: "replace", prompt: "替换成新内容：", protection: "standard", region: "auto", edge: "standard" },
  { label: "添加元素", mode: "replace", prompt: "在涂抹位置附近添加：", protection: "standard", region: "auto", edge: "standard" },
  { label: "局部高清修复", mode: "enhance", prompt: "局部高清修复，提升清晰度和细节，不改变内容", protection: "strict", edge: "weak" },
  { label: "局部颜色调整", mode: "enhance", prompt: "只调整涂抹区域的颜色、明度、饱和度和色温", protection: "strict", edge: "weak" },
  { label: "局部换背景", mode: "replace", prompt: "把涂抹区域换成新的背景，并与周围自然融合", protection: "standard", region: "background", edge: "standard" },
  { label: "去杂物/水印", mode: "cleanup", prompt: "去掉涂抹区域内的杂物或水印，并补全背景；仅处理我有权编辑的图片", protection: "strict", region: "auto", edge: "weak" },
];

export function maskEditTaskModeParam(value: unknown): MaskEditTaskMode {
  if (value === "replace" || value === "style_blend" || value === "text_remove" || value === "text_replace" || value === "text_repair" || value === "enhance") return value;
  return "cleanup";
}

export function maskEditRegionTypeParam(value: unknown): MaskEditRegionType {
  if (value === "background" || value === "text" || value === "face" || value === "product" || value === "logo" || value === "qrcode" || value === "decoration" || value === "unknown") return value;
  return "auto";
}

export function maskEditProtectionStrengthParam(value: unknown): MaskEditProtectionStrength {
  if (value === "strict" || value === "creative") return value;
  return "standard";
}

export function maskEditEdgeBlendParam(value: unknown): MaskEditEdgeBlend {
  if (value === "weak" || value === "strong") return value;
  return "standard";
}

export function inferSimpleMaskEditIntent(
  prompt: string,
  fallback: Partial<{
    taskMode: MaskEditTaskMode;
    regionType: MaskEditRegionType;
    protectionStrength: MaskEditProtectionStrength;
    edgeBlend: MaskEditEdgeBlend;
  }> = {},
): {
  taskMode: MaskEditTaskMode;
  regionType: MaskEditRegionType;
  protectionStrength: MaskEditProtectionStrength;
  edgeBlend: MaskEditEdgeBlend;
} {
  const text = prompt.trim().toLowerCase();
  const includesAny = (patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));
  const isTextArea = includesAny([/文字|文案|标题|字幕|小字|乱码|错字|字体|字样|text/]);
  const isLogoArea = includesAny([/logo|标志|商标|品牌标识/]);
  const isQrArea = includesAny([/二维码|qr/]);
  const isFaceArea = includesAny([/人脸|脸|五官|表情|头像/]);
  const isProductArea = includesAny([/产品|商品|包装|瓶|盒|设备|器械/]);
  const isBackgroundArea = includesAny([/背景|天空|墙面|地面|蓝天|场景/]);
  const isDecorationArea = includesAny([/图标|装饰|贴纸|标签|按钮|角标|badge|icon|sticker/]);
  const asksRemove = includesAny([/去掉|去除|删除|移除|清除|抹掉|擦掉|不要|补全背景|去水印|去杂物|remove|delete|clean/]);
  const asksReplace = includesAny([/换成|替换|改成|变成|换背景|replace|change into/]);
  const asksAdd = includesAny([/添加|新增|加上|加入|放上|放入|摆上|插入|贴上|add|insert|place/]);
  const asksTextReplace = isTextArea && includesAny([/替换文字|文字改成|改成.*字|换成.*字|写成|换文案/]);
  const asksEnhance = includesAny([/高清|清晰|修复|锐化|增强|质感|光影|高光|阴影|细节|去噪|enhance|repair/]);
  const asksColor = includesAny([/颜色|调色|变色|饱和度|明度|色温|蓝色|红色|绿色|黑色|白色|黄色|紫色|color/]);
  const asksStyleBlend = includesAny([/风格|融合|统一|科技|光效|氛围|渐变|style/]);

  let regionType = fallback.regionType ? maskEditRegionTypeParam(fallback.regionType) : "auto";
  if (isTextArea) regionType = "text";
  else if (isLogoArea) regionType = "logo";
  else if (isQrArea) regionType = "qrcode";
  else if (isFaceArea) regionType = "face";
  else if (isProductArea) regionType = "product";
  else if (isBackgroundArea) regionType = "background";
  else if (isDecorationArea) regionType = "decoration";

  let taskMode = fallback.taskMode ? maskEditTaskModeParam(fallback.taskMode) : "cleanup";
  if (asksTextReplace) taskMode = "text_replace";
  else if (isTextArea && asksRemove) taskMode = "text_remove";
  else if (asksReplace || asksAdd) taskMode = "replace";
  else if (asksEnhance || asksColor) taskMode = "enhance";
  else if (asksStyleBlend) taskMode = "style_blend";
  else if (asksRemove) taskMode = "cleanup";

  let protectionStrength: MaskEditProtectionStrength = fallback.protectionStrength ? maskEditProtectionStrengthParam(fallback.protectionStrength) : "strict";
  let edgeBlend: MaskEditEdgeBlend = fallback.edgeBlend ? maskEditEdgeBlendParam(fallback.edgeBlend) : "weak";
  if (taskMode === "replace" || taskMode === "style_blend") {
    protectionStrength = "standard";
    edgeBlend = "standard";
  }
  if (taskMode === "text_remove" || taskMode === "text_replace" || regionType === "text" || regionType === "logo" || regionType === "qrcode" || regionType === "face") {
    protectionStrength = "strict";
    edgeBlend = "weak";
  }
  if (asksStyleBlend && !isTextArea && !isLogoArea && !isQrArea && !isFaceArea) {
    edgeBlend = "standard";
  }

  return { taskMode, regionType, protectionStrength, edgeBlend };
}
