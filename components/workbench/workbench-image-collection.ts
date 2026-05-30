import { favoriteStorageKey } from "@/components/workbench/workbench-config";
import type { FlowNode, ImageAsset } from "@/components/workbench/workbench-types";

export function createResultLineage(image: ImageAsset | null | undefined, taskId: string, variant: number) {
  const normalizedVariant = Math.max(1, variant);
  if (!image) {
    return {
      parentImageId: undefined,
      rootImageId: "",
      branchId: `${taskId}_branch_${normalizedVariant}`,
      branchLabel: `方案 ${normalizedVariant}`,
      resultGroupId: taskId,
      variant: normalizedVariant,
    };
  }

  const rootImageId = imageRootId(image);
  const branchId = image.branchId || `${image.resultGroupId || image.sourceTaskId || rootImageId}_branch_${image.variant || normalizedVariant}`;
  const branchLabel = image.branchLabel || `方案 ${image.variant || normalizedVariant}`;
  return {
    parentImageId: image.id || image.fileName || image.url,
    rootImageId,
    branchId,
    branchLabel,
    resultGroupId: image.resultGroupId || image.sourceTaskId || taskId,
    variant: image.variant || normalizedVariant,
  };
}

export function mergeImages(incoming: ImageAsset[], current: ImageAsset[]) {
  const seen = new Set<string>();
  const merged: ImageAsset[] = [];
  for (const image of [...incoming, ...current]) {
    const key = image.fileName || image.id || image.url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(image);
  }
  return sortImagesByRecency(merged);
}

export function uniqueImagesByKey(images: ImageAsset[]) {
  const seen = new Set<string>();
  const unique: ImageAsset[] = [];
  for (const image of images) {
    const key = imageKey(image);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(image);
  }
  return unique;
}

