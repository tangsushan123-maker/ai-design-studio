"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  DatabaseZap,
  Film,
  Globe2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  Trash2,
} from "lucide-react";
import {
  findProviderPreset,
  providerPresets,
  type ModelCapability,
  type ModelCatalogItem,
  type ModelReasoningEffort,
  type ModelWireApi,
} from "@/lib/openai-defaults";

type SettingsResponse = {
  hasApiKey: boolean;
  maskedApiKey: string;
  providerName?: string;
  providerId: string;
  providerLabel?: string;
  websiteUrl?: string;
  providerSiteUrl: string;
  apiBaseUrl: string;
  wireApi: ModelWireApi;
  requiresOpenAIAuth: boolean;
  disableResponseStorage: boolean;
  modelReasoningEffort: ModelReasoningEffort;
  textModel: string;
  analysisModel?: string;
  imageModel: string;
  videoModel: string;
  modelsCache: ModelCatalogItem[];
  modelsUpdatedAt: string;
  supportsModelsList?: boolean;
  supportsResponses?: boolean;
  supportsChatCompletions?: boolean;
  supportsImageGeneration?: boolean;
  lastTestedAt?: string;
  isDefault?: boolean;
};

type ModelTestResponse = {
  ok: boolean;
  kind: ModelCapability;
  model: string;
  message: string;
};

type Status = {
  type: "idle" | "loading" | "success" | "error";
  message: string;
};

type DetectionIssue = {
  step: string;
  requestUrl: string;
  status?: number;
  message: string;
  possibleCauses: string[];
  suggestions: string[];
};

