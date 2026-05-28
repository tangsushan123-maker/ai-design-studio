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
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  type XYPosition,
} from "@xyflow/react";
import {
  ArrowUp,
  ArrowDownToLine,
  Brush,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  FileImage,
  Folder,
  FolderOpen,
  ImagePlus,
  Images,
  KeyRound,
  Layers,
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
import { buildDeliverySummary, buildQualityReviewSummary, imageSizeLabel, qualityBadgeLabel, qualityDeliveryTone, qualityTone } from "@/lib/workbench-delivery";
import { formatDuration, formatFileSize, formatGeneratedAt } from "@/lib/workbench-format";
import { historyMatchesFilter, historyMatchesQuery } from "@/lib/workbench-history";
import { IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST } from "@/lib/prompt";
import { buildCreativeBriefFallback, type CreativeBrief, type CreativeBriefInput, type CreativeDirection } from "@/lib/creative-brief";
import { imageSourceDetailLines, imageSourceSummary } from "@/lib/workbench-image-source";
import {
  canSubmitComposerForNode,
  composerHelperTextForNode,
  composerPlaceholderForNode,
  composerSubmitStatus,
  composerTitleForNode,
  isComposerDrivenNode,
  nodeCreationHint,
  requiresConnectedImageForComposer,
} from "@/components/workbench/workbench-composer-helpers";
import {
  createResultLineage,
  generatedFileNameForImage,
  imageBranchId,
  imageKey,
  imageMatchesGeneratedFile,
  isUserFacingResultImage,
  loadFavoriteIds,
  mergeImages,
  nodeImageReferences,
  removeImageFromNode,
  saveFavoriteIds,
  sortImagesByGeneratedAt,
  sortImagesByRecency,
  sortResultImagesForDisplay,
  uniqueImagesByKey,
} from "@/components/workbench/workbench-image-collection";
import { imageRatioStyle, largePreviewFrameStyle, pngLayerDisplayName, pngLayerPreviewImage, zoomedPreviewFrameStyle } from "@/components/workbench/workbench-image-display";
import { findDataImagePath, imageDeletionProtection, imageForComparison, sanitizeSerializableImageUrl, stripImageFile } from "@/components/workbench/workbench-image-lifecycle";
import { compactThumbStyle, imageNodePreviewMetrics, shouldShowCheckerboard } from "@/components/workbench/workbench-image-metrics";
import { arrangeWorkflowNodes, estimateWorkflowNodeHeight, nodeAutoSpacingX } from "@/components/workbench/workbench-layout";
import {
  designComparisonModeLabel,
  designComparisonModeParam,
  designComparisonModeValue,
  designOptimizationStrengthLabel,
  designOptimizationStrengthParam,
  designOptimizationStrengthValue,
  exportFormatParam,
  isAiQualityEnhanceFitMode,
  pngLayerExportModeLabel,
  pngLayerExportModeParam,
  qualityEnhanceDefaultPrompt,
  qualityEnhanceModeDescription,
  qualityEnhanceModeFromFitMode,
  qualityEnhanceModeLabel,
  qualityEnhanceModeParam,
  qualityEnhanceModeValue,
  referenceRemakeModeLabel,
  referenceRemakeModeParam,
  referenceRemakeModeValue,
  resizeFitModeLabel,
  resizeFitModeValue,
} from "@/components/workbench/workbench-operation-params";
import {
  defaultTextReferenceConfig,
  isTextReferenceTargetHandle,
  normalizeTextReferenceConfigs,
  normalizeTextReferenceRole,
  normalizeTextReferenceWeight,
  ratioFromImage,
  shouldUseStrongTextReferenceMode,
  textReferenceRoleDescription,
} from "@/components/workbench/workbench-text-references";
import {
  inferTargetSizeFromImage,
  isValidUpscaleTarget,
  qualityEnhanceDefaultTargetForImage,
  qualityEnhanceQualityOptionsForTargets,
  qualityEnhanceQualityParam,
  qualityEnhanceTargetForQuality,
  qualityEnhanceTargetOptionsForImage,
  qualityForQualityEnhanceTarget,
  resolveUpscaleTargetFromParams,
  upscaleTargetDisplayLabel,
} from "@/components/workbench/workbench-upscale";
import {
  createDefaultProjectKnowledge,
  normalizeProjectKnowledge,
  type ProjectFactCandidate,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";
import { findSizePresetByLabel } from "@/lib/size-presets";
import { ImageFrame } from "@/components/workbench/image-frame";
import { ImageManagerPanel } from "@/components/workbench/image-manager-panel";
import { NodeResultsPanel } from "@/components/workbench/node-results-panel";
import { AssetLibraryPanel } from "@/components/workbench/asset-library-panel";
import { AccountSwitcher } from "@/components/account-switcher";
import { HistoryPanel } from "@/components/workbench/history-panel";
import { ProjectHomeScreen } from "@/components/workbench/project-home-screen";
import { ProjectCreationModal, type ProjectCreationDraft } from "@/components/workbench/project-creation-modal";
import {
  inferSimpleMaskEditIntent,
  maskEditEdgeBlendParam,
  maskEditProtectionStrengthParam,
  maskEditRegionTypeParam,
  maskEditTaskModeParam,
  maskQuickActions,
} from "@/components/workbench/mask-editing";
import { clearMaskEditorDraft, MaskEditorModal } from "@/components/workbench/mask-editor-modal";
import { ProjectLibraryPanel } from "@/components/workbench/project-library-panel";
import {
  ImageComparisonSlider,
  type PngLayerExportLayer,
  type PngLayerExportResult,
} from "@/components/workbench/result-preview-tools";
import { TaskCenter } from "@/components/workbench/task-center";
import { VersionStrip } from "@/components/workbench/version-strip";
import {
  defaultParamsByKind,
  emptyProjectCreationDraft,
  emptyProjectProfile,
  flowAriaLabelConfig,
  imageTaskTimeoutMs,
  inputHandlesByKind,
  maskEditorDraftPrefix,
  maxTextReferenceImages,
  projectCapacityJsonWarningBytes,
  projectLifecycleKeepaliveLimitBytes,
  projectSnapshotIntervalMs,
  projectSnapshotLimit,
  projectStorageKey,
  quickActions,
  resizePresets,
  successfulTaskAutoHideMs,
  textReferenceInputHandle,
  textReferenceRoleOptions,
  textReferenceWeightOptions,
  treeBranchVerticalGap,
  treeResultHorizontalGap,
} from "@/components/workbench/workbench-config";
import { imageModelProductHint, imageModelReadiness, initialImageModelFor, preferredAutoImageModelId } from "@/components/workbench/workbench-models";
import {
  batchImageActionSummary,
  compactImageMeta,
  completedTaskLabel,
  errorRecoveryTips,
  friendlyDisplayError,
  imageNodeTitle,
  isInvalidMaskFailure,
  nodeKindLabel,
  nodeOperationLabel,
  outputNodeTitle,
  shouldWaitForBackendAfterClientError,
  taskFailureHint,
  taskProgressLabel,
  taskStageLabel,
  taskStatusLabel,
} from "@/components/workbench/workbench-labels";
import { DetailLine, EmptyPanel, MiniInput, StatusDot, ToolbarButton } from "@/components/workbench/workbench-small-ui";
import { isActiveNodeStatus, isDeferredQueuedTask, isFinishedNodeStatus, isQualityGateBlocked, isTaskActivelyRunning, isTaskPossiblyStuck } from "@/components/workbench/workbench-task-state";
import {
  adaptiveRatioOptions,
  customSize,
  dataUrlToFile,
  getImageFileFromClipboard,
  hasClipboardImageCandidate,
  hasClipboardImageFile,
  inferRatioFromTargetSize,
  isLocalGeneratedUrl,
  isSupportedImageFile,
  numericParam,
  parseTargetSize,
  qualityParam,
  ratioOptionLabel,
  ratioOptions,
  ratioParam,
  resolveAdaptiveRatioFromPrompt,
  resolveRequestedAspectRatio,
  stringParam,
} from "@/components/workbench/workbench-utils";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import {
  activeResizePresetLabel,
  buildImageRecommendations,
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
  isProjectLocalCachePointer,
  normalizeProjectKind,
  projectAssetUploadLabel,
  projectSnapshotStorageKey,
} from "@/components/workbench/workbench-project-helpers";
import {
  enrichPrompt,
  isConservativeImageToImageNote,
  resolveNoVisibleProjectOutputPolicy,
  resolveVisibleProjectInfoRequests,
  sanitizeCreativeDirectionPrompt,
  sanitizeLegacyImageToImagePrompt,
  sanitizeProjectMemoryForPrompt,
  shouldUseProjectPromptContext,
} from "@/components/workbench/workbench-prompt-policy";
import {
  CompactOutputSummary,
  InlineChipRow,
  NodeSummary,
  RatioGlyph,
  RatioPresetGrid,
  SizePresetSelect,
  isLegacyUnvalidatedMask,
  maskEditBadge,
  maskEditorInitialMaskUrl,
  operationNodeSubtitle,
  operationNodeWidth,
  resolveNodeRenderLevel,
  textReferenceNodeItems,
} from "@/components/workbench/workbench-node-ui";
import { appendDataUrlToForm, appendImageToForm, imageFromSingleResponse, imageSourcePayloadForPngLayerExport, imagesFromResponse } from "@/components/workbench/workbench-image-requests";
import { copyImageToClipboard, copyTextToClipboard, downloadImageFile, downloadRemoteFile } from "@/components/workbench/workbench-file-actions";
import { readResponseErrorMessage } from "@/components/workbench/workbench-response";
import {
  buildTaskRecoveredCompletionPatch,
  hasTaskResultNodesOnCanvasFromNodes,
  imageBelongsToProject,
  recoverTaskCanvasResultFromNodes,
  sanitizeProjectTasks,
  serverTaskRunOutputs,
  serverTaskRunState,
  taskBelongsToProject,
  taskCandidateImagesFromNode,
  taskHasResultImages,
  taskNeedsServerSync,
} from "@/components/workbench/workbench-task-helpers";
import {
  imageSourceDismissedForProject,
  loadDismissedImageKeySet,
  loadDismissedTaskRefs,
  markDismissedImageKeys,
  markDismissedNodeRefs,
  markDismissedTaskRefs,
  readProjectSaveError,
  readProjectTaskCache,
  stringifyProjectPayload,
  unmarkDismissedImageKeys,
  writeProjectLocalCache,
  writeProjectTaskCache,
} from "@/components/workbench/workbench-project-storage";
import { projectCapacitySummary } from "@/components/workbench/workbench-project-capacity";
import {
  assetNames,
  buildProjectLibraryContext,
  buildProjectKnowledgeFromState,
  extractColorValues,
  findBrandAssets,
  getCurrentProjectBrandAssets,
  imageAssetToProjectAssetRecord,
  mergeProjectAssetRecords,
  mergeProjectLibraryAssets,
  normalizeBrandAssetUsage,
  normalizeProjectProfile,
  projectProfileColors,
  resolveBrandReferenceAssets,
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
  BrandAssetSummary,
  BrandAssetUsage,
  FlowEdge,
  FlowNode,
  GeneratedImage,
  HistoryMaskEditOptions,
  HistoryOperationOptions,
  HistoryResizeOptions,
  HistoryUpscaleOptions,
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
  ProtectedAssetPayload,
  ProtectedTextPayload,
  ProtectionContextPayload,
  ResolvedTextReference,
  RightPanelTab,
  ServerTaskRunRecord,
  TaskRecord,
  TaskResultMatchContext,
  TextReferenceConfig,
  WorkbenchModelInfo,
} from "@/components/workbench/workbench-types";
import type { ModelCatalogItem } from "@/lib/openai-defaults";


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
  const [composerPrompt, setComposerPrompt] = useState("");
  const [composerFocusTick, setComposerFocusTick] = useState(0);
  const [composerModel, setComposerModel] = useState(initialImageModelFor(initialModelInfo));
  const [composerRatio, setComposerRatio] = useState<AspectRatioValue>("auto");
  const [composerQuality, setComposerQuality] = useState<QualityValue>("standard");
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
  const scheduleSuccessfulTaskAutoHide = useCallback((taskId: string) => {
    const existingTimer = taskCleanupTimersRef.current[taskId];
    if (existingTimer) window.clearTimeout(existingTimer);
    taskCleanupTimersRef.current[taskId] = window.setTimeout(() => {
      setTasks((current) => {
        const next = current.filter((task) => {
          if (task.id !== taskId) return true;
          const keep = task.status !== "completed" || !hasTaskResultNodesOnCanvas(task);
          if (!keep) dismissedTaskRefsRef.current = markDismissedTaskRefs(projectId, [task]);
          return keep;
        });
        tasksRef.current = next;
        return next;
      });
      writeProjectCacheFromRefs();
      delete taskCleanupTimersRef.current[taskId];
    }, successfulTaskAutoHideMs);
    // Cache writing reads snapshot refs; this timer should only reset when completion recovery/project scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTaskResultNodesOnCanvas, projectId]);
  const passedImageModelOptions = useMemo(
    () => (modelInfo.modelsCache || []).filter((item) => item.capabilities.includes("image") && item.testStatus === "passed"),
    [modelInfo.modelsCache],
  );
  const autoImageModel = useMemo(
    () => preferredAutoImageModelId(passedImageModelOptions, modelInfo.imageModel),
    [modelInfo.imageModel, passedImageModelOptions],
  );
  const selectedComposerImageModel = composerModel.trim();
  const effectiveImageModel = selectedComposerImageModel
    || autoImageModel
    || passedImageModelOptions.find((item) => item.id === modelInfo.imageModel)?.id
    || "";
  const imageModelStatus = useMemo(
    () => imageModelReadiness(modelInfo, passedImageModelOptions, effectiveImageModel),
    [effectiveImageModel, modelInfo, passedImageModelOptions],
  );
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const composerDisplayRatio = selectedNode?.data.kind === "text_to_image" ? ratioParam(selectedNode.data.params.aspectRatio) : composerRatio;
  const composerDisplayQuality = selectedNode?.data.kind === "text_to_image" ? qualityParam(selectedNode.data.params.quality) : composerQuality;
  const isLowZoom = viewportZoom < 0.58;
  const isLargeWorkflow = nodes.length > 50;
  const isPerformanceMode = isLowZoom ||
    isLargeWorkflow ||
    canvasInteraction.isCanvasPanning ||
    canvasInteraction.isCanvasZooming ||
    canvasInteraction.isNodeDragging ||
    canvasInteraction.isConnecting;
  const loadedProjectImageCount = useMemo(
    () => historyImages.filter((image) => imageBelongsToProject(image, projectId) && isUserFacingResultImage(image)).length,
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
    tasks.forEach((task) => {
      if (task.status !== "completed" || !hasTaskResultNodesOnCanvas(task) || taskCleanupTimersRef.current[task.id]) return;
      scheduleSuccessfulTaskAutoHide(task.id);
    });
  }, [hasTaskResultNodesOnCanvas, nodes, scheduleSuccessfulTaskAutoHide, tasks]);
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

  useEffect(() => {
    fetch("/api/project")
      .then((response) => response.json())
      .then((project: ProjectPayload) => {
        const stored = getStoredProject(project);
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
        const nextKnowledge = resolveProjectKnowledge(stored);
        setProjectKnowledge(nextKnowledge);
        setProjectAssets(resolveProjectAssets(stored, nextKnowledge));
        setProjectAssetText(resolveProjectAssetText(stored, nextKnowledge));
        setProjectProfile(resolveProjectProfile(stored, nextKnowledge));
        setTextProtectionMode(stored?.textProtectionMode ?? true);
        workflowRuntimeRef.current.restoreCanvasViewport(restoredNodes, stored?.viewport);
      })
      .catch(() => {
        const stored = getStoredProject(null);
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
        const nextKnowledge = resolveProjectKnowledge(stored);
        setProjectKnowledge(nextKnowledge);
        setProjectAssets(resolveProjectAssets(stored, nextKnowledge));
        setProjectAssetText(resolveProjectAssetText(stored, nextKnowledge));
        setProjectProfile(resolveProjectProfile(stored, nextKnowledge));
        setTextProtectionMode(stored?.textProtectionMode ?? true);
        workflowRuntimeRef.current.restoreCanvasViewport(restoredNodes, stored?.viewport);
      })
      .finally(() => {
        projectLoadedRef.current = true;
        setProjectBootReady(true);
        setProjectSaveState("saved");
      });
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
          return Date.now() - task.startedAt > 30_000;
        })
        .map((task) => task.requestId)
        .filter((requestId): requestId is string => Boolean(requestId));
      const historyOutputsByRequestId = await fetchTaskHistoryOutputsByRequests(historyCheckRequestIds, projectId);
      const recoveredResults = new Map<string, { outputs: ImageAsset[]; resultNodeIds: string[] }>();
      for (const task of syncTasks) {
        if (!task.requestId || hasTaskResultNodesOnCanvas(task)) continue;
        const run = runByRequestId.get(task.requestId);
        const terminal = !run || run.state === "finished" || run.state === "failed" || run.state === "cancelled";
        if (!terminal && !historyOutputsByRequestId.has(task.requestId)) continue;
        const serverOutputs = run ? serverTaskRunOutputs(run) : [];
        const historyOutputs = serverOutputs.length ? [] : historyOutputsByRequestId.get(task.requestId) || [];
        const outputs = (serverOutputs.length ? serverOutputs : historyOutputs)
          .filter((image) => !dismissedImageKeysRef.current.has(imageKey(image)));
        if (!outputs.length) continue;
        const resultNodeIds = restoreTaskOutputNodes(task, outputs);
        recoveredResults.set(task.requestId, { outputs, resultNodeIds });
        if (historyOutputs.length) {
          setHistoryImages((current) => mergeImages(historyOutputs, current));
          setImageManagerImages((current) => mergeImages(historyOutputs, current));
        }
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
          if ((run.state === "finished" || recovered?.outputs.length) && outputs.length) {
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
          if ((run.state === "failed" || run.state === "cancelled") && !hasTaskResultNodesOnCanvas(task)) {
            stopTaskProgress(task.id);
            delete taskAbortControllersRef.current[task.id];
            return {
              ...task,
              status: run.state === "cancelled" ? "cancelled" : "failed",
              stage: run.state === "cancelled" ? "cancelled" : "failed",
              backendRunState,
              endedAt: task.endedAt || (run.endedAt ? Date.parse(run.endedAt) : Date.now()),
              error: run.error || task.error || "服务端任务失败",
              progress: 100,
              progressLabel: run.error || run.message || "服务端确认任务失败",
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
      const formData = new FormData();
      formData.append("image", file);
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

  function dismissTaskRecords(records: TaskRecord[], options: { clearBackend?: boolean } = {}) {
    const scoped = records.filter((task) => taskBelongsToProject(task, projectId));
    if (!scoped.length) return;
    dismissedTaskRefsRef.current = markDismissedTaskRefs(projectId, scoped);
    if (options.clearBackend !== false) {
      const requestIds = scoped.map((task) => task.requestId).filter((id): id is string => Boolean(id));
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
    const keys = images.map(imageKey).filter(Boolean);
    if (!keys.length) return;
    dismissedImageKeysRef.current = markDismissedImageKeys(projectId, keys);
  }

  function undismissResultImages(images: ImageAsset[]) {
    const keys = images.map(imageKey).filter(Boolean);
    if (!keys.length) return;
    dismissedImageKeysRef.current = unmarkDismissedImageKeys(projectId, keys);
  }

  function deleteNode(nodeId: string) {
    dismissNodeIds([nodeId]);
    const targetNode = nodesRef.current.find((node) => node.id === nodeId);
    const targetImages = targetNode ? taskCandidateImagesFromNode(targetNode) : [];
    dismissResultImages(targetImages);
    const targetImageKeys = new Set(targetImages.map(imageKey).filter(Boolean));
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
    dismissResultImages(nodesRef.current.flatMap(taskCandidateImagesFromNode));
    tasks.filter(isTaskActivelyRunning).forEach((task) => {
      taskAbortControllersRef.current[task.id]?.abort();
      void notifyBackendTaskCancelled(task);
    });
    dismissTaskRecords(tasks);
    Object.keys(taskAbortControllersRef.current).forEach((taskId) => {
      delete taskAbortControllersRef.current[taskId];
    });
    Object.keys(taskProgressTimersRef.current).forEach(stopTaskProgress);
    Object.keys(taskCleanupTimersRef.current).forEach(clearTaskCleanup);
    nodesRef.current = [];
    edgesRef.current = [];
    tasksRef.current = [];
    setNodes([]);
    setEdges([]);
    setTasks([]);
    setSelectedNodeId(null);
    setMenu(null);
    writeProjectCacheFromRefs();
    setStatus("画布已清空；图片库文件仍保留，但已阻止历史结果节点自动补回。");
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

  function reusableTextToImageNode() {
    return nodes.find((node) =>
      node.data.kind === "text_to_image" &&
      node.data.status !== "running" &&
      !stringParam(node.data.params.prompt).trim() &&
      !(node.data.outputs || []).length,
    ) || null;
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
      if (requiresConnectedImageForComposer(kind) && !hasLinkedImage) {
        setStatus(kind === "resize" ? "改比例节点要先连接一张图片，再选择目标比例和尺寸。" : "这个节点要先连接一张图片，再运行。");
        return;
      }

      if (prompt) updateNodeParam(selectedPromptNode.id, "prompt", prompt);
      if (kind === "text_to_image") {
        updateNodeParam(selectedPromptNode.id, "aspectRatio", composerDisplayRatio);
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
    if (selectedNode?.data.kind === "text_to_image") updateNodeParam(selectedNode.id, "aspectRatio", value);
  }

  function changeComposerQuality(value: QualityValue) {
    setComposerQuality(value);
    if (selectedNode?.data.kind === "text_to_image") updateNodeParam(selectedNode.id, "quality", value);
  }

  function changeComposerModel(value: string) {
    setComposerModel(value);
    if (selectedNode && isComposerDrivenNode(selectedNode.data.kind)) updateNodeParam(selectedNode.id, "model", value);
  }

  function addQuickNode(sourceNodeId: string, type: NodeKind, targetHandle: string, paramsOverride: Record<string, unknown> = {}) {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) return;
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
    if (!modelInfo.hasKey && node.data.kind !== "output") {
      markNodeFailed(nodeId, "请先配置 OpenAI API Key。");
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
            const nextIds = outputs.map((item) => item.id || item.fileName || item.url).filter(Boolean);
            appendNextImageIds(sourceImage, nextIds);
          }
          setHistoryImages((current) => mergeImages(outputs, current));
          setImageManagerImages((current) => mergeImages(outputs, current));
          nodesRef.current = nodesRef.current.map((item) =>
            item.id === nodeId
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    output: outputs[0],
                    outputs,
                    resultCount: outputs.length,
                    status: "completed",
                    error: "",
                  },
                }
              : item,
          );
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
                      status: "completed",
                      error: "",
                    },
                  }
                : item,
            ),
          );
          resultNodeIds = addOutputImageNodes(node, outputs);
          focusCanvasOnNodes([node.id, ...resultNodeIds]);
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
        status: "completed",
        stage: "completed",
        backendRunState: "finished",
        endedAt,
        result: outputs[0],
        outputs,
        resultCount: outputs.length,
        resultNodeIds,
        saveDurationMs: endedAt - saveStartedAt,
        progress: 100,
        progressLabel: qualityWarning ? `已生成结果，质检提醒：${blockedOutput ? qualityBadgeLabel(blockedOutput) : "请检查后交付"}` : completedTaskLabel(outputs.length, outputs[0]),
        error: undefined,
      });
      if (activeProjectIdRef.current === taskProjectId) {
        setStatus(
          qualityWarning
            ? `${node.data.title} 已生成 ${outputs.length} 张，质检提醒：${blockedOutput ? qualityBadgeLabel(blockedOutput) : "请检查尺寸和白边"}。结果已在画布，不再标为失败。`
            : `${node.data.title} 完成：${outputs.length} 张，耗时 ${formatDuration(endedAt - requestStartedAt)}。画布右侧已生成结果节点。`,
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
          nodesRef.current = nodesRef.current.map((item) =>
            item.id === nodeId
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    output: recovered.outputs[0],
                    outputs: recovered.outputs,
                    resultCount: recovered.outputs.length,
                    status: "completed",
                    error: "",
                  },
                }
              : item,
          );
          setNodes((current) =>
            current.map((item) =>
              item.id === nodeId
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      output: recovered.outputs[0],
                      outputs: recovered.outputs,
                      resultCount: recovered.outputs.length,
                      status: "completed",
                      error: "",
                    },
                  }
                : item,
            ),
          );
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
            progress: 100,
            progressLabel: backendRun.message || taskFailureHint(maskMessage),
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
    }
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

  function buildProductionProtectionContext(operation: string, sourceImages: ImageAsset[] = [], node?: FlowNode, visibleRequestText = "") {
    if (operation === "text_to_image" && !shouldUseProjectPromptContext(visibleRequestText)) {
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
      brandAssets: getCurrentProjectBrandAssets(projectAssets, projectKnowledge),
      visibleRequestText,
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
    const base = shouldUseProjectPromptContext(visibleRequestText) ? buildNodeProjectConstraintText(node, visibleRequestText) : "";
    if (!references.length) return base;
    const strongReferenceMode = shouldUseStrongTextReferenceMode(visibleRequestText);
    return [
      base,
      `带图片参考的文生图：以文字需求为主，连接到“图片参考”入口的图片作为素材参考参与生成；最多读取 ${maxTextReferenceImages} 张。`,
      strongReferenceMode
        ? "用户要求参考画面 / 活动信息 / 内容不变 / 1:1 / 复刻 / 保持版式配色时：第 1 张图片作为主参考，锁定活动主题、核心文案、版式骨架、配色比例、信息区位置和视觉重心；只替换用户明确要求修改的内容。"
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
      "默认先输出 1 张真实自然合成；用户明确要求多方案时再输出广告设计合成方案。",
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

  async function fetchTaskHistoryOutputs(requestId: string, taskProjectId = projectId) {
    if (!requestId || !taskProjectId) return [] as ImageAsset[];
    return fetchTaskHistoryOutputsByRequests([requestId], taskProjectId).then((grouped) => grouped.get(requestId) || []);
  }

  async function fetchTaskHistoryOutputsByRequests(requestIds: string[], taskProjectId = projectId) {
    const uniqueRequestIds = [...new Set(requestIds.map((item) => item.trim()).filter(Boolean))];
    const empty = new Map<string, ImageAsset[]>();
    if (!uniqueRequestIds.length || !taskProjectId) return empty;
    const taskIdToRequestId = new Map(uniqueRequestIds.map((requestId) => [requestId.replace(/^req_/, "task_"), requestId]));
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

  async function appendBrandReferenceAssets(formData: FormData, options: { requireExplicitProjectContext?: boolean; visibleRequestText?: string } = {}) {
    if (options.requireExplicitProjectContext && !shouldUseProjectPromptContext(options.visibleRequestText || "")) return 0;
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
    const requestRatio = resolveRequestedAspectRatio(params.aspectRatio, basePrompt);
    const custom = customSize(params);
    const prompt = enrichPrompt(basePrompt, buildTextToImageConstraintText(node, basePrompt, references.manifest));
    if (!prompt) throw new Error("文生图节点需要填写 prompt。");
    setStatus("AI 正在后台分析需求、参考图和素材，并生成成品图。");
    const shouldAttachProjectContext = shouldUseProjectPromptContext(basePrompt);
    const brandReferences = shouldAttachProjectContext ? resolveBrandReferenceAssets(projectProfile, getCurrentProjectBrandAssets(projectAssets, projectKnowledge)) : [];
    if (brandReferences.length || references.items.length) {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("adType", "通用设计");
      formData.append("aspectRatio", requestRatio);
      formData.append("customWidth", String(custom.width || 0));
      formData.append("customHeight", String(custom.height || 0));
      formData.append("exactSize", String(Boolean(custom.width && custom.height)));
      formData.append("quality", qualityParam(params.quality));
      appendImageModel(formData, node, stringParam(params.model));
      appendTaskTrace(formData, taskId, node, "text_to_image");
      formData.append("referenceManifest", JSON.stringify(references.manifest));
      formData.append("textMode", stringParam(params.textMode) || "ai_text_preview");
      appendTextToImageCompositionSettings(formData, params);
      formData.append("protectionContext", JSON.stringify(buildProductionProtectionContext("text_to_image", references.items.map((item) => item.image), node, basePrompt)));
      await appendTextReferenceImages(formData, references.items);
      await appendBrandReferenceAssets(formData, { requireExplicitProjectContext: true, visibleRequestText: basePrompt });
      const response = await fetch("/api/generate-image", { method: "POST", body: formData, signal });
      return imagesFromResponse(response);
    }
    const response = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ...taskTracePayload(taskId, node, "text_to_image"),
        prompt,
        adType: "通用设计",
        aspectRatio: requestRatio,
        customWidth: custom.width,
        customHeight: custom.height,
        exactSize: Boolean(custom.width && custom.height),
        quality: qualityParam(params.quality),
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
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("keepOriginalRatio", isOutpaint ? "false" : String(Boolean(params.keepOriginalRatio)));
    if (isOutpaint) formData.append("direction", stringParam(params.direction) || "四周");
    formData.append("modeLabel", label);
    appendTaskTrace(formData, taskId, node, isOutpaint ? "outpaint" : "image_to_image");
    appendProtectionContext(formData, isOutpaint ? "outpaint" : "image_to_image", [image], node);
    const response = await fetch("/api/edit-image", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeFuseImages(node: FlowNode, signal?: AbortSignal, taskId?: string) {
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
    appendImageModel(formData, node, stringParam(params.model));
    formData.append("keepOriginalRatio", "false");
    formData.append("modeLabel", "AI改尺寸");
    formData.append("exactSize", "true");
    formData.append("fitMode", fitMode);
    appendTaskTrace(formData, taskId, node, "resize");
    appendProtectionContext(formData, "resize", [image], node);
    const response = await fetch("/api/edit-image", { method: "POST", body: formData, signal });
    return imagesFromResponse(response);
  }

  async function executeMaskEdit(node: FlowNode, signal?: AbortSignal, taskId?: string) {
    const image = resolveInputImage(node.id, "image");
    if (!image) throw new Error("局部 AI 修改节点需要连接一张图片。");
    const params = node.data.params;
    const maskDataUrl = stringParam(params.maskDataUrl);
    const maskImageUrl = stringParam(params.maskImageUrl);
    const prompt = stringParam(params.prompt).trim() || "去掉这里并补全背景";
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
    formData.append("prompt", enrichPrompt(prompt, buildNodeProjectConstraintText(node, prompt)));
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
    if (isLocalGeneratedUrl(image.url)) formData.append("sourceCompareUrl", image.url);
    formData.append("prompt", enrichPrompt(prompt, buildNodeProjectConstraintText(node, prompt)));
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

  function restoreTaskOutputNodes(task: Pick<TaskRecord, "id" | "requestId" | "nodeId" | "nodeName" | "type">, images: ImageAsset[], options: { focus?: boolean } = {}) {
    const outputs = uniqueImagesNotOnCanvas(images);
    if (!outputs.length) return recoverTaskCanvasResult(task).resultNodeIds;
    const sourceNode = task.nodeId ? nodesRef.current.find((item) => item.id === task.nodeId) : null;
    if (sourceNode) {
      const nodeIds = addOutputImageNodes(sourceNode, outputs);
      if (nodeIds.length && options.focus !== false) focusCanvasOnNodes([sourceNode.id, ...nodeIds]);
      return nodeIds;
    }

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
    const candidates = images
      .filter((image) => imageBelongsToProject(image, targetProjectId) && isUserFacingResultImage(image))
      .filter((image) => !imageSourceDismissedForProject(targetProjectId, image))
      .filter((image) => uniqueImagesNotOnCanvas([image]).length > 0)
      .slice(0, 16);
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
    const existingKeys = new Set(
      nodesRef.current
        .flatMap(taskCandidateImagesFromNode)
        .map(imageKey)
        .filter(Boolean),
    );
    const seen = new Set<string>();
    return images.filter((image) => {
      const key = imageKey(image);
      if (!key || seen.has(key) || existingKeys.has(key) || dismissedImageKeysRef.current.has(key)) return false;
      seen.add(key);
      return true;
    });
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
    setStatus(kind === "resize" ? `已按设置创建改尺寸任务：${ratioOptionLabel(resizeRatio)} · ${targetSize}` : `已创建画质增强任务：${targetSize}`);
  }

  function createMaskEditNodeFromHistory(image: ImageAsset, options: HistoryMaskEditOptions) {
    const prompt = options.prompt.trim() || "去掉这里并补全背景";
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
    undismissResultImages([image]);
    const node = addNode("image_input", getViewportCenter(), { ...image, source: "history" });
    setSelectedNodeId(node.id);
    setStatus("已加入画布，可以继续连接改比例、局部修改或4K节点。");
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
    nodesRef.current = nodesRef.current.map((node) =>
      node.id === nodeId
        ? {
            ...node,
            data: { ...node.data, status, error: status === "running" ? "" : node.data.error },
          }
        : node,
    );
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
    return {
      id: projectId,
      name: projectName,
      ownerUserId: projectOwnerUserId || undefined,
      ownerEmail: projectOwnerEmail || undefined,
      ownerName: projectOwnerName || undefined,
      projectKind,
      viewport: getViewport(),
      assets: projectAssets.map(stripImageFile),
      assetText: projectAssetText,
      profile: projectProfile,
      knowledge,
      textProtectionMode,
      nodes: nodeSnapshot.map(sanitizeNode),
      edges: edgeSnapshot,
      runs: sanitizeProjectTasks(taskSnapshot),
      updatedAt: new Date().toISOString(),
    };
  }

  async function refreshProjectList() {
    if (projectListLoadingRef.current) return false;
    projectListLoadingRef.current = true;
    setProjectListLoading(true);
    setProjectListError("");
    try {
      const response = await fetch("/api/project?mode=list");
      const data = (await response.json().catch(() => ({}))) as { activeProjectId?: string; projects?: ProjectSummary[]; error?: string };
      if (!response.ok) throw new Error(data.error || `项目列表刷新失败（HTTP ${response.status}）。`);
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
      if (!response.ok) throw new Error(data.error || `素材库刷新失败（HTTP ${response.status}）。`);
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
      setStatus(data.error || `打开项目失败（HTTP ${response.status}）。`);
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

  async function deleteProject(id: string, ownerUserId?: string) {
    const response = await fetch("/api/project", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ownerUserId }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      const message = data.error || `删除项目失败（HTTP ${response.status}）。`;
      setStatus(message);
      throw new Error(message);
    }
    const data = (await response.json().catch(() => ({}))) as { activeProjectId?: string; projects?: ProjectSummary[] };
    setProjectList(data.projects || []);
    if (id === projectId && data.activeProjectId) await loadProject(data.activeProjectId);
    setStatus("项目已删除。");
  }

  async function deleteHistoryImage(
    image: ImageAsset,
    options: { permanent?: boolean; quiet?: boolean; skipTrashRefresh?: boolean } = {},
  ) {
    const protection = imageDeletionProtection(image, nodes, projectAssets);
    if (!options.permanent && protection.protected) {
      if (!options.quiet) setStatus(`这张图已受保护：${protection.reasons.join("、")}。先取消保护或移除引用后再删除。`);
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
    dismissResultImages([image]);
    setHistoryImages((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
    setImageManagerImages((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
    setProjectAssets((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
    setNodes((current) => current.map((node) => removeImageFromNode(node, fileName)));
    setTasks((current) => {
      const removedTasks: TaskRecord[] = [];
      const next = current.flatMap((task) => {
        const outputs = (task.outputs || []).filter((item) => !imageMatchesGeneratedFile(item, fileName));
        const resultRemoved = task.result ? imageMatchesGeneratedFile(task.result, fileName) : false;
        const nextTask = {
          ...task,
          outputs,
          result: resultRemoved ? outputs[0] : task.result,
          resultCount: outputs.length || (resultRemoved ? 0 : task.resultCount),
          resultNodeIds: task.resultNodeIds?.filter((nodeId) => nodesRef.current.some((node) => node.id === nodeId && !nodeImageReferences(node).some((item) => imageMatchesGeneratedFile(item, fileName)))),
        };
        if ((task.status === "completed" || task.status === "failed" || task.status === "cancelled") && !nextTask.outputs.length && !nextTask.result) {
          removedTasks.push(task);
          return [];
        }
        return [nextTask];
      });
      if (removedTasks.length) dismissTaskRecords(removedTasks);
      tasksRef.current = next;
      return next;
    });
    writeProjectCacheFromRefs();
    setLightboxImage((current) => (imageMatchesGeneratedFile(current, fileName) ? null : current));
    if (permanent) {
      setImageManagerTrashImages((current) => current.filter((item) => !imageMatchesGeneratedFile(item, fileName)));
      if (!options.quiet) setStatus("图片已彻底删除。");
      return true;
    }
    if (!options.skipTrashRefresh) void loadImageManagerTrash(true);
    if (!options.quiet) setStatus("图片已移到回收站，可在图片管理 → 回收站里恢复。");
    return true;
  }

  async function deleteHistoryImagesBatch(images: ImageAsset[], options: { permanent?: boolean } = {}) {
    const uniqueImages = uniqueImagesByKey(images);
    const permanent = Boolean(options.permanent);
    const candidates = uniqueImages.filter((image) => {
      const protection = imageDeletionProtection(image, nodes, projectAssets);
      return permanent ? protection.isTrashed : protection.canDelete && !protection.isTrashed;
    });
    if (!candidates.length) {
      setStatus(permanent ? "没有可彻底删除的回收站图片。" : "没有可批量清理的未保护图片。");
      return;
    }
    let success = 0;
    for (const image of candidates) {
      if (await deleteHistoryImage(image, { permanent, quiet: true, skipTrashRefresh: true })) success += 1;
    }
    const failed = candidates.length - success;
    const skipped = uniqueImages.length - candidates.length;
    if (!permanent) void loadImageManagerTrash(true);
    const summary = batchImageActionSummary({ success, failed, skipped });
    setStatus(permanent ? `已彻底删除 ${summary}。` : `已将 ${summary} 移到回收站。`);
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

  async function restoreHistoryImagesBatch(images: ImageAsset[]) {
    const uniqueImages = uniqueImagesByKey(images);
    const candidates = uniqueImages.filter((image) => imageDeletionProtection(image, nodes, projectAssets).isTrashed);
    if (!candidates.length) {
      setStatus("没有可恢复的回收站图片。");
      return;
    }
    let success = 0;
    for (const image of candidates) {
      if (await restoreHistoryImage(image, { quiet: true, skipReload: true })) success += 1;
    }
    const failed = candidates.length - success;
    const skipped = uniqueImages.length - candidates.length;
    void loadImageManagerHistory(true);
    setStatus(`已从回收站恢复 ${batchImageActionSummary({ success, failed, skipped })}。`);
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
      }).catch(() => {
        setStatus("已创建新版本，但图片版本关系同步失败；刷新后版本链可能不完整。");
      });
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
      <aside
        className={`apple-sidebar z-20 flex shrink-0 flex-col items-center gap-2 px-2 py-4 transition-[width] duration-200 ${
          leftRailOpen ? "w-[118px]" : "w-[60px]"
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
          <AccountSwitcher compact expanded={leftRailOpen} />
        </div>
      </aside>

      {projectPanelOpen ? (
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
              <span className={`apple-pill px-2 py-1 text-[11px] ${imageModelStatus.toneClass}`} title={imageModelStatus.helper}>
                {imageModelStatus.label}
              </span>
              <span className={`apple-pill px-2 py-1 text-[11px] ${projectCapacity.tone === "critical" ? "text-[#ffb4a8]" : projectCapacity.tone === "warning" ? "text-[#ffe2a3]" : ""}`}>
                节点 {nodes.length}
              </span>
              <span className={`apple-pill px-2 py-1 text-[11px] ${projectCapacity.tone === "critical" ? "text-[#ffb4a8]" : projectCapacity.tone === "warning" ? "text-[#ffe2a3]" : ""}`}>
                图片 {projectImageCount}
              </span>
              {lastProjectJsonBytes ? (
                <span className={`apple-pill px-2 py-1 text-[11px] ${lastProjectJsonBytes >= projectCapacityJsonWarningBytes ? "text-[#ffe2a3]" : ""}`} title={`项目 ${formatFileSize(lastProjectJsonBytes)}${lastSaveDurationMs ? ` · 保存 ${formatDuration(lastSaveDurationMs)}` : ""}`}>
                  项目
                </span>
              ) : null}
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
          maxZoom={1.8}
          minZoom={0.18}
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
          onNodeClick={(_, node) => focusNodeParams(node.id)}
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
          {nodes.length ? <Controls aria-label="画布控制" position="bottom-left" showInteractive={false} /> : null}
        </ReactFlow>

        <ChatComposer
          brandSummary={brandAssetSummary}
          brandUsage={projectProfile.brandAssetUsage}
          effectiveModel={effectiveImageModel}
          focusTick={composerFocusTick}
          hasKey={modelInfo.hasKey}
          model={composerModel}
          modelOptions={passedImageModelOptions}
          prompt={composerPrompt}
          quality={composerDisplayQuality}
          ratio={composerDisplayRatio}
          selectedNode={selectedNode}
          onModelChange={changeComposerModel}
          onBrandUsageChange={(usage) => setProjectProfile((current) => ({ ...current, brandAssetUsage: normalizeBrandAssetUsage(usage) }))}
          onImageFile={addComposerImageAsReference}
          onPasteHint={() => setStatus("可以使用系统截图后直接 Command/Ctrl+V 粘贴，或把图片拖到画布里。")}
          onPromptChange={setComposerPrompt}
          onQualityChange={changeComposerQuality}
          onRatioChange={changeComposerRatio}
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
            imageManagerHasMore={imageManagerHasMore}
            imageManagerImages={imageManagerImages}
            imageManagerLoading={imageManagerLoading}
            imageManagerTrashHasMore={imageManagerTrashHasMore}
            imageManagerTrashImages={imageManagerTrashImages}
            imageManagerTrashLoading={imageManagerTrashLoading}
            imageModel={effectiveImageModel}
            nodes={nodes}
            projectAssets={projectAssets}
            projectId={projectId}
            tabHint={rightPanelTabHint}
            tabHintTick={rightPanelTabTick}
            onDeleteHistory={deleteHistoryImage}
            onBatchDeleteHistory={deleteHistoryImagesBatch}
            onBatchPermanentDeleteHistory={(images) => deleteHistoryImagesBatch(images, { permanent: true })}
            onBatchRestoreHistory={restoreHistoryImagesBatch}
            onDragHistory={(event, image) => {
              event.dataTransfer.setData("application/x-ai-history-image", JSON.stringify(stripImageFile(image)));
              event.dataTransfer.effectAllowed = "copy";
            }}
            onResizeHistory={(image) => {
              setLightboxImage(image);
              setStatus("已打开图片，请先确认目标尺寸再创建改尺寸任务。");
            }}
            onUpscaleHistory={(image) => {
              setLightboxImage(image);
              setStatus("已打开图片，可选择 Standard / Plus / Creative，再按原比例输出 2K/4K/8K。");
            }}
            onAddHistoryToCanvas={addHistoryToCanvas}
            onToggleFavorite={toggleHistoryFavorite}
            onEnsureImageManager={ensureImageManagerHistory}
            onLoadMoreImageManager={() => void loadImageManagerHistory(false)}
            onLoadMoreTrash={() => void loadImageManagerTrash(false)}
            onLoadMoreHistory={() => void loadMoreHistory()}
            onPreview={setLightboxImage}
            onRestoreHistory={restoreHistoryImage}
            onPermanentDeleteHistory={(image) => deleteHistoryImage(image, { permanent: true })}
            onClose={() => setRightPanelOpen(false)}
            selectedNode={selectedNode}
            tasks={tasks.map((task) => ({ ...task, resultOnCanvas: hasTaskResultNodesOnCanvas(task) }))}
            onCancelTask={cancelTask}
            onDeleteTask={removeTask}
            onDeleteFinishedTasks={removeFinishedTasks}
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
                          prompt: options.prompt || "去掉这里并补全背景",
                          ...inferSimpleMaskEditIntent(options.prompt || "去掉这里并补全背景", options),
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

function uniqueImageAssets<T extends Pick<ImageAsset, "fileName" | "id" | "url">>(images: T[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = image.fileName || image.id || image.url;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ImageInputNode = memo(function ImageInputNode({ id, data, selected }: NodeProps<FlowNode>) {
  const outputImages = uniqueImageAssets(Array.isArray(data.outputs) ? data.outputs : []);
  const image = data.image || data.output || outputImages[0] || null;
  const metrics = imageNodePreviewMetrics(image);
  const previewFit = textToImagePreviewFit(data.params);
  const showUploadButton = !image;
  const nodeTitle = image ? imageNodeTitle(image, data.title) : data.title;
  const nodeMeta = image ? compactImageMeta(image) : "输入 image";
  const renderLevel = data.nodeRenderLevel || "full";

  if (renderLevel === "mini") {
    return (
      <section className={`apple-node-card rounded-[14px] px-2.5 py-2 text-white ${selected ? "is-input-selected" : ""}`} style={{ width: 132 }}>
        <Handle id="source" position={Position.Left} type="target" className="!size-2.5 !border-white/30 !bg-[#0c0d11]" />
        <Handle id="image" position={Position.Right} type="source" className="!size-2.5 !border-[#74e3c5] !bg-[#74e3c5]" />
        <div className="flex items-center gap-1.5">
          <StatusDot status={data.status || "idle"} />
          <div className="min-w-0 truncate text-[11px] font-semibold text-white/78">{nodeTitle}</div>
        </div>
      </section>
    );
  }

  if (renderLevel === "compact") {
    return (
      <section className={`apple-node-card rounded-[16px] p-2 text-white ${selected ? "is-input-selected" : ""}`} style={{ width: 176 }}>
        <Handle id="source" position={Position.Left} type="target" className="!size-3 !border-white/36 !bg-[#0c0d11]" />
        <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#74e3c5] !bg-[#74e3c5]" />
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-[#74e3c5]">
            <FileImage className="size-3" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-white/84">{nodeTitle}</div>
            <div className="apple-caption mt-0.5 truncate text-[11px]">{nodeMeta}</div>
          </div>
        </div>
      </section>
    );
  }

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
          <div className="apple-caption mt-0.5 truncate text-[11px]">{nodeMeta}</div>
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
        outputImages.length > 1 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {outputImages.slice(0, 2).map((item, index) => (
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
          <span className="apple-caption mt-1 text-[11px]">PNG · JPG · WebP</span>
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
      {outputImages.length > 2 ? (
        <div className="apple-caption mt-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
          还有 {outputImages.length - 2} 张
        </div>
      ) : null}
    </section>
  );
});

const OperationNode = memo(function OperationNode({ id, data, selected }: NodeProps<FlowNode>) {
  const catalog = nodeCatalog.find((item) => item.type === data.kind);
  const inputs = inputHandlesByKind[data.kind] || [];
  const output = data.output || null;
  const outputs = uniqueImageAssets(Array.isArray(data.outputs) ? data.outputs : output ? [output] : []);
  const isTerminalOutput = data.kind === "output";
  const previewFit = data.kind === "text_to_image" ? textToImagePreviewFit(data.params) : "contain";
  const singleOutput = output && outputs.length === 1 ? output : null;
  const hasVisualOutput = Boolean(singleOutput || outputs.length > 1);
  const textReferences = data.kind === "text_to_image" ? textReferenceNodeItems(data) : [];
  const maskBadge = data.kind === "mask_edit" ? maskEditBadge(data) : null;
  const contentShellClass = hasVisualOutput || data.kind === "mask_edit"
    ? "apple-node-well space-y-1 rounded-[14px] p-1.5"
    : "space-y-1 rounded-[12px] border border-white/[0.055] bg-white/[0.025] px-2 py-1.5";
  const renderLevel = data.nodeRenderLevel || "full";

  if (renderLevel === "mini") {
    return (
      <section
        className={`apple-node-card relative rounded-[14px] px-2.5 py-2 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
        style={{ width: 142 }}
      >
        {inputs.map((input, index) => (
          <Handle key={input.id} id={input.id} position={Position.Left} type="target" className="!size-2.5 !border-white/30 !bg-[#0c0d11]" style={{ top: 18 + index * 14 }} />
        ))}
        {!isTerminalOutput ? (
          <Handle id="image" position={Position.Right} type="source" className="!size-2.5 !border-[#8fa7ff] !bg-[#8fa7ff]" />
        ) : null}
        <div className="flex items-center gap-1.5">
          <StatusDot status={data.status || "idle"} />
          <div className="min-w-0 truncate text-[11px] font-semibold text-white/80">{data.title}</div>
        </div>
      </section>
    );
  }

  if (renderLevel === "compact") {
    return (
      <section
        className={`apple-node-card relative rounded-[16px] p-2 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
        style={{ width: 196 }}
      >
        {inputs.map((input, index) => (
          <Handle key={input.id} id={input.id} position={Position.Left} type="target" className="!size-3 !border-white/36 !bg-[#0c0d11]" style={{ top: 24 + index * 18 }} />
        ))}
        {!isTerminalOutput ? (
          <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#8fa7ff] !bg-[#8fa7ff]" />
        ) : null}
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-[#c8d4ff]">
            {catalog?.icon || <Layers className="size-3" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[10.5px] font-semibold text-white/84">{data.title}</h3>
              <StatusDot status={data.status || "idle"} />
            </div>
            <div className="apple-caption mt-0.5 truncate text-[11px]">
              {outputs.length ? `${outputs.length} 个结果` : taskStatusLabel(data.status || "idle")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`apple-node-card group relative rounded-[18px] p-2 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
      style={{ width: operationNodeWidth(data, outputs) }}
    >
      {inputs.map((input, index) => (
        <div key={input.id} className="absolute left-[-36px] flex items-center gap-1.5 text-[11px] text-white/40" style={{ top: 48 + index * 24 }}>
          <span>{input.label}</span>
          <Handle id={input.id} position={Position.Left} type="target" className="!static !size-3 !translate-x-0 !translate-y-0 !border-white/40 !bg-[#0c0d11]" />
        </div>
      ))}
      {!isTerminalOutput ? (
        <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#8fa7ff] !bg-[#8fa7ff]" />
      ) : null}
      <div className="mb-1.5 flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#c8d4ff]">
          {catalog?.icon || <Layers className="size-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[11px] font-semibold text-white/88">{data.title}</h3>
            <StatusDot status={data.status || "idle"} />
            <span className="apple-caption shrink-0 text-[11px]">{taskStatusLabel(data.status || "idle")}</span>
          </div>
          <p className="apple-caption mt-0.5 line-clamp-1 text-[11px] leading-5">{operationNodeSubtitle(data, catalog?.description, textReferences.length)}</p>
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
              局部 AI 修改
            </button>
            <div className="apple-caption leading-5">
              涂哪里，改哪里；未涂抹区域强制保持原图不变。
            </div>
            {maskBadge ? (
              <div className={maskBadge.valid ? "apple-pill-accent rounded-xl px-2 py-1.5 text-[11px]" : "rounded-xl border border-[#ffd166]/18 bg-[#ffd166]/10 px-2 py-1.5 text-[11px] text-[#ffe1a3]"}>
                {maskBadge.label}
              </div>
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
        {data.error ? <NodeErrorNotice compact error={String(data.error)} /> : null}
      </div>

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
  replace_product: OperationNode,
  mask_edit: OperationNode,
  hd_redraw: OperationNode,
  upscale_4k: OperationNode,
  reference_remake: OperationNode,
  design_optimize: OperationNode,
  png_layers: OperationNode,
  output: OperationNode,
};

function ChatComposer({
  brandSummary,
  brandUsage,
  effectiveModel,
  focusTick,
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
  focusTick: number;
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
      {
        label: modelOptions.length ? "Auto · 推荐" : hasKey ? "Auto · 待测试" : "Auto · 未配置",
        description: modelOptions.length
          ? `自动使用 ${preferredAutoImageModelId(modelOptions, effectiveModel) || "可用图片模型"}，优先 gpt-image-2 画质`
          : hasKey ? "到 API 设置页测试图片模型后显示" : "先在 API 设置页配置 Key",
        value: "",
      },
      ...modelOptions.map((item) => ({
        label: item.label || item.id,
        description: imageModelProductHint(item),
        value: item.id,
      })),
    ],
    [effectiveModel, hasKey, modelOptions],
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
  const canSubmit = Boolean(effectiveModel) && (selectedPromptNode ? canSubmitComposerForNode(selectedPromptNode, displayPrompt) : Boolean(prompt.trim()));
  const anyMenuOpen = uploadMenuOpen || modelMenuOpen || ratioMenuOpen || qualityMenuOpen || brandMenuOpen;
  const apiSetupMessage = !hasKey
    ? "还没有配置 API Key，配置后才能生成图片。"
    : !effectiveModel
      ? "Key 已配置，但还没有通过测试的图片模型。"
      : "";

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

  useEffect(() => {
    const input = textareaRef.current;
    if (!input) return;
    const timer = window.setTimeout(() => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [focusTick]);

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
          </div>
          <textarea
            ref={textareaRef}
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
          {apiSetupMessage ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-5 text-[#ffe1a0]">
              <span>{apiSetupMessage}</span>
              <Link className="rounded-full border border-[#ffe1a0]/24 bg-[#ffe1a0]/10 px-2 py-0.5 font-semibold text-[#ffe1a0] hover:bg-[#ffe1a0]/16" href="/settings">
                去设置
              </Link>
            </div>
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
                    <span className="apple-menu-meta mt-0.5 block">自动生成图片节点</span>
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
              <div className="apple-menu absolute bottom-12 left-0 w-[214px] overflow-hidden p-2">
                {ratios.map((item) => (
                  <button
                    className={`flex w-full items-center justify-between gap-2 rounded-[16px] px-3 py-2 text-left text-[13px] font-semibold transition ${
                      ratio === item ? "bg-white text-[#07121f]" : "text-white/66 hover:bg-white/[0.08] hover:text-white/82"
                    }`}
                    key={item}
                    onClick={() => {
                      onRatioChange(item);
                      setRatioMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <RatioGlyph ratio={item} selected={ratio === item} />
                      <span className="truncate">{ratioOptionLabel(item)}</span>
                    </span>
                    {ratio === item ? <Check className="size-4 shrink-0 text-[#07121f]/72" /> : null}
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
              title="切换图片模型"
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
                  <label className="apple-field-label block">自定义图片模型</label>
                  <input
                    className="apple-input mt-1 h-9 w-full px-3 text-[12px] outline-none"
                    onChange={(event) => onModelChange(event.target.value)}
                    placeholder="图片模型名"
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
                    <span className="apple-pill px-2 py-1 text-[11px]">色卡 {brandSummary.colorCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">Logo {brandSummary.logoCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">IP {brandSummary.ipCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">码 {brandSummary.qrCount}</span>
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
                          <span className="apple-menu-meta mt-0.5 block truncate text-[11px]">{item.description}</span>
                        </span>
                      </span>
                      <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${brandUsage[item.key] ? "bg-[#74e3c5]" : "bg-white/12"}`}>
                        <span className={`block size-4 rounded-full bg-white transition ${brandUsage[item.key] ? "translate-x-4" : ""}`} />
                      </span>
                    </button>
                  ))}
                </div>
                {brandSummary.missing.length ? (
                  <div className="mt-2 rounded-[14px] border border-[#ffe1a0]/14 bg-[#ffe1a0]/8 px-3 py-2 text-[11px] leading-5 text-[#ffe1a0]/82">
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
  imageManagerHasMore,
  imageManagerImages,
  imageManagerLoading,
  imageManagerTrashHasMore,
  imageManagerTrashImages,
  imageManagerTrashLoading,
  imageModel,
  nodes,
  projectAssets,
  projectId,
  tabHint,
  tabHintTick,
  onDeleteHistory,
  onBatchDeleteHistory,
  onBatchPermanentDeleteHistory,
  onBatchRestoreHistory,
  onAddHistoryToCanvas,
  onToggleFavorite,
  onEnsureImageManager,
  onLoadMoreImageManager,
  onLoadMoreTrash,
  onLoadMoreHistory,
  onDragHistory,
  onResizeHistory,
  onUpscaleHistory,
  onPreview,
  onRestoreHistory,
  onPermanentDeleteHistory,
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
  imageManagerHasMore: boolean;
  imageManagerImages: ImageAsset[];
  imageManagerLoading: boolean;
  imageManagerTrashHasMore: boolean;
  imageManagerTrashImages: ImageAsset[];
  imageManagerTrashLoading: boolean;
  imageModel: string;
  nodes: FlowNode[];
  projectAssets: ImageAsset[];
  projectId: string;
  tabHint: RightPanelTab;
  tabHintTick: number;
  onDeleteHistory: (image: ImageAsset) => void | Promise<unknown>;
  onBatchDeleteHistory: (images: ImageAsset[]) => void | Promise<unknown>;
  onBatchPermanentDeleteHistory: (images: ImageAsset[]) => void | Promise<unknown>;
  onBatchRestoreHistory: (images: ImageAsset[]) => void | Promise<unknown>;
  onAddHistoryToCanvas: (image: ImageAsset) => void;
  onToggleFavorite: (image: ImageAsset) => void | Promise<unknown>;
  onEnsureImageManager: () => void;
  onLoadMoreImageManager: () => void;
  onLoadMoreTrash: () => void;
  onLoadMoreHistory: () => void;
  onDragHistory: (event: DragEvent<HTMLElement>, image: ImageAsset) => void;
  onResizeHistory: (image: ImageAsset) => void;
  onUpscaleHistory: (image: ImageAsset) => void;
  onPreview: (image: ImageAsset) => void;
  onRestoreHistory: (image: ImageAsset) => void | Promise<unknown>;
  onPermanentDeleteHistory: (image: ImageAsset) => void | Promise<unknown>;
  onClose: () => void;
  selectedNode: FlowNode | null;
  tasks: TaskRecord[];
  onCancelTask: (taskId: string) => void | Promise<unknown>;
  onDeleteTask: (taskId: string) => void | Promise<unknown>;
  onDeleteFinishedTasks: (taskIds?: string[]) => void | Promise<unknown>;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRetryTask: (taskId: string) => void | Promise<unknown>;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onRunNode: (nodeId: string) => void;
}) {
  const rawSelectedOutputs = useMemo(
    () => selectedNode?.data.outputs || (selectedNode?.data.output ? [selectedNode.data.output] : []),
    [selectedNode],
  );
  const selectedOutputs = useMemo(() => sortResultImagesForDisplay(rawSelectedOutputs).filter(isUserFacingResultImage), [rawSelectedOutputs]);
  const visibleHistoryImages = useMemo(() => historyImages.filter((image) => imageBelongsToProject(image, projectId)).filter(isUserFacingResultImage), [historyImages, projectId]);
  const imageManagerVisibleImages = useMemo(
    () => (imageManagerImages.length ? imageManagerImages : historyImages).filter(isUserFacingResultImage),
    [historyImages, imageManagerImages],
  );
  const [tab, setTab] = useState<RightPanelTab>("tasks");
  const selectedPanelNodeId = selectedNode?.id;
  const taskCounts = useMemo(() => ({
    running: tasks.filter(isTaskActivelyRunning).length,
    deferred: tasks.filter(isDeferredQueuedTask).length,
    failed: tasks.filter((task) => task.status === "failed" && !taskHasResultImages(task) && !task.resultCount).length,
  }), [tasks]);
  const runningTaskCount = taskCounts.running;
  const deferredTaskCount = taskCounts.deferred;
  const failedTaskCount = taskCounts.failed;
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

  useEffect(() => {
    if (tab === "images") onEnsureImageManager();
  }, [onEnsureImageManager, tab]);

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
        <div className="apple-panel grid grid-cols-4 gap-1 p-0.5">
          {[
            ["params", "参数"],
            ["tasks", "任务"],
            ["library", "结果"],
            ["images", "图片管理"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`apple-segment flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] ${tab === value ? "apple-segment-active" : ""}`}
              onClick={() => setTab(value as RightPanelTab)}
              type="button"
            >
              <span>{label}</span>
              {value === "tasks" && taskBadgeCount ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${tab === value ? "bg-black/10 text-[#07121f]/70" : failedTaskCount ? "bg-[#ff6b5f]/18 text-[#ffb4a8]" : runningTaskCount ? "bg-[#ffd166]/18 text-[#ffe1a0]" : "bg-white/12 text-white/58"}`}>
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
            <NodeInspectorPanel imageModel={imageModel} node={selectedNode} onCreateAction={onCreateAction} onMaskEdit={onMaskEdit} onParamChange={onParamChange} onRunNode={onRunNode} />
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <TaskCenter
            emptyState={
              <EmptyPanel
                icon={<Sparkles className="size-8" />}
                title="暂无任务"
                description="运行节点后会在这里显示进度、失败原因、重试入口和生成耗时。"
              />
            }
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
                compactThumbStyle={compactThumbStyle}
                imageSourceSummary={imageSourceSummary}
                images={selectedOutputs}
                nodeOperationLabel={nodeOperationLabel}
                onPreview={onPreview}
                shouldShowCheckerboard={shouldShowCheckerboard}
              />
            ) : null}
            <HistoryPanel
              emptyState={
                <EmptyPanel
                  icon={<FileImage className="size-8" />}
                  title="暂无结果"
                  description="生成或导入图片后会显示交付状态、质检提示和可继续优化的结果。"
                />
              }
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
              onLoadMore={onLoadMoreHistory}
              onDelete={(image) => onDeleteHistory(image as ImageAsset)}
              onPreview={(image) => onPreview(image as ImageAsset)}
              onResize={(image) => onResizeHistory(image as ImageAsset)}
              onToggleFavorite={(image) => onToggleFavorite(image as ImageAsset)}
              onUpscale={(image) => onUpscaleHistory(image as ImageAsset)}
              qualityBadgeLabel={(image) => qualityBadgeLabel(image as ImageAsset)}
              qualityTone={(image) => qualityTone(image as ImageAsset)}
            />
          </div>
        </div>
      ) : null}

      {tab === "images" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ImageManagerPanel
            downloadRemoteFile={downloadRemoteFile}
            formatFileSize={formatFileSize}
            formatGeneratedAt={formatGeneratedAt}
            images={imageManagerVisibleImages}
            historyHasMore={imageManagerHasMore || (!imageManagerImages.length && historyHasMore)}
            historyLoadingMore={imageManagerLoading || historyLoadingMore}
            imageDeletionProtection={imageDeletionProtection}
            imageSizeLabel={imageSizeLabel}
            imageSourceSummary={imageSourceSummary}
            mergeImages={mergeImages}
            nodeOperationLabel={nodeOperationLabel}
            nodes={nodes}
            projectAssets={projectAssets}
            shouldShowCheckerboard={shouldShowCheckerboard}
            trashHasMore={imageManagerTrashHasMore}
            trashImages={imageManagerTrashImages}
            trashLoadingMore={imageManagerTrashLoading}
            onAddToCanvas={onAddHistoryToCanvas}
            onBatchDelete={onBatchDeleteHistory}
            onBatchPermanentDelete={onBatchPermanentDeleteHistory}
            onBatchRestore={onBatchRestoreHistory}
            onDelete={onDeleteHistory}
            onLoadMore={imageManagerImages.length ? onLoadMoreImageManager : onLoadMoreHistory}
            onLoadMoreTrash={onLoadMoreTrash}
            onPermanentDelete={onPermanentDeleteHistory}
            onPreview={onPreview}
            onRestore={onRestoreHistory}
            onToggleFavorite={onToggleFavorite}
          />
        </div>
      ) : null}
    </div>
  );
}

function NodeInspectorPanel({
  imageModel,
  node,
  onCreateAction,
  onMaskEdit,
  onParamChange,
  onRunNode,
}: {
  imageModel: string;
  node: FlowNode | null;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRunNode: (nodeId: string) => void;
}) {
  const [activeInspectorAction, setActiveInspectorAction] = useState("");

  function runInspectorAction(label: string, action: () => void) {
    if (activeInspectorAction) return;
    setActiveInspectorAction(label);
    action();
    window.setTimeout(() => setActiveInspectorAction(""), 700);
  }

  if (!node) {
    return (
      <EmptyPanel
        icon={<Layers className="size-8" />}
        title="未选择节点"
        description="点选画布节点可编辑参数；也可以从左侧添加节点或在底部输入需求开始。"
      />
    );
  }

  const params = node.data.params || {};
  const isRunning = node.data.status === "running" || node.data.status === "queued" || node.data.status === "saving";
  const hasModel = "model" in params || node.data.kind !== "image_input";
  const hasPrompt = ["text_to_image", "image_to_image", "fuse_images", "outpaint", "resize", "replace_product", "mask_edit", "hd_redraw", "reference_remake", "design_optimize"].includes(node.data.kind);
  const promptLivesInComposer = hasPrompt && isComposerDrivenNode(node.data.kind);
  const modelLivesInComposer = hasModel && isComposerDrivenNode(node.data.kind);
  const textReferenceItems = node.data.kind === "text_to_image" ? textReferenceNodeItems(node.data) : [];
  const nodeId = node.id;
  const qualityEnhanceImage = (node.data.image || node.data.output || null) as ImageAsset | null;
  const qualityEnhanceTargets = qualityEnhanceTargetOptionsForImage(qualityEnhanceImage, stringParam(params.model) || imageModel);
  const qualityEnhanceQualityOptions = qualityEnhanceQualityOptionsForTargets(qualityEnhanceTargets);
  const qualityEnhanceQuality = qualityEnhanceQualityOptions.includes(qualityParam(params.quality))
    ? qualityParam(params.quality)
    : qualityForQualityEnhanceTarget(qualityEnhanceTargets[0] || "");

  function updateTextReference(index: number, patch: Partial<TextReferenceConfig>) {
    const current = normalizeTextReferenceConfigs(params.referenceConfigs);
    const next = textReferenceItems.map((item, itemIndex) => {
      const existing = current[itemIndex] || current.find((config) => config.handle === item.handle) || defaultTextReferenceConfig(item.handle, itemIndex, item.image);
      return {
        handle: item.handle,
        role: itemIndex === index && patch.role ? patch.role : existing.role,
        weight: itemIndex === index && patch.weight ? patch.weight : existing.weight,
      };
    });
    onParamChange(nodeId, "referenceConfigs", next);
  }

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
        {node.data.error ? <NodeErrorNotice className="mt-3" error={String(node.data.error)} /> : null}
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
          label="图片模型"
          onChange={(value) => onParamChange(node.id, "model", value)}
          placeholder="默认图片模型"
          value={stringParam(params.model)}
        />
      ) : null}

      {node.data.kind === "image_input" ? (
        <SmartRecommendations node={node} onCreateAction={onCreateAction} />
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <InspectorSection title="生成设置">
          <RatioPresetGrid label="比例" value={ratioParam(params.aspectRatio)} options={adaptiveRatioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          <InlineChipRow label="完整" value={textToImageCompositionCompleteness(params)} options={["标准", "更完整", "大留白", "全身/全物体"]} onChange={(value) => onParamChange(node.id, "compositionCompleteness", value)} />
          <InlineChipRow label="边距" value={textToImageSafeMargin(params)} options={["5%", "10%", "15%", "20%"]} onChange={(value) => onParamChange(node.id, "safeMargin", value)} />
          <InlineChipRow label="镜头" value={textToImageCameraDistance(params)} options={["近景", "中景", "远景", "自动"]} onChange={(value) => onParamChange(node.id, "cameraDistance", value)} />
          <InlineChipRow label="主体" value={textToImageSubjectScale(params)} options={["大", "中", "小"]} onChange={(value) => onParamChange(node.id, "subjectScale", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <TextReferenceInspector
          items={textReferenceItems}
          onChange={updateTextReference}
        />
      ) : null}

      {node.data.kind === "image_to_image" || node.data.kind === "fuse_images" ? (
        <InspectorSection title="图像生成">
          {node.data.kind === "fuse_images" ? (
            <InlineChipRow
              label="合成"
              value={stringParam(params.fusionMode) || "主体入景"}
              options={["主体入景", "产品入景", "人物换装", "产品换Logo", "IP入海报", "自定义合成"]}
              onChange={(value) => onParamChange(node.id, "fusionMode", value)}
            />
          ) : (
            <RatioPresetGrid label="比例" value={ratioParam(params.aspectRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          )}
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "outpaint" ? (
        <InspectorSection title="扩图参数">
          <RatioPresetGrid label="扩到" value={ratioParam(params.targetRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "targetRatio", value)} />
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

      {node.data.kind === "upscale_4k" || node.data.kind === "hd_redraw" ? (
        <InspectorSection title="画质增强">
          {node.data.kind === "upscale_4k" ? (
            <>
              <InlineChipRow
                label="模式"
                value={resizeFitModeLabel(stringParam(params.fitMode))}
                options={["Standard", "Plus", "Creative"]}
                onChange={(value) => onParamChange(node.id, "fitMode", resizeFitModeValue(value))}
              />
              <InlineChipRow
                label="目标"
                value={upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}
                options={qualityEnhanceTargets}
                onChange={(value) => {
                  onParamChange(node.id, "targetSize", value);
                  onParamChange(node.id, "quality", qualityForQualityEnhanceTarget(value));
                }}
              />
              <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
            </>
          ) : null}
          {node.data.kind === "hd_redraw" ? (
            <>
              <InlineChipRow
                label="模式"
                value={qualityEnhanceModeLabel(qualityEnhanceModeParam(params.enhancementMode))}
                options={["Standard", "Plus", "Creative"]}
                onChange={(value) => onParamChange(node.id, "enhancementMode", qualityEnhanceModeValue(value))}
              />
              <InlineChipRow
                label="目标"
                value={upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}
                options={qualityEnhanceTargets}
                onChange={(value) => {
                  onParamChange(node.id, "targetSize", value);
                  onParamChange(node.id, "quality", qualityForQualityEnhanceTarget(value));
                }}
              />
              <InlineChipRow
                label="质量"
                value={qualityEnhanceQuality}
                options={qualityEnhanceQualityOptions}
                onChange={(value) => {
                  onParamChange(node.id, "quality", value);
                  onParamChange(node.id, "targetSize", qualityEnhanceTargetForQuality(qualityEnhanceTargets, qualityParam(value)));
                }}
              />
              <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
            </>
          ) : (
            <InlineChipRow label="质量" value={qualityParam(params.quality)} options={qualityEnhanceQualityOptions} onChange={(value) => onParamChange(node.id, "quality", value)} />
          )}
        </InspectorSection>
      ) : null}

      {node.data.kind === "mask_edit" ? (
        <InspectorSection title="局部 AI 修改">
          <button
            className="apple-button-primary flex h-9 w-full items-center justify-center gap-1.5 text-[11px] font-semibold transition disabled:opacity-45"
            disabled={Boolean(activeInspectorAction)}
            onClick={() => runInspectorAction("打开涂抹修改", () => onMaskEdit(node.id))}
            type="button"
          >
            <Brush className="size-3.5" />
            {activeInspectorAction === "打开涂抹修改" ? "打开中" : "打开涂抹修改"}
          </button>
        </InspectorSection>
      ) : null}

      {node.data.kind === "reference_remake" ? (
        <InspectorSection title="参考图重制">
          <InlineChipRow
            label="模式"
            value={referenceRemakeModeLabel(referenceRemakeModeParam(params.mode))}
            options={["快速复刻", "精准重制"]}
            onChange={(value) => onParamChange(node.id, "mode", referenceRemakeModeValue(value))}
          />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "design_optimize" ? (
        <InspectorSection title="设计优化">
          <InlineChipRow
            label="强度"
            value={designOptimizationStrengthLabel(designOptimizationStrengthParam(params.strength))}
            options={["保守优化", "专业优化", "大幅优化"]}
            onChange={(value) => onParamChange(node.id, "strength", designOptimizationStrengthValue(value))}
          />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          <InlineChipRow
            label="对比"
            value={designComparisonModeLabel(designComparisonModeParam(params.comparisonMode))}
            options={["自动对比", "左右对比", "上下对比", "单独成品"]}
            onChange={(value) => onParamChange(node.id, "comparisonMode", designComparisonModeValue(value))}
          />
          <InspectorInput label="行业" placeholder="自动识别，可手动填医疗健康/美妆/餐饮等" value={stringParam(params.industry)} onChange={(value) => onParamChange(node.id, "industry", value)} />
          <InspectorInput label="类型" placeholder="自动识别，可手动填海报/横幅/专家介绍等" value={stringParam(params.designType)} onChange={(value) => onParamChange(node.id, "designType", value)} />
          <InspectorInput label="场景" placeholder="自动识别，可手动填线上传播/线下投放等" value={stringParam(params.scene)} onChange={(value) => onParamChange(node.id, "scene", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "png_layers" ? (
        <InspectorSection title="PNG 三层">
          <InlineChipRow
            label="模式"
            value={pngLayerExportModeLabel(pngLayerExportModeParam(params.mode))}
            options={["AI三层精准", "快速三层"]}
            onChange={(value) => onParamChange(node.id, "mode", value === "快速三层" ? "fast" : "ai_precise")}
          />
        </InspectorSection>
      ) : null}

      {node.data.kind === "output" ? (
        <InspectorSection title="输出">
          <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind !== "image_input" && !isComposerDrivenNode(node.data.kind) ? (
        <button
          className="apple-button-primary flex h-10 w-full items-center justify-center gap-1.5 text-[12px] font-semibold transition disabled:opacity-45"
          disabled={isRunning || Boolean(activeInspectorAction)}
          onClick={() => runInspectorAction("运行节点", () => onRunNode(node.id))}
          type="button"
        >
          {isRunning || activeInspectorAction === "运行节点" ? <RefreshCcw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {activeInspectorAction === "运行节点" ? "启动中" : "运行"}
        </button>
      ) : node.data.kind !== "image_input" ? (
        <div className="rounded-[14px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/44">
          在底部输入框写需求，按 Enter 或点“运行”执行当前节点。
        </div>
      ) : null}
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
  const [activeRecommendation, setActiveRecommendation] = useState("");
  const image = node.data.output || node.data.image || null;
  const recommendations = buildImageRecommendations(image as ImageAsset | null);

  function createRecommendedAction(item: ReturnType<typeof buildImageRecommendations>[number]) {
    const key = `${item.type}-${item.label}`;
    if (activeRecommendation) return;
    setActiveRecommendation(key);
    onCreateAction(node.id, item.type, item.handle, item.params);
    window.setTimeout(() => setActiveRecommendation(""), 700);
  }

  return (
    <InspectorSection title="智能推荐">
      <div className="space-y-2">
        {recommendations.map((item) => (
          <button
            className="apple-panel flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.08] disabled:opacity-45"
            disabled={Boolean(activeRecommendation)}
            key={`${item.type}-${item.label}`}
            onClick={() => createRecommendedAction(item)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-white/76">{activeRecommendation === `${item.type}-${item.label}` ? "创建中" : item.label}</span>
              <span className="apple-caption mt-1 block truncate">{item.reason}</span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-white/28" />
          </button>
        ))}
      </div>
    </InspectorSection>
  );
}

function TextReferenceInspector({
  items,
  onChange,
}: {
  items: Array<{ handle: string; label: string; role: TextReferenceRole; weight: TextReferenceWeight; image: ImageAsset }>;
  onChange: (index: number, patch: Partial<TextReferenceConfig>) => void;
}) {
  if (!items.length) {
    return (
      <InspectorSection title="图片参考">
        <div className="rounded-[16px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/44">
          可把画布图片连到“图片参考”，最多 5 张；用于结构、风格、主体、产品或 Logo。
        </div>
      </InspectorSection>
    );
  }

  return (
    <InspectorSection title={`图片参考 ${items.length}/${maxTextReferenceImages}`}>
      <div className="rounded-[16px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[11px] leading-5 text-[#adf8e5]">
        第 1 张可做主参考；想 1:1 复刻就在需求里写“保持版式/配色/轻微修改”。
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-2 rounded-[16px] border border-white/10 bg-white/[0.035] p-2" key={`${item.handle}-${index}`}>
            <ImageFrame alt={item.label} className="rounded-[12px]" fit="cover" image={item.image} preserveRatio={false} variant="thumbnail" style={{ height: 46, width: 46 }} />
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-white/70">参考 {index + 1}</span>
                <span className="truncate text-[11px] text-white/38">{textReferenceRoleDescription(item.role)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-1.5">
                <select
                  className="apple-input h-8 min-w-0 rounded-[12px] px-2 text-[11px] text-white/70"
                  onChange={(event) => onChange(index, { role: normalizeTextReferenceRole(event.target.value, item.role) })}
                  title="参考图用途"
                  value={item.role}
                >
                  {textReferenceRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  className="apple-input h-8 rounded-[12px] px-2 text-[11px] text-white/70"
                  onChange={(event) => onChange(index, { weight: normalizeTextReferenceWeight(event.target.value, item.weight) })}
                  title="参考强度"
                  value={item.weight}
                >
                  {textReferenceWeightOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
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
  const [activeSelection, setActiveSelection] = useState<NodeKind | "">("");

  function selectNode(type: NodeKind) {
    if (activeSelection) return;
    setActiveSelection(type);
    onSelect(type);
  }

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
        {nodeCatalog.filter((item) => !item.hiddenFromAddMenu).map((item) => (
          <button
            className="apple-menu-item flex w-full items-center gap-3 px-2.5 py-2.5 text-left disabled:opacity-45"
            disabled={Boolean(activeSelection)}
            key={item.type}
            onClick={() => selectNode(item.type)}
            type="button"
          >
            <span className="apple-button flex size-8 items-center justify-center rounded-xl text-white/72">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-white/82">{activeSelection === item.type ? "创建中" : item.label}</span>
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
  const [activeQuickAction, setActiveQuickAction] = useState("");

  function selectQuickAction(action: (typeof quickActions)[number]) {
    const key = `${action.type}:${action.handle}`;
    if (activeQuickAction) return;
    setActiveQuickAction(key);
    onSelect(action);
  }

  function deleteFromMenu() {
    if (activeQuickAction) return;
    setActiveQuickAction("delete");
    onDelete();
  }

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
        <button
          className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-white/72 disabled:opacity-45"
          disabled={Boolean(activeQuickAction)}
          key={`${action.type}-${action.handle}`}
          onClick={() => selectQuickAction(action)}
          type="button"
        >
          {activeQuickAction === `${action.type}:${action.handle}` ? "创建中" : action.label}
          <ChevronRight className="size-3.5 text-white/28" />
        </button>
      ))}
      <div className="my-1 border-t border-white/10" />
      <button className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-[#ffb4a8] hover:bg-[#ff6b5f]/10 disabled:opacity-45" disabled={Boolean(activeQuickAction)} onClick={deleteFromMenu} type="button">
        {activeQuickAction === "delete" ? "删除中" : "删除节点"}
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function PngLayerResultSection({
  activeFilename,
  onDownloadLayer,
  onPreviewLayer,
  onShowComposite,
  result,
}: {
  activeFilename: string;
  onDownloadLayer: (layer: PngLayerExportLayer) => void | Promise<void>;
  onPreviewLayer: (layer: PngLayerExportLayer) => void;
  onShowComposite: () => void;
  result: PngLayerExportResult;
}) {
  const layers = [...result.layers].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <section className="apple-surface-section p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="apple-section-title">PNG 三层结果</div>
          <div className="apple-caption mt-1">{result.canvasWidth} × {result.canvasHeight}px · 按需单独下载</div>
        </div>
        <button
          className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${!activeFilename ? "border-[#74e3c5]/36 text-[#adf8e5]" : ""}`}
          onClick={onShowComposite}
          type="button"
        >
          成品图
        </button>
      </div>
      <div className="space-y-2">
        {layers.map((layer) => (
          <div
            className={`rounded-[16px] border p-2 transition ${activeFilename === layer.filename ? "border-[#74e3c5]/42 bg-[#74e3c5]/10" : "border-white/10 bg-white/[0.035]"}`}
            key={layer.filename}
          >
            <button
              className="grid w-full grid-cols-[74px_minmax(0,1fr)] gap-2 text-left"
              onClick={() => onPreviewLayer(layer)}
              type="button"
            >
              <ImageFrame
                alt={layer.name || layer.filename}
                className="rounded-[12px]"
                fit="contain"
                image={pngLayerPreviewImage(layer)}
                preserveRatio={false}
                showCheckerboard
                variant="thumbnail"
                style={{ height: 82, width: 74 }}
              />
              <div className="min-w-0 py-1">
                <div className="truncate text-[11px] font-semibold text-white/82">{pngLayerDisplayName(layer)}</div>
                <div className="mt-1 truncate text-[11px] text-white/42">{layer.filename}</div>
                <div className="mt-1 text-[11px] text-white/46">
                  透明 {Math.round(layer.transparentPixelRatio * 100)}% · {formatFileSize(layer.fileSizeBytes)}
                </div>
              </div>
            </button>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button className="apple-button px-2 py-1.5 text-[11px]" onClick={() => onPreviewLayer(layer)} type="button">
                预览
              </button>
              <button className="apple-button-primary flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold" onClick={() => void onDownloadLayer(layer)} type="button">
                <ArrowDownToLine className="size-3" />
                下载
              </button>
            </div>
          </div>
        ))}
      </div>
      {result.warnings?.length ? (
        <div className="mt-2 rounded-[12px] border border-[#f5c66a]/24 bg-[#f5c66a]/10 p-2 text-[11px] leading-5 text-[#ffe2a3]">
          {result.warnings.slice(0, 2).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ImageLightbox({
  image,
  imageModel,
  historyImages,
  onClose,
  onCopyImage,
  onCopyPrompt,
  onDelete,
  onEditImage,
  onMaskEdit,
  onKeep,
  onOpenVersion,
  onResize,
  onUpscale,
}: {
  image: ImageAsset;
  imageModel: string;
  historyImages: ImageAsset[];
  onClose: () => void;
  onCopyImage: (image: ImageAsset) => Promise<void>;
  onCopyPrompt: (prompt: string) => Promise<void>;
  onDelete: () => void;
  onEditImage: (prompt?: string) => void;
  onMaskEdit: (options: HistoryMaskEditOptions) => void;
  onKeep: () => void;
  onOpenVersion: (image: ImageAsset) => void;
  onResize: (options: HistoryResizeOptions) => void;
  onUpscale: (options: HistoryUpscaleOptions) => void;
}) {
  const [message, setMessage] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"actions" | "info">("actions");
  const [activeEditTool, setActiveEditTool] = useState<"optimize" | "mask" | "resize" | "upscale" | null>(null);
  const [previewZoom, setPreviewZoom] = useState(0);
  const [activeActionLabel, setActiveActionLabel] = useState("");
  const [confirmLightboxAction, setConfirmLightboxAction] = useState("");
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [showMoreFooterActions, setShowMoreFooterActions] = useState(false);
  const [compareSplit, setCompareSplit] = useState(50);
  const [activePngLayerFilename, setActivePngLayerFilename] = useState("");
  const [optimizePrompt, setOptimizePrompt] = useState("");
  const [maskPrompt, setMaskPrompt] = useState("");
  const [resizeRatio, setResizeRatio] = useState<AspectRatioValue>(() => ratioFromImage(image));
  const [resizeSize, setResizeSize] = useState(() => defaultTargetSizeForRatio(ratioFromImage(image)));
  const [resizeFitMode, setResizeFitMode] = useState<HistoryResizeOptions["fitMode"]>("smart_relayout");
  const [upscaleSize, setUpscaleSize] = useState(() => qualityEnhanceDefaultTargetForImage(image, imageModel));
  const [upscaleFitMode, setUpscaleFitMode] = useState<HistoryUpscaleOptions["fitMode"]>("standard_enhance");
  const [upscaleFormat, setUpscaleFormat] = useState<"png" | "jpg" | "webp">("png");
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
  const sourceDetailLines = imageSourceDetailLines(image, { formatDuration, formatGeneratedAt, labelForOperation: nodeOperationLabel });
  const lightboxTitle = `${image.branchLabel || `方案 ${image.variant || 1}`} · ${image.mode || image.materialType || "预览"}`;
  const lightboxMeta = [
    actualSizeLabel,
    image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : "",
  ].filter(Boolean).join(" · ");
  const pngLayerResult = image.pngLayerExport || null;
  const pngLayers = pngLayerResult?.layers || [];
  const activePngLayer = pngLayers.find((layer) => layer.filename === activePngLayerFilename) || null;
  const compareBefore = image.compareBefore?.url ? image.compareBefore : null;
  const qualityEnhanceTargets = useMemo(() => qualityEnhanceTargetOptionsForImage(image, imageModel), [image, imageModel]);
  const activeUpscaleSize = qualityEnhanceTargets.includes(upscaleSize) ? upscaleSize : qualityEnhanceTargets[0] || upscaleSize;
  const deliveryIssues = image.qualityCheck?.issues || [];
  const deliveryActions = image.qualityCheck?.actions || [];
  const isDeliveryReady = image.qualityCheck?.deliverability === "ready" || image.qualityCheck?.status === "passed";
  const primaryDeliverySuggestion = deliveryActions[0]
    || (isDeliveryReady ? "可下载交付，也可以继续做 PNG 分层或局部精修。" : "建议先做画质增强并放大检查文字、Logo、二维码。");
  const deliverySummary = buildDeliverySummary(image, {
    actualSizeLabel,
    expectedSizeLabel,
    formatFileSize,
    qualityLabel: image.qualityCheck?.deliverabilityLabel || qualityBadgeLabel(image),
  });
  const qualityReviewSummary = buildQualityReviewSummary(image, {
    actualSizeLabel,
    expectedSizeLabel,
    qualityLabel: image.qualityCheck?.deliverabilityLabel || qualityBadgeLabel(image),
  });
  const showQualityComparison = Boolean(
    compareBefore
    && (image.nodeOperation === "hd_redraw" || image.nodeOperation === "upscale_4k" || image.nodeOperation === "mask_edit" || image.nodeOperation === "design_optimize" || image.mode?.includes("画质增强") || image.mode?.includes("局部") || image.mode?.includes("设计优化")),
  );
  const previewFrameStyle = previewZoom
    ? zoomedPreviewFrameStyle(image, previewZoom)
    : largePreviewFrameStyle(image);
  const previewZoomLabel = previewZoom ? `${Math.round(previewZoom * 100)}%` : "适应";

  function changePreviewZoom(nextZoom: number) {
    setPreviewZoom(Math.max(0.5, Math.min(3, Number(nextZoom.toFixed(2)))));
  }

  async function runAction(label: string, action: () => void | Promise<void>) {
    if (activeActionLabel) return;
    setConfirmLightboxAction("");
    setActiveActionLabel(label);
    setMessage(`${label}中...`);
    try {
      await action();
      setMessage(`${label}成功`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label}失败`);
    } finally {
      setActiveActionLabel("");
    }
  }

  async function runConfirmedAction(label: string, action: () => void | Promise<void>) {
    if (activeActionLabel) return;
    if (confirmLightboxAction !== label) {
      setConfirmLightboxAction(label);
      setMessage(`再点一次确认${label}。`);
      return;
    }
    await runAction(label, action);
  }
  const actionBusy = Boolean(activeActionLabel);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,11,18,0.82)] p-2 sm:p-5" onClick={onClose}>
      <div className="apple-panel-strong flex max-h-[94vh] w-[min(1280px,97vw)] flex-col overflow-hidden rounded-[22px] shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <button className="apple-button rounded-full px-2.5 py-1 text-[11px]" onClick={onClose} type="button">返回结果</button>
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
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white/[0.025] lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-h-0 p-2 sm:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-white/10 bg-white/[0.04] px-2.5 py-2">
              <div className="text-[11px] font-semibold text-white/70">查看：{previewZoomLabel}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${previewZoom === 0 ? "border-white/35 bg-white text-black" : "text-white/70"}`} onClick={() => setPreviewZoom(0)} type="button">
                  适应
                </button>
                {[1, 1.5, 2].map((value) => (
                  <button
                    className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${previewZoom === value ? "border-white/35 bg-white text-black" : "text-white/70"}`}
                    key={value}
                    onClick={() => setPreviewZoom(value)}
                    type="button"
                  >
                    {Math.round(value * 100)}%
                  </button>
                ))}
                <button aria-label="缩小图片" className="apple-button flex size-7 items-center justify-center rounded-full text-white/70" onClick={() => changePreviewZoom((previewZoom || 1) - 0.25)} type="button">
                  -
                </button>
                <button aria-label="放大图片" className="apple-button flex size-7 items-center justify-center rounded-full text-white/70" onClick={() => changePreviewZoom((previewZoom || 1) + 0.25)} type="button">
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
            <div className={`relative h-[calc(100%-46px)] min-h-[320px] overflow-auto bg-transparent p-2 ${previewZoom ? "flex items-start justify-start" : "flex items-center justify-center"}`}>
              <div className="relative mx-auto overflow-hidden rounded-[18px] border border-white/10 bg-transparent shadow-[0_20px_70px_rgba(0,0,0,0.32)]" style={previewFrameStyle}>
                {activePngLayer ? (
                  <div className="relative h-full w-full">
                    <ImageFrame
                      alt={activePngLayer.name || activePngLayer.filename}
                      className="h-full w-full border-0 bg-transparent"
                      fit="contain"
                      image={pngLayerPreviewImage(activePngLayer)}
                      loading="eager"
                      preserveRatio={false}
                      showCheckerboard
                      variant="original"
                      style={{ height: "100%" }}
                    />
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/14 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white/82 backdrop-blur-xl">
                      {pngLayerDisplayName(activePngLayer)}
                    </div>
                  </div>
                ) : showQualityComparison && compareBefore ? (
                  <ImageComparisonSlider
                    after={image}
                    before={compareBefore}
                    split={compareSplit}
                    onSplitChange={setCompareSplit}
                  />
                ) : (
                  <ImageFrame alt={image.fileName || image.id} className="h-full w-full border-0 bg-transparent" fit="contain" image={image} loading="eager" preserveRatio={false} variant="original" style={{ height: "100%" }} />
                )}
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
                  <button className="apple-button-primary flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("保留此版", onKeep)} type="button">
                    <Check className="size-3.5" />
                    {activeActionLabel === "保留此版" ? "保留中..." : "保留此版"}
                  </button>
                  <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("下载 PNG", () => downloadImageFile(image, "png"))} type="button">
                    <ArrowDownToLine className="size-3.5" />
                    {activeActionLabel === "下载 PNG" ? "下载中..." : "下载 PNG"}
                  </button>
                  <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制图片", () => onCopyImage(image))} type="button">
                    <Images className="size-3.5" />
                    {activeActionLabel === "复制图片" ? "复制中..." : "复制图片"}
                  </button>
                  <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => setShowMoreFooterActions((value) => !value)} type="button">
                    <ChevronDown className={`size-3.5 transition ${showMoreFooterActions ? "rotate-180" : ""}`} />
                    {showMoreFooterActions ? "收起更多" : "更多"}
                  </button>
                </div>
                {showMoreFooterActions ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-[16px] border border-white/10 bg-white/[0.05] p-2">
                    <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("下载 JPG", () => downloadImageFile(image, "jpg"))} type="button">
                      <ArrowDownToLine className="size-3.5" />
                      {activeActionLabel === "下载 JPG" ? "下载中..." : "下载 JPG"}
                    </button>
                    <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("下载 WebP", () => downloadImageFile(image, "webp"))} type="button">
                      <ArrowDownToLine className="size-3.5" />
                      {activeActionLabel === "下载 WebP" ? "下载中..." : "下载 WebP"}
                    </button>
                    <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制交付摘要", () => onCopyPrompt(deliverySummary))} type="button">
                      <FileImage className="size-3.5" />
                      交付摘要
                    </button>
                    <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制质检摘要", () => onCopyPrompt(qualityReviewSummary))} type="button">
                      <ShieldCheck className="size-3.5" />
                      质检摘要
                    </button>
                    <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">
                      <Wand2 className="size-3.5" />
                      复制 Prompt
                    </button>
                    <button className="apple-button-danger flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runConfirmedAction("删除当前图", onDelete)} type="button">
                      <Trash2 className="size-3.5" />
                      {activeActionLabel === "删除当前图" ? "删除中..." : confirmLightboxAction === "删除当前图" ? "确认删除" : "删除当前图"}
                    </button>
                  </div>
                ) : null}
              </section>

              {pngLayerResult ? (
                <PngLayerResultSection
                  activeFilename={activePngLayerFilename}
                  result={pngLayerResult}
                  onDownloadLayer={(layer) => runAction(`下载${pngLayerDisplayName(layer)}`, () => downloadRemoteFile(layer.url, layer.filename))}
                  onPreviewLayer={(layer) => setActivePngLayerFilename(layer.filename)}
                  onShowComposite={() => setActivePngLayerFilename("")}
                />
              ) : null}

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
                  <section className={`apple-surface-section border p-3 ${isDeliveryReady ? "border-[#74e3c5]/18 bg-[#74e3c5]/[0.06]" : "border-[#ffd166]/18 bg-[#ffd166]/[0.07]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="apple-section-title">下一步建议</div>
                        <div className="apple-caption mt-1 line-clamp-2">
                          {primaryDeliverySuggestion}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${qualityDeliveryTone(image.qualityCheck?.deliverability)}`}>
                        {image.qualityCheck?.deliverabilityLabel || qualityBadgeLabel(image)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="apple-button-primary flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold disabled:opacity-55"
                        disabled={actionBusy}
                        onClick={() => setActiveEditTool("upscale")}
                        type="button"
                      >
                        <Sparkles className="size-3.5" />
                        画质增强
                      </button>
                      <button
                        className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55"
                        disabled={actionBusy}
                        onClick={() => setActiveEditTool("mask")}
                        type="button"
                      >
                        <Brush className="size-3.5" />
                        局部修改
                      </button>
                      <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("下载 PNG", () => downloadImageFile(image, "png"))} type="button">
                        <ArrowDownToLine className="size-3.5" />
                        下载成品
                      </button>
                      <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px]" onClick={() => setSidebarTab("info")} type="button">
                        <ShieldCheck className="size-3.5" />
                        看质检
                      </button>
                    </div>
                    {deliveryIssues.length ? (
                      <div className="mt-2 rounded-[12px] border border-white/10 bg-black/15 px-2.5 py-2 text-[11px] leading-5 text-white/54">
                        {deliveryIssues.slice(0, 2).map((issue) => (
                          <div className="line-clamp-1" key={issue}>{issue}</div>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="apple-surface-section p-3">
                    <div className="apple-section-title">编辑当前方案</div>
                    <div className="apple-caption mt-1">按交付问题选择增强、局部改、改尺寸或二次优化。</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["optimize", "二次优化"],
                        ["mask", "局部修改"],
                        ["resize", "改尺寸"],
                        ["upscale", "画质增强"],
                      ].map(([value, label]) => (
                        <button
                          className={`${activeEditTool === value ? "apple-button-primary font-semibold" : "apple-button"} px-3 py-2 text-[11px] disabled:opacity-55`}
                          disabled={actionBusy}
                          key={value}
                          onClick={() => {
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
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={!optimizePrompt.trim() || actionBusy}
                        onClick={() => void runAction("创建二次优化节点", () => onEditImage(optimizePrompt.trim()))}
                        type="button"
                      >
                        {activeActionLabel === "创建二次优化节点" ? "创建中..." : "创建二次优化节点"}
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "mask" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">局部 AI 修改</div>
                      <div className="apple-caption mt-1">像生成式填充一样：涂抹区域，输入一句话，点击生成。</div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {maskQuickActions.map((action) => (
                          <button
                            className="apple-button px-2 py-1.5 text-[11px] text-white/66"
                            key={action.label}
                            onClick={() => {
                              setMaskPrompt(action.prompt);
                            }}
                            type="button"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        className="apple-textarea mt-2 min-h-[84px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
                        onChange={(event) => setMaskPrompt(event.target.value)}
                        placeholder="例如：去掉这里 / 换成蓝色科技背景 / 去掉文字并补全背景"
                        value={maskPrompt}
                      />
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={actionBusy}
                        onClick={() => void runAction("打开局部修改", () => onMaskEdit({
                            prompt: maskPrompt.trim() || "去掉这里并补全背景",
                            quality: image.quality === "4k" ? "2k" : image.quality || "standard",
                            ...inferSimpleMaskEditIntent(maskPrompt.trim() || "去掉这里并补全背景"),
                          }))}
                        type="button"
                      >
                        {activeActionLabel === "打开局部修改" ? "打开中..." : "进入涂抹"}
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "resize" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">改比例</div>
                      <div className="apple-caption mt-1">选择常用比例；自定义再填写宽高。</div>
                      <RatioPresetGrid
                        className="mt-2"
                        label="比例"
                        value={resizeRatio}
                        options={resizePresets.map((preset) => ({
                          label: preset.label,
                          ratio: preset.targetRatio,
                          value: preset.targetRatio,
                        }))}
                        onChange={(nextRatio) => {
                          const preset = resizePresets.find((item) => item.targetRatio === nextRatio);
                          setResizeRatio(nextRatio as AspectRatioValue);
                          if (preset) setResizeSize(preset.targetSize);
                        }}
                      />
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
                        disabled={!parseTargetSize(resizeSize).width || !parseTargetSize(resizeSize).height || actionBusy}
                        onClick={() => void runAction("创建改尺寸任务", () => onResize({ targetRatio: resizeRatio, targetSize: resizeSize, fitMode: resizeFitMode, quality: "standard" }))}
                        type="button"
                      >
                        {activeActionLabel === "创建改尺寸任务" ? "创建中..." : "按此尺寸创建任务"}
                      </button>
                    </section>
                  ) : null}

                  {activeEditTool === "upscale" ? (
                    <section className="apple-surface-section p-3">
                      <div className="apple-section-title">AI 画质增强</div>
                      <div className="apple-caption mt-1">Standard 修文字，Plus 图文双清晰，Creative 做质感重绘，再输出到目标尺寸。</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {qualityEnhanceTargets.map((value) => (
                          <button className={`${activeUpscaleSize === value ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[11px]`} key={value} onClick={() => setUpscaleSize(value)} type="button">
                            {value}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <MiniInput label="输出目标" value={activeUpscaleSize} onChange={setUpscaleSize} />
                        <label className="block">
                          <span className="apple-field-label mb-1 block">处理方式</span>
                          <select className="apple-select h-9 w-full px-3 text-[11px] text-white/76 outline-none" value={upscaleFitMode} onChange={(event) => setUpscaleFitMode(event.target.value as HistoryUpscaleOptions["fitMode"])}>
                            <option value="standard_enhance">Standard</option>
                            <option value="plus_enhance">Plus</option>
                            <option value="creative_redraw">Creative</option>
                          </select>
                        </label>
                      </div>
                      <div className="mt-2">
                        <InlineChipRow label="导出格式" value={upscaleFormat} options={["png", "jpg", "webp"]} onChange={(value) => setUpscaleFormat(exportFormatParam(value))} />
                      </div>
                      <div className="mt-2 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[11px] leading-5 text-[#ffe1a3]">
                        {qualityEnhanceModeDescription(qualityEnhanceModeFromFitMode(upscaleFitMode, {}))}
                      </div>
                      <button
                        className="apple-button-primary mt-2 w-full px-3 py-2 text-[11px] font-semibold disabled:opacity-40"
                        disabled={!isValidUpscaleTarget(activeUpscaleSize) || actionBusy}
                        onClick={() => void runAction("创建 AI 画质增强任务", () => onUpscale({ targetSize: activeUpscaleSize, fitMode: upscaleFitMode, quality: qualityForQualityEnhanceTarget(activeUpscaleSize), format: upscaleFormat }))}
                        type="button"
                      >
                        {activeActionLabel === "创建 AI 画质增强任务" ? "创建中..." : "创建 AI 画质增强任务"}
                      </button>
                    </section>
                  ) : null}

                </>
              ) : null}

              {sidebarTab === "info" ? (
                <>
                  <section className="apple-surface-section p-3">
                    <div className="apple-section-title">详情</div>
                    <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-white/52">
                      {expectedSizeLabel && expectedSizeLabel !== actualSizeLabel ? <DetailLine label="目标" value={expectedSizeLabel} /> : null}
                      <DetailLine label="模型" value={image.model || "unknown"} />
                      <DetailLine label="质检" value={qualityBadgeLabel(image)} />
                      {image.qualityCheck?.clarityCheckLabel ? <DetailLine label="清晰度" value={image.qualityCheck.clarityCheckLabel} /> : null}
                      {image.qualityCheck?.deliverabilityLabel ? <DetailLine label="交付" value={image.qualityCheck.deliverabilityLabel} /> : null}
                      {image.qualityEnhance?.workflow ? <DetailLine label="流程" value={image.qualityEnhance.workflow} /> : null}
                      <DetailLine label="版本" value={`${branchVersions.length} 个版本`} />
                      {image.sourceStrategyTitle ? <DetailLine label="来源" value={image.sourceStrategyTitle} /> : null}
                      {sourceDetailLines.map((line) => (
                        <DetailLine key={line.label} label={line.label} value={line.value} />
                      ))}
                    </div>
                  </section>

                  {image.qualityCheck?.fourKCheckItems?.length ? (
                    <section className="apple-surface-section p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="apple-section-title">交付检查</div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${qualityDeliveryTone(image.qualityCheck.deliverability)}`}>
                          {image.qualityCheck.deliverabilityLabel || qualityBadgeLabel(image)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {image.qualityCheck.fourKCheckItems.slice(0, 8).map((item) => (
                          <div className="flex items-start justify-between gap-2 rounded-[12px] border border-white/8 bg-white/[0.035] px-2.5 py-2 text-[11px] leading-5" key={item.label}>
                            <div className="min-w-0">
                              <div className="font-semibold text-white/70">{item.label}</div>
                              {item.detail ? <div className="mt-0.5 line-clamp-2 text-white/38">{item.detail}</div> : null}
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 ${item.passed ? "border-[#74e3c5]/18 bg-[#74e3c5]/12 text-[#adf8e5]" : "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]"}`}>
                              {item.passed ? "通过" : "复查"}
                            </span>
                          </div>
                        ))}
                      </div>
                      {image.qualityCheck.textDetailLabel ? (
                        <div className={`mt-2 rounded-[12px] border px-2.5 py-2 text-[11px] leading-5 ${image.qualityCheck.textDetailRisk ? "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]" : "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"}`}>
                          {image.qualityCheck.textDetailLabel}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="apple-surface-section p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="apple-section-title">生成 Prompt</div>
                      <button className="apple-button rounded-full px-2.5 py-1 text-[11px]" onClick={() => setShowPromptDetails((value) => !value)} type="button">
                        {showPromptDetails ? "收起" : "展开"}
                      </button>
                    </div>
                    <div className={`mt-2 overflow-auto rounded-[14px] border border-white/10 bg-white/[0.055] p-2 text-[11px] leading-5 text-white/42 ${showPromptDetails ? "max-h-[240px]" : "max-h-[92px]"}`}>
                      {image.prompt || "没有记录 Prompt。"}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button className="apple-button flex-1 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制 Prompt", () => onCopyPrompt(image.prompt || ""))} type="button">复制 Prompt</button>
                      <button className="apple-button flex-1 px-3 py-2 text-[11px] disabled:opacity-55" disabled={actionBusy} onClick={() => void runAction("复制图片", () => onCopyImage(image))} type="button">复制图片</button>
                    </div>
                  </section>

                  {image.qualityCheck?.issues?.length ? (
                    <div className="rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 p-3 text-[11px] leading-5 text-[#ffc1b8]">
                      <div className="mb-1 font-semibold">质检提醒</div>
                      {image.qualityCheck.issues.slice(0, 4).map((issue) => <div key={issue}>· {issue}</div>)}
                    </div>
                  ) : (
                    <div className="rounded-[14px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 p-3 text-[11px] leading-5 text-[#adf8e5]">
                      质检正常。
                    </div>
                  )}
                  {image.maskProtectionCheck ? (
                    <div className={`rounded-[14px] border p-3 text-[11px] leading-5 ${
                      image.maskProtectionCheck.status === "failed"
                        ? "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
                        : image.maskProtectionCheck.status === "warning"
                          ? "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]"
                          : "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
                    }`}
                    >
                      <div className="mb-1 font-semibold">局部修改质检</div>
                      <div>{image.maskProtectionCheck.message || image.maskProtectionCheck.label || "mask 外已锁定。"}</div>
                      {image.maskProtectionCheck.maskComponentCount ? (
                        <div className="mt-1 opacity-80">
                          已检查 {image.maskProtectionCheck.maskComponentCount} 个涂抹区域
                          {image.maskProtectionCheck.unchangedComponentCount ? `，${image.maskProtectionCheck.unchangedComponentCount} 个疑似未生效` : ""}
                        </div>
                      ) : null}
                      {image.maskProtectionCheck.issues?.length ? (
                        <div className="mt-1">
                          {image.maskProtectionCheck.issues.slice(0, 4).map((issue) => <div key={issue}>· {issue}</div>)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
    .filter((node) => node?.id && node?.type && isRestorableNodeKind(node.type))
    .map((node) => {
      const kind = normalizeLegacyNodeKind(node.data.kind || node.type);
      const catalog = nodeCatalog.find((item) => item.type === kind);
      const task = latestTaskByNode.get(node.id);
      const existingOutputs = Array.isArray(node.data.outputs) ? node.data.outputs : node.data.output ? [node.data.output] : [];
      const taskOutputs = task?.outputs?.length ? task.outputs : task?.result ? [task.result] : [];
      const outputs = existingOutputs.length ? existingOutputs : taskOutputs;
      const activeWithoutOutput = isActiveNodeStatus(node.data.status) && !outputs.length;
      const taskError = task?.error || task?.progressLabel || "";
      const taskFinishedStatus = activeWithoutOutput && task && isFinishedNodeStatus(task.status) ? task.status : node.data.status;
      const restoredStatus = outputs.length && taskFinishedStatus === "failed" ? "completed" : taskFinishedStatus;
      const restoredError = restoredStatus === "failed" && !node.data.error && taskError ? taskError : restoredStatus === "completed" ? "" : node.data.error;
      return {
        ...node,
        type: kind,
        selected: false,
        dragging: false,
        data: {
          ...node.data,
          title: node.data.kind === "upscale_4k" ? "画质增强" : node.data.title,
          kind,
          subtitle: catalog?.description || node.data.subtitle,
          params: migrateLegacyNodeParams(kind, node.data.kind, node.data.params || {}),
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

function filterDismissedRestoredNodes(projectId: string, nodes: FlowNode[]) {
  if (!nodes.length) return nodes;
  const taskRefs = loadDismissedTaskRefs(projectId);
  const imageKeys = loadDismissedImageKeySet(projectId);
  if (!taskRefs.nodeIds.size && !imageKeys.size) return nodes;
  return nodes.filter((node) => {
    if (taskRefs.nodeIds.has(node.id)) return false;
    const candidates = taskCandidateImagesFromNode(node);
    if (!candidates.length) return true;
    return !candidates.every((image) => imageKeys.has(imageKey(image)));
  });
}

function isRestorableNodeKind(value: unknown) {
  return nodeCatalog.some((item) => item.type === value) || value === "upscale_4k";
}

function normalizeLegacyNodeKind(value: unknown): NodeKind {
  if (value === "upscale_4k") return "hd_redraw";
  return nodeCatalog.some((item) => item.type === value) ? value as NodeKind : "text_to_image";
}

function migrateLegacyNodeParams(kind: NodeKind, originalKind: unknown, params: Record<string, unknown>) {
  if (originalKind !== "upscale_4k") return Object.keys(params).length ? params : { ...defaultParamsByKind[kind] };
  const enhancementMode = qualityEnhanceModeFromFitMode(stringParam(params.fitMode), params);
  return {
    ...defaultParamsByKind.hd_redraw,
    targetSize: stringParam(params.targetSize) || defaultParamsByKind.hd_redraw.targetSize,
    quality: qualityEnhanceQualityParam(params.quality),
    format: exportFormatParam(params.format),
    enhancementMode,
    prompt: stringParam(params.prompt) || qualityEnhanceDefaultPrompt(enhancementMode),
    model: stringParam(params.model),
  };
}

function filterEdgesForNodes(edges: FlowEdge[], nodes: FlowNode[]) {
  const ids = new Set(nodes.map((node) => node.id));
  return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
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

function mergePendingFacts(current: ProjectFactCandidate[], incoming: ProjectFactCandidate[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((item) => {
    const key = `${item.field}:${item.value.trim()}:${item.sourceUrl || item.sourceLabel}`;
    if (!item.value.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function getStoredProject(serverProject: ProjectPayload | null): ProjectPayload | null {
  const localProject = readLegacyProjectLocalCache();
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

function readLegacyProjectLocalCache(): ProjectPayload | null {
  try {
    const raw = window.localStorage.getItem(projectStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isProjectLocalCachePointer(parsed)) return null;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<ProjectPayload>;
    const hasProjectShape = Boolean(candidate.id || candidate.name || candidate.nodes?.length || candidate.edges?.length || candidate.assets?.length);
    return hasProjectShape ? stripProjectRuntimeState(candidate as ProjectPayload) : null;
  } catch {
    return null;
  }
}

function readProjectSnapshots(projectId: string): ProjectSnapshot[] {
  try {
    const raw = window.localStorage.getItem(projectSnapshotStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ProjectSnapshot => Boolean(item && typeof item === "object" && (item as ProjectSnapshot).id))
      .slice(0, projectSnapshotLimit);
  } catch {
    return [];
  }
}

function writeProjectSnapshot(projectId: string, payload: ProjectPayload, reason: ProjectSnapshot["reason"]) {
  if (!payload.nodes?.length && !payload.assets?.length && !payload.assetText) {
    return readProjectSnapshots(projectId).length;
  }
  const stablePayload = stripProjectRuntimeState(payload);
  const jsonBytes = stringifyProjectPayload(stablePayload).length;
  const snapshot: ProjectSnapshot = {
    id: `snapshot_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    projectId: stablePayload.id || projectId || "local-project",
    projectName: stablePayload.name || "AI 设计项目",
    createdAt: new Date().toISOString(),
    reason,
    nodeCount: stablePayload.nodes?.length || 0,
    taskCount: stablePayload.runs?.length || 0,
    jsonBytes,
    storageMode: "file",
  };
  const snapshots = [snapshot, ...readProjectSnapshots(projectId)]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, projectSnapshotLimit);
  try {
    window.localStorage.setItem(projectSnapshotStorageKey(projectId), JSON.stringify(snapshots));
  } catch {
    try {
      window.localStorage.setItem(projectSnapshotStorageKey(projectId), JSON.stringify(snapshots.slice(0, 2)));
    } catch {}
  }
  return snapshots.length;
}

function restoreProjectTasks(runs: TaskRecord[]) {
  const now = Date.now();
  return sanitizeProjectTasks(runs).map((task) => {
    if (taskHasResultImages(task) && task.status === "failed") {
      return {
        ...task,
        status: "completed" as const,
        stage: "completed" as const,
        backendRunState: "finished" as const,
        endedAt: task.endedAt || now,
        progress: 100,
        error: "",
        progressLabel: task.resultNodeIds?.length
          ? "已生成结果，质检提醒见图片详情"
          : "已生成结果，任务记录已自动修正",
      };
    }

    if (task.deferred && task.status === "queued") return task;

    if (taskHasResultImages(task)) {
      return {
        ...task,
        status: "completed" as const,
        stage: "completed" as const,
        backendRunState: "finished" as const,
        endedAt: now,
        progress: 100,
        error: "",
        progressLabel: "已生成结果，任务记录已自动修正",
      };
    }

    if (task.requestId && task.status !== "cancelled") {
      const queued = task.status === "queued" || task.backendRunState === "waiting";
      return {
        ...task,
        status: queued ? "queued" as const : "running" as const,
        stage: queued ? "queued" as const : "generating" as const,
        backendRunState: queued ? "waiting" as const : "active" as const,
        endedAt: undefined,
        progress: Math.max(12, Math.min(task.progress && task.progress < 100 ? task.progress : 22, 88)),
        error: "",
        progressLabel: task.status === "failed"
          ? "页面已恢复，正在核验后台最终状态，未确认前不判失败"
          : "页面已恢复，正在核验后台进程，完成后会自动同步结果",
        lastHeartbeatAt: now,
      };
    }

    if (task.endedAt || task.status === "completed" || task.status === "failed" || task.status === "cancelled") return task;

    return {
      ...task,
      status: "failed" as const,
      stage: "failed" as const,
      backendRunState: "failed" as const,
      endedAt: now,
      progress: 100,
      error: "页面刷新后任务已中断，请重试或删除记录。",
      progressLabel: "已中断：可重试或删除记录",
    };
  });
}

function persistProjectPayloadForLifecycleExit(payloadText: string) {
  if (typeof window === "undefined") return;
  const canUseKeepalive = payloadText.length <= projectLifecycleKeepaliveLimitBytes;
  try {
    if (canUseKeepalive && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const accepted = navigator.sendBeacon("/api/project", new Blob([payloadText], { type: "application/json" }));
      if (accepted) return;
    }
  } catch {}

  try {
    void fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadText,
      keepalive: canUseKeepalive,
    }).catch(() => {});
  } catch {}
}

function NodeErrorNotice({ className = "", compact = false, error }: { className?: string; compact?: boolean; error: string }) {
  const message = friendlyDisplayError(error);
  const tips = errorRecoveryTips(error);
  return (
    <div className={`${className} rounded-2xl border border-[#ff6b5f]/16 bg-[#ff6b5f]/12 ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} text-[#ffb4a8]`}>
      <div className="text-[11px] font-medium leading-5">{message}</div>
      {tips.length ? (
        <div className="mt-1.5 grid gap-1 text-[11px] leading-5 text-white/58">
          {tips.map((tip) => (
            <div className="flex gap-1.5" key={tip}>
              <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-[#ffb4a8]/70" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function withClientTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
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

function buildProjectConstraintText(
  text: string,
  profile: ProjectProfile,
  textProtectionMode: boolean,
  taskContextNotes?: string,
  visibleRequestText?: string,
  brandAssets: ImageAsset[] = [],
) {
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText || text);
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText || "");
  const brandAssetContext = buildBrandAssetContextPack(profile, brandAssets, visibleRequestText || text);
  const projectMemory = sanitizeProjectMemoryForPrompt(text.trim(), visibleRequestText || "");
  const canMentionTextAssets = !hiddenRequests.noText;
  const profileNotes = [
    canMentionTextAssets && visibleRequests.organization && profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    projectProfileColors(profile).length ? `品牌色：${projectProfileColors(profile).join("、")}` : "",
    !hiddenRequests.noLogo && visibleRequests.logo && profile.logoName ? `用户要求 Logo：${profile.logoName}` : "",
    !hiddenRequests.noContact && visibleRequests.phone && profile.phone ? `用户要求电话：${profile.phone}` : "",
    !hiddenRequests.noContact && visibleRequests.address && profile.address ? `用户要求地址：${profile.address}` : "",
    !hiddenRequests.noQr && visibleRequests.qr && profile.qrCodeNote ? `用户要求二维码：${profile.qrCodeNote}` : "",
    canMentionTextAssets && visibleRequests.copy && profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
    !hiddenRequests.noText && profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
    profile.styleNotes ? `风格说明：${profile.styleNotes}` : "",
    profile.keepFace ? "保护人脸/人物识别度。" : "",
    profile.keepMainSubject ? "保护主体、产品和主视觉识别度。" : "",
    profile.onlyEditMaskedArea ? "onlyEditMaskedArea：局部修改时只允许修改涂抹区域。" : "",
  ].filter(Boolean);
  const notes = [projectMemory, brandAssetContext, ...profileNotes, taskContextNotes || ""].filter(Boolean).join("\n");
  if (!textProtectionMode) return notes;
  return [
    notes,
    hiddenRequests.noText ? "用户要求无文字/纯背景：项目记忆、项目文案、机构名、电话地址只作为后台资料，禁止上画。" : "",
    hiddenRequests.noLogo ? "用户要求不要 Logo：项目 Logo 和机构品牌标识禁止上画。" : "",
    hiddenRequests.noQr ? "用户要求不要二维码：二维码和扫码占位禁止上画。" : "",
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
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
  const lines = [
    "【项目素材】",
    !hiddenRequests.noText && visibleRequests.organization && profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    usage.usePrimaryColors && primaryColors.length ? `项目主色：${primaryColors.join("、")}` : "",
    usage.useSecondaryColors && secondaryColors.length ? `辅助配色：${secondaryColors.join("、")}` : "",
    !hiddenRequests.noLogo && usage.useLogo && (profile.logoName || logoAssets.length) ? `Logo：${[profile.logoName, assetNames(logoAssets)].filter(Boolean).join("；")}` : "",
    usage.useIpImage && ipAssets.length ? `IP形象：${assetNames(ipAssets)}` : "",
    !hiddenRequests.noContact && usage.useContact && profile.phone ? `电话：${profile.phone}` : "",
    !hiddenRequests.noContact && usage.useContact && profile.address ? `地址：${profile.address}` : "",
    !hiddenRequests.noQr && usage.useQrCode && (profile.qrCodeNote || qrAssets.length) ? `二维码：${[profile.qrCodeNote, assetNames(qrAssets)].filter(Boolean).join("；")}` : "",
    !hiddenRequests.noText && usage.useCopy && visibleRequests.copy && profile.commonCopy ? `常用宣传语：${splitProfileLines(profile.commonCopy).join("；")}` : "",
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

function buildProfileProtectionContext(
  profile: ProjectProfile,
  options: {
    projectId: string;
    operation: string;
    sourceImages: ImageAsset[];
    brandAssets?: ImageAsset[];
    visibleRequestText?: string;
  },
): ProtectionContextPayload {
  const hasSourceImage = options.sourceImages.length > 0;
  const protectVisibleProfileAssets = hasSourceImage && options.operation !== "text_to_image";
  const brandAssets = options.brandAssets || [];
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const visibleRequestText = options.visibleRequestText || "";
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText);
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
  const isProjectAwareTextToImage = options.operation === "text_to_image" && shouldUseProjectPromptContext(visibleRequestText);
  const contactExplicitlyRequested = visibleRequests.phone || visibleRequests.address || usage.useContact;
  const shouldProtectContact = !hiddenRequests.noText && !hiddenRequests.noContact && contactExplicitlyRequested;
  const shouldForbidInventedContact = !hiddenRequests.noText && !hiddenRequests.noContact && isProjectAwareTextToImage && !contactExplicitlyRequested;
  const logoAssets = findBrandAssets(brandAssets, "logo");
  const ipAssets = findBrandAssets(brandAssets, "ip");
  const qrAssets = findBrandAssets(brandAssets, "qrcode");
  const protectedTexts: ProtectedTextPayload[] = [
    profile.organizationName ? protectedText("organization", profile.organizationName, "other", "normal", "机构名称来自项目记忆，仅作为项目识别和校对资料") : null,
    shouldProtectContact && profile.phone ? protectedText("phone", profile.phone, "phone", "critical", "用户明确要求电话；项目电话来自品牌资产包，必须准确使用，不得编造") : null,
    shouldProtectContact && profile.address ? protectedText("address", profile.address, "address", "critical", "用户明确要求地址；项目地址来自品牌资产包，必须准确使用，不得编造") : null,
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
        shouldProtectContact && profile.phone ? `项目真实电话：${profile.phone}。用户明确要求电话时必须准确使用。` : "未明确要求电话时不要自行生成电话。",
        shouldProtectContact && profile.address ? `项目真实地址：${profile.address}。用户明确要求地址时必须准确使用。` : "未明确要求地址时不要自行生成地址。",
        shouldForbidInventedContact ? "联系方式策略：用户只要求品牌、Logo 或 IP 时，只放对应素材；不要自动添加电话、地址、二维码、预约热线、医院代码、扫码区或联系卡片。" : "",
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
