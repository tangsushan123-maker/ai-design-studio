import { NextResponse } from "next/server";
import { clearFinishedTaskRuns, listTaskRuns, recordTaskRunCancelled, removeTaskRuns, taskTraceFromJson } from "@/lib/task-run-ledger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestIds = (url.searchParams.get("requestIds") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const projectId = url.searchParams.get("projectId") || undefined;
  const runs = await listTaskRuns(requestIds, { projectId });
  const summary = {
    total: runs.length,
    waiting: runs.filter((run) => run.state === "waiting").length,
    active: runs.filter((run) => run.state === "active").length,
    finished: runs.filter((run) => run.state === "finished").length,
    failed: runs.filter((run) => run.state === "failed").length,
    cancelled: runs.filter((run) => run.state === "cancelled").length,
  };
  return NextResponse.json({ runs, summary });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (action === "delete") {
    const requestIds = normalizeRequestIds(body.requestIds, body.requestId);
    if (!requestIds.length) return NextResponse.json({ error: "缺少 requestId。" }, { status: 400 });
    await removeTaskRuns(requestIds, { projectId: stringValue(body.projectId) });
    return NextResponse.json({ ok: true, deleted: requestIds.length });
  }

  if (action === "clear_finished") {
    await clearFinishedTaskRuns({ projectId: stringValue(body.projectId) });
    return NextResponse.json({ ok: true });
  }

  if (action !== "cancel") {
    return NextResponse.json({ error: "不支持的任务操作。" }, { status: 400 });
  }
  const trace = taskTraceFromJson(body, "client_cancel", "/api/task-runs");
  if (!trace.requestId) {
    return NextResponse.json({ error: "缺少 requestId。" }, { status: 400 });
  }
  const record = await recordTaskRunCancelled(trace, "前端已请求停止任务；如果服务端实际完成，会自动覆盖为完成状态。");
  return NextResponse.json({ ok: true, run: record });
}

function normalizeRequestIds(value: unknown, fallback: unknown) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [fallback];
  return list.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
