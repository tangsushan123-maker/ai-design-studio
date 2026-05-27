export type DeliveryDownloadFormat = "png" | "jpg" | "webp";

const imageExtensionPattern = /\.(png|jpe?g|webp)$/i;

export function deliveryFileNameForFormat(inputName: string | undefined, format: DeliveryDownloadFormat) {
  const fallbackName = `design.${format}`;
  const cleanName = (inputName || "")
    .split(/[?#]/)[0]
    .split("/")
    .pop()
    ?.trim();
  if (!cleanName) return fallbackName;
  const baseName = cleanName.replace(imageExtensionPattern, "").trim();
  return `${baseName || "design"}.${format}`;
}
