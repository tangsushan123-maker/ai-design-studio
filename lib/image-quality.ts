import sharp from "sharp";
import type { QualityValue } from "./design-options";
import { normalizeProtectionContext, type ProtectionContext } from "./design-production";
import { getTargetPixels, type PixelSize } from "./image-utils";

export type ImageQualityStatus =
  | "passed"
  | "pending"
  | "size_insufficient"
  | "ratio_mismatch"
  | "suspected_stretch"
  | "white_border"
  | "composition_risk"
  | "blurred_padding"
  | "failed"
  | "empty";

export type ImageDeliverabilityStatus = "ready" | "needs_review" | "not_ready";

export type ImageQualityCheckItem = {
  label: string;
  passed: boolean;
  detail?: string;
};

export type ImageQualityCheck = {
  status: ImageQualityStatus;
  label: string;
  issues: string[];
  actions: string[];
  width: number;
  height: number;
  ratio: number;
  targetWidth?: number;
  targetHeight?: number;
  format?: string;
  fileSizeBytes?: number;
  is4kTarget: boolean;
  reachedTargetSize: boolean;
  ratioMatched: boolean;
  suspectedStretch: boolean;
  hasWhiteBorder: boolean;
  compositionRisk?: boolean;
  compositionRiskLabel?: string;
  edgeContentRatio?: number;
  edgeHotSide?: string;
  edgeContentRatios?: Record<string, number>;
  safeMarginPercent?: number;
  suspectedBlurredPadding?: boolean;
  blurredPaddingLabel?: string;
  edgeDetailScore?: number;
  centerDetailScore?: number;
  importantContentRisk?: boolean;
  importantContentLabel?: string;
  protectedTextCount?: number;
  protectedAssetCount?: number;
  detailScore?: number;
  clarityScoreBefore?: number;
  clarityScoreAfter?: number;
  clarityGain?: number;
  clarityImproved?: boolean;
  clarityCheckLabel?: string;
  deliverability?: ImageDeliverabilityStatus;
  deliverabilityLabel?: string;
  textDetailRisk?: boolean;
  textDetailLabel?: string;
  fourKCheckItems?: ImageQualityCheckItem[];
  checkedAt: string;
};

type QualityInput = {
  quality?: QualityValue | string;
  targetSize?: PixelSize;
  expectedSize?: PixelSize;
  ratio?: PixelSize;
  aspectRatio?: string;
  fileSizeBytes?: number;
  protectionContext?: ProtectionContext;
  sourceImage?: Buffer | string;
  operation?: string;
  safeMarginPercent?: number;
  textDetailRecovery?: {
    applied?: boolean;
    coverage?: number;
    message?: string;
  };
};

