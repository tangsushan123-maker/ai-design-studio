import { type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import { sizePresets } from "@/lib/size-presets";
import type { ProjectCreationDraft } from "@/components/workbench/project-creation-modal";
import type { BrandAssetUsage, NodeKind, ProjectProfile } from "@/components/workbench/workbench-types";

export const projectStorageKey = "ai-design-node-project-v1";
export const favoriteStorageKey = "ai-design-favorite-images-v1";
export const maskEditorDraftPrefix = `${projectStorageKey}:mask-editor-draft`;
export const treeBranchHorizontalGap = 340;
export const treeBranchVerticalGap = 280;
export const treeResultHorizontalGap = 340;

export const defaultBrandAssetUsage: BrandAssetUsage = {
  usePrimaryColors: false,
  useSecondaryColors: false,
  useLogo: false,
  useIpImage: false,
  useContact: false,
  useQrCode: false,
  useCopy: false,
  useForbiddenRules: false,
  useFavoriteStyle: false,
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

export const quickActions: Array<{ label: string; description: string; group: string; type: NodeKind; handle: string }> = [
  { label: "参考原图出方案", description: "基于这张图重新设计多版", group: "生成新方案", type: "image_to_image", handle: "image" },
  { label: "优化已有设计", description: "内容不变，提升版式质感", group: "优化/重制", type: "design_optimize", handle: "image" },
  { label: "复刻参考图", description: "低清图重做成干净高清版", group: "优化/重制", type: "reference_remake", handle: "image" },
  { label: "换尺寸/改版适配", description: "换比例，重新排版不拉伸", group: "换尺寸/扩图", type: "resize", handle: "image" },
  { label: "扩图补画", description: "补全边缘，扩成新画幅", group: "换尺寸/扩图", type: "outpaint", handle: "image" },
  { label: "局部修改", description: "涂抹哪里就改哪里", group: "局部处理", type: "mask_edit", handle: "image" },
  { label: "高清/画质增强", description: "修文字、增强质感到 2K/4K", group: "交付处理", type: "hd_redraw", handle: "image" },
  { label: "PNG 分层交付", description: "拆背景、文字、人物，便于 PS 微调", group: "交付处理", type: "png_layers", handle: "image" },
  { label: "两图合成", description: "把另一个主体放进场景", group: "更多", type: "fuse_images", handle: "imageA" },
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
  { value: "direct_use", label: "引用原图" },
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

export const imageTaskTimeoutMs = 12 * 60 * 1000;
export const imageTaskStuckMs = 6 * 60 * 1000;
export const heavyImageTaskStuckMs = 18 * 60 * 1000;
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
    variantCount: 2,
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
    aspectRatio: "auto",
    strength: 0.75,
    quality: "standard",
    variantCount: 2,
    keepOriginalRatio: false,
  },
  fuse_images: {
    prompt: "",
    model: "",
    fusionMode: "主体入景",
    quality: "standard",
  },
  outpaint: {
    direction: "四周",
    targetRatio: "16:9",
    prompt: "用户没有额外要求，请根据输入图片自行分析并扩展成目标画面。",
    model: "",
    quality: "standard",
    variantCount: 2,
  },
  resize: {
    targetRatio: "16:9",
    targetSize: "1920x1080",
    sizePreset: "16:9",
    fitMode: "smart_relayout",
    quality: "standard",
    variantCount: 2,
  },
  replace_product: {
    prompt: "把画面里的产品替换成新产品，保持原光影、透视和商业设计感。",
    model: "",
  },
  mask_edit: {
    prompt: "",
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
