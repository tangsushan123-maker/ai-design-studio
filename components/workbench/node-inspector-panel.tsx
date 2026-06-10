"use client";

import { useState } from "react";
import { ArrowLeft, Brush, FileText, Layers, RefreshCcw, Sparkles, X } from "lucide-react";
import { findSizePresetByLabel } from "@/lib/size-presets";
import { NodeErrorNotice } from "@/components/workbench/node-error-notice";
import { SmartRecommendations } from "@/components/workbench/smart-recommendations";
import { TextReferenceInspector } from "@/components/workbench/text-reference-inspector";
import { isComposerDrivenNode } from "@/components/workbench/workbench-composer-helpers";
import { taskStatusLabel } from "@/components/workbench/workbench-labels";
import {
  activeResizePresetLabel,
  textToImageCameraDistance,
  textToImageCompositionCompleteness,
  textToImageSafeMargin,
  textToImageSubjectScale,
} from "@/components/workbench/workbench-node-prompts";
import {
  InlineChipRow,
  RatioPresetGrid,
  SizePresetSelect,
  textReferenceNodeItems,
} from "@/components/workbench/workbench-node-ui";
import {
  designOptimizationStrengthLabel,
  designOptimizationStrengthParam,
  designOptimizationStrengthValue,
  exportFormatParam,
  pngLayerExportModeLabel,
  pngLayerExportModeParam,
  qualityEnhanceModeLabel,
  qualityEnhanceModeParam,
  qualityEnhanceModeValue,
  referenceRemakeModeLabel,
  referenceRemakeModeParam,
  referenceRemakeModeValue,
  resizeFitModeLabel,
  resizeFitModeValue,
} from "@/components/workbench/workbench-operation-params";
import { selectedNodeRunEstimate } from "@/components/workbench/workbench-runtime-helpers";
import {
  EmptyPanel,
  InspectorAdvancedSection,
  InspectorInput,
  InspectorSection,
  InspectorTextarea,
  StatusDot,
} from "@/components/workbench/workbench-small-ui";
import {
  defaultTextReferenceConfig,
  normalizeTextReferenceConfigs,
} from "@/components/workbench/workbench-text-references";
import {
  qualityEnhanceQualityOptionsForTargets,
  qualityEnhanceTargetForQuality,
  qualityEnhanceTargetOptionsForImage,
  qualityForQualityEnhanceTarget,
  upscaleTargetDisplayLabel,
} from "@/components/workbench/workbench-upscale";
import {
  adaptiveRatioOptions,
  inferRatioFromTargetSize,
  qualityParam,
  ratioOptions,
  ratioParam,
  stringParam,
} from "@/components/workbench/workbench-utils";
import type {
  FlowNode,
  ImageAsset,
  NodeKind,
  TextReferenceConfig,
} from "@/components/workbench/workbench-types";

