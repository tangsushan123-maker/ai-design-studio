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
    const [buffer, fileStat] = await Promise.all([
      readFile(variant.path),
      stat(variant.path),
    ]);

    return new NextResponse(buffer, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(fileStat.size),
        "Content-Type": "image/webp",
      },
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
