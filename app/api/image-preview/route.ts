import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { fileCacheHeaders, requestMatchesFileCache } from "@/lib/http-file-cache";
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
    const headers = fileCacheHeaders(fileStat, "image/webp", "public, max-age=31536000, immutable", "preview");
    if (requestMatchesFileCache(request, headers.ETag, fileStat.mtimeMs)) {
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
