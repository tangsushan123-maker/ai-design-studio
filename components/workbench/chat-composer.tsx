"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Camera, Check, ChevronDown, FileImage, Layers, Loader2, Palette, Plus, ScanLine, Search, ShieldCheck, Sparkles, Star, Sticker } from "lucide-react";
import { type AspectRatioValue, type QualityValue } from "@/lib/design-options";
import { defaultParamsByKind } from "@/components/workbench/workbench-config";
import {
  canSubmitComposerForNode,
  composerHelperTextForNode,
  composerPlaceholderForNode,
  composerTitleForNode,
  isComposerDrivenNode,
} from "@/components/workbench/workbench-composer-helpers";
import { imageModelProductHint, preferredAutoImageModelId } from "@/components/workbench/workbench-models";
import { RatioGlyph } from "@/components/workbench/workbench-node-ui";
import { AutoResizeTextarea } from "@/components/workbench/workbench-small-ui";
import { imageKey } from "@/components/workbench/workbench-image-collection";
import { adaptiveRatioOptions, firstSupportedImageFile, ratioOptionLabel, stringParam } from "@/components/workbench/workbench-utils";
import type { BrandAssetSummary, BrandAssetUsage, FlowNode, ImageAsset } from "@/components/workbench/workbench-types";
import type { ModelCatalogItem } from "@/lib/openai-defaults";

