import { NextResponse } from "next/server";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { requireCurrentUser } from "@/lib/auth";
import { listGeneratedImages } from "@/lib/generated-history";
import { getGeneratedDir } from "@/lib/image-utils";
import { writeJsonAtomic } from "@/lib/local-json-store";

export const runtime = "nodejs";

const generatedTrashDirName = "_trash";
const generatedImageListMaxLimit = 100;
const generatedImagePayloadMessages = {
  updateInvalid: "更新图片请求格式不正确。",
  updateJson: "更新图片 JSON 无法解析，请刷新图片列表后重试。",
  deleteInvalid: "删除图片请求格式不正确。",
  deleteJson: "删除图片 JSON 无法解析，请刷新图片列表后重试。",
};

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const limit = boundedListNumber(searchParams.get("limit"), 20, 1, generatedImageListMaxLimit);
    const offset = boundedListNumber(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const projectId = searchParams.get("projectId") || undefined;
    const trashOnly = searchParams.get("trash") === "1" || searchParams.get("mode") === "trash";
    const requestIds = (searchParams.get("requestIds") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const ownerUserId = user.role === "owner" ? searchParams.get("ownerUserId") || undefined : user.id;
    return NextResponse.json(await listGeneratedImages({
      limit,
      offset,
      projectId,
      ownerUserId,
      includeUnowned: user.role === "owner",
      requestIds,
      trashOnly,
    }));
  } catch (error) {
    return NextResponse.json({ error: generatedImageErrorMessage("读取图片列表失败", error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseGeneratedImagePayload(request, "update");
    const fileName = body.fileName || "";

    if (!fileName) {
      return NextResponse.json({ error: "请选择要更新的图片。" }, { status: 400 });
    }

    if (!isSafeGeneratedRelativePath(fileName)) {
      return NextResponse.json({ error: "图片文件名不合法。" }, { status: 400 });
    }

    const dir = getGeneratedDir();
    const metadataPath = path.join(dir, `${fileName}.json`);
    const current = await readGeneratedMetadata(metadataPath);
    if (!canManageGeneratedImage(user, current)) {
      return NextResponse.json({ error: "只能操作自己账号下的图片。" }, { status: 403 });
    }

    if (body.action === "restore") {
      const restored = await restoreGeneratedImage(fileName);
      return NextResponse.json({ ok: true, ...restored });
    }

    const next = {
      ...current,
      ...(body.metadata || {}),
      updatedAt: new Date().toISOString(),
    };

    await writeJsonAtomic(metadataPath, next);

    return NextResponse.json({ ok: true, fileName, metadata: next });
  } catch (error) {
    if (error instanceof InvalidGeneratedImagePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: generatedImageErrorMessage("更新图片信息失败", error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseGeneratedImagePayload(request, "delete");
    const fileName = body.fileName || "";

    if (!fileName) {
      return NextResponse.json({ error: "请选择要删除的图片。" }, { status: 400 });
    }

    if (!isSafeGeneratedRelativePath(fileName)) {
      return NextResponse.json({ error: "图片文件名不合法。" }, { status: 400 });
    }

    const dir = getGeneratedDir();
    const imagePath = path.join(dir, fileName);
    const metadataPath = path.join(dir, `${fileName}.json`);
    const current = await readGeneratedMetadata(metadataPath);
    if (!canManageGeneratedImage(user, current)) {
      return NextResponse.json({ error: "只能删除自己账号下的图片。" }, { status: 403 });
    }

    if (body.permanent || fileName.startsWith(`${generatedTrashDirName}/`)) {
      await unlink(imagePath).catch(() => {});
      await unlink(metadataPath).catch(() => {});
      return NextResponse.json({ ok: true, fileName, permanent: true });
    }

    const trashFileName = await moveGeneratedImageToTrash(fileName);

    return NextResponse.json({ ok: true, fileName, trashFileName, trashed: true });
  } catch (error) {
    if (error instanceof InvalidGeneratedImagePayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: generatedImageErrorMessage("删除失败", error) }, { status: 500 });
  }
}

class InvalidGeneratedImagePayloadError extends Error {}

async function parseGeneratedImagePayload(request: Request, mode: "update" | "delete"): Promise<{
  action?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
  permanent?: boolean;
}> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidGeneratedImagePayloadError(mode === "update" ? generatedImagePayloadMessages.updateInvalid : generatedImagePayloadMessages.deleteInvalid);
    }
    return body as {
      action?: string;
      fileName?: string;
      metadata?: Record<string, unknown>;
      permanent?: boolean;
    };
  } catch (error) {
    if (error instanceof InvalidGeneratedImagePayloadError) throw error;
    throw new InvalidGeneratedImagePayloadError(mode === "update" ? generatedImagePayloadMessages.updateJson : generatedImagePayloadMessages.deleteJson);
  }
}

async function moveGeneratedImageToTrash(fileName: string) {
  const dir = getGeneratedDir();
  const sourceImagePath = path.join(dir, fileName);
  const sourceMetadataPath = path.join(dir, `${fileName}.json`);
  const trashFileName = path.join(generatedTrashDirName, fileName);
  const trashImagePath = path.join(dir, trashFileName);
  const trashMetadataPath = path.join(dir, `${trashFileName}.json`);
  await mkdir(path.dirname(trashImagePath), { recursive: true });
  await rename(sourceImagePath, trashImagePath);

  const current = await readGeneratedMetadata(sourceMetadataPath);
  await writeJsonAtomic(trashMetadataPath, {
    ...current,
    trashed: true,
    deletedAt: new Date().toISOString(),
    originalFileName: fileName,
    updatedAt: new Date().toISOString(),
  });
  await unlink(sourceMetadataPath).catch(() => {});
  return trashFileName;
}

async function restoreGeneratedImage(fileName: string) {
  if (!fileName.startsWith(`${generatedTrashDirName}/`)) {
    throw new Error("只能恢复回收站里的图片。");
  }
  const dir = getGeneratedDir();
  const sourceImagePath = path.join(dir, fileName);
  const sourceMetadataPath = path.join(dir, `${fileName}.json`);
  const current = await readGeneratedMetadata(sourceMetadataPath);
  const originalFileName = typeof current.originalFileName === "string" && current.originalFileName
    ? current.originalFileName
    : fileName.replace(new RegExp(`^${generatedTrashDirName}/`), "");
  const restoredFileName = await uniqueGeneratedFileName(originalFileName);
  const restoredImagePath = path.join(dir, restoredFileName);
  const restoredMetadataPath = path.join(dir, `${restoredFileName}.json`);
  await mkdir(path.dirname(restoredImagePath), { recursive: true });
  await rename(sourceImagePath, restoredImagePath);
  const { trashed, deletedAt, originalFileName: _originalFileName, ...restoredMetadata } = current;
  void trashed;
  void deletedAt;
  void _originalFileName;
  await writeJsonAtomic(restoredMetadataPath, {
    ...restoredMetadata,
    restoredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await unlink(sourceMetadataPath).catch(() => {});
  return { fileName: restoredFileName, restoredFrom: fileName };
}

async function uniqueGeneratedFileName(fileName: string) {
  const dir = getGeneratedDir();
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 1;
  while (await fileExists(path.join(dir, candidate))) {
    candidate = path.join(parsed.dir, `${parsed.name}-restored-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readGeneratedMetadata(metadataPath: string) {
  const raw = await readFile(metadataPath, "utf8").catch(() => "{}");
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function canManageGeneratedImage(user: { id: string; role: "owner" | "user" }, metadata: Record<string, unknown>) {
  if (user.role === "owner") return true;
  return typeof metadata.ownerUserId === "string" && metadata.ownerUserId === user.id;
}

function isSafeGeneratedRelativePath(fileName: string) {
  if (!fileName || path.isAbsolute(fileName)) return false;
  const normalized = path.normalize(fileName);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return /\.(png|jpg|jpeg|webp)$/i.test(normalized);
}

function boundedListNumber(value: string | null, fallback: number, min: number, max: number) {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numberValue)));
}

function generatedImageErrorMessage(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const clean = message.replace(getGeneratedDir(), "[generated]").slice(0, 180);
  return clean ? `${prefix}：${clean}` : `${prefix}，请稍后重试。`;
}
