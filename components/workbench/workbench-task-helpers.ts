import { imageKey, isMaskUtilityImage, removedFeatureTextMarkers } from "@/components/workbench/workbench-image-collection";
import { stripImageFile } from "@/components/workbench/workbench-image-lifecycle";
import { isDeferredQueuedTask } from "@/components/workbench/workbench-task-state";
import { stringParam } from "@/components/workbench/workbench-utils";
import type {
  FlowNode,
  ImageAsset,
  ServerTaskRunRecord,
  TaskRecord,
  TaskResultMatchContext,
} from "@/components/workbench/workbench-types";

export function sanitizeProjectTasks(runs: TaskRecord[]) {
  return runs
    .filter((task) => !isRemovedFeatureTask(task))
    .map((task) => ({
      ...task,
      inputs: task.inputs?.map(stripImageFile),
      outputs: task.outputs?.map(stripImageFile),
      result: task.result ? stripImageFile(task.result) : undefined,
    }));
}

export function isRemovedFeatureTask(task: Pick<TaskRecord, "type" | "nodeName">) {
  const text = `${task.type || ""} ${task.nodeName || ""}`;
  return removedFeatureTextMarkers().some((marker) => text.includes(marker));
}

export function taskHasResultImages(task: Pick<TaskRecord, "outputs" | "result">) {
  return Boolean(task.outputs?.length || task.result?.url);
}

export function taskNeedsServerSync(task: TaskRecord) {
  if (!task.requestId || isDeferredQueuedTask(task)) return false;
  if (task.status === "queued" || task.status === "running" || task.status === "saving") return true;
  if (task.status === "completed" && !taskHasResultImages(task)) return true;
  if (task.status === "failed" && !taskHasResultImages(task)) return true;
  return false;
}

