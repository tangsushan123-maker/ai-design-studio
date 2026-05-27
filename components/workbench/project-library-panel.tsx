"use client";

import { FolderOpen, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { useState } from "react";

type ProjectLibraryItem = {
  id: string;
  name: string;
  coverUrl?: string;
  organizationName?: string;
  assetCount?: number;
  referenceCount?: number;
  updatedAt?: string;
  libraryName?: string;
};

export function ProjectLibraryPanel({
  activeProjectId,
  onClose,
  onCreateNew,
  onDelete,
  onOpen,
  onRefresh,
  projects,
  formatUpdatedAt,
}: {
  activeProjectId: string;
  onClose: () => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void | Promise<unknown>;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  projects: ProjectLibraryItem[];
  formatUpdatedAt: (value: string) => string;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function deleteProject(project: ProjectLibraryItem) {
    if (deletingId) return;
    if (confirmDeleteId !== project.id) {
      setConfirmDeleteId(project.id);
      setActionMessage({ tone: "success", text: `再点一次确认删除「${project.name}」。` });
      return;
    }
    setDeletingId(project.id);
    setActionMessage(null);
    try {
      await onDelete(project.id);
      setConfirmDeleteId("");
      setActionMessage({ tone: "success", text: "项目删除已提交。" });
    } catch (error) {
      setActionMessage({ tone: "error", text: error instanceof Error ? error.message : "删除项目失败。" });
    } finally {
      setDeletingId("");
    }
  }

  return (
    <section className="apple-panel-strong apple-drawer fixed bottom-4 left-[52px] top-4 z-50 flex w-[min(348px,calc(100vw-64px))] flex-col overflow-hidden sm:left-[96px]">
      <div className="flex items-center justify-between border-b border-white/10 p-3">
        <div>
          <div className="apple-section-title">项目</div>
          <div className="apple-caption mt-0.5">{projects.length} 个项目</div>
        </div>
        <button
          aria-label="关闭项目列表"
          className="apple-button flex size-7 items-center justify-center text-white/56 transition"
          onClick={onClose}
          title="关闭项目列表"
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
          <button className="apple-button-primary flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold" onClick={onCreateNew} type="button">
            <Plus className="size-3.5" />
            新建
          </button>
          <button className="apple-button flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold" onClick={onRefresh} type="button">
            <RefreshCcw className="size-3.5" />
            刷新
          </button>
        </div>
        {actionMessage ? (
          <div className={`mb-3 rounded-[14px] border px-3 py-2 text-[10px] leading-4 ${
            actionMessage.tone === "success"
              ? "border-[#74e3c5]/18 bg-[#74e3c5]/10 text-[#adf8e5]"
              : "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
          }`}>
            {actionMessage.text}
          </div>
        ) : null}
        {projects.length ? (
          <div className="space-y-2">
            {projects.map((project) => (
              <article
                className={`apple-interactive-card p-3 ${project.id === activeProjectId ? "is-selected" : ""}`}
                key={project.id}
              >
                <button className="flex w-full items-center gap-2 text-left" onClick={() => onOpen(project.id)} type="button">
                  {project.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Project covers are local generated files; raw img avoids optimizer round-trips.
                    <img alt="" className="size-12 rounded-xl border border-white/10 object-cover" decoding="async" loading="lazy" src={project.coverUrl} />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-white/42">
                      <FolderOpen className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-white/82">{project.name}</span>
                    <span className="apple-caption mt-0.5 block truncate">{project.organizationName || "机构未填"}</span>
                    <span className="apple-caption mt-1 block">
                      {project.assetCount || 0} 素材 · {project.updatedAt ? formatUpdatedAt(project.updatedAt) : "刚刚"}
                    </span>
                  </span>
                </button>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`px-2 py-1 text-[11px] ${project.id === activeProjectId ? "apple-pill-accent" : "apple-pill"} truncate`}>
                    {project.libraryName || "独立素材"}
                  </span>
                  <button
                    className="apple-button-danger flex items-center gap-1 px-2.5 py-1 text-[11px] disabled:opacity-45"
                    disabled={Boolean(deletingId)}
                    onClick={() => void deleteProject(project)}
                    title="删除项目"
                    type="button"
                  >
                    <Trash2 className={`size-3 ${deletingId === project.id ? "animate-pulse" : ""}`} />
                    {deletingId === project.id ? "删除中" : confirmDeleteId === project.id ? "确认删除" : "删除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="apple-empty-state px-4 py-10 text-center">
            <div className="apple-icon-bubble mx-auto size-12 text-white/48">
              <FolderOpen className="size-6" />
            </div>
            <div className="mt-3 text-[13px] font-semibold text-white/82">暂无项目</div>
          </div>
        )}
      </div>
    </section>
  );
}
