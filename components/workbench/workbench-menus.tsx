"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import { quickActions } from "@/components/workbench/workbench-config";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import type { NodeKind } from "@/components/workbench/workbench-types";

const visibleNodeCatalog = nodeCatalog.filter((item) => !item.hiddenFromAddMenu);

export function NodeMenu({
  onClose,
  onSelect,
  x,
  y,
}: {
  onClose: () => void;
  onSelect: (type: NodeKind) => void;
  x: number;
  y: number;
}) {
  const [activeSelection, setActiveSelection] = useState<NodeKind | "">("");

  function selectNode(type: NodeKind) {
    if (activeSelection) return;
    setActiveSelection(type);
    onSelect(type);
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-node-menu-root='true']")) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="apple-panel-strong fixed z-50 w-[270px] rounded-[22px] p-2" data-node-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div className="apple-section-title text-[11px] text-white/72">添加节点</div>
        <button aria-label="关闭添加节点菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        {visibleNodeCatalog.map((item) => (
          <button
            className="apple-menu-item flex w-full items-center gap-3 px-2.5 py-2.5 text-left disabled:opacity-45"
            disabled={Boolean(activeSelection)}
            key={item.type}
            onClick={() => selectNode(item.type)}
            type="button"
          >
            <span className="apple-button flex size-8 items-center justify-center rounded-xl text-white/72">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-white/82">{activeSelection === item.type ? "创建中" : item.label}</span>
              <span className="apple-menu-meta mt-0.5 block truncate">{item.description}</span>
            </span>
            <ChevronRight className="size-3.5 text-white/24" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuickMenu({
  onClose,
  onDelete,
  onSelect,
  x,
  y,
}: {
  onClose: () => void;
  onDelete: () => void;
  onSelect: (action: (typeof quickActions)[number]) => void;
  x: number;
  y: number;
}) {
  const [activeQuickAction, setActiveQuickAction] = useState("");

  function selectQuickAction(action: (typeof quickActions)[number]) {
    const key = `${action.type}:${action.handle}`;
    if (activeQuickAction) return;
    setActiveQuickAction(key);
    onSelect(action);
  }

  function deleteFromMenu() {
    if (activeQuickAction) return;
    setActiveQuickAction("delete");
    onDelete();
  }

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-quick-menu-root='true']")) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="apple-panel-strong fixed z-50 w-[210px] rounded-[20px] p-2" data-quick-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div className="apple-section-title text-[11px] text-white/72">快速操作</div>
        <button aria-label="关闭快速操作菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      {quickActions.map((action) => (
        <button
          className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-white/72 disabled:opacity-45"
          disabled={Boolean(activeQuickAction)}
          key={`${action.type}-${action.handle}`}
          onClick={() => selectQuickAction(action)}
          type="button"
        >
          {activeQuickAction === `${action.type}:${action.handle}` ? "创建中" : action.label}
          <ChevronRight className="size-3.5 text-white/28" />
        </button>
      ))}
      <div className="my-1 border-t border-white/10" />
      <button className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-[#ffb4a8] hover:bg-[#ff6b5f]/10 disabled:opacity-45" disabled={Boolean(activeQuickAction)} onClick={deleteFromMenu} type="button">
        {activeQuickAction === "delete" ? "删除中" : "删除节点"}
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
