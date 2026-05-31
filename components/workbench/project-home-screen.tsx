"use client";

import { useEffect } from "react";
import { FolderOpen, Plus, RefreshCcw } from "lucide-react";

export type ProjectHomeItem = {
  id: string;
  name: string;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
  updatedAt?: string;
  assetCount?: number;
  coverUrl?: string;
};

export function ProjectHomeScreen({
  activeProjectId,
  activeProjectOwnerUserId = "",
  busy,
  formatUpdatedAt,
  onCreate,
  onOpen,
  onRefreshProjects,
  onShowProjects,
  pickerOpen,
  projectListError,
  projectListLoading,
  projects,
}: {
  activeProjectId: string;
  activeProjectOwnerUserId?: string;
  busy: boolean;
  formatUpdatedAt: (value: string) => string;
  onCreate: () => void;
  onOpen: (id: string, ownerUserId?: string) => void;
  onRefreshProjects: () => void;
  onShowProjects: () => void;
  pickerOpen: boolean;
  projectListError: string;
  projectListLoading: boolean;
  projects: ProjectHomeItem[];
}) {
  const projectActionsDisabled = busy || projectListLoading;
  const projectListNeedsLogin = /请先登录|登录已过期/.test(projectListError);

  useEffect(() => {
    document.documentElement.dataset.projectHome = "true";
    return () => {
      delete document.documentElement.dataset.projectHome;
    };
  }, []);

  return (
    <main className="apple-shell flex h-screen items-center justify-center overflow-hidden p-4 text-[#f5f7fb] sm:p-5">
      <section className="apple-panel-strong flex max-h-[calc(100vh-32px)] w-full max-w-[520px] flex-col gap-4 overflow-auto rounded-[26px] p-4 shadow-[0_24px_74px_rgba(0,0,0,0.32)] sm:p-5">
        <div className="min-w-0">
          <div className="mb-4 min-w-0 text-center">
            <div className="min-w-0">
              <div className="text-[20px] font-semibold text-white/92">开始项目</div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="apple-button-primary flex h-14 items-center justify-center gap-2.5 rounded-full px-4 text-[#07121f] disabled:opacity-55"
              disabled={busy}
              onClick={onCreate}
              type="button"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/[0.06]">
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 truncate text-[14px] font-semibold">{busy ? "正在准备" : "新建项目"}</span>
            </button>
            <button
              className="apple-button flex h-14 items-center justify-center gap-2.5 rounded-full px-4 text-white/82 disabled:opacity-55"
              disabled={projectActionsDisabled}
              onClick={onShowProjects}
              type="button"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
                <FolderOpen className="size-4" />
              </span>
              <span className="min-w-0 truncate text-[14px] font-semibold">{projectListLoading ? "刷新中" : "打开项目"}</span>
            </button>
          </div>

          {pickerOpen ? (
            <div className="mt-3 max-h-[34vh] overflow-auto rounded-[20px] border border-white/10 bg-white/[0.035] p-2">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div className="min-w-0 text-[11px] font-semibold text-white/56">
                  {projectListLoading ? "正在刷新项目列表" : `项目列表 · ${projects.length}`}
                </div>
                <button
                  className="apple-button flex h-8 items-center gap-1.5 px-2.5 text-[11px] text-white/62 disabled:opacity-45"
                  disabled={projectActionsDisabled}
                  onClick={onRefreshProjects}
                  type="button"
                >
                  <RefreshCcw className={`size-3.5 ${projectListLoading ? "animate-spin" : ""}`} />
                  {projectListLoading ? "刷新中" : "刷新"}
                </button>
              </div>
              {projectListError ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#ff6b5f]/18 bg-[#ff6b5f]/10 px-3 py-2 text-[11px] leading-5 text-[#ffc1b8]">
                  <span className="min-w-0 flex-1">{projectListError}</span>
                  {projectListNeedsLogin ? (
                    <a className="apple-button rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/76" href="/login">
                      去登录
                    </a>
                  ) : null}
                </div>
              ) : null}
              {projects.length ? (
                <div className="space-y-2">
                  {projects.map((project) => {
                    const active = isActiveProjectItem(project, activeProjectId, activeProjectOwnerUserId);
                    return (
                      <button
                        className={`apple-interactive-card flex w-full items-center gap-3 p-3 text-left ${active ? "is-selected" : ""}`}
                        disabled={projectActionsDisabled}
                        key={projectItemKey(project)}
                        onClick={() => onOpen(project.id, project.ownerUserId)}
                        type="button"
                      >
                        {project.coverUrl ? (
                          <span
                            aria-hidden="true"
                            className="size-12 shrink-0 rounded-[14px] border border-white/10 bg-cover bg-center"
                            style={{ backgroundImage: `url(${project.coverUrl})` }}
                          />
                        ) : (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.055] text-white/42">
                            <FolderOpen className="size-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-white/84">{project.name}</span>
                          <span className="apple-caption mt-0.5 block truncate">
                            {project.ownerEmail ? `${project.ownerName || project.ownerEmail} · ` : ""}{(project.assetCount || 0)} 素材 · {project.updatedAt ? formatUpdatedAt(project.updatedAt) : "刚刚"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : projectListLoading ? (
                <div className="apple-empty-state px-4 py-8 text-center text-[12px] text-white/46">正在加载项目...</div>
              ) : (
                <div className="apple-empty-state px-4 py-8 text-center text-[12px] text-white/46">暂无项目</div>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function projectItemKey(project: ProjectHomeItem) {
  return `${project.ownerUserId || "current"}:${project.id}`;
}

function isActiveProjectItem(project: ProjectHomeItem, activeProjectId: string, activeProjectOwnerUserId = "") {
  if (project.id !== activeProjectId) return false;
  if (!activeProjectOwnerUserId) return true;
  return (project.ownerUserId || "") === activeProjectOwnerUserId;
}
