"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import {
  inferSimpleMaskEditIntent,
  maskEditEdgeBlendParam,
  maskEditProtectionStrengthParam,
  maskEditRegionTypeParam,
  maskEditTaskModeParam,
  maskQuickActions,
  type MaskEditEdgeBlend,
  type MaskEditProtectionStrength,
  type MaskEditRegionType,
  type MaskEditTaskMode,
} from "./mask-editing";

type MaskEditorImage = {
  id: string;
  url: string;
  fileName?: string;
};

type MaskEditorSaveOptions = {
  prompt: string;
  taskMode: MaskEditTaskMode;
  regionType: MaskEditRegionType;
  protectionStrength: MaskEditProtectionStrength;
  edgeBlend: MaskEditEdgeBlend;
  maskPixelCount: number;
  maskCoverage: number;
  maskCanvasWidth: number;
  maskCanvasHeight: number;
};

export function MaskEditorModal({
  draftKey,
  image,
  initialMaskUrl,
  initialPrompt,
  initialTaskMode,
  initialRegionType,
  initialProtectionStrength,
  initialEdgeBlend,
  onClose,
  onSave,
}: {
  draftKey: string;
  image: MaskEditorImage;
  initialMaskUrl: string;
  initialPrompt: string;
  initialTaskMode: MaskEditTaskMode;
  initialRegionType: MaskEditRegionType;
  initialProtectionStrength: MaskEditProtectionStrength;
  initialEdgeBlend: MaskEditEdgeBlend;
  onClose: () => void;
  onSave: (maskDataUrl: string, options: MaskEditorSaveOptions) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draft = useMemo(() => readMaskEditorDraft(draftKey, maskEditorImageKey(image)), [draftKey, image]);
  const [prompt, setPrompt] = useState(draft?.prompt ?? initialPrompt);
  const [taskMode, setTaskMode] = useState<MaskEditTaskMode>(draft?.taskMode ?? initialTaskMode);
  const [regionType, setRegionType] = useState<MaskEditRegionType>(draft?.regionType ?? initialRegionType);
  const [protectionStrength, setProtectionStrength] = useState<MaskEditProtectionStrength>(draft?.protectionStrength ?? initialProtectionStrength);
  const [edgeBlend, setEdgeBlend] = useState<MaskEditEdgeBlend>(draft?.edgeBlend ?? initialEdgeBlend);
  const [brushSize, setBrushSize] = useState(48);
  const [brushMode, setBrushMode] = useState<"paint" | "erase">("paint");
  const [showMask, setShowMask] = useState(true);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [status, setStatus] = useState(draft ? "已恢复上次未保存的涂抹草稿。" : "涂抹要修改的区域，未涂抹部分会保持不变。");
  const undoStackRef = useRef<ImageData[]>([]);
  const initialMaskSource = draft?.maskDataUrl || initialMaskUrl;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoMaskStroke();
        return;
      }
      if (event.key.toLowerCase() === "b") setBrushMode("paint");
      if (event.key.toLowerCase() === "e") setBrushMode("erase");
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let cancelled = false;
    const preview = new Image();
    preview.crossOrigin = "anonymous";
    preview.onload = async () => {
      if (cancelled) return;
      const width = preview.naturalWidth || 1;
      const height = preview.naturalHeight || 1;
      const ratio = Math.min(1, 760 / Math.max(1, width), 360 / Math.max(1, height));
      const displayWidth = Math.round(width * ratio);
      const displayHeight = Math.round(height * ratio);
      setDisplaySize({ width: displayWidth, height: displayHeight });
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      if (initialMaskSource) {
        const mask = new Image();
        mask.crossOrigin = "anonymous";
        mask.onload = () => {
          if (cancelled) return;
          context.clearRect(0, 0, width, height);
          context.drawImage(mask, 0, 0, width, height);
          normalizeMaskCanvasForEditor(context, width, height);
          setStatus(hasPaintedMask(canvas) ? "已加载之前的涂抹区域。继续补画或重新生成即可。" : "未检测到有效涂抹，请重新涂抹后生成。");
        };
        mask.onerror = () => {
          if (cancelled) return;
          resetMaskCanvas(context, width, height);
          setStatus("旧涂抹加载失败，请重新涂抹后生成。");
        };
        mask.src = toAbsoluteImageUrl(initialMaskSource);
      } else {
        resetMaskCanvas(context, width, height);
      }
    };
    preview.src = image.url;

    return () => {
      cancelled = true;
    };
  }, [image.url, initialMaskSource]);

  useEffect(() => {
    if (!draftKey) return;
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      writeMaskEditorDraft(draftKey, {
        imageKey: maskEditorImageKey(image),
        imageUrl: image.url,
        maskDataUrl: canvas && hasPaintedMask(canvas) ? canvas.toDataURL("image/png") : draft?.maskDataUrl,
        prompt,
        taskMode,
        regionType,
        protectionStrength,
        edgeBlend,
        savedAt: Date.now(),
      });
    }, 520);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftRevision, edgeBlend, image, prompt, protectionStrength, regionType, taskMode, draft?.maskDataUrl]);

  function drawStroke(from: { x: number; y: number } | null, to: { x: number; y: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = brushMode === "paint" ? "source-over" : "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brushSize;
    context.strokeStyle = "rgba(255,78,88,0.54)";
    context.beginPath();
    if (from) {
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    } else {
      context.arc(to.x, to.y, Math.max(1, brushSize / 2), 0, Math.PI * 2);
      context.fillStyle = "rgba(255,78,88,0.54)";
      context.fill();
    }
    context.restore();
  }

  function pushMaskUndoState() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    undoStackRef.current = [
      ...undoStackRef.current.slice(-19),
      context.getImageData(0, 0, canvas.width, canvas.height),
    ];
  }

  function undoMaskStroke() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const previous = undoStackRef.current.pop();
    if (!canvas || !context || !previous) {
      setStatus("没有可撤销的涂抹。");
      return;
    }
    context.putImageData(previous, 0, 0);
    setStatus("已撤销上一步涂抹。");
    setDraftRevision((value) => value + 1);
  }

  function updateBrushSize(value: number) {
    setBrushSize(Math.max(8, Math.min(160, Math.round(value))));
  }

  function clearMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    pushMaskUndoState();
    resetMaskCanvas(context, canvas.width, canvas.height);
    setStatus("已清空涂抹。");
    setDraftRevision((value) => value + 1);
  }

  function restoreOriginalPreview() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    pushMaskUndoState();
    resetMaskCanvas(context, canvas.width, canvas.height);
    setPrompt("去掉这里并补全背景");
    setTaskMode("cleanup");
    setRegionType("auto");
    setProtectionStrength("strict");
    setEdgeBlend("weak");
    setStatus("已恢复原图预览，重新涂抹即可。");
    setDraftRevision((value) => value + 1);
  }

  function applyQuickAction(action: (typeof maskQuickActions)[number]) {
    setTaskMode(action.mode);
    setPrompt(action.prompt);
    setProtectionStrength(action.protection);
    if (action.region) setRegionType(action.region);
    if (action.edge) setEdgeBlend(action.edge);
    setStatus(`已填入：${action.label}。继续涂抹区域后点击生成。`);
  }

  function handlePointer(event: ReactMouseEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    pushMaskUndoState();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let lastPoint = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    drawStroke(null, lastPoint);
    let drawing = true;
    const move = (moveEvent: MouseEvent) => {
      if (!drawing) return;
      const nextPoint = {
        x: (moveEvent.clientX - rect.left) * scaleX,
        y: (moveEvent.clientY - rect.top) * scaleY,
      };
      drawStroke(lastPoint, nextPoint);
      lastPoint = nextPoint;
    };
    const up = () => {
      drawing = false;
      setDraftRevision((value) => value + 1);
      setStatus(maskCoverageStatus(canvas));
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  async function saveMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isSaving) return;
    if (!hasPaintedMask(canvas)) {
      setStatus("请先涂抹要修改的区域。");
      return;
    }
    const finalPrompt = prompt.trim() || "去掉这里并补全背景";
    const intent = inferSimpleMaskEditIntent(finalPrompt, { taskMode, regionType, protectionStrength, edgeBlend });
    try {
      setIsSaving(true);
      setStatus("正在生成局部修改...");
      const maskPixelCount = countEditableMaskPixels(canvas);
      await onSave(exportEditableMaskDataUrl(canvas), {
        prompt: finalPrompt,
        maskPixelCount,
        maskCoverage: maskPixelCount / Math.max(1, canvas.width * canvas.height),
        maskCanvasWidth: canvas.width,
        maskCanvasHeight: canvas.height,
        ...intent,
      });
    } catch (error) {
      setStatus(error instanceof Error ? `局部修改启动失败：${error.message}` : "局部修改启动失败，请重新涂抹后再试。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(10,15,24,0.64)] p-4 backdrop-blur-2xl" onClick={onClose}>
      <div
        className="apple-panel-strong flex max-h-[92vh] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white/88">局部 AI 修改</div>
            <div className="apple-caption mt-0.5">只修改涂抹区域，其他部分保持不变。</div>
          </div>
          <button aria-label="关闭局部 AI 修改" className="apple-button flex size-8 items-center justify-center text-white/62" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="apple-surface-section mb-3 space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="apple-field-label">快捷指令</span>
              {maskQuickActions.map((action) => (
                <button
                  className={`${prompt === action.prompt ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[11px]`}
                  key={action.label}
                  onClick={() => applyQuickAction(action)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
              <span className="apple-pill ml-auto px-2.5 py-1 text-[11px]">{status}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.035] p-2">
              <span className="apple-field-label">涂抹工具</span>
              <button className={`${brushMode === "paint" ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[11px]`} onClick={() => setBrushMode("paint")} type="button">
                画笔
              </button>
              <button className={`${brushMode === "erase" ? "apple-button-primary font-semibold" : "apple-button"} px-2.5 py-1.5 text-[11px]`} onClick={() => setBrushMode("erase")} type="button">
                橡皮擦
              </button>
              <label className="flex min-w-[190px] items-center gap-2 text-[11px] text-white/56">
                <span>画笔大小</span>
                <input
                  className="h-1 flex-1 accent-[#74e3c5]"
                  max={160}
                  min={8}
                  onChange={(event) => updateBrushSize(Number(event.target.value))}
                  type="range"
                  value={brushSize}
                />
                <span className="w-8 text-right text-white/70">{brushSize}</span>
              </label>
              <button className="apple-button px-2.5 py-1.5 text-[11px] text-white/66" onClick={undoMaskStroke} type="button">
                撤销
              </button>
              <button className="apple-button px-2.5 py-1.5 text-[11px] text-white/66" onClick={clearMask} type="button">
                清空涂抹
              </button>
              <button
                className="apple-button px-2.5 py-1.5 text-[11px] text-white/66"
                onPointerDown={() => setShowMask(false)}
                onPointerLeave={() => setShowMask(true)}
                onPointerUp={() => setShowMask(true)}
                type="button"
              >
                按住对比原图
              </button>
            </div>
          </div>
          <div className="flex justify-center">
            <div
              className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#050608]"
              style={{
                width: displaySize.width ? `${displaySize.width}px` : undefined,
                height: displaySize.height ? `${displaySize.height}px` : undefined,
                maxWidth: "88vw",
                maxHeight: "42vh",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Local/generated image URLs must render without Next image optimization. */}
              <img alt={image.fileName || image.id} className="block h-full w-full select-none object-contain" draggable={false} src={image.url} />
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 h-full w-full cursor-crosshair touch-none ${showMask ? "opacity-100" : "opacity-0"}`}
                onMouseDown={handlePointer}
                title="按住鼠标在图上涂抹"
              />
            </div>
          </div>
        </div>
        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="apple-surface-section p-3">
            <label className="block">
              <span className="apple-field-label mb-1 block">修改指令</span>
              <textarea
                autoFocus
                className="apple-textarea nodrag min-h-[96px] w-full resize-none px-3 py-2 text-[12px] leading-5 outline-none"
                onKeyDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：去掉这里 / 去掉文字并补全背景 / 换成蓝色科技背景 / 局部高清修复"
                value={prompt}
              />
            </label>
            {regionType === "logo" || regionType === "qrcode" ? (
              <div className="mt-2 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 px-3 py-2 text-[11px] leading-5 text-[#ffe1a3]">
                {regionType === "logo" ? "Logo 建议用上传素材覆盖，避免 AI 重绘变形。" : "二维码不要交给 AI 重绘，需要保留或用真实二维码素材替换。"}
              </div>
            ) : null}
            {regionType === "face" ? (
              <div className="mt-2 rounded-[14px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[11px] leading-5 text-[#adf8e5]">
                人脸区域默认使用严格保护，只修局部瑕疵、光影和质感，避免变脸。
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button className="apple-button px-3 py-2 text-[11px] text-white/72" onClick={restoreOriginalPreview} type="button">
              恢复原图
            </button>
            <button className="apple-button ml-auto px-3 py-2 text-[11px] text-white/72" onClick={onClose} type="button">
              关闭
            </button>
            <button className="apple-button-primary px-3 py-2 text-[11px] font-semibold disabled:opacity-55" disabled={isSaving} onClick={() => void saveMask()} type="button">
              {isSaving ? "生成中..." : "生成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type MaskEditorDraft = {
  imageKey: string;
  imageUrl: string;
  maskDataUrl?: string;
  prompt: string;
  taskMode: MaskEditTaskMode;
  regionType: MaskEditRegionType;
  protectionStrength: MaskEditProtectionStrength;
  edgeBlend: MaskEditEdgeBlend;
  savedAt: number;
};

function readMaskEditorDraft(key: string, expectedImageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<MaskEditorDraft>;
    if (!draft || draft.imageKey !== expectedImageKey) return null;
    if (draft.savedAt && Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return {
      imageKey: draft.imageKey,
      imageUrl: draft.imageUrl || "",
      maskDataUrl: typeof draft.maskDataUrl === "string" ? draft.maskDataUrl : "",
      prompt: typeof draft.prompt === "string" ? draft.prompt : "",
      taskMode: maskEditTaskModeParam(draft.taskMode),
      regionType: maskEditRegionTypeParam(draft.regionType),
      protectionStrength: maskEditProtectionStrengthParam(draft.protectionStrength),
      edgeBlend: maskEditEdgeBlendParam(draft.edgeBlend),
      savedAt: Number(draft.savedAt) || Date.now(),
    } satisfies MaskEditorDraft;
  } catch {
    return null;
  }
}

function writeMaskEditorDraft(key: string, draft: MaskEditorDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    try {
      window.sessionStorage.setItem(key, JSON.stringify({ ...draft, maskDataUrl: "" }));
    } catch {
      // If browser storage is full, normal project save and explicit mask save still work.
    }
  }
}

export function clearMaskEditorDraft(key: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
}

function resetMaskCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);
}

function normalizeMaskCanvasForEditor(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const stats = canvasMaskStats(imageData.data);
  const output = context.createImageData(width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const editable = isEditableMaskPixel(imageData.data, index, stats);
    output.data[index] = 255;
    output.data[index + 1] = 78;
    output.data[index + 2] = 88;
    output.data[index + 3] = editable ? 138 : 0;
  }
  context.putImageData(output, 0, 0);
}

function exportEditableMaskDataUrl(canvas: HTMLCanvasElement) {
  const sourceContext = canvas.getContext("2d");
  if (!sourceContext) return canvas.toDataURL("image/png");
  const imageData = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
  const stats = canvasMaskStats(imageData.data);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) return canvas.toDataURL("image/png");
  const output = outputContext.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const editable = isEditableMaskPixel(imageData.data, index, stats);
    const value = editable ? 255 : 0;
    output.data[index] = value;
    output.data[index + 1] = value;
    output.data[index + 2] = value;
    output.data[index + 3] = 255;
  }
  outputContext.putImageData(output, 0, 0);
  return outputCanvas.toDataURL("image/png");
}

function hasPaintedMask(canvas: HTMLCanvasElement) {
  return countEditableMaskPixels(canvas) > 0;
}

function countEditableMaskPixels(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const stats = canvasMaskStats(data);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (isEditableMaskPixel(data, index, stats)) count += 1;
  }
  return count;
}

function maskCoverageStatus(canvas: HTMLCanvasElement) {
  const count = countEditableMaskPixels(canvas);
  if (!count) return "未检测到有效涂抹，请重新涂抹后生成。";
  const percent = (count / Math.max(1, canvas.width * canvas.height)) * 100;
  if (percent < 0.01) return "已涂抹很小区域，系统会自动放大蒙版边缘。";
  return `已涂抹 ${percent.toFixed(percent < 1 ? 2 : 1)}% 区域。`;
}

function canvasMaskStats(data: Uint8ClampedArray) {
  const alphaHistogram = new Uint32Array(256);
  let lowAlphaCount = 0;
  let redPaintCount = 0;
  let whiteCount = 0;
  let blackCount = 0;
  const pixelCount = Math.max(1, data.length / 4);
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] || 0;
    const g = data[index + 1] || 0;
    const b = data[index + 2] || 0;
    const alpha = data[index + 3] || 0;
    alphaHistogram[alpha] += 1;
    if (alpha < 168) lowAlphaCount += 1;
    if (alpha > 8 && isEditorRedMaskPixel(r, g, b)) redPaintCount += 1;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (alpha > 8 && luma > 180) whiteCount += 1;
    if (alpha > 8 && luma < 72) blackCount += 1;
  }
  let dominantAlpha = 255;
  let dominantCount = -1;
  for (let alpha = 0; alpha < alphaHistogram.length; alpha += 1) {
    if (alphaHistogram[alpha] > dominantCount) {
      dominantAlpha = alpha;
      dominantCount = alphaHistogram[alpha];
    }
  }
  return { blackCount, dominantAlpha, lowAlphaCount, pixelCount, redPaintCount, whiteCount };
}

function isEditableMaskPixel(
  data: Uint8ClampedArray,
  index: number,
  stats: ReturnType<typeof canvasMaskStats>,
) {
  const r = data[index] || 0;
  const g = data[index + 1] || 0;
  const b = data[index + 2] || 0;
  const alpha = data[index + 3] || 0;
  if (stats.redPaintCount > 0) return alpha > 8 && isEditorRedMaskPixel(r, g, b);
  const alphaCutoff = stats.dominantAlpha >= 250 ? 250 : Math.max(1, stats.dominantAlpha - 1);
  const alphaCoverage = stats.lowAlphaCount / Math.max(1, stats.pixelCount);
  if (stats.lowAlphaCount > 0 && alphaCoverage < 0.96 && alpha < alphaCutoff) return true;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const whiteCoverage = stats.whiteCount / Math.max(1, stats.pixelCount);
  const blackCoverage = stats.blackCount / Math.max(1, stats.pixelCount);
  if (whiteCoverage > 0 && whiteCoverage <= 0.9 && (blackCoverage <= 0 || whiteCoverage <= blackCoverage)) return alpha > 8 && luma > 180;
  if (blackCoverage > 0 && blackCoverage <= 0.9) return alpha > 8 && luma < 72;
  return false;
}

function isEditorRedMaskPixel(r: number, g: number, b: number) {
  return r > 160 && g >= 32 && g < 140 && b >= 32 && b < 150 && r - Math.max(g, b) > 70;
}

function maskEditorImageKey(image: Pick<MaskEditorImage, "fileName" | "id" | "url">) {
  return image.fileName || image.id || image.url;
}

function toAbsoluteImageUrl(url: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  return new URL(url, window.location.origin).toString();
}
