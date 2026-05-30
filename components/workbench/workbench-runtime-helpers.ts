import { isUserFacingResultImage } from "@/components/workbench/workbench-image-collection";
import { completedTaskLabel, nodeOperationLabel } from "@/components/workbench/workbench-labels";
import {
  imageBelongsToProject,
  serverTaskRunFailureLabel,
  serverTaskRunOutputs,
  serverTaskRunState,
  taskCandidateImagesFromNode,
} from "@/components/workbench/workbench-task-helpers";
import { isTextReferenceTargetHandle } from "@/components/workbench/workbench-text-references";
import type {
  FlowEdge,
  FlowNode,
  ImageAsset,
  NodeKind,
  NodeStatus,
  ServerTaskRunRecord,
  TaskRecord,
  WorkbenchModelInfo,
} from "@/components/workbench/workbench-types";
import type { ModelCatalogItem } from "@/lib/openai-defaults";

export function projectUserFacingImages(images: ImageAsset[], projectId: string) {
  const visible: ImageAsset[] = [];
  for (const image of images) {
    if (imageBelongsToProject(image, projectId) && isUserFacingResultImage(image)) visible.push(image);
  }
  return visible;
}

export function countProjectUserFacingImages(images: ImageAsset[], projectId: string) {
  let count = 0;
  for (const image of images) {
    if (imageBelongsToProject(image, projectId) && isUserFacingResultImage(image)) count += 1;
  }
  return count;
}

export function countTextReferenceEdges(edges: FlowEdge[], targetNodeId: string | null | undefined) {
  if (!targetNodeId) return 0;
  const sources = new Set<string>();
  for (const edge of edges) {
    if (edge.target === targetNodeId && isTextReferenceTargetHandle(edge.targetHandle)) sources.add(edge.source);
  }
  return sources.size;
}

export function countEdgesFromSource(edges: FlowEdge[], sourceNodeId: string) {
  let count = 0;
  for (const edge of edges) {
    if (edge.source === sourceNodeId) count += 1;
  }
  return count;
}

export function countImagesInResultGroup(images: ImageAsset[], resultGroupId: string | null | undefined) {
  if (!resultGroupId) return 0;
  let count = 0;
  for (const image of images) {
    if (image.resultGroupId === resultGroupId) count += 1;
  }
  return count;
}

export function saveStateLabel(state: "saved" | "saving" | "error", hasQueuedSave: boolean) {
  if (state === "saving") return hasQueuedSave ? "保存中 · 有新修改" : "保存中";
  if (state === "error") return "保存失败";
  return "已自动保存";
}

export function selectedNodeRunEstimate(kind: NodeKind) {
  const estimates: Record<NodeKind, string> = {
    image_input: "无需生成",
    text_to_image: "通常 1-5 分钟，复杂参考图会更久",
    image_to_image: "通常 2-6 分钟",
    fuse_images: "通常 3-8 分钟",
    outpaint: "通常 5-12 分钟",
    resize: "通常 5-12 分钟",
    replace_product: "已冻结",
    mask_edit: "通常 2-6 分钟",
    hd_redraw: "通常 2-7 分钟",
    upscale_4k: "通常 2-7 分钟",
    reference_remake: "通常 2-6 分钟",
    design_optimize: "通常 2-6 分钟",
    png_layers: "通常 2-6 分钟",
    output: "几秒内完成",
  };
  return estimates[kind] || "按图片复杂度决定";
}

export function taskRecordFromServerRun(run: ServerTaskRunRecord, fallbackProjectId: string, fallbackProjectName: string): TaskRecord | null {
  if (!run.requestId) return null;
  const extended = run as ServerTaskRunRecord & { startedAt?: string; taskId?: string; model?: string; operation?: string };
  const startedAt = Date.parse(extended.startedAt || run.updatedAt || run.endedAt || "");
  const endedAt = run.endedAt ? Date.parse(run.endedAt) : undefined;
  const outputs = serverTaskRunOutputs(run);
  const status: NodeStatus = run.state === "waiting"
    ? "queued"
    : run.state === "active"
      ? "running"
      : run.state === "finished"
        ? "completed"
        : run.state;
  return {
    id: extended.taskId || run.requestId.replace(/^req_/, "task_"),
    requestId: run.requestId,
    projectId: run.projectId || fallbackProjectId,
    projectName: run.projectName || fallbackProjectName,
    nodeId: run.nodeId || `server_${run.requestId}`,
    nodeName: run.nodeName || nodeOperationLabel(run.nodeKind || extended.operation) || "后台任务",
    type: nodeOperationLabel(run.nodeKind || extended.operation) || "后台任务",
    model: extended.model || "server",
    status,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    endedAt: Number.isFinite(endedAt) ? endedAt : undefined,
    stage: status === "queued" ? "queued" : status === "running" ? "generating" : status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed",
    backendRunState: serverTaskRunState(run),
    lastHeartbeatAt: Date.now(),
    result: outputs[0],
    outputs,
    resultCount: outputs.length || run.outputCount || 0,
    error: run.error || "",
    errorCategory: run.errorCategory,
    retryable: run.retryable,
    progress: status === "completed" || status === "failed" || status === "cancelled" ? 100 : status === "queued" ? 8 : 58,
    progressLabel: status === "completed"
      ? completedTaskLabel(outputs.length, outputs[0])
      : status === "failed"
        ? serverTaskRunFailureLabel(run)
        : run.message || "已从后台任务流水恢复，继续同步状态",
  };
}

export function taskRequestIds(tasks: TaskRecord[]) {
  const requestIds: string[] = [];
  for (const task of tasks) {
    if (task.requestId) requestIds.push(task.requestId);
  }
  return requestIds;
}

export function withConfiguredImageModel(passedModels: ModelCatalogItem[], modelInfo: WorkbenchModelInfo) {
  const configuredId = modelInfo.imageModel?.trim();
  if (!modelInfo.hasKey || !configuredId || passedModels.some((item) => item.id === configuredId)) return passedModels;
  const configured = modelInfo.modelsCache?.find((item) => item.id === configuredId && item.capabilities.includes("image"));
  return [
    ...passedModels,
    configured || {
      id: configuredId,
      label: configuredId,
      capabilities: ["image"],
      testStatus: "untested",
    },
  ];
}

export function taskCandidateImagesFromNodes(nodes: FlowNode[]) {
  const images: ImageAsset[] = [];
  for (const node of nodes) {
    images.push(...taskCandidateImagesFromNode(node));
  }
  return images;
}

export function mergeImageIdList(currentIds: string[] | undefined, nextIds: string[]) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(currentIds || []), ...nextIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function applyNodeGeneratedOutputs(nodes: FlowNode[], nodeId: string, outputs: ImageAsset[], status: NodeStatus = "completed") {
  if (!outputs.length) return nodes;
  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            output: outputs[0],
            outputs,
            resultCount: outputs.length,
            status,
            error: "",
          },
        }
      : node,
  );
}

export function buildCompletedTaskOutputPatch({
  outputs,
  resultNodeIds,
  saveStartedAt,
  endedAt,
  qualityWarningLabel,
}: {
  outputs: ImageAsset[];
  resultNodeIds: string[];
  saveStartedAt: number;
  endedAt: number;
  qualityWarningLabel?: string;
}): Partial<TaskRecord> {
  return {
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
    progressLabel: qualityWarningLabel
      ? `已生成结果，质检提醒：${qualityWarningLabel}`
      : completedTaskLabel(outputs.length, outputs[0]),
    error: undefined,
  };
}
