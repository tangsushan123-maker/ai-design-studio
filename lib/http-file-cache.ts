export type FileCacheStat = {
  mtime: Date;
  mtimeMs: number | bigint;
  size: number | bigint;
};

export function fileEntityTag(fileStat: Pick<FileCacheStat, "mtimeMs" | "size">, prefix = "") {
  const label = prefix ? `${prefix}-` : "";
  return `"${label}${Number(fileStat.size)}-${Math.trunc(Number(fileStat.mtimeMs))}"`;
}

export function fileCacheHeaders(fileStat: FileCacheStat, contentType: string, cacheControl: string, etagPrefix = "") {
  return {
    "Cache-Control": cacheControl,
    "Content-Length": String(fileStat.size),
    "Content-Type": contentType,
    "ETag": fileEntityTag(fileStat, etagPrefix),
    "Last-Modified": fileStat.mtime.toUTCString(),
  };
}

export function requestMatchesFileCache(request: Request, etag: string, mtimeMs: number | bigint) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch?.split(",").map((item) => item.trim()).includes(etag)) return true;
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const modifiedSinceTime = new Date(ifModifiedSince).getTime();
  return Number.isFinite(modifiedSinceTime) && modifiedSinceTime >= Math.trunc(Number(mtimeMs) / 1000) * 1000;
}
