import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 50 * 1024 * 1024;
const maxRedirects = 3;

export async function POST(request: Request) {
  try {
    const body = await parseImportImagePayload(request);
    const url = String(body.url || "").trim();

    if (!url) {
      return NextResponse.json({ error: "没有检测到可导入的图片链接。" }, { status: 400 });
    }

    const response = await fetchAllowedImageUrl(url);

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
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取剪贴板图片失败，请改用拖拽或本地上传。" }, { status: 400 });
  }
}

class InvalidImportImagePayloadError extends Error {}

async function parseImportImagePayload(request: Request): Promise<{ url?: string }> {
  try {
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new InvalidImportImagePayloadError("导入图片请求格式不正确。");
    }
    return body as { url?: string };
  } catch (error) {
    if (error instanceof InvalidImportImagePayloadError) throw error;
    throw new InvalidImportImagePayloadError("导入图片 JSON 无法解析，请重新复制图片链接后重试。");
  }
}

async function fetchAllowedImageUrl(url: string) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const parsed = parseImageUrl(currentUrl);
    await assertPublicHttpImageUrl(parsed);
    const response = await fetch(parsed.toString(), {
      headers: {
        accept: "image/png,image/jpeg,image/webp",
        "user-agent": "AI Design Workbench Image Importer",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });

    if (isRedirectResponse(response.status)) {
      const location = response.headers.get("location");
      if (!location) return response;
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    return response;
  }
  throw new Error("图片链接重定向次数过多，请改用拖拽或本地上传。");
}

async function assertPublicHttpImageUrl(parsed: URL) {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只支持导入网页图片链接。");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("不支持导入本机或内网图片链接。");
  }

  const literalIp = isIP(hostname) ? [hostname] : [];
  const resolvedIps = literalIp.length ? literalIp : (await lookup(hostname, { all: true })).map((entry) => entry.address);
  if (!resolvedIps.length || resolvedIps.some(isPrivateAddress)) {
    throw new Error("不支持导入本机或内网图片链接。");
  }
}

function parseImageUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    throw new Error("图片链接格式不正确，请改用拖拽或本地上传。");
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isRedirectResponse(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isPrivateAddress(address: string) {
  const normalizedAddress = normalizeHostname(address);
  const mappedIpv4 = normalizedAddress.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);
  address = normalizedAddress;
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const parts = address.split(".").map(Number);
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
