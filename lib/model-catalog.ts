import OpenAI from "openai";
import { toApiError } from "./api-errors";
import { getOpenAIConfig, updateModelCache, upsertModelCacheItem } from "./local-config";
import { createOpenAIClient as createConfiguredOpenAIClient } from "./openai";
import { runQueuedImageModelRequestWithRetry } from "./image-request-queue";
import { findProviderPreset, inferModelCapabilities, type ModelCapability, type ModelCatalogItem, type ModelWireApi } from "./openai-defaults";

export type ModelTestKind = Extract<ModelCapability, "text" | "image" | "video">;

export type ModelTestResult = {
  ok: boolean;
  kind: ModelTestKind;
  model: string;
  message: string;
};

const textTimeoutMs = 20_000;
const imageTimeoutMs = 180_000;
const videoTimeoutMs = 20_000;

export async function refreshModelCatalog() {
  const config = getOpenAIConfig();
  if (!config.hasApiKey) {
    return {
      ok: false,
      models: config.modelsCache,
      modelsUpdatedAt: config.modelsUpdatedAt,
      message: "缺少 API Key，已显示内置模型建议。",
    };
  }

  try {
    const openai = createModelOpenAIClient();
    const list = await openai.models.list({ timeout: textTimeoutMs });
    const remoteModels = list.data
      .map((model) => toCatalogItem(model.id))
      .filter((item) => item.capabilities.length)
      .sort((a, b) => a.id.localeCompare(b.id));
    const models = mergeModelCatalog([...findProviderPreset(config.providerId).models, ...config.modelsCache], remoteModels);
    const saved = await updateModelCache(models);

    return {
      ok: true,
      models,
      modelsUpdatedAt: saved.modelsUpdatedAt,
      message: `已刷新 ${models.length} 个模型。`,
    };
  } catch (error) {
    const apiError = toApiError(error, "刷新模型列表失败。");
    return {
      ok: false,
      models: config.modelsCache,
      modelsUpdatedAt: config.modelsUpdatedAt,
      message: `刷新模型列表失败：${apiError.message}`,
    };
  }
}

export async function testConfiguredModel(kind: ModelTestKind, model: string): Promise<ModelTestResult> {
  const config = getOpenAIConfig();
  const modelId = model.trim();
  if (!config.hasApiKey) {
    return { ok: false, kind, model, message: "缺少 API Key，请先保存配置。" };
  }
  if (!modelId) {
    return { ok: false, kind, model, message: "模型名为空，请先选择或填写模型。" };
  }

  const openai = createModelOpenAIClient();
  const result = kind === "image"
    ? await testImageModel(openai, modelId)
    : kind === "video"
      ? await testVideoModel(modelId)
      : await testTextModel(openai, modelId);
  await upsertModelCacheItem({
    ...existingModelFor(modelId, config.modelsCache),
    id: modelId,
    label: existingModelFor(modelId, config.modelsCache)?.label || modelId,
    capabilities: Array.from(new Set([...(existingModelFor(modelId, config.modelsCache)?.capabilities || []), kind])),
    testStatus: result.ok ? "passed" : "failed",
    lastTestedAt: new Date().toISOString(),
    lastTestMessage: result.message,
  });
  return result;
}

export function mergeModelCatalog(seedModels: ModelCatalogItem[], remoteModels: ModelCatalogItem[]) {
  const merged = new Map<string, ModelCatalogItem>();
  [...seedModels, ...remoteModels].forEach((item) => {
    const previous = merged.get(item.id);
    if (!previous) {
      merged.set(item.id, item);
      return;
    }
    merged.set(item.id, {
      ...item,
      testStatus: item.testStatus || previous.testStatus,
      lastTestedAt: previous.lastTestedAt || item.lastTestedAt,
      lastTestMessage: previous.lastTestMessage || item.lastTestMessage,
      capabilities: Array.from(new Set([...previous.capabilities, ...item.capabilities])),
      description: previous.description || item.description,
    });
  });
  return Array.from(merged.values());
}

function createModelOpenAIClient() {
  const config = getOpenAIConfig();
  return createConfiguredOpenAIClient(config);
}

async function testTextModel(openai: OpenAI, model: string): Promise<ModelTestResult> {
  const config = getOpenAIConfig();
  const attempts = buildTextTestAttempts(openai, model, config.wireApi);
  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      await attempt.run();
      return { ok: true, kind: "text", model, message: `文本模型可用（${attempt.label}）。` };
    } catch (error) {
      const apiError = toApiError(error, "文本模型不可用。");
      failures.push(`${attempt.label}：${apiError.message}`);
    }
  }

  return {
    ok: false,
    kind: "text",
    model,
    message: `文本模型不可用：${failures.join("；")}`,
  };
}

function buildTextTestAttempts(openai: OpenAI, model: string, preferredWireApi: ModelWireApi) {
  const responsesAttempt = {
    label: "Responses",
    run: () => openai.responses.create({
      model,
      input: "ok",
      max_output_tokens: 8,
    }, {
      timeout: textTimeoutMs,
    }),
  };
  const chatAttempt = {
    label: "Chat Completions",
    run: () => openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 8,
    }, {
      timeout: textTimeoutMs,
    }),
  };

  return preferredWireApi === "chat_completions"
    ? [chatAttempt, responsesAttempt]
    : [responsesAttempt, chatAttempt];
}

async function testImageModel(openai: OpenAI, model: string): Promise<ModelTestResult> {
  try {
    await runQueuedImageModelRequestWithRetry(
      { label: `图片模型测试/${model}` },
      () => openai.images.generate({
        model,
        prompt: "A small green square on a clean white background. Minimal test image.",
        size: "1024x1024",
        quality: "medium",
        n: 1,
      }, {
        timeout: imageTimeoutMs,
        maxRetries: 0,
      }),
    );
    return { ok: true, kind: "image", model, message: "图片模型可用。" };
  } catch (error) {
    const apiError = toApiError(error, "图片模型不可用。");
    return { ok: false, kind: "image", model, message: `图片模型不可用：${apiError.message}` };
  }
}

async function testVideoModel(model: string): Promise<ModelTestResult> {
  const config = getOpenAIConfig();
  const response = await fetch(`${config.apiBaseUrl}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: "A two second minimal test video of a green square on a white background.",
      seconds: 2,
      size: "1280x720",
    }),
    signal: AbortSignal.timeout(videoTimeoutMs),
  }).catch((error) => {
    throw error instanceof Error ? error : new Error("视频模型测试请求失败。");
  });

  if (response.ok) {
    return { ok: true, kind: "video", model, message: "视频模型接口可用，已创建测试任务。" };
  }

  const text = await response.text().catch(() => "");
  const message = text.slice(0, 500) || `${response.status} ${response.statusText}`;
  return { ok: false, kind: "video", model, message: `视频模型不可用：${message}` };
}

function toCatalogItem(id: string): ModelCatalogItem {
  return {
    id,
    label: id,
    capabilities: inferModelCapabilities(id),
  };
}

function existingModelFor(id: string, models: ModelCatalogItem[]) {
  return models.find((model) => model.id === id);
}
