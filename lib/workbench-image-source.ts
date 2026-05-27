export type ImageSourceTrace = {
  durationMs?: number;
  generatedAt?: string;
  nodeOperation?: string;
  sourceNodeId?: string;
  sourceNodeKind?: string;
  sourceNodeName?: string;
  sourceRequestId?: string;
  sourceStrategyTitle?: string;
  sourceTaskId?: string;
};

export type ImageSourceDetailOptions = {
  formatDuration: (milliseconds: number) => string;
  formatGeneratedAt: (value?: string) => string;
  labelForOperation?: (value?: string) => string;
};

export function imageSourceSummary(
  image: ImageSourceTrace,
  labelForOperation: (value?: string) => string = (value) => value || "",
) {
  const operationKey = image.sourceNodeKind || image.nodeOperation;
  const node = image.sourceNodeName || (operationKey ? labelForOperation(operationKey) : "");
  const trace = image.sourceRequestId
    ? `请求 ${shortImageTraceId(image.sourceRequestId)}`
    : image.sourceTaskId
      ? `任务 ${shortImageTraceId(image.sourceTaskId)}`
      : "";
  return [node, trace].filter(Boolean).join(" · ") || image.sourceStrategyTitle || "来源未记录";
}

export function imageSourceDetailLines(image: ImageSourceTrace, options: ImageSourceDetailOptions) {
  const lines: Array<{ label: string; value: string }> = [];
  const labelForOperation = options.labelForOperation || ((value?: string) => value || "");
  const operationKey = image.sourceNodeKind || image.nodeOperation;
  const operation = operationKey ? labelForOperation(operationKey) : "";
  const nodeValue = image.sourceNodeName
    ? `${image.sourceNodeName}${operation ? ` · ${operation}` : ""}`
    : operation;
  if (nodeValue) lines.push({ label: "来源节点", value: nodeValue });
  if (image.sourceNodeId) lines.push({ label: "节点ID", value: shortImageTraceId(image.sourceNodeId) });
  if (image.sourceTaskId) lines.push({ label: "任务ID", value: shortImageTraceId(image.sourceTaskId) });
  if (image.sourceRequestId) lines.push({ label: "请求ID", value: shortImageTraceId(image.sourceRequestId) });
  if (image.durationMs) lines.push({ label: "耗时", value: options.formatDuration(image.durationMs) });
  if (image.generatedAt) lines.push({ label: "生成时间", value: options.formatGeneratedAt(image.generatedAt) });
  return lines;
}

export function shortImageTraceId(id: string) {
  const clean = id.replace(/^req_/, "").replace(/^task_/, "").replace(/^node_/, "");
  return clean.length <= 10 ? clean : clean.slice(-10);
}
