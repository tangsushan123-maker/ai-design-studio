"use client";

import { RefreshCcw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ImageFrame } from "@/components/workbench/image-frame";

type TaskCenterImage = {
  id?: string;
  fileName?: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  materialType?: string;
  mode?: string;
};

export type TaskCenterTask = {
  id: string;
  nodeName: string;
  type: string;
  model?: string;
  status: string;
  startedAt: number;
  endedAt?: number;
  stage?: string;
  requestStartedAt?: number;
  saveStartedAt?: number;
  modelDurationMs?: number;
  saveDurationMs?: number;
  error?: string;
  result?: TaskCenterImage;
  inputs?: TaskCenterImage[];
  outputs?: TaskCenterImage[];
  resultCount?: number;
  progress?: number;
  progressLabel?: string;
  deferred?: boolean;
  materialType?: string;
  targetSize?: string;
};

export function TaskCenter({
  onCancel,
  onDelete,
  onDeleteFinished,
  onPreview,
  onRetry,
  tasks,
  emptyState,
  formatDuration,
  formatGeneratedAt,
  isDeferredQueuedTask,
  isTaskPossiblyStuck,
  taskStatusLabel,
}: {
  onCancel: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onDeleteFinished: () => void;
  onPreview: (image: TaskCenterImage) => void;
  onRetry: (taskId: string) => void;
  tasks: TaskCenterTask[];
  emptyState?: React.ReactNode;
  formatDuration: (milliseconds: number) => string;
  formatGeneratedAt: (value?: string) => string;
  isDeferredQueuedTask: (task: TaskCenterTask) => boolean;
  isTaskPossiblyStuck: (task: TaskCenterTask) => boolean;
  taskStatusLabel: (status: string) => string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!tasks.length) {
    return emptyState || null;
  }

  const deferredTasks = tasks.filter(isDeferredQueuedTask);
  const timelineTasks = tasks.filter((task) => !isDeferredQueuedTask(task));
  const visibleTimelineTasks = timelineTasks.slice(0, visibleCount);
  const finishedCount = tasks.filter(isFinishedTask).length;
  const runningCount = tasks.filter((task) => !isDeferredQueuedTask(task) && (task.status === "queued" || task.status === "running" || task.status === "saving")).length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;

  function renderTask(task: TaskCenterTask) {
    const stuck = isTaskPossiblyStuck(task);
    const resultImages = task.outputs?.length ? task.outputs : task.result ? [task.result] : [];
    const previewImages = resultImages.length ? resultImages.slice(0, 2) : task.inputs?.[0] ? [task.inputs[0]] : [];
    const previewImage = previewImages[0] || null;
    const canStop = task.status === "running" || task.status === "saving" || (task.status === "queued" && !task.deferred);
    const canRetry = task.status !== "completed" && !canStop;
    const elapsedMs = (task.endedAt || now) - task.startedAt;
    const modelMs = task.modelDurationMs || (task.requestStartedAt && (task.status === "running" || task.status === "saving") ? now - task.requestStartedAt : undefined);
    const saveMs = task.saveDurationMs || (task.saveStartedAt && task.status === "saving" ? now - task.saveStartedAt : undefined);
    const outputsCount = task.resultCount || task.outputs?.length || (task.result ? 1 : 0);
    const stageLabel = task.stage ? taskStageText(task.stage) : taskStatusLabel(task.status);
    const statusText = taskStatusText(task, stuck, stageLabel);
    const progressText = taskProgressText(task, stuck, outputsCount, stageLabel);
    const showDetailedTiming = task.status === "running" || task.status === "saving" || stuck;

    return (
      <article key={task.id} className={`rounded-[20px] border p-3 ${taskCardClass(task, stuck)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/84">{task.nodeName}</div>
            <div className="apple-caption mt-1 truncate">
              {[task.materialType ? `${task.materialType} · ${task.targetSize || "未指定尺寸"}` : task.type, task.model].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] ${taskStatusClass(task, stuck)}`}
          >
            {statusText}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          {previewImages.length > 1 ? (
            <div className="grid size-16 shrink-0 grid-cols-2 gap-1 overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.035] p-1">
              {previewImages.map((image) => (
                <button aria-label={`预览${taskImageLabel(image)}`} className="min-w-0 overflow-hidden rounded-[13px]" key={image.url || image.id} onClick={() => onPreview(image)} type="button">
	                  <ImageFrame alt={taskImageLabel(image)} className="rounded-[13px] border-0" fit="contain" image={image} preserveRatio={false} variant="thumbnail" style={{ width: "100%", height: "100%" }} />
                </button>
              ))}
            </div>
          ) : previewImage ? (
            <button aria-label={`预览${taskImageLabel(previewImage)}`} className="shrink-0" onClick={() => onPreview(previewImage)} type="button">
	              <ImageFrame alt={taskImageLabel(previewImage)} className="rounded-[18px]" fit="contain" image={previewImage} preserveRatio={false} variant="thumbnail" style={{ width: 64, height: 64 }} />
            </button>
          ) : (
            <div className="flex size-16 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.035]">
              {task.status === "running" || task.status === "saving" || (task.status === "queued" && !task.deferred) ? (
                <RefreshCcw className="size-4 animate-spin text-white/46" />
              ) : (
                <Sparkles className="size-4 text-white/26" />
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                <span
                  className={`block h-full rounded-full ${taskProgressClass(task, stuck)}`}
                  style={{ width: `${Math.max(4, Math.min(100, task.progress || 4))}%` }}
                />
              </span>
              <span className="w-9 text-right text-[10px] text-white/46">{Math.round(task.progress || 0)}%</span>
            </div>
            <div className="truncate text-[11px] text-white/56">
              {progressText}
            </div>
            <div className="apple-caption mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-white/42">
              <span className="truncate">开始 {formatGeneratedAt(new Date(task.startedAt).toISOString())}</span>
              <span className="text-right">总耗时 {formatDuration(elapsedMs)}</span>
              {showDetailedTiming && modelMs ? <span className="truncate">模型 {formatDuration(modelMs)}</span> : null}
              {showDetailedTiming && saveMs ? <span className="text-right">保存 {formatDuration(saveMs)}</span> : null}
            </div>
            {task.error ? <div className="apple-caption mt-1 truncate text-[#ffb4a8]">{task.error}</div> : null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          {canStop ? (
            <button className="apple-button-danger px-3 py-1.5 text-[11px]" onClick={() => onCancel(task.id)} type="button">
              停止
            </button>
          ) : null}
          {canRetry ? (
            <button className="apple-button px-3 py-1.5 text-[11px]" onClick={() => onRetry(task.id)} type="button">
              {task.status === "queued" ? "运行" : "重试"}
            </button>
          ) : null}
          <button className="apple-button flex items-center gap-1 px-3 py-1.5 text-[11px]" onClick={() => onDelete(task.id)} type="button">
            <Trash2 className="size-3" />
            删除记录
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      <div className="apple-surface-section flex items-center justify-between gap-2 rounded-[18px] px-3 py-2">
        <div className="min-w-0">
          <div className="apple-section-title">任务记录</div>
          <div className="apple-caption mt-0.5 truncate">
            {runningCount ? `${runningCount} 个进行中` : "暂无进行中"}
            {deferredTasks.length ? ` · ${deferredTasks.length} 个待执行` : ""}
            {failedCount ? ` · ${failedCount} 个失败` : ""}
          </div>
        </div>
        {finishedCount ? (
          <button className="apple-button flex shrink-0 items-center gap-1 px-3 py-1.5 text-[11px]" onClick={onDeleteFinished} type="button">
            <Trash2 className="size-3" />
            一键清空已结束
          </button>
        ) : null}
      </div>
      {deferredTasks.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="apple-section-title">待执行任务</div>
            <div className="apple-caption">{deferredTasks.length} 个</div>
          </div>
          {deferredTasks.map(renderTask)}
        </section>
      ) : null}
      {timelineTasks.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="apple-section-title">任务进度</div>
            <div className="apple-caption">{timelineTasks.length} 个</div>
          </div>
          {visibleTimelineTasks.map(renderTask)}
          {timelineTasks.length > visibleTimelineTasks.length ? (
            <button
              className="apple-button w-full px-3 py-2 text-[11px]"
              onClick={() => setVisibleCount((current) => current + 12)}
              type="button"
            >
              显示更多任务（{timelineTasks.length - visibleTimelineTasks.length}）
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function isFinishedTask(task: TaskCenterTask) {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}

function taskImageLabel(image: TaskCenterImage) {
  if (image.materialType === "无文字背景") return "无文字背景";
  if (image.materialType === "文字透明PNG") return "文字透明 PNG";
  if (image.materialType) return image.materialType;
  if (image.mode?.includes("无文字背景")) return "无文字背景";
  if (image.mode?.includes("文字透明")) return "文字透明 PNG";
  return image.fileName?.split("/").pop() || image.id || "任务预览";
}

function taskStageText(stage: string) {
  const labels: Record<string, string> = {
    queued: "排队",
    preparing: "准备素材",
    generating: "模型生成",
    saving: "保存中",
    quality: "检查结果",
    completed: "完成",
    failed: "失败",
    cancelled: "已停止",
  };
  return labels[stage] || stage;
}

function taskCardClass(task: TaskCenterTask, stuck: boolean) {
  if (task.status === "failed" || stuck) return "border-[#ff6b5f]/20 bg-[#ff6b5f]/[0.045]";
  if (task.status === "completed") return "border-[#74e3c5]/18 bg-[#74e3c5]/[0.035]";
  if (task.status === "cancelled") return "border-white/10 bg-white/[0.035]";
  return "border-white/10 bg-white/[0.04]";
}

function taskStatusClass(task: TaskCenterTask, stuck: boolean) {
  if (task.status === "failed" || stuck) return "bg-[#ff6b5f]/14 text-[#ffb4a8]";
  if (task.status === "completed") return "bg-[#74e3c5]/12 text-[#adf8e5]";
  if (task.status === "cancelled") return "bg-white/[0.08] text-white/58";
  return "bg-white/[0.08] text-white/58";
}

function taskProgressClass(task: TaskCenterTask, stuck: boolean) {
  if (task.status === "failed" || stuck) return "bg-[#ff6b5f]";
  if (task.status === "completed") return "bg-[#74e3c5]";
  if (task.status === "cancelled") return "bg-white/32";
  return "bg-[#8fa7ff]";
}

function taskStatusText(task: TaskCenterTask, stuck: boolean, stageLabel: string) {
  if (task.status === "completed") return "成功";
  if (task.status === "failed") return "失败";
  if (task.status === "cancelled") return "已停止";
  if (stuck) return "可能卡住";
  if (task.deferred && task.status === "queued") return "待运行";
  return stageLabel;
}

function taskProgressText(task: TaskCenterTask, stuck: boolean, outputsCount: number, stageLabel: string) {
  if (task.status === "completed") {
    return outputsCount > 0 ? "成功，结果已显示在画布，记录会保留到你手动删除" : "成功，记录会保留到你手动删除";
  }
  if (task.status === "failed") return task.progressLabel || "任务失败，可重试或删除记录";
  if (task.status === "cancelled") return "已停止，可重试或删除记录";
  if (stuck) return "超过 3 分钟无结果，可停止或重试";
  return task.progressLabel || stageLabel;
}
