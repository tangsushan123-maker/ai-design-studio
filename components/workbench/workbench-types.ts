import type { Edge, Node, XYPosition } from "@xyflow/react";
import type { AspectRatioValue, QualityValue, TextReferenceImage, TextReferenceRole, TextReferenceWeight } from "@/lib/design-options";
import type { ModelCatalogItem } from "@/lib/openai-defaults";
import type { ProjectAssetRecord, ProjectKnowledgeBase } from "@/lib/project-system";
import type { ResizeFitMode } from "@/lib/size-presets";
import type { MaskEditEdgeBlend, MaskEditProtectionStrength, MaskEditRegionType, MaskEditTaskMode } from "@/components/workbench/mask-editing";
import type { ImageComparisonAsset, PngLayerExportResult } from "@/components/workbench/result-preview-tools";

export type ImageSourceKind = "upload" | "paste" | "asset" | "history" | "generated";

export type GeneratedImage = {
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
  sourceCompareUrl?: string;
  trashed?: boolean;
  deletedAt?: string;
  alphaCheck?: {
    hasAlphaChannel?: boolean;
    hasTransparentPixels?: boolean;
    transparentPixelRatio?: number;
    partialAlphaPixelRatio?: number;
    hasOpaqueWhiteBackground?: boolean;
    hasOpaqueBlackBackground?: boolean;
    hasCheckerboardBackground?: boolean;
    canDownload?: boolean;
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
    deliverability?: "ready" | "needs_review" | "not_ready";
    deliverabilityLabel?: string;
    textDetailRisk?: boolean;
    textDetailLabel?: string;
    fourKCheckItems?: Array<{
      label: string;
      passed: boolean;
      detail?: string;
    }>;
  };
  qualityEnhance?: {
    mode?: string;
    target?: string;
    workflow?: string;
    postProcess?: string;
    superResolution?: string;
    aiRatioFallbackUsed?: boolean;
    textDetailRecovery?: {
      applied?: boolean;
      coverage?: number;
      alphaScale?: number;
      maskGrowRadius?: number;
      strategy?: string;
      message?: string;
    };
  };
  pngLayerExport?: PngLayerExportResult;
  referenceRemake?: {
    mode?: ReferenceRemakeMode;
    analysis?: unknown;
    textLayers?: unknown[];
    workflow?: string;
  };
  designOptimization?: {
    strength?: DesignOptimizationStrength;
    comparisonMode?: DesignComparisonMode;
    analysis?: unknown;
    promptModules?: unknown;
  };
  projectId?: string;
  parentImageId?: string;
  rootImageId?: string;
  branchId?: string;
  branchLabel?: string;
  resultGroupId?: string;
  nextImageIds?: string[];
  sourceTaskId?: string;
  sourceRequestId?: string;
  sourceNodeId?: string;
  sourceNodeName?: string;
  sourceNodeKind?: string;
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
    maskComponentCount?: number;
    unchangedComponentCount?: number;
    issues?: string[];
    suggestions?: string[];
  };
  protectionContext?: ProtectionContextPayload;
  version?: VersionPayload;
  favorite?: boolean;
};

export type ProtectedTextPayload = {
  id: string;
  text: string;
  kind: "hospital" | "phone" | "address" | "doctor" | "price" | "title" | "logo" | "qr" | "medical" | "other";
  importance: "critical" | "high" | "normal";
  reason?: string;
};

export type ProtectedAssetPayload = {
  id: string;
  type: "logo" | "qr" | "portrait" | "product" | "seal" | "other";
  label: string;
  importance: "critical" | "high" | "normal";
  instruction: string;
};

export type VersionPayload = {
  projectId?: string;
  parentIds?: string[];
  taskId?: string;
  nodeOperation?: string;
  sourceUrls?: string[];
};

