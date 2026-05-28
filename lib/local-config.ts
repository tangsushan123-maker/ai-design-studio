import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { readJsonWithBackupSync, writeJsonAtomic } from "./local-json-store";
import {
  defaultOpenAIConfig,
  findProviderPreset,
  inferModelCapabilities,
  type ModelCatalogItem,
  type ModelCapability,
  type ModelReasoningEffort,
  type ModelWireApi,
} from "./openai-defaults";

export type LocalOpenAIConfig = {
  openaiApiKey: string;
  providerName: string;
  providerId: string;
  websiteUrl: string;
  providerSiteUrl: string;
  apiBaseUrl: string;
  wireApi: ModelWireApi;
  requiresOpenAIAuth: boolean;
  disableResponseStorage: boolean;
  modelReasoningEffort: ModelReasoningEffort;
  textModel: string;
  imageModel: string;
  videoModel: string;
  modelsCache: ModelCatalogItem[];
  modelsUpdatedAt: string;
  supportsModelsList: boolean;
  supportsResponses: boolean;
  supportsChatCompletions: boolean;
  supportsImageGeneration: boolean;
  lastTestedAt: string;
  isDefault: boolean;
};

export type ResolvedOpenAIConfig = {
  apiKey: string;
  hasApiKey: boolean;
  providerName: string;
  providerId: string;
  providerLabel: string;
  websiteUrl: string;
  providerSiteUrl: string;
  apiBaseUrl: string;
  wireApi: ModelWireApi;
  requiresOpenAIAuth: boolean;
  disableResponseStorage: boolean;
  modelReasoningEffort: ModelReasoningEffort;
  textModel: string;
  analysisModel: string;
  imageModel: string;
  videoModel: string;
  modelsCache: ModelCatalogItem[];
  modelsUpdatedAt: string;
  supportsModelsList: boolean;
  supportsResponses: boolean;
  supportsChatCompletions: boolean;
  supportsImageGeneration: boolean;
  lastTestedAt: string;
  isDefault: boolean;
  source: "config.local.json" | "env" | "default";
};

type ConfigUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "user";
};

type RawLocalOpenAIConfig = Partial<LocalOpenAIConfig> & {
  analysisModel?: string;
  apiKey?: string;
};

const legacyConfigPath = path.join(process.cwd(), "config.local.json");
const configUserStorage = new AsyncLocalStorage<ConfigUser | null>();

export function runWithConfigUser<T>(user: ConfigUser | null, callback: () => T): T {
  return configUserStorage.run(user, callback);
}

export function getConfigUser() {
  return configUserStorage.getStore() || null;
}

export function readLocalConfig(): Partial<LocalOpenAIConfig> {
  try {
    return normalizeLocalConfig(readActiveLocalConfig());
  } catch {
    return {};
  }
}

function readActiveLocalConfig(): RawLocalOpenAIConfig {
  const user = getConfigUser();
  if (!user) return readRawLocalConfig(legacyConfigPath);
  const userConfigPath = configPathForUser(user.id);
  const userConfig = readRawLocalConfig(userConfigPath);
  if (user.role !== "owner" || Object.keys(userConfig).length) return userConfig;
  return readRawLocalConfig(legacyConfigPath);
}

function readRawLocalConfig(configPath: string): RawLocalOpenAIConfig {
  return readJsonWithBackupSync<RawLocalOpenAIConfig>(configPath, {});
}