type DetectionResult = {
  ok: boolean;
  saved?: boolean;
  providerName: string;
  providerId: string;
  websiteUrl: string;
  apiBaseUrl: string;
  apiKeyStatus: "valid" | "invalid" | "unknown";
  wireApi: ModelWireApi;
  textModel: string;
  imageModel: string;
  videoModel: string;
  supportsModelsList: boolean;
  supportsResponses: boolean;
  supportsChatCompletions: boolean;
  supportsImageGeneration: boolean;
  lastTestedAt: string;
  models: ModelCatalogItem[];
  recommended: {
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  issues: DetectionIssue[];
  testedUrls: string[];
  message: string;
};

const customProvider = findProviderPreset("custom");
const emptyDraft = { id: "", label: "", capability: "text" as ModelCapability };
const reasoningEfforts: ModelReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

export default function SettingsPage() {
  const [providerId, setProviderId] = useState<string>(customProvider.id);
  const [providerSiteUrl, setProviderSiteUrl] = useState<string>(customProvider.siteUrl);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(customProvider.apiBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [wireApi, setWireApi] = useState<ModelWireApi>(customProvider.wireApi);
  const [disableResponseStorage, setDisableResponseStorage] = useState(customProvider.disableResponseStorage);
  const [modelReasoningEffort, setModelReasoningEffort] = useState<ModelReasoningEffort>(customProvider.modelReasoningEffort);
  const [advancedUrl, setAdvancedUrl] = useState(false);
  const [textModel, setTextModel] = useState<string>(customProvider.textModel);
  const [imageModel, setImageModel] = useState<string>(customProvider.imageModel);
  const [videoModel, setVideoModel] = useState<string>(customProvider.videoModel);
  const [modelsCache, setModelsCache] = useState<ModelCatalogItem[]>(customProvider.models);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState("");
  const [supportsModelsList, setSupportsModelsList] = useState(false);
  const [supportsResponses, setSupportsResponses] = useState(false);
  const [supportsChatCompletions, setSupportsChatCompletions] = useState(false);
  const [supportsImageGeneration, setSupportsImageGeneration] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle", message: "待配置" });
  const [lastModelTest, setLastModelTest] = useState<ModelTestResponse | null>(null);
  const [savedAt, setSavedAt] = useState("");
  const isBusy = status.type === "loading";
  const passedModels = useMemo(() => modelsCache.filter((model) => model.testStatus === "passed"), [modelsCache]);
  const passedImageModels = useMemo(() => passedModels.filter((model) => model.capabilities.includes("image")), [passedModels]);
  const groupedModels = useMemo(() => ({
    text: modelsFor("text", modelsCache),
    image: modelsFor("image", modelsCache),
    video: modelsFor("video", modelsCache),
  }), [modelsCache]);
  const primaryImageModel = useMemo(
    () => groupedModels.image.find((model) => model.id === imageModel) || groupedModels.image[0] || null,
    [groupedModels.image, imageModel],
  );
  const normalizedProviderId = useMemo(() => inferProviderId(providerId, providerSiteUrl, apiBaseUrl), [apiBaseUrl, providerId, providerSiteUrl]);
  const effectiveProvider = useMemo(() => findProviderPreset(normalizedProviderId), [normalizedProviderId]);
  const generatedBaseUrl = useMemo(() => inferApiUrl(providerSiteUrl || apiBaseUrl, effectiveProvider), [apiBaseUrl, effectiveProvider, providerSiteUrl]);
  const displayedApiBaseUrl = advancedUrl ? normalizeApiUrl(apiBaseUrl, effectiveProvider) : generatedBaseUrl;

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: SettingsResponse) => applySettings(data))
      .catch(() => setStatus({ type: "error", message: "读取失败" }));
  }, []);

  function markConfigDirty(message = "已修改，需重新检测") {
    setDetectionResult(null);
    setLastModelTest(null);
    setSupportsModelsList(false);
    setSupportsResponses(false);
    setSupportsChatCompletions(false);
    setSupportsImageGeneration(false);
    setStatus({ type: "idle", message });
  }

  function applySettings(data: SettingsResponse) {
    const nextProvider = findProviderPreset(inferProviderId(data.providerId || customProvider.id, data.providerSiteUrl, data.apiBaseUrl));
    const nextSiteUrl = data.websiteUrl || data.providerSiteUrl || nextProvider.siteUrl || siteFromUrl(data.apiBaseUrl);
    const nextApiUrl = normalizeApiUrl(data.apiBaseUrl || inferApiUrl(nextSiteUrl, nextProvider), nextProvider);
    setProviderId(nextProvider.id);
    setProviderSiteUrl(nextSiteUrl);
    setApiBaseUrl(nextApiUrl);
    setAdvancedUrl(Boolean(nextApiUrl && nextApiUrl !== inferApiUrl(nextSiteUrl, nextProvider)));
    setWireApi(data.wireApi || nextProvider.wireApi);
    setDisableResponseStorage(data.disableResponseStorage ?? nextProvider.disableResponseStorage);
    setModelReasoningEffort(data.modelReasoningEffort || nextProvider.modelReasoningEffort);
    setMaskedApiKey(data.maskedApiKey || "");
    setTextModel(data.textModel || data.analysisModel || nextProvider.textModel);
    setImageModel(data.imageModel || nextProvider.imageModel);
    setVideoModel(data.videoModel || nextProvider.videoModel);
    setModelsCache(data.modelsCache?.length ? data.modelsCache : nextProvider.models);
    setModelsUpdatedAt(data.modelsUpdatedAt || "");
    setSupportsModelsList(Boolean(data.supportsModelsList));
    setSupportsResponses(Boolean(data.supportsResponses));
    setSupportsChatCompletions(Boolean(data.supportsChatCompletions));
    setSupportsImageGeneration(Boolean(data.supportsImageGeneration));
    setLastTestedAt(data.lastTestedAt || "");
  }

  function selectProvider(nextProviderId: string) {
    const provider = findProviderPreset(nextProviderId);
    setProviderId(provider.id);
    setProviderSiteUrl(provider.siteUrl);
    setApiBaseUrl(inferApiUrl(provider.siteUrl || provider.apiBaseUrl, provider));
    setAdvancedUrl(false);
    setWireApi(provider.wireApi);
    setDisableResponseStorage(provider.disableResponseStorage);
    setModelReasoningEffort(provider.modelReasoningEffort);
    setTextModel(provider.textModel);
    setImageModel(provider.imageModel);
    setVideoModel(provider.videoModel);
    setModelsCache(provider.models);
    setSupportsModelsList(false);
    setSupportsResponses(provider.wireApi === "responses");
    setSupportsChatCompletions(provider.wireApi === "chat_completions");
    setSupportsImageGeneration(false);
    setLastTestedAt("");
    setDetectionResult(null);
    setDraft({ id: provider.textModel || "", label: provider.textModel || "", capability: "text" });
    setStatus({ type: "idle", message: provider.shortLabel });
  }

  async function saveSettings(overrides?: Partial<{ textModel: string; imageModel: string; videoModel: string; modelsCache: ModelCatalogItem[] }>) {
    setStatus({ type: "loading", message: "保存中..." });
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          providerId: effectiveProvider.id,
          websiteUrl: providerSiteUrl || siteFromUrl(displayedApiBaseUrl),
          providerSiteUrl: providerSiteUrl || siteFromUrl(displayedApiBaseUrl),
          apiBaseUrl: displayedApiBaseUrl,
          wireApi,
          requiresOpenAIAuth: true,
          disableResponseStorage,
          modelReasoningEffort,
          textModel: overrides?.textModel ?? textModel,
          imageModel: overrides?.imageModel ?? imageModel,
          videoModel: overrides?.videoModel ?? videoModel,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ type: "error", message: data.error || "保存失败" });
        return false;
      }
      setApiKey("");
      applySettings(data as SettingsResponse);
      if (overrides?.modelsCache) setModelsCache(overrides.modelsCache);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      setStatus({ type: "success", message: "已保存" });
      return true;
    } catch {
      setStatus({ type: "error", message: "保存失败" });
      return false;
    }
  }

  async function detectProvider(options?: { save?: boolean }) {
    const address = advancedUrl ? displayedApiBaseUrl : providerSiteUrl || displayedApiBaseUrl;
    if (!address.trim()) {
      setStatus({ type: "error", message: "先填写中转站地址" });
      return;
    }
    if (!apiKey.trim() && !maskedApiKey) {
      setStatus({ type: "error", message: "先填写 API Key" });
      return;
    }

    setStatus({ type: "loading", message: options?.save ? "检测并保存..." : "自动检测..." });
    setDetectionResult(null);
    try {
      const response = await fetch("/api/providers/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: providerSiteUrl || siteFromUrl(displayedApiBaseUrl),
          apiBaseUrl: advancedUrl ? displayedApiBaseUrl : undefined,
          apiKey,
          providerName: effectiveProvider.id === "custom" ? "自定义中转" : effectiveProvider.label,
          save: Boolean(options?.save),
          manual: showManualConfig
            ? {
              wireApi,
              textModel,
              imageModel,
              videoModel,
            }
            : undefined,
        }),
      });
      const data = await response.json() as DetectionResult;
      setDetectionResult(data);
      setProviderId(data.providerId || providerId);
      setProviderSiteUrl(data.websiteUrl || providerSiteUrl);
      setApiBaseUrl(data.apiBaseUrl || displayedApiBaseUrl);
      setAdvancedUrl(true);
      setWireApi(data.wireApi || wireApi);
      setTextModel(data.textModel || data.recommended?.textModel || textModel);
      setImageModel(data.imageModel || data.recommended?.imageModel || imageModel);
      setVideoModel(data.videoModel || data.recommended?.videoModel || videoModel);
      setModelsCache(data.models?.length ? data.models : modelsCache);
      setSupportsModelsList(Boolean(data.supportsModelsList));
      setSupportsResponses(Boolean(data.supportsResponses));
      setSupportsChatCompletions(Boolean(data.supportsChatCompletions));
      setSupportsImageGeneration(Boolean(data.supportsImageGeneration));
      setLastTestedAt(data.lastTestedAt || "");
      if (data.saved) {
        setApiKey("");
        await reloadSettings();
      }
      setStatus({ type: response.ok && data.ok ? "success" : "error", message: data.message || (response.ok ? "检测完成" : "检测失败") });
    } catch {
      setStatus({ type: "error", message: "检测失败" });
    }
  }

  async function refreshModels() {
    const saved = await saveSettings();
    if (!saved) return;
    setStatus({ type: "loading", message: "刷新模型..." });
    try {
      const response = await fetch("/api/models/refresh", { method: "POST" });
      const data = await response.json() as { ok: boolean; models?: ModelCatalogItem[]; modelsUpdatedAt?: string; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || "刷新失败");
      setModelsCache(data.models || []);
      setModelsUpdatedAt(data.modelsUpdatedAt || "");
      setStatus({ type: "success", message: data.message || "已刷新" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "刷新失败" });
    }
  }

  async function saveDraft(options?: { testAfterSave?: boolean }) {
    const id = draft.id.trim();
    if (!id) {
      setStatus({ type: "error", message: "模型名为空" });
      return;
    }
    const saved = await saveSettings();
    if (!saved) return;

    setStatus({ type: "loading", message: "保存模型..." });
    try {
      const response = await fetch("/api/models/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          label: draft.label || id,
          capabilities: [draft.capability],
        }),
      });
      const data = await response.json() as {
        ok: boolean;
        modelsCache?: ModelCatalogItem[];
        modelsUpdatedAt?: string;
        textModel?: string;
        imageModel?: string;
        videoModel?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "模型保存失败");
      setModelsCache(data.modelsCache || modelsCache);
      setModelsUpdatedAt(data.modelsUpdatedAt || modelsUpdatedAt);
      setTextModel(data.textModel || textModel);
      setImageModel(data.imageModel || imageModel);
      setVideoModel(data.videoModel || videoModel);
      setEditingId("");
      setDraft(emptyDraft);
      setStatus({ type: "success", message: "模型已保存" });
      if (options?.testAfterSave) await testModel(draft.capability, id);
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "模型保存失败" });
    }
  }

  async function deleteModel(modelId: string) {
    setStatus({ type: "loading", message: "删除模型..." });
    try {
      const response = await fetch("/api/models/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modelId }),
      });
      const data = await response.json() as {
        ok: boolean;
        modelsCache?: ModelCatalogItem[];
        textModel?: string;
        imageModel?: string;
        videoModel?: string;
        modelsUpdatedAt?: string;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error || "删除失败");
      setModelsCache(data.modelsCache || []);
      setTextModel(data.textModel || "");
      setImageModel(data.imageModel || "");
      setVideoModel(data.videoModel || "");
      setModelsUpdatedAt(data.modelsUpdatedAt || "");
      setStatus({ type: "success", message: "已删除" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "删除失败" });
    }
  }

  async function testModel(kind: ModelCapability, model: string) {
    if (!isRunnableModelCapability(kind)) {
      setStatus({ type: "error", message: "该类型暂不支持直接测试" });
      return;
    }
    if (!model.trim()) {
      setStatus({ type: "error", message: "模型名为空" });
      return;
    }
    const saved = await saveSettings();
    if (!saved) return;

    setStatus({ type: "loading", message: `测试 ${model}...` });
    setLastModelTest(null);
    try {
      const response = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, model }),
      });
      const data = await response.json() as ModelTestResponse;
      setLastModelTest(data);
      await reloadSettings();
      setStatus({ type: data.ok ? "success" : "error", message: data.message || "测试完成" });
    } catch {
      setStatus({ type: "error", message: "测试失败" });
    }
  }

  async function testPrimaryImageModel() {
    if (!primaryImageModel) {
      setStatus({ type: "error", message: "还没有图片模型，请先自动检测或手动添加图片模型" });
      return;
    }
    await testModel("image", primaryImageModel.id);
  }

  async function useAsDefault(model: ModelCatalogItem) {
    const next = {
      textModel: model.capabilities.includes("text") ? model.id : textModel,
      imageModel: model.capabilities.includes("image") ? model.id : imageModel,
      videoModel: model.capabilities.includes("video") ? model.id : videoModel,
    };
    setTextModel(next.textModel);
    setImageModel(next.imageModel);
    setVideoModel(next.videoModel);
    await saveSettings(next);
  }

  async function reloadSettings() {
    const response = await fetch("/api/settings");
    const data = await response.json() as SettingsResponse;
    applySettings(data);
  }

  function editModel(model: ModelCatalogItem) {
    setEditingId(model.id);
    setDraft({
      id: model.id,
      label: model.label || model.id,
      capability: model.capabilities[0] || "text",
    });
  }

  return (
    <main className="apple-shell min-h-screen px-4 py-5 text-[#f5f7fb]">
      <section className="mx-auto max-w-[1180px]">
        <header className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="apple-title">API</h1>
            <p className="apple-subtitle mt-1">供应商、密钥、模型</p>
          </div>
          <div className="flex gap-2">
            <button className="apple-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" disabled={isBusy} onClick={() => saveSettings()} type="button">
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存手动配置
            </button>
            <Link className="apple-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/78" href="/">
              <ArrowLeft className="size-4" />
              工作台
            </Link>
          </div>
        </header>

        <StatusBanner status={status} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Panel title="供应商">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {providerPresets.map((provider) => (
                  <button
                    className={`apple-provider-card p-3 text-left ${providerId === provider.id ? "is-active" : ""}`}
                    key={provider.id}
                    onClick={() => selectProvider(provider.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white/88">{provider.shortLabel}</span>
                      <ServerCog className="size-4 text-white/48" />
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/46">{provider.description}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="接入中转站">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="apple-field-label mb-2 flex items-center gap-1.5">
                    <Globe2 className="size-3.5" />
                    中转站地址
                  </span>
                  <input
                    className="apple-input h-10 w-full px-3 text-sm outline-none"
                    value={providerSiteUrl}
                    onChange={(event) => {
                      const nextSiteUrl = event.target.value;
                      const nextProvider = findProviderPreset(inferProviderId(providerId, nextSiteUrl, apiBaseUrl));
                      setProviderSiteUrl(nextSiteUrl);
                      if (!advancedUrl) setApiBaseUrl(inferApiUrl(nextSiteUrl, nextProvider));
                      markConfigDirty();
                    }}
                    placeholder="https://yostoken.top"
                  />
                  <span className="mt-2 block text-xs text-white/42">官网或 API 地址都可以</span>
                </label>
                <label className="block">
                  <span className="apple-field-label mb-2 flex items-center gap-1.5">
                    <KeyRound className="size-3.5" />
                    API Key
                  </span>
                  <input
                    className="apple-input h-10 w-full px-3 text-sm outline-none"
                    placeholder={maskedApiKey ? "留空保留当前 Key" : "sk-..."}
                    type="password"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      markConfigDirty("Key 已修改，需重新检测");
                    }}
                  />
                  <span className="mt-2 block text-xs text-white/42">{maskedApiKey || "未配置"}</span>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="apple-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" disabled={isBusy} onClick={() => detectProvider()} type="button">
                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  自动检测
                </button>
                <button className="apple-button inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white/72" disabled={isBusy} onClick={() => setShowManualConfig((value) => !value)} type="button">
                  <ServerCog className="size-4" />
                  手动高级配置
                </button>
                <button className="apple-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" disabled={isBusy} onClick={() => detectProvider({ save: true })} type="button">
                  <CheckCircle2 className="size-4" />
                  保存并启用
                </button>
              </div>

              <div className={`mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px] ${showManualConfig ? "" : "hidden"}`}>
                <label className="block">
                  <span className="apple-field-label mb-2 block">API URL</span>
                  <input
                    className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                    disabled={!advancedUrl}
                    value={displayedApiBaseUrl}
                    onChange={(event) => {
                      setApiBaseUrl(event.target.value);
                      markConfigDirty();
                    }}
                  />
                </label>
                <label className="mt-7 flex h-10 items-center gap-2 text-sm text-white/64">
                  <input className="size-4 accent-[#7cf0cf]" checked={advancedUrl} onChange={(event) => {
                    setAdvancedUrl(event.target.checked);
                    markConfigDirty();
                  }} type="checkbox" />
                  完整 URL
                </label>
              </div>

              <DetectionSummary result={detectionResult} />
            </Panel>

            {showManualConfig ? (
              <Panel title="接口">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="apple-field-label mb-2 block">接口</span>
                    <select className="apple-select h-10 w-full px-3 text-sm outline-none" value={wireApi} onChange={(event) => setWireApi(event.target.value as ModelWireApi)}>
                      <option value="responses">Responses</option>
                      <option value="chat_completions">Chat Completions</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="apple-field-label mb-2 block">推理</span>
                    <select className="apple-select h-10 w-full px-3 text-sm outline-none" value={modelReasoningEffort} onChange={(event) => setModelReasoningEffort(event.target.value as ModelReasoningEffort)}>
                      {reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                    </select>
                  </label>
                  <label className="mt-7 flex h-10 items-center gap-2 text-sm text-white/64">
                    <input className="size-4 accent-[#7cf0cf]" checked={disableResponseStorage} onChange={(event) => setDisableResponseStorage(event.target.checked)} type="checkbox" />
                    不存储响应
                  </label>
                </div>
              </Panel>
            ) : null}

            {showManualConfig || editingId ? <Panel title={editingId ? "编辑模型" : "手动模型"}>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_120px]">
                <input
                  className="apple-input h-10 w-full px-3 text-sm outline-none"
                  value={draft.id}
                  onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="gpt-5.5"
                />
                <input
                  className="apple-input h-10 w-full px-3 text-sm outline-none"
                  value={draft.label}
                  onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                  placeholder="显示名"
                />
                <select
                  className="apple-select h-10 w-full px-3 text-sm outline-none"
                  value={draft.capability}
                  onChange={(event) => setDraft((current) => ({ ...current, capability: event.target.value as ModelCapability }))}
                >
                  <option value="text">文本</option>
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                </select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="apple-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold" disabled={isBusy} onClick={() => saveDraft({ testAfterSave: true })} type="button">
                  <Plus className="size-4" />
                  添加并测试
                </button>
                <button className="apple-button inline-flex items-center gap-2 px-4 py-2 text-sm text-white/70" disabled={isBusy} onClick={() => saveDraft()} type="button">
                  {editingId ? "更新" : "只添加"}
                </button>
                {editingId ? (
                  <button className="apple-button px-4 py-2 text-sm text-white/70" onClick={() => { setEditingId(""); setDraft(emptyDraft); }} type="button">
                    取消
                  </button>
                ) : null}
              </div>
            </Panel> : null}

            <Panel title="模型">
              <div className="mb-3 flex justify-end">
                <button className="apple-button inline-flex items-center gap-2 px-3 py-2 text-xs text-white/70" disabled={isBusy} onClick={refreshModels} type="button">
                  <RefreshCw className="size-3.5" />
                  刷新
                </button>
              </div>
              <div className="space-y-4">
                <ModelGroup activeModel={textModel} icon={<DatabaseZap className="size-4" />} label="文本" models={groupedModels.text} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("text", model.id)} onUse={useAsDefault} />
                <ModelGroup activeModel={imageModel} icon={<ImageIcon className="size-4" />} label="图片" models={groupedModels.image} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("image", model.id)} onUse={useAsDefault} />
                <ModelGroup activeModel={videoModel} icon={<Film className="size-4" />} label="视频" models={groupedModels.video} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("video", model.id)} onUse={useAsDefault} />
              </div>
            </Panel>
          </div>

          <aside className="space-y-4">
            <SetupChecklist
              hasKey={Boolean(maskedApiKey || apiKey.trim())}
              hasProvider={Boolean(displayedApiBaseUrl)}
              isBusy={isBusy}
              imageModel={primaryImageModel}
              passedImageCount={passedImageModels.length}
              supportsImageGeneration={supportsImageGeneration}
              onDetectAndSave={() => detectProvider({ save: true })}
              onTestImageModel={testPrimaryImageModel}
            />

            <Panel title="状态">
              <div className="space-y-3">
                <StatusRow detail={effectiveProvider.label} label="供应商" state="success" />
                <StatusRow detail={displayedApiBaseUrl || "未填写"} label="请求地址" state={displayedApiBaseUrl ? "success" : "idle"} />
                <StatusRow detail={maskedApiKey || "未配置"} label="Key" state={maskedApiKey ? "success" : "idle"} />
                <StatusRow detail={supportsModelsList ? "支持" : "未确认"} label="模型列表" state={supportsModelsList ? "success" : "idle"} />
                <StatusRow detail={[supportsResponses ? "Responses" : "", supportsChatCompletions ? "Chat" : ""].filter(Boolean).join(" / ") || "未确认"} label="文本接口" state={supportsResponses || supportsChatCompletions ? "success" : "idle"} />
                <StatusRow detail={supportsImageGeneration ? "支持" : "未通过 / 未开通"} label="图片生成" state={supportsImageGeneration ? "success" : "error"} />
                <StatusRow detail={`${passedImageModels.length} 个`} label="首页图片模型" state={passedImageModels.length ? "success" : "idle"} />
              </div>
            </Panel>

            <Panel title="默认">
              <div className="space-y-2 text-sm leading-6 text-white/64">
                <div>文本：{textModel || "未选"}</div>
                <div>图片：{imageModel || "未选"}</div>
                <div>视频：{videoModel || "未选"}</div>
                <div>接口：{wireApi}</div>
                <div className="apple-caption pt-1">{savedAt ? `保存 ${savedAt}` : lastTestedAt ? `检测 ${new Date(lastTestedAt).toLocaleString("zh-CN")}` : modelsUpdatedAt ? `更新 ${new Date(modelsUpdatedAt).toLocaleString("zh-CN")}` : "未保存"}</div>
              </div>
            </Panel>

            <Panel title="测试">
              {lastModelTest ? (
                <ResultLine ok={lastModelTest.ok} text={`${modelKindLabel(lastModelTest.kind)}：${lastModelTest.message}`} />
              ) : (
                <div className="apple-empty-state p-4 text-sm text-white/46">测试通过后才在首页显示</div>
              )}
            </Panel>
          </aside>
        </section>
      </section>
    </main>
  );
}

