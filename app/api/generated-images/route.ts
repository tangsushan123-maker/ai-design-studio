import { NextResponse } from "next/server";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { listGeneratedImages } from "@/lib/generated-history";
import { getGeneratedDir } from "@/lib/image-utils";
import { writeJsonAtomic } from "@/lib/local-json-store";

export const runtime = "nodejs";

const generatedTrashDirName = "_trash";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || 20);
  const offset = Number(searchParams.get("offset") || 0);
  const projectId = searchParams.get("projectId") || undefined;
  const trashOnly = searchParams.get("trash") === "1" || searchParams.get("mode") === "trash";
  const requestIds = (searchParams.get("requestIds") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return NextResponse.json(await listGeneratedImages({ limit, offset, projectId, requestIds, trashOnly }));
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      fileName?: string;
      metadata?: Record<string, unknown>;
    };
    const fileName = body.fileName || "";

    if (!fileName) {
      return NextResponse.json({ error: "请选择要更新的图片。" }, { status: 400 });
    }

    if (!isSafeGeneratedRelativePath(fileName)) {
      return NextResponse.json({ error: "图片文件名不合法。" }, { status: 400 });
    }

    if (body.action === "restore") {
      const restored = await restoreGeneratedImage(fileName);
      return NextResponse.json({ ok: true, ...restored });
    }

    const dir = getGeneratedDir();
    const metadataPath = path.join(dir, `${fileName}.json`);
    const raw = await readFile(metadataPath, "utf8").catch(() => "{}");
    const current = JSON.parse(raw) as Record<string, unknown>;
    const next = {
      ...current,
      ...(body.metadata || {}),
      updatedAt: new Date().toISOString(),
    };

    await writeJsonAtomic(metadataPath, next);

    return NextResponse.json({ ok: true, fileName, metadata: next });
  } catch {
    return NextResponse.json({ error: "更新图片信息失败，请稍后重试。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { fileName?: string; permanent?: boolean };
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

    if (body.permanent || fileName.startsWith(`${generatedTrashDirName}/`)) {
      await unlink(imagePath).catch(() => {});
      await unlink(metadataPath).catch(() => {});
      return NextResponse.json({ ok: true, fileName, permanent: true });
    }

    const trashFileName = await moveGeneratedImageToTrash(fileName);

    return NextResponse.json({ ok: true, fileName, trashFileName, trashed: true });
  } catch {
    return NextResponse.json({ error: "删除失败，请稍后重试。" }, { status: 500 });
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

  const raw = await readFile(sourceMetadataPath, "utf8").catch(() => "{}");
  const current = JSON.parse(raw) as Record<string, unknown>;
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
  const raw = await readFile(sourceMetadataPath, "utf8").catch(() => "{}");
  const current = JSON.parse(raw) as Record<string, unknown>;
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

function isSafeGeneratedRelativePath(fileName: string) {
  if (!fileName || path.isAbsolute(fileName)) return false;
  const normalized = path.normalize(fileName);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return /\.(png|jpg|jpeg|webp)$/i.test(normalized);
}
