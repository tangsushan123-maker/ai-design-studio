"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDeliverySummary, buildQualityReviewSummary, imageSizeLabel, qualityBadgeLabel } from "@/lib/workbench-delivery";
import { formatDuration, formatFileSize, formatGeneratedAt } from "@/lib/workbench-format";
import { imageSourceDetailLines } from "@/lib/workbench-image-source";
import { LightboxActionPanel } from "@/components/workbench/lightbox-action-panel";
import { LightboxDeliveryPanel, type LightboxEditTool } from "@/components/workbench/lightbox-delivery-panel";
import { LightboxEditPanels } from "@/components/workbench/lightbox-edit-panels";
import { LightboxHeader } from "@/components/workbench/lightbox-header";
import { LightboxInfoPanel } from "@/components/workbench/lightbox-info-panel";
import { LightboxPreviewPanel } from "@/components/workbench/lightbox-preview-panel";
import { LightboxVersionPanel } from "@/components/workbench/lightbox-version-panel";
import { PngLayerResultSection } from "@/components/workbench/png-layer-result-section";
import { downloadRemoteFile } from "@/components/workbench/workbench-file-actions";
import {
  imageBranchVersions,
  imageKey,
  isUserFacingResultImage,
  latestImagesForResultGroup,
  sortImagesByRecency,
} from "@/components/workbench/workbench-image-collection";
import { pngLayerDisplayName } from "@/components/workbench/workbench-image-display";
import { nodeOperationLabel } from "@/components/workbench/workbench-labels";
import { defaultTargetSizeForRatio } from "@/components/workbench/workbench-node-prompts";
import { ratioFromImage } from "@/components/workbench/workbench-text-references";
import {
  qualityEnhanceDefaultTargetForImage,
  qualityEnhanceTargetOptionsForImage,
} from "@/components/workbench/workbench-upscale";
import type { AspectRatioValue } from "@/lib/design-options";
import type {
  HistoryMaskEditOptions,
  HistoryResizeOptions,
  HistoryUpscaleOptions,
  ImageAsset,
} from "@/components/workbench/workbench-types";

