"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Shield, UserPlus, Users } from "lucide-react";

type Status = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

type AdminAccountSummary = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "user";
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  loginCount: number;
  isCurrent: boolean;
  activeRecently: boolean;
  projects: {
    count: number;
    nodeCount: number;
    assetCount: number;
    runCount: number;
    outputCount: number;
    latestUpdatedAt: string;
  };
  api: {
    hasKey: boolean;
    maskedApiKey: string;
    apiKey?: string;
    keySource: string;
    canReveal: boolean;
    providerName: string;
    apiBaseUrl: string;
    textModel: string;
    imageModel: string;
    lastTestedAt: string;
  };
};

type AdminAccountsResponse = {
  ok: boolean;
  accounts?: AdminAccountSummary[];
  currentUserId?: string;
  error?: string;
  message?: string;
};

type AccountDraft = {
  id: string;
  email: string;
  name: string;
  password: string;
  role: "owner" | "user";
};

const emptyAccountDraft: AccountDraft = { id: "", email: "", name: "", password: "", role: "user" };

function requestFailure(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  return detail ? `${action}：${detail}` : action;
}

async function readJson<T>(response: Response): Promise<T & { error?: string; message?: string }> {
  return await response.json().catch(() => ({})) as T & { error?: string; message?: string };
}

