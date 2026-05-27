import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/local-json-store";
import {
  createDefaultProjectKnowledge,
  normalizeProjectKnowledge,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";

export const runtime = "nodejs";

const projectsPath = path.join(process.cwd(), "projects.local.json");
const legacyProjectPath = path.join(process.cwd(), "project.local.json");
const projectsBackupPath = `${projectsPath}.bak`;
const legacyProjectBackupPath = `${legacyProjectPath}.bak`;

type StoredProject = {
  id: string;
  name: string;
  projectKind?: "scratch" | "formal" | "temporary";
  updatedAt?: string;
  assets?: unknown[];
  assetText?: string;
  profile?: unknown;
  textProtectionMode?: boolean;
  nodes?: unknown[];
  edges?: unknown[];
  runs?: unknown[];
  viewport?: unknown;
  knowledge?: ProjectKnowledgeBase;
};

type ProjectStore = {
  activeProjectId: string;
  projects: StoredProject[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const id = url.searchParams.get("id");
  const store = await readStore();

  if (mode === "list") {
    return NextResponse.json({
      activeProjectId: store.activeProjectId,
      projects: store.projects.map((project) => ({
        id: project.id,
        name: project.name,
        projectKind: project.projectKind,
        updatedAt: project.updatedAt,
        nodeCount: project.nodes?.length || 0,
        runCount: project.runs?.length || 0,
        assetCount: project.assets?.length || 0,
        coverUrl: getProjectCover(project),
        organizationName: project.knowledge?.archive.organizationName || "",
        libraryName: project.knowledge?.materialLibrary.name || "",
        referenceCount: project.knowledge?.references.length || 0,
      })),
    });
  }

  const project = store.projects.find((item) => item.id === id) || store.projects.find((item) => item.id === store.activeProjectId) || createBlankProject();
  return NextResponse.json(project);
}

export async function POST(request: Request) {
  let payloadBytes = 0;
  try {
    const raw = await request.text();
    payloadBytes = Buffer.byteLength(raw, "utf8");
    if (payloadBytes > 12 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: "项目 JSON 过大，保存已拒绝。请确认图片已经保存为资源引用，不要把 base64 大图直接塞进项目。",
          payloadBytes,
        },
        { status: 413 },
      );
    }

    const input = parseProjectPayload(raw);
    const dataUrlPath = findDataImagePath(input);
    if (dataUrlPath) {
      return NextResponse.json(
        {
          error: `项目仍包含 base64 图片：${dataUrlPath}。请重新上传该图片，系统会保存为图片资源引用后再保存项目。`,
          payloadBytes,
        },
        { status: 400 },
      );
    }
    const store = await readStore();
    const projectId = input.id || `project_${Date.now()}`;
    const projectName = input.name || "AI 设计项目";
    const project: StoredProject = {
      id: projectId,
      name: projectName,
      projectKind: normalizeProjectKind(input.projectKind),
      updatedAt: input.updatedAt || new Date().toISOString(),
      viewport: input.viewport,
      assets: input.assets || [],
      assetText: typeof input.assetText === "string" ? input.assetText : "",
      profile: input.profile && typeof input.profile === "object" ? input.profile : undefined,
      textProtectionMode: typeof input.textProtectionMode === "boolean" ? input.textProtectionMode : true,
      nodes: input.nodes || [],
      edges: input.edges || [],
      runs: Array.isArray(input.runs) ? input.runs : [],
      knowledge: normalizeProjectKnowledge(input.knowledge, {
        projectId,
        projectName,
      }),
    };

    const index = store.projects.findIndex((item) => item.id === project.id);
    const projects = index >= 0 ? store.projects.map((item) => (item.id === project.id ? project : item)) : [project, ...store.projects];
    const nextStore = {
      activeProjectId: input.setActive === false ? store.activeProjectId : project.id,
      projects,
    };
    await writeStore(nextStore);
    return NextResponse.json({ ok: true, project, projects: summarizeProjects(nextStore.projects), activeProjectId: nextStore.activeProjectId });
  } catch (error) {
    if (error instanceof InvalidProjectPayloadError) {
      return NextResponse.json(
        {
          error: error.message,
          payloadBytes,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: `保存项目失败：${error instanceof Error ? error.message : "未知错误"}`,
        payloadBytes,
      },
      { status: 500 },
    );
  }
}

class InvalidProjectPayloadError extends Error {}

function parseProjectPayload(raw: string): Partial<StoredProject> & { setActive?: boolean } {
  try {
    return JSON.parse(raw || "{}") as Partial<StoredProject> & { setActive?: boolean };
  } catch {
    throw new InvalidProjectPayloadError("项目 JSON 无法解析，保存已拒绝。请刷新页面后重试，或从项目列表重新打开。");
  }
}

export async function DELETE(request: Request) {
  try {
    const input = await parseProjectDeletePayload(request);
    if (!input.id) return NextResponse.json({ error: "缺少项目 ID。" }, { status: 400 });

    const store = await readStore();
    const projects = store.projects.filter((project) => project.id !== input.id);
    const nextProjects = projects.length ? projects : [createBlankProject()];
    const nextActiveId = store.activeProjectId === input.id ? nextProjects[0].id : store.activeProjectId;
    const nextStore = {
      activeProjectId: nextProjects.some((project) => project.id === nextActiveId) ? nextActiveId : nextProjects[0].id,
      projects: nextProjects,
    };
    await writeStore(nextStore);
    return NextResponse.json({ ok: true, activeProjectId: nextStore.activeProjectId, projects: summarizeProjects(nextStore.projects) });
  } catch (error) {
    if (error instanceof InvalidProjectDeletePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: projectErrorMessage("删除项目失败", error) }, { status: 500 });
  }
}

