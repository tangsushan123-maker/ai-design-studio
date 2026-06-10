import { NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { AuthRequiredError } from "@/lib/auth";
import {
  buildCopyAssistantPrompt,
  normalizeCopyAssistantInput,
  normalizeCopyAssistantResult,
  parseCopyAssistantJson,
} from "@/lib/copy-assistant";
import { getOpenAIConfig } from "@/lib/local-config";
import { getAnalysisModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import type { ModelWireApi } from "@/lib/openai-defaults";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return await withCurrentConfigUser(async () => {
      try {
        const input = normalizeCopyAssistantInput(await request.json().catch(() => null));
        if (!input.prompt.trim()) {
          return NextResponse.json({ ok: false, error: "先写一句你想做什么，比如：医院门口灯箱，消化内镜中心。" }, { status: 400 });
        }

        try {
          const outputText = await withTimeout(runCopyAssistantModel(input), 90000);
          const result = normalizeCopyAssistantResult(parseCopyAssistantJson(outputText));
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof AuthRequiredError || /请先登录|登录已过期/.test(message)) {
      return NextResponse.json({ ok: false, error: "请先登录后再使用帮我想。" }, { status: 401 });
    }
    const apiError = toApiError(error, "帮我想生成失败。");
    return NextResponse.json({ ok: false, error: apiError.message }, { status: apiError.status });
  }
}

async function runCopyAssistantModel(input: ReturnType<typeof normalizeCopyAssistantInput>) {
  const openai = getOpenAI();
  const config = getOpenAIConfig();
  const model = getAnalysisModel();
  const prompt = buildCopyAssistantPrompt(input);
  const attempts = copyAssistantTextAttempts(config.wireApi);
  const failures: string[] = [];

  for (const api of attempts) {
    try {
      if (api === "chat_completions") {
        const response = await openai.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2200,
        }, { timeout: 90000 });
        return response.choices[0]?.message?.content || "";
      }
      const response = await openai.responses.create({
        model,
        input: prompt,
        max_output_tokens: 2200,
      }, { timeout: 90000 });
      return response.output_text || "";
    } catch (error) {
      const apiError = toApiError(error, "文本模型不可用。");
      failures.push(`${api === "responses" ? "Responses" : "Chat Completions"}：${apiError.message}`);
    }
  }

  throw new Error(`文本模型不可用：${failures.join("；")}`);
}

function copyAssistantTextAttempts(preferredWireApi: ModelWireApi) {
  return preferredWireApi === "chat_completions"
    ? ["chat_completions", "responses"] as const
    : ["responses", "chat_completions"] as const;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("帮我想文本模型超时。")), timeoutMs)),
  ]);
}
