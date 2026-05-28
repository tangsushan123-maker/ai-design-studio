import { projectStorageKey } from "@/components/workbench/workbench-config";
import { sanitizeSerializableImageUrl, stripImageFile } from "@/components/workbench/workbench-image-lifecycle";
import { sanitizeProjectTasks } from "@/components/workbench/workbench-task-helpers";
import type {
  FlowNode,
  ImageAsset,
  ProjectAssetUploadKind,
  ProjectKind,
  ProjectLocalCachePointer,
  ProjectPayload,
  ProjectTaskCachePointer,
} from "@/components/workbench/workbench-types";
import type { ProjectAssetRecord, ProjectKnowledgeBase } from "@/lib/project-system";

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

export function stripProjectRuntimeState<T extends ProjectPayload & { setActive?: boolean }>(project: T): T {
  return {
    ...project,
    assets: project.assets?.map(stripImageFile),
    nodes: project.nodes?.map(sanitizeProjectNode),
    knowledge: sanitizeKnowledgeImageUrls(project.knowledge),
    runs: sanitizeProjectTasks(project.runs || []),
  };
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

function sanitizeProjectNode(node: FlowNode): FlowNode {
  return {
    ...node,
    data: {
      ...node.data,
      onRun: undefined,
      onDelete: undefined,
      onParamChange: undefined,
      onImageFile: undefined,
      onPreview: undefined,
      onMaskEdit: undefined,
      image: node.data.image ? stripImageFile(node.data.image) : undefined,
      output: node.data.output ? stripImageFile(node.data.output) : null,
      outputs: Array.isArray(node.data.outputs) ? node.data.outputs.map(stripImageFile) : [],
    },
  };
}

function sanitizeKnowledgeImageUrls(knowledge?: ProjectKnowledgeBase) {
  if (!knowledge) return knowledge;
  return {
    ...knowledge,
    materialLibrary: {
      ...knowledge.materialLibrary,
      items: knowledge.materialLibrary.items.map((item) => ({
        ...item,
        url: sanitizeSerializableImageUrl(item.url),
        sourceUrl: sanitizeSerializableImageUrl(item.sourceUrl),
      })),
    },
  };
}
