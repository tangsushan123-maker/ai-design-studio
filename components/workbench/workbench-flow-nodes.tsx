"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { Brush, FileImage, ImagePlus, Layers, Trash2 } from "lucide-react";
import { ImageFrame } from "@/components/workbench/image-frame";
import { NodeErrorNotice } from "@/components/workbench/node-error-notice";
import { inputHandlesByKind } from "@/components/workbench/workbench-config";
import { uniqueImageAssets } from "@/components/workbench/workbench-image-collection";
import { compactThumbStyle, imageNodePreviewMetrics, shouldShowCheckerboard } from "@/components/workbench/workbench-image-metrics";
import { compactImageMeta, imageNodeTitle, taskStatusLabel } from "@/components/workbench/workbench-labels";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import {
  CompactOutputSummary,
  NodeSummary,
  TextReferenceQuickControls,
  maskEditBadge,
  operationNodeSubtitle,
  operationNodeWidth,
  textReferenceNodeItems,
} from "@/components/workbench/workbench-node-ui";
import { textToImagePreviewFit } from "@/components/workbench/workbench-node-prompts";
import { StatusDot } from "@/components/workbench/workbench-small-ui";
import type { FlowNode, ImageAsset } from "@/components/workbench/workbench-types";

const ImageInputNode = memo(function ImageInputNode({ id, data, selected }: NodeProps<FlowNode>) {
  const outputImages = uniqueImageAssets(Array.isArray(data.outputs) ? data.outputs : []);
  const image = data.image || data.output || outputImages[0] || null;
  const metrics = imageNodePreviewMetrics(image);
  const previewFit = textToImagePreviewFit(data.params);
  const showUploadButton = !image;
  const nodeTitle = image ? imageNodeTitle(image, data.title) : data.title;
  const nodeMeta = image ? compactImageMeta(image) : "输入 image";
  const renderLevel = data.nodeRenderLevel || "full";

  if (renderLevel === "mini") {
    return (
      <section className={`apple-node-card rounded-[14px] px-2.5 py-2 text-white ${selected ? "is-input-selected" : ""}`} style={{ width: 132 }}>
        <Handle id="source" position={Position.Left} type="target" className="!size-2.5 !border-white/30 !bg-[#0c0d11]" />
        <Handle id="image" position={Position.Right} type="source" className="!size-2.5 !border-[#74e3c5] !bg-[#74e3c5]" />
        <div className="flex items-center gap-1.5">
          <StatusDot status={data.status || "idle"} />
          <div className="min-w-0 truncate text-[11px] font-semibold text-white/78">{nodeTitle}</div>
        </div>
      </section>
    );
  }

  if (renderLevel === "compact") {
    return (
      <section className={`apple-node-card rounded-[16px] p-2 text-white ${selected ? "is-input-selected" : ""}`} style={{ width: 176 }}>
        <Handle id="source" position={Position.Left} type="target" className="!size-3 !border-white/36 !bg-[#0c0d11]" />
        <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#74e3c5] !bg-[#74e3c5]" />
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-[#74e3c5]">
            <FileImage className="size-3" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold text-white/84">{nodeTitle}</div>
            <div className="apple-caption mt-0.5 truncate text-[11px]">{nodeMeta}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`apple-node-card group rounded-[18px] p-1.5 text-white ${selected ? "is-input-selected" : ""}`}
      style={{ width: metrics.nodeWidth }}
    >
      <Handle id="source" position={Position.Left} type="target" className="!size-3 !border-white/40 !bg-[#0c0d11]" />
      <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#74e3c5] !bg-[#74e3c5]" />
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-white/92">{nodeTitle}</div>
          <div className="apple-caption mt-0.5 truncate text-[11px]">{nodeMeta}</div>
        </div>
        {showUploadButton ? (
          <button
            className="apple-button nodrag flex size-6 shrink-0 items-center justify-center text-white/62"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/png,image/jpeg,image/webp";
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) data.onImageFile?.(id, file);
              };
              input.click();
            }}
            title="上传图片"
            type="button"
          >
            <ImagePlus className="size-3.5" />
          </button>
        ) : null}
        <button
          className="apple-button-danger nodrag flex size-6 shrink-0 items-center justify-center opacity-0 transition group-hover:opacity-100"
          onClick={() => data.onDelete?.(id)}
          title="删除节点"
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {image ? (
        outputImages.length > 1 ? (
          <div className="grid grid-cols-2 gap-1.5">
            {outputImages.slice(0, 2).map((item, index) => (
              <button
                className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
                key={`${item.id}-${index}`}
                onClick={() => data.onPreview?.(item)}
                style={{ ...compactThumbStyle(item, 100, 66), margin: "0 auto" }}
                title={`查看第 ${index + 1} 张结果`}
                type="button"
              >
                <ImageFrame
                  alt={`${data.title}-${index + 1}`}
                  className="pointer-events-none"
                  image={item}
                  fit={previewFit}
                  imgClassName="pointer-events-none"
                  preserveRatio={false}
                  showCheckerboard={shouldShowCheckerboard(item)}
                  style={{ height: "100%", width: "100%" }}
                  variant="thumbnail"
                />
              </button>
            ))}
          </div>
        ) : (
          <button
            className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
            onClick={() => data.onPreview?.(image)}
            style={{ height: metrics.previewHeight, margin: "0 auto", width: metrics.previewWidth }}
            type="button"
          >
            <ImageFrame alt={data.title} className="pointer-events-none" fit={previewFit} image={image} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(image)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
          </button>
        )
      ) : (
        <label className="apple-node-well nodrag flex cursor-pointer flex-col items-center justify-center rounded-[12px] border-dashed p-3 text-center" style={{ height: metrics.previewHeight }}>
          <ImagePlus className="mb-1.5 size-7 text-white/48" />
          <span className="text-[11px] font-medium text-white/72">上传 / 拖拽 / 粘贴图片</span>
          <span className="apple-caption mt-1 text-[11px]">PNG · JPG · WebP</span>
          <input
            className="hidden"
            accept="image/png,image/jpeg,image/webp"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) data.onImageFile?.(id, file);
            }}
          />
        </label>
      )}
      {outputImages.length > 2 ? (
        <div className="apple-caption mt-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
          还有 {outputImages.length - 2} 张
        </div>
      ) : null}
    </section>
  );
});

