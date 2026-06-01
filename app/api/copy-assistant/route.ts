import { NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import {
  buildCopyAssistantPrompt,
  normalizeCopyAssistantInput,
  normalizeCopyAssistantResult,
  parseCopyAssistantJson,
} from "@/lib/copy-assistant";
import { getAnalysisModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
    try {
      const input = normalizeCopyAssistantInput(await request.json().catch(() => null));
      if (!input.prompt.trim()) {
        return NextResponse.json({ ok: false, error: "先写一句你想做什么，比如：医院门口灯箱，消化内镜中心。" }, { status: 400 });
      }

      try {
        const response = await withTimeout(runCopyAssistantModel(input), 90000);
        const result = normalizeCopyAssistantResult(parseCopyAssistantJson(response.output_text || ""));
        if (!result.suggestions.length) {
          return NextResponse.json({ ok: false, error: "文本模型没有返回可用方案，请再试一次。" }, { status: 502 });
        }
        return NextResponse.json({
          ok: true,
          source: "ai",
          ...result,
        });
      } catch (error) {
        const apiError = toApiError(error, "帮我想生成失败。");
        const message = error instanceof Error ? error.message : "";
        const errorMessage = /timeout|timed out|etimedout/i.test(message)
          ? "文本模型响应较慢，请再试一次。"
          : apiError.message.replace("图片模型服务", "文本模型服务").replace("图片模型", "文本模型");
        return NextResponse.json({ ok: false, error: errorMessage }, { status: apiError.status });
      }
    } catch (error) {
      const apiError = toApiError(error, "帮我想生成失败。");
      return NextResponse.json({ ok: false, error: apiError.message }, { status: apiError.status });
    }
  });
}

async function runCopyAssistantModel(input: ReturnType<typeof normalizeCopyAssistantInput>) {
  const openai = getOpenAI();
  return await openai.responses.create({
    model: getAnalysisModel(),
    input: buildCopyAssistantPrompt(input),
    max_output_tokens: 2200,
  }, { timeout: 90000 });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("帮我想文本模型超时。")), timeoutMs)),
  ]);
}
