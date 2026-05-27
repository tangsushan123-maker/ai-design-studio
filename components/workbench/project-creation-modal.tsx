"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";

export type ProjectCreationDraft = {
  projectName: string;
  organizationName: string;
  autoSearch: boolean;
};

export function ProjectCreationModal({
  draft,
  onClose,
  onCreate,
}: {
  draft: ProjectCreationDraft;
  onClose: () => void;
  onCreate: (draft: ProjectCreationDraft) => void | Promise<unknown>;
}) {
  const [form, setForm] = useState<ProjectCreationDraft>(draft);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ tone: "error"; text: string } | null>(null);
  const canCreateProject = Boolean(form.projectName.trim());

  async function createProject() {
    if (!canCreateProject || creating) return;
    setCreating(true);
    setMessage(null);
    try {
      await onCreate(form);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "创建项目失败。" });
    } finally {
      setCreating(false);
    }
  }

  function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createProject();
  }

  return (
    <section className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(9,14,23,0.56)] px-4 backdrop-blur-xl">
      <form className="apple-panel-strong w-full max-w-[460px] overflow-hidden rounded-[28px]" onSubmit={submitProject}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-[18px] font-semibold text-white/92">新建项目</div>
            <div className="mt-1 text-[12px] text-white/42">先建项目和素材库，其他资料后面再补。</div>
          </div>
          <button aria-label="关闭新建项目" className="apple-button flex size-9 items-center justify-center text-white/56 disabled:opacity-45" disabled={creating} onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <DraftProfileInput disabled={creating} label="项目名称" placeholder="例如：端午活动海报" value={form.projectName} onChange={(value) => setForm((current) => ({ ...current, projectName: value }))} />
              <DraftProfileInput disabled={creating} label="机构名称" placeholder="可选" value={form.organizationName} onChange={(value) => setForm((current) => ({ ...current, organizationName: value }))} />
            </div>
            <label className="mt-3 flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.052] px-3 py-2.5 text-[12px] text-white/62">
              <input
                checked={form.autoSearch}
                className="size-4 accent-[#74e3c5]"
                disabled={creating}
                onChange={(event) => setForm((current) => ({ ...current, autoSearch: event.target.checked }))}
                type="checkbox"
              />
              <span>自动补全公开信息，先待确认再写入。</span>
            </label>
          </div>
        </div>
        {message ? (
          <div className="mx-5 rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 px-3 py-2 text-[11px] leading-5 text-[#ffc1b8]">
            {message.text}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button className="apple-button h-10 rounded-full px-4 text-[12px] text-white/70 disabled:opacity-45" disabled={creating} onClick={onClose} type="button">取消</button>
          <button
            className="apple-button-primary h-10 rounded-full px-4 text-[12px] font-semibold disabled:opacity-45"
            disabled={!canCreateProject || creating}
            type="submit"
          >
            {creating ? "创建中" : "创建项目"}
          </button>
        </div>
      </form>
    </section>
  );
}

function DraftProfileInput({ disabled, label, onChange, placeholder, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] text-white/38">{label}</span>
      <input
        className="apple-input h-11 w-full rounded-[16px] px-3 text-[12px] text-white/76 outline-none placeholder:text-white/30 disabled:opacity-55"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