export async function inspectImageQuality(input: Buffer | string, options: QualityInput = {}): Promise<ImageQualityCheck> {
  const metadata = await sharp(input).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const fileSizeBytes = options.fileSizeBytes ?? (typeof input === "string" ? undefined : input.byteLength);

  if (!width || !height) {
    return {
      status: "empty",
      label: "生成失败或空图",
      issues: ["图片没有有效宽高。"],
      actions: ["重新生成"],
      width,
      height,
      ratio: 0,
      format: metadata.format,
      fileSizeBytes,
      is4kTarget: options.quality === "4k",
      reachedTargetSize: false,
      ratioMatched: false,
      suspectedStretch: false,
      hasWhiteBorder: false,
      checkedAt: new Date().toISOString(),
    };
  }

  const target = resolveExpectedSize(options);
  const ratio = width / height;
  const targetRatio = target ? target.width / target.height : resolveExpectedRatio(options);
  const ratioMatched = targetRatio ? Math.abs(ratio - targetRatio) / targetRatio <= 0.018 : true;
  const reachedTargetSize = target ? width >= Math.round(target.width * 0.98) && height >= Math.round(target.height * 0.98) : true;
  const is4kTarget = options.quality === "4k" || Boolean(target && Math.max(target.width, target.height) >= 3840);
  const border = await detectWhiteBorder(input);
  const composition = await detectCompositionRisk(input, options.safeMarginPercent || 10);
  const rawBlurredPadding = await detectBlurredPaddingComposition(input);
  const sourceBlurredPadding = options.sourceImage ? await detectBlurredPaddingComposition(options.sourceImage) : null;
  const blurredPadding = normalizeBlurredPaddingRisk(rawBlurredPadding, sourceBlurredPadding, options.operation);
  const protection = summarizeProtection(options.protectionContext);
  const detailScore = await estimateDetailScore(input);
  const clarityComparison = options.sourceImage ? await compareImageClarity(options.sourceImage, input) : undefined;
  const textDetailRecovery = options.textDetailRecovery;
  const megapixels = (width * height) / 1_000_000;
  const bytesPerMegapixel = fileSizeBytes ? fileSizeBytes / Math.max(0.1, megapixels) : undefined;
  const suspectedStretch =
    Boolean(is4kTarget && detailScore < 9) ||
    Boolean(is4kTarget && bytesPerMegapixel && bytesPerMegapixel < 120_000) ||
    Boolean(Math.max(width, height) >= 3000 && detailScore < 6);

  const issues: string[] = [];
  const actions: string[] = [];
  if (!reachedTargetSize) {
    issues.push(target ? `实际尺寸 ${width}×${height}，未达到目标 ${target.width}×${target.height}。` : "实际尺寸未达到目标。");
    actions.push("重新生成4K");
  }
  if (!ratioMatched) {
    issues.push("实际比例与目标比例不一致。");
    actions.push("按原比例重新扩图");
  }
  if (border.hasWhiteBorder) {
    issues.push("检测到疑似白边或空白边缘，该结果不应视为可交付成品。");
    actions.push("重新生成，禁止白边");
  }
  if (composition.risk) {
    issues.push(composition.label);
    actions.push("重新生成：zoom out、缩小主体、增加安全边距");
  }
  if (blurredPadding.risk) {
    issues.push(blurredPadding.label);
    actions.push("重新生成：按目标比例原生构图，禁止模糊补边");
  }
  if (suspectedStretch) {
    issues.push("细节密度偏低，疑似只是放大或拉伸。");
    actions.push("高清重绘后再输出4K");
  }
  if (options.operation === "hd_redraw" && clarityComparison && !clarityComparison.improved) {
    issues.push("高清重绘后的清晰度提升不明显，请检查是否只是放大、锐化或模型未真正重绘。");
    actions.push("重新高清重绘");
  }
  if (protection.hasProtectedContent) {
    actions.push("检查文字/Logo/二维码");
  }
  if (protection.hasProtectedContent && options.operation !== "hd_redraw") {
    issues.push("包含项目真实文字、Logo、二维码或联系方式，交付前必须逐项核对。");
    actions.push("逐项核对项目真实信息");
  }

  const textDetailRisk = Boolean(
    options.operation === "hd_redraw"
    && protection.hasProtectedContent
    && (!textDetailRecovery?.applied || (clarityComparison && !clarityComparison.improved)),
  );
  const textDetailLabel = buildTextDetailLabel(protection, textDetailRecovery, clarityComparison);
  if (textDetailRisk) {
    issues.push(textDetailLabel || "重要文字、Logo 或二维码需要放大复查。");
    actions.push("放大检查文字/Logo/二维码，必要时走文字重建");
  }

  const status: ImageQualityStatus = !issues.length
    ? "passed"
    : !reachedTargetSize
      ? "size_insufficient"
      : !ratioMatched
        ? "ratio_mismatch"
          : border.hasWhiteBorder
            ? "white_border"
            : composition.risk
              ? "composition_risk"
              : blurredPadding.risk
                ? "blurred_padding"
                : suspectedStretch
                  ? "suspected_stretch"
                  : options.operation === "hd_redraw" && clarityComparison && !clarityComparison.improved
                    ? "pending"
                    : "pending";
  const fourKCheckItems = buildFourKCheckItems({
    reachedTargetSize,
    ratioMatched,
    hasWhiteBorder: border.hasWhiteBorder,
    compositionRisk: composition.risk,
    suspectedBlurredPadding: blurredPadding.risk,
    suspectedStretch,
    clarityComparison,
    protection,
    textDetailRecovery,
    target,
    width,
    height,
    operation: options.operation,
  });
  const deliverability = summarizeDeliverability(status, {
    textDetailRisk,
    clarityComparison,
    operation: options.operation,
  });

  return {
    status,
    label: options.operation === "hd_redraw"
      ? `${width}×${height}｜${deliverability.label}`
      : statusLabel(status, width, height, is4kTarget),
    issues,
    actions: actions.length ? Array.from(new Set(actions)) : ["下载原图"],
    width,
    height,
    ratio,
    targetWidth: target?.width,
    targetHeight: target?.height,
    format: metadata.format,
    fileSizeBytes,
    is4kTarget,
    reachedTargetSize,
    ratioMatched,
    suspectedStretch,
    hasWhiteBorder: border.hasWhiteBorder,
    compositionRisk: composition.risk,
    compositionRiskLabel: composition.label,
    edgeContentRatio: composition.edgeContentRatio,
    edgeHotSide: composition.hotSide,
    edgeContentRatios: composition.sideRatios,
    safeMarginPercent: composition.safeMarginPercent,
    suspectedBlurredPadding: blurredPadding.risk,
    blurredPaddingLabel: blurredPadding.label,
    edgeDetailScore: blurredPadding.edgeDetailScore,
    centerDetailScore: blurredPadding.centerDetailScore,
    importantContentRisk: protection.hasProtectedContent,
    importantContentLabel: protection.label,
    protectedTextCount: protection.textCount,
    protectedAssetCount: protection.assetCount,
    detailScore,
    clarityScoreBefore: clarityComparison?.before,
    clarityScoreAfter: clarityComparison?.after,
    clarityGain: clarityComparison?.gain,
    clarityImproved: clarityComparison?.improved,
    clarityCheckLabel: clarityComparison?.label,
    deliverability: deliverability.status,
    deliverabilityLabel: deliverability.label,
    textDetailRisk,
    textDetailLabel,
    fourKCheckItems,
    checkedAt: new Date().toISOString(),
  };
}

