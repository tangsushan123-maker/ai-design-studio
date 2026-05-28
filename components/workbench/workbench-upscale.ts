import type { QualityValue } from "@/lib/design-options";
import { imageRatio } from "@/components/workbench/workbench-image-metrics";
import type { ImageAsset } from "@/components/workbench/workbench-types";
import { parseTargetSize, qualityParam, stringParam } from "@/components/workbench/workbench-utils";

function uniqueMappedValues<T, Value>(items: T[], mapValue: (item: T) => Value) {
  const seen = new Set<Value>();
  const values: Value[] = [];
  for (const item of items) {
    const value = mapValue(item);
    if (seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

export function inferTargetSizeFromImage(image: ImageAsset, longEdge = 3840) {
  const target = fitImageToLongEdge(image, longEdge);
  return `${target.width}x${target.height}`;
}

export function resolveUpscaleTargetFromParams(image: ImageAsset, params: Record<string, unknown>) {
  const targetSize = stringParam(params.targetSize) || "长边3840";
  const longEdge = upscaleLongEdgeFromTargetSize(targetSize) || (qualityParam(params.quality) === "2k" ? 2048 : 3840);
  const target = fitImageToLongEdge(image, longEdge);
  return {
    ...target,
    longEdge,
  };
}

export function fitImageToLongEdge(image: ImageAsset, longEdge: number) {
  const width = image.outputSize?.width || image.width || image.ratio?.width || 16;
  const height = image.outputSize?.height || image.height || image.ratio?.height || 9;
  const currentLongEdge = Math.max(width, height);
  const scale = Math.max(1, longEdge) / Math.max(1, currentLongEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function upscaleLongEdgeFromTargetSize(value: string) {
  const text = value.trim();
  const longEdgeMatch = text.match(/(?:长边|long[:：]?)\s*(\d+)/i);
  if (longEdgeMatch) return Number(longEdgeMatch[1]) || 0;
  const shortEdgeMatch = text.match(/(?:短边|short[:：]?)\s*(\d+)/i);
  if (shortEdgeMatch) return Number(shortEdgeMatch[1]) || 0;
  const parsed = parseTargetSize(text);
  if (parsed.width && parsed.height) return Math.max(parsed.width, parsed.height);
  const plainNumber = text.match(/^(\d{3,5})$/);
  if (plainNumber) return Number(plainNumber[1]) || 0;
  return 0;
}

export function qualityEnhanceDefaultTargetForImage(image: ImageAsset | null, imageModel = "") {
  return qualityEnhanceTargetOptionsForImage(image, imageModel)[0] || "长边1536";
}

export function qualityEnhanceTargetOptionsForImage(image: ImageAsset | null, imageModel = "") {
  const edges = officialQualityEnhanceLongEdges(image, imageModel);
  return uniqueMappedValues(edges, (edge) => image ? inferTargetSizeFromImage(image, edge) : `长边${edge}`);
}

export function officialQualityEnhanceLongEdges(image: ImageAsset | null, imageModel = "") {
  const ratio = imageRatio(image);
  const isSquare = Math.abs(ratio - 1) < 0.08;
  const isWide169 = Math.abs(ratio - 16 / 9) < 0.12;
  const isTall916 = Math.abs(ratio - 9 / 16) < 0.12;
  if (/gpt-image-2/i.test(imageModel)) {
    if (isWide169 || isTall916) return [2048, 3840];
    if (isSquare) return [2048];
  }
  return [isSquare ? 1024 : 1536];
}

export function qualityEnhanceQualityOptionsForTargets(targets: string[]) {
  return uniqueMappedValues(targets, qualityForQualityEnhanceTarget);
}

export function qualityEnhanceTargetForQuality(targets: string[], quality: QualityValue) {
  return targets.find((target) => qualityForQualityEnhanceTarget(target) === quality) || targets[0] || "长边1536";
}

export function qualityForQualityEnhanceTarget(targetSize: string): QualityValue {
  const longEdge = upscaleLongEdgeFromTargetSize(targetSize);
  if (longEdge >= 3840) return "4k";
  if (longEdge >= 2048) return "2k";
  return "standard";
}

export function qualityEnhanceQualityParam(value: unknown): QualityValue {
  const quality = qualityParam(value);
  if (quality === "4k") return "4k";
  if (quality === "2k") return "2k";
  return "standard";
}

export function isValidUpscaleTarget(value: string) {
  return Boolean(upscaleLongEdgeFromTargetSize(value));
}

export function upscaleTargetDisplayLabel(value: string) {
  const longEdge = upscaleLongEdgeFromTargetSize(value);
  if (!longEdge) return value || "长边3840";
  if (/^\d+\s*[x×]\s*\d+$/i.test(value.trim())) return value;
  if (longEdge >= 7680) return `8K长边${longEdge}`;
  return `长边${longEdge}`;
}
