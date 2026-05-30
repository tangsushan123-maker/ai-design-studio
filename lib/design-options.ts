export const generationModes = [
  { label: "文生图", value: "text" },
  { label: "图生图", value: "image" },
  { label: "改图", value: "edit" },
] as const;

export const adTypes = [
  "户外广告",
  "公交广告",
  "电子屏",
  "海报",
  "易拉宝",
  "水牌",
  "小红书",
  "抖音",
  "微信订阅号",
  "小程序",
  "电商",
  "详情页",
  "通用设计",
] as const;

export const aspectRatios = [
  { label: "自适应", value: "auto", width: 16, height: 9 },
  { label: "1:1", value: "1:1", width: 1, height: 1 },
  { label: "4:5", value: "4:5", width: 4, height: 5 },
  { label: "3:4", value: "3:4", width: 3, height: 4 },
  { label: "4:3", value: "4:3", width: 4, height: 3 },
  { label: "16:9", value: "16:9", width: 16, height: 9 },
  { label: "9:16", value: "9:16", width: 9, height: 16 },
  { label: "9.75:1", value: "9.75:1", width: 9.75, height: 1 },
  { label: "自定义", value: "custom", width: 1, height: 1 },
] as const;

export const qualityOptions = [
  { label: "普通", value: "standard" },
  { label: "2K", value: "2k" },
  { label: "4K", value: "4k" },
] as const;

export type GenerationMode = (typeof generationModes)[number]["value"];
export type AspectRatioValue = (typeof aspectRatios)[number]["value"];
export type QualityValue = (typeof qualityOptions)[number]["value"];

export type TextReferenceRole =
  | "direct_use"
  | "person"
  | "product"
  | "subject"
  | "background"
  | "style"
  | "composition"
  | "color"
  | "typography"
  | "logo"
  | "ip"
  | "decoration"
  | "reference_only";

export type TextReferenceWeight = "low" | "medium" | "high";

export type TextReferenceImage = {
  id: string;
  label: string;
  role: TextReferenceRole;
  weight: TextReferenceWeight;
  fileName?: string;
  materialType?: string;
};

export type DesignRequest = {
  prompt: string;
  adType: string;
  aspectRatio: AspectRatioValue;
  customWidth?: number;
  customHeight?: number;
  exactSize?: boolean;
  quality: QualityValue;
  imageModel?: string;
  model?: string;
  keepOriginalRatio?: boolean;
  sourceAnalysis?: string;
  referenceImages?: TextReferenceImage[];
  variantDirection?: "stable" | "creative";
  compositionCompleteness?: string;
  safeMargin?: string;
  cameraDistance?: string;
  subjectScale?: string;
  previewFit?: "contain" | "cover";
  protectionContext?: import("./design-production").ProtectionContext;
  designPlan?: import("./design-plan").DesignPlan;
  imagePrompt?: string;
  negativePrompt?: string;
  textMode?: "real_text_overlay" | "background_only" | "ai_text_preview";
};
