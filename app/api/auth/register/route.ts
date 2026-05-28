import { NextResponse } from "next/server";
import { AuthInputError, authCookieName, createSessionToken, getSessionCookieOptions, registerUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { email?: string; password?: string; name?: string };
    const user = await registerUser({
      email: input.email || "",
      password: input.password || "",
      name: input.name,
    });
    const response = NextResponse.json({ ok: true, user });
    response.cookies.set(authCookieName, await createSessionToken(user), getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthInputError ? error.message : "创建账号失败，请稍后重试。" },
      { status: 400 },
    );
  }
}