export async function compareImageClarity(beforeInput: Buffer | string, afterInput: Buffer | string) {
  const [before, after] = await Promise.all([
    estimateDetailScore(beforeInput),
    estimateDetailScore(afterInput),
  ]);
  const gain = Number((after - before).toFixed(2));
  const relativeGain = before > 0 ? gain / before : after > 0 ? 1 : 0;
  const improved = gain >= 0.6 || relativeGain >= 0.08;
  return {
    before: Number(before.toFixed(2)),
    after: Number(after.toFixed(2)),
    gain,
    relativeGain: Number(relativeGain.toFixed(3)),
    improved,
    label: improved ? `清晰度已提升 +${gain}` : `清晰度提升不明显 ${gain >= 0 ? "+" : ""}${gain}`,
  };
}

function summarizeProtection(context?: ProtectionContext) {
  const normalized = normalizeProtectionContext(context);
  const textCount = normalized.protectedTexts?.length || 0;
  const assetCount = normalized.protectedAssets?.length || 0;
  const hasProtectedContent = textCount > 0 || assetCount > 0;
  return {
    hasProtectedContent,
    textCount,
    assetCount,
    label: hasProtectedContent ? `重要信息待核对｜文字 ${textCount} / 资产 ${assetCount}` : undefined,
  };
}

function buildTextDetailLabel(
  protection: ReturnType<typeof summarizeProtection>,
  textDetailRecovery?: QualityInput["textDetailRecovery"],
  clarityComparison?: Awaited<ReturnType<typeof compareImageClarity>>,
) {
  if (!protection.hasProtectedContent) return undefined;
  const base = `重要信息保护｜文字 ${protection.textCount} / 资产 ${protection.assetCount}`;
  if (textDetailRecovery?.applied) {
    const coverage = `${(Math.max(0, textDetailRecovery.coverage || 0) * 100).toFixed(2)}%`;
    return `${base}｜已原图细节回贴 ${coverage}${clarityComparison?.improved ? "" : "，清晰度仍需复查"}`;
  }
  return `${base}｜未命中文字细节回贴，需要人工核对`;
}

