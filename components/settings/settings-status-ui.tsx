import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, Loader2 } from "lucide-react";

export type SettingsStatus = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

export type SettingsStatusState = "idle" | "success" | "error";

export function SettingsStatusBanner({ status }: { status: SettingsStatus }) {
  const needsLogin = /请先登录|登录已过期/.test(status.message);
  return (
    <div
      className={`mb-5 flex flex-wrap items-center gap-2 rounded-[14px] border px-4 py-3 text-sm ${
        status.type === "error"
          ? "apple-status-danger"
          : status.type === "success"
            ? "apple-status-success"
            : status.type === "loading"
              ? "apple-status-warning"
              : "apple-status-neutral"
      }`}
    >
      {status.type === "loading" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <SettingsStatusIcon state={status.type === "error" ? "error" : status.type === "success" ? "success" : "idle"} />}
      <span className="min-w-0 flex-1 leading-5">{status.message}</span>
      {needsLogin ? (
        <Link className="apple-button rounded-full px-3 py-1.5 text-[11px] font-semibold text-white/78" href="/login">
          去登录
        </Link>
      ) : null}
    </div>
  );
}

export function SettingsPanel({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section className="apple-panel scroll-mt-5 p-4" id={id}>
      <h2 className="mb-3 text-sm font-semibold text-white/88">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsStatusRow({ detail, label, state }: { detail: string; label: string; state: SettingsStatusState }) {
  return (
    <div className="apple-surface-section flex items-start gap-3 p-3">
      <SettingsStatusIcon state={state} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/84">{label}</div>
        <div className="mt-1 break-words text-xs leading-5 text-white/44">{detail}</div>
      </div>
    </div>
  );
}

export function SettingsResultLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="apple-surface-section flex items-start gap-3 p-3 text-sm">
      <SettingsStatusIcon state={ok ? "success" : "error"} />
      <span className="leading-5 text-white/70">{text}</span>
    </div>
  );
}

export function SettingsMiniMetric({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.05] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/42">{label}</span>
        <SettingsStatusIcon state={ok ? "success" : "idle"} />
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-white/78">{value}</div>
    </div>
  );
}

export function SettingsStatusIcon({ state }: { state: SettingsStatusState }) {
  if (state === "success") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7cf0cf]" />;
  if (state === "error") return <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#ff8b80]" />;
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-[#7b8797]" />;
}
