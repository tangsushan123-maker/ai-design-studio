"use client";

export type DeliveryStatusImage = {
  qualityCheck?: {
    status?: string;
    label?: string;
    deliverability?: "ready" | "needs_review" | "not_ready";
    deliverabilityLabel?: string;
  };
};

export function DeliveryStatusBadge({
  image,
  fallbackLabel,
}: {
  image: DeliveryStatusImage;
  fallbackLabel?: string;
}) {
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${deliveryStatusClass(image)}`}>
      {deliveryStatusLabel(image, fallbackLabel)}
    </span>
  );
}

export function deliveryStatusLabel(image: DeliveryStatusImage, fallbackLabel = "待检查") {
  if (image.qualityCheck?.deliverabilityLabel) return compactDeliveryLabel(image.qualityCheck.deliverabilityLabel);
  if (image.qualityCheck?.label) return compactDeliveryLabel(image.qualityCheck.label);
  if (image.qualityCheck?.status === "passed") return "可交付";
  if (image.qualityCheck?.status) return "需复查";
  return compactDeliveryLabel(fallbackLabel);
}

function compactDeliveryLabel(label: string) {
  return label.replace(/\s/g, "").replace("建议复查", "复查").replace("不可交付", "未达标");
}

function deliveryStatusClass(image: DeliveryStatusImage) {
  const status = image.qualityCheck?.deliverability || image.qualityCheck?.status;
  if (status === "ready" || status === "passed") return "border-[#74e3c5]/20 bg-[#74e3c5]/10 text-[#adf8e5]";
  if (status === "not_ready" || status === "failed" || status === "empty" || status === "size_insufficient" || status === "white_border" || status === "ratio_mismatch") {
    return "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]";
  }
  return "border-[#ffd166]/18 bg-[#ffd166]/10 text-[#ffe1a3]";
}
