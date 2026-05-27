import { access, mkdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const requiredNode = { major: 20, minor: 9 };
const requiredIgnores = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".env",
  ".env.local",
  ".DS_Store",
  "config.local.json",
  "projects.local.json",
  "task-runs.local.json",
  "style-libraries.local.json",
  "public/generated/*",
  "*.tsbuildinfo",
];
const forbiddenTrackedPatterns = [
  /^\.env(?:\.|$)(?!example$)/,
  /(^|\/)config\.local\.json(?:\.bak)?$/,
  /(^|\/)project\.local\.json(?:\.bak)?$/,
  /(^|\/)projects\.local\.json(?:\.bak)?$/,
  /(^|\/)task-runs\.local\.json(?:\.bak)?$/,
  /(^|\/)style-libraries\.local\.json$/,
  /^public\/generated\//,
  /\.tsbuildinfo$/,
];
const allowedTrackedRuntimeFiles = new Set([".env.example", "public/generated/.gitkeep"]);
const checks = [];

await check("Node.js is >=20.9.0", () => {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major > requiredNode.major || (major === requiredNode.major && minor >= requiredNode.minor)) return;
  throw new Error(`current version is ${process.versions.node}`);
});

await check("package.json exists", async () => {
  await access(join(root, "package.json"), constants.R_OK);
});

await check("Next app folders exist", async () => {
  await access(join(root, "app"), constants.R_OK);
  await access(join(root, "components"), constants.R_OK);
});

await check(".gitignore protects dependencies, builds, secrets, and generated images", async () => {
  const gitignore = await readFile(join(root, ".gitignore"), "utf8");
  const missing = requiredIgnores.filter((entry) => !gitignore.includes(entry));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
});

await check("Git is not tracking secrets, local data, generated images, or build info", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: root });
  const tracked = stdout.split(/\r?\n/).filter(Boolean);
  const forbidden = tracked.filter((file) => !allowedTrackedRuntimeFiles.has(file) && forbiddenTrackedPatterns.some((pattern) => pattern.test(file)));
  if (forbidden.length) throw new Error(`tracked forbidden files: ${forbidden.slice(0, 8).join(", ")}`);
});

await check(".env.local exists and does not expose empty OPENAI_API_KEY", async () => {
  const envPath = join(root, ".env.local");
  await access(envPath, constants.R_OK);
  const env = await readFile(envPath, "utf8");
  const keyLine = env.split(/\r?\n/).find((line) => line.trim().startsWith("OPENAI_API_KEY="));
  if (!keyLine) throw new Error("OPENAI_API_KEY is not set");
  if (!keyLine.split("=").slice(1).join("=").trim()) throw new Error("OPENAI_API_KEY is empty");
}, "warn");

await check("public/generated is writable", async () => {
  const generatedDir = join(root, "public", "generated");
  await mkdir(generatedDir, { recursive: true });
  const info = await stat(generatedDir);
  if (!info.isDirectory()) throw new Error("public/generated is not a directory");
  await access(generatedDir, constants.W_OK);
});

await check("npm lockfile exists for reproducible deploys", async () => {
  await access(join(root, "package-lock.json"), constants.R_OK);
});

const failed = checks.filter((item) => !item.ok && item.severity !== "warn");
const warnings = checks.filter((item) => !item.ok && item.severity === "warn");
for (const item of checks) {
  const prefix = item.ok ? "[ok]" : item.severity === "warn" ? "[warn]" : "[fail]";
  console.log(`${prefix} ${item.name}${item.message ? `: ${item.message}` : ""}`);
}

if (failed.length) {
  console.error(`\nPreflight failed: ${failed.length} check(s) need attention.`);
  process.exitCode = 1;
} else {
  if (warnings.length) console.warn(`\nPreflight warnings: ${warnings.length} item(s) should be fixed before real image generation.`);
  console.log("\nPreflight passed. The project is ready to build or deploy.");
}

async function check(name, fn, severity = "error") {
  try {
    await fn();
    checks.push({ name, ok: true, severity });
  } catch (error) {
    checks.push({ name, ok: false, severity, message: error instanceof Error ? error.message : String(error) });
  }
}
