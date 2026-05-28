import { NextResponse } from "next/server";
import { AuthInputError, authCookieName, createSessionToken, getSessionCookieOptions, loginUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { email?: string; password?: string };
    const user = await loginUser({
      email: input.email || "",
      password: input.password || "",
    });
    const response = NextResponse.json({ ok: true, user });
    response.cookies.set(authCookieName, await createSessionToken(user), getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthInputError ? error.message : "登录失败，请稍后重试。" },
      { status: 400 },
    );
  }
}
