import path from "node:path";
import { NextResponse } from "next/server";
import { mapWithConcurrency } from "@/lib/async-utils";
import { adminDeleteAuthUser, adminUpsertAuthUser, AuthInputError, listAuthUsers, requireCurrentUser, userDataPath, type AuthUser } from "@/lib/auth";
import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store";
import { maskApiKey } from "@/lib/local-config";

export const runtime = "nodejs";

const accountSummaryReadConcurrency = 8;

type StoredProject = {
  id: string;
  name: string;
  nodes?: unknown[];
  assets?: unknown[];
  runs?: unknown[];
  updatedAt?: string;
};

type ProjectStore = {
  projects?: StoredProject[];
};

type UserConfig = {
  openaiApiKey?: string;
  apiKey?: string;
  providerName?: string;
  providerId?: string;
  apiBaseUrl?: string;
  textModel?: string;
  analysisModel?: string;
  imageModel?: string;
  lastTestedAt?: string;
};

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "owner") return NextResponse.json({ ok: false, error: "只有管理员可以访问账号管理。" }, { status: 403 });
  const url = new URL(request.url);
  const revealUserId = url.searchParams.get("revealUserId") || "";
  const users = await listAuthUsers();
  const accounts = await mapWithConcurrency(users, accountSummaryReadConcurrency, (user) => buildAccountSummary(user, currentUser, revealUserId === user.id));
  return NextResponse.json({ ok: true, currentUserId: currentUser.id, accounts });
}

export async function POST(request: Request) {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "owner") return NextResponse.json({ ok: false, error: "只有管理员可以访问账号管理。" }, { status: 403 });
  try {
    const body = await parseAdminAccountPayload(request);
    if (body.action === "clearApiKey") {
      if (!body.userId) return NextResponse.json({ ok: false, error: "缺少账号 ID。" }, { status: 400 });
      await clearAccountApiKey(body.userId);
      return NextResponse.json({ ok: true, message: "API Key 已清理。" });
    }

    const user = await adminUpsertAuthUser({
      id: body.id,
      email: body.email || "",
      password: body.password || undefined,
      name: body.name || undefined,
      role: body.role === "owner" ? "owner" : "user",
    });
    return NextResponse.json({ ok: true, user, message: body.id ? "账号已更新。" : "账号已创建。" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: adminAccountErrorMessage("账号操作失败", error) }, { status: error instanceof AuthInputError ? 400 : 500 });
  }
}

export async function DELETE(request: Request) {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "owner") return NextResponse.json({ ok: false, error: "只有管理员可以访问账号管理。" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) as { userId?: string };
    if (!body.userId) return NextResponse.json({ ok: false, error: "缺少账号 ID。" }, { status: 400 });
    const deleted = await adminDeleteAuthUser({ id: body.userId, currentUserId: currentUser.id });
    return NextResponse.json({ ok: true, deleted, message: "账号已删除。" });
  } catch (error) {
    return NextResponse.json({ ok: false, error: adminAccountErrorMessage("删除账号失败", error) }, { status: error instanceof AuthInputError ? 400 : 500 });
  }
}

async function parseAdminAccountPayload(request: Request) {
  const body = await request.json().catch(() => null) as null | {
    action?: string;
    id?: string;
    userId?: string;
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };
  if (!body || typeof body !== "object") throw new AuthInputError("账号请求格式不正确。");
  return body;
}

async function buildAccountSummary(user: AuthUser, currentUser: AuthUser, revealApiKey: boolean) {
  const projectStats = await readProjectStats(user.id);
  const config = await readAccountConfig(user);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || "",
    loginCount: user.loginCount || 0,
    isCurrent: user.id === currentUser.id,
    activeRecently: Boolean(user.lastLoginAt && Date.now() - new Date(user.lastLoginAt).getTime() < 1000 * 60 * 60 * 24),
    projects: projectStats,
    api: {
      hasKey: Boolean(config.apiKey),
      maskedApiKey: maskApiKey(config.apiKey),
      apiKey: revealApiKey && config.canReveal ? config.apiKey : "",
      keySource: config.keySource,
      canReveal: config.canReveal,
      providerName: config.config.providerName || config.config.providerId || "",
      apiBaseUrl: config.config.apiBaseUrl || "",
      textModel: config.config.textModel || config.config.analysisModel || "",
      imageModel: config.config.imageModel || "",
      lastTestedAt: config.config.lastTestedAt || "",
    },
  };
}

async function readProjectStats(userId: string) {
  const store = await readJsonWithBackup<ProjectStore>(userDataPath(userId, "projects.local.json"), { projects: [] });
  const projects = Array.isArray(store.projects) ? store.projects : [];
  return projects.reduce((stats, project) => {
    const nodes = Array.isArray(project.nodes) ? project.nodes : [];
    const outputs = nodes.reduce<number>((count, node) => {
      if (!node || typeof node !== "object") return count;
      const data = (node as { data?: { output?: unknown; outputs?: unknown[] } }).data;
      return count + (data?.output ? 1 : 0) + (Array.isArray(data?.outputs) ? data.outputs.length : 0);
    }, 0);
    return {
      count: stats.count + 1,
      nodeCount: stats.nodeCount + nodes.length,
      assetCount: stats.assetCount + (Array.isArray(project.assets) ? project.assets.length : 0),
      runCount: stats.runCount + (Array.isArray(project.runs) ? project.runs.length : 0),
      outputCount: stats.outputCount + outputs,
      latestUpdatedAt: maxIsoDate(stats.latestUpdatedAt, project.updatedAt || ""),
    };
  }, { count: 0, nodeCount: 0, assetCount: 0, runCount: 0, outputCount: 0, latestUpdatedAt: "" } as { count: number; nodeCount: number; assetCount: number; runCount: number; outputCount: number; latestUpdatedAt: string });
}

async function readAccountConfig(user: AuthUser) {
  const scopedPath = userDataPath(user.id, "config.local.json");
  const scoped = await readJsonWithBackup<UserConfig>(scopedPath, {});
  const legacyPath = path.join(process.cwd(), "config.local.json");
  const legacy = user.role === "owner" ? await readJsonWithBackup<UserConfig>(legacyPath, {}) : {};
  const config = Object.keys(scoped).length ? scoped : legacy;
  const scopedKey = scoped.openaiApiKey || scoped.apiKey || "";
  const legacyKey = legacy.openaiApiKey || legacy.apiKey || "";
  const envKey = user.role === "owner" ? process.env.OPENAI_API_KEY || "" : "";
  const apiKey = scopedKey || legacyKey || envKey;
  return {
    config,
    apiKey,
    keySource: scopedKey ? "account" : legacyKey ? "legacy" : envKey ? "env" : "none",
    canReveal: Boolean(scopedKey || legacyKey),
  };
}

async function clearAccountApiKey(userId: string) {
  const scopedPath = userDataPath(userId, "config.local.json");
  const scoped = await readJsonWithBackup<UserConfig>(scopedPath, {});
  await writeJsonAtomic(scopedPath, { ...scoped, openaiApiKey: "", apiKey: "" });
}

function maxIsoDate(left: string, right: string) {
  if (!left) return right;
  if (!right) return left;
  return new Date(right).getTime() > new Date(left).getTime() ? right : left;
}

function adminAccountErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : action;
}