export type ProtectionContextPayload = {
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

export type HistoryResizeOptions = {
  targetRatio: AspectRatioValue;
  targetSize: string;
  fitMode: ResizeFitMode;
  quality: QualityValue;
  prompt?: string;
};

export type HistoryUpscaleOptions = {
  targetSize: string;
  fitMode: ResizeFitMode | "keep_ratio" | "ai_redraw" | "faithful_enhance" | "texture_redraw" | "standard_enhance" | "plus_enhance" | "creative_redraw";
  quality: QualityValue;
  format?: "png" | "jpg" | "webp";
  prompt?: string;
};

export type QualityEnhanceMode = "standard" | "plus" | "creative";
export type ReferenceRemakeMode = "fast" | "precise";
export type DesignOptimizationStrength = "conservative" | "professional" | "bold";
export type DesignComparisonMode = "auto" | "side_by_side" | "stacked" | "final_only";

export type HistoryMaskEditOptions = {
  prompt: string;
  quality: QualityValue;
  taskMode?: MaskEditTaskMode;
  regionType?: MaskEditRegionType;
  protectionStrength?: MaskEditProtectionStrength;
  edgeBlend?: MaskEditEdgeBlend;
};

export type HistoryOperationOptions = {
  targetRatio?: AspectRatioValue;
  targetSize?: string;
  fitMode?: HistoryResizeOptions["fitMode"] | HistoryUpscaleOptions["fitMode"];
  quality?: QualityValue;
  format?: "png" | "jpg" | "webp";
  prompt?: string;
};

export type ImageAsset = GeneratedImage & {
  file?: File;
  width?: number;
  height?: number;
  source?: ImageSourceKind;
  compareBefore?: ImageComparisonAsset;
  nodeOperation?: string;
  strategyPackageId?: string;
  sourceStrategyTitle?: string;
  materialPlanItemId?: string;
  materialType?: string;
  targetSize?: string;
  materialCopy?: string;
  materialScene?: string;
};

export type TextReferenceConfig = {
  handle: string;
  role: TextReferenceRole;
  weight: TextReferenceWeight;
};

export type ResolvedTextReference = {
  handle: string;
  image: ImageAsset;
  manifest: TextReferenceImage;
};

export type ProjectAssetUploadKind = "logo" | "qrcode" | "ip";

export type NodeKind =
  | "image_input"
  | "text_to_image"
  | "image_to_image"
  | "fuse_images"
  | "outpaint"
  | "resize"
  | "replace_product"
  | "mask_edit"
  | "hd_redraw"
  | "upscale_4k"
  | "reference_remake"
  | "design_optimize"
  | "png_layers"
  | "output";

export type NodeStatus = "idle" | "queued" | "running" | "saving" | "completed" | "failed" | "cancelled";
export type NodeRenderLevel = "full" | "compact" | "mini";

export type WorkflowNodeData = {
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
  onUseCanvasImageAsTextReference?: (nodeId: string, role: TextReferenceRole) => void;
  onImageFile?: (nodeId: string, file: File) => void;
  onPreview?: (image: ImageAsset) => void;
  onMaskEdit?: (nodeId: string) => void;
  isPerformanceMode?: boolean;
  isLowZoom?: boolean;
  nodeRenderLevel?: NodeRenderLevel;
};

export type FlowNode = Node<WorkflowNodeData, NodeKind>;
export type FlowEdge = Edge;

export type TaskRecord = {
  id: string;
  requestId?: string;
  projectId?: string;
  projectName?: string;
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
  errorCategory?: string;
  retryable?: boolean;
  result?: ImageAsset;
  inputs?: ImageAsset[];
  outputs?: ImageAsset[];
  resultCount?: number;
  resultNodeIds?: string[];
  resultOnCanvas?: boolean;
  progress?: number;
  progressLabel?: string;
  cancelled?: boolean;
  backendRunState?: "waiting" | "active" | "finished" | "failed" | "cancelled";
  lastHeartbeatAt?: number;
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

export type TaskResultMatchContext = Pick<TaskRecord, "id"> & Partial<Pick<TaskRecord, "requestId" | "nodeId" | "outputs" | "result" | "resultNodeIds">>;

export type ServerTaskRunRecord = {
  requestId: string;
  projectId?: string;
  projectName?: string;
  nodeId?: string;
  nodeName?: string;
  nodeKind?: string;
  state: "waiting" | "active" | "finished" | "failed" | "cancelled";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  message?: string;
  error?: string;
  errorCategory?: string;
  retryable?: boolean;
  updatedAt?: string;
  endedAt?: string;
  durationMs?: number;
  outputCount?: number;
  outputs?: ImageAsset[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
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

export type ProjectProfile = {
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

export type BrandAssetUsage = {
  usePrimaryColors: boolean;
  useSecondaryColors: boolean;
  useLogo: boolean;
  useIpImage: boolean;
  useContact: boolean;
  useQrCode: boolean;
  useCopy: boolean;
  useForbiddenRules: boolean;
};

export type BrandAssetSummary = {
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

export type MenuState =
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

export type RightPanelTab = "params" | "tasks" | "library" | "images";

export type MaterialLibrarySummary = {
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

export type ProjectPayload = {
  id: string;
  name: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
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

export type ProjectSnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  reason: "auto" | "leave" | "manual";
  nodeCount: number;
  taskCount: number;
  jsonBytes?: number;
  storageMode?: "file";
  payload?: ProjectPayload;
};

export type ProjectLocalCachePointer = {
  version: 2;
  storageMode: "file";
  activeProjectId: string;
  activeProjectName: string;
  updatedAt: string;
  jsonBytes: number;
  nodeCount: number;
  taskCount: number;
  imageCount: number;
  message: string;
};

export type ProjectTaskCachePointer = {
  version: 2;
  storageMode: "file";
  projectId: string;
  updatedAt: string;
  taskCount: number;
  message: string;
};

export type ProjectKind = "scratch" | "formal" | "temporary";

export type WorkbenchModelInfo = {
  imageModel: string;
  analysisModel: string;
  textModel?: string;
  videoModel?: string;
  modelsCache?: ModelCatalogItem[];
  providerLabel?: string;
  hasKey: boolean;
};
