import path from "node:path";
import { NextResponse } from "next/server";
import { mapWithConcurrency } from "@/lib/async-utils";
import { listAuthUsers, requireCurrentUser, userDataPath } from "@/lib/auth";
import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store";
import {
  createDefaultPublicStyleLibraries,
  createEmptyMaterialLibrary,
  normalizeMaterialLibraryRecord,
  type MaterialLibraryRecord,
} from "@/lib/project-system";

export const runtime = "nodejs";

const rootProjectsPath = path.join(process.cwd(), "projects.local.json");
const styleLibrariesPath = path.join(process.cwd(), "style-libraries.local.json");
const projectLibraryReadConcurrency = 8;

type StoredProjectForLibraries = {
  id: string;
  name: string;
  knowledge?: {
    materialLibrary?: unknown;
  };
};

type ProjectLibraryStore = {
  projects?: StoredProjectForLibraries[];
};

type RootProjectStoreLoader = () => Promise<ProjectLibraryStore>;

type StyleLibraryStore = {
  libraries: MaterialLibraryRecord[];
};

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const includeItems = mode === "detail";
    const [projectLibraries, styleLibraries] = await Promise.all([
      user.role === "owner" ? readAllProjectLibraries() : readProjectLibraries(user.id),
      readStyleLibraries(),
    ]);

    return NextResponse.json({
      projectLibraries: projectLibraries.map((library) => summarizeLibrary(library, includeItems)),
      publicStyleLibraries: styleLibraries.map((library) => summarizeLibrary(library, includeItems)),
    });
  } catch (error) {
    return NextResponse.json({ error: materialLibraryErrorMessage("读取素材库失败", error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseMaterialLibraryPayload(request);
    const store = await readStyleLibraryStore();
    const fallback = createEmptyMaterialLibrary({
      id: input.id,
      name: input.name || "未命名风格库",
      kind: "public_style",
      description: input.description || "",
      tags: Array.isArray(input.tags) ? input.tags.filter((item): item is string => typeof item === "string") : [],
    });
    const nextLibrary = normalizeMaterialLibraryRecord({ ...input, kind: "public_style" }, fallback);
    const existingIndex = store.libraries.findIndex((item) => item.id === nextLibrary.id);
    const libraries = existingIndex >= 0
      ? store.libraries.map((item, index) => (index === existingIndex ? { ...nextLibrary, updatedAt: new Date().toISOString() } : item))
      : [{ ...nextLibrary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...store.libraries];
    await writeStyleLibraryStore({ libraries });
    return NextResponse.json({ ok: true, library: nextLibrary, libraries: libraries.map((library) => summarizeLibrary(library, false)) });
  } catch (error) {
    if (error instanceof InvalidMaterialLibraryPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: materialLibraryErrorMessage("保存素材库失败", error) }, { status: 500 });
  }
}

class InvalidMaterialLibraryPayloadError extends Error {}

async function parseMaterialLibraryPayload(request: Request): Promise<Partial<MaterialLibraryRecord> & { mode?: "create" | "update" }> {
  try {
    const input = await request.json() as Partial<MaterialLibraryRecord> & { mode?: "create" | "update" };
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidMaterialLibraryPayloadError("素材库请求格式不正确。");
    }
    return input;
  } catch (error) {
    if (error instanceof InvalidMaterialLibraryPayloadError) throw error;
    throw new InvalidMaterialLibraryPayloadError("素材库 JSON 无法解析，请检查请求内容后重试。");
  }
}

async function readProjectLibraries(userId: string, loadRootProjectStore: RootProjectStoreLoader = readRootProjectStore) {
  const scopedProjectsPath = userDataPath(userId, "projects.local.json");
  let store = await readJsonWithBackup<ProjectLibraryStore>(scopedProjectsPath, {});
  if (!Array.isArray(store.projects) || !store.projects.length) {
    store = await loadRootProjectStore();
  }
  if (!Array.isArray(store.projects)) return [];
  return store.projects.flatMap((project) => {
    const fallback = createEmptyMaterialLibrary({
      id: `${project.id}_library`,
      name: `${project.name || "项目"}素材库`,
      kind: "project",
      ownerProjectId: project.id,
    });
    const normalized = normalizeMaterialLibraryRecord(project.knowledge?.materialLibrary, fallback);
    return [{ ...normalized, ownerProjectId: project.id }];
  });
}

async function readAllProjectLibraries() {
  const users = await listAuthUsers();
  const loadRootProjectStore = createSharedRootProjectStoreLoader();
  const libraries = await mapWithConcurrency(users, projectLibraryReadConcurrency, (user) => readProjectLibraries(user.id, loadRootProjectStore));
  return libraries.flat();
}

function createSharedRootProjectStoreLoader(): RootProjectStoreLoader {
  let pending: Promise<ProjectLibraryStore> | undefined;
  return () => {
    pending ||= readRootProjectStore();
    return pending;
  };
}

async function readRootProjectStore() {
  return readJsonWithBackup<ProjectLibraryStore>(rootProjectsPath, {});
}

async function readStyleLibraries() {
  const store = await readStyleLibraryStore();
  return store.libraries;
}

async function readStyleLibraryStore(): Promise<StyleLibraryStore> {
  const seededDefaults = createDefaultPublicStyleLibraries();
  const seededById = new Map(seededDefaults.map((library) => [library.id, library]));
  const store = await readJsonWithBackup<StyleLibraryStore | null>(styleLibrariesPath, null);
  if (store && Array.isArray(store.libraries) && store.libraries.length) {
    return {
      libraries: store.libraries.map((library) => {
        const fallback = seededById.get(library.id) || createEmptyMaterialLibrary({
          id: library.id,
          name: library.name,
          kind: "public_style",
          description: library.description,
          tags: library.tags,
        });
        const normalized = normalizeMaterialLibraryRecord(library, fallback);
        return normalized.items.length ? normalized : { ...normalized, items: fallback.items };
      }),
    };
  }

  const seeded = { libraries: seededDefaults };
  await writeStyleLibraryStore(seeded);
  return seeded;
}

async function writeStyleLibraryStore(store: StyleLibraryStore) {
  await writeJsonAtomic(styleLibrariesPath, store);
}

function summarizeLibrary(library: MaterialLibraryRecord, includeItems: boolean) {
  const itemCounts = materialLibraryItemCounts(library);
  return {
    id: library.id,
    name: library.name,
    kind: library.kind,
    ownerProjectId: library.ownerProjectId,
    description: library.description,
    tags: library.tags,
    itemCount: library.items.length,
    styleRuleCount: itemCounts.styleRuleCount,
    referenceCount: itemCounts.referenceCount,
    updatedAt: library.updatedAt,
    items: includeItems ? library.items : undefined,
  };
}

function materialLibraryItemCounts(library: MaterialLibraryRecord) {
  let styleRuleCount = 0;
  let referenceCount = 0;
  for (const item of library.items) {
    if (item.type === "style_rule") styleRuleCount += 1;
    if (item.type === "reference") referenceCount += 1;
  }
  return { styleRuleCount, referenceCount };
}

function materialLibraryErrorMessage(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const clean = message.replace(process.cwd(), "[project]").slice(0, 180);
  return clean ? `${prefix}：${clean}` : `${prefix}，请检查项目目录写入权限。`;
}
