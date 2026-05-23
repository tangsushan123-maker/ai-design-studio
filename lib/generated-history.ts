import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { QualityValue } from "./design-options";
import { getGeneratedDir, getGeneratedUrl, getImageVariantApiUrl } from "./image-utils";
import { inspectImageQuality } from "./image-quality";
import { readJsonWithBackup } from "./local-json-store";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type GeneratedHistoryOptions = {
  limit?: number;
  offset?: number;
};

export async function listGeneratedImages(options: GeneratedHistoryOptions = {}) {
  const dir = getGeneratedDir();
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 20)));

  try {
    const files = await listGeneratedImageFiles(dir);
    const fileEntries = await Promise.all(
      files.map(async (fileName) => {
        const fullPath = path.join(dir, fileName);
        const [fileStat, savedMetadata] = await Promise.all([
          stat(fullPath),
          readSavedMetadata(dir, fileName),
        ]);
        return { fileName, fullPath, fileStat, savedMetadata };
      }),
    );
    fileEntries.sort((a, b) => historySortTime(b.savedMetadata, b.fileStat) - historySortTime(a.savedMetadata, a.fileStat));
    const total = fileEntries.length;
    const pagedEntries = fileEntries.slice(offset, offset + limit);

    const images = await Promise.all(
      pagedEntries.map(async ({ fileName, fullPath, fileStat, savedMetadata }) => {
        const metadata = await sharp(fullPath).metadata();
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
          objectValue(savedMetadata.qualityCheck) ||
          (await inspectImageQuality(fullPath, {
            quality: normalizeQuality(savedMetadata.quality) || quality,
            ratio: objectValue(savedMetadata.ratio) as { width: number; height: number } | undefined,
            targetSize: objectValue(savedMetadata.targetSize) as { width: number; height: number } | undefined,
            expectedSize: objectValue(savedMetadata.expectedOutputSize) as { width: number; height: number } | undefined,
            aspectRatio: stringValue(savedMetadata.aspectRatio) || aspectRatio,
            fileSizeBytes: fileStat.size,
            protectionContext: objectValue(savedMetadata.protectionContext),
          }).catch(() => undefined));

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
          projectId: stringValue(savedMetadata.projectId),
          parentImageId: stringValue(savedMetadata.parentImageId),
          rootImageId: stringValue(savedMetadata.rootImageId),
          branchId: stringValue(savedMetadata.branchId),
          branchLabel: stringValue(savedMetadata.branchLabel),
          resultGroupId: stringValue(savedMetadata.resultGroupId),
          nextImageIds: Array.isArray(savedMetadata.nextImageIds) ? savedMetadata.nextImageIds : undefined,
          sourceTaskId: stringValue(savedMetadata.sourceTaskId),
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
          editableLayers: Array.isArray(savedMetadata.editableLayers) ? savedMetadata.editableLayers : undefined,
          layoutCheck: layoutCheckValue(savedMetadata.layoutCheck),
          layoutTemplate: stringValue(savedMetadata.layoutTemplate),
          outputSize,
          qualityCheck,
          savedPath: fullPath,
        };
      }),
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

function historySortTime(metadata: Record<string, unknown>, fileStat: { mtime: Date }) {
  const generatedAt = stringValue(metadata.generatedAt);
  const updatedAt = stringValue(metadata.updatedAt);
  const metadataTime = new Date(generatedAt || updatedAt || 0).getTime();
  return Number.isFinite(metadataTime) && metadataTime > 0 ? metadataTime : fileStat.mtime.getTime();
}

async function listGeneratedImageFiles(dir: string, base = ""): Promise<string[]> {
  const entries = await readdir(path.join(dir, base), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relative = path.join(base, entry.name);
    if (entry.isDirectory() && entry.name === "_variants") return [];
    if (entry.isDirectory()) return listGeneratedImageFiles(dir, relative);
    if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) return [relative];
    return [];
  }));
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

function layoutCheckValue(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (source.status !== "passed" && source.status !== "risk" && source.status !== "failed") return undefined;
  const status = source.status as "passed" | "risk" | "failed";
  return {
    status,
    label: stringValue(source.label) || "排版待检查",
    issues: Array.isArray(source.issues) ? source.issues.filter((item): item is string => typeof item === "string") : [],
    suggestions: Array.isArray(source.suggestions) ? source.suggestions.filter((item): item is string => typeof item === "string") : [],
  };
}
