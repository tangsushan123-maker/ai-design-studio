import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const usersPath = path.join(process.cwd(), "auth-users.local.json");
const passwordKeyLength = 64;

const [emailArg, passwordArg, nameArg, roleArg] = process.argv.slice(2);

if (!emailArg || !passwordArg) {
  console.error("用法：npm run user:create -- <账号邮箱> <密码> [名称] [owner|user]");
  console.error("示例：npm run user:create -- user1@example.com Passw0rd123 用户1 user");
  process.exit(1);
}

const email = normalizeEmail(emailArg);
const password = normalizePassword(passwordArg);
const name = normalizeName(nameArg, email);
const role = roleArg === "owner" ? "owner" : "user";
const store = await readUserStore();
const now = new Date().toISOString();
const passwordSalt = crypto.randomBytes(16).toString("base64url");
const passwordHash = await hashPassword(password, passwordSalt);
const existing = store.users.find((user) => user.email === email);

if (existing) {
  existing.name = name;
  existing.role = role;
  existing.passwordSalt = passwordSalt;
  existing.passwordHash = passwordHash;
  existing.updatedAt = now;
  console.log(`已重置账号：${email}`);
} else {
  store.users.push({
    id: `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    email,
    name,
    role: store.users.length ? role : "owner",
    passwordSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`已创建账号：${email}`);
}

await writeUserStore(store);
console.log(`名称：${name}`);
console.log(`角色：${existing ? role : store.users.at(-1)?.role}`);

async function readUserStore() {
  try {
    const data = JSON.parse(await readFile(usersPath, "utf-8"));
    return { users: Array.isArray(data.users) ? data.users.filter(isStoredUser) : [] };
  } catch {
    return { users: [] };
  }
}

async function writeUserStore(store) {
  await mkdir(path.dirname(usersPath), { recursive: true });
  await writeFile(usersPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("账号必须是邮箱格式。");
  return email;
}

function normalizePassword(value) {
  if (value.length < 8) throw new Error("密码至少 8 位。");
  return value;
}

function normalizeName(value, email) {
  return (value?.trim() || email.split("@")[0] || "用户").slice(0, 40);
}

async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, passwordKeyLength, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("base64url"));
    });
  });
}

function isStoredUser(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.id &&
      value.email &&
      value.name &&
      value.role &&
      value.passwordSalt &&
      value.passwordHash,
  );
}
