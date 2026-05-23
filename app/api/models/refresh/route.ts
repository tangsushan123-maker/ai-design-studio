import { NextResponse } from "next/server";
import { refreshModelCatalog } from "@/lib/model-catalog";

export const runtime = "nodejs";

export async function POST() {
  const result = await refreshModelCatalog();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