function normalizeLocalConfig(parsed: RawLocalOpenAIConfig): Partial<LocalOpenAIConfig> {
  const providerSiteUrl = typeof parsed.providerSiteUrl === "string"
    ? parsed.providerSiteUrl.trim()
    : typeof parsed.websiteUrl === "string"
      ? parsed.websiteUrl.trim()
      : "";
  return {
    openaiApiKey: typeof parsed.openaiApiKey === "string" ? parsed.openaiApiKey.trim() : typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
    providerName: typeof parsed.providerName === "string" ? parsed.providerName.trim() : "",
    providerId: typeof parsed.providerId === "string" ? parsed.providerId.trim() : "",
    websiteUrl: typeof parsed.websiteUrl === "string" ? parsed.websiteUrl.trim() : providerSiteUrl,
    providerSiteUrl,
    apiBaseUrl: typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl.trim() : "",
    wireApi: isWireApi(parsed.wireApi) ? parsed.wireApi : undefined,
    requiresOpenAIAuth: typeof parsed.requiresOpenAIAuth === "boolean" ? parsed.requiresOpenAIAuth : undefined,
    disableResponseStorage: typeof parsed.disableResponseStorage === "boolean" ? parsed.disableResponseStorage : undefined,
    modelReasoningEffort: isReasoningEffort(parsed.modelReasoningEffort) ? parsed.modelReasoningEffort : undefined,
    textModel: typeof parsed.textModel === "string" ? parsed.textModel.trim() : typeof parsed.analysisModel === "string" ? parsed.analysisModel.trim() : "",
    imageModel: typeof parsed.imageModel === "string" ? parsed.imageModel.trim() : "",
    videoModel: typeof parsed.videoModel === "string" ? parsed.videoModel.trim() : undefined,
    modelsCache: normalizeModelCache(parsed.modelsCache),
    modelsUpdatedAt: typeof parsed.modelsUpdatedAt === "string" ? parsed.modelsUpdatedAt : "",
    supportsModelsList: typeof parsed.supportsModelsList === "boolean" ? parsed.supportsModelsList : undefined,
    supportsResponses: typeof parsed.supportsResponses === "boolean" ? parsed.supportsResponses : undefined,
    supportsChatCompletions: typeof parsed.supportsChatCompletions === "boolean" ? parsed.supportsChatCompletions : undefined,
    supportsImageGeneration: typeof parsed.supportsImageGeneration === "boolean" ? parsed.supportsImageGeneration : undefined,
    lastTestedAt: typeof parsed.lastTestedAt === "string" ? parsed.lastTestedAt : "",
    isDefault: typeof parsed.isDefault === "boolean" ? parsed.isDefault : undefined,
  };
}

export function getOpenAIConfig(): ResolvedOpenAIConfig {
  const local = readLocalConfig();
  const configUser = getConfigUser();
  const canUseSharedServerKey = !configUser || configUser.role === "owner";
  const providerId = resolveProviderId(local.providerId || process.env.OPENAI_PROVIDER_ID, local.providerSiteUrl, local.apiBaseUrl);
  const provider = findProviderPreset(providerId);
  const apiKey = local.openaiApiKey || (canUseSharedServerKey ? providerEnvKey(provider.apiKeyEnv) || process.env.OPENAI_API_KEY || "" : "");
  const providerSiteUrl = local.providerSiteUrl || siteUrlFromApiBaseUrl(local.apiBaseUrl) || provider.siteUrl || "";
  const providerName = local.providerName || provider.label;
  const apiBaseUrl = local.apiBaseUrl || process.env.OPENAI_BASE_URL || provider.apiBaseUrl || defaultOpenAIConfig.apiBaseUrl;
  const wireApi = local.wireApi || provider.wireApi || defaultOpenAIConfig.wireApi;
  const requiresOpenAIAuth = local.requiresOpenAIAuth ?? provider.requiresOpenAIAuth ?? defaultOpenAIConfig.requiresOpenAIAuth;
  const disableResponseStorage = local.disableResponseStorage ?? provider.disableResponseStorage ?? defaultOpenAIConfig.disableResponseStorage;
  const modelReasoningEffort = local.modelReasoningEffort || provider.modelReasoningEffort || defaultOpenAIConfig.modelReasoningEffort;
  const modelsCache = local.modelsCache?.length ? local.modelsCache : provider.models;
  const rawTextModel = local.textModel || process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_ANALYSIS_MODEL || provider.textModel || defaultOpenAIConfig.textModel;
  const rawImageModel = local.imageModel || process.env.OPENAI_IMAGE_MODEL || provider.imageModel || defaultOpenAIConfig.imageModel;
  const rawVideoModel = local.videoModel !== undefined ? local.videoModel : process.env.OPENAI_VIDEO_MODEL || provider.videoModel || defaultOpenAIConfig.videoModel;
  const textModel = visibleModelOrFallback(rawTextModel, modelsCache, "text");
  const imageModel = visibleModelOrFallback(rawImageModel, modelsCache, "image");
  const videoModel = visibleModelOrFallback(rawVideoModel, modelsCache, "video");
  const source = local.openaiApiKey || local.apiBaseUrl || local.providerSiteUrl || local.textModel || local.imageModel || local.videoModel || local.providerId ? "config.local.json" : apiKey ? "env" : "default";

  return {
    apiKey,
    hasApiKey: Boolean(apiKey),
    providerName,
    providerId: provider.id,
    providerLabel: provider.label,
    websiteUrl: normalizeSiteUrl(local.websiteUrl || providerSiteUrl),
    providerSiteUrl: normalizeSiteUrl(providerSiteUrl),
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl, provider),
    wireApi,
    requiresOpenAIAuth,
    disableResponseStorage,
    modelReasoningEffort,
    textModel,
    analysisModel: textModel,
    imageModel,
    videoModel,
    modelsCache,
    modelsUpdatedAt: local.modelsUpdatedAt || "",
    supportsModelsList: local.supportsModelsList ?? false,
    supportsResponses: local.supportsResponses ?? (wireApi === "responses"),
    supportsChatCompletions: local.supportsChatCompletions ?? (wireApi === "chat_completions"),
    supportsImageGeneration: local.supportsImageGeneration ?? false,
    lastTestedAt: local.lastTestedAt || "",
    isDefault: local.isDefault ?? true,
    source,
  };
}

