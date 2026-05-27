export type ImageManagerSearchImage = {
  branchLabel?: string;
  fileName?: string;
  generatedAt?: string;
  id?: string;
  materialType?: string;
  mode?: string;
  nodeOperation?: string;
  prompt?: string;
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
  return [
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
    ...imageManagerQualityAliases(image),
    ...protection.reasons,
    ...protection.usedByNodeNames,
    ...imageManagerProtectionAliases(protection),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function imageManagerQualityAliases(image: ImageManagerSearchImage) {
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

function imageManagerProtectionAliases(protection: ImageManagerSearchProtection) {
  return [
    protection.isFavorite ? "收藏 已收藏" : "",
    protection.isTrashed ? "回收站 已删除" : "",
    protection.isProjectAsset ? "项目素材 受保护" : "",
    protection.usedByNodes ? "节点引用 受保护" : "",
    protection.isLayerPack ? "png三层 分层包" : "",
    protection.canDelete && !protection.isTrashed ? "可清理 可删除" : "",
    protection.protected ? "保护 受保护" : "",
  ];
}
