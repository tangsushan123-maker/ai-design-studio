import { imageKey, removedFeatureTextMarkers } from "@/components/workbench/workbench-image-collection";
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

export function taskCandidateImagesFromNode(node: FlowNode) {
  return [
    node.data.output,
    ...(Array.isArray(node.data.outputs) ? node.data.outputs : []),
  ].filter(isImageAssetLike);
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
