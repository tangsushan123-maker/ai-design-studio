"use client";

import { useMemo, useState, type CSSProperties } from "react";

type ImageShape = {
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
};

export function ImageFrame({
  alt,
  fit,
  image,
  loading = "lazy",
  preserveRatio = true,
  variant = "preview",
  style,
  ratioStyle,
  className = "",
  imgClassName = "",
}: {
  alt: string;
  fit?: "contain" | "cover";
  image: ImageShape;
  loading?: "eager" | "lazy";
  preserveRatio?: boolean;
  variant?: "thumbnail" | "preview" | "original";
  style?: CSSProperties;
  ratioStyle?: CSSProperties;
  className?: string;
  imgClassName?: string;
}) {
  const [loadState, setLoadState] = useState({ src: "", loaded: false, failed: false });
  const frameStyle = preserveRatio ? { ...ratioStyle, ...style } : style;
  const src = useMemo(() => imageUrlForVariant(image, variant), [image, variant]);
  const resolvedFit = fit || "contain";
  const loaded = loadState.src === src && loadState.loaded;
  const failed = loadState.src === src && loadState.failed;

  return (
    <div
      className={`relative overflow-hidden border border-white/10 bg-[rgba(10,14,22,0.82)] ${className}`.trim()}
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        ...frameStyle,
      }}
    >
      {!loaded && !failed ? (
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,rgba(255,255,255,0.04),rgba(255,255,255,0.1),rgba(255,255,255,0.04))]" />
      ) : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-white/42">图片不可用</div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={`block h-full w-full object-center transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"} ${resolvedFit === "cover" ? "object-cover" : "object-contain"} ${imgClassName}`.trim()}
          decoding="async"
          loading={loading}
          onError={() => setLoadState({ src, loaded: false, failed: true })}
          onLoad={() => setLoadState({ src, loaded: true, failed: false })}
        />
      )}
    </div>
  );
}

function imageUrlForVariant(image: ImageShape, variant: "thumbnail" | "preview" | "original") {
  if (variant === "original") return image.originalUrl || image.url;
  if (variant === "thumbnail") return image.thumbnailUrl || image.previewUrl || fallbackPreviewUrl(image.url, "thumbnail");
  return image.previewUrl || image.thumbnailUrl || fallbackPreviewUrl(image.url, "preview");
}

function fallbackPreviewUrl(url: string, kind: "thumbnail" | "preview") {
  if (!url.startsWith("/generated/")) return url;
  return `/api/image-preview?kind=${kind}&src=${encodeURIComponent(url)}`;
}
