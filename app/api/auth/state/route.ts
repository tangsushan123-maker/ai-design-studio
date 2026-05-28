import { NextResponse } from "next/server";
import { getAuthState } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getAuthState());
}
