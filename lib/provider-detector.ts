import "server-only";

import { ProxyAgent, setGlobalDispatcher } from "undici";
import { maskApiKey, normalizeBaseUrl, normalizeSiteUrl, saveLocalConfig } from "./local-config";
import { findProviderPreset, inferModelCapabilities, type ModelCapability, type ModelCatalogItem, type ModelWireApi } from "./openai-defaults";

type ProbeStep = "models" | "responses" | "chat_completions" | "images";

export type ProviderDetectionIssue = {
  step: ProbeStep | "address" | "save";
  requestUrl: string;
  status?: number;
  message: string;
  possibleCauses: string[];
  suggestions: string[];
};

export type ProviderDetectionResult = {
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
  modelGroups: Record<ModelCapability, ModelCatalogItem[]>;
  recommended: {
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  issues: ProviderDetectionIssue[];
  testedUrls: string[];
  message: string;
};

type DetectorInput = {
  websiteUrl?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  providerName?: string;
  save?: boolean;
  manual?: Partial<{
    wireApi: ModelWireApi;
    textModel: string;
    imageModel: string;
    videoModel: string;
  }>;
};

type ProbeResponse = {
  ok: boolean;
  status?: number;
  data?: unknown;
  message: string;
};

const textTimeoutMs = 18_000;
const imageTimeoutMs = 28_000;
let globalProxyUrl = "";

export async function detectProvider(input: DetectorInput): Promise<ProviderDetectionResult> {
  configureGlobalProxy();

  const startedAt = new Date().toISOString();
  const rawAddress = (input.apiBaseUrl || input.websiteUrl || "").trim();
  const apiKey = input.apiKey?.trim() || "";
  const websiteUrl = normalizeSiteUrl(input.websiteUrl || siteFromUrl(rawAddress) || rawAddress);
  const providerId = inferProviderId(rawAddress || websiteUrl);
  const provider = findProviderPreset(providerId);
  const providerName = input.providerName?.trim() || (providerId === "custom" ? "自定义中转" : provider.label);
  const candidates = buildBaseUrlCandidates(rawAddress || websiteUrl, providerId);
  const issues: ProviderDetectionIssue[] = [];

  if (!rawAddress) {
    return emptyDetection({
      apiBaseUrl: "",
      apiKeyStatus: "unknown",
      issues: [issue("address", "", undefined, "缺少中转站地址。")],
      lastTestedAt: startedAt,
      message: "请填写中转站网站或 API 地址。",
      providerId,
      providerName,
      testedUrls: [],
      websiteUrl,
    });
  }

  if (!apiKey) {
    return emptyDetection({
      apiBaseUrl: candidates[0] || "",
      apiKeyStatus: "unknown",
      issues: [issue("address", candidates[0] || rawAddress, undefined, "缺少 API Key。")],
      lastTestedAt: startedAt,
      message: "请填写 API Key 后再检测。",
      providerId,
      providerName,
      testedUrls: candidates,
      websiteUrl,
    });
  }

  let bestBaseUrl = candidates[0] || "";
  let modelsProbe: ProbeResponse | null = null;
  let remoteModels: ModelCatalogItem[] = [];
  let supportsModelsList = false;
  let apiKeyStatus: ProviderDetectionResult["apiKeyStatus"] = "unknown";

  for (const baseUrl of candidates) {
    const requestUrl = joinUrl(baseUrl, "models");
    const probe = await requestJson(requestUrl, { method: "GET", apiKey, timeoutMs: textTimeoutMs });
    if (probe.ok) {
      bestBaseUrl = baseUrl;
      modelsProbe = probe;
      remoteModels = extractModels(probe.data);
      supportsModelsList = true;
      apiKeyStatus = "valid";
      break;
    }
    issues.push(issue("models", requestUrl, probe.status, probe.message));
    if (isAuthStatus(probe.status)) apiKeyStatus = "invalid";
  }

  if (!modelsProbe && apiKeyStatus !== "invalid") {
    bestBaseUrl = candidates[0] || "";
  }

  const modelPool = remoteModels.length
    ? remoteModels
    : mergeModels([
      ...provider.models,
      ...manualModelItems(input.manual),
    ]);
  const recommendedBeforeTests = recommendModels(modelPool, provider);

  const textCandidates = uniqueStrings([
    input.manual?.textModel,
    recommendedBeforeTests.textModel,
    provider.textModel,
    "gpt-5.5",
    "gpt-5-mini",
    "gpt-4o-mini",
    "gpt-3.5-turbo",
  ]).filter(Boolean);
  const textProbeResult = await probeTextCandidates(modelsProbe ? [bestBaseUrl, ...candidates] : candidates, apiKey, textCandidates, input.manual?.wireApi, issues);
  if (textProbeResult.baseUrl) bestBaseUrl = textProbeResult.baseUrl;

  if (textProbeResult.supportsResponses || textProbeResult.supportsChatCompletions) {
    apiKeyStatus = "valid";
  }

  const imageCandidates = uniqueStrings([
    input.manual?.imageModel,
    "gpt-image-2",
    recommendedBeforeTests.imageModel,
    provider.imageModel,
    "gpt-image-1",
    "gpt-image-1.5",
    "dall-e-3",
  ]).filter(Boolean);
  const imageProbeResult = await probeImageGeneration(bestBaseUrl, apiKey, imageCandidates, issues);

  const passedModels = buildPassedModels({
    baseModels: modelPool,
    textModel: textProbeResult.textModel,
    imageModel: imageProbeResult.imageModel,
    videoModel: input.manual?.videoModel || recommendedBeforeTests.videoModel,
    supportsImageGeneration: imageProbeResult.supportsImageGeneration,
    testedAt: startedAt,
    wireApi: textProbeResult.wireApi,
  });
  const grouped = groupModels(passedModels.length ? passedModels : modelPool);
  const recommended = recommendModels(passedModels.length ? passedModels : modelPool, provider);
  const wireApi = input.manual?.wireApi || textProbeResult.wireApi;
  const ok = Boolean(textProbeResult.textModel && (textProbeResult.supportsResponses || textProbeResult.supportsChatCompletions));
  const result: ProviderDetectionResult = {
    ok,
    saved: false,
    providerName,
    providerId,
    websiteUrl,
    apiBaseUrl: bestBaseUrl,
    apiKeyStatus: apiKeyStatus === "unknown" && ok ? "valid" : apiKeyStatus,
    wireApi,
    textModel: textProbeResult.textModel || input.manual?.textModel || recommended.textModel,
    imageModel: imageProbeResult.imageModel || input.manual?.imageModel || "",
    videoModel: input.manual?.videoModel || recommended.videoModel,
    supportsModelsList,
    supportsResponses: textProbeResult.supportsResponses,
    supportsChatCompletions: textProbeResult.supportsChatCompletions,
    supportsImageGeneration: imageProbeResult.supportsImageGeneration,
    lastTestedAt: startedAt,
    models: passedModels.length ? passedModels : modelPool,
    modelGroups: grouped,
    recommended,
    issues,
    testedUrls: candidates,
    message: ok
      ? `检测完成：${wireApi === "responses" ? "Responses" : "Chat Completions"} 可用。`
      : "检测未通过，请查看诊断并按建议手动配置。",
  };

  if (input.save && result.ok) {
    const saved = await saveLocalConfig({
      apiKey,
      providerName: result.providerName,
      providerId: result.providerId,
      websiteUrl: result.websiteUrl,
      providerSiteUrl: result.websiteUrl,
      apiBaseUrl: result.apiBaseUrl,
      wireApi: result.wireApi,
      requiresOpenAIAuth: true,
      disableResponseStorage: provider.disableResponseStorage,
      modelReasoningEffort: provider.modelReasoningEffort,
      textModel: result.textModel,
      imageModel: result.imageModel,
      videoModel: result.videoModel,
      modelsCache: result.models.filter((model) => !model.capabilities.includes("unknown")),
      modelsUpdatedAt: startedAt,
      supportsModelsList: result.supportsModelsList,
      supportsResponses: result.supportsResponses,
      supportsChatCompletions: result.supportsChatCompletions,
      supportsImageGeneration: result.supportsImageGeneration,
      lastTestedAt: result.lastTestedAt,
      isDefault: true,
    });
    result.saved = true;
    result.textModel = saved.textModel;
    result.imageModel = saved.imageModel;
    result.videoModel = saved.videoModel;
    result.models = saved.modelsCache;
    result.modelGroups = groupModels(saved.modelsCache);
    result.recommended = recommendModels(saved.modelsCache, provider);
    result.message = "检测成功，已保存并启用。";
  }

  if (!result.ok && !result.issues.length) {
    result.issues.push(issue("responses", joinUrl(bestBaseUrl, "responses"), undefined, "未找到可用文本接口。"));
  }

  return result;
}

function emptyDetection(input: {
  providerName: string;
  providerId: string;
  websiteUrl: string;
  apiBaseUrl: string;
  apiKeyStatus: ProviderDetectionResult["apiKeyStatus"];
  issues: ProviderDetectionIssue[];
  testedUrls: string[];
  lastTestedAt: string;
  message: string;
}): ProviderDetectionResult {
  return {
    ok: false,
    saved: false,
    providerName: input.providerName,
    providerId: input.providerId,
    websiteUrl: input.websiteUrl,
    apiBaseUrl: input.apiBaseUrl,
    apiKeyStatus: input.apiKeyStatus,
    wireApi: "responses",
    textModel: "",
    imageModel: "",
    videoModel: "",
    supportsModelsList: false,
    supportsResponses: false,
    supportsChatCompletions: false,
    supportsImageGeneration: false,
    lastTestedAt: input.lastTestedAt,
    models: [],
    modelGroups: { text: [], image: [], video: [], embedding: [], unknown: [] },
    recommended: { textModel: "", imageModel: "", videoModel: "" },
    issues: input.issues,
    testedUrls: input.testedUrls,
    message: input.message,
  };
}

function buildBaseUrlCandidates(rawAddress: string, providerId: string) {
  const normalized = withProtocol(rawAddress).replace(/\/+$/, "");
  if (!normalized) return [];
  const provider = findProviderPreset(providerId);
  const inferred = normalizeBaseUrl(normalized, provider);
  const candidates = /\/(v1|v1beta\/openai)$/i.test(normalized)
    ? [normalized, stripKnownVersion(normalized)]
    : [inferred, normalized];
  return uniqueStrings(candidates).filter(Boolean);
}

async function probeTextCandidates(
  baseUrls: string[],
  apiKey: string,
  modelCandidates: string[],
  preferredWireApi: ModelWireApi | undefined,
  issues: ProviderDetectionIssue[],
) {
  const uniqueBaseUrls = uniqueStrings(baseUrls);
  for (const baseUrl of uniqueBaseUrls) {
    const result = await probeTextInterfaces(baseUrl, apiKey, modelCandidates, preferredWireApi, issues);
    if (result.textModel) return { ...result, baseUrl };
  }
  return {
    supportsResponses: false,
    supportsChatCompletions: false,
    textModel: "",
    wireApi: preferredWireApi || "responses" as ModelWireApi,
    baseUrl: uniqueBaseUrls[0] || "",
  };
}

async function probeTextInterfaces(
  baseUrl: string,
  apiKey: string,
  modelCandidates: string[],
  preferredWireApi: ModelWireApi | undefined,
  issues: ProviderDetectionIssue[],
) {
  const order: ModelWireApi[] = preferredWireApi === "chat_completions"
    ? ["chat_completions", "responses"]
    : ["responses", "chat_completions"];
  let supportsResponses = false;
  let supportsChatCompletions = false;
  let textModel = "";
  let wireApi: ModelWireApi = preferredWireApi || "responses";

  for (const candidate of modelCandidates) {
    for (const api of order) {
      const requestUrl = joinUrl(baseUrl, api === "responses" ? "responses" : "chat/completions");
      const probe = api === "responses"
        ? await requestJson(requestUrl, {
          method: "POST",
          apiKey,
          timeoutMs: textTimeoutMs,
          body: {
            model: candidate,
            input: "请只回复 OK",
            max_output_tokens: 8,
          },
        })
        : await requestJson(requestUrl, {
          method: "POST",
          apiKey,
          timeoutMs: textTimeoutMs,
          body: {
            model: candidate,
            messages: [{ role: "user", content: "请只回复 OK" }],
            max_tokens: 8,
          },
        });

      if (probe.ok) {
        if (api === "responses") supportsResponses = true;
        if (api === "chat_completions") supportsChatCompletions = true;
        textModel = candidate;
        wireApi = api;
        return { supportsResponses, supportsChatCompletions, textModel, wireApi };
      }
      issues.push(issue(api, requestUrl, probe.status, `${candidate}：${probe.message}`));
    }
  }

  return { supportsResponses, supportsChatCompletions, textModel, wireApi };
}

async function probeImageGeneration(baseUrl: string, apiKey: string, modelCandidates: string[], issues: ProviderDetectionIssue[]) {
  for (const candidate of modelCandidates) {
    const requestUrl = joinUrl(baseUrl, "images/generations");
    const probe = await requestJson(requestUrl, {
      method: "POST",
      apiKey,
      timeoutMs: imageTimeoutMs,
      body: {
        model: candidate,
        prompt: "生成一个简单蓝色圆形图标，白色背景。",
        size: "1024x1024",
        n: 1,
      },
    });
    if (probe.ok) return { supportsImageGeneration: true, imageModel: candidate };
    issues.push(issue("images", requestUrl, probe.status, `${candidate}：${probe.message}`));
    if (isLikelyEndpointMissing(probe.status, probe.message)) break;
  }

  return { supportsImageGeneration: false, imageModel: "" };
}

async function requestJson(url: string, options: {
  method: "GET" | "POST";
  apiKey: string;
  timeoutMs: number;
  body?: unknown;
}): Promise<ProbeResponse> {
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text().catch(() => "");
    const data = contentType.includes("application/json") && text ? safeParseJson(text) : text;
    const message = response.ok ? "OK" : extractErrorMessage(data, text, response.statusText);
    return { ok: response.ok, status: response.status, data, message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? sanitizeMessage(error.message) : "网络连接失败。",
    };
  }
}