export function restoreProjectTasks(runs: TaskRecord[]) {
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

export function latestTaskByNodeId(runs: TaskRecord[]) {
  const taskMap = new Map<string, TaskRecord>();
  for (const task of runs) {
    if (!task.nodeId) continue;
    const current = taskMap.get(task.nodeId);
    if (!current || (task.startedAt || 0) > (current.startedAt || 0)) taskMap.set(task.nodeId, task);
  }
  return taskMap;
}

export function taskBelongsToProject(task: Pick<TaskRecord, "projectId">, projectId: string) {
  return !task.projectId || task.projectId === projectId;
}

export function imageBelongsToProject(image: Pick<ImageAsset, "projectId">, projectId: string) {
  return Boolean(projectId && image.projectId === projectId);
}

export function serverTaskRunState(run: ServerTaskRunRecord): NonNullable<TaskRecord["backendRunState"]> {
  if (run.state === "finished") return "finished";
  if (run.state === "failed") return "failed";
  if (run.state === "cancelled") return "cancelled";
  if (run.state === "waiting") return "waiting";
  return "active";
}

export function serverTaskRunOutputs(run: ServerTaskRunRecord): ImageAsset[] {
  return (run.outputs || [])
    .filter(isImageAssetLike)
    .map((image, index) => ({
      ...image,
      id: image.id || image.fileName || `server_result_${run.requestId}_${index + 1}`,
      source: "generated" as const,
      projectId: image.projectId || run.projectId,
      sourceTaskId: image.sourceTaskId || run.requestId.replace(/^req_/, "task_"),
      sourceRequestId: image.sourceRequestId || run.requestId,
      sourceNodeId: image.sourceNodeId || run.nodeId,
      sourceNodeName: image.sourceNodeName || run.nodeName,
      sourceNodeKind: image.sourceNodeKind || run.nodeKind,
      generatedAt: image.generatedAt || run.endedAt || run.updatedAt || new Date().toISOString(),
    }));
}

export function serverTaskRunFailureLabel(run: ServerTaskRunRecord) {
  const categoryLabels: Record<string, string> = {
    auth_or_billing: "Key、权限或余额异常",
    content_blocked: "内容安全策略拒绝",
    image_input_failed: "输入图片读取失败",
    invalid_size: "尺寸或比例不支持",
    model_timeout: "模型超时或上游网络不稳定",
    rate_limited: "接口限流或额度不足",
    save_failed: "结果保存失败",
    server_restarted: "后台重启中断",
    stale_heartbeat: "后台心跳超时",
    unknown: "服务端任务失败",
  };
  const base = run.message || (run.errorCategory ? categoryLabels[run.errorCategory] : "") || run.error || "服务端任务失败";
  if (run.retryable === true) return `${base}，可重试`;
  if (run.retryable === false) return `${base}，需要检查配置、内容或素材`;
  return base;
}

export function taskCandidateImagesFromNode(node: FlowNode) {
  return [
    node.data.output,
    ...(Array.isArray(node.data.outputs) ? node.data.outputs : []),
  ].filter((image): image is ImageAsset => isImageAssetLike(image) && !isMaskUtilityImage(image));
}

export function recoverTaskCanvasResultFromNodes(nodes: FlowNode[], task: TaskResultMatchContext) {
  const canvasNodeIds = new Set(nodes.map((node) => node.id));
  const recoveredNodeIds = new Set((task.resultNodeIds || []).filter((nodeId) => canvasNodeIds.has(nodeId)));
  const recoveredOutputs: ImageAsset[] = [];
  const seen = new Set<string>();
  const addImage = (image: unknown, force = false, nodeId?: string) => {
    if (!isImageAssetLike(image)) return;
    if (!force && !taskResultImageMatches(image, task)) return;
    const key = imageKey(image);
    if (!key || seen.has(key)) return;
    seen.add(key);
    recoveredOutputs.push(image);
    if (nodeId) recoveredNodeIds.add(nodeId);
  };

  nodes.forEach((node) => {
    const candidates = taskCandidateImagesFromNode(node);
    const knownResultNode = recoveredNodeIds.has(node.id);
    candidates.forEach((image) => addImage(image, knownResultNode, node.id));
  });

  return {
    outputs: recoveredOutputs,
    resultNodeIds: [...recoveredNodeIds],
  };
}

export function hasTaskResultNodesOnCanvasFromNodes(nodes: FlowNode[], task: TaskResultMatchContext) {
  const recovered = recoverTaskCanvasResultFromNodes(nodes, task);
  if (recovered.outputs.length) return true;
  if (!task.resultNodeIds?.length) return false;
  const canvasNodeIds = new Set(nodes.map((node) => node.id));
  return task.resultNodeIds.every((nodeId) => canvasNodeIds.has(nodeId));
}

export function buildTaskRecoveredCompletionPatch(
  task: TaskRecord,
  recovered: { outputs: ImageAsset[]; resultNodeIds: string[] },
): Partial<TaskRecord> {
  return {
    status: "completed",
    stage: "completed",
    backendRunState: "finished",
    endedAt: task.endedAt || Date.now(),
    result: recovered.outputs[0],
    outputs: recovered.outputs,
    resultCount: recovered.outputs.length,
    resultNodeIds: recovered.resultNodeIds,
    progress: 100,
    error: "",
    progressLabel: "已核验：结果已在画布，任务记录已自动修正",
  };
}

export function strategyMetaFromParams(params: Record<string, unknown>): Partial<TaskRecord> {
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

export function isImageAssetLike(value: unknown): value is ImageAsset {
  return Boolean(value && typeof value === "object" && typeof (value as ImageAsset).url === "string" && (value as ImageAsset).url);
}

export function taskResultImageMatches(image: ImageAsset, task: TaskResultMatchContext) {
  const imageTaskIds = [image.sourceTaskId, image.resultGroupId].filter(Boolean);
  if (task.id && imageTaskIds.includes(task.id)) return true;
  if (task.requestId && image.sourceRequestId === task.requestId) return true;
  if (task.nodeId && image.sourceNodeId === task.nodeId) return true;
  if (task.id && typeof image.branchId === "string" && image.branchId.startsWith(`${task.id}_branch_`)) return true;
  const key = imageKey(image);
  if (task.result && imageKey(task.result) === key) return true;
  return Boolean(task.outputs?.some((item) => imageKey(item) === key));
}
