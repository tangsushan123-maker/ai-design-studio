export type SearchableQualityCheck = {
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

export function searchFieldsToText(fields: Array<string | number | boolean | null | undefined>) {
  return fields.filter(Boolean).join(" ").toLowerCase();
}

export function appendQualitySearchFields(
  fields: Array<string | null | undefined>,
  qualityCheck: SearchableQualityCheck | undefined,
  options: { includeCompositionAliases?: boolean } = {},
) {
  if (!qualityCheck) return;
  fields.push(
    qualityCheck.label,
    qualityCheck.deliverabilityLabel,
    qualityCheck.status,
    qualityCheck.deliverability,
    qualityCheck.clarityCheckLabel,
    qualityCheck.textDetailLabel,
    qualityCheck.importantContentLabel,
  );
  appendStringItems(fields, qualityCheck.issues);
  appendStringItems(fields, qualityCheck.actions);
  appendFourKCheckItems(fields, qualityCheck.fourKCheckItems);
  appendQualityAliases(fields, qualityCheck, options);
}

function appendStringItems(fields: Array<string | null | undefined>, items: string[] | undefined) {
  if (!items) return;
  for (const item of items) fields.push(item);
}

function appendFourKCheckItems(
  fields: Array<string | null | undefined>,
  items: SearchableQualityCheck["fourKCheckItems"],
) {
  if (!items) return;
  for (const item of items) {
    fields.push(item.label, item.detail, item.passed ? "通过" : "复查");
  }
}

function appendQualityAliases(
  fields: Array<string | null | undefined>,
  qualityCheck: SearchableQualityCheck,
  options: { includeCompositionAliases?: boolean },
) {
  const status = qualityCheck.status;
  const deliverability = qualityCheck.deliverability;
  const failedQuality = Boolean(status && status !== "passed");
  fields.push(
    status === "passed" || deliverability === "ready" ? "可交付 合格" : "",
    deliverability === "needs_review" ? "需复查 建议复查" : "",
    deliverability === "not_ready" ? "不可交付 未达标" : "",
    failedQuality ? "质检未过 未通过 质量异常" : "",
    status === "white_border" ? "白边 有白边" : "",
    status === "ratio_mismatch" ? "比例异常 比例不对" : "",
    status === "size_insufficient" ? "尺寸不足 未达尺寸" : "",
  );
  if (!options.includeCompositionAliases) return;
  fields.push(
    status === "composition_risk" ? "构图风险 构图贴边 主体贴边 安全边距不足" : "",
    status === "blurred_padding" ? "模糊补边 补边风险 边缘模糊 拉伸背景" : "",
    status === "suspected_stretch" ? "疑似拉伸 细节密度低 只是放大" : "",
  );
}