function buildFourKCheckItems(input: {
  reachedTargetSize: boolean;
  ratioMatched: boolean;
  hasWhiteBorder: boolean;
  compositionRisk: boolean;
  suspectedBlurredPadding: boolean;
  suspectedStretch: boolean;
  clarityComparison?: Awaited<ReturnType<typeof compareImageClarity>>;
  protection: ReturnType<typeof summarizeProtection>;
  textDetailRecovery?: QualityInput["textDetailRecovery"];
  target?: PixelSize;
  width: number;
  height: number;
  operation?: string;
}): ImageQualityCheckItem[] {
  const items: ImageQualityCheckItem[] = [
    {
      label: "尺寸达标",
      passed: input.reachedTargetSize,
      detail: input.target ? `${input.width}×${input.height} / 目标 ${input.target.width}×${input.target.height}` : `${input.width}×${input.height}`,
    },
    {
      label: "比例正确",
      passed: input.ratioMatched,
      detail: input.ratioMatched ? "输出比例与目标一致" : "输出比例和目标不一致",
    },
    {
      label: "无白边空边",
      passed: !input.hasWhiteBorder,
      detail: input.hasWhiteBorder ? "检测到疑似白边或空白边缘" : "未检测到明显白边",
    },
    {
      label: "无磨砂补边",
      passed: !input.suspectedBlurredPadding,
      detail: input.suspectedBlurredPadding ? "边缘低细节、中心内容集中" : "未检测到模糊补边特征",
    },
    {
      label: "构图安全",
      passed: !input.compositionRisk,
      detail: input.compositionRisk ? "边缘重要内容偏多，可能贴边" : "边缘风险正常",
    },
    {
      label: "细节密度",
      passed: !input.suspectedStretch,
      detail: input.suspectedStretch ? "疑似只是插值放大" : "细节密度达标",
    },
  ];
  if (input.operation === "hd_redraw") {
    items.push({
      label: "清晰度提升",
      passed: input.clarityComparison ? input.clarityComparison.improved : true,
      detail: input.clarityComparison?.label || "无源图对比",
    });
    items.push({
      label: "文字/Logo保护",
      passed: !input.protection.hasProtectedContent || Boolean(input.textDetailRecovery?.applied),
      detail: input.protection.hasProtectedContent
        ? input.textDetailRecovery?.message || "重要信息需要人工核对"
        : "未检测到需保护的重要信息",
    });
  }
  return items;
}

function summarizeDeliverability(
  status: ImageQualityStatus,
  input: {
    textDetailRisk: boolean;
    clarityComparison?: Awaited<ReturnType<typeof compareImageClarity>>;
    operation?: string;
  },
): { status: ImageDeliverabilityStatus; label: string } {
  if (["size_insufficient", "ratio_mismatch", "white_border", "suspected_stretch", "failed", "empty"].includes(status)) {
    return { status: "not_ready", label: "不可交付，需重试" };
  }
  if (status === "composition_risk" || status === "blurred_padding" || input.textDetailRisk) {
    return { status: "needs_review", label: "可预览，需复查" };
  }
  if (input.operation === "hd_redraw" && input.clarityComparison && !input.clarityComparison.improved) {
    return { status: "needs_review", label: "清晰度待复查" };
  }
  if (status === "pending") return { status: "needs_review", label: "待人工复查" };
  return { status: "ready", label: "可交付" };
}

export function statusLabel(status: ImageQualityStatus, width?: number, height?: number, is4kTarget?: boolean) {
  if (status === "passed") return is4kTarget ? `${width}×${height}｜4K合格` : `${width}×${height}｜合格`;
  if (status === "size_insufficient") return `${width}×${height}｜尺寸不足`;
  if (status === "ratio_mismatch") return `${width}×${height}｜比例异常`;
  if (status === "suspected_stretch") return `${width}×${height}｜疑似拉伸`;
  if (status === "white_border") return `${width}×${height}｜有白边`;
  if (status === "composition_risk") return `${width}×${height}｜构图贴边`;
  if (status === "blurred_padding") return `${width}×${height}｜疑似补边`;
  if (status === "failed") return "生成失败";
  if (status === "empty") return "空图";
  return `${width || 0}×${height || 0}｜待检查`;
}

