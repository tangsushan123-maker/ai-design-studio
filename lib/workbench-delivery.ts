export type DeliveryReviewImage = {
  fileName?: string;
  id?: string;
  fileSizeBytes?: number;
  materialType?: string;
  mode?: string;
  model?: string;
  prompt?: string;
  qualityCheck?: {
    actions?: string[];
    clarityCheckLabel?: string;
    fourKCheckItems?: Array<{
      detail?: string;
      label: string;
      passed: boolean;
    }>;
    issues?: string[];
    textDetailLabel?: string;
  };
};

export type DeliveryReviewOptions = {
  actualSizeLabel: string;
  expectedSizeLabel: string;
  qualityLabel: string;
};

export function buildDeliverySummary(
  image: DeliveryReviewImage,
  options: DeliveryReviewOptions & { formatFileSize?: (bytes: number) => string },
) {
  const lines = [
    `文件：${image.fileName || image.id || "未命名图片"}`,
    `尺寸：${options.actualSizeLabel || "未知"}`,
    options.expectedSizeLabel && options.expectedSizeLabel !== options.actualSizeLabel ? `目标：${options.expectedSizeLabel}` : "",
    image.fileSizeBytes ? `大小：${options.formatFileSize ? options.formatFileSize(image.fileSizeBytes) : `${image.fileSizeBytes} bytes`}` : "",
    `交付状态：${options.qualityLabel || "待检查"}`,
    image.model ? `模型：${image.model}` : "",
    image.mode || image.materialType ? `类型：${image.mode || image.materialType}` : "",
    image.qualityCheck?.issues?.length ? `复查项：${image.qualityCheck.issues.slice(0, 3).join("；")}` : "",
    image.prompt ? `Prompt：${image.prompt}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildQualityReviewSummary(image: DeliveryReviewImage, options: DeliveryReviewOptions) {
  const checkItems = image.qualityCheck?.fourKCheckItems
    ?.slice(0, 8)
    .map((item) => `${item.passed ? "通过" : "复查"}：${item.label}${item.detail ? `（${item.detail}）` : ""}`) || [];
  const issues = image.qualityCheck?.issues?.slice(0, 6).map((issue) => `复查：${issue}`) || [];
  const actions = image.qualityCheck?.actions?.slice(0, 4).map((action) => `建议：${action}`) || [];
  const lines = [
    `质检对象：${image.fileName || image.id || "未命名图片"}`,
    `当前尺寸：${options.actualSizeLabel || "未知"}`,
    options.expectedSizeLabel && options.expectedSizeLabel !== options.actualSizeLabel ? `目标尺寸：${options.expectedSizeLabel}` : "",
    `交付状态：${options.qualityLabel || "待检查"}`,
    image.qualityCheck?.clarityCheckLabel ? `清晰度：${image.qualityCheck.clarityCheckLabel}` : "",
    image.qualityCheck?.textDetailLabel ? `文字检查：${image.qualityCheck.textDetailLabel}` : "",
    ...checkItems,
    ...issues,
    ...actions,
  ];
  return lines.filter(Boolean).join("\n");
}
