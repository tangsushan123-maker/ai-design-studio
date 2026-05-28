import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { fileCacheHeaders, requestMatchesFileCache } from "@/lib/http-file-cache";

const generatedRoot = path.join(process.cwd(), "public", "generated");
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const params = await context.params;
  const segments = params.path || [];
  if (!segments.length || segments.some((segment) => segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(generatedRoot, ...segments);
  const relative = path.relative(generatedRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new NextResponse("Not found", { status: 404 });
    const ext = path.extname(filePath).toLowerCase();
    const headers = fileCacheHeaders(fileStat, contentTypes[ext] || "application/octet-stream", "public, max-age=604800");
    if (requestMatchesFileCache(request, headers.ETag, fileStat.mtimeMs)) {
      return new NextResponse(null, { status: 304, headers });
    }
    const body = await readFile(filePath);
    return new NextResponse(body, {
      headers,
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
