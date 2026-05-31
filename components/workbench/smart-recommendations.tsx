"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { buildImageRecommendations } from "@/components/workbench/workbench-node-prompts";
import { InspectorSection } from "@/components/workbench/workbench-small-ui";
import type { FlowNode, ImageAsset, NodeKind } from "@/components/workbench/workbench-types";

export function SmartRecommendations({
  node,
  onCreateAction,
}: {
  node: FlowNode;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
}) {
  const [activeRecommendation, setActiveRecommendation] = useState("");
  const image = node.data.output || node.data.image || null;
  const recommendations = buildImageRecommendations(image as ImageAsset | null);
  const recommendationGroups = [
    { title: "继续优化", items: recommendations.filter((item) => ["hd_redraw", "mask_edit", "design_optimize"].includes(item.type)) },
    { title: "尺寸改版", items: recommendations.filter((item) => ["resize", "outpaint"].includes(item.type)) },
    { title: "复用输出", items: recommendations.filter((item) => ["reference_remake", "png_layers", "fuse_images", "image_input"].includes(item.type)) },
  ].filter((group) => group.items.length);

  function createRecommendedAction(item: ReturnType<typeof buildImageRecommendations>[number]) {
    const key = `${item.type}-${item.label}`;
    if (activeRecommendation) return;
    setActiveRecommendation(key);
    onCreateAction(node.id, item.type, item.handle, item.params);
    window.setTimeout(() => setActiveRecommendation(""), 700);
  }

  return (
    <InspectorSection title="智能推荐">
      <div className="space-y-2.5">
        {recommendationGroups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-white/46">
              <Sparkles className="size-3 text-[#adf8e5]/58" />
              {group.title}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => (
                <button
                  className="apple-panel group flex min-h-[82px] flex-col justify-between rounded-[16px] px-2.5 py-2.5 text-left transition hover:bg-white/[0.08] disabled:opacity-45"
                  disabled={Boolean(activeRecommendation)}
                  key={`${item.type}-${item.label}`}
                  onClick={() => createRecommendedAction(item)}
                  title={item.reason}
                  type="button"
                >
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-semibold leading-5 text-white/80">{activeRecommendation === `${item.type}-${item.label}` ? "创建中" : item.label}</span>
                    <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-white/24 transition group-hover:text-white/48" />
                  </span>
                  <span className="apple-caption mt-1 line-clamp-2 text-[11px] leading-5">{item.reason}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}
