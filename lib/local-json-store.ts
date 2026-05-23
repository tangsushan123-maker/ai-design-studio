import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJsonWithBackup<T>(filePath: string, fallback: T): Promise<T> {
  const backupPath = `${filePath}.bak`;
  const primary = await readJsonFile<T>(filePath);
  if (primary !== null) return primary;

  const backup = await readJsonFile<T>(backupPath);
  return backup ?? fallback;
}

export function readJsonWithBackupSync<T>(filePath: string, fallback: T): T {
  const primary = readJsonFileSync<T>(filePath);
  if (primary !== null) return primary;

  const backup = readJsonFileSync<T>(`${filePath}.bak`);
  return backup ?? fallback;
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });
  await copyFile(filePath, `${filePath}.bak`).catch(() => {});
  await rename(tempPath, filePath);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readJsonFileSync<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}
