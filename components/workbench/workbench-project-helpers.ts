import { projectStorageKey } from "@/components/workbench/workbench-config";
import type {
  ImageAsset,
  ProjectAssetUploadKind,
  ProjectKind,
  ProjectLocalCachePointer,
  ProjectTaskCachePointer,
} from "@/components/workbench/workbench-types";
import type { ProjectAssetRecord } from "@/lib/project-system";

export function inferProjectAssetType(asset: ImageAsset): ProjectAssetRecord["type"] {
  if (asset.nodeOperation === "output" || asset.source === "history") return "history_result";
  if (asset.materialType === "Logo") return "logo";
  if (asset.materialType === "IP形象") return "icon";
  if (asset.materialType === "背景图") return "background";
  if (asset.materialType === "二维码") return "icon";
  if ((asset.fileName || "").toLowerCase().includes("logo")) return "logo";
  return "image";
}

export function resolveProjectAssetMaterialType(item: ProjectAssetRecord) {
  if (item.tags.includes("二维码")) return "二维码";
  if (item.tags.includes("IP形象")) return "IP形象";
  if (item.type === "logo" || item.tags.includes("Logo")) return "Logo";
  if (item.type === "background" || item.tags.includes("背景图")) return "背景图";
  return item.type;
}

export function projectAssetUploadLabel(kind: ProjectAssetUploadKind) {
  if (kind === "logo") return "Logo";
  if (kind === "qrcode") return "二维码";
  if (kind === "ip") return "IP形象";
  return "背景图";
}

export function normalizeProjectKind(value: unknown): ProjectKind {
  if (value === "formal" || value === "temporary" || value === "scratch") return value;
  return "formal";
}

export function isProjectLocalCachePointer(value: unknown): value is ProjectLocalCachePointer {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ProjectLocalCachePointer).version === 2 &&
      (value as ProjectLocalCachePointer).storageMode === "file",
  );
}

export function isProjectTaskCachePointer(value: unknown): value is ProjectTaskCachePointer {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as ProjectTaskCachePointer).version === 2 &&
      (value as ProjectTaskCachePointer).storageMode === "file",
  );
}

export function projectTaskStorageKey(projectId: string) {
  return `${projectStorageKey}:tasks:${projectId || "local-project"}`;
}

export function dismissedTaskStorageKey(projectId: string) {
  return `${projectStorageKey}:dismissed-tasks:${projectId || "local-project"}`;
}

export function dismissedImageStorageKey(projectId: string) {
  return `${projectStorageKey}:dismissed-result-images:${projectId || "local-project"}`;
}

export function projectSnapshotStorageKey(projectId: string) {
  return `${projectStorageKey}:snapshots:${projectId || "local-project"}`;
}