class InvalidProjectDeletePayloadError extends Error {}

async function parseProjectDeletePayload(request: Request): Promise<{ id?: string }> {
  try {
    const input = await request.json() as unknown;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidProjectDeletePayloadError("项目删除请求格式不正确。");
    }
    return input as { id?: string };
  } catch (error) {
    if (error instanceof InvalidProjectDeletePayloadError) throw error;
    throw new InvalidProjectDeletePayloadError("项目删除 JSON 无法解析，请刷新项目列表后重试。");
  }
}

function projectErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}。`;
}

function createBlankProject(): StoredProject {
  const id = "local-project";
  const name = "AI 设计项目";
  return {
    id,
    name,
    projectKind: "scratch",
    updatedAt: new Date().toISOString(),
    assets: [],
    nodes: [],
    edges: [],
    runs: [],
    knowledge: createDefaultProjectKnowledge({ projectId: id, projectName: name }),
  };
}

async function readStore(): Promise<ProjectStore> {
  const store = await readProjectStoreFile(projectsPath) || await readProjectStoreFile(projectsBackupPath);
  if (store) {
    const legacy = (await readProjectFile(legacyProjectPath)) || (await readProjectFile(legacyProjectBackupPath));
    return reconcileStoreWithLegacyProject(store, legacy);
  }

  try {
    const legacy = (await readProjectFile(legacyProjectPath)) || (await readProjectFile(legacyProjectBackupPath));
    if (!legacy) throw new Error("No legacy project");
    const project = normalizeStoredProject({ ...createBlankProject(), ...legacy, id: legacy.id || "local-project" });
    return { activeProjectId: project.id, projects: [project] };
  } catch {}

  const blank = createBlankProject();
  return { activeProjectId: blank.id, projects: [blank] };
}

async function writeStore(store: ProjectStore) {
  const stableStore = {
    activeProjectId: store.activeProjectId,
    projects: store.projects.map(stripVolatileProjectState),
  };
  await writeJsonAtomic(projectsPath, stableStore);
  const activeProject = store.projects.find((item) => item.id === store.activeProjectId) || store.projects[0] || createBlankProject();
  await writeJsonAtomic(legacyProjectPath, stripVolatileProjectState(activeProject));
}

function summarizeProjects(projects: StoredProject[]) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    projectKind: project.projectKind,
    updatedAt: project.updatedAt,
    nodeCount: project.nodes?.length || 0,
    runCount: project.runs?.length || 0,
    assetCount: project.assets?.length || 0,
    coverUrl: getProjectCover(project),
    organizationName: project.knowledge?.archive.organizationName || "",
    libraryName: project.knowledge?.materialLibrary.name || "",
    referenceCount: project.knowledge?.references.length || 0,
  }));
}

function normalizeStoredProject(project: StoredProject): StoredProject {
  const normalizedId = project.id || `project_${Date.now()}`;
  const normalizedName = project.name || "AI 设计项目";
  return {
    ...createBlankProject(),
    ...project,
    id: normalizedId,
    name: normalizedName,
    projectKind: normalizeProjectKind(project.projectKind, project),
    runs: Array.isArray(project.runs) ? project.runs : [],
    knowledge: normalizeProjectKnowledge(project.knowledge, {
      projectId: normalizedId,
      projectName: normalizedName,
    }),
  };
}

function reconcileStoreWithLegacyProject(store: ProjectStore, legacyProject: StoredProject | null): ProjectStore {
  if (!legacyProject?.id) return store;
  const legacy = normalizeStoredProject(legacyProject);
  const index = store.projects.findIndex((project) => project.id === legacy.id);
  if (index < 0) {
    return {
      activeProjectId: store.projects.some((project) => project.id === store.activeProjectId) ? store.activeProjectId : legacy.id,
      projects: [legacy, ...store.projects],
    };
  }

  const current = store.projects[index];
  const merged = mergeMostCompleteProjectState(current, legacy);
  if (merged === current) return store;
  const projects = store.projects.map((project) => (project.id === merged.id ? merged : project));
  return { ...store, projects };
}

function mergeMostCompleteProjectState(current: StoredProject, legacy: StoredProject): StoredProject {
  const currentScore = projectStateCompletenessScore(current);
  const legacyScore = projectStateCompletenessScore(legacy);
  if (legacyScore <= currentScore) return current;
  return {
    ...current,
    ...legacy,
    assets: longerArray(legacy.assets, current.assets),
    nodes: betterNodeArray(legacy.nodes, current.nodes),
    edges: longerArray(legacy.edges, current.edges),
    runs: betterRunArray(legacy.runs, current.runs),
    knowledge: legacy.knowledge || current.knowledge,
    profile: legacy.profile || current.profile,
    assetText: legacy.assetText ?? current.assetText,
    viewport: legacy.viewport || current.viewport,
  };
}

function projectStateCompletenessScore(project: StoredProject) {
  const nodes: unknown[] = Array.isArray(project.nodes) ? project.nodes : [];
  const runs: unknown[] = Array.isArray(project.runs) ? project.runs : [];
  const outputs = nodes.reduce<number>((count, node) => {
    if (!node || typeof node !== "object") return count;
    const data = (node as { data?: { output?: unknown; outputs?: unknown[] } }).data;
    return count + (data?.output ? 1 : 0) + (Array.isArray(data?.outputs) ? data.outputs.length : 0);
  }, 0);
  const finishedRuns = runs.filter((run) => {
    if (!run || typeof run !== "object") return false;
    const status = (run as { status?: string; endedAt?: unknown }).status;
    return Boolean((run as { endedAt?: unknown }).endedAt || status === "completed" || status === "failed" || status === "cancelled");
  }).length;
  return (
    nodes.length * 20 +
    outputs * 18 +
    (project.edges?.length || 0) * 8 +
    runs.length * 4 +
    finishedRuns * 6 +
    (project.assets?.length || 0) * 2 +
    (project.assetText ? 3 : 0)
  );
}

function longerArray<T>(preferred?: T[], fallback?: T[]) {
  return (preferred?.length || 0) >= (fallback?.length || 0) ? preferred || [] : fallback || [];
}

function betterNodeArray(preferred?: unknown[], fallback?: unknown[]) {
  const preferredScore = nodeArrayOutputScore(preferred);
  const fallbackScore = nodeArrayOutputScore(fallback);
  if (preferredScore === fallbackScore) return longerArray(preferred, fallback);
  return preferredScore > fallbackScore ? preferred || [] : fallback || [];
}

function betterRunArray(preferred?: unknown[], fallback?: unknown[]) {
  const preferredScore = runArrayFinishedScore(preferred);
  const fallbackScore = runArrayFinishedScore(fallback);
  if (preferredScore === fallbackScore) return longerArray(preferred, fallback);
  return preferredScore > fallbackScore ? preferred || [] : fallback || [];
}

function nodeArrayOutputScore(nodes?: unknown[]) {
  return (nodes || []).reduce<number>((score, node) => {
    if (!node || typeof node !== "object") return score;
    const data = (node as { data?: { output?: unknown; outputs?: unknown[] } }).data;
    return score + (data?.output ? 2 : 0) + (Array.isArray(data?.outputs) ? data.outputs.length : 0);
  }, 0);
}

function runArrayFinishedScore(runs?: unknown[]) {
  return (runs || []).filter((run) => {
    if (!run || typeof run !== "object") return false;
    const typed = run as { status?: string; endedAt?: unknown };
    return Boolean(typed.endedAt || typed.status === "completed" || typed.status === "failed" || typed.status === "cancelled");
  }).length;
}

function normalizeProjectKind(value: unknown, project?: StoredProject): NonNullable<StoredProject["projectKind"]> {
  if (value === "formal" || value === "temporary" || value === "scratch") return value;
  if (project?.name?.startsWith("临时项目：")) return "temporary";
  return "formal";
}

function stripVolatileProjectState(project: StoredProject): StoredProject {
  const stableProject = { ...project } as StoredProject & { activeStrategyPackage?: unknown; activeStrategyMaterialId?: unknown };
  delete stableProject.activeStrategyPackage;
  delete stableProject.activeStrategyMaterialId;
  return {
    ...stableProject,
    runs: Array.isArray(stableProject.runs) ? stableProject.runs : [],
  };
}

function findDataImagePath(value: unknown, pathLabel = "project"): string {
  if (typeof value === "string") {
    return value.startsWith("data:image/") ? pathLabel : "";
  }
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findDataImagePath(value[index], `${pathLabel}[${index}]`);
      if (found) return found;
    }
    return "";
  }

  for (const [key, entry] of Object.entries(value)) {
    const found = findDataImagePath(entry, `${pathLabel}.${key}`);
    if (found) return found;
  }
  return "";
}

async function readProjectStoreFile(filePath: string): Promise<ProjectStore | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const store = JSON.parse(content) as ProjectStore;
    if (!Array.isArray(store.projects) || !store.projects.length) return null;
    const projects = store.projects.map(normalizeStoredProject);
    const activeProjectId = projects.some((project) => project.id === store.activeProjectId)
      ? store.activeProjectId
      : projects[0].id;
    return { activeProjectId, projects };
  } catch {
    return null;
  }
}

async function readProjectFile(filePath: string): Promise<StoredProject | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as StoredProject;
  } catch {
    return null;
  }
}

function getProjectCover(project: StoredProject) {
  const imageNode = project.nodes?.find((node) => {
    if (!node || typeof node !== "object") return false;
    const typed = node as { image?: { url?: string }; data?: { image?: { url?: string }; output?: { url?: string } } };
    return Boolean(typed.image?.url || typed.data?.image?.url || typed.data?.output?.url);
  }) as { image?: { url?: string }; data?: { image?: { url?: string }; output?: { url?: string } } } | undefined;
  return imageNode?.image?.url || imageNode?.data?.image?.url || imageNode?.data?.output?.url || "";
}
