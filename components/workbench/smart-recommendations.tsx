"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
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

  function createRecommendedAction(item: ReturnType<typeof buildImageRecommendations>[number]) {
    const key = `${item.type}-${item.label}`;
    if (activeRecommendation) return;
    setActiveRecommendation(key);
    onCreateAction(node.id, item.type, item.handle, item.params);
    window.setTimeout(() => setActiveRecommendation(""), 700);
  }

  return (
    <InspectorSection title="智能推荐">
      <div className="space-y-2">
        {recommendations.map((item) => (
          <button
            className="apple-panel flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.08] disabled:opacity-45"
            disabled={Boolean(activeRecommendation)}
            key={`${item.type}-${item.label}`}
            onClick={() => createRecommendedAction(item)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-white/76">{activeRecommendation === `${item.type}-${item.label}` ? "创建中" : item.label}</span>
              <span className="apple-caption mt-1 block truncate">{item.reason}</span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-white/28" />
          </button>
        ))}
      </div>
    </InspectorSection>
  );
}
