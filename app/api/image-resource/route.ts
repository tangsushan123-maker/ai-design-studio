import { NextResponse } from "next/server";
import { inspectPngAlpha, readImageMetadata, saveImageBuffer, saveImageMetadata } from "@/lib/image-utils";
import { maxUploadBytes, supportedImageTypes } from "@/lib/request-guards";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const source = String(formData.get("source") || "upload");
    const materialType = String(formData.get("materialType") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "没有收到图片文件。" }, { status: 400 });
    }

    if (!supportedImageTypes.has(file.type)) {
      return NextResponse.json({ error: "图片格式不支持，请上传 PNG、JPG 或 WebP。" }, { status: 400 });
    }

    if (file.size > maxUploadBytes) {
      return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > maxUploadBytes) {
      return NextResponse.json({ error: "图片文件过大，请上传小于 50MB 的图片。" }, { status: 413 });
    }

    const extension = extensionFromMime(file.type);
    const saved = await saveImageBuffer(buffer, extension, {
      ratioLabel: materialType || "asset",
      quality: "standard",
    });
    const [metadata, alphaCheck] = await Promise.all([
      readImageMetadata(buffer),
      inspectPngAlpha(buffer).catch(() => ({
        hasAlphaChannel: false,
        hasTransparentPixels: false,
        transparentPixelRatio: 0,
        partialAlphaPixelRatio: 0,
      })),
    ]);
    const now = new Date().toISOString();

    const image = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt: "本地图片输入",
      variant: 0,
      mode: source === "asset" ? "项目素材" : "图片输入",
      model: "local",
      generatedAt: now,
      outputSize: { width: metadata.width || 1, height: metadata.height || 1 },
      fileSizeBytes: buffer.byteLength,
      width: metadata.width || 1,
      height: metadata.height || 1,
      fileName: file.name || saved.fileName,
      resourceFileName: saved.fileName,
      savedPath: saved.path,
      source,
      materialType: materialType || undefined,
      alphaCheck,
    };

    await saveImageMetadata(saved.fileName, {
      ...image,
      fileName: saved.fileName,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      originalFileName: file.name,
      mimeType: file.type,
      uploadSource: source,
      materialType: materialType || undefined,
      alphaCheck,
    });

    return NextResponse.json({
      ok: true,
      image: {
        ...image,
        id: saved.fileName,
        fileName: saved.fileName,
        resourceFileName: saved.fileName,
        originalFileName: file.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `保存图片资源失败：${error instanceof Error ? error.message : "未知错误"}`,
      },
      { status: 500 },
    );
  }
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}
