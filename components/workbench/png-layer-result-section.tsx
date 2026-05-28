import { ArrowDownToLine } from "lucide-react";
import { formatFileSize } from "@/lib/workbench-format";
import { ImageFrame } from "@/components/workbench/image-frame";
import { pngLayerDisplayName, pngLayerPreviewImage } from "@/components/workbench/workbench-image-display";
import type { PngLayerExportLayer, PngLayerExportResult } from "@/components/workbench/result-preview-tools";

export function PngLayerResultSection({
  activeFilename,
  onDownloadLayer,
  onPreviewLayer,
  onShowComposite,
  result,
}: {
  activeFilename: string;
  onDownloadLayer: (layer: PngLayerExportLayer) => void | Promise<void>;
  onPreviewLayer: (layer: PngLayerExportLayer) => void;
  onShowComposite: () => void;
  result: PngLayerExportResult;
}) {
  const layers = [...result.layers].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <section className="apple-surface-section p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="apple-section-title">PNG 三层结果</div>
          <div className="apple-caption mt-1">{result.canvasWidth} × {result.canvasHeight}px · 按需单独下载</div>
        </div>
        <button
          className={`apple-button rounded-full px-2.5 py-1 text-[11px] ${!activeFilename ? "border-[#74e3c5]/36 text-[#adf8e5]" : ""}`}
          onClick={onShowComposite}
          type="button"
        >
          成品图
        </button>
      </div>
      <div className="space-y-2">
        {layers.map((layer) => (
          <div
            className={`rounded-[16px] border p-2 transition ${activeFilename === layer.filename ? "border-[#74e3c5]/42 bg-[#74e3c5]/10" : "border-white/10 bg-white/[0.035]"}`}
            key={layer.filename}
          >
            <button
              className="grid w-full grid-cols-[74px_minmax(0,1fr)] gap-2 text-left"
              onClick={() => onPreviewLayer(layer)}
              type="button"
            >
              <ImageFrame
                alt={layer.name || layer.filename}
                className="rounded-[12px]"
                fit="contain"
                image={pngLayerPreviewImage(layer)}
                preserveRatio={false}
                showCheckerboard
                variant="thumbnail"
                style={{ height: 82, width: 74 }}
              />
              <div className="min-w-0 py-1">
                <div className="truncate text-[11px] font-semibold text-white/82">{pngLayerDisplayName(layer)}</div>
                <div className="mt-1 truncate text-[11px] text-white/42">{layer.filename}</div>
                <div className="mt-1 text-[11px] text-white/46">
                  透明 {Math.round(layer.transparentPixelRatio * 100)}% · {formatFileSize(layer.fileSizeBytes)}
                </div>
              </div>
            </button>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button className="apple-button px-2 py-1.5 text-[11px]" onClick={() => onPreviewLayer(layer)} type="button">
                预览
              </button>
              <button className="apple-button-primary flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold" onClick={() => void onDownloadLayer(layer)} type="button">
                <ArrowDownToLine className="size-3" />
                下载
              </button>
            </div>
          </div>
        ))}
      </div>
      {result.warnings?.length ? (
        <div className="mt-2 rounded-[12px] border border-[#f5c66a]/24 bg-[#f5c66a]/10 p-2 text-[11px] leading-5 text-[#ffe2a3]">
          {result.warnings.slice(0, 2).map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
