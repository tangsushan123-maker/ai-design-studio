import { type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import { sizePresets } from "@/lib/size-presets";
import type { ProjectCreationDraft } from "@/components/workbench/project-creation-modal";
import type { BrandAssetUsage, NodeKind, ProjectProfile } from "@/components/workbench/workbench-types";

export const projectStorageKey = "ai-design-node-project-v1";
export const favoriteStorageKey = "ai-design-favorite-images-v1";
export const maskEditorDraftPrefix = `${projectStorageKey}:mask-editor-draft`;
export const treeBranchHorizontalGap = 280;
export const treeBranchVerticalGap = 216;
export const treeResultHorizontalGap = 260;

export const defaultBrandAssetUsage: BrandAssetUsage = {
  usePrimaryColors: true,
  useSecondaryColors: true,
  useLogo: false,
  useIpImage: false,
  useContact: false,
  useQrCode: false,
  useCopy: true,
  useForbiddenRules: true,
};

export const emptyProjectProfile: ProjectProfile = {
  brandColors: "",
  primaryColors: "",
  secondaryColors: "",
  accentColors: "",
  backgroundColors: "",
  textColors: "",
  colorPalettes: "",
  logoName: "",
  organizationName: "",
  phone: "",
  address: "",
  qrCodeNote: "",
  commonCopy: "",
  forbiddenContent: "",
  commonSizes: "",
  styleNotes: "",
  keepText: true,
  keepLogo: false,
  keepQrCode: false,
  keepFace: true,
  keepMainSubject: true,
  onlyEditMaskedArea: true,
  brandAssetUsage: defaultBrandAssetUsage,
};

export const emptyProjectCreationDraft: ProjectCreationDraft = {
  projectName: "",
  organizationName: "",
  autoSearch: false,
};

export const quickActions: Array<{ label: string; type: NodeKind; handle: string }> = [
  { label: "扩图补画", type: "outpaint", handle: "image" },
  { label: "改比例", type: "resize", handle: "image" },
  { label: "图生图", type: "image_to_image", handle: "image" },
  { label: "局部 AI 修改", type: "mask_edit", handle: "image" },
  { label: "画质增强", type: "hd_redraw", handle: "image" },
  { label: "参考图重制", type: "reference_remake", handle: "image" },
  { label: "设计优化", type: "design_optimize", handle: "image" },
  { label: "AI合成", type: "fuse_images", handle: "imageA" },
  { label: "PNG分层", type: "png_layers", handle: "image" },
  { label: "输出", type: "output", handle: "image" },
];

export const textReferenceInputHandle = "image";
export const legacyTextReferenceHandles = ["ref1", "ref2", "ref3"] as const;
export const maxTextReferenceImages = 5;

export const flowAriaLabelConfig = {
  "controls.ariaLabel": "画布控制",
  "controls.zoomIn.ariaLabel": "放大",
  "controls.zoomOut.ariaLabel": "缩小",
  "controls.fitView.ariaLabel": "适配视图",
  "controls.interactive.ariaLabel": "切换交互",
  "minimap.ariaLabel": "缩略地图",
  "handle.ariaLabel": "连接点",
};

export const textReferenceRoleOptions: Array<{ value: TextReferenceRole; label: string }> = [
  { value: "person", label: "使用人物" },
  { value: "product", label: "使用产品" },
  { value: "subject", label: "使用主体" },
  { value: "background", label: "使用背景" },
  { value: "style", label: "参考风格" },
  { value: "composition", label: "参考构图" },
  { value: "color", label: "参考色调" },
  { value: "typography", label: "参考文字排版" },
  { value: "logo", label: "使用 logo" },
  { value: "ip", label: "使用 IP 形象" },
  { value: "decoration", label: "使用装饰元素" },
  { value: "reference_only", label: "只做参考" },
];

export const textReferenceWeightOptions: Array<{ value: TextReferenceWeight; label: string }> = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

export const imageTaskTimeoutMs = 35 * 60 * 1000;
export const imageTaskStuckMs = 12 * 60 * 1000;
export const heavyImageTaskStuckMs = 30 * 60 * 1000;
export const successfulTaskAutoHideMs = 8000;
export const projectSnapshotLimit = 5;
export const projectSnapshotIntervalMs = 30 * 1000;
export const projectCapacityNodeWarning = 80;
export const projectCapacityNodeCritical = 150;
export const projectCapacityImageWarning = 200;
export const projectCapacityImageCritical = 300;
export const projectCapacityJsonWarningBytes = 8 * 1024 * 1024;
export const projectCapacityJsonCriticalBytes = 11 * 1024 * 1024;
export const projectLifecycleKeepaliveLimitBytes = 60 * 1024;

export const resizePresets = sizePresets;

export const defaultParamsByKind: Record<NodeKind, Record<string, unknown>> = {
  image_input: {},
  text_to_image: {
    prompt: "",
    model: "",
    aspectRatio: "auto",
    quality: "standard",
    designMode: "commercial",
    textMode: "ai_text_preview",
    designPlan: null,
    planConfirmed: false,
    planVariantSeed: 0,
    compositionCompleteness: "更完整",
    safeMargin: "15%",
    cameraDistance: "中景",
    subjectScale: "中",
    previewFit: "contain",
  },
  image_to_image: {
    prompt: IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST,
    model: "",
    strength: 0.75,
    quality: "standard",
    keepOriginalRatio: true,
  },
  fuse_images: {
    prompt: "把图1主体自然合成到图2场景里，自动匹配大小、透视、光影、阴影、色温和边缘。",
    model: "",
    fusionMode: "主体入景",
    quality: "standard",
  },
  outpaint: {
    direction: "四周",
    targetRatio: "16:9",
    prompt: "向外扩展画面，保持主体、文字、Logo 和版式完整。",
    model: "",
    quality: "standard",
  },
  resize: {
    targetRatio: "16:9",
    targetSize: "1920x1080",
    sizePreset: "16:9",
    fitMode: "smart_relayout",
    quality: "standard",
  },
  replace_product: {
    prompt: "把画面里的产品替换成新产品，保持原光影、透视和商业设计感。",
    model: "",
  },
  mask_edit: {
    prompt: "去掉这里并补全背景",
    model: "",
    quality: "standard",
    preserveOutsideMask: true,
    taskMode: "cleanup",
    regionType: "auto",
    protectionStrength: "strict",
    edgeBlend: "weak",
  },
  hd_redraw: {
    prompt: "文字优先高清修复：保持原图版式和内容不变，重点提升中文标题、小字、Logo 字、包装字可读性。",
    model: "",
    quality: "4k",
    targetSize: "长边3840",
    enhancementMode: "standard",
    format: "png",
  },
  upscale_4k: {
    scale: "4x",
    targetSize: "长边3840",
    model: "",
    quality: "4k",
    fitMode: "standard_enhance",
    format: "png",
  },
  reference_remake: {
    prompt: "按参考图比例、配色、版式、风格和信息层级重制一张干净高清设计图。",
    model: "",
    mode: "fast",
    quality: "2k",
  },
  design_optimize: {
    prompt: "保留核心信息和主体内容，优化版式层级、留白、颜色、视觉焦点和商业质感。",
    model: "",
    strength: "professional",
    quality: "2k",
    comparisonMode: "auto",
    industry: "",
    designType: "",
    scene: "",
  },
  png_layers: {
    mode: "ai_precise",
    model: "",
  },
  output: {
    format: "png",
  },
};

export const inputHandlesByKind: Record<NodeKind, Array<{ id: string; label: string }>> = {
  image_input: [{ id: "source", label: "来源" }],
  text_to_image: [{ id: textReferenceInputHandle, label: "图片参考" }],
  image_to_image: [{ id: "image", label: "图片" }],
  fuse_images: [
    { id: "imageA", label: "主体" },
    { id: "imageB", label: "场景" },
  ],
  outpaint: [{ id: "image", label: "图片" }],
  resize: [{ id: "image", label: "图片" }],
  replace_product: [
    { id: "sourceImage", label: "原图" },
    { id: "productImage", label: "产品" },
  ],
  mask_edit: [
    { id: "image", label: "图片" },
  ],
  hd_redraw: [{ id: "image", label: "图片" }],
  upscale_4k: [{ id: "image", label: "图片" }],
  reference_remake: [{ id: "image", label: "参考图" }],
  design_optimize: [{ id: "image", label: "设计稿" }],
  png_layers: [{ id: "image", label: "图片" }],
  output: [{ id: "image", label: "图片" }],
};