export function ImageLightbox({
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
  const [activeEditTool, setActiveEditTool] = useState<LightboxEditTool | null>(null);
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
  const branchVersions = useMemo(() => imageBranchVersions(historyImages, image), [historyImages, image]);
  const branchLatestVariants = useMemo(() => latestImagesForResultGroup(historyImages, image), [historyImages, image]);
  const galleryImages = useMemo(() => sortImagesByRecency(historyImages.filter(isUserFacingResultImage)), [historyImages]);
  const galleryIndex = galleryImages.findIndex((item) => imageKey(item) === imageKey(image));
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
  const openAdjacentImage = useCallback((direction: -1 | 1) => {
    if (galleryImages.length < 2 || galleryIndex < 0) return;
    const nextIndex = (galleryIndex + direction + galleryImages.length) % galleryImages.length;
    onOpenVersion(galleryImages[nextIndex]);
  }, [galleryImages, galleryIndex, onOpenVersion]);

  useEffect(() => {
    function handleLightboxKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        openAdjacentImage(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        openAdjacentImage(1);
      }
    }
    window.addEventListener("keydown", handleLightboxKeydown);
    return () => window.removeEventListener("keydown", handleLightboxKeydown);
  }, [onClose, openAdjacentImage]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,11,18,0.82)] p-2 sm:p-5" onClick={onClose}>
      <div className="apple-panel-strong flex max-h-[94vh] w-[min(1280px,97vw)] flex-col overflow-hidden rounded-[22px] shadow-[0_30px_100px_rgba(0,0,0,0.34)] sm:rounded-[28px]" onClick={(event) => event.stopPropagation()}>
        <LightboxHeader
          canNavigate={galleryImages.length > 1}
          meta={lightboxMeta}
          title={lightboxTitle}
          onClose={onClose}
          onNext={() => openAdjacentImage(1)}
          onPrevious={() => openAdjacentImage(-1)}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white/[0.025] lg:grid-cols-[minmax(0,1fr)_340px]">
          <LightboxPreviewPanel
            activePngLayer={activePngLayer}
            compareBefore={compareBefore}
            compareSplit={compareSplit}
            image={image}
            previewZoom={previewZoom}
            showQualityComparison={showQualityComparison}
            onCompareSplitChange={setCompareSplit}
            onPreviewZoomChange={setPreviewZoom}
          />
          <aside className="min-h-0 overflow-auto border-t border-white/10 bg-white/[0.06] p-3 backdrop-blur-2xl sm:p-4 lg:border-l lg:border-t-0">
            <div className="space-y-3">
              <LightboxActionPanel
                actionBusy={actionBusy}
                activeActionLabel={activeActionLabel}
                confirmActionLabel={confirmLightboxAction}
                deliverySummary={deliverySummary}
                image={image}
                qualityReviewSummary={qualityReviewSummary}
                showMoreActions={showMoreFooterActions}
                sidebarTab={sidebarTab}
                onCopyImage={onCopyImage}
                onCopyPrompt={onCopyPrompt}
                onDelete={onDelete}
                onKeep={onKeep}
                onRunAction={runAction}
                onRunConfirmedAction={runConfirmedAction}
                onSidebarTabChange={setSidebarTab}
                onToggleMoreActions={() => setShowMoreFooterActions((value) => !value)}
              />

              {pngLayerResult ? (
                <PngLayerResultSection
                  activeFilename={activePngLayerFilename}
                  result={pngLayerResult}
                  onDownloadLayer={(layer) => runAction(`下载${pngLayerDisplayName(layer)}`, () => downloadRemoteFile(layer.url, layer.filename))}
                  onDownloadZip={() => {
                    if (pngLayerResult.zipUrl) return runAction("打包下载 PNG 分层", () => downloadRemoteFile(pngLayerResult.zipUrl || "", pngLayerResult.zipFileName || "png-layers.zip"));
                  }}
                  onPreviewLayer={(layer) => setActivePngLayerFilename(layer.filename)}
                  onShowComposite={() => setActivePngLayerFilename("")}
                />
              ) : null}

              <LightboxVersionPanel
                currentImage={image}
                latestVariants={branchLatestVariants}
                versions={branchVersions}
                onOpenVersion={onOpenVersion}
              />

              {sidebarTab === "actions" ? (
                <>
                  <LightboxDeliveryPanel
                    actionBusy={actionBusy}
                    activeEditTool={activeEditTool}
                    image={image}
                    onEditToolChange={setActiveEditTool}
                    onRunAction={runAction}
                    onShowQualityCheck={() => setSidebarTab("info")}
                  />

                  <LightboxEditPanels
                    actionBusy={actionBusy}
                    activeActionLabel={activeActionLabel}
                    activeEditTool={activeEditTool}
                    activeUpscaleSize={activeUpscaleSize}
                    image={image}
                    maskPrompt={maskPrompt}
                    optimizePrompt={optimizePrompt}
                    qualityEnhanceTargets={qualityEnhanceTargets}
                    resizeFitMode={resizeFitMode}
                    resizeRatio={resizeRatio}
                    resizeSize={resizeSize}
                    upscaleFitMode={upscaleFitMode}
                    upscaleFormat={upscaleFormat}
                    onEditImage={onEditImage}
                    onMaskEdit={onMaskEdit}
                    onMaskPromptChange={setMaskPrompt}
                    onOptimizePromptChange={setOptimizePrompt}
                    onResize={onResize}
                    onResizeFitModeChange={setResizeFitMode}
                    onResizeRatioChange={setResizeRatio}
                    onResizeSizeChange={setResizeSize}
                    onRunAction={runAction}
                    onUpscale={onUpscale}
                    onUpscaleFitModeChange={setUpscaleFitMode}
                    onUpscaleFormatChange={setUpscaleFormat}
                    onUpscaleSizeChange={setUpscaleSize}
                  />
                </>
              ) : null}

              {sidebarTab === "info" ? (
                <LightboxInfoPanel
                  actionBusy={actionBusy}
                  actualSizeLabel={actualSizeLabel}
                  branchVersionCount={branchVersions.length}
                  expectedSizeLabel={expectedSizeLabel}
                  image={image}
                  showPromptDetails={showPromptDetails}
                  sourceDetailLines={sourceDetailLines}
                  onCopyImage={onCopyImage}
                  onCopyPrompt={onCopyPrompt}
                  onPromptDetailsToggle={() => setShowPromptDetails((value) => !value)}
                  onRunAction={runAction}
                />
              ) : null}

              {message ? <div className="apple-caption rounded-[14px] border border-white/10 bg-white/[0.055] px-3 py-2 text-white/44">{message}</div> : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