function StatusBanner({ status }: { status: Status }) {
  return (
    <div
      className={`mb-5 flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm ${
        status.type === "error"
          ? "apple-status-danger"
          : status.type === "success"
            ? "apple-status-success"
            : status.type === "loading"
              ? "apple-status-warning"
              : "apple-status-neutral"
      }`}
    >
      {status.type === "loading" ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <StatusIcon state={status.type === "error" ? "error" : status.type === "success" ? "success" : "idle"} />}
      {status.message}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="apple-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-white/88">{title}</h2>
      {children}
    </section>
  );
}

function SetupChecklist({
  hasKey,
  hasProvider,
  imageModel,
  isBusy,
  onDetectAndSave,
  onTestImageModel,
  passedImageCount,
  supportsImageGeneration,
}: {
  hasKey: boolean;
  hasProvider: boolean;
  imageModel: ModelCatalogItem | null;
  isBusy: boolean;
  onDetectAndSave: () => void;
  onTestImageModel: () => void;
  passedImageCount: number;
  supportsImageGeneration: boolean;
}) {
  const imageReady = passedImageCount > 0;
  return (
    <Panel title="接入流程">
      <div className="space-y-2">
        <ChecklistRow done={hasProvider} label="填写中转站地址" detail={hasProvider ? "已填写请求地址" : "先填官网或 API 地址"} />
        <ChecklistRow done={hasKey} label="配置 API Key" detail={hasKey ? "Key 已保存或本次已输入" : "Key 不会显示明文"} />
        <ChecklistRow done={supportsImageGeneration || imageReady} label="检测并保存配置" detail={supportsImageGeneration ? "图片接口已通过检测" : "自动识别接口和推荐模型"} />
        <ChecklistRow done={imageReady} label="测试图片模型" detail={imageReady ? `${passedImageCount} 个图片模型可用于工作台` : imageModel ? `待测试：${imageModel.label || imageModel.id}` : "还没有图片模型"} />
      </div>
      <div className="mt-3 grid gap-2">
        <button
          className="apple-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={isBusy || !hasKey || !hasProvider}
          onClick={onDetectAndSave}
          type="button"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          检测并保存
        </button>
        <button
          className="apple-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white/74 disabled:opacity-50"
          disabled={isBusy || !imageModel}
          onClick={onTestImageModel}
          type="button"
        >
          <ImageIcon className="size-4" />
          测试图片模型
        </button>
        <Link className={`apple-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold ${imageReady ? "text-[#adf8e5]" : "text-white/52"}`} href="/">
          <ArrowLeft className="size-4" />
          返回工作台
        </Link>
      </div>
    </Panel>
  );
}

