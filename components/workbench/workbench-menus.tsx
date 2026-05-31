"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import { quickActions } from "@/components/workbench/workbench-config";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import type { NodeKind } from "@/components/workbench/workbench-types";

const visibleNodeCatalog = nodeCatalog.filter((item) => !item.hiddenFromAddMenu);
const nodeMenuGroups: Array<{ title: string; description: string; types: NodeKind[] }> = [
  { title: "从零开始", description: "没有原图，直接写需求生成。", types: ["text_to_image"] },
  { title: "基于原图", description: "已有图片，出新方案或合成。", types: ["image_to_image", "fuse_images"] },
  { title: "优化/重制", description: "让已有稿更专业，或把参考图重做清楚。", types: ["design_optimize", "reference_remake"] },
  { title: "换尺寸/扩图", description: "换比例、换画幅、补边缘。", types: ["resize", "outpaint"] },
  { title: "局部和交付", description: "只改局部，或做高清、分层交付。", types: ["mask_edit", "hd_redraw", "png_layers"] },
];
const quickMenuGroups = ["生成新方案", "优化/重制", "换尺寸/扩图", "局部处理", "交付处理", "更多"];

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
    <div className="apple-panel-strong fixed z-50 w-[318px] rounded-[22px] p-2" data-node-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div>
          <div className="apple-section-title text-[11px] text-white/72">你现在想做什么？</div>
          <div className="mt-0.5 text-[11px] leading-4 text-white/36">按任务目的选择，系统会创建对应节点。</div>
        </div>
        <button aria-label="关闭添加节点菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        {nodeMenuGroups.map((group) => {
          const items = group.types
            .map((type) => visibleNodeCatalog.find((item) => item.type === type))
            .filter((item): item is (typeof visibleNodeCatalog)[number] => Boolean(item));
          if (!items.length) return null;
          return (
            <section className="border-t border-white/8 py-1.5 first:border-t-0" key={group.title}>
              <div className="px-2 py-1">
                <div className="text-[11px] font-semibold text-white/70">{group.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-white/46">{group.description}</div>
              </div>
              {items.map((item) => (
                <button
                  className="apple-menu-item flex w-full items-center gap-3 px-2.5 py-2.5 text-left disabled:opacity-45"
                  disabled={Boolean(activeSelection)}
                  key={item.type}
                  onClick={() => selectNode(item.type)}
                  type="button"
                >
                  <span className="apple-button flex size-8 shrink-0 items-center justify-center rounded-xl text-white/72">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-white/82">{activeSelection === item.type ? "创建中" : item.label}</span>
                    <span className="apple-menu-meta mt-0.5 block truncate">{item.description}</span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-white/24" />
                </button>
              ))}
            </section>
          );
        })}
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
    <div className="apple-panel-strong fixed z-50 w-[282px] rounded-[20px] p-2" data-quick-menu-root="true" style={{ left: x, top: y }}>
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <div>
          <div className="apple-section-title text-[11px] text-white/72">这张图要做什么？</div>
          <div className="mt-0.5 text-[11px] leading-4 text-white/36">选择目标后会自动接好节点。</div>
        </div>
        <button aria-label="关闭快速操作菜单" className="apple-button flex size-7 items-center justify-center text-white/42" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[560px] overflow-auto">
        {quickMenuGroups.map((group) => {
          const items = quickActions.filter((action) => action.group === group);
          if (!items.length) return null;
          return (
            <section className="border-t border-white/8 py-1.5 first:border-t-0" key={group}>
              <div className="px-2 py-1 text-[11px] font-semibold text-white/58">{group}</div>
              {items.map((action) => (
                <button
                  className="apple-menu-item flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[11px] text-white/72 disabled:opacity-45"
                  disabled={Boolean(activeQuickAction)}
                  key={`${action.type}-${action.handle}`}
                  onClick={() => selectQuickAction(action)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-white/78">{activeQuickAction === `${action.type}:${action.handle}` ? "创建中" : action.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/46">{action.description}</span>
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-white/28" />
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <div className="my-1 border-t border-white/10" />
      <button className="apple-menu-item flex w-full items-center justify-between px-3 py-2 text-[11px] text-[#ffb4a8] hover:bg-[#ff6b5f]/10 disabled:opacity-45" disabled={Boolean(activeQuickAction)} onClick={deleteFromMenu} type="button">
        {activeQuickAction === "delete" ? "删除中" : "删除节点"}
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
