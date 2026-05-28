import "server-only";

import crypto from "node:crypto";
import path from "node:path";
import { cookies } from "next/headers";
import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store";

export const authCookieName = "design_studio_session";
const usersPath = path.join(process.cwd(), "auth-users.local.json");
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const passwordKeyLength = 64;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "user";
  createdAt: string;
  updatedAt: string;
};

type StoredUser = AuthUser & {
  passwordSalt: string;
  passwordHash: string;
};

type UserStore = {
  users: StoredUser[];
};

type SessionPayload = {
  userId: string;
  email: string;
  exp: number;
};

export async function getAuthState() {
  const store = await readUserStore();
  const user = await getCurrentUser();
  return {
    hasUsers: store.users.length > 0,
    allowRegistration: canRegister(store),
    user,
  };
}

export async function registerUser(input: { email: string; password: string; name?: string }) {
  const store = await readUserStore();
  if (!canRegister(store)) {
    throw new AuthInputError("当前站点已关闭公开注册。");
  }

  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const name = normalizeName(input.name, email);
  if (store.users.some((user) => user.email === email)) {
    throw new AuthInputError("这个邮箱已经注册。");
  }

  const passwordSalt = crypto.randomBytes(16).toString("base64url");
  const passwordHash = await hashPassword(password, passwordSalt);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    email,
    name,
    role: store.users.length ? "user" : "owner",
    passwordSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  await writeUserStore({ users: [...store.users, user] });
  return publicUser(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const store = await readUserStore();
  const user = store.users.find((item) => item.email === email);
  if (!user) throw new AuthInputError("账号或密码不正确。");

  const passwordHash = await hashPassword(password, user.passwordSalt);
  if (!safeEqual(passwordHash, user.passwordHash)) {
    throw new AuthInputError("账号或密码不正确。");
  }

  return publicUser(user);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const store = await readUserStore();
  const user = store.users.find((item) => item.id === payload.userId);
  return user ? publicUser(user) : null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError("请先登录。");
  return user;
}

export async function createSessionToken(user: AuthUser) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  };
}

export function getClearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    maxAge: 0,
  };
}

function shouldUseSecureSessionCookie() {
  const explicit = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return /^https:\/\//i.test(process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "");
}

export function userDataPath(userId: string, fileName: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(process.cwd(), "data", "users", safeUserId || "unknown", fileName);
}

export class AuthInputError extends Error {}
export class AuthRequiredError extends Error {}

async function readUserStore(): Promise<UserStore> {
  const store = await readJsonWithBackup<UserStore>(usersPath, { users: [] });
  return {
    users: Array.isArray(store.users) ? store.users.filter(isStoredUser) : [],
  };
}

async function writeUserStore(store: UserStore) {
  await writeJsonAtomic(usersPath, store);
}

function canRegister(store: UserStore) {
  return store.users.length === 0 || process.env.AUTH_ALLOW_REGISTRATION === "true";
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthInputError("请输入正确的邮箱。");
  }
  return email;
}

function normalizePassword(value: string) {
  if (value.length < 8) {
    throw new AuthInputError("密码至少 8 位。");
  }
  return value;
}

function normalizeName(value: string | undefined, email: string) {
  const name = value?.trim() || email.split("@")[0] || "用户";
  return name.slice(0, 40);
}

function publicUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function hashPassword(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, passwordKeyLength, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("base64url"));
    });
  });
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(sign(body), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionPayload;
    if (!payload.userId || !payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(body: string) {
  return crypto.createHmac("sha256", authSecret()).update(body).digest("base64url");
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.OPENAI_API_KEY || "local-dev-auth-secret-change-me";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<StoredUser>;
  return Boolean(user.id && user.email && user.name && user.role && user.passwordSalt && user.passwordHash);
}
