import { formatFileSize } from "@/lib/workbench-format";
import { projectStorageKey } from "@/components/workbench/workbench-config";
import {
  dismissedImageStorageKey,
  dismissedTaskStorageKey,
  isProjectTaskCachePointer,
  projectTaskStorageKey,
} from "@/components/workbench/workbench-project-helpers";
import { sanitizeProjectTasks } from "@/components/workbench/workbench-task-helpers";
import type {
  ImageAsset,
  ProjectLocalCachePointer,
  ProjectPayload,
  ProjectTaskCachePointer,
  TaskRecord,
} from "@/components/workbench/workbench-types";

export function readProjectTaskCache(projectId: string, fallbackRuns: TaskRecord[]) {
  try {
    const raw = window.localStorage.getItem(projectTaskStorageKey(projectId));
    if (!raw) return filterDismissedProjectTasks(projectId, fallbackRuns);
    const parsed = JSON.parse(raw) as unknown;
    if (isProjectTaskCachePointer(parsed)) return filterDismissedProjectTasks(projectId, fallbackRuns);
    return filterDismissedProjectTasks(projectId, Array.isArray(parsed) ? mergeTaskRecords(parsed as TaskRecord[], fallbackRuns) : fallbackRuns);
  } catch {
    return filterDismissedProjectTasks(projectId, fallbackRuns);
  }
}

export function loadDismissedTaskRefs(projectId: string) {
  try {
    const raw = window.localStorage.getItem(dismissedTaskStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) as { taskIds?: unknown[]; requestIds?: unknown[]; nodeIds?: unknown[] } : {};
    return {
      taskIds: new Set((parsed.taskIds || []).filter((item): item is string => typeof item === "string" && Boolean(item))),
      requestIds: new Set((parsed.requestIds || []).filter((item): item is string => typeof item === "string" && Boolean(item))),
      nodeIds: new Set((parsed.nodeIds || []).filter((item): item is string => typeof item === "string" && Boolean(item))),
    };
  } catch {
    return { taskIds: new Set<string>(), requestIds: new Set<string>(), nodeIds: new Set<string>() };
  }
}

