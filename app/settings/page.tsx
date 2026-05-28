"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
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
import {
  SettingsMiniMetric,
  SettingsPanel,
  SettingsResultLine,
  SettingsStatusBanner,
  SettingsStatusIcon,
  SettingsStatusRow,
} from "@/components/settings/settings-status-ui";

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
  accountConfigScope?: "owner" | "user";
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

type HealthResponse = {
  ok?: boolean;
  hasKey?: boolean;
  diagnostics?: {
    nodeVersion?: string;
    platform?: string;
    runtime?: string;
    serverTime?: string;
  };
  message?: string;
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

function settingsRequestFailure(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : "";
  return detail ? `${action}：${detail}` : action;
}

async function readSettingsJson<T>(response: Response): Promise<T & { error?: string; message?: string }> {
  return await response.json().catch(() => ({})) as T & { error?: string; message?: string };
}

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
  const [serverHealth, setServerHealth] = useState<HealthResponse | null>(null);
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
  const nodeRuntime = useMemo(() => nodeRuntimeStatus(serverHealth?.diagnostics?.nodeVersion), [serverHealth?.diagnostics?.nodeVersion]);
  const normalizedProviderId = useMemo(() => inferProviderId(providerId, providerSiteUrl, apiBaseUrl), [apiBaseUrl, providerId, providerSiteUrl]);
  const effectiveProvider = useMemo(() => findProviderPreset(normalizedProviderId), [normalizedProviderId]);
  const suggestedImageModels = useMemo(() => {
    const existing = new Set(groupedModels.image.map((model) => model.id));
    const providerImages = (effectiveProvider.models as unknown as ModelCatalogItem[]).filter((model) => model.capabilities.includes("image"));
    const fallbackImages: ModelCatalogItem[] = [
      { id: "gpt-image-2", label: "gpt-image-2", capabilities: ["image"], description: "优先尝试，适合高清生图、改图和画质增强。" },
      { id: "gpt-image-1", label: "gpt-image-1", capabilities: ["image"], description: "兼容性更稳，适合常规生图和改图。" },
    ];
    return [...providerImages, ...fallbackImages]
      .filter((model, index, list) => list.findIndex((item) => item.id === model.id) === index)
      .filter((model) => !existing.has(model.id))
      .slice(0, 3);
  }, [effectiveProvider.models, groupedModels.image]);
  const generatedBaseUrl = useMemo(() => inferApiUrl(providerSiteUrl || apiBaseUrl, effectiveProvider), [apiBaseUrl, effectiveProvider, providerSiteUrl]);
  const displayedApiBaseUrl = advancedUrl ? normalizeApiUrl(apiBaseUrl, effectiveProvider) : generatedBaseUrl;

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => readSettingsJson<SettingsResponse>(response))
      .then((data: SettingsResponse) => applySettings(data))
      .catch((error) => setStatus({ type: "error", message: settingsRequestFailure("读取配置失败", error) }));
    void reloadServerHealth();
  }, []);

  async function reloadServerHealth() {
    try {
      const response = await fetch("/api/health-openai");
      const data = await readSettingsJson<HealthResponse>(response);
      setServerHealth(data);
    } catch {
      setServerHealth({
        ok: false,
        message: "服务诊断读取失败",
      });
    }
  }

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
          modelsCache: overrides?.modelsCache ?? modelsCache,
          supportsModelsList,
          supportsResponses,
          supportsChatCompletions,
          supportsImageGeneration,
        }),
      });
      const data = await readSettingsJson<SettingsResponse>(response);
      if (!response.ok) {
        setStatus({ type: "error", message: data.error || "保存失败" });
        return false;
      }
      setApiKey("");
      applySettings(data as SettingsResponse);
      if (overrides?.modelsCache) setModelsCache(overrides.modelsCache);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      setStatus({ type: "success", message: "已保存" });
      void reloadServerHealth();
      return true;
    } catch (error) {
      setStatus({ type: "error", message: settingsRequestFailure("保存配置失败", error) });
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
      const data = await readSettingsJson<DetectionResult>(response);
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
      setStatus({ type: response.ok && data.ok ? "success" : "error", message: data.message || data.error || (response.ok ? "检测完成" : "检测失败") });
    } catch (error) {
      setStatus({ type: "error", message: settingsRequestFailure("检测失败", error) });
    }
  }

  async function refreshModels() {
    const saved = await saveSettings();
    if (!saved) return;
    setStatus({ type: "loading", message: "刷新模型..." });
    try {
      const response = await fetch("/api/models/refresh", { method: "POST" });
      const data = await readSettingsJson<{ ok: boolean; models?: ModelCatalogItem[]; modelsUpdatedAt?: string }>(response);
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
      const data = await readSettingsJson<{
        ok: boolean;
        modelsCache?: ModelCatalogItem[];
        modelsUpdatedAt?: string;
        textModel?: string;
        imageModel?: string;
        videoModel?: string;
      }>(response);
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
      const data = await readSettingsJson<{
        ok: boolean;
        modelsCache?: ModelCatalogItem[];
        textModel?: string;
        imageModel?: string;
        videoModel?: string;
        modelsUpdatedAt?: string;
      }>(response);
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
      const data = await readSettingsJson<ModelTestResponse>(response);
      setLastModelTest(data);
      await reloadSettings();
      void reloadServerHealth();
      setStatus({ type: data.ok ? "success" : "error", message: data.message || "测试完成" });
    } catch (error) {
      setStatus({ type: "error", message: settingsRequestFailure("测试失败", error) });
    }
  }

  async function testPrimaryImageModel() {
    if (!primaryImageModel) {
      setStatus({ type: "error", message: "还没有图片模型，请先自动检测或手动添加图片模型" });
      return;
    }
    await testModel("image", primaryImageModel.id);
  }

  async function addSuggestedImageModel(model: ModelCatalogItem) {
    const saved = await saveSettings();
    if (!saved) return;
    setStatus({ type: "loading", message: `添加图片模型 ${model.id}...` });
    try {
      const response = await fetch("/api/models/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          label: model.label || model.id,
          capabilities: ["image"],
        }),
      });
      const data = await readSettingsJson<{
        ok: boolean;
        modelsCache?: ModelCatalogItem[];
        modelsUpdatedAt?: string;
        imageModel?: string;
      }>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "添加图片模型失败");
      setModelsCache(data.modelsCache || modelsCache);
      setModelsUpdatedAt(data.modelsUpdatedAt || modelsUpdatedAt);
      setImageModel(data.imageModel || imageModel || model.id);
      setStatus({ type: "success", message: `已添加 ${model.id}，请点击“测试图片模型”。` });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "添加图片模型失败" });
    }
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
    const data = await readSettingsJson<SettingsResponse>(response);
    if (!response.ok) throw new Error(data.error || data.message || "读取配置失败");
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
            <p className="apple-subtitle mt-1">供应商、密钥、模型；配置只保存到当前登录账号。</p>
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

        <SettingsStatusBanner status={status} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <SettingsPanel title="供应商">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {providerPresets.map((provider) => (
                  <button
                    className={`apple-provider-card p-3 text-left disabled:cursor-not-allowed disabled:opacity-55 ${providerId === provider.id ? "is-active" : ""}`}
                    disabled={isBusy}
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
            </SettingsPanel>

            <SettingsPanel title="接入中转站">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="apple-field-label mb-2 flex items-center gap-1.5">
                    <Globe2 className="size-3.5" />
                    中转站地址
                  </span>
                  <input
                    className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                    disabled={isBusy}
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
                    className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                    disabled={isBusy}
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
                    disabled={isBusy || !advancedUrl}
                    value={displayedApiBaseUrl}
                    onChange={(event) => {
                      setApiBaseUrl(event.target.value);
                      markConfigDirty();
                    }}
                  />
                </label>
                <label className="mt-7 flex h-10 items-center gap-2 text-sm text-white/64">
                  <input className="size-4 accent-[#7cf0cf] disabled:opacity-60" checked={advancedUrl} disabled={isBusy} onChange={(event) => {
                    setAdvancedUrl(event.target.checked);
                    markConfigDirty();
                  }} type="checkbox" />
                  完整 URL
                </label>
              </div>

              <DetectionSummary result={detectionResult} />
            </SettingsPanel>

            {showManualConfig ? (
              <SettingsPanel title="接口">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="apple-field-label mb-2 block">接口</span>
                    <select className="apple-select h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={isBusy} value={wireApi} onChange={(event) => setWireApi(event.target.value as ModelWireApi)}>
                      <option value="responses">Responses</option>
                      <option value="chat_completions">Chat Completions</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="apple-field-label mb-2 block">推理</span>
                    <select className="apple-select h-10 w-full px-3 text-sm outline-none disabled:opacity-60" disabled={isBusy} value={modelReasoningEffort} onChange={(event) => setModelReasoningEffort(event.target.value as ModelReasoningEffort)}>
                      {reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                    </select>
                  </label>
                  <label className="mt-7 flex h-10 items-center gap-2 text-sm text-white/64">
                    <input className="size-4 accent-[#7cf0cf] disabled:opacity-60" checked={disableResponseStorage} disabled={isBusy} onChange={(event) => setDisableResponseStorage(event.target.checked)} type="checkbox" />
                    不存储响应
                  </label>
                </div>
              </SettingsPanel>
            ) : null}

            {showManualConfig || editingId ? <SettingsPanel title={editingId ? "编辑模型" : "手动模型"}>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_120px]">
                <input
                  className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                  disabled={isBusy}
                  value={draft.id}
                  onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="gpt-5.5"
                />
                <input
                  className="apple-input h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                  disabled={isBusy}
                  value={draft.label}
                  onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                  placeholder="显示名"
                />
                <select
                  className="apple-select h-10 w-full px-3 text-sm outline-none disabled:opacity-60"
                  disabled={isBusy}
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
                  <button className="apple-button px-4 py-2 text-sm text-white/70" disabled={isBusy} onClick={() => { setEditingId(""); setDraft(emptyDraft); }} type="button">
                    取消
                  </button>
                ) : null}
              </div>
            </SettingsPanel> : null}

            <SettingsPanel title="模型">
              <div className="mb-3 flex justify-end">
                <button className="apple-button inline-flex items-center gap-2 px-3 py-2 text-xs text-white/70" disabled={isBusy} onClick={refreshModels} type="button">
                  <RefreshCw className="size-3.5" />
                  刷新
                </button>
              </div>
              <div className="space-y-4">
                <ModelGroup activeModel={textModel} icon={<DatabaseZap className="size-4" />} isBusy={isBusy} label="文本" models={groupedModels.text} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("text", model.id)} onUse={useAsDefault} />
                <ModelGroup activeModel={imageModel} icon={<ImageIcon className="size-4" />} isBusy={isBusy} label="图片" models={groupedModels.image} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("image", model.id)} onUse={useAsDefault} />
                <ModelGroup activeModel={videoModel} icon={<Film className="size-4" />} isBusy={isBusy} label="视频" models={groupedModels.video} onDelete={deleteModel} onEdit={editModel} onTest={(model) => testModel("video", model.id)} onUse={useAsDefault} />
              </div>
            </SettingsPanel>
          </div>

          <aside className="space-y-4">
            <SetupChecklist
              hasKey={Boolean(maskedApiKey || apiKey.trim())}
              hasProvider={Boolean(displayedApiBaseUrl)}
              isBusy={isBusy}
              imageModel={primaryImageModel}
              passedImageCount={passedImageModels.length}
              supportsImageGeneration={supportsImageGeneration}
              suggestedImageModels={suggestedImageModels}
              onAddSuggestedImageModel={addSuggestedImageModel}
              onDetectAndSave={() => detectProvider({ save: true })}
              onTestImageModel={testPrimaryImageModel}
            />

            <SettingsPanel title="状态">
              <div className="space-y-3">
                <SettingsStatusRow detail={effectiveProvider.label} label="供应商" state="success" />
                <SettingsStatusRow detail={displayedApiBaseUrl || "未填写"} label="请求地址" state={displayedApiBaseUrl ? "success" : "idle"} />
                <SettingsStatusRow detail={healthKeyLabel(serverHealth, maskedApiKey)} label="Key" state={serverHealth?.hasKey || maskedApiKey ? "success" : "idle"} />
                <SettingsStatusRow detail={supportsModelsList ? "支持" : "未确认"} label="模型列表" state={supportsModelsList ? "success" : "idle"} />
                <SettingsStatusRow detail={[supportsResponses ? "Responses" : "", supportsChatCompletions ? "Chat" : ""].filter(Boolean).join(" / ") || "未确认"} label="文本接口" state={supportsResponses || supportsChatCompletions ? "success" : "idle"} />
                <SettingsStatusRow detail={supportsImageGeneration ? "支持" : "未通过 / 未开通"} label="图片生成" state={supportsImageGeneration ? "success" : "error"} />
                <SettingsStatusRow detail={`${passedImageModels.length} 个`} label="首页图片模型" state={passedImageModels.length ? "success" : "idle"} />
              </div>
            </SettingsPanel>

            <SettingsPanel title="服务器">
              <div className="space-y-3">
                <SettingsStatusRow detail={nodeRuntime.detail} label="Node" state={nodeRuntime.state} />
                <SettingsStatusRow detail={serverHealth?.diagnostics?.runtime || "未读取"} label="运行时" state={serverHealth?.diagnostics?.runtime ? "success" : "idle"} />
                <SettingsStatusRow detail={serverHealth?.diagnostics?.platform || "未读取"} label="平台" state={serverHealth?.diagnostics?.platform ? "success" : "idle"} />
                <SettingsStatusRow detail={formatServerTime(serverHealth?.diagnostics?.serverTime)} label="服务时间" state={serverHealth?.diagnostics?.serverTime ? "success" : "idle"} />
              </div>
              {serverHealth?.message ? <div className="apple-caption mt-3 rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-2 text-white/44">{serverHealth.message}</div> : null}
              <button className="apple-button mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-xs text-white/70" disabled={isBusy} onClick={reloadServerHealth} type="button">
                <RefreshCw className="size-3.5" />
                刷新服务器诊断
              </button>
            </SettingsPanel>

            <SettingsPanel title="默认">
              <div className="space-y-2 text-sm leading-6 text-white/64">
                <div>文本：{textModel || "未选"}</div>
                <div>图片：{imageModel || "未选"}</div>
                <div>视频：{videoModel || "未选"}</div>
                <div>接口：{wireApi}</div>
                <div className="apple-caption pt-1">{savedAt ? `保存 ${savedAt}` : lastTestedAt ? `检测 ${new Date(lastTestedAt).toLocaleString("zh-CN")}` : modelsUpdatedAt ? `更新 ${new Date(modelsUpdatedAt).toLocaleString("zh-CN")}` : "未保存"}</div>
              </div>
            </SettingsPanel>

            <SettingsPanel title="测试">
              {lastModelTest ? (
                <SettingsResultLine ok={lastModelTest.ok} text={`${modelKindLabel(lastModelTest.kind)}：${lastModelTest.message}`} />
              ) : (
                <div className="apple-empty-state p-4 text-sm text-white/46">测试通过后才在首页显示</div>
              )}
            </SettingsPanel>
          </aside>
        </section>
      </section>
    </main>
  );
}

