import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { QualityValue } from "./design-options";
import { getGeneratedDir, getGeneratedUrl, getImageVariantApiUrl } from "./image-utils";
import type { ImageQualityCheck } from "./image-quality";
import { readJsonWithBackup } from "./local-json-store";
import { mapWithConcurrency } from "./async-utils";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const generatedTrashDirName = "_trash";
const historyDirectoryReadConcurrency = 16;
const historyMetadataReadConcurrency = 48;
const historyFileStatConcurrency = 48;
const historyImageBuildConcurrency = 8;

export type GeneratedHistoryOptions = {
  limit?: number;
  offset?: number;
  projectId?: string;
  ownerUserId?: string;
  includeUnowned?: boolean;
  requestIds?: string[];
  trashOnly?: boolean;
};

export async function listGeneratedImages(options: GeneratedHistoryOptions = {}) {
  const dir = getGeneratedDir();
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 20)));

  try {
    const files = await listGeneratedImageFiles(dir, options.trashOnly ? generatedTrashDirName : "", { includeTrash: Boolean(options.trashOnly) });
    const fileEntries = await mapWithConcurrency(
      files,
      historyMetadataReadConcurrency,
      async (fileName) => {
        const fullPath = path.join(dir, fileName);
        const savedMetadata = await readSavedMetadata(dir, fileName);
        return { fileName, fullPath, savedMetadata, sortTime: historyMetadataSortTime(savedMetadata) };
      },
    );
    const requestIdSet = new Set((options.requestIds || []).map((item) => item.trim()).filter(Boolean));
    const taskIdSet = new Set([...requestIdSet].map((item) => item.replace(/^req_/, "task_")));
    const scopedEntries = fileEntries.filter((entry) => {
      if (options.ownerUserId) {
        const ownerUserId = stringValue(entry.savedMetadata.ownerUserId);
        if (ownerUserId !== options.ownerUserId && !(options.includeUnowned && !ownerUserId)) return false;
      }
      if (options.projectId && stringValue(entry.savedMetadata.projectId) !== options.projectId) return false;
      if (!requestIdSet.size) return true;
      const sourceRequestId = stringValue(entry.savedMetadata.sourceRequestId);
      const sourceTaskId = stringValue(entry.savedMetadata.sourceTaskId);
      const resultGroupId = stringValue(entry.savedMetadata.resultGroupId);
      return Boolean(
        (sourceRequestId && requestIdSet.has(sourceRequestId)) ||
        (sourceTaskId && taskIdSet.has(sourceTaskId)) ||
        (resultGroupId && taskIdSet.has(resultGroupId)),
      );
    });
    const sortableEntries = await mapWithConcurrency(scopedEntries, historyFileStatConcurrency, async (entry) => {
      if (typeof entry.sortTime === "number") return { ...entry, sortTime: entry.sortTime };
      const fileStat = await stat(entry.fullPath);
      return { ...entry, fileStat, sortTime: fileStat.mtime.getTime() };
    });
    sortableEntries.sort((a, b) => b.sortTime - a.sortTime);
    const total = sortableEntries.length;
    const pagedEntries = sortableEntries.slice(offset, offset + limit);

    const images = await mapWithConcurrency(
      pagedEntries,
      historyImageBuildConcurrency,
      async (entry) => {
        const { fileName, fullPath, savedMetadata } = entry;
        const cachedFileStat = "fileStat" in entry ? entry.fileStat : undefined;
        const fileStat = cachedFileStat || await stat(fullPath);
        const metadata = historyImageMetadataFromSaved(savedMetadata) || await sharp(fullPath).metadata();
        const quality = inferQuality(fileName);
        const aspectRatio = inferRatio(fileName, metadata.width, metadata.height);
        const outputSize =
          metadata.width && metadata.height
            ? {
                width: metadata.width,
                height: metadata.height,
              }
            : undefined;
        const qualityCheck =
          qualityCheckValue(savedMetadata.qualityCheck) ||
          lightweightHistoryQualityCheck({
            width: metadata.width || 0,
            height: metadata.height || 0,
            format: metadata.format,
            fileSizeBytes: fileStat.size,
            quality: normalizeQuality(savedMetadata.quality) || quality,
            expectedSize: objectValue(savedMetadata.expectedOutputSize) as { width?: number; height?: number } | undefined,
          });

        const publicUrl = getGeneratedUrl(fileName);
        const originalUrl = stringValue(savedMetadata.originalUrl) || publicUrl;
        return {
          id: fileName,
          fileName,
          url: publicUrl,
          originalUrl,
          thumbnailUrl: stringValue(savedMetadata.thumbnailUrl) || getImageVariantApiUrl(publicUrl, "thumbnail"),
          previewUrl: stringValue(savedMetadata.previewUrl) || getImageVariantApiUrl(publicUrl, "preview"),
          prompt: stringValue(savedMetadata.prompt) || "本地保存图片",
          variant: numberValue(savedMetadata.variant) || 0,
          mode: stringValue(savedMetadata.mode) || "本地历史",
          model: stringValue(savedMetadata.model),
          aspectRatio: stringValue(savedMetadata.aspectRatio) || aspectRatio,
          quality: normalizeQuality(savedMetadata.quality) || quality,
          generatedAt: stringValue(savedMetadata.generatedAt) || fileStat.mtime.toISOString(),
          durationMs: numberValue(savedMetadata.durationMs),
          fileSizeBytes: fileStat.size,
          alphaCheck: objectValue(savedMetadata.alphaCheck),
          trashed: fileName.startsWith(`${generatedTrashDirName}/`),
          deletedAt: stringValue(savedMetadata.deletedAt),
          originalFileName: stringValue(savedMetadata.originalFileName),
          projectId: stringValue(savedMetadata.projectId),
          ownerUserId: stringValue(savedMetadata.ownerUserId),
          ownerEmail: stringValue(savedMetadata.ownerEmail),
          ownerName: stringValue(savedMetadata.ownerName),
          parentImageId: stringValue(savedMetadata.parentImageId),
          rootImageId: stringValue(savedMetadata.rootImageId),
          branchId: stringValue(savedMetadata.branchId),
          branchLabel: stringValue(savedMetadata.branchLabel),
          resultGroupId: stringValue(savedMetadata.resultGroupId),
          nextImageIds: Array.isArray(savedMetadata.nextImageIds) ? savedMetadata.nextImageIds : undefined,
          sourceTaskId: stringValue(savedMetadata.sourceTaskId),
          sourceRequestId: stringValue(savedMetadata.sourceRequestId),
          sourceNodeId: stringValue(savedMetadata.sourceNodeId),
          sourceNodeName: stringValue(savedMetadata.sourceNodeName),
          sourceNodeKind: stringValue(savedMetadata.sourceNodeKind),
          strategyPackageId: stringValue(savedMetadata.strategyPackageId),
          sourceStrategyTitle: stringValue(savedMetadata.sourceStrategyTitle),
          materialPlanItemId: stringValue(savedMetadata.materialPlanItemId),
          materialType: stringValue(savedMetadata.materialType),
          targetSize: stringValue(savedMetadata.targetSize),
          materialCopy: stringValue(savedMetadata.materialCopy),
          materialScene: stringValue(savedMetadata.materialScene),
          protectionContext: objectValue(savedMetadata.protectionContext),
          version: objectValue(savedMetadata.version),
          maskProtectionCheck: objectValue(savedMetadata.maskProtectionCheck),
          nodeOperation: stringValue(savedMetadata.nodeOperation),
          outputSize,
          qualityCheck,
          savedPath: fullPath,
        };
      },
    );

    images.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

    return {
      images,
      hasMore: offset + limit < total,
      nextOffset: Math.min(offset + limit, total),
      total,
      saveDir: dir,
    };
  } catch {
    return {
      images: [],
      hasMore: false,
      nextOffset: 0,
      total: 0,
      saveDir: dir,
    };
  }
}

