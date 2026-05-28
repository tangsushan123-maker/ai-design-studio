import type { ModelCapability, ModelCatalogItem } from "@/lib/openai-defaults";
import type { findProviderPreset } from "@/lib/openai-defaults";

type ProviderPreset = ReturnType<typeof findProviderPreset>;

export type SettingsHealthResponse = {
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

export function healthKeyLabel(health: SettingsHealthResponse | null, maskedApiKey: string) {
  if (health?.hasKey) return maskedApiKey || "服务端已配置";
  if (health && health.hasKey === false) return "服务端未检测到 Key";
  return maskedApiKey || "未读取";
}

export function formatServerTime(value?: string) {
  if (!value) return "未读取";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function nodeRuntimeStatus(version?: string): { detail: string; state: "idle" | "success" | "error" } {
  if (!version) return { detail: "未读取", state: "idle" };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  const supported = major > 20 || (major === 20 && minor >= 9);
  return {
    detail: supported ? `v${version} · 已满足 >=20.9` : `v${version} · 需升级到 >=20.9`,
    state: supported ? "success" : "error",
  };
}

export function modelsFor(capability: ModelCapability, models: ModelCatalogItem[]) {
  return models.filter((model) => model.capabilities.includes(capability));
}

export function modelKindLabel(kind: ModelCapability) {
  if (kind === "image") return "图片模型";
  if (kind === "video") return "视频模型";
  if (kind === "embedding") return "Embedding";
  if (kind === "unknown") return "未知模型";
  return "文本模型";
}

export function isRunnableModelCapability(kind: ModelCapability): kind is "text" | "image" | "video" {
  return kind === "text" || kind === "image" || kind === "video";
}

export function inferApiUrl(siteUrl: string, provider: ProviderPreset) {
  const value = siteUrl.trim().replace(/\/+$/, "") || provider.apiBaseUrl || "";
  if (!value) return "";
  if (/\/(v1|v1beta\/openai)$/i.test(value)) return value;
  if (provider.id === "gemini" && /generativelanguage\.googleapis\.com$/i.test(value)) return `${value}/v1beta/openai`;
  if (provider.compatibility === "custom-openai") return `${value}/v1`;
  return value;
}

export function normalizeApiUrl(value: string, provider: ProviderPreset) {
  return inferApiUrl(value, provider);
}

export function inferProviderId(providerId: string, providerSiteUrl: string, apiBaseUrl: string, fallbackProviderId: string) {
  const value = `${providerSiteUrl} ${apiBaseUrl}`;
  if (/yostoken|ccswitch|ccs/i.test(value)) return "ccs";
  if (/openrouter\.ai/i.test(value)) return "openrouter";
  if (/generativelanguage\.googleapis\.com/i.test(value)) return "gemini";
  if (/api\.openai\.com|platform\.openai\.com/i.test(value)) return "openai";
  return providerId || fallbackProviderId;
}

export function siteFromUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}
