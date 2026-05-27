import "server-only";

import path from "node:path";
import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store";

export type TaskRunState = "waiting" | "active" | "finished" | "failed" | "cancelled";

export type TaskRunTrace = {
  requestId?: string;
  taskId?: string;
  projectId?: string;
  projectName?: string;
  nodeId?: string;
  nodeName?: string;
  nodeKind?: string;
  operation?: string;
  model?: string;
  route?: string;
};

export type TaskRunOutput = {
  id?: string;
  url?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  fileName?: string;
  variant?: number;
  mode?: string;
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  quality?: string;
  outputSize?: unknown;
  expectedOutputSize?: unknown;
  fileSizeBytes?: number;
  materialType?: string;
  targetSize?: string;
  nodeOperation?: string;
  generatedAt?: string;
  projectId?: string;
  parentImageId?: string;
  rootImageId?: string;
  branchId?: string;
  branchLabel?: string;
  resultGroupId?: string;
  sourceTaskId?: string;
  sourceRequestId?: string;
  sourceNodeId?: string;
  sourceNodeName?: string;
  sourceNodeKind?: string;
  pngLayerExport?: unknown;
};

export type TaskRunRecord = Required<Pick<TaskRunTrace, "requestId">> & {
  taskId?: string;
  projectId?: string;
  projectName?: string;
  nodeId?: string;
  nodeName?: string;
  nodeKind?: string;
  operation: string;
  model?: string;
  route?: string;
  state: TaskRunState;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  durationMs?: number;
  outputCount?: number;
  outputs?: TaskRunOutput[];
  error?: string;
  message?: string;
};

type TaskRunStore = {
  runs: TaskRunRecord[];
};

const taskRunStorePath = path.join(process.cwd(), "task-runs.local.json");
const taskRunLimit = 300;
let taskRunStoreQueue: Promise<unknown> = Promise.resolve();

export function taskTraceFromFormData(formData: FormData, operation: string, route?: string): TaskRunTrace {
  return normalizeTaskTrace({
    requestId: stringField(formData.get("requestId")),
    taskId: stringField(formData.get("taskId")),
    projectId: stringField(formData.get("projectId")),
    projectName: stringField(formData.get("projectName")),
    nodeId: stringField(formData.get("nodeId")),
    nodeName: stringField(formData.get("nodeName")),
    nodeKind: stringField(formData.get("nodeKind")),
    operation,
    model: stringField(formData.get("imageModel")) || stringField(formData.get("model")),
    route,
  });
}

export function taskTraceFromJson(body: Record<string, unknown> | null | undefined, operation: string, route?: string): TaskRunTrace {
  return normalizeTaskTrace({
    requestId: stringValue(body?.requestId),
    taskId: stringValue(body?.taskId),
    projectId: stringValue(body?.projectId),
    projectName: stringValue(body?.projectName),
    nodeId: stringValue(body?.nodeId),
    nodeName: stringValue(body?.nodeName),
    nodeKind: stringValue(body?.nodeKind),
    operation,
    model: stringValue(body?.imageModel) || stringValue(body?.model),
    route,
  });
}

export async function recordTaskRunStarted(trace: TaskRunTrace | null | undefined) {
  const normalized = normalizeTaskTrace(trace || {});
  if (!normalized.requestId) return null;
  const requestId = normalized.requestId;
  return mutateTaskRunStore((store) => {
    const now = new Date().toISOString();
    const existing = store.runs.find((item) => item.requestId === requestId);
    const record: TaskRunRecord = {
      requestId,
      taskId: normalized.taskId || existing?.taskId,
      projectId: normalized.projectId || existing?.projectId,
      projectName: normalized.projectName || existing?.projectName,
      nodeId: normalized.nodeId || existing?.nodeId,
      nodeName: normalized.nodeName || existing?.nodeName,
      nodeKind: normalized.nodeKind || existing?.nodeKind,
      operation: normalized.operation || existing?.operation || "image_task",
      model: normalized.model || existing?.model,
      route: normalized.route || existing?.route,
      state: "active",
      status: "running",
      startedAt: existing?.startedAt || now,
      updatedAt: now,
      message: "服务端已收到请求，正在处理。",
    };
    return { store: upsertTaskRun(store, record), record };
  });
}