async function readSavedMetadata(dir: string, fileName: string) {
  return readJsonWithBackup<Record<string, unknown>>(path.join(dir, `${fileName}.json`), {});
}

function historyMetadataSortTime(metadata: Record<string, unknown>) {
  const generatedAt = stringValue(metadata.generatedAt);
  const updatedAt = stringValue(metadata.updatedAt);
  const metadataTime = new Date(generatedAt || updatedAt || 0).getTime();
  return Number.isFinite(metadataTime) && metadataTime > 0 ? metadataTime : undefined;
}

async function listGeneratedImageFiles(dir: string, base = "", options: { includeTrash?: boolean } = {}): Promise<string[]> {
  const entries = await readdir(path.join(dir, base), { withFileTypes: true });
  const files = await mapWithConcurrency(entries, historyDirectoryReadConcurrency, async (entry) => {
    const relative = path.join(base, entry.name);
    if (entry.isDirectory() && entry.name === "_variants") return [];
    if (entry.isDirectory() && entry.name === generatedTrashDirName && !options.includeTrash) return [];
    if (entry.isDirectory()) return listGeneratedImageFiles(dir, relative, options);
    if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) return [relative];
    return [];
  });
  return files.flat();
}

function inferQuality(fileName: string): QualityValue {
  if (fileName.includes("-4k-")) return "4k";
  if (fileName.includes("-2k-")) return "2k";
  return "standard";
}