function extractModels(data: unknown) {
  const source = data && typeof data === "object" && "data" in data ? (data as { data?: unknown }).data : data;
  if (!Array.isArray(source)) return [];
  const models: ModelCatalogItem[] = [];
  source.forEach((item) => {
    const id = typeof item === "string"
      ? item
      : item && typeof item === "object" && "id" in item && typeof (item as { id?: unknown }).id === "string"
        ? (item as { id: string }).id
        : "";
    if (!id.trim()) return;
    const capabilities = inferModelCapabilities(id);
    models.push({
      id: id.trim(),
      label: id.trim(),
      capabilities,
      testStatus: capabilities.includes("unknown") ? "untested" : "untested",
      description: "由中转站 /models 返回。",
    });
  });
  return mergeModels(models);
}

function buildPassedModels(input: {
  baseModels: ModelCatalogItem[];
  textModel: string;
  imageModel: string;
  videoModel: string;
  supportsImageGeneration: boolean;
  wireApi: ModelWireApi;
  testedAt: string;
}) {
  const updates = new Map<string, ModelCatalogItem>();
  input.baseModels.forEach((model) => {
    if (model.capabilities.includes("unknown")) return;
    updates.set(model.id, { ...model, testStatus: "untested" });
  });

  if (input.textModel) {
    const existing = updates.get(input.textModel);
    updates.set(input.textModel, {
      ...existing,
      id: input.textModel,
      label: existing?.label || input.textModel,
      capabilities: ["text"],
      testStatus: "passed",
      lastTestedAt: input.testedAt,
      lastTestMessage: `文本接口可用（${input.wireApi === "responses" ? "Responses" : "Chat Completions"}）。`,
    });
  }

  if (input.imageModel && input.supportsImageGeneration) {
    const existing = updates.get(input.imageModel);
    updates.set(input.imageModel, {
      ...existing,
      id: input.imageModel,
      label: existing?.label || input.imageModel,
      capabilities: mergeCapabilities(existing?.capabilities || inferModelCapabilities(input.imageModel), ["image"]),
      testStatus: "passed",
      lastTestedAt: input.testedAt,
      lastTestMessage: "图片生成接口可用。",
    });
  }

  if (input.videoModel) {
    const existing = updates.get(input.videoModel);
    updates.set(input.videoModel, {
      ...existing,
      id: input.videoModel,
      label: existing?.label || input.videoModel,
      capabilities: mergeCapabilities(existing?.capabilities || inferModelCapabilities(input.videoModel), ["video"]),
      testStatus: existing?.testStatus || "untested",
      lastTestedAt: existing?.lastTestedAt,
      lastTestMessage: existing?.lastTestMessage || "视频模型已识别，需在业务页实际验证。",
    });
  }

  return Array.from(updates.values()).sort((a, b) => {
    const aPassed = a.testStatus === "passed" ? 0 : 1;
    const bPassed = b.testStatus === "passed" ? 0 : 1;
    return aPassed - bPassed || a.id.localeCompare(b.id);
  });
}

