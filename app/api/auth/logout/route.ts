import { NextResponse } from "next/server";
import { authCookieName, getClearedSessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set(authCookieName, "", getClearedSessionCookieOptions());
  return response;
}
