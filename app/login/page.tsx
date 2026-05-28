"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LockKeyhole, UserPlus } from "lucide-react";

type AuthState = {
  hasUsers: boolean;
  allowRegistration: boolean;
  user: { name: string; email: string } | null;
};

export default function LoginPage() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/state")
      .then((response) => response.json())
      .then((state: AuthState) => {
        if (!active) return;
        setAuthState(state);
        setMode(state.hasUsers ? "login" : "register");
      })
      .catch(() => {
        if (active) setError("无法读取登录状态，请刷新页面。");
      });
    return () => {
      active = false;
    };
  }, []);

  const title = useMemo(() => {
    if (!authState) return "账号登录";
    if (mode === "register" && !authState.hasUsers) return "创建站点管理员";
    if (mode === "register") return "创建账号";
    return "账号登录";
  }, [authState, mode]);

  const description = mode === "register"
    ? "第一次部署需要先创建管理员账号，之后没有账号的人不能调用你的生图接口。"
    : "登录后才能进入工作台、调用模型和查看项目。";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "操作失败。");
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.assign(next);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  const canSwitchToRegister = Boolean(authState?.allowRegistration);

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="账号登录">
        <div className="login-mark" aria-hidden="true">
          {mode === "register" ? <UserPlus size={26} /> : <LockKeyhole size={26} />}
        </div>
        <div className="login-heading">
          <p>AI Design Studio</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </div>

        <form className="login-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              <span>名称</span>
              <input
                autoComplete="name"
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：张强"
                value={name}
              />
            </label>
          ) : null}
          <label>
            <span>邮箱</span>
            <input
              autoComplete="email"
              disabled={busy}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>密码</span>
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              disabled={busy}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <button className="login-submit" disabled={busy || !authState} type="submit">
            {busy ? "处理中..." : mode === "register" ? "创建并进入" : "登录"}
          </button>
        </form>

        {authState?.hasUsers ? (
          <div className="login-switch">
            {canSwitchToRegister ? (
              <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "创建新账号" : "返回登录"}
              </button>
            ) : (
              <span>公开注册已关闭，需要管理员在服务器上开启或创建账号。</span>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