function normalizeQuality(value: unknown): QualityValue | undefined {
  if (value === "4k" || value === "2k" || value === "standard") return value;
  return undefined;
}

function inferRatio(fileName: string, width?: number, height?: number) {
  const match = fileName.match(/design-\d{8}-([a-z0-9]+)-(?:standard|2k|4k)-/i);
  if (match?.[1]) return match[1].replace("x", ":").replace("p", ".");
  if (width && height) return `${width}:${height}`;
  return "未记录";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value : undefined;
}

function historyImageMetadataFromSaved(savedMetadata: Record<string, unknown>) {
  const outputSize = objectValue(savedMetadata.outputSize) as { width?: unknown; height?: unknown } | undefined;
  const width = numberValue(outputSize?.width) || numberValue(savedMetadata.width);
  const height = numberValue(outputSize?.height) || numberValue(savedMetadata.height);
  if (!width || !height) return null;
  return {
    width,
    height,
    format: stringValue(savedMetadata.format),
  };
}

function qualityCheckValue(value: unknown): ImageQualityCheck | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<ImageQualityCheck>;
  if (!source.status || !source.label || typeof source.width !== "number" || typeof source.height !== "number") return undefined;
  return source as ImageQualityCheck;
}

function lightweightHistoryQualityCheck(input: {
  width: number;
  height: number;
  format?: string;
  fileSizeBytes?: number;
  quality: QualityValue;
  expectedSize?: { width?: number; height?: number };
}): ImageQualityCheck {
  const target = input.expectedSize?.width && input.expectedSize?.height
    ? { width: input.expectedSize.width, height: input.expectedSize.height }
    : undefined;
  const reachedTargetSize = target
    ? input.width >= Math.round(target.width * 0.98) && input.height >= Math.round(target.height * 0.98)
    : true;
  const ratioMatched = target
    ? Math.abs((input.width / Math.max(1, input.height)) - (target.width / target.height)) / (target.width / target.height) <= 0.018
    : true;
  const issues: string[] = [];
  const actions: string[] = [];
  if (!input.width || !input.height) {
    issues.push("图片没有有效宽高。");
    actions.push("重新生成");
  } else if (!reachedTargetSize) {
    issues.push(`实际尺寸 ${input.width}×${input.height}，未达到目标 ${target?.width}×${target?.height}。`);
    actions.push("重新生成或重新导出");
  } else if (!ratioMatched) {
    issues.push("实际比例与目标比例不一致。");
    actions.push("按目标比例重新输出");
  }
  const status = !input.width || !input.height
    ? "empty"
    : !reachedTargetSize
      ? "size_insufficient"
      : !ratioMatched
        ? "ratio_mismatch"
        : "pending";
  return {
    status,
    label: status === "pending" ? "历史记录待复检" : issues[0] || "历史记录待复检",
    issues,
    actions,
    width: input.width,
    height: input.height,
    ratio: input.width && input.height ? input.width / input.height : 0,
    targetWidth: target?.width,
    targetHeight: target?.height,
    format: input.format,
    fileSizeBytes: input.fileSizeBytes,
    is4kTarget: input.quality === "4k" || Boolean(target && Math.max(target.width, target.height) >= 3840),
    reachedTargetSize,
    ratioMatched,
    suspectedStretch: false,
    hasWhiteBorder: false,
    checkedAt: new Date().toISOString(),
  };
}
