import { NextResponse } from "next/server";
import { getOpenAIConfig, maskApiKey, readLocalConfig, saveLocalConfig } from "@/lib/local-config";
import type { ModelReasoningEffort, ModelWireApi } from "@/lib/openai-defaults";

export const runtime = "nodejs";

export async function GET() {
  const config = getOpenAIConfig();

  return NextResponse.json({
    hasApiKey: config.hasApiKey,
    maskedApiKey: maskApiKey(config.apiKey),
    providerName: config.providerName,
    providerId: config.providerId,
    providerLabel: config.providerLabel,
    websiteUrl: config.websiteUrl,
    providerSiteUrl: config.providerSiteUrl,
    apiBaseUrl: config.apiBaseUrl,
    wireApi: config.wireApi,
    requiresOpenAIAuth: config.requiresOpenAIAuth,
    disableResponseStorage: config.disableResponseStorage,
    modelReasoningEffort: config.modelReasoningEffort,
    textModel: config.textModel,
    imageModel: config.imageModel,
    analysisModel: config.analysisModel,
    videoModel: config.videoModel,
    modelsCache: config.modelsCache,
    modelsUpdatedAt: config.modelsUpdatedAt,
    supportsModelsList: config.supportsModelsList,
    supportsResponses: config.supportsResponses,
    supportsChatCompletions: config.supportsChatCompletions,
    supportsImageGeneration: config.supportsImageGeneration,
    lastTestedAt: config.lastTestedAt,
    isDefault: config.isDefault,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
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
      imageModel?: string;
      analysisModel?: string;
      videoModel?: string;
    };
    const currentLocal = readLocalConfig();
    const nextApiKey = body.apiKey?.trim() || currentLocal.openaiApiKey || "";

    const saved = await saveLocalConfig({
      apiKey: nextApiKey,
      providerName: body.providerName,
      providerId: body.providerId,
      websiteUrl: body.websiteUrl,
      providerSiteUrl: body.providerSiteUrl,
      apiBaseUrl: body.apiBaseUrl,
      wireApi: body.wireApi,
      requiresOpenAIAuth: body.requiresOpenAIAuth,
      disableResponseStorage: body.disableResponseStorage,
      modelReasoningEffort: body.modelReasoningEffort,
      textModel: body.textModel,
      imageModel: body.imageModel,
      analysisModel: body.analysisModel,
      videoModel: body.videoModel,
      modelsCache: currentLocal.modelsCache,
      modelsUpdatedAt: currentLocal.modelsUpdatedAt,
      supportsModelsList: currentLocal.supportsModelsList,
      supportsResponses: currentLocal.supportsResponses,
      supportsChatCompletions: currentLocal.supportsChatCompletions,
      supportsImageGeneration: currentLocal.supportsImageGeneration,
      lastTestedAt: currentLocal.lastTestedAt,
      isDefault: currentLocal.isDefault,
    });

    return NextResponse.json({
      ok: true,
      hasApiKey: Boolean(saved.openaiApiKey),
      maskedApiKey: maskApiKey(saved.openaiApiKey),
      providerName: saved.providerName,
      providerId: saved.providerId,
      websiteUrl: saved.websiteUrl,
      providerSiteUrl: saved.providerSiteUrl,
      apiBaseUrl: saved.apiBaseUrl,
      wireApi: saved.wireApi,
      requiresOpenAIAuth: saved.requiresOpenAIAuth,
      disableResponseStorage: saved.disableResponseStorage,
      modelReasoningEffort: saved.modelReasoningEffort,
      textModel: saved.textModel,
      imageModel: saved.imageModel,
      analysisModel: saved.textModel,
      videoModel: saved.videoModel,
      modelsCache: saved.modelsCache,
      modelsUpdatedAt: saved.modelsUpdatedAt,
      supportsModelsList: saved.supportsModelsList,
      supportsResponses: saved.supportsResponses,
      supportsChatCompletions: saved.supportsChatCompletions,
      supportsImageGeneration: saved.supportsImageGeneration,
      lastTestedAt: saved.lastTestedAt,
      isDefault: saved.isDefault,
      message: "API 配置已保存。",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "保存配置失败，请检查项目目录写入权限。" }, { status: 500 });
  }
}
