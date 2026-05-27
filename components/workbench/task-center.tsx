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
  requestId?: string;
  projectId?: string;
  projectName?: string;
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
  resultOnCanvas?: boolean;
  progress?: number;
  progressLabel?: string;
  backendRunState?: "waiting" | "active" | "finished" | "failed" | "cancelled";
  lastHeartbeatAt?: number;
  deferred?: boolean;
  materialType?: string;
  targetSize?: string;
};

type TaskMachinePhase = "queued" | "model" | "saving" | "verifying" | "completed" | "needs_review" | "failed" | "cancelled" | "stuck";

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
  const successCount = tasks.filter((task) => !taskIsPartialSuccess(task) && ((task.status === "completed" && task.resultOnCanvas) || taskHasVisibleResult(task))).length;
  const failedCount = tasks.filter((task) => task.status === "failed" && !taskHasAnyResult(task)).length;
  const cancelledCount = tasks.filter((task) => task.status === "cancelled").length;
  const attentionTasks = visibleTimelineTasks.filter((task) =>
    (task.status === "failed" && !taskHasAnyResult(task)) ||
    taskIsPartialSuccess(task) ||
    task.status === "cancelled" ||
    isTaskPossiblyStuck(task) ||
    (task.status === "completed" && !task.resultOnCanvas));
  const attentionIds = new Set(attentionTasks.map((task) => task.id));
  const runningTasks = visibleTimelineTasks.filter((task) =>
    !attentionIds.has(task.id) && (task.status === "queued" || task.status === "running" || task.status === "saving"));
  const completedTasks = visibleTimelineTasks.filter((task) => !attentionIds.has(task.id) && ((task.status === "completed" && task.resultOnCanvas) || taskHasVisibleResult(task)));
  const attentionCount = timelineTasks.filter((task) =>
    (task.status === "failed" && !taskHasAnyResult(task)) ||
    taskIsPartialSuccess(task) ||
    task.status === "cancelled" ||
    isTaskPossiblyStuck(task) ||
    (task.status === "completed" && !task.resultOnCanvas)).length;

  function renderTask(task: TaskCenterTask) {
    const stuck = isTaskPossiblyStuck(task);
    const resultImages = task.outputs?.length ? task.outputs : task.result ? [task.result] : [];
    const previewImages = resultImages.length ? resultImages.slice(0, 2) : task.inputs?.[0] ? [task.inputs[0]] : [];
    const previewImage = previewImages[0] || null;
    const canStop = task.status === "running" || task.status === "saving" || (task.status === "queued" && !task.deferred);
    const visibleResult = taskHasVisibleResult(task);
    const canRetry = !visibleResult && (task.status !== "completed" || !task.resultOnCanvas) && !canStop;
    const elapsedMs = (task.endedAt || now) - task.startedAt;
    const modelMs = task.modelDurationMs || (task.requestStartedAt && (task.status === "running" || task.status === "saving") ? now - task.requestStartedAt : undefined);
    const saveMs = task.saveDurationMs || (task.saveStartedAt && task.status === "saving" ? now - task.saveStartedAt : undefined);
    const outputsCount = task.resultCount || task.outputs?.length || (task.result ? 1 : 0);
    const stageLabel = task.stage ? taskStageText(task.stage) : taskStatusLabel(task.status);
    const machinePhase = taskMachinePhase(task, stuck, visibleResult);
    const statusText = taskStatusText(task, stuck, stageLabel, visibleResult, machinePhase);
    const progressText = taskProgressText(task, stuck, outputsCount, stageLabel, visibleResult, machinePhase);
    const recoveryHint = taskRecoveryHint(task, stuck, visibleResult);
    const showDetailedTiming = task.status === "running" || task.status === "saving" || stuck;

    return (
      <article key={task.id} className={`rounded-[20px] border p-3 ${taskCardClass(task, stuck)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/84">{task.nodeName}</div>
            <div className="apple-caption mt-1 truncate">{[task.materialType || task.type, task.targetSize].filter(Boolean).join(" · ")}</div>
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
            <TaskPhaseRail phase={machinePhase} />
            <div className="apple-caption mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-white/42">
              <span className="truncate">开始 {formatGeneratedAt(new Date(task.startedAt).toISOString())}</span>
              <span className="text-right">总耗时 {formatDuration(elapsedMs)}</span>
              {showDetailedTiming && modelMs ? <span className="truncate">模型 {formatDuration(modelMs)}</span> : null}
              {showDetailedTiming && saveMs ? <span className="text-right">保存 {formatDuration(saveMs)}</span> : null}
              {task.projectName || task.projectId ? <span className="truncate">项目 {task.projectName || shortTaskRequestId(task.projectId || "")}</span> : null}
              {task.requestId ? <span className="truncate">请求 {shortTaskRequestId(task.requestId)}</span> : null}
              {task.backendRunState ? <span className="text-right">进程 {taskRunStateLabel(task.backendRunState)}</span> : null}
            </div>
            {task.error ? <div className="apple-caption mt-1 truncate text-[#ffb4a8]">{task.error}</div> : null}
            {recoveryHint ? (
              <div className={`mt-2 rounded-[12px] border px-2.5 py-2 text-[10px] leading-4 ${recoveryHint.tone === "danger" ? "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]" : "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]"}`}>
                {recoveryHint.text}
              </div>
            ) : null}
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
          {canStop ? (
            <span className="apple-caption px-2 text-white/38">停止后可删除</span>
          ) : (
            <button className="apple-button flex items-center gap-1 px-3 py-1.5 text-[11px]" onClick={() => onDelete(task.id)} type="button">
              <Trash2 className="size-3" />
              删除记录
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      <div className="apple-surface-section flex items-center justify-between gap-2 rounded-[18px] px-3 py-2">
        <div className="min-w-0">
          <div className="apple-section-title">任务状态</div>
          <div className="apple-caption mt-0.5 truncate">
            {runningCount ? `${runningCount} 个后台进程` : "暂无后台进程"}
            {successCount ? ` · 成功 ${successCount}` : ""}
            {failedCount ? ` · 失败 ${failedCount}` : ""}
            {cancelledCount ? ` · 已停 ${cancelledCount}` : ""}
            {deferredTasks.length ? ` · ${deferredTasks.length} 个待执行` : ""}
            {attentionCount ? ` · ${attentionCount} 个需处理` : ""}
          </div>
        </div>
        {finishedCount ? (
          <button className="apple-button flex shrink-0 items-center gap-1 px-3 py-1.5 text-[11px]" onClick={onDeleteFinished} type="button">
            <Trash2 className="size-3" />
            清理已结束
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
      {runningTasks.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="apple-section-title">进行中</div>
            <div className="apple-caption">{runningTasks.length} 个</div>
          </div>
          {runningTasks.map(renderTask)}
        </section>
      ) : null}
      {attentionTasks.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="apple-section-title">需要处理</div>
            <div className="apple-caption">{attentionCount} 个</div>
          </div>
          {attentionTasks.map(renderTask)}
        </section>
      ) : null}
      {completedTasks.length ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="apple-section-title">刚完成</div>
            <div className="apple-caption">结果已在画布</div>
          </div>
          {completedTasks.map(renderTask)}
        </section>
      ) : null}
      {timelineTasks.length > visibleTimelineTasks.length ? (
        <button
          className="apple-button w-full px-3 py-2 text-[11px]"
          onClick={() => setVisibleCount((current) => current + 12)}
          type="button"
        >
          显示更多任务（{timelineTasks.length - visibleTimelineTasks.length}）
        </button>
      ) : null}
    </div>
  );
}

function isFinishedTask(task: TaskCenterTask) {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}

function taskImageLabel(image: TaskCenterImage) {
  if (image.materialType) return image.materialType;
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

function shortTaskRequestId(id: string) {
  const clean = id.replace(/^req_/, "");
  if (clean.length <= 8) return clean;
  return clean.slice(-8);
}

function taskRunStateLabel(state: NonNullable<TaskCenterTask["backendRunState"]>) {
  const labels: Record<NonNullable<TaskCenterTask["backendRunState"]>, string> = {
    waiting: "等待",
    active: "运行",
    finished: "已完成",
    failed: "异常",
    cancelled: "已停",
  };
  return labels[state] || state;
}

function taskCardClass(task: TaskCenterTask, stuck: boolean) {
  if (taskHasVisibleResult(task)) return "border-[#74e3c5]/18 bg-[#74e3c5]/[0.035]";
  if (taskIsPartialSuccess(task)) return "border-[#ffd166]/22 bg-[#ffd166]/[0.045]";
  if (task.status === "failed") return "border-[#ff6b5f]/20 bg-[#ff6b5f]/[0.045]";
  if (stuck) return "border-[#ffd166]/22 bg-[#ffd166]/[0.045]";
  if (task.status === "completed") return "border-[#74e3c5]/18 bg-[#74e3c5]/[0.035]";
  if (task.status === "cancelled") return "border-white/10 bg-white/[0.035]";
  return "border-white/10 bg-white/[0.04]";
}

function taskStatusClass(task: TaskCenterTask, stuck: boolean) {
  if (taskHasVisibleResult(task)) return "bg-[#74e3c5]/12 text-[#adf8e5]";
  if (taskIsPartialSuccess(task)) return "bg-[#ffd166]/14 text-[#ffe1a0]";
  if (task.status === "failed") return "bg-[#ff6b5f]/14 text-[#ffb4a8]";
  if (stuck) return "bg-[#ffd166]/14 text-[#ffe1a0]";
  if (task.status === "completed") return "bg-[#74e3c5]/12 text-[#adf8e5]";
  if (task.status === "cancelled") return "bg-white/[0.08] text-white/58";
  return "bg-white/[0.08] text-white/58";
}

function taskProgressClass(task: TaskCenterTask, stuck: boolean) {
  if (taskHasVisibleResult(task)) return "bg-[#74e3c5]";
  if (taskIsPartialSuccess(task)) return "bg-[#ffd166]";
  if (task.status === "failed") return "bg-[#ff6b5f]";
  if (stuck) return "bg-[#ffd166]";
  if (task.status === "completed") return "bg-[#74e3c5]";
  if (task.status === "cancelled") return "bg-white/32";
  return "bg-[#8fa7ff]";
}

function taskStatusText(task: TaskCenterTask, stuck: boolean, stageLabel: string, visibleResult = false, phase = taskMachinePhase(task, stuck, visibleResult)) {
  const phaseLabel = taskPhaseLabel(phase);
  if (phaseLabel) return phaseLabel;
  if (visibleResult) return "成功";
  if (taskIsPartialSuccess(task)) return "部分成功";
  if (task.status === "completed" && taskHasAnyResult(task) && !task.resultOnCanvas) return "待展示";
  if (task.status === "completed") return "成功";
  if (task.status === "failed") return "失败";
  if (task.status === "cancelled") return "已停止";
  if (stuck) return "运行较久";
  if (task.deferred && task.status === "queued") return "待运行";
  return stageLabel;
}

function taskProgressText(task: TaskCenterTask, stuck: boolean, outputsCount: number, stageLabel: string, visibleResult = false, phase = taskMachinePhase(task, stuck, visibleResult)) {
  if (visibleResult) return "结果已显示在画布，任务记录已自动修正";
  if (taskIsPartialSuccess(task)) {
    return "已有可用输出，但结果未完整通过；请预览后决定是否重试";
  }
  if (task.status === "completed") {
    if (task.resultOnCanvas) return "结果已显示在画布，稍后自动收起";
    return outputsCount > 0 ? "已生成结果，但画布未找到结果节点，请检查" : "任务成功，但没有可查看结果，请检查";
  }
  if (task.status === "failed") return task.progressLabel || "任务失败，可重试或删除记录";
  if (task.status === "cancelled") return "已停止，可重试或删除记录";
  if (stuck) return "运行较久，仍在等服务端结果；可继续等待、停止或稍后核验";
  if (phase === "verifying") return task.progressLabel || "正在核验任务记录、结果库和画布节点";
  return task.progressLabel || stageLabel;
}

function taskRecoveryHint(task: TaskCenterTask, stuck: boolean, visibleResult = taskHasVisibleResult(task)): { text: string; tone: "warning" | "danger" } | null {
  if (visibleResult) return null;
  if (taskIsPartialSuccess(task)) {
    return { text: "已有部分图片结果。先预览可用图；如果缺图或质量不稳，再点“重试”补生成。", tone: "warning" };
  }
  if (task.status === "failed") {
    const message = task.error || task.progressLabel || "";
    if (/API|key|401|403|quota|余额|billing|permission/i.test(message)) {
      return { text: "失败多半与 API Key、额度或模型权限有关。先到设置页测试模型，再回来重试。", tone: "danger" };
    }
    if (/timeout|超时|network|fetch|ECONN|socket/i.test(message)) {
      return { text: "像是网络或服务端超时。可以直接重试；如果连续失败，降低质量或减少参考图后再生成。", tone: "warning" };
    }
    return { text: "任务失败。建议先重试一次；仍失败时，缩短提示词、降低质量或换一个图片模型。", tone: "danger" };
  }
  if (stuck) {
    return { text: "任务运行时间偏长。可继续等后台返回；如果超过预期，停止后用相同节点重试。", tone: "warning" };
  }
  if (task.status === "completed" && taskHasAnyResult(task) && !task.resultOnCanvas) {
    return { text: "结果已生成但没有落到画布。先在任务缩略图预览，必要时刷新项目或重新运行节点。", tone: "warning" };
  }
  if (task.status === "completed" && !taskHasAnyResult(task)) {
    return { text: "任务完成但没有拿到图片结果。建议重试，并检查模型是否支持当前操作。", tone: "warning" };
  }
  return null;
}

function taskMachinePhase(task: TaskCenterTask, stuck: boolean, visibleResult = taskHasVisibleResult(task)): TaskMachinePhase {
  if (task.status === "cancelled") return "cancelled";
  if (visibleResult) return "completed";
  if (taskIsPartialSuccess(task)) return "needs_review";
  if (task.status === "failed") return taskHasAnyResult(task) ? "needs_review" : "failed";
  if (task.status === "completed") return taskHasAnyResult(task) && !task.resultOnCanvas ? "needs_review" : "completed";
  if (stuck) return "stuck";
  if (task.status === "saving" || task.stage === "saving") return "saving";
  if (task.stage === "quality") return "verifying";
  if (task.status === "running" || task.stage === "preparing" || task.stage === "generating") return "model";
  if (task.status === "queued" || task.stage === "queued") return "queued";
  return "verifying";
}

function taskPhaseLabel(phase: TaskMachinePhase) {
  const labels: Record<TaskMachinePhase, string> = {
    queued: "排队",
    model: "模型处理中",
    saving: "保存中",
    verifying: "结果核验",
    completed: "成功",
    needs_review: "需处理",
    failed: "失败",
    cancelled: "已停止",
    stuck: "运行较久",
  };
  return labels[phase];
}

const phaseRailSteps: Array<{ key: "queued" | "model" | "saving" | "verifying" | "completed"; label: string }> = [
  { key: "queued", label: "排队" },
  { key: "model", label: "模型" },
  { key: "saving", label: "保存" },
  { key: "verifying", label: "核验" },
  { key: "completed", label: "完成" },
];

function TaskPhaseRail({ phase }: { phase: TaskMachinePhase }) {
  const activeIndex = taskPhaseIndex(phase);
  return (
    <div className="mt-2 grid grid-cols-5 gap-1" aria-label={`任务阶段：${taskPhaseLabel(phase)}`}>
      {phaseRailSteps.map((step, index) => (
        <span
          className={`h-1.5 rounded-full ${taskPhaseStepClass(phase, index, activeIndex)}`}
          key={step.key}
          title={step.label}
        />
      ))}
    </div>
  );
}

function taskPhaseIndex(phase: TaskMachinePhase) {
  if (phase === "queued") return 0;
  if (phase === "model" || phase === "stuck") return 1;
  if (phase === "saving") return 2;
  if (phase === "verifying" || phase === "needs_review") return 3;
  return 4;
}

function taskPhaseStepClass(phase: TaskMachinePhase, index: number, activeIndex: number) {
  if (phase === "failed") return index <= activeIndex ? "bg-[#ff6b5f]" : "bg-white/[0.08]";
  if (phase === "cancelled") return index <= activeIndex ? "bg-white/32" : "bg-white/[0.08]";
  if (phase === "needs_review" || phase === "stuck") return index <= activeIndex ? "bg-[#ffd166]" : "bg-white/[0.08]";
  if (phase === "completed") return "bg-[#74e3c5]";
  if (index < activeIndex) return "bg-[#74e3c5]/75";
  if (index === activeIndex) return "bg-[#8fa7ff]";
  return "bg-white/[0.08]";
}

function taskHasVisibleResult(task: TaskCenterTask) {
  return Boolean(task.resultOnCanvas && (task.outputs?.length || task.result?.url));
}

function taskHasAnyResult(task: TaskCenterTask) {
  return Boolean(task.outputs?.length || task.result?.url || task.resultCount);
}

function taskIsPartialSuccess(task: TaskCenterTask) {
  const outputsCount = task.outputs?.length || (task.result?.url ? 1 : 0) || task.resultCount || 0;
  if (task.status === "failed" && outputsCount > 0) return true;
  return false;
}
