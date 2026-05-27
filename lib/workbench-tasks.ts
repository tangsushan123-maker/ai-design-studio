export type TaskSearchImage = {
  fileName?: string;
  id?: string;
  materialType?: string;
  mode?: string;
  qualityCheck?: {
    actions?: string[];
    clarityCheckLabel?: string;
    deliverability?: string;
    deliverabilityLabel?: string;
    fourKCheckItems?: Array<{ detail?: string; label?: string; passed?: boolean }>;
    importantContentLabel?: string;
    issues?: string[];
    label?: string;
    status?: string;
    textDetailLabel?: string;
  };
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
  return [
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
    ...taskImageSearchFields(task.result),
    ...(task.inputs || []).flatMap(taskImageSearchFields),
    ...(task.outputs || []).flatMap(taskImageSearchFields),
    ...taskStatusAliases(task),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function taskImageSearchFields(image?: TaskSearchImage) {
  if (!image) return [];
  return [
    image.fileName,
    image.id,
    image.materialType,
    image.mode,
    image.url,
    image.qualityCheck?.label,
    image.qualityCheck?.deliverabilityLabel,
    image.qualityCheck?.status,
    image.qualityCheck?.deliverability,
    image.qualityCheck?.clarityCheckLabel,
    image.qualityCheck?.textDetailLabel,
    image.qualityCheck?.importantContentLabel,
    ...(image.qualityCheck?.issues || []),
    ...(image.qualityCheck?.actions || []),
    ...(image.qualityCheck?.fourKCheckItems || []).flatMap((item) => [item.label, item.detail, item.passed ? "通过" : "复查"]),
    ...taskImageQualityAliases(image),
  ];
}

function taskImageQualityAliases(image: TaskSearchImage) {
  const status = image.qualityCheck?.status;
  const deliverability = image.qualityCheck?.deliverability;
  return [
    status === "passed" || deliverability === "ready" ? "可交付 合格" : "",
    deliverability === "needs_review" ? "需复查 建议复查" : "",
    deliverability === "not_ready" ? "不可交付 未达标" : "",
    status === "white_border" ? "白边 有白边" : "",
    status === "ratio_mismatch" ? "比例异常 比例不对" : "",
    status === "size_insufficient" ? "尺寸不足 未达尺寸" : "",
  ];
}

function taskStatusAliases(task: TaskSearchRecord) {
  const status = task.status;
  const backend = task.backendRunState;
  return [
    status === "queued" || backend === "waiting" ? "排队 等待 待执行" : "",
    status === "running" || backend === "active" ? "运行中 生成中 模型处理中" : "",
    status === "saving" ? "保存中" : "",
    status === "completed" || backend === "finished" ? "成功 已完成 完成" : "",
    status === "failed" || backend === "failed" ? "失败 异常 错误 可重试" : "",
    status === "cancelled" || backend === "cancelled" ? "已停止 已取消 停止" : "",
    task.outputs?.length || task.result?.url ? "有结果 有输出" : "",
  ];
}