function SetupChecklist({
  hasKey,
  hasProvider,
  imageModel,
  isBusy,
  onAddSuggestedImageModel,
  onDetectAndSave,
  onTestImageModel,
  passedImageCount,
  suggestedImageModels,
  supportsImageGeneration,
}: {
  hasKey: boolean;
  hasProvider: boolean;
  imageModel: ModelCatalogItem | null;
  isBusy: boolean;
  onAddSuggestedImageModel: (model: ModelCatalogItem) => void;
  onDetectAndSave: () => void;
  onTestImageModel: () => void;
  passedImageCount: number;
  suggestedImageModels: ModelCatalogItem[];
  supportsImageGeneration: boolean;
}) {
  const imageReady = passedImageCount > 0;
  return (
    <SettingsPanel title="接入流程">
      <div className="space-y-2">
        <ChecklistRow done={hasProvider} label="填写中转站地址" detail={hasProvider ? "已填写请求地址" : "先填官网或 API 地址"} />
        <ChecklistRow done={hasKey} label="配置 API Key" detail={hasKey ? "Key 已保存或本次已输入" : "Key 不会显示明文"} />
        <ChecklistRow done={supportsImageGeneration || imageReady} label="检测并保存配置" detail={supportsImageGeneration ? "图片接口已通过检测" : "自动识别接口和推荐模型"} />
        <ChecklistRow done={imageReady} label="测试图片模型" detail={imageReady ? `${passedImageCount} 个图片模型可用于工作台` : imageModel ? `待测试：${imageModel.label || imageModel.id}` : "还没有图片模型"} />
      </div>
      {!imageReady && suggestedImageModels.length ? (
        <div className="mt-3 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 p-3">
          <div className="text-xs font-semibold text-[#ffe1a3]">缺少图片模型时可先添加推荐项</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestedImageModels.map((model) => (
              <button
                className="apple-button px-2.5 py-1.5 text-[11px] text-white/72 disabled:opacity-50"
                disabled={isBusy}
                key={model.id}
                onClick={() => onAddSuggestedImageModel(model)}
                type="button"
              >
                添加 {model.label || model.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
    </SettingsPanel>
  );
}

function ChecklistRow({ detail, done, label }: { detail: string; done: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-2">
      <SettingsStatusIcon state={done ? "success" : "idle"} />
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
        <SettingsStatusIcon state={result.ok ? "success" : "error"} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <SettingsMiniMetric label="可用地址" value={result.apiBaseUrl || "未确认"} ok={Boolean(result.apiBaseUrl && result.ok)} />
        <SettingsMiniMetric label="Key" value={result.apiKeyStatus === "valid" ? "可用" : result.apiKeyStatus === "invalid" ? "无效" : "未知"} ok={result.apiKeyStatus === "valid"} />
        <SettingsMiniMetric label="接口" value={[result.supportsResponses ? "Responses" : "", result.supportsChatCompletions ? "Chat" : ""].filter(Boolean).join(" / ") || "未通过"} ok={result.supportsResponses || result.supportsChatCompletions} />
        <SettingsMiniMetric label="模型列表" value={result.supportsModelsList ? "支持" : "不支持"} ok={result.supportsModelsList} />
        <SettingsMiniMetric label="文本模型" value={result.textModel || result.recommended.textModel || "手动填写"} ok={Boolean(result.textModel)} />
        <SettingsMiniMetric label="图片生成" value={result.supportsImageGeneration ? result.imageModel || "支持" : "未通过"} ok={result.supportsImageGeneration} />
      </div>
      {result.models?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.models.slice(0, 12).map((model) => (
            <span className={model.testStatus === "passed" ? "apple-pill-accent px-2 py-1 text-[11px]" : "apple-pill px-2 py-1 text-[11px]"} key={model.id}>
              {model.id}
            </span>
          ))}
          {result.models.length > 12 ? <span className="apple-pill px-2 py-1 text-[11px]">+{result.models.length - 12}</span> : null}
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

function DiagnosisItem({ issue }: { issue: DetectionIssue }) {
  return (
    <div className="rounded-[12px] border border-[#ff8b80]/20 bg-[#ff453a]/10 p-3 text-xs leading-5 text-white/64">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#ffb4a8]">{stepLabel(issue.step)}</span>
        {issue.status ? <span className="apple-pill px-2 py-0.5 text-[11px]">HTTP {issue.status}</span> : null}
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
  isBusy,
  label,
  models,
  onDelete,
  onEdit,
  onTest,
  onUse,
}: {
  activeModel: string;
  icon: React.ReactNode;
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
                  {activeModel === model.id ? <span className="apple-pill-accent px-2 py-0.5 text-[11px]">默认</span> : null}
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
                  {activeModelAction === `删除:${model.id}` ? "删除中" : confirmDeleteId === model.id ? "确认删" : "删"}
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
  if (model.testStatus === "passed") return <span className="apple-status-success rounded-full border px-2 py-0.5 text-[11px]">可用</span>;
  if (model.testStatus === "failed") return <span className="apple-status-danger rounded-full border px-2 py-0.5 text-[11px]">失败</span>;
  return <span className="apple-status-neutral rounded-full border px-2 py-0.5 text-[11px]">未测</span>;
}

function healthKeyLabel(health: HealthResponse | null, maskedApiKey: string) {
  if (health?.hasKey) return maskedApiKey || "服务端已配置";
  if (health && health.hasKey === false) return "服务端未检测到 Key";
  return maskedApiKey || "未读取";
}

function formatServerTime(value?: string) {
  if (!value) return "未读取";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function nodeRuntimeStatus(version?: string): { detail: string; state: "idle" | "success" | "error" } {
  if (!version) return { detail: "未读取", state: "idle" };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  const supported = major > 20 || (major === 20 && minor >= 9);
  return {
    detail: supported ? `v${version} · 已满足 >=20.9` : `v${version} · 需升级到 >=20.9`,
    state: supported ? "success" : "error",
  };
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
