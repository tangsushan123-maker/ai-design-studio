import { defaultParamsByKind } from "@/components/workbench/workbench-config";
import { friendlyDisplayError } from "@/components/workbench/workbench-labels";
import { normalizeRestoredCanvasPositions } from "@/components/workbench/workbench-layout";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import {
  exportFormatParam,
  qualityEnhanceDefaultPrompt,
  qualityEnhanceModeFromFitMode,
} from "@/components/workbench/workbench-operation-params";
import { latestTaskByNodeId } from "@/components/workbench/workbench-task-helpers";
import { isActiveNodeStatus, isFinishedNodeStatus } from "@/components/workbench/workbench-task-state";
import type { FlowNode, NodeKind, TaskRecord } from "@/components/workbench/workbench-types";
import { qualityEnhanceQualityParam } from "@/components/workbench/workbench-upscale";
import { stringParam } from "@/components/workbench/workbench-utils";

export function restoreNodes(nodes: FlowNode[], runs: TaskRecord[] = []) {
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
