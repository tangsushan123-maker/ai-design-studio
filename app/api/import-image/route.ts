import { NextResponse } from "next/server";

export const runtime = "nodejs";

const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "没有检测到可导入的图片链接。" }, { status: 400 });
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "只支持导入网页图片链接。" }, { status: 400 });
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        accept: "image/png,image/jpeg,image/webp",
        "user-agent": "AI Design Workbench Image Importer",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "读取剪贴板图片链接失败，请改用拖拽或本地上传。" }, { status: 400 });
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
    if (!supportedTypes.has(contentType)) {
      return NextResponse.json({ error: "剪贴板链接不是 PNG、JPG 或 WebP 图片。" }, { status: 400 });
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) {
      return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
    }

    return new Response(buffer, {
      headers: {
        "content-length": String(buffer.byteLength),
        "content-type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ error: "读取剪贴板图片失败，请改用拖拽或本地上传。" }, { status: 400 });
  }
}
