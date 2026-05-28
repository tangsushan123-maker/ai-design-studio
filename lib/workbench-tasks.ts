import { appendQualitySearchFields, searchFieldsToText, type SearchableQualityCheck } from "./workbench-search.ts";

export type TaskSearchImage = {
  fileName?: string;
  id?: string;
  materialType?: string;
  mode?: string;
  qualityCheck?: SearchableQualityCheck;
  url?: string;
};

export type TaskSearchRecord = {
  backendRunState?: "waiting" | "active" | "finished" | "failed" | "cancelled";
  error?: string;
  id: string;
  inputs?: TaskSearchImage[];
  materialType?: string;
  model?: string;
  nodeName: string;
  outputs?: TaskSearchImage[];
  progressLabel?: string;
  projectId?: string;
  projectName?: string;
  requestId?: string;
  result?: TaskSearchImage;
  stage?: string;
  status: string;
  targetSize?: string;
  type: string;
};

export function taskMatchesSearch(task: TaskSearchRecord, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return taskSearchText(task).includes(keyword);
}

export function taskSearchText(task: TaskSearchRecord) {
  const fields: Array<string | null | undefined> = [
    task.backendRunState,
    task.error,
    task.id,
    task.materialType,
    task.model,
    task.nodeName,
    task.progressLabel,
    task.projectId,
    task.projectName,
    task.requestId,
    task.stage,
    task.status,
    task.targetSize,
    task.type,
  ];
  appendTaskImageSearchFields(fields, task.result);
  appendTaskImagesSearchFields(fields, task.inputs);
  appendTaskImagesSearchFields(fields, task.outputs);
  appendTaskStatusAliases(fields, task);
  return searchFieldsToText(fields);
}

function appendTaskImagesSearchFields(fields: Array<string | null | undefined>, images: TaskSearchImage[] | undefined) {
  if (!images) return;
  for (const image of images) appendTaskImageSearchFields(fields, image);
}

function appendTaskImageSearchFields(fields: Array<string | null | undefined>, image?: TaskSearchImage) {
  if (!image) return;
  fields.push(
    image.fileName,
    image.id,
    image.materialType,
    image.mode,
    image.url,
  );
  appendQualitySearchFields(fields, image.qualityCheck);
}

function appendTaskStatusAliases(fields: Array<string | null | undefined>, task: TaskSearchRecord) {
  const status = task.status;
  const backend = task.backendRunState;
  fields.push(
    status === "queued" || backend === "waiting" ? "排队 等待 待执行" : "",
    status === "running" || backend === "active" ? "运行中 生成中 模型处理中" : "",
    status === "saving" ? "保存中" : "",
    status === "completed" || backend === "finished" ? "成功 已完成 完成" : "",
    status === "failed" || backend === "failed" ? "失败 异常 错误 可重试" : "",
    status === "cancelled" || backend === "cancelled" ? "已停止 已取消 停止" : "",
    task.outputs?.length || task.result?.url ? "有结果 有输出" : "",
  );
}