function recommendModels(models: ModelCatalogItem[], provider: ReturnType<typeof findProviderPreset>) {
  return {
    textModel: pickModel(models, "text", [provider.textModel, "gpt-5.5", "gpt-5-mini", "gpt-4o-mini"]),
    imageModel: pickModel(models, "image", ["gpt-image-2", provider.imageModel, "gpt-image-1", "dall-e-3"]),
    videoModel: pickModel(models, "video", [provider.videoModel, "sora-2", "veo-3.1-generate-preview"]),
  };
}

function pickModel(models: ModelCatalogItem[], capability: ModelCapability, preferred: string[]) {
  const pool = models.filter((model) => model.capabilities.includes(capability));
  return preferred.find((id) => id && pool.some((model) => model.id === id))
    || pool.find((model) => model.testStatus === "passed")?.id
    || pool[0]?.id
    || "";
}

function groupModels(models: ModelCatalogItem[]): Record<ModelCapability, ModelCatalogItem[]> {
  const groups: Record<ModelCapability, ModelCatalogItem[]> = {
    text: [],
    image: [],
    video: [],
    embedding: [],
    unknown: [],
  };
  models.forEach((model) => {
    model.capabilities.forEach((capability) => {
      groups[capability]?.push(model);
    });
  });
  return groups;
}

