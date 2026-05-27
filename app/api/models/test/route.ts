import { NextResponse } from "next/server";
import { testConfiguredModel, type ModelTestKind } from "@/lib/model-catalog";

export const runtime = "nodejs";

const allowedKinds = new Set<ModelTestKind>(["text", "image", "video"]);

export async function POST(request: Request) {
  try {
    const body = await parseModelTestPayload(request);
    const kind = body.kind as ModelTestKind;
    if (!allowedKinds.has(kind)) {
      return NextResponse.json({ ok: false, message: "未知模型测试类型。" }, { status: 400 });
    }

    const result = await testConfiguredModel(kind, body.model || "");
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof InvalidModelTestPayloadError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: modelTestRouteErrorMessage("模型测试失败", error) }, { status: 500 });
  }
}

class InvalidModelTestPayloadError extends Error {}

async function parseModelTestPayload(request: Request): Promise<{
  kind?: string;
  model?: string;
}> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidModelTestPayloadError("模型测试请求格式不正确。");
    }
    return body as { kind?: string; model?: string };
  } catch (error) {
    if (error instanceof InvalidModelTestPayloadError) throw error;
    throw new InvalidModelTestPayloadError("模型测试 JSON 无法解析，请检查请求内容后重试。");
  }
}

function modelTestRouteErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}。`;
}
