import { imageSizeLabel, qualityBadgeLabel, type DeliveryReviewImage } from "./workbench-delivery.ts";

export type HistorySearchImage = DeliveryReviewImage & {
  aspectRatio?: string;
  favorite?: boolean;
  generatedAt?: string;
  materialCopy?: string;
  materialScene?: string;
  nodeOperation?: string;
  projectId?: string;
  sourceNodeId?: string;
  sourceNodeKind?: string;
  sourceNodeName?: string;
  sourceRequestId?: string;
  sourceStrategyTitle?: string;
  sourceTaskId?: string;
  targetSize?: string;
};

export function historyMatchesFilter(image: HistorySearchImage, filter: string, projectId: string, now = new Date()) {
  if (!imageBelongsToProject(image, projectId)) return false;
  if (filter === "全部") return true;
  const date = image.generatedAt ? new Date(image.generatedAt) : null;
  if (filter === "今日") return Boolean(date && Number.isFinite(date.getTime()) && date.toDateString() === now.toDateString());
  if (filter === "项目") return true;
  if (filter === "收藏") return Boolean(image.favorite);
  return true;
}

export function historyMatchesQuery(image: HistorySearchImage, query: string) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return historySearchText(image).includes(keyword);
}

export function historySearchText(image: HistorySearchImage) {
  return [
    image.fileName,
    image.id,
    image.model,
    image.mode,
    image.materialType,
    image.materialCopy,
    image.materialScene,
    image.nodeOperation,
    image.sourceNodeKind,
    image.sourceNodeName,
    image.sourceNodeId,
    image.sourceRequestId,
    image.sourceStrategyTitle,
    image.sourceTaskId,
    image.aspectRatio,
    image.targetSize,
    image.prompt,
    image.projectId,
    imageSizeLabel(image),
    qualityBadgeLabel(image),
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
    ...qualitySearchAliases(image),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function imageBelongsToProject(image: Pick<HistorySearchImage, "projectId">, projectId: string) {
  return Boolean(projectId && image.projectId === projectId);
}

function qualitySearchAliases(image: HistorySearchImage) {
  const status = image.qualityCheck?.status;
  const deliverability = image.qualityCheck?.deliverability;
  const failedQuality = Boolean(status && status !== "passed");
  return [
    status === "passed" || deliverability === "ready" ? "可交付 合格" : "",
    deliverability === "needs_review" ? "需复查 建议复查" : "",
    deliverability === "not_ready" ? "不可交付 未达标" : "",
    failedQuality ? "质检未过 未通过 质量异常" : "",
    status === "white_border" ? "白边 有白边" : "",
    status === "ratio_mismatch" ? "比例异常 比例不对" : "",
    status === "size_insufficient" ? "尺寸不足 未达尺寸" : "",
  ];
}
