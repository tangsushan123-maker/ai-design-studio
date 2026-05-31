"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { FileImage, Sparkles, X } from "lucide-react";
import { formatDuration, formatGeneratedAt } from "@/lib/workbench-format";
import { imageSourceSummary } from "@/lib/workbench-image-source";
import { ImageManagerPanel } from "@/components/workbench/image-manager-panel";
import { NodeInspectorPanel } from "@/components/workbench/node-inspector-panel";
import { NodeResultsPanel } from "@/components/workbench/node-results-panel";
import { TaskCenter } from "@/components/workbench/task-center";
import {
  isUserFacingResultImage,
  mergeImages,
  sortResultImagesForDisplay,
} from "@/components/workbench/workbench-image-collection";
import { imageDeletionProtection } from "@/components/workbench/workbench-image-lifecycle";
import { compactThumbStyle, shouldShowCheckerboard } from "@/components/workbench/workbench-image-metrics";
import { nodeOperationLabel, taskStatusLabel } from "@/components/workbench/workbench-labels";
import { EmptyPanel } from "@/components/workbench/workbench-small-ui";
import { isDeferredQueuedTask, isTaskActivelyRunning, isTaskPossiblyStuck } from "@/components/workbench/workbench-task-state";
import { taskHasResultImages } from "@/components/workbench/workbench-task-helpers";
import type {
  FlowNode,
  ImageAsset,
  NodeKind,
  NodeStatus,
  RightPanelTab,
  TaskRecord,
} from "@/components/workbench/workbench-types";

export const RightPanel = memo(function RightPanel({
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
  tabHint,
  tabHintTick,
  onDeleteHistory,
  onDeleteHistoryMany,
  onCopyHistory,
  onToggleFavorite,
  onEnsureImageManager,
  onLoadMoreImageManager,
  onLoadMoreTrash,
  onLoadMoreHistory,
  onPreview,
  onRestoreHistory,
  onPermanentDeleteHistory,
  onClose,
  backNode,
  selectedNode,
  tasks,
  onCancelTask,
  onDeleteTask,
  onDeleteFinishedTasks,
  onMaskEdit,
  onParamChange,
  onRetryTask,
  onCreateAction,
  onBackToNode,
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
  tabHint: RightPanelTab;
  tabHintTick: number;
  onDeleteHistory: (image: ImageAsset) => void | Promise<unknown>;
  onDeleteHistoryMany: (images: ImageAsset[]) => void | Promise<unknown>;
  onCopyHistory: (image: ImageAsset) => void | Promise<unknown>;
  onToggleFavorite: (image: ImageAsset) => void | Promise<unknown>;
  onEnsureImageManager: () => void;
  onLoadMoreImageManager: () => void;
  onLoadMoreTrash: () => void;
  onLoadMoreHistory: () => void;
  onPreview: (image: ImageAsset) => void;
  onRestoreHistory: (image: ImageAsset) => void | Promise<unknown>;
  onPermanentDeleteHistory: (image: ImageAsset) => void | Promise<unknown>;
  onClose: () => void;
  backNode: FlowNode | null;
  selectedNode: FlowNode | null;
  tasks: TaskRecord[];
  onCancelTask: (taskId: string) => void | Promise<unknown>;
  onDeleteTask: (taskId: string) => void | Promise<unknown>;
  onDeleteFinishedTasks: (taskIds?: string[]) => void | Promise<unknown>;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRetryTask: (taskId: string) => void | Promise<unknown>;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onBackToNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
}) {
  const rawSelectedOutputs = useMemo(
    () => selectedNode?.data.outputs || (selectedNode?.data.output ? [selectedNode.data.output] : []),
    [selectedNode],
  );
  const selectedOutputs = useMemo(() => sortResultImagesForDisplay(rawSelectedOutputs).filter(isUserFacingResultImage), [rawSelectedOutputs]);
  const imageManagerVisibleImages = useMemo(
    () => (imageManagerImages.length ? imageManagerImages : historyImages).filter(isUserFacingResultImage),
    [historyImages, imageManagerImages],
  );
  const [tab, setTab] = useState<RightPanelTab>("tasks");
  const selectedPanelNodeId = selectedNode?.id;
  const taskCounts = useMemo(() => {
    let running = 0;
    let deferred = 0;
    let failed = 0;
    for (const task of tasks) {
      if (isTaskActivelyRunning(task)) running += 1;
      if (isDeferredQueuedTask(task)) deferred += 1;
      if (task.status === "failed" && !taskHasResultImages(task) && !task.resultCount) failed += 1;
    }
    return { running, deferred, failed };
  }, [tasks]);
  const runningTaskCount = taskCounts.running;
  const deferredTaskCount = taskCounts.deferred;
  const failedTaskCount = taskCounts.failed;
  const taskBadgeCount = runningTaskCount + deferredTaskCount + failedTaskCount || tasks.length;
  const panelTitle = {
    params: "参数",
    tasks: "任务中心",
    library: "当前方案",
    images: "图库",
  }[tab];

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
            <div className="text-[16px] font-semibold text-white/90">{panelTitle}</div>
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
            ["library", "当前方案"],
            ["images", "图库"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`apple-segment flex items-center justify-center gap-1 px-1 py-1.5 text-[11px] ${tab === value ? "apple-segment-active" : ""}`}
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
            <NodeInspectorPanel backNode={backNode} imageModel={imageModel} node={selectedNode} onBackToNode={onBackToNode} onCreateAction={onCreateAction} onMaskEdit={onMaskEdit} onParamChange={onParamChange} onRunNode={onRunNode} />
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
              <>
                <div className="apple-surface-section px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-white/82">{selectedNode?.data.title || "当前节点"}</div>
                      <div className="apple-caption mt-0.5">只显示当前节点生成的方案</div>
                    </div>
                    <span className="apple-count-badge shrink-0 px-2 py-1 text-[11px]">{selectedOutputs.length} 张</span>
                  </div>
                </div>
                <NodeResultsPanel
                  compactThumbStyle={compactThumbStyle}
                  imageSourceSummary={imageSourceSummary}
                  images={selectedOutputs}
                  nodeOperationLabel={nodeOperationLabel}
                  onPreview={onPreview}
                  shouldShowCheckerboard={shouldShowCheckerboard}
                />
              </>
            ) : (
                <EmptyPanel
                  icon={<FileImage className="size-8" />}
                title="当前节点暂无结果"
                description="选择有输出的节点后，这里只显示该节点的方案。项目全部图片请到“图库”。"
                />
            )}
          </div>
        </div>
      ) : null}

      {tab === "images" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ImageManagerPanel
            images={imageManagerVisibleImages}
            historyHasMore={imageManagerHasMore || (!imageManagerImages.length && historyHasMore)}
            historyLoadingMore={imageManagerLoading || historyLoadingMore}
            imageDeletionProtection={imageDeletionProtection}
            mergeImages={mergeImages}
            nodeOperationLabel={nodeOperationLabel}
            nodes={nodes}
            projectAssets={projectAssets}
            shouldShowCheckerboard={shouldShowCheckerboard}
            trashHasMore={imageManagerTrashHasMore}
            trashImages={imageManagerTrashImages}
            trashLoadingMore={imageManagerTrashLoading}
            onCopyImage={(image) => onCopyHistory(image as ImageAsset)}
            onDelete={onDeleteHistory}
            onDeleteMany={(images) => onDeleteHistoryMany(images as ImageAsset[])}
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
});
