import { NextResponse } from "next/server";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { getOpenAIConfig, maskApiKey, readLocalConfig, runWithConfigUser, saveLocalConfig } from "@/lib/local-config";
import type { ModelReasoningEffort, ModelWireApi } from "@/lib/openai-defaults";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return runWithConfigUser(user, () => {
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
        accountConfigScope: user.role === "owner" ? "owner" : "user",
      });
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    return NextResponse.json({ error: settingsErrorMessage("读取配置失败", error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    return await runWithConfigUser(user, async () => {
      const body = await parseSettingsPayload(request);
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
        modelsCache: Array.isArray(body.modelsCache) ? body.modelsCache : currentLocal.modelsCache,
        modelsUpdatedAt: currentLocal.modelsUpdatedAt,
        supportsModelsList: body.supportsModelsList ?? currentLocal.supportsModelsList,
        supportsResponses: body.supportsResponses ?? currentLocal.supportsResponses,
        supportsChatCompletions: body.supportsChatCompletions ?? currentLocal.supportsChatCompletions,
        supportsImageGeneration: body.supportsImageGeneration ?? currentLocal.supportsImageGeneration,
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
        accountConfigScope: user.role === "owner" ? "owner" : "user",
        message: "API 配置已保存到当前账号。",
      });
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ ok: false, error: "请先登录。" }, { status: 401 });
    if (error instanceof InvalidSettingsPayloadError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: settingsErrorMessage("保存配置失败", error) }, { status: 500 });
  }
}

class InvalidSettingsPayloadError extends Error {}

async function parseSettingsPayload(request: Request) {
  try {
    const body = await request.json() as {
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
      modelsCache?: unknown;
      supportsModelsList?: boolean;
      supportsResponses?: boolean;
      supportsChatCompletions?: boolean;
      supportsImageGeneration?: boolean;
    };
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidSettingsPayloadError("配置请求格式不正确。");
    }
    return body;
  } catch (error) {
    if (error instanceof InvalidSettingsPayloadError) throw error;
    throw new InvalidSettingsPayloadError("配置 JSON 无法解析，请检查请求内容后重试。");
  }
}

function settingsErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}，请检查项目目录写入权限。`;
}