export function NodeInspectorPanel({
  backNode,
  imageModel,
  node,
  onBackToNode,
  onCreateAction,
  onMaskEdit,
  onParamChange,
  onRunNode,
}: {
  backNode: FlowNode | null;
  imageModel: string;
  node: FlowNode | null;
  onBackToNode: (nodeId: string) => void;
  onCreateAction: (nodeId: string, type: NodeKind, handle: string, params?: Record<string, unknown>) => void;
  onMaskEdit: (nodeId: string) => void;
  onParamChange: (nodeId: string, key: string, value: unknown) => void;
  onRunNode: (nodeId: string) => void;
}) {
  const [activeInspectorAction, setActiveInspectorAction] = useState("");

  function runInspectorAction(label: string, action: () => void) {
    if (activeInspectorAction) return;
    setActiveInspectorAction(label);
    action();
    window.setTimeout(() => setActiveInspectorAction(""), 1200);
  }

  if (!node) {
    return (
      <EmptyPanel
        icon={<Layers className="size-8" />}
        title="未选择节点"
        description="点选画布节点可编辑参数；也可以从左侧添加节点或在底部输入需求开始。"
      />
    );
  }

  const params = node.data.params || {};
  const isRunning = node.data.status === "running" || node.data.status === "queued" || node.data.status === "saving";
  const hasModel = "model" in params || node.data.kind !== "image_input";
  const hasPrompt = ["text_to_image", "image_to_image", "fuse_images", "outpaint", "resize", "replace_product", "mask_edit", "hd_redraw", "reference_remake", "design_optimize"].includes(node.data.kind);
  const promptLivesInComposer = hasPrompt && isComposerDrivenNode(node.data.kind);
  const modelLivesInComposer = hasModel && isComposerDrivenNode(node.data.kind);
  const textReferenceItems = node.data.kind === "text_to_image" ? textReferenceNodeItems(node.data) : [];
  const documentFiles = node.data.kind === "text_to_image" ? textToImageDocumentFiles(params.documentFiles) : [];
  const nodeId = node.id;
  const qualityEnhanceImage = (node.data.image || node.data.output || null) as ImageAsset | null;
  const qualityEnhanceTargets = qualityEnhanceTargetOptionsForImage(qualityEnhanceImage, stringParam(params.model) || imageModel);
  const qualityEnhanceQualityOptions = qualityEnhanceQualityOptionsForTargets(qualityEnhanceTargets);
  const qualityEnhanceQuality = qualityEnhanceQualityOptions.includes(qualityParam(params.quality))
    ? qualityParam(params.quality)
    : qualityForQualityEnhanceTarget(qualityEnhanceTargets[0] || "");

  function updateTextReference(index: number, patch: Partial<TextReferenceConfig>) {
    const current = normalizeTextReferenceConfigs(params.referenceConfigs);
    const next = textReferenceItems.map((item, itemIndex) => {
      const existing = current[itemIndex] || current.find((config) => config.handle === item.handle) || defaultTextReferenceConfig(item.handle, itemIndex, item.image);
      return {
        handle: item.handle,
        role: itemIndex === index && patch.role ? patch.role : existing.role,
        weight: itemIndex === index && patch.weight ? patch.weight : existing.weight,
      };
    });
    onParamChange(nodeId, "referenceConfigs", next);
  }

  return (
    <div className="space-y-3">
      {backNode ? (
        <button
          className="apple-button flex h-9 max-w-full items-center gap-1.5 px-3 text-[11px] font-semibold text-white/68"
          onClick={() => onBackToNode(backNode.id)}
          title={`返回 ${backNode.data.title}`}
          type="button"
        >
          <ArrowLeft className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">返回 {backNode.data.title}</span>
        </button>
      ) : null}
      <section className="apple-surface-section px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/84">{node.data.title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusDot status={node.data.status || "idle"} />
            <span className="apple-caption">{taskStatusLabel(node.data.status || "idle")}</span>
          </div>
        </div>
        {node.data.kind !== "image_input" ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="apple-pill max-w-full px-2 py-1 text-[11px] leading-none text-white/56">预计 {selectedNodeRunEstimate(node.data.kind)}</span>
            {node.data.kind === "text_to_image" ? <span className="apple-pill px-2 py-1 text-[11px] leading-none text-white/56">按底部方案数量生成</span> : null}
            {stringParam(params.taskTemplateTitle) ? <span className="apple-pill-accent px-2 py-1 text-[11px] leading-none">常用任务：{stringParam(params.taskTemplateTitle)}</span> : null}
          </div>
        ) : null}
        {node.data.error ? <NodeErrorNotice className="mt-3" error={String(node.data.error)} /> : null}
      </section>

      {hasPrompt && !promptLivesInComposer ? (
        <InspectorTextarea
          label={node.data.kind === "mask_edit" ? "要改什么" : "Prompt"}
          onChange={(value) => onParamChange(node.id, "prompt", value)}
          placeholder="写生成、修改或保留内容"
          value={stringParam(params.prompt)}
        />
      ) : null}

      {hasModel && !modelLivesInComposer ? (
        <InspectorInput
          label="图片模型"
          onChange={(value) => onParamChange(node.id, "model", value)}
          placeholder="默认图片模型"
          value={stringParam(params.model)}
        />
      ) : null}

      {node.data.kind === "image_input" ? (
        <SmartRecommendations node={node} onCreateAction={onCreateAction} />
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <InspectorSection title="生成设置" hint="常用">
          <RatioPresetGrid label="比例" value={ratioParam(params.aspectRatio)} options={adaptiveRatioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          <div className="rounded-[14px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/54">
            选择比例后会强制传给模型；未选择时按内容自动判断。方案数量在底部输入框选择。
          </div>
          <InspectorAdvancedSection title="高级画面控制">
            <InlineChipRow label="完整" value={textToImageCompositionCompleteness(params)} options={["标准", "更完整", "大留白", "全身/全物体"]} onChange={(value) => onParamChange(node.id, "compositionCompleteness", value)} />
            <InlineChipRow label="边距" value={textToImageSafeMargin(params)} options={["5%", "10%", "15%", "20%"]} onChange={(value) => onParamChange(node.id, "safeMargin", value)} />
            <InlineChipRow label="镜头" value={textToImageCameraDistance(params)} options={["近景", "中景", "远景", "自动"]} onChange={(value) => onParamChange(node.id, "cameraDistance", value)} />
            <InlineChipRow label="主体" value={textToImageSubjectScale(params)} options={["大", "中", "小"]} onChange={(value) => onParamChange(node.id, "subjectScale", value)} />
          </InspectorAdvancedSection>
        </InspectorSection>
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <InspectorSection title="参考文档" hint={documentFiles.length ? `${documentFiles.length}/3` : "可选"}>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-white/16 bg-white/[0.035] px-3 py-3 text-[11px] font-semibold text-white/68 transition hover:border-[#74e3c5]/36 hover:text-[#adf8e5]">
            <FileText className="size-3.5" />
            上传 PDF / Word / TXT
            <input
              accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="hidden"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files || []).filter(isSupportedDocumentReferenceFile);
                if (!files.length) return;
                const next = [...documentFiles, ...files].slice(0, 3);
                onParamChange(node.id, "documentFiles", next);
                onParamChange(node.id, "documentFileNames", next.map((file) => file.name));
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          {documentFiles.length ? (
            <div className="space-y-1.5">
              {documentFiles.map((file, index) => (
                <div className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-black/18 px-2.5 py-2" key={`${file.name}-${file.size}-${index}`}>
                  <FileText className="size-3.5 shrink-0 text-[#74e3c5]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-white/74">{file.name}</div>
                    <div className="text-[11px] text-white/40">{formatDocumentFileSize(file.size)}</div>
                  </div>
                  <button
                    className="apple-button flex size-7 items-center justify-center rounded-full p-0"
                    onClick={() => {
                      const next = documentFiles.filter((_, itemIndex) => itemIndex !== index);
                      onParamChange(node.id, "documentFiles", next);
                      onParamChange(node.id, "documentFileNames", next.map((item) => item.name));
                    }}
                    title="移除"
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-white/48">
              上传后会直接发送给模型作为参考资料，不在本地拆解文档内容。
            </div>
          )}
        </InspectorSection>
      ) : null}

      {node.data.kind === "text_to_image" ? (
        <TextReferenceInspector
          items={textReferenceItems}
          onChange={updateTextReference}
        />
      ) : null}

      {node.data.kind === "image_to_image" || node.data.kind === "fuse_images" ? (
        <InspectorSection title="图像生成">
          {node.data.kind === "fuse_images" ? (
            <InlineChipRow
              label="合成"
              value={stringParam(params.fusionMode) || "主体入景"}
              options={["主体入景", "产品入景", "人物换装", "产品换Logo", "IP入海报", "自定义合成"]}
              onChange={(value) => onParamChange(node.id, "fusionMode", value)}
            />
          ) : (
            <RatioPresetGrid label="比例" value={ratioParam(params.aspectRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "aspectRatio", value)} />
          )}
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "outpaint" ? (
        <InspectorSection title="扩图参数">
          <RatioPresetGrid label="扩到" value={ratioParam(params.targetRatio)} options={ratioOptions} onChange={(value) => onParamChange(node.id, "targetRatio", value)} />
          <InlineChipRow label="方向" value={stringParam(params.direction) || "四周"} options={["四周", "左", "右", "上", "下"]} onChange={(value) => onParamChange(node.id, "direction", value)} />
          {ratioParam(params.targetRatio) === "custom" ? (
            <InspectorInput label="目标尺寸" placeholder="例如 1920x750" value={stringParam(params.targetSize)} onChange={(value) => onParamChange(node.id, "targetSize", value)} />
          ) : null}
        </InspectorSection>
      ) : null}

      {node.data.kind === "resize" ? (
        <InspectorSection title="AI改版适配">
          <SizePresetSelect
            label="比例"
            value={stringParam(params.sizePreset) === "自定义" ? "自定义" : findSizePresetByLabel(stringParam(params.sizePreset))?.label || activeResizePresetLabel(node.data)}
            onChange={(label) => {
              const preset = findSizePresetByLabel(label);
              if (!preset) return;
              onParamChange(node.id, "sizePreset", preset.label);
              onParamChange(node.id, "targetRatio", preset.targetRatio);
              onParamChange(node.id, "targetSize", preset.targetSize);
              onParamChange(node.id, "fitMode", preset.recommendedMode);
            }}
          />
          {ratioParam(params.targetRatio) === "custom" || stringParam(params.sizePreset) === "自定义" ? (
            <InspectorInput
              label="自定义宽高"
              placeholder="例如 1920x1080"
              value={stringParam(params.targetSize) || "1920x1080"}
              onChange={(value) => {
                onParamChange(node.id, "targetSize", value);
                onParamChange(node.id, "targetRatio", inferRatioFromTargetSize(value));
                onParamChange(node.id, "sizePreset", "自定义");
              }}
            />
          ) : null}
          <InlineChipRow
            label="处理"
            value={resizeFitModeLabel(stringParam(params.fitMode))}
            options={["智能重排", "保守扩图"]}
            onChange={(label) => onParamChange(node.id, "fitMode", resizeFitModeValue(label))}
          />
        </InspectorSection>
      ) : null}

      {node.data.kind === "upscale_4k" || node.data.kind === "hd_redraw" ? (
        <InspectorSection title="画质增强">
          {node.data.kind === "upscale_4k" ? (
            <>
              <InlineChipRow
                label="模式"
                value={resizeFitModeLabel(stringParam(params.fitMode))}
                options={["文字修复", "图文增强", "质感重绘"]}
                onChange={(value) => onParamChange(node.id, "fitMode", resizeFitModeValue(value))}
              />
              <InlineChipRow
                label="目标"
                value={upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}
                options={qualityEnhanceTargets}
                onChange={(value) => {
                  onParamChange(node.id, "targetSize", value);
                  onParamChange(node.id, "quality", qualityForQualityEnhanceTarget(value));
                }}
              />
              <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
            </>
          ) : null}
          {node.data.kind === "hd_redraw" ? (
            <>
              <InlineChipRow
                label="模式"
                value={qualityEnhanceModeLabel(qualityEnhanceModeParam(params.enhancementMode))}
                options={["文字修复", "图文增强", "质感重绘"]}
                onChange={(value) => onParamChange(node.id, "enhancementMode", qualityEnhanceModeValue(value))}
              />
              <InlineChipRow
                label="目标"
                value={upscaleTargetDisplayLabel(stringParam(params.targetSize) || "长边3840")}
                options={qualityEnhanceTargets}
                onChange={(value) => {
                  onParamChange(node.id, "targetSize", value);
                  onParamChange(node.id, "quality", qualityForQualityEnhanceTarget(value));
                }}
              />
              <InlineChipRow
                label="质量"
                value={qualityEnhanceQuality}
                options={qualityEnhanceQualityOptions}
                onChange={(value) => {
                  onParamChange(node.id, "quality", value);
                  onParamChange(node.id, "targetSize", qualityEnhanceTargetForQuality(qualityEnhanceTargets, qualityParam(value)));
                }}
              />
              <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
            </>
          ) : (
            <InlineChipRow label="质量" value={qualityParam(params.quality)} options={qualityEnhanceQualityOptions} onChange={(value) => onParamChange(node.id, "quality", value)} />
          )}
        </InspectorSection>
      ) : null}

      {node.data.kind === "mask_edit" ? (
        <InspectorSection title="局部 AI 修改">
          <button
            className="apple-button-primary flex h-9 w-full items-center justify-center gap-1.5 text-[11px] font-semibold transition disabled:opacity-45"
            disabled={Boolean(activeInspectorAction)}
            onClick={() => runInspectorAction("打开涂抹修改", () => onMaskEdit(node.id))}
            type="button"
          >
            <Brush className="size-3.5" />
            {activeInspectorAction === "打开涂抹修改" ? "打开中" : "打开涂抹修改"}
          </button>
        </InspectorSection>
      ) : null}

      {node.data.kind === "reference_remake" ? (
        <InspectorSection title="参考图重制">
          <InlineChipRow
            label="模式"
            value={referenceRemakeModeLabel(referenceRemakeModeParam(params.mode))}
            options={["快速复刻", "精准重制"]}
            onChange={(value) => onParamChange(node.id, "mode", referenceRemakeModeValue(value))}
          />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "design_optimize" ? (
        <InspectorSection title="设计优化">
          <InlineChipRow
            label="强度"
            value={designOptimizationStrengthLabel(designOptimizationStrengthParam(params.strength))}
            options={["保守优化", "专业优化", "大幅优化"]}
            onChange={(value) => onParamChange(node.id, "strength", designOptimizationStrengthValue(value))}
          />
          <InlineChipRow label="质量" value={qualityParam(params.quality)} options={["standard", "2k", "4k"]} onChange={(value) => onParamChange(node.id, "quality", value)} />
          <InspectorInput label="行业" placeholder="自动识别，可手动填医疗健康/美妆/餐饮等" value={stringParam(params.industry)} onChange={(value) => onParamChange(node.id, "industry", value)} />
          <InspectorInput label="类型" placeholder="自动识别，可手动填海报/横幅/专家介绍等" value={stringParam(params.designType)} onChange={(value) => onParamChange(node.id, "designType", value)} />
          <InspectorInput label="场景" placeholder="自动识别，可手动填线上传播/线下投放等" value={stringParam(params.scene)} onChange={(value) => onParamChange(node.id, "scene", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind === "png_layers" ? (
        <InspectorSection title="智能分层交付">
          <InlineChipRow
            label="模式"
            value={pngLayerExportModeLabel(pngLayerExportModeParam(params.mode))}
            options={["智能分层", "快速分层"]}
            onChange={(value) => onParamChange(node.id, "mode", value === "快速分层" ? "fast" : "ai_precise")}
          />
          <div className="apple-caption">默认输出背景、文字、人物 3 层。</div>
        </InspectorSection>
      ) : null}

      {node.data.kind === "output" ? (
        <InspectorSection title="输出">
          <InlineChipRow label="格式" value={exportFormatParam(params.format)} options={["png", "jpg", "webp"]} onChange={(value) => onParamChange(node.id, "format", value)} />
        </InspectorSection>
      ) : null}

      {node.data.kind !== "image_input" && !isComposerDrivenNode(node.data.kind) ? (
        <div className="space-y-2">
          <button
            className="apple-button-primary flex h-10 w-full items-center justify-center gap-1.5 text-[12px] font-semibold transition disabled:opacity-45"
            disabled={isRunning || Boolean(activeInspectorAction)}
            onClick={() => runInspectorAction("运行节点", () => onRunNode(node.id))}
            type="button"
          >
            {isRunning || activeInspectorAction === "运行节点" ? <RefreshCcw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {isRunning ? "生成中，请勿重复点击" : activeInspectorAction === "运行节点" ? "启动中" : "运行"}
          </button>
          {isRunning ? (
            <div className="rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[11px] leading-5 text-[#ffe1a3]">
              当前任务已经进入队列或模型生成阶段，完成后会自动把图片放到画布和任务中心。
            </div>
          ) : null}
        </div>
      ) : node.data.kind !== "image_input" ? (
        <div className="rounded-[14px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/54">
          在底部输入框写需求，按 Enter 或点“运行”执行当前节点。
        </div>
      ) : null}
    </div>
  );
}

function textToImageDocumentFiles(value: unknown): File[] {
  return Array.isArray(value) ? value.filter((item): item is File => item instanceof File) : [];
}

function isSupportedDocumentReferenceFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (file.size > 25 * 1024 * 1024) return false;
  return /\.(pdf|doc|docx|txt|md)$/.test(name)
    || [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ].includes(type);
}

function formatDocumentFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