export async function saveLocalConfig(input: {
  apiKey?: string;
  providerName?: string;
  providerId?: string;
  websiteUrl?: string;
  providerSiteUrl?: string;
  apiBaseUrl?: string;
  wireApi?: ModelWireApi;
  requiresOpenAIAuth?: boolean;
  disableResponseStorage?: boolean;
  modelReasoningEffort?: ModelReasoningEffort;
  textModel?: string;
  analysisModel?: string;
  imageModel?: string;
  videoModel?: string;
  modelsCache?: ModelCatalogItem[];
  modelsUpdatedAt?: string;
  supportsModelsList?: boolean;
  supportsResponses?: boolean;
  supportsChatCompletions?: boolean;
  supportsImageGeneration?: boolean;
  lastTestedAt?: string;
  isDefault?: boolean;
}) {
  const providerId = resolveProviderId(input.providerId, input.providerSiteUrl, input.apiBaseUrl);
  const provider = findProviderPreset(providerId);
  const providerSiteUrl = normalizeSiteUrl(input.providerSiteUrl?.trim() || input.websiteUrl?.trim() || siteUrlFromApiBaseUrl(input.apiBaseUrl) || provider.siteUrl || "");
  const rawBaseUrl = input.apiBaseUrl?.trim() || provider.apiBaseUrl || providerSiteUrl || defaultOpenAIConfig.apiBaseUrl;
  const normalizedModelCache = input.modelsCache === undefined ? null : normalizeModelCache(input.modelsCache);
  const config: LocalOpenAIConfig = {
    openaiApiKey: input.apiKey?.trim() || "",
    providerName: input.providerName?.trim() || provider.label,
    providerId: provider.id,
    websiteUrl: normalizeSiteUrl(input.websiteUrl?.trim() || providerSiteUrl),
    providerSiteUrl,
    apiBaseUrl: normalizeBaseUrl(rawBaseUrl, provider),
    wireApi: input.wireApi || provider.wireApi || defaultOpenAIConfig.wireApi,
    requiresOpenAIAuth: input.requiresOpenAIAuth ?? provider.requiresOpenAIAuth ?? defaultOpenAIConfig.requiresOpenAIAuth,
    disableResponseStorage: input.disableResponseStorage ?? provider.disableResponseStorage ?? defaultOpenAIConfig.disableResponseStorage,
    modelReasoningEffort: input.modelReasoningEffort || provider.modelReasoningEffort || defaultOpenAIConfig.modelReasoningEffort,
    modelsCache: input.modelsCache === undefined
      ? provider.models
      : normalizedModelCache?.length
        ? normalizedModelCache
        : provider.models,
    modelsUpdatedAt: input.modelsUpdatedAt || "",
    supportsModelsList: input.supportsModelsList ?? false,
    supportsResponses: input.supportsResponses ?? false,
    supportsChatCompletions: input.supportsChatCompletions ?? false,
    supportsImageGeneration: input.supportsImageGeneration ?? false,
    lastTestedAt: input.lastTestedAt || "",
    isDefault: input.isDefault ?? true,
    textModel: "",
    imageModel: "",
    videoModel: "",
  };
  config.textModel = visibleModelOrFallback(input.textModel?.trim() || input.analysisModel?.trim() || provider.textModel || defaultOpenAIConfig.textModel, config.modelsCache, "text");
  config.imageModel = visibleModelOrFallback(input.imageModel === undefined ? provider.imageModel || defaultOpenAIConfig.imageModel : input.imageModel.trim(), config.modelsCache, "image");
  config.videoModel = visibleModelOrFallback(input.videoModel === undefined ? provider.videoModel || defaultOpenAIConfig.videoModel : input.videoModel.trim(), config.modelsCache, "video");

  await writeConfigAtomic(config);

  return config;
}

