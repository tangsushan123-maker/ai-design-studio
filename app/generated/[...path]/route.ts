import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

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
    const etag = generatedFileEtag(fileStat);
    const lastModified = fileStat.mtime.toUTCString();
    const headers = {
      "Cache-Control": "public, max-age=604800",
      "Content-Length": String(fileStat.size),
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "ETag": etag,
      "Last-Modified": lastModified,
    };
    if (requestMatchesGeneratedFile(request, etag, Number(fileStat.mtimeMs))) {
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

function generatedFileEtag(fileStat: { size: number | bigint; mtimeMs: number | bigint }) {
  return `"${Number(fileStat.size)}-${Math.trunc(Number(fileStat.mtimeMs))}"`;
}

function requestMatchesGeneratedFile(request: Request, etag: string, mtimeMs: number) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.split(",").map((item) => item.trim()).includes(etag)) return true;
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const modifiedSinceTime = new Date(ifModifiedSince).getTime();
  return Number.isFinite(modifiedSinceTime) && modifiedSinceTime >= Math.trunc(mtimeMs / 1000) * 1000;
}