export function writeDismissedTaskRefs(projectId: string, refs: { taskIds: Set<string>; requestIds: Set<string>; nodeIds: Set<string> }) {
  try {
    window.localStorage.setItem(dismissedTaskStorageKey(projectId), JSON.stringify({
      taskIds: [...refs.taskIds].slice(-600),
      requestIds: [...refs.requestIds].slice(-600),
      nodeIds: [...refs.nodeIds].slice(-600),
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
  return refs;
}

export function markDismissedTaskRefs(projectId: string, tasks: TaskRecord[]) {
  const refs = loadDismissedTaskRefs(projectId);
  tasks.forEach((task) => {
    if (task.id) refs.taskIds.add(task.id);
    if (task.requestId) refs.requestIds.add(task.requestId);
  });
  return writeDismissedTaskRefs(projectId, refs);
}

export function markDismissedNodeRefs(projectId: string, nodeIds: string[]) {
  const refs = loadDismissedTaskRefs(projectId);
  nodeIds.filter(Boolean).forEach((nodeId) => refs.nodeIds.add(nodeId));
  return writeDismissedTaskRefs(projectId, refs);
}

export function filterDismissedProjectTasks(projectId: string, tasks: TaskRecord[]) {
  if (!tasks.length) return tasks;
  const refs = loadDismissedTaskRefs(projectId);
  return tasks.filter((task) => !(
    (task.id && refs.taskIds.has(task.id)) ||
    (task.requestId && refs.requestIds.has(task.requestId)) ||
    (task.nodeId && refs.nodeIds.has(task.nodeId))
  ));
}

export function imageSourceDismissedForProject(projectId: string, image: Pick<ImageAsset, "sourceTaskId" | "sourceRequestId" | "sourceNodeId" | "resultGroupId">) {
  const refs = loadDismissedTaskRefs(projectId);
  return Boolean(
    (image.sourceTaskId && refs.taskIds.has(image.sourceTaskId)) ||
    (image.resultGroupId && refs.taskIds.has(image.resultGroupId)) ||
    (image.sourceRequestId && refs.requestIds.has(image.sourceRequestId)) ||
    (image.sourceNodeId && refs.nodeIds.has(image.sourceNodeId))
  );
}

export function loadDismissedImageKeySet(projectId: string) {
  try {
    const raw = window.localStorage.getItem(dismissedImageStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) as { keys?: unknown[] } : {};
    return new Set((parsed.keys || []).filter((item): item is string => typeof item === "string" && Boolean(item)));
  } catch {
    return new Set<string>();
  }
}

export function writeDismissedImageKeySet(projectId: string, keys: Set<string>) {
  try {
    window.localStorage.setItem(dismissedImageStorageKey(projectId), JSON.stringify({
      keys: [...keys].slice(-1200),
      updatedAt: new Date().toISOString(),
    }));
  } catch {}
  return keys;
}

export function markDismissedImageKeys(projectId: string, keys: string[]) {
  const current = loadDismissedImageKeySet(projectId);
  keys.forEach((key) => current.add(key));
  return writeDismissedImageKeySet(projectId, current);
}

export function unmarkDismissedImageKeys(projectId: string, keys: string[]) {
  const current = loadDismissedImageKeySet(projectId);
  keys.forEach((key) => current.delete(key));
  return writeDismissedImageKeySet(projectId, current);
}

export function mergeTaskRecords(primary: TaskRecord[], fallback: TaskRecord[]) {
  const seen = new Set<string>();
  const merged: TaskRecord[] = [];
  for (const task of [...primary, ...fallback]) {
    if (!task?.id || seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }
  return merged.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export function writeProjectTaskCache(projectId: string, tasks: TaskRecord[]) {
  const value = JSON.stringify({
    version: 2,
    storageMode: "file",
    projectId: projectId || "local-project",
    updatedAt: new Date().toISOString(),
    taskCount: sanitizeProjectTasks(tasks).length,
    message: "任务详情已迁移到项目文件和 task-runs.local.json；浏览器缓存只保留轻量指针。",
  } satisfies ProjectTaskCachePointer);
  try {
    const key = projectTaskStorageKey(projectId);
    window.localStorage.setItem(key, value);
    if (window.localStorage.getItem(key) !== value) return "任务记录本地校验未通过，已优先保存到项目文件。";
    return "";
  } catch (error) {
    return localStorageErrorMessage(error, value.length);
  }
}

export function stringifyProjectPayload(payload: ProjectPayload & { setActive?: boolean }) {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    throw new Error(`项目保存失败：项目数据无法序列化（${error instanceof Error ? error.message : "未知错误"}）。`);
  }
}

export function writeProjectLocalCache(key: string, value: string) {
  if (key !== projectStorageKey) return "";
  return writeProjectLocalCachePointer(value);
}

function writeProjectLocalCachePointer(payloadText: string) {
  let pointer: ProjectLocalCachePointer;
  try {
    const payload = JSON.parse(payloadText) as Partial<ProjectPayload>;
    pointer = {
      version: 2,
      storageMode: "file",
      activeProjectId: payload.id || "local-project",
      activeProjectName: payload.name || "AI 设计项目",
      updatedAt: payload.updatedAt || new Date().toISOString(),
      jsonBytes: payloadText.length,
      nodeCount: Array.isArray(payload.nodes) ? payload.nodes.length : 0,
      taskCount: Array.isArray(payload.runs) ? payload.runs.length : 0,
      imageCount: Array.isArray(payload.assets) ? payload.assets.length : 0,
      message: "完整项目已保存到项目文件；浏览器缓存只保留轻量指针。",
    };
  } catch {
    pointer = {
      version: 2,
      storageMode: "file",
      activeProjectId: "local-project",
      activeProjectName: "AI 设计项目",
      updatedAt: new Date().toISOString(),
      jsonBytes: payloadText.length,
      nodeCount: 0,
      taskCount: 0,
      imageCount: 0,
      message: "完整项目已保存到项目文件；浏览器缓存只保留轻量指针。",
    };
  }

  const pointerText = JSON.stringify(pointer);
  try {
    window.localStorage.setItem(projectStorageKey, pointerText);
    if (window.localStorage.getItem(projectStorageKey) !== pointerText) return "本地缓存指针校验未通过，项目文件仍已优先保存。";
    return "";
  } catch (error) {
    return localStorageErrorMessage(error, pointerText.length);
  }
}

export function localStorageErrorMessage(error: unknown, payloadLength: number) {
  const sizeMb = payloadLength / 1024 / 1024;
  const message = error instanceof Error ? error.message : "未知错误";
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return `本地轻量缓存空间不足（${sizeMb.toFixed(2)}MB）。项目正式数据已保存到项目文件，图片资源以文件引用保存。`;
  }
  return `本地缓存写入失败：${message}`;
}

export async function readProjectSaveError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) as { error?: string; details?: string; payloadBytes?: number } : {};
    const payload = data.payloadBytes ? `，请求大小 ${formatFileSize(data.payloadBytes)}` : "";
    return data.error ? `${data.error}${payload}` : `项目保存失败（HTTP ${response.status}${payload}）。`;
  } catch {
    return `项目保存失败（HTTP ${response.status}）：${text.slice(0, 180) || "接口没有返回错误详情"}`;
  }
}

export function isFiniteViewport(viewport?: ProjectPayload["viewport"]): viewport is NonNullable<ProjectPayload["viewport"]> {
  return Boolean(
    viewport &&
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom >= 0.08 &&
    viewport.zoom <= 3,
  );
}
