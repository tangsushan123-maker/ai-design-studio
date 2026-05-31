"use client";

import { useMemo, useState } from "react";
import { BookOpen, FolderOpen, LayoutTemplate, Megaphone, Plus, RefreshCcw, ShoppingBag, Sparkles, UserRound, Wand2 } from "lucide-react";
import { AccountSwitcher } from "@/components/account-switcher";
import {
  emptyTaskDraft,
  taskDraftVariantCount,
  validateWorkbenchTaskDraft,
  workbenchTaskTemplates,
  type WorkbenchTaskDraft,
  type WorkbenchTaskTemplate,
} from "@/components/workbench/workbench-task-templates";

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
  onStartTask,
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
  onStartTask: (template: WorkbenchTaskTemplate, draft: WorkbenchTaskDraft) => void;
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
  const [selectedTemplateId, setSelectedTemplateId] = useState(workbenchTaskTemplates[0]?.id || "");
  const [draft, setDraft] = useState<WorkbenchTaskDraft>(emptyTaskDraft);
  const selectedTemplate = useMemo(
    () => workbenchTaskTemplates.find((template) => template.id === selectedTemplateId) || workbenchTaskTemplates[0],
    [selectedTemplateId],
  );
  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, WorkbenchTaskTemplate[]>();
    for (const template of workbenchTaskTemplates) {
      const items = groups.get(template.group) || [];
      items.push(template);
      groups.set(template.group, items);
    }
    return [...groups.entries()];
  }, []);
  const selectedVariantCount = taskDraftVariantCount(draft, selectedTemplate);
  const preflight = validateWorkbenchTaskDraft(selectedTemplate, draft);
  const canStartTask = Boolean(selectedTemplate && preflight.canGenerate);

  return (
    <main className="apple-shell flex h-screen items-center justify-center overflow-hidden p-4 text-[#f5f7fb] sm:p-5">
      <section className="apple-panel-strong flex max-h-[calc(100vh-32px)] w-full max-w-[1120px] flex-col gap-3 overflow-auto rounded-[26px] p-3.5 pb-16 shadow-[0_24px_74px_rgba(0,0,0,0.32)] sm:p-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[18px] font-semibold text-white/92">开始一个设计</div>
              <div className="apple-caption mt-0.5 truncate">选择常用任务，系统会自动设置比例、方案数和设计规则。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="apple-pill px-2.5 py-1 text-[11px]">{busy ? "准备中" : "就绪"}</span>
              <div className="w-[104px]">
                <AccountSwitcher compact expanded />
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:max-w-[560px]">
            <button
              className="apple-button-primary flex h-12 items-center gap-2.5 rounded-full px-3 text-left text-[#07121f] disabled:opacity-55"
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
              className="apple-button flex h-12 items-center gap-2.5 rounded-full px-3 text-left text-white/82 disabled:opacity-55"
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="order-2 min-w-0 space-y-3 lg:order-1">
          {groupedTemplates.map(([group, templates]) => (
            <div key={group}>
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-white/46">
                {taskGroupIcon(group)}
                <span>{group}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => {
                  const selected = template.id === selectedTemplate.id;
                  return (
                    <button
                      className={`apple-interactive-card min-h-[92px] p-3 text-left ${selected ? "is-selected" : ""}`}
                      disabled={busy}
                      key={template.id}
                      onClick={() => setSelectedTemplateId(template.id)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-white/86">{template.title}</span>
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            <span className="rounded-full border border-white/10 bg-white/[0.055] px-2 py-0.5 text-[11px] leading-5 text-white/54">{template.ratio === "custom" ? template.targetSize : template.ratio}</span>
                            <span className="rounded-full border border-white/10 bg-white/[0.055] px-2 py-0.5 text-[11px] leading-5 text-white/54">默认{template.variantCount}</span>
                          </span>
                        </span>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/58">
                          {taskTemplateIcon(template.id)}
                        </span>
                      </span>
                      <span className="mt-2 block line-clamp-2 text-[11px] leading-5 text-white/48">{template.fieldsHint}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          </div>

        <aside className="order-1 min-w-0 rounded-[22px] border border-white/10 bg-white/[0.035] p-3 lg:sticky lg:top-0 lg:order-2 lg:self-start">
          <div className="mb-3 flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[#adf8e5]">
              <LayoutTemplate className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-white/88">{selectedTemplate.title}</span>
              <span className="apple-caption mt-0.5 block truncate">{selectedTemplate.targetSize} · {selectedVariantCount} 个方案</span>
            </span>
          </div>
          <div className="mb-3 rounded-[16px] border border-white/10 bg-black/10 px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white/58">方案数量</span>
              <span className="apple-count-badge px-2 py-1 text-[11px]">{selectedVariantCount} 个</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  className={`h-8 rounded-full border text-[12px] font-semibold transition ${selectedVariantCount === count ? "border-white bg-white text-[#07121f]" : "border-white/10 bg-white/[0.04] text-white/58 hover:bg-white/[0.08]"}`}
                  disabled={busy}
                  key={count}
                  onClick={() => setDraft((current) => ({ ...current, variantCount: count }))}
                  type="button"
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <label className="block">
              <span className="apple-field-label">你要做什么？</span>
              <textarea
                className="apple-input mt-1 min-h-[72px] w-full resize-none px-3 py-2.5 text-[13px] leading-5 outline-none sm:min-h-[88px]"
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, request: event.target.value }))}
                placeholder="例如：六一儿童口腔检查活动海报"
                value={draft.request}
              />
            </label>
            <label className="block">
              <span className="apple-field-label">必须出现的文字</span>
              <textarea
                className="apple-input mt-1 min-h-[72px] w-full resize-none px-3 py-2.5 text-[13px] leading-5 outline-none sm:min-h-[88px]"
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, requiredText: event.target.value }))}
                placeholder="标题、时间、地址、电话、品牌名；没有就留空"
                value={draft.requiredText}
              />
            </label>
            <label className="block">
              <span className="apple-field-label">风格参考</span>
              <input
                className="apple-input mt-1 h-10 w-full px-3 text-[13px] outline-none"
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, style: event.target.value }))}
                placeholder="高级、活泼、科技、温暖，或使用收藏风格"
                value={draft.style}
              />
            </label>
            <label className="block">
              <span className="apple-field-label">素材/参考说明</span>
              <input
                className="apple-input mt-1 h-10 w-full px-3 text-[13px] outline-none"
                disabled={busy}
                onChange={(event) => setDraft((current) => ({ ...current, references: event.target.value }))}
                placeholder="例如：进入画布后上传产品图和 Logo"
                value={draft.references}
              />
            </label>
          </div>

          <div className="mt-3 rounded-[16px] border border-white/10 bg-black/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-white/58">生成前检查</div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${preflight.canGenerate ? "bg-[#74e3c5]/16 text-[#adf8e5]" : "bg-[#ff6b5f]/14 text-[#ffb4a8]"}`}>
                {preflight.canGenerate ? "可生成" : "需补充"}
              </span>
            </div>
            <div className={`mt-1 text-[11px] leading-5 ${preflight.canGenerate ? "text-white/46" : "text-[#ffb4a8]"}`}>
              {preflight.message}
            </div>
            {preflight.warnings.length ? (
              <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#ffe1a0]/76">
                建议：{preflight.warnings.join("；")}
              </div>
            ) : null}
            {preflight.questions.length ? (
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[11px] font-semibold text-white/52">建议先补充</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {preflight.questions.map((question) => (
                    <span
                      className="max-w-full rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[11px] leading-5 text-white/56"
                      key={question}
                      title={question}
                    >
                      {question}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-2 rounded-[16px] border border-white/10 bg-black/10 px-3 py-2">
            <div className="text-[11px] font-semibold text-white/58">系统会自动带给模型</div>
            <div className="mt-1 line-clamp-3 text-[11px] leading-5 text-white/40">
              {selectedTemplate.qualityFocus.join(" / ")}；不编造真实电话、地址、二维码、价格和机构信息。
            </div>
          </div>

          <button
            className="apple-button-primary mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-[#07121f] disabled:opacity-55"
            disabled={busy || !canStartTask}
            onClick={() => onStartTask(selectedTemplate, draft)}
            title={canStartTask ? `生成 ${selectedVariantCount} 个方案` : preflight.message}
            type="button"
          >
            <Sparkles className="size-4" />
            {busy ? "正在准备" : `生成 ${selectedVariantCount} 个方案`}
          </button>
        </aside>
        </div>
      </section>
    </main>
  );
}

function taskGroupIcon(group: string) {
  if (group === "营销转化") return <ShoppingBag className="size-3.5 text-[#ffe1a0]/70" />;
  if (group === "活动教育") return <Megaphone className="size-3.5 text-[#8fb6ff]/72" />;
  if (group === "品牌人物") return <UserRound className="size-3.5 text-[#d8b4fe]/72" />;
  return <BookOpen className="size-3.5 text-[#adf8e5]/72" />;
}

function taskTemplateIcon(id: string) {
  if (/ecommerce|store/.test(id)) return <ShoppingBag className="size-4" />;
  if (/expert/.test(id)) return <UserRound className="size-4" />;
  if (/event|course/.test(id)) return <Megaphone className="size-4" />;
  if (/wechat|xiaohongshu|square/.test(id)) return <BookOpen className="size-4" />;
  return <Wand2 className="size-4" />;
}

function projectItemKey(project: ProjectHomeItem) {
  return `${project.ownerUserId || "current"}:${project.id}`;
}

function isActiveProjectItem(project: ProjectHomeItem, activeProjectId: string, activeProjectOwnerUserId = "") {
  if (project.id !== activeProjectId) return false;
  if (!activeProjectOwnerUserId) return true;
  return (project.ownerUserId || "") === activeProjectOwnerUserId;
}
