"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type OnConnect,
  type XYPosition,
} from "@xyflow/react";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  Images,
  KeyRound,
  Maximize2,
  MessageCircle,
  Minus,
  Minimize2,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  ScanLine,
  Trash2,
} from "lucide-react";
import { type AspectRatioValue, type QualityValue, type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { imageSizeLabel, qualityBadgeLabel } from "@/lib/workbench-delivery";
import { formatDuration, formatFileSize, formatGeneratedAt } from "@/lib/workbench-format";
import { IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import { buildCreativeBriefFallback, type CreativeBrief, type CreativeBriefInput, type CreativeDirection } from "@/lib/creative-brief";
import { ChatComposer } from "@/components/workbench/chat-composer";
import { WORKBENCH_NODE_TYPES } from "@/components/workbench/workbench-flow-nodes";
import {
  composerRatioForNode,
  composerSubmitStatus,
  isComposerDrivenNode,
  nodeCreationHint,
  requiresConnectedImageForComposer,
} from "@/components/workbench/workbench-composer-helpers";
import {
  createResultLineage,
  generatedFileNameForImage,
  imageKey,
  imageKeys,
  imageMatchesGeneratedFile,
  isMaskUtilityImage,
  isUserFacingResultImage,
  loadFavoriteIds,
  mergeImages,
  nodeImageReferences,
  removeImageFromNode,
  saveFavoriteIds,
  sortImagesByRecency,
} from "@/components/workbench/workbench-image-collection";
import { findDataImagePath, imageDeletionProtection, imageForComparison, stripImageFile } from "@/components/workbench/workbench-image-lifecycle";
import { imageNodePreviewMetrics } from "@/components/workbench/workbench-image-metrics";
import {
  arrangeWorkflowNodes,
  estimateWorkflowNodeHeight,
  filterEdgesForNodes,
  nodeAutoSpacingX,
} from "@/components/workbench/workbench-layout";
import {
  designComparisonModeParam,
  designOptimizationStrengthParam,
  exportFormatParam,
  isAiQualityEnhanceFitMode,
  pngLayerExportModeLabel,
  pngLayerExportModeParam,
  qualityEnhanceDefaultPrompt,
  qualityEnhanceModeFromFitMode,
  qualityEnhanceModeLabel,
  qualityEnhanceModeParam,
  referenceRemakeModeParam,
} from "@/components/workbench/workbench-operation-params";
import {
  defaultTextReferenceConfig,
  isTextReferenceTargetHandle,
  normalizeTextReferenceConfigs,
} from "@/components/workbench/workbench-text-references";
import {
  inferTargetSizeFromImage,
  qualityEnhanceQualityParam,
  resolveUpscaleTargetFromParams,
} from "@/components/workbench/workbench-upscale";
import {
  createDefaultProjectKnowledge,
  normalizeProjectKnowledge,
  type ProjectFactCandidate,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";
import { mapWithConcurrency } from "@/lib/async-utils";
import { AssetLibraryPanel } from "@/components/workbench/asset-library-panel";
import { AccountSwitcher } from "@/components/account-switcher";
import { ImageLightbox } from "@/components/workbench/image-lightbox";
import { ProjectHomeScreen } from "@/components/workbench/project-home-screen";
import { ProjectCreationModal, type ProjectCreationDraft } from "@/components/workbench/project-creation-modal";
import {
  inferSimpleMaskEditIntent,
  maskEditEdgeBlendParam,
  maskEditProtectionStrengthParam,
  maskEditRegionTypeParam,
  maskEditTaskModeParam,
} from "@/components/workbench/mask-editing";
import { clearMaskEditorDraft, MaskEditorModal } from "@/components/workbench/mask-editor-modal";
import { ProjectLibraryPanel } from "@/components/workbench/project-library-panel";
import { RightPanel } from "@/components/workbench/right-panel";
import { NodeMenu, QuickMenu } from "@/components/workbench/workbench-menus";
import { type PngLayerExportResult } from "@/components/workbench/result-preview-tools";
import {
  defaultParamsByKind,
  emptyProjectCreationDraft,
  emptyProjectProfile,
  flowAriaLabelConfig,
  imageTaskTimeoutMs,
  maskEditorDraftPrefix,
  maxTextReferenceImages,
  projectCapacityJsonWarningBytes,
  projectSnapshotIntervalMs,
  projectStorageKey,
  textReferenceInputHandle,
  treeBranchVerticalGap,
  treeResultHorizontalGap,
} from "@/components/workbench/workbench-config";
import { imageModelReadiness, initialImageModelFor, preferredAutoImageModelId } from "@/components/workbench/workbench-models";
import { restoreNodes } from "@/components/workbench/workbench-node-restore";
import {
  friendlyDisplayError,
  isInvalidMaskFailure,
  nodeKindLabel,
  outputNodeTitle,
  shouldWaitForBackendAfterClientError,
  taskFailureHint,
  taskProgressLabel,
  taskStageLabel,
} from "@/components/workbench/workbench-labels";
import {
  ToolbarButton,
} from "@/components/workbench/workbench-small-ui";
import { isActiveNodeStatus, isQualityGateBlocked, isTaskActivelyRunning, isTaskPossiblyStuck } from "@/components/workbench/workbench-task-state";
import {
  compressImageFileForUpload,
  customSize,
  dataUrlToFile,
  firstSupportedImageFile,
  getImageFileFromClipboard,
  hasClipboardImageCandidate,
  hasClipboardImageFile,
  localGeneratedSourceUrlForImage,
  isSupportedImageFile,
  numericParam,
  parseTargetSize,
  qualityParam,
  ratioOptionLabel,
  ratioParam,
  resolveAdaptiveRatioFromPrompt,
  resolveRequestedAspectRatio,
  stringParam,
} from "@/components/workbench/workbench-utils";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import {
  buildOutpaintPrompt,
  buildResizePrompt,
  defaultTargetSizeForRatio,
  textToImageCameraDistance,
  textToImageCompositionCompleteness,
  textToImagePreviewFit,
  textToImageSafeMargin,
  textToImageSubjectScale,
} from "@/components/workbench/workbench-node-prompts";
import {
  normalizeProjectKind,
  projectAssetUploadLabel,
  stripProjectRuntimeState,
} from "@/components/workbench/workbench-project-helpers";
import {
  enrichPrompt,
  resolveNoVisibleProjectOutputPolicy,
  sanitizeCreativeDirectionPrompt,
  sanitizeLegacyImageToImagePrompt,
  shouldUseProjectPromptContext,
} from "@/components/workbench/workbench-prompt-policy";
import {
  isLegacyUnvalidatedMask,
  maskEditorInitialMaskUrl,
  resolveNodeRenderLevel,
} from "@/components/workbench/workbench-node-ui";
import { appendDataUrlToForm, appendImageToForm, imageFromSingleResponse, imageSourcePayloadForPngLayerExport, imagesFromResponse } from "@/components/workbench/workbench-image-requests";
import { copyImageToClipboard, copyTextToClipboard } from "@/components/workbench/workbench-file-actions";
import { readResponseErrorMessage, responseErrorMessage, withClientTimeout } from "@/components/workbench/workbench-response";
import {
  buildTaskRecoveredCompletionPatch,
  hasTaskResultNodesOnCanvasFromNodes,
  imageBelongsToProject,
  recoverTaskCanvasResultFromNodes,
  restoreProjectTasks,
  serverTaskRunFailureLabel,
  serverTaskRunOutputs,
  serverTaskRunState,
  strategyMetaFromParams,
  taskBelongsToProject,
  taskCandidateImagesFromNode,
  taskHasResultImages,
  taskNeedsServerSync,
} from "@/components/workbench/workbench-task-helpers";
import {
  applyNodeGeneratedOutputs,
  buildCompletedTaskOutputPatch,
  countEdgesFromSource,
  countImagesInResultGroup,
  countProjectUserFacingImages,
  countTextReferenceEdges,
  mergeImageIdList,
  saveStateLabel,
  taskCandidateImagesFromNodes,
  taskRecordFromServerRun,
  taskRequestIds,
  withConfiguredImageModel,
} from "@/components/workbench/workbench-runtime-helpers";
import {
  clearDeletedProjectBrowserCache,
  filterDismissedProjectTasks,
  filterDismissedRestoredNodes,
  getStoredProject,
  imageSourceDismissedForProject,
  isFiniteViewport,
  loadDismissedImageKeySet,
  loadDismissedTaskRefs,
  markDismissedImageKeys,
  markDismissedNodeRefs,
  markDismissedTaskRefs,
  mergeTaskRecords,
  persistProjectPayloadForLifecycleExit,
  readProjectSaveError,
  readProjectTaskCache,
  stringifyProjectPayload,
  unmarkDismissedImageKeys,
  writeProjectLocalCache,
  writeProjectSnapshot,
  writeProjectTaskCache,
} from "@/components/workbench/workbench-project-storage";
import { projectCapacitySummary } from "@/components/workbench/workbench-project-capacity";
import {
  buildProjectConstraintText,
  buildProfileProtectionContext,
  buildProjectLibraryContext,
  buildProjectKnowledgeFromState,
  findBrandAssets,
  getCurrentProjectBrandAssets,
  imageAssetToProjectAssetRecord,
  mergePendingFacts,
  mergeProjectAssetRecords,
  mergeProjectLibraryAssets,
  normalizeBrandAssetUsage,
  normalizeProjectProfile,
  projectProfileColors,
  resolveBrandReferenceAssets,
  resolveSchemeDecisionBrandReferenceAssets,
  resolveProjectAssetText,
  resolveProjectAssets,
  resolveProjectKnowledge,
  resolveProjectProfile,
  splitProfileLines,
  styleLibraryReferencePreview,
  styleLibraryRulePreview,
  summarizeBrandAssets,
} from "@/components/workbench/workbench-brand-context";
import type {
  FlowEdge,
  FlowNode,
  GeneratedImage,
  HistoryMaskEditOptions,
  HistoryOperationOptions,
  ImageAsset,
  MaterialLibrarySummary,
  MenuState,
  NodeKind,
  NodeStatus,
  ProjectAssetUploadKind,
  ProjectKind,
  ProjectPayload,
  ProjectProfile,
  ProjectSnapshot,
  ProjectSummary,
  ProtectionContextPayload,
  ResolvedTextReference,
  RightPanelTab,
  ServerTaskRunRecord,
  TaskRecord,
  TaskResultMatchContext,
  WorkbenchModelInfo,
} from "@/components/workbench/workbench-types";
import type { ModelCatalogItem } from "@/lib/openai-defaults";

const projectResourceNormalizeConcurrency = 4;
const metadataPatchConcurrency = 4;
const workbenchHomeOpenStorageKey = "ai-design-workbench-home-open-v1";
const canvasMinZoom = 0.18;
const canvasMaxZoom = 4;
const canvasFitMaxZoom = 1.15;
function variantCountParam(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 2;
  return Math.min(6, Math.max(2, Math.round(numeric)));
}

function supportsComposerVariantCount(kind: NodeKind) {
  return kind === "text_to_image" || kind === "image_to_image" || kind === "resize" || kind === "outpaint";
}

function rememberWorkbenchHomeState(open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(workbenchHomeOpenStorageKey, open ? "home" : "canvas");
  } catch {}
}

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
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef<{ manual: boolean } | null>(null);
  const projectListLoadingRef = useRef(false);
  const materialLibrariesLoadingRef = useRef(false);
  const imageImportInFlightRef = useRef(false);
  const pageLifecycleSaveRef = useRef<{ fingerprint: string; at: number }>({ fingerprint: "", at: 0 });
  const edgeDeleteTimerRef = useRef<number | null>(null);
  const taskProgressTimersRef = useRef<Record<string, number>>({});
  const taskCleanupTimersRef = useRef<Record<string, number>>({});
  const taskAbortControllersRef = useRef<Record<string, AbortController>>({});
  const nodeRunQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nodeRunQueueDepthRef = useRef(0);
  const activeNodeRunTaskIdRef = useRef<string | null>(null);
  const taskProjectContextRef = useRef<Record<string, { projectId: string; projectName: string }>>({});
  const creativeStartBusyRef = useRef(false);
  const canvasFocusTimerRef = useRef<number | null>(null);
  const cancelledTaskIdsRef = useRef<Set<string>>(new Set());
  const projectLoadedRef = useRef(false);
  const { screenToFlowPosition, getViewport, setViewport, fitView } = useReactFlow<FlowNode, FlowEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const nodesRef = useRef<FlowNode[]>([]);
  const tasksRef = useRef<TaskRecord[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const edgesRef = useRef<FlowEdge[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavoriteIds());
  const [selectedFavoriteStyleKeys, setSelectedFavoriteStyleKeys] = useState<string[]>([]);
  const [historyImages, setHistoryImages] = useState<ImageAsset[]>(() => {
    const initialFavoriteIds = loadFavoriteIds();
    return sortImagesByRecency(initialImages.map((image) => ({ ...image, source: "history", favorite: initialFavoriteIds.has(imageKey(image)) })));
  });
  const [historyHasMore, setHistoryHasMore] = useState(initialHistoryHasMore);
  const [historyNextOffset, setHistoryNextOffset] = useState(initialHistoryNextOffset);
  const [projectHistoryTotal, setProjectHistoryTotal] = useState(initialImages.length);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [imageManagerImages, setImageManagerImages] = useState<ImageAsset[]>([]);
  const [imageManagerHasMore, setImageManagerHasMore] = useState(false);
  const [imageManagerNextOffset, setImageManagerNextOffset] = useState(0);
  const [imageManagerLoading, setImageManagerLoading] = useState(false);
  const [imageManagerTrashImages, setImageManagerTrashImages] = useState<ImageAsset[]>([]);
  const [imageManagerTrashHasMore, setImageManagerTrashHasMore] = useState(false);
  const [imageManagerTrashNextOffset, setImageManagerTrashNextOffset] = useState(0);
  const [imageManagerTrashLoading, setImageManagerTrashLoading] = useState(false);
  const [lastSaveDurationMs, setLastSaveDurationMs] = useState<number | null>(null);
  const [lastProjectJsonBytes, setLastProjectJsonBytes] = useState(0);
  const [projectAssets, setProjectAssets] = useState<ImageAsset[]>([]);
  const [projectAssetText, setProjectAssetText] = useState("");
  const [projectProfile, setProjectProfile] = useState<ProjectProfile>(emptyProjectProfile);
  const [projectKnowledge, setProjectKnowledge] = useState<ProjectKnowledgeBase>(() => createDefaultProjectKnowledge({ projectId: "local-project", projectName: "节点设计项目" }));
  const [projectLibraries, setProjectLibraries] = useState<MaterialLibrarySummary[]>([]);
  const [publicStyleLibraries, setPublicStyleLibraries] = useState<MaterialLibrarySummary[]>([]);
  const [textProtectionMode, setTextProtectionMode] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorBackNodeId, setInspectorBackNodeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<ImageAsset | null>(null);
  const [projectName, setProjectName] = useState("节点设计项目");
  const [projectId, setProjectId] = useState("local-project");
  const [projectOwnerUserId, setProjectOwnerUserId] = useState("");
  const [projectOwnerEmail, setProjectOwnerEmail] = useState("");
  const [projectOwnerName, setProjectOwnerName] = useState("");
  const activeProjectIdRef = useRef(projectId);
  const dismissedTaskRefsRef = useRef(loadDismissedTaskRefs(projectId));
  const dismissedImageKeysRef = useRef(loadDismissedImageKeySet(projectId));
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
  const [projectListLoading, setProjectListLoading] = useState(false);
  const [projectListError, setProjectListError] = useState("");
  const [projectBootReady, setProjectBootReady] = useState(false);
  const [modelInfo, setModelInfo] = useState(initialModelInfo);
  const [, setStatus] = useState("空画布。点击“添加节点”，或直接拖拽 / 粘贴图片。");
  const [creativeStartBusy, setCreativeStartBusy] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTabHint, setRightPanelTabHint] = useState<RightPanelTab>("tasks");
  const [rightPanelTabTick, setRightPanelTabTick] = useState(0);
  const [canvasFocusMode, setCanvasFocusMode] = useState(false);
  const [composerPrompt, setComposerPrompt] = useState("");
  const [composerFocusTick, setComposerFocusTick] = useState(0);
  const [composerModel, setComposerModel] = useState(initialImageModelFor(initialModelInfo));
  const [composerRatio, setComposerRatio] = useState<AspectRatioValue>("auto");
  const [composerQuality, setComposerQuality] = useState<QualityValue>("standard");
  const [composerVariantCount, setComposerVariantCount] = useState(2);
  const [pendingRunNodeId, setPendingRunNodeId] = useState<string | null>(null);
  const [pendingRunNodeIds, setPendingRunNodeIds] = useState<string[]>([]);
  const [maskEditorNodeId, setMaskEditorNodeId] = useState<string | null>(null);
  const [viewportZoom, setViewportZoom] = useState(1);
  const viewportZoomRef = useRef(1);
  const performanceTimersRef = useRef<Record<string, number>>({});
  const [canvasInteraction, setCanvasInteraction] = useState({
    isCanvasPanning: false,
    isCanvasZooming: false,
    isNodeDragging: false,
    isConnecting: false,
  });
  activeProjectIdRef.current = projectId;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  tasksRef.current = tasks;
  useEffect(() => {
    dismissedTaskRefsRef.current = loadDismissedTaskRefs(projectId);
    dismissedImageKeysRef.current = loadDismissedImageKeySet(projectId);
  }, [projectId]);
  const recoverTaskCanvasResult = useCallback((task: TaskResultMatchContext) => recoverTaskCanvasResultFromNodes(nodesRef.current, task), []);
  const hasTaskResultNodesOnCanvas = useCallback((task: TaskResultMatchContext) => {
    return hasTaskResultNodesOnCanvasFromNodes(nodesRef.current, task);
  }, []);
  const passedImageModelOptions = useMemo(
    () => (modelInfo.modelsCache || []).filter((item) => item.capabilities.includes("image") && item.testStatus === "passed"),
    [modelInfo.modelsCache],
  );
  const imageModelOptions = useMemo(
    () => withConfiguredImageModel(passedImageModelOptions, modelInfo),
    [modelInfo, passedImageModelOptions],
  );
  const autoImageModel = useMemo(
    () => preferredAutoImageModelId(passedImageModelOptions, modelInfo.imageModel),
    [modelInfo.imageModel, passedImageModelOptions],
  );
  const selectedComposerImageModel = composerModel.trim();
  const effectiveImageModel = selectedComposerImageModel
    || autoImageModel
    || passedImageModelOptions.find((item) => item.id === modelInfo.imageModel)?.id
    || (modelInfo.hasKey ? modelInfo.imageModel : "")
    || "";
  const imageModelStatus = useMemo(
    () => imageModelReadiness(modelInfo, passedImageModelOptions, effectiveImageModel),
    [effectiveImageModel, modelInfo, passedImageModelOptions],
  );
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const composerDisplayRatio = selectedNode ? composerRatioForNode(selectedNode, composerRatio) : composerRatio;
  const composerDisplayQuality = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? qualityParam(selectedNode.data.params.quality) : composerQuality;
  const composerDisplayVariantCount = selectedNode && supportsComposerVariantCount(selectedNode.data.kind) ? variantCountParam(selectedNode.data.params.variantCount) : composerVariantCount;
  const isLowZoom = viewportZoom < 0.58;
  const isLargeWorkflow = nodes.length > 50;
  const isPerformanceMode = isLowZoom ||
    isLargeWorkflow ||
    canvasInteraction.isCanvasPanning ||
    canvasInteraction.isCanvasZooming ||
    canvasInteraction.isNodeDragging ||
    canvasInteraction.isConnecting;
  const loadedProjectImageCount = useMemo(
    () => countProjectUserFacingImages(historyImages, projectId),
    [historyImages, projectId],
  );
  const projectImageCount = Math.max(projectHistoryTotal, loadedProjectImageCount);
  const projectCapacity = useMemo(
    () =>
      projectCapacitySummary({
        imageCount: projectImageCount,
        jsonBytes: lastProjectJsonBytes,
        nodeCount: nodes.length,
      }),
    [lastProjectJsonBytes, nodes.length, projectImageCount],
  );
  const setCanvasInteractionFlag = useCallback((key: keyof typeof canvasInteraction, value: boolean, resetDelay = 240) => {
    setCanvasInteraction((current) => (current[key] === value ? current : { ...current, [key]: value }));
    const timerKey = key;
    const existing = performanceTimersRef.current[timerKey];
    if (existing) window.clearTimeout(existing);
    if (value) {
      performanceTimersRef.current[timerKey] = window.setTimeout(() => {
        setCanvasInteraction((current) => (current[timerKey] ? { ...current, [timerKey]: false } : current));
        delete performanceTimersRef.current[timerKey];
      }, resetDelay);
    }
  }, []);
  const updateViewportZoom = useCallback((zoom: number) => {
    const previous = viewportZoomRef.current;
    const crossedLowZoom = (previous < 0.58) !== (zoom < 0.58);
    if (Math.abs(previous - zoom) < 0.035 && !crossedLowZoom) return;
    viewportZoomRef.current = zoom;
    setViewportZoom(zoom);
  }, []);
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
  const favoriteStyleCandidates = useMemo(() => {
    const seen = new Set<string>();
    const candidates: ImageAsset[] = [];
    for (const image of sortImagesByRecency([
      ...historyImages,
      ...imageManagerImages,
      ...projectAssets,
    ].filter((item) => item.favorite || favoriteIds.has(imageKey(item))))) {
      const key = imageKey(image);
      if (!key || seen.has(key) || image.trashed) continue;
      seen.add(key);
      candidates.push(image);
      if (candidates.length >= 9) break;
    }
    return candidates;
  }, [favoriteIds, historyImages, imageManagerImages, projectAssets]);
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
        setStatus("局部 AI 修改需要先把图片连接到节点。");
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
        setStatus("局部 AI 修改需要先把图片连接到节点。");
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
          isLowZoom,
          isPerformanceMode,
          nodeRenderLevel: resolveNodeRenderLevel({
            isLargeWorkflow,
            isLowZoom,
            selected: node.id === selectedNodeId,
          }),
          textReferencePreviews: node.data.kind === "text_to_image" ? textReferencePreviewsForNode(node) : undefined,
          onRun: (nodeId: string) => {
            nodeHandlersRef.current.runNode(nodeId);
          },
          onDelete: (nodeId: string) => nodeHandlersRef.current.deleteNode(nodeId),
          onParamChange: (nodeId: string, key: string, value: unknown) => nodeHandlersRef.current.updateNodeParam(nodeId, key, value),
          onUseCanvasImageAsTextReference: (nodeId: string, role: TextReferenceRole) => attachCanvasImageAsTextReference(nodeId, role),
          onImageFile: (nodeId: string, file: File) => void nodeHandlersRef.current.attachFileToImageNode(nodeId, file),
          onPreview: (image: ImageAsset) => nodeHandlersRef.current.preview(image),
          onMaskEdit: (nodeId: string) => {
            nodeHandlersRef.current.maskEdit(nodeId);
          },
        },
      })),
    // Node handlers are routed through nodeHandlersRef so dragging does not recreate handlers for every node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLargeWorkflow, isLowZoom, isPerformanceMode, nodes, selectedNodeId],
  );
  const selectedInspectorNode = useMemo(() => {
    if (!selectedNode) return null;
    return {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        textReferencePreviews: selectedNode.data.kind === "text_to_image" ? textReferencePreviewsForNode(selectedNode) : undefined,
      },
    };
    // textReferencePreviewsForNode reads current nodes and edges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, selectedNode]);
  const selectedInspectorBackNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const explicitBackNode = inspectorBackNodeId && inspectorBackNodeId !== selectedNodeId
      ? nodes.find((node) => node.id === inspectorBackNodeId) ?? null
      : null;
    if (explicitBackNode) return explicitBackNode;
    const incomingEdge = edges.find((edge) => edge.target === selectedNodeId);
    return incomingEdge ? nodes.find((node) => node.id === incomingEdge.source) ?? null : null;
  }, [edges, inspectorBackNodeId, nodes, selectedNodeId]);
  const decoratedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: isPerformanceMode ? false : edge.animated,
        type: isPerformanceMode ? "straight" : edge.type,
        className: [edge.className, isPerformanceMode ? "workflow-edge-compact" : ""].filter(Boolean).join(" "),
      })),
    [edges, isPerformanceMode],
  );

  function lockTasksToProjectContext(taskList: TaskRecord[], fallbackProjectId: string, fallbackProjectName: string) {
    const nextProjectId = fallbackProjectId || "local-project";
    const nextProjectName = fallbackProjectName || "AI 设计项目";
    return taskList.map((task) => {
      const taskProjectId = task.projectId || nextProjectId;
      const taskProjectName = task.projectName || nextProjectName;
      taskProjectContextRef.current[task.id] = {
        projectId: taskProjectId,
        projectName: taskProjectName,
      };
      if (task.projectId === taskProjectId && task.projectName === taskProjectName) return task;
      return {
        ...task,
        projectId: taskProjectId,
        projectName: taskProjectName,
      };
    });
  }

  function resetTaskProjectContexts(taskList: TaskRecord[], fallbackProjectId: string, fallbackProjectName: string) {
    taskProjectContextRef.current = {};
    return lockTasksToProjectContext(taskList, fallbackProjectId, fallbackProjectName);
  }

  const workflowRuntimeRef = useRef({
    createImageNodeFromFile,
    currentProjectPayload,
    deleteNode,
    getViewportCenter,
    restoreCanvasViewport,
    runNode,
    saveProject,
    resetTaskProjectContexts,
  });
  workflowRuntimeRef.current = {
    createImageNodeFromFile,
    currentProjectPayload,
    deleteNode,
    getViewportCenter,
    restoreCanvasViewport,
    runNode,
    saveProject,
    resetTaskProjectContexts,
  };

  useEffect(() => {
    return () => {
      Object.values(taskCleanupTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      taskCleanupTimersRef.current = {};
      Object.values(taskAbortControllersRef.current).forEach((controller) => controller.abort());
      taskAbortControllersRef.current = {};
      Object.values(performanceTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      performanceTimersRef.current = {};
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTasks((current) => {
        let changed = false;
        const next = current.map((task) => {
          if (!taskBelongsToProject(task, projectId)) return task;
          if (task.status === "completed" && task.outputs?.length && hasTaskResultNodesOnCanvas(task)) return task;
          if (task.status === "cancelled") return task;
          const recovered = recoverTaskCanvasResult(task);
          if (!recovered.outputs.length) return task;
          changed = true;
          stopTaskProgress(task.id);
          clearTaskCleanup(task.id);
          return {
            ...task,
            ...buildTaskRecoveredCompletionPatch(task, recovered),
          };
        });
        if (!changed) return current;
        tasksRef.current = next;
        return next;
      });
      writeProjectCacheFromRefs();
    }, 0);
    return () => window.clearTimeout(timer);
    // Cache writing reads snapshot refs; recovery is keyed to node/task result state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTaskResultNodesOnCanvas, nodes, projectId, recoverTaskCanvasResult]);
  useEffect(() => {
    const tasksMissingCanvasNodes = tasks.filter((task) =>
      taskBelongsToProject(task, projectId) &&
      task.status === "completed" &&
      task.outputs?.length &&
      !hasTaskResultNodesOnCanvas(task),
    );
    if (!tasksMissingCanvasNodes.length) return;
    const timer = window.setTimeout(() => {
      const restored = new Map<string, string[]>();
      tasksMissingCanvasNodes.forEach((task) => {
        if (hasTaskResultNodesOnCanvas(task)) return;
        const nodeIds = restoreTaskOutputNodes(task, task.outputs || []);
        if (nodeIds.length) restored.set(task.id, nodeIds);
      });
      if (!restored.size) return;
      setTasks((current) => {
        const next = current.map((task) => {
          const resultNodeIds = restored.get(task.id);
          if (!resultNodeIds?.length) return task;
          return {
            ...task,
            resultNodeIds,
            resultOnCanvas: true,
            progressLabel: "已把历史结果补回画布节点",
          };
        });
        tasksRef.current = next;
        return next;
      });
      writeProjectCacheFromRefs();
    }, 0);
    return () => window.clearTimeout(timer);
    // restoreTaskOutputNodes reads the latest node snapshot from refs, so keeping this keyed to task/node changes avoids duplicate recovery nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTaskResultNodesOnCanvas, nodes, projectId, tasks]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (targetNode?.data.kind === "text_to_image" && isTextReferenceTargetHandle(connection.targetHandle)) {
        const referenceCount = countTextReferenceEdges(edges, connection.target);
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
      const nextEdge: FlowEdge = {
        id: `edge_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
        source: connection.source || "",
        target: connection.target || "",
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: targetNode?.data.kind === "text_to_image" ? textReferenceInputHandle : connection.targetHandle ?? null,
        animated: true,
        className: "workflow-edge",
      };
      edgesRef.current = addEdge(nextEdge, edgesRef.current);
      setEdges((currentEdges) => addEdge(nextEdge, currentEdges));
      writeProjectCacheFromRefs();
    },
    // Cache writing reads snapshot refs; connection behavior depends on current graph only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, nodes, setEdges],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setHomeOpen(window.localStorage.getItem(workbenchHomeOpenStorageKey) !== "canvas");
      } catch {
        setHomeOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
        const nextImageModel = preferredAutoImageModelId(passedImages, data.imageModel);
        setComposerModel((current) => current || nextImageModel);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? `模型配置检测失败：${error.message}` : "模型配置检测失败，请到设置页检查 API。");
      });
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
    void refreshMaterialLibraries({ quiet: true });
  }, []);

  function applyStoredProject(stored: ProjectPayload | null) {
    const restoredProjectId = stored?.id || "local-project";
    const restoredProjectName = stored?.name || "节点设计项目";
    if (stored?.id) setProjectId(stored.id);
    if (stored?.name) setProjectName(stored.name);
    setProjectOwnerUserId(stored?.ownerUserId || "");
    setProjectOwnerEmail(stored?.ownerEmail || "");
    setProjectOwnerName(stored?.ownerName || "");
    setProjectKind(normalizeProjectKind(stored?.projectKind));
    const restoredRuns = restoreProjectTasks(stored?.runs || []);
    const restoredTasks = workflowRuntimeRef.current.resetTaskProjectContexts(
      restoreProjectTasks(readProjectTaskCache(restoredProjectId, restoredRuns)),
      restoredProjectId,
      restoredProjectName,
    );
    const restoredNodes = filterDismissedRestoredNodes(restoredProjectId, restoreNodes(stored?.nodes || [], restoredTasks));
    const restoredEdges = filterEdgesForNodes(stored?.edges || [], restoredNodes);
    nodesRef.current = restoredNodes;
    edgesRef.current = restoredEdges;
    tasksRef.current = restoredTasks;
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setStatus(restoredNodes.length ? `已恢复 ${restoredNodes.length} 个画布节点。` : "空画布。点击“添加节点”，或直接拖拽 / 粘贴图片。");
    setTasks(restoredTasks);
    writeProjectTaskCache(restoredProjectId, restoredTasks);
    void mergeServerTaskRunsIntoProject(restoredProjectId, restoredProjectName);
    const nextKnowledge = resolveProjectKnowledge(stored);
    setProjectKnowledge(nextKnowledge);
    setProjectAssets(resolveProjectAssets(stored, nextKnowledge));
    setProjectAssetText(resolveProjectAssetText(stored, nextKnowledge));
    setProjectProfile(resolveProjectProfile(stored, nextKnowledge));
    setTextProtectionMode(stored?.textProtectionMode ?? true);
    workflowRuntimeRef.current.restoreCanvasViewport(restoredNodes, stored?.viewport);
  }

  useEffect(() => {
    fetch("/api/project")
      .then((response) => response.json())
      .then((project: ProjectPayload) => {
        applyStoredProject(getStoredProject(project));
      })
      .catch(() => {
        applyStoredProject(getStoredProject(null));
      })
      .finally(() => {
        projectLoadedRef.current = true;
        setProjectBootReady(true);
        setProjectSaveState("saved");
      });
    // Initial project boot reads runtime helpers through refs and should not rerun during normal editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setEdges, setNodes, setViewport]);

  useEffect(() => {
    if (!projectBootReady || !projectId) return;
    void refreshProjectHistory(projectId);
    // refreshProjectHistory reads current favorite ids/status setters; projectId changes are the only time we replace the scoped history list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectBootReady, projectId]);

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
              void workflowRuntimeRef.current.createImageNodeFromFile(file, workflowRuntimeRef.current.getViewportCenter(), "paste");
        })
        .catch((error) => {
          setStatus(error instanceof Error ? error.message : "读取剪贴板图片失败。");
        });
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [homeOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (isTyping || (event.key !== "Backspace" && event.key !== "Delete")) return;
      if (selectedNodeId) {
        event.preventDefault();
        workflowRuntimeRef.current.deleteNode(selectedNodeId);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void workflowRuntimeRef.current.saveProject();
    }, 1800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [edges, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, tasks, textProtectionMode]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    const removedNodeIds = new Set<string>();
    let changed = false;
    const nextNodes: FlowNode[] = [];
    for (const node of nodesRef.current) {
      const isVisibleMaskNode = node.data.kind === "image_input" && (
        isMaskUtilityImage(node.data.image) ||
        isMaskUtilityImage(node.data.output) ||
        (node.data.outputs || []).some(isMaskUtilityImage)
      );
      if (isVisibleMaskNode) {
        removedNodeIds.add(node.id);
        changed = true;
        continue;
      }
      const filteredOutputs = (node.data.outputs || []).filter((image) => !isMaskUtilityImage(image));
      const outputRemoved = isMaskUtilityImage(node.data.output);
      if (filteredOutputs.length !== (node.data.outputs || []).length || outputRemoved) {
        changed = true;
        nextNodes.push({
          ...node,
          data: {
            ...node.data,
            output: outputRemoved ? filteredOutputs[0] || null : node.data.output,
            outputs: filteredOutputs,
            resultCount: filteredOutputs.length,
          },
        });
        continue;
      }
      nextNodes.push(node);
    }
    if (!changed) return;
    const nextEdges = edgesRef.current.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNodeId((current) => (current && removedNodeIds.has(current) ? null : current));
    writeProjectCacheFromRefs();
    // Cleanup reads latest refs and must not recreate on helper identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    const timer = window.setInterval(() => {
      saveProjectSnapshot("auto");
    }, projectSnapshotIntervalMs);
    return () => window.clearInterval(timer);
    // Snapshot timing follows project/canvas state changes; function identity would recreate the timer too often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, tasks, textProtectionMode]);

  useEffect(() => {
    function saveBeforeLeaving() {
      flushProjectPayloadForPageLifecycle("leave");
    }
    function saveWhenHidden() {
      if (document.visibilityState === "hidden") flushProjectPayloadForPageLifecycle("leave");
    }

    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    }
    // Lifecycle save reads the latest project state through workflowRuntimeRef; the explicit state list below controls when listeners refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, tasks, textProtectionMode]);

  useEffect(() => {
    function protectActiveWork(event: BeforeUnloadEvent) {
      if (!projectLoadedRef.current) return;
      const hasPendingSave = projectSaveState === "saving" || projectSaveState === "error" || saveTimerRef.current !== null;
      const hasRunningTask = tasks.some((task) => task.status === "queued" || task.status === "running" || task.status === "saving");
      const hasOpenEditor = Boolean(maskEditorNodeId);
      if (!hasPendingSave && !hasRunningTask && !hasOpenEditor) return;

      try {
        flushProjectPayloadForPageLifecycle("leave");
      } catch {
        // Native beforeunload prompts are intentionally terse; local cache failure is surfaced by normal save flow.
      }

      event.preventDefault();
      event.returnValue = "当前项目仍有未保存或运行中的内容，确认离开可能丢失正在编辑的临时状态。";
    }

    window.addEventListener("beforeunload", protectActiveWork);
    return () => window.removeEventListener("beforeunload", protectActiveWork);
    // Lifecycle save reads the latest project state through workflowRuntimeRef; the explicit state list below controls when listeners refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, maskEditorNodeId, nodes, projectAssetText, projectAssets, projectId, projectKind, projectKnowledge, projectName, projectProfile, projectSaveState, tasks, textProtectionMode]);

  const backendTaskSyncKey = useMemo(
    () => tasks
      .filter((task) => taskBelongsToProject(task, projectId))
      .filter(taskNeedsServerSync)
      .map((task) => task.requestId)
      .filter(Boolean)
      .join(","),
    [projectId, tasks],
  );
  const runningNodeIds = useMemo(
    () => new Set(tasks
      .filter((task) => taskBelongsToProject(task, projectId))
      .filter(isTaskActivelyRunning)
      .map((task) => task.nodeId)),
    [projectId, tasks],
  );

  useEffect(() => {
    if (!runningNodeIds.size) return;
    const activeStatusByNodeId = new Map<string, NodeStatus>();
    for (const task of tasks) {
      if (!taskBelongsToProject(task, projectId) || !isTaskActivelyRunning(task)) continue;
      activeStatusByNodeId.set(task.nodeId, task.status === "queued" || task.status === "saving" ? task.status : "running");
    }
    if (!activeStatusByNodeId.size) return;
    let changed = false;
    const nextNodes = nodesRef.current.map((node) => {
      const activeStatus = activeStatusByNodeId.get(node.id);
      if (!activeStatus) return node;
      if (node.data.status === activeStatus && !node.data.error) return node;
      changed = true;
      return {
        ...node,
        data: { ...node.data, status: activeStatus, error: "" },
      };
    });
    if (!changed) return;
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    writeProjectCacheFromRefs();
    // This effect only mirrors active task state onto nodes; cache writer reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, runningNodeIds, setNodes, tasks]);

  useEffect(() => {
    if (!backendTaskSyncKey) return;
    let disposed = false;
    async function syncBackendTaskRuns() {
      const params = new URLSearchParams({ requestIds: backendTaskSyncKey, projectId });
      const response = await fetch(`/api/task-runs?${params.toString()}`).catch(() => null);
      if (!response?.ok || disposed) return;
      const data = (await response.json().catch(() => ({}))) as { runs?: ServerTaskRunRecord[] };
      const runs = data.runs || [];
      if (disposed) return;
      const runByRequestId = new Map(runs.map((run) => [run.requestId, run]));
      const syncTasks = tasks.filter((task) => task.requestId && taskBelongsToProject(task, projectId) && taskNeedsServerSync(task));
      const historyCheckRequestIds = syncTasks
        .filter((task) => {
          const run = task.requestId ? runByRequestId.get(task.requestId) : null;
          if (!run) return true;
          if (run.state === "finished" || run.state === "failed" || run.state === "cancelled") return !serverTaskRunOutputs(run).length;
          return Date.now() - task.startedAt > 3_000;
        })
        .map((task) => task.requestId)
        .filter((requestId): requestId is string => Boolean(requestId));
      const historyOutputsByRequestId = await fetchTaskHistoryOutputsByRequests(historyCheckRequestIds, projectId);
      const recoveredResults = new Map<string, { outputs: ImageAsset[]; resultNodeIds: string[]; completeFromRecoveredOutputs: boolean }>();
      for (const task of syncTasks) {
        if (!task.requestId) continue;
        const run = runByRequestId.get(task.requestId);
        const terminal = !run || run.state === "finished" || run.state === "failed" || run.state === "cancelled";
        if (!terminal && !historyOutputsByRequestId.has(task.requestId)) continue;
        const serverOutputs = run ? serverTaskRunOutputs(run) : [];
        const historyOutputs = serverOutputs.length ? [] : historyOutputsByRequestId.get(task.requestId) || [];
        const outputs = (serverOutputs.length ? serverOutputs : historyOutputs)
          .filter((image) => !dismissedImageKeysRef.current.has(imageKey(image)));
        if (!outputs.length) continue;
        const completeFromRecoveredOutputs = taskHasCompleteRecoveredOutputs(task, run, outputs);
        const resultNodeIds = restoreTaskOutputNodes(task, outputs, {
          sourceStatus: completeFromRecoveredOutputs ? "completed" : run && (run.state === "active" || run.state === "waiting") ? "running" : "completed",
        });
        recoveredResults.set(task.requestId, { outputs, resultNodeIds, completeFromRecoveredOutputs });
        if (historyOutputs.length) {
          setHistoryImages((current) => mergeImages(historyOutputs, current));
          setImageManagerImages((current) => mergeImages(historyOutputs, current));
        }
      }
      for (const task of syncTasks) {
        if (!task.requestId || hasTaskResultNodesOnCanvas(task)) continue;
        const run = runByRequestId.get(task.requestId);
        if (!run || (run.state !== "failed" && run.state !== "cancelled")) continue;
        const recovered = recoveredResults.get(task.requestId);
        if (recovered?.outputs.length || serverTaskRunOutputs(run).length) continue;
        markNodeFailed(task.nodeId, run.error || run.message || "服务端任务失败。");
      }
      if (!runs.length && !recoveredResults.size) return;
      setTasks((current) => {
        const next: TaskRecord[] = current.map((task): TaskRecord => {
          if (!task.requestId) return task;
          const run = runByRequestId.get(task.requestId);
          const recovered = recoveredResults.get(task.requestId);
          if (!run) {
            if (!recovered?.outputs.length) return task;
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            return {
              ...task,
              status: "completed",
              stage: "completed",
              backendRunState: "finished",
              endedAt: task.endedAt || Date.now(),
              result: recovered.outputs[0],
              outputs: recovered.outputs,
              resultCount: recovered.outputs.length,
              resultNodeIds: recovered.resultNodeIds,
              resultOnCanvas: Boolean(recovered.resultNodeIds.length || task.resultOnCanvas),
              progress: 100,
              error: "",
              progressLabel: "任务记录未完整写入，但已从项目结果库核验到图片",
              lastHeartbeatAt: Date.now(),
            };
          }
          const outputs = (recovered?.outputs || serverTaskRunOutputs(run))
            .filter((image) => !dismissedImageKeysRef.current.has(imageKey(image)));
          const backendRunState = serverTaskRunState(run);
          if (run.state === "finished" && outputs.length) {
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            return {
              ...task,
              status: "completed",
              stage: "completed",
              backendRunState,
              endedAt: task.endedAt || (run.endedAt ? Date.parse(run.endedAt) : Date.now()),
              result: outputs[0],
              outputs,
              resultCount: outputs.length,
              resultNodeIds: recovered?.resultNodeIds?.length ? recovered.resultNodeIds : task.resultNodeIds,
              resultOnCanvas: Boolean(recovered?.resultNodeIds?.length || task.resultOnCanvas),
              progress: 100,
              error: "",
              progressLabel: recovered?.resultNodeIds?.length
                ? (run.state === "finished" ? "服务端确认完成，结果已恢复到画布" : "已从项目结果库核验到图片，已阻止假失败")
                : run.message || "服务端确认完成",
              lastHeartbeatAt: Date.now(),
            };
          }
          if (recovered?.outputs.length && recovered.completeFromRecoveredOutputs && (run.state === "active" || run.state === "waiting")) {
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            return {
              ...task,
              status: "completed",
              stage: "completed",
              backendRunState: "finished",
              endedAt: task.endedAt || Date.now(),
              result: outputs[0],
              outputs,
              resultCount: outputs.length,
              resultNodeIds: recovered.resultNodeIds,
              resultOnCanvas: Boolean(recovered.resultNodeIds.length || task.resultOnCanvas),
              error: "",
              progress: 100,
              progressLabel: `已从项目结果库找到完整结果，已展示 ${outputs.length} 张到画布`,
              lastHeartbeatAt: Date.now(),
            };
          }
          if (recovered?.outputs.length && (run.state === "active" || run.state === "waiting")) {
            return {
              ...task,
              status: run.state === "waiting" ? "queued" : "running",
              stage: run.state === "waiting" ? "queued" : (task.stage && task.stage !== "failed" && task.stage !== "cancelled" && task.stage !== "completed" ? task.stage : "generating"),
              backendRunState,
              result: outputs[0],
              outputs,
              resultCount: outputs.length,
              resultNodeIds: recovered.resultNodeIds,
              resultOnCanvas: Boolean(recovered.resultNodeIds.length || task.resultOnCanvas),
              error: "",
              progress: Math.max(55, Math.min(task.progress && task.progress < 100 ? task.progress : 72, 88)),
              progressLabel: `已先展示 ${outputs.length} 张结果到画布，后台继续补齐剩余方案`,
              lastHeartbeatAt: Date.now(),
            };
          }
          if ((run.state === "failed" || run.state === "cancelled") && outputs.length) {
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            return {
              ...task,
              status: "completed",
              stage: "completed",
              backendRunState: "finished",
              endedAt: task.endedAt || (run.endedAt ? Date.parse(run.endedAt) : Date.now()),
              result: outputs[0],
              outputs,
              resultCount: outputs.length,
              resultNodeIds: recovered?.resultNodeIds?.length ? recovered.resultNodeIds : task.resultNodeIds,
              resultOnCanvas: Boolean(recovered?.resultNodeIds?.length || task.resultOnCanvas),
              progress: 100,
              error: "",
              progressLabel: `服务端未完整结束，但已展示 ${outputs.length} 张可用结果`,
              lastHeartbeatAt: Date.now(),
            };
          }
          if ((run.state === "failed" || run.state === "cancelled") && !hasTaskResultNodesOnCanvas(task)) {
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            const serverError = run.error || task.error || "服务端任务失败";
            return {
              ...task,
              status: run.state === "cancelled" ? "cancelled" : "failed",
              stage: run.state === "cancelled" ? "cancelled" : "failed",
              backendRunState,
              endedAt: task.endedAt || (run.endedAt ? Date.parse(run.endedAt) : Date.now()),
              error: serverError,
              errorCategory: run.errorCategory,
              retryable: run.retryable,
              progress: 100,
              progressLabel: serverTaskRunFailureLabel(run),
              lastHeartbeatAt: Date.now(),
            };
          }
          if (run.state === "active" || run.state === "waiting") {
            const nextProgress = Math.max(12, Math.min(task.progress && task.progress < 100 ? task.progress : 22, 88));
            return {
              ...task,
              status: run.state === "waiting" ? "queued" : "running",
              stage: run.state === "waiting" ? "queued" : (task.stage && task.stage !== "failed" && task.stage !== "cancelled" && task.stage !== "completed" ? task.stage : "generating"),
              backendRunState,
              endedAt: undefined,
              error: "",
              progress: nextProgress,
              progressLabel: run.message || "服务端仍在处理，完成后会自动同步到画布",
              lastHeartbeatAt: Date.now(),
            };
          }
          return {
            ...task,
            backendRunState,
            progressLabel: run.message || task.progressLabel,
            lastHeartbeatAt: Date.now(),
          };
        });
        tasksRef.current = next;
        return next;
      });
      writeProjectCacheFromRefs();
    }
    void syncBackendTaskRuns();
    const timer = window.setInterval(syncBackendTaskRuns, 3500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
    // This poll intentionally keys off request ids; task/node snapshots are read from the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendTaskSyncKey, projectId]);

  useEffect(() => {
    const stuckTasksWithVisibleResults = tasks.filter((task) =>
      taskBelongsToProject(task, projectId) &&
      isTaskPossiblyStuck(task) &&
      taskHasResultImages(task));
    if (!stuckTasksWithVisibleResults.length) return;

    const now = Date.now();
    const completed = new Map<string, { outputs: ImageAsset[]; resultNodeIds: string[] }>();
    for (const task of stuckTasksWithVisibleResults) {
      const outputs = (task.outputs?.length ? task.outputs : task.result ? [task.result] : [])
        .filter((image) => !dismissedImageKeysRef.current.has(imageKey(image)));
      if (!outputs.length) continue;
      stopTaskProgress(task.id);
      clearTaskCleanup(task.id);
      delete taskAbortControllersRef.current[task.id];
      const resultNodeIds = hasTaskResultNodesOnCanvas(task)
        ? task.resultNodeIds || []
        : restoreTaskOutputNodes(task, outputs, { focus: false, sourceStatus: "completed" });
      completed.set(task.id, { outputs, resultNodeIds });
    }
    if (!completed.size) return;

    setTasks((current) => {
      const next = current.map((task) => {
        const item = completed.get(task.id);
        if (!item) return task;
        return {
          ...task,
          status: "completed" as const,
          stage: "completed" as const,
          backendRunState: "finished" as const,
          endedAt: task.endedAt || now,
          result: item.outputs[0],
          outputs: item.outputs,
          resultCount: item.outputs.length,
          resultNodeIds: item.resultNodeIds.length ? item.resultNodeIds : task.resultNodeIds,
          resultOnCanvas: Boolean(item.resultNodeIds.length || task.resultOnCanvas),
          progress: 100,
          error: "",
          progressLabel: `已生成 ${item.outputs.length} 张结果，后台补齐等待超时，已按可用结果完成`,
          lastHeartbeatAt: now,
        };
      });
      tasksRef.current = next;
      return next;
    });
    writeProjectCacheFromRefs();
    setStatus(`已自动修正 ${completed.size} 个长时间等待的任务：结果已生成，不再继续转圈。`);
    // This is a recovery effect for task UI drift; helpers read live refs and should not restart from their identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tasks]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    const timer = window.setTimeout(() => {
      writeProjectCacheFromRefs();
    }, 240);
    return () => window.clearTimeout(timer);
    // Cache writing reads latest node/edge/task refs while this effect is scoped to task cache changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tasks]);

  useEffect(() => {
    if (!pendingRunNodeId) return;
    const node = nodes.find((item) => item.id === pendingRunNodeId);
    if (!node) return;
    if (node.data.kind !== "text_to_image" && !edges.some((edge) => edge.target === pendingRunNodeId)) return;

    const nodeId = pendingRunNodeId;
    const timer = window.setTimeout(() => {
      setPendingRunNodeId(null);
      void workflowRuntimeRef.current.runNode(nodeId);
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
      void workflowRuntimeRef.current.runNode(nodeId);
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
    if (!image) return null;

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
    return image;
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
      const uploadFile = await compressImageFileForUpload(file);
      if (uploadFile.size < file.size) {
        const before = formatFileSize(file.size);
        const after = formatFileSize(uploadFile.size);
        setStatus(`已前端压缩图片：${before} → ${after}，上传和生图会更快。`);
      }
      const formData = new FormData();
      formData.append("image", uploadFile);
      formData.append("source", source);
      formData.append("projectId", projectId);
      if (assetKind) formData.append("materialType", projectAssetUploadLabel(assetKind));
      const response = await fetch("/api/image-resource", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { image?: ImageAsset; error?: string };
      if (!response.ok || !data.image) {
        throw new Error(data.error || `图片资源保存失败（HTTP ${response.status}）。`);
      }
      return {
        ...data.image,
        file: uploadFile,
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
    const imageMap = new Map<string, Promise<ImageAsset | null | undefined>>();
    const normalizeImage = async (image: ImageAsset | null | undefined) => {
      if (!image) return image;
      const key = imageKey(image);
      const cached = imageMap.get(key);
      if (cached) return cached;
      const pending = ensureImageAssetResource(image);
      imageMap.set(key, pending);
      return pending;
    };

    const assets = await mapWithConcurrency(payload.assets || [], projectResourceNormalizeConcurrency, (asset) => normalizeImage(asset) as Promise<ImageAsset>);
    const assetByOldUrl = new Map<string, ImageAsset>();
    (payload.assets || []).forEach((asset, index) => {
      if (asset.url?.startsWith("data:image/") && assets[index]) assetByOldUrl.set(asset.url, assets[index]);
    });
    const nodes = await mapWithConcurrency(
      payload.nodes || [],
      projectResourceNormalizeConcurrency,
      async (node) => {
        const image = await normalizeImage(node.data.image as ImageAsset | undefined);
        const output = await normalizeImage(node.data.output as ImageAsset | null | undefined);
        const outputs = await mapWithConcurrency(Array.isArray(node.data.outputs) ? node.data.outputs : [], projectResourceNormalizeConcurrency, (item) => normalizeImage(item as ImageAsset) as Promise<ImageAsset>);
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
      },
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
      maskValidated: typeof params.maskValidated === "boolean" ? params.maskValidated : false,
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
    if (isMaskUtilityFileName(file.name)) {
      setStatus("局部修改蒙版是系统辅助图，已隐藏，不会作为图片节点添加到画布。");
      return null;
    }
    if (imageImportInFlightRef.current) {
      setStatus("正在导入上一张图片，请稍候。");
      return null;
    }
    imageImportInFlightRef.current = true;
    const node = addNode("image_input", position, undefined, false);
    try {
      const image = await attachFileToImageNode(node.id, file);
      if (!image) {
        setNodes((current) => current.filter((item) => item.id !== node.id));
        setSelectedNodeId((current) => (current === node.id ? null : current));
        return null;
      }
      setSelectedNodeId(node.id);
      setStatus(source === "paste" ? "已从剪贴板创建图片节点。" : "已从拖拽创建图片节点。");
      return node;
    } finally {
      imageImportInFlightRef.current = false;
    }
  }

  async function addComposerImage(file: File) {
    await createImageNodeFromFile(file, getViewportCenter(), "upload");
  }

  async function handleCreativeStartFromIdea(promptOverride?: string) {
    if (creativeStartBusyRef.current || creativeStartBusy) return;
    const prompt = (promptOverride || composerPrompt).trim();
    if (!prompt) {
      setStatus("先输入一句想法，例如：做一张胃肠镜广告。");
      document.querySelector<HTMLTextAreaElement>("[data-composer-input='true']")?.focus();
      return;
    }
    creativeStartBusyRef.current = true;
    setCreativeStartBusy(true);
    setStatus("正在补全需求，先生成临时项目理解。");
    try {
      const brief = await requestCreativeBrief({
        mode: "idea",
        userPrompt: prompt,
        projectContext: shouldUseProjectPromptContext(prompt) ? buildCreativeProjectContext(standaloneCreativeProjectKind()) : undefined,
      });
      await ensureTemporaryProject(brief);
      createCreativeDirectionNodes(brief);
      setComposerPrompt("");
      setStatus(modelInfo.hasKey && !brief.missingMaterials.length ? "已补全需求，正在生成 A/B 两个灵感方向。" : "已补全需求，创建临时项目和 A/B 两个灵感方向。");
    } finally {
      creativeStartBusyRef.current = false;
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
    const assetNames: string[] = [];
    for (const asset of projectAssets) {
      const name = asset.fileName || asset.materialType || asset.mode || asset.id;
      if (name) assetNames.push(name);
      if (assetNames.length >= 12) break;
    }
    return {
      projectId,
      projectName,
      projectKind: kind,
      assetText: projectContextText,
      assetCount: projectAssets.length,
      assetNames,
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
    let profileSignals = 0;
    for (const value of [
      projectProfile.brandColors,
      projectProfile.logoName,
      projectProfile.phone,
      projectProfile.address,
      projectProfile.qrCodeNote,
      projectProfile.commonCopy,
      projectProfile.styleNotes,
    ]) {
      if (value.trim()) profileSignals += 1;
    }
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
    setProjectOwnerUserId("");
    setProjectOwnerEmail("");
    setProjectOwnerName("");
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
        prompt: creativeDirectionPrompt(direction),
        model: effectiveImageModel,
        aspectRatio: textRatio,
        quality: composerQuality,
        variantCount: composerVariantCount,
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

  function creativeDirectionPrompt(direction: CreativeDirection) {
    const visualPolicy = resolveNoVisibleProjectOutputPolicy(direction.prompt);
    const sanitizedDirectionPrompt = sanitizeCreativeDirectionPrompt(direction.prompt, visualPolicy);
    return [
      `本次执行：${direction.title}`,
      `方向策略：${direction.strategy}`,
      sanitizedDirectionPrompt,
      visualPolicy.noText ? "本次为无文字画面：不要生成任何标题、中文、英文、数字、标语、小字、电话、地址或水印，只保留干净主视觉/背景和留白。" : "",
      visualPolicy.noLogo ? "用户要求不要 Logo：不要生成机构名、品牌标识、院标或类似 Logo 的占位图形。" : "",
      visualPolicy.noQr ? "用户要求不要二维码：不要生成二维码、扫码图标、条码或假二维码块。" : "",
      !visualPolicy.any && direction.caveats.length ? `注意：${direction.caveats.join("；")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function openRightPanelTab(tab: RightPanelTab) {
    setRightPanelOpen(true);
    setRightPanelTabHint(tab);
    setRightPanelTabTick((value) => value + 1);
  }

  function focusComposerInput() {
    setComposerFocusTick((value) => value + 1);
  }

  function focusNodeParams(nodeId: string, options: { openPanel?: boolean } = {}) {
    setSelectedNodeId(nodeId);
    focusComposerInput();
    if (options.openPanel || rightPanelOpen) openRightPanelTab("params");
  }

  function returnHomeFromCanvas() {
    void saveProject();
    setCanvasFocusMode(false);
    setProjectPanelOpen(false);
    setAssetPanelOpen(false);
    setProjectCreateOpen(false);
    setRightPanelOpen(false);
    setNodeMenuOpen(false);
    setMenu(null);
    setHomeProjectPickerOpen(false);
    setHomeOpen(true);
    rememberWorkbenchHomeState(true);
  }

  function enterCanvasFocusMode() {
    setCanvasFocusMode(true);
    setLeftRailOpen(false);
    setRightPanelOpen(false);
    setProjectPanelOpen(false);
    setAssetPanelOpen(false);
    setNodeMenuOpen(false);
    setMenu(null);
  }

  function exitCanvasFocusMode() {
    setCanvasFocusMode(false);
  }

  function openFocusProjectPanel() {
    exitCanvasFocusMode();
    setProjectPanelOpen(true);
    setAssetPanelOpen(false);
  }

  function openFocusAssetPanel() {
    exitCanvasFocusMode();
    setAssetPanelOpen(true);
    setProjectPanelOpen(false);
  }

  function openFocusRightPanel(tab: RightPanelTab = "tasks") {
    exitCanvasFocusMode();
    openRightPanelTab(tab);
  }

  function openFocusComposer() {
    exitCanvasFocusMode();
    focusComposerInput();
  }

  async function uploadProjectAssets(files: FileList, assetKind: ProjectAssetUploadKind) {
    const assets: ImageAsset[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
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

  function dismissTaskRecords(records: TaskRecord[], options: { clearBackend?: boolean } = {}) {
    const scoped = records.filter((task) => taskBelongsToProject(task, projectId));
    if (!scoped.length) return;
    dismissedTaskRefsRef.current = markDismissedTaskRefs(projectId, scoped);
    if (options.clearBackend !== false) {
      const requestIds = taskRequestIds(scoped);
      if (requestIds.length) {
        void fetch("/api/task-runs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", requestIds, projectId }),
        }).catch(() => {
          setStatus("任务已在本地隐藏，但服务端任务记录同步删除失败；刷新任务中心后可重试清理。");
        });
      }
    }
  }

  function dismissNodeIds(nodeIds: string[]) {
    dismissedTaskRefsRef.current = markDismissedNodeRefs(projectId, nodeIds);
  }

  function dismissResultImages(images: ImageAsset[]) {
    const keys = imageKeys(images);
    if (!keys.length) return;
    dismissedImageKeysRef.current = markDismissedImageKeys(projectId, keys);
  }

  function undismissResultImages(images: ImageAsset[]) {
    const keys = imageKeys(images);
    if (!keys.length) return;
    dismissedImageKeysRef.current = unmarkDismissedImageKeys(projectId, keys);
  }

  function deleteNode(nodeId: string) {
    dismissNodeIds([nodeId]);
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    const targetImages = targetNode ? taskCandidateImagesFromNode(targetNode) : [];
    dismissResultImages(targetImages);
    const targetImageKeys = new Set(imageKeys(targetImages));
    const relatedTasks = tasks.filter((task) => {
      if (task.nodeId === nodeId) return true;
      if (task.resultNodeIds?.includes(nodeId)) return true;
      return [...targetImageKeys].some((key) =>
        (task.result && imageKey(task.result) === key) ||
        Boolean(task.outputs?.some((image) => imageKey(image) === key)),
      );
    });
    dismissTaskRecords(relatedTasks);
    const relatedTaskIds = new Set(relatedTasks.map((task) => task.id));
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    nodesRef.current = nodesRef.current.filter((node) => node.id !== nodeId);
    edgesRef.current = edgesRef.current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
    setTasks((current) => {
      const next = current.filter((task) => !relatedTaskIds.has(task.id));
      tasksRef.current = next;
      return next;
    });
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    setMenu(null);
    writeProjectCacheFromRefs();
    setStatus(targetImages.length ? "节点已删除；已记住该结果节点为手动移除，不会自动补回。" : "节点已删除。");
  }

  function clearCanvas() {
    dismissNodeIds(nodesRef.current.map((node) => node.id));
    dismissResultImages(taskCandidateImagesFromNodes(nodesRef.current));
    const runningTaskIds = new Set(tasks.filter(isTaskActivelyRunning).map((task) => task.id));
    tasks.filter((task) => runningTaskIds.has(task.id)).forEach((task) => {
      taskAbortControllersRef.current[task.id]?.abort();
      void notifyBackendTaskCancelled(task);
    });
    Object.keys(taskAbortControllersRef.current).forEach((taskId) => {
      delete taskAbortControllersRef.current[taskId];
    });
    Object.keys(taskProgressTimersRef.current).forEach(stopTaskProgress);
    Object.keys(taskCleanupTimersRef.current).forEach(clearTaskCleanup);
    nodesRef.current = [];
    edgesRef.current = [];
    const now = Date.now();
    const nextTasks = tasksRef.current.map((task) =>
      runningTaskIds.has(task.id)
        ? {
            ...task,
            status: "cancelled" as const,
            stage: "cancelled" as const,
            backendRunState: "cancelled" as const,
            endedAt: task.endedAt || now,
            error: "清空画布时已停止",
            progress: 100,
            progressLabel: "画布已清空，运行中的请求已停止；任务记录保留",
            cancelled: true,
          }
        : task,
    );
    tasksRef.current = nextTasks;
    setNodes([]);
    setEdges([]);
    setTasks(nextTasks);
    setSelectedNodeId(null);
    setMenu(null);
    writeProjectCacheFromRefs();
    setStatus("画布已清空；任务记录和图片库文件仍保留，已阻止历史结果节点自动补回。");
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
      y: Number.isFinite(bottomY) ? bottomY + 112 : center.y,
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

  function reusableTextToImageNode() {
    return nodes.find((node) =>
      node.data.kind === "text_to_image" &&
      node.data.status !== "running" &&
      !stringParam(node.data.params.prompt).trim() &&
      !(node.data.outputs || []).length,
    ) || null;
  }

  function nodeHasActiveTask(nodeId: string) {
    return tasksRef.current.some((task) =>
      task.nodeId === nodeId &&
      taskBelongsToProject(task, activeProjectIdRef.current) &&
      isTaskActivelyRunning(task),
    );
  }

  function changeComposerPrompt(value: string) {
    const selectedPromptNode = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? selectedNode : null;
    if (selectedPromptNode) {
      updateNodeParam(selectedPromptNode.id, "prompt", value);
      setComposerPrompt("");
      return;
    }
    setComposerPrompt(value);
  }

  function submitComposer(promptOverride?: string) {
    const selectedPromptNode = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? selectedNode : null;
    const prompt = (promptOverride ?? composerPrompt).trim();

    if (selectedPromptNode) {
      if (isActiveNodeStatus(selectedPromptNode.data.status) || nodeHasActiveTask(selectedPromptNode.id)) {
        setStatus("当前节点已有任务在运行，请等它完成后再重新运行。");
        return;
      }
      const kind = selectedPromptNode.data.kind;
      const hasLinkedImage = Boolean(resolveInputImage(selectedPromptNode.id, "image"));
      const currentNodePrompt = stringParam(selectedPromptNode.data.params.prompt).trim();
      const fallbackDefaultPrompt = stringParam(defaultParamsByKind[kind]?.prompt).trim();
      const nextPrompt = prompt || currentNodePrompt || fallbackDefaultPrompt;

      if (kind === "text_to_image" && !nextPrompt) {
        setStatus("文生图先写提示词，再运行。");
        return;
      }
      if (kind === "fuse_images" && !nextPrompt) {
        setStatus("AI合成必须先写清楚合成要求，再运行。");
        return;
      }
      if (kind === "mask_edit" && !nextPrompt) {
        setStatus("局部修改必须先写清楚要怎么改，再运行。");
        return;
      }
      if (kind === "fuse_images" && (!resolveInputImage(selectedPromptNode.id, "imageA") || !resolveInputImage(selectedPromptNode.id, "imageB"))) {
        setStatus("AI合成需要连接图1主体和图2场景，再运行。");
        return;
      }
      if (requiresConnectedImageForComposer(kind) && !hasLinkedImage) {
        setStatus(kind === "resize" ? "AI改版适配节点要先连接一张图片，再选择目标尺寸。" : "这个节点要先连接一张图片，再运行。");
        return;
      }

      if (prompt) updateNodeParam(selectedPromptNode.id, "prompt", prompt);
      if (kind === "text_to_image" || kind === "image_to_image" || kind === "fuse_images") {
        updateNodeParam(selectedPromptNode.id, "aspectRatio", composerDisplayRatio);
        updateNodeParam(selectedPromptNode.id, "quality", composerDisplayQuality);
      }
      if (supportsComposerVariantCount(kind)) updateNodeParam(selectedPromptNode.id, "variantCount", composerDisplayVariantCount);
      if (kind === "resize" || kind === "outpaint") {
        updateNodeParam(selectedPromptNode.id, "targetRatio", composerDisplayRatio);
        if (kind === "resize" && composerDisplayRatio !== "auto") {
          updateNodeParam(selectedPromptNode.id, "targetSize", defaultTargetSizeForRatio(composerDisplayRatio));
          updateNodeParam(selectedPromptNode.id, "sizePreset", composerDisplayRatio === "custom" ? "自定义" : composerDisplayRatio);
        }
        updateNodeParam(selectedPromptNode.id, "quality", composerDisplayQuality);
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

    const reusableNode = reusableTextToImageNode();
    if (reusableNode) {
      updateNodeParam(reusableNode.id, "prompt", prompt);
      updateNodeParam(reusableNode.id, "aspectRatio", composerRatio);
      updateNodeParam(reusableNode.id, "quality", composerQuality);
      updateNodeParam(reusableNode.id, "variantCount", composerVariantCount);
      if (composerModel) updateNodeParam(reusableNode.id, "model", composerModel);
      setSelectedNodeId(reusableNode.id);
      setPendingRunNodeId(reusableNode.id);
      setComposerPrompt("");
      setStatus("已复用现有文生图节点并开始运行。");
      return;
    }

    void handleCreativeStartFromIdea(prompt);
    return;
  }

  function changeComposerRatio(value: AspectRatioValue) {
    setComposerRatio(value);
    if (selectedNode?.data.kind === "text_to_image" || selectedNode?.data.kind === "image_to_image" || selectedNode?.data.kind === "fuse_images") {
      updateNodeParam(selectedNode.id, "aspectRatio", value);
    }
    if (selectedNode?.data.kind === "resize" || selectedNode?.data.kind === "outpaint") {
      updateNodeParam(selectedNode.id, "targetRatio", value);
      if (selectedNode.data.kind === "resize" && value !== "auto") {
        updateNodeParam(selectedNode.id, "targetSize", defaultTargetSizeForRatio(value));
        updateNodeParam(selectedNode.id, "sizePreset", value === "custom" ? "自定义" : value);
      }
    }
  }

  function changeComposerQuality(value: QualityValue) {
    setComposerQuality(value);
    if (selectedNode?.data.kind === "text_to_image") updateNodeParam(selectedNode.id, "quality", value);
  }

  function changeComposerVariantCount(value: number) {
    const next = variantCountParam(value);
    setComposerVariantCount(next);
    if (selectedNode && supportsComposerVariantCount(selectedNode.data.kind)) updateNodeParam(selectedNode.id, "variantCount", next);
  }

  function toggleFavoriteStyleReference(key: string) {
    if (!key) return;
    setProjectProfile((current) => ({ ...current, brandAssetUsage: normalizeBrandAssetUsage({ ...current.brandAssetUsage, useFavoriteStyle: true }) }));
    setSelectedFavoriteStyleKeys((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return [...current, key].slice(-3);
    });
  }

  function changeComposerModel(value: string) {
    setComposerModel(value);
    if (selectedNode && isComposerDrivenNode(selectedNode.data.kind)) updateNodeParam(selectedNode.id, "model", value);
  }

  function addQuickNode(sourceNodeId: string, type: NodeKind, targetHandle: string, paramsOverride: Record<string, unknown> = {}) {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) return;
    setInspectorBackNodeId(sourceNodeId);
    const next = addNode(type, nextTreeChildPosition(source), undefined, true, {
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

  function returnToInspectorBackNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setInspectorBackNodeId(null);
    openRightPanelTab("params");
    focusCanvasOnNodes([nodeId]);
  }

  function nextTreeChildPosition(source: FlowNode, options: { xGap?: number; yOffset?: number } = {}) {
    const branchIndex = countEdgesFromSource(edges, source.id);
    const x = source.position.x + (options.xGap || nodeAutoSpacingX(source));
    const y = source.position.y + (options.yOffset ?? 12) + branchIndex * treeBranchVerticalGap;
    return avoidNodeOverlap({ x, y });
  }

  function avoidNodeOverlap(position: XYPosition) {
    let next = { ...position };
    for (let attempts = 0; attempts < 12; attempts += 1) {
      const collides = nodes.some((node) =>
        Math.abs(node.position.x - next.x) < 330 && Math.abs(node.position.y - next.y) < 300,
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
        const referenceCount = countTextReferenceEdges(edges, selectedTextNode.id);
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

  function attachCanvasImageAsTextReference(nodeId: string, role: TextReferenceRole) {
    const target = nodes.find((node) => node.id === nodeId && node.data.kind === "text_to_image");
    if (!target) return;
    const referenceEdges = textReferenceEdgesForNode(nodeId);
    if (referenceEdges.length >= maxTextReferenceImages) {
      setStatus(`文生图图片参考最多连接 ${maxTextReferenceImages} 张。`);
      return;
    }
    const connectedSources = new Set(referenceEdges.map((edge) => edge.source));
    const candidates = nodes
      .filter((node) => node.id !== nodeId && !connectedSources.has(node.id) && Boolean(node.data.output || node.data.image))
      .sort((a, b) => {
        const aDistance = Math.abs(a.position.x - target.position.x) + Math.abs(a.position.y - target.position.y);
        const bDistance = Math.abs(b.position.x - target.position.x) + Math.abs(b.position.y - target.position.y);
        return aDistance - bDistance;
      });
    const source = candidates[0];
    if (!source) {
      setStatus("画布上没有可用图片。先上传/粘贴图片，或把图片节点连到文生图左侧“图片参考”。");
      return;
    }
    const current = normalizeTextReferenceConfigs(target.data.params.referenceConfigs);
    const nextReferenceConfigs = [
      ...referenceEdges.map((edge, index) => {
        const existing = current[index] || current.find((config) => config.handle === (edge.targetHandle || textReferenceInputHandle));
        return {
          handle: edge.targetHandle || textReferenceInputHandle,
          role: existing?.role || defaultTextReferenceConfig(edge.targetHandle || textReferenceInputHandle, index).role,
          weight: existing?.weight || "high" as TextReferenceWeight,
        };
      }),
      {
        handle: textReferenceInputHandle,
        role,
        weight: role === "style" ? "medium" as TextReferenceWeight : "high" as TextReferenceWeight,
      },
    ];
    updateNodeParam(nodeId, "referenceConfigs", nextReferenceConfigs);
    setEdges((currentEdges) => {
      const alreadyConnected = currentEdges.some((edge) => edge.source === source.id && edge.target === nodeId && isTextReferenceTargetHandle(edge.targetHandle));
      if (alreadyConnected) return currentEdges;
      return [
        ...currentEdges,
        {
          id: `edge_${source.id}_${nodeId}_${Date.now()}`,
          source: source.id,
          sourceHandle: "image",
          target: nodeId,
          targetHandle: textReferenceInputHandle,
          animated: true,
          className: "workflow-edge",
        },
      ];
    });
    setSelectedNodeId(nodeId);
    setStatus(role === "direct_use" ? "已把最近的画布图片设为引用原图。" : "已把最近的画布图片设为参考风格。");
  }

  async function runNode(nodeId: string): Promise<ImageAsset[]> {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return [];
    if (node.data.kind === "image_input") return node.data.output ? [node.data.output] as ImageAsset[] : [];
    if (isActiveNodeStatus(node.data.status) || nodeHasActiveTask(nodeId)) {
      setStatus("当前节点已有任务在运行，请等它完成后再重新运行。");
      return [];
    }
    if (!modelInfo.hasKey && node.data.kind !== "output") {
      markNodeFailed(nodeId, "请先配置 OpenAI API Key。");
      return [];
    }
    if (node.data.kind === "text_to_image" && !stringParam(node.data.params.prompt).trim()) {
      setNodeStatus(nodeId, "idle");
      setStatus("文生图需要先输入文字需求。已连接的图片只作为引用/参考，不会单独触发空任务。");
      return [];
    }
    if (node.data.kind === "mask_edit" && isLegacyUnvalidatedMask(node)) {
      const message = "当前保存的涂抹蒙版未通过像素校验，已清除旧蒙版。请重新打开“局部 AI 修改”涂抹后生成。";
      clearInvalidMaskState(nodeId, message);
      setStatus(message);
      return [];
    }

    const taskProjectId = projectId;
    const taskId = createTask(node, taskProjectId);
    setNodeStatus(nodeId, "queued");
    updateTask(taskId, {
      status: "queued",
      stage: "queued",
      backendRunState: "waiting",
      progress: 4,
      progressLabel: "已进入稳定队列，等待前一个节点任务完成。",
    });
    let releaseNodeRunSlot: (() => void) | null = null;
    try {
      releaseNodeRunSlot = await acquireNodeRunSlot(taskId, nodeId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务已停止。";
      updateTask(taskId, {
        status: "cancelled",
        stage: "cancelled",
        backendRunState: "cancelled",
        endedAt: Date.now(),
        error: message,
        progress: 100,
        progressLabel: "排队任务已停止",
        cancelled: true,
      });
      return [];
    }
    const abortController = new AbortController();
    taskAbortControllersRef.current[taskId] = abortController;
    startTaskProgress(taskId);
    setNodeStatus(nodeId, "running");
    updateTask(taskId, {
      status: "running",
      stage: "preparing",
      backendRunState: "active",
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
        executeNode(node, abortController.signal, taskId),
        imageTaskTimeoutMs,
        "任务响应超时，已等待约 35 分钟，已先核验画布和后台进程；如果没有结果，请重试或换一个更快的图片模型。",
      );
      if (cancelledTaskIdsRef.current.has(taskId)) {
        throw new Error("已手动停止。");
      }
      const saveStartedAt = Date.now();
      updateTask(taskId, {
        status: "saving",
        stage: "saving",
        backendRunState: "active",
        saveStartedAt,
        modelDurationMs: saveStartedAt - requestStartedAt,
        progress: 92,
        progressLabel: taskStageLabel(node.data.kind, "saving"),
      });
      const sourceImage = (node.data.image || resolveInputImage(node.id, "image")) || null;
      const strategyMeta = strategyMetaFromParams(node.data.params);
      const outputs = resultImages.map((image) => {
        const lineage = createResultLineage(sourceImage, taskId, image.variant || 1);
        return {
          ...image,
          source: "generated" as const,
          projectId: taskProjectId,
          nodeOperation: image.nodeOperation || node.data.kind,
          ...lineage,
          parentImageId: image.parentImageId || lineage.parentImageId,
          rootImageId: image.rootImageId || lineage.rootImageId,
          branchId: image.branchId || lineage.branchId,
          branchLabel: image.branchLabel || lineage.branchLabel,
          resultGroupId: image.resultGroupId || lineage.resultGroupId,
          sourceTaskId: image.sourceTaskId || taskId,
          sourceRequestId: image.sourceRequestId || taskId.replace(/^task_/, "req_"),
          sourceNodeId: image.sourceNodeId || node.id,
          sourceNodeName: image.sourceNodeName || node.data.title,
          sourceNodeKind: image.sourceNodeKind || node.data.kind,
          variant: image.variant || lineage.variant,
          ...strategyMeta,
        };
      });
      let resultNodeIds: string[] = [];
      if (outputs.length) {
        await persistGeneratedMetadata(outputs);
        if (activeProjectIdRef.current === taskProjectId) {
          if (sourceImage) {
            const nextIds: string[] = [];
            for (const item of outputs) {
              const id = item.id || item.fileName || item.url;
              if (id) nextIds.push(id);
            }
            appendNextImageIds(sourceImage, nextIds);
          }
          setHistoryImages((current) => mergeImages(outputs, current));
          setImageManagerImages((current) => mergeImages(outputs, current));
          if (shouldCreateSeparateResultNodes(node.data.kind, outputs.length)) {
            clearInlineNodeOutputs(nodeId, "completed");
            resultNodeIds = addOutputImageNodes(node, outputs);
            focusCanvasOnNodes([node.id, ...resultNodeIds]);
          } else {
            nodesRef.current = applyNodeGeneratedOutputs(nodesRef.current, nodeId, outputs);
            setNodes((current) => applyNodeGeneratedOutputs(current, nodeId, outputs));
            resultNodeIds = [node.id];
            focusCanvasOnNodes([node.id]);
          }
        }
      } else {
        if (activeProjectIdRef.current === taskProjectId) setNodeStatus(nodeId, "completed");
      }
      stopTaskProgress(taskId);
      delete taskAbortControllersRef.current[taskId];
      cancelledTaskIdsRef.current.delete(taskId);
      const blockedOutput = outputs.find((item) => isQualityGateBlocked(item));
      const qualityWarning = Boolean(blockedOutput);
      const endedAt = Date.now();
      updateTask(taskId, {
        ...buildCompletedTaskOutputPatch({
          outputs,
          resultNodeIds,
          saveStartedAt,
          endedAt,
          qualityWarningLabel: qualityWarning ? (blockedOutput ? qualityBadgeLabel(blockedOutput) : "请检查后交付") : undefined,
        }),
      });
      if (activeProjectIdRef.current === taskProjectId) {
        const resultPlacementLabel = resultNodeIds.length && !resultNodeIds.includes(node.id)
          ? "结果已拆分为独立方案节点。"
          : "结果已显示在当前节点。";
        setStatus(
          qualityWarning
            ? `${node.data.title} 已生成 ${outputs.length} 张，质检提醒：${blockedOutput ? qualityBadgeLabel(blockedOutput) : "请检查尺寸和白边"}。${resultPlacementLabel}`
            : `${node.data.title} 完成：${outputs.length} 张，耗时 ${formatDuration(endedAt - requestStartedAt)}。${resultPlacementLabel}`,
        );
      }
      return outputs;
    } catch (error) {
      const message = error instanceof Error ? error.message : "节点运行失败。";
      const wasCancelled = cancelledTaskIdsRef.current.has(taskId);
      stopTaskProgress(taskId);
      if (wasCancelled) {
        delete taskAbortControllersRef.current[taskId];
        updateTask(taskId, {
          status: "cancelled",
          stage: "cancelled",
          backendRunState: "cancelled",
          endedAt: Date.now(),
          error: "已停止真实请求",
          progress: 100,
          progressLabel: "已停止：前端请求已中断",
          cancelled: true,
        });
        cancelledTaskIdsRef.current.delete(taskId);
        if (activeProjectIdRef.current === taskProjectId) setStatus("任务已停止，前端请求已中断。");
        return [];
      }
      cancelledTaskIdsRef.current.delete(taskId);
      const recovered = recoverTaskCanvasResult({ id: taskId, requestId: taskId.replace(/^task_/, "req_"), nodeId });
      if (recovered.outputs.length) {
        delete taskAbortControllersRef.current[taskId];
        if (activeProjectIdRef.current === taskProjectId) {
          nodesRef.current = applyNodeGeneratedOutputs(nodesRef.current, nodeId, recovered.outputs);
          setNodes((current) => applyNodeGeneratedOutputs(current, nodeId, recovered.outputs));
        }
        updateTask(taskId, {
          ...buildTaskRecoveredCompletionPatch({ id: taskId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind), model: activeImageModelForNode(node), status: "failed", startedAt: Date.now() } as TaskRecord, recovered),
          backendRunState: "finished",
          progressLabel: "已核验：画布已有结果，已阻止假失败",
        });
        if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 已核验：结果已在画布，任务状态已自动修正。`);
        return recovered.outputs;
      }
      const requestId = taskId.replace(/^task_/, "req_");
      const backendRun = await fetchBackendTaskRun(requestId, taskProjectId);
      if (backendRun) {
        const backendRunState = serverTaskRunState(backendRun);
        const backendOutputs = serverTaskRunOutputs(backendRun);
        if (backendRun.state === "finished" && backendOutputs.length) {
          delete taskAbortControllersRef.current[taskId];
          const resultNodeIds = activeProjectIdRef.current === taskProjectId
            ? restoreTaskOutputNodes({ id: taskId, requestId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind) }, backendOutputs)
            : [];
          if (activeProjectIdRef.current === taskProjectId) {
            setNodeStatus(nodeId, "completed");
            setHistoryImages((current) => mergeImages(backendOutputs, current));
            setImageManagerImages((current) => mergeImages(backendOutputs, current));
          }
          updateTask(taskId, {
            status: "completed",
            stage: "completed",
            backendRunState,
            endedAt: backendRun.endedAt ? Date.parse(backendRun.endedAt) : Date.now(),
            result: backendOutputs[0],
            outputs: backendOutputs,
            resultCount: backendOutputs.length,
            resultNodeIds,
            resultOnCanvas: Boolean(resultNodeIds.length),
            progress: 100,
            error: "",
            progressLabel: resultNodeIds.length ? "后台已完成，结果已恢复到画布" : backendRun.message || "后台已完成",
          });
          if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 后台已完成，结果已同步。`);
          return backendOutputs;
        }
        if ((backendRun.state === "finished" || backendRun.state === "failed") && !backendOutputs.length) {
          const historyOutputs = await fetchTaskHistoryOutputs(requestId, taskProjectId);
          if (historyOutputs.length) {
            delete taskAbortControllersRef.current[taskId];
            const resultNodeIds = activeProjectIdRef.current === taskProjectId
              ? restoreTaskOutputNodes({ id: taskId, requestId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind) }, historyOutputs)
              : [];
            if (activeProjectIdRef.current === taskProjectId) {
              setNodeStatus(nodeId, "completed");
              setHistoryImages((current) => mergeImages(historyOutputs, current));
              setImageManagerImages((current) => mergeImages(historyOutputs, current));
            }
            updateTask(taskId, {
              status: "completed",
              stage: "completed",
              backendRunState: "finished",
              endedAt: Date.now(),
              result: historyOutputs[0],
              outputs: historyOutputs,
              resultCount: historyOutputs.length,
              resultNodeIds,
              resultOnCanvas: Boolean(resultNodeIds.length),
              progress: 100,
              error: "",
              progressLabel: "已从项目结果库核验到图片，已阻止假失败",
            });
            if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 已在项目结果库找到生成图，任务已修正为完成。`);
            return historyOutputs;
          }
        }
        if ((backendRun.state === "failed" || backendRun.state === "cancelled") && backendOutputs.length) {
          delete taskAbortControllersRef.current[taskId];
          const resultNodeIds = activeProjectIdRef.current === taskProjectId
            ? restoreTaskOutputNodes({ id: taskId, requestId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind) }, backendOutputs, { sourceStatus: "completed" })
            : [];
          if (activeProjectIdRef.current === taskProjectId) {
            setHistoryImages((current) => mergeImages(backendOutputs, current));
            setImageManagerImages((current) => mergeImages(backendOutputs, current));
          }
          updateTask(taskId, {
            status: "completed",
            stage: "completed",
            backendRunState: "finished",
            endedAt: backendRun.endedAt ? Date.parse(backendRun.endedAt) : Date.now(),
            result: backendOutputs[0],
            outputs: backendOutputs,
            resultCount: backendOutputs.length,
            resultNodeIds,
            resultOnCanvas: Boolean(resultNodeIds.length),
            progress: 100,
            error: "",
            progressLabel: `服务端返回异常，但已拿到 ${backendOutputs.length} 张可用结果，已按完成处理`,
          });
          if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 已拿到可用结果，已同步到画布，不标失败。`);
          return backendOutputs;
        }
        if (backendRun.state === "finished") {
          delete taskAbortControllersRef.current[taskId];
          const backendMessage = backendRun.message || "服务端完成但没有返回可用图片。";
          if (activeProjectIdRef.current === taskProjectId) markNodeFailed(nodeId, backendMessage);
          updateTask(taskId, {
            status: "failed",
            stage: "failed",
            backendRunState,
            endedAt: backendRun.endedAt ? Date.parse(backendRun.endedAt) : Date.now(),
            error: backendMessage,
            progress: 100,
            progressLabel: "服务端已结束，但没有可同步的图片结果",
          });
          return [];
        }
        if (backendRun.state === "active" || backendRun.state === "waiting") {
          const queued = backendRun.state === "waiting";
          const historyOutputs = await fetchTaskHistoryOutputs(requestId, taskProjectId);
          if (historyOutputs.length && taskHasCompleteRecoveredOutputs({ id: taskId, requestId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind) }, backendRun, historyOutputs)) {
            delete taskAbortControllersRef.current[taskId];
            const resultNodeIds = activeProjectIdRef.current === taskProjectId
              ? restoreTaskOutputNodes({ id: taskId, requestId, nodeId, nodeName: node.data.title, type: nodeKindLabel(node.data.kind) }, historyOutputs, { sourceStatus: "completed" })
              : [];
            if (activeProjectIdRef.current === taskProjectId) {
              setHistoryImages((current) => mergeImages(historyOutputs, current));
              setImageManagerImages((current) => mergeImages(historyOutputs, current));
            }
            updateTask(taskId, {
              status: "completed",
              stage: "completed",
              backendRunState: "finished",
              endedAt: Date.now(),
              result: historyOutputs[0],
              outputs: historyOutputs,
              resultCount: historyOutputs.length,
              resultNodeIds,
              resultOnCanvas: Boolean(resultNodeIds.length),
              progress: 100,
              error: "",
              progressLabel: "已从项目结果库找到完整结果，任务已自动完成",
            });
            if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 已找到生成图，结果已同步到画布。`);
            return historyOutputs;
          }
          if (activeProjectIdRef.current === taskProjectId) setNodeStatus(nodeId, "running");
          startTaskProgress(taskId);
          updateTask(taskId, {
            status: queued ? "queued" : "running",
            stage: queued ? "queued" : "generating",
            backendRunState,
            endedAt: undefined,
            error: "",
            progress: Math.max(22, Math.min(88, tasks.find((task) => task.id === taskId)?.progress || 42)),
            progressLabel: backendRun.message || "前端暂未拿到最终响应，后台仍在生成，完成后会自动同步到画布",
          });
          if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 后台仍在生成，已转入进程核验，不判失败。`);
          return [];
        }
        if (backendRun.state === "cancelled") {
          delete taskAbortControllersRef.current[taskId];
          updateTask(taskId, {
            status: "cancelled",
            stage: "cancelled",
            backendRunState,
            endedAt: backendRun.endedAt ? Date.parse(backendRun.endedAt) : Date.now(),
            error: backendRun.error || "服务端任务已停止",
            progress: 100,
            progressLabel: backendRun.message || "服务端确认已停止",
          });
          if (activeProjectIdRef.current === taskProjectId) markNodeFailed(nodeId, backendRun.error || "服务端任务已停止。");
          return [];
        }
        if (backendRun.state === "failed") {
          delete taskAbortControllersRef.current[taskId];
          const backendMessage = friendlyDisplayError(backendRun.error || backendRun.message || message);
          const shouldClearMask = node.data.kind === "mask_edit" && isInvalidMaskFailure(backendMessage);
          const maskMessage = shouldClearMask ? `${backendMessage} 已清除这次无效涂抹，请重新打开“局部 AI 修改”涂抹后生成。` : backendMessage;
          if (activeProjectIdRef.current === taskProjectId) {
            if (shouldClearMask) clearInvalidMaskState(nodeId, maskMessage);
            else markNodeFailed(nodeId, backendMessage);
          }
          updateTask(taskId, {
            status: "failed",
            stage: "failed",
            backendRunState,
            endedAt: backendRun.endedAt ? Date.parse(backendRun.endedAt) : Date.now(),
            error: maskMessage,
            errorCategory: backendRun.errorCategory,
            retryable: backendRun.retryable,
            progress: 100,
            progressLabel: serverTaskRunFailureLabel(backendRun) || taskFailureHint(maskMessage),
          });
          return [];
        }
      }
      if (shouldWaitForBackendAfterClientError(message)) {
        if (activeProjectIdRef.current === taskProjectId) setNodeStatus(nodeId, "running");
        startTaskProgress(taskId);
        updateTask(taskId, {
          status: "running",
          stage: "generating",
          backendRunState: "active",
          endedAt: undefined,
          error: "",
          progress: Math.max(42, Math.min(88, tasks.find((task) => task.id === taskId)?.progress || 58)),
          progressLabel: "前端连接暂未拿到结果，已转入后台核验；未确认失败前不标失败",
        });
        if (activeProjectIdRef.current === taskProjectId) setStatus(`${node.data.title} 暂未拿到前端响应，已转入后台核验；如果后台完成会自动补回画布。`);
        return [];
      }
      delete taskAbortControllersRef.current[taskId];
      const friendlyMessage = friendlyDisplayError(message);
      const shouldClearMask = node.data.kind === "mask_edit" && isInvalidMaskFailure(friendlyMessage);
      const maskMessage = shouldClearMask ? `${friendlyMessage} 已清除这次无效涂抹，请重新打开“局部 AI 修改”涂抹后生成。` : friendlyMessage;
      if (activeProjectIdRef.current === taskProjectId) {
        if (shouldClearMask) clearInvalidMaskState(nodeId, maskMessage);
        else markNodeFailed(nodeId, friendlyMessage);
      }
      updateTask(taskId, { status: "failed", stage: "failed", backendRunState: "failed", endedAt: Date.now(), error: maskMessage, progress: 100, progressLabel: taskFailureHint(maskMessage) });
      if (activeProjectIdRef.current === taskProjectId) setStatus(maskMessage);
      return [];
    } finally {
      releaseNodeRunSlot?.();
    }
  }

  async function acquireNodeRunSlot(taskId: string, nodeId: string) {
    const hadQueue = Boolean(activeNodeRunTaskIdRef.current) || nodeRunQueueDepthRef.current > 0;
    nodeRunQueueDepthRef.current += 1;
    let releaseQueuedPromise = () => {};
    const previous = nodeRunQueueRef.current.catch(() => undefined);
    nodeRunQueueRef.current = previous.then(() => new Promise<void>((resolve) => {
      releaseQueuedPromise = resolve;
    }));
    if (hadQueue) {
      updateTask(taskId, {
        status: "queued",
        stage: "queued",
        backendRunState: "waiting",
        progress: 6,
        progressLabel: "稳定队列：前面还有节点任务，当前任务暂不请求模型。",
      });
      setStatus("任务已加入稳定队列，会按顺序自动运行。");
    }
    await previous;
    nodeRunQueueDepthRef.current = Math.max(0, nodeRunQueueDepthRef.current - 1);
    if (cancelledTaskIdsRef.current.has(taskId)) {
      releaseQueuedPromise();
      throw new Error("排队期间已手动停止。");
    }
    activeNodeRunTaskIdRef.current = taskId;
    setNodeStatus(nodeId, "running");
    updateTask(taskId, {
      status: "running",
      stage: "preparing",
      backendRunState: "active",
      progress: 10,
      progressLabel: "已轮到当前节点，正在准备请求素材。",
    });
    return () => {
      if (activeNodeRunTaskIdRef.current === taskId) activeNodeRunTaskIdRef.current = null;
      releaseQueuedPromise();
    };
  }

  async function executeNode(node: FlowNode, signal?: AbortSignal, taskId?: string): Promise<ImageAsset[]> {
    const kind = node.data.kind;
    if (kind === "text_to_image") return executeTextToImage(node, signal, taskId);
    if (kind === "image_to_image") return executeImageToImage(node, "image", "图生图", signal, taskId);
    if (kind === "fuse_images") return executeFuseImages(node, signal, taskId);
    if (kind === "outpaint") return executeImageToImage(node, "image", "AI扩图", signal, taskId);
    if (kind === "resize") return executeResize(node, false, signal, taskId);
    if (kind === "mask_edit") return executeMaskEdit(node, signal, taskId);
    if (kind === "hd_redraw") return executeRedraw(node, signal, taskId);
    if (kind === "upscale_4k") return executeResize(node, true, signal, taskId);
    if (kind === "reference_remake") return executeReferenceRemake(node, signal, taskId);
    if (kind === "design_optimize") return executeDesignOptimize(node, signal, taskId);
    if (kind === "png_layers") return executePngLayers(node, signal, taskId);
    if (kind === "output") return executeOutput(node, signal, taskId);
    if (kind === "replace_product") throw new Error("产品替换已在第一版冻结。请改用 AI合成或局部 AI 修改完成当前修改。");
    return [];
  }

  function currentProjectBrandAssets() {
    return getCurrentProjectBrandAssets(projectAssets, projectKnowledge);
  }

  function favoriteStyleReferenceImages(limit = 3) {
    if (!projectProfile.brandAssetUsage.useFavoriteStyle) return [];
    if (selectedFavoriteStyleKeys.length) {
      const byKey = new Map(favoriteStyleCandidates.map((image) => [imageKey(image), image]));
      return selectedFavoriteStyleKeys
        .map((key) => byKey.get(key))
        .filter((image): image is ImageAsset => Boolean(image))
        .slice(0, limit);
    }
    return favoriteStyleCandidates.slice(0, limit);
  }

  function favoriteStyleReferencePrompt(images: ImageAsset[]) {
    if (!images.length) return "";
    const labels = images
      .map((image, index) => image.branchLabel || image.mode || image.materialType || image.fileName || `收藏图 ${index + 1}`)
      .slice(0, 3)
      .join("、");
    return [
      `收藏风格弱参考：已选 ${images.length} 张收藏图（${labels}）。`,
      "只学习这些收藏图的整体审美、配色倾向、构图节奏、版式密度、光影质感和商业完成度。",
      "不要复制收藏图里的具体主体、文案、Logo、二维码、电话、地址或机构信息；当前用户需求和项目真实素材优先。",
    ].join("\n");
  }

  function hasSchemeDecisionAssets() {
    const assets = currentProjectBrandAssets();
    return Boolean(
      projectProfile.organizationName.trim() ||
      projectProfile.phone.trim() ||
      projectProfile.address.trim() ||
      projectProfile.logoName.trim() ||
      projectProfile.qrCodeNote.trim() ||
      projectProfile.commonCopy.trim() ||
      projectProfileColors(projectProfile).length ||
      resolveSchemeDecisionBrandReferenceAssets(assets).length,
    );
  }

  function schemeAssetDecisionText(visibleRequestText: string) {
    if (!hasSchemeDecisionAssets()) return "";
    const hidden = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
    const assets = currentProjectBrandAssets();
    const logoAssets = findBrandAssets(assets, "logo");
    const ipAssets = findBrandAssets(assets, "ip");
    const qrAssets = findBrandAssets(assets, "qrcode");
    const colors = projectProfileColors(projectProfile);
    const explicitAll = /放上|加上|加入|添加|写上|显示|展示|露出|带上|包含|需要|必须有|要有|使用|引用|贴上|保留|保持|沿用|复用/.test(visibleRequestText) &&
      /电话|地址|联系方式|二维码|QR|qr|logo|Logo|LOGO|标志|品牌标识|IP形象|ip形象|吉祥物/.test(visibleRequestText);
    return [
      "【素材策略】电话/地址/Logo/二维码/IP只能用项目真实素材；缺失不编造。",
      explicitAll
        ? "用户明确要求素材：A/B都按真实素材使用。"
        : "未明确要求时：A可放转化素材；B按需放Logo/IP；电话/地址/二维码非必要不放。",
      hidden.noLogo ? "用户要求不要Logo：两个方案都禁止出现Logo或品牌标识。" : "",
      hidden.noContact ? "用户要求不要联系方式：两个方案都禁止出现电话、地址、热线、联系卡片。" : "",
      hidden.noQr ? "用户要求不要二维码：两个方案都禁止出现二维码、扫码区或假二维码。" : "",
      hidden.noText ? "用户要求无文字/纯背景：项目文字资料只能后台参考，禁止上画。" : "",
      projectProfile.organizationName && !hidden.noText ? `机构/品牌名称：${projectProfile.organizationName}` : "",
      colors.length ? `品牌色：${colors.join("、")}` : "",
      projectProfile.logoName && !hidden.noLogo ? `Logo名称：${projectProfile.logoName}` : "",
      logoAssets.length && !hidden.noLogo ? `Logo图片：${logoAssets.length}个` : "",
      ipAssets.length ? `IP形象：${ipAssets.length}个` : "",
      projectProfile.phone && !hidden.noContact ? `真实电话：${projectProfile.phone}` : "",
      projectProfile.address && !hidden.noContact ? `真实地址：${projectProfile.address}` : "",
      projectProfile.qrCodeNote && !hidden.noQr ? `二维码说明：${projectProfile.qrCodeNote}` : "",
      qrAssets.length && !hidden.noQr ? `二维码图片：${qrAssets.length}个` : "",
      projectProfile.commonCopy && !hidden.noText ? `常用文案：${splitProfileLines(projectProfile.commonCopy).slice(0, 3).join("；")}` : "",
      "Logo/二维码需要清晰完整；不要重绘成乱码。",
    ].filter(Boolean).join("\n");
  }

  function projectAwareRequestText(visibleRequestText: string) {
    return [visibleRequestText, schemeAssetDecisionText(visibleRequestText)].filter(Boolean).join("\n");
  }

  function buildProductionProtectionContext(operation: string, sourceImages: ImageAsset[] = [], node?: FlowNode, visibleRequestText = "") {
    const projectAwareText = projectAwareRequestText(visibleRequestText);
    const allowSchemeDecision = operation === "text_to_image" || operation === "image_to_image";
    const canUseProjectAssets = shouldUseProjectPromptContext(visibleRequestText) || (allowSchemeDecision && Boolean(schemeAssetDecisionText(visibleRequestText)));
    if ((operation === "text_to_image" || operation === "image_to_image" || operation === "resize" || operation === "outpaint") && !canUseProjectAssets) {
      return {
        protectedTexts: [],
        protectedAssets: [],
        layers: [],
        brandProfile: { rules: [] },
        version: {
          projectId,
          parentIds: [],
          sourceUrls: [],
          nodeOperation: operation,
        },
      } satisfies ProtectionContextPayload;
    }
    const context = buildProfileProtectionContext(projectProfile, {
      projectId,
      operation,
      sourceImages,
      brandAssets: currentProjectBrandAssets(),
      visibleRequestText: projectAwareText,
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
    const projectAwareText = projectAwareRequestText(visibleRequestText);
    return buildProjectConstraintText(
      projectContextText,
      projectProfile,
      textProtectionMode,
      resolveLegacyTaskContextForNode(node),
      projectAwareText,
      currentProjectBrandAssets(),
    );
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

  function appendProtectionContext(formData: FormData, operation: string, sourceImages: ImageAsset[] = [], node?: FlowNode, visibleRequestText = "") {
    formData.append("protectionContext", JSON.stringify(buildProductionProtectionContext(operation, sourceImages, node, visibleRequestText)));
  }

  function taskTracePayload(taskId: string | undefined, node: FlowNode, operation: string) {
    const taskContext = taskId ? taskProjectContextRef.current[taskId] : null;
    return {
      requestId: taskId ? taskId.replace(/^task_/, "req_") : undefined,
      taskId,
      projectId: taskContext?.projectId || projectId,
      projectName: taskContext?.projectName || projectName,
      nodeId: node.id,
      nodeName: node.data.title,
      nodeKind: node.data.kind,
      operation,
    };
  }

  function appendTaskTrace(formData: FormData, taskId: string | undefined, node: FlowNode, operation: string) {
    const trace = taskTracePayload(taskId, node, operation);
    Object.entries(trace).forEach(([key, value]) => {
      if (value) formData.append(key, String(value));
    });
  }

  async function fetchBackendTaskRun(requestId: string, taskProjectId = projectId) {
    const params = new URLSearchParams({ requestIds: requestId, projectId: taskProjectId });
    const response = await fetch(`/api/task-runs?${params.toString()}`).catch(() => null);
    if (!response?.ok) return null;
    const data = (await response.json().catch(() => ({}))) as { runs?: ServerTaskRunRecord[] };
    return data.runs?.find((run) => run.requestId === requestId) || null;
  }

  async function mergeServerTaskRunsIntoProject(taskProjectId: string, taskProjectName: string) {
    if (!taskProjectId) return;
    const params = new URLSearchParams({ projectId: taskProjectId });
    const response = await fetch(`/api/task-runs?${params.toString()}`).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json().catch(() => ({}))) as { runs?: ServerTaskRunRecord[] };
    const serverTasks = filterDismissedProjectTasks(
      taskProjectId,
      restoreProjectTasks((data.runs || [])
        .map((run) => taskRecordFromServerRun(run, taskProjectId, taskProjectName))
        .filter((task): task is TaskRecord => Boolean(task))),
    );
    if (!serverTasks.length) return;
    const merged = workflowRuntimeRef.current.resetTaskProjectContexts(
      restoreProjectTasks(mergeTaskRecords(tasksRef.current, serverTasks)),
      taskProjectId,
      taskProjectName,
    );
    const currentFingerprint = tasksRef.current.map((task) => `${task.id}:${task.status}:${task.resultCount || task.outputs?.length || 0}`).join("|");
    const mergedFingerprint = merged.map((task) => `${task.id}:${task.status}:${task.resultCount || task.outputs?.length || 0}`).join("|");
    if (mergedFingerprint === currentFingerprint) return;
    tasksRef.current = merged;
    setTasks(merged);
    writeProjectTaskCache(taskProjectId, merged);
    writeProjectCacheFromRefs();
  }

  async function fetchTaskHistoryOutputs(requestId: string, taskProjectId = projectId) {
    if (!requestId || !taskProjectId) return [] as ImageAsset[];
    return fetchTaskHistoryOutputsByRequests([requestId], taskProjectId).then((grouped) => grouped.get(requestId) || []);
  }

  async function fetchTaskHistoryOutputsByRequests(requestIds: string[], taskProjectId = projectId) {
    const uniqueRequestIds: string[] = [];
    const taskIdToRequestId = new Map<string, string>();
    const seenRequestIds = new Set<string>();
    for (const item of requestIds) {
      const requestId = item.trim();
      if (!requestId || seenRequestIds.has(requestId)) continue;
      seenRequestIds.add(requestId);
      uniqueRequestIds.push(requestId);
      taskIdToRequestId.set(requestId.replace(/^req_/, "task_"), requestId);
    }
    const empty = new Map<string, ImageAsset[]>();
    if (!uniqueRequestIds.length || !taskProjectId) return empty;
    const params = new URLSearchParams({
      projectId: taskProjectId,
      requestIds: uniqueRequestIds.join(","),
      limit: String(Math.min(100, Math.max(20, uniqueRequestIds.length * 4))),
      offset: "0",
    });
    const response = await fetch(`/api/generated-images?${params.toString()}`).catch(() => null);
    if (!response?.ok) return empty;
    const data = (await response.json().catch(() => ({}))) as { images?: GeneratedImage[] };
    const grouped = new Map<string, ImageAsset[]>();
    (data.images || []).forEach((image) => {
      const requestId = image.sourceRequestId || taskIdToRequestId.get(image.sourceTaskId || "") || taskIdToRequestId.get(image.resultGroupId || "");
      if (!requestId) return;
      const list = grouped.get(requestId) || [];
      list.push({ ...image, source: "history" as const, favorite: favoriteIds.has(imageKey(image)) });
      grouped.set(requestId, list);
    });
    return grouped;
  }

  function taskHasCompleteRecoveredOutputs(
    task: Pick<TaskRecord, "id" | "requestId" | "nodeId" | "nodeName" | "type">,
    run: ServerTaskRunRecord | null | undefined,
    outputs: ImageAsset[],
  ) {
    if (!outputs.length) return false;
    const expectedCount = run?.outputCount || expectedRecoveredOutputCount(task, run, outputs);
    return outputs.length >= expectedCount;
  }

  function expectedRecoveredOutputCount(
    task: Pick<TaskRecord, "nodeId" | "nodeName" | "type">,
    run: ServerTaskRunRecord | null | undefined,
    outputs: ImageAsset[],
  ) {
    const kind = recoveredOutputNodeKind(task, run, outputs);
    if (kind === "text_to_image" || kind === "image_to_image" || kind === "resize" || kind === "outpaint") {
      const sourceNode = task.nodeId ? nodesRef.current.find((node) => node.id === task.nodeId) : null;
      return variantCountParam(sourceNode?.data.params.variantCount);
    }
    if (kind === "design_optimize") return 2;
    return 1;
  }

  function recoveredOutputNodeKind(
    task: Pick<TaskRecord, "nodeId" | "nodeName" | "type">,
    run: ServerTaskRunRecord | null | undefined,
    outputs: ImageAsset[],
  ) {
    const sourceNodeKind = task.nodeId ? nodesRef.current.find((node) => node.id === task.nodeId)?.data.kind : "";
    const outputNodeKind = outputs.find((image) => image.sourceNodeKind || image.nodeOperation)?.sourceNodeKind || outputs.find((image) => image.nodeOperation)?.nodeOperation;
    const raw = `${sourceNodeKind || ""} ${run?.nodeKind || ""} ${outputNodeKind || ""} ${task.type || ""} ${task.nodeName || ""}`;
    if (/text_to_image|文生图/.test(raw)) return "text_to_image";
    if (/image_to_image|图生图/.test(raw)) return "image_to_image";
    if (/design_optimize|设计优化/.test(raw)) return "design_optimize";
    if (/reference_remake|参考图重制/.test(raw)) return "reference_remake";
    if (/resize|改尺寸|AI改尺寸|改版适配|AI改版适配/.test(raw)) return "resize";
    if (/outpaint|AI扩图/.test(raw)) return "outpaint";
    if (/mask_edit|局部/.test(raw)) return "mask_edit";
    if (/hd_redraw|upscale_4k|画质增强/.test(raw)) return "hd_redraw";
    if (/png_layers|PNG/.test(raw)) return "png_layers";
    if (/fuse_images|AI合成/.test(raw)) return "fuse_images";
    return "";
  }

  async function notifyBackendTaskCancelled(task: TaskRecord) {
    if (!task.requestId) return;
    await fetch("/api/task-runs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel",
        requestId: task.requestId,
        taskId: task.id,
        projectId: task.projectId || projectId,
        projectName: task.projectName || projectName,
        nodeId: task.nodeId,
        nodeName: task.nodeName,
        model: task.model,
      }),
    }).catch(() => {
      setStatus("任务已在本地标记停止，但服务端停止同步失败；如任务仍在运行，请稍后重试停止。");
    });
  }

  async function appendBrandReferenceAssets(formData: FormData, options: { requireExplicitProjectContext?: boolean; visibleRequestText?: string; allowSchemeDecision?: boolean } = {}) {
    const visibleRequestText = options.visibleRequestText || "";
    const allowSchemeDecision = Boolean(options.allowSchemeDecision && hasSchemeDecisionAssets());
    if (options.requireExplicitProjectContext && !shouldUseProjectPromptContext(visibleRequestText) && !allowSchemeDecision) return 0;
    const assets = currentProjectBrandAssets();
    const refs = allowSchemeDecision ? resolveSchemeDecisionBrandReferenceAssets(assets) : resolveBrandReferenceAssets(projectProfile, assets);
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

  async function appendFavoriteStyleReferenceAssets(formData: FormData, references: ImageAsset[]) {
    for (const [index, image] of references.slice(0, 3).entries()) {
      await appendImageToForm(formData, image, `styleReference_${index + 1}`, `styleReferenceUrl_${index + 1}`, image.fileName || `favorite-style-${index + 1}.png`);
    }
  }

  function appendTextToImageCompositionSettings(formData: FormData, params: Record<string, unknown>) {
    formData.append("compositionCompleteness", textToImageCompositionCompleteness(params));
    formData.append("safeMargin", textToImageSafeMargin(params));
    formData.append("cameraDistance", textToImageCameraDistance(params));
    formData.append("subjectScale", textToImageSubjectScale(params));
    formData.append("previewFit", textToImagePreviewFit(params));
  }

  function activeImageModelForNode(node?: FlowNode | null, fallback?: string) {
    const selected = composerModel.trim();
    if (selected) return selected;
    if (node && !isComposerDrivenNode(node.data.kind)) return stringParam(node.data.params.model) || fallback?.trim() || effectiveImageModel;
    return fallback?.trim() || effectiveImageModel;
  }

  function appendImageModel(formData: FormData, node?: FlowNode | null, fallback?: string) {
    const imageModel = activeImageModelForNode(node, fallback);
    formData.append("imageModel", imageModel);
    formData.append("model", imageModel);
  }

  async function executeTextToImage(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const params = node.data.params;
    const basePrompt = stringParam(params.prompt);
    const references = resolveTextReferenceInputs(node);
    const requestRatio = ratioParam(params.aspectRatio);
    const custom = customSize(params);
    const prompt = basePrompt.trim();
    if (!prompt) throw new Error("文生图节点需要填写 prompt。");
    setStatus("AI 正在后台分析需求、参考图和素材，并生成成品图。");
    const favoriteStyleReferences = favoriteStyleReferenceImages();
    const favoriteStylePrompt = favoriteStyleReferencePrompt(favoriteStyleReferences);
    const shouldAttachProjectContext = shouldUseProjectPromptContext(basePrompt) || hasSchemeDecisionAssets();
    const brandReferences = shouldAttachProjectContext ? resolveSchemeDecisionBrandReferenceAssets(currentProjectBrandAssets()) : [];
    if (brandReferences.length || references.items.length || favoriteStyleReferences.length) {
      const formData = new FormData();
      formData.append("prompt", [prompt, favoriteStylePrompt].filter(Boolean).join("\n\n"));
      formData.append("adType", "通用设计");
      formData.append("aspectRatio", requestRatio);
      formData.append("customWidth", String(custom.width || 0));
      formData.append("customHeight", String(custom.height || 0));
      formData.append("exactSize", String(Boolean(custom.width && custom.height)));
      formData.append("quality", qualityParam(params.quality));
      formData.append("variantCount", String(variantCountParam(params.variantCount)));
      appendImageModel(formData, node, stringParam(params.model));
      appendTaskTrace(formData, taskId, node, "text_to_image");
      formData.append("referenceManifest", JSON.stringify([
        ...references.manifest,
        ...favoriteStyleReferences.map((image, index) => ({
          id: `favorite_style_${index + 1}`,
          label: image.branchLabel || image.mode || image.fileName || `收藏风格 ${index + 1}`,
          role: "style",
          weight: "low",
          fileName: image.fileName || image.id,
          materialType: image.materialType || image.mode || "收藏风格",
          styleReference: true,
        })),
      ]));
      formData.append("textMode", stringParam(params.textMode) || "ai_text_preview");
      appendTextToImageCompositionSettings(formData, params);
      formData.append("protectionContext", JSON.stringify(buildProductionProtectionContext("text_to_image", references.items.map((item) => item.image), node, basePrompt)));
      await appendTextReferenceImages(formData, references.items);
      await appendFavoriteStyleReferenceAssets(formData, favoriteStyleReferences);
      await appendBrandReferenceAssets(formData, { requireExplicitProjectContext: true, visibleRequestText: basePrompt, allowSchemeDecision: true });
      const response = await fetch("/api/generate-image", { method: "POST", body: formData, signal });
      return imagesFromResponse(response);
    }
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ...taskTracePayload(taskId, node, "text_to_image"),
        prompt: [prompt, favoriteStylePrompt].filter(Boolean).join("\n\n"),
        adType: "通用设计",
        aspectRatio: requestRatio,
        customWidth: custom.width,
        customHeight: custom.height,
        exactSize: Boolean(custom.width && custom.height),
        quality: qualityParam(params.quality),
        variantCount: variantCountParam(params.variantCount),
        imageModel: activeImageModelForNode(node, stringParam(params.model)),
        model: activeImageModelForNode(node, stringParam(params.model)),
        referenceImages: references.manifest,
        textMode: stringParam(params.textMode) || "ai_text_preview",
        compositionCompleteness: textToImageCompositionCompleteness(params),
        safeMargin: textToImageSafeMargin(params),
        cameraDistance: textToImageCameraDistance(params),
        subjectScale: textToImageSubjectScale(params),
        previewFit: textToImagePreviewFit(params),
        protectionContext: buildProductionProtectionContext("text_to_image", [], node, basePrompt),
      }),
    });
    return imagesFromResponse(response);
  }

  async function executeImageToImage(node: FlowNode, handle: string, label = "图生图", signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, handle);
    if (!image) throw new Error(`${node.data.title} 需要连接一张图片。`);
    const params = node.data.params;
    const isOutpaint = label.includes("扩图");
    const imageToImagePrompt = sanitizeLegacyImageToImagePrompt(stringParam(params.prompt)) || IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST;
    const requestRatio = isOutpaint ? ratioParam(params.targetRatio) : resolveRequestedAspectRatio(params.aspectRatio, imageToImagePrompt);
    const requestText = isOutpaint ? buildOutpaintPrompt(params) : imageToImagePrompt;
    const favoriteStyleReferences = favoriteStyleReferenceImages();
    const favoriteStylePrompt = favoriteStyleReferencePrompt(favoriteStyleReferences);
    const prompt = requestText.trim();
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData, { requireExplicitProjectContext: true, visibleRequestText: requestText, allowSchemeDecision: true });
    await appendFavoriteStyleReferenceAssets(formData, favoriteStyleReferences);
    formData.append("prompt", [prompt, favoriteStylePrompt].filter(Boolean).join("\n\n"));
    formData.append("adType", "通用设计");
    formData.append("aspectRatio", requestRatio);
    formData.append("customWidth", String(customSize(params).width || 0));
    formData.append("customHeight", String(customSize(params).height || 0));
    formData.append("quality", qualityParam(params.quality));
    formData.append("variantCount", String(variantCountParam(params.variantCount)));
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("keepOriginalRatio", "false");
    if (isOutpaint) formData.append("direction", stringParam(params.direction) || "四周");
    formData.append("modeLabel", label);
    appendTaskTrace(formData, taskId, node, isOutpaint ? "outpaint" : "image_to_image");
    appendProtectionContext(formData, isOutpaint ? "outpaint" : "image_to_image", [image], node, requestText);
    const response = await fetch("/api/edit-image", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeFuseImages(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const imageA = resolveInputImage(node.id, "imageA");
    const imageB = resolveInputImage(node.id, "imageB");
    if (!imageA || !imageB) throw new Error("AI合成需要连接图1主体和图2场景。");
    const params = node.data.params;
    const userPrompt = stringParam(params.prompt).trim();
    if (!userPrompt) throw new Error("AI合成必须先写清楚合成要求，再运行。");
    const formData = new FormData();
    await appendImageToForm(formData, imageA, "imageA", "sourceUrlA", "image-a.png");
    await appendImageToForm(formData, imageB, "imageB", "sourceUrlB", "image-b.png");
    await appendBrandReferenceAssets(formData);
    const requestRatio = resolveRequestedAspectRatio(params.aspectRatio, userPrompt);
    const visibleRequest = [
      userPrompt,
      `合成模式：${stringParam(params.fusionMode) || "主体入景"}`,
    ].join("\n");
    formData.append("prompt", visibleRequest);
    formData.append("aspectRatio", requestRatio);
    formData.append("customWidth", String(customSize(params).width || 0));
    formData.append("customHeight", String(customSize(params).height || 0));
    formData.append("quality", qualityParam(params.quality));
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("keepOriginalRatio", "true");
    appendTaskTrace(formData, taskId, node, "fuse_images");
    appendProtectionContext(formData, "fuse_images", [imageA, imageB], node);
    const response = await fetch("/api/fuse-images", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeResize(node: FlowNode, force4k: boolean, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error(`${node.data.title} 需要连接一张图片。`);
    const params = node.data.params;
    const requestedFitMode = stringParam(params.fitMode) || (force4k ? "standard_enhance" : "smart_relayout");
    const fitMode = force4k
      ? (isAiQualityEnhanceFitMode(requestedFitMode) ? requestedFitMode : "standard_enhance")
      : ["crop", "pad"].includes(requestedFitMode) ? "smart_relayout" : requestedFitMode;
    if (force4k) {
      const target = resolveUpscaleTargetFromParams(image, params);
      const outputFormat = exportFormatParam(params.format);
      const enhancementMode = qualityEnhanceModeFromFitMode(fitMode, params);
      const userPrompt = stringParam(params.prompt) || qualityEnhanceDefaultPrompt(enhancementMode);
      const formData = new FormData();
      await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
      await appendBrandReferenceAssets(formData);
      formData.append("prompt", userPrompt);
      formData.append("aspectRatio", "custom");
      formData.append("customWidth", String(target.width));
      formData.append("customHeight", String(target.height));
      formData.append("quality", qualityEnhanceQualityParam(params.quality));
      formData.append("format", outputFormat);
      appendImageModel(formData, node, stringParam(params.model));
      formData.append("enhancementMode", enhancementMode);
      formData.append("keepOriginalRatio", "true");
      formData.append("exactSize", "true");
      appendTaskTrace(formData, taskId, node, "hd_redraw");
      appendProtectionContext(formData, "hd_redraw", [image], node);
      const response = await fetch("/api/redraw-upscale-image", { method: "POST", body: formData, signal });
      const enhanced = await imageFromSingleResponse(response, `画质增强 · ${qualityEnhanceModeLabel(enhancementMode)}`, userPrompt || image.prompt, "画质增强失败。");
      return [{ ...enhanced, compareBefore: imageForComparison(image) }];
    }
    const ratio = ratioParam(params.targetRatio);
    const resizeParams = { ...params, fitMode };
    const fallbackSize = stringParam(params.targetSize) || defaultTargetSizeForRatio(ratio);
    const targetSize = customSize(params).width && customSize(params).height ? customSize(params) : parseTargetSize(fallbackSize);
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    const resizePrompt = buildResizePrompt(resizeParams, ratio);
    const userResizePrompt = stringParam(params.prompt);
    const favoriteStyleReferences = favoriteStyleReferenceImages();
    const favoriteStylePrompt = favoriteStyleReferencePrompt(favoriteStyleReferences);
    const shouldAttachResizeProjectContext = shouldUseProjectPromptContext(userResizePrompt);
    await appendBrandReferenceAssets(formData, { requireExplicitProjectContext: true, visibleRequestText: userResizePrompt, allowSchemeDecision: false });
    await appendFavoriteStyleReferenceAssets(formData, favoriteStyleReferences);
    formData.append("prompt", [resizePrompt, favoriteStylePrompt].filter(Boolean).join("\n\n"));
    formData.append("adType", "通用设计");
    formData.append("aspectRatio", ratio);
    formData.append("customWidth", String(targetSize.width || 0));
    formData.append("customHeight", String(targetSize.height || 0));
    formData.append("quality", qualityParam(params.quality));
    formData.append("variantCount", String(variantCountParam(params.variantCount)));
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("keepOriginalRatio", "false");
    formData.append("modeLabel", "AI改版适配");
    formData.append("exactSize", "true");
    formData.append("fitMode", fitMode);
    appendTaskTrace(formData, taskId, node, "resize");
    appendProtectionContext(formData, "resize", [image], node, shouldAttachResizeProjectContext ? userResizePrompt : "");
    const response = await fetch("/api/edit-image", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeMaskEdit(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("局部 AI 修改节点需要连接一张图片。");
    const params = node.data.params;
    const maskDataUrl = stringParam(params.maskDataUrl);
    const maskImageUrl = stringParam(params.maskImageUrl);
    const prompt = stringParam(params.prompt).trim();
    if (!prompt) throw new Error("局部修改必须先写清楚要怎么改，再运行。");
    const intent = inferSimpleMaskEditIntent(prompt, {
      taskMode: maskEditTaskModeParam(params.taskMode),
      regionType: maskEditRegionTypeParam(params.regionType),
      protectionStrength: maskEditProtectionStrengthParam(params.protectionStrength),
      edgeBlend: maskEditEdgeBlendParam(params.edgeBlend),
    });
    if (!maskDataUrl && !maskImageUrl) throw new Error("请先打开局部 AI 修改，涂抹要改的区域。");
    if (maskImageUrl && !maskDataUrl && params.maskValidated !== true) {
      throw new Error("当前保存的涂抹蒙版未通过像素校验，请重新打开局部 AI 修改并重新涂抹。");
    }
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    if (maskImageUrl) formData.append("maskUrl", maskImageUrl);
    else await appendDataUrlToForm(formData, maskDataUrl, "mask", "mask.png");
    formData.append("maskPixelCount", String(numericParam(params.maskPixelCount)));
    formData.append("maskCoverage", String(numericParam(params.maskCoverage)));
    formData.append("prompt", prompt);
    formData.append("quality", qualityParam(params.quality));
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("customWidth", String(image.outputSize?.width || image.width || 0));
    formData.append("customHeight", String(image.outputSize?.height || image.height || 0));
    formData.append("preserveOutsideMask", String(Boolean(params.preserveOutsideMask ?? true)));
    formData.append("taskMode", intent.taskMode);
    formData.append("regionType", intent.regionType);
    formData.append("protectionStrength", intent.protectionStrength);
    formData.append("edgeBlend", intent.edgeBlend);
    appendTaskTrace(formData, taskId, node, "mask_edit");
    appendProtectionContext(formData, "mask_edit", [image], node);
    const response = await fetch("/api/mask-edit-image", { method: "POST", body: formData, signal });
    const results = await imagesFromResponse(response);
    return results.map((result) => ({ ...result, compareBefore: (result as ImageAsset).compareBefore || imageForComparison(image) }));
  }

  async function executeRedraw(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("画质增强节点需要连接一张图片。");
    const params = node.data.params;
    const target = resolveUpscaleTargetFromParams(image, params);
    const enhancementMode = qualityEnhanceModeParam(params.enhancementMode);
    const userPrompt = stringParam(params.prompt) || qualityEnhanceDefaultPrompt(enhancementMode);
    const formData = new FormData();
    await appendImageToForm(formData, image, "image", "sourceUrl", "source.png");
    await appendBrandReferenceAssets(formData);
    formData.append(
      "prompt",
      enrichPrompt(
        userPrompt,
        buildNodeProjectConstraintText(node, userPrompt),
      ),
    );
    formData.append("aspectRatio", "custom");
    formData.append("customWidth", String(target.width));
    formData.append("customHeight", String(target.height));
    formData.append("quality", qualityEnhanceQualityParam(params.quality));
    formData.append("format", exportFormatParam(params.format));
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("enhancementMode", enhancementMode);
    formData.append("keepOriginalRatio", "true");
    formData.append("exactSize", "true");
    appendTaskTrace(formData, taskId, node, "hd_redraw");
    appendProtectionContext(formData, "hd_redraw", [image], node);
    const response = await fetch("/api/redraw-upscale-image", { method: "POST", body: formData, signal });
    const enhanced = await imageFromSingleResponse(response, `画质增强 · ${qualityEnhanceModeLabel(enhancementMode)}`, userPrompt || image.prompt, "画质增强失败。");
    return [{ ...enhanced, compareBefore: imageForComparison(image) }];
  }

  async function executeReferenceRemake(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("参考图重制节点需要连接一张参考图。");
    const params = node.data.params;
    const formData = new FormData();
    const prompt = stringParam(params.prompt).trim() || stringParam(defaultParamsByKind.reference_remake.prompt);
    await appendImageToForm(formData, image, "image", "sourceUrl", "reference.png");
    formData.append("prompt", prompt);
    formData.append("mode", referenceRemakeModeParam(params.mode));
    formData.append("quality", qualityParam(params.quality));
    appendImageModel(formData, node, stringParam(params.model));
    appendTaskTrace(formData, taskId, node, "reference_remake");
    appendProtectionContext(formData, "reference_remake", [image], node);
    const response = await fetch("/api/reference-remake", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeDesignOptimize(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("设计优化节点需要连接一张设计稿。");
    const params = node.data.params;
    const formData = new FormData();
    const prompt = stringParam(params.prompt).trim() || stringParam(defaultParamsByKind.design_optimize.prompt);
    await appendImageToForm(formData, image, "image", "sourceUrl", "design.png");
    const sourceCompareUrl = localGeneratedSourceUrlForImage(image);
    if (sourceCompareUrl) formData.append("sourceCompareUrl", sourceCompareUrl);
    formData.append("prompt", prompt);
    formData.append("strength", designOptimizationStrengthParam(params.strength));
    formData.append("comparisonMode", designComparisonModeParam(params.comparisonMode));
    formData.append("quality", qualityParam(params.quality));
    formData.append("industry", stringParam(params.industry));
    formData.append("designType", stringParam(params.designType));
    formData.append("scene", stringParam(params.scene));
    appendImageModel(formData, node, stringParam(params.model));
    appendTaskTrace(formData, taskId, node, "design_optimize");
    appendProtectionContext(formData, "design_optimize", [image], node);
    const response = await fetch("/api/design-optimize", { method: "POST", body: formData, signal });
    const results = await imagesFromResponse(response);
    return results.map((result) => ({ ...result, compareBefore: (result as ImageAsset).compareBefore || imageForComparison(image) }));
  }

  async function executePngLayers(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("PNG 分层导出节点需要连接一张成品图。");
    const params = node.data.params;
    const mode = pngLayerExportModeParam(params.mode);
    const sourcePayload = await imageSourcePayloadForPngLayerExport(image);
    const response = await fetch("/api/export-png-layers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ...taskTracePayload(taskId, node, "png_layers"),
        ...sourcePayload,
        fileName: image.fileName || image.id || "design.png",
        mode,
        imageModel: activeImageModelForNode(node, stringParam(params.model)),
        model: activeImageModelForNode(node, stringParam(params.model)),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "PNG 分层导出失败。");
    const result = payload as PngLayerExportResult;
    const layerFileSizeBytes = result.layers.reduce((sum, layer) => sum + (layer.fileSizeBytes || 0), 0);
    const now = new Date().toISOString();
    const label = pngLayerExportModeLabel(result.mode);
    return [{
      id: `png_layers_${taskId || Date.now()}_${result.mode}`,
      url: image.url,
      originalUrl: image.originalUrl || image.url,
      thumbnailUrl: image.thumbnailUrl,
      previewUrl: image.previewUrl,
      prompt: `PNG 分层导出：${label}`,
      variant: 1,
      mode: `PNG 分层 · ${label}`,
      model: activeImageModelForNode(node, stringParam(params.model)),
      aspectRatio: image.aspectRatio,
      quality: image.quality || "standard",
      generatedAt: now,
      outputSize: { width: result.canvasWidth, height: result.canvasHeight },
      expectedOutputSize: { width: result.canvasWidth, height: result.canvasHeight },
      durationMs: result.durationMs,
      fileSizeBytes: layerFileSizeBytes,
      projectId,
      nodeOperation: "png_layers",
      materialType: "PNG三层",
      targetSize: `${result.canvasWidth}×${result.canvasHeight}`,
      pngLayerExport: result,
      qualityCheck: {
        status: result.warnings?.length ? "composition_risk" : "passed",
        label: result.warnings?.length ? `${result.layerCount} 层 PNG 已生成，${result.warnings.length} 层兜底` : `${result.layerCount} 层 PNG 已生成`,
        issues: result.warnings || [],
        actions: ["预览三层", "按需下载单层 PNG"],
        width: result.canvasWidth,
        height: result.canvasHeight,
        targetWidth: result.canvasWidth,
        targetHeight: result.canvasHeight,
        format: "png",
        fileSizeBytes: layerFileSizeBytes,
        deliverability: "ready",
        deliverabilityLabel: "三层 PNG 可单独下载",
      },
    } satisfies ImageAsset];
  }

  async function executeOutput(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("输出节点需要连接一张图片。");
    void signal;
    void taskId;
    setLightboxImage(image);
    return [image];
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
    const seenSources = new Set<string>();
    const referenceEdges: FlowEdge[] = [];
    for (const edge of edges) {
      if (edge.target !== nodeId || !isTextReferenceTargetHandle(edge.targetHandle)) continue;
      if (seenSources.has(edge.source)) continue;
      seenSources.add(edge.source);
      referenceEdges.push(edge);
      if (referenceEdges.length >= maxTextReferenceImages) break;
    }
    return referenceEdges;
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
        maxZoom: canvasFitMaxZoom,
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
      if (isFiniteViewport(viewport)) {
        setViewport(viewport);
        return;
      }
      requestAnimationFrame(() => {
        void fitView({
          nodes: nodeIds,
          padding: restoredNodes.length > 8 ? 0.18 : 0.28,
          maxZoom: canvasFitMaxZoom,
          duration: 0,
        });
      });
    });
  }

  function addOutputImageNodes(sourceNode: FlowNode, images: ImageAsset[]) {
    const imagesToAdd = uniqueImagesNotOnCanvas(images);
    if (!imagesToAdd.length) return [];
    const previewFit = sourceNode.data.kind === "text_to_image" ? textToImagePreviewFit(sourceNode.data.params) : "contain";
    const baseX = sourceNode.position.x + treeResultHorizontalGap;
    const yPositions = resultBranchYPositions(sourceNode.position.y, imagesToAdd);
    const resultNodes: FlowNode[] = imagesToAdd.map((image, index) => ({
      id: `node_result_${Date.now()}_${index}_${Math.random().toString(16).slice(2, 6)}`,
      type: "image_input",
      position: {
        x: baseX,
        y: yPositions[index] || sourceNode.position.y,
      },
      data: {
        title: outputNodeTitle(image, index),
        subtitle: `${image.mode || sourceNode.data.title} · ${image.targetSize || imageSizeLabel(image)}${image.sourceTaskId ? ` · 任务 ${image.sourceTaskId.slice(-8)}` : ""}`,
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
    nodesRef.current = [...nodesRef.current, ...resultNodes];
    edgesRef.current = [...edgesRef.current, ...resultEdges];
    setNodes((current) => [...current, ...resultNodes]);
    setEdges((current) => [...current, ...resultEdges]);
    writeProjectCacheFromRefs();
    return resultNodes.map((node) => node.id);
  }

  function clearInlineNodeOutputs(nodeId: string, status: NodeStatus = "completed") {
    const update = (node: FlowNode): FlowNode =>
      node.id === nodeId
        ? {
            ...node,
            data: {
              ...node.data,
              output: null,
              outputs: [],
              resultCount: 0,
              status,
              error: status === "completed" ? "" : node.data.error,
            },
          }
        : node;
    nodesRef.current = nodesRef.current.map(update);
    setNodes((current) => current.map(update));
  }

  function shouldCreateSeparateResultNodes(kind: NodeKind, outputCount = 1) {
    return outputCount > 1 || kind === "text_to_image" || kind === "output" || kind === "png_layers";
  }

  function restoreTaskOutputNodes(task: Pick<TaskRecord, "id" | "requestId" | "nodeId" | "nodeName" | "type">, images: ImageAsset[], options: { focus?: boolean; sourceStatus?: NodeStatus } = {}) {
    const outputs = uniqueImagesNotOnCanvas(images).filter((image) => isUserFacingResultImage(image) && !dismissedImageKeysRef.current.has(imageKey(image)));
    const sourceNode = task.nodeId ? nodesRef.current.find((item) => item.id === task.nodeId) : null;
    if (sourceNode) {
      const sourceOutputs = mergeImages(
        (outputs.length ? outputs : images).filter((image) => isUserFacingResultImage(image) && !dismissedImageKeysRef.current.has(imageKey(image))),
        taskCandidateImagesFromNode(sourceNode),
      );
      if (!outputs.length && !sourceOutputs.length) return recoverTaskCanvasResult(task).resultNodeIds;
      const sourceStatus = options.sourceStatus || "completed";
      if (!shouldCreateSeparateResultNodes(sourceNode.data.kind, sourceOutputs.length)) {
        nodesRef.current = nodesRef.current.map((item) =>
          item.id === sourceNode.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  output: sourceOutputs[0],
                  outputs: sourceOutputs,
                  resultCount: sourceOutputs.length,
                  status: sourceStatus,
                  error: sourceStatus === "completed" ? "" : item.data.error,
                },
              }
            : item,
        );
        setNodes((current) =>
          current.map((item) =>
            item.id === sourceNode.id
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    output: sourceOutputs[0],
                    outputs: sourceOutputs,
                    resultCount: sourceOutputs.length,
                    status: sourceStatus,
                    error: sourceStatus === "completed" ? "" : item.data.error,
                  },
                }
              : item,
          ),
        );
        if (options.focus !== false) focusCanvasOnNodes([sourceNode.id]);
        return [sourceNode.id];
      }
      const nodeIds = outputs.length ? addOutputImageNodes(sourceNode, outputs) : [];
      clearInlineNodeOutputs(sourceNode.id, sourceStatus);
      if (nodeIds.length && options.focus !== false) focusCanvasOnNodes([sourceNode.id, ...nodeIds]);
      if (!nodeIds.length && options.focus !== false) focusCanvasOnNodes([sourceNode.id]);
      return [sourceNode.id, ...nodeIds];
    }
    if (!outputs.length) return recoverTaskCanvasResult(task).resultNodeIds;

    const center = getViewportCenter();
    const yPositions = resultBranchYPositions(center.y, outputs);
    const resultNodes: FlowNode[] = outputs.map((image, index) => ({
      id: `node_recovered_result_${Date.now()}_${index}_${Math.random().toString(16).slice(2, 6)}`,
      type: "image_input",
      position: {
        x: center.x + index * 18,
        y: yPositions[index] || center.y,
      },
      data: {
        title: outputNodeTitle(image, index),
        subtitle: `${image.sourceNodeName || task.nodeName || task.type || image.mode || "已恢复结果"} · ${historyResultTaskLabel(image, task.id)} · ${image.targetSize || imageSizeLabel(image)}`,
        kind: "image_input",
        params: {
          resultGroupId: image.resultGroupId,
          branchId: image.branchId,
          restoredFromTaskId: task.id,
          previewFit: "contain",
        },
        image,
        output: image,
        outputs: [image],
        resultCount: 1,
        status: "completed",
      },
    }));
    setNodes((current) => [...current, ...resultNodes]);
    const nodeIds = resultNodes.map((node) => node.id);
    if (options.focus !== false) focusCanvasOnNodes(nodeIds);
    return nodeIds;
  }

  function restoreProjectHistoryOutputNodes(images: ImageAsset[], targetProjectId: string) {
    const projectImages: ImageAsset[] = [];
    for (const image of images) {
      if (!imageBelongsToProject(image, targetProjectId) || !isUserFacingResultImage(image)) continue;
      if (imageSourceDismissedForProject(targetProjectId, image)) continue;
      projectImages.push(image);
    }
    const candidates = uniqueImagesNotOnCanvas(projectImages).slice(0, 16);
    if (!candidates.length) return 0;
    const grouped = new Map<string, { task: Pick<TaskRecord, "id" | "requestId" | "nodeId" | "nodeName" | "type">; images: ImageAsset[] }>();
    candidates.forEach((image) => {
      const matchingTask = tasks.find((task) =>
        task.id === image.sourceTaskId ||
        (Boolean(image.sourceRequestId) && task.requestId === image.sourceRequestId),
      );
      const taskId = image.sourceTaskId || matchingTask?.id || `history_${targetProjectId}`;
      const nodeId = image.sourceNodeId || matchingTask?.nodeId;
      const groupKey = nodeId || taskId;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.images.push(image);
        return;
      }
      grouped.set(groupKey, {
        task: {
          id: taskId,
          requestId: image.sourceRequestId || matchingTask?.requestId,
          nodeId: nodeId || "",
          nodeName: image.sourceNodeName || matchingTask?.nodeName || "项目历史结果",
          type: image.sourceNodeKind || matchingTask?.type || image.nodeOperation || "历史结果",
        },
        images: [image],
      });
    });
    let restoredCount = 0;
    grouped.forEach(({ task, images: groupedImages }) => {
      restoredCount += restoreTaskOutputNodes(task, groupedImages, { focus: false }).length;
    });
    return restoredCount;
  }

  function historyResultTaskLabel(image: ImageAsset, fallbackTaskId: string) {
    const taskId = image.sourceTaskId || (!fallbackTaskId.startsWith("history_") ? fallbackTaskId : "");
    return taskId ? `任务 ${taskId.slice(-8)}` : "旧结果来源未记录";
  }

  function uniqueImagesNotOnCanvas(images: ImageAsset[]) {
    const existingKeys = new Set<string>();
    for (const node of nodesRef.current) {
      for (const image of taskCandidateImagesFromNode(node)) {
        const key = imageKey(image);
        if (key) existingKeys.add(key);
      }
    }
    const seen = new Set<string>();
    const uniqueImages: ImageAsset[] = [];
    for (const image of images) {
      if (isMaskUtilityImage(image)) continue;
      const key = imageKey(image);
      if (!key || seen.has(key) || existingKeys.has(key) || dismissedImageKeysRef.current.has(key)) continue;
      seen.add(key);
      uniqueImages.push(image);
    }
    return uniqueImages;
  }

  function isMaskUtilityFileName(fileName: string) {
    return /^mask-[^/\\]+\.(png|jpe?g|webp)$/i.test(fileName.trim());
  }

  function resultBranchYPositions(sourceY: number, images: ImageAsset[]) {
    const spacings = images.map((image) => Math.max(180, Math.min(280, imageNodePreviewMetrics(image).estimatedNodeHeight + 48)));
    const total = spacings.length <= 1 ? 0 : spacings.slice(0, -1).reduce((sum, value) => sum + value, 0);
    let cursor = sourceY - total / 2;
    return images.map((_, index) => {
      const y = cursor;
      cursor += spacings[index] || treeBranchVerticalGap;
      return Math.round(y);
    });
  }

  function runHistoryOperation(image: ImageAsset, kind: "resize" | "hd_redraw", options?: HistoryOperationOptions) {
    const resizeRatio = options?.targetRatio || (composerRatio === "auto" ? "16:9" : composerRatio);
    const targetSize = options?.targetSize || (kind === "resize" ? defaultTargetSizeForRatio(resizeRatio) : inferTargetSizeFromImage(image));
    const fitMode = options?.fitMode || (kind === "resize" ? "smart_relayout" : "standard_enhance");
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
            format: options?.format || "png",
            enhancementMode: qualityEnhanceModeFromFitMode(stringParam(fitMode), {}),
            prompt: options?.prompt || qualityEnhanceDefaultPrompt(qualityEnhanceModeFromFitMode(stringParam(fitMode), {})),
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
    setStatus(kind === "resize" ? `已创建 AI 改版适配任务：${ratioOptionLabel(resizeRatio)} · ${targetSize}` : `已创建画质增强任务：${targetSize}`);
  }

  function createMaskEditNodeFromHistory(image: ImageAsset, options: HistoryMaskEditOptions) {
    const prompt = options.prompt.trim();
    if (!prompt) {
      setStatus("局部修改必须先写清楚要怎么改，再进入涂抹。");
      return;
    }
    const source = addNode("image_input", getViewportCenter(), { ...image, source: "history" });
    const operation = addNode(
      "mask_edit",
      nextTreeChildPosition(source),
      undefined,
      true,
      {
        prompt,
        quality: options.quality,
        preserveOutsideMask: true,
        ...inferSimpleMaskEditIntent(prompt, options),
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
    setLightboxImage(null);
    setStatus("已打开局部 AI 修改：涂抹区域，输入一句话，点击生成。");
  }

  function createFollowupEditNode(image: ImageAsset, options?: { prompt?: string; forkBranch?: boolean }) {
    const branchSeed = options?.forkBranch ? `${Date.now()}_${Math.random().toString(16).slice(2, 6)}` : "";
    const sourceImage = options?.forkBranch
      ? {
          ...image,
          branchId: `branch_${branchSeed}`,
          branchLabel: `方案 ${countImagesInResultGroup(historyImages, image.resultGroupId || image.sourceTaskId) + 1}`,
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

  function applyHistoryFavoriteState(key: string, favorite: boolean) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (favorite) next.add(key);
      else next.delete(key);
      saveFavoriteIds(next);
      return next;
    });
    setHistoryImages((current) => current.map((item) => (imageKey(item) === key ? { ...item, favorite } : item)));
    setImageManagerImages((current) => current.map((item) => (imageKey(item) === key ? { ...item, favorite } : item)));
    setProjectAssets((current) => current.map((item) => (imageKey(item) === key ? { ...item, favorite } : item)));
    setLightboxImage((current) => (current && imageKey(current) === key ? { ...current, favorite } : current));
  }

  async function toggleHistoryFavorite(image: ImageAsset) {
    const key = imageKey(image);
    const nextFavorite = !favoriteIds.has(key);
    applyHistoryFavoriteState(key, nextFavorite);
    const fileName = generatedFileNameForImage(image);
    try {
      if (fileName) {
        const response = await fetch("/api/generated-images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName, metadata: { favorite: nextFavorite } }),
        });
        if (!response.ok) throw new Error("收藏状态保存失败。");
      }
      setStatus(nextFavorite ? "已收藏到素材库。" : "已取消收藏。");
      return nextFavorite;
    } catch (error) {
      applyHistoryFavoriteState(key, !nextFavorite);
      setStatus(error instanceof Error ? error.message : "收藏状态保存失败。");
      throw error;
    }
  }

  function createTask(node: FlowNode, taskProjectId = projectId) {
    const id = `task_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
    const requestId = id.replace(/^task_/, "req_");
    taskProjectContextRef.current[id] = { projectId: taskProjectId, projectName };
    const nodeById = new Map(nodes.map((item) => [item.id, item]));
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => nodeById.get(edge.source))
      .map((source) => source?.data.output || source?.data.image)
      .filter((image): image is ImageAsset => Boolean(image));
    const strategyMeta = strategyMetaFromParams(node.data.params);
    const task: TaskRecord = {
      id,
      requestId,
      projectId: taskProjectId,
      projectName,
      nodeId: node.id,
      nodeName: node.data.title,
      type: nodeKindLabel(node.data.kind),
      model: activeImageModelForNode(node),
      status: "queued",
      startedAt: Date.now(),
      stage: "queued",
      backendRunState: "waiting",
      lastHeartbeatAt: Date.now(),
      inputs,
      progress: 4,
      progressLabel: taskStageLabel(node.data.kind, "queued"),
      prompt: stringParam(node.data.params.prompt),
      ...strategyMeta,
    };
    setRightPanelOpen(true);
    setRightPanelTabHint("tasks");
    setRightPanelTabTick((value) => value + 1);
    tasksRef.current = [task, ...tasksRef.current.filter((item) => item.id !== id)];
    setTasks((current) => [task, ...current]);
    writeProjectCacheFromRefs();
    return id;
  }

  function updateTask(taskId: string, updates: Partial<TaskRecord>) {
    const recovered = updates.status === "failed"
      ? recoverTaskCanvasResult({ id: taskId, outputs: updates.outputs, result: updates.result, resultNodeIds: updates.resultNodeIds })
      : { outputs: [] as ImageAsset[], resultNodeIds: [] as string[] };
    const finalUpdates = updates.status === "failed" && recovered.outputs.length
      ? {
          ...updates,
          status: "completed" as const,
          stage: "completed" as const,
          backendRunState: "finished" as const,
          endedAt: updates.endedAt || Date.now(),
          result: recovered.outputs[0],
          outputs: recovered.outputs,
          resultCount: recovered.outputs.length,
          resultNodeIds: recovered.resultNodeIds,
          progress: 100,
          error: "",
          progressLabel: "已核验：结果已在画布，任务记录已自动修正",
        }
      : updates;
    if (finalUpdates.status === "completed") {
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    } else if (finalUpdates.status === "failed" || finalUpdates.status === "cancelled") {
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    } else if (finalUpdates.status) {
      clearTaskCleanup(taskId);
    }
    const patchedAt = Date.now();
    tasksRef.current = tasksRef.current.map((task) => (task.id === taskId ? { ...task, ...finalUpdates, lastHeartbeatAt: patchedAt } : task));
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...finalUpdates, lastHeartbeatAt: patchedAt } : task)));
    writeProjectCacheFromRefs();
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
    const requestId = id.replace(/^task_/, "req_");
    taskProjectContextRef.current[id] = { projectId, projectName };
    const task: TaskRecord = {
      id,
      requestId,
      projectId,
      projectName,
      nodeId: input.nodeId,
      nodeName: input.nodeName,
      type: input.type,
      model: input.model,
      status: "queued",
      startedAt: Date.now(),
      stage: input.deferred ? "queued" : "preparing",
      backendRunState: input.deferred ? "waiting" : "active",
      lastHeartbeatAt: Date.now(),
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
    tasksRef.current = [task, ...tasksRef.current.filter((item) => item.id !== id)];
    setTasks((current) => [task, ...current]);
    writeProjectCacheFromRefs();
    return id;
  }

  function startTaskProgress(taskId: string) {
    stopTaskProgress(taskId);
    taskProgressTimersRef.current[taskId] = window.setInterval(() => {
      setTasks((current) => {
        const next = current.map((task) => {
          if (task.id !== taskId || task.status === "completed" || task.status === "failed" || task.status === "cancelled") return task;
          const elapsed = Date.now() - task.startedAt;
          const currentProgress = task.progress || 8;
          const nextProgress = Math.min(88, currentProgress + (currentProgress < 45 ? 7 : currentProgress < 72 ? 4 : 2));
          const stage: NonNullable<TaskRecord["stage"]> = nextProgress < 30 ? "preparing" : nextProgress < 76 ? "generating" : "quality";
          return {
            ...task,
            stage,
            backendRunState: task.backendRunState === "waiting" ? "active" : task.backendRunState,
            lastHeartbeatAt: Date.now(),
            progress: nextProgress,
            progressLabel: elapsed > 5 * 60 * 1000 ? `模型仍在生成，已等待 ${formatDuration(elapsed)}，复杂任务可继续等或停止重试` : taskProgressLabel(task, stage),
          };
        });
        tasksRef.current = next;
        return next;
      });
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
    taskAbortControllersRef.current[taskId]?.abort();
    stopTaskProgress(taskId);
    const task = tasks.find((item) => item.id === taskId);
    if (task) markNodeFailed(task.nodeId, "任务已手动停止，可以重新运行。");
    if (task) void notifyBackendTaskCancelled(task);
    updateTask(taskId, {
      status: "cancelled",
      endedAt: Date.now(),
      stage: "cancelled",
      backendRunState: "cancelled",
      error: taskAbortControllersRef.current[taskId] ? "已手动停止，正在中断请求" : "已手动停止",
      progress: 100,
      progressLabel: taskAbortControllersRef.current[taskId] ? "正在停止真实请求" : "已停止",
      cancelled: true,
    });
    setStatus("任务已停止，并已尝试中断正在运行的请求。");
  }

  function removeTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (task && isTaskActivelyRunning(task)) {
      cancelTask(taskId);
      setStatus("运行中的任务不能直接隐藏。已先停止真实请求，停止后再删除记录。");
      return;
    }
    cancelledTaskIdsRef.current.delete(taskId);
    delete taskAbortControllersRef.current[taskId];
    delete taskProjectContextRef.current[taskId];
    stopTaskProgress(taskId);
    clearTaskCleanup(taskId);
    if (task) dismissTaskRecords([task]);
    setTasks((current) => {
      const next = current.filter((task) => task.id !== taskId);
      tasksRef.current = next;
      return next;
    });
    writeProjectCacheFromRefs();
    setStatus("任务记录已删除。");
  }

  function removeFinishedTasks(targetTaskIds?: string[]) {
    const targetIdSet = targetTaskIds?.length ? new Set(targetTaskIds) : null;
    const finishedTasks = tasks.filter((task) =>
      (!targetIdSet || targetIdSet.has(task.id)) &&
      (task.status === "completed" || task.status === "failed" || task.status === "cancelled"));
    const finished = new Set(finishedTasks.map((task) => task.id));
    if (!finished.size) {
      setStatus("没有可清空的已结束任务。");
      return;
    }
    dismissTaskRecords(finishedTasks, { clearBackend: false });
    void fetch("/api/task-runs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_finished", projectId }),
    }).catch(() => {
      setStatus("已结束任务已在本地清理，但服务端任务记录同步清理失败；稍后可再次清理。");
    });
    finished.forEach((taskId) => {
      cancelledTaskIdsRef.current.delete(taskId);
      stopTaskProgress(taskId);
      clearTaskCleanup(taskId);
    });
    setTasks((current) => {
      const next = current.filter((task) => !finished.has(task.id));
      tasksRef.current = next;
      return next;
    });
    writeProjectCacheFromRefs();
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
    const clearError = status === "queued" || status === "running" || status === "saving" || status === "completed";
    nodesRef.current = nodesRef.current.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: { ...node.data, status, error: clearError ? "" : node.data.error },
          }
        : node,
    );
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: { ...node.data, status, error: clearError ? "" : node.data.error },
            }
          : node,
      ),
    );
    writeProjectCacheFromRefs();
  }

  function markNodeFailed(nodeId: string, error: string) {
    nodesRef.current = nodesRef.current.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: { ...node.data, status: "failed", error },
          }
        : node,
    );
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
    writeProjectCacheFromRefs();
  }

  function clearInvalidMaskState(nodeId: string, error: string) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.data.kind === "mask_edit"
          ? {
              ...node,
              data: {
                ...node.data,
                status: "failed",
                error,
                params: {
                  ...node.data.params,
                  maskDataUrl: "",
                  maskImageUrl: "",
                  maskImageFileName: "",
                  maskValidated: false,
                  maskCoverage: 0,
                  maskPixelCount: 0,
                  maskCanvasWidth: 0,
                  maskCanvasHeight: 0,
                },
              },
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

  function clampCanvasZoom(value: number) {
    return Math.max(canvasMinZoom, Math.min(canvasMaxZoom, Number(value.toFixed(2))));
  }

  function zoomCanvasBy(delta: number) {
    const viewport = getViewport();
    const zoom = clampCanvasZoom(viewport.zoom + delta);
    void setViewport({ ...viewport, zoom }, { duration: 180 });
    updateViewportZoom(zoom);
    setCanvasInteractionFlag("isCanvasZooming", true, 220);
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
      undismissResultImages([image]);
      addNode("image_input", position, { ...image, source: "history" });
      setStatus("已把结果图片放回画布。");
      return;
    }

    const imageFile = firstSupportedImageFile(event.dataTransfer.files);
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
      const params = new URLSearchParams({ projectId, limit: "20", offset: String(historyNextOffset) });
      const response = await fetch(`/api/generated-images?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        images?: GeneratedImage[];
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
      };
      if (!response.ok) throw new Error(data.error || `结果加载失败（HTTP ${response.status}）。`);
      const nextImages = (data.images || []).map((image) => ({ ...image, source: "history" as const, favorite: favoriteIds.has(imageKey(image)) }));
      setHistoryImages((current) => mergeImages(current, nextImages));
      setHistoryHasMore(Boolean(data.hasMore));
      setHistoryNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : historyNextOffset + nextImages.length);
      if (typeof data.total === "number") setProjectHistoryTotal(data.total);
      setStatus(nextImages.length ? `已加载 ${nextImages.length} 张结果缩略图。` : "没有更多结果。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "结果加载失败。");
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  async function loadImageManagerHistory(reset = false) {
    if (imageManagerLoading) return;
    setImageManagerLoading(true);
    try {
      const offset = reset ? 0 : imageManagerNextOffset;
      const params = new URLSearchParams({ limit: "60", offset: String(offset) });
      const response = await fetch(`/api/generated-images?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        images?: GeneratedImage[];
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
      };
      if (!response.ok) throw new Error(data.error || `图片管理加载失败（HTTP ${response.status}）。`);
      const nextImages = (data.images || []).map((image) => ({ ...image, source: "history" as const, favorite: favoriteIds.has(imageKey(image)) }));
      setImageManagerImages((current) => (reset ? sortImagesByRecency(nextImages) : mergeImages(current, nextImages)));
      setImageManagerHasMore(Boolean(data.hasMore));
      setImageManagerNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : offset + nextImages.length);
      if (reset && nextImages.length) setStatus(`图片管理已加载 ${nextImages.length} 张本地图片。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片管理加载失败。");
    } finally {
      setImageManagerLoading(false);
    }
  }

  async function loadImageManagerTrash(reset = false) {
    if (imageManagerTrashLoading) return;
    setImageManagerTrashLoading(true);
    try {
      const offset = reset ? 0 : imageManagerTrashNextOffset;
      const params = new URLSearchParams({ mode: "trash", limit: "60", offset: String(offset) });
      const response = await fetch(`/api/generated-images?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        images?: GeneratedImage[];
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
      };
      if (!response.ok) throw new Error(data.error || `回收站加载失败（HTTP ${response.status}）。`);
      const nextImages = (data.images || []).map((image) => ({ ...image, source: "history" as const, trashed: true, favorite: favoriteIds.has(imageKey(image)) }));
      setImageManagerTrashImages((current) => (reset ? sortImagesByRecency(nextImages) : mergeImages(current, nextImages)));
      setImageManagerTrashHasMore(Boolean(data.hasMore));
      setImageManagerTrashNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : offset + nextImages.length);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "回收站加载失败。");
    } finally {
      setImageManagerTrashLoading(false);
    }
  }

  function ensureImageManagerHistory() {
    if (!imageManagerImages.length && !imageManagerLoading) void loadImageManagerHistory(true);
    if (!imageManagerTrashImages.length && !imageManagerTrashLoading) void loadImageManagerTrash(true);
  }

  async function refreshProjectHistory(targetProjectId = projectId) {
    if (!targetProjectId) return;
    setHistoryLoadingMore(true);
    try {
      const params = new URLSearchParams({ projectId: targetProjectId, limit: "20", offset: "0" });
      const response = await fetch(`/api/generated-images?${params.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        images?: GeneratedImage[];
        hasMore?: boolean;
        nextOffset?: number;
        total?: number;
      };
      if (!response.ok) throw new Error(data.error || `结果加载失败（HTTP ${response.status}）。`);
      if (activeProjectIdRef.current !== targetProjectId) return;
      const nextImages = (data.images || []).map((image) => ({ ...image, source: "history" as const, favorite: favoriteIds.has(imageKey(image)) }));
      setHistoryImages(nextImages);
      setHistoryHasMore(Boolean(data.hasMore));
      setHistoryNextOffset(typeof data.nextOffset === "number" ? data.nextOffset : nextImages.length);
      setProjectHistoryTotal(typeof data.total === "number" ? data.total : nextImages.length);
      const restoredCount = restoreProjectHistoryOutputNodes(nextImages, targetProjectId);
      if (restoredCount) {
        setStatus(`已把项目中缺失的 ${restoredCount} 个结果节点补回画布，结果节点可查看来源任务。`);
      }
    } catch (error) {
      if (activeProjectIdRef.current === targetProjectId) {
        setStatus(error instanceof Error ? error.message : "结果加载失败。");
      }
    } finally {
      if (activeProjectIdRef.current === targetProjectId) setHistoryLoadingMore(false);
    }
  }

  function flushProjectPayloadForPageLifecycle(reason: ProjectSnapshot["reason"] = "leave") {
    if (!projectLoadedRef.current) return;
    const snapshot = writeProjectCacheFromRefs(reason);
    if (!snapshot) return;
    const { payloadText, stablePayload, stableProjectId } = snapshot;

    const fingerprint = `${stableProjectId}:${payloadText.length}:${stablePayload.nodes?.length || 0}:${stablePayload.runs?.length || 0}:${stablePayload.assets?.length || 0}`;
    const now = Date.now();
    if (pageLifecycleSaveRef.current.fingerprint === fingerprint && now - pageLifecycleSaveRef.current.at < 2500) return;
    pageLifecycleSaveRef.current = { fingerprint, at: now };
    persistProjectPayloadForLifecycleExit(payloadText);
  }

  function writeProjectCacheFromRefs(reason?: ProjectSnapshot["reason"]) {
    if (!projectLoadedRef.current) return null;
    const stablePayload = stripProjectRuntimeState(currentProjectPayloadFromSnapshots(nodesRef.current, edgesRef.current, tasksRef.current));
    const payloadText = stringifyProjectPayload(stablePayload);
    const stableProjectId = stablePayload.id || projectId || "local-project";
    setLastProjectJsonBytes(payloadText.length);
    writeProjectLocalCache(projectStorageKey, payloadText);
    writeProjectTaskCache(stableProjectId, stablePayload.runs || tasksRef.current);
    if (reason) writeProjectSnapshot(stableProjectId, stablePayload, reason);
    return { stablePayload, payloadText, stableProjectId };
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
    const response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadText,
    }).catch((error) => {
      throw new Error(`连接项目保存接口失败：${error instanceof Error ? error.message : "网络连接失败"}`);
    });
    if (!response.ok) throw new Error(await readProjectSaveError(response));
    const localCacheWarning = writeProjectLocalCache(projectStorageKey, payloadText);
    const taskCacheWarning = writeProjectTaskCache(stablePayload.id || projectId, stablePayload.runs || []);
    const durationMs = Math.round(performance.now() - startedAt);
    setLastSaveDurationMs(durationMs);
    void refreshProjectList();
    void refreshMaterialLibraries({ quiet: true });
    return {
      durationMs,
      localCacheWarning: [localCacheWarning, taskCacheWarning].filter(Boolean).join(" "),
      payloadBytes: payloadText.length,
    };
  }

  function saveProjectSnapshot(reason: ProjectSnapshot["reason"] = "auto") {
    if (!projectLoadedRef.current) return;
    const stablePayload = stripProjectRuntimeState(currentProjectPayloadFromSnapshots(nodesRef.current, edgesRef.current, tasksRef.current));
    writeProjectSnapshot(projectId, stablePayload, reason);
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
    if (saveInFlightRef.current) {
      saveQueuedRef.current = { manual: Boolean(saveQueuedRef.current?.manual || manual) };
      if (manual) {
        const message = "已有保存正在进行，本次修改已排队，完成后会自动再保存一次。";
        setStatus(message);
        showSaveFeedback("loading", message);
      }
      return false;
    }
    saveInFlightRef.current = true;
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
      if (manual) saveProjectSnapshot("manual");
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
    } finally {
      saveInFlightRef.current = false;
      const queued = saveQueuedRef.current;
      saveQueuedRef.current = null;
      if (queued) {
        window.setTimeout(() => {
          void saveProject({ manual: queued.manual });
        }, 0);
      }
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
      const data = (await response.json().catch(() => ({}))) as { candidates?: ProjectFactCandidate[]; error?: string };
      if (!response.ok) throw new Error(data.error || `公开资料查询失败（HTTP ${response.status}）。`);
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
    } catch (error) {
      setProjectMemorySearchState("error");
      setStatus(error instanceof Error ? error.message : "机构公开资料抓取失败，请稍后重试。");
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
    return currentProjectPayloadFromSnapshots(nodes, edges, tasks);
  }

  function currentProjectPayloadFromSnapshots(nodeSnapshot: FlowNode[], edgeSnapshot: FlowEdge[], taskSnapshot: TaskRecord[]) {
    const knowledge = buildProjectKnowledgeFromState({
      projectId,
      projectName,
      projectAssets,
      projectAssetText,
      projectProfile,
      currentKnowledge: projectKnowledge,
    });
    return stripProjectRuntimeState({
      id: projectId,
      name: projectName,
      ownerUserId: projectOwnerUserId || undefined,
      ownerEmail: projectOwnerEmail || undefined,
      ownerName: projectOwnerName || undefined,
      projectKind,
      viewport: getViewport(),
      assets: projectAssets,
      assetText: projectAssetText,
      profile: projectProfile,
      knowledge,
      textProtectionMode,
      nodes: nodeSnapshot,
      edges: edgeSnapshot,
      runs: taskSnapshot,
      updatedAt: new Date().toISOString(),
    });
  }

  async function refreshProjectList() {
    if (projectListLoadingRef.current) return false;
    projectListLoadingRef.current = true;
    setProjectListLoading(true);
    setProjectListError("");
    try {
      const response = await fetch("/api/project?mode=list");
      const data = (await response.json().catch(() => ({}))) as { activeProjectId?: string; projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(responseErrorMessage(response, data, "项目列表刷新失败"));
      setProjectList(data.projects || []);
      if (data.activeProjectId) setProjectId((current) => current || data.activeProjectId || "local-project");
      return true;
    } catch (error) {
      setProjectListError(error instanceof Error ? error.message : "项目列表刷新失败。");
      return false;
    } finally {
      projectListLoadingRef.current = false;
      setProjectListLoading(false);
    }
  }

  async function refreshMaterialLibraries(options: { quiet?: boolean } = {}) {
    if (materialLibrariesLoadingRef.current) return false;
    materialLibrariesLoadingRef.current = true;
    try {
      const response = await fetch("/api/material-libraries?mode=detail");
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectLibraries?: MaterialLibrarySummary[];
        publicStyleLibraries?: MaterialLibrarySummary[];
      };
      if (!response.ok) throw new Error(responseErrorMessage(response, data, "素材库刷新失败"));
      setProjectLibraries(data.projectLibraries || []);
      setPublicStyleLibraries(data.publicStyleLibraries || []);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "素材库刷新失败。";
      if (!options.quiet) setStatus(message);
      if (options.quiet) return false;
      throw new Error(message);
    } finally {
      materialLibrariesLoadingRef.current = false;
    }
  }

  async function loadProject(id: string, ownerUserId?: string) {
    const params = new URLSearchParams({ id });
    if (ownerUserId) params.set("ownerUserId", ownerUserId);
    const response = await fetch(`/api/project?${params.toString()}`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(responseErrorMessage(response, data, "打开项目失败"));
      return false;
    }
    const project = (await response.json().catch(() => null)) as ProjectPayload | null;
    if (!project) {
      setStatus("打开项目失败：接口没有返回有效项目数据。");
      return false;
    }
    setProjectId(project.id || id);
    setProjectName(project.name || "AI 设计项目");
    setProjectOwnerUserId(project.ownerUserId || ownerUserId || "");
    setProjectOwnerEmail(project.ownerEmail || "");
    setProjectOwnerName(project.ownerName || "");
    setProjectKind(normalizeProjectKind(project.projectKind));
    const restoredProjectId = project.id || id;
    const restoredProjectName = project.name || "AI 设计项目";
    const restoredRuns = restoreProjectTasks(project.runs || []);
    const restoredTasks = resetTaskProjectContexts(
      restoreProjectTasks(readProjectTaskCache(restoredProjectId, restoredRuns)),
      restoredProjectId,
      restoredProjectName,
    );
    const restoredNodes = filterDismissedRestoredNodes(restoredProjectId, restoreNodes(project.nodes || [], restoredTasks));
    const restoredEdges = filterEdgesForNodes(project.edges || [], restoredNodes);
    nodesRef.current = restoredNodes;
    edgesRef.current = restoredEdges;
    tasksRef.current = restoredTasks;
    setNodes(restoredNodes);
    setEdges(restoredEdges);
    setTasks(restoredTasks);
    writeProjectTaskCache(restoredProjectId, restoredTasks);
    void mergeServerTaskRunsIntoProject(restoredProjectId, restoredProjectName);
    setHistoryImages([]);
    setHistoryHasMore(false);
    setHistoryNextOffset(0);
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
    let activeProjectSyncFailed = false;
    await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stripProjectRuntimeState({ ...project, ownerUserId: project.ownerUserId || ownerUserId, setActive: true })),
    }).catch(() => {
      activeProjectSyncFailed = true;
    });
    setStatus(activeProjectSyncFailed
      ? `已打开项目：${project.name || "AI 设计项目"}；但同步默认项目失败，下次启动如未进入该项目，请从项目列表重新打开。`
      : `已打开项目：${project.name || "AI 设计项目"}`);
    void refreshProjectList();
    void refreshMaterialLibraries({ quiet: true });
    return true;
  }

  function resetDeletedActiveProjectState() {
    const nextId = "local-project";
    const nextName = "节点设计项目";
    const nextKnowledge = createDefaultProjectKnowledge({ projectId: nextId, projectName: nextName });
    Object.keys(taskAbortControllersRef.current).forEach((taskId) => {
      taskAbortControllersRef.current[taskId]?.abort();
      delete taskAbortControllersRef.current[taskId];
    });
    Object.keys(taskProgressTimersRef.current).forEach(stopTaskProgress);
    Object.keys(taskCleanupTimersRef.current).forEach(clearTaskCleanup);
    nodesRef.current = [];
    edgesRef.current = [];
    tasksRef.current = [];
    taskProjectContextRef.current = {};
    setNodes([]);
    setEdges([]);
    setTasks([]);
    setHistoryImages([]);
    setImageManagerImages([]);
    setImageManagerTrashImages([]);
    setHistoryHasMore(false);
    setHistoryNextOffset(0);
    setProjectAssets([]);
    setProjectAssetText("");
    setProjectProfile(emptyProjectProfile);
    setProjectKnowledge(nextKnowledge);
    setProjectKind("scratch");
    setProjectId(nextId);
    setProjectOwnerUserId("");
    setProjectOwnerEmail("");
    setProjectOwnerName("");
    setProjectName(nextName);
    setSelectedNodeId(null);
    setLightboxImage(null);
    setProjectSaveState("saved");
    setHomeOpen(true);
    rememberWorkbenchHomeState(true);
  }

  async function deleteProject(id: string, ownerUserId?: string) {
    const deletingActiveProject = id === projectId && (!ownerUserId || !projectOwnerUserId || ownerUserId === projectOwnerUserId);
    const response = await fetch("/api/project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ownerUserId }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      const message = responseErrorMessage(response, data, "删除项目失败");
      setStatus(message);
      throw new Error(message);
    }
    const data = (await response.json().catch(() => ({}))) as { activeProjectId?: string; projects?: ProjectSummary[] };
    const nextProjects = data.projects || [];
    clearDeletedProjectBrowserCache(id);
    setProjectList(nextProjects);
    if (deletingActiveProject) {
      const replacement = nextProjects.find((project) => (
        project.id === data.activeProjectId &&
        (!ownerUserId || !project.ownerUserId || project.ownerUserId === ownerUserId)
      )) || nextProjects.find((project) => project.id !== id || project.ownerUserId !== ownerUserId);
      if (replacement) {
        await loadProject(replacement.id, replacement.ownerUserId);
      } else {
        resetDeletedActiveProjectState();
      }
    }
    void refreshProjectList();
    setStatus("项目已删除。");
  }

  async function deleteHistoryImage(
    image: ImageAsset,
    options: { permanent?: boolean; quiet?: boolean; skipTrashRefresh?: boolean } = {},
  ) {
    const protection = imageDeletionProtection(image, nodes, projectAssets);
    const favoriteOnlyProtected = protection.isFavorite && !protection.isProjectAsset && !protection.usedByNodes;
    if (!options.permanent && protection.protected && !favoriteOnlyProtected) {
      if (!options.quiet) setStatus("这张图正在使用或作为项目素材，暂不能删除。先移除引用后再删除。");
      return false;
    }
    const fileName = generatedFileNameForImage(image);
    if (!fileName) return false;
    const permanent = Boolean(options.permanent || image.trashed || fileName.startsWith("_trash/"));
    const response = await fetch("/api/generated-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, permanent }),
    });
    if (!response.ok) {
      const message = await readResponseErrorMessage(response, "删除结果图片失败");
      if (!options.quiet) setStatus(message);
      return false;
    }
    applyDeletedHistoryImages([image], [fileName]);
    if (permanent) {
      setImageManagerTrashImages((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
      if (!options.quiet) setStatus("图片已彻底删除。");
      return true;
    }
    if (!options.skipTrashRefresh) void loadImageManagerTrash(true);
    if (!options.quiet) setStatus("图片已移到回收站，可在图片管理 → 回收站里恢复。");
    return true;
  }

  async function deleteHistoryImagesBatch(images: ImageAsset[]) {
    const candidates = images.filter((image) => {
      const protection = imageDeletionProtection(image, nodesRef.current, projectAssets);
      return !protection.isFavorite && (protection.canDelete || protection.isTrashed);
    });
    const fileNames = Array.from(new Set(candidates.map(generatedFileNameForImage).filter(Boolean)));
    if (!fileNames.length) {
      setStatus("没有可批量删除的图片。收藏图需要单独删除，正在使用或作为项目素材的图片会被跳过。");
      return false;
    }
    const response = await fetch("/api/generated-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileNames, permanent: false }),
    });
    if (!response.ok) {
      const message = await readResponseErrorMessage(response, "批量删除本地图片失败");
      setStatus(message);
      return false;
    }
    applyDeletedHistoryImages(candidates, fileNames);
    setImageManagerTrashImages((current) => current.filter((item) => !fileNames.some((fileName) => imageMatchesGeneratedFile(item, fileName))));
    const trashedCount = fileNames.filter((fileName) => fileName.startsWith("_trash/")).length;
    const movedCount = fileNames.length - trashedCount;
    if (movedCount) void loadImageManagerTrash(true);
    setStatus([
      movedCount ? `已将 ${movedCount} 张图片移到回收站` : "",
      trashedCount ? `已从本地彻底删除 ${trashedCount} 张回收站图片` : "",
    ].filter(Boolean).join("，") + "。");
    return true;
  }

  function applyDeletedHistoryImages(images: ImageAsset[], fileNames: string[]) {
    const uniqueFileNames = Array.from(new Set(fileNames.filter(Boolean)));
    if (!uniqueFileNames.length) return;
    const matchesDeleted = (image: ImageAsset | null | undefined) => Boolean(image && uniqueFileNames.some((fileName) => imageMatchesGeneratedFile(image, fileName)));
    dismissResultImages(images);
    setHistoryImages((current) => current.filter((item) => !matchesDeleted(item)));
    setImageManagerImages((current) => current.filter((item) => !matchesDeleted(item)));
    setProjectAssets((current) => current.filter((item) => !matchesDeleted(item)));
    const nextNodesAfterImageDelete = uniqueFileNames.reduce((currentNodes, fileName) => currentNodes.map((node) => removeImageFromNode(node, fileName)), nodesRef.current);
    nodesRef.current = nextNodesAfterImageDelete;
    setNodes(nextNodesAfterImageDelete);
    setTasks((current) => {
      const removedTasks: TaskRecord[] = [];
      const next: TaskRecord[] = [];
      for (const task of current) {
        const outputs = (task.outputs || []).filter((item) => !matchesDeleted(item));
        const resultRemoved = matchesDeleted(task.result);
        const nextTask = {
          ...task,
          outputs,
          result: resultRemoved ? outputs[0] : task.result,
          resultCount: outputs.length || (resultRemoved ? 0 : task.resultCount),
          resultNodeIds: task.resultNodeIds?.filter((nodeId) => nextNodesAfterImageDelete.some((node) => node.id === nodeId && !nodeImageReferences(node).some(matchesDeleted))),
        };
        if ((task.status === "completed" || task.status === "failed" || task.status === "cancelled") && !nextTask.outputs.length && !nextTask.result) {
          removedTasks.push(task);
          continue;
        }
        next.push(nextTask);
      }
      if (removedTasks.length) dismissTaskRecords(removedTasks);
      tasksRef.current = next;
      return next;
    });
    writeProjectCacheFromRefs();
    setLightboxImage((current) => (matchesDeleted(current) ? null : current));
  }

  async function restoreHistoryImage(image: ImageAsset, options: { quiet?: boolean; skipReload?: boolean } = {}) {
    const fileName = generatedFileNameForImage(image);
    if (!fileName) return false;
    const response = await fetch("/api/generated-images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", fileName }),
    });
    if (!response.ok) {
      const message = await readResponseErrorMessage(response, "恢复图片失败");
      if (!options.quiet) setStatus(message);
      return false;
    }
    setImageManagerTrashImages((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
    if (!options.skipReload) void loadImageManagerHistory(true);
    if (!options.quiet) setStatus("图片已从回收站恢复。");
    return true;
  }

  function appendNextImageIds(image: ImageAsset, nextIds: string[]) {
    const key = imageKey(image);
    const patchIds = mergeImageIdList(image.nextImageIds, nextIds);
    if (!patchIds.length) return;
    const updateImage = (item: ImageAsset): ImageAsset => (imageKey(item) === key ? { ...item, nextImageIds: patchIds } : item);
    setHistoryImages((current) => current.map(updateImage));
    setLightboxImage((current) => (current && imageKey(current) === key ? { ...current, nextImageIds: patchIds } : current));
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      data: {
        ...node.data,
        image: node.data.image ? updateImage(node.data.image) : node.data.image,
        output: node.data.output ? updateImage(node.data.output) : node.data.output,
        outputs: node.data.outputs?.map(updateImage),
      },
    }));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    if (image.fileName) {
      void fetch("/api/generated-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: image.fileName, metadata: { nextImageIds: patchIds } }),
      }).catch(() => {
        setStatus("已创建新版本，但图片版本关系同步失败；刷新后版本链可能不完整。");
      });
    }
  }
  async function persistGeneratedMetadata(images: ImageAsset[]) {
    await mapWithConcurrency(
      images.filter((image) => image.fileName),
      metadataPatchConcurrency,
      (image) =>
        fetch("/api/generated-images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: image.fileName,
            metadata: {
              projectId: image.projectId || projectId,
              parentImageId: image.parentImageId,
              rootImageId: image.rootImageId,
              branchId: image.branchId,
              branchLabel: image.branchLabel,
              resultGroupId: image.resultGroupId,
              sourceTaskId: image.sourceTaskId,
              sourceRequestId: image.sourceRequestId,
              sourceNodeId: image.sourceNodeId,
              sourceNodeName: image.sourceNodeName,
              sourceNodeKind: image.sourceNodeKind,
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
        }).catch(() => null),
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
    nodesRef.current = [];
    edgesRef.current = [];
    tasksRef.current = [];
    setNodes([]);
    setEdges([]);
    setTasks([]);
    taskProjectContextRef.current = {};
    setHistoryImages([]);
    setHistoryHasMore(false);
    setHistoryNextOffset(0);
    setProjectAssets([]);
    setProjectProfile(emptyProjectProfile);
    setSelectedNodeId(null);
    setProjectId(nextId);
    setProjectOwnerUserId("");
    setProjectOwnerEmail("");
    setProjectOwnerName("");
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
    void refreshMaterialLibraries({ quiet: true });
    return true;
  }

  async function enterNewProjectFromHome() {
    if (!projectBootReady || homeBusy) return;
    setHomeBusy(true);
    setHomeProjectPickerOpen(false);
    setHomeOpen(false);
    rememberWorkbenchHomeState(false);
    try {
      await createNewProject();
    } finally {
      setHomeBusy(false);
    }
  }

  async function openProjectFromHome(id: string, ownerUserId?: string) {
    if (!projectBootReady || homeBusy) return;
    setHomeBusy(true);
    try {
      const opened = await loadProject(id, ownerUserId);
      if (opened) {
        setHomeProjectPickerOpen(false);
        setHomeOpen(false);
        rememberWorkbenchHomeState(false);
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
        activeProjectOwnerUserId={projectOwnerUserId}
        busy={homeBusy || !projectBootReady}
        formatUpdatedAt={formatGeneratedAt}
        onCreate={() => void enterNewProjectFromHome()}
        onOpen={(id, ownerUserId) => void openProjectFromHome(id, ownerUserId)}
        onRefreshProjects={() => void refreshProjectList()}
        onShowProjects={showHomeProjectPicker}
        pickerOpen={homeProjectPickerOpen}
        projectListError={projectListError}
        projectListLoading={projectListLoading}
        projects={projectList}
      />
    );
  }

  return (
    <main className="apple-shell flex h-screen overflow-hidden text-[#f5f7fb]">
      {canvasFocusMode ? null : (
        <aside
          className={`apple-sidebar z-20 flex shrink-0 flex-col items-center gap-1.5 px-1.5 py-3 transition-[width] duration-200 ${
            leftRailOpen ? "w-[104px]" : "w-[54px]"
          }`}
        >
          <button
            className="apple-button mb-1.5 flex size-8 items-center justify-center rounded-full text-white/66"
            onClick={() => setLeftRailOpen((value) => !value)}
            title={leftRailOpen ? "收起左栏" : "展开左栏"}
            type="button"
          >
            <ChevronRight className={`size-4 transition ${leftRailOpen ? "rotate-180" : ""}`} />
          </button>
          <button
            className={`apple-button-primary mb-0.5 flex items-center justify-center gap-1.5 rounded-full px-2 text-[#07121f] ${
              leftRailOpen ? "h-9 w-full" : "size-9"
            }`}
            onClick={() => setNodeMenuOpen((value) => !value)}
            title="添加节点"
            type="button"
          >
            <Plus className="size-4 shrink-0" />
            {leftRailOpen ? <span className="text-[12px] font-semibold">添加</span> : null}
          </button>
          <div className="w-full space-y-1">
            <ToolbarButton
              expanded={leftRailOpen}
              icon={<Home className="size-4" />}
              label="首页"
              onClick={returnHomeFromCanvas}
            />
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
              className={`apple-button flex items-center justify-center rounded-full border transition text-white/72 ${
                leftRailOpen ? "h-9 w-full justify-start gap-2 px-3" : "size-9 px-0 py-0"
              }`}
              href="/settings"
              onClick={() => void saveProject()}
              title="设置"
            >
              <KeyRound className="size-4 shrink-0" />
              {leftRailOpen ? <span className="min-w-0 truncate text-[12px] leading-none opacity-85">设置</span> : null}
            </Link>
            <AccountSwitcher compact expanded={leftRailOpen} />
          </div>
        </aside>
      )}

      {projectPanelOpen && !canvasFocusMode ? (
        <ProjectLibraryPanel
          activeProjectId={projectId}
          activeProjectOwnerUserId={projectOwnerUserId}
          formatUpdatedAt={formatGeneratedAt}
          projects={projectList}
          onClose={() => setProjectPanelOpen(false)}
          onCreateNew={() => {
            setProjectPanelOpen(false);
            setProjectCreateOpen(true);
          }}
          onDelete={deleteProject}
          onOpen={loadProject}
          onRefresh={refreshProjectList}
        />
      ) : null}

      {projectCreateOpen ? (
        <ProjectCreationModal
          draft={emptyProjectCreationDraft}
          onClose={() => setProjectCreateOpen(false)}
          onCreate={createNewProject}
        />
      ) : null}

      {assetPanelOpen && !canvasFocusMode ? (
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
          onUpload={uploadProjectAssets}
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
        {canvasFocusMode ? (
          <>
            <div className="pointer-events-auto absolute left-4 top-4 z-30 flex flex-col gap-2" aria-label="专注画布左侧入口">
              <button
                className="apple-button-primary flex size-10 items-center justify-center rounded-full text-[#07121f] shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                onClick={() => setNodeMenuOpen((value) => !value)}
                title="添加节点"
                type="button"
              >
                <Plus className="size-4" />
              </button>
              <button
                className="apple-button flex size-10 items-center justify-center rounded-full text-white/72"
                onClick={returnHomeFromCanvas}
                title="回到首页"
                type="button"
              >
                <Home className="size-4" />
              </button>
              <button
                className="apple-button flex size-10 items-center justify-center rounded-full text-white/72"
                onClick={openFocusProjectPanel}
                title="项目"
                type="button"
              >
                <PanelLeftOpen className="size-4" />
              </button>
              <button
                className="apple-button flex size-10 items-center justify-center rounded-full text-white/72"
                onClick={openFocusAssetPanel}
                title="素材"
                type="button"
              >
                <Images className="size-4" />
              </button>
            </div>
            <div className="pointer-events-auto absolute right-4 top-4 z-30 flex flex-col gap-2" aria-label="专注画布右侧入口">
              <button
                className="apple-button flex size-10 items-center justify-center rounded-full text-white/72"
                onClick={() => openFocusRightPanel("tasks")}
                title="打开右侧栏"
                type="button"
              >
                <PanelRightOpen className="size-4" />
              </button>
            </div>
            <button
              className="apple-button pointer-events-auto absolute bottom-4 left-1/2 z-30 flex h-10 -translate-x-1/2 items-center gap-2 rounded-full px-3 text-[12px] font-semibold text-white/78"
              onClick={openFocusComposer}
              title="打开输入框"
              type="button"
            >
              <MessageCircle className="size-4" />
              输入
            </button>
          </>
        ) : null}

        {canvasFocusMode ? null : (
        <header className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
          <div className="pointer-events-auto w-[min(184px,calc(100vw-220px))]">
            <div
              className="apple-panel flex h-9 items-center gap-1.5 rounded-full px-2.5"
              title={`${projectName} · ${saveStateLabel(projectSaveState, Boolean(saveQueuedRef.current))} · ${imageModelStatus.label} · 节点 ${nodes.length} · 图片 ${projectImageCount}${lastProjectJsonBytes ? ` · 项目 ${formatFileSize(lastProjectJsonBytes)} / 建议低于 ${formatFileSize(projectCapacityJsonWarningBytes)}` : ""}${lastSaveDurationMs ? ` · 保存 ${formatDuration(lastSaveDurationMs)}` : ""}`}
            >
              <Folder className="size-3.5 shrink-0 text-white/46" />
              <input
                className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold leading-5 text-white/86 outline-none focus-visible:shadow-none"
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
              {projectKind === "temporary" ? <span className="size-1.5 shrink-0 rounded-full bg-[#ffd166]" title="临时项目" /> : null}
              <span
                className={`size-2 shrink-0 rounded-full ${
                  projectSaveState === "error"
                    ? "bg-[#ff6b5f]"
                    : projectSaveState === "saving"
                      ? "bg-[#ffd166]"
                      : "bg-[#74e3c5]"
                }`}
                title={saveStateLabel(projectSaveState, Boolean(saveQueuedRef.current))}
              />
            </div>
            {saveFeedback?.tone === "error" ? (
              <div
                className="mt-2 rounded-xl border border-[#ff6b5f]/20 bg-[#ff6b5f]/12 px-2.5 py-1.5 text-[11px] leading-5 text-[#ffb4a8]"
              >
                {saveFeedback.message}
              </div>
            ) : null}
            {projectCapacity.message ? (
              <div
                className={`mt-2 rounded-xl border px-2.5 py-1.5 text-[11px] leading-5 ${
                  projectCapacity.tone === "critical"
                    ? "border-[#ff6b5f]/20 bg-[#ff6b5f]/12 text-[#ffb4a8]"
                    : "border-[#f5c66a]/24 bg-[#f5c66a]/10 text-[#ffe2a3]"
                }`}
              >
                {projectCapacity.message}
              </div>
            ) : null}
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            <button
              className="apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[#ffb4a8] disabled:opacity-45"
              disabled={!nodes.length}
              onClick={clearCanvas}
              title={nodes.length ? "清空当前画布，保留任务记录和图片库文件" : "当前画布为空"}
              type="button"
            >
              <Trash2 className="size-3.5" />
              清空画布
            </button>
            {projectKind === "temporary" ? (
              <button
                className="apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium"
                onClick={convertTemporaryProject}
                type="button"
              >
                <FolderOpen className="size-3.5" />
                转正式
              </button>
            ) : null}
            {nodes.length > 1 ? (
              <button
                className="apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium"
                onClick={organizeCanvas}
                type="button"
              >
                <ScanLine className="size-3.5" />
                整理
              </button>
            ) : null}
            <button
              className="apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium"
              disabled={projectSaveState === "saving"}
              onClick={() => void saveProject({ manual: true })}
              type="button"
            >
              <Check className="size-3.5" />
              {projectSaveState === "saving" ? "保存中" : projectSaveState === "error" ? "重新保存" : "保存"}
            </button>
            <button
              className="apple-button flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-medium"
              onClick={() => setRightPanelOpen((value) => !value)}
              type="button"
            >
              <Folder className="size-3.5" />
              {rightPanelOpen ? "收起" : "侧栏"}
            </button>
          </div>
        </header>
        )}

        {nodeMenuOpen && !isPerformanceMode ? (
          <NodeMenu
            x={leftRailOpen ? 126 : 70}
            y={82}
            onClose={() => setNodeMenuOpen(false)}
            onSelect={(type) => {
              const node = addNode(type, nextStandaloneNodePosition());
              if (type !== "image_input") focusNodeParams(node.id);
              setStatus(nodeCreationHint(type, false));
              setNodeMenuOpen(false);
            }}
          />
        ) : null}

        {menu?.kind === "add" && !isPerformanceMode ? (
          <NodeMenu
            x={menu.x}
            y={menu.y}
            onClose={() => setMenu(null)}
            onSelect={(type) => {
              const node = addNode(type, menu.position);
              if (type !== "image_input") focusNodeParams(node.id);
              setStatus(nodeCreationHint(type, false));
              setMenu(null);
            }}
          />
        ) : null}

        {menu?.kind === "quick" && !isPerformanceMode ? (
          <QuickMenu
            x={menu.x}
            y={menu.y}
            onDelete={() => {
              deleteNode(menu.nodeId);
              setMenu(null);
            }}
            onClose={() => setMenu(null)}
            onSelect={(action) => {
              addQuickNode(menu.nodeId, action.type, action.handle);
              setMenu(null);
            }}
          />
        ) : null}

        <ReactFlow
          className={`node-workflow-flow ${isPerformanceMode ? "is-performance-mode" : ""}`}
          ariaLabelConfig={flowAriaLabelConfig}
          colorMode="dark"
          edges={decoratedEdges}
          maxZoom={canvasMaxZoom}
          minZoom={canvasMinZoom}
          nodeTypes={WORKBENCH_NODE_TYPES}
          nodes={decoratedNodes}
          onlyRenderVisibleElements
          onConnect={onConnect}
          onConnectEnd={() => setCanvasInteractionFlag("isConnecting", false, 60)}
          onConnectStart={() => {
            setMenu(null);
            setNodeMenuOpen(false);
            setCanvasInteractionFlag("isConnecting", true, 300);
          }}
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
          onMove={(_, viewport) => {
            const zoomDelta = Math.abs(viewport.zoom - viewportZoomRef.current);
            updateViewportZoom(viewport.zoom);
            setCanvasInteractionFlag(zoomDelta > 0.02 ? "isCanvasZooming" : "isCanvasPanning", true, 260);
          }}
          onMoveEnd={(_, viewport) => {
            updateViewportZoom(viewport.zoom);
            setCanvasInteractionFlag("isCanvasPanning", false, 60);
            setCanvasInteractionFlag("isCanvasZooming", false, 60);
          }}
          onMoveStart={() => {
            setMenu(null);
            setNodeMenuOpen(false);
            setCanvasInteractionFlag("isCanvasPanning", true, 260);
          }}
          onNodeClick={(_, node) => focusNodeParams(node.id, { openPanel: !canvasFocusMode })}
          onNodeContextMenu={(event, node) => {
            if (isPerformanceMode) return;
            onNodeContextMenu(event, node);
          }}
          onNodeDragStart={() => {
            setMenu(null);
            setNodeMenuOpen(false);
            setCanvasInteractionFlag("isNodeDragging", true, 260);
          }}
          onNodeDragStop={() => setCanvasInteractionFlag("isNodeDragging", false, 60)}
          onNodesChange={onNodesChange}
          onPaneClick={() => {
            setMenu(null);
            setNodeMenuOpen(false);
            setProjectPanelOpen(false);
            setAssetPanelOpen(false);
          }}
          onPaneContextMenu={(event) => {
            if (isPerformanceMode) return;
            onPaneContextMenu(event);
          }}
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
              ariaLabel="缩略地图"
            />
          ) : null}
        </ReactFlow>

        {nodes.length ? (
          <div className="apple-panel pointer-events-auto absolute bottom-[112px] left-4 z-20 flex flex-col overflow-hidden p-1" aria-label="画布控制">
            <button
              aria-label="放大画布"
              className="flex size-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={viewportZoom >= canvasMaxZoom - 0.03}
              onClick={() => zoomCanvasBy(0.18)}
              type="button"
            >
              <Plus className="size-4" />
            </button>
            <button
              aria-label="缩小画布"
              className="flex size-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={viewportZoom <= canvasMinZoom + 0.03}
              onClick={() => zoomCanvasBy(-0.18)}
              type="button"
            >
              <Minus className="size-4" />
            </button>
            <button
              aria-label={canvasFocusMode ? "恢复界面" : "全屏画布"}
              className="flex size-8 items-center justify-center rounded-xl text-white/74 transition hover:bg-white/10"
              onClick={canvasFocusMode ? exitCanvasFocusMode : enterCanvasFocusMode}
              title={canvasFocusMode ? "恢复界面" : "全屏画布"}
              type="button"
            >
              {canvasFocusMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        ) : null}

        {canvasFocusMode ? null : (
        <ChatComposer
          brandSummary={brandAssetSummary}
          brandUsage={projectProfile.brandAssetUsage}
          effectiveModel={effectiveImageModel}
          favoriteStyleImages={favoriteStyleCandidates}
          focusTick={composerFocusTick}
          hasKey={modelInfo.hasKey}
          model={composerModel}
          modelOptions={imageModelOptions}
          prompt={composerPrompt}
          quality={composerDisplayQuality}
          ratio={composerDisplayRatio}
          runningNodeIds={runningNodeIds}
          selectedNode={selectedNode}
          selectedFavoriteStyleKeys={selectedFavoriteStyleKeys}
          variantCount={composerDisplayVariantCount}
          onModelChange={changeComposerModel}
          onBrandUsageChange={(usage) => setProjectProfile((current) => ({ ...current, brandAssetUsage: normalizeBrandAssetUsage(usage) }))}
          onFavoriteStyleSelect={toggleFavoriteStyleReference}
          onImageFile={addComposerImageAsReference}
          onPasteHint={() => setStatus("可以使用系统截图后直接 Command/Ctrl+V 粘贴，或把图片拖到画布里。")}
          onPromptChange={changeComposerPrompt}
          onQualityChange={changeComposerQuality}
          onRatioChange={changeComposerRatio}
          onVariantCountChange={changeComposerVariantCount}
          onSubmit={submitComposer}
        />
        )}

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

      {rightPanelOpen && !canvasFocusMode ? (
        <aside className="apple-panel-strong apple-drawer fixed bottom-3 right-3 top-3 z-40 flex w-[min(356px,calc(100vw-96px))] flex-col overflow-hidden rounded-[28px] xl:static xl:z-20 xl:w-[356px] xl:shrink-0 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none">
          <RightPanel
            historyImages={historyImages}
            historyHasMore={historyHasMore}
            historyLoadingMore={historyLoadingMore}
            imageManagerHasMore={imageManagerHasMore}
            imageManagerImages={imageManagerImages}
            imageManagerLoading={imageManagerLoading}
            imageManagerTrashHasMore={imageManagerTrashHasMore}
            imageManagerTrashImages={imageManagerTrashImages}
            imageManagerTrashLoading={imageManagerTrashLoading}
            imageModel={effectiveImageModel}
            nodes={nodes}
            projectAssets={projectAssets}
            tabHint={rightPanelTabHint}
            tabHintTick={rightPanelTabTick}
            onDeleteHistory={deleteHistoryImage}
            onCopyHistory={async (image) => {
              await copyImageToClipboard(image);
              setStatus("图片已复制。");
            }}
            onToggleFavorite={toggleHistoryFavorite}
            onEnsureImageManager={ensureImageManagerHistory}
            onLoadMoreImageManager={() => void loadImageManagerHistory(false)}
            onLoadMoreTrash={() => void loadImageManagerTrash(false)}
            onLoadMoreHistory={() => void loadMoreHistory()}
            onPreview={setLightboxImage}
            onRestoreHistory={restoreHistoryImage}
            onPermanentDeleteHistory={(image) => deleteHistoryImage(image, { permanent: true })}
            onClose={() => setRightPanelOpen(false)}
            backNode={selectedInspectorBackNode}
            selectedNode={selectedInspectorNode}
            tasks={tasks.map((task) => ({ ...task, resultOnCanvas: hasTaskResultNodesOnCanvas(task) }))}
            onCancelTask={cancelTask}
            onDeleteTask={removeTask}
            onDeleteFinishedTasks={removeFinishedTasks}
            onDeleteHistoryMany={deleteHistoryImagesBatch}
            onMaskEdit={(nodeId) => {
              if (!resolveInputImage(nodeId, "image")) {
                setStatus("局部 AI 修改需要先把图片连接到节点。");
                return;
              }
              setMaskEditorNodeId(nodeId);
            }}
            onParamChange={updateNodeParam}
            onRetryTask={retryTask}
            onCreateAction={(nodeId, type, handle, params) => addQuickNode(nodeId, type, handle, params)}
            onBackToNode={returnToInspectorBackNode}
            onRunNode={(nodeId) => void runNode(nodeId)}
          />
        </aside>
      ) : null}

      {lightboxImage ? (
        <ImageLightbox
          key={`${lightboxImage.id}-${lightboxImage.generatedAt || ""}`}
          image={lightboxImage}
          historyImages={historyImages}
          imageModel={activeImageModelForNode(null, lightboxImage.model)}
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
          onUpscale={(options) => runHistoryOperation(lightboxImage, "hd_redraw", options)}
        />
      ) : null}
      {maskEditorNode && maskEditorImage ? (
        <MaskEditorModal
          draftKey={`${maskEditorDraftPrefix}:${projectId}:${maskEditorNode.id}`}
          key={`${projectId}:${maskEditorNode.id}`}
          image={maskEditorImage}
          initialMaskUrl={maskEditorInitialMaskUrl(maskEditorNode)}
          initialPrompt={stringParam(maskEditorNode.data.params.prompt)}
          initialTaskMode={maskEditTaskModeParam(maskEditorNode.data.params.taskMode)}
          initialRegionType={maskEditRegionTypeParam(maskEditorNode.data.params.regionType)}
          initialProtectionStrength={maskEditProtectionStrengthParam(maskEditorNode.data.params.protectionStrength)}
          initialEdgeBlend={maskEditEdgeBlendParam(maskEditorNode.data.params.edgeBlend)}
          onClose={() => setMaskEditorNodeId(null)}
          onSave={async (maskDataUrl, options) => {
            const mask = await saveMaskDataUrl(maskDataUrl);
            setNodes((current) =>
              current.map((node) =>
                node.id === maskEditorNode.id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        params: {
                          ...node.data.params,
                          maskDataUrl: "",
                          maskImageUrl: mask.url,
                          maskImageFileName: mask.fileName,
                          maskValidated: options.maskPixelCount > 0,
                          maskPixelCount: options.maskPixelCount,
                          maskCoverage: options.maskCoverage,
                          maskCanvasWidth: options.maskCanvasWidth,
                          maskCanvasHeight: options.maskCanvasHeight,
                          maskSavedAt: Date.now(),
                          prompt: options.prompt,
                          ...inferSimpleMaskEditIntent(options.prompt, options),
                        },
                      },
                    }
                  : node,
              ),
            );
            clearMaskEditorDraft(`${maskEditorDraftPrefix}:${projectId}:${maskEditorNode.id}`);
            setMaskEditorNodeId(null);
            setSelectedNodeId(maskEditorNode.id);
            setPendingRunNodeId(maskEditorNode.id);
            setStatus("已开始局部 AI 修改，未涂抹区域会强制保持原图不变。");
          }}
        />
      ) : null}
    </main>
  );
}
