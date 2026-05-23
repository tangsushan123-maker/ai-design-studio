import { NextResponse } from "next/server";
import { getOpenAIConfig } from "@/lib/local-config";
import { testConfiguredModel } from "@/lib/model-catalog";
import { parseHealthMode, skippedImageCheck, type ModelCheck } from "@/lib/openai-health";
import { getAnalysisModel, getImageModel, getVideoModel } from "@/lib/model-config";

export const runtime = "nodejs";

export async function GET() {
  const imageModel = getImageModel();
  const analysisModel = getAnalysisModel();
  const videoModel = getVideoModel();
  const config = getOpenAIConfig();

  return NextResponse.json({
    ok: config.hasApiKey,
    hasKey: config.hasApiKey,
    providerId: config.providerId,
    providerLabel: config.providerLabel,
    providerSiteUrl: config.providerSiteUrl,
    apiBaseUrl: config.apiBaseUrl,
    wireApi: config.wireApi,
    disableResponseStorage: config.disableResponseStorage,
    modelReasoningEffort: config.modelReasoningEffort,
    imageModel,
    textModel: analysisModel,
    analysisModel,
    videoModel,
    modelsCache: config.modelsCache,
    modelsUpdatedAt: config.modelsUpdatedAt,
    mode: "quick",
    message: config.hasApiKey ? "API Key 已配置。" : "未检测到 OpenAI API Key。",
  });
}

export async function POST(request: Request) {
  const mode = parseHealthMode(new URL(request.url).searchParams.get("mode"));
  const imageModel = getImageModel();
  const analysisModel = getAnalysisModel();
  const videoModel = getVideoModel();
  const config = getOpenAIConfig();
  const hasKey = config.hasApiKey;

  if (!hasKey) {
    return NextResponse.json({
      ok: false,
      hasKey,
      providerId: config.providerId,
      providerLabel: config.providerLabel,
      providerSiteUrl: config.providerSiteUrl,
      apiBaseUrl: config.apiBaseUrl,
      wireApi: config.wireApi,
      disableResponseStorage: config.disableResponseStorage,
      modelReasoningEffort: config.modelReasoningEffort,
      imageModel,
      textModel: analysisModel,
      analysisModel,
      videoModel,
      mode,
      message: "未检测到 OpenAI API Key。请进入 API 配置页面保存 Key，或配置 .env.local。",
      analysis: { ok: false, message: "未测试：缺少 API Key。" },
      image: { ok: false, message: "未测试：缺少 API Key。" },
      video: { ok: false, message: "未测试：缺少 API Key。" },
    });
  }

  const textResult = await testConfiguredModel("text", analysisModel);
  const imageResult = mode === "full" ? await testConfiguredModel("image", imageModel) : null;
  const videoResult = mode === "full" && videoModel ? await testConfiguredModel("video", videoModel) : null;
  const analysis = toModelCheck(textResult);
  const image = imageResult ? toModelCheck(imageResult) : skippedImageCheck();
  const video = videoResult ? toModelCheck(videoResult) : { ok: true, message: videoModel ? "完整测试才会验证视频模型。" : "未配置视频模型，已跳过。" };
  const ok = analysis.ok && image.ok && video.ok;

  return NextResponse.json({
    ok,
    hasKey,
    providerId: config.providerId,
    providerLabel: config.providerLabel,
    providerSiteUrl: config.providerSiteUrl,
    apiBaseUrl: config.apiBaseUrl,
    wireApi: config.wireApi,
    disableResponseStorage: config.disableResponseStorage,
    modelReasoningEffort: config.modelReasoningEffort,
    imageModel,
    textModel: analysisModel,
    analysisModel,
    videoModel,
    mode,
    message: ok
      ? mode === "full"
        ? "API Key 已配置，文本、图片和视频测试已完成。"
        : "API Key 已配置，文本模型可用。图片/视频模型尚未做完整测试。"
      : "API Key 已配置，但有模型测试未通过。",
    analysis,
    image,
    video,
  });
}

function toModelCheck(result: { ok: boolean; message: string }): ModelCheck {
  return {
    ok: result.ok,
    message: result.message,
  };
}