function manualModelItems(manual: DetectorInput["manual"]): ModelCatalogItem[] {
  return uniqueStrings([manual?.textModel, manual?.imageModel, manual?.videoModel])
    .filter(Boolean)
    .map((id) => ({
      id,
      label: id,
      capabilities: inferModelCapabilities(id),
      testStatus: "untested",
      description: "手动填写模型。",
    }));
}

function mergeModels(models: ModelCatalogItem[]) {
  const merged = new Map<string, ModelCatalogItem>();
  models.forEach((model) => {
    const id = model.id.trim();
    if (!id) return;
    const previous = merged.get(id);
    merged.set(id, previous
      ? {
        ...previous,
        ...model,
        capabilities: mergeCapabilities(previous.capabilities, model.capabilities),
        testStatus: previous.testStatus === "passed" || model.testStatus === "passed" ? "passed" : model.testStatus || previous.testStatus,
      }
      : { ...model, id, label: model.label || id });
  });
  return Array.from(merged.values());
}

function mergeCapabilities(a: ModelCapability[], b: ModelCapability[]) {
  const next: ModelCapability[] = [];
  const seen = new Set<ModelCapability>();
  for (const item of [...a, ...b]) {
    if (item === "unknown" || seen.has(item)) continue;
    seen.add(item);
    next.push(item);
  }
  return next.length ? next : ["unknown" as ModelCapability];
}

