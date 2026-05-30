import { searchFieldsToText, type SearchableQualityCheck } from "./workbench-search.ts";

export type ImageManagerSearchImage = {
  branchLabel?: string;
  fileName?: string;
  generatedAt?: string;
  id?: string;
  materialType?: string;
  mode?: string;
  nodeOperation?: string;
  prompt?: string;
  qualityCheck?: SearchableQualityCheck;
  source?: string;
  sourceNodeKind?: string;
  sourceNodeName?: string;
  sourceRequestId?: string;
  sourceStrategyTitle?: string;
  sourceTaskId?: string;
  url?: string;
};

export type ImageManagerSearchProtection = {
  canDelete: boolean;
  isFavorite: boolean;
  isLayerPack: boolean;
  isProjectAsset: boolean;
  isTrashed: boolean;
  protected: boolean;
  reasons: string[];
  usedByNodeNames: string[];
  usedByNodes: number;
};

export function imageManagerMatchesSearch(
  image: ImageManagerSearchImage,
  protection: ImageManagerSearchProtection,
  query: string,
  labelForOperation: (value?: string) => string = (value) => value || "",
) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return imageManagerSearchText(image, protection, labelForOperation).includes(keyword);
}

export function imageManagerSearchText(
  image: ImageManagerSearchImage,
  protection: ImageManagerSearchProtection,
  labelForOperation: (value?: string) => string = (value) => value || "",
) {
  const operation = labelForOperation(image.sourceNodeKind || image.nodeOperation);
  const fields: Array<string | null | undefined> = [
    image.branchLabel,
    image.fileName,
    image.generatedAt,
    image.id,
    image.materialType,
    image.mode,
    image.nodeOperation,
    image.prompt,
    image.source,
    image.sourceNodeKind,
    image.sourceNodeName,
    image.sourceRequestId,
    image.sourceStrategyTitle,
    image.sourceTaskId,
    image.url,
    operation,
    ...protection.usedByNodeNames,
  ];
  appendImageManagerProtectionAliases(fields, protection);
  return searchFieldsToText(fields);
}

function appendImageManagerProtectionAliases(fields: Array<string | null | undefined>, protection: ImageManagerSearchProtection) {
  fields.push(
    protection.isFavorite ? "收藏 已收藏" : "",
    protection.isTrashed ? "回收站 已删除" : "",
    protection.protected ? "保护 受保护" : "",
  );
}