export function uniqueImageAssets<T extends Pick<ImageAsset, "fileName" | "id" | "url">>(images: T[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = imageKey(image);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isMaskUtilityImage(image: ImageAsset | null | undefined) {
  if (!image) return false;
  const fileFields = [
    image.fileName,
    image.resourceFileName,
    image.originalFileName,
    image.id,
    image.url,
    image.originalUrl,
    image.thumbnailUrl,
    image.previewUrl,
  ].filter(Boolean).join(" ");
  const metaFields = [
    image.materialType,
    image.mode,
    image.nodeOperation,
    image.sourceNodeKind,
  ].filter(Boolean).join(" ");
  return /(^|[\/\s])mask-[^\/\s]+\.(png|jpe?g|webp)\b/i.test(fileFields) ||
    /\/masks\//i.test(fileFields) ||
    /局部修改蒙版|涂抹蒙版|mask utility/i.test(metaFields);
}

export function imageKey(image: Pick<ImageAsset, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

export function imageKeys(images: Pick<ImageAsset, "fileName" | "id" | "url">[]) {
  const keys: string[] = [];
  for (const image of images) {
    const key = imageKey(image);
    if (key) keys.push(key);
  }
  return keys;
}

export function imageReferencesMatch(
  a: Pick<ImageAsset, "fileName" | "id" | "url">,
  b: Pick<ImageAsset, "fileName" | "id" | "url">,
) {
  const aTokens = imageReferenceTokens(a);
  const bTokens = imageReferenceTokens(b);
  for (const token of aTokens) {
    if (bTokens.has(token)) return true;
  }
  return false;
}

export function generatedFileNameForImage(image: Pick<ImageAsset, "fileName" | "id" | "url">) {
  const fromFileName = image.fileName && /\.(png|jpe?g|webp)$/i.test(image.fileName) ? image.fileName : "";
  if (fromFileName) return fromFileName;
  if (image.url?.startsWith("/generated/")) return decodeURIComponent(image.url.replace(/^\/generated\//, ""));
  return image.id && /\.(png|jpe?g|webp)$/i.test(image.id) ? image.id : "";
}

export function imageMatchesGeneratedFile(image: ImageAsset | null | undefined, fileName: string) {
  if (!image || !fileName) return false;
  return imageReferencesMatch(image, { id: fileName, fileName, url: `/generated/${fileName}` });
}

export function nodeImageReferences(node: FlowNode) {
  return [
    node.data.image,
    node.data.output,
    ...(node.data.outputs || []),
  ].filter((image): image is ImageAsset => Boolean(image));
}

export function isPngLayerPackImage(image: ImageAsset) {
  const fields = [
    image.nodeOperation,
    image.sourceNodeKind,
    image.materialType,
    image.mode,
    image.fileName,
    image.id,
  ].filter(Boolean).join(" ");
  return Boolean(image.pngLayerExport || /png[_\s-]*layers|PNG分层|分层包|layer-packs/i.test(fields));
}

export function imageBranchId(image: Pick<ImageAsset, "branchId" | "resultGroupId" | "sourceTaskId" | "variant" | "id" | "fileName" | "url">) {
  return image.branchId || `${image.resultGroupId || image.sourceTaskId || imageKey(image)}_branch_${image.variant || 1}`;
}

export function imageBranchVersions(historyImages: ImageAsset[], image: ImageAsset) {
  return sortImagesByGeneratedAt(historyImages.filter((item) => imageBranchId(item) === imageBranchId(image)));
}

export function latestImagesForResultGroup(historyImages: ImageAsset[], image: ImageAsset) {
  const resultGroupId = image.resultGroupId || image.sourceTaskId;
  if (!resultGroupId) return [];
  const branchMap = new Map<string, ImageAsset>();
  historyImages
    .filter((item) => (item.resultGroupId || item.sourceTaskId) === resultGroupId)
    .forEach((item) => {
      const key = imageBranchId(item);
      const current = branchMap.get(key);
      if (!current || new Date(item.generatedAt || 0).getTime() > new Date(current.generatedAt || 0).getTime()) {
        branchMap.set(key, item);
      }
    });
  return Array.from(branchMap.values()).sort((a, b) => (a.variant || 0) - (b.variant || 0));
}

export function imageRootId(image: Pick<ImageAsset, "rootImageId" | "parentImageId" | "id" | "fileName" | "url">) {
  return image.rootImageId || image.parentImageId || imageKey(image);
}

export function sortImagesByRecency(images: ImageAsset[]) {
  return [...images].sort((a, b) => compareImagesByRecency(a, b));
}

export function sortResultImagesForDisplay(images: ImageAsset[]) {
  return sortImagesByRecency(images);
}

export function isUserFacingResultImage(image: ImageAsset) {
  if (isMaskUtilityImage(image)) return false;
  if (isRemovedFeatureImage(image)) return false;
  const fileName = image.fileName || image.id || image.url || "";
  if (image.source === "asset" || /\/uploads\//i.test(fileName)) return false;
  if (/\/(?:full-preview|text-mask|text-layer-cropped|original|text_alpha_mask|repair_mask|text_cropped|background_first_pass)\.png$/i.test(fileName)) return false;
  if (image.materialType === "原图" || image.materialType === "文字蒙版" || image.materialType === "文字Alpha蒙版" || image.materialType === "背景修复蒙版" || image.materialType === "背景首轮修复" || image.materialType === "文字裁剪PNG" || image.materialType === "局部修改蒙版") return false;
  return true;
}

export function sortImagesByGeneratedAt(images: ImageAsset[]) {
  return [...images].sort((a, b) => new Date(a.generatedAt || 0).getTime() - new Date(b.generatedAt || 0).getTime());
}

export function compareImagesByRecency(a: ImageAsset, b: ImageAsset) {
  const generatedDiff = new Date(b.generatedAt || 0).getTime() - new Date(a.generatedAt || 0).getTime();
  if (generatedDiff) return generatedDiff;
  const variantDiff = (a.variant || 0) - (b.variant || 0);
  if (variantDiff) return variantDiff;
  return imageKey(a).localeCompare(imageKey(b));
}

export function removeImageFromNode(node: FlowNode, fileName: string): FlowNode {
  const nextOutputs = (node.data.outputs || []).filter((image) => !imageMatchesGeneratedFile(image, fileName));
  const imageRemoved = imageMatchesGeneratedFile(node.data.image, fileName);
  const outputRemoved = imageMatchesGeneratedFile(node.data.output, fileName);
  if (!imageRemoved && !outputRemoved && nextOutputs.length === (node.data.outputs || []).length) return node;
  return {
    ...node,
    data: {
      ...node.data,
      image: imageRemoved ? undefined : node.data.image,
      output: outputRemoved ? nextOutputs[0] || null : node.data.output,
      outputs: nextOutputs,
      resultCount: nextOutputs.length,
      status: nextOutputs.length ? node.data.status : outputRemoved || imageRemoved ? "idle" : node.data.status,
    },
  };
}

export function loadFavoriteIds() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(favoriteStorageKey);
    const parsed = raw ? JSON.parse(raw) as string[] : [];
    return new Set(parsed.filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

export function saveFavoriteIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(favoriteStorageKey, JSON.stringify(Array.from(ids)));
}

function imageReferenceTokens(image: Pick<ImageAsset, "fileName" | "id" | "url">) {
  const tokens = new Set<string>();
  const add = (value?: string) => {
    const clean = value?.trim();
    if (clean) tokens.add(clean);
  };
  add(image.fileName);
  add(image.id);
  add(image.url);
  const generatedFileName = generatedFileNameForImage(image);
  add(generatedFileName);
  if (image.url?.startsWith("/generated/")) add(decodeURIComponent(image.url.replace(/^\/generated\//, "")));
  return tokens;
}

function isRemovedFeatureImage(image: ImageAsset) {
  const fields = [
    image.nodeOperation,
    image.sourceNodeKind,
    image.materialType,
    image.mode,
    image.branchLabel,
    image.fileName,
  ].filter(Boolean).join(" ");
  return /remove_background|layer_output/.test(fields) || removedFeatureTextMarkers().some((marker) => fields.includes(marker));
}

export function removedFeatureTextMarkers() {
  return [
    "透明" + "抠图",
    "透明" + "扣图",
    "分层" + "拆图",
    "文字" + "透明PNG",
    "文字" + "透明 PNG",
    "无文字" + "背景",
  ];
}
