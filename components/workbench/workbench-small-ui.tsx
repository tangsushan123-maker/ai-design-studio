import type { ReactNode } from "react";
import type { NodeStatus } from "@/components/workbench/workbench-types";

export function MiniInput({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="apple-field-label mb-1 block">{label}</span>
      <input
        className="apple-input h-9 w-full px-3 text-[11px] text-white/76 outline-none"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export function ToolbarButton({
  expanded = true,
  icon,
  label,
  onClick,
  tone = "default",
}: {
  expanded?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={`flex items-center justify-center rounded-[18px] border transition ${
        tone === "danger"
          ? "apple-button-danger text-[#ffb4a8]"
          : "apple-button text-white/72"
      } ${expanded ? "w-full flex-col gap-1 px-1 py-2.5" : "size-10 px-0 py-0"}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      {expanded ? <span className="text-[11px] leading-none opacity-80">{label}</span> : null}
    </button>
  );
}

export function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-5">
      <span className="apple-caption shrink-0">{label}</span>
      <span className="h-1 w-1 shrink-0 rounded-full bg-white/18" />
      <span className="min-w-0 truncate text-white/62" title={value}>{value}</span>
    </div>
  );
}

export function StatusDot({ status }: { status: NodeStatus }) {
  const color = status === "failed" ? "bg-[#ff6b5f]" : status === "cancelled" ? "bg-white/32" : status === "completed" ? "bg-[#74e3c5]" : status === "running" || status === "saving" || status === "queued" ? "bg-[#ffd166]" : "bg-white/24";
  return <span className={`size-2 rounded-full ${color}`} />;
}

export function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[52px_1fr] gap-2">
      <span className="apple-caption">{label}</span>
      <span className="truncate text-white/64" title={value}>{value}</span>
    </div>
  );
}

export function EmptyPanel({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/12 bg-white/[0.035] p-6 text-center">
      <div className="mb-3 text-white/34">{icon}</div>
      <div className="text-[14px] font-semibold text-white/74">{title}</div>
      <p className="mt-2 max-w-[250px] text-[11px] leading-5 text-white/38">{description}</p>
    </div>
  );
}

export function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="apple-surface-section space-y-2 p-3">
      <div className="apple-section-title text-[12px] text-white/72">{title}</div>
      {children}
    </section>
  );
}

export function InspectorInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="apple-field-label mb-1 block">{label}</span>
      <input
        className="apple-input h-9 w-full px-3 text-[11px] text-white/76 outline-none placeholder:text-white/28"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function InspectorTextarea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="apple-surface-section block p-3">
      <span className="apple-field-label mb-1.5 block">{label}</span>
      <textarea
        className="min-h-[104px] w-full resize-none bg-transparent text-[12px] leading-5 text-white/80 outline-none placeholder:text-white/28"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