export async function recordTaskRunFinished(trace: TaskRunTrace | null | undefined, updates: { outputs?: unknown[]; message?: string; model?: string } = {}) {
  const normalized = normalizeTaskTrace(trace || {});
  if (!normalized.requestId) return null;
  const requestId = normalized.requestId;
  return mutateTaskRunStore((store) => {
    const now = new Date().toISOString();
    const existing = store.runs.find((item) => item.requestId === requestId);
    const startedAt = existing?.startedAt || now;
    const outputs = sanitizeTaskRunOutputs(updates.outputs).map((output) => ({
      ...output,
      projectId: output.projectId || normalized.projectId || existing?.projectId,
    }));
    const record: TaskRunRecord = {
      requestId,
      taskId: normalized.taskId || existing?.taskId,
      projectId: normalized.projectId || existing?.projectId,
      projectName: normalized.projectName || existing?.projectName,
      nodeId: normalized.nodeId || existing?.nodeId,
      nodeName: normalized.nodeName || existing?.nodeName,
      nodeKind: normalized.nodeKind || existing?.nodeKind,
      operation: normalized.operation || existing?.operation || "image_task",
      model: updates.model || normalized.model || existing?.model,
      route: normalized.route || existing?.route,
      state: "finished",
      status: "completed",
      startedAt,
      updatedAt: now,
      endedAt: now,
      durationMs: Math.max(0, Date.parse(now) - Date.parse(startedAt)),
      outputCount: outputs.length,
      outputs,
      message: updates.message || `服务端已完成，生成 ${outputs.length} 个结果。`,
    };
    return { store: upsertTaskRun(store, record), record };
  });
}

export async function recordTaskRunFailed(trace: TaskRunTrace | null | undefined, error: unknown, status = "failed") {
  const normalized = normalizeTaskTrace(trace || {});
  if (!normalized.requestId) return null;
  const requestId = normalized.requestId;
  return mutateTaskRunStore((store) => {
    const now = new Date().toISOString();
    const existing = store.runs.find((item) => item.requestId === requestId);
    const startedAt = existing?.startedAt || now;
    if (existing?.state === "finished" && (existing.outputs?.length || existing.outputCount)) {
      const record: TaskRunRecord = {
        ...existing,
        updatedAt: now,
        message: "任务已完成并有结果，已忽略后到的失败/取消记录。",
      };
      return { store: upsertTaskRun(store, record), record };
    }
    const record: TaskRunRecord = {
      requestId,
      taskId: normalized.taskId || existing?.taskId,
      projectId: normalized.projectId || existing?.projectId,
      projectName: normalized.projectName || existing?.projectName,
      nodeId: normalized.nodeId || existing?.nodeId,
      nodeName: normalized.nodeName || existing?.nodeName,
      nodeKind: normalized.nodeKind || existing?.nodeKind,
      operation: normalized.operation || existing?.operation || "image_task",
      model: normalized.model || existing?.model,
      route: normalized.route || existing?.route,
      state: status === "cancelled" ? "cancelled" : "failed",
      status: status === "cancelled" ? "cancelled" : "failed",
      startedAt,
      updatedAt: now,
      endedAt: now,
      durationMs: Math.max(0, Date.parse(now) - Date.parse(startedAt)),
      error: error instanceof Error ? error.message : String(error || "任务失败"),
      message: "服务端任务失败。",
    };
    return { store: upsertTaskRun(store, record), record };
  });
}

export async function recordTaskRunCancelled(trace: TaskRunTrace | null | undefined, message = "前端已请求停止任务。") {
  return recordTaskRunFailed(trace, message, "cancelled");
}

export function taskRunResponseMeta(
  trace: TaskRunTrace | null | undefined,
  startedAt: number,
  outputs: unknown[] = [],
  status: "completed" | "partial" = "completed",
) {
  const normalized = normalizeTaskTrace(trace || {});
  return {
    requestId: normalized.requestId,
    taskId: normalized.taskId,
    projectId: normalized.projectId,
    projectName: normalized.projectName,
    nodeId: normalized.nodeId,
    nodeName: normalized.nodeName,
    nodeKind: normalized.nodeKind,
    operation: normalized.operation,
    status,
    elapsedMs: Math.max(0, Date.now() - startedAt),
    outputs: sanitizeTaskRunOutputs(outputs),
  };
}

export async function listTaskRuns(requestIds?: string[], options: { projectId?: string } = {}) {
  const store = await readTaskRunStore();
  const idSet = new Set((requestIds || []).map((id) => id.trim()).filter(Boolean));
  return store.runs.filter((run) => {
    if (idSet.size && !idSet.has(run.requestId)) return false;
    if (options.projectId && run.projectId !== options.projectId) return false;
    return true;
  });
}

export async function removeTaskRuns(requestIds: string[], options: { projectId?: string } = {}) {
  const idSet = new Set(requestIds.map((id) => id.trim()).filter(Boolean));
  if (!idSet.size) return 0;
  return mutateTaskRunStore((store) => {
    let removed = 0;
    const runs = store.runs.filter((run) => {
      const matched = idSet.has(run.requestId) && (!options.projectId || run.projectId === options.projectId);
      if (matched) removed += 1;
      return !matched;
    });
    return { store: { runs }, record: syntheticMutationRecord("client_delete", `已删除 ${removed} 条任务记录。`) };
  }).then(() => idSet.size);
}

