import { NextResponse } from "next/server";
import { deleteModelCacheItem, getOpenAIConfig, saveLocalConfig, upsertModelCacheItem } from "@/lib/local-config";
import { inferModelCapabilities, type ModelCapability, type ModelCatalogItem } from "@/lib/openai-defaults";

export const runtime = "nodejs";

const allowedKinds = new Set<ModelCapability>(["text", "image", "video"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      label?: string;
      capabilities?: string[];
    };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "模型名不能为空。" }, { status: 400 });
    }

    const capabilities = (body.capabilities || []).filter((item): item is ModelCapability => allowedKinds.has(item as ModelCapability));
    const item: ModelCatalogItem = {
      id,
      label: body.label?.trim() || id,
      capabilities: capabilities.length ? capabilities : inferModelCapabilities(id),
      testStatus: "untested",
    };

    const saved = await upsertModelCacheItem(item);
    const nextTextModel = item.capabilities.includes("text") && item.testStatus === "passed" ? item.id : saved.textModel;
    const nextImageModel = item.capabilities.includes("image") && item.testStatus === "passed" ? item.id : saved.imageModel;
    const nextVideoModel = item.capabilities.includes("video") && item.testStatus === "passed"
      ? item.id
      : saved.modelsCache.some((model) => model.id === saved.videoModel && model.capabilities.includes("video"))
        ? saved.videoModel
        : "";
    const nextSaved = await saveLocalConfig({
      apiKey: saved.openaiApiKey,
      providerName: saved.providerName,
      providerId: saved.providerId,
      websiteUrl: saved.websiteUrl,
      providerSiteUrl: saved.providerSiteUrl,
      apiBaseUrl: saved.apiBaseUrl,
      wireApi: saved.wireApi,
      requiresOpenAIAuth: saved.requiresOpenAIAuth,
      disableResponseStorage: saved.disableResponseStorage,
      modelReasoningEffort: saved.modelReasoningEffort,
      textModel: nextTextModel,
      imageModel: nextImageModel,
      videoModel: nextVideoModel,
      modelsCache: saved.modelsCache,
      modelsUpdatedAt: saved.modelsUpdatedAt,
      supportsModelsList: saved.supportsModelsList,
      supportsResponses: saved.supportsResponses,
      supportsChatCompletions: saved.supportsChatCompletions,
      supportsImageGeneration: saved.supportsImageGeneration,
      lastTestedAt: saved.lastTestedAt,
      isDefault: saved.isDefault,
    });

    return NextResponse.json({
      ok: true,
      modelsCache: nextSaved.modelsCache,
      modelsUpdatedAt: nextSaved.modelsUpdatedAt,
      textModel: nextSaved.textModel,
      imageModel: nextSaved.imageModel,
      videoModel: nextSaved.videoModel,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: modelManageErrorMessage("模型保存失败", error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "模型名不能为空。" }, { status: 400 });
    }

    const saved = await deleteModelCacheItem(id);
    const config = getOpenAIConfig();
    return NextResponse.json({
      ok: true,
      modelsCache: saved.modelsCache,
      modelsUpdatedAt: saved.modelsUpdatedAt,
      textModel: config.textModel,
      imageModel: config.imageModel,
      videoModel: config.videoModel,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: modelManageErrorMessage("模型删除失败", error) }, { status: 500 });
  }
}

function modelManageErrorMessage(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const clean = message.replace(process.cwd(), "[project]").slice(0, 180);
  return clean ? `${prefix}：${clean}` : `${prefix}，请检查配置文件写入权限。`;
}