async function detectCompositionRisk(input: Buffer | string, safeMarginPercent: number) {
  const sample = await sharp(input)
    .resize(128, 128, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = sample;
  const channels = info.channels;
  const margin = Math.max(4, Math.round(Math.min(info.width, info.height) * Math.max(5, Math.min(20, safeMarginPercent)) / 100));
  const sideStats: Record<string, { hot: number; total: number }> = {
    left: { hot: 0, total: 0 },
    right: { hot: 0, total: 0 },
    top: { hot: 0, total: 0 },
    bottom: { hot: 0, total: 0 },
    center: { hot: 0, total: 0 },
  };

  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const hot = isHighContrastPixel(data, channels, info.width, x, y);
      const keys: string[] = [];
      if (x < margin) keys.push("left");
      if (x >= info.width - margin) keys.push("right");
      if (y < margin) keys.push("top");
      if (y >= info.height - margin) keys.push("bottom");
      if (!keys.length) keys.push("center");
      keys.forEach((key) => {
        sideStats[key].total += 1;
        if (hot) sideStats[key].hot += 1;
      });
    }
  }

  const centerRatio = sideStats.center.hot / Math.max(1, sideStats.center.total);
  const sideEntries = ["left", "right", "top", "bottom"].map((key) => ({
    key,
    ratio: sideStats[key].hot / Math.max(1, sideStats[key].total),
  }));
  const sideRatios = Object.fromEntries(sideEntries.map((item) => [item.key, Number(item.ratio.toFixed(3))]));
  const hottest = sideEntries.sort((a, b) => b.ratio - a.ratio)[0];
  const edgeContentRatio = Number(hottest.ratio.toFixed(3));
  const risk = hottest.ratio > 0.34 && hottest.ratio - centerRatio > 0.055;
  const label = risk
    ? `边缘 ${sideLabel(hottest.key)} ${Math.round(hottest.ratio * 100)}% 高对比内容，疑似主体/标题贴边或被裁切。`
    : "构图边缘安全。";
  return {
    risk,
    label,
    edgeContentRatio,
    hotSide: hottest.key,
    sideRatios,
    safeMarginPercent,
  };
}

function isHighContrastPixel(data: Buffer, channels: number, width: number, x: number, y: number) {
  const luma = (xx: number, yy: number) => {
    const index = (yy * width + xx) * channels;
    const r = data[index] || 0;
    const g = data[index + 1] || r;
    const b = data[index + 2] || r;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const gx = Math.abs(luma(x - 1, y) - luma(x + 1, y));
  const gy = Math.abs(luma(x, y - 1) - luma(x, y + 1));
  return gx + gy > 72;
}

function sideLabel(value: string) {
  if (value === "left") return "左侧";
  if (value === "right") return "右侧";
  if (value === "top") return "顶部";
  if (value === "bottom") return "底部";
  return value;
}

async function detectBlurredPaddingComposition(input: Buffer | string) {
  const sample = await sharp(input)
    .resize(160, 160, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const edgeBand = Math.round(Math.min(sample.info.width, sample.info.height) * 0.16);
  const centerInsetX = Math.round(sample.info.width * 0.24);
  const centerInsetY = Math.round(sample.info.height * 0.24);
  const edgeDetailScore = detailRegionScore(sample.data, sample.info.width, sample.info.height, (x, y) =>
    x < edgeBand || y < edgeBand || x >= sample.info.width - edgeBand || y >= sample.info.height - edgeBand,
  );
  const centerDetailScore = detailRegionScore(sample.data, sample.info.width, sample.info.height, (x, y) =>
    x >= centerInsetX && x < sample.info.width - centerInsetX && y >= centerInsetY && y < sample.info.height - centerInsetY,
  );
  const edgeToCenter = edgeDetailScore / Math.max(0.1, centerDetailScore);
  const risk = centerDetailScore >= 9 && edgeDetailScore <= 5.2 && edgeToCenter <= 0.44;
  return {
    risk,
    edgeDetailScore: Number(edgeDetailScore.toFixed(2)),
    centerDetailScore: Number(centerDetailScore.toFixed(2)),
    label: risk
      ? "疑似模糊补边/居中缩小图，不像原生比例设计稿。"
      : "未检测到明显模糊补边。",
  };
}

function normalizeBlurredPaddingRisk(
  output: Awaited<ReturnType<typeof detectBlurredPaddingComposition>>,
  source: Awaited<ReturnType<typeof detectBlurredPaddingComposition>> | null,
  operation?: string,
) {
  if (operation === "hd_redraw" && source?.risk && output.risk) {
    return {
      ...output,
      risk: false,
      label: "源图本身为边缘留白构图，未按磨砂补边处理。",
    };
  }
  return output;
}

function detailRegionScore(
  data: Buffer,
  width: number,
  height: number,
  inRegion: (x: number, y: number) => boolean,
) {
  let total = 0;
  let count = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      if (!inRegion(x, y)) continue;
      const index = y * width + x;
      const current = data[index] || 0;
      const left = data[index - 1] || 0;
      const up = data[index - width] || 0;
      total += Math.abs(current - left) + Math.abs(current - up);
      count += 2;
    }
  }
  return count ? total / count : 0;
}

