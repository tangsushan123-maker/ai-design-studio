import { imageSizeLabel, qualityBadgeLabel, type DeliveryReviewImage } from "./workbench-delivery.ts";
import { appendQualitySearchFields, searchFieldsToText } from "./workbench-search.ts";

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
  const fields: Array<string | null | undefined> = [
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
  ];
  appendQualitySearchFields(fields, image.qualityCheck, { includeCompositionAliases: true });
  return searchFieldsToText(fields);
}

function imageBelongsToProject(image: Pick<HistorySearchImage, "projectId">, projectId: string) {
  return Boolean(projectId && image.projectId === projectId);
}
