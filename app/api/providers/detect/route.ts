import { NextResponse } from "next/server";
import { readLocalConfig } from "@/lib/local-config";
import { detectProvider } from "@/lib/provider-detector";
import type { ModelWireApi } from "@/lib/openai-defaults";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
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
  } catch {
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