export async function updateModelCache(modelsCache: ModelCatalogItem[]) {
  const current = getOpenAIConfig();
  return saveLocalConfig({
    apiKey: current.apiKey,
    providerName: current.providerName,
    providerId: current.providerId,
    websiteUrl: current.websiteUrl,
    providerSiteUrl: current.providerSiteUrl,
    apiBaseUrl: current.apiBaseUrl,
    wireApi: current.wireApi,
    requiresOpenAIAuth: current.requiresOpenAIAuth,
    disableResponseStorage: current.disableResponseStorage,
    modelReasoningEffort: current.modelReasoningEffort,
    textModel: current.textModel,
    imageModel: current.imageModel,
    videoModel: current.videoModel,
    modelsCache,
    modelsUpdatedAt: new Date().toISOString(),
    supportsModelsList: current.supportsModelsList,
    supportsResponses: current.supportsResponses,
    supportsChatCompletions: current.supportsChatCompletions,
    supportsImageGeneration: current.supportsImageGeneration,
    lastTestedAt: current.lastTestedAt,
    isDefault: current.isDefault,
  });
}

export async function upsertModelCacheItem(item: ModelCatalogItem) {
  const current = getOpenAIConfig();
  const models = upsertModel(current.modelsCache, item);
  return saveLocalConfig({
    apiKey: current.apiKey,
    providerName: current.providerName,
    providerId: current.providerId,
    websiteUrl: current.websiteUrl,
    providerSiteUrl: current.providerSiteUrl,
    apiBaseUrl: current.apiBaseUrl,
    wireApi: current.wireApi,
    requiresOpenAIAuth: current.requiresOpenAIAuth,
    disableResponseStorage: current.disableResponseStorage,
    modelReasoningEffort: current.modelReasoningEffort,
    textModel: current.textModel,
    imageModel: current.imageModel,
    videoModel: current.videoModel,
    modelsCache: models,
    modelsUpdatedAt: new Date().toISOString(),
    supportsModelsList: current.supportsModelsList,
    supportsResponses: current.supportsResponses,
    supportsChatCompletions: current.supportsChatCompletions,
    supportsImageGeneration: current.supportsImageGeneration,
    lastTestedAt: current.lastTestedAt,
    isDefault: current.isDefault,
  });
}

export async function deleteModelCacheItem(modelId: string) {
  const current = getOpenAIConfig();
  const models = current.modelsCache.filter((item) => item.id !== modelId);
  const nextTextModel = current.textModel === modelId ? firstModelFor(models, "text") || "" : current.textModel;
  const nextImageModel = current.imageModel === modelId ? firstModelFor(models, "image") || "" : current.imageModel;
  const nextVideoModel = current.videoModel === modelId ? firstModelFor(models, "video") || "" : current.videoModel;

  return saveLocalConfig({
    apiKey: current.apiKey,
    providerName: current.providerName,
    providerId: current.providerId,
    websiteUrl: current.websiteUrl,
    providerSiteUrl: current.providerSiteUrl,
    apiBaseUrl: current.apiBaseUrl,
    wireApi: current.wireApi,
    requiresOpenAIAuth: current.requiresOpenAIAuth,
    disableResponseStorage: current.disableResponseStorage,
    modelReasoningEffort: current.modelReasoningEffort,
    textModel: nextTextModel,
    imageModel: nextImageModel,
    videoModel: nextVideoModel,
    modelsCache: models,
    modelsUpdatedAt: new Date().toISOString(),
    supportsModelsList: current.supportsModelsList,
    supportsResponses: current.supportsResponses,
    supportsChatCompletions: current.supportsChatCompletions,
    supportsImageGeneration: current.supportsImageGeneration,
    lastTestedAt: current.lastTestedAt,
    isDefault: current.isDefault,
  });
}

export function normalizeBaseUrl(value: string, provider = findProviderPreset()) {
  const trimmed = value.replace(/\/+$/, "");
  if (!trimmed || /\/(v1|v1beta\/openai)$/i.test(trimmed)) return trimmed;
  if (provider.id === "gemini" && /generativelanguage\.googleapis\.com$/i.test(trimmed)) {
    return `${trimmed}/v1beta/openai`;
  }
  if (provider.compatibility === "custom-openai" || /api\.psydo\.top$/i.test(trimmed) || /openai|openrouter|oneapi|new-api|chatanywhere|yostoken|ccswitch|ccs/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

export function normalizeSiteUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
}

export function resolveProviderId(providerId?: string, providerSiteUrl?: string, apiBaseUrl?: string) {
  const explicit = providerId?.trim();
  const inferred = inferProviderIdFromBaseUrl(`${providerSiteUrl || ""} ${apiBaseUrl || ""}`);
  if (inferred) return inferred;
  return explicit || defaultOpenAIConfig.providerId;
}

export function maskApiKey(apiKey: string) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "已配置";

  const prefix = apiKey.startsWith("sk-") ? "sk-" : `${apiKey.slice(0, 2)}-`;
  return `${prefix}****${apiKey.slice(-4)}`;
}