export function ChatComposer({
  brandSummary,
  brandUsage,
  copyAssistantStatus,
  effectiveModel,
  focusTick,
  favoriteStyleImages,
  hasKey,
  model,
  modelOptions,
  onBrandUsageChange,
  onImageFile,
  onFavoriteStyleSelect,
  onModelChange,
  onOpenAssistant,
  onPasteHint,
  onPromptChange,
  onQualityChange,
  onRatioChange,
  onVariantCountChange,
  onSubmit,
  prompt,
  quality,
  ratio,
  runningNodeIds,
  selectedNode,
  selectedFavoriteStyleKeys,
  variantCount,
}: {
  brandSummary: BrandAssetSummary;
  brandUsage: BrandAssetUsage;
  copyAssistantStatus: "idle" | "loading" | "ready" | "error";
  effectiveModel: string;
  focusTick: number;
  favoriteStyleImages: ImageAsset[];
  hasKey: boolean;
  model: string;
  modelOptions: ModelCatalogItem[];
  onBrandUsageChange: (value: BrandAssetUsage) => void;
  onFavoriteStyleSelect: (key: string) => void;
  onImageFile: (file: File) => void;
  onModelChange: (value: string) => void;
  onOpenAssistant: () => void;
  onPasteHint: () => void;
  onPromptChange: (value: string) => void;
  onQualityChange: (value: QualityValue) => void;
  onRatioChange: (value: AspectRatioValue) => void;
  onVariantCountChange: (value: number) => void;
  onSubmit: (promptDraft?: string) => void;
  prompt: string;
  quality: QualityValue;
  ratio: AspectRatioValue;
  runningNodeIds: Set<string>;
  selectedNode: FlowNode | null;
  selectedFavoriteStyleKeys: string[];
  variantCount: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuAreaRef = useRef<HTMLDivElement | null>(null);
  const composerPanelRef = useRef<HTMLDivElement | null>(null);
  const initialFocusTickRef = useRef(focusTick);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [favoriteStyleQuery, setFavoriteStyleQuery] = useState("");
  const ratios: AspectRatioValue[] = adaptiveRatioOptions;
  const qualityOptions = [
    { label: "标准", description: "适合快速出图", value: "standard" as QualityValue },
    { label: "2K", description: "更清晰，适合交付检查", value: "2k" as QualityValue },
    { label: "4K", description: "高清输出，适合成品交付", value: "4k" as QualityValue },
  ];
  const menuModelOptions = useMemo(
    () => [
      {
        label: modelOptions.length ? "Auto · 推荐" : hasKey ? "Auto · 待测试" : "Auto · 未配置",
        description: modelOptions.length
          ? `自动使用 ${preferredAutoImageModelId(modelOptions, effectiveModel) || "可用图片模型"}，优先 gpt-image-2 画质`
          : hasKey ? "到 API 设置页测试图片模型后显示" : "先在 API 设置页配置 Key",
        value: "",
      },
      ...modelOptions.map((item) => ({
        label: item.label || item.id,
        description: imageModelProductHint(item),
        value: item.id,
      })),
    ],
    [effectiveModel, hasKey, modelOptions],
  );
  const activeModelLabel = menuModelOptions.find((item) => item.value === model)?.label || model || "Auto";
  const selectedPromptNode = selectedNode && isComposerDrivenNode(selectedNode.data.kind) ? selectedNode : null;
  const selectedFavoriteStyleKeySet = useMemo(() => new Set(selectedFavoriteStyleKeys), [selectedFavoriteStyleKeys]);
  const selectedFavoriteStyleCount = favoriteStyleImages.filter((image) => selectedFavoriteStyleKeySet.has(imageKey(image))).length;
  const filteredFavoriteStyleImages = useMemo(() => {
    const query = favoriteStyleQuery.trim().toLowerCase();
    if (!query) return favoriteStyleImages;
    return favoriteStyleImages.filter((image) => [
      image.fileName,
      image.originalFileName,
      image.resourceFileName,
      image.mode,
      image.prompt,
      image.model,
      image.materialScene,
      image.materialCopy,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [favoriteStyleImages, favoriteStyleQuery]);
  const selectedPromptNodeValue = selectedPromptNode ? stringParam(selectedPromptNode.data.params.prompt) : "";
  const selectedPromptNodeDefault = selectedPromptNode ? stringParam(defaultParamsByKind[selectedPromptNode.data.kind]?.prompt) : "";
  const displayPrompt = selectedPromptNode
    ? (selectedPromptNodeValue.trim() && selectedPromptNodeValue.trim() !== selectedPromptNodeDefault.trim() ? selectedPromptNodeValue : "")
    : prompt;
  const composerPlaceholder = selectedPromptNode ? composerPlaceholderForNode(selectedPromptNode) : "输入提示词";
  const composerTitle = selectedPromptNode ? composerTitleForNode(selectedPromptNode) : "文生图";
  const composerHelper = selectedPromptNode ? composerHelperTextForNode(selectedPromptNode) : "";
  const selectedPromptNodeBusy = Boolean(selectedPromptNode && (
    selectedPromptNode.data.status === "queued" ||
    selectedPromptNode.data.status === "running" ||
    selectedPromptNode.data.status === "saving" ||
    runningNodeIds.has(selectedPromptNode.id)
  ));
  const canSubmit = Boolean(effectiveModel) && !selectedPromptNodeBusy && (selectedPromptNode ? canSubmitComposerForNode(selectedPromptNode, displayPrompt) : Boolean(prompt.trim()));
  const submitDisabledReason = selectedPromptNodeBusy
    ? "当前节点正在运行"
    : !effectiveModel
      ? (hasKey ? "还没有可用图片模型，请先到设置页测试模型" : "还没有配置 API Key")
      : selectedPromptNode
        ? composerHelper || "请补齐这个节点需要的输入"
        : "请输入提示词";
  const variantOptions = [1, 2, 3, 4, 5, 6];
  const anyMenuOpen = uploadMenuOpen || modelMenuOpen || ratioMenuOpen || qualityMenuOpen || variantMenuOpen || brandMenuOpen;
  const apiSetupMessage = !hasKey
    ? "还没有配置 API Key，配置后才能生成图片。"
    : !effectiveModel
      ? "Key 已配置，但还没有通过测试的图片模型。"
      : "";
  const compactComposerLabel = displayPrompt.trim()
    ? displayPrompt.trim()
    : selectedPromptNode
      ? composerTitle
      : "输入需求";

  function closeMenus() {
    setUploadMenuOpen(false);
    setModelMenuOpen(false);
    setRatioMenuOpen(false);
    setQualityMenuOpen(false);
    setVariantMenuOpen(false);
    setBrandMenuOpen(false);
  }

  function expandComposer() {
    setComposerExpanded(true);
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  }

  function collapseComposerWhenIdle() {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (activeElement && composerPanelRef.current?.contains(activeElement)) return;
      if (uploadMenuOpen || modelMenuOpen || ratioMenuOpen || qualityMenuOpen || variantMenuOpen || brandMenuOpen) return;
      setComposerExpanded(false);
    }, 180);
  }

  useEffect(() => {
    if (!anyMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof globalThis.Node && menuAreaRef.current?.contains(event.target)) return;
      closeMenus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenus();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anyMenuOpen]);

  useEffect(() => {
    if (!composerExpanded || anyMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof globalThis.Node && composerPanelRef.current?.contains(event.target)) return;
      setComposerExpanded(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anyMenuOpen, composerExpanded]);

  useEffect(() => {
    if (focusTick === initialFocusTickRef.current) return;
    const timer = window.setTimeout(() => {
      setComposerExpanded(true);
    }, 0);
    const focusTimer = window.setTimeout(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 30);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(focusTimer);
    };
  }, [focusTick]);

  useEffect(() => {
    if (!selectedPromptNode) return;
    const timer = window.setTimeout(() => setComposerExpanded(true), 0);
    return () => window.clearTimeout(timer);
  }, [selectedPromptNode]);

  function handleFiles(files: FileList | File[]) {
    const file = firstSupportedImageFile(files);
    if (file) onImageFile(file);
    setUploadMenuOpen(false);
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 w-[min(920px,calc(100vw-24px))] -translate-x-1/2 px-2">
      {!composerExpanded && !anyMenuOpen ? (
        <button
          className="apple-panel-strong pointer-events-auto mx-auto flex h-12 max-w-[min(456px,calc(100vw-32px))] items-center gap-1.5 rounded-full px-3 text-left shadow-[0_18px_60px_rgba(0,0,0,0.32)]"
          onClick={expandComposer}
          type="button"
        >
          <Plus className="size-4 shrink-0 text-white/62" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/74">
            {compactComposerLabel}
          </span>
          <span className="apple-pill hidden shrink-0 px-2 py-1 text-[11px] font-semibold text-white/52 sm:inline">
            {ratio === "auto" ? "尺寸自适应" : ratioOptionLabel(ratio)}
          </span>
          <span className="apple-pill shrink-0 px-2 py-1 text-[11px] font-semibold text-white/52">{variantCount} 个方案</span>
          <span className="apple-button-primary flex size-8 shrink-0 items-center justify-center">
            <ArrowUp className="size-4" />
          </span>
        </button>
      ) : (
      <div
        ref={composerPanelRef}
        className="apple-panel-strong pointer-events-auto relative overflow-visible"
        onBlur={collapseComposerWhenIdle}
        onFocus={() => setComposerExpanded(true)}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="px-3.5 pb-0.5 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="apple-section-title">{composerTitle}</div>
              {composerHelper ? <div className="apple-caption mt-0.5 line-clamp-1 max-w-[460px] text-white/52">{composerHelper}</div> : null}
            </div>
            <button
              className="apple-button flex h-8 shrink-0 items-center px-3 text-[11px] text-white/62"
              onClick={() => {
                closeMenus();
                setComposerExpanded(false);
              }}
              type="button"
            >
              收起
            </button>
          </div>
          <AutoResizeTextarea
            ref={textareaRef}
            data-composer-input="true"
            className="mt-1.5 min-h-[42px] w-full resize-none bg-transparent text-[14px] leading-5 text-white/92 outline-none placeholder:text-white/34 focus-visible:shadow-none"
            maxHeight={360}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              onSubmit(displayPrompt);
            }}
            placeholder={composerPlaceholder}
            value={displayPrompt}
          />
          {apiSetupMessage ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-5 text-[#ffe1a0]">
              <span>{apiSetupMessage}</span>
              <Link className="rounded-full border border-[#ffe1a0]/24 bg-[#ffe1a0]/10 px-2 py-0.5 font-semibold text-[#ffe1a0] hover:bg-[#ffe1a0]/16" href="/settings">
                去设置
              </Link>
            </div>
          ) : null}
          {brandUsage.useFavoriteStyle ? (
            <div className="mt-2 rounded-[16px] border border-white/10 bg-white/[0.035] p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white/86">
                    <Star className="size-3.5 text-[#ffe1a0]" />
                    <span>收藏风格库</span>
                    <span className="text-[11px] font-medium text-white/42">{favoriteStyleImages.length} 张</span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-4 text-white/46">
                    {selectedFavoriteStyleCount ? `已选 ${selectedFavoriteStyleCount}/3 张，生成时会传给模型做风格参考` : "未手动选择时，生成会自动取最近 3 张传给模型做弱参考"}
                  </div>
                </div>
                <label className="flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-full border border-white/10 bg-black/18 px-2.5 text-white/54 sm:max-w-[260px]">
                  <Search className="size-3.5 shrink-0" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-white/86 outline-none placeholder:text-white/34"
                    onChange={(event) => setFavoriteStyleQuery(event.target.value)}
                    placeholder="搜索收藏风格"
                    value={favoriteStyleQuery}
                  />
                </label>
              </div>
              <div className="mt-2 rounded-[10px] border border-[#74e3c5]/12 bg-[#74e3c5]/8 px-2 py-1.5 text-[11px] leading-5 text-[#adf8e5]/72">
                这里展示全部收藏图；点选后最多 3 张会作为 styleReference 发给模型，弱参考配色、构图和质感，不复制主体、文字和真实信息。
              </div>
              {favoriteStyleImages.length ? (
                filteredFavoriteStyleImages.length ? (
                  <div className="mt-2 grid max-h-[190px] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8">
                    {filteredFavoriteStyleImages.map((image) => {
                      const key = imageKey(image);
                      const selected = selectedFavoriteStyleKeySet.has(key);
                      return (
                        <button
                          className={`group relative aspect-square overflow-hidden rounded-[10px] border transition ${selected ? "border-[#74e3c5] ring-1 ring-[#74e3c5]/60" : "border-white/10 hover:border-white/28"}`}
                          key={key}
                          onClick={() => onFavoriteStyleSelect(key)}
                          title={selected ? "取消引用这张收藏图" : "引用这张收藏图"}
                          type="button"
                        >
                          <Image
                            alt={image.fileName || image.mode || "收藏图"}
                            className="size-full object-cover"
                            fill
                            sizes="84px"
                            src={image.thumbnailUrl || image.previewUrl || image.url}
                            unoptimized
                          />
                          <span className={`absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border text-[11px] ${selected ? "border-[#74e3c5] bg-[#74e3c5] text-[#06131f]" : "border-white/24 bg-black/42 text-white/64"}`}>
                            {selected ? <Check className="size-3.5" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 rounded-[12px] border border-white/8 px-3 py-3 text-[11px] text-white/46">没有找到匹配的收藏风格。</div>
                )
              ) : (
                <div className="mt-2 rounded-[12px] border border-white/8 px-3 py-3 text-[11px] leading-5 text-white/46">还没有收藏图。先在结果图或图片管理里点星标收藏。</div>
              )}
            </div>
          ) : null}
        </div>

        <div ref={menuAreaRef} className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 sm:px-4">
          <div className="relative shrink-0">
            <button
              className={`apple-button flex size-8 items-center justify-center rounded-full text-white/74 transition ${uploadMenuOpen ? "bg-white/[0.13] text-white" : ""}`}
              onClick={() => {
                setUploadMenuOpen((value) => !value);
                setModelMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setVariantMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="上传文件"
              type="button"
            >
              <Plus className="size-5" />
            </button>
            {uploadMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[204px] overflow-hidden p-1.5">
                <button className="apple-menu-item flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium" onClick={() => fileInputRef.current?.click()} type="button">
                  <FileImage className="size-4 text-white/58" />
                  <span>
                    <span className="block">上传</span>
                    <span className="apple-menu-meta mt-0.5 block">PNG / JPG / WebP</span>
                  </span>
                </button>
                <button
                  className="apple-menu-item flex items-center gap-2 px-3 py-2.5 text-left text-[12px] font-medium"
                  onClick={() => {
                    onPasteHint();
                    setUploadMenuOpen(false);
                  }}
                  type="button"
                >
                  <Camera className="size-4 text-white/58" />
                  <span>
                    <span className="block">粘贴截图</span>
                    <span className="apple-menu-meta mt-0.5 block">自动生成图片节点</span>
                  </span>
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              type="file"
              onChange={(event) => {
                if (event.target.files) handleFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <button
            className="apple-button flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold text-[#adf8e5]/82 transition hover:text-[#adf8e5]"
            onClick={() => {
              closeMenus();
              onOpenAssistant();
            }}
            title="帮我想文案和画面内容"
            type="button"
          >
            {copyAssistantStatus === "loading" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            <span>{copyAssistantStatus === "loading" ? "整理中" : copyAssistantStatus === "ready" ? "方案已好" : copyAssistantStatus === "error" ? "重试帮我想" : "帮我想"}</span>
          </button>

          <span className="ml-1 hidden h-4 w-px shrink-0 bg-white/12 sm:block" />
          <ComposerSelectButton open={ratioMenuOpen} title="切换比例" onClick={() => {
            setRatioMenuOpen((value) => !value);
            setUploadMenuOpen(false);
            setModelMenuOpen(false);
            setQualityMenuOpen(false);
            setVariantMenuOpen(false);
            setBrandMenuOpen(false);
          }}>
            {ratioOptionLabel(ratio)}
          </ComposerSelectButton>
          {ratioMenuOpen ? (
            <div className="apple-menu absolute bottom-12 left-12 w-[214px] overflow-hidden p-2">
              {ratios.map((item) => (
                <button
                  className={`flex w-full items-center justify-between gap-2 rounded-[16px] px-3 py-2 text-left text-[13px] font-semibold transition ${ratio === item ? "bg-white text-[#07121f]" : "text-white/66 hover:bg-white/[0.08] hover:text-white/82"}`}
                  key={item}
                  onClick={() => {
                    onRatioChange(item);
                    setRatioMenuOpen(false);
                  }}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <RatioGlyph ratio={item} selected={ratio === item} />
                    <span className="truncate">{ratioOptionLabel(item)}</span>
                  </span>
                  {ratio === item ? <Check className="size-4 shrink-0 text-[#07121f]/72" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <ComposerSelectButton open={qualityMenuOpen} title="切换分辨率" onClick={() => {
            setQualityMenuOpen((value) => !value);
            setUploadMenuOpen(false);
            setModelMenuOpen(false);
            setRatioMenuOpen(false);
            setVariantMenuOpen(false);
            setBrandMenuOpen(false);
          }}>
            {qualityOptions.find((item) => item.value === quality)?.label || "标准"}
          </ComposerSelectButton>
          {qualityMenuOpen ? (
            <div className="apple-menu absolute bottom-12 left-[132px] w-[188px] overflow-hidden p-1.5">
              {qualityOptions.map((item) => (
                <button
                  className="apple-menu-item flex items-center justify-between gap-3 px-3 py-2.5 text-left text-[12px] font-medium"
                  key={item.value}
                  onClick={() => {
                    onQualityChange(item.value);
                    setQualityMenuOpen(false);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-white/88">{item.label}</span>
                    <span className="apple-menu-meta mt-0.5 block truncate">{item.description}</span>
                  </span>
                  {quality === item.value ? <Check className="size-4 text-white/82" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <span className="ml-1 hidden h-4 w-px shrink-0 bg-white/12 sm:block" />
          <div className="relative">
            <button
              className={`apple-button flex h-8 max-w-[112px] shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold text-white/74 sm:max-w-[148px] ${modelMenuOpen ? "bg-white/[0.13] text-white" : ""}`}
              onClick={() => {
                setModelMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setVariantMenuOpen(false);
                setBrandMenuOpen(false);
              }}
              title="切换图片模型"
              type="button"
            >
              <span className="truncate whitespace-nowrap">{activeModelLabel}</span>
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {modelMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[320px] p-2">
                {menuModelOptions.map((item) => (
                  <button
                    className="apple-menu-item flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                    key={item.label}
                    onClick={() => {
                      onModelChange(item.value);
                      setModelMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-white/88">{item.label}</span>
                      <span className="apple-menu-meta mt-0.5 block truncate text-[11px]">{item.description}</span>
                    </span>
                    {(item.value || "") === (model || "") ? <Check className="size-4 shrink-0 text-white/82" /> : null}
                  </button>
                ))}
                <div className="mt-1 border-t border-white/10 px-3 pt-2">
                  <label className="apple-field-label block">自定义图片模型</label>
                  <input
                    className="apple-input mt-1 h-9 w-full px-3 text-[12px] outline-none"
                    onChange={(event) => onModelChange(event.target.value)}
                    placeholder="图片模型名"
                    value={model}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <span className="ml-1 hidden h-4 w-px shrink-0 bg-white/12 sm:block" />
          <div className="relative shrink-0">
            <button
              className={`apple-button flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold text-white/74 ${brandMenuOpen ? "bg-white/[0.13] text-white" : ""}`}
              onClick={() => {
                setBrandMenuOpen((value) => !value);
                setUploadMenuOpen(false);
                setRatioMenuOpen(false);
                setQualityMenuOpen(false);
                setVariantMenuOpen(false);
                setModelMenuOpen(false);
              }}
              title="项目资产调用"
              type="button"
            >
              <Palette className="size-3.5" />
              <span>项目</span>
              <ChevronDown className="size-3.5 text-white/38" />
            </button>
            {brandMenuOpen ? (
              <div className="apple-menu absolute bottom-12 left-0 w-[300px] p-2">
                <div className="px-2 pb-2 pt-1">
                  <div className="text-[12px] font-semibold text-white/86">项目资产调用</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="apple-pill px-2 py-1 text-[11px]">色卡 {brandSummary.colorCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">Logo {brandSummary.logoCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">IP {brandSummary.ipCount}</span>
                    <span className="apple-pill px-2 py-1 text-[11px]">码 {brandSummary.qrCount}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {brandUsageItems.map((item) => (
                    <div key={item.key}>
                      <button
                        className="apple-menu-item flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                        onClick={() => onBrandUsageChange({ ...brandUsage, [item.key]: !brandUsage[item.key] })}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/58">{item.icon}</span>
                          <span className="min-w-0">
                            <span className="block text-[12px] font-semibold text-white/86">{item.label}</span>
                            <span className="apple-menu-meta mt-0.5 block truncate text-[11px]">
                              {item.key === "useFavoriteStyle" && selectedFavoriteStyleCount ? `已选 ${selectedFavoriteStyleCount} 张收藏图` : item.description}
                            </span>
                          </span>
                        </span>
                        <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${brandUsage[item.key] ? "bg-[#74e3c5]" : "bg-white/12"}`}>
                          <span className={`block size-4 rounded-full bg-white transition ${brandUsage[item.key] ? "translate-x-4" : ""}`} />
                        </span>
                      </button>
                      {item.key === "useFavoriteStyle" && brandUsage.useFavoriteStyle ? (
                        <div className="mx-2 mb-1 rounded-[14px] border border-white/10 bg-white/[0.035] p-2">
                          {favoriteStyleImages.length ? (
                            <>
                              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/48">
                                <span>{selectedFavoriteStyleCount ? "按已选收藏图参考" : "输入框上方可查看全部收藏风格"}</span>
                                <span>{selectedFavoriteStyleCount}/3</span>
                              </div>
                              <div className="mb-2 rounded-[10px] border border-[#74e3c5]/12 bg-[#74e3c5]/8 px-2 py-1.5 text-[11px] leading-5 text-[#adf8e5]/72">
                                收藏风格已单独展示，可搜索和选择；只弱参考配色、构图和质感。
                              </div>
                            </>
                          ) : (
                            <div className="px-1 py-2 text-[11px] leading-5 text-white/48">还没有收藏图。先在结果图或图片管理里点星标收藏。</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {brandSummary.missing.length ? (
                  <div className="mt-2 rounded-[14px] border border-[#ffe1a0]/14 bg-[#ffe1a0]/8 px-3 py-2 text-[11px] leading-5 text-[#ffe1a0]/82">
                    缺：{brandSummary.missing.slice(0, 4).join(" / ")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <ComposerSelectButton open={variantMenuOpen} title="方案数量" onClick={() => {
            setVariantMenuOpen((value) => !value);
            setUploadMenuOpen(false);
            setModelMenuOpen(false);
            setRatioMenuOpen(false);
            setQualityMenuOpen(false);
            setBrandMenuOpen(false);
          }}>
            {variantCount}方案
          </ComposerSelectButton>
          {variantMenuOpen ? (
            <div className="apple-menu absolute bottom-12 right-[76px] w-[154px] overflow-hidden p-1.5">
              {variantOptions.map((count) => (
                <button
                  className="apple-menu-item flex items-center justify-between gap-3 px-3 py-2.5 text-left text-[12px] font-medium"
                  key={count}
                  onClick={() => {
                    onVariantCountChange(count);
                    setVariantMenuOpen(false);
                  }}
                  type="button"
                >
                  <span className="font-semibold text-white/88">{count} 个方案</span>
                  {variantCount === count ? <Check className="size-4 text-white/82" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              className="apple-button-primary flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-[12px] font-semibold disabled:bg-white/[0.08] disabled:text-white/30"
              disabled={!canSubmit}
              onClick={() => {
                closeMenus();
                onSubmit(displayPrompt);
              }}
              title={canSubmit ? "生成" : submitDisabledReason}
              type="button"
            >
              <ArrowUp className="size-4" />
              {selectedPromptNodeBusy ? "运行中" : selectedPromptNode ? "运行" : "生成"}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function ComposerSelectButton({ children, onClick, open, title }: { children: ReactNode; onClick: () => void; open: boolean; title: string }) {
  return (
    <div className="relative shrink-0">
      <button
        className={`apple-button flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold text-white/74 ${open ? "bg-white/[0.13] text-white" : ""}`}
        onClick={onClick}
        title={title}
        type="button"
      >
        {children}
        <ChevronDown className="size-3.5 text-white/38" />
      </button>
    </div>
  );
}

const brandUsageItems: Array<{
  key: keyof BrandAssetUsage;
  label: string;
  description: string;
  icon: ReactNode;
}> = [
  { key: "usePrimaryColors", label: "主色", description: "优先使用项目主色", icon: <Palette className="size-3.5" /> },
  { key: "useSecondaryColors", label: "辅助配色", description: "带入辅助/强调/背景/文字色", icon: <Layers className="size-3.5" /> },
  { key: "useLogo", label: "Logo", description: "明确要求时调用已上传 Logo", icon: <ShieldCheck className="size-3.5" /> },
  { key: "useIpImage", label: "IP形象", description: "明确要求时参考项目 IP", icon: <Sticker className="size-3.5" /> },
  { key: "useContact", label: "联系方式", description: "明确要求时引用电话/地址", icon: <FileImage className="size-3.5" /> },
  { key: "useQrCode", label: "二维码", description: "明确要求时调用已上传二维码", icon: <ScanLine className="size-3.5" /> },
  { key: "useCopy", label: "常用文案", description: "带入项目宣传语和卖点", icon: <Sparkles className="size-3.5" /> },
  { key: "useForbiddenRules", label: "禁用规则", description: "避免改错品牌与敏感内容", icon: <ShieldCheck className="size-3.5" /> },
  { key: "useFavoriteStyle", label: "收藏风格", description: "弱参考收藏图的配色、构图和商业质感", icon: <Star className="size-3.5" /> },
];
