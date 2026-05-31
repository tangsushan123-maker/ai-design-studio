import { access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { mapWithConcurrency } from "@/lib/async-utils";
import { AuthRequiredError, listAuthUsers, requireCurrentUser, userDataPath } from "@/lib/auth";
import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store";
import {
  createDefaultProjectKnowledge,
  normalizeProjectKnowledge,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";

export const runtime = "nodejs";

const rootProjectsPath = path.join(process.cwd(), "projects.local.json");
const rootLegacyProjectPath = path.join(process.cwd(), "project.local.json");
const ownerProjectStoreReadConcurrency = 8;

type StoredProject = {
  id: string;
  name: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
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
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const id = url.searchParams.get("id");
    const ownerUserId = url.searchParams.get("ownerUserId") || "";
    const isOwner = user.role === "owner";
    const store = isOwner && ownerUserId ? await readStore(ownerUserId, { includeRootMigration: false }) : await readStore(user.id);

    if (mode === "list") {
      if (isOwner) {
        const ownerStores = await readAllOwnerProjectStores(user.id);
        const projects = ownerProjectsFromStores(ownerStores);
        const sortedProjects = projects.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        const activeProjectId = ownerStores.find((entry) => entry.owner.id === user.id)?.store.activeProjectId || store.activeProjectId;
        return NextResponse.json({
          activeProjectId,
          projects: summarizeProjects(sortedProjects),
          adminProjectView: true,
        });
      }
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

    const project = isOwner
      ? await findProjectForOwnerView(id, ownerUserId, user.id)
      : store.projects.find((item) => item.id === id) || store.projects.find((item) => item.id === store.activeProjectId) || createBlankProject();
    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    return NextResponse.json({ error: projectErrorMessage("读取项目失败", error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();
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
    const targetUserId = user.role === "owner" && input.ownerUserId ? input.ownerUserId : user.id;
    const store = await readStore(targetUserId, { includeRootMigration: targetUserId === user.id });
    const projectId = input.id || `project_${Date.now()}`;
    const projectName = input.name || "AI 设计项目";
    const project: StoredProject = {
      id: projectId,
      name: projectName,
      ownerUserId: targetUserId,
      ownerEmail: typeof input.ownerEmail === "string" ? input.ownerEmail : undefined,
      ownerName: typeof input.ownerName === "string" ? input.ownerName : undefined,
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
    await writeStore(targetUserId, nextStore);
    const responseProjects = user.role === "owner"
      ? summarizeProjects(ownerProjectsFromStores(await readAllOwnerProjectStores(user.id)))
      : summarizeProjects(nextStore.projects);
    return NextResponse.json({ ok: true, project, projects: responseProjects, activeProjectId: nextStore.activeProjectId });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
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
    const user = await requireCurrentUser();
    const input = await parseProjectDeletePayload(request);
    if (!input.id) return NextResponse.json({ error: "缺少项目 ID。" }, { status: 400 });

    const targetUserId = user.role === "owner" && input.ownerUserId ? input.ownerUserId : user.id;
    const store = await readStore(targetUserId, { includeRootMigration: targetUserId === user.id });
    const projects = store.projects.filter((project) => project.id !== input.id);
    const nextProjects = projects.length ? projects : [createBlankProject()];
    const nextActiveId = store.activeProjectId === input.id ? nextProjects[0].id : store.activeProjectId;
    const nextStore = {
      activeProjectId: nextProjects.some((project) => project.id === nextActiveId) ? nextActiveId : nextProjects[0].id,
      projects: nextProjects,
    };
    await writeStore(targetUserId, nextStore);
    const responseProjects = user.role === "owner"
      ? summarizeProjects(ownerProjectsFromStores(await readAllOwnerProjectStores(user.id)))
      : summarizeProjects(nextStore.projects);
    return NextResponse.json({ ok: true, activeProjectId: nextStore.activeProjectId, projects: responseProjects });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    if (error instanceof InvalidProjectDeletePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: projectErrorMessage("删除项目失败", error) }, { status: 500 });
  }
}

class InvalidProjectDeletePayloadError extends Error {}

async function parseProjectDeletePayload(request: Request): Promise<{ id?: string; ownerUserId?: string }> {
  try {
    const input = await request.json() as unknown;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidProjectDeletePayloadError("项目删除请求格式不正确。");
    }
    return input as { id?: string; ownerUserId?: string };
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

async function readStore(userId: string, options: { includeRootMigration?: boolean } = {}): Promise<ProjectStore> {
  const includeRootMigration = options.includeRootMigration ?? true;
  const scopedProjectsPath = userDataPath(userId, "projects.local.json");
  const scopedLegacyProjectPath = userDataPath(userId, "project.local.json");
  const scopedStore = await readProjectStoreFile(scopedProjectsPath);
  const rootStore = includeRootMigration
    ? await readProjectStoreFile(rootProjectsPath)
    : null;
  const scopedLegacy = await readProjectFile(scopedLegacyProjectPath);
  const rootLegacy = includeRootMigration
    ? await readProjectFile(rootLegacyProjectPath)
    : null;

  if (scopedStore) {
    const scoped = reconcileStoreWithLegacyProject(scopedStore, scopedLegacy);
    if (scoped.projects.length !== scopedStore.projects.length || scoped.activeProjectId !== scopedStore.activeProjectId) {
      await writeStore(userId, scoped);
    }
    return scoped;
  }

  if (rootStore) {
    const migrated = reconcileStoreWithLegacyProject(rootStore, rootLegacy);
    await writeStore(userId, migrated);
    return migrated;
  }

  try {
    const legacy = scopedLegacy || rootLegacy;
    if (!legacy) throw new Error("No legacy project");
    const project = normalizeStoredProject({ ...createBlankProject(), ...legacy, id: legacy.id || "local-project" });
    const migrated = { activeProjectId: project.id, projects: [project] };
    await writeStore(userId, migrated);
    return migrated;
  } catch {}

  const blank = createBlankProject();
  return { activeProjectId: blank.id, projects: [blank] };
}

async function readAllOwnerProjectStores(currentUserId: string) {
  const users = await listAuthUsers();
  const orderedUsers = orderUsersWithCurrentFirst(users, currentUserId);
  const entries = await mapWithConcurrency(
    orderedUsers,
    ownerProjectStoreReadConcurrency,
    async (owner) => {
      const includeRootMigration = owner.id === currentUserId;
      const hasScopedStore = await fileExists(userDataPath(owner.id, "projects.local.json")) || await fileExists(userDataPath(owner.id, "project.local.json"));
      if (!includeRootMigration && !hasScopedStore) return null;
      const store = await readStore(owner.id, { includeRootMigration });
      const projects = store.projects.filter(isMeaningfulProject);
      return projects.length ? { owner, store: { ...store, projects } } : null;
    },
  );
  return compactProjectStoreEntries(entries);
}

function orderUsersWithCurrentFirst<T extends { id: string }>(users: T[], currentUserId: string) {
  let currentUser: T | null = null;
  const orderedUsers: T[] = [];
  for (const user of users) {
    if (user.id === currentUserId) {
      currentUser = user;
    } else {
      orderedUsers.push(user);
    }
  }
  if (currentUser) orderedUsers.unshift(currentUser);
  return orderedUsers;
}

function compactProjectStoreEntries<T>(entries: Array<T | null>) {
  const compacted: T[] = [];
  for (const entry of entries) {
    if (entry) compacted.push(entry);
  }
  return compacted;
}

function isMeaningfulProject(project: StoredProject) {
  return Boolean(
    project.id !== "local-project" ||
      project.name !== "AI 设计项目" ||
      project.nodes?.length ||
      project.assets?.length ||
      project.runs?.length ||
      project.knowledge?.references.length ||
      project.knowledge?.materialLibrary.items.length ||
      project.knowledge?.archive.organizationName,
  );
}

async function findProjectForOwnerView(projectId: string | null, ownerUserId: string, currentUserId: string) {
  if (ownerUserId) {
    const users = await listAuthUsers();
    const owner = users.find((item) => item.id === ownerUserId);
    const store = await readStore(ownerUserId, { includeRootMigration: ownerUserId === currentUserId });
    const project = store.projects.find((item) => item.id === projectId) || store.projects.find((item) => item.id === store.activeProjectId) || createBlankProject();
    return owner ? withProjectOwner(project, owner) : project;
  }

  const ownerStores = await readAllOwnerProjectStores(currentUserId);
  for (const entry of ownerStores) {
    const project = entry.store.projects.find((item) => item.id === projectId);
    if (project) return withProjectOwner(project, entry.owner);
  }
  const fallback = ownerStores[0];
  return fallback ? withProjectOwner(fallback.store.projects[0], fallback.owner) : createBlankProject();
}

function withProjectOwner(project: StoredProject, owner: { id: string; email: string; name: string }) {
  return {
    ...project,
    ownerUserId: owner.id,
    ownerEmail: owner.email,
    ownerName: owner.name,
  };
}

function ownerProjectsFromStores(ownerStores: Awaited<ReturnType<typeof readAllOwnerProjectStores>>) {
  const projects: StoredProject[] = [];
  for (const entry of ownerStores) {
    for (const project of entry.store.projects) {
      projects.push(withProjectOwner(project, entry.owner));
    }
  }
  return projects;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeStore(userId: string, store: ProjectStore) {
  const scopedProjectsPath = userDataPath(userId, "projects.local.json");
  const scopedLegacyProjectPath = userDataPath(userId, "project.local.json");
  const stableStore = {
    activeProjectId: store.activeProjectId,
    projects: store.projects.map(stripVolatileProjectState),
  };
  await writeJsonAtomic(scopedProjectsPath, stableStore);
  const activeProject = store.projects.find((item) => item.id === store.activeProjectId) || store.projects[0] || createBlankProject();
  await writeJsonAtomic(scopedLegacyProjectPath, stripVolatileProjectState(activeProject));
}

function summarizeProjects(projects: StoredProject[]) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    ownerUserId: project.ownerUserId,
    ownerEmail: project.ownerEmail,
    ownerName: project.ownerName,
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
  const store = await readJsonWithBackup<ProjectStore | null>(filePath, null);
  if (!store || !Array.isArray(store.projects) || !store.projects.length) return null;
  const projects = store.projects.map(normalizeStoredProject);
  const activeProjectId = projects.some((project) => project.id === store.activeProjectId)
    ? store.activeProjectId
    : projects[0].id;
  return { activeProjectId, projects };
}

async function readProjectFile(filePath: string): Promise<StoredProject | null> {
  return readJsonWithBackup<StoredProject | null>(filePath, null);
}

function getProjectCover(project: StoredProject) {
  const imageNode = project.nodes?.find((node) => {
    if (!node || typeof node !== "object") return false;
    const typed = node as { image?: { url?: string }; data?: { image?: { url?: string }; output?: { url?: string } } };
    return Boolean(typed.image?.url || typed.data?.image?.url || typed.data?.output?.url);
  }) as { image?: { url?: string }; data?: { image?: { url?: string }; output?: { url?: string } } } | undefined;
  return imageNode?.image?.url || imageNode?.data?.image?.url || imageNode?.data?.output?.url || "";
}