function resolveExpectedSize(options: QualityInput) {
  if (options.expectedSize?.width && options.expectedSize?.height) return options.expectedSize;
  if (options.targetSize?.width && options.targetSize?.height) return options.targetSize;
  if (options.ratio?.width && options.ratio?.height && isQualityValue(options.quality)) {
    return getTargetPixels(options.ratio, options.quality);
  }
  return undefined;
}

function resolveExpectedRatio(options: QualityInput) {
  if (options.ratio?.width && options.ratio?.height) return options.ratio.width / options.ratio.height;
  const parsed = parseRatioLabel(options.aspectRatio || "");
  return parsed ? parsed.width / parsed.height : undefined;
}

function parseRatioLabel(value: string): PixelSize | null {
  const normalized = value.replace("：", ":").replace("x", ":").replace("p", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function isQualityValue(value: unknown): value is QualityValue {
  return value === "standard" || value === "2k" || value === "4k";
}

async function detectWhiteBorder(input: Buffer | string) {
  const sample = await sharp(input)
    .resize(96, 96, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = sample;
  const borderSize = Math.max(3, Math.round(Math.min(info.width, info.height) * 0.06));
  let borderNearWhite = 0;
  let borderPixels = 0;
  let centerNearWhite = 0;
  let centerPixels = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index] || 0;
      const g = data[index + 1] || r;
      const b = data[index + 2] || r;
      const nearWhite = r > 238 && g > 238 && b > 238 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
      const isBorder = x < borderSize || y < borderSize || x >= info.width - borderSize || y >= info.height - borderSize;
      if (isBorder) {
        borderPixels += 1;
        if (nearWhite) borderNearWhite += 1;
      } else {
        centerPixels += 1;
        if (nearWhite) centerNearWhite += 1;
      }
    }
  }

  const borderRatio = borderNearWhite / Math.max(1, borderPixels);
  const centerRatio = centerNearWhite / Math.max(1, centerPixels);
  return {
    hasWhiteBorder: borderRatio > 0.78 && borderRatio - centerRatio > 0.32,
    borderRatio,
    centerRatio,
  };
}

async function estimateDetailScore(input: Buffer | string) {
  const { data, info } = await sharp(input)
    .resize(160, 160, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let total = 0;
  let count = 0;
  for (let y = 1; y < info.height; y += 1) {
    for (let x = 1; x < info.width; x += 1) {
      const index = y * info.width + x;
      const current = data[index] || 0;
      const left = data[index - 1] || 0;
      const up = data[index - info.width] || 0;
      total += Math.abs(current - left) + Math.abs(current - up);
      count += 2;
    }
  }
  return count ? total / count : 0;
}