function issue(step: ProviderDetectionIssue["step"], requestUrl: string, status: number | undefined, message: string): ProviderDetectionIssue {
  const cleanMessage = sanitizeMessage(message);
  return {
    step,
    requestUrl,
    status,
    message: cleanMessage,
    possibleCauses: possibleCauses(status, cleanMessage, step),
    suggestions: suggestions(status, cleanMessage, step, requestUrl),
  };
}

function possibleCauses(status: number | undefined, message: string, step: ProviderDetectionIssue["step"]) {
  const lower = message.toLowerCase();
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid api key|incorrect api key|api key/.test(lower)) {
    return step === "images"
      ? ["Key 没有图片接口权限", "该中转站未开通图片生成", "图片模型需要单独购买或授权"]
      : ["API Key 错误", "Key 没有该接口权限", "中转站要求 Bearer Token"];
  }
  if (status === 404 || /not found|route|endpoint/.test(lower)) {
    return step === "responses"
      ? ["不支持 Responses", "API 地址缺少或多余 /v1", "中转站不是 OpenAI 兼容接口"]
      : ["API 地址错误", "缺少 /v1", "该接口未开放"];
  }
  if (status === 402 || /balance|billing|quota|insufficient|credit/.test(lower)) {
    return ["余额不足", "账号额度受限", "模型权限未开通"];
  }
  if (/model|does not exist|unsupported|invalid/.test(lower)) {
    return ["模型名不存在", "模型不支持当前接口", "中转站后台未启用该模型"];
  }
  if (/timeout|fetch failed|econnreset|network|connect/.test(lower)) {
    return ["网络连接失败", "中转站服务不可达", "上游接口超时"];
  }
  if (step === "images") return ["无图片权限", "图片模型名不正确", "中转站不支持图片生成"];
  return ["API URL 错误", "中转站不是 OpenAI 兼容接口", "接口暂时不可用"];
}

