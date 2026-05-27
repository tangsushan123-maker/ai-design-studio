import { NextResponse } from "next/server";
import { refreshModelCatalog } from "@/lib/model-catalog";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await refreshModelCatalog();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: modelRouteErrorMessage("刷新模型列表失败", error) }, { status: 500 });
  }
}

function modelRouteErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}。`;
}
