import { NextResponse } from "next/server";
import { testConfiguredModel, type ModelTestKind } from "@/lib/model-catalog";

export const runtime = "nodejs";

const allowedKinds = new Set<ModelTestKind>(["text", "image", "video"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      model?: string;
    };
    const kind = body.kind as ModelTestKind;
    if (!allowedKinds.has(kind)) {
      return NextResponse.json({ ok: false, message: "未知模型测试类型。" }, { status: 400 });
    }

    const result = await testConfiguredModel(kind, body.model || "");
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: modelTestRouteErrorMessage("模型测试失败", error) }, { status: 500 });
  }
}

function modelTestRouteErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}。`;
}