export function AdminAccountsManager() {
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "" });
  const [draft, setDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [activeAction, setActiveAction] = useState("");
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState("");

  useEffect(() => {
    void reloadAccounts();
  }, []);

  async function reloadAccounts(options?: { revealUserId?: string }) {
    try {
      const url = options?.revealUserId ? `/api/admin/accounts?revealUserId=${encodeURIComponent(options.revealUserId)}` : "/api/admin/accounts";
      const response = await fetch(url);
      if (response.status === 403 || response.status === 401) {
        setForbidden(true);
        setReady(false);
        return;
      }
      const data = await readJson<AdminAccountsResponse>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "账号管理读取失败");
      setAccounts(data.accounts || []);
      setReady(true);
      setForbidden(false);
    } catch (error) {
      setReady(false);
      setStatus({ type: "error", message: requestFailure("读取账号管理失败", error) });
    }
  }

  async function saveAccount() {
    const isEditing = Boolean(draft.id);
    if (!draft.email.trim()) {
      setStatus({ type: "error", message: "账号邮箱不能为空。" });
      return;
    }
    if (!isEditing && draft.password.length < 8) {
      setStatus({ type: "error", message: "新账号密码至少 8 位。" });
      return;
    }
    setActiveAction("save");
    setStatus({ type: "loading", message: isEditing ? "正在更新账号..." : "正在创建账号..." });
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          email: draft.email,
          name: draft.name,
          password: draft.password,
          role: draft.role,
        }),
      });
      const data = await readJson<AdminAccountsResponse>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "账号保存失败");
      setDraft(emptyAccountDraft);
      setStatus({ type: "success", message: data.message || "账号已保存。" });
      await reloadAccounts();
    } catch (error) {
      setStatus({ type: "error", message: requestFailure("账号保存失败", error) });
    } finally {
      setActiveAction("");
    }
  }

  async function clearAccountApiKey(account: AdminAccountSummary) {
    setActiveAction(`clear:${account.id}`);
    setStatus({ type: "loading", message: `正在清理 ${account.email} 的 API Key...` });
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearApiKey", userId: account.id }),
      });
      const data = await readJson<AdminAccountsResponse>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "清理失败");
      setStatus({ type: "success", message: "API Key 已清理。" });
      await reloadAccounts();
    } catch (error) {
      setStatus({ type: "error", message: requestFailure("清理 API Key 失败", error) });
    } finally {
      setActiveAction("");
    }
  }

  async function deleteAccount(account: AdminAccountSummary) {
    if (confirmDeleteAccountId !== account.id) {
      setConfirmDeleteAccountId(account.id);
      setStatus({ type: "idle", message: `再点一次删除「${account.email}」。` });
      return;
    }
    setActiveAction(`delete:${account.id}`);
    setStatus({ type: "loading", message: `正在删除 ${account.email}...` });
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.id }),
      });
      const data = await readJson<AdminAccountsResponse>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "删除失败");
      setConfirmDeleteAccountId("");
      setStatus({ type: "success", message: "账号已删除。" });
      await reloadAccounts();
    } catch (error) {
      setStatus({ type: "error", message: requestFailure("删除账号失败", error) });
    } finally {
      setActiveAction("");
    }
  }

  function editAccount(account: AdminAccountSummary) {
    setDraft({
      id: account.id,
      email: account.email,
      name: account.name,
      password: "",
      role: account.role,
    });
    setStatus({ type: "idle", message: "正在编辑账号，密码留空则不修改。" });
  }

  if (forbidden) {
    return (
      <section className="apple-panel p-5">
        <div className="text-sm font-semibold text-white/88">没有权限</div>
        <p className="apple-caption mt-2">只有管理员可以管理子账号。普通账号只能切换账号。</p>
      </section>
    );
  }

  if (!ready && status.type !== "error") {
    return (
      <section className="apple-panel flex items-center gap-2 p-5 text-sm text-white/64">
        <Loader2 className="size-4 animate-spin" />
        正在读取子账号...
      </section>
    );
  }

  const busy = Boolean(activeAction);
  return (
    <section className="apple-panel p-4">
      <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/88">子账号管理</h2>
          <p className="apple-caption mt-1">管理员可创建账号、查看使用情况、清理子账号 API Key。</p>
        </div>
        <button className="apple-button inline-flex items-center gap-2 px-3 py-2 text-xs text-white/70" disabled={busy} onClick={() => reloadAccounts()} type="button">
          <RefreshCw className="size-3.5" />
          刷新
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/82">
            <UserPlus className="size-4" />
            {draft.id ? "编辑账号" : "新建账号"}
          </div>
          <div className="space-y-2">
            <input className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={busy} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="账号邮箱" value={draft.email} />
            <input className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="名称" value={draft.name} />
            <input className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={busy} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={draft.id ? "密码留空不修改" : "初始密码，至少 8 位"} type="password" value={draft.password} />
            <select className="apple-select h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={busy} onChange={(event) => setDraft({ ...draft, role: event.target.value === "owner" ? "owner" : "user" })} value={draft.role}>
              <option value="user">普通账号</option>
              <option value="owner">管理员</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="apple-button-primary inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold" disabled={busy} onClick={saveAccount} type="button">
              {activeAction === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {draft.id ? "保存账号" : "创建账号"}
            </button>
            {draft.id ? (
              <button className="apple-button px-3 py-2 text-xs text-white/70" disabled={busy} onClick={() => { setDraft(emptyAccountDraft); setStatus({ type: "idle", message: "" }); }} type="button">
                取消
              </button>
            ) : null}
          </div>
          {status.message ? (
            <div className={`mt-3 rounded-[12px] border px-3 py-2 text-xs leading-5 ${
              status.type === "error"
                ? "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
                : status.type === "success"
                  ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
                  : "border-white/10 bg-white/[0.045] text-white/58"
            }`}>
              {status.message}
            </div>
          ) : null}
        </section>

        <section className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.035] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/82">
              <Users className="size-4" />
              账号列表 · {accounts.length}
            </div>
            <span className="apple-caption">管理员可查看全部项目和密钥状态</span>
          </div>
          <div className="space-y-2">
            {accounts.map((account) => (
              <article className="rounded-[16px] border border-white/10 bg-black/10 p-3" key={account.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="max-w-full break-words text-sm font-semibold leading-5 text-white/86">{account.name || account.email}</span>
                      <span className={account.role === "owner" ? "apple-pill-accent px-2 py-0.5 text-[11px]" : "apple-pill px-2 py-0.5 text-[11px]"}>
                        {account.role === "owner" ? "管理员" : "普通账号"}
                      </span>
                      {account.isCurrent ? <span className="apple-pill px-2 py-0.5 text-[11px]">当前</span> : null}
                      {account.activeRecently ? <span className="apple-status-success rounded-full border px-2 py-0.5 text-[11px]">24h 内登录</span> : null}
                    </div>
                    <div className="apple-caption mt-1 break-all">{account.email}</div>
                    <div className="mt-2 grid gap-2 text-xs text-white/56 sm:grid-cols-2 xl:grid-cols-4">
                      <span>项目 {account.projects.count}</span>
                      <span>节点 {account.projects.nodeCount}</span>
                      <span>素材 {account.projects.assetCount}</span>
                      <span>出图 {account.projects.outputCount}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs leading-5 text-white/46 sm:grid-cols-2">
                      <span>登录：{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "未记录"} · {account.loginCount || 0} 次</span>
                      <span>项目更新：{account.projects.latestUpdatedAt ? new Date(account.projects.latestUpdatedAt).toLocaleString("zh-CN") : "无"}</span>
                    </div>
                    <div className="mt-2 min-w-0 rounded-[12px] border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-white/56">
                      <div className="grid min-w-0 gap-1">
                        <div className="flex min-w-0 items-start gap-2">
                          <Shield className="mt-0.5 size-3.5 shrink-0 text-white/42" />
                          <span className="min-w-0 break-all">Key：{account.api.apiKey || account.api.maskedApiKey || (account.api.hasKey ? "已配置" : "未配置")}</span>
                        </div>
                        <div className="break-words pl-5">来源：{apiKeySourceLabel(account.api.keySource)}</div>
                      </div>
                      <div className="mt-1 break-words">模型：{account.api.textModel || "文本未选"} / {account.api.imageModel || "图片未选"}</div>
                      <div className="break-all">接口：{account.api.providerName || "未配置"} {account.api.apiBaseUrl ? `· ${account.api.apiBaseUrl}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-[420px] lg:justify-end">
                    <button className="apple-button h-9 min-w-[76px] px-3 text-xs text-white/70" disabled={busy} onClick={() => editAccount(account)} type="button">编辑</button>
                    <button className="apple-button h-9 min-w-[88px] px-3 text-xs text-white/70 disabled:opacity-45" disabled={busy || !account.api.hasKey || !account.api.canReveal} onClick={() => reloadAccounts({ revealUserId: account.api.apiKey ? undefined : account.id })} type="button">
                      {account.api.apiKey ? "隐藏" : "显示 Key"}
                    </button>
                    <button className="apple-button-danger h-9 min-w-[92px] px-3 text-xs disabled:opacity-45" disabled={busy || !account.api.hasKey} onClick={() => clearAccountApiKey(account)} type="button">
                      {activeAction === `clear:${account.id}` ? "清理中" : "清理 Key"}
                    </button>
                    <button className="apple-button-danger h-9 min-w-[96px] px-3 text-xs disabled:opacity-45" disabled={busy || account.isCurrent} onClick={() => deleteAccount(account)} type="button">
                      {activeAction === `delete:${account.id}` ? "删除中" : confirmDeleteAccountId === account.id ? "确认删除" : "删除账号"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function apiKeySourceLabel(source: string) {
  if (source === "account") return "账号配置";
  if (source === "legacy") return "全局旧配置";
  if (source === "env") return "服务器环境变量";
  return "无";
}
