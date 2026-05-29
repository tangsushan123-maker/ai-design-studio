import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { runWithConfigUser } from "@/lib/local-config";
import { refreshModelCatalog } from "@/lib/model-catalog";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    return await runWithConfigUser(user, async () => {
      const result = await refreshModelCatalog();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: modelRouteErrorMessage("刷新模型列表失败", error) }, { status: 500 });
  }
}

function modelRouteErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}。`;
}
