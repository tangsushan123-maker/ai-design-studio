import { heavyImageTaskStuckMs, imageTaskStuckMs } from "@/components/workbench/workbench-config";
import type { ImageAsset, NodeStatus, TaskRecord } from "@/components/workbench/workbench-types";

export function isActiveNodeStatus(status?: NodeStatus) {
  return status === "queued" || status === "running" || status === "saving";
}

export function isFinishedNodeStatus(status?: NodeStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function isDeferredQueuedTask(task: TaskRecord) {
  return Boolean(task.deferred && task.status === "queued");
}

export function isTaskActivelyRunning(task: TaskRecord) {
  if (isDeferredQueuedTask(task)) return false;
  return task.status === "queued" || task.status === "running" || task.status === "saving";
}

export function isTaskPossiblyStuck(task: TaskRecord) {
  if (isDeferredQueuedTask(task)) return false;
  if (task.endedAt) return false;
  if (task.status !== "queued" && task.status !== "running" && task.status !== "saving") return false;
  return Date.now() - task.startedAt > taskStuckThresholdMs(task);
}

export function taskStuckThresholdMs(task: Pick<TaskRecord, "nodeName" | "type">) {
  const label = `${task.nodeName || ""} ${task.type || ""}`;
  if (/画质增强|高清|4K|局部 AI 修改|局部修改|PNG 分层|PNG分层|参考图重制|设计优化/.test(label)) return heavyImageTaskStuckMs;
  return imageTaskStuckMs;
}

export function isQualityGateBlocked(image?: ImageAsset) {
  const status = image?.qualityCheck?.status;
  return status === "size_insufficient" || status === "ratio_mismatch" || status === "white_border" || status === "blurred_padding" || status === "failed" || status === "empty";
}
