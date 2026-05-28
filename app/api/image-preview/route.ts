import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { ensureImageVariantForPublicUrl, type ImageVariantKind } from "@/lib/image-utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const src = String(url.searchParams.get("src") || "");
    const kind = normalizeKind(url.searchParams.get("kind"));
    if (!src) {
      return NextResponse.json({ error: "缺少图片地址。" }, { status: 400 });
    }

    const variant = await ensureImageVariantForPublicUrl(src, kind);
    const fileStat = await stat(variant.path);
    const etag = imagePreviewEtag(fileStat);
    const lastModified = fileStat.mtime.toUTCString();
    const headers = {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(fileStat.size),
      "Content-Type": "image/webp",
      "ETag": etag,
      "Last-Modified": lastModified,
    };
    if (requestMatchesImagePreview(request, etag, Number(fileStat.mtimeMs))) {
      return new NextResponse(null, { status: 304, headers });
    }
    const buffer = await readFile(variant.path);

    return new NextResponse(buffer, {
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成预览图失败。" },
      { status: 400 },
    );
  }
}

function normalizeKind(value: string | null): ImageVariantKind {
  return value === "thumbnail" ? "thumbnail" : "preview";
}

function imagePreviewEtag(fileStat: { size: number | bigint; mtimeMs: number | bigint }) {
  return `"preview-${Number(fileStat.size)}-${Math.trunc(Number(fileStat.mtimeMs))}"`;
}

function requestMatchesImagePreview(request: Request, etag: string, mtimeMs: number) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.split(",").map((item) => item.trim()).includes(etag)) return true;
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const modifiedSinceTime = new Date(ifModifiedSince).getTime();
  return Number.isFinite(modifiedSinceTime) && modifiedSinceTime >= Math.trunc(mtimeMs / 1000) * 1000;
}