const OperationNode = memo(function OperationNode({ id, data, selected }: NodeProps<FlowNode>) {
  const catalog = nodeCatalog.find((item) => item.type === data.kind);
  const inputs = inputHandlesByKind[data.kind] || [];
  const output = data.output || null;
  const outputs = uniqueImageAssets(Array.isArray(data.outputs) ? data.outputs : output ? [output] : []);
  const isTerminalOutput = data.kind === "output";
  const previewFit = data.kind === "text_to_image" ? textToImagePreviewFit(data.params) : "contain";
  const singleOutput = output && outputs.length === 1 ? output : null;
  const hasVisualOutput = Boolean(singleOutput || outputs.length > 1);
  const textReferences = data.kind === "text_to_image" ? textReferenceNodeItems(data) : [];
  const maskBadge = data.kind === "mask_edit" ? maskEditBadge(data) : null;
  const contentShellClass = hasVisualOutput || data.kind === "mask_edit"
    ? "apple-node-well space-y-1 rounded-[14px] p-1.5"
    : "space-y-1 rounded-[12px] border border-white/[0.055] bg-white/[0.025] px-2 py-1.5";
  const renderLevel = data.nodeRenderLevel || "full";

  if (renderLevel === "mini") {
    return (
      <section
        className={`apple-node-card relative rounded-[14px] px-2.5 py-2 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
        style={{ width: 142 }}
      >
        {inputs.map((input, index) => (
          <Handle key={input.id} id={input.id} position={Position.Left} type="target" className="!size-2.5 !border-white/30 !bg-[#0c0d11]" style={{ top: 18 + index * 14 }} />
        ))}
        {!isTerminalOutput ? (
          <Handle id="image" position={Position.Right} type="source" className="!size-2.5 !border-[#8fa7ff] !bg-[#8fa7ff]" />
        ) : null}
        <div className="flex items-center gap-1.5">
          <StatusDot status={data.status || "idle"} />
          <div className="min-w-0 truncate text-[11px] font-semibold text-white/80">{data.title}</div>
        </div>
      </section>
    );
  }

  if (renderLevel === "compact") {
    return (
      <section
        className={`apple-node-card relative rounded-[16px] p-2 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
        style={{ width: 196 }}
      >
        {inputs.map((input, index) => (
          <Handle key={input.id} id={input.id} position={Position.Left} type="target" className="!size-3 !border-white/36 !bg-[#0c0d11]" style={{ top: 24 + index * 18 }} />
        ))}
        {!isTerminalOutput ? (
          <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#8fa7ff] !bg-[#8fa7ff]" />
        ) : null}
        <div className="flex items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-[#c8d4ff]">
            {catalog?.icon || <Layers className="size-3" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[11px] font-semibold text-white/84">{data.title}</h3>
              <StatusDot status={data.status || "idle"} />
            </div>
            <div className="apple-caption mt-0.5 truncate text-[11px]">
              {outputs.length ? `${outputs.length} 个结果` : taskStatusLabel(data.status || "idle")}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`apple-node-card group relative rounded-[16px] p-1.5 text-white ${data.status === "failed" ? "is-danger" : selected ? "is-selected" : ""}`}
      style={{ width: operationNodeWidth(data, outputs) }}
    >
      {inputs.map((input, index) => (
        <div key={input.id} className="absolute left-[-36px] flex items-center gap-1.5 text-[11px] text-white/40" style={{ top: 48 + index * 24 }}>
          <span>{input.label}</span>
          <Handle id={input.id} position={Position.Left} type="target" className="!static !size-3 !translate-x-0 !translate-y-0 !border-white/40 !bg-[#0c0d11]" />
        </div>
      ))}
      {!isTerminalOutput ? (
        <Handle id="image" position={Position.Right} type="source" className="!size-3 !border-[#8fa7ff] !bg-[#8fa7ff]" />
      ) : null}
      <div className="mb-1 flex items-start gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.06] text-[#c8d4ff]">
          {catalog?.icon || <Layers className="size-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[12px] font-semibold text-white/92">{data.title}</h3>
            <StatusDot status={data.status || "idle"} />
            <span className="apple-caption shrink-0 text-[11px]">{taskStatusLabel(data.status || "idle")}</span>
          </div>
          <p className="apple-caption mt-0.5 line-clamp-1 text-[11px] leading-4">{operationNodeSubtitle(data, catalog?.description, textReferences.length)}</p>
        </div>
        <button
          className="apple-button-danger nodrag flex size-6 shrink-0 items-center justify-center opacity-0 transition group-hover:opacity-100"
          onClick={() => data.onDelete?.(id)}
          title="删除节点"
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      <div className={contentShellClass}>
        {data.kind === "mask_edit" ? (
          <div className="space-y-2">
            <button
              className="apple-button nodrag flex h-8 w-full items-center justify-center gap-1.5 text-[11px] transition"
              onClick={() => data.onMaskEdit?.(id)}
              type="button"
            >
              <Brush className="size-3.5" />
              局部 AI 修改
            </button>
            <div className="apple-caption leading-5">
              涂哪里，改哪里；未涂抹区域强制保持原图不变。
            </div>
            {maskBadge ? (
              <div className={maskBadge.valid ? "apple-pill-accent rounded-xl px-2 py-1.5 text-[11px]" : "rounded-xl border border-[#ffd166]/18 bg-[#ffd166]/10 px-2 py-1.5 text-[11px] text-[#ffe1a3]"}>
                {maskBadge.label}
              </div>
            ) : null}
          </div>
        ) : null}
        {singleOutput ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <CompactOutputSummary images={outputs} />
            <button
              className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
              onClick={() => data.onPreview?.(singleOutput)}
              style={compactThumbStyle(singleOutput, 72, 64)}
              title="查看结果"
              type="button"
            >
              <ImageFrame alt={data.title} className="pointer-events-none" fit={previewFit} image={singleOutput} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(singleOutput)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
            </button>
          </div>
        ) : (
          <>
            {outputs.length ? <CompactOutputSummary images={outputs} /> : <NodeSummary data={data} />}
            {output && outputs.length > 1 ? (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {outputs.slice(0, 2).map((item, index) => (
                  <button
                    className="apple-node-well nodrag relative block overflow-hidden rounded-[12px]"
                    key={`${item.id}-${index}`}
                    onClick={() => data.onPreview?.(item as ImageAsset)}
                    style={{ ...compactThumbStyle(item, 102, 62), margin: "0 auto" }}
                    title={`查看第 ${index + 1} 张结果`}
                    type="button"
                  >
                    <ImageFrame alt={`${data.title}-${index + 1}`} className="pointer-events-none" fit={previewFit} image={item} imgClassName="pointer-events-none" preserveRatio={false} showCheckerboard={shouldShowCheckerboard(item)} style={{ height: "100%", width: "100%" }} variant="thumbnail" />
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        {outputs.length > 2 ? (
          <div className="apple-caption mt-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
            还有 {outputs.length - 2} 张
          </div>
        ) : null}
        {data.error ? <NodeErrorNotice compact error={String(data.error)} /> : null}
      </div>

      {data.kind === "text_to_image" ? (
        <TextReferenceQuickControls data={data} nodeId={id} references={textReferences} />
      ) : null}
    </section>
  );
});

export const WORKBENCH_NODE_TYPES: NodeTypes = {
  image_input: ImageInputNode,
  text_to_image: OperationNode,
  image_to_image: OperationNode,
  fuse_images: OperationNode,
  outpaint: OperationNode,
  resize: OperationNode,
  replace_product: OperationNode,
  mask_edit: OperationNode,
  hd_redraw: OperationNode,
  upscale_4k: OperationNode,
  reference_remake: OperationNode,
  design_optimize: OperationNode,
  png_layers: OperationNode,
  output: OperationNode,
};