function ChecklistRow({ detail, done, label }: { detail: string; done: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-2">
      <StatusIcon state={done ? "success" : "idle"} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/78">{label}</div>
        <div className="mt-0.5 truncate text-xs text-white/42">{detail}</div>
      </div>
    </div>
  );
}

function DetectionSummary({ result }: { result: DetectionResult | null }) {
  if (!result) {
    return (
      <div className="apple-empty-state mt-4 p-4 text-sm text-white/46">
        输入地址和 Key 后自动检测，成功模型会保存为可切换模型。
      </div>
    );
  }

  return (
    <section className="apple-surface-section mt-4 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/86">{result.ok ? "检测通过" : "需要处理"}</div>
          <div className="apple-caption mt-1">{result.message}</div>
        </div>
        <StatusIcon state={result.ok ? "success" : "error"} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <MiniMetric label="可用地址" value={result.apiBaseUrl || "未确认"} ok={Boolean(result.apiBaseUrl && result.ok)} />
        <MiniMetric label="Key" value={result.apiKeyStatus === "valid" ? "可用" : result.apiKeyStatus === "invalid" ? "无效" : "未知"} ok={result.apiKeyStatus === "valid"} />
        <MiniMetric label="接口" value={[result.supportsResponses ? "Responses" : "", result.supportsChatCompletions ? "Chat" : ""].filter(Boolean).join(" / ") || "未通过"} ok={result.supportsResponses || result.supportsChatCompletions} />
        <MiniMetric label="模型列表" value={result.supportsModelsList ? "支持" : "不支持"} ok={result.supportsModelsList} />
        <MiniMetric label="文本模型" value={result.textModel || result.recommended.textModel || "手动填写"} ok={Boolean(result.textModel)} />
        <MiniMetric label="图片生成" value={result.supportsImageGeneration ? result.imageModel || "支持" : "未通过"} ok={result.supportsImageGeneration} />
      </div>
      {result.models?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.models.slice(0, 12).map((model) => (
            <span className={model.testStatus === "passed" ? "apple-pill-accent px-2 py-1 text-[10px]" : "apple-pill px-2 py-1 text-[10px]"} key={model.id}>
              {model.id}
            </span>
          ))}
          {result.models.length > 12 ? <span className="apple-pill px-2 py-1 text-[10px]">+{result.models.length - 12}</span> : null}
        </div>
      ) : null}
      {result.issues?.length ? (
        <div className="mt-3 space-y-2">
          {result.issues.slice(0, 4).map((item, index) => (
            <DiagnosisItem issue={item} key={`${item.step}-${index}-${item.requestUrl}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MiniMetric({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.05] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/42">{label}</span>
        <StatusIcon state={ok ? "success" : "idle"} />
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-white/78">{value}</div>
    </div>
  );
}

function DiagnosisItem({ issue }: { issue: DetectionIssue }) {
  return (
    <div className="rounded-[12px] border border-[#ff8b80]/20 bg-[#ff453a]/10 p-3 text-xs leading-5 text-white/64">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#ffb4a8]">{stepLabel(issue.step)}</span>
        {issue.status ? <span className="apple-pill px-2 py-0.5 text-[10px]">HTTP {issue.status}</span> : null}
      </div>
      <div className="mt-1 break-words text-white/52">{issue.requestUrl || "未发起请求"}</div>
      <div className="mt-1 text-white/72">{issue.message}</div>
      {issue.possibleCauses?.length ? <div className="mt-1">可能：{issue.possibleCauses.slice(0, 3).join(" / ")}</div> : null}
      {issue.suggestions?.length ? <div className="mt-1">建议：{issue.suggestions.slice(0, 2).join(" ")}</div> : null}
    </div>
  );
}

function ModelGroup({
  activeModel,
  icon,
  label,
  models,
  onDelete,
  onEdit,
  onTest,
  onUse,
}: {
  activeModel: string;
  icon: React.ReactNode;
  label: string;
  models: ModelCatalogItem[];
  onDelete: (modelId: string) => void;
  onEdit: (model: ModelCatalogItem) => void;
  onTest: (model: ModelCatalogItem) => void;
  onUse: (model: ModelCatalogItem) => void;
}) {
  return (
    <section className="apple-surface-section p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="apple-icon-bubble size-8">{icon}</span>
        <div>
          <div className="text-sm font-semibold text-white/86">{label}</div>
          <div className="apple-caption">{models.length} 个模型</div>
        </div>
      </div>
      <div className="space-y-2">
        {models.map((model) => (
          <div className="rounded-[12px] border border-white/10 bg-white/[0.05] p-3" key={`${label}-${model.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white/84">{model.label || model.id}</span>
                  {activeModel === model.id ? <span className="apple-pill-accent px-2 py-0.5 text-[10px]">默认</span> : null}
                </div>
                <div className="apple-caption mt-1 truncate">{model.id}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ModelStatus model={model} />
                  {model.lastTestedAt ? <span className="apple-pill px-2 py-0.5 text-[10px]">{new Date(model.lastTestedAt).toLocaleString("zh-CN")}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <button className="apple-button px-2.5 py-1.5 text-[11px]" onClick={() => onTest(model)} type="button">测试</button>
                <button className="apple-button px-2.5 py-1.5 text-[11px]" onClick={() => onUse(model)} type="button">使用</button>
                <button className="apple-button px-2.5 py-1.5 text-[11px]" onClick={() => onEdit(model)} type="button">编辑</button>
                <button className="apple-button-danger flex items-center gap-1 px-2.5 py-1.5 text-[11px]" onClick={() => onDelete(model.id)} type="button">
                  <Trash2 className="size-3" />
                  删
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

function ModelStatus({ model }: { model: ModelCatalogItem }) {
  if (model.testStatus === "passed") return <span className="apple-status-success rounded-full border px-2 py-0.5 text-[10px]">可用</span>;
  if (model.testStatus === "failed") return <span className="apple-status-danger rounded-full border px-2 py-0.5 text-[10px]">失败</span>;
  return <span className="apple-status-neutral rounded-full border px-2 py-0.5 text-[10px]">未测</span>;
}

function StatusRow({ detail, label, state }: { detail: string; label: string; state: "idle" | "success" | "error" }) {
  return (
    <div className="apple-surface-section flex items-start gap-3 p-3">
      <StatusIcon state={state} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/84">{label}</div>
        <div className="mt-1 break-words text-xs leading-5 text-white/44">{detail}</div>
      </div>
    </div>
  );
}

function ResultLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="apple-surface-section flex items-start gap-3 p-3 text-sm">
      <StatusIcon state={ok ? "success" : "error"} />
      <span className="leading-5 text-white/70">{text}</span>
    </div>
  );
}

function StatusIcon({ state }: { state: "idle" | "success" | "error" }) {
  if (state === "success") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7cf0cf]" />;
  if (state === "error") return <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#ff8b80]" />;
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-[#7b8797]" />;
}

function modelsFor(capability: ModelCapability, models: ModelCatalogItem[]) {
  return models.filter((model) => model.capabilities.includes(capability));
}

function modelKindLabel(kind: ModelCapability) {
  if (kind === "image") return "图片模型";
  if (kind === "video") return "视频模型";
  if (kind === "embedding") return "Embedding";
  if (kind === "unknown") return "未知模型";
  return "文本模型";
}

function stepLabel(step: string) {
  if (step === "models") return "模型列表";
  if (step === "responses") return "Responses";
  if (step === "chat_completions") return "Chat";
  if (step === "images") return "图片";
  if (step === "address") return "地址";
  return "诊断";
}

function isRunnableModelCapability(kind: ModelCapability): kind is "text" | "image" | "video" {
  return kind === "text" || kind === "image" || kind === "video";
}

function inferApiUrl(siteUrl: string, provider: ReturnType<typeof findProviderPreset>) {
  const value = siteUrl.trim().replace(/\/+$/, "") || provider.apiBaseUrl || "";
  if (!value) return "";
  if (/\/(v1|v1beta\/openai)$/i.test(value)) return value;
  if (provider.id === "gemini" && /generativelanguage\.googleapis\.com$/i.test(value)) return `${value}/v1beta/openai`;
  if (provider.compatibility === "custom-openai") return `${value}/v1`;
  return value;
}

function normalizeApiUrl(value: string, provider: ReturnType<typeof findProviderPreset>) {
  return inferApiUrl(value, provider);
}

function inferProviderId(providerId: string, providerSiteUrl: string, apiBaseUrl: string) {
  const value = `${providerSiteUrl} ${apiBaseUrl}`;
  if (/yostoken|ccswitch|ccs/i.test(value)) return "ccs";
  if (/openrouter\.ai/i.test(value)) return "openrouter";
  if (/generativelanguage\.googleapis\.com/i.test(value)) return "gemini";
  if (/api\.openai\.com|platform\.openai\.com/i.test(value)) return "openai";
  return providerId || customProvider.id;
}

function siteFromUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}