function providerEnvKey(envName: string) {
  return envName ? process.env[envName] || "" : "";
}

function inferProviderIdFromBaseUrl(apiBaseUrl?: string) {
  const value = apiBaseUrl || "";
  if (/yostoken|ccswitch|ccs/i.test(value)) return "ccs";
  if (/openrouter\.ai/i.test(value)) return "openrouter";
  if (/generativelanguage\.googleapis\.com/i.test(value)) return "gemini";
  if (/api\.openai\.com/i.test(value)) return "openai";
  return "";
}

function siteUrlFromApiBaseUrl(apiBaseUrl?: string) {
  if (!apiBaseUrl) return "";
  try {
    const url = new URL(apiBaseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function isWireApi(value: unknown): value is ModelWireApi {
  return value === "responses" || value === "chat_completions";
}

function isReasoningEffort(value: unknown): value is ModelReasoningEffort {
  return value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function isModelCatalogItem(item: unknown): item is ModelCatalogItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<ModelCatalogItem>;
  return typeof candidate.id === "string" && typeof candidate.label === "string" && Array.isArray(candidate.capabilities);
}

function normalizeModelCache(value: unknown) {
  return Array.isArray(value)
    ? value.filter(isModelCatalogItem).map(normalizeModelCatalogItem)
    : [];
}

function normalizeModelCatalogItem(item: ModelCatalogItem): ModelCatalogItem {
  const inferred = inferModelCapabilities(item.id);
  const capabilities = item.capabilities.filter(isModelCapability);
  const shouldTrustInference = inferred.some((capability) => capability === "image" || capability === "video" || capability === "embedding");
  const normalizedCapabilities = shouldTrustInference ? inferred : capabilities.length ? capabilities : inferred;
  return {
    ...item,
    capabilities: Array.from(new Set(normalizedCapabilities.length ? normalizedCapabilities : ["unknown"])),
  };
}

function isModelCapability(value: unknown): value is ModelCapability {
  return value === "text" || value === "image" || value === "video" || value === "embedding" || value === "unknown";
}

function upsertModel(models: ModelCatalogItem[], item: ModelCatalogItem) {
  const next = item.id.trim();
  if (!next) return models;
  const normalized = {
    ...item,
    id: next,
    label: item.label?.trim() || next,
    capabilities: item.capabilities?.length ? item.capabilities : [],
  };
  const exists = models.some((model) => model.id === next);
  if (exists) return models.map((model) => (model.id === next ? { ...model, ...normalized } : model));
  return [normalized, ...models];
}

function firstModelFor(models: ModelCatalogItem[], capability: ModelCatalogItem["capabilities"][number]) {
  return models.find((item) => item.capabilities.includes(capability) && item.testStatus === "passed")?.id
    || models.find((item) => item.capabilities.includes(capability))?.id;
}

function visibleModelOrFallback(modelId: string, models: ModelCatalogItem[], capability: ModelCatalogItem["capabilities"][number]) {
  if (!modelId) return "";
  const configured = models.find((item) => item.id === modelId && item.capabilities.includes(capability));
  if (configured?.testStatus === "failed") return firstModelFor(models, capability) || "";
  if (configured) return modelId;
  const existingWrongKind = models.find((item) => item.id === modelId);
  if (existingWrongKind) return firstModelFor(models, capability) || "";
  return modelId;
}

async function writeConfigAtomic(config: LocalOpenAIConfig) {
  await writeJsonAtomic(activeConfigPath({ forWrite: true }), config);
}

function activeConfigPath(options?: { forWrite?: boolean }) {
  const user = getConfigUser();
  if (!user) return legacyConfigPath;
  const userConfigPath = configPathForUser(user.id);
  if (options?.forWrite || user.role !== "owner") return userConfigPath;

  const userConfig = readJsonWithBackupSync<Partial<LocalOpenAIConfig>>(userConfigPath, {});
  return Object.keys(userConfig).length ? userConfigPath : legacyConfigPath;
}

function configPathForUser(userId: string) {
  return path.join(process.cwd(), "data", "users", safePathPart(userId), "config.local.json");
}

function safePathPart(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
}