function suggestions(status: number | undefined, message: string, step: ProviderDetectionIssue["step"], requestUrl: string) {
  const next = new Set<string>();
  if (!/\/v1\//.test(requestUrl) && !requestUrl.endsWith("/v1")) next.add("尝试把 API 地址改为带 /v1 的地址。");
  if (status === 401 || status === 403) {
    next.add(step === "images" ? "到中转站后台确认该 Key 是否开通图片生成权限。" : "重新复制中转站后台生成的 Key，确认没有空格。");
  }
  if (status === 404) next.add("在手动高级配置里切换 /v1 或原始地址。");
  if (step === "responses") next.add("如果 Responses 失败，优先尝试 Chat Completions。");
  if (step === "chat_completions") next.add("确认中转站是否提供 OpenAI Chat Completions 兼容接口。");
  if (step === "images") next.add("手动填写中转站后台显示的图片模型名，再单独测试；如果仍是 401/403，需要换有图片权限的 Key。");
  if (/model|unsupported|does not exist/i.test(message)) next.add("从中转站后台复制准确模型名。");
  if (/balance|billing|quota|insufficient|credit/i.test(message)) next.add("检查余额、套餐和模型权限。");
  if (!next.size) next.add("打开手动高级配置，填写准确 API 地址和模型名后再测试。");
  return Array.from(next);
}

function withProtocol(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripKnownVersion(value: string) {
  return value.replace(/\/(v1|v1beta\/openai)$/i, "");
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function siteFromUrl(value: string) {
  try {
    const url = new URL(withProtocol(value));
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function inferProviderId(value: string) {
  if (/yostoken|ccswitch|ccs/i.test(value)) return "ccs";
  if (/openrouter\.ai/i.test(value)) return "openrouter";
  if (/generativelanguage\.googleapis\.com/i.test(value)) return "gemini";
  if (/api\.openai\.com|platform\.openai\.com/i.test(value)) return "openai";
  return "custom";
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown, rawText: string, fallback: string) {
  if (data && typeof data === "object") {
    const error = "error" in data ? (data as { error?: unknown }).error : undefined;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    if ("message" in data && typeof (data as { message?: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
  }
  return rawText.slice(0, 500) || fallback || "请求失败。";
}

function sanitizeMessage(message: string) {
  return (message || "请求失败。")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${maskApiKey("sk-hidden") || "***"}`)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function uniqueStrings(values: Array<string | undefined>) {
  const unique = new Set<string>();
  for (const value of values) {
    const item = value?.trim();
    if (item) unique.add(item);
  }
  return Array.from(unique);
}

function isAuthStatus(status?: number) {
  return status === 401 || status === 403;
}

function isLikelyEndpointMissing(status: number | undefined, message: string) {
  return status === 404 || /not found|route|endpoint|cannot post/i.test(message);
}

function configureGlobalProxy() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || "";
  if (!proxyUrl || globalProxyUrl === proxyUrl) return;
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  globalProxyUrl = proxyUrl;
}
