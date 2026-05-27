export type DeliveryReviewImage = {
  fileName?: string;
  id?: string;
  fileSizeBytes?: number;
  materialType?: string;
  mode?: string;
  model?: string;
  outputSize?: {
    width?: number;
    height?: number;
  };
  prompt?: string;
  quality?: string;
  qualityCheck?: {
    actions?: string[];
    clarityCheckLabel?: string;
    deliverability?: "ready" | "needs_review" | "not_ready";
    deliverabilityLabel?: string;
    fourKCheckItems?: Array<{
      detail?: string;
      label: string;
      passed: boolean;
    }>;
    issues?: string[];
    label?: string;
    status?: string;
    textDetailLabel?: string;
  };
  ratio?: {
    width?: number;
    height?: number;
  };
  width?: number;
  height?: number;
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

export function imageSizeLabel(image: DeliveryReviewImage) {
  if (image.outputSize?.width && image.outputSize?.height) return `${image.outputSize.width} × ${image.outputSize.height}px`;
  if (image.width && image.height) return `${image.width} × ${image.height}px`;
  if (image.ratio?.width && image.ratio?.height) return `${Math.round(image.ratio.width)}:${Math.round(image.ratio.height)}`;
  return "未记录";
}

export function qualityBadgeLabel(image: DeliveryReviewImage) {
  if (image.qualityCheck?.label) {
    const compact = image.qualityCheck.label.replace(/\s/g, "");
    const withoutSize = compact.replace(/^\d{2,5}[×xX]\d{2,5}(?:px)?(?:[|｜·:：-])?/u, "");
    if (withoutSize) return withoutSize;
  }
  const status = image.qualityCheck?.status;
  if (status === "passed") return "合格";
  if (status === "pending") return "待检查";
  if (status === "size_insufficient") return "尺寸不足";
  if (status === "ratio_mismatch") return "比例异常";
  if (status === "suspected_stretch") return "疑似拉伸";
  if (status === "white_border") return "有白边";
  if (status === "composition_risk") return "构图风险";
  if (status === "blurred_padding") return "疑似补边";
  if (status === "failed") return "质检失败";
  if (status === "empty") return "空结果";
  const size = image.outputSize || (image.width && image.height ? { width: image.width, height: image.height } : null);
  if (!size?.width || !size?.height) return "待检查";
  if (image.quality === "4k" && Math.max(size.width, size.height) < 3840) return "未达4K";
  if (image.quality === "4k") return "4K待检查";
  return "待检查";
}

export function qualityTone(image: DeliveryReviewImage) {
  const status = image.qualityCheck?.status;
  if (status === "passed") return "bg-[#74e3c5]/12 text-[#adf8e5] border-[#74e3c5]/18";
  if (status === "composition_risk" || status === "blurred_padding") return "bg-[#ffe1a0]/12 text-[#ffe1a0] border-[#ffe1a0]/18";
  if (status === "size_insufficient" || status === "ratio_mismatch" || status === "suspected_stretch" || status === "white_border" || status === "failed" || status === "empty") {
    return "bg-[#ff6b5f]/12 text-[#ffb4a8] border-[#ff6b5f]/18";
  }
  return "bg-white/[0.06] text-white/58 border-white/10";
}

export function qualityDeliveryTone(status?: "ready" | "needs_review" | "not_ready") {
  if (status === "ready") return "border-[#74e3c5]/18 bg-[#74e3c5]/12 text-[#adf8e5]";
  if (status === "not_ready") return "border-[#ff6b5f]/18 bg-[#ff6b5f]/12 text-[#ffb4a8]";
  return "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]";
}
