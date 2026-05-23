"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type XYPosition,
} from "@xyflow/react";
import {
  ArrowUp,
  ArrowDownToLine,
  Blend,
  Brush,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Expand,
  FileImage,
  Folder,
  FolderOpen,
  ImagePlus,
  Images,
  KeyRound,
  Layers,
  Maximize2,
  MoveDiagonal,
  Palette,
  Plus,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sticker,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { type AspectRatioValue, type QualityValue, type TextReferenceImage, type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import { buildCreativeBriefFallback, type CreativeBrief, type CreativeBriefInput, type CreativeDirection } from "@/lib/creative-brief";
import {
  createDefaultProjectKnowledge,
  normalizeProjectKnowledge,
  type MaterialLibraryRecord,
  type ProjectFactCandidate,
  type ProjectAssetRecord,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";
import { findSizePresetByLabel, sizePresets, type ResizeFitMode } from "@/lib/size-presets";
import { ImageFrame } from "@/components/workbench/image-frame";
import { AssetLibraryPanel } from "@/components/workbench/asset-library-panel";
import { HistoryPanel } from "@/components/workbench/history-panel";
import { ProjectLibraryPanel } from "@/components/workbench/project-library-panel";
import { TaskCenter } from "@/components/workbench/task-center";
import { VersionStrip } from "@/components/workbench/version-strip";
import {
  adaptiveRatioOptions,
  customSize,
  dataUrlToFile,
  fileFromImageUrl,
  getImageFileFromClipboard,
  hasClipboardImageCandidate,
  hasClipboardImageFile,
  inferRatioFromPrompt,
  inferRatioFromTargetSize,
  isAspectRatioValue,
  isLocalGeneratedUrl,
  isSupportedImageFile,
  parseTargetSize,
  qualityParam,
  ratioOptionLabel,
  ratioOptions,
  ratioParam,
  resolveAdaptiveRatioFromPrompt,
  resolveRequestedAspectRatio,
  sanitizeFileName,
  stringParam,
  wait,
} from "@/components/workbench/workbench-utils";
import type { ModelCatalogItem } from "@/lib/openai-defaults";

type GeneratedImage = {
  id: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  resourceFileName?: string;
  originalFileName?: string;
  prompt: string;
  variant: number;
  ratio?: {
    width: number;
    height: number;
  };
  mode?: string;
  model?: string;
  aspectRatio?: string;
  quality?: QualityValue;
  generatedAt?: string;
  outputSize?: {
    width: number;
    height: number;
  };
  fileName?: string;
  savedPath?: string;
  durationMs?: number;
  fileSizeBytes?: number;
  alphaCheck?: {
    hasAlphaChannel?: boolean;
    hasTransparentPixels?: boolean;
    transparentPixelRatio?: number;
    partialAlphaPixelRatio?: number;
    message?: string;
  };
  expectedOutputSize?: {
    width: number;
    height: number;
  };
  qualityCheck?: {
    status?: "passed" | "pending" | "size_insufficient" | "ratio_mismatch" | "suspected_stretch" | "white_border" | "composition_risk" | "blurred_padding" | "failed" | "empty";
    label?: string;
    issues?: string[];
    actions?: string[];
    width?: number;
    height?: number;
    targetWidth?: number;
    targetHeight?: number;
    format?: string;
    fileSizeBytes?: number;
    is4kTarget?: boolean;
    importantContentRisk?: boolean;
    importantContentLabel?: string;
    compositionRisk?: boolean;
    compositionRiskLabel?: string;
    edgeContentRatio?: number;
    edgeHotSide?: string;
    safeMarginPercent?: number;
    protectedTextCount?: number;
    protectedAssetCount?: number;
    detailScore?: number;
    clarityScoreBefore?: number;
    clarityScoreAfter?: number;
    clarityGain?: number;
    clarityImproved?: boolean;
    clarityCheckLabel?: string;
  };
  projectId?: string;
  parentImageId?: string;
  rootImageId?: string;
  branchId?: string;
  branchLabel?: string;
  resultGroupId?: string;
  nextImageIds?: string[];
  sourceTaskId?: string;
  strategyPackageId?: string;
  sourceStrategyTitle?: string;
  materialPlanItemId?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
  materialScene?: string;
  sourceLabel?: string;
  tags?: string[];
  colorTags?: string[];
  nodeOperation?: string;
  maskProtectionCheck?: {
    status?: string;
    label?: string;
    message?: string;
  };
  protectionContext?: ProtectionContextPayload;
  version?: VersionPayload;
  editableLayers?: EditableLayer[];
  layoutCheck?: LayoutCheck;
  layoutTemplate?: string;
  favorite?: boolean;
};

type ProtectedTextPayload = {
  id: string;
  text: string;
  kind: "hospital" | "phone" | "address" | "doctor" | "price" | "title" | "logo" | "qr" | "medical" | "other";
  importance: "critical" | "high" | "normal";
  reason?: string;
};

type ProtectedAssetPayload = {
  id: string;
  type: "logo" | "qr" | "portrait" | "product" | "seal" | "other";
  label: string;
  importance: "critical" | "high" | "normal";
  instruction: string;
};

type VersionPayload = {
  projectId?: string;
  parentIds?: string[];
  taskId?: string;
  nodeOperation?: string;
  sourceUrls?: string[];
};

type ProtectionContextPayload = {
  protectedTexts?: ProtectedTextPayload[];
  protectedAssets?: ProtectedAssetPayload[];
  layers?: Array<{ id: string; type: "background" | "person" | "text" | "logo" | "decoration" | "effect" | "unknown"; label: string; locked?: boolean; notes?: string }>;
  brandProfile?: {
    name?: string;
    colors?: string[];
    fontStyle?: string;
    logoPlacement?: string;
    visualTone?: string;
    rules?: string[];
  };
  version?: VersionPayload;
};

type EditableLayerKind = "background" | "subject" | "text" | "logo" | "qr" | "decoration";

type EditableLayer = {
  id: string;
  kind: EditableLayerKind;
  label: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  align?: "left" | "center" | "right";
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  locked?: boolean;
  visible?: boolean;
  role?: string;
};

type HistoryResizeOptions = {
  targetRatio: AspectRatioValue;
  targetSize: string;
  fitMode: ResizeFitMode;
  quality: QualityValue;
  prompt?: string;
};

type HistoryUpscaleOptions = {
  targetSize: string;
  fitMode: ResizeFitMode | "keep_ratio" | "ai_redraw";
  quality: QualityValue;
  prompt?: string;
};

type HistoryMaskEditOptions = {
  prompt: string;
  quality: QualityValue;
};

type HistoryOperationOptions = {
  targetRatio?: AspectRatioValue;
  targetSize?: string;
  fitMode?: HistoryResizeOptions["fitMode"] | HistoryUpscaleOptions["fitMode"];
  quality?: QualityValue;
  prompt?: string;
};

type LayoutCheck = {
  status: "passed" | "risk" | "failed";
  label: string;
  issues: string[];
  suggestions: string[];
};

type ImageAsset = GeneratedImage & {
  file?: File;
  width?: number;
  height?: number;
  source?: "upload" | "paste" | "asset" | "history" | "generated";
  nodeOperation?: string;
  strategyPackageId?: string;
  sourceStrategyTitle?: string;
  materialPlanItemId?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
  materialScene?: string;
};

type TextReferenceConfig = {
  handle: string;
  role: TextReferenceRole;
  weight: TextReferenceWeight;
};

type ResolvedTextReference = {
  handle: string;
  image: ImageAsset;
  manifest: TextReferenceImage;
};

type ProjectAssetUploadKind = "logo" | "qrcode" | "ip" | "background";

type NodeKind =
  | "image_input"
  | "text_to_image"
  | "image_to_image"
  | "fuse_images"
  | "outpaint"
  | "resize"
  | "remove_background"
  | "layer_output"
  | "replace_product"
  | "mask_edit"
  | "hd_redraw"
  | "upscale_4k"
  | "output";

type NodeStatus = "idle" | "queued" | "running" | "saving" | "completed" | "failed" | "cancelled";

type WorkflowNodeData = {
  [key: string]: unknown;
  title: string;
  subtitle?: string;
  kind: NodeKind;
  params: Record<string, unknown>;
  image?: ImageAsset;
  output?: ImageAsset | null;
  outputs?: ImageAsset[];
  status?: NodeStatus;
  error?: string;
  resultCount?: number;
  onRun?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onParamChange?: (nodeId: string, key: string, value: unknown) => void;
  onImageFile?: (nodeId: string, file: File) => void;
  onPreview?: (image: ImageAsset) => void;
  onMaskEdit?: (nodeId: string) => void;
};

type FlowNode = Node<WorkflowNodeData, NodeKind>;
type FlowEdge = Edge;

type TaskRecord = {
  id: string;
  nodeId: string;
  nodeName: string;
  type: string;
  model: string;
  status: NodeStatus;
  startedAt: number;
  endedAt?: number;
  stage?: "queued" | "preparing" | "generating" | "saving" | "quality" | "completed" | "failed" | "cancelled";
  requestStartedAt?: number;
  saveStartedAt?: number;
  modelDurationMs?: number;
  saveDurationMs?: number;
  error?: string;
  result?: ImageAsset;
  inputs?: ImageAsset[];
  outputs?: ImageAsset[];
  resultCount?: number;
  resultNodeIds?: string[];
  resultOnCanvas?: boolean;
  progress?: number;
  progressLabel?: string;
  cancelled?: boolean;
  deferred?: boolean;
  strategyPackageId?: string;
  sourceStrategyTitle?: string;
  materialPlanItemId?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
  materialScene?: string;
  prompt?: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  projectKind?: ProjectKind;
  updatedAt?: string;
  nodeCount?: number;
  runCount?: number;
  assetCount?: number;
  coverUrl?: string;
  organizationName?: string;
  libraryName?: string;
  referenceCount?: number;
};

type ProjectProfile = {
  brandColors: string;
  primaryColors: string;
  secondaryColors: string;
  accentColors: string;
  backgroundColors: string;
  textColors: string;
  colorPalettes: string;
  logoName: string;
  organizationName: string;
  phone: string;
  address: string;
  qrCodeNote: string;
  commonCopy: string;
  forbiddenContent: string;
  commonSizes: string;
  styleNotes: string;
  keepText: boolean;
  keepLogo: boolean;
  keepQrCode: boolean;
  keepFace: boolean;
  keepMainSubject: boolean;
  onlyEditMaskedArea: boolean;
  brandAssetUsage: BrandAssetUsage;
};

type BrandAssetUsage = {
  usePrimaryColors: boolean;
  useSecondaryColors: boolean;
  useLogo: boolean;
  useIpImage: boolean;
  useContact: boolean;
  useQrCode: boolean;
  useCopy: boolean;
  useForbiddenRules: boolean;
};

type BrandAssetSummary = {
  activeCount: number;
  totalCount: number;
  colorCount: number;
  logoCount: number;
  ipCount: number;
  qrCount: number;
  hasContact: boolean;
  copyCount: number;
  ruleCount: number;
  missing: string[];
};

type MenuState =
  | {
      kind: "add";
      x: number;
      y: number;
      position: XYPosition;
    }
  | {
      kind: "quick";
      x: number;
      y: number;
      nodeId: string;
    }
  | null;

type RightPanelTab = "params" | "tasks" | "library";

type MaterialLibrarySummary = {
  id: string;
  name: string;
  kind: "project" | "public_style";
  ownerProjectId?: string;
  description: string;
  tags: string[];
  itemCount: number;
  styleRuleCount?: number;
  referenceCount?: number;
  updatedAt?: string;
  items?: ProjectAssetRecord[];
};

type ProjectCreationDraft = {
  projectName: string;
  organizationName: string;
  autoSearch: boolean;
};

type ProjectPayload = {
  id: string;
  name: string;
  projectKind?: ProjectKind;
  updatedAt?: string;
  viewport?: { x: number; y: number; zoom: number };
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  runs?: TaskRecord[];
  assets?: ImageAsset[];
  assetText?: string;
  textProtectionMode?: boolean;
  profile?: ProjectProfile;
  knowledge?: ProjectKnowledgeBase;
};

type TransparentPngResult = {
  image?: ImageAsset;
  alphaCheck?: ImageAsset["alphaCheck"];
  originalAlpha?: ImageAsset["alphaCheck"];
  mode?: TransparentCutoutMode;
  cutoutType?: TransparentCutoutType;
  recommendation?: TransparentCutoutRecommendation;
  warning?: string;
  error?: string;
};

type TransparentCutoutMode = "auto" | "real_cutout" | "ai_regenerate";
type TransparentCutoutType = "auto" | "person" | "product" | "logo_icon" | "text_title" | "ip";

type TransparentCutoutOptions = {
  mode: TransparentCutoutMode;
  cutoutType: TransparentCutoutType;
  tolerance?: number;
};

type TransparentCutoutRecommendation = {
  mode: Exclude<TransparentCutoutMode, "auto">;
  confidence?: number;
  reason?: string;
  edgeComplexity?: number;
};

type LayerOutputResult = {
  groupId: string;
  images: ImageAsset[];
	  layers: {
	    original?: ImageAsset | null;
	    fullPreview?: ImageAsset | null;
	    background?: ImageAsset | null;
	    backgroundNoText?: ImageAsset | null;
	    textLayer?: ImageAsset | null;
	    textFull?: ImageAsset | null;
	    textRebuilt?: ImageAsset | null;
	    textCutout?: ImageAsset | null;
	    textCropped?: ImageAsset | null;
	    mask?: ImageAsset | null;
	    textAlphaMask?: ImageAsset | null;
	    repairMask?: ImageAsset | null;
	    backgroundFirstPass?: ImageAsset | null;
	  };
  errors?: {
    background?: string;
    textLayer?: string;
  };
  metadata?: {
    metadataUrl?: string;
    size?: {
      width: number;
      height: number;
    };
  };
  error?: string;
};

type LayerOutputOptions = {
  includeBackground: boolean;
  includeTextLayer: boolean;
  maskStrength?: "soft" | "normal" | "strong";
  keepGlow?: boolean;
  outputCroppedText?: boolean;
};

type ProjectKind = "scratch" | "formal" | "temporary";

const projectStorageKey = "ai-design-node-project-v1";
const favoriteStorageKey = "ai-design-favorite-images-v1";
const treeBranchHorizontalGap = 280;
const treeBranchVerticalGap = 216;
const treeResultHorizontalGap = 260;

const defaultBrandAssetUsage: BrandAssetUsage = {
  usePrimaryColors: true,
  useSecondaryColors: true,
  useLogo: false,
  useIpImage: false,
  useContact: false,
  useQrCode: false,
  useCopy: true,
  useForbiddenRules: true,
};

const emptyProjectProfile: ProjectProfile = {
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

const emptyProjectCreationDraft: ProjectCreationDraft = {
  projectName: "",
  organizationName: "",
  autoSearch: false,
};

const nodeCatalog: Array<{
  type: NodeKind;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { type: "image_input", label: "图片输入", description: "上传、拖拽、粘贴、结果图片。", icon: <ImagePlus className="size-4" /> },
  { type: "text_to_image", label: "文生图", description: "输入需求，生成 2 个方案。", icon: <Sparkles className="size-4" /> },
  { type: "image_to_image", label: "图生图", description: "参考原图做创意改版。", icon: <Wand2 className="size-4" /> },
  { type: "fuse_images", label: "AI合成", description: "图1主体放入图2场景。", icon: <Blend className="size-4" /> },
  { type: "outpaint", label: "扩图补画", description: "AI 补全缺失画面，不是拉伸。", icon: <Expand className="size-4" /> },
  { type: "resize", label: "改比例", description: "智能改版到目标尺寸。", icon: <MoveDiagonal className="size-4" /> },
  { type: "remove_background", label: "透明抠图", description: "真实抠图 / AI重生透明图。", icon: <ScanLine className="size-4" /> },
  { type: "layer_output", label: "分层拆图", description: "从当前图拆出无字背景和文字透明 PNG。", icon: <Layers className="size-4" /> },
  { type: "mask_edit", label: "局部涂抹", description: "先涂抹区域，再写修补要求。", icon: <Brush className="size-4" /> },
  { type: "hd_redraw", label: "高清重绘", description: "真正变清晰，保持原版式。", icon: <RefreshCcw className="size-4" /> },
  { type: "upscale_4k", label: "4K无损导出", description: "按原比例放大，不重绘、不裁切。", icon: <Maximize2 className="size-4" /> },
  { type: "output", label: "输出", description: "下载、复制、保存结果。", icon: <ArrowDownToLine className="size-4" /> },
];

const quickActions: Array<{ label: string; type: NodeKind; handle: string }> = [
  { label: "扩图补画", type: "outpaint", handle: "image" },
  { label: "改比例", type: "resize", handle: "image" },
  { label: "透明抠图", type: "remove_background", handle: "image" },
  { label: "分层拆图", type: "layer_output", handle: "image" },
  { label: "图生图", type: "image_to_image", handle: "image" },
  { label: "局部涂抹", type: "mask_edit", handle: "image" },
  { label: "高清重绘", type: "hd_redraw", handle: "image" },
  { label: "AI合成", type: "fuse_images", handle: "imageA" },
  { label: "4K无损导出", type: "upscale_4k", handle: "image" },
  { label: "输出", type: "output", handle: "image" },
];

const textReferenceInputHandle = "image";
const legacyTextReferenceHandles = ["ref1", "ref2", "ref3"] as const;
const maxTextReferenceImages = 5;

const textReferenceRoleOptions: Array<{ value: TextReferenceRole; label: string }> = [
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

const textReferenceWeightOptions: Array<{ value: TextReferenceWeight; label: string }> = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const imageTaskTimeoutMs = 600000;
const successfulTaskAutoHideMs = 8000;

const resizePresets = sizePresets;

const defaultParamsByKind: Record<NodeKind, Record<string, unknown>> = {
  image_input: {},
  text_to_image: {
    prompt: "",
    model: "",
    aspectRatio: "auto",
    quality: "standard",
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
  remove_background: {
    tolerance: 34,
    cutoutMode: "real_cutout",
    cutoutType: "auto",
    edgeFeather: 1.6,
    outputFormat: "png",
    model: "",
  },
  layer_output: {
    includeBackground: true,
    includeTextLayer: true,
    prompt: "",
    model: "",
  },
  replace_product: {
    prompt: "把画面里的产品替换成新产品，保持原光影、透视和商业设计感。",
    model: "",
  },
  mask_edit: {
    prompt: "只修补我涂抹的区域，其他内容保持不变。例如：把这里修补成更干净的体检广告画面，保留原有文字和风格。",
    model: "",
    quality: "standard",
    preserveOutsideMask: true,
    maskFeather: 12,
  },
  hd_redraw: {
    prompt: "保持原图版式和内容不变，只提升清晰度、文字边缘、图标线条、人物/产品细节和背景质感。",
    model: "",
    quality: "standard",
  },
  upscale_4k: {
    scale: "4x",
    targetSize: "长边3840",
    model: "",
    quality: "4k",
    fitMode: "keep_ratio",
  },
  output: {
    format: "png",
  },
};

const inputHandlesByKind: Record<NodeKind, Array<{ id: string; label: string }>> = {
  image_input: [{ id: "source", label: "来源" }],
  text_to_image: [{ id: textReferenceInputHandle, label: "图片参考" }],
  image_to_image: [{ id: "image", label: "图片" }],
  fuse_images: [
    { id: "imageA", label: "主体" },
    { id: "imageB", label: "场景" },
  ],
  outpaint: [{ id: "image", label: "图片" }],
  resize: [{ id: "image", label: "图片" }],
  remove_background: [{ id: "image", label: "图片" }],
  layer_output: [{ id: "image", label: "图片" }],
  replace_product: [
    { id: "sourceImage", label: "原图" },
    { id: "productImage", label: "产品" },
  ],
  mask_edit: [
    { id: "image", label: "图片" },
  ],
  hd_redraw: [{ id: "image", label: "图片" }],
  upscale_4k: [{ id: "image", label: "图片" }],
  output: [{ id: "image", label: "图片" }],
};

type WorkbenchModelInfo = {
  imageModel: string;
  analysisModel: string;
  textModel?: string;
  videoModel?: string;
  modelsCache?: ModelCatalogItem[];
  providerLabel?: string;
  hasKey: boolean;
};

export default function WorkbenchClient({
  initialImages = [],
  initialHistoryHasMore = false,
  initialHistoryNextOffset,
  initialModelInfo,
}: {
  initialImages?: GeneratedImage[];
  initialHistoryHasMore?: boolean;
  initialHistoryNextOffset?: number;
  initialModelInfo: WorkbenchModelInfo;
}) {
  return (
    <ReactFlowProvider>
      <NodeWorkflowWorkbench
        initialHistoryHasMore={initialHistoryHasMore}
        initialHistoryNextOffset={initialHistoryNextOffset ?? initialImages.length}
        initialImages={initialImages}
        initialModelInfo={initialModelInfo}
      />
    </ReactFlowProvider>
  );
}

function initialImageModelFor(modelInfo: WorkbenchModelInfo) {
  const passedImages = (modelInfo.modelsCache || []).filter((item) => item.capabilities.includes("image") && item.testStatus === "passed");
  return passedImages.find((item) => item.id === modelInfo.imageModel)?.id || passedImages[0]?.id || "";
}

function NodeWorkflowWorkbench({
  initialHistoryHasMore,
  initialHistoryNextOffset,
  initialImages,
  initialModelInfo,
}: {
  initialHistoryHasMore: boolean;
  initialHistoryNextOffset: number;
  initialImages: GeneratedImage[];
  initialModelInfo: WorkbenchModelInfo;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageNodeRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveFeedbackTimerRef = useRef<number | null>(null);
  const edgeDeleteTimerRef = useRef<number | null>(null);
  const taskProgressTimersRef = useRef<Record<string, number>>({});
  const taskCleanupTimersRef = useRef<Record<string, number>>({});
  const canvasFocusTimerRef = useRef<number | null>(null);
  const cancelledTaskIdsRef = useRef<Set<string>>(new Set());
  const projectLoadedRef = useRef(false);
  const { screenToFlowPosition, getViewport, setViewport, fitView } = useReactFlow<FlowNode, FlowEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const nodesRef = useRef<FlowNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [historyImages, setHistoryImages] = useState<ImageAsset[]>(() => {
    const initialFavoriteIds = loadFavoriteIds();
    return sortImagesByRecency(initialImages.map((image) => ({ ...image, source: "history", favorite: initialFavoriteIds.has(imageKey(image)) })));
  });
  const [historyHasMore, setHistoryHasMore] = useState(initialHistoryHasMore);
  const [historyNextOffset, setHistoryNextOffset] = useState(initialHistoryNextOffset);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [, setLastSaveDurationMs] = useState<number | null>(null);
  const [, setLastProjectJsonBytes] = useState(0);
  const [projectAssets, setProjectAssets] = useState<ImageAsset[]>([]);
  const [projectAssetText, setProjectAssetText] = useState("");
  const [projectProfile, setProjectProfile] = useState<ProjectProfile>(emptyProjectProfile);
  const [projectKnowledge, setProjectKnowledge] = useState<ProjectKnowledgeBase>(() => createDefaultProjectKnowledge({ projectId: "local-project", projectName: "节点设计项目" }));
  const [projectLibraries, setProjectLibraries] = useState<MaterialLibrarySummary[]>([]);
  const [publicStyleLibraries, setPublicStyleLibraries] = useState<MaterialLibrarySummary[]>([]);
  const [textProtectionMode, setTextProtectionMode] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<ImageAsset | null>(null);
  const [projectName, setProjectName] = useState("节点设计项目");
  const [projectId, setProjectId] = useState("local-project");
  const [projectKind, setProjectKind] = useState<ProjectKind>("scratch");
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const [projectSaveState, setProjectSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveFeedback, setSaveFeedback] = useState<{ tone: "loading" | "success" | "error"; message: string } | null>(null);
  const [projectMemorySearchState, setProjectMemorySearchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [homeOpen, setHomeOpen] = useState(true);
  const [homeProjectPickerOpen, setHomeProjectPickerOpen] = useState(false);
  const [homeBusy, setHomeBusy] = useState(false);
  const [projectBootReady, setProjectBootReady] = useState(false);
  const [modelInfo, setModelInfo] = useState(initialModelInfo);
  const [status, setStatus] = useState("空画布。点击“添加节点”，或直接拖拽 / 粘贴图片。");
  const [creativeStartBusy, setCreativeStartBusy] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTabHint, setRightPanelTabHint] = useState<RightPanelTab>("tasks");
  const [rightPanelTabTick, setRightPanelTabTick] = useState(0);
  const [composerPrompt, setComposerPrompt] = useState("");
  const [composerModel, setComposerModel] = useState(initialImageModelFor(initialModelInfo));
  const [composerRatio, setComposerRatio] = useState<AspectRatioValue>("auto");
  const [composerQuality, setComposerQuality] = useState<QualityValue>("standard");
  const [pendingRunNodeId, setPendingRunNodeId] = useState<string | null>(null);
  const [pendingRunNodeIds, setPendingRunNodeIds] = useState<string[]>([]);
  const [maskEditorNodeId, setMaskEditorNodeId] = useState<string | null>(null);
  nodesRef.current = nodes;
  const hasTaskResultNodesOnCanvas = useCallback((task: Pick<TaskRecord, "resultNodeIds">) => {
    if (!task.resultNodeIds?.length) return false;
    const canvasNodeIds = new Set(nodesRef.current.map((node) => node.id));
    return task.resultNodeIds.every((nodeId) => canvasNodeIds.has(nodeId));
  }, []);
  const scheduleSuccessfulTaskAutoHide = useCallback((taskId: string) => {
    const existingTimer = taskCleanupTimersRef.current[taskId];
    if (existingTimer) window.clearTimeout(existingTimer);
    taskCleanupTimersRef.current[taskId] = window.setTimeout(() => {
      setTasks((current) =>
        current.filter((task) => {
          if (task.id !== taskId) return true;
          return task.status !== "completed" || !hasTaskResultNodesOnCanvas(task);
        }),
      );
      delete taskCleanupTimersRef.current[taskId];
    }, successfulTaskAutoHideMs);
  }, [hasTaskResultNodesOnCanvas]);
  const passedImageModelOptions = useMemo(
    () => (modelInfo.modelsCache || []).filter((item) => item.capabilities.includes("image") && item.testStatus === "passed"),
    [modelInfo.modelsCache],
  );
  const effectiveImageModel = passedImageModelOptions.find((item) => item.id === composerModel)?.id
    || passedImageModelOptions.find((item) => item.id === modelInfo.imageModel)?.id
    || passedImageModelOptions[0]?.id
    || "";
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const projectReferenceContext = useMemo(
    () => buildProjectLibraryContext(projectKnowledge, projectLibraries, publicStyleLibraries),
    [projectKnowledge, projectLibraries, publicStyleLibraries],
  );
  const projectContextText = useMemo(
    () => [projectAssetText, projectReferenceContext].filter(Boolean).join("\n\n"),
    [projectAssetText, projectReferenceContext],
  );
  const brandAssetSummary = useMemo(
    () => summarizeBrandAssets(projectProfile, getCurrentProjectBrandAssets(projectAssets, projectKnowledge)),
    [projectAssets, projectKnowledge, projectProfile],
  );
  const maskEditorNode = maskEditorNodeId ? nodes.find((node) => node.id === maskEditorNodeId) ?? null : null;
  const maskEditorImage = maskEditorNode ? resolveInputImage(maskEditorNode.id, "image") : null;
  const nodeHandlersRef = useRef({
    runNode: (nodeId: string) => {
      void runNode(nodeId);
    },
    deleteNode,
    updateNodeParam,
    attachFileToImageNode,
    preview: setLightboxImage,
    maskEdit: (nodeId: string) => {
      if (!resolveInputImage(nodeId, "image")) {
        setStatus("局部涂抹需要先把图片连接到局部涂抹节点。");
        return;
      }
      setMaskEditorNodeId(nodeId);
    },
  });
  nodeHandlersRef.current = {
    runNode: (nodeId: string) => {
      void runNode(nodeId);
    },
    deleteNode,
    updateNodeParam,
    attachFileToImageNode,
    preview: setLightboxImage,
    maskEdit: (nodeId: string) => {
      if (!resolveInputImage(nodeId, "image")) {
        setStatus("局部涂抹需要先把图片连接到局部涂抹节点。");
        return;
      }
      setMaskEditorNodeId(nodeId);
    },
  };
  const decoratedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        zIndex: node.id === selectedNodeId ? 20 : node.zIndex,
        data: {
          ...node.data,
          textReferencePreviews: node.data.kind === "text_to_image" ? textReferencePreviewsForNode(node) : undefined,
          onRun: (nodeId: string) => {
            nodeHandlersRef.current.runNode(nodeId);
          },
          onDelete: (nodeId: string) => nodeHandlersRef.current.deleteNode(nodeId),
          onParamChange: (nodeId: string, key: string, value: unknown) => nodeHandlersRef.current.updateNodeParam(nodeId, key, value),
          onImageFile: (nodeId: string, file: File) => void nodeHandlersRef.current.attachFileToImageNode(nodeId, file),
          onPreview: (image: ImageAsset) => nodeHandlersRef.current.preview(image),
          onMaskEdit: (nodeId: string) => {
            nodeHandlersRef.current.maskEdit(nodeId);
          },
        },
      })),
    // Node handlers are routed through nodeHandlersRef so dragging does not recreate handlers for every node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodes, selectedNodeId],
  );
  useEffect(() => {
    return () => {
      Object.values(taskCleanupTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      taskCleanupTimersRef.current = {};
    };
  }, []);
  useEffect(() => {
    tasks.forEach((task) => {
      if (task.status !== "completed" || !hasTaskResultNodesOnCanvas(task) || taskCleanupTimersRef.current[task.id]) return;
      scheduleSuccessfulTaskAutoHide(task.id);
    });
  }, [hasTaskResultNodesOnCanvas, nodes, scheduleSuccessfulTaskAutoHide, tasks]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (targetNode?.data.kind === "text_to_image" && isTextReferenceTargetHandle(connection.targetHandle)) {
        const referenceCount = edges.filter((edge) => edge.target === connection.target && isTextReferenceTargetHandle(edge.targetHandle)).length;
        const alreadyConnected = edges.some((edge) => edge.source === connection.source && edge.target === connection.target && isTextReferenceTargetHandle(edge.targetHandle));
        if (alreadyConnected) {
          setStatus("这张图片已经连接到当前文生图节点。");
          return;
        }
        if (referenceCount >= maxTextReferenceImages) {
          setStatus(`文生图图片参考最多连接 ${maxTextReferenceImages} 张。`);
          return;
        }
      }
      setEdges((currentEdges) =>
        addEdge(
          {
            ...connection,
            targetHandle: targetNode?.data.kind === "text_to_image" ? textReferenceInputHandle : connection.targetHandle,
            id: `edge_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
            animated: true,
            className: "workflow-edge",
          },
          currentEdges,
        ),
      );
    },
    [edges, nodes, setEdges],
  );

  useEffect(() => {
    fetch("/api/health-openai")
      .then((response) => response.json())
      .then((data) => {
        setModelInfo({
          imageModel: data.imageModel || initialModelInfo.imageModel,
          analysisModel: data.analysisModel || initialModelInfo.analysisModel,
          textModel: data.textModel || data.analysisModel || initialModelInfo.textModel,
          videoModel: data.videoModel || initialModelInfo.videoModel,
          modelsCache: data.modelsCache || initialModelInfo.modelsCache,
          providerLabel: data.providerLabel || initialModelInfo.providerLabel,
          hasKey: Boolean(data.hasKey),
        });
        const passedImages = (data.modelsCache || initialModelInfo.modelsCache || []).filter((item: ModelCatalogItem) => item.capabilities.includes("image") && item.testStatus === "passed");
        const nextImageModel = passedImages.find((item: ModelCatalogItem) => item.id === data.imageModel)?.id || passedImages[0]?.id || "";
        setComposerModel((current) => current || nextImageModel);
      })
      .catch(() => {});
  }, [initialModelInfo]);

  useEffect(() => {
    function syncPanelsToViewport() {
      setRightPanelOpen(false);
      setLeftRailOpen(window.innerWidth >= 720);
    }

    syncPanelsToViewport();
  }, []);

  useEffect(() => {
    void refreshProjectList();
    void refreshMaterialLibraries();
  }, []);

  useEffect(() => {
    fetch("/api/project")
      .then((response) => response.json())
      .then((project: ProjectPayload) => {
        const stored = getStoredProject(project);
        if (stored?.id) setProjectId(stored.id);
        if (stored?.name) setProjectName(stored.name);
        setProjectKind(normalizeProjectKind(stored?.projectKind));
        const restoredRuns = restoreProjectTasks(stored?.runs || []);
        const restoredTasks = restoreProjectTasks(readProjectTaskCache(stored?.id || "local-project", restoredRuns));
        const restoredNodes = restoreNodes(stored?.nodes || [], restoredTasks);
        setNodes(restoredNodes);
        setEdges(stored?.edges || []);
        setStatus(restoredNodes.length ? `已恢复 ${restoredNodes.length} 个画布节点。` : "空画布。点击“添加节点”，或直接拖拽 / 粘贴图片。");
        setTasks(restoredTasks);
        const nextKnowledge = resolveProjectKnowledge(stored);
        setProjectKnowledge(nextKnowledge);
        setProjectAssets(resolveProjectAssets(stored, nextKnowledge));
        setProjectAssetText(resolveProjectAssetText(stored, nextKnowledge));
        setProjectProfile(resolveProjectProfile(stored, nextKnowledge));
        setTextProtectionMode(stored?.textProtectionMode ?? true);
        restoreCanvasViewport(restoredNodes, stored?.viewport);
      })
      .catch(() => {
        const stored = getStoredProject(null);
        if (stored?.id) setProjectId(stored.id);
        if (stored?.name) setProjectName(stored.name);
        setProjectKind(normalizeProjectKind(stored?.projectKind));
        const restoredRuns = restoreProjectTasks(stored?.runs || []);
        const restoredTasks = restoreProjectTasks(readProjectTaskCache(stored?.id || "local-project", restoredRuns));
        const restoredNodes = restoreNodes(stored?.nodes || [], restoredTasks);
        setNodes(restoredNodes);
        setEdges(stored?.edges || []);
        setStatus(restoredNodes.length ? `已恢复 ${restoredNodes.length} 个画布节点。` : "空画布。点击“添加节点”，或直接拖拽 / 粘贴图片。");
        setTasks(restoredTasks);
        const nextKnowledge = resolveProjectKnowledge(stored);
        setProjectKnowledge(nextKnowledge);
        setProjectAssets(resolveProjectAssets(stored, nextKnowledge));
        setProjectAssetText(resolveProjectAssetText(stored, nextKnowledge));
        setProjectProfile(resolveProjectProfile(stored, nextKnowledge));
        setTextProtectionMode(stored?.textProtectionMode ?? true);
        restoreCanvasViewport(restoredNodes, stored?.viewport);
      })
      .finally(() => {
        projectLoadedRef.current = true;
        setProjectBootReady(true);
        setProjectSaveState("saved");
      });
  }, [setEdges, setNodes, setViewport]);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (homeOpen) return;
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const hasImageFile = hasClipboardImageFile(event.clipboardData);
      if (isTyping && !hasImageFile) return;
      if (!hasImageFile && !hasClipboardImageCandidate(event.clipboardData)) {
        if (!isTyping) setStatus("未检测到图片。");
        return;
      }
      event.preventDefault();
      void getImageFileFromClipboard(event.clipboardData)
        .then((file) => {
          if (!file) {
            setStatus("未检测到图片。");
            return;
          }
          void createImageNodeFromFile(file, getViewportCenter(), "paste");
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "读取剪贴板图片失败。");
        });
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [homeOpen, screenToFlowPosition]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping || (event.key !== "Backspace" && event.key !== "Delete")) return;
      if (selectedNodeId) {
        event.preventDefault();
        deleteNode(selectedNodeId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveProject();
    }, 1800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [edges, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, tasks, textProtectionMode]);

  useEffect(() => {
    function saveBeforeLeaving() {
      if (!projectLoadedRef.current) return;
      const stablePayload = stripProjectRuntimeState(currentProjectPayload());
      const text = stringifyProjectPayload(stablePayload);
      setLastProjectJsonBytes(text.length);
      writeProjectLocalCache(projectStorageKey, text);
      writeProjectTaskCache(projectId, tasks);
    }

    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveBeforeLeaving);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveBeforeLeaving);
    }
  }, [edges, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, tasks, textProtectionMode]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      const stablePayload = stripProjectRuntimeState(currentProjectPayload());
      const text = stringifyProjectPayload(stablePayload);
      setLastProjectJsonBytes(text.length);
      writeProjectLocalCache(projectStorageKey, text);
      writeProjectTaskCache(projectId, tasks);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [projectId, tasks]);

  useEffect(() => {
    if (!pendingRunNodeId) return;
    const node = nodes.find((item) => item.id === pendingRunNodeId);
    if (!node) return;
    if (node.data.kind !== "text_to_image" && !edges.some((edge) => edge.target === pendingRunNodeId)) return;

    const nodeId = pendingRunNodeId;
    const timer = window.setTimeout(() => {
      setPendingRunNodeId(null);
      void runNode(nodeId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [edges, nodes, pendingRunNodeId]);

  useEffect(() => {
    if (!pendingRunNodeIds.length) return;
    const [nodeId, ...rest] = pendingRunNodeIds;
    const node = nodes.find((item) => item.id === nodeId);
    const timer = window.setTimeout(() => {
      setPendingRunNodeIds(rest);
      if (!node) return;
      if (node.data.kind !== "text_to_image" && !edges.some((edge) => edge.target === nodeId)) {
        setPendingRunNodeIds((current) => (current[0] === nodeId ? [nodeId, ...rest] : current));
        return;
      }
      void runNode(nodeId);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [edges, nodes, pendingRunNodeIds]);

  function updateNodeParam(nodeId: string, key: string, value: unknown) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                params: {
                  ...node.data.params,
                  [key]: value,
                },
              },
            }
          : node,
      ),
    );
  }

  async function attachFileToImageNode(nodeId: string, file: File) {
    const image = await createProjectImageAsset(file);
    if (!image) return;

    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                title: file.name || "图片输入",
                image,
                output: image,
                outputs: [image],
                status: "completed",
              },
            }
          : node,
      ),
    );
    setStatus(`已载入图片：${image.outputSize?.width || image.width || 1}×${image.outputSize?.height || image.height || 1}`);
  }

  async function createProjectImageAsset(file: File, source: "upload" | "asset" = "upload", assetKind?: ProjectAssetUploadKind) {
    if (!isSupportedImageFile(file)) {
      setStatus("图片格式不支持，请使用 PNG、JPG 或 WebP。");
      return null;
    }
    if (file.size > 50 * 1024 * 1024) {
      setStatus("图片文件过大，请上传小于 50MB 的图片。");
      return null;
    }

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("source", source);
      if (assetKind) formData.append("materialType", projectAssetUploadLabel(assetKind));
      const response = await fetch("/api/image-resource", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { image?: ImageAsset; error?: string };
      if (!response.ok || !data.image) {
        throw new Error(data.error || `图片资源保存失败（HTTP ${response.status}）。`);
      }
      return {
        ...data.image,
        file,
        source,
        materialType: assetKind ? projectAssetUploadLabel(assetKind) : data.image.materialType,
      } satisfies ImageAsset;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片资源保存失败。");
      return null;
    }
  }

  async function createProjectImageAssetFromDataUrl(dataUrl: string, fileName: string, source: "upload" | "asset" | "generated" = "generated", assetKind?: ProjectAssetUploadKind) {
    const file = await dataUrlToFile(dataUrl);
    return createProjectImageAsset(new File([file], fileName, { type: file.type || "image/png", lastModified: Date.now() }), source === "generated" ? "upload" : source, assetKind);
  }

  async function saveMaskDataUrl(maskDataUrl: string) {
    const mask = await createProjectImageAssetFromDataUrl(maskDataUrl, `mask-${Date.now()}.png`, "generated");
    if (!mask?.url) throw new Error("蒙版资源保存失败，请重新涂抹后再试。");
    return mask;
  }

  async function ensureProjectPayloadResources<T extends ProjectPayload & { setActive?: boolean }>(payload: T): Promise<T> {
    const imageMap = new Map<string, ImageAsset>();
    const normalizeImage = async (image: ImageAsset | null | undefined) => {
      if (!image) return image;
      const key = imageKey(image);
      if (imageMap.has(key)) return imageMap.get(key);
      const saved = await ensureImageAssetResource(image);
      imageMap.set(key, saved);
      return saved;
    };

    const assets = await Promise.all((payload.assets || []).map((asset) => normalizeImage(asset) as Promise<ImageAsset>));
    const assetByOldUrl = new Map<string, ImageAsset>();
    (payload.assets || []).forEach((asset, index) => {
      if (asset.url?.startsWith("data:image/") && assets[index]) assetByOldUrl.set(asset.url, assets[index]);
    });
    const nodes = await Promise.all(
      (payload.nodes || []).map(async (node) => {
        const image = await normalizeImage(node.data.image as ImageAsset | undefined);
        const output = await normalizeImage(node.data.output as ImageAsset | null | undefined);
        const outputs = await Promise.all((Array.isArray(node.data.outputs) ? node.data.outputs : []).map((item) => normalizeImage(item as ImageAsset) as Promise<ImageAsset>));
        const params = await ensureNodeParamResources(node.data.params || {});
        return {
          ...node,
          data: {
            ...node.data,
            params,
            image: image || undefined,
            output: output || null,
            outputs,
          },
        };
      }),
    );

    return {
      ...payload,
      assets,
      nodes,
      knowledge: rewriteKnowledgeImageResources(payload.knowledge, assetByOldUrl),
    };
  }

  async function ensureImageAssetResource(image: ImageAsset): Promise<ImageAsset> {
    if (!image.url?.startsWith("data:image/")) return stripImageFile(image);
    const saved = await createProjectImageAssetFromDataUrl(image.url, image.fileName || `${image.id || "image"}.png`, image.source === "asset" ? "asset" : "generated");
    if (!saved) {
      throw new Error(`项目保存失败：图片「${image.fileName || image.id || "未命名"}」仍是临时 base64，无法稳定保存。请重新上传该图片。`);
    }
    return stripImageFile({
      ...image,
      ...saved,
      id: image.id || saved.id,
      prompt: image.prompt || saved.prompt,
      variant: image.variant ?? saved.variant,
      mode: image.mode || saved.mode,
      source: image.source || saved.source,
      materialType: image.materialType || saved.materialType,
    });
  }

  async function ensureNodeParamResources(params: Record<string, unknown>) {
    const maskDataUrl = stringParam(params.maskDataUrl);
    if (!maskDataUrl.startsWith("data:image/")) return params;
    const mask = await saveMaskDataUrl(maskDataUrl);
    return {
      ...params,
      maskDataUrl: "",
      maskImageUrl: mask.url,
      maskImageFileName: mask.fileName,
    };
  }

  function rewriteKnowledgeImageResources(knowledge: ProjectKnowledgeBase | undefined, assetByOldUrl: Map<string, ImageAsset>) {
    if (!knowledge) return knowledge;
    return {
      ...knowledge,
      materialLibrary: {
        ...knowledge.materialLibrary,
        items: knowledge.materialLibrary.items.map((item) => {
          const urlAsset = item.url?.startsWith("data:image/") ? assetByOldUrl.get(item.url) : undefined;
          const sourceUrlAsset = item.sourceUrl?.startsWith("data:image/") ? assetByOldUrl.get(item.sourceUrl) : undefined;
          return {
            ...item,
            url: urlAsset?.url || item.url,
            sourceUrl: sourceUrlAsset?.url || item.sourceUrl,
            fileName: urlAsset?.fileName || sourceUrlAsset?.fileName || item.fileName,
            width: urlAsset?.width || urlAsset?.outputSize?.width || item.width,
            height: urlAsset?.height || urlAsset?.outputSize?.height || item.height,
          };
        }),
      },
    };
  }

  async function createImageNodeFromFile(file: File, position: XYPosition, source: "upload" | "paste") {
    const node = addNode("image_input", position, undefined, false);
    await attachFileToImageNode(node.id, file);
    setSelectedNodeId(node.id);
    setStatus(source === "paste" ? "已从剪贴板创建图片节点。" : "已从拖拽创建图片节点。");
    return node;
  }

  async function addComposerImage(file: File) {
    await createImageNodeFromFile(file, getViewportCenter(), "upload");
  }

  async function handleCreativeStartFromIdea(promptOverride?: string) {
    if (creativeStartBusy) return;
    const prompt = (promptOverride || composerPrompt).trim();
    if (!prompt) {
      setStatus("先输入一句想法，例如：做一张胃肠镜广告。");
      document.querySelector<HTMLTextAreaElement>("[data-composer-input='true']")?.focus();
      return;
    }
    setCreativeStartBusy(true);
    setStatus("正在补全需求，先生成临时项目理解。");
    try {
      const brief = await requestCreativeBrief({
        mode: "idea",
        userPrompt: prompt,
        projectContext: buildCreativeProjectContext(standaloneCreativeProjectKind()),
      });
      await ensureTemporaryProject(brief);
      createCreativeDirectionNodes(brief);
      setComposerPrompt("");
      setStatus(modelInfo.hasKey && !brief.missingMaterials.length ? "已补全需求，正在生成 A/B 两个灵感方向。" : "已补全需求，创建临时项目和 A/B 两个灵感方向。");
    } finally {
      setCreativeStartBusy(false);
    }
  }

  async function requestCreativeBrief(input: CreativeBriefInput) {
    const fallback = buildCreativeBriefFallback(input);
    try {
      const response = await fetch("/api/creative-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("创作预检接口失败。");
      const data = (await response.json()) as { brief?: CreativeBrief };
      return data.brief || fallback;
    } catch {
      return fallback;
    }
  }

  function buildCreativeProjectContext(kind: ProjectKind = projectKind): CreativeBriefInput["projectContext"] {
    return {
      projectId,
      projectName,
      projectKind: kind,
      assetText: projectContextText,
      assetCount: projectAssets.length,
      assetNames: projectAssets.map((asset) => asset.fileName || asset.materialType || asset.mode || asset.id).filter(Boolean).slice(0, 12),
      publicStyleNames: publicStyleLibraries
        .filter((library) => projectKnowledge.selection.activePublicStyleLibraryIds.includes(library.id))
        .map((library) => library.name),
      profile: {
        organizationName: projectProfile.organizationName,
        brandColors: projectProfileColors(projectProfile).join("\n"),
        logoName: projectProfile.logoName,
        phone: projectProfile.phone,
        address: projectProfile.address,
        qrCodeNote: projectProfile.qrCodeNote,
        commonCopy: projectProfile.commonCopy,
        forbiddenContent: projectProfile.forbiddenContent,
        styleNotes: projectProfile.styleNotes,
      },
    };
  }

  function hasMaterialLibraryContent() {
    const profileSignals = [
      projectProfile.brandColors,
      projectProfile.logoName,
      projectProfile.phone,
      projectProfile.address,
      projectProfile.qrCodeNote,
      projectProfile.commonCopy,
      projectProfile.styleNotes,
    ].filter((value) => value.trim()).length;
    const meaningfulAssetText = projectAssetText.trim() && !/^待联网补全/.test(projectAssetText.trim());
    return Boolean(projectAssets.length || projectKnowledge.materialLibrary.items.length || profileSignals >= 2 || meaningfulAssetText);
  }

  function standaloneCreativeProjectKind(): ProjectKind {
    return projectKind === "formal" && hasMaterialLibraryContent() ? "formal" : "scratch";
  }

  async function ensureTemporaryProject(brief: CreativeBrief, extraAssets: ImageAsset[] = []) {
    if (projectKind === "formal" && hasMaterialLibraryContent()) {
      if (extraAssets.length) setProjectAssets((current) => mergeImages(extraAssets.map((asset) => ({ ...asset, source: "asset" as const })), current));
      return;
    }
    const temporaryName = brief.temporaryProjectName || `临时项目：${brief.title || "创意"}灵感`;
    const nextId = projectKind === "temporary" ? projectId : `temp_${Date.now()}`;
    const now = new Date().toISOString();
    const baseKnowledge = createDefaultProjectKnowledge({ projectId: nextId, projectName: temporaryName });
    const nextAssets = mergeImages(extraAssets.map((asset) => ({ ...asset, source: "asset" as const })), projectKind === "temporary" ? projectAssets : []);
    const nextAssetText = [
      projectKind === "temporary" ? projectAssetText : "",
      brief.promptContext,
      brief.missingMaterialsWarning || "",
    ].filter(Boolean).join("\n\n");
    const nextKnowledge = normalizeProjectKnowledge(
      {
        ...baseKnowledge,
        archive: {
          ...baseKnowledge.archive,
          projectName: temporaryName,
          notes: nextAssetText,
          updatedAt: now,
        },
        materialLibrary: {
          ...baseKnowledge.materialLibrary,
          items: mergeProjectAssetRecords(
            baseKnowledge.materialLibrary.items,
            nextAssets.map((asset) => imageAssetToProjectAssetRecord(asset, baseKnowledge.materialLibrary.id, nextId)),
          ),
          updatedAt: now,
        },
      },
      { projectId: nextId, projectName: temporaryName },
    );
    setProjectId(nextId);
    setProjectName(temporaryName);
    setProjectKind("temporary");
    setProjectAssets(nextAssets);
    setProjectAssetText(nextAssetText);
    setProjectKnowledge(nextKnowledge);
    setProjectProfile((current) => normalizeProjectProfile({ ...current, styleNotes: current.styleNotes || "临时项目理解，待补充正式品牌素材。" }));
  }

  function convertTemporaryProject() {
    if (projectKind !== "temporary") return;
    const nextName = projectName.replace(/^临时项目：/, "").replace(/灵感$/, "") || projectName;
    setProjectKind("formal");
    setProjectName(nextName);
    setProjectKnowledge((current) => ({
      ...current,
      archive: {
        ...current.archive,
        projectName: nextName,
        notes: [current.archive.notes, "已由临时项目转为正式项目。请继续补充 Logo、电话、地址、品牌色、真实照片和以往物料。"].filter(Boolean).join("\n\n"),
        updatedAt: new Date().toISOString(),
      },
      materialLibrary: {
        ...current.materialLibrary,
        name: `${nextName}素材库`,
        updatedAt: new Date().toISOString(),
      },
    }));
    setStatus("已转为正式项目。后续补充素材后，可继续用素材库重新生成更准确版本。");
  }

  function createCreativeDirectionNodes(brief: CreativeBrief) {
    const start = getViewportCenter();
    const textRatio = composerRatio === "auto" ? resolveAdaptiveRatioFromPrompt(`${brief.title}\n${brief.promptContext}`) : composerRatio;
    const created = brief.directions.slice(0, 2).map((direction, index) => {
      const node = addNode("text_to_image", { x: start.x + index * 360 - 180, y: start.y + index * 36 }, undefined, index === 0, {
        prompt: creativeDirectionPrompt(brief, direction),
        model: effectiveImageModel,
        aspectRatio: textRatio,
        quality: composerQuality,
        creativeBrief: brief,
      });
      if (!modelInfo.hasKey) {
        createManualTask({
          nodeId: node.id,
          nodeName: direction.title,
          type: "创作预检 / 待生成",
          model: effectiveImageModel,
          prompt: direction.prompt,
          deferred: true,
        });
      }
      return node;
    });
    setSelectedNodeId(created[0]?.id || null);
    setRightPanelOpen(true);
    if (modelInfo.hasKey && !brief.missingMaterials.length) {
      setPendingRunNodeIds(created.map((node) => node.id));
    } else {
      setStatus(brief.missingMaterials.length ? "已创建 A/B 两个方向。补充品牌素材后再运行会更准确。" : "已创建 A/B 两个方向。配置 API Key 后可在任务中心运行。");
    }
  }

  function creativeDirectionPrompt(brief: CreativeBrief, direction: CreativeDirection) {
    return [
      brief.promptContext,
      `本次执行：${direction.title}`,
      `方向策略：${direction.strategy}`,
      direction.prompt,
      direction.caveats.length ? `注意：${direction.caveats.join("；")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function openRightPanelTab(tab: RightPanelTab) {
    setRightPanelOpen(true);
    setRightPanelTabHint(tab);
    setRightPanelTabTick((value) => value + 1);
  }

  function focusNodeParams(nodeId: string) {
    setSelectedNodeId(nodeId);
    openRightPanelTab("params");
  }

  async function uploadProjectAssets(files: FileList, assetKind: ProjectAssetUploadKind) {
    const incoming = Array.from(files || []);
    const assets: ImageAsset[] = [];
    for (const file of incoming) {
      const asset = await createProjectImageAsset(file, "asset", assetKind);
      if (asset) assets.push(asset);
    }
    if (assets.length) {
      setProjectAssets((current) => mergeImages(assets, current));
      setStatus(`已上传 ${assets.length} 个${projectAssetUploadLabel(assetKind)}。`);
    }
  }

  function addNode(
    type: NodeKind,
    position = getViewportCenter(),
    image?: ImageAsset,
    select = true,
    paramsOverride: Record<string, unknown> = {},
  ): FlowNode {
    const id = `node_${type}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const catalog = nodeCatalog.find((item) => item.type === type);
    const node: FlowNode = {
      id,
      type,
      position,
      data: {
        title: image?.fileName || catalog?.label || "节点",
        subtitle: catalog?.description,
        kind: type,
        params: {
          ...defaultParamsByKind[type],
          model: defaultParamsByKind[type].model || effectiveImageModel,
          ...paramsOverride,
        },
        image,
        output: image ?? null,
        outputs: image ? [image] : [],
        status: image ? "completed" : "idle",
      },
    };
    setNodes((current) => [...current, node]);
    if (select) setSelectedNodeId(id);
    setNodeMenuOpen(false);
    setMenu(null);
    return node;
  }

  function deleteNode(nodeId: string) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setTasks((current) => current.filter((task) => task.nodeId !== nodeId));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    setMenu(null);
    setStatus("节点已删除，已生成结果仍会保留。");
  }

  function clearCanvas() {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setMenu(null);
    setStatus("画布已清空，结果库图片不会删除。");
  }

  function organizeCanvas() {
    if (!nodes.length) return;
    const arrangedNodes = arrangeWorkflowNodes(nodes, edges);
    setNodes(arrangedNodes);
    setStatus("已整理画布：输入在左，操作在中，结果在右。");
    focusCanvasOnNodes(arrangedNodes.map((node) => node.id));
  }

  function nextStandaloneNodePosition() {
    const center = getViewportCenter();
    if (!nodes.length) return center;
    const connectedTargets = new Set(edges.map((edge) => edge.target));
    const roots = nodes.filter((node) => !connectedTargets.has(node.id));
    const laneNodes = roots.length ? roots : nodes;
    const leftX = Math.min(...nodes.map((node) => node.position.x));
    const bottomY = Math.max(...laneNodes.map((node) => node.position.y + estimateWorkflowNodeHeight(node)));
    return avoidNodeOverlap({
      x: Number.isFinite(leftX) ? leftX : center.x,
      y: Number.isFinite(bottomY) ? bottomY + 78 : center.y,
    });
  }

  function scheduleEdgeDelete(edgeId: string) {
    if (edgeDeleteTimerRef.current) window.clearTimeout(edgeDeleteTimerRef.current);
    setEdges((current) =>
      current.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              animated: true,
              className: "workflow-edge edge-deleting",
              style: { ...(edge.style || {}), stroke: "rgba(255,107,95,0.95)", strokeWidth: 2.4 },
            }
          : edge,
      ),
    );
    setStatus("连线已选中，1 秒后自动删除。");
    edgeDeleteTimerRef.current = window.setTimeout(() => {
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      setStatus("连线已删除。");
      edgeDeleteTimerRef.current = null;
    }, 1000);
  }

  function submitComposer() {
    const selectedPromptNode = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? selectedNode : null;
    const prompt = composerPrompt.trim();

    if (selectedPromptNode) {
      const kind = selectedPromptNode.data.kind;
      const hasLinkedImage = Boolean(resolveInputImage(selectedPromptNode.id, "image"));
      const currentNodePrompt = stringParam(selectedPromptNode.data.params.prompt).trim();
      const fallbackDefaultPrompt = stringParam(defaultParamsByKind[kind]?.prompt).trim();
      const nextPrompt = prompt || currentNodePrompt || fallbackDefaultPrompt;

      if (kind === "text_to_image" && !nextPrompt) {
        setStatus("文生图先写提示词，再运行。");
        return;
      }
      if ((kind === "image_to_image" || kind === "resize" || kind === "remove_background" || kind === "outpaint" || kind === "mask_edit" || kind === "hd_redraw") && !hasLinkedImage) {
        setStatus(kind === "resize" ? "改比例节点要先连接一张图片，再选择目标比例和尺寸。" : kind === "remove_background" ? "透明抠图节点要先连接一张图片。" : "图生图类节点要先连接一张图片，再说你想怎么改。");
        return;
      }

      if (prompt) updateNodeParam(selectedPromptNode.id, "prompt", prompt);
      if (kind === "text_to_image") {
        updateNodeParam(selectedPromptNode.id, "aspectRatio", composerRatio);
        updateNodeParam(selectedPromptNode.id, "quality", composerQuality);
      }
      if (composerModel && isComposerDrivenNode(kind)) updateNodeParam(selectedPromptNode.id, "model", composerModel);
      setPendingRunNodeId(selectedPromptNode.id);
      setComposerPrompt("");
      setStatus(composerSubmitStatus(selectedPromptNode, prompt));
      return;
    }

    if (!prompt) {
      setStatus("先输入你的设计需求。");
      return;
    }

    void handleCreativeStartFromIdea(prompt);
    return;
  }

  function addQuickNode(sourceNodeId: string, type: NodeKind, targetHandle: string, paramsOverride: Record<string, unknown> = {}) {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) return;
    const sourceImage = (source.data.output || source.data.image || null) as ImageAsset | null;
    const transparentDefaults = type === "remove_background" && sourceImage ? transparentNodeDefaults(sourceImage) : {};
    const next = addNode(type, nextTreeChildPosition(source), undefined, true, {
      ...transparentDefaults,
      ...paramsOverride,
    });
    setEdges((current) => [
      ...current,
      {
        id: `edge_${sourceNodeId}_${next.id}`,
        source: sourceNodeId,
        sourceHandle: "image",
        target: next.id,
        targetHandle,
        animated: true,
        className: "workflow-edge",
      },
    ]);
    focusNodeParams(next.id);
    setMenu(null);
    setStatus(nodeCreationHint(type, true));
  }

  function nextTreeChildPosition(source: FlowNode, options: { xGap?: number; yOffset?: number } = {}) {
    const branchIndex = edges.filter((edge) => edge.source === source.id).length;
    const x = source.position.x + (options.xGap || nodeAutoSpacingX(source));
    const y = source.position.y + (options.yOffset ?? 12) + branchIndex * treeBranchVerticalGap;
    return avoidNodeOverlap({ x, y });
  }

  function avoidNodeOverlap(position: XYPosition) {
    let next = { ...position };
    for (let attempts = 0; attempts < 12; attempts += 1) {
      const collides = nodes.some((node) =>
        Math.abs(node.position.x - next.x) < 260 && Math.abs(node.position.y - next.y) < 250,
      );
      if (!collides) return next;
      next = { ...next, y: next.y + treeBranchVerticalGap };
    }
    return next;
  }

  function addComposerImageAsReference(file: File) {
    const selectedTextNode = selectedNode?.data.kind === "text_to_image" ? selectedNode : null;
    if (!selectedTextNode) {
      void addComposerImage(file);
      return;
    }
    void createImageNodeFromFile(file, { x: selectedTextNode.position.x - 390, y: selectedTextNode.position.y + 24 }, "upload")
      .then((source) => {
        if (!source) return;
        const referenceCount = edges.filter((edge) => edge.target === selectedTextNode.id && isTextReferenceTargetHandle(edge.targetHandle)).length;
        if (referenceCount >= maxTextReferenceImages) {
          setStatus(`文生图图片参考最多连接 ${maxTextReferenceImages} 张。`);
          return;
        }
        setEdges((current) => [
          ...current,
          {
            id: `edge_${source.id}_${selectedTextNode.id}_${Date.now()}`,
            source: source.id,
            sourceHandle: "image",
            target: selectedTextNode.id,
            targetHandle: textReferenceInputHandle,
            animated: true,
            className: "workflow-edge",
          },
        ]);
        setSelectedNodeId(selectedTextNode.id);
        setStatus(`已把图片连接到文生图图片参考入口（${referenceCount + 1}/${maxTextReferenceImages}）。`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "添加图片参考失败。"));
  }

  async function runNode(nodeId: string): Promise<ImageAsset[]> {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return [];
    if (node.data.kind === "image_input") return node.data.output ? [node.data.output] as ImageAsset[] : [];
    const canRunLocally = (node.data.kind === "upscale_4k" && stringParam(node.data.params.fitMode) !== "ai_redraw") ||
      (node.data.kind === "remove_background" && transparentCutoutModeParam(node.data.params.cutoutMode) !== "ai_regenerate");
    if (!modelInfo.hasKey && node.data.kind !== "output" && !canRunLocally) {
      markNodeFailed(nodeId, "请先配置 OpenAI API Key。");
      return [];
    }

    const taskId = createTask(node);
    startTaskProgress(taskId);
    setNodeStatus(nodeId, "running");
    updateTask(taskId, {
      status: "running",
      stage: "preparing",
      progress: 12,
      progressLabel: taskStageLabel(node.data.kind, "preparing"),
    });

    try {
      const requestStartedAt = Date.now();
      updateTask(taskId, {
        requestStartedAt,
        stage: "generating",
        progress: 22,
        progressLabel: taskStageLabel(node.data.kind, "generating"),
      });
      const resultImages = await withClientTimeout(
        executeNode(node),
        imageTaskTimeoutMs,
        "任务响应超时，已等待约 10 分钟，可能是模型或代理接口没有返回。请重试，或换一个更快的图片模型。",
      );
      if (cancelledTaskIdsRef.current.has(taskId)) {
        throw new Error("已手动停止。");
      }
      const saveStartedAt = Date.now();
      updateTask(taskId, {
        status: "saving",
        stage: "saving",
        saveStartedAt,
        modelDurationMs: saveStartedAt - requestStartedAt,
        progress: 92,
        progressLabel: taskStageLabel(node.data.kind, "saving"),
      });
      const sourceImage = (node.data.image || resolveInputImage(node.id, "image")) || null;
      const strategyMeta = strategyMetaFromParams(node.data.params);
      const outputs = resultImages.map((image) => ({
        ...image,
        source: "generated" as const,
        projectId,
        sourceTaskId: taskId,
        nodeOperation: image.nodeOperation || node.data.kind,
        ...createResultLineage(sourceImage, taskId, image.variant || 1),
        ...strategyMeta,
      }));
      let resultNodeIds: string[] = [];
      if (outputs.length) {
        const blockedOutput = outputs.find((item) => isQualityGateBlocked(item));
        const qualityBlocked = Boolean(blockedOutput);
        const qualityMessage = blockedOutput?.qualityCheck?.issues?.[0] || blockedOutput?.qualityCheck?.label || "质检未通过";
        if (sourceImage) {
          const nextIds = outputs.map((item) => item.id || item.fileName || item.url).filter(Boolean);
          appendNextImageIds(sourceImage, nextIds);
        }
        if (node.data.kind === "layer_output") {
          await saveLayerOutputsToProjectAssets(outputs);
        }
        await persistGeneratedMetadata(outputs);
        setHistoryImages((current) => mergeImages(outputs, current));
        setNodes((current) =>
          current.map((item) =>
            item.id === nodeId
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    output: outputs[0],
                    outputs,
                    resultCount: outputs.length,
                    status: qualityBlocked ? "failed" : "completed",
                    error: qualityBlocked ? qualityMessage : "",
                  },
                }
              : item,
          ),
        );
        resultNodeIds = addOutputImageNodes(node, outputs);
        focusCanvasOnNodes([node.id, ...resultNodeIds]);
      } else {
        setNodeStatus(nodeId, "completed");
      }
      stopTaskProgress(taskId);
      cancelledTaskIdsRef.current.delete(taskId);
      const blockedOutput = outputs.find((item) => isQualityGateBlocked(item));
      const qualityBlocked = Boolean(blockedOutput);
      const qualityMessage = blockedOutput?.qualityCheck?.issues?.[0] || blockedOutput?.qualityCheck?.label || "质检未通过";
      const endedAt = Date.now();
      updateTask(taskId, {
        status: qualityBlocked ? "failed" : "completed",
        stage: qualityBlocked ? "failed" : "completed",
        endedAt,
        result: outputs[0],
        outputs,
        resultCount: outputs.length,
        resultNodeIds,
        saveDurationMs: endedAt - saveStartedAt,
        progress: 100,
        progressLabel: qualityBlocked ? `质检未通过：${blockedOutput ? qualityBadgeLabel(blockedOutput) : "请处理后再交付"}` : completedTaskLabel(outputs.length, outputs[0]),
        error: qualityBlocked ? qualityMessage : undefined,
      });
      setStatus(
        qualityBlocked
          ? `${node.data.title} 完成，但质检未通过：${blockedOutput ? qualityBadgeLabel(blockedOutput) : "请检查尺寸和白边"}。画布右侧已生成 ${outputs.length} 个结果节点。`
          : `${node.data.title} 完成：${outputs.length} 张，耗时 ${formatDuration(endedAt - requestStartedAt)}。画布右侧已生成结果节点。`,
      );
      return outputs;
    } catch (error) {
      const message = error instanceof Error ? error.message : "节点运行失败。";
      stopTaskProgress(taskId);
      cancelledTaskIdsRef.current.delete(taskId);
      const friendlyMessage = friendlyDisplayError(message);
      markNodeFailed(nodeId, friendlyMessage);
      updateTask(taskId, { status: "failed", stage: "failed", endedAt: Date.now(), error: friendlyMessage, progress: 100, progressLabel: taskFailureHint(friendlyMessage) });
      setStatus(friendlyMessage);
      return [];
    }
  }

  async function executeNode(node: FlowNode): Promise<ImageAsset[]> {
    const kind = node.data.kind;
    if (kind === "text_to_image") return executeTextToImage(node);
    if (kind === "image_to_image") return executeImageToImage(node, "image");
    if (kind === "fuse_images") return executeFuseImages(node);
    if (kind === "outpaint") return executeImageToImage(node, "image", "AI扩图");
    if (kind === "resize") return executeResize(node, false);
    if (kind === "remove_background") return executeRemoveBackground(node);
    if (kind === "layer_output") return executeLayerOutput(node);
    if (kind === "mask_edit") return executeMaskEdit(node);
    if (kind === "hd_redraw") return executeRedraw(node);
    if (kind === "upscale_4k") return executeResize(node, true);
    if (kind === "output") return executeOutput(node);
    if (kind === "replace_product") throw new Error("产品替换已在第一版冻结。请改用 AI合成或局部涂抹完成当前修改。");
    return [];
  }

  function buildProductionProtectionContext(operation: string, sourceImages: ImageAsset[] = [], node?: FlowNode) {
    const context = buildProfileProtectionContext(projectProfile, {
      projectId,
      operation,
      sourceImages,
      brandAssets: getCurrentProjectBrandAssets(projectAssets, projectKnowledge),
    });
    const creativeBrief = node?.data.params?.creativeBrief as CreativeBrief | undefined;
    if (!creativeBrief) return context;
    return {
      ...context,
      brandProfile: {
        ...context.brandProfile,
        rules: [
          ...(context.brandProfile?.rules || []),
          creativeBrief.noInventPolicy,
          creativeBrief.missingMaterialsWarning || "",
          `素材优先级：${creativeBrief.materialPriority.join(" > ")}`,
        ].filter(Boolean),
      },
    };
  }

  function buildNodeProjectConstraintText(node: FlowNode, visibleRequestText: string) {
    return buildProjectConstraintText(
      projectContextText,
      projectProfile,
      textProtectionMode,
      resolveLegacyTaskContextForNode(node),
      visibleRequestText,
      getCurrentProjectBrandAssets(projectAssets, projectKnowledge),
    );
  }

  function buildCreativeImageToImageConstraintText(node: FlowNode, visibleRequestText: string) {
    const notes = buildNodeProjectConstraintText(node, visibleRequestText);
    const cleaned = notes
      .split("\n")
      .filter((line) => !isConservativeImageToImageNote(line))
      .join("\n");
    return [
      cleaned,
      "图生图创意改版：项目资料只用于保护品牌识别、核心文案含义、真实联系方式、Logo 和主体识别度；允许重新设计标题位置、主体位置、卖点层级、背景光效、装饰元素和信息区布局。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildTextToImageConstraintText(node: FlowNode, visibleRequestText: string, references: TextReferenceImage[]) {
    const base = buildNodeProjectConstraintText(node, visibleRequestText);
    if (!references.length) return base;
    const strongReferenceMode = shouldUseStrongTextReferenceMode(visibleRequestText);
    return [
      base,
      `带图片参考的文生图：以文字需求为主，连接到“图片参考”入口的图片作为素材参考参与生成；最多读取 ${maxTextReferenceImages} 张。`,
      strongReferenceMode
        ? "用户要求 1:1 / 复刻 / 保持版式配色时：第 1 张图片作为主参考，锁定版式骨架、配色比例、信息区位置和视觉重心；其余图片只按角色补充素材。"
        : "这不是图生图，不要以某一张参考图为底稿复刻；删除或未连接的图片不得继续出现在生成结果里。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildAiCompositeConstraintText(node: FlowNode, visibleRequestText: string) {
    return [
      buildNodeProjectConstraintText(node, visibleRequestText),
      "AI合成素材规则：图1是主体来源，图2是场景来源；不要把两张图平均融合、半透明叠加或左右拼接。",
      "合成时优先处理主体大小、位置、透视、接触阴影、遮挡层次、光影方向、色温、边缘羽化和画面颗粒，让主体像真实处在图2场景里。",
      "默认输出两个方案：方案A真实自然合成，方案B广告设计合成。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function resolveLegacyTaskContextForNode(node: FlowNode) {
    const meta = strategyMetaFromParams(node.data.params);
    if (!meta.strategyPackageId && !meta.materialType && !meta.targetSize && !meta.materialCopy && !meta.materialScene) {
      return "";
    }
    return [
      meta.sourceStrategyTitle ? `当前任务来源：${meta.sourceStrategyTitle}` : "",
      meta.materialType ? `当前物料：${meta.materialType}` : "",
      meta.targetSize ? `目标尺寸：${meta.targetSize}` : "",
      meta.materialScene ? `投放场景：${meta.materialScene}` : "",
      meta.materialCopy ? `当前物料文案：${meta.materialCopy}` : "",
      "以上为旧任务自带上下文，只用于兼容既有节点；不要切换到其他项目素材。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function appendProtectionContext(formData: FormData, operation: string, sourceImages: ImageAsset[] = [], node?: FlowNode) {
    formData.append("protectionContext", JSON.stringify(buildProductionProtectionContext(operation, sourceImages, node)));
  }

  async function appendBrandReferenceAssets(formData: FormData) {
    const assets = getCurrentProjectBrandAssets(projectAssets, projectKnowledge);
    const refs = resolveBrandReferenceAssets(projectProfile, assets);
    for (const [index, asset] of refs.entries()) {
      await appendImageToForm(formData, asset, `brandAsset_${index + 1}`, `brandAssetUrl_${index + 1}`, `brand-asset-${index + 1}.png`);
    }
    if (refs.length) {
      formData.append(
        "brandAssetManifest",
        JSON.stringify(refs.map((asset, index) => ({
          fileKey: `brandAsset_${index + 1}`,
          urlKey: `brandAssetUrl_${index + 1}`,
          label: asset.fileName || asset.materialType || asset.mode || asset.id,
          materialType: asset.materialType,
        }))),
      );
    }
    return refs.length;
  }

  function appendTextToImageCompositionSettings(formData: FormData, params: Record<string, unknown>) {
    formData.append("compositionCompleteness", textToImageCompositionCompleteness(params));
    formData.append("safeMargin", textToImageSafeMargin(params));
    formData.append("cameraDistance", textToImageCameraDistance(params));
    formData.append("subjectScale", textToImageSubjectScale(params));
    formData.append("previewFit", textToImagePreviewFit(params));
  }

  async function executeTextToImage(node: FlowNode) {
    const params = node.data.params;
    const basePrompt = stringParam(params.prompt);
    const references = resolveTextReferenceInputs(node);
    const requestRatio = resolveRequestedAspectRatio(params.aspectRatio, basePrompt);
    const custom = customSize(params);
    const prompt = enrichPrompt(basePrompt, buildTextToImageConstraintText(node, basePrompt, references.manifest));
    if (!prompt) throw new Error("文生图节点需要填写 prompt。");
    const brandReferences = resolveBrandReferenceAssets(projectProfile, getCurrentProjectBrandAssets(projectAssets, projectKnowledge));
    if (brandReferences.length || references.items.length) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("adType", "通用设计");
      formData.append("aspectRatio", requestRatio);
      formData.append("customWidth", String(custom.width || 0));
      formData.append("customHeight", String(custom.height || 0));
      formData.append("exactSize", String(Boolean(custom.width && custom.height)));
      formData.append("quality", qualityParam(params.quality));
      formData.append("model", stringParam(params.model) || effectiveImageModel);
      formData.append("referenceManifest", JSON.stringify(references.manifest));
      appendTextToImageCompositionSettings(formData, params);
      formData.append("protectionContext", JSON.stringify(buildProductionProtectionContext("text_to_image", references.items.map((item) => item.image), node)));
      await appendTextReferenceImages(formData, references.items);
      await appendBrandReferenceAssets(formData);
      const response = await fetch("/api/generate-image", { method: "POST", body: formData });
      return imagesFromResponse(response);
    }
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        adType: "通用设计",
        aspectRatio: requestRatio,
        customWidth: custom.width,
        customHeight: custom.height,
        exactSize: Boolean(custom.width && custom.height),
        quality: qualityParam(params.quality),
        model: stringParam(params.model) || effectiveImageModel,
        referenceImages: references.manifest,
        compositionCompleteness: textToImageCompositionCompleteness(params),
        safeMargin: textToImageSafeMargin(params),
        cameraDistance: textToImageCameraDistance(params),
        subjectScale: textToImageSubjectScale(params),
        previewFit: textToImagePreviewFit(params),
        protectionContext: buildProductionProtectionContext("text_to_image", [], node),
      }),
    });
    return imagesFromResponse(response);
  }

  async function executeImageToImage(node: FlowNode, handle: string, label = "图生图") {
    const image = resolveInputImage(node.id, handle);
    if (!image) throw new Error(`${node.data.title} 需要连接一张图片。`);
    const params = node.data.params;
    const isOutpaint = label.includes("扩图");
    const imageToImagePrompt = sanitizeLegacyImageToImagePrompt(stringParam(params.prompt)) || IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST;
    const requestRatio = isOutpaint ? ratioParam(params.targetRatio) : resolveRequestedAspectRatio(params.aspectRatio, imageToImagePrompt);
    const requestText = isOutpaint ? buildOutpaintPrompt(params) : imageToImagePrompt;
    const prompt = enrichPrompt(
      isOutpaint
        ? buildOutpaintPrompt(params)
        : imageToImagePrompt,
      isOutpaint ? buildNodeProjectConstraintText(node, requestText) : buildCreativeImageToImageConstraintText(node, requestText),
    );
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    formData.append("prompt", prompt);
    formData.append("adType", "通用设计");
    formData.append("aspectRatio", requestRatio);
    formData.append("customWidth", String(customSize(params).width || 0));
    formData.append("customHeight", String(customSize(params).height || 0));
    formData.append("quality", qualityParam(params.quality));
    formData.append("model", stringParam(params.model) || effectiveImageModel);
    formData.append("keepOriginalRatio", isOutpaint ? "false" : String(Boolean(params.keepOriginalRatio)));
    if (isOutpaint) formData.append("direction", stringParam(params.direction) || "四周");
    formData.append("modeLabel", label);
    appendProtectionContext(formData, isOutpaint ? "outpaint" : "image_to_image", [image], node);
    const response = await fetch("/api/edit-image", { method: "POST", body: formData });
    return imagesFromResponse(response);
  }

  async function executeFuseImages(node: FlowNode) {
    const imageA = resolveInputImage(node.id, "imageA");
    const imageB = resolveInputImage(node.id, "imageB");
    if (!imageA || !imageB) throw new Error("AI合成需要连接图1主体和图2场景。");
    const params = node.data.params;
    const formData = new FormData();
    await appendImageToForm(formData, imageA, "imageA", "sourceUrlA", "image-a.png");
    await appendImageToForm(formData, imageB, "imageB", "sourceUrlB", "image-b.png");
    await appendBrandReferenceAssets(formData);
    const requestRatio = resolveRequestedAspectRatio(params.aspectRatio, stringParam(params.prompt));
    const visibleRequest = [
      stringParam(params.prompt) || "把图1主体自然合成到图2场景里。",
      `合成模式：${stringParam(params.fusionMode) || "主体入景"}`,
    ].join("\n");
    formData.append(
      "prompt",
      enrichPrompt(
        visibleRequest,
        buildAiCompositeConstraintText(node, visibleRequest),
      ),
    );
    formData.append("aspectRatio", requestRatio);
    formData.append("customWidth", String(customSize(params).width || 0));
    formData.append("customHeight", String(customSize(params).height || 0));
    formData.append("quality", qualityParam(params.quality));
    formData.append("model", stringParam(params.model) || effectiveImageModel);
    formData.append("keepOriginalRatio", "true");
    appendProtectionContext(formData, "fuse_images", [imageA, imageB], node);
    const response = await fetch("/api/fuse-images", { method: "POST", body: formData });
    return imagesFromResponse(response);
  }

  async function executeResize(node: FlowNode, force4k: boolean) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error(`${node.data.title} 需要连接一张图片。`);
    const params = node.data.params;
    const requestedFitMode = stringParam(params.fitMode) || (force4k ? "keep_ratio" : "smart_relayout");
    const fitMode = !force4k && ["crop", "pad"].includes(requestedFitMode) ? "smart_relayout" : requestedFitMode;
    if (force4k) {
      const target = resolveUpscaleTargetFromParams(image, params);
      if (fitMode === "ai_redraw") {
        const formData = new FormData();
        await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
        await appendBrandReferenceAssets(formData);
        formData.append(
          "prompt",
          enrichPrompt(
            stringParam(params.prompt) || "AI 高清重绘：增强照片、插画或背景细节。注意：可能改变文字、细节或局部构图，带文字设计稿不推荐使用。",
            buildNodeProjectConstraintText(node, stringParam(params.prompt)),
          ),
        );
        formData.append("aspectRatio", "custom");
        formData.append("customWidth", String(target.width));
        formData.append("customHeight", String(target.height));
        formData.append("quality", "standard");
        formData.append("format", "png");
        formData.append("model", stringParam(params.model) || effectiveImageModel);
        formData.append("keepOriginalRatio", "true");
        formData.append("exactSize", "true");
        appendProtectionContext(formData, "hd_redraw", [image], node);
        const response = await fetch("/api/redraw-upscale-image", { method: "POST", body: formData });
        if (!response.ok) throw new Error((await response.json()).error || "AI高清重绘失败。");
        return [imageFromSavedResponse(await response.json(), "AI高清重绘", stringParam(params.prompt) || image.prompt)];
      }

      const response = await requestUpscale(image, {
        aspectRatio: "custom",
        customWidth: target.width,
        customHeight: target.height,
        targetLongEdge: target.longEdge,
        quality: qualityParam(params.quality) === "2k" ? "2k" : "4k",
        format: "png",
        model: "none",
        keepOriginalRatio: true,
        exactSize: false,
        scale: stringParam(params.scale),
      }, node);
      if (!response.ok) throw new Error((await response.json()).error || "4K无损导出失败。");
      return [imageFromSavedResponse(await response.json(), "4K无损导出", image.prompt)];
    }
    const ratio = ratioParam(params.targetRatio);
    const resizeParams = { ...params, fitMode };
    const fallbackSize = stringParam(params.targetSize) || defaultTargetSizeForRatio(ratio);
    const targetSize = customSize(params).width && customSize(params).height ? customSize(params) : parseTargetSize(fallbackSize);
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    formData.append(
      "prompt",
      enrichPrompt(
        buildResizePrompt(resizeParams, ratio),
        buildNodeProjectConstraintText(node, buildResizePrompt(resizeParams, ratio)),
      ),
    );
    formData.append("adType", "通用设计");
    formData.append("aspectRatio", ratio);
    formData.append("customWidth", String(targetSize.width || 0));
    formData.append("customHeight", String(targetSize.height || 0));
    formData.append("quality", qualityParam(params.quality));
    formData.append("model", stringParam(params.model) || effectiveImageModel);
    formData.append("keepOriginalRatio", "false");
    formData.append("modeLabel", "AI改尺寸");
    formData.append("exactSize", "true");
    formData.append("fitMode", fitMode);
    appendProtectionContext(formData, "resize", [image], node);
    const response = await fetch("/api/edit-image", { method: "POST", body: formData });
    return imagesFromResponse(response);
  }

  async function executeRemoveBackground(node: FlowNode) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("透明抠图节点需要连接一张图片。");
    const data = await requestTransparentPng(image, {
      tolerance: Number(node.data.params.tolerance || 34) || 34,
      mode: transparentCutoutModeParam(node.data.params.cutoutMode),
      cutoutType: transparentCutoutTypeParam(node.data.params.cutoutType),
    });
    if (!data.image) throw new Error(data.error || "透明 PNG 处理失败。");
    return [{ ...data.image, source: "generated" as const }];
  }

  async function executeLayerOutput(node: FlowNode) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("分层拆图节点需要先连接一张已生成图片或已上传图片。");
    const includeBackground = node.data.params.includeBackground !== false;
    const includeTextLayer = node.data.params.includeTextLayer !== false;
    if (!includeBackground && !includeTextLayer) throw new Error("请至少选择一个拆分输出：无文字背景或文字透明 PNG。");
    const result = await requestLayerOutput(image, {
      includeBackground,
      includeTextLayer,
    });
    assertLayerOutputComplete(result, { includeBackground, includeTextLayer });
    const outputs = layerOutputResultImages(result);
    if (!outputs.length) {
      throw new Error(result.errors?.background || result.errors?.textLayer || "分层拆图没有返回可用图片。");
    }
    return outputs;
  }

  async function executeMaskEdit(node: FlowNode) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("局部涂抹节点需要连接一张图片。");
    const params = node.data.params;
    const maskDataUrl = stringParam(params.maskDataUrl);
    const maskImageUrl = stringParam(params.maskImageUrl);
    const prompt = enrichPrompt(
      buildMaskEditPrompt(params),
      buildNodeProjectConstraintText(node, stringParam(params.prompt)),
    );
    if (!maskDataUrl && !maskImageUrl) throw new Error("请先打开“涂抹蒙版”并圈出需要修补的区域。");
    if (!stringParam(params.prompt)) throw new Error("请先写局部修补要求，例如：把这里修补成完整体检广告门头。");
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    if (maskImageUrl) formData.append("maskUrl", maskImageUrl);
    else await appendDataUrlToForm(formData, maskDataUrl, "mask", "mask.png");
    formData.append("prompt", prompt);
    formData.append("quality", qualityParam(params.quality));
    formData.append("model", stringParam(params.model) || effectiveImageModel);
    formData.append("customWidth", String(image.outputSize?.width || image.width || 0));
    formData.append("customHeight", String(image.outputSize?.height || image.height || 0));
    formData.append("preserveOutsideMask", String(Boolean(params.preserveOutsideMask ?? true)));
    formData.append("maskFeather", String(Number(params.maskFeather || 12) || 12));
    appendProtectionContext(formData, "mask_edit", [image], node);
    const response = await fetch("/api/mask-edit-image", { method: "POST", body: formData });
    return imagesFromResponse(response);
  }

  async function executeRedraw(node: FlowNode) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("高清重绘节点需要连接一张图片。");
    const params = node.data.params;
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    formData.append(
      "prompt",
      enrichPrompt(
        stringParam(params.prompt),
        buildNodeProjectConstraintText(node, stringParam(params.prompt)),
      ),
    );
    formData.append("aspectRatio", "custom");
    formData.append("customWidth", String(image.outputSize?.width || image.width || 0));
    formData.append("customHeight", String(image.outputSize?.height || image.height || 0));
    formData.append("quality", "standard");
    formData.append("format", "png");
    formData.append("model", stringParam(params.model) || effectiveImageModel);
    formData.append("keepOriginalRatio", "true");
    formData.append("exactSize", "true");
    appendProtectionContext(formData, "hd_redraw", [image], node);
    const response = await fetch("/api/redraw-upscale-image", { method: "POST", body: formData });
    if (!response.ok) throw new Error((await response.json()).error || "高清重绘失败。");
    return [imageFromSavedResponse(await response.json(), "高清重绘", stringParam(params.prompt) || image.prompt)];
  }

  async function executeOutput(node: FlowNode) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("输出节点需要连接一张图片。");
    if (isLocalGeneratedUrl(image.url)) {
      setLightboxImage(image);
      return [image];
    }

    const params = node.data.params;
    const response = await requestUpscale(image, {
      aspectRatio: image.outputSize ? "custom" : "1:1",
      customWidth: image.outputSize?.width || image.width || 1536,
      customHeight: image.outputSize?.height || image.height || 1536,
      quality: "standard",
      format: stringParam(params.format) === "jpg" ? "jpg" : "png",
      model: effectiveImageModel,
      keepOriginalRatio: true,
      exactSize: false,
    }, node);
    return [imageFromSavedResponse(await response.json(), "输出保存", image.prompt)];
  }

  async function requestUpscale(
    image: ImageAsset,
    params: {
      aspectRatio: AspectRatioValue;
      customWidth?: number;
      customHeight?: number;
      quality: QualityValue;
      format: "png" | "jpg";
      model: string;
      keepOriginalRatio: boolean;
      exactSize?: boolean;
      targetLongEdge?: number;
      targetShortEdge?: number;
      scale?: string;
    },
    node?: FlowNode,
  ) {
    const operation = node?.data.kind === "upscale_4k" ? "upscale_4k" : "output";
    if (isLocalGeneratedUrl(image.url)) {
      return fetch("/api/upscale-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: image.url,
          ...params,
          protectionContext: buildProductionProtectionContext(operation, [image], node),
        }),
      });
    }

    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    formData.append("aspectRatio", params.aspectRatio);
    formData.append("customWidth", String(params.customWidth || 0));
    formData.append("customHeight", String(params.customHeight || 0));
    formData.append("quality", params.quality);
    formData.append("format", params.format);
    formData.append("model", params.model);
    formData.append("keepOriginalRatio", String(params.keepOriginalRatio));
    formData.append("exactSize", String(Boolean(params.exactSize)));
    formData.append("targetLongEdge", String(params.targetLongEdge || 0));
    formData.append("targetShortEdge", String(params.targetShortEdge || 0));
    formData.append("scale", params.scale || "");
    appendProtectionContext(formData, operation, [image], node);
    return fetch("/api/upscale-image", { method: "POST", body: formData });
  }

  async function requestTransparentPng(
    image: ImageAsset,
    options: TransparentCutoutOptions = { mode: "real_cutout", cutoutType: "auto", tolerance: 34 },
  ): Promise<TransparentPngResult> {
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", image.fileName || "source.png");
    formData.append("tolerance", String(options.tolerance || 34));
    formData.append("mode", options.mode);
    formData.append("cutoutType", options.cutoutType);
    formData.append("model", effectiveImageModel);
    const response = await fetch("/api/transparent-png", { method: "POST", body: formData });
    const data = (await response.json().catch(() => ({}))) as TransparentPngResult;
    if (!response.ok) {
      throw new Error(data.error || `透明 PNG 处理失败（HTTP ${response.status}）。`);
    }
    if (data.image && !data.alphaCheck?.hasTransparentPixels && !data.image.alphaCheck?.hasTransparentPixels) {
      throw new Error("透明 PNG 验证失败：导出的 PNG 没有检测到 alpha 透明像素。");
    }
    return data;
  }

  async function requestLayerOutput(
    image: ImageAsset,
    options: LayerOutputOptions = { includeBackground: true, includeTextLayer: true },
  ): Promise<LayerOutputResult> {
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", image.fileName || "source.png");
    formData.append("model", effectiveImageModel);
    formData.append("projectId", projectId);
    formData.append("originalImageId", image.id || image.fileName || image.url);
    formData.append("includeBackground", String(options.includeBackground));
    formData.append("includeTextLayer", String(options.includeTextLayer));
    formData.append("maskStrength", options.maskStrength || "normal");
    formData.append("keepGlow", String(options.keepGlow ?? true));
    formData.append("outputCroppedText", String(options.outputCroppedText ?? true));
    const response = await fetch("/api/layer-output", { method: "POST", body: formData });
    const data = (await response.json().catch(() => ({}))) as LayerOutputResult;
    if (!response.ok) {
      throw new Error(data.error || `分层拆图失败（HTTP ${response.status}）。`);
    }
	    return {
	      ...data,
	      images: (data.images || []).map((item) => ({ ...item, source: "generated" as const })),
	      layers: {
	        original: data.layers?.original ? { ...data.layers.original, source: "generated" as const } : null,
	        fullPreview: data.layers?.fullPreview ? { ...data.layers.fullPreview, source: "generated" as const } : null,
	        background: data.layers?.background ? { ...data.layers.background, source: "generated" as const } : null,
	        backgroundNoText: data.layers?.backgroundNoText ? { ...data.layers.backgroundNoText, source: "generated" as const } : null,
	        textLayer: data.layers?.textLayer ? { ...data.layers.textLayer, source: "generated" as const } : null,
	        textFull: data.layers?.textFull ? { ...data.layers.textFull, source: "generated" as const } : null,
	        textRebuilt: data.layers?.textRebuilt ? { ...data.layers.textRebuilt, source: "generated" as const } : null,
	        textCutout: data.layers?.textCutout ? { ...data.layers.textCutout, source: "generated" as const } : null,
	        textCropped: data.layers?.textCropped ? { ...data.layers.textCropped, source: "generated" as const } : null,
	        mask: data.layers?.mask ? { ...data.layers.mask, source: "generated" as const } : null,
	        textAlphaMask: data.layers?.textAlphaMask ? { ...data.layers.textAlphaMask, source: "generated" as const } : null,
	        repairMask: data.layers?.repairMask ? { ...data.layers.repairMask, source: "generated" as const } : null,
	        backgroundFirstPass: data.layers?.backgroundFirstPass ? { ...data.layers.backgroundFirstPass, source: "generated" as const } : null,
	      },
	    };
  }

  function resolveInputImage(nodeId: string, handle: string) {
    const incoming = edges.find((edge) => edge.target === nodeId && edge.targetHandle === handle);
    const fallback = edges.find((edge) => edge.target === nodeId);
    const edge = incoming || fallback;
    const target = nodes.find((node) => node.id === nodeId);
    if (!edge) return (target?.data.image || target?.data.output || null) as ImageAsset | null;
    const source = nodes.find((node) => node.id === edge.source);
    return (source?.data.output || source?.data.image || target?.data.image || target?.data.output || null) as ImageAsset | null;
  }

  function resolveTextReferenceInputs(node: FlowNode) {
    const configs = normalizeTextReferenceConfigs(node.data.params.referenceConfigs);
    const items = textReferenceEdgesForNode(node.id).map((edge, index): ResolvedTextReference | null => {
      const source = nodes.find((item) => item.id === edge.source);
      const image = (source?.data.output || source?.data.image || null) as ImageAsset | null;
      if (!image) return null;
      const handle = edge.targetHandle || textReferenceInputHandle;
      const config = configs[index] || configs.find((item) => item.handle === handle) || defaultTextReferenceConfig(handle, index, image);
      const label = `图片参考 ${index + 1}`;
      return {
        handle,
        image,
        manifest: {
          id: `reference_${index + 1}`,
          label,
          role: config.role,
          weight: config.weight,
          fileName: image.fileName || image.id,
          materialType: image.materialType || image.mode,
        },
      };
    }).filter((item): item is ResolvedTextReference => Boolean(item));
    return {
      items,
      manifest: items.map((item) => item.manifest),
    };
  }

  function textReferencePreviewsForNode(node: FlowNode) {
    const configs = normalizeTextReferenceConfigs(node.data.params.referenceConfigs);
    return textReferenceEdgesForNode(node.id).map((edge, index) => {
      const source = nodes.find((item) => item.id === edge.source);
      const image = (source?.data.output || source?.data.image || null) as ImageAsset | null;
      if (!image) return null;
      const handle = edge.targetHandle || textReferenceInputHandle;
      const config = configs[index] || configs.find((item) => item.handle === handle) || defaultTextReferenceConfig(handle, index, image);
      return {
        handle,
        image,
        label: `图片参考 ${index + 1}`,
        role: config.role,
        weight: config.weight,
      };
    }).filter((item): item is { handle: string; image: ImageAsset; label: string; role: TextReferenceRole; weight: TextReferenceWeight } => Boolean(item));
  }

  function textReferenceEdgesForNode(nodeId: string) {
    return edges
      .filter((edge) => edge.target === nodeId && isTextReferenceTargetHandle(edge.targetHandle))
      .slice(0, maxTextReferenceImages);
  }

  async function appendTextReferenceImages(formData: FormData, references: Array<{ image: ImageAsset }>) {
    for (const [index, item] of references.entries()) {
      await appendImageToForm(formData, item.image, `referenceImage_${index + 1}`, `referenceImageUrl_${index + 1}`, item.image.fileName || `reference-${index + 1}.png`);
    }
  }

  function focusCanvasOnNodes(nodeIds: string[]) {
    if (!nodeIds.length) return;
    if (canvasFocusTimerRef.current) window.clearTimeout(canvasFocusTimerRef.current);
    canvasFocusTimerRef.current = window.setTimeout(() => {
      void fitView({
        nodes: nodeIds.map((id) => ({ id })),
        padding: 0.28,
        duration: 560,
      });
      canvasFocusTimerRef.current = null;
    }, 120);
  }

  function restoreCanvasViewport(restoredNodes: FlowNode[], viewport?: ProjectPayload["viewport"]) {
    if (!restoredNodes.length) {
      if (isFiniteViewport(viewport)) requestAnimationFrame(() => setViewport(viewport));
      return;
    }

    const nodeIds = restoredNodes.map((node) => ({ id: node.id }));
    requestAnimationFrame(() => {
      if (isFiniteViewport(viewport)) setViewport(viewport);
      requestAnimationFrame(() => {
        void fitView({
          nodes: nodeIds,
          padding: restoredNodes.length > 8 ? 0.18 : 0.28,
          duration: 0,
        });
      });
    });
  }

  function addOutputImageNodes(sourceNode: FlowNode, images: ImageAsset[]) {
    if (!images.length) return [];
    const previewFit = sourceNode.data.kind === "text_to_image" ? textToImagePreviewFit(sourceNode.data.params) : "contain";
    const baseX = sourceNode.position.x + treeResultHorizontalGap;
    const yPositions = resultBranchYPositions(sourceNode.position.y, images);
    const resultNodes: FlowNode[] = images.map((image, index) => ({
      id: `node_result_${Date.now()}_${index}_${Math.random().toString(16).slice(2, 6)}`,
      type: "image_input",
      position: {
        x: baseX,
        y: yPositions[index] || sourceNode.position.y,
      },
      data: {
        title: outputNodeTitle(image, index),
        subtitle: `${image.mode || sourceNode.data.title} · ${image.targetSize || imageSizeLabel(image)}`,
        kind: "image_input",
        params: {
          resultGroupId: image.resultGroupId,
          branchId: image.branchId,
          previewFit,
        },
        image,
        output: image,
        outputs: [image],
        resultCount: 1,
        status: "completed",
      },
    }));
    const resultEdges: FlowEdge[] = resultNodes.map((resultNode) => ({
      id: `edge_${sourceNode.id}_${resultNode.id}`,
      source: sourceNode.id,
      sourceHandle: "image",
      target: resultNode.id,
      targetHandle: "source",
      animated: true,
      className: "workflow-edge",
    }));
    setNodes((current) => [...current, ...resultNodes]);
    setEdges((current) => [...current, ...resultEdges]);
    return resultNodes.map((node) => node.id);
  }

  function resultBranchYPositions(sourceY: number, images: ImageAsset[]) {
    const spacings = images.map((image) => Math.max(148, Math.min(224, imageNodePreviewMetrics(image).estimatedNodeHeight + 18)));
    const total = spacings.length <= 1 ? 0 : spacings.slice(0, -1).reduce((sum, value) => sum + value, 0);
    let cursor = sourceY - total / 2;
    return images.map((_, index) => {
      const y = cursor;
      cursor += spacings[index] || treeBranchVerticalGap;
      return Math.round(y);
    });
  }

  function createLayerOutputNodeFromHistory(
    image: ImageAsset,
    options: LayerOutputOptions = { includeBackground: true, includeTextLayer: true },
    runImmediately = true,
  ) {
    if (!canLayerOutput(image)) {
      setStatus("这张图已经是拆图/抠图结果，请选择原始海报或生成图再拆分。");
      return;
    }
    const source = findCanvasNodeByImage(image) || addNode("image_input", getViewportCenter(), { ...image, source: image.source || "history" }, false);
    const operation = addNode(
      "layer_output",
      nextTreeChildPosition(source),
      undefined,
      true,
      {
        includeBackground: options.includeBackground,
        includeTextLayer: options.includeTextLayer,
      },
    );
    setEdges((current) => [
      ...current,
      {
        id: `edge_${source.id}_${operation.id}_${Date.now()}`,
        source: source.id,
        sourceHandle: "image",
        target: operation.id,
        targetHandle: "image",
        animated: true,
        className: "workflow-edge",
      },
    ]);
    setNodes((current) =>
      current.map((node) =>
        node.id === operation.id
          ? {
              ...node,
              data: {
                ...node.data,
                image,
              },
            }
          : node,
      ),
    );
    setSelectedNodeId(operation.id);
    openRightPanelTab(runImmediately ? "tasks" : "params");
    if (runImmediately) {
      setPendingRunNodeId(operation.id);
      setStatus("已创建分层拆图节点，正在拆出无文字背景和文字透明 PNG。进度会显示在右侧任务里。");
    } else {
      setStatus("已创建分层拆图节点。确认参数后点击运行。");
    }
  }

  function runHistoryOperation(image: ImageAsset, kind: "resize" | "upscale_4k", options?: HistoryOperationOptions) {
    const resizeRatio = options?.targetRatio || (composerRatio === "auto" ? "16:9" : composerRatio);
    const targetSize = options?.targetSize || (kind === "resize" ? defaultTargetSizeForRatio(resizeRatio) : inferTargetSizeFromImage(image));
    const fitMode = options?.fitMode || (kind === "resize" ? "smart_relayout" : "keep_ratio");
    const source = addNode("image_input", getViewportCenter(), { ...image, source: "history" });
    const operation = addNode(
      kind,
      nextTreeChildPosition(source),
      undefined,
      true,
      kind === "resize"
        ? {
            targetRatio: resizeRatio,
            targetSize,
            sizePreset: resizeRatio,
            fitMode,
            quality: options?.quality || "standard",
            prompt: options?.prompt || "",
          }
        : {
            scale: "4x",
            targetSize,
            quality: options?.quality || "4k",
            fitMode,
            prompt: options?.prompt || "4K无损导出：保持画面、文字、颜色、构图和比例不变，只做像素级放大。",
          },
    );
    setEdges((current) => [
      ...current,
      {
        id: `edge_${source.id}_${operation.id}_${Date.now()}`,
        source: source.id,
        sourceHandle: "image",
        target: operation.id,
        targetHandle: "image",
        animated: true,
        className: "workflow-edge",
      },
    ]);
    setNodes((current) =>
      current.map((node) =>
        node.id === operation.id
          ? {
              ...node,
              data: {
                ...node.data,
                image,
              },
            }
          : node,
      ),
    );
    setPendingRunNodeId(operation.id);
    setStatus(kind === "resize" ? `已按设置创建改尺寸任务：${ratioOptionLabel(resizeRatio)} · ${targetSize}` : `已创建4K无损导出任务：${targetSize}`);
  }

  function createMaskEditNodeFromHistory(image: ImageAsset, options: HistoryMaskEditOptions) {
    const source = addNode("image_input", getViewportCenter(), { ...image, source: "history" });
    const operation = addNode(
      "mask_edit",
      nextTreeChildPosition(source),
      undefined,
      true,
      {
        prompt: options.prompt.trim() || "只修改我涂抹的区域，其他内容保持不变。",
        quality: options.quality,
        preserveOutsideMask: true,
      },
    );
    setEdges((current) => [
      ...current,
      {
        id: `edge_${source.id}_${operation.id}_${Date.now()}`,
        source: source.id,
        sourceHandle: "image",
        target: operation.id,
        targetHandle: "image",
        animated: true,
        className: "workflow-edge",
      },
    ]);
    setNodes((current) =>
      current.map((node) =>
        node.id === operation.id
          ? {
              ...node,
              data: {
                ...node.data,
                image,
              },
            }
          : node,
      ),
    );
    setSelectedNodeId(operation.id);
    setRightPanelOpen(true);
    openRightPanelTab("params");
    setMaskEditorNodeId(operation.id);
    setStatus("已创建局部修改节点。请先涂抹要修改的区域，再运行。");
  }

  function createFollowupEditNode(image: ImageAsset, options?: { prompt?: string; forkBranch?: boolean }) {
    const branchSeed = options?.forkBranch ? `${Date.now()}_${Math.random().toString(16).slice(2, 6)}` : "";
    const sourceImage = options?.forkBranch
      ? {
          ...image,
          branchId: `branch_${branchSeed}`,
          branchLabel: `方案 ${historyImages.filter((item) => item.resultGroupId === (image.resultGroupId || image.sourceTaskId)).length + 1}`,
          parentImageId: image.id,
        }
      : image;
    const source = addNode("image_input", getViewportCenter(), { ...sourceImage, source: "history" });
    const operation = addNode(
      "image_to_image",
      nextTreeChildPosition(source, { yOffset: 18 }),
      undefined,
      true,
      {
        prompt: options?.prompt || IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST,
        model: composerModel,
        strength: 0.7,
        quality: sourceImage.quality === "4k" ? "2k" : sourceImage.quality || "standard",
      },
    );
    setEdges((current) => [
      ...current,
      {
        id: `edge_${source.id}_${operation.id}_${Date.now()}`,
        source: source.id,
        sourceHandle: "image",
        target: operation.id,
        targetHandle: "image",
        animated: true,
        className: "workflow-edge",
      },
    ]);
    setNodes((current) =>
      current.map((node) =>
        node.id === operation.id
          ? {
              ...node,
              data: {
                ...node.data,
                image: sourceImage,
              },
            }
          : node,
      ),
    );
    setSelectedNodeId(operation.id);
    setRightPanelOpen(true);
    openRightPanelTab("params");
    setStatus(options?.forkBranch ? "已复制为新方案分支，可以继续二次优化。" : "已基于当前图片创建二次优化节点。");
  }

  function addHistoryToCanvas(image: ImageAsset) {
    const node = addNode("image_input", getViewportCenter(), { ...image, source: "history" });
    setSelectedNodeId(node.id);
    setStatus("已加入画布，可以继续连接改比例、局部修改或4K节点。");
  }

  function toggleHistoryFavorite(image: ImageAsset) {
    const key = imageKey(image);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavoriteIds(next);
      return next;
    });
    setHistoryImages((current) => current.map((item) => (imageKey(item) === key ? { ...item, favorite: !item.favorite } : item)));
    setLightboxImage((current) => (current && imageKey(current) === key ? { ...current, favorite: !current.favorite } : current));
    setStatus(image.favorite ? "已取消收藏。" : "已收藏到素材库。");
  }

  function saveEditableLayers(image: ImageAsset, layers: EditableLayer[]) {
    const layoutCheck = inspectLayoutReadability(image, layers);
    const patch = { editableLayers: layers, layoutCheck, layoutTemplate: inferLayoutTemplate(image) };
    const key = imageKey(image);
    const updateImage = (item: ImageAsset): ImageAsset => (imageKey(item) === key ? { ...item, ...patch } : item);
    setHistoryImages((current) => current.map(updateImage));
    setLightboxImage((current) => (current && imageKey(current) === key ? { ...current, ...patch } : current));
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          image: node.data.image ? updateImage(node.data.image) : node.data.image,
          output: node.data.output ? updateImage(node.data.output) : node.data.output,
          outputs: node.data.outputs?.map(updateImage),
        },
      })),
    );
    if (image.fileName) {
      void fetch("/api/generated-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: image.fileName, metadata: patch }),
      }).catch(() => {});
    }
    setStatus(`已保存可编辑图层：${layoutCheck.label}`);
  }

  function createTask(node: FlowNode) {
    const id = `task_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => nodes.find((item) => item.id === edge.source))
      .map((source) => source?.data.output || source?.data.image)
      .filter((image): image is ImageAsset => Boolean(image));
    const strategyMeta = strategyMetaFromParams(node.data.params);
    const task: TaskRecord = {
      id,
      nodeId: node.id,
      nodeName: node.data.title,
      type: nodeKindLabel(node.data.kind),
      model: node.data.kind === "remove_background" && transparentCutoutModeParam(node.data.params.cutoutMode) !== "ai_regenerate" ? "local-sharp" : stringParam(node.data.params.model) || effectiveImageModel,
      status: "queued",
      startedAt: Date.now(),
      stage: "queued",
      inputs,
      progress: 4,
      progressLabel: taskStageLabel(node.data.kind, "queued"),
      prompt: stringParam(node.data.params.prompt),
      ...strategyMeta,
    };
    setRightPanelOpen(true);
    setRightPanelTabHint("tasks");
    setRightPanelTabTick((value) => value + 1);
    setTasks((current) => [task, ...current]);
    return id;
  }

  function updateTask(taskId: string, updates: Partial<TaskRecord>) {
    if (updates.status === "completed") {
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    } else if (updates.status === "failed" || updates.status === "cancelled") {
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    } else if (updates.status) {
      clearTaskCleanup(taskId);
    }
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...updates } : task)));
  }

  function createManualTask(input: {
    nodeId: string;
    nodeName: string;
    type: string;
    model: string;
    inputs?: ImageAsset[];
    prompt?: string;
    strategyMeta?: Partial<TaskRecord>;
    deferred?: boolean;
  }) {
    const id = `task_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const task: TaskRecord = {
      id,
      nodeId: input.nodeId,
      nodeName: input.nodeName,
      type: input.type,
      model: input.model,
      status: "queued",
      startedAt: Date.now(),
      stage: input.deferred ? "queued" : "preparing",
      inputs: input.inputs || [],
      progress: 4,
      progressLabel: "等待中",
      prompt: input.prompt,
      deferred: input.deferred,
      ...input.strategyMeta,
    };
    setRightPanelOpen(true);
    setRightPanelTabHint("tasks");
    setRightPanelTabTick((value) => value + 1);
    setTasks((current) => [task, ...current]);
    return id;
  }

  function startTaskProgress(taskId: string) {
    stopTaskProgress(taskId);
    taskProgressTimersRef.current[taskId] = window.setInterval(() => {
      setTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId || task.status === "completed" || task.status === "failed" || task.status === "cancelled") return task;
          const elapsed = Date.now() - task.startedAt;
          const currentProgress = task.progress || 8;
          const nextProgress = Math.min(88, currentProgress + (currentProgress < 45 ? 7 : currentProgress < 72 ? 4 : 2));
          const stage: NonNullable<TaskRecord["stage"]> = nextProgress < 30 ? "preparing" : nextProgress < 76 ? "generating" : "quality";
          return {
            ...task,
            stage,
            progress: nextProgress,
            progressLabel: elapsed > 180000 ? `模型仍在生成，已等待 ${formatDuration(elapsed)}，复杂任务可继续等或停止重试` : taskProgressLabel(task, stage),
          };
        }),
      );
    }, 1200);
  }

  function stopTaskProgress(taskId: string) {
    const timer = taskProgressTimersRef.current[taskId];
    if (timer) window.clearInterval(timer);
    delete taskProgressTimersRef.current[taskId];
  }

  function clearTaskCleanup(taskId: string) {
    const timer = taskCleanupTimersRef.current[taskId];
    if (timer) window.clearTimeout(timer);
    delete taskCleanupTimersRef.current[taskId];
  }

  function cancelTask(taskId: string) {
    cancelledTaskIdsRef.current.add(taskId);
    stopTaskProgress(taskId);
    const task = tasks.find((item) => item.id === taskId);
    if (task) markNodeFailed(task.nodeId, "任务已手动停止，可以重新运行。");
    updateTask(taskId, {
      status: "cancelled",
      endedAt: Date.now(),
      stage: "cancelled",
      error: "已手动停止",
      progress: 100,
      progressLabel: "已停止",
      cancelled: true,
    });
    setStatus("任务已停止，可以点重试重新运行。");
  }

  function removeTask(taskId: string) {
    cancelledTaskIdsRef.current.delete(taskId);
    stopTaskProgress(taskId);
    clearTaskCleanup(taskId);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setStatus("任务记录已删除。");
  }

  function removeFinishedTasks() {
    const finished = new Set(
      tasks
        .filter((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled")
        .map((task) => task.id),
    );
    if (!finished.size) {
      setStatus("没有可清空的已结束任务。");
      return;
    }
    finished.forEach((taskId) => {
      cancelledTaskIdsRef.current.delete(taskId);
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    });
    setTasks((current) => current.filter((task) => !finished.has(task.id)));
    setStatus(`已清空 ${finished.size} 条已结束任务记录。`);
  }

  function retryTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    cancelledTaskIdsRef.current.delete(taskId);
    removeTask(taskId);
    void runNode(task.nodeId);
  }

  function setNodeStatus(nodeId: string, status: NodeStatus) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, status, error: status === "running" ? "" : node.data.error },
            }
          : node,
      ),
    );
  }

  function markNodeFailed(nodeId: string, error: string) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, status: "failed", error },
            }
          : node,
      ),
    );
  }

  function getViewportCenter() {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 120, y: 120 };
    return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }

  function onPaneContextMenu(event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) {
    event.preventDefault();
    setMenu({
      kind: "add",
      x: event.clientX,
      y: event.clientY,
      position: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    });
  }

  function onNodeContextMenu(event: ReactMouseEvent, node: FlowNode) {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setMenu({ kind: "quick", x: event.clientX, y: event.clientY, nodeId: node.id });
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const historyPayload = event.dataTransfer.getData("application/x-ai-history-image");
    if (historyPayload) {
      const image = JSON.parse(historyPayload) as ImageAsset;
      addNode("image_input", position, { ...image, source: "history" });
      setStatus("已把结果图片放回画布。");
      return;
    }

    const imageFile = Array.from(event.dataTransfer.files || []).find(isSupportedImageFile);
    if (imageFile) {
      await createImageNodeFromFile(imageFile, position, "upload");
      return;
    }

    setStatus("拖拽内容里没有检测到图片。");
  }

  async function loadMoreHistory() {
    if (historyLoadingMore || !historyHasMore) return;
    setHistoryLoadingMore(true);
    try {
      const response = await fetch(`/api/generated-images?limit=20&offset=${historyNextOffset}`);
      const data = (await response.json().catch(() => ({}))) as {
        images?: GeneratedImage[];
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
      };
      if (!response.ok) throw new Error("结果加载失败。");
      const nextImages = (data.images || []).map((image) => ({ ...image, source: "history" as const, favorite: favoriteIds.has(imageKey(image)) }));
      setHistoryImages((current) => mergeImages(current, nextImages));
      setHistoryHasMore(Boolean(data.hasMore));
      setHistoryNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : historyNextOffset + nextImages.length);
      setStatus(nextImages.length ? `已加载 ${nextImages.length} 张结果缩略图。` : "没有更多结果。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "结果加载失败。");
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  async function persistProjectPayload(payload: ProjectPayload & { setActive?: boolean }) {
    const startedAt = performance.now();
    const resourcePayload = await ensureProjectPayloadResources(payload);
    const stablePayload = stripProjectRuntimeState(resourcePayload);
    const dataUrlPath = findDataImagePath(stablePayload);
    if (dataUrlPath) {
      throw new Error(`项目保存失败：仍检测到 base64 图片字段 ${dataUrlPath}。请重新上传该图片，系统会先保存为资源文件。`);
    }
    const payloadText = stringifyProjectPayload(stablePayload);
    setLastProjectJsonBytes(payloadText.length);
    const localCacheWarning = writeProjectLocalCache(projectStorageKey, payloadText);
    const response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadText,
    }).catch((error) => {
      throw new Error(`连接项目保存接口失败：${error instanceof Error ? error.message : "网络连接失败"}`);
    });
    if (!response.ok) throw new Error(await readProjectSaveError(response));
    const durationMs = Math.round(performance.now() - startedAt);
    setLastSaveDurationMs(durationMs);
    void refreshProjectList();
    void refreshMaterialLibraries();
    return {
      durationMs,
      localCacheWarning,
      payloadBytes: payloadText.length,
    };
  }

  function showSaveFeedback(tone: "loading" | "success" | "error", message: string, autoHideMs = tone === "success" ? 5200 : tone === "error" ? 9000 : 0) {
    if (saveFeedbackTimerRef.current) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
    setSaveFeedback({ tone, message });
    if (autoHideMs > 0) {
      saveFeedbackTimerRef.current = window.setTimeout(() => {
        setSaveFeedback(null);
        saveFeedbackTimerRef.current = null;
      }, autoHideMs);
    }
  }

  async function saveProject(options: { manual?: boolean } = {}) {
    const manual = Boolean(options.manual);
    const payload = currentProjectPayload();
    setProjectSaveState("saving");
    if (manual) {
      const message = `正在保存项目「${payload.name || projectName || "AI 设计项目"}」...`;
      setStatus(message);
      showSaveFeedback("loading", message);
    }
    try {
      const result = await persistProjectPayload(payload);
      setProjectSaveState("saved");
      if (manual) {
        const detail = `保存成功：项目「${payload.name || projectName || "AI 设计项目"}」已保存。${formatFileSize(result.payloadBytes)}，${formatDuration(result.durationMs)}。`;
        const message = result.localCacheWarning ? `${detail} ${result.localCacheWarning}` : detail;
        setStatus(message);
        showSaveFeedback("success", message);
      } else if (result.localCacheWarning) {
        setStatus(`项目已保存；${result.localCacheWarning}`);
      }
      return true;
    } catch (error) {
      setProjectSaveState("error");
      const message = error instanceof Error ? error.message : "项目保存失败：未知错误。";
      const displayMessage = message.startsWith("项目保存失败") || message.startsWith("保存项目失败") ? message : `项目保存失败：${message}`;
      setStatus(displayMessage);
      if (manual) showSaveFeedback("error", displayMessage);
      return false;
    }
  }

  async function fetchProjectPublicInfo(organizationName: string, options?: { projectId?: string; projectName?: string; replaceFacts?: boolean }) {
    const keyword = organizationName.trim();
    if (!keyword) {
      setStatus("先填写机构名称，再联网补全公开信息。");
      return [] as ProjectFactCandidate[];
    }
    setProjectMemorySearchState("loading");
    try {
      const response = await fetch(`/api/project-public-info?organization=${encodeURIComponent(keyword)}`);
      if (!response.ok) throw new Error("公开资料查询失败。");
      const data = (await response.json()) as { candidates?: ProjectFactCandidate[] };
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const targetProjectId = options?.projectId || projectId;
      const targetProjectName = options?.projectName || projectName;
      setProjectKnowledge((current) =>
        normalizeProjectKnowledge(
          {
            ...current,
            archive: {
              ...current.archive,
              projectName: targetProjectName,
              organizationName: keyword,
              pendingFacts: mergePendingFacts(options?.replaceFacts ? [] : current.archive.pendingFacts, candidates),
              notes: candidates.length
                ? `已抓取 ${candidates.length} 条机构公开资料候选，待你确认后再写入正式项目记忆。`
                : current.archive.notes,
              updatedAt: new Date().toISOString(),
            },
          },
          {
            projectId: targetProjectId,
            projectName: targetProjectName,
          },
        ),
      );
      setProjectMemorySearchState("done");
      setStatus(candidates.length ? `已抓取 ${candidates.length} 条公开资料，先确认再写入。` : "没有抓到明确的公开资料，先手动补充。");
      return candidates;
    } catch {
      setProjectMemorySearchState("error");
      setStatus("机构公开资料抓取失败，请稍后重试。");
      return [] as ProjectFactCandidate[];
    }
  }

  function applyPendingProjectFact(candidateId: string) {
    const candidate = projectKnowledge.archive.pendingFacts.find((item) => item.id === candidateId);
    if (!candidate) return;
    setProjectKnowledge((current) => ({
      ...current,
      archive: {
        ...current.archive,
        organizationName: candidate.field === "organizationName" ? candidate.value : current.archive.organizationName,
        address: candidate.field === "address" ? candidate.value : current.archive.address,
        phone: candidate.field === "phone" ? candidate.value : current.archive.phone,
        website: candidate.field === "website" ? candidate.value : current.archive.website,
        wechat: candidate.field === "wechat" ? candidate.value : current.archive.wechat,
        mapLink: candidate.field === "mapLink" ? candidate.value : current.archive.mapLink,
        pendingFacts: current.archive.pendingFacts.filter((item) => item.id !== candidateId),
        updatedAt: new Date().toISOString(),
      },
    }));
    setProjectProfile((current) => ({
      ...current,
      organizationName: candidate.field === "organizationName" ? candidate.value : current.organizationName,
      address: candidate.field === "address" ? candidate.value : current.address,
      phone: candidate.field === "phone" ? candidate.value : current.phone,
    }));
    setStatus(`已写入项目记忆：${candidate.label}`);
  }

  function dismissPendingProjectFact(candidateId: string) {
    setProjectKnowledge((current) => ({
      ...current,
      archive: {
        ...current.archive,
        pendingFacts: current.archive.pendingFacts.filter((item) => item.id !== candidateId),
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function currentProjectPayload() {
    const knowledge = buildProjectKnowledgeFromState({
      projectId,
      projectName,
      projectAssets,
      projectAssetText,
      projectProfile,
      currentKnowledge: projectKnowledge,
    });
    return {
      id: projectId,
      name: projectName,
      projectKind,
      viewport: getViewport(),
      assets: projectAssets.map(stripImageFile),
      assetText: projectAssetText,
      profile: projectProfile,
      knowledge,
      textProtectionMode,
      nodes: nodes.map(sanitizeNode),
      edges,
      runs: sanitizeProjectTasks(tasks),
      updatedAt: new Date().toISOString(),
    };
  }

  async function refreshProjectList() {
    const response = await fetch("/api/project?mode=list").catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { activeProjectId?: string; projects?: ProjectSummary[] };
    setProjectList(data.projects || []);
    if (data.activeProjectId) setProjectId((current) => current || data.activeProjectId || "local-project");
  }

  async function refreshMaterialLibraries() {
    const response = await fetch("/api/material-libraries?mode=detail").catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as {
      projectLibraries?: MaterialLibrarySummary[];
      publicStyleLibraries?: MaterialLibrarySummary[];
    };
    setProjectLibraries(data.projectLibraries || []);
    setPublicStyleLibraries(data.publicStyleLibraries || []);
  }

  async function loadProject(id: string) {
    const response = await fetch(`/api/project?id=${encodeURIComponent(id)}`);
    if (!response.ok) {
      setStatus("打开项目失败。");
      return false;
    }
    const project = (await response.json()) as ProjectPayload;
    setProjectId(project.id || id);
    setProjectName(project.name || "AI 设计项目");
    setProjectKind(normalizeProjectKind(project.projectKind));
    const restoredRuns = restoreProjectTasks(project.runs || []);
    const restoredTasks = restoreProjectTasks(readProjectTaskCache(project.id || id, restoredRuns));
    const restoredNodes = restoreNodes(project.nodes || [], restoredTasks);
    setNodes(restoredNodes);
    setEdges(project.edges || []);
    setTasks(restoredTasks);
    const nextKnowledge = resolveProjectKnowledge(project);
    setProjectKnowledge(nextKnowledge);
    setProjectAssets(resolveProjectAssets(project, nextKnowledge));
    setProjectAssetText(resolveProjectAssetText(project, nextKnowledge));
    setProjectProfile(resolveProjectProfile(project, nextKnowledge));
    setTextProtectionMode(project.textProtectionMode ?? true);
    setProjectSaveState("saved");
    setSelectedNodeId(null);
    setProjectPanelOpen(false);
    restoreCanvasViewport(restoredNodes, project.viewport);
    writeProjectLocalCache(projectStorageKey, stringifyProjectPayload(stripProjectRuntimeState(project)));
    await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stripProjectRuntimeState({ ...project, setActive: true })),
    }).catch(() => {});
    setStatus(`已打开项目：${project.name || "AI 设计项目"}`);
    void refreshProjectList();
    void refreshMaterialLibraries();
    return true;
  }

  async function deleteProject(id: string) {
    const response = await fetch("/api/project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      setStatus("删除项目失败。");
      return;
    }
    const data = (await response.json()) as { activeProjectId?: string; projects?: ProjectSummary[] };
    setProjectList(data.projects || []);
    if (id === projectId && data.activeProjectId) await loadProject(data.activeProjectId);
    setStatus("项目已删除。");
  }

  async function deleteHistoryImage(image: ImageAsset) {
    const fileName = generatedFileNameForImage(image);
    if (!fileName) return;
    const response = await fetch("/api/generated-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName }),
    });
    if (!response.ok) {
      setStatus("删除结果图片失败。");
      return;
    }
    setHistoryImages((current) => current.filter((item) => (item.fileName || item.id) !== fileName));
    setProjectAssets((current) => current.filter((item) => (item.fileName || item.id) !== fileName));
    setNodes((current) => current.map((node) => removeImageFromNode(node, fileName)));
    setLightboxImage((current) => ((current?.fileName || current?.id) === fileName ? null : current));
    setStatus("结果图片已删除。");
  }

  async function createTransparentPng(
    image: ImageAsset,
    options: TransparentCutoutOptions = { mode: "real_cutout", cutoutType: "auto", tolerance: 34 },
  ) {
    try {
      setStatus(options.mode === "ai_regenerate" ? "正在用 AI 重生干净透明 PNG。" : "正在真实抠图并验证透明 PNG。");
      const data = await requestTransparentPng(image, options);
      if (!data.image) throw new Error(data.error || "透明 PNG 处理失败。");
      const output = { ...data.image, source: "generated" as const };
      setHistoryImages((current) => mergeImages([output], current));
      setLightboxImage(output);
      if (image) appendNextImageIds(image, [output.id || output.fileName || output.url]);
      await persistGeneratedMetadata([output]);
      setStatus(data.warning || (data.alphaCheck?.hasTransparentPixels ? `已输出${transparentCutoutModeLabel(data.mode || options.mode)}，检测到 alpha 透明像素。` : "已输出 PNG，但透明像素检测结果不明确。"));
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "透明 PNG 处理失败。";
      setStatus(message);
      throw error;
    }
  }

  async function createLayerOutput(
    image: ImageAsset,
    options: LayerOutputOptions = { includeBackground: true, includeTextLayer: true },
  ) {
    try {
      setStatus("正在读取当前图片，准备分层拆图。");
      await wait(180);
      setStatus("正在分析文字区域，并生成拆分结果。");
      const result = await requestLayerOutput(image, options);
      assertLayerOutputComplete(result, options);
      const outputs = layerOutputResultImages(result);
      if (!outputs.length) throw new Error(result.errors?.background || result.errors?.textLayer || "分层拆图没有返回图片。");

      const nextIds = outputs.map((item) => item.id || item.fileName || item.url).filter(Boolean);
      setHistoryImages((current) => mergeImages(outputs, current));
      appendNextImageIds(image, nextIds);
      await saveLayerOutputsToProjectAssets(outputs);
      await persistGeneratedMetadata(outputs);
      createLayerOutputCanvasNodes(image, outputs);
      const partialErrors = [result.errors?.background, result.errors?.textLayer].filter(Boolean);
      setStatus(partialErrors.length ? `分层拆图部分完成：${partialErrors.join("；")}` : "分层拆图完成，已生成无文字背景和文字透明 PNG，并连接到原图节点。");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "分层拆图失败。";
      setStatus(message);
      throw error;
    }
  }

  function createLayerOutputCanvasNodes(image: ImageAsset, outputs: ImageAsset[]) {
    if (!outputs.length) return;
    const source = findCanvasNodeByImage(image) || addNode("image_input", getViewportCenter(), { ...image, source: image.source || "history" }, false);
    const operation = addNode(
      "layer_output",
      nextTreeChildPosition(source),
      undefined,
      true,
      {
        includeBackground: outputs.some((item) => item.materialType === "无文字背景"),
        includeTextLayer: outputs.some(isLayerOutputTextImage),
      },
    );
    setEdges((current) => [
      ...current,
      {
        id: `edge_${source.id}_${operation.id}_${Date.now()}`,
        source: source.id,
        sourceHandle: "image",
        target: operation.id,
        targetHandle: "image",
        animated: true,
        className: "workflow-edge",
      },
    ]);
    setNodes((current) =>
      current.map((node) =>
        node.id === operation.id
          ? {
              ...node,
              data: {
                ...node.data,
                output: outputs[0],
                outputs,
                resultCount: outputs.length,
                status: "completed",
              },
            }
          : node,
      ),
    );
    const resultNodeIds = addOutputImageNodes(operation, outputs);
    focusCanvasOnNodes([source.id, operation.id, ...resultNodeIds]);
  }

  function findCanvasNodeByImage(image: ImageAsset) {
    const key = imageKey(image);
    return nodes.find((node) =>
      [node.data.image, node.data.output, ...(node.data.outputs || [])].some((item) => item && imageKey(item) === key),
    ) || null;
  }

  async function saveLayerOutputsToProjectAssets(images: ImageAsset[]) {
    if (!images.length) return;
    const assetImages = images.map((image) => ({
      ...image,
      source: "asset" as const,
      materialScene: image.materialScene || "分层拆图",
      tags: Array.from(new Set([...(image.tags || []), "分层拆图", image.materialType || ""].filter(Boolean))),
    }));
    const nextProjectAssets = mergeImages(assetImages, projectAssets);
    const nextKnowledge = {
      ...projectKnowledge,
      materialLibrary: {
        ...projectKnowledge.materialLibrary,
        items: mergeProjectAssetRecords(
          projectKnowledge.materialLibrary.items,
          assetImages.map((asset) => imageAssetToProjectAssetRecord(asset, projectKnowledge.materialLibrary.id, projectId)),
        ),
        updatedAt: new Date().toISOString(),
      },
    };
    const stableKnowledge = buildProjectKnowledgeFromState({
      projectId,
      projectName,
      projectAssets: nextProjectAssets,
      projectAssetText,
      projectProfile,
      currentKnowledge: nextKnowledge,
    });

    setProjectAssets(nextProjectAssets);
    setProjectKnowledge(stableKnowledge);
    setProjectSaveState("saving");
    try {
      await persistProjectPayload({
        ...currentProjectPayload(),
        assets: nextProjectAssets.map(stripImageFile),
        knowledge: stableKnowledge,
        updatedAt: new Date().toISOString(),
      });
      setProjectSaveState("saved");
    } catch (error) {
      setProjectSaveState("error");
      throw error;
    }
  }

  function appendNextImageIds(image: ImageAsset, nextIds: string[]) {
    const key = imageKey(image);
    const patchIds = Array.from(new Set([...(image.nextImageIds || []), ...nextIds].filter(Boolean)));
    if (!patchIds.length) return;
    const updateImage = (item: ImageAsset): ImageAsset => (imageKey(item) === key ? { ...item, nextImageIds: patchIds } : item);
    setHistoryImages((current) => current.map(updateImage));
    setLightboxImage((current) => (current && imageKey(current) === key ? { ...current, nextImageIds: patchIds } : current));
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          image: node.data.image ? updateImage(node.data.image) : node.data.image,
          output: node.data.output ? updateImage(node.data.output) : node.data.output,
          outputs: node.data.outputs?.map(updateImage),
        },
      })),
    );
    if (image.fileName) {
      void fetch("/api/generated-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: image.fileName, metadata: { nextImageIds: patchIds } }),
      }).catch(() => {});
    }
  }
  async function persistGeneratedMetadata(images: ImageAsset[]) {
    await Promise.allSettled(
      images
        .filter((image) => image.fileName)
        .map((image) =>
          fetch("/api/generated-images", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: image.fileName,
              metadata: {
                parentImageId: image.parentImageId,
                rootImageId: image.rootImageId,
                branchId: image.branchId,
                branchLabel: image.branchLabel,
                resultGroupId: image.resultGroupId,
                sourceTaskId: image.sourceTaskId,
                variant: image.variant,
                nodeOperation: image.nodeOperation,
                strategyPackageId: image.strategyPackageId,
                sourceStrategyTitle: image.sourceStrategyTitle,
                materialPlanItemId: image.materialPlanItemId,
                materialType: image.materialType,
                targetSize: image.targetSize,
                materialCopy: image.materialCopy,
                materialScene: image.materialScene,
              },
            }),
          }),
        ),
    );
  }

  async function createNewProject(draft: ProjectCreationDraft = emptyProjectCreationDraft) {
    const nextId = `project_${Date.now()}`;
    const nextName = draft.projectName.trim() || `节点设计项目 ${new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}`;
    const baseKnowledge = createDefaultProjectKnowledge({ projectId: nextId, projectName: nextName });
    const nextKnowledge: ProjectKnowledgeBase = {
      ...baseKnowledge,
      archive: {
        ...baseKnowledge.archive,
        organizationName: draft.organizationName.trim(),
        notes: draft.autoSearch ? "待联网补全：已开启机构公开资料补全，搜索结果进入“待确认”，确认后才写入正式档案。" : "",
      },
      references: [],
      materialLibrary: {
        ...baseKnowledge.materialLibrary,
        items: baseKnowledge.materialLibrary.items,
      },
      selection: {
        ...baseKnowledge.selection,
        activeReferenceLibraryIds: [],
        activePublicStyleLibraryIds: [],
      },
    };
    const nextProfile = normalizeProjectProfile({
      ...emptyProjectProfile,
      organizationName: nextKnowledge.archive.organizationName,
    });
    const nextAssetText = nextKnowledge.archive.notes;
    const nextPayload: ProjectPayload & { setActive: true } = {
      id: nextId,
      name: nextName,
      projectKind: "formal",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
      runs: [],
      assets: [],
      assetText: nextAssetText,
      textProtectionMode: true,
      profile: nextProfile,
      knowledge: nextKnowledge,
      setActive: true,
    };
    setNodes([]);
    setEdges([]);
    setTasks([]);
    setProjectAssets([]);
    setProjectProfile(emptyProjectProfile);
    setSelectedNodeId(null);
    setProjectId(nextId);
    setProjectName(nextName);
    setProjectKind("formal");
    setProjectKnowledge(nextKnowledge);
    setProjectAssetText(nextAssetText);
    setProjectProfile(nextProfile);
    setTextProtectionMode(true);
    setProjectPanelOpen(false);
    setProjectCreateOpen(false);
    setProjectSaveState("saving");
    setStatus("已新建独立项目档案和素材库。");
    try {
      await persistProjectPayload(nextPayload);
      setProjectSaveState("saved");
    } catch {
      setProjectSaveState("error");
      setStatus("新项目已创建到当前界面，但保存失败，请点右上角再保存一次。");
    }
    if (draft.autoSearch && draft.organizationName.trim()) {
      await fetchProjectPublicInfo(draft.organizationName.trim(), {
        projectId: nextId,
        projectName: nextName,
        replaceFacts: true,
      });
    }
    void refreshMaterialLibraries();
    return true;
  }

  async function enterNewProjectFromHome() {
    if (!projectBootReady || homeBusy) return;
    setHomeBusy(true);
    setHomeProjectPickerOpen(false);
    setHomeOpen(false);
    try {
      await createNewProject();
    } finally {
      setHomeBusy(false);
    }
  }

  async function openProjectFromHome(id: string) {
    if (!projectBootReady || homeBusy) return;
    setHomeBusy(true);
    try {
      const opened = await loadProject(id);
      if (opened) {
        setHomeProjectPickerOpen(false);
        setHomeOpen(false);
      }
    } catch {
      setStatus("打开项目失败。");
    } finally {
      setHomeBusy(false);
    }
  }

  function showHomeProjectPicker() {
    setHomeProjectPickerOpen(true);
    void refreshProjectList();
  }

  if (homeOpen) {
    return (
      <ProjectHomeScreen
        activeProjectId={projectId}
        busy={homeBusy || !projectBootReady}
        formatUpdatedAt={formatGeneratedAt}
        onCreate={() => void enterNewProjectFromHome()}
        onOpen={(id) => void openProjectFromHome(id)}
        onShowProjects={showHomeProjectPicker}
        pickerOpen={homeProjectPickerOpen}
        projects={projectList}
      />
    );
  }

  return (
    <main className="apple-shell flex h-screen overflow-hidden text-[#f5f7fb]">
      <aside
        className={`apple-sidebar z-20 flex shrink-0 flex-col items-center gap-2 px-2 py-4 transition-[width] duration-200 ${
          leftRailOpen ? "w-[88px]" : "w-[60px]"
        }`}
      >
        <button
          className="apple-button mb-2 flex size-8 items-center justify-center rounded-full text-white/66"
          onClick={() => setLeftRailOpen((value) => !value)}
          title={leftRailOpen ? "收起左栏" : "展开左栏"}
          type="button"
        >
          <ChevronRight className={`size-4 transition ${leftRailOpen ? "rotate-180" : ""}`} />
        </button>
        <button
          className={`apple-button-primary mb-1 flex items-center justify-center gap-2 rounded-full px-2 text-[#07121f] ${
            leftRailOpen ? "h-10 w-full" : "size-10"
          }`}
          onClick={() => setNodeMenuOpen((value) => !value)}
          title="添加节点"
          type="button"
        >
          <Plus className="size-5" />
          {leftRailOpen ? <span className="text-[12px] font-semibold">添加</span> : null}
        </button>
        <div className="w-full space-y-1">
          <ToolbarButton
            expanded={leftRailOpen}
            icon={<FolderOpen className="size-4" />}
            label="项目"
            onClick={() => {
              setProjectPanelOpen((value) => !value);
              setAssetPanelOpen(false);
            }}
          />
          <ToolbarButton
            expanded={leftRailOpen}
            icon={<Images className="size-4" />}
            label="素材"
            onClick={() => {
              setAssetPanelOpen((value) => !value);
              setProjectPanelOpen(false);
            }}
          />
          <Link
            className={`flex items-center justify-center rounded-[18px] border transition apple-button text-white/72 ${
              leftRailOpen ? "w-full flex-col gap-1 px-1 py-2.5" : "size-10 px-0 py-0"
            }`}
            href="/settings"
            onClick={() => void saveProject()}
            title="设置"
          >
            <KeyRound className="size-4" />
            {leftRailOpen ? <span className="text-[11px] leading-none opacity-80">设置</span> : null}
          </Link>
        </div>
      </aside>

      {projectPanelOpen ? (
        <ProjectLibraryPanel
          activeProjectId={projectId}
          formatUpdatedAt={formatGeneratedAt}
          projects={projectList}
          onClose={() => setProjectPanelOpen(false)}
          onCreateNew={() => {
            setProjectPanelOpen(false);
            setProjectCreateOpen(true);
          }}
          onDelete={(id) => void deleteProject(id)}
          onOpen={(id) => void loadProject(id)}
          onRefresh={() => void refreshProjectList()}
        />
      ) : null}

      {projectCreateOpen ? (
        <ProjectCreationModal
          draft={emptyProjectCreationDraft}
          onClose={() => setProjectCreateOpen(false)}
          onCreate={(draft) => void createNewProject(draft)}
        />
      ) : null}

      {assetPanelOpen ? (
        <AssetLibraryPanel
          assets={projectAssets}
          currentProjectId={projectId}
          imageSizeLabel={(image) => imageSizeLabel(image as ImageAsset)}
          initialTab="assets"
          knowledge={projectKnowledge}
          mergeProjectLibraryAssets={(items, assets, currentProjectId) => mergeProjectLibraryAssets(items, assets as ImageAsset[], currentProjectId)}
          onClose={() => setAssetPanelOpen(false)}
          onKnowledgeChange={setProjectKnowledge}
          onProjectNameChange={setProjectName}
          onPreview={(image) => setLightboxImage(image as ImageAsset)}
          onProfileChange={(value) => setProjectProfile(value as ProjectProfile)}
          onApplyPendingFact={applyPendingProjectFact}
          onDismissPendingFact={dismissPendingProjectFact}
          onRefreshLibraries={() => void refreshMaterialLibraries()}
          onSearchPublicInfo={() => void fetchProjectPublicInfo(projectProfile.organizationName || projectKnowledge.archive.organizationName)}
          onTextChange={setProjectAssetText}
          onTextProtectionChange={setTextProtectionMode}
          onUpload={(files, type) => void uploadProjectAssets(files, type)}
          publicInfoSearchState={projectMemorySearchState}
          publicStyleLibraries={publicStyleLibraries}
          profile={projectProfile}
          splitProfileLines={splitProfileLines}
          styleLibraryReferencePreview={styleLibraryReferencePreview}
          styleLibraryRulePreview={styleLibraryRulePreview}
          text={projectAssetText}
          textProtectionMode={textProtectionMode}
        />
      ) : null}

      <section className="relative min-w-0 flex-1" ref={wrapperRef}>
        <header className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
          <div className="apple-panel pointer-events-auto min-w-[248px] max-w-[min(500px,calc(100vw-180px))] px-4 py-3">
            <input
              className="w-full max-w-[360px] bg-transparent text-[17px] font-semibold text-white/94 outline-none focus-visible:shadow-none"
              onChange={(event) => {
                const nextName = event.target.value;
                setProjectName(nextName);
                setProjectKnowledge((current) =>
                  current.archive.projectName === nextName
                    ? current
                    : {
                        ...current,
                        archive: {
                          ...current.archive,
                          projectName: nextName,
                          updatedAt: new Date().toISOString(),
                        },
                      },
                );
              }}
              value={projectName}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {projectKind === "temporary" ? <span className="apple-pill-accent px-2 py-1 text-[11px]">临时项目</span> : null}
              <span className={`apple-pill px-2 py-1 text-[11px] ${projectSaveState === "error" ? "text-[#ffb4a8]" : ""}`}>
                {projectSaveState === "saving" ? "保存中" : projectSaveState === "error" ? "保存失败" : "已保存"}
              </span>
              <span className={`apple-pill px-2 py-1 text-[11px] ${modelInfo.hasKey ? "text-[#adf8e5]" : "text-[#ffb4a8]"}`}>
                {modelInfo.hasKey ? "API 正常" : "API 未配置"}
              </span>
            </div>
            {saveFeedback ? (
              <div
                className={`mt-2 rounded-xl border px-2.5 py-1.5 text-[11px] leading-4 ${
                  saveFeedback.tone === "error"
                    ? "border-[#ff6b5f]/20 bg-[#ff6b5f]/12 text-[#ffb4a8]"
                    : saveFeedback.tone === "success"
                      ? "border-[#74e3c5]/20 bg-[#74e3c5]/12 text-[#adf8e5]"
                      : "border-white/12 bg-white/[0.06] text-white/66"
                }`}
              >
                {saveFeedback.message}
              </div>
            ) : status ? <div className="apple-caption mt-2 line-clamp-1">{status}</div> : null}
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            {projectKind === "temporary" ? (
              <button
                className="apple-button flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium"
                onClick={convertTemporaryProject}
                type="button"
              >
                <FolderOpen className="size-3.5" />
                转正式
              </button>
            ) : null}
            {nodes.length > 1 ? (
              <button
                className="apple-button flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium"
                onClick={organizeCanvas}
                type="button"
              >
                <ScanLine className="size-3.5" />
                整理
              </button>
            ) : null}
            {nodes.length ? (
              <button
                className="apple-button flex size-9 items-center justify-center text-white/52"
                onClick={clearCanvas}
                title="清空画布"
                type="button"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
            <button
              className="apple-button flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium"
              disabled={projectSaveState === "saving"}
              onClick={() => void saveProject({ manual: true })}
              type="button"
            >
              <Check className="size-3.5" />
              {projectSaveState === "saving" ? "保存中" : projectSaveState === "error" ? "重新保存" : "保存"}
            </button>
            <button
              className="apple-button flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium"
              onClick={() => setRightPanelOpen((value) => !value)}
              type="button"
            >
              <Folder className="size-3.5" />
              {rightPanelOpen ? "收起" : "侧栏"}
            </button>
          </div>
        </header>

        {nodeMenuOpen ? (
          <NodeMenu
            x={leftRailOpen ? 96 : 70}
            y={82}
            onClose={() => setNodeMenuOpen(false)}
            onSelect={(type) => {
              const node = addNode(type, nextStandaloneNodePosition());
              if (type !== "image_input") focusNodeParams(node.id);
              setStatus(nodeCreationHint(type, false));
            }}
          />
        ) : null}

        {menu?.kind === "add" ? (
          <NodeMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onSelect={(type) => {
              const node = addNode(type, menu.position);
              if (type !== "image_input") focusNodeParams(node.id);
              setStatus(nodeCreationHint(type, false));
            }}
          />
        ) : null}

        {menu?.kind === "quick" ? (
          <QuickMenu
            x={menu.x}
            y={menu.y}
            onDelete={() => deleteNode(menu.nodeId)}
            onClose={() => setMenu(null)}
            onSelect={(action) => addQuickNode(menu.nodeId, action.type, action.handle)}
          />
        ) : null}

        <ReactFlow
          className="node-workflow-flow"
          colorMode="dark"
          edges={edges}
          maxZoom={1.8}
          minZoom={0.18}
          nodeTypes={WORKBENCH_NODE_TYPES}
          nodes={decoratedNodes}
          onConnect={onConnect}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => void onDrop(event)}
          onEdgeClick={(event, edge) => {
            event.stopPropagation();
            scheduleEdgeDelete(edge.id);
          }}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => focusNodeParams(node.id)}
          onNodeContextMenu={onNodeContextMenu}
          onNodesChange={onNodesChange}
          onPaneClick={() => {
            setMenu(null);
            setNodeMenuOpen(false);
            setProjectPanelOpen(false);
            setAssetPanelOpen(false);
          }}
          onPaneContextMenu={onPaneContextMenu}
          proOptions={{ hideAttribution: true }}
        >
          <Background bgColor="transparent" color="rgba(255,255,255,0.18)" gap={30} size={1.08} variant={BackgroundVariant.Dots} />
          {nodes.length > 1 ? (
            <MiniMap
              maskColor="rgba(7,12,20,0.52)"
              nodeColor={(node) => (node.type === "image_input" ? "#74e3c5" : "#8fa7ff")}
              pannable
              position="bottom-left"
              zoomable
            />
          ) : null}
          {nodes.length ? <Controls position="bottom-left" showInteractive={false} /> : null}
        </ReactFlow>

        <ChatComposer
          brandSummary={brandAssetSummary}
          brandUsage={projectProfile.brandAssetUsage}
          effectiveModel={effectiveImageModel}
          hasKey={modelInfo.hasKey}
          model={composerModel}
          modelOptions={passedImageModelOptions}
          prompt={composerPrompt}
          quality={composerQuality}
          ratio={composerRatio}
          selectedNode={selectedNode}
          onModelChange={setComposerModel}
          onBrandUsageChange={(usage) => setProjectProfile((current) => ({ ...current, brandAssetUsage: normalizeBrandAssetUsage(usage) }))}
          onImageFile={addComposerImageAsReference}
          onPasteHint={() => setStatus("可以使用系统截图后直接 Command/Ctrl+V 粘贴，或把图片拖到画布里。")}
          onPromptChange={setComposerPrompt}
          onQualityChange={setComposerQuality}
          onRatioChange={setComposerRatio}
          onSubmit={submitComposer}
        />

        <input
          ref={fileInputRef}
          className="hidden"
          accept="image/png,image/jpeg,image/webp"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const nodeId = pendingImageNodeRef.current;
            if (file && nodeId) void attachFileToImageNode(nodeId, file);
            event.currentTarget.value = "";
            pendingImageNodeRef.current = null;
          }}
        />
      </section>

      {rightPanelOpen ? (
        <aside className="apple-panel-strong apple-drawer fixed bottom-3 right-3 top-3 z-40 flex w-[min(356px,calc(100vw-96px))] flex-col overflow-hidden rounded-[28px] xl:static xl:z-20 xl:w-[356px] xl:shrink-0 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none">
          <RightPanel
            historyImages={historyImages}
            historyHasMore={historyHasMore}
            historyLoadingMore={historyLoadingMore}
            projectId={projectId}
            tabHint={rightPanelTabHint}
            tabHintTick={rightPanelTabTick}
            onDeleteHistory={(image) => void deleteHistoryImage(image)}
            onDragHistory={(event, image) => {
              event.dataTransfer.setData("application/x-ai-history-image", JSON.stringify(stripImageFile(image)));
              event.dataTransfer.effectAllowed = "copy";
            }}
            onDuplicateBranch={createFollowupEditNode}
            onEditImage={createFollowupEditNode}
            onResizeHistory={(image) => {
              setLightboxImage(image);
              setStatus("已打开图片，请先确认目标尺寸再创建改尺寸任务。");
            }}
            onUpscaleHistory={(image) => {
              setLightboxImage(image);
              setStatus("已打开图片，请确认无损导出目标；默认不调用 AI、不裁切。");
            }}
            onAddHistoryToCanvas={addHistoryToCanvas}
            onToggleFavorite={toggleHistoryFavorite}
            onLoadMoreHistory={() => void loadMoreHistory()}
            onPreview={setLightboxImage}
            onCreateLayerOutputNode={(image) => createLayerOutputNodeFromHistory(image)}
            onClose={() => setRightPanelOpen(false)}
            selectedNode={selectedNode}
            tasks={tasks.map((task) => ({ ...task, resultOnCanvas: hasTaskResultNodesOnCanvas(task) }))}
            onCancelTask={cancelTask}
            onDeleteTask={removeTask}
            onDeleteFinishedTasks={removeFinishedTasks}
            onMaskEdit={(nodeId) => {
              if (!resolveInputImage(nodeId, "image")) {
                setStatus("局部涂抹需要先把图片连接到局部涂抹节点。");
                return;
              }
              setMaskEditorNodeId(nodeId);
            }}
            onParamChange={updateNodeParam}
            onRetryTask={retryTask}
            onCreateAction={(nodeId, type, handle, params) => addQuickNode(nodeId, type, handle, params)}
            onRunNode={(nodeId) => void runNode(nodeId)}
          />
        </aside>
      ) : null}

      {lightboxImage ? (
        <ImageLightbox
          key={`${lightboxImage.id}-${lightboxImage.generatedAt || ""}`}
          image={lightboxImage}
          historyImages={historyImages}
          projectProfile={projectProfile}
          onClose={() => setLightboxImage(null)}
          onCopyImage={async (image) => {
            await copyImageToClipboard(image);
            setStatus("图片已复制。");
          }}
          onCopyPrompt={async (prompt) => {
            await copyTextToClipboard(prompt);
            setStatus("Prompt 已复制。");
          }}
          onDelete={() => void deleteHistoryImage(lightboxImage)}
          onEditImage={(prompt) => createFollowupEditNode(lightboxImage, { prompt })}
          onKeep={() => setStatus("已保留此版。后续可从结果库继续编辑或下载。")}
          onOpenVersion={(image) => setLightboxImage(image)}
          onMaskEdit={(options) => createMaskEditNodeFromHistory(lightboxImage, options)}
          onResize={(options) => runHistoryOperation(lightboxImage, "resize", options)}
          onSaveLayers={(layers) => saveEditableLayers(lightboxImage, layers)}
          onTransparentPng={(image, options) => createTransparentPng(image, options)}
          onCreateLayerOutputNode={(image) => createLayerOutputNodeFromHistory(image)}
          onLayerOutput={(image, options) => createLayerOutput(image, options)}
          onSaveLayerOutputs={(images) => saveLayerOutputsToProjectAssets(images)}
          onUpscale={(options) => runHistoryOperation(lightboxImage, "upscale_4k", options)}
        />
      ) : null}
      {maskEditorNode && maskEditorImage ? (
        <MaskEditorModal
          image={maskEditorImage}
          initialMaskUrl={stringParam(maskEditorNode.data.params.maskImageUrl) || stringParam(maskEditorNode.data.params.maskDataUrl)}
          initialPrompt={stringParam(maskEditorNode.data.params.prompt)}
          onClose={() => setMaskEditorNodeId(null)}
          onSave={(maskDataUrl, prompt) => {
            void saveMaskDataUrl(maskDataUrl)
              .then((mask) => {
                updateNodeParam(maskEditorNode.id, "maskDataUrl", "");
                updateNodeParam(maskEditorNode.id, "maskImageUrl", mask.url);
                updateNodeParam(maskEditorNode.id, "maskImageFileName", mask.fileName);
                updateNodeParam(maskEditorNode.id, "prompt", prompt);
                setMaskEditorNodeId(null);
                setStatus("已保存涂抹区域和修补要求。现在运行局部涂抹节点。");
              })
              .catch((error) => {
                setStatus(error instanceof Error ? error.message : "蒙版资源保存失败。");
              });
          }}
        />
      ) : null}
    </main>
  );
}

function ProjectHomeScreen({
  activeProjectId,
  busy,
  formatUpdatedAt,
  onCreate,
  onOpen,
  onShowProjects,
  pickerOpen,
  projects,
}: {
  activeProjectId: string;
  busy: boolean;
  formatUpdatedAt: (value: string) => string;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onShowProjects: () => void;
  pickerOpen: boolean;
  projects: ProjectSummary[];
}) {
  return (
    <main className="apple-shell flex h-screen items-center justify-center overflow-hidden p-5 text-[#f5f7fb]">
      <section className="apple-panel-strong w-full max-w-[560px] rounded-[30px] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[20px] font-semibold text-white/92">AI 设计工作台</div>
            <div className="apple-caption mt-1 truncate">先选择项目，再进入节点画布。</div>
          </div>
          <span className="apple-pill shrink-0 px-2.5 py-1 text-[11px]">{busy ? "准备中" : "就绪"}</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="apple-button-primary flex min-h-[96px] flex-col items-start justify-between rounded-[22px] px-4 py-3 text-left text-[#07121f] disabled:opacity-55"
            disabled={busy}
            onClick={onCreate}
            type="button"
          >
            <Plus className="size-5" />
            <span className="text-[17px] font-semibold">{busy ? "正在准备" : "新建项目"}</span>
          </button>
          <button
            className="apple-button flex min-h-[96px] flex-col items-start justify-between rounded-[22px] px-4 py-3 text-left text-white/82 disabled:opacity-55"
            disabled={busy}
            onClick={onShowProjects}
            type="button"
          >
            <FolderOpen className="size-5" />
            <span className="text-[17px] font-semibold">打开项目</span>
          </button>
        </div>

        {pickerOpen ? (
          <div className="mt-4 max-h-[46vh] overflow-auto rounded-[22px] border border-white/10 bg-white/[0.035] p-2">
            {projects.length ? (
              <div className="space-y-2">
                {projects.map((project) => (
                  <button
                    className={`apple-interactive-card flex w-full items-center gap-3 p-3 text-left ${project.id === activeProjectId ? "is-selected" : ""}`}
                    disabled={busy}
                    key={project.id}
                    onClick={() => onOpen(project.id)}
                    type="button"
                  >
                    {project.coverUrl ? (
                      <span
                        aria-hidden="true"
                        className="size-12 shrink-0 rounded-[14px] border border-white/10 bg-cover bg-center"
                        style={{ backgroundImage: `url(${project.coverUrl})` }}
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.055] text-white/42">
                        <FolderOpen className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-white/84">{project.name}</span>
                      <span className="apple-caption mt-0.5 block truncate">
                        {(project.assetCount || 0)} 素材 · {project.updatedAt ? formatUpdatedAt(project.updatedAt) : "刚刚"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="apple-empty-state px-4 py-8 text-center text-[12px] text-white/46">暂无项目</div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ProjectCreationModal({
  draft,
  onClose,
  onCreate,
}: {
  draft: ProjectCreationDraft;
  onClose: () => void;
  onCreate: (draft: ProjectCreationDraft) => void;
}) {
  const [form, setForm] = useState<ProjectCreationDraft>(draft);
  const canCreateProject = Boolean(form.projectName.trim());

  return (
    <section className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(9,14,23,0.56)] px-4 backdrop-blur-xl">
      <div className="apple-panel-strong w-full max-w-[460px] overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[18px] font-semibold text-white/92">新建项目</div>
            <div className="mt-1 text-[12px] text-white/42">先建项目和素材库，其他资料后面再补。</div>
          </div>
          <button aria-label="关闭新建项目" className="apple-button flex size-9 items-center justify-center text-white/56" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DraftProfileInput label="项目名称" placeholder="例如：端午活动海报" value={form.projectName} onChange={(value) => setForm((current) => ({ ...current, projectName: value }))} />
              <DraftProfileInput label="机构名称" placeholder="可选" value={form.organizationName} onChange={(value) => setForm((current) => ({ ...current, organizationName: value }))} />
            </div>
            <label className="mt-3 flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.052] px-3 py-2.5 text-[12px] text-white/62">
              <input
                checked={form.autoSearch}
                className="size-4 accent-[#74e3c5]"
                onChange={(event) => setForm((current) => ({ ...current, autoSearch: event.target.checked }))}
                type="checkbox"
              />
              <span>自动补全公开信息，先待确认再写入。</span>
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button className="apple-button h-10 rounded-full px-4 text-[12px] text-white/70" onClick={onClose} type="button">取消</button>
          <button
            className="apple-button-primary h-10 rounded-full px-4 text-[12px] font-semibold disabled:opacity-45"
            disabled={!canCreateProject}
            onClick={() => onCreate(form)}
            type="button"
          >
            创建项目
          </button>
        </div>
      </div>
    </section>
  );
}

function DraftProfileInput({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-white/38">{label}</span>
      <input
        className="apple-input h-11 w-full rounded-[16px] px-3 text-[12px] text-white/76 outline-none placeholder:text-white/30"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

const ImageInputNode = memo(function ImageInputNode({ id, data, selected }: NodeProps<FlowNode>) {
  const image = data.image || data.output || null;
  const metrics = imageNodePreviewMetrics(image);
  const previewFit = textToImagePreviewFit(data.params);
  const showUploadButton = !image;
  const nodeTitle = image ? imageNodeTitle(image, data.title) : data.title;
  const nodeMeta = image ? compactImageMeta(image) : "输入 image";

  return (
    <section
      className={`apple-node-card group rounded-[20px] p-2 text-white ${selected ? "is-input-selected" : ""}`}
      style={{ width: metrics.nodeWidth }}
    >
      <Handle id="source" position={Position.Left} type="target" className="!size-3 !border-white/40 !bg-[#0c0d11]" />
      <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#74e3c5] !bg-[#74e3c5]" />
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-white/88">{nodeTitle}</div>
          <div className="apple-caption mt-0.5 truncate text-[10px]">{nodeMeta}</div>
        </div>
        {showUploadButton ? (
          <button
            className="apple-button nodrag flex size-6 shrink-0 items-center justify-center text-white/62"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/webp";
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) data.onImageFile?.(id, file);
              };
              input.click();
            }}
            title="上传图片"
            type="button"
          >
            <ImagePlus className="size-3.5" />
          </button>
        ) : null}
        <button
          className="apple-button-danger nodrag flex size-6 shrink-0 items-center justify-center opacity-0 transition group-hover:opacity-100"
          onClick={() => data.onDelete?.(id)}
          title="删除节点"
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {image ? (
        Array.isArray(data.outputs) && data.outputs.length > 1 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {data.outputs.slice(0, 2).map((item, index) => (
              <button
                className="apple-node-well nodrag relative block overflow-hidden rounded-[14px]"
                key={`${item.id}-${index}`}
                onClick={() => data.onPreview?.(item)}
                style={{ ...compactThumbStyle(item, 108, 74), margin: "0 auto" }}
                title={`查看第 ${index + 1} 张结果`}
                type="button"
              >
                <ImageFrame
                  alt={`${data.title}-${index + 1}`}
                  className="pointer-events-none"
                  image={item}
                  fit={previewFit}
                  imgClassName="pointer-events-none"
                  preserveRatio={false}
                  showCheckerboard={shouldShowCheckerboard(item)}
                  style={{ height: "100%", width: "100%" }}
                  variant="thumbnail"
                />
              </button>
            ))}
          </div>
        ) : (
          <button
            className="apple-node-well nodrag relative block overflow-hidden rounded-[14px]"
            onClick={() => data.onPreview?.(image)}
            style={{ height: metrics.previewHeight, margin: "0 auto", width: metrics.previewWidth }}
            type="button"
          >
            <ImageFrame alt={data.title} className="pointer-events-none" fit={previewFit} image={image} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(image)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
          </button>
        )
      ) : (
        <label className="apple-node-well nodrag flex cursor-pointer flex-col items-center justify-center rounded-[14px] border-dashed p-4 text-center" style={{ height: metrics.previewHeight }}>
          <ImagePlus className="mb-1.5 size-7 text-white/48" />
          <span className="text-[10.5px] font-medium text-white/72">上传 / 拖拽 / 粘贴图片</span>
          <span className="apple-caption mt-1 text-[10px]">PNG · JPG · WebP</span>
          <input
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) data.onImageFile?.(id, file);
            }}
          />
        </label>
      )}
      {Array.isArray(data.outputs) && data.outputs.length > 2 ? (
        <div className="apple-caption mt-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
          还有 {data.outputs.length - 2} 张
        </div>
      ) : null}
    </section>
  );
});

const OperationNode = memo(function OperationNode({ id, data, selected }: NodeProps<FlowNode>) {
  const catalog = nodeCatalog.find((item) => item.type === data.kind);
  const inputs = inputHandlesByKind[data.kind] || [];
  const output = data.output || null;
  const outputs = Array.isArray(data.outputs) ? data.outputs : output ? [output] : [];
  const isRunning = data.status === "running" || data.status === "queued" || data.status === "saving";
  const isTerminalOutput = data.kind === "output";
  const previewFit = data.kind === "text_to_image" ? textToImagePreviewFit(data.params) : "contain";
  const singleOutput = output && outputs.length === 1 ? output : null;
  const hasVisualOutput = Boolean(singleOutput || outputs.length > 1);
  const contentShellClass = hasVisualOutput || data.kind === "mask_edit"
    ? "apple-node-well space-y-1.5 rounded-[16px] p-1.5"
    : "space-y-1 rounded-[14px] border border-white/[0.055] bg-white/[0.025] px-2 py-1.5";

  return (
    <section
      className={`apple-node-card group relative rounded-[22px] p-2.5 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
      style={{ width: operationNodeWidth(data, outputs) }}
    >
      {inputs.map((input, index) => (
        <div key={input.id} className="absolute left-[-36px] flex items-center gap-1.5 text-[10px] text-white/42" style={{ top: 62 + index * 28 }}>
          <span>{input.label}</span>
          <Handle id={input.id} position={Position.Left} type="target" className="!static !size-3 !translate-x-0 !translate-y-0 !border-white/40 !bg-[#0c0d11]" />
        </div>
      ))}
      {!isTerminalOutput ? (
        <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#8fa7ff] !bg-[#8fa7ff]" />
      ) : null}
      <div className="mb-2.5 flex items-start gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-[#c8d4ff]">
          {catalog?.icon || <Layers className="size-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[11px] font-semibold text-white/88">{data.title}</h3>
            <StatusDot status={data.status || "idle"} />
            <span className="apple-caption shrink-0 text-[10px]">{taskStatusLabel(data.status || "idle")}</span>
          </div>
          <p className="apple-caption mt-1 line-clamp-1 leading-4">{data.subtitle || catalog?.description}</p>
        </div>
        <button
          className="apple-button-danger nodrag flex size-6 shrink-0 items-center justify-center opacity-0 transition group-hover:opacity-100"
          onClick={() => data.onDelete?.(id)}
          title="删除节点"
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      <div className={contentShellClass}>
        {data.kind === "mask_edit" ? (
          <div className="space-y-2">
            <button
              className="apple-button nodrag flex h-8 w-full items-center justify-center gap-1.5 text-[11px] transition"
              onClick={() => data.onMaskEdit?.(id)}
              type="button"
            >
              <Brush className="size-3.5" />
              涂抹蒙版
            </button>
            <div className="apple-caption leading-4">
              先打开涂抹面板圈出区域，具体修补要求在右侧参数里填写。
            </div>
            {stringParam(paramsValue(data, "maskDataUrl")) || stringParam(paramsValue(data, "maskImageUrl")) ? (
              <div className="apple-pill-accent rounded-xl px-2 py-1.5 text-[10px]">已保存蒙版</div>
            ) : null}
          </div>
        ) : null}
        {singleOutput ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <CompactOutputSummary images={outputs} />
            <button
              className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
              onClick={() => data.onPreview?.(singleOutput)}
              style={compactThumbStyle(singleOutput, 72, 64)}
              title="查看结果"
              type="button"
            >
              <ImageFrame alt={data.title} className="pointer-events-none" fit={previewFit} image={singleOutput} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(singleOutput)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
            </button>
          </div>
        ) : (
          <>
            {outputs.length ? <CompactOutputSummary images={outputs} /> : <NodeSummary data={data} />}
            {output && outputs.length > 1 ? (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {outputs.slice(0, 2).map((item, index) => (
                <button
                  className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
                  key={`${item.id}-${index}`}
                  onClick={() => data.onPreview?.(item)}
                  style={{ ...compactThumbStyle(item, 108, 68), margin: "0 auto" }}
                  title={`查看第 ${index + 1} 张结果`}
                  type="button"
                >
                  <ImageFrame alt={`${data.title}-${index + 1}`} className="pointer-events-none" fit={previewFit} image={item} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(item)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
                </button>
              ))}
            </div>
            ) : null}
          </>
        )}
        {outputs.length > 2 ? (
          <div className="apple-caption mt-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            还有 {outputs.length - 2} 张
          </div>
        ) : null}
        {data.error ? <div className="rounded-xl bg-[#ff6b5f]/12 px-2 py-1.5 text-[10px] leading-4 text-[#ffb4a8]">{friendlyDisplayError(String(data.error))}</div> : null}
      </div>

      <button
        className="apple-button-primary nodrag mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 text-[10.5px] font-semibold disabled:opacity-45"
        disabled={isRunning}
        onClick={() => data.onRun?.(id)}
        type="button"
      >
        {isRunning ? <RefreshCcw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        运行节点
      </button>
    </section>
  );
});

const WORKBENCH_NODE_TYPES: NodeTypes = {
  image_input: ImageInputNode,
  text_to_image: OperationNode,
  image_to_image: OperationNode,
  fuse_images: OperationNode,
  outpaint: OperationNode,
  resize: OperationNode,
  remove_background: OperationNode,
  layer_output: OperationNode,
  replace_product: OperationNode,
  mask_edit: OperationNode,
  hd_redraw: OperationNode,
  upscale_4k: OperationNode,
  output: OperationNode,
};

function NodeSummary({ data }: { data: WorkflowNodeData }) {
  const params = data.params;
  if (data.kind === "text_to_image") return <SummaryLine label="文生图" value={`${stringParam(params.prompt) || "未填写"}${textReferenceNodeItems(data).length ? ` · 图片 ${textReferenceNodeItems(data).length}` : ""}`} />;
  if (data.kind === "fuse_images") return <SummaryLine label="AI合成" value={stringParam(params.fusionMode) || "主体入景"} />;
  if (data.kind === "outpaint") return <SummaryLine label="AI扩图" value={`${stringParam(params.direction) || "四周"} · ${stringParam(params.targetRatio) || "16:9"}`} />;
  if (data.kind === "mask_edit") return <SummaryLine label="局部涂抹" value={`${stringParam(params.prompt) || "先涂抹区域，再写修补要求"} · ${Boolean(params.preserveOutsideMask ?? true) ? "锁定外区" : "可修改外区"}`} />;
  if (data.kind === "resize") return <SummaryLine label="AI改尺寸" value={`${stringParam(params.targetSize) || defaultTargetSizeForRatio(ratioParam(params.targetRatio))} · ${resizeFitModeLabel(stringParam(params.fitMode))}`} />;
  if (data.kind === "remove_background") return <SummaryLine label="透明抠图" value={`${transparentCutoutModeLabel(transparentCutoutModeParam(params.cutoutMode))} · ${transparentCutoutTypeLabel(transparentCutoutTypeParam(params.cutoutType))}`} />;
  if (data.kind === "layer_output") return <SummaryLine label="分层拆图" value={`${params.includeBackground !== false ? "无字背景" : ""}${params.includeBackground !== false && params.includeTextLayer !== false ? " + " : ""}${params.includeTextLayer !== false ? "文字透明PNG" : ""}`} />;
  if (data.kind === "hd_redraw") return <SummaryLine label="高清重绘" value="原比例 · 真清晰 · 不改版" />;
  if (data.kind === "upscale_4k") return <SummaryLine label="4K无损导出" value={`${upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")} · ${resizeFitModeLabel(stringParam(params.fitMode))}`} />;
  if (data.kind === "output") return <SummaryLine label="格式" value={(stringParam(params.format) || "png").toUpperCase()} />;
  return <SummaryLine label="要求" value={stringParam(params.prompt) || "在右侧填写参数"} />;
}

function CompactOutputSummary({ images }: { images: ImageAsset[] }) {
  const firstImage = images[0];
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 px-0.5 py-0.5">
      <div className="shrink-0 truncate text-[10px] font-semibold text-white/78">
        {images.length > 1 ? `${images.length} 个方案` : imageNodeTitle(firstImage, "方案一")}
      </div>
      {firstImage ? <div className="apple-caption min-w-0 truncate text-[9.5px]">{compactImageMeta(firstImage)}</div> : null}
    </div>
  );
}

function operationNodeWidth(data: WorkflowNodeData, outputs: ImageAsset[]) {
  if (data.kind === "output") return 224;
  if (data.kind === "layer_output") return 252;
  if (outputs.length > 1) return 256;
  if (outputs.length === 1 && outputs[0]) {
    const ratio = imageRatio(outputs[0]);
    if (ratio < 0.78) return 224;
    if (ratio > 1.65) return 248;
    return 236;
  }
  if (data.kind === "resize" || data.kind === "upscale_4k" || data.kind === "hd_redraw") return 236;
  if (data.kind === "text_to_image" || data.kind === "image_to_image") return 248;
  return 248;
}

function textReferenceNodeItems(data: WorkflowNodeData) {
  const refs = data.textReferencePreviews;
  if (!Array.isArray(refs)) return [];
  return refs.filter((item): item is { label: string; role: TextReferenceRole; weight: TextReferenceWeight; image: ImageAsset } => Boolean(item && typeof item === "object" && (item as { image?: ImageAsset }).image));
}

function paramsValue(data: WorkflowNodeData, key: string) {
  return data.params?.[key];
}

function InlineChipRow({
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
      <span className="mr-1 text-[9px] text-white/34">{label}</span>
      {options.map((option) => (
        <button
          className={`rounded-full px-2 py-1 text-[9px] transition ${
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

function SizePresetSelect({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[9px] text-white/34">{label}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {resizePresets.map((preset) => (
          <button
            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] transition ${
              value === preset.label
                ? "border-white/40 bg-white text-black shadow-[0_10px_28px_rgba(255,255,255,0.14)]"
                : "border-white/10 bg-white/[0.045] text-white/62 hover:border-white/18 hover:bg-white/[0.08]"
            }`}
            key={preset.id}
            onClick={() => onChange(preset.label)}
            type="button"
          >
            <RatioGlyph ratio={preset.targetRatio} selected={value === preset.label} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RatioGlyph({ ratio, selected }: { ratio: string; selected: boolean }) {
  const [rawWidth, rawHeight] = ratio === "custom" ? [5, 4] : ratio.split(":").map((item) => Number(item) || 1);
  const width = Math.max(8, Math.min(18, rawWidth >= rawHeight ? 18 : Math.round((rawWidth / rawHeight) * 18)));
  const height = Math.max(8, Math.min(18, rawHeight > rawWidth ? 18 : Math.round((rawHeight / rawWidth) * 18)));
  return (
    <span
      aria-hidden="true"
      className={`flex h-[18px] w-[18px] items-center justify-center ${selected ? "text-black" : "text-white/62"}`}
    >
      <span
        className={`block rounded-[3px] border ${selected ? "border-black/70 bg-black/10" : "border-current bg-white/[0.04]"}`}
        style={{ height, width }}
      />
    </span>
  );
}

function ChatComposer({
  brandSummary,
  brandUsage,
  effectiveModel,
  hasKey,
  model,
  onBrandUsageChange,
  onImageFile,
  onModelChange,
  onPasteHint,
  onPromptChange,
  onQualityChange,
  onRatioChange,
  onSubmit,
  prompt,
  quality,
  ratio,
  selectedNode,
  modelOptions,
}: {
  brandSummary: BrandAssetSummary;
  brandUsage: BrandAssetUsage;
  effectiveModel: string;
  hasKey: boolean;
  model: string;
  onBrandUsageChange: (value: BrandAssetUsage) => void;
  onImageFile: (file: File) => void;
  onModelChange: (value: string) => void;
  onPasteHint: () => void;
  onPromptChange: (value: string) => void;
  onQualityChange: (value: QualityValue) => void;
  onRatioChange: (value: AspectRatioValue) => void;
  onSubmit: () => void;
  prompt: string;
  quality: QualityValue;
  ratio: AspectRatioValue;
  selectedNode: FlowNode | null;
  modelOptions: ModelCatalogItem[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuAreaRef = useRef<HTMLDivElement | null>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const ratios: AspectRatioValue[] = adaptiveRatioOptions;
  const qualityOptions = [
    { label: "标准", description: "适合快速出图", value: "standard" as QualityValue },
    { label: "2K", description: "更清晰，适合交付检查", value: "2k" as QualityValue },
    { label: "4K", description: "高清输出，适合成品交付", value: "4k" as QualityValue },
  ];
  const menuModelOptions = useMemo(
    () => [
      { label: modelOptions.length ? "Auto" : "未测试模型", description: modelOptions.length ? "默认图片模型" : "到 API 页测试通过后显示", value: "" },
      ...modelOptions.map((item) => ({
        label: item.label || item.id,
        description: item.lastTestMessage || item.description || item.capabilities.join(" / "),
        value: item.id,
      })),
    ],
    [modelOptions],
  );
  const activeModelLabel = menuModelOptions.find((item) => item.value === model)?.label || model || "Auto";
  const selectedPromptNode = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? selectedNode : null;
  const selectedPromptNodeValue = selectedPromptNode ? stringParam(selectedPromptNode.data.params.prompt) : "";
  const selectedPromptNodeDefault = selectedPromptNode ? stringParam(defaultParamsByKind[selectedPromptNode.data.kind]?.prompt) : "";
  const displayPrompt = selectedPromptNode
    ? prompt || (selectedPromptNodeValue.trim() && selectedPromptNodeValue.trim() !== selectedPromptNodeDefault.trim() ? selectedPromptNodeValue : "")
      : prompt;
  const composerPlaceholder = selectedPromptNode
    ? composerPlaceholderForNode(selectedPromptNode)
    : "输入提示词";
  const composerTitle = selectedPromptNode
    ? composerTitleForNode(selectedPromptNode)
    : "文生图";
  const composerHelper = selectedPromptNode
    ? composerHelperTextForNode(selectedPromptNode)
    : "";
  const removeBackgroundRunsLocally = selectedPromptNode?.data.kind === "remove_background" &&
    transparentCutoutModeParam(selectedPromptNode.data.params.cutoutMode) !== "ai_regenerate";
  const canSubmit = (removeBackgroundRunsLocally || Boolean(effectiveModel)) && (selectedPromptNode ? canSubmitComposerForNode(selectedPromptNode, displayPrompt) : Boolean(prompt.trim()));
  const anyMenuOpen = uploadMenuOpen || modelMenuOpen || ratioMenuOpen || qualityMenuOpen || brandMenuOpen;

  function closeMenus() {
    setUploadMenuOpen(false);
    setModelMenuOpen(false);
    setRatioMenuOpen(false);
    setQualityMenuOpen(false);
    setBrandMenuOpen(false);
  }

  useEffect(() => {
    if (!anyMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof globalThis.Node && menuAreaRef.current?.contains(event.target)) return;
      closeMenus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenus();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anyMenuOpen]);

  function handleFiles(files: FileList | File[]) {
    const file = Array.from(files).find(isSupportedImageFile);
    if (file) onImageFile(file);
    setUploadMenuOpen(false);
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 w-[min(680px,calc(100vw-24px))] -translate-x-1/2 px-2">
      <div
        className="apple-panel-strong pointer-events-auto relative overflow-visible"
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="px-3.5 pb-0.5 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="apple-section-title">{composerTitle}</div>
              {composerHelper ? <div className="apple-caption mt-0.5 line-clamp-1 max-w-[460px] text-white/42">{composerHelper}</div> : null}
            </div>
            {selectedPromptNode ? (
              <div className="apple-pill shrink-0 px-2.5 py-1 text-[11px]">
                {nodeKindLabel(selectedPromptNode.data.kind)}
              </div>
            ) : null}
          </div>
          <textarea
            data-composer-input="true"
            className="mt-1.5 max-h-[96px] min-h-[42px] w-full resize-none bg-transparent text-[14px] leading-5 text-white/92 outline-none placeholder:text-white/34 focus-visible:shadow-none"
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              onSubmit();
            }}
            placeholder={composerPlaceholder}
            value={displayPrompt}
          />
          {hasKey && !effectiveModel ? (
            <div className="apple-caption mt-1 text-[#ffe1a0]">图片模型需先在 API 页测试通过。</div>
          ) : null}
        </div>

        <div ref={menuAreaRef} className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 sm:flex-nowrap sm:px-4">
          <div className="relative">
            <button
              className={`apple-button flex size-8 items-center justify-center rounded-full text-white/74 transition ${
                uploadMenuOpen ? "bg-white/[0.13] text-white" : ""
              }`}
              onClick={() => {
                setUploadMenuOpen((value) => !value);
                setModelMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="上传文件"
              type="button"
            >
              <Plus className="size-5" />
            </button>
            {uploadMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[204px] overflow-hidden p-1.5">
                <button className="apple-menu-item flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium" onClick={() => fileInputRef.current?.click()} type="button">
                  <FileImage className="size-4 text-white/58" />
                  <span>
                    <span className="block">上传</span>
                    <span className="apple-menu-meta mt-0.5 block">PNG / JPG / WebP</span>
                  </span>
                </button>
                <button
                  className="apple-menu-item flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium"
                  onClick={() => {
                    onPasteHint();
                    setUploadMenuOpen(false);
                  }}
                  type="button"
                >
                  <Camera className="size-4 text-white/58" />
                  <span>
                    <span className="block">粘贴截图</span>
                    <span className="apple-menu-meta mt-0.5 block">图片输入</span>
                  </span>
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              type="file"
              onChange={(event) => {
                if (event.target.files) handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <div className="relative">
            <button
              className={`apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-white/74 ${
                ratioMenuOpen ? "bg-white/[0.13] text-white" : ""
              }`}
              onClick={() => {
                setRatioMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setModelMenuOpen(false);
                setQualityMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="切换比例"
              type="button"
            >
              {ratioOptionLabel(ratio)}
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {ratioMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[152px] overflow-hidden p-1.5">
                {ratios.map((item) => (
                  <button
                    className="apple-menu-item flex items-center justify-between px-3 py-2 text-[12px] font-medium"
                    key={item}
                    onClick={() => {
                      onRatioChange(item);
                      setRatioMenuOpen(false);
                    }}
                    type="button"
                  >
                    {ratioOptionLabel(item)}
                    {ratio === item ? <Check className="size-4 text-white/82" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={`apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-white/74 transition ${
                qualityMenuOpen ? "bg-white/[0.13] text-white" : ""
              }`}
              onClick={() => {
                setQualityMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setModelMenuOpen(false);
                setRatioMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="切换分辨率"
              type="button"
            >
              {qualityOptions.find((item) => item.value === quality)?.label || "标准"}
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {qualityMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[188px] overflow-hidden p-1.5">
                {qualityOptions.map((item) => (
                  <button
                    className="apple-menu-item flex items-center justify-between gap-3 px-3 py-2.5 text-left text-[12px] font-medium"
                    key={item.value}
                    onClick={() => {
                      onQualityChange(item.value);
                      setQualityMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-white/88">{item.label}</span>
                      <span className="apple-menu-meta mt-0.5 block truncate">{item.description}</span>
                    </span>
                    {quality === item.value ? <Check className="size-4 text-white/82" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={`apple-button flex h-8 max-w-[124px] shrink items-center gap-1.5 px-2.5 text-[11px] font-semibold text-white/74 sm:max-w-[176px] ${
                modelMenuOpen ? "bg-white/[0.13] text-white" : ""
              }`}
              onClick={() => {
                setModelMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="切换模型"
              type="button"
            >
              <span className="truncate whitespace-nowrap">{activeModelLabel}</span>
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {modelMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[320px] p-2">
                {menuModelOptions.map((item) => (
                  <button
                    className="apple-menu-item flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    key={item.label}
                    onClick={() => {
                      onModelChange(item.value);
                      setModelMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white/88">{item.label}</span>
                      <span className="apple-menu-meta mt-0.5 block truncate text-[11px]">{item.description}</span>
                    </span>
                    {(item.value || "") === (model || "") ? <Check className="size-4 shrink-0 text-white/82" /> : null}
                  </button>
                ))}
                <div className="mt-1 border-t border-white/10 px-3 pt-2">
                  <label className="apple-field-label block">自定义</label>
                  <input
                    className="apple-input mt-1 h-9 w-full px-3 text-[12px] outline-none"
                    onChange={(event) => onModelChange(event.target.value)}
                    placeholder="模型名"
                    value={model}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              className={`apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-white/74 ${
                brandMenuOpen ? "bg-white/[0.13] text-white" : ""
              }`}
              onClick={() => {
                setBrandMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setModelMenuOpen(false);
              }}
              title="项目资产调用"
              type="button"
            >
              <Palette className="size-3.5" />
              项目调用
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {brandMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[300px] p-2">
                <div className="px-2 pb-2 pt-1">
                  <div className="text-[12px] font-semibold text-white/86">项目资产调用</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="apple-pill px-2 py-1 text-[10px]">色卡 {brandSummary.colorCount}</span>
                    <span className="apple-pill px-2 py-1 text-[10px]">Logo {brandSummary.logoCount}</span>
                    <span className="apple-pill px-2 py-1 text-[10px]">IP {brandSummary.ipCount}</span>
                    <span className="apple-pill px-2 py-1 text-[10px]">码 {brandSummary.qrCount}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {brandUsageItems.map((item) => (
                    <button
                      className="apple-menu-item flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      key={item.key}
                      onClick={() => onBrandUsageChange({ ...brandUsage, [item.key]: !brandUsage[item.key] })}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/58">{item.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-[12px] font-semibold text-white/86">{item.label}</span>
                          <span className="apple-menu-meta mt-0.5 block truncate text-[10px]">{item.description}</span>
                        </span>
                      </span>
                      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${brandUsage[item.key] ? "bg-[#74e3c5]" : "bg-white/12"}`}>
                        <span className={`block size-4 rounded-full bg-white transition ${brandUsage[item.key] ? "translate-x-4" : ""}`} />
                      </span>
                    </button>
                  ))}
                </div>
                {brandSummary.missing.length ? (
                  <div className="mt-2 rounded-[14px] border border-[#ffe1a0]/14 bg-[#ffe1a0]/8 px-3 py-2 text-[10px] leading-4 text-[#ffe1a0]/82">
                    缺：{brandSummary.missing.slice(0, 4).join(" / ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              className="apple-button-primary flex h-9 items-center justify-center gap-1.5 px-3.5 text-[12px] font-semibold disabled:bg-white/[0.08] disabled:text-white/30"
              disabled={!canSubmit}
              onClick={() => {
                closeMenus();
                onSubmit();
              }}
              title="生成"
              type="button"
            >
              <ArrowUp className="size-4" />
              {selectedPromptNode ? "运行" : "生成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const brandUsageItems: Array<{
  key: keyof BrandAssetUsage;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { key: "usePrimaryColors", label: "主色", description: "优先使用项目主色", icon: <Palette className="size-3.5" /> },
  { key: "useSecondaryColors", label: "辅助配色", description: "带入辅助/强调/背景/文字色", icon: <Layers className="size-3.5" /> },
  { key: "useLogo", label: "Logo", description: "明确要求时调用已上传 Logo", icon: <ShieldCheck className="size-3.5" /> },
  { key: "useIpImage", label: "IP形象", description: "明确要求时参考项目 IP", icon: <Sticker className="size-3.5" /> },
  { key: "useContact", label: "联系方式", description: "明确要求时引用电话/地址", icon: <FileImage className="size-3.5" /> },
  { key: "useQrCode", label: "二维码", description: "明确要求时调用已上传二维码", icon: <ScanLine className="size-3.5" /> },
  { key: "useCopy", label: "常用文案", description: "带入项目宣传语和卖点", icon: <Sparkles className="size-3.5" /> },
  { key: "useForbiddenRules", label: "禁用规则", description: "避免改错品牌与敏感内容", icon: <ShieldCheck className="size-3.5" /> },
];

function RightPanel({
  historyImages,
  historyHasMore,
  historyLoadingMore,
  projectId,
  tabHint,
  tabHintTick,
  onDeleteHistory,
  onAddHistoryToCanvas,
  onDuplicateBranch,
  onEditImage,
  onToggleFavorite,
  onLoadMoreHistory,
  onDragHistory,
  onResizeHistory,
  onUpscaleHistory,
  onPreview,
  onCreateLayerOutputNode,
  onClose,
  selectedNode,
  tasks,
  onCancelTask,
  onDeleteTask,
  onDeleteFinishedTasks,
  onMaskEdit,
  onParamChange,
  onRetryTask,
  onCreateAction,
  onRunNode,
}: {
  historyImages: ImageAsset[];
  historyHasMore: boolean;
  historyLoadingMore: boolean;
  projectId: string;
  tabHint: RightPanelTab;
  tabHintTick: number;
  onDeleteHistory: (image: ImageAsset) => void;
  onAddHistoryToCanvas: (image: ImageAsset) => void;
  onDuplicateBranch: (image: ImageAsset, options?: { prompt?: string; forkBranch?: boolean }) => void;
  onEditImage: (image: ImageAsset, options?: { prompt?: string; forkBranch?: boolean }) => void;
  onToggleFavorite: (image: ImageAsset) => void;
  onLoadMoreHistory: () => void;
  onDragHistory: (event: DragEvent<HTMLElement>, image: ImageAsset) => void;
  onResizeHistory: (image: ImageAsset) => void;
  onUpscaleHistory: (image: ImageAsset) => void;
  onPreview: (image: ImageAsset) => void;
  onCreateLayerOutputNode: (image: ImageAsset) => void;
  onClose: () => void;
  selectedNode: FlowNode | null;
  tasks: TaskRecord[];
  onCancelTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDeleteFinishedTasks: () => void;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRetryTask: (taskId: string) => void;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onRunNode: (nodeId: string) => void;
}) {
  const rawSelectedOutputs = selectedNode?.data.outputs || (selectedNode?.data.output ? [selectedNode.data.output] : []);
  const selectedOutputs = useMemo(() => sortResultImagesForDisplay(rawSelectedOutputs).filter(isUserFacingResultImage), [rawSelectedOutputs]);
  const visibleHistoryImages = useMemo(() => historyImages.filter(isUserFacingResultImage), [historyImages]);
  const [tab, setTab] = useState<RightPanelTab>("tasks");
  const selectedPanelNodeId = selectedNode?.id;
  const runningTaskCount = tasks.filter(isTaskActivelyRunning).length;
  const deferredTaskCount = tasks.filter(isDeferredQueuedTask).length;
  const failedTaskCount = tasks.filter((task) => task.status === "failed").length;
  const taskBadgeCount = runningTaskCount + deferredTaskCount + failedTaskCount || tasks.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTab(tabHint);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tabHint, tabHintTick]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTab((current) => (!selectedPanelNodeId && current === "params" ? (tasks.length ? "tasks" : "library") : current));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedPanelNodeId, tasks.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="apple-hairline border-b p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-[16px] font-semibold text-white/90">检查器</div>
          </div>
          <button
            className="apple-button flex size-7 items-center justify-center text-white/56"
            onClick={onClose}
            title="收起右侧面板"
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="apple-panel grid grid-cols-3 gap-1 p-0.5">
          {[
            ["params", "参数"],
            ["tasks", "任务"],
            ["library", "结果"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`apple-segment flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] ${tab === value ? "apple-segment-active" : ""}`}
              onClick={() => setTab(value as RightPanelTab)}
              type="button"
            >
              <span>{label}</span>
              {value === "tasks" && taskBadgeCount ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${failedTaskCount ? "bg-[#ff6b5f]/18 text-[#ffb4a8]" : runningTaskCount ? "bg-[#ffd166]/18 text-[#ffe1a0]" : "bg-white/12 text-white/58"}`}>
                  {taskBadgeCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {tab === "params" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="space-y-3">
            <NodeInspectorPanel node={selectedNode} onCreateAction={onCreateAction} onMaskEdit={onMaskEdit} onParamChange={onParamChange} onRunNode={onRunNode} />
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <TaskCenter
            emptyState={<EmptyPanel icon={<Sparkles className="size-8" />} title="暂无任务" description="" />}
            formatDuration={formatDuration}
            formatGeneratedAt={formatGeneratedAt}
            isDeferredQueuedTask={(task) => isDeferredQueuedTask(task as TaskRecord)}
            isTaskPossiblyStuck={(task) => isTaskPossiblyStuck(task as TaskRecord)}
            onCancel={onCancelTask}
            onDelete={onDeleteTask}
            onDeleteFinished={onDeleteFinishedTasks}
            onPreview={(image) => onPreview(image as ImageAsset)}
            onRetry={onRetryTask}
            taskStatusLabel={(status) => taskStatusLabel(status as NodeStatus)}
            tasks={tasks}
          />
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="space-y-3">
            {selectedOutputs.length ? (
              <NodeResultsPanel
                images={selectedOutputs}
                onPreview={onPreview}
              />
            ) : null}
            <HistoryPanel
              emptyState={<EmptyPanel icon={<FileImage className="size-8" />} title="暂无结果" description="" />}
              formatFileSize={formatFileSize}
              historyMatchesFilter={(image, filter, currentProjectId) => historyMatchesFilter(image as ImageAsset, filter, currentProjectId)}
              historyMatchesQuery={(image, query) => historyMatchesQuery(image as ImageAsset, query)}
              images={visibleHistoryImages}
              hasMoreFromServer={historyHasMore}
              loadingMore={historyLoadingMore}
              nodeOperationLabel={nodeOperationLabel}
              projectId={projectId}
              onAddToCanvas={(image) => onAddHistoryToCanvas(image as ImageAsset)}
              onDrag={(event, image) => onDragHistory(event, image as ImageAsset)}
              onLayerOutputNode={(image) => onCreateLayerOutputNode(image as ImageAsset)}
              onLoadMore={onLoadMoreHistory}
              onDelete={(image) => onDeleteHistory(image as ImageAsset)}
              onPreview={(image) => onPreview(image as ImageAsset)}
              onResize={(image) => onResizeHistory(image as ImageAsset)}
              onToggleFavorite={(image) => onToggleFavorite(image as ImageAsset)}
              onUpscale={(image) => onUpscaleHistory(image as ImageAsset)}
              canLayerOutput={(image) => canLayerOutput(image as ImageAsset)}
              qualityBadgeLabel={(image) => qualityBadgeLabel(image as ImageAsset)}
              qualityTone={(image) => qualityTone(image as ImageAsset)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NodeInspectorPanel({
  node,
  onCreateAction,
  onMaskEdit,
  onParamChange,
  onRunNode,
}: {
  node: FlowNode | null;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRunNode: (nodeId: string) => void;
}) {
  if (!node) {
    return <EmptyPanel icon={<Layers className="size-8" />} title="未选择节点" description="" />;
  }

  const params = node.data.params || {};
  const isRunning = node.data.status === "running" || node.data.status === "queued" || node.data.status === "saving";
  const hasModel = ("model" in params || node.data.kind !== "image_input") &&
    (node.data.kind !== "remove_background" || transparentCutoutModeParam(params.cutoutMode) === "ai_regenerate");
  const hasPrompt = ["text_to_image", "image_to_image", "fuse_images", "outpaint", "resize", "replace_product", "mask_edit", "hd_redraw"].includes(node.data.kind);
  const promptLivesInComposer = hasPrompt && isComposerDrivenNode(node.data.kind);
  const modelLivesInComposer = hasModel && isComposerDrivenNode(node.data.kind);

  return (
    <div className="space-y-3">
      <section className="apple-surface-section px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/84">{node.data.title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusDot status={node.data.status || "idle"} />
            <span className="apple-caption">{taskStatusLabel(node.data.status || "idle")}</span>
          </div>
        </div>
        {node.data.error ? <div className="mt-3 rounded-2xl bg-[#ff6b5f]/12 px-3 py-2.5 text-[10px] leading-5 text-[#ffb4a8]">{friendlyDisplayError(String(node.data.error))}</div> : null}
      </section>

      {hasPrompt && !promptLivesInComposer ? (
        <InspectorTextarea
          label={node.data.kind === "mask_edit" ? "要改什么" : "Prompt"}
          onChange={(value) => onParamChange(node.id, "prompt", value)}
          placeholder="写生成、修改或保留内容"
          value={stringParam(params.prompt)}
        />
      ) : null}

      {hasModel && !modelLivesInComposer ? (
        <InspectorInput
          label="模型"
          onChange={(value) => onParamChange(node.id, "model", value)}
          placeholder="默认模型"
          value={stringParam(params.model)}
        />
      ) : null}

      {node.data.kind === "image_input" ? (
        <SmartRecommendations node={node} onCreateAction={onCreateAction} />
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <InspectorSection title="生成设置">
          <InlineChipRow label="比例" value={ratioParam(params.aspectRatio)} options={adaptiveRatioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          <InlineChipRow label="完整" value={textToImageCompositionCompleteness(params)} options={["标准", "更完整", "大留白", "全身/全物体"]} onChange={(value) => onParamChange(node.id, "compositionCompleteness", value)} />
          <InlineChipRow label="边距" value={textToImageSafeMargin(params)} options={["5%", "10%", "15%", "20%"]} onChange={(value) => onParamChange(node.id, "safeMargin", value)} />
          <InlineChipRow label="镜头" value={textToImageCameraDistance(params)} options={["近景", "中景", "远景", "自动"]} onChange={(value) => onParamChange(node.id, "cameraDistance", value)} />
          <InlineChipRow label="主体" value={textToImageSubjectScale(params)} options={["大", "中", "小"]} onChange={(value) => onParamChange(node.id, "subjectScale", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "image_to_image" || node.data.kind === "fuse_images" ? (
        <InspectorSection title="图像生成">
          {node.data.kind === "fuse_images" ? (
            <>
              <div className="rounded-[16px] border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] leading-5 text-white/46">
                图1主体 → 图2场景。输出 A 自然合成 / B 广告合成。
              </div>
              <InlineChipRow
                label="合成"
                value={stringParam(params.fusionMode) || "主体入景"}
                options={["主体入景", "产品入景", "人物换装", "产品换Logo", "IP入海报", "自定义合成"]}
                onChange={(value) => onParamChange(node.id, "fusionMode", value)}
              />
            </>
          ) : (
            <InlineChipRow label="比例" value={ratioParam(params.aspectRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          )}
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "outpaint" ? (
        <InspectorSection title="扩图参数">
          <InlineChipRow label="扩到" value={ratioParam(params.targetRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "targetRatio", value)} />
          <InlineChipRow label="方向" value={stringParam(params.direction) || "四周"} options={["四周", "左", "右", "上", "下"]} onChange={(value) => onParamChange(node.id, "direction", value)} />
          {ratioParam(params.targetRatio) === "custom" ? (
            <InspectorInput label="目标尺寸" placeholder="例如 1920x750" value={stringParam(params.targetSize)} onChange={(value) => onParamChange(node.id, "targetSize", value)} />
          ) : null}
        </InspectorSection>
      ) : null}

      {node.data.kind === "resize" ? (
        <InspectorSection title="改尺寸">
          <SizePresetSelect
            label="比例"
            value={stringParam(params.sizePreset) === "自定义" ? "自定义" : findSizePresetByLabel(stringParam(params.sizePreset))?.label || activeResizePresetLabel(node.data)}
            onChange={(label) => {
              const preset = findSizePresetByLabel(label);
              if (!preset) return;
              onParamChange(node.id, "sizePreset", preset.label);
              onParamChange(node.id, "targetRatio", preset.targetRatio);
              onParamChange(node.id, "targetSize", preset.targetSize);
              onParamChange(node.id, "fitMode", preset.recommendedMode);
            }}
          />
          {ratioParam(params.targetRatio) === "custom" || stringParam(params.sizePreset) === "自定义" ? (
            <InspectorInput
              label="自定义宽高"
              placeholder="例如 1920x1080"
              value={stringParam(params.targetSize) || "1920x1080"}
              onChange={(value) => {
                onParamChange(node.id, "targetSize", value);
                onParamChange(node.id, "targetRatio", inferRatioFromTargetSize(value));
                onParamChange(node.id, "sizePreset", "自定义");
              }}
            />
          ) : null}
          <InlineChipRow
            label="处理"
            value={resizeFitModeLabel(stringParam(params.fitMode))}
            options={["智能改版", "扩图补画"]}
            onChange={(label) => onParamChange(node.id, "fitMode", resizeFitModeValue(label))}
          />
        </InspectorSection>
      ) : null}

      {node.data.kind === "remove_background" ? (
        <InspectorSection title="透明抠图">
          <div className="rounded-2xl border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2.5 text-[10px] leading-5 text-[#adf8e5]">
            真实抠图保留原主体；AI重生适合复杂边缘、头发、艺术字和光效。两种都会输出真透明 PNG。
          </div>
          <InlineChipRow
            label="方式"
            value={transparentCutoutModeLabel(transparentCutoutModeParam(params.cutoutMode))}
            options={["真实抠图", "AI重生透明图"]}
            onChange={(value) => onParamChange(node.id, "cutoutMode", transparentCutoutModeValue(value))}
          />
          <InlineChipRow
            label="类型"
            value={transparentCutoutTypeLabel(transparentCutoutTypeParam(params.cutoutType))}
            options={["自动主体", "人物", "产品", "Logo/Icon", "文字/标题", "IP形象"]}
            onChange={(value) => onParamChange(node.id, "cutoutType", transparentCutoutTypeValue(value))}
          />
          <InlineChipRow
            label="容差"
            value={String(params.tolerance || 34)}
            options={["24", "34", "46", "62"]}
            onChange={(value) => onParamChange(node.id, "tolerance", Number(value) || 34)}
          />
        </InspectorSection>
      ) : null}

      {node.data.kind === "layer_output" ? (
        <InspectorSection title="分层拆图">
          <div className="rounded-2xl border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2.5 text-[10px] leading-5 text-[#adf8e5]">
            从已选图片拆出同尺寸无文字背景和文字透明 PNG。文字 PNG 会检测 alpha 通道，失败时可单独重试。
          </div>
          <div className="grid gap-2">
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] text-white/68">
              生成无文字背景
              <input checked={params.includeBackground !== false} className="accent-[#74e3c5]" onChange={(event) => onParamChange(node.id, "includeBackground", event.target.checked)} type="checkbox" />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] text-white/68">
              生成文字透明 PNG
              <input checked={params.includeTextLayer !== false} className="accent-[#74e3c5]" onChange={(event) => onParamChange(node.id, "includeTextLayer", event.target.checked)} type="checkbox" />
            </label>
          </div>
        </InspectorSection>
      ) : null}

      {node.data.kind === "upscale_4k" || node.data.kind === "hd_redraw" ? (
        <InspectorSection title={node.data.kind === "upscale_4k" ? "4K无损导出" : "高清重绘"}>
          {node.data.kind === "upscale_4k" ? (
            <>
              <div className="rounded-2xl border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[10px] leading-5 text-[#adf8e5]">
                默认无损放大：保持画面、文字、颜色和构图不变，不调用 AI，不裁切。
              </div>
              <InlineChipRow
                label="模式"
                value={resizeFitModeLabel(stringParam(params.fitMode))}
                options={["4K无损导出", "AI高清重绘"]}
                onChange={(value) => onParamChange(node.id, "fitMode", resizeFitModeValue(value))}
              />
              {stringParam(params.fitMode) === "ai_redraw" ? (
                <div className="rounded-2xl border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[10px] leading-5 text-[#ffe1a3]">
                  AI高清重绘可能改变文字、细节和局部构图；带文字设计稿不推荐使用。
                </div>
              ) : null}
              <InlineChipRow
                label="目标"
                value={upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}
                options={["长边2048", "长边3840", "长边4096", "长边7680"]}
                onChange={(value) => onParamChange(node.id, "targetSize", value)}
              />
            </>
          ) : null}
          {node.data.kind === "hd_redraw" ? (
            <div className="rounded-2xl border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[10px] leading-5 text-[#adf8e5]">
              保持原比例、版式、文字、Logo 和主体位置，只让画面、文字边缘、图标线条和细节更清楚。完成后可再接 2K/4K 导出。
            </div>
          ) : (
            <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          )}
        </InspectorSection>
      ) : null}

      {node.data.kind === "mask_edit" ? (
        <InspectorSection title="涂抹设置">
          <button className="apple-button flex h-9 w-full items-center justify-center gap-1.5 text-[11px] text-white/76 transition" onClick={() => onMaskEdit(node.id)} type="button">
            <Brush className="size-3.5" />
            涂抹
          </button>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] text-white/60">
            <input
              checked={Boolean(params.preserveOutsideMask ?? true)}
              className="size-3.5 accent-[#74e3c5]"
              onChange={(event) => onParamChange(node.id, "preserveOutsideMask", event.target.checked)}
              type="checkbox"
            />
            锁定未涂抹区域
          </label>
          <InspectorInput label="羽化" placeholder="12" value={String(params.maskFeather || 12)} onChange={(value) => onParamChange(node.id, "maskFeather", Number(value) || 12)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "output" ? (
        <InspectorSection title="输出">
          <InlineChipRow label="格式" value={stringParam(params.format) || "png"} options={["png", "jpg"]} onChange={(value) => onParamChange(node.id, "format", value)} />
        </InspectorSection>
      ) : null}

      <button
        className="apple-button-primary flex h-10 w-full items-center justify-center gap-1.5 text-[12px] font-semibold transition disabled:opacity-45"
        disabled={isRunning || node.data.kind === "image_input"}
        onClick={() => onRunNode(node.id)}
        type="button"
      >
        {isRunning ? <RefreshCcw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {node.data.kind === "image_input" ? "图片节点" : "运行"}
      </button>
    </div>
  );
}

function InspectorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="apple-surface-section space-y-2 p-3">
      <div className="apple-section-title text-[12px] text-white/72">{title}</div>
      {children}
    </section>
  );
}

function SmartRecommendations({
  node,
  onCreateAction,
}: {
  node: FlowNode;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
}) {
  const image = node.data.output || node.data.image || null;
  const recommendations = buildImageRecommendations(image as ImageAsset | null);

  return (
    <InspectorSection title="智能推荐">
      <div className="space-y-2">
        {recommendations.map((item) => (
          <button
            className="apple-panel flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.08]"
            key={`${item.type}-${item.label}`}
            onClick={() => onCreateAction(node.id, item.type, item.handle, item.params)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-white/76">{item.label}</span>
              <span className="apple-caption mt-1 block truncate">{item.reason}</span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-white/28" />
          </button>
        ))}
      </div>
    </InspectorSection>
  );
}

function InspectorInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="apple-field-label mb-1 block">{label}</span>
      <input
        className="apple-input h-9 w-full px-3 text-[11px] text-white/76 outline-none placeholder:text-white/28"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function InspectorTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="apple-surface-section block p-3">
      <span className="apple-field-label mb-1.5 block">{label}</span>
      <textarea
        className="min-h-[104px] w-full resize-none bg-transparent text-[12px] leading-5 text-white/80 outline-none placeholder:text-white/28"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NodeResultsPanel({
  images,
  onPreview,
}: {
  images: ImageAsset[];
  onPreview: (image: ImageAsset) => void;
}) {
  if (!images.length) {
    return <EmptyPanel icon={<Images className="size-8" />} title="暂无结果" description="" />;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {images.map((image, index) => (
        <button
          className="apple-surface-section group min-w-0 overflow-hidden p-1.5 text-left transition hover:bg-white/[0.07]"
          key={`${image.id}-${index}`}
          onClick={() => onPreview(image)}
          title={image.branchLabel || image.fileName || `方案 ${image.variant || index + 1}`}
          type="button"
        >
          <ImageFrame
            alt={image.branchLabel || image.fileName || `方案 ${image.variant || index + 1}`}
            className="rounded-[14px] border-white/8"
            fit="contain"
            image={image}
            preserveRatio={false}
            showCheckerboard={shouldShowCheckerboard(image)}
            style={{ ...compactThumbStyle(image, 124, 76), margin: "0 auto" }}
            variant="thumbnail"
          />
          <div className="mt-1.5 truncate px-1 text-[10px] font-semibold text-white/64">
            {image.branchLabel || `方案 ${image.variant || index + 1}`}
          </div>
        </button>
      ))}
    </div>
  );
}

function NodeMenu({
  onClose,
  onSelect,
  x,
  y,
}: {
  onClose: () => void;
  onSelect: (type: NodeKind) => void;
  x: number;
  y: number;
}) {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-node-menu-root='true']")) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="apple-panel-strong fixed z-50 w-[270px] rounded-[22px] p-2" data-node-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div className="apple-section-title text-[11px] text-white/72">添加节点</div>
        <button aria-label="关闭添加节点菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        {nodeCatalog.map((item) => (
          <button
            className="apple-menu-item flex w-full items-center gap-3 px-2.5 py-2.5 text-left"
            key={item.type}
            onClick={() => onSelect(item.type)}
            type="button"
          >
            <span className="apple-button flex size-8 items-center justify-center rounded-xl text-white/72">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-white/82">{item.label}</span>
              <span className="apple-menu-meta mt-0.5 block truncate">{item.description}</span>
            </span>
            <ChevronRight className="size-3.5 text-white/24" />
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickMenu({
  onClose,
  onDelete,
  onSelect,
  x,
  y,
}: {
  onClose: () => void;
  onDelete: () => void;
  onSelect: (action: (typeof quickActions)[number]) => void;
  x: number;
  y: number;
}) {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-quick-menu-root='true']")) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="apple-panel-strong fixed z-50 w-[210px] rounded-[20px] p-2" data-quick-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div className="apple-section-title text-[11px] text-white/72">快速操作</div>
        <button aria-label="关闭快速操作菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      {quickActions.map((action) => (
        <button className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-white/72" key={action.type} onClick={() => onSelect(action)} type="button">
          {action.label}
          <ChevronRight className="size-3.5 text-white/28" />
        </button>
      ))}
      <div className="my-1 border-t border-white/10" />
      <button className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-[#ffb4a8] hover:bg-[#ff6b5f]/10" onClick={onDelete} type="button">
        删除节点
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function ImageLightbox({
  image,
  historyImages,
  projectProfile,
  onClose,
  onCopyImage,
  onCopyPrompt,
  onDelete,
  onEditImage,
  onMaskEdit,
  onKeep,
  onOpenVersion,
  onResize,
  onSaveLayers,
  onTransparentPng,
  onCreateLayerOutputNode,
  onLayerOutput,
  onSaveLayerOutputs,
  onUpscale,
}: {
  image: ImageAsset;
  historyImages: ImageAsset[];
  projectProfile: ProjectProfile;
  onClose: () => void;
  onCopyImage: (image: ImageAsset) => Promise<void>;
  onCopyPrompt: (prompt: string) => Promise<void>;
  onDelete: () => void;
  onEditImage: (prompt?: string) => void;
  onMaskEdit: (options: HistoryMaskEditOptions) => void;
  onKeep: () => void;
  onOpenVersion: (image: ImageAsset) => void;
  onResize: (options: HistoryResizeOptions) => void;
  onSaveLayers: (layers: EditableLayer[]) => void;
  onTransparentPng: (image: ImageAsset, options?: TransparentCutoutOptions) => Promise<ImageAsset | null>;
  onCreateLayerOutputNode: (image: ImageAsset) => void;
  onLayerOutput: (image: ImageAsset, options?: LayerOutputOptions) => Promise<LayerOutputResult>;
  onSaveLayerOutputs: (images: ImageAsset[]) => Promise<void>;
  onUpscale: (options: HistoryUpscaleOptions) => void;
}) {
  const [message, setMessage] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"actions" | "info">("actions");
  const [activeEditTool, setActiveEditTool] = useState<"optimize" | "mask" | "resize" | "upscale" | "transparent" | "layers" | null>(null);
  const [showLayerEditor, setShowLayerEditor] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showMoreFooterActions, setShowMoreFooterActions] = useState(false);
  const [layerOutput, setLayerOutput] = useState<LayerOutputResult | null>(null);
  const [layers, setLayers] = useState<EditableLayer[]>(() => normalizeEditableLayers(image, projectProfile));
  const [selectedLayerId, setSelectedLayerId] = useState<string>(() => {
    const initialLayers = normalizeEditableLayers(image, projectProfile);
    return initialLayers.find((layer) => layer.kind === "text")?.id || initialLayers[0]?.id || "";
  });
  const [optimizePrompt, setOptimizePrompt] = useState("");
  const [maskPrompt, setMaskPrompt] = useState("");
  const [resizeRatio, setResizeRatio] = useState<AspectRatioValue>(() => ratioFromImage(image));
  const [resizeSize, setResizeSize] = useState(() => defaultTargetSizeForRatio(ratioFromImage(image)));
  const [resizeFitMode, setResizeFitMode] = useState<HistoryResizeOptions["fitMode"]>("smart_relayout");
  const [upscaleSize, setUpscaleSize] = useState(() => inferTargetSizeFromImage(image));
  const [upscaleFitMode, setUpscaleFitMode] = useState<HistoryUpscaleOptions["fitMode"]>("keep_ratio");
  const [showGuides, setShowGuides] = useState(false);
  const transparentRecommendation = useMemo(() => recommendTransparentCutout(image), [image]);
  const [transparentMode, setTransparentMode] = useState<TransparentCutoutMode>(() => transparentRecommendation.mode);
  const [transparentType, setTransparentType] = useState<TransparentCutoutType>(() => transparentRecommendation.cutoutType);
  const [transparentTolerance, setTransparentTolerance] = useState("34");
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) || layers.find((layer) => layer.kind === "text") || layers[0] || null;
  const layoutCheck = inspectLayoutReadability({ ...image, editableLayers: layers }, layers);
  const branchVersions = useMemo(
    () => sortImagesByGeneratedAt(historyImages.filter((item) => imageBranchId(item) === imageBranchId(image))),
    [historyImages, image],
  );
  const branchLatestVariants = useMemo(() => {
    const branchMap = new Map<string, ImageAsset>();
    historyImages
      .filter((item) => (item.resultGroupId || item.sourceTaskId) && (item.resultGroupId || item.sourceTaskId) === (image.resultGroupId || image.sourceTaskId))
      .forEach((item) => {
        const key = imageBranchId(item);
        const current = branchMap.get(key);
        if (!current || new Date(item.generatedAt || 0).getTime() > new Date(current.generatedAt || 0).getTime()) {
          branchMap.set(key, item);
        }
      });
    return Array.from(branchMap.values()).sort((a, b) => (a.variant || 0) - (b.variant || 0));
  }, [historyImages, image]);
  const actualSizeLabel = imageSizeLabel(image);
  const expectedSizeLabel = image.expectedOutputSize ? `${image.expectedOutputSize.width} × ${image.expectedOutputSize.height}px` : "";
  const lightboxTitle = `${image.branchLabel || `方案 ${image.variant || 1}`} · ${image.mode || image.materialType || "预览"}`;
  const lightboxMeta = [
    actualSizeLabel,
    image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : "",
  ].filter(Boolean).join(" · ");

  async function runAction(label: string, action: () => void | Promise<void>) {
    setMessage(`${label}中...`);
    try {
      await action();
      setMessage(`${label}成功`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}失败`);
    }
  }

  function startLayerOutputNode() {
    onCreateLayerOutputNode(image);
    onClose();
  }

  function updateLayer(layerId: string, patch: Partial<EditableLayer>) {
    setLayers((current) => current.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)));
  }

  function addTextLayer() {
    const layer: EditableLayer = {
      id: `layer_text_${Date.now()}`,
      kind: "text",
      label: "新增文字",
      text: "双击这里修改文字",
      x: 18,
      y: 18,
      width: 64,
      height: 12,
      fontSize: 42,
      color: "#ffffff",
      fontWeight: 700,
      lineHeight: 1.15,
      letterSpacing: 0,
      align: "center",
      strokeColor: "rgba(0,0,0,0.42)",
      strokeWidth: 0,
      shadowColor: "rgba(0,0,0,0.55)",
      shadowBlur: 10,
      visible: true,
      locked: false,
    };
    setLayers((current) => [...current, layer]);
    setSelectedLayerId(layer.id);
  }

  function applyRecommendedLayout() {
    setLayers((current) => applyLayoutTemplate(current, image));
    setMessage("已套用推荐版式，可继续微调文字和锁定区域。");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(10,15,24,0.6)] p-2 backdrop-blur-2xl sm:p-5" onClick={onClose}>
      <div className="apple-panel-strong flex max-h-[94vh] w-[min(1280px,97vw)] flex-col overflow-hidden rounded-[22px] shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <button className="apple-button rounded-full px-2.5 py-1 text-[10px]" onClick={onClose} type="button">返回结果</button>
            </div>
            <div className="truncate text-[14px] font-semibold text-white/88">{lightboxTitle}</div>
            {lightboxMeta ? <div className="apple-meta mt-0.5">{lightboxMeta}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="关闭预览" className="apple-button flex size-8 items-center justify-center text-white/62" onClick={onClose} type="button">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white/[0.035] lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 p-3 sm:p-4">
            <div className="relative flex h-full min-h-[320px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(8,12,20,0.72)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {showLayerEditor ? (
                <button className="apple-button absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px]" onClick={() => setShowGuides((value) => !value)} type="button">
                  {showGuides ? "隐藏辅助线" : "显示辅助线"}
                </button>
              ) : null}
              <div className="relative mx-auto overflow-hidden rounded-[20px] border border-white/12 bg-[rgba(12,17,26,0.72)] shadow-[0_24px_80px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]" style={largePreviewFrameStyle(image)}>
	                <ImageFrame alt={image.fileName || image.id} className="h-full w-full" fit="contain" image={image} loading="eager" preserveRatio={false} variant="original" style={{ height: "100%" }} />
                {showGuides ? <LayoutGuides image={image} /> : null}
                {showLayerEditor ? <div className="absolute inset-0">
                  {layers.filter((layer) => layer.visible !== false).map((layer) => (
                    <button
                      className={`absolute border text-left transition ${selectedLayerId === layer.id ? "border-[#74e3c5] bg-[#74e3c5]/10" : layer.locked ? "border-[#ffd166]/35 bg-[#ffd166]/8" : "border-white/20 bg-white/[0.035]"} ${layer.kind !== "text" ? "rounded-lg" : ""}`}
                      key={layer.id}
                      onClick={() => setSelectedLayerId(layer.id)}
                      style={{
                        left: `${layer.x}%`,
                        top: `${layer.y}%`,
                        width: `${layer.width}%`,
                        height: `${layer.height}%`,
                      }}
                      title={layer.locked ? `${layer.label} 已锁定` : layer.label}
                      type="button"
                    >
                      {layer.kind === "text" ? (
                        <span
                          className="block h-full w-full overflow-hidden px-1"
                          style={{
                            color: layer.color || "#ffffff",
                            fontSize: `${Math.max(10, Math.min(72, (layer.fontSize || 32) / 5))}px`,
                            fontWeight: layer.fontWeight || 700,
                            letterSpacing: `${layer.letterSpacing || 0}px`,
                            lineHeight: layer.lineHeight || 1.15,
                            textAlign: layer.align || "center",
                            WebkitTextStroke: layer.strokeWidth ? `${layer.strokeWidth}px ${layer.strokeColor || "rgba(0,0,0,0.45)"}` : undefined,
                            textShadow: `0 1px ${Math.max(0, layer.shadowBlur || 0)}px ${layer.shadowColor || "rgba(0,0,0,0.55)"}`,
                          }}
                        >
                          {layer.text || layer.label}
                        </span>
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-white/70">
                          {layer.locked ? "锁定 " : ""}{layer.label}
                        </span>
                      )}
                    </button>
                  ))}
                </div> : null}
            </div>
          </div>
          </div>
          <aside className="min-h-0 overflow-auto border-t border-white/10 bg-white/[0.06] p-3 backdrop-blur-2xl sm:p-4 lg:border-l lg:border-t-0">
            <div className="space-y-3">
              <section className="apple-surface-section p-3">
                <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-white/10 bg-white/[0.055] p-1">
                  {[
                    ["actions", "操作"],
                    ["info", "详情"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`apple-segment px-2 py-1.5 text-[11px] ${sidebarTab === value ? "apple-segment-active" : ""}`}
                      onClick={() => setSidebarTab(value as "actions" | "info")}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="apple-button-primary px-3 py-2 text-[11px] font-semibold" onClick={() => void runAction("保留此版", onKeep)} type="button">保留此版</button>
                  <button className="apple-button px-3 py-2 text-[11px]" onClick={() => void runAction("下载 PNG", () => downloadImageFile(image, "png"))} type="button">下载 PNG</button>
                  <button className="apple-button px-3 py-2 text-[11px]" onClick={() => setShowMoreFooterActions((value) => !value)} type="button">
                    {showMoreFooterActions ? "收起更多" : "更多"}
                  </button>
                </div>
                {showMoreFooterActions ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-[16px] border border-white/10 bg-white/[0.05] p-2">
                    <button className="apple-button px-3 py-2 text-[11px]" onClick={() => void runAction("下载 JPG", () => downloadImageFile(image, "jpg"))} type="button">下载 JPG</button>
                    <button className="apple-button px-3 py-2 text-[11px]" onClick={() => void runAction("下载 WebP", () => downloadImageFile(image, "webp"))} type="button">下载 WebP</button>
                    <button className="apple-button px-3 py-2 text-[11px]" onClick={() => void runAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">复制 Prompt</button>
                    <button className="apple-button px-3 py-2 text-[11px]" onClick={() => void runAction("复制图片", () => onCopyImage(image))} type="button">复制图片</button>
                    {canLayerOutput(image) ? (
                      <button className="apple-button px-3 py-2 text-[11px]" onClick={startLayerOutputNode} type="button">分层拆图</button>
                    ) : null}
                    <button className="apple-button-danger px-3 py-2 text-[11px]" onClick={onDelete} type="button">删除当前图</button>
                  </div>
                ) : null}
              </section>

              {branchLatestVariants.length > 1 ? (
                <section className="apple-surface-section p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="apple-section-title">同任务方案</div>
                    <div className="apple-caption">{branchLatestVariants.length} 张</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {branchLatestVariants.map((variantImage, index) => (
                      <button
                        className={`overflow-hidden rounded-[16px] border text-left transition ${imageBranchId(variantImage) === imageBranchId(image) ? "border-[#8fa7ff]/55 bg-[#8fa7ff]/12" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"}`}
                        key={imageKey(variantImage)}
                        onClick={() => onOpenVersion(variantImage)}
                        type="button"
                      >
	                        <ImageFrame alt={variantImage.fileName || variantImage.id || `方案 ${index + 1}`} className="rounded-none border-0" fit="contain" image={variantImage} preserveRatio={false} variant="thumbnail" style={{ height: 68 }} />
                        <div className="p-2">
                          <div className="truncate text-[11px] font-semibold text-white/80">{variantImage.branchLabel || `方案 ${variantImage.variant || index + 1}`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {branchVersions.length > 1 ? (
                <section className="apple-surface-section p-3">
                  <VersionStrip
                    accentClassName="border-[#74e3c5]/48 bg-[#74e3c5]/10"
                    items={branchVersions.map((version, index) => ({
                      id: imageKey(version),
                      image: version,
                      ratioStyle: imageRatioStyle(version),
                      selected: imageKey(version) === imageKey(image),
                      subtitle: formatGeneratedAt(version.generatedAt),
                      title: `版本 ${index + 1}`,
                    }))}
                    label="当前方案版本"
                    onSelect={(itemId) => {
                      const target = branchVersions.find((version) => imageKey(version) === itemId);
                      if (target) onOpenVersion(target);
                    }}
                  />
                </section>
              ) : null}

              {sidebarTab === "actions" ? (
                <>
                  <section className="apple-surface-section p-3">
                    <div className="apple-section-title">编辑当前方案</div>
                    <div className="apple-caption mt-1">先选操作，再确认参数。</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["optimize", "二次优化"],
                        ["mask", "局部修改"],
                        ["resize", "改尺寸"],
                        ["upscale", "4K无损导出"],
                        ["transparent", "透明抠图"],
                        ...(canLayerOutput(image) ? [["layers", "分层拆图"]] : []),
                      ].map(([value, label]) => (
                        <button
                          className={`${activeEditTool === value ? "apple-button-primary font-semibold" : "apple-button"} px-3 py-2 text-[11px]`}
                          key={value}
                          onClick={() => {
                            if (value === "layers") {
                              startLayerOutputNode();
                              return;
                            }
                            setActiveEditTool((current) => current === value ? null : value as typeof activeEditTool);
                          }}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </section>

                  {activeEditTool === "optimize" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">二次优化设置</div>
                      <div className="apple-caption mt-1">只写这次要改什么。</div>
                      <textarea
                        className="apple-textarea mt-2 min-h-[84px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
                        onChange={(event) => setOptimizePrompt(event.target.value)}
                        placeholder="例如：保持构图和人物不变，减弱过亮装饰，标题更清楚。"
                        value={optimizePrompt}
                      />
                      <button className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40" disabled={!optimizePrompt.trim()} onClick={() => onEditImage(optimizePrompt.trim())} type="button">
                        创建二次优化节点
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "mask" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">局部修改设置</div>
                      <div className="apple-caption mt-1">写要求，再涂抹区域。</div>
                      <textarea
                        className="apple-textarea mt-2 min-h-[84px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
                        onChange={(event) => setMaskPrompt(event.target.value)}
                        placeholder="例如：只把右下角装饰换成科技馆机器人，不改标题和人物。"
                        value={maskPrompt}
                      />
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={!maskPrompt.trim()}
                        onClick={() => onMaskEdit({ prompt: maskPrompt, quality: image.quality === "4k" ? "2k" : image.quality || "standard" })}
                        type="button"
                      >
                        进入涂抹修改
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "resize" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">改比例</div>
                      <div className="apple-caption mt-1">选择常用比例；自定义再填写宽高。</div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {resizePresets.map((preset) => (
                          <button
                            className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] transition ${
                              resizeRatio === preset.targetRatio
                                ? "border-white/40 bg-white text-black shadow-[0_10px_28px_rgba(255,255,255,0.14)]"
                                : "border-white/10 bg-white/[0.045] text-white/62 hover:border-white/18 hover:bg-white/[0.08]"
                            }`}
                            key={preset.id}
                            onClick={() => {
                              setResizeRatio(preset.targetRatio);
                              setResizeSize(preset.targetSize);
                            }}
                            type="button"
                          >
                            <RatioGlyph ratio={preset.targetRatio} selected={resizeRatio === preset.targetRatio} />
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className={`mt-2 ${resizeRatio === "custom" ? "grid grid-cols-2 gap-2" : ""}`}>
                        {resizeRatio === "custom" ? <MiniInput label="自定义宽高" value={resizeSize} onChange={setResizeSize} /> : null}
                        <label className="block">
                          <span className="apple-field-label mb-1 block">处理方式</span>
                          <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={resizeFitMode} onChange={(event) => setResizeFitMode(event.target.value as HistoryResizeOptions["fitMode"])}>
                            <option value="smart_relayout">智能改版</option>
                            <option value="smart_outpaint">扩图补画</option>
                          </select>
                        </label>
                      </div>
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={!parseTargetSize(resizeSize).width || !parseTargetSize(resizeSize).height}
                        onClick={() => onResize({ targetRatio: resizeRatio, targetSize: resizeSize, fitMode: resizeFitMode, quality: "standard" })}
                        type="button"
                      >
                        按此尺寸创建任务
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "upscale" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">4K无损导出设置</div>
                      <div className="apple-caption mt-1">默认只放大，不重绘。</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {upscaleSizeOptionsForImage(image).map((value) => (
                          <button className={`${upscaleSize === value ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[10px]`} key={value} onClick={() => setUpscaleSize(value)} type="button">
                            {value}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <MiniInput label="输出目标" value={upscaleSize} onChange={setUpscaleSize} />
                        <label className="block">
                          <span className="apple-field-label mb-1 block">处理方式</span>
                          <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={upscaleFitMode} onChange={(event) => setUpscaleFitMode(event.target.value as HistoryUpscaleOptions["fitMode"])}>
                            <option value="keep_ratio">4K无损导出</option>
                            <option value="ai_redraw">AI高清重绘</option>
                          </select>
                        </label>
                      </div>
                      {upscaleFitMode === "ai_redraw" ? (
                        <div className="mt-2 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[10px] leading-5 text-[#ffe1a3]">
                          AI高清重绘可能改变文字、细节和局部构图；带文字设计稿不推荐使用。
                        </div>
                      ) : null}
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={!isValidUpscaleTarget(upscaleSize)}
                        onClick={() => onUpscale({ targetSize: upscaleSize, fitMode: upscaleFitMode, quality: "4k" })}
                        type="button"
                      >
                        {upscaleFitMode === "ai_redraw" ? "创建 AI 高清重绘任务" : "按原比例无损导出"}
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "transparent" ? (
                    <TransparentCutoutPanel
                      image={image}
                      mode={transparentMode}
                      recommendation={transparentRecommendation}
                      tolerance={transparentTolerance}
                      type={transparentType}
                      onModeChange={setTransparentMode}
                      onToleranceChange={setTransparentTolerance}
                      onTypeChange={setTransparentType}
                      onRun={(nextMode = transparentMode) => void runAction(transparentCutoutModeLabel(nextMode), async () => {
                        const output = await onTransparentPng(image, {
                          mode: nextMode,
                          cutoutType: transparentType,
                          tolerance: Number(transparentTolerance || 34) || 34,
                        });
                        if (output) await downloadImageFile(output, "png", "cutout-transparent.png");
                      })}
                    />
                  ) : null}

                  {activeEditTool === "layers" ? (
                    <LayerOutputPanel
                      image={image}
                      output={layerOutput}
                      onDownload={(layerImage, fileName) => void runAction("下载图层", () => downloadImageFile(layerImage, "png", fileName))}
                      onPreview={(layerImage) => onOpenVersion(layerImage)}
                      onRegenerate={async (options) => {
                        const output = await onLayerOutput(image, options);
                        const merged = mergeLayerOutputResults(layerOutput, output);
                        setLayerOutput(merged);
                        setMessage(layerOutputSuccessMessage(merged));
                        return merged;
                      }}
                      onSaveToProject={(layerImage) => void runAction("保存素材", () => onSaveLayerOutputs([layerImage]))}
                    />
                  ) : null}

                  <section className="apple-surface-section p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="apple-section-title">排版</div>
                        <div className="apple-caption mt-1">需要时再打开图层。</div>
                      </div>
                      <button className="apple-button shrink-0 rounded-full px-3 py-1.5 text-[10px]" onClick={() => setShowLayerEditor((value) => !value)} type="button">
                        {showLayerEditor ? "收起" : "打开"}
                      </button>
                    </div>
                  </section>

                  {showLayerEditor ? (
                    <LayoutEditorPanel
                      image={image}
                      layers={layers}
                      layoutCheck={layoutCheck}
                      selectedLayer={selectedLayer}
                      showGuides={showGuides}
                      onAddText={addTextLayer}
                      onApplyTemplate={applyRecommendedLayout}
                      onSave={() => onSaveLayers(layers)}
                      onSelect={setSelectedLayerId}
                      onToggleGuides={() => setShowGuides((value) => !value)}
                      onUpdate={updateLayer}
                    />
                  ) : null}
                </>
              ) : null}

              {sidebarTab === "info" ? (
                <>
                  <section className="apple-surface-section p-3">
                    <div className="apple-section-title">详情</div>
                    <div className="mt-2 space-y-1.5 text-[10px] leading-4 text-white/52">
                      {expectedSizeLabel && expectedSizeLabel !== actualSizeLabel ? <DetailLine label="目标" value={expectedSizeLabel} /> : null}
                      <DetailLine label="模型" value={image.model || "unknown"} />
                      <DetailLine label="质检" value={qualityBadgeLabel(image)} />
                      {image.qualityCheck?.clarityCheckLabel ? <DetailLine label="清晰度" value={image.qualityCheck.clarityCheckLabel} /> : null}
                      <DetailLine label="版本" value={`${branchVersions.length} 个版本`} />
                      {image.sourceStrategyTitle ? <DetailLine label="来源" value={image.sourceStrategyTitle} /> : null}
                    </div>
                  </section>

                  <section className="apple-surface-section p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="apple-section-title">生成 Prompt</div>
                      <button className="apple-button rounded-full px-2.5 py-1 text-[10px]" onClick={() => setShowPromptDetails((value) => !value)} type="button">
                        {showPromptDetails ? "收起" : "展开"}
                      </button>
                    </div>
                    <div className={`mt-2 overflow-auto rounded-[14px] border border-white/10 bg-white/[0.055] p-2 text-[10px] leading-4 text-white/42 ${showPromptDetails ? "max-h-[240px]" : "max-h-[92px]"}`}>
                      {image.prompt || "没有记录 Prompt。"}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="apple-button flex-1 px-3 py-2 text-[11px]" onClick={() => void runAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">复制 Prompt</button>
                      <button className="apple-button flex-1 px-3 py-2 text-[11px]" onClick={() => void runAction("复制图片", () => onCopyImage(image))} type="button">复制图片</button>
                    </div>
                  </section>

                  {image.qualityCheck?.issues?.length ? (
                    <div className="rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 p-3 text-[10px] leading-5 text-[#ffc1b8]">
                      <div className="mb-1 font-semibold">质检提醒</div>
                      {image.qualityCheck.issues.slice(0, 4).map((issue) => <div key={issue}>· {issue}</div>)}
                    </div>
                  ) : (
                    <div className="rounded-[14px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 p-3 text-[10px] leading-5 text-[#adf8e5]">
                      质检正常。
                    </div>
                  )}
                </>
              ) : null}

              {message ? <div className="apple-caption rounded-[14px] border border-white/10 bg-white/[0.055] px-3 py-2 text-white/44">{message}</div> : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TransparentCutoutPanel({
  image,
  mode,
  recommendation,
  tolerance,
  type,
  onModeChange,
  onRun,
  onToleranceChange,
  onTypeChange,
}: {
  image: ImageAsset;
  mode: TransparentCutoutMode;
  recommendation: TransparentCutoutRecommendation & { cutoutType?: TransparentCutoutType };
  tolerance: string;
  type: TransparentCutoutType;
  onModeChange: (mode: TransparentCutoutMode) => void;
  onRun: (mode?: TransparentCutoutMode) => void;
  onToleranceChange: (value: string) => void;
  onTypeChange: (type: TransparentCutoutType) => void;
}) {
  return (
    <section className="apple-surface-section p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="apple-section-title">透明抠图</div>
          <div className="apple-caption mt-1">输出透明 PNG。</div>
        </div>
      </div>

      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-[16px] border border-white/10 bg-white/[0.05] p-2">
        <ImageFrame alt={image.fileName || image.id} image={image} preserveRatio={false} variant="thumbnail" style={{ height: 60 }} />
        <div className="min-w-0 py-0.5">
          <div className="truncate text-[11px] font-semibold text-white/78">{image.fileName || image.mode || "当前图片"}</div>
        </div>
      </div>

      <div className="mt-3 rounded-[14px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[10px] leading-5 text-[#adf8e5]">
        推荐：{transparentCutoutModeLabel(recommendation.mode)}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {transparentModeOptions.map((item) => (
          <button
            className={`${mode === item.value ? "apple-button-primary font-semibold" : "apple-button"} px-3 py-2 text-left text-[11px]`}
            key={item.value}
            onClick={() => onModeChange(item.value)}
            type="button"
          >
            <span className="block">{item.label}</span>
            <span className="mt-0.5 block text-[9px] font-normal opacity-70">{item.note}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        <div className="apple-field-label mb-1.5">抠图类型</div>
        <div className="flex flex-wrap gap-1.5">
          {transparentTypeOptions.map((item) => (
            <button
              className={`${type === item.value ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[10px]`}
              key={item.value}
              onClick={() => onTypeChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mode !== "ai_regenerate" ? (
        <div className="mt-3">
          <div className="apple-field-label mb-1.5">真实抠图容差</div>
          <div className="flex flex-wrap gap-1.5">
            {["24", "34", "46", "62"].map((value) => (
              <button className={`${tolerance === value ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[10px]`} key={value} onClick={() => onToleranceChange(value)} type="button">
                {value}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        <button className="apple-button-primary w-full px-3 py-2 text-[11px] font-semibold" onClick={() => onRun(mode)} type="button">
          {mode === "ai_regenerate" ? "重新生成透明图" : "开始抠图"}
        </button>
        {mode !== "ai_regenerate" ? (
          <button className="apple-button w-full px-3 py-2 text-[11px]" onClick={() => {
            onModeChange("ai_regenerate");
            onRun("ai_regenerate");
          }} type="button">
            改用 AI重生透明图
          </button>
        ) : null}
      </div>
    </section>
  );
}

function LayerOutputPanel({
  image,
  output,
  onDownload,
  onPreview,
  onRegenerate,
  onSaveToProject,
}: {
  image: ImageAsset;
  output: LayerOutputResult | null;
  onDownload: (image: ImageAsset, fileName: string) => void;
  onPreview: (image: ImageAsset) => void;
  onRegenerate: (options: LayerOutputOptions) => Promise<LayerOutputResult>;
  onSaveToProject: (image: ImageAsset) => void | Promise<void>;
}) {
  const [includeBackground, setIncludeBackground] = useState(true);
  const [includeTextLayer, setIncludeTextLayer] = useState(true);
  const [maskStrength, setMaskStrength] = useState<"soft" | "normal" | "strong">("normal");
  const [keepGlow, setKeepGlow] = useState(true);
  const [outputCroppedText, setOutputCroppedText] = useState(true);
  const [activeStep, setActiveStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const primaryTextLayer = output?.layers?.textRebuilt || output?.layers?.textLayer || null;
  const layerCards = output ? [
    output.layers?.background ? {
      key: "background",
      title: "无文字背景",
      fileName: "background_no_text.png",
      image: output.layers.background,
      note: "局部去字，保留其他画面",
    } : null,
    primaryTextLayer ? {
      key: "text",
      title: output.layers?.textRebuilt ? "高清文字重建版" : "原图文字抠图版",
      fileName: "text_full.png",
      image: primaryTextLayer,
      note: primaryTextLayer.alphaCheck?.message || (output.layers?.textRebuilt ? "透明文字，无背景碎片" : "原像素提取"),
    } : null,
    output.layers?.textRebuilt && output.layers?.textCutout ? {
      key: "textCutout",
      title: "原图文字抠图版",
      fileName: "text_cutout.png",
      image: output.layers.textCutout,
      note: "简单图对照",
    } : null,
  ].filter((item): item is { key: string; title: string; fileName: string; image: ImageAsset; note: string } => Boolean(item?.image)) : [];
  const debugLayerCards = output && process.env.NODE_ENV !== "production" ? [
    (output.layers?.original || output.layers?.fullPreview) ? {
      key: "original",
      title: "original.png",
      fileName: "original.png",
      image: output.layers.original || output.layers.fullPreview,
      note: "输入原图",
    } : null,
    output.layers?.textAlphaMask || output.layers?.mask ? {
      key: "textAlphaMask",
      title: "text_alpha_mask.png",
      fileName: "text_alpha_mask.png",
      image: output.layers.textAlphaMask || output.layers.mask,
      note: "文字蒙版",
    } : null,
    output.layers?.repairMask ? {
      key: "repairMask",
      title: "repair_mask.png",
      fileName: "repair_mask.png",
      image: output.layers.repairMask,
      note: "修复蒙版",
    } : null,
    output.layers?.backgroundFirstPass ? {
      key: "backgroundFirstPass",
      title: "background_first_pass.png",
      fileName: "background_first_pass.png",
      image: output.layers.backgroundFirstPass,
      note: "首轮背景",
    } : null,
  ].filter((item): item is { key: string; title: string; fileName: string; image: ImageAsset; note: string } => Boolean(item?.image)) : [];
  const textLayer = output?.layers.textLayer;
  const textCropped = output?.layers.textCropped;
  const alphaPassed = Boolean(textLayer?.alphaCheck?.hasAlphaChannel && textLayer.alphaCheck.hasTransparentPixels);
  const progressSteps = ["读取图片", "检测文字", "生成蒙版", "修复背景", "导出 PNG", "完成"];

  async function runSplit(options?: Partial<LayerOutputOptions>) {
    const requestOptions = {
      includeBackground: options?.includeBackground ?? includeBackground,
      includeTextLayer: options?.includeTextLayer ?? includeTextLayer,
      maskStrength,
      keepGlow,
      outputCroppedText,
    };
    if (!requestOptions.includeBackground && !requestOptions.includeTextLayer) return;
    setRunning(true);
    setActiveStep(0);
    await wait(120);
    setActiveStep(1);
    await wait(120);
    setActiveStep(2);
    try {
      await onRegenerate(requestOptions);
      setActiveStep(3);
      await wait(120);
      setActiveStep(4);
      await wait(120);
      setActiveStep(5);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="apple-surface-section p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="apple-section-title">分层拆图</div>
          <div className="apple-caption mt-1">输出背景和文字 PNG。</div>
        </div>
      </div>

      <div className="rounded-[16px] border border-white/10 bg-white/[0.05] p-2">
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
          <ImageFrame alt={image.fileName || image.id} image={image} preserveRatio={false} variant="thumbnail" style={{ height: 60 }} />
          <div className="min-w-0 py-0.5">
            <div className="truncate text-[11px] font-semibold text-white/78">{image.fileName || image.mode || "当前图片"}</div>
            <div className="mt-1 space-y-1 text-[10px] leading-4 text-white/42">
              {image.fileSizeBytes ? <DetailLine label="大小" value={formatFileSize(image.fileSizeBytes)} /> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <LayerOutputOption
          checked={includeBackground}
          label="生成无文字背景"
          note="去文字，保留画面"
          onChange={setIncludeBackground}
        />
        <LayerOutputOption
          checked={includeTextLayer}
          label="生成文字透明 PNG"
          note="简单图抠图，复杂图重建"
          onChange={setIncludeTextLayer}
        />
        <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-white/68">蒙版强度</span>
            <span className="text-[9px] text-white/34">默认标准</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ["soft", "弱"],
              ["normal", "标准"],
              ["strong", "强"],
            ].map(([value, label]) => (
              <button
                className={`rounded-full border px-2 py-1.5 text-[10px] transition ${
                  maskStrength === value ? "border-[#74e3c5]/30 bg-[#74e3c5]/14 text-[#adf8e5]" : "border-white/10 bg-white/[0.04] text-white/48"
                }`}
                key={value}
                onClick={() => setMaskStrength(value as "soft" | "normal" | "strong")}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <LayerOutputOption
          checked={keepGlow}
          label="保留发光阴影"
          note="保留描边、阴影、光晕"
          onChange={setKeepGlow}
        />
        <LayerOutputOption
          checked={outputCroppedText}
          label="输出裁剪版文字 PNG"
          note="另存裁剪版"
          onChange={setOutputCroppedText}
        />
      </div>

      <button
        className="apple-button-primary mt-3 flex w-full items-center justify-center gap-2 px-3 py-2 text-[11px] font-semibold"
        disabled={running || (!includeBackground && !includeTextLayer)}
        onClick={() => void runSplit()}
        type="button"
      >
        {running ? <RefreshCcw className="size-3.5 animate-spin" /> : <Layers className="size-3.5" />}
        {output ? "重新拆分" : "开始拆分"}
      </button>

      {activeStep >= 0 ? (
        <div className="mt-3 grid gap-1.5">
          {progressSteps.map((step, index) => (
            <div key={step} className={`flex items-center gap-2 rounded-[12px] border px-2.5 py-1.5 text-[10px] ${
              index < activeStep || activeStep === progressSteps.length - 1
                ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
                : index === activeStep
                  ? "border-white/16 bg-white/[0.08] text-white/72"
                  : "border-white/8 bg-white/[0.025] text-white/32"
            }`}>
              <span className="flex size-4 items-center justify-center rounded-full bg-white/10 text-[9px]">{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      ) : null}

      {output ? (
        <div className="mt-3 space-y-3">
          {textLayer ? (
            <div className={`rounded-[14px] border px-3 py-2 text-[10px] leading-5 ${
              alphaPassed ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]" : "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffb4a8]"
            }`}>
              {alphaPassed ? "文字 PNG 透明检测通过。" : "文字 PNG 透明检测未通过。"}
              {textCropped ? (
                <button className="ml-2 underline decoration-white/20 underline-offset-4" onClick={() => onDownload(textCropped, "text_cropped.png")} type="button">
                  下载裁剪版
                </button>
              ) : null}
            </div>
          ) : null}

          {output.errors?.background ? (
            <LayerOutputError message={output.errors.background} onRetry={() => void runSplit({ includeBackground: true, includeTextLayer: false })} retryLabel="重新生成背景" />
          ) : null}
          {output.errors?.textLayer ? (
            <LayerOutputError message={output.errors.textLayer} onRetry={() => void runSplit({ includeBackground: false, includeTextLayer: true })} retryLabel="重新生成文字 PNG" />
          ) : null}

          <div className="grid gap-2">
            {layerCards.map((item) => (
              <LayerOutputCard
                fileName={item.fileName}
                image={item.image}
                key={item.key}
                note={item.note}
                onDownload={onDownload}
                onPreview={onPreview}
                onRegenerate={() => void runSplit(item.key === "background" ? { includeBackground: true, includeTextLayer: false } : { includeBackground: false, includeTextLayer: true })}
                onSaveToProject={onSaveToProject}
                title={item.title}
              />
            ))}
          </div>

          {debugLayerCards.length || output.metadata?.metadataUrl ? (
            <details className="rounded-[16px] border border-white/10 bg-white/[0.035] p-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-white/58">调试信息</summary>
              {debugLayerCards.length ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {debugLayerCards.map((item) => (
                    <button className="min-w-0 text-left" key={item.key} onClick={() => onPreview(item.image)} type="button">
                      <ImageFrame alt={item.title} className="rounded-[12px]" image={item.image} preserveRatio={false} variant="thumbnail" style={{ height: 62 }} />
                      <div className="mt-1 truncate text-[9px] text-white/44">{item.title}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              {output.metadata?.metadataUrl ? (
                <a
                  className="apple-button mt-2 flex w-full items-center justify-center gap-2 px-3 py-2 text-[11px] text-white/62"
                  href={output.metadata.metadataUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FileImage className="size-3.5" />
                  元数据
                </a>
              ) : null}
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LayerOutputOption({
  checked,
  label,
  note,
  onChange,
}: {
  checked: boolean;
  label: string;
  note: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-[14px] border px-3 py-2 transition ${
      checked ? "border-[#74e3c5]/22 bg-[#74e3c5]/10" : "border-white/10 bg-white/[0.035]"
    }`}>
      <input
        checked={checked}
        className="mt-0.5 size-4 accent-[#74e3c5]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-white/78">{label}</span>
        <span className="mt-0.5 block text-[9px] leading-4 text-white/42">{note}</span>
      </span>
    </label>
  );
}

function LayerOutputError({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 p-3 text-[10px] leading-5 text-[#ffb4a8]">
      <div>{message}</div>
      <button className="apple-button-danger mt-2 px-3 py-1.5 text-[10px]" onClick={onRetry} type="button">
        {retryLabel}
      </button>
    </div>
  );
}

function LayerOutputCard({
  fileName,
  image,
  note,
  onDownload,
  onPreview,
  onRegenerate,
  onSaveToProject,
  title,
}: {
  fileName: string;
  image: ImageAsset;
  note: string;
  onDownload: (image: ImageAsset, fileName: string) => void;
  onPreview: (image: ImageAsset) => void;
  onRegenerate: () => void;
  onSaveToProject: (image: ImageAsset) => void | Promise<void>;
  title: string;
}) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.045] p-2">
      <div className="mb-2 min-w-0">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-white/76">{title}</div>
          <div className="truncate text-[9px] text-white/36" title={note}>{note}</div>
        </div>
      </div>
      <button className="block w-full" onClick={() => onPreview(image)} type="button">
        <ImageFrame
          alt={title}
          className="rounded-[12px]"
          image={image}
          preserveRatio={false}
          showCheckerboard={shouldShowCheckerboard(image)}
          variant="preview"
          style={{ height: 84 }}
        />
      </button>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button className="apple-button px-2 py-1.5 text-[10px]" onClick={() => onPreview(image)} type="button">查看</button>
        <button className="apple-button px-2 py-1.5 text-[10px]" onClick={() => onDownload(image, fileName)} type="button">下载</button>
        <button className="apple-button px-2 py-1.5 text-[10px]" onClick={() => void onSaveToProject(image)} type="button">保存素材</button>
        <button className="apple-button px-2 py-1.5 text-[10px]" onClick={onRegenerate} type="button">重新生成</button>
      </div>
    </div>
  );
}

function LayoutGuides({ image }: { image: ImageAsset }) {
  const spec = getLayoutTemplateSpec(image);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute border border-white/10" style={{ inset: `${spec.bleed}%` }} />
      <div className="absolute border border-white/16" style={{ inset: `${spec.safety}%` }} />
      <div className="absolute left-1/2 top-0 h-full border-l border-white/20" />
      <div className="absolute left-0 top-1/2 w-full border-t border-white/20" />
      <div className="absolute left-1/3 top-0 h-full border-l border-white/12" />
      <div className="absolute left-2/3 top-0 h-full border-l border-white/12" />
      <div className="absolute left-0 top-1/3 w-full border-t border-white/12" />
      <div className="absolute left-0 top-2/3 w-full border-t border-white/12" />
      {spec.zones.map((zone) => (
        <div
          className="absolute rounded-md border border-white/10 bg-white/[0.025]"
          key={zone.label}
          style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
        />
      ))}
    </div>
  );
}

function LayoutEditorPanel({
  image,
  layers,
  layoutCheck,
  onAddText,
  onApplyTemplate,
  onSave,
  onSelect,
  onToggleGuides,
  onUpdate,
  selectedLayer,
  showGuides,
}: {
  image: ImageAsset;
  layers: EditableLayer[];
  layoutCheck: LayoutCheck;
  onAddText: () => void;
  onApplyTemplate: () => void;
  onSave: () => void;
  onSelect: (id: string) => void;
  onToggleGuides: () => void;
  onUpdate: (layerId: string, patch: Partial<EditableLayer>) => void;
  selectedLayer: EditableLayer | null;
  showGuides: boolean;
}) {
  const templateSpec = getLayoutTemplateSpec(image);
  return (
    <section className="apple-surface-section mt-3 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="apple-section-title">图层与排版</div>
          <div className={`apple-caption mt-0.5 ${layoutCheck.status === "passed" ? "text-[#adf8e5]" : layoutCheck.status === "failed" ? "text-[#ffb4a8]" : "text-[#ffe1a0]"}`}>{templateSpec.name} · {layoutCheck.label}</div>
        </div>
        <button className="apple-button rounded-full px-2.5 py-1.5 text-[10px]" onClick={onToggleGuides} type="button">
          {showGuides ? "隐藏辅助线" : "显示辅助线"}
        </button>
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {layers.map((layer) => (
          <button
            className={`shrink-0 rounded-full px-2.5 py-1.5 text-[10px] transition ${
              selectedLayer?.id === layer.id
                ? "bg-white text-black"
                : layer.locked
                  ? "border border-[#ffd166]/20 bg-[#ffd166]/10 text-[#ffe1a0]"
                  : "apple-button text-white/62"
            }`}
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            type="button"
          >
            {layer.locked ? "锁 " : ""}{layer.label}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-[10px] text-white/42">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">安全边距 {templateSpec.safety}%</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">推荐标题 ≥ {templateSpec.titleFont}px</div>
      </div>
      <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] leading-5 text-white/46">
        辅助线只在预览里帮助排版，不参与生成，也不会导出到最终图片，更不会用于补白。
      </div>
      {selectedLayer ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <MiniInput label="名称" value={selectedLayer.label} onChange={(value) => onUpdate(selectedLayer.id, { label: value })} />
            <label className="block">
              <span className="apple-field-label mb-1 block">锁定</span>
              <button
                className={`h-9 w-full rounded-2xl border px-3 text-[11px] ${
                  selectedLayer.locked ? "border-[#ffd166]/22 bg-[#ffd166]/12 text-[#ffe1a0]" : "border-white/10 bg-white/[0.06] text-white/62"
                }`}
                onClick={() => onUpdate(selectedLayer.id, { locked: !selectedLayer.locked })}
                type="button"
              >
                {selectedLayer.locked ? "已锁定" : "未锁定"}
              </button>
            </label>
          </div>
          {selectedLayer.kind === "text" ? (
            <>
              <label className="block">
                <span className="apple-field-label mb-1 block">文字内容</span>
                <textarea
                  className="apple-textarea min-h-[72px] w-full resize-none px-3 py-2 text-[11px] leading-5 outline-none"
                  disabled={selectedLayer.locked}
                  onChange={(event) => onUpdate(selectedLayer.id, { text: event.target.value })}
                  value={selectedLayer.text || ""}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <MiniInput label="字号" type="number" value={String(selectedLayer.fontSize || 36)} onChange={(value) => onUpdate(selectedLayer.id, { fontSize: Number(value) || 36 })} />
                <MiniInput label="字重" type="number" value={String(selectedLayer.fontWeight || 700)} onChange={(value) => onUpdate(selectedLayer.id, { fontWeight: Number(value) || 700 })} />
                <MiniInput label="字距" type="number" value={String(selectedLayer.letterSpacing || 0)} onChange={(value) => onUpdate(selectedLayer.id, { letterSpacing: Number(value) || 0 })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniInput label="颜色" value={selectedLayer.color || "#ffffff"} onChange={(value) => onUpdate(selectedLayer.id, { color: value })} />
                <MiniInput label="行距" type="number" value={String(selectedLayer.lineHeight || 1.15)} onChange={(value) => onUpdate(selectedLayer.id, { lineHeight: Number(value) || 1.15 })} />
                <label className="block">
                  <span className="apple-field-label mb-1 block">对齐</span>
                  <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={selectedLayer.align || "center"} onChange={(event) => onUpdate(selectedLayer.id, { align: event.target.value as EditableLayer["align"] })}>
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <MiniInput label="描边" type="number" value={String(selectedLayer.strokeWidth || 0)} onChange={(value) => onUpdate(selectedLayer.id, { strokeWidth: Number(value) || 0 })} />
                <MiniInput label="描边色" value={selectedLayer.strokeColor || "rgba(0,0,0,0.42)"} onChange={(value) => onUpdate(selectedLayer.id, { strokeColor: value })} />
                <MiniInput label="阴影" type="number" value={String(selectedLayer.shadowBlur ?? 10)} onChange={(value) => onUpdate(selectedLayer.id, { shadowBlur: Number(value) || 0 })} />
                <MiniInput label="阴影色" value={selectedLayer.shadowColor || "rgba(0,0,0,0.55)"} onChange={(value) => onUpdate(selectedLayer.id, { shadowColor: value })} />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-[10px] leading-5 text-white/42">
              这是{selectedLayer.kind === "logo" ? "Logo" : selectedLayer.kind === "qr" ? "二维码" : "保护"}层。锁定后，AI 后续应只修改背景和非锁定区域。
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            <MiniInput label="X%" type="number" value={String(Math.round(selectedLayer.x))} onChange={(value) => onUpdate(selectedLayer.id, { x: Number(value) || 0 })} />
            <MiniInput label="Y%" type="number" value={String(Math.round(selectedLayer.y))} onChange={(value) => onUpdate(selectedLayer.id, { y: Number(value) || 0 })} />
            <MiniInput label="W%" type="number" value={String(Math.round(selectedLayer.width))} onChange={(value) => onUpdate(selectedLayer.id, { width: Number(value) || 10 })} />
            <MiniInput label="H%" type="number" value={String(Math.round(selectedLayer.height))} onChange={(value) => onUpdate(selectedLayer.id, { height: Number(value) || 8 })} />
          </div>
        </div>
      ) : null}
      {layoutCheck.issues.length ? (
        <div className="mt-3 rounded-2xl border border-[#ffd166]/18 bg-[#ffd166]/10 p-3 text-[10px] leading-5 text-[#ffe1a0]">
          {layoutCheck.suggestions.slice(0, 3).map((item) => <div key={item}>· {item}</div>)}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button className="apple-button flex-1 px-3 py-2 text-[11px]" onClick={onAddText} type="button">新增文字</button>
        <button className="apple-pill-accent flex-1 justify-center px-3 py-2 text-[11px]" onClick={onApplyTemplate} type="button">套用版式</button>
        <button className="apple-button-primary flex-1 px-3 py-2 text-[11px] font-semibold" onClick={onSave} type="button">保存图层</button>
      </div>
    </section>
  );
}

function MiniInput({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="apple-field-label mb-1 block">{label}</span>
      <input
        className="apple-input h-9 w-full px-3 text-[11px] text-white/76 outline-none"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function MaskEditorModal({
  image,
  initialMaskUrl,
  initialPrompt,
  onClose,
  onSave,
}: {
  image: ImageAsset;
  initialMaskUrl: string;
  initialPrompt: string;
  onClose: () => void;
  onSave: (maskDataUrl: string, prompt: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [brushSize, setBrushSize] = useState(48);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [status, setStatus] = useState("在图上涂抹要修补的区域，透明部分会被 AI 重新绘制。");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let cancelled = false;
    const preview = new Image();
    preview.crossOrigin = "anonymous";
    preview.onload = async () => {
      if (cancelled) return;
      const width = preview.naturalWidth || 1;
      const height = preview.naturalHeight || 1;
      const ratio = Math.min(1, 880 / Math.max(1, width), 620 / Math.max(1, height));
      const displayWidth = Math.round(width * ratio);
      const displayHeight = Math.round(height * ratio);
      setDisplaySize({ width: displayWidth, height: displayHeight });
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(0,0,0,0.66)";
      context.fillRect(0, 0, width, height);
      if (initialMaskUrl) {
        const mask = new Image();
        mask.crossOrigin = "anonymous";
        mask.onload = () => {
          if (cancelled) return;
          context.drawImage(mask, 0, 0, width, height);
          setStatus("已加载之前的涂抹区域。继续补画或重新涂抹即可。");
        };
        mask.src = toAbsoluteImageUrl(initialMaskUrl);
      }
    };
    preview.src = image.url;

    return () => {
      cancelled = true;
    };
  }, [image.url, initialMaskUrl]);

  function eraseStroke(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.strokeStyle = "rgba(0,0,0,1)";
    context.beginPath();
    if (from) context.moveTo(from.x, from.y);
    else context.moveTo(to.x, to.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function clearMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(0,0,0,0.66)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setStatus("已清空涂抹。");
  }

  function handlePointer(event: ReactMouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let lastPoint = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    eraseStroke(null, lastPoint);
    let drawing = true;
    const move = (moveEvent: MouseEvent) => {
      if (!drawing) return;
      const nextPoint = {
        x: (moveEvent.clientX - rect.left) * scaleX,
        y: (moveEvent.clientY - rect.top) * scaleY,
      };
      eraseStroke(lastPoint, nextPoint);
      lastPoint = nextPoint;
    };
    const up = () => {
      drawing = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function saveMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasPaintedMask(canvas)) {
      setStatus("请先涂抹要修改的区域。");
      return;
    }
    if (!prompt.trim()) {
      setStatus("请输入要改什么。");
      return;
    }
    onSave(canvas.toDataURL("image/png"), prompt.trim());
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(10,15,24,0.64)] p-4 backdrop-blur-2xl" onClick={onClose}>
      <div
        className="apple-panel-strong flex max-h-[92vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/88">局部涂抹</div>
            <div className="apple-caption mt-0.5">只修改涂抹区域，其他部分保持不变。</div>
          </div>
          <button aria-label="关闭局部涂抹" className="apple-button flex size-8 items-center justify-center text-white/62" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="apple-surface-section mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="apple-field-label">画笔大小</span>
              {[24, 36, 48, 64, 84].map((size) => (
                <button
                  className={`rounded-full px-3 py-1.5 text-[11px] transition ${
                    brushSize === size ? "bg-white text-black" : "apple-button text-white/62"
                  }`}
                  key={size}
                  onClick={() => setBrushSize(size)}
                  type="button"
                >
                  {size}
                </button>
              ))}
              <span className="apple-pill ml-auto px-2.5 py-1 text-[10px]">{status}</span>
            </div>
          </div>
          <div className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#050608]"
              style={{
                width: displaySize.width ? `${displaySize.width}px` : undefined,
                height: displaySize.height ? `${displaySize.height}px` : undefined,
                maxWidth: "88vw",
                maxHeight: "62vh",
              }}
            >
              <img alt={image.fileName || image.id} className="block h-full w-full select-none object-contain" draggable={false} src={image.url} />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                onMouseDown={handlePointer}
                title="按住鼠标在图上涂抹"
              />
            </div>
          </div>
        </div>
        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="apple-surface-section p-3">
            <label className="block">
              <span className="apple-field-label mb-1 block">修补说明</span>
              <textarea
                autoFocus
                className="apple-textarea nodrag min-h-[96px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
                onKeyDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：把这块修补成更干净的科技馆招募海报背景，保留主体和整体风格。"
                value={prompt}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button className="apple-button px-3 py-2 text-[11px] text-white/72" onClick={clearMask} type="button">
              清空涂抹
            </button>
            <button className="apple-button ml-auto px-3 py-2 text-[11px] text-white/72" onClick={onClose} type="button">
              关闭
            </button>
            <button className="apple-button-primary px-3 py-2 text-[11px] font-semibold" onClick={saveMask} type="button">
              保存蒙版
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function hasPaintedMask(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 16) return true;
  }
  return false;
}

function ToolbarButton({
  expanded = true,
  icon,
  label,
  onClick,
  tone = "default",
}: {
  expanded?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`flex items-center justify-center rounded-[18px] border transition ${
        tone === "danger"
          ? "apple-button-danger text-[#ffb4a8]"
          : "apple-button text-white/72"
      } ${expanded ? "w-full flex-col gap-1 px-1 py-2.5" : "size-10 px-0 py-0"}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      {expanded ? <span className="text-[11px] leading-none opacity-80">{label}</span> : null}
    </button>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4">
      <span className="apple-caption shrink-0">{label}</span>
      <span className="h-1 w-1 shrink-0 rounded-full bg-white/18" />
      <span className="min-w-0 truncate text-white/62" title={value}>{value}</span>
    </div>
  );
}

function StatusDot({ status }: { status: NodeStatus }) {
  const color = status === "failed" ? "bg-[#ff6b5f]" : status === "cancelled" ? "bg-white/32" : status === "completed" ? "bg-[#74e3c5]" : status === "running" || status === "saving" || status === "queued" ? "bg-[#ffd166]" : "bg-white/24";
  return <span className={`size-2 rounded-full ${color}`} />;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-2">
      <span className="apple-caption">{label}</span>
      <span className="truncate text-white/64" title={value}>{value}</span>
    </div>
  );
}

function EmptyPanel({ description, icon, title }: { description: string; icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/12 bg-white/[0.035] p-6 text-center">
      <div className="mb-3 text-white/34">{icon}</div>
      <div className="text-[14px] font-semibold text-white/74">{title}</div>
      <p className="mt-2 max-w-[250px] text-[11px] leading-5 text-white/38">{description}</p>
    </div>
  );
}

async function appendImageToForm(formData: FormData, image: ImageAsset, fileKey: string, urlKey: string, fallbackName: string) {
  if (image.file) {
    formData.append(fileKey, image.file);
    return;
  }
  if (isLocalGeneratedUrl(image.url)) {
    formData.append(urlKey, image.url);
    return;
  }
  formData.append(fileKey, await fileFromImageUrl(image.url, image.fileName || fallbackName));
}

async function appendDataUrlToForm(formData: FormData, dataUrl: string, fileKey: string, fallbackName: string) {
  const file = await dataUrlToFile(dataUrl);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.replace("image/", "") || "png";
  const fileName = file.name || `${fallbackName.replace(/\.[^.]+$/, "")}.${extension}`;
  formData.append(fileKey, new File([file], fileName, { type: file.type || "image/png", lastModified: Date.now() }));
}

async function imagesFromResponse(response: Response) {
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(friendlyDisplayError(data.error || `节点运行失败（HTTP ${response.status}）。`));
  const images = (data.images || []) as GeneratedImage[];
  return images.map((image) => ({ ...image, source: "generated" as const }));
}

async function readJsonResponse(response: Response): Promise<{ error?: string; images?: GeneratedImage[] }> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as { error?: string; images?: GeneratedImage[] }) : {};
  } catch {
    return {
      error: response.status >= 500
        ? `服务暂时不可用（HTTP ${response.status}），可能是模型代理或上游接口超时。`
        : `接口返回格式异常（HTTP ${response.status}）。`,
    };
  }
}

function imageFromSavedResponse(data: GeneratedImage & { url: string }, modeLabel: string, fallbackPrompt: string): ImageAsset {
  const now = new Date().toISOString();
  return {
    id: data.fileName || data.url || `${Date.now()}`,
    url: data.url,
    prompt: data.prompt || fallbackPrompt,
    variant: data.variant || 1,
    ratio: data.ratio,
    mode: data.mode || modeLabel,
    model: data.model,
    aspectRatio: data.aspectRatio,
    quality: data.quality,
    generatedAt: data.generatedAt || now,
    outputSize: data.outputSize,
    expectedOutputSize: data.expectedOutputSize,
    qualityCheck: data.qualityCheck,
    fileName: data.fileName,
    savedPath: data.savedPath,
    durationMs: data.durationMs,
    fileSizeBytes: data.fileSizeBytes,
    alphaCheck: data.alphaCheck,
    nodeOperation: data.nodeOperation,
    projectId: data.projectId,
    parentImageId: data.parentImageId,
    rootImageId: (data as ImageAsset).rootImageId,
    branchId: (data as ImageAsset).branchId,
    branchLabel: (data as ImageAsset).branchLabel,
    resultGroupId: (data as ImageAsset).resultGroupId,
    nextImageIds: data.nextImageIds,
    sourceTaskId: data.sourceTaskId,
    maskProtectionCheck: data.maskProtectionCheck,
    protectionContext: data.protectionContext,
    version: data.version,
    editableLayers: data.editableLayers,
    layoutCheck: data.layoutCheck,
    layoutTemplate: data.layoutTemplate,
    strategyPackageId: (data as ImageAsset).strategyPackageId,
    sourceStrategyTitle: (data as ImageAsset).sourceStrategyTitle,
    materialPlanItemId: (data as ImageAsset).materialPlanItemId,
    materialType: (data as ImageAsset).materialType,
    targetSize: (data as ImageAsset).targetSize,
    materialCopy: (data as ImageAsset).materialCopy,
    materialScene: (data as ImageAsset).materialScene,
    favorite: data.favorite,
    source: "generated",
  };
}

function sanitizeNode(node: FlowNode): FlowNode {
  return {
    ...node,
    data: {
      ...node.data,
      onRun: undefined,
      onDelete: undefined,
      onParamChange: undefined,
      onImageFile: undefined,
      onPreview: undefined,
      onMaskEdit: undefined,
      image: node.data.image ? stripImageFile(node.data.image) : undefined,
      output: node.data.output ? stripImageFile(node.data.output) : null,
      outputs: Array.isArray(node.data.outputs) ? node.data.outputs.map(stripImageFile) : [],
    },
  };
}

function restoreNodes(nodes: FlowNode[], runs: TaskRecord[] = []) {
  const latestTaskByNode = latestTaskByNodeId(runs);
  const restored = nodes
    .filter((node) => node?.id && node?.type && nodeCatalog.some((item) => item.type === node.type))
    .map((node) => {
      const kind = (node.data.kind || node.type) as NodeKind;
      const catalog = nodeCatalog.find((item) => item.type === kind);
      const task = latestTaskByNode.get(node.id);
      const existingOutputs = Array.isArray(node.data.outputs) ? node.data.outputs : node.data.output ? [node.data.output] : [];
      const taskOutputs = task?.outputs?.length ? task.outputs : task?.result ? [task.result] : [];
      const outputs = existingOutputs.length ? existingOutputs : taskOutputs;
      const activeWithoutOutput = isActiveNodeStatus(node.data.status) && !outputs.length;
      const taskError = task?.error || task?.progressLabel || "";
      const restoredStatus = activeWithoutOutput && task && isFinishedNodeStatus(task.status) ? task.status : node.data.status;
      const restoredError = restoredStatus === "failed" && !node.data.error && taskError ? taskError : node.data.error;
      return {
        ...node,
        selected: false,
        dragging: false,
        data: {
          ...node.data,
          kind,
          subtitle: catalog?.description || node.data.subtitle,
          params: node.data.params || { ...defaultParamsByKind[kind] },
          output: node.data.output || outputs[0] || null,
          outputs,
          resultCount: outputs.length || node.data.resultCount,
          status: restoredStatus,
          error: restoredError ? friendlyDisplayError(String(restoredError)) : restoredError,
        },
      };
    });
  return normalizeRestoredCanvasPositions(restored);
}

function latestTaskByNodeId(runs: TaskRecord[]) {
  const taskMap = new Map<string, TaskRecord>();
  for (const task of runs) {
    if (!task.nodeId) continue;
    const current = taskMap.get(task.nodeId);
    if (!current || (task.startedAt || 0) > (current.startedAt || 0)) taskMap.set(task.nodeId, task);
  }
  return taskMap;
}

function isActiveNodeStatus(status?: NodeStatus) {
  return status === "queued" || status === "running" || status === "saving";
}

function isFinishedNodeStatus(status?: NodeStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function normalizeRestoredCanvasPositions(nodes: FlowNode[]) {
  if (!nodes.length) return nodes;
  const positions = nodes.map((node) => node.position).filter((position) => Number.isFinite(position?.x) && Number.isFinite(position?.y));
  if (!positions.length) return nodes;
  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxX = Math.max(...positions.map((position) => position.x));
  const maxY = Math.max(...positions.map((position) => position.y));
  const needsNormalize = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY)) > 6000;
  if (!needsNormalize) return nodes;
  const offsetX = minX - 120;
  const offsetY = minY - 120;
  return nodes.map((node, index) => {
    const position = Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
      ? node.position
      : { x: 120 + index * 80, y: 120 + index * 40 };
    return {
      ...node,
      position: {
        x: Math.round((position.x - offsetX) * 100) / 100,
        y: Math.round((position.y - offsetY) * 100) / 100,
      },
    };
  });
}

function isFiniteViewport(viewport?: ProjectPayload["viewport"]): viewport is NonNullable<ProjectPayload["viewport"]> {
  return Boolean(
    viewport &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom >= 0.08 &&
    viewport.zoom <= 3,
  );
}

function resolveProjectKnowledge(project: ProjectPayload | null | undefined) {
  const nextId = project?.id || "local-project";
  const nextName = project?.name || "AI 设计项目";
  const normalized = normalizeProjectKnowledge(project?.knowledge, { projectId: nextId, projectName: nextName });
  return mergeLegacyDataIntoKnowledge(normalized, {
    projectId: nextId,
    projectName: nextName,
    assets: project?.assets,
    assetText: project?.assetText,
    profile: project?.profile,
  });
}

function resolveProjectAssets(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  const legacyAssets = restoreAssets(project?.assets);
  return legacyAssets.length ? legacyAssets : materialLibraryAssetsToImages(knowledge.materialLibrary.items);
}

function resolveProjectAssetText(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  return project?.assetText ?? knowledge.archive.notes ?? "";
}

function resolveProjectProfile(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  const archiveProfile = archiveToProjectProfile(knowledge.archive, knowledge.materialLibrary);
  return normalizeProjectProfile({ ...archiveProfile, ...(project?.profile || {}) });
}

function buildProjectKnowledgeFromState(input: {
  projectId: string;
  projectName: string;
  projectAssets: ImageAsset[];
  projectAssetText: string;
  projectProfile: ProjectProfile;
  currentKnowledge: ProjectKnowledgeBase;
}) {
  const normalized = normalizeProjectKnowledge(input.currentKnowledge, { projectId: input.projectId, projectName: input.projectName });
  const legacyMerged = mergeLegacyDataIntoKnowledge(normalized, {
    projectId: input.projectId,
    projectName: input.projectName,
    assets: input.projectAssets,
    assetText: input.projectAssetText,
    profile: input.projectProfile,
  });
  return {
    ...legacyMerged,
    selection: {
      ...legacyMerged.selection,
      activeProjectLibraryId: legacyMerged.materialLibrary.id,
    },
  };
}

function restoreAssets(assets?: ImageAsset[]) {
  return Array.isArray(assets)
    ? assets
        .filter((asset) => asset.source === "asset")
        .map((asset) => ({ ...asset, source: "asset" as const }))
    : [];
}

function normalizeProjectProfile(value: unknown): ProjectProfile {
  const source = value && typeof value === "object" ? (value as Partial<ProjectProfile>) : {};
  return {
    brandColors: safeProfileString(source.brandColors),
    primaryColors: safeProfileString(source.primaryColors) || safeProfileString(source.brandColors),
    secondaryColors: safeProfileString(source.secondaryColors),
    accentColors: safeProfileString(source.accentColors),
    backgroundColors: safeProfileString(source.backgroundColors),
    textColors: safeProfileString(source.textColors),
    colorPalettes: safeProfileString(source.colorPalettes),
    logoName: safeProfileString(source.logoName),
    organizationName: safeProfileString(source.organizationName),
    phone: safeProfileString(source.phone),
    address: safeProfileString(source.address),
    qrCodeNote: safeProfileString(source.qrCodeNote),
    commonCopy: safeProfileString(source.commonCopy),
    forbiddenContent: safeProfileString(source.forbiddenContent),
    commonSizes: safeProfileString(source.commonSizes),
    styleNotes: safeProfileString(source.styleNotes),
    keepText: safeProfileBoolean(source.keepText, true),
    keepLogo: safeProfileBoolean(source.keepLogo, false),
    keepQrCode: safeProfileBoolean(source.keepQrCode, false),
    keepFace: safeProfileBoolean(source.keepFace, true),
    keepMainSubject: safeProfileBoolean(source.keepMainSubject, true),
    onlyEditMaskedArea: safeProfileBoolean(source.onlyEditMaskedArea, true),
    brandAssetUsage: normalizeBrandAssetUsage(source.brandAssetUsage),
  };
}

function mergePendingFacts(current: ProjectFactCandidate[], incoming: ProjectFactCandidate[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((item) => {
    const key = `${item.field}:${item.value.trim()}:${item.sourceUrl || item.sourceLabel}`;
    if (!item.value.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeProfileString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeProfileBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function projectProfileColors(profile: ProjectProfile) {
  return Array.from(new Set([
    ...extractColorValues(profile.primaryColors),
    ...extractColorValues(profile.secondaryColors),
    ...extractColorValues(profile.accentColors),
    ...extractColorValues(profile.backgroundColors),
    ...extractColorValues(profile.textColors),
    ...extractColorValues(profile.brandColors),
    ...extractColorValues(profile.colorPalettes),
  ]));
}

function extractColorValues(value: string) {
  const matches = value.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi);
  return Array.from(new Set((matches || []).map((item) => item.trim())));
}

function normalizeBrandAssetUsage(value: unknown): BrandAssetUsage {
  const source = value && typeof value === "object" ? (value as Partial<BrandAssetUsage>) : {};
  return {
    usePrimaryColors: safeProfileBoolean(source.usePrimaryColors, defaultBrandAssetUsage.usePrimaryColors),
    useSecondaryColors: safeProfileBoolean(source.useSecondaryColors, defaultBrandAssetUsage.useSecondaryColors),
    useLogo: safeProfileBoolean(source.useLogo, defaultBrandAssetUsage.useLogo),
    useIpImage: safeProfileBoolean(source.useIpImage, defaultBrandAssetUsage.useIpImage),
    useContact: safeProfileBoolean(source.useContact, defaultBrandAssetUsage.useContact),
    useQrCode: safeProfileBoolean(source.useQrCode, defaultBrandAssetUsage.useQrCode),
    useCopy: safeProfileBoolean(source.useCopy, defaultBrandAssetUsage.useCopy),
    useForbiddenRules: safeProfileBoolean(source.useForbiddenRules, defaultBrandAssetUsage.useForbiddenRules),
  };
}

function getCurrentProjectBrandAssets(projectAssets: ImageAsset[], knowledge: ProjectKnowledgeBase) {
  return mergeProjectLibraryAssets(knowledge.materialLibrary.items, projectAssets, knowledge.materialLibrary.ownerProjectId || "local-project");
}

function summarizeBrandAssets(profile: ProjectProfile, brandAssets: ImageAsset[]): BrandAssetSummary {
  const colors = projectProfileColors(profile);
  const logoCount = countBrandAssets(brandAssets, "logo");
  const ipCount = countBrandAssets(brandAssets, "ip");
  const qrCount = countBrandAssets(brandAssets, "qrcode");
  const copyCount = splitProfileLines(profile.commonCopy).length;
  const ruleCount = splitProfileLines(profile.forbiddenContent).length;
  const hasContact = Boolean(profile.phone.trim() || profile.address.trim());
  const totalCount = [
    colors.length,
    logoCount,
    ipCount,
    qrCount,
    hasContact ? 1 : 0,
    copyCount,
    ruleCount,
  ].filter(Boolean).length;
  const activeCount = brandUsageItems.filter((item) => profile.brandAssetUsage[item.key]).length;
  return {
    activeCount,
    totalCount,
    colorCount: colors.length,
    logoCount,
    ipCount,
    qrCount,
    hasContact,
    copyCount,
    ruleCount,
    missing: [
      colors.length ? "" : "主色",
      logoCount ? "" : "Logo",
      hasContact ? "" : "联系方式",
      ipCount ? "" : "IP形象",
    ].filter(Boolean),
  };
}

function countBrandAssets(assets: ImageAsset[], kind: "logo" | "ip" | "qrcode" | "background") {
  return assets.filter((asset) => assetMatchesBrandKind(asset, kind)).length;
}

function findBrandAssets(assets: ImageAsset[], kind: "logo" | "ip" | "qrcode" | "background") {
  return assets.filter((asset) => assetMatchesBrandKind(asset, kind));
}

function resolveBrandReferenceAssets(profile: ProjectProfile, assets: ImageAsset[]) {
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const selected = [
    ...(usage.useLogo ? findBrandAssets(assets, "logo") : []),
    ...(usage.useIpImage ? findBrandAssets(assets, "ip") : []),
    ...(usage.useQrCode ? findBrandAssets(assets, "qrcode") : []),
  ];
  const seen = new Set<string>();
  return selected.filter((asset) => {
    const key = asset.id || asset.url || asset.fileName || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(asset.url);
  }).slice(0, 3);
}

function assetMatchesBrandKind(asset: ImageAsset, kind: "logo" | "ip" | "qrcode" | "background") {
  const source = [asset.fileName, asset.mode, asset.materialType, ...(Array.isArray((asset as { tags?: string[] }).tags) ? (asset as { tags?: string[] }).tags || [] : [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (kind === "logo") return source.includes("logo") || source.includes("标志") || source.includes("品牌标识");
  if (kind === "qrcode") return source.includes("二维码") || source.includes("qrcode") || /\bqr\b/.test(source);
  if (kind === "ip") return source.includes("ip形象") || source.includes("ip") || source.includes("吉祥物") || source.includes("卡通") || source.includes("角色");
  return source.includes("背景") || source.includes("background");
}

function mergeLegacyDataIntoKnowledge(
  knowledge: ProjectKnowledgeBase,
  input: {
    projectId: string;
    projectName: string;
    assets?: ImageAsset[];
    assetText?: string;
    profile?: unknown;
  },
) {
  const profile = normalizeProjectProfile(input.profile);
  return {
    ...knowledge,
    archive: {
      ...knowledge.archive,
      projectName: input.projectName,
      organizationName: profile.organizationName || knowledge.archive.organizationName,
      address: profile.address || knowledge.archive.address,
      phone: profile.phone || knowledge.archive.phone,
      brandColors: projectProfileColors(profile).length ? projectProfileColors(profile) : knowledge.archive.brandColors,
      slogans: splitProfileLines(profile.commonCopy).length ? splitProfileLines(profile.commonCopy) : knowledge.archive.slogans,
      forbiddenContent: splitProfileLines(profile.forbiddenContent).length ? splitProfileLines(profile.forbiddenContent) : knowledge.archive.forbiddenContent,
      notes: input.assetText ?? knowledge.archive.notes,
      updatedAt: new Date().toISOString(),
    },
    materialLibrary: {
      ...knowledge.materialLibrary,
      id: knowledge.materialLibrary.id || `${input.projectId}_library`,
      name: knowledge.materialLibrary.name || `${input.projectName}素材库`,
      ownerProjectId: input.projectId,
      items: mergeProjectAssetRecords(
        knowledge.materialLibrary.items,
        restoreAssets(input.assets).map((asset) => imageAssetToProjectAssetRecord(asset, knowledge.materialLibrary.id, input.projectId)),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}

function archiveToProjectProfile(archive: ProjectKnowledgeBase["archive"], materialLibrary: MaterialLibraryRecord): Partial<ProjectProfile> {
  const logoAsset = archive.logoAssetId ? materialLibrary.items.find((item) => item.id === archive.logoAssetId) : undefined;
  return {
    organizationName: archive.organizationName,
    phone: archive.phone,
    address: archive.address,
    logoName: logoAsset?.name || "",
    brandColors: archive.brandColors.join("\n"),
    primaryColors: archive.brandColors.slice(0, 1).join("\n"),
    secondaryColors: archive.brandColors.slice(1).join("\n"),
    commonCopy: archive.slogans.join("\n"),
    forbiddenContent: archive.forbiddenContent.join("\n"),
  };
}

function imageAssetToProjectAssetRecord(asset: ImageAsset, libraryId: string, projectId: string): ProjectAssetRecord {
  return {
    id: asset.id || `asset_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    name: asset.fileName || asset.materialType || asset.mode || "项目素材",
    sourceType: "user_upload",
    sourceLabel: asset.source === "history" ? "结果图片" : "本地上传",
    sourceUrl: sanitizeSerializableImageUrl(asset.url),
    projectId,
    libraryId,
    type: inferProjectAssetType(asset),
    commercialStatus: "allowed",
    confirmationStatus: "confirmed",
    createdAt: asset.generatedAt || new Date().toISOString(),
    updatedAt: asset.generatedAt || new Date().toISOString(),
    tags: [asset.materialType, asset.mode, asset.nodeOperation].filter(Boolean) as string[],
    scenes: [asset.materialScene].filter(Boolean) as string[],
    colorTags: [],
    fileName: asset.fileName,
    url: sanitizeSerializableImageUrl(asset.url),
    mimeType: asset.file?.type,
    width: asset.outputSize?.width || asset.width,
    height: asset.outputSize?.height || asset.height,
    summary: asset.prompt,
    notes: asset.sourceStrategyTitle,
  };
}

function materialLibraryAssetsToImages(items: ProjectAssetRecord[]) {
  return items
    .filter((item) => item.url)
    .map((item) => ({
      id: item.id,
      url: item.url || "",
      prompt: item.summary || "项目素材",
      variant: 0,
      mode: item.type,
      model: item.sourceType === "ai_generated" ? "ai" : "local",
      generatedAt: item.createdAt,
      outputSize: item.width && item.height ? { width: item.width, height: item.height } : undefined,
      fileName: item.fileName || item.name,
      width: item.width,
      height: item.height,
      source: "asset" as const,
      materialType: resolveProjectAssetMaterialType(item),
      materialScene: item.scenes[0],
      sourceLabel: item.sourceLabel,
      sourceStrategyTitle: item.notes,
      targetSize: item.width && item.height ? `${item.width}x${item.height}` : undefined,
      tags: item.tags,
      colorTags: item.colorTags,
    }));
}

function mergeProjectLibraryAssets(items: ProjectAssetRecord[], assets: ImageAsset[], projectId: string) {
  return materialLibraryAssetsToImages(
    mergeProjectAssetRecords(
      items,
      restoreAssets(assets).map((asset) => imageAssetToProjectAssetRecord(asset, `${projectId}_library`, projectId)),
    ),
  );
}

function mergeProjectAssetRecords(current: ProjectAssetRecord[], incoming: ProjectAssetRecord[]) {
  const seen = new Set<string>();
  const merged: ProjectAssetRecord[] = [];
  for (const item of [...incoming, ...current]) {
    const key = item.fileName || item.id || item.url || item.name;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function buildProjectLibraryContext(
  knowledge: ProjectKnowledgeBase,
  projectLibraries: MaterialLibrarySummary[],
  publicStyleLibraries: MaterialLibrarySummary[],
) {
  const referenceTexts = knowledge.references
    .filter((item) => item.enabled)
    .map((item) => {
      const source = item.kind === "project"
        ? projectLibraries.find((library) => library.id === item.libraryId)
        : publicStyleLibraries.find((library) => library.id === item.libraryId);
      const description = source?.description || source?.tags?.join(" / ") || "";
      return `${item.libraryName}（${item.kind === "project" ? "项目素材库" : "公共风格库"}，${item.mode === "copy_into_project" ? "已复制到本项目" : "只读引用"}）${description ? `：${description}` : ""}`;
    });
  const styleRuleTexts = knowledge.selection.activePublicStyleLibraryIds
    .map((libraryId) => publicStyleLibraries.find((library) => library.id === libraryId))
    .filter((library): library is MaterialLibrarySummary => Boolean(library))
    .map((library) => {
      const rules = styleLibraryRulePreview(library);
      const references = styleLibraryReferencePreview(library);
      return `${library.name}：${rules}${references ? `；参考：${references}` : ""}`;
    });
  const localAssetSummary = knowledge.materialLibrary.items.slice(0, 6).map((item) => item.name).join(" / ");
  return [
    `项目档案：${knowledge.archive.projectName}${knowledge.archive.organizationName ? `，机构 ${knowledge.archive.organizationName}` : ""}`,
    localAssetSummary ? `当前项目素材库：${knowledge.materialLibrary.name}，已收录 ${knowledge.materialLibrary.items.length} 项，包括 ${localAssetSummary}` : `当前项目素材库：${knowledge.materialLibrary.name}，暂未上传素材。`,
    referenceTexts.length ? `已引用素材库：${referenceTexts.join("；")}` : "未引用其他项目素材库或公共风格库，禁止跨项目自动混用。",
    styleRuleTexts.length ? `公共风格规则：${styleRuleTexts.join("；")}` : "未启用公共风格规则，默认只按项目档案和当前需求生成。",
    "素材来源规则：用户上传和 AI 生成素材可直接使用；网络参考素材必须标注来源，默认只作参考。",
  ].join("\n");
}

function styleLibraryRulePreview(library: MaterialLibrarySummary) {
  const rules = (library.items || [])
    .filter((item) => item.type === "style_rule")
    .slice(0, 3)
    .map((item) => item.summary || item.name)
    .filter(Boolean);
  return rules.join(" / ") || library.description || "未记录规则";
}

function styleLibraryReferencePreview(library: MaterialLibrarySummary) {
  return (library.items || [])
    .filter((item) => item.type === "reference")
    .slice(0, 2)
    .map((item) => item.sourceLabel || item.name)
    .join(" / ");
}

function inferProjectAssetType(asset: ImageAsset): ProjectAssetRecord["type"] {
  if (asset.nodeOperation === "output" || asset.source === "history") return "history_result";
  if (asset.materialType === "Logo") return "logo";
  if (asset.materialType === "IP形象") return "icon";
  if (asset.materialType === "背景图") return "background";
  if (asset.materialType === "二维码") return "icon";
  if ((asset.fileName || "").toLowerCase().includes("logo")) return "logo";
  return "image";
}

function resolveProjectAssetMaterialType(item: ProjectAssetRecord) {
  if (item.tags.includes("二维码")) return "二维码";
  if (item.tags.includes("IP形象")) return "IP形象";
  if (item.type === "logo" || item.tags.includes("Logo")) return "Logo";
  if (item.type === "background" || item.tags.includes("背景图")) return "背景图";
  return item.type;
}

function projectAssetUploadLabel(kind: ProjectAssetUploadKind) {
  if (kind === "logo") return "Logo";
  if (kind === "qrcode") return "二维码";
  if (kind === "ip") return "IP形象";
  return "背景图";
}

function stripProjectRuntimeState<T extends ProjectPayload & { setActive?: boolean }>(project: T): T {
  return {
    ...project,
    assets: project.assets?.map(stripImageFile),
    nodes: project.nodes?.map(sanitizeNode),
    knowledge: sanitizeKnowledgeImageUrls(project.knowledge),
    runs: sanitizeProjectTasks(project.runs || []),
  };
}

function sanitizeKnowledgeImageUrls(knowledge?: ProjectKnowledgeBase) {
  if (!knowledge) return knowledge;
  return {
    ...knowledge,
    materialLibrary: {
      ...knowledge.materialLibrary,
      items: knowledge.materialLibrary.items.map((item) => ({
        ...item,
        url: sanitizeSerializableImageUrl(item.url),
        sourceUrl: sanitizeSerializableImageUrl(item.sourceUrl),
      })),
    },
  };
}

function sanitizeSerializableImageUrl(url?: string) {
  if (!url?.startsWith("data:image/")) return url;
  return undefined;
}

function findDataImagePath(value: unknown, path = "$", visited = new WeakSet<object>()): string {
  if (typeof value === "string") return value.startsWith("data:image/") ? path : "";
  if (!value || typeof value !== "object") return "";
  if (visited.has(value)) return "";
  visited.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findDataImagePath(value[index], `${path}[${index}]`, visited);
      if (match) return match;
    }
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    const match = findDataImagePath(child, `${path}.${key}`, visited);
    if (match) return match;
  }
  return "";
}

function normalizeProjectKind(value: unknown): ProjectKind {
  if (value === "formal" || value === "temporary" || value === "scratch") return value;
  return "formal";
}

function getStoredProject(serverProject: ProjectPayload | null): ProjectPayload | null {
  let localProject: ProjectPayload | null = null;
  try {
    const raw = window.localStorage.getItem(projectStorageKey);
    localProject = raw ? stripProjectRuntimeState(JSON.parse(raw) as ProjectPayload) : null;
  } catch {
    localProject = null;
  }
  if (!serverProject) return localProject;

  const stableServerProject = stripProjectRuntimeState(serverProject);
  const sameProjectLocal = localProject?.id && localProject.id === serverProject.id ? localProject : null;
  const serverHasCanvas = Boolean(stableServerProject.nodes?.length || stableServerProject.edges?.length);
  const serverHasProjectData = Boolean(stableServerProject.assets?.length || stableServerProject.assetText || stableServerProject.profile);
  if (!sameProjectLocal || serverHasCanvas || serverHasProjectData) {
    return {
      ...sameProjectLocal,
      ...stableServerProject,
      nodes: stableServerProject.nodes?.length ? stableServerProject.nodes : sameProjectLocal?.nodes || [],
      edges: stableServerProject.edges?.length ? stableServerProject.edges : sameProjectLocal?.edges || [],
      runs: restoreProjectTasks(stableServerProject.runs?.length ? stableServerProject.runs : sameProjectLocal?.runs || []),
      assets: stableServerProject.assets?.length ? stableServerProject.assets : sameProjectLocal?.assets || [],
      projectKind: stableServerProject.projectKind || sameProjectLocal?.projectKind || "formal",
      assetText: stableServerProject.assetText ?? sameProjectLocal?.assetText ?? "",
      profile: stableServerProject.profile ?? sameProjectLocal?.profile,
      knowledge: stableServerProject.knowledge ?? sameProjectLocal?.knowledge,
      textProtectionMode: stableServerProject.textProtectionMode ?? sameProjectLocal?.textProtectionMode,
    };
  }
  return localProject ? stripProjectRuntimeState(localProject) : null;
}

function projectTaskStorageKey(projectId: string) {
  return `${projectStorageKey}:tasks:${projectId || "local-project"}`;
}

function readProjectTaskCache(projectId: string, fallbackRuns: TaskRecord[]) {
  try {
    const raw = window.localStorage.getItem(projectTaskStorageKey(projectId));
    if (!raw) return fallbackRuns;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? mergeTaskRecords(parsed as TaskRecord[], fallbackRuns) : fallbackRuns;
  } catch {
    return fallbackRuns;
  }
}

function mergeTaskRecords(primary: TaskRecord[], fallback: TaskRecord[]) {
  const seen = new Set<string>();
  const merged: TaskRecord[] = [];
  for (const task of [...primary, ...fallback]) {
    if (!task?.id || seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }
  return merged.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

function writeProjectTaskCache(projectId: string, tasks: TaskRecord[]) {
  try {
    window.localStorage.setItem(projectTaskStorageKey(projectId), JSON.stringify(sanitizeProjectTasks(tasks)));
  } catch {}
}

function sanitizeProjectTasks(runs: TaskRecord[]) {
  return runs
    .map((task) => ({
      ...task,
      inputs: task.inputs?.map(stripImageFile),
      outputs: task.outputs?.map(stripImageFile),
      result: task.result ? stripImageFile(task.result) : undefined,
    }));
}

function restoreProjectTasks(runs: TaskRecord[]) {
  const now = Date.now();
  return sanitizeProjectTasks(runs).map((task) => {
    if (task.deferred && task.status === "queued") return task;
    if (task.endedAt || task.status === "completed" || task.status === "failed" || task.status === "cancelled") return task;
    return {
      ...task,
      status: "failed" as const,
      stage: "failed" as const,
      endedAt: now,
      progress: 100,
      error: "页面刷新后任务已中断，请重试或删除记录。",
      progressLabel: "已中断：可重试或删除记录",
    };
  });
}

function stripImageFile(image: ImageAsset): ImageAsset {
  const { file, ...rest } = image;
  void file;
  return {
    ...rest,
    url: sanitizeSerializableImageUrl(rest.url) || rest.originalUrl || rest.previewUrl || rest.thumbnailUrl || "",
    originalUrl: sanitizeSerializableImageUrl(rest.originalUrl),
    thumbnailUrl: sanitizeSerializableImageUrl(rest.thumbnailUrl),
    previewUrl: sanitizeSerializableImageUrl(rest.previewUrl),
  };
}

function stringifyProjectPayload(payload: ProjectPayload & { setActive?: boolean }) {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    throw new Error(`项目保存失败：项目数据无法序列化（${error instanceof Error ? error.message : "未知错误"}）。`);
  }
}

function writeProjectLocalCache(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return "";
  } catch (error) {
    return localStorageErrorMessage(error, value.length);
  }
}

function localStorageErrorMessage(error: unknown, payloadLength: number) {
  const sizeMb = payloadLength / 1024 / 1024;
  const message = error instanceof Error ? error.message : "未知错误";
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return `本地缓存空间不足（项目 JSON ${sizeMb.toFixed(2)}MB）。已改为保存到项目文件，图片资源以文件引用保存。`;
  }
  return `本地缓存写入失败：${message}`;
}

async function readProjectSaveError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) as { error?: string; details?: string; payloadBytes?: number } : {};
    const payload = data.payloadBytes ? `，请求大小 ${formatFileSize(data.payloadBytes)}` : "";
    return data.error ? `${data.error}${payload}` : `项目保存失败（HTTP ${response.status}${payload}）。`;
  } catch {
    return `项目保存失败（HTTP ${response.status}）：${text.slice(0, 180) || "接口没有返回错误详情"}`;
  }
}

function imageRatioStyle(image: Pick<ImageAsset, "outputSize" | "width" | "height"> | null | undefined) {
  const width = image?.outputSize?.width || image?.width || 1;
  const height = image?.outputSize?.height || image?.height || 1;
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
  };
}

function largePreviewFrameStyle(image: Pick<ImageAsset, "outputSize" | "width" | "height"> | null | undefined) {
  const width = image?.outputSize?.width || image?.width || 1;
  const height = image?.outputSize?.height || image?.height || 1;
  const ratio = Math.max(0.18, Math.min(8, width / Math.max(1, height)));
  const heightBudget = ratio < 0.76 ? "(94vh - 220px)" : ratio > 2.4 ? "(94vh - 260px)" : "(94vh - 240px)";
  const maxWidth = ratio < 0.76 ? 460 : ratio > 2.4 ? 920 : ratio > 1.18 ? 840 : 640;
  return {
    aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}`,
    width: `min(100%, ${maxWidth}px, calc(${heightBudget} * ${ratio}))`,
    maxWidth: "100%",
    maxHeight: `calc${heightBudget}`,
  };
}

function createResultLineage(image: ImageAsset | null | undefined, taskId: string, variant: number) {
  const normalizedVariant = Math.max(1, variant);
  if (!image) {
    return {
      parentImageId: undefined,
      rootImageId: "",
      branchId: `${taskId}_branch_${normalizedVariant}`,
      branchLabel: `方案 ${normalizedVariant}`,
      resultGroupId: taskId,
      variant: normalizedVariant,
    };
  }

  const rootImageId = imageRootId(image);
  const branchId = image.branchId || `${image.resultGroupId || image.sourceTaskId || rootImageId}_branch_${image.variant || normalizedVariant}`;
  const branchLabel = image.branchLabel || `方案 ${image.variant || normalizedVariant}`;
  return {
    parentImageId: image.id || image.fileName || image.url,
    rootImageId,
    branchId,
    branchLabel,
    resultGroupId: image.resultGroupId || image.sourceTaskId || taskId,
    variant: image.variant || normalizedVariant,
  };
}

function mergeImages(incoming: ImageAsset[], current: ImageAsset[]) {
  const seen = new Set<string>();
  const merged: ImageAsset[] = [];
  for (const image of [...incoming, ...current]) {
    const key = image.fileName || image.id || image.url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(image);
  }
  return sortImagesByRecency(merged);
}

function taskStageLabel(kind: NodeKind, stage: NonNullable<TaskRecord["stage"]>) {
  const action = taskActionLabel(kind);
  const labels: Record<NonNullable<TaskRecord["stage"]>, string> = {
    queued: "排队中",
    preparing: `正在准备${action}素材`,
    generating: kind === "remove_background" ? "本地抠图处理中" : kind === "layer_output" ? "正在拆出无文字背景和文字透明 PNG" : `模型正在${action}`,
    saving: "正在保存图片资源",
    quality: "正在检查尺寸和清晰度",
    completed: "完成",
    failed: "失败",
    cancelled: "已停止",
  };
  return labels[stage];
}

function taskProgressLabel(task: TaskRecord, stage: NonNullable<TaskRecord["stage"]>) {
  if (stage === "generating") {
    const kind = taskKindFromLabel(task.type);
    if (kind === "layer_output") return "正在生成无文字背景和文字透明 PNG，完成后会落到画布和项目素材";
    if (kind === "upscale_4k") return "正在本地按原比例无损放大，不调用 AI 重绘";
    const estimate = kind === "fuse_images" ? "复杂合成可能需要 3-8 分钟" : "通常需要 1-3 分钟";
    return task.model ? `${task.model} 生成中，${estimate}` : `${taskStageLabel("text_to_image", "generating")}，${estimate}`;
  }
  if (stage === "saving" && taskKindFromLabel(task.type) === "layer_output") return "正在保存拆图结果并生成两个新节点";
  if (stage === "quality") return "等待模型返回并检查结果";
  return taskStageLabel(taskKindFromLabel(task.type), stage);
}

function taskActionLabel(kind: NodeKind) {
  const labels: Record<NodeKind, string> = {
    image_input: "导入",
    text_to_image: "生图",
    image_to_image: "改版",
    fuse_images: "合成",
    outpaint: "扩图",
    resize: "改尺寸",
    remove_background: "透明抠图",
    layer_output: "分层拆图",
    replace_product: "替换",
    mask_edit: "局部修改",
    hd_redraw: "高清重绘",
    upscale_4k: "无损导出",
    output: "输出",
  };
  return labels[kind];
}

function taskKindFromLabel(label: string): NodeKind {
  return nodeCatalog.find((item) => item.label === label)?.type || "text_to_image";
}

function completedTaskLabel(count: number, image?: ImageAsset) {
  const size = image ? imageSizeLabel(image) : "";
  const quality = image ? qualityBadgeLabel(image) : "";
  return [`完成 ${count || 1} 张`, size, quality && quality !== "待检查" ? quality : ""].filter(Boolean).join(" · ");
}

function outputNodeTitle(image: ImageAsset, index: number) {
  if (image.materialType === "无文字背景") return "无文字背景";
  if (image.materialType === "文字透明PNG") return "文字透明 PNG";
  if (image.materialType) return image.materialType;
  return `方案${chineseNumber(image.variant || index + 1)}`;
}

function imageNodeTitle(image: ImageAsset, fallback: string) {
  if (image.materialType) return outputNodeTitle(image, image.variant ? image.variant - 1 : 0);
  const variant = image.variant || variantNumberFromLabel(image.branchLabel || fallback);
  return variant ? `方案${chineseNumber(variant)}` : fallback;
}

function compactImageMeta(image: ImageAsset) {
  return [image.targetSize || imageSizeLabel(image), image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : ""].filter(Boolean).join(" · ");
}

function variantNumberFromLabel(value: string) {
  const match = value.match(/方案\s*(\d+)/u);
  return match ? Number(match[1]) || 0 : 0;
}

function chineseNumber(value: number) {
  const labels = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value >= 1 && value <= 10) return labels[value];
  return String(value);
}

function taskFailureHint(message: string) {
  if (/timeout|超时|504|gateway/i.test(message)) return "超时：可继续重试或切换更快图片模型";
  if (/401|403|key|密钥|余额|quota|balance/i.test(message)) return "接口不可用：检查 Key、余额或模型权限";
  if (/model|模型/i.test(message)) return "模型不可用：切换模型或重新检测中转站";
  return "失败：查看错误后重试";
}

function nodeAutoSpacingX(node: FlowNode) {
  if (node.type === "image_input") {
    const image = node.data.image || node.data.output || null;
    const width = imageNodePreviewMetrics(image as ImageAsset | null).nodeWidth;
    return Math.max(treeBranchHorizontalGap, width + 120);
  }
  return treeBranchHorizontalGap;
}

function arrangeWorkflowNodes(nodes: FlowNode[], edges: FlowEdge[]) {
  if (nodes.length <= 1) return nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const validEdges = edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map<string, FlowEdge[]>();
  validEdges.forEach((edge) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
  });

  const primaryParent = new Map<string, string>();
  incoming.forEach((targetEdges, targetId) => {
    const sorted = [...targetEdges].sort((a, b) => {
      const handleDiff = layoutHandlePriority(a.targetHandle) - layoutHandlePriority(b.targetHandle);
      if (handleDiff) return handleDiff;
      const sourceA = nodeById.get(a.source);
      const sourceB = nodeById.get(b.source);
      const yDiff = (sourceA?.position.y || 0) - (sourceB?.position.y || 0);
      return yDiff || (originalOrder.get(a.source) || 0) - (originalOrder.get(b.source) || 0);
    });
    if (sorted[0]) primaryParent.set(targetId, sorted[0].source);
  });

  const primaryChildren = new Map<string, string[]>();
  primaryParent.forEach((sourceId, targetId) => {
    primaryChildren.set(sourceId, [...(primaryChildren.get(sourceId) || []), targetId]);
  });
  primaryChildren.forEach((children) => {
    children.sort((a, b) => compareLayoutNodes(nodeById.get(a), nodeById.get(b), originalOrder));
  });

  const roots = nodes
    .filter((node) => !primaryParent.has(node.id))
    .sort((a, b) => compareLayoutRoots(a, b, primaryChildren, originalOrder));
  if (!roots.length) roots.push([...nodes].sort((a, b) => compareLayoutNodes(a, b, originalOrder))[0]);

  const positioned = new Map<string, XYPosition>();
  const visited = new Set<string>();
  const baseX = 0;
  let cursorY = 0;

  function layoutSubtree(nodeId: string, depth: number, topY: number): number {
    const node = nodeById.get(nodeId);
    if (!node || visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const nodeHeight = estimateWorkflowNodeHeight(node);
    const children = (primaryChildren.get(nodeId) || []).filter((childId) => !visited.has(childId));
    if (!children.length) {
      positioned.set(nodeId, { x: baseX + depth * 310, y: topY });
      return nodeHeight + 54;
    }

    let childCursor = topY;
    const childRanges: Array<{ y: number; height: number }> = [];
    children.forEach((childId) => {
      const childHeight = layoutSubtree(childId, depth + 1, childCursor);
      const childPosition = positioned.get(childId);
      if (childPosition && childHeight) {
        childRanges.push({ y: childPosition.y, height: estimateWorkflowNodeHeight(nodeById.get(childId) as FlowNode) });
        childCursor += childHeight;
      }
    });

    if (!childRanges.length) {
      positioned.set(nodeId, { x: baseX + depth * 310, y: topY });
      return nodeHeight + 54;
    }

    const first = childRanges[0];
    const last = childRanges[childRanges.length - 1];
    const childrenCenter = (first.y + last.y + last.height) / 2;
    const subtreeHeight = Math.max(childCursor - topY - 54, nodeHeight);
    positioned.set(nodeId, {
      x: baseX + depth * 310,
      y: Math.max(topY, Math.round(childrenCenter - nodeHeight / 2)),
    });
    return subtreeHeight + 54;
  }

  roots.forEach((root) => {
    const blockHeight = layoutSubtree(root.id, 0, cursorY);
    cursorY += Math.max(blockHeight, estimateWorkflowNodeHeight(root) + 72);
  });

  nodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => compareLayoutNodes(a, b, originalOrder))
    .forEach((node) => {
      positioned.set(node.id, { x: baseX, y: cursorY });
      cursorY += estimateWorkflowNodeHeight(node) + 72;
    });

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) || node.position,
  }));
}

function estimateWorkflowNodeHeight(node: FlowNode) {
  if (node.data.kind === "image_input") {
    const image = (node.data.image || node.data.output || null) as ImageAsset | null;
    return imageNodePreviewMetrics(image).estimatedNodeHeight + (node.data.outputs && node.data.outputs.length > 2 ? 24 : 0);
  }
  const outputs = Array.isArray(node.data.outputs) ? node.data.outputs : node.data.output ? [node.data.output] : [];
  if (outputs.length > 1) return 172;
  if (outputs.length === 1) return 148;
  if (node.data.kind === "mask_edit") return 156;
  return 128;
}

function compareLayoutRoots(a: FlowNode, b: FlowNode, children: Map<string, string[]>, originalOrder: Map<string, number>) {
  const childDiff = Number(Boolean(children.get(b.id)?.length)) - Number(Boolean(children.get(a.id)?.length));
  if (childDiff) return childDiff;
  return compareLayoutNodes(a, b, originalOrder);
}

function compareLayoutNodes(a: FlowNode | undefined, b: FlowNode | undefined, originalOrder: Map<string, number>) {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const kindDiff = layoutKindPriority(a) - layoutKindPriority(b);
  if (kindDiff) return kindDiff;
  const variantDiff = imageVariantForLayout(a) - imageVariantForLayout(b);
  if (variantDiff) return variantDiff;
  const yDiff = a.position.y - b.position.y;
  return yDiff || a.position.x - b.position.x || (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0);
}

function layoutKindPriority(node: FlowNode) {
  if (node.data.kind === "text_to_image") return 0;
  if (node.data.kind === "image_input" && !node.data.output && !node.data.image) return 1;
  if (node.data.kind === "image_input") return 2;
  if (node.data.kind === "fuse_images") return 3;
  if (node.data.kind === "resize" || node.data.kind === "outpaint") return 4;
  if (node.data.kind === "remove_background" || node.data.kind === "layer_output") return 5;
  if (node.data.kind === "output") return 7;
  return 6;
}

function layoutHandlePriority(handle?: string | null) {
  if (!handle || handle === "image" || handle === "source") return 0;
  if (handle === "imageA" || handle === "sourceImage") return 1;
  if (handle === "imageB" || handle === "productImage") return 2;
  return 3;
}

function imageVariantForLayout(node: FlowNode) {
  const image = (node.data.output || node.data.image || node.data.outputs?.[0] || null) as ImageAsset | null;
  return image?.variant || variantNumberFromLabel(image?.branchLabel || node.data.title || "") || 0;
}

function imageKey(image: Pick<ImageAsset, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

function generatedFileNameForImage(image: Pick<ImageAsset, "fileName" | "id" | "url">) {
  const fromFileName = image.fileName && /\.(png|jpe?g|webp)$/i.test(image.fileName) ? image.fileName : "";
  if (fromFileName) return fromFileName;
  if (image.url?.startsWith("/generated/")) return decodeURIComponent(image.url.replace(/^\/generated\//, ""));
  return image.id && /\.(png|jpe?g|webp)$/i.test(image.id) ? image.id : "";
}

function imageBranchId(image: Pick<ImageAsset, "branchId" | "resultGroupId" | "sourceTaskId" | "variant" | "id" | "fileName" | "url">) {
  return image.branchId || `${image.resultGroupId || image.sourceTaskId || imageKey(image)}_branch_${image.variant || 1}`;
}

function imageRootId(image: Pick<ImageAsset, "rootImageId" | "parentImageId" | "id" | "fileName" | "url">) {
  return image.rootImageId || image.parentImageId || imageKey(image);
}

function sortImagesByRecency(images: ImageAsset[]) {
  return [...images].sort((a, b) => compareImagesByRecency(a, b));
}

function sortResultImagesForDisplay(images: ImageAsset[]) {
  return sortImagesByRecency(images);
}

function isUserFacingResultImage(image: ImageAsset) {
  const fileName = image.fileName || image.id || image.url || "";
  if (/\/(?:full-preview|text-mask|text-layer-cropped|original|text_alpha_mask|repair_mask|text_cropped|background_first_pass)\.png$/i.test(fileName)) return false;
  if (image.materialType === "原图" || image.materialType === "文字蒙版" || image.materialType === "文字Alpha蒙版" || image.materialType === "背景修复蒙版" || image.materialType === "背景首轮修复" || image.materialType === "文字裁剪PNG") return false;
  return true;
}

function sortImagesByGeneratedAt(images: ImageAsset[]) {
  return [...images].sort((a, b) => new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime());
}

function compareImagesByRecency(a: ImageAsset, b: ImageAsset) {
  const generatedDiff = new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  if (generatedDiff) return generatedDiff;
  const variantDiff = (a.variant || 0) - (b.variant || 0);
  if (variantDiff) return variantDiff;
  return imageKey(a).localeCompare(imageKey(b));
}

function removeImageFromNode(node: FlowNode, fileName: string): FlowNode {
  const matches = (image?: ImageAsset | null) => Boolean(image && ((image.fileName || image.id) === fileName || image.url === `/generated/${fileName}`));
  const nextOutputs = (node.data.outputs || []).filter((image) => !matches(image));
  const imageRemoved = matches(node.data.image);
  const outputRemoved = matches(node.data.output);
  if (!imageRemoved && !outputRemoved && nextOutputs.length === (node.data.outputs || []).length) return node;
  return {
    ...node,
    data: {
      ...node.data,
      image: imageRemoved ? undefined : node.data.image,
      output: outputRemoved ? nextOutputs[0] || null : node.data.output,
      outputs: nextOutputs,
      resultCount: nextOutputs.length,
      status: nextOutputs.length ? node.data.status : outputRemoved || imageRemoved ? "idle" : node.data.status,
    },
  };
}

function loadFavoriteIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(favoriteStorageKey);
    const parsed = raw ? JSON.parse(raw) as string[] : [];
    return new Set(parsed.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

function saveFavoriteIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(favoriteStorageKey, JSON.stringify(Array.from(ids)));
}

function friendlyDisplayError(message: string) {
  if (/502|bad gateway|gateway timeout|nginx|upstream|timeout|fetch failed/i.test(message)) {
    return "图片模型服务暂时不可用，可能是 API 代理或上游模型超时。请稍后重试，或在 API 配置里换一个更稳定/更快的图片模型。";
  }

  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

function nodeKindLabel(kind: NodeKind) {
  return nodeCatalog.find((item) => item.type === kind)?.label || kind;
}

function taskStatusLabel(status: NodeStatus) {
  const labels: Record<NodeStatus, string> = {
    idle: "空闲",
    queued: "等待中",
    running: "运行中",
    saving: "保存中",
    completed: "成功",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status];
}

function isDeferredQueuedTask(task: TaskRecord) {
  return Boolean(task.deferred && task.status === "queued");
}

function isTaskActivelyRunning(task: TaskRecord) {
  if (isDeferredQueuedTask(task)) return false;
  return task.status === "queued" || task.status === "running" || task.status === "saving";
}

function isTaskPossiblyStuck(task: TaskRecord) {
  if (isDeferredQueuedTask(task)) return false;
  if (task.endedAt) return false;
  if (task.status !== "queued" && task.status !== "running" && task.status !== "saving") return false;
  return Date.now() - task.startedAt > 3 * 60 * 1000;
}

function isQualityGateBlocked(image?: ImageAsset) {
  const status = image?.qualityCheck?.status;
  return status === "size_insufficient" || status === "ratio_mismatch" || status === "white_border" || status === "composition_risk" || status === "blurred_padding" || status === "failed" || status === "empty";
}

function nodeOperationLabel(value?: string) {
  if (!value) return "未知节点";
  const labels: Record<string, string> = {
    text_to_image: "文生图节点",
    image_to_image: "图生图节点",
    fuse_images: "AI合成节点",
    outpaint: "AI扩图节点",
    resize: "AI改尺寸节点",
    layer_output: "分层拆图节点",
    hd_redraw: "高清重绘节点",
    upscale_4k: "4K无损导出节点",
    mask_edit: "局部涂抹节点",
    "图片融合": "AI合成节点",
    "AI合成": "AI合成节点",
    "文生图": "文生图节点",
  };
  return labels[value] || value;
}

function isComposerDrivenNode(kind: NodeKind) {
  return kind === "text_to_image" || kind === "image_to_image" || kind === "fuse_images" || kind === "resize" || kind === "outpaint" || kind === "remove_background" || kind === "hd_redraw" || kind === "mask_edit";
}

function composerTitleForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") return "文生图";
  if (node.data.kind === "image_to_image") return "图生图";
  if (node.data.kind === "fuse_images") return "AI合成";
  if (node.data.kind === "resize") return "改尺寸";
  if (node.data.kind === "remove_background") return "透明 PNG";
  if (node.data.kind === "outpaint") return "扩图";
  if (node.data.kind === "hd_redraw") return "高清";
  if (node.data.kind === "mask_edit") return "局部修改";
  return "当前节点";
}

function composerPlaceholderForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") return "输入提示词";
  if (node.data.kind === "image_to_image") return "写改版方向";
  if (node.data.kind === "fuse_images") return "写合成要求";
  if (node.data.kind === "resize") return "写适配要求";
  if (node.data.kind === "remove_background") return "点击运行";
  if (node.data.kind === "outpaint") return "写补画内容";
  if (node.data.kind === "hd_redraw") return "写增强方向";
  if (node.data.kind === "mask_edit") return "写局部修改";
  return "输入要求";
}

function composerHelperTextForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") return textReferenceNodeItems(node.data).length ? `已连接 ${textReferenceNodeItems(node.data).length} 张图片参考。` : "输入需求后直接生成 2 个方案。";
  if (node.data.kind === "image_to_image") return "默认生成两个明显不同的创意改版方向。";
  if (node.data.kind === "fuse_images") return "图1主体放入图2场景，生成自然版和广告版。";
  if (node.data.kind === "resize") return "尺寸在右侧，底部写保留重点。";
  if (node.data.kind === "remove_background") return "运行后抠图并验证 alpha。";
  if (node.data.kind === "outpaint") return "说明补哪里、补什么。";
  if (node.data.kind === "hd_redraw") return "默认保持构图，只增强清晰度。";
  if (node.data.kind === "mask_edit") return "涂哪里，改哪里。";
  return "";
}

function canSubmitComposerForNode(node: FlowNode, prompt: string) {
  if (node.data.kind === "text_to_image") return Boolean(prompt.trim());
  return true;
}

function composerSubmitStatus(node: FlowNode, prompt: string) {
  if (node.data.kind === "text_to_image") return "已更新文生图提示词并开始运行。";
  if (node.data.kind === "image_to_image") return prompt.trim() ? "已更新图生图想法并开始运行。" : "已按图生图默认要求开始运行。";
  if (node.data.kind === "fuse_images") return prompt.trim() ? "已更新合成要求并开始运行。" : "已按当前 AI 合成设置开始运行。";
  if (node.data.kind === "resize") return prompt.trim() ? "已更新改比例要求并开始运行。" : "已按当前比例、尺寸和清晰度设置开始运行。";
  if (node.data.kind === "remove_background") return "已开始移除背景并输出透明 PNG。";
  if (node.data.kind === "outpaint") return prompt.trim() ? "已更新扩图要求并开始运行。" : "已按当前扩图设置开始运行。";
  if (node.data.kind === "hd_redraw") return prompt.trim() ? "已更新高清重绘要求并开始运行。" : "已按当前高清重绘设置开始运行。";
  if (node.data.kind === "mask_edit") return "已更新局部修改内容并开始运行。";
  return "已开始运行当前节点。";
}

function nodeCreationHint(type: NodeKind, fromImage: boolean) {
  if (type === "text_to_image") return fromImage ? "已创建文生图节点，并连接当前图片作为参考。" : "已创建文生图节点。直接在底部输入需求即可生成。";
  if (type === "image_to_image") return fromImage ? "已创建图生图创意改版节点。默认会参考原图生成两个不同方案。" : "已创建图生图创意改版节点。先连接图片，再写改版方向。";
  if (type === "fuse_images") return fromImage ? "已创建 AI 合成节点。当前图片是图1主体，再连接图2场景。" : "已创建 AI 合成节点。请连接图1主体和图2场景。";
  if (type === "resize") return fromImage ? "已创建改比例节点。先在右侧选目标比例、尺寸和清晰度，再运行。" : "已创建改比例节点。请先连接图片，再选择目标比例、尺寸和清晰度。";
  if (type === "remove_background") return fromImage ? "已创建透明抠图节点。运行后会输出真透明 PNG 并检查 alpha。" : "已创建透明抠图节点。请先连接图片，再运行输出。";
  if (type === "layer_output") return fromImage ? "已创建分层拆图节点。运行后会拆出无文字背景和文字透明 PNG。" : "已创建分层拆图节点。请先连接一张图片。";
  if (type === "outpaint") return fromImage ? "已创建扩图补画节点。下面可补充扩图想法，右侧可改方向和比例。" : "已创建扩图补画节点。请先连接图片，再决定扩到什么比例。";
  if (type === "mask_edit") return "已创建局部涂抹节点。先连接图片并打开涂抹面板，再写要改什么。";
  if (type === "hd_redraw") return fromImage ? "已创建高清重绘节点。下面可补充重绘要求，或直接运行默认增强。" : "已创建高清重绘节点。请先连接图片，再决定要增强哪些细节。";
  return "节点已创建。";
}

function buildImageRecommendations(image: ImageAsset | null): Array<{ label: string; reason: string; type: NodeKind; handle: string; params?: Record<string, unknown> }> {
  const ratio = imageRatio(image);
  const size = Math.max(image?.outputSize?.width || image?.width || 0, image?.outputSize?.height || image?.height || 0);
  const recommendations: Array<{ label: string; reason: string; type: NodeKind; handle: string; params?: Record<string, unknown> }> = [];

  if (!image) {
    return [
      { label: "先上传图片", reason: "图片节点还没有素材。", type: "image_input", handle: "source" },
    ];
  }

  if (size && size < 1800) {
    recommendations.push({ label: "高清重绘", reason: "当前长边偏小，先让内容真正变清晰。", type: "hd_redraw", handle: "image", params: { quality: "standard" } });
    recommendations.push({ label: "4K无损导出", reason: "按原比例放大到交付尺寸，不改文字和构图。", type: "upscale_4k", handle: "image", params: { targetSize: inferTargetSizeFromImage(image), fitMode: "keep_ratio", quality: "4k" } });
  } else {
    recommendations.push({ label: "高清重绘", reason: "保持构图，增强细节、边缘和质感。", type: "hd_redraw", handle: "image", params: { quality: "standard" } });
  }

  if (ratio > 1.25) {
    recommendations.push({ label: "转 9:16", reason: "转成竖版比例。", type: "resize", handle: "image", params: { targetRatio: "9:16", targetSize: "1080x1920", sizePreset: "9:16", fitMode: "smart_relayout" } });
  } else if (ratio < 0.8) {
    recommendations.push({ label: "转 16:9", reason: "转成横版比例。", type: "resize", handle: "image", params: { targetRatio: "16:9", targetSize: "1920x1080", sizePreset: "16:9", fitMode: "smart_relayout" } });
  } else {
    recommendations.push({ label: "转 3:4", reason: "转成常用竖图比例。", type: "resize", handle: "image", params: { targetRatio: "3:4", targetSize: "1080x1440", sizePreset: "3:4", fitMode: "smart_relayout" } });
  }

  recommendations.push({ label: "局部涂抹修改", reason: "只修补指定区域，保护未涂抹内容。", type: "mask_edit", handle: "image" });
  recommendations.push({ label: "AI合成", reason: "作为图1主体，再连接图2场景自然合成。", type: "fuse_images", handle: "imageA" });
  return recommendations.slice(0, 5);
}

function buildOutpaintPrompt(params: Record<string, unknown>) {
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

function buildMaskEditPrompt(params: Record<string, unknown>) {
  const userPrompt = stringParam(params.prompt);
  return [
    "局部涂抹修补：只改涂抹区，其他区域保持原图。",
    "保留原有标题、机构名、电话、地址、Logo、二维码和主体人物；不要因项目记忆自行新增。",
    "涂抹区含文字时，只按用户要求修补，不凭空加文案。",
    userPrompt ? `用户修补要求：${userPrompt}` : "用户修补要求：请根据涂抹区域自然修补，让画面更完整、更干净。",
    "边缘自然，风格统一，不要补丁感。",
  ].join("\n");
}

function buildResizePrompt(params: Record<string, unknown>, ratio: AspectRatioValue) {
  const targetSize = stringParam(params.targetSize) || defaultTargetSizeForRatio(ratio);
  const preset = stringParam(params.sizePreset) || resizePresetLabelFromParams(params);
  const fitMode = stringParam(params.fitMode) || "smart_relayout";
  const userPrompt = stringParam(params.prompt);
  return [
    userPrompt ? `用户改尺寸要求：${userPrompt}` : "",
    "AI 改尺寸 / resize 重绘。",
    fitMode === "keep_ratio"
      ? "保持原图比例和构图方向，只按目标尺寸导出，不改变版式和未指定内容。"
      : `重新设计成 ${preset}，目标尺寸 ${targetSize}，版式、层级、留白、文字位置和视觉重心适配新尺寸。`,
    fitMode === "keep_ratio"
      ? "保持比例放大：不要加边、裁切或改比例。"
      : fitMode === "pad"
      ? "补背景保完整：可补充背景，但不能白边或空边。"
      : fitMode === "crop"
        ? "安全裁切：主体和文字必须留在安全区。"
        : fitMode === "smart_outpaint"
          ? "扩图补画：保持原构图，向外补全背景和内容，禁止白边。"
          : "智能改版：按目标比例重排标题、Logo、主体、卖点和背景；不要简单裁切、拉伸或两侧虚化补边。",
    fitMode === "smart_relayout"
      ? "构图：先识别元素和信息层级，再重排阅读顺序；重要元素进中心 76% 安全区，四周 18% 只放背景和出血装饰。"
      : "",
    fitMode === "keep_ratio"
      ? "目标：真实目标像素尺寸，文字不变形。"
      : "目标：适配目标比例，主体、文字和品牌信息完整安全。",
    "保留原图核心内容、标题、人物、产品、电话、地址、Logo 和二维码；不要自行生成真实信息。",
  ]
    .filter(Boolean)
    .join("\n");
}

function activeResizePresetLabel(data: WorkflowNodeData) {
  return resizePresetLabelFromParams(data.params);
}

function resizePresetLabelFromParams(params: Record<string, unknown>) {
  const targetSize = stringParam(params.targetSize);
  const targetRatio = ratioParam(params.targetRatio);
  return resizePresets.find((preset) => preset.targetSize === targetSize)?.label || targetRatio;
}

function resizeFitModeLabel(value: string) {
  if (value === "smart_relayout") return "智能改版";
  if (value === "smart_outpaint") return "扩图补画";
  if (value === "keep_ratio") return "4K无损导出";
  if (value === "ai_redraw") return "AI高清重绘";
  if (value === "crop" || value === "pad") return "智能改版";
  return "智能改版";
}

function resizeFitModeValue(label: string) {
  if (label === "智能改版") return "smart_relayout";
  if (label === "扩图补画" || label === "智能扩图") return "smart_outpaint";
  if (label === "保持比例放大" || label === "4K无损导出") return "keep_ratio";
  if (label === "AI高清重绘") return "ai_redraw";
  return "smart_relayout";
}

function defaultTargetSizeForRatio(value: AspectRatioValue) {
  if (value === "auto") return "1920x1080";
  if (value === "custom") return "1920x1080";
  if (value === "4:3") return "1440x1080";
  if (value === "9.75:1") return "3900x400";
  return resizePresets.find((preset) => preset.targetRatio === value)?.targetSize || "1920x1080";
}

function textToImageCompositionCompleteness(params: Record<string, unknown>) {
  const value = stringParam(params.compositionCompleteness);
  return ["标准", "更完整", "大留白", "全身/全物体"].includes(value) ? value : "更完整";
}

function textToImageSafeMargin(params: Record<string, unknown>) {
  const value = stringParam(params.safeMargin);
  return ["5%", "10%", "15%", "20%"].includes(value) ? value : "15%";
}

function textToImageCameraDistance(params: Record<string, unknown>) {
  const value = stringParam(params.cameraDistance);
  return ["近景", "中景", "远景", "自动"].includes(value) ? value : "中景";
}

function textToImageSubjectScale(params: Record<string, unknown>) {
  const value = stringParam(params.subjectScale);
  return ["大", "中", "小"].includes(value) ? value : "中";
}

function textToImagePreviewFit(_params?: Record<string, unknown>): "contain" {
  void _params;
  return "contain";
}

function withClientTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function isTextReferenceTargetHandle(handle: unknown) {
  return handle === textReferenceInputHandle || legacyTextReferenceHandles.includes(handle as (typeof legacyTextReferenceHandles)[number]);
}

function normalizeTextReferenceConfigs(value: unknown): TextReferenceConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Partial<TextReferenceConfig> => Boolean(entry && typeof entry === "object"))
    .slice(0, maxTextReferenceImages)
    .map((item, index) => {
      const fallback = defaultTextReferenceConfig(stringParam(item.handle) || textReferenceInputHandle, index);
      return {
        handle: stringParam(item.handle) || textReferenceInputHandle,
        role: normalizeTextReferenceRole(item.role, fallback.role),
        weight: normalizeTextReferenceWeight(item.weight, fallback.weight),
      };
    });
}

function defaultTextReferenceConfig(handle: string, index = 0, image?: ImageAsset | null): TextReferenceConfig {
  const inferredRole = inferTextReferenceRole(image, index);
  return {
    handle,
    role: inferredRole,
    weight: inferredRole === "reference_only" ? "medium" : "high",
  };
}

function inferTextReferenceRole(image: ImageAsset | null | undefined, index = 0): TextReferenceRole {
  const text = `${image?.materialType || ""} ${image?.mode || ""} ${image?.fileName || ""}`.toLowerCase();
  if (/logo|标识|品牌/.test(text)) return "logo";
  if (/ip|形象|卡通|角色/.test(text)) return "ip";
  if (/产品|商品|包装|product/.test(text)) return "product";
  if (/人物|人像|医生|专家|person|portrait/.test(text)) return "person";
  if (/背景|background/.test(text)) return "background";
  if (index === 0) return "reference_only";
  return "reference_only";
}

function normalizeTextReferenceRole(value: unknown, fallback: TextReferenceRole = "reference_only"): TextReferenceRole {
  return textReferenceRoleOptions.some((item) => item.value === value) ? value as TextReferenceRole : fallback;
}

function normalizeTextReferenceWeight(value: unknown, fallback: TextReferenceWeight = "medium"): TextReferenceWeight {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function shouldUseStrongTextReferenceMode(prompt: string) {
  return /1\s*[:：比]\s*1|一比一|复刻|仿照|照着|照抄|同款|稍微修改|轻微修改|小改|保持版式|版式不变|保持配色|配色不变|板式配色|版式配色|按这个版式|用这个版式|沿用版式|沿用配色/.test(prompt);
}

function textReferenceRoleLabel(value: unknown) {
  const role = normalizeTextReferenceRole(value);
  return textReferenceRoleOptions.find((item) => item.value === role)?.label || "只做参考";
}

function textReferenceWeightLabel(value: unknown) {
  const weight = normalizeTextReferenceWeight(value);
  return textReferenceWeightOptions.find((item) => item.value === weight)?.label || "中";
}

function ratioFromImage(image: Pick<ImageAsset, "aspectRatio" | "outputSize" | "width" | "height">): AspectRatioValue {
  const width = image.outputSize?.width || image.width;
  const height = image.outputSize?.height || image.height;
  if (width && height) {
    const inferred = inferRatioFromTargetSize(`${width}x${height}`);
    if (inferred !== "custom") return inferred;
  }
  return ratioParam(image.aspectRatio);
}

function inferTargetSizeFromImage(image: ImageAsset, longEdge = 3840) {
  const target = fitImageToLongEdge(image, longEdge);
  return `${target.width}x${target.height}`;
}

function resolveUpscaleTargetFromParams(image: ImageAsset, params: Record<string, unknown>) {
  const targetSize = stringParam(params.targetSize) || "长边3840";
  const longEdge = upscaleLongEdgeFromTargetSize(targetSize) || (qualityParam(params.quality) === "2k" ? 2048 : 3840);
  const target = fitImageToLongEdge(image, longEdge);
  return {
    ...target,
    longEdge,
  };
}

function fitImageToLongEdge(image: ImageAsset, longEdge: number) {
  const width = image.outputSize?.width || image.width || image.ratio?.width || 16;
  const height = image.outputSize?.height || image.height || image.ratio?.height || 9;
  const currentLongEdge = Math.max(width, height);
  const scale = Math.max(1, longEdge) / Math.max(1, currentLongEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function upscaleLongEdgeFromTargetSize(value: string) {
  const text = value.trim();
  const longEdgeMatch = text.match(/(?:长边|long[:：]?)\s*(\d+)/i);
  if (longEdgeMatch) return Number(longEdgeMatch[1]) || 0;
  const shortEdgeMatch = text.match(/(?:短边|short[:：]?)\s*(\d+)/i);
  if (shortEdgeMatch) return Number(shortEdgeMatch[1]) || 0;
  const parsed = parseTargetSize(text);
  if (parsed.width && parsed.height) return Math.max(parsed.width, parsed.height);
  const plainNumber = text.match(/^(\d{3,5})$/);
  if (plainNumber) return Number(plainNumber[1]) || 0;
  return 0;
}

function upscaleSizeOptionsForImage(image: ImageAsset) {
  return [2048, 3840, 4096, 7680]
    .map((edge) => inferTargetSizeFromImage(image, edge))
    .filter((value, index, items) => items.indexOf(value) === index);
}

function isValidUpscaleTarget(value: string) {
  return Boolean(upscaleLongEdgeFromTargetSize(value));
}

function upscaleTargetDisplayLabel(value: string) {
  const longEdge = upscaleLongEdgeFromTargetSize(value);
  if (!longEdge) return value || "长边3840";
  if (/^\d+\s*[x×]\s*\d+$/i.test(value.trim())) return value;
  return `长边${longEdge}`;
}

function imageRatio(image: ImageAsset | null) {
  const width = image?.outputSize?.width || image?.width || image?.ratio?.width || 1;
  const height = image?.outputSize?.height || image?.height || image?.ratio?.height || 1;
  return Math.max(0.08, Math.min(12, width / Math.max(1, height)));
}

function shouldShowCheckerboard(image: ImageAsset | null | undefined) {
  const text = `${image?.mode || ""} ${image?.fileName || ""} ${image?.materialType || ""}`.toLowerCase();
  return Boolean(image?.alphaCheck?.hasTransparentPixels || /透明|transparent|alpha|cutout|text-layer|文字层/.test(text));
}

function compactThumbStyle(image: ImageAsset, maxWidth: number, maxHeight: number) {
  const ratio = imageRatio(image);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return {
    height: Math.max(42, Math.round(height)),
    width: Math.max(42, Math.round(width)),
  };
}

function imageNodePreviewMetrics(image: ImageAsset | null) {
  if (!image) {
    return {
      previewWidth: 180,
      previewHeight: 116,
      nodeWidth: 198,
      estimatedNodeHeight: 168,
    };
  }

  const ratio = imageRatio(image);
  const nodeWidth = ratio >= 2.8 ? 164 : ratio >= 1.35 ? 170 : ratio >= 0.82 ? 158 : 148;
  const previewHeight = ratio >= 2.8 ? 76 : ratio >= 1.35 ? 88 : ratio >= 0.82 ? 102 : 114;
  const previewWidth = Math.max(48, Math.min(nodeWidth - 16, Math.round(previewHeight * ratio)));
  return {
    previewWidth,
    previewHeight,
    nodeWidth,
    estimatedNodeHeight: previewHeight + 52,
  };
}

function imageSizeLabel(image: ImageAsset) {
  if (image.outputSize?.width && image.outputSize?.height) return `${image.outputSize.width} × ${image.outputSize.height}px`;
  if (image.width && image.height) return `${image.width} × ${image.height}px`;
  if (image.ratio?.width && image.ratio?.height) return `${Math.round(image.ratio.width)}:${Math.round(image.ratio.height)}`;
  return "未记录";
}

function qualityBadgeLabel(image: ImageAsset) {
  if (image.qualityCheck?.label) {
    const compact = image.qualityCheck.label.replace(/\s/g, "");
    const withoutSize = compact.replace(/^\d{2,5}[×xX]\d{2,5}(?:px)?(?:[|｜·:：-])?/u, "");
    if (withoutSize) return withoutSize;
  }
  const status = image.qualityCheck?.status;
  if (status === "passed") return "合格";
  if (status === "pending") return "待检查";
  if (status === "size_insufficient") return "尺寸不足";
  if (status === "ratio_mismatch") return "比例异常";
  if (status === "suspected_stretch") return "疑似拉伸";
  if (status === "white_border") return "有白边";
  if (status === "composition_risk") return "构图风险";
  if (status === "blurred_padding") return "疑似补边";
  if (status === "failed") return "质检失败";
  if (status === "empty") return "空结果";
  const size = image.outputSize || (image.width && image.height ? { width: image.width, height: image.height } : null);
  if (!size) return "待检查";
  if (image.quality === "4k" && Math.max(size.width, size.height) < 3840) return "未达4K";
  if (image.quality === "4k") return "4K待检查";
  return "待检查";
}

function qualityTone(image: ImageAsset) {
  const status = image.qualityCheck?.status;
  if (status === "passed") return "bg-[#74e3c5]/12 text-[#adf8e5] border-[#74e3c5]/18";
  if (status === "composition_risk" || status === "blurred_padding") return "bg-[#ffe1a0]/12 text-[#ffe1a0] border-[#ffe1a0]/18";
  if (status === "size_insufficient" || status === "ratio_mismatch" || status === "suspected_stretch" || status === "white_border" || status === "failed" || status === "empty") {
    return "bg-[#ff6b5f]/12 text-[#ffb4a8] border-[#ff6b5f]/18";
  }
  return "bg-white/[0.06] text-white/58 border-white/10";
}

function historyMatchesFilter(image: ImageAsset, filter: string, projectId: string) {
  if (filter === "全部") return true;
  const date = image.generatedAt ? new Date(image.generatedAt) : null;
  if (filter === "今日") return Boolean(date && date.toDateString() === new Date().toDateString());
  if (filter === "项目") return image.projectId === projectId;
  if (filter === "收藏") return Boolean(image.favorite);
  return true;
}

function historyMatchesQuery(image: ImageAsset, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [
    image.fileName,
    image.id,
    image.model,
    image.mode,
    image.nodeOperation,
    image.aspectRatio,
    image.prompt,
    image.projectId,
    imageSizeLabel(image),
    image.qualityCheck?.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

const transparentModeOptions: Array<{ value: TransparentCutoutMode; label: string; note: string }> = [
  { value: "real_cutout", label: "真实抠图", note: "白底产品、Logo、图标" },
  { value: "ai_regenerate", label: "AI重生透明图", note: "头发、艺术字、复杂边缘" },
];

const transparentTypeOptions: Array<{ value: TransparentCutoutType; label: string }> = [
  { value: "auto", label: "自动主体" },
  { value: "person", label: "人物" },
  { value: "product", label: "产品" },
  { value: "logo_icon", label: "Logo/Icon" },
  { value: "text_title", label: "文字/标题" },
  { value: "ip", label: "IP形象" },
];

function transparentCutoutModeParam(value: unknown): TransparentCutoutMode {
  if (value === "auto" || value === "ai_regenerate" || value === "real_cutout") return value;
  return "real_cutout";
}

function transparentCutoutTypeParam(value: unknown): TransparentCutoutType {
  if (value === "person" || value === "product" || value === "logo_icon" || value === "text_title" || value === "ip") return value;
  return "auto";
}

function transparentCutoutModeLabel(value: TransparentCutoutMode) {
  if (value === "ai_regenerate") return "AI重生透明图";
  if (value === "auto") return "自动判断";
  return "真实抠图";
}

function transparentCutoutModeValue(label: string): TransparentCutoutMode {
  if (/AI|重生/.test(label)) return "ai_regenerate";
  if (/自动/.test(label)) return "auto";
  return "real_cutout";
}

function transparentCutoutTypeLabel(value: TransparentCutoutType) {
  const match = transparentTypeOptions.find((item) => item.value === value);
  return match?.label || "自动主体";
}

function transparentCutoutTypeValue(label: string): TransparentCutoutType {
  const match = transparentTypeOptions.find((item) => item.label === label);
  return match?.value || "auto";
}

function recommendTransparentCutout(image: ImageAsset): TransparentCutoutRecommendation & { cutoutType: TransparentCutoutType } {
  const text = [image.fileName, image.mode, image.materialType, image.materialScene, image.prompt].filter(Boolean).join(" ");
  if (image.alphaCheck?.hasTransparentPixels) {
    return { mode: "real_cutout", cutoutType: "auto", confidence: 0.92, reason: "当前图片已经有透明像素，优先保持原主体继续真实抠图或清理边缘。" };
  }
  if (/文字|标题|艺术字|字效|描边|阴影|渐变|title/i.test(text)) {
    return { mode: "ai_regenerate", cutoutType: "text_title", confidence: 0.82, reason: "文字、描边和阴影直接硬抠容易残留背景，建议 AI重生文字透明 PNG。" };
  }
  if (/人物|人像|头发|发丝|模特|医生|老师|学生|portrait|person/i.test(text)) {
    return { mode: "ai_regenerate", cutoutType: "person", confidence: 0.78, reason: "人物和头发边缘通常复杂，AI重生更容易得到干净边缘。" };
  }
  if (/logo|icon|图标|标识/i.test(text)) {
    return { mode: "real_cutout", cutoutType: "logo_icon", confidence: 0.86, reason: "Logo/Icon 通常边缘清楚，真实抠图能保留原始形状和颜色。" };
  }
  if (/产品|包装|瓶|盒|物体|product/i.test(text)) {
    return { mode: "real_cutout", cutoutType: "product", confidence: 0.74, reason: "产品图优先真实抠图，能保持包装文字、形状和材质不变。" };
  }
  return { mode: "real_cutout", cutoutType: "auto", confidence: 0.62, reason: "未发现明显复杂边缘信号，默认先用真实抠图；如果脏边再切换 AI重生。" };
}

function transparentNodeDefaults(image: ImageAsset) {
  const recommendation = recommendTransparentCutout(image);
  return {
    cutoutMode: recommendation.mode,
    cutoutType: recommendation.cutoutType,
    recommendationReason: recommendation.reason,
  };
}

function canLayerOutput(image: ImageAsset) {
  if (!image?.url) return false;
  const operation = (image.nodeOperation || image.version?.nodeOperation || "").toLowerCase();
  const modeText = [image.mode, image.materialType, image.materialScene, image.prompt].filter(Boolean).join(" ");
  if (operation === "layer_output" || operation === "remove_background") return false;
  if (/分层拆图|分层输出|文字透明PNG|透明 PNG|透明PNG|抠图|remove_background/i.test(modeText)) return false;
  return true;
}

function layerOutputResultImages(result: LayerOutputResult | null) {
  if (!result) return [];
  return [result.layers?.background || null, result.layers?.textLayer || null].filter((image): image is ImageAsset => Boolean(image?.url));
}

function isLayerOutputTextImage(image: ImageAsset) {
  const label = [image.materialType, image.mode, image.branchLabel, image.fileName].filter(Boolean).join(" ");
  return /文字透明|文字重建|原图文字|文字裁剪|text_(full|cropped|cutout)/i.test(label) && !/无文字背景|background_no_text/i.test(label);
}

function assertLayerOutputComplete(result: LayerOutputResult | null, options: LayerOutputOptions) {
  if (!result) throw new Error("分层拆图没有返回结果。");
  const missing: string[] = [];
  if (options.includeBackground && !result.layers?.background?.url) missing.push(result.errors?.background || "无文字背景未生成");
  if (options.includeTextLayer && !result.layers?.textLayer?.url) missing.push(result.errors?.textLayer || "文字透明 PNG 未生成");
  if (missing.length) {
    throw new Error(`分层拆图未完整完成：${missing.join("；")}。请重新运行分层拆图，成功后节点应同时显示“无文字背景”和“文字透明 PNG”。`);
  }
}

function mergeLayerOutputResults(current: LayerOutputResult | null, incoming: LayerOutputResult) {
  if (!current) return incoming;
  const images = mergeImages(incoming.images || [], current.images || []);
  return {
    ...incoming,
    images,
	    layers: {
	      original: incoming.layers?.original || current.layers?.original || null,
	      fullPreview: incoming.layers?.fullPreview || current.layers?.fullPreview || null,
	      background: incoming.layers?.background || current.layers?.background || null,
	      backgroundNoText: incoming.layers?.backgroundNoText || current.layers?.backgroundNoText || null,
	      textLayer: incoming.layers?.textLayer || current.layers?.textLayer || null,
	      textFull: incoming.layers?.textFull || current.layers?.textFull || null,
	      textRebuilt: incoming.layers?.textRebuilt || current.layers?.textRebuilt || null,
	      textCutout: incoming.layers?.textCutout || current.layers?.textCutout || null,
	      textCropped: incoming.layers?.textCropped || current.layers?.textCropped || null,
	      mask: incoming.layers?.mask || current.layers?.mask || null,
	      textAlphaMask: incoming.layers?.textAlphaMask || current.layers?.textAlphaMask || null,
	      repairMask: incoming.layers?.repairMask || current.layers?.repairMask || null,
	      backgroundFirstPass: incoming.layers?.backgroundFirstPass || current.layers?.backgroundFirstPass || null,
	    },
    errors: {
      background: incoming.layers?.background ? undefined : incoming.errors?.background ?? current.errors?.background,
      textLayer: incoming.layers?.textLayer ? undefined : incoming.errors?.textLayer ?? current.errors?.textLayer,
    },
  };
}

function layerOutputSuccessMessage(result: LayerOutputResult | null) {
  const outputs = layerOutputResultImages(result);
  if (!outputs.length) return "分层拆图没有可用输出";
  const labels = outputs.map((image) => image.materialType || image.mode || "输出").join("、");
  const errors = [result?.errors?.background, result?.errors?.textLayer].filter(Boolean);
  return errors.length ? `已生成${labels}，另有部分失败可单独重试。` : `已生成${labels}。`;
}

function enrichPrompt(prompt: string, notes?: string) {
  const text = prompt.trim();
  if (!text) return text;
  const noteText = notes?.trim();
  if (!noteText) return text;
  return `${text}\n\n项目素材备注：${noteText}`;
}

function isConservativeImageToImageNote(line: string) {
  return /keepMainSubject|主体、产品、主视觉结构不要改变|主体和构图尽量保持|核心构图不要随意替换|保持原图|原图比例|比例不变|内容不减|只优化版式|不改变布局|不要改变版式|主体结构.*不变|主要版式.*不变/.test(line);
}

function sanitizeLegacyImageToImagePrompt(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isLegacyImageToImageDefault(line))
    .join("\n");
}

function isLegacyImageToImageDefault(line: string) {
  return /内容不减，比例不变，优化版式，生成(?:专业清晰的)?新版设计。?$/.test(line) ||
    /内容不减，比例不变，保留原图核心文字、LOGO、电话、地址和主体信息，只优化版式、光影、背景质感和视觉层级，生成专业清晰的新版设计。?$/.test(line) ||
    /保持主体结构和主要版式不变，只优化我接下来指定的部分。?$/.test(line);
}

function buildProjectConstraintText(
  text: string,
  profile: ProjectProfile,
  textProtectionMode: boolean,
  taskContextNotes?: string,
  visibleRequestText?: string,
  brandAssets: ImageAsset[] = [],
) {
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText || text);
  const brandAssetContext = buildBrandAssetContextPack(profile, brandAssets, visibleRequestText || text);
  const profileNotes = [
    profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    projectProfileColors(profile).length ? `品牌色：${projectProfileColors(profile).join("、")}` : "",
    visibleRequests.logo && profile.logoName ? `用户要求 Logo：${profile.logoName}` : "",
    visibleRequests.phone && profile.phone ? `用户要求电话：${profile.phone}` : "",
    visibleRequests.address && profile.address ? `用户要求地址：${profile.address}` : "",
    visibleRequests.qr && profile.qrCodeNote ? `用户要求二维码：${profile.qrCodeNote}` : "",
    profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
    profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
    profile.styleNotes ? `风格说明：${profile.styleNotes}` : "",
    profile.keepFace ? "保护人脸/人物识别度。" : "",
    profile.keepMainSubject ? "保护主体、产品和主视觉识别度。" : "",
    profile.onlyEditMaskedArea ? "onlyEditMaskedArea：局部修改时只允许修改涂抹区域。" : "",
  ].filter(Boolean);
  const notes = [text.trim(), brandAssetContext, ...profileNotes, taskContextNotes || ""].filter(Boolean).join("\n");
  if (!textProtectionMode) return notes;
  return [
    notes,
    "规则：只保护用户明确要求或原图真实存在的文字/Logo/二维码；项目记忆不自动上画。",
    "成图完整铺满目标尺寸，不要白边、托板、相框边或故意留白。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBrandAssetContextPack(profile: ProjectProfile, brandAssets: ImageAsset[], visibleRequestText = "") {
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const logoAssets = findBrandAssets(brandAssets, "logo");
  const ipAssets = findBrandAssets(brandAssets, "ip");
  const qrAssets = findBrandAssets(brandAssets, "qrcode");
  const backgroundAssets = findBrandAssets(brandAssets, "background");
  const primaryColors = extractColorValues(profile.primaryColors || profile.brandColors);
  const secondaryColors = Array.from(new Set([
    ...extractColorValues(profile.secondaryColors),
    ...extractColorValues(profile.accentColors),
    ...extractColorValues(profile.backgroundColors),
    ...extractColorValues(profile.textColors),
    ...extractColorValues(profile.colorPalettes),
  ]));
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText);
  const lines = [
    "【项目素材】",
    profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    usage.usePrimaryColors && primaryColors.length ? `项目主色：${primaryColors.join("、")}` : "",
    usage.useSecondaryColors && secondaryColors.length ? `辅助配色：${secondaryColors.join("、")}` : "",
    usage.useLogo && (profile.logoName || logoAssets.length) ? `Logo：${[profile.logoName, assetNames(logoAssets)].filter(Boolean).join("；")}` : "",
    usage.useIpImage && ipAssets.length ? `IP形象：${assetNames(ipAssets)}` : "",
    usage.useContact && profile.phone ? `电话：${profile.phone}` : "",
    usage.useContact && profile.address ? `地址：${profile.address}` : "",
    usage.useQrCode && (profile.qrCodeNote || qrAssets.length) ? `二维码：${[profile.qrCodeNote, assetNames(qrAssets)].filter(Boolean).join("；")}` : "",
    usage.useCopy && profile.commonCopy ? `常用宣传语：${splitProfileLines(profile.commonCopy).join("；")}` : "",
    usage.useForbiddenRules && profile.forbiddenContent ? `禁止事项：${splitProfileLines(profile.forbiddenContent).join("；")}` : "",
    backgroundAssets.length ? `常用背景：${assetNames(backgroundAssets)}` : "",
    visibleRequests.phone && !profile.phone ? "用户要求电话但项目资料未填写电话：请提示缺少电话，不要编造。" : "",
    visibleRequests.address && !profile.address ? "用户要求地址但项目资料未填写地址：请提示缺少地址，不要编造。" : "",
    visibleRequests.logo && !profile.logoName && !logoAssets.length ? "用户要求 Logo 但项目素材库未提供 Logo：不要编造 Logo。" : "",
    visibleRequests.qr && !profile.qrCodeNote && !qrAssets.length ? "用户要求二维码但项目素材库未提供二维码：不要生成假二维码。" : "",
    "调用规则：只用当前项目素材；电话/地址/Logo/二维码只有用户明确要求或开关启用才上画；缺失则不编造。",
    missingBrandAssetWarning(profile, brandAssets),
  ].filter(Boolean);
  return lines.length > 3 ? lines.join("\n") : "";
}

function assetNames(assets: ImageAsset[]) {
  return assets
    .map((asset) => asset.fileName || asset.materialType || asset.mode || asset.id)
    .filter(Boolean)
    .slice(0, 6)
    .join("、");
}

function missingBrandAssetWarning(profile: ProjectProfile, brandAssets: ImageAsset[]) {
  const missing = [
    projectProfileColors(profile).length ? "" : "主色",
    findBrandAssets(brandAssets, "logo").length || profile.logoName ? "" : "Logo",
    profile.phone || profile.address ? "" : "联系方式",
    findBrandAssets(brandAssets, "ip").length ? "" : "IP形象",
  ].filter(Boolean);
  return missing.length
    ? `当前项目还没有完整品牌资产，建议补充${missing.join("、")}，生成结果会更准确。缺少品牌素材时，生成结果只能作为灵感初稿，不能当正式交付稿。`
    : "";
}

function resolveVisibleProjectInfoRequests(text: string) {
  const prompt = text || "";
  const explicitAdd = /放上|加上|加入|添加|写上|显示|展示|露出|带上|包含|需要|必须有|要有|使用|引用|贴上/.test(prompt);
  return {
    phone: explicitAdd && /电话|联系方式|联系电话|手机号|热线|预约电话/.test(prompt),
    address: explicitAdd && /地址|位置|定位|地图|导航|门店|院区/.test(prompt),
    logo: explicitAdd && /logo|Logo|LOGO|标志|品牌标识|院标|馆标/.test(prompt),
    qr: explicitAdd && /二维码|扫码|QR|qr/.test(prompt),
    ip: explicitAdd && /IP形象|ip形象|吉祥物|卡通形象/.test(prompt),
  };
}

function strategyMetaFromParams(params: Record<string, unknown>): Partial<TaskRecord> {
  const meta = params.strategyMeta as Partial<TaskRecord> | undefined;
  if (!meta || typeof meta !== "object") return {};
  return {
    strategyPackageId: stringParam(meta.strategyPackageId),
    sourceStrategyTitle: stringParam(meta.sourceStrategyTitle),
    materialPlanItemId: stringParam(meta.materialPlanItemId),
    materialType: stringParam(meta.materialType),
    targetSize: stringParam(meta.targetSize),
    materialCopy: stringParam(meta.materialCopy),
    materialScene: stringParam(meta.materialScene),
    prompt: stringParam(meta.prompt),
  };
}

function profileToContextText(profile: ProjectProfile) {
  return [
    profile.organizationName ? `项目记忆-机构名称：${profile.organizationName}` : "",
    projectProfileColors(profile).length ? `品牌色：${projectProfileColors(profile).join("、")}` : "",
    profile.primaryColors ? `主色：${profile.primaryColors}` : "",
    profile.secondaryColors ? `辅助色：${profile.secondaryColors}` : "",
    profile.accentColors ? `强调色：${profile.accentColors}` : "",
    profile.backgroundColors ? `背景色：${profile.backgroundColors}` : "",
    profile.textColors ? `文字色：${profile.textColors}` : "",
    profile.colorPalettes ? `配色方案：${profile.colorPalettes}` : "",
    profile.logoName ? `项目记忆-Logo：${profile.logoName}。未明确要求时不要放入画面。` : "",
    profile.phone ? `项目记忆-电话：${profile.phone}。未明确要求时不要放入画面。` : "",
    profile.address ? `项目记忆-地址：${profile.address}。未明确要求时不要放入画面。` : "",
    profile.qrCodeNote ? `项目记忆-二维码：${profile.qrCodeNote}。未明确要求时不要放入画面。` : "",
    profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
    profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
    profile.commonSizes ? `常用尺寸：${profile.commonSizes}` : "",
    profile.styleNotes ? `风格说明：${profile.styleNotes}` : "",
    profile.keepText ? "keepText：只保护明确可见文字" : "",
    profile.keepLogo ? "keepLogo：明确要求使用 Logo 时保护" : "",
    profile.keepQrCode ? "keepQrCode：明确要求使用二维码时保护" : "",
    profile.keepFace ? "keepFace：人脸/专家照保护" : "",
    profile.keepMainSubject ? "keepMainSubject：主体/产品保护" : "",
    profile.onlyEditMaskedArea ? "onlyEditMaskedArea：只改涂抹区域" : "",
  ].filter(Boolean).join("\n");
}

function normalizeEditableLayers(image: ImageAsset, profile: ProjectProfile) {
  if (Array.isArray(image.editableLayers) && image.editableLayers.length) return image.editableLayers;
  return deriveEditableLayers(image, profile);
}

function deriveEditableLayers(image: ImageAsset, profile: ProjectProfile): EditableLayer[] {
  const layers: EditableLayer[] = [
    {
      id: "layer_background",
      kind: "background",
      label: "背景层",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      locked: false,
      visible: false,
      role: "AI 可重绘背景、光影、材质和氛围。",
    },
  ];
  const protectedTexts = image.protectionContext?.protectedTexts || [];
  const textSources = [
    ...protectedTexts.map((item) => ({ text: item.text, kind: item.kind, locked: item.importance === "critical" })),
  ].filter((item) => Boolean(item.text));
  const uniqueTexts = Array.from(new Map(textSources.map((item) => [item.text, item])).values()).slice(0, 6);
  uniqueTexts.forEach((item, index) => {
    layers.push({
      id: `layer_text_${index + 1}`,
      kind: "text",
      label: textLayerLabel(item.kind, index),
      text: item.text,
      x: index === 0 ? 14 : 16,
      y: index === 0 ? 12 : 22 + index * 10,
      width: index === 0 ? 72 : 68,
      height: index === 0 ? 12 : 8,
      fontSize: index === 0 ? 54 : item.kind === "phone" ? 42 : 30,
      color: "#ffffff",
      fontWeight: item.kind === "phone" || index === 0 ? 800 : 650,
      lineHeight: 1.15,
      letterSpacing: 0,
      align: "center",
      strokeColor: "rgba(0,0,0,0.45)",
      strokeWidth: index === 0 || item.kind === "phone" ? 1 : 0,
      shadowColor: "rgba(0,0,0,0.58)",
      shadowBlur: 12,
      locked: item.locked,
      visible: true,
      role: item.kind,
    });
  });
  const assets = image.protectionContext?.protectedAssets || [];
  if (assets.some((asset) => asset.type === "portrait" || asset.type === "product") || image.protectionContext?.layers?.some((layer) => layer.type === "person")) {
    layers.push({
      id: "layer_subject",
      kind: "subject",
      label: assets.find((asset) => asset.type === "portrait")?.label || assets.find((asset) => asset.type === "product")?.label || "主体/人像",
      x: 34,
      y: 18,
      width: 34,
      height: 58,
      locked: profile.keepFace || profile.keepMainSubject,
      visible: true,
      role: "主体、人像或产品保护层",
    });
  }
  if (assets.some((asset) => asset.type === "logo")) {
    layers.push({
      id: "layer_logo",
      kind: "logo",
      label: profile.logoName || assets.find((asset) => asset.type === "logo")?.label || "Logo",
      x: 7,
      y: 7,
      width: 16,
      height: 9,
      locked: profile.keepLogo,
      visible: true,
      role: "Logo 保护层",
    });
  }
  if (assets.some((asset) => asset.type === "qr")) {
    layers.push({
      id: "layer_qr",
      kind: "qr",
      label: "二维码",
      x: 82,
      y: 72,
      width: 12,
      height: 16,
      locked: profile.keepQrCode,
      visible: true,
      role: "二维码保护层",
    });
  }
  layers.push({
    id: "layer_decoration",
    kind: "decoration",
    label: "装饰元素",
    x: 8,
    y: 82,
    width: 84,
    height: 10,
    locked: false,
    visible: false,
    role: "可替换或重绘的装饰元素层",
  });
  return layers;
}

function textLayerLabel(kind: string, index: number) {
  if (kind === "hospital") return "机构名称";
  if (kind === "phone") return "电话";
  if (kind === "address") return "地址";
  if (kind === "title") return "标题";
  if (kind === "logo") return "Logo文字";
  return index === 0 ? "主标题" : `文字 ${index + 1}`;
}

function inspectLayoutReadability(image: ImageAsset, layers: EditableLayer[]): LayoutCheck {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const spec = getLayoutTemplateSpec(image);
  const template = spec.name;
  const ratio = imageRatio(image);
  const textLayers = layers.filter((layer) => layer.kind === "text" && layer.visible !== false);
  const importantLayers = layers.filter((layer) => layer.kind === "logo" || layer.kind === "qr" || layer.kind === "subject" || /电话|机构|地址|Logo|二维码|主体|人像/.test(layer.label));
  const lockedImportant = importantLayers.filter((layer) => layer.locked);
  const minMargin = spec.safety;

  for (const layer of textLayers) {
    if (layer.x < minMargin || layer.y < minMargin || layer.x + layer.width > 100 - minMargin || layer.y + layer.height > 100 - minMargin) {
      issues.push(`${layer.label} 靠近边缘。`);
      suggestions.push(`${layer.label} 增加边距，至少保留 ${minMargin}% 空间。`);
    }
    if ((layer.fontSize || 0) < outdoorMinFontSize(template, ratio)) {
      issues.push(`${layer.label} 字号偏小。`);
      suggestions.push(`${layer.label} 建议放大 20%，户外/电子屏优先保证远距离可读。`);
    }
    if ((template === "公交广告" || template === "电子屏") && (layer.shadowBlur || 0) < 8 && (layer.strokeWidth || 0) < 1) {
      issues.push(`${layer.label} 对比度保护不足。`);
      suggestions.push(`${layer.label} 建议增加阴影或 1px 描边，避免远距离看不清。`);
    }
    if ((layer.text || "").length > 36 && (template === "公交广告" || template === "电子屏")) {
      issues.push(`${layer.label} 文案偏长。`);
      suggestions.push("户外广告建议删减副文案，保留一个核心卖点和电话。");
    }
  }

  for (const layer of importantLayers.filter((item) => item.visible !== false)) {
    if (!layer.locked) {
      issues.push(`${layer.label} 未锁定。`);
      suggestions.push(`${layer.label} 建议锁定，避免后续 AI 重绘时被改坏。`);
    }
    if (layer.x < minMargin || layer.y < minMargin || layer.x + layer.width > 100 - minMargin || layer.y + layer.height > 100 - minMargin) {
      issues.push(`${layer.label} 贴边过近。`);
      suggestions.push(`${layer.label} 增加边距，尤其是 Logo、二维码和电话。`);
    }
  }

  const phoneLayer = textLayers.find((layer) => /电话|phone/i.test(`${layer.label} ${layer.role || ""}`));
  const titleLayer = textLayers.find((layer) => /标题|机构|主标题|title/i.test(`${layer.label} ${layer.role || ""}`)) || textLayers[0];
  if (phoneLayer && titleLayer && (phoneLayer.fontSize || 0) < Math.max(28, (titleLayer.fontSize || 36) * 0.72)) {
    issues.push("电话不够醒目。");
    suggestions.push("电话建议加粗放大，至少达到标题字号的 70%，方便户外远距离识别。");
  }
  const qrLayer = layers.find((layer) => layer.kind === "qr" && layer.visible !== false);
  if (qrLayer && (qrLayer.width < 10 || qrLayer.height < 10)) {
    issues.push("二维码尺寸偏小。");
    suggestions.push("二维码建议至少占画面短边 10%，并保留安静区。");
  }

  if (!lockedImportant.length && image.qualityCheck?.importantContentRisk) {
    issues.push("重要信息未全部锁定。");
    suggestions.push("请锁定医院名、电话、Logo、二维码后再做 AI 重绘。");
  }
  if (!textLayers.length) {
    suggestions.push("可以新增文字层，把关键标题、电话、地址作为可编辑元素管理。");
  }

  const status: LayoutCheck["status"] = issues.length > 3 ? "failed" : issues.length ? "risk" : "passed";
  return {
    status,
    label: status === "passed" ? "排版合格" : status === "failed" ? "排版不通过" : "排版有风险",
    issues,
    suggestions: suggestions.length ? Array.from(new Set(suggestions)) : ["安全边距、字号、锁定信息当前未发现明显问题。"],
  };
}

function outdoorMinFontSize(template: string, ratio: number) {
  if (template === "公交广告" || ratio > 4) return 42;
  if (template === "电子屏") return 38;
  if (template === "抖音/易拉宝") return 30;
  return 24;
}

type LayoutZone = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: "safe" | "danger" | "neutral";
};

type LayoutTemplateSpec = {
  name: string;
  safety: number;
  bleed: number;
  titleFont: number;
  phoneFont: number;
  zones: LayoutZone[];
};

function getLayoutTemplateSpec(image: ImageAsset): LayoutTemplateSpec {
  const name = inferLayoutTemplate(image);
  if (name === "公交广告") {
    return {
      name,
      safety: 8,
      bleed: 2,
      titleFont: 52,
      phoneFont: 44,
      zones: [
        { label: "标题区", x: 10, y: 12, width: 48, height: 28, tone: "safe" },
        { label: "主体区", x: 55, y: 10, width: 32, height: 72, tone: "neutral" },
        { label: "电话区", x: 10, y: 68, width: 42, height: 16, tone: "safe" },
        { label: "Logo区", x: 8, y: 8, width: 13, height: 8, tone: "neutral" },
        { label: "二维码区", x: 82, y: 68, width: 10, height: 16, tone: "danger" },
      ],
    };
  }
  if (name === "电子屏") {
    return {
      name,
      safety: 7,
      bleed: 1.5,
      titleFont: 46,
      phoneFont: 40,
      zones: [
        { label: "标题区", x: 12, y: 18, width: 42, height: 28, tone: "safe" },
        { label: "卖点区", x: 12, y: 50, width: 42, height: 22, tone: "neutral" },
        { label: "主体区", x: 56, y: 12, width: 30, height: 70, tone: "neutral" },
        { label: "Logo区", x: 8, y: 8, width: 12, height: 10, tone: "neutral" },
      ],
    };
  }
  if (name === "抖音/易拉宝") {
    return {
      name,
      safety: 10,
      bleed: 2,
      titleFont: 38,
      phoneFont: 32,
      zones: [
        { label: "标题区", x: 12, y: 12, width: 76, height: 20, tone: "safe" },
        { label: "主体区", x: 14, y: 32, width: 72, height: 42, tone: "neutral" },
        { label: "电话区", x: 16, y: 78, width: 48, height: 10, tone: "safe" },
        { label: "二维码区", x: 70, y: 76, width: 16, height: 14, tone: "danger" },
      ],
    };
  }
  if (name === "小红书封面") {
    return {
      name,
      safety: 10,
      bleed: 2,
      titleFont: 36,
      phoneFont: 30,
      zones: [
        { label: "标题区", x: 12, y: 10, width: 76, height: 24, tone: "safe" },
        { label: "图片区", x: 12, y: 36, width: 76, height: 42, tone: "neutral" },
        { label: "信息区", x: 12, y: 80, width: 76, height: 10, tone: "safe" },
      ],
    };
  }
  return {
    name,
    safety: 6,
    bleed: 2,
    titleFont: 32,
    phoneFont: 28,
    zones: [
      { label: "标题区", x: 10, y: 10, width: 52, height: 20, tone: "safe" },
      { label: "主体区", x: 34, y: 22, width: 54, height: 56, tone: "neutral" },
      { label: "Logo区", x: 7, y: 7, width: 16, height: 9, tone: "neutral" },
      { label: "二维码区", x: 82, y: 72, width: 12, height: 16, tone: "danger" },
    ],
  };
}

function applyLayoutTemplate(layers: EditableLayer[], image: ImageAsset) {
  const spec = getLayoutTemplateSpec(image);
  let textIndex = 0;
  return layers.map((layer) => {
    if (layer.kind === "background" || layer.kind === "decoration") return layer;
    if (layer.kind === "logo") {
      const zone = spec.zones.find((item) => item.label === "Logo区");
      return zone ? { ...layer, x: zone.x, y: zone.y, width: zone.width, height: zone.height, locked: true, visible: true } : { ...layer, locked: true };
    }
    if (layer.kind === "qr") {
      const zone = spec.zones.find((item) => item.label === "二维码区");
      return zone ? { ...layer, x: zone.x, y: zone.y, width: zone.width, height: zone.height, locked: true, visible: true } : { ...layer, locked: true };
    }
    if (layer.kind === "subject") {
      const zone = spec.zones.find((item) => item.label === "主体区") || spec.zones.find((item) => item.label === "图片区");
      return zone ? { ...layer, x: zone.x, y: zone.y, width: zone.width, height: zone.height, locked: true, visible: true } : { ...layer, locked: true };
    }
    if (layer.kind === "text") {
      const isPhone = /电话|phone/i.test(`${layer.label} ${layer.role || ""}`);
      const zone = isPhone
        ? spec.zones.find((item) => item.label === "电话区") || spec.zones.find((item) => item.label === "信息区")
        : textIndex === 0
          ? spec.zones.find((item) => item.label === "标题区")
          : spec.zones.find((item) => item.label === "卖点区") || spec.zones.find((item) => item.label === "信息区");
      textIndex += 1;
      return {
        ...layer,
        x: zone?.x ?? layer.x,
        y: zone?.y ?? layer.y,
        width: zone?.width ?? layer.width,
        height: zone?.height ?? layer.height,
        fontSize: isPhone ? Math.max(layer.fontSize || 0, spec.phoneFont) : textIndex === 1 ? Math.max(layer.fontSize || 0, spec.titleFont) : layer.fontSize,
        fontWeight: isPhone || textIndex === 1 ? Math.max(layer.fontWeight || 0, 800) : layer.fontWeight,
        strokeWidth: spec.name === "公交广告" || spec.name === "电子屏" ? Math.max(layer.strokeWidth || 0, 1) : layer.strokeWidth || 0,
        shadowBlur: Math.max(layer.shadowBlur || 0, 10),
        shadowColor: layer.shadowColor || "rgba(0,0,0,0.58)",
        visible: true,
      };
    }
    return layer;
  });
}

function inferLayoutTemplate(image: ImageAsset) {
  const ratio = imageRatio(image);
  const size = image.outputSize || image.expectedOutputSize;
  if (size?.width === 3000 && size.height === 300) return "电子屏";
  if (ratio > 5) return "公交广告";
  if (Math.abs(ratio - 9 / 16) < 0.06) return "抖音/易拉宝";
  if (Math.abs(ratio - 3 / 4) < 0.06 || Math.abs(ratio - 4 / 5) < 0.06) return "小红书封面";
  if (Math.abs(ratio - 16 / 9) < 0.06) return "PPT/视频封面";
  return "通用设计";
}

async function exportLayoutPng(image: ImageAsset, layers: EditableLayer[]) {
  const blob = await imageUrlToPngBlob(image.url);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("导出排版失败。");
  context.drawImage(bitmap, 0, 0);
  for (const layer of layers) {
    if (layer.visible === false || layer.kind !== "text" || !layer.text) continue;
    const x = (layer.x / 100) * canvas.width;
    const y = (layer.y / 100) * canvas.height;
    const width = (layer.width / 100) * canvas.width;
    const fontSize = layer.fontSize || 36;
    context.save();
    context.fillStyle = layer.color || "#ffffff";
    context.font = `${layer.fontWeight || 700} ${fontSize}px sans-serif`;
    context.textAlign = layer.align || "center";
    context.textBaseline = "top";
    context.shadowColor = layer.shadowColor || "rgba(0,0,0,0.45)";
    context.shadowBlur = layer.shadowBlur ?? 10;
    context.lineWidth = layer.strokeWidth || 0;
    context.strokeStyle = layer.strokeColor || "rgba(0,0,0,0.45)";
    context.lineJoin = "round";
    const drawX = layer.align === "left" ? x : layer.align === "right" ? x + width : x + width / 2;
    layer.text.split("\n").forEach((line, index) => {
      const lineY = y + index * fontSize * (layer.lineHeight || 1.15);
      if (layer.strokeWidth) context.strokeText(line, drawX, lineY, width);
      context.fillText(line, drawX, lineY, width);
    });
    context.restore();
  }
  const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob((nextBlob) => nextBlob ? resolve(nextBlob) : reject(new Error("导出排版失败。")), "image/png"));
  await downloadBlob(output, (image.fileName || "layout.png").replace(/\.[^.]+$/, "-layout.png"));
}

void exportLayoutPng;

function buildProfileProtectionContext(
  profile: ProjectProfile,
  options: {
    projectId: string;
    operation: string;
    sourceImages: ImageAsset[];
    brandAssets?: ImageAsset[];
  },
): ProtectionContextPayload {
  const hasSourceImage = options.sourceImages.length > 0;
  const protectVisibleProfileAssets = hasSourceImage && options.operation !== "text_to_image";
  const brandAssets = options.brandAssets || [];
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const logoAssets = findBrandAssets(brandAssets, "logo");
  const ipAssets = findBrandAssets(brandAssets, "ip");
  const qrAssets = findBrandAssets(brandAssets, "qrcode");
  const protectedTexts: ProtectedTextPayload[] = [
    profile.organizationName ? protectedText("organization", profile.organizationName, "other", "normal", "机构名称来自项目记忆，仅作为项目识别和校对资料") : null,
    usage.useContact && profile.phone ? protectedText("phone", profile.phone, "phone", "critical", "项目电话来自品牌资产包，启用后必须准确使用，不得编造") : null,
    usage.useContact && profile.address ? protectedText("address", profile.address, "address", "critical", "项目地址来自品牌资产包，启用后必须准确使用，不得编造") : null,
    ...(usage.useCopy ? splitProfileLines(profile.commonCopy).map((text, index) => protectedText(`copy_${index + 1}`, text, "title", "normal", "常用文案来自项目资料库")) : []),
    ...(usage.useForbiddenRules ? splitProfileLines(profile.forbiddenContent).map((text, index) => protectedText(`forbidden_${index + 1}`, text, "other", "critical", "禁改内容来自项目资料库")) : []),
  ].filter((item): item is ProtectedTextPayload => Boolean(item && item.text.trim()));

  const protectedAssets: ProtectedAssetPayload[] = [
    (usage.useLogo || (protectVisibleProfileAssets && profile.keepLogo)) && (profile.logoName || logoAssets.length)
      ? {
          id: "asset_logo",
          type: "logo",
          label: profile.logoName || assetNames(logoAssets) || "Logo/品牌标识",
          importance: "critical",
          instruction: "Logo 和品牌标识只能来自当前项目品牌资产，不得由 AI 重新发明；不确定时保持位置和视觉占位，后续可程序化回贴。",
        }
      : null,
    (usage.useQrCode || (protectVisibleProfileAssets && profile.keepQrCode)) && (profile.qrCodeNote || qrAssets.length)
      ? {
          id: "asset_qr",
          type: "qr",
          label: profile.qrCodeNote || assetNames(qrAssets) || "二维码",
          importance: "critical",
          instruction: "二维码不能交给 AI 重绘；必须保持清晰可扫码，后续应使用原始二维码回贴。",
        }
      : null,
    usage.useIpImage && ipAssets.length
      ? {
          id: "asset_ip",
          type: "portrait",
          label: assetNames(ipAssets) || "IP形象",
          importance: "high",
          instruction: "IP/医生形象只能参考当前项目素材库，保持识别度，不要混用其他项目形象。",
        }
      : null,
    protectVisibleProfileAssets && profile.keepFace
      ? {
          id: "asset_face",
          type: "portrait",
          label: "人脸/专家照片",
          importance: "critical",
          instruction: "人脸、医生/专家照片和人物识别度不要改变；需要替换时应由用户明确上传新照片。",
        }
      : null,
    protectVisibleProfileAssets && profile.keepMainSubject
      ? {
          id: "asset_subject",
          type: "product",
          label: "主体/产品/主视觉",
          importance: "high",
          instruction: "主体、产品和主视觉结构保持识别度，不要硬裁切或随意替换。",
        }
      : null,
  ].filter((item): item is ProtectedAssetPayload => Boolean(item));

  const brandColors = [
    ...(usage.usePrimaryColors ? extractColorValues(profile.primaryColors || profile.brandColors) : []),
    ...(usage.useSecondaryColors ? [
      ...extractColorValues(profile.secondaryColors),
      ...extractColorValues(profile.accentColors),
      ...extractColorValues(profile.backgroundColors),
      ...extractColorValues(profile.textColors),
      ...extractColorValues(profile.colorPalettes),
    ] : []),
  ];

  return {
    protectedTexts,
    protectedAssets,
    layers: [
      { id: "layer_background", type: "background", label: "背景层", locked: false, notes: "AI 可优化背景、光影、材质和氛围。" },
      ...(protectVisibleProfileAssets && profile.keepText
        ? [{ id: "layer_text", type: "text" as const, label: "文字层", locked: true, notes: "只保护参考图里已经存在或用户明确要求的文字。" }]
        : []),
      ...(protectVisibleProfileAssets && (profile.keepLogo || profile.keepQrCode)
        ? [{ id: "layer_logo", type: "logo" as const, label: "Logo/二维码层", locked: profile.keepLogo || profile.keepQrCode, notes: "Logo 和二维码必须保持识别准确。" }]
        : []),
      ...(protectVisibleProfileAssets && (profile.keepFace || profile.keepMainSubject)
        ? [{ id: "layer_subject", type: "person" as const, label: "主体/人脸层", locked: true, notes: "参考图里的主体、人脸、产品和主视觉主体需要保持识别度。" }]
        : []),
    ],
    brandProfile: {
      name: profile.organizationName || profile.logoName || undefined,
      colors: brandColors,
      logoPlacement: profile.keepLogo || profile.keepQrCode ? `${profile.keepLogo && profile.logoName ? `Logo：${profile.logoName}` : ""}${profile.keepQrCode && profile.qrCodeNote ? `；二维码：${profile.qrCodeNote}` : ""}` : undefined,
      visualTone: profile.styleNotes || undefined,
      rules: [
        profile.commonSizes ? `常用尺寸：${profile.commonSizes}` : "",
        usage.useForbiddenRules && profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
        usage.useCopy && profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
        usage.useContact && profile.phone ? `项目电话：${profile.phone}。启用电话地址后必须准确使用。` : "未启用或未提供电话时不要自行生成电话。",
        usage.useContact && profile.address ? `项目地址：${profile.address}。启用电话地址后必须准确使用。` : "未启用或未提供地址时不要自行生成地址。",
        usage.useLogo && (profile.logoName || logoAssets.length) ? `项目 Logo：${profile.logoName || assetNames(logoAssets)}。只使用当前项目品牌资产。` : "未提供或未启用 Logo 时不要自行生成，也不要强行预留占位。",
        usage.useQrCode && (profile.qrCodeNote || qrAssets.length) ? `项目二维码：${profile.qrCodeNote || assetNames(qrAssets)}。二维码必须来自原始素材，不要重绘。` : "未提供或未启用二维码时不要自行生成，也不要强行预留占位。",
        usage.useIpImage && ipAssets.length ? `项目 IP形象：${assetNames(ipAssets)}。只参考当前项目素材库。` : "",
        protectVisibleProfileAssets && profile.keepFace ? "保护人脸：参考图里真实存在的人物五官和照片不要改变。" : "",
        protectVisibleProfileAssets && profile.keepMainSubject ? "保护主体：参考图里的主视觉、产品和核心构图不要随意替换。" : "",
        profile.onlyEditMaskedArea ? "局部修改规则：只修改涂抹/蒙版区域，未涂抹区域保持不变。" : "",
        "项目品牌资产按用户勾选项调用；没有素材时禁止编造机构信息、电话、地址、Logo、二维码。",
        "不同项目的品牌资产不能混用；这里只能使用当前项目自己的资料和素材。",
      ].filter(Boolean),
    },
    version: {
      projectId: options.projectId,
      parentIds: options.sourceImages.map((image) => image.id || image.fileName || image.url).filter(Boolean),
      sourceUrls: options.sourceImages.map((image) => image.url).filter(Boolean),
      nodeOperation: options.operation,
    },
  };
}

function protectedText(
  id: string,
  text: string,
  kind: ProtectedTextPayload["kind"],
  importance: ProtectedTextPayload["importance"],
  reason: string,
): ProtectedTextPayload {
  return { id, text: text.trim(), kind, importance, reason };
}

function splitProfileLines(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "未记录";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function shortenPrompt(text: string, max = 56) {
  const value = text.trim();
  if (!value) return "未记录";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function formatGeneratedAt(value?: string) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

async function copyImageToClipboard(image: ImageAsset) {
  if (!window.isSecureContext || !navigator.clipboard || !("ClipboardItem" in window)) {
    throw new Error("当前浏览器不支持直接复制图片，请先下载。");
  }
  const blob = await imageUrlToPngBlob(image.url);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "NotAllowedError"
      ? "浏览器没有允许复制图片，请点一下页面后重试，或使用下载。"
      : "复制图片失败，当前浏览器可能限制了图片剪贴板。请先下载。");
  }
}

async function copyTextToClipboard(text: string) {
  if (!text.trim()) throw new Error("没有可复制的 Prompt。");
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {}

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("复制 Prompt 失败，浏览器阻止了剪贴板权限。");
}

async function downloadImageFile(image: ImageAsset, format: "png" | "jpg" | "webp", fileNameOverride?: string) {
  const blob = format === "jpg" ? await imageUrlToJpegBlob(image.url) : format === "webp" ? await imageUrlToWebpBlob(image.url) : await imageUrlToPngBlob(image.url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  const baseName = fileNameOverride || image.fileName || "design.png";
  link.download = format === "png" ? baseName : baseName.replace(/\.[^.]+$/, `.${format}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

async function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

async function imageUrlToPngBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法复制。");
  const sourceBlob = await response.blob();
  return convertBlobToPng(sourceBlob);
}

async function imageUrlToJpegBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法下载 JPG。");
  const sourceBlob = await response.blob();
  if (sourceBlob.type === "image/jpeg") return sourceBlob;
  return convertBlobToJpeg(sourceBlob);
}

async function imageUrlToWebpBlob(url: string) {
  const response = await fetch(toAbsoluteImageUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error("读取图片失败，无法下载 WebP。");
  const sourceBlob = await response.blob();
  if (sourceBlob.type === "image/webp") return sourceBlob;
  return convertBlobToWebp(sourceBlob);
}

function toAbsoluteImageUrl(url: string) {
  if (url.startsWith("data:")) return url;
  return new URL(url, window.location.origin).toString();
}

async function convertBlobToPng(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("复制图片失败。");
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("复制图片失败。"));
    }, "image/png");
  });
}

async function convertBlobToJpeg(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("导出 JPG 失败。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("导出 JPG 失败。"));
    }, "image/jpeg", 0.96);
  });
}

async function convertBlobToWebp(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("导出 WebP 失败。");
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => {
      if (output) resolve(output);
      else reject(new Error("导出 WebP 失败。"));
    }, "image/webp", 0.92);
  });
}
