import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";
import { detectProvider } from "@/lib/provider-detector";
import type { ModelWireApi } from "@/lib/openai-defaults";

export const runtime = "nodejs";

type ProviderDetectPayload = {
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

export async function POST(request: Request) {
  try {
    const body = await parseProviderDetectPayload(request);
    const currentLocal = readLocalConfig();
    const result = await detectProvider({
      websiteUrl: body.websiteUrl,
      apiBaseUrl: body.apiBaseUrl,
      apiKey: body.apiKey?.trim() || currentLocal.openaiApiKey || "",
      providerName: body.providerName,
      save: Boolean(body.save),
      manual: body.manual,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof InvalidProviderDetectPayloadError) {
      return NextResponse.json({
        ok: false,
        message: error.message,
        issues: [{
          step: "address",
          requestUrl: "",
          message: error.message,
          possibleCauses: ["请求体不是合法 JSON", "前端页面状态过期", "接口调用参数格式不正确"],
          suggestions: ["刷新设置页后重试，或手动填写 API 地址和模型名。"],
        }],
      }, { status: 400 });
    }
    return NextResponse.json({
      ok: false,
      message: "自动检测失败，请检查网络和中转站地址。",
      issues: [{
        step: "address",
        requestUrl: "",
        message: "服务端检测异常。",
        possibleCauses: ["网络连接失败", "中转站服务不可达", "配置格式不正确"],
        suggestions: ["打开手动高级配置，填写准确 API 地址和模型名后再测试。"],
      }],
    }, { status: 500 });
  }
}

class InvalidProviderDetectPayloadError extends Error {}

async function parseProviderDetectPayload(request: Request): Promise<ProviderDetectPayload> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidProviderDetectPayloadError("自动检测请求格式不正确。");
    }
    return body as ProviderDetectPayload;
  } catch (error) {
    if (error instanceof InvalidProviderDetectPayloadError) throw error;
    throw new InvalidProviderDetectPayloadError("自动检测 JSON 无法解析，请检查请求内容后重试。");
  }
}