export async function clearFinishedTaskRuns(options: { projectId?: string } = {}) {
  return mutateTaskRunStore((store) => {
    let removed = 0;
    const runs = store.runs.filter((run) => {
      const terminal = run.state === "finished" || run.state === "failed" || run.state === "cancelled";
      const matched = terminal && (!options.projectId || run.projectId === options.projectId);
      if (matched) removed += 1;
      return !matched;
    });
    return { store: { runs }, record: syntheticMutationRecord("client_clear_finished", `已清理 ${removed} 条已结束任务记录。`) };
  }).then(() => true);
}

function upsertTaskRun(store: TaskRunStore, record: TaskRunRecord): TaskRunStore {
  const runs = [record, ...store.runs.filter((item) => item.requestId !== record.requestId)]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, taskRunLimit);
  return { runs };
}

function syntheticMutationRecord(requestId: string, message: string): TaskRunRecord {
  const now = new Date().toISOString();
  return {
    requestId,
    operation: "client_task_cleanup",
    state: "cancelled",
    status: "cancelled",
    startedAt: now,
    updatedAt: now,
    endedAt: now,
    message,
  };
}

async function readTaskRunStore(): Promise<TaskRunStore> {
  const store = await readJsonWithBackup<TaskRunStore>(taskRunStorePath, { runs: [] });
  return {
    runs: Array.isArray(store.runs) ? store.runs.filter(isTaskRunRecord).slice(0, taskRunLimit) : [],
  };
}

async function writeTaskRunStore(store: TaskRunStore) {
  await writeJsonAtomic(taskRunStorePath, store);
}

function mutateTaskRunStore(mutator: (store: TaskRunStore) => { store: TaskRunStore; record: TaskRunRecord } | Promise<{ store: TaskRunStore; record: TaskRunRecord }>) {
  const next = taskRunStoreQueue.then(async () => {
    const current = await readTaskRunStore();
    const result = await mutator(current);
    await writeTaskRunStore(result.store);
    return result.record;
  });
  taskRunStoreQueue = next.catch(() => undefined);
  return next;
}

function normalizeTaskTrace(trace: TaskRunTrace): TaskRunTrace {
  return {
    requestId: cleanId(trace.requestId),
    taskId: cleanId(trace.taskId),
    projectId: cleanId(trace.projectId),
    projectName: textValue(trace.projectName),
    nodeId: cleanId(trace.nodeId),
    nodeName: textValue(trace.nodeName),
    nodeKind: cleanId(trace.nodeKind),
    operation: cleanId(trace.operation),
    model: textValue(trace.model),
    route: cleanId(trace.route),
  };
}

function sanitizeTaskRunOutputs(outputs: unknown[] | undefined): TaskRunOutput[] {
  if (!Array.isArray(outputs)) return [];
  return outputs
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const output: TaskRunOutput = {
        id: stringValue(source.id),
        url: stringValue(source.url),
        originalUrl: stringValue(source.originalUrl),
        thumbnailUrl: stringValue(source.thumbnailUrl),
        previewUrl: stringValue(source.previewUrl),
        fileName: stringValue(source.fileName),
        variant: numberValue(source.variant),
        mode: stringValue(source.mode),
        model: stringValue(source.model),
        prompt: stringValue(source.prompt),
        aspectRatio: stringValue(source.aspectRatio),
        quality: stringValue(source.quality),
        outputSize: objectValue(source.outputSize),
        expectedOutputSize: objectValue(source.expectedOutputSize),
        fileSizeBytes: numberValue(source.fileSizeBytes),
        materialType: stringValue(source.materialType),
        targetSize: stringValue(source.targetSize),
        nodeOperation: stringValue(source.nodeOperation),
        generatedAt: stringValue(source.generatedAt),
        projectId: stringValue(source.projectId),
        parentImageId: stringValue(source.parentImageId),
        rootImageId: stringValue(source.rootImageId),
        branchId: stringValue(source.branchId),
        branchLabel: stringValue(source.branchLabel),
        resultGroupId: stringValue(source.resultGroupId),
        sourceTaskId: stringValue(source.sourceTaskId),
        sourceRequestId: stringValue(source.sourceRequestId),
        sourceNodeId: stringValue(source.sourceNodeId),
        sourceNodeName: stringValue(source.sourceNodeName),
        sourceNodeKind: stringValue(source.sourceNodeKind),
        pngLayerExport: objectValue(source.pngLayerExport),
      };
      return output.url ? output : null;
    })
    .filter((item): item is TaskRunOutput => Boolean(item))
    .slice(0, 16);
}

function isTaskRunRecord(value: unknown): value is TaskRunRecord {
  return Boolean(value && typeof value === "object" && typeof (value as TaskRunRecord).requestId === "string");
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : undefined;
}

function cleanId(value: unknown) {
  return typeof value === "string" && /^[\w:.-]{1,160}$/.test(value.trim()) ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value : undefined;
}
