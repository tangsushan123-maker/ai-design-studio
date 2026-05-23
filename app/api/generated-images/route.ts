import { NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { listGeneratedImages } from "@/lib/generated-history";
import { getGeneratedDir } from "@/lib/image-utils";
import { writeJsonAtomic } from "@/lib/local-json-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || 20);
  const offset = Number(searchParams.get("offset") || 0);
  return NextResponse.json(await listGeneratedImages({ limit, offset }));
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
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
    const body = (await request.json().catch(() => ({}))) as { fileName?: string };
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

    await unlink(imagePath).catch(() => {});
    await unlink(metadataPath).catch(() => {});

    return NextResponse.json({ ok: true, fileName });
  } catch {
    return NextResponse.json({ error: "删除失败，请稍后重试。" }, { status: 500 });
  }
}

function isSafeGeneratedRelativePath(fileName: string) {
  if (!fileName || path.isAbsolute(fileName)) return false;
  const normalized = path.normalize(fileName);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return /\.(png|jpg|jpeg|webp)$/i.test(normalized);
}
