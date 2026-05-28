import { NextResponse, type NextRequest } from "next/server";

const authCookieName = "design_studio_session";

const publicPrefixes = [
  "/login",
  "/api/auth",
  "/_next",
];

const publicFiles = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(authCookieName)?.value || "";
  const valid = await verifySessionToken(token);

  if (pathname === "/login") {
    return valid ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  if (valid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*|_next/static|_next/image).*)", "/api/:path*", "/generated/:path*"],
};

function isPublicPath(pathname: string) {
  if (publicFiles.includes(pathname)) return true;
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return false;
}

async function verifySessionToken(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = await sign(body);
  if (!safeEqual(expected, signature)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as { exp?: number };
    return Boolean(payload.exp && payload.exp >= Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

async function sign(body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return base64UrlEncode(new Uint8Array(signature));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.OPENAI_API_KEY || "local-dev-auth-secret-change-me";
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
