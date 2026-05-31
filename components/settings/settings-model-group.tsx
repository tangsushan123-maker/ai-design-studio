"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import type { ModelCatalogItem } from "@/lib/openai-defaults";

const compactModelLimit = 3;

export function ModelGroup({
  activeModel,
  icon,
  isBusy,
  label,
  models,
  onDelete,
  onEdit,
  onTest,
  onUse,
}: {
  activeModel: string;
  icon: ReactNode;
  isBusy: boolean;
  label: string;
  models: ModelCatalogItem[];
  onDelete: (modelId: string) => void | Promise<unknown>;
  onEdit: (model: ModelCatalogItem) => void;
  onTest: (model: ModelCatalogItem) => void | Promise<unknown>;
  onUse: (model: ModelCatalogItem) => void | Promise<unknown>;
}) {
  const [activeModelAction, setActiveModelAction] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const visibleModels = expanded ? models : prioritizedCompactModels(models, activeModel);
  const hiddenCount = Math.max(0, models.length - visibleModels.length);

  async function runModelAction(label: string, model: ModelCatalogItem, action: () => void | Promise<unknown>) {
    const key = `${label}:${model.id}`;
    if (activeModelAction) return;
    setActiveModelAction(key);
    try {
      await action();
    } finally {
      setActiveModelAction("");
    }
  }

  async function deleteModel(model: ModelCatalogItem) {
    if (confirmDeleteId !== model.id) {
      setConfirmDeleteId(model.id);
      return;
    }
    setConfirmDeleteId("");
    await runModelAction("删除", model, () => onDelete(model.id));
  }

  return (
    <section className="apple-surface-section p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="apple-icon-bubble size-8">{icon}</span>
        <div>
          <div className="text-sm font-semibold text-white/86">{label}</div>
          <div className="apple-caption">
            <span className="apple-count-badge mr-1.5 px-1.5 py-0.5 text-[11px]">{models.length}</span>
            个模型{hiddenCount && !expanded ? `，已收起 ${hiddenCount} 个` : ""}
          </div>
        </div>
        {models.length > compactModelLimit ? (
          <button
            className="apple-button ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/66"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "收起" : `展开 ${hiddenCount} 个`}
            <ChevronDown className={`size-3.5 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {visibleModels.map((model) => (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.05] p-3" key={`${label}-${model.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white/84">{model.label || model.id}</span>
                  {activeModel === model.id ? <span className="apple-pill-accent px-2 py-0.5 text-[11px] shrink-0">默认</span> : null}
                </div>
                <div className="apple-caption mt-1 truncate">{model.id}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ModelStatus model={model} />
                  {model.lastTestedAt ? <span className="apple-pill px-2 py-0.5 text-[11px]">{new Date(model.lastTestedAt).toLocaleString("zh-CN")}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <button className="apple-button px-2.5 py-1.5 text-[11px] disabled:opacity-45" disabled={isBusy || Boolean(activeModelAction)} onClick={() => void runModelAction("测试", model, () => onTest(model))} type="button">
                  {activeModelAction === `测试:${model.id}` ? "测试中" : "测试"}
                </button>
                <button className="apple-button px-2.5 py-1.5 text-[11px] disabled:opacity-45" disabled={isBusy || Boolean(activeModelAction)} onClick={() => void runModelAction("使用", model, () => onUse(model))} type="button">
                  {activeModelAction === `使用:${model.id}` ? "保存中" : "使用"}
                </button>
                <button className="apple-button px-2.5 py-1.5 text-[11px] disabled:opacity-45" disabled={isBusy || Boolean(activeModelAction)} onClick={() => onEdit(model)} type="button">编辑</button>
                <button className="apple-button-danger flex items-center gap-1 px-2.5 py-1.5 text-[11px] disabled:opacity-45" disabled={isBusy || Boolean(activeModelAction)} onClick={() => void deleteModel(model)} type="button">
                  <Trash2 className="size-3" />
                  <span className="truncate">{activeModelAction === `删除:${model.id}` ? "删除中" : confirmDeleteId === model.id ? "确认删" : "删"}</span>
                </button>
              </div>
            </div>
            {model.lastTestMessage ? <div className="apple-caption mt-2 line-clamp-2">{model.lastTestMessage}</div> : null}
          </div>
        ))}
        {!models.length ? <div className="apple-empty-state p-4 text-sm text-white/46">暂无模型</div> : null}
      </div>
    </section>
  );
}

function prioritizedCompactModels(models: ModelCatalogItem[], activeModel: string) {
  if (models.length <= compactModelLimit) return models;
  const picked: ModelCatalogItem[] = [];
  const seen = new Set<string>();
  const add = (model?: ModelCatalogItem) => {
    if (!model || seen.has(model.id) || picked.length >= compactModelLimit) return;
    seen.add(model.id);
    picked.push(model);
  };
  add(models.find((model) => model.id === activeModel));
  for (const model of models.filter((item) => item.testStatus === "passed")) add(model);
  for (const model of models) add(model);
  return picked;
}

function ModelStatus({ model }: { model: ModelCatalogItem }) {
  if (model.testStatus === "passed") return <span className="apple-status-success rounded-full border px-2 py-0.5 text-[11px]">可用</span>;
  if (model.testStatus === "failed") return <span className="apple-status-danger rounded-full border px-2 py-0.5 text-[11px]">失败</span>;
  return <span className="apple-status-neutral rounded-full border px-2 py-0.5 text-[11px]">未测</span>;
}
