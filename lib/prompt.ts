import { aspectRatios, type DesignRequest } from "./design-options";
import {
  buildProtectionPrompt,
  extractProtectionFromText,
  normalizeProtectionContext,
  type ProtectionContext,
} from "./design-production";

export function buildDesignPrompt(request: DesignRequest) {
  return buildTextToImagePrompt(request);
}

type PromptTask =
  | "text_to_image"
  | "image_to_image"
  | "outpaint"
  | "resize"
  | "fuse"
  | "mask_edit"
  | "hd_redraw"
  | "upscale_4k";

type PromptRecipeInput = {
  task: PromptTask;
  userPrompt?: string;
  adType?: string;
  aspectRatioLabel?: string;
  targetSize?: string;
  quality?: string;
  sourceAnalysis?: string;
  keepOriginalRatio?: boolean;
  fitMode?: string;
  direction?: string;
  fusionMode?: string;
  compositeVariant?: "natural" | "advertising";
  creativeRedesign?: boolean;
  creativeVariant?: "headline" | "subject";
  protectionContext?: ProtectionContext;
};

export function buildTextToImagePrompt(request: DesignRequest) {
  const keepContent = /内容不(少|减|变)|保留全部|全部保留/.test(request.prompt);
  const keepRatio = request.keepOriginalRatio || /比例不变|保持比例|尺寸不变/.test(request.prompt);
  const hasExplicitCopy = /文案|文字|标题|主标题|副标题|标语|slogan|电话|地址|医院|品牌名|写上|改成|主题[:：]/i.test(
    request.prompt,
  );
  const referenceImages = normalizeTextReferenceImages(request.referenceImages);
  const autoProtectedTexts = extractProtectionFromText(`${request.prompt}\n${request.sourceAnalysis || ""}`);
  const protectionContext = normalizeProtectionContext({
    ...request.protectionContext,
    protectedTexts: [...(request.protectionContext?.protectedTexts || []), ...autoProtectedTexts],
  });
  const protectionPrompt = buildProtectionPrompt(protectionContext);
  const domainLines = buildDomainLines(`${request.adType || ""}\n${request.prompt || ""}\n${request.sourceAnalysis || ""}`);
  const lockedCanvas = textToImageCanvasLock(request);
  const compositionPrompt = buildTextToImageCompositionPrompt(request, `${request.prompt}\n${request.adType || ""}`);
  const negativePrompt = buildTextToImageNegativePrompt();
  const strongReferenceMode = referenceImages.length > 0 && shouldUseStrongTextReferenceMode(request.prompt);

  return [
    "任务：生成一张成熟、可提案的中文商业设计图。",
    referenceImages.length
      ? strongReferenceMode
        ? "模式：主参考图强约束。第 1 张锁定版式、配色、构图和节奏；按用户需求轻微替换。"
        : "模式：带参考图的文生图。文字需求为主，参考图只按标注角色提供素材或风格。"
      : "",
    "角色：资深中文商业广告设计师，输出像真实生产稿。",
    `用途/广告类型：${request.adType || "通用设计"}。`,
    buildTextReferencePrompt(referenceImages, strongReferenceMode),
    `用户需求：${request.prompt || "根据输入信息生成一张清晰、专业、有层级的广告设计图。"}`,
    lockedCanvas,
    request.sourceAnalysis ? `参考图分析：${request.sourceAnalysis}` : "",
    buildCommercialDesignDirectorPrompt(`${request.adType || ""}\n${request.prompt || ""}`, {
      variantDirection: request.variantDirection,
      adType: request.adType,
    }),
    buildCopyPolicy(request.prompt, hasExplicitCopy),
    compositionPrompt,
    protectionPrompt,
    domainLines,
    referenceImages.length
      ? strongReferenceMode
        ? "参考边界：只复刻结构和色彩关系；第三方 Logo、机构名、电话、二维码和受保护文案不能照搬。"
        : "参考边界：不要混淆参考图用途；未标注为直接使用的文字、Logo、人物、产品或机构信息不要照搬。"
      : "",
    buildTextToImageVariantDirection(request.variantDirection, `${request.adType || ""}\n${request.prompt || ""}`, request),
    "素材上画：项目记忆只作参考；电话、地址、Logo、二维码只有用户明确要求才放入画面。",
    keepContent ? "用户强调内容不减：所有文字内容必须尽量保留，不要删减关键信息。" : "",
    keepRatio ? "用户强调比例不变：保持原图视觉比例和构图方向。" : "",
    negativePrompt,
  ]
    .filter(Boolean)
    .join("\n");
}

function textToImageCanvasLock(request: DesignRequest) {
  const ratio = resolveDesignRequestRatio(request);
  const ratioText = request.aspectRatio === "auto"
    ? `自适应已锁定为 ${ratio.label}`
    : request.aspectRatio === "custom"
      ? `自定义 ${request.customWidth || ratio.width}×${request.customHeight || ratio.height}`
      : ratio.label;
  const target = request.customWidth && request.customHeight
    ? `${request.customWidth}×${request.customHeight}px`
    : `${ratio.targetWidth}×${ratio.targetHeight}px`;
  return `画布锁定：本次必须按 ${ratioText} 构图，实际请求/输出目标尺寸 ${target}；前端预览必须完整显示，下载保留原始生成图尺寸。不要把其他比例的画面硬塞进当前画布。`;
}

function buildCommercialDesignDirectorPrompt(text: string, options?: { variantDirection?: "stable" | "creative"; adType?: string }) {
  const densityLine = options?.variantDirection === "creative"
    ? "方向：更有视觉记忆点，但必须克制、相关、完整。"
    : "方向：成熟商业版，信息清晰、少文字、稳版式、品牌可信。";
  const typeLine = /详情页|电商|商品|产品/.test(`${options?.adType || ""}\n${text}`)
    ? "场景：详情页/电商首屏突出产品、利益点和转化路径。"
    : /户外|电子屏|大屏|横幅|公交/.test(`${options?.adType || ""}\n${text}`)
      ? "场景：户外/电子屏优先远距离识别，标题少而强，主体完整。"
      : "场景：海报突出主题、情绪和传播记忆点，同时保持可读和完整。";

  return [
    "商业设计规则：",
    "- 像成熟品牌投放稿，不像模板拼贴或廉价促销传单。",
    "- 主视觉、背景、光效、道具都服务当前主题，不堆无关元素。",
    "- 信息层级最多 3 层；卖点 3-5 个以内；没有明确文案时少字或无字。",
    "- Logo 只是品牌识别，默认宽度 6%-12%，不要当主视觉。",
    "- 配色控制为 1 个主色、1-2 个辅助色、1 个强调色。",
    `- ${typeLine}`,
    densityLine,
  ].join("\n");
}

function resolveDesignRequestRatio(request: DesignRequest) {
  const matched = request.aspectRatio === "custom"
    ? null
    : aspectRatios.find((item) => item.value === request.aspectRatio);
  const width = request.aspectRatio === "custom" ? request.customWidth || 1 : matched?.width || 16;
  const height = request.aspectRatio === "custom" ? request.customHeight || 1 : matched?.height || 9;
  const ratioValue = width / Math.max(1, height);
  const longEdge = request.quality === "4k" ? 3840 : request.quality === "2k" ? 2048 : 1536;
  const target = ratioValue >= 1
    ? { width: longEdge, height: Math.max(1, Math.round(longEdge / ratioValue)) }
    : { width: Math.max(1, Math.round(longEdge * ratioValue)), height: longEdge };
  return {
    label: request.aspectRatio === "custom" ? `${width}:${height}` : matched?.label || "16:9",
    width,
    height,
    targetWidth: target.width,
    targetHeight: target.height,
  };
}

function buildTextToImageCompositionPrompt(request: DesignRequest, text: string) {
  const safeMargin = safeMarginPercent(request.safeMargin);
  const completeness = compositionCompletenessInstruction(request.compositionCompleteness);
  const camera = cameraDistanceInstruction(request.cameraDistance);
  const scale = subjectScaleInstruction(request.subjectScale);
  const extraSubject = needsFullSubjectComposition(text)
    ? [
        `人物 / IP / 产品必须完整入画：head, hands, feet, product edges inside frame; ${safeMargin}% safe margin.`,
      ]
    : [];
  return [
    "构图：full composition, complete subject visible, no cropping, no cut off.",
    `中心安全区：重要文字、Logo、人物、产品、IP、二维码和卖点放在画面中心 76% 内；四周至少 ${safeMargin}% 只放可延展背景、纹理和装饰。`,
    "尺度：主标题高度不超过画面 25%；Logo 宽度 6%-12%；卖点 3-5 个以内。",
    completeness,
    camera,
    scale,
    ...extraSubject,
  ].filter(Boolean).join("\n");
}

function buildTextToImageNegativePrompt() {
  return "negative prompt: cropped, cut off, out of frame, partial body, missing head/hands/feet, text cut off, object cut off, over zoomed, too close up, edge clipping, white border, blurred padding, watermark, gibberish.";
}

function safeMarginPercent(value?: string) {
  const parsed = Number(String(value || "").replace("%", ""));
  if ([5, 10, 15, 20].includes(parsed)) return parsed;
  return 15;
}

function compositionCompletenessInstruction(value?: string) {
  if (value === "大留白") return "完整度：大留白，主体更小，边缘更松。";
  if (value === "全身/全物体") return "完整度：全身/全物体，宁可缩小也不能裁切。";
  if (value === "标准") return "完整度：标准，主标题、主体和关键信息完整。";
  return "完整度：更完整，默认 zoom out，主体和标题远离边缘。";
}

function cameraDistanceInstruction(value?: string) {
  if (value === "近景") return "镜头：近景但不裁切。";
  if (value === "远景") return "镜头：远景，留白更多。";
  if (value === "自动") return "镜头：自动，优先完整。";
  return "镜头：中景，主体清楚但不过度放大。";
}

function subjectScaleInstruction(value?: string) {
  if (value === "大") return "主体：可偏大，但必须完整入画。";
  if (value === "小") return "主体：偏小，留白更多。";
  return "主体：中等，避免 oversized subject 和 too close up。";
}

function needsFullSubjectComposition(text: string) {
  return /竖版|海报|手机|9[:：]16|产品|商品|包装|IP|ip|形象|吉祥物|人物|人像|全身|头像|主角|主体/.test(text);
}

function normalizeTextReferenceImages(value: DesignRequest["referenceImages"]) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item?.label)).slice(0, 5) : [];
}

function buildTextReferencePrompt(referenceImages: NonNullable<DesignRequest["referenceImages"]>, strongReferenceMode = false) {
  if (!referenceImages.length) return "";
  return [
    "【参考图角色】",
    ...referenceImages.map((item, index) => {
      const label = item.label || `参考图${index + 1}`;
      return `${label}：${textReferenceRoleInstruction(item.role)}；权重：${textReferenceWeightLabel(item.weight)}。${item.fileName ? `文件：${item.fileName}。` : ""}`;
    }),
    "",
    "【生成要求】",
    strongReferenceMode
      ? "强参考：第 1 张参考图是主参考，优先保持它的版式骨架、色彩关系、信息层级、视觉重心和整体气质；只做用户要求的轻微修改。"
      : "严格按上面的参考图角色使用素材：人物、产品、主体、背景、风格、构图、色调、文字排版、Logo、IP形象和装饰元素各用各的，不要把参考图身份混在一起。",
    strongReferenceMode
      ? "第 2-5 张参考图只能补充人物、产品、Logo、IP、背景、装饰或局部质感，不能改变第 1 张的主体版式和配色方向。"
      : "输出一张完整新设计图，不是把参考图机械拼贴，也不是图生图复刻。",
  ].join("\n");
}

function shouldUseStrongTextReferenceMode(prompt: string) {
  return /1\s*[:：比]\s*1|一比一|复刻|仿照|照着|照抄|同款|稍微修改|轻微修改|小改|保持版式|版式不变|保持配色|配色不变|板式配色|版式配色|按这个版式|用这个版式|沿用版式|沿用配色/.test(prompt);
}

function textReferenceRoleInstruction(role: string) {
  const labels: Record<string, string> = {
    person: "使用其中的人物主体，保持人物识别度和自然融合",
    product: "使用其中的产品，保持产品识别度、透视和质感",
    subject: "使用其中的主体元素，作为本次画面的主要视觉来源",
    background: "使用其中的背景场景，按新设计需要重新融合光影和空间",
    style: "参考整体设计风格、色调、质感和排版感觉，不直接照搬具体内容",
    composition: "参考版式结构和画面重心，不直接复制具体素材",
    color: "参考主色调、辅助色和氛围色，不把色值当成可见文字",
    typography: "参考文字排版节奏、标题层级和字体气质，不复制无关文案",
    logo: "使用其中的 Logo 或品牌标识，保持识别准确，不虚构新 Logo",
    ip: "使用其中的 IP 形象、卡通形象或吉祥物，保持识别度",
    decoration: "使用其中的装饰元素或光效素材，服务新画面主题",
    reference_only: "只做参考，不直接使用其中的人物、产品、文字、Logo 或机构信息",
  };
  return labels[role] || labels.reference_only;
}

function textReferenceWeightLabel(weight: string) {
  if (weight === "high") return "高，强参考，尽量明显使用";
  if (weight === "low") return "低，只轻微参考";
  return "中，正常参考";
}

function buildTextToImageVariantDirection(direction: DesignRequest["variantDirection"], text: string, request?: DesignRequest) {
  const stableMargin = safeMarginPercent(request?.safeMargin);
  const creativeMargin = Math.max(stableMargin + 2, 12);
  if (direction === "creative") {
    if (/医院|医疗|体检|门诊|医生|科室|诊疗|中医|西医|药|健康/.test(text)) {
      return `本次方案方向：方案 2，亲和转化方向。左右错位构图，主体完整，安全边距 ${creativeMargin}%，画面更有亲和力和行动引导，但保持医疗可信、真实克制。`;
    }
    if (/科技馆|科普|研学|展馆|博物馆|儿童|亲子|活动|招募/.test(text)) {
      return `本次方案方向：方案 2，亲子趣味方向。左右错位构图，主体完整，安全边距 ${creativeMargin}%，画面更有参与感、趣味性和传播感。`;
    }
    return `本次方案方向：方案 2，左右错位 / 创意设计方向。主体完整，安全边距 ${creativeMargin}%，画面更有焦点、传播感和视觉记忆点。`;
  }
  if (direction === "stable") {
    if (/医院|医疗|体检|门诊|医生|科室|诊疗|中医|西医|药|健康/.test(text)) {
      return `本次方案方向：方案 1，居中构图。主体完整，安全边距 ${stableMargin}%，信息清晰、稳定可信、适合正式投放。`;
    }
    if (/科技馆|科普|研学|展馆|博物馆|儿童|亲子|活动|招募/.test(text)) {
      return `本次方案方向：方案 1，居中构图。主体完整，安全边距 ${stableMargin}%，突出探索感、秩序感和活动信息清晰度。`;
    }
    return `本次方案方向：方案 1，居中构图 / 稳定设计方向。主体完整，安全边距 ${stableMargin}%，信息层级清楚、版式稳、适合提案与投放。`;
  }
  return "";
}

export function buildImageEditPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput(input);
  if (normalized.task === "image_to_image") {
    return buildCreativeImageToImagePrompt(normalized);
  }

  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  const base = baseDesignLines(normalized, hasExplicitCopy);
  const ratioLine = normalized.keepOriginalRatio
    ? "比例：保持参考图原始比例和构图方向。"
    : `比例/尺寸：按 ${normalized.aspectRatioLabel || "用户选择比例"} 重新组织画面${normalized.targetSize ? `，最终目标尺寸 ${normalized.targetSize}` : ""}。`;

  const taskLines =
    normalized.task === "outpaint"
      ? [
          "任务类型：AI 扩图 / outpainting。",
          `扩展方向：${normalized.direction || "四周"}。`,
          "保留原图核心内容，向外补全背景、光影、空间和版式延展。",
          "不要白边、模糊边框或裁掉主体。",
        ]
      : normalized.task === "resize"
        ? [
            "任务类型：AI 改尺寸 / 比例重绘。",
            resizeModeInstruction(normalized.fitMode),
            "按新比例重排视觉重心、标题区、主体区和信息区；成图必须贴满目标画布。",
          ]
        : [
            "任务类型：图生图 / 参考图优化。",
            "保留核心信息和可识别内容，优化版式、光影、背景质感和商业完成度。",
          ];

  return [...base, ratioLine, ...taskLines, outputQualityLines(normalized.quality), negativeLines()].filter(Boolean).join("\n");
}

export const IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST =
  "参考输入图片的主题、品牌色、核心文案、Logo、主体形象和重要卖点，重新设计一张明显不同的新广告画面。";

export const IMAGE_TO_IMAGE_CREATIVE_REDESIGN_PROMPT =
  "请参考输入图片的主题、品牌色、核心文案、Logo、主体形象和重要卖点，重新设计一张新的广告画面。保留识别度和核心含义，但重排标题、主体、卖点、背景和视觉重心；不要只是高清重绘或轻微挪动。";

function buildCreativeImageToImagePrompt(input: ReturnType<typeof normalizePromptInput>) {
  const variantLines = input.creativeVariant === "subject"
    ? [
        "本次输出：方案 2，主体视觉主导方向。",
        "主体人物 / 产品 / IP 是第一视觉焦点，标题和卖点围绕主体重排。",
      ]
    : [
        "本次输出：方案 1，大标题主导方向。",
        "主标题更醒目，适合远距离阅读；主体和卖点辅助标题完成转化。",
      ];
  const ratioLine = input.keepOriginalRatio
    ? "画幅：沿用参考图画幅比例，但重新规划构图、标题区、主体区和视觉重心。"
    : `画幅：按 ${input.aspectRatioLabel || "用户选择比例"} 重新组织画面${input.targetSize ? `，最终目标尺寸 ${input.targetSize}` : ""}。`;

  return [
    "任务类型：图生图 / 创意改版。高清重绘是让原图变清楚；图生图是参考原图重新设计。",
    IMAGE_TO_IMAGE_CREATIVE_REDESIGN_PROMPT,
    ratioLine,
    input.userPrompt ? `用户补充创意方向：${input.userPrompt}` : "",
    buildCommercialDesignDirectorPrompt(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`, {
      variantDirection: input.creativeVariant === "subject" ? "creative" : "stable",
      adType: input.adType,
    }),
    ...variantLines,
    "差异化：两个方案至少在标题位置、主体位置、卖点排列、背景光效、画面重心中的 3 项不同。",
    "构图：full composition, complete text/subject visible, no cropping, no cut off, no edge clipping；四周 12% 只放背景和可裁切装饰。",
    "超宽横幅：标题和卖点放在垂直中心安全带，主标题高度不超过横幅高度 35%。",
    "必须延续：主标题含义、品牌识别、Logo、品牌色、主体人物 / 产品 / IP 的识别度、重要卖点。",
    buildCreativeImageToImageProtectionPrompt(input.protectionContext),
    "文案：延续参考图核心标题和卖点含义；不要编造电话、地址、Logo、二维码或医疗承诺。",
    buildDomainLines(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`),
    "禁止：复刻原图、轻微挪动、高清重绘式处理、无关主题、核心信息丢失、乱码、水印、假 Logo/电话/二维码。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCreativeImageToImageProtectionPrompt(context?: ProtectionContext) {
  const normalized = normalizeProtectionContext(context);
  const brand = normalized.brandProfile;
  const protectedTexts = normalized.protectedTexts || [];
  const protectedAssets = normalized.protectedAssets || [];
  const creativeRules = (brand?.rules || []).filter((rule) => !isConservativeCreativeRule(rule));

  return [
    protectedTexts.length
      ? [
          "创意改版文字约束：以下内容属于真实信息或核心文案，要延续含义和准确性，可以重新拆分、放大、弱化或重排。",
          ...protectedTexts.map((item) => `- ${item.text}（${item.kind}，${importanceLabel(item.importance)}）`),
        ].join("\n")
      : "",
    protectedAssets.length
      ? [
          "创意改版资产约束：以下资产要保持识别准确，但允许根据新构图安排到新的安全位置。",
          ...protectedAssets.map((item) => `- ${item.label}：${creativeAssetInstruction(item.type)}`),
        ].join("\n")
      : "",
    brand
      ? [
          "品牌风格约束：",
          brand.name ? `- 品牌/机构：${brand.name}` : "",
          brand.colors?.length ? `- 品牌色：${brand.colors.join("、")}` : "",
          brand.fontStyle ? `- 字体气质：${brand.fontStyle}` : "",
          brand.visualTone ? `- 视觉气质：${brand.visualTone}` : "",
          brand.logoPlacement ? `- Logo/二维码：保持品牌识别准确，可按新画面重新安排安全位置。${brand.logoPlacement}` : "",
          ...creativeRules.map((rule) => `- ${rule}`),
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    "创意改版保护边界：保护品牌、真实信息和主体识别度，不要求沿用原构图、原版式、原主体位置、原标题位置或原卖点排列方式。",
  ]
    .filter(Boolean)
    .join("\n");
}

function creativeAssetInstruction(type: string) {
  if (type === "logo") return "Logo 只能来自参考图或项目资产，保持品牌识别准确，可以按新构图调整位置和大小。";
  if (type === "qr") return "二维码不要由 AI 重绘；需要出现时作为原始素材回贴到新构图的安全位置。";
  if (type === "portrait") return "人物、医生照片或 IP 形象保持识别度，但可以重新安排画面位置、比例和视觉重心。";
  if (type === "product") return "主体或产品保持可识别，不替换成无关对象，但可以重新安排位置和层级。";
  return "保持资产识别度和真实来源，不虚构新资产。";
}

function isConservativeCreativeRule(rule: string) {
  return /保持原图|原图比例|比例不变|内容不减|原样优化|只优化版式|不改变布局|不要改变版式|主体、产品、主视觉结构不要改变|核心构图不要随意替换|不要随意移动|只修改涂抹|蒙版区域|mask/i.test(rule);
}

function importanceLabel(value: "critical" | "high" | "normal") {
  if (value === "critical") return "关键";
  if (value === "high") return "重要";
  return "普通";
}

export function buildFuseImagesPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput({ ...input, task: "fuse" });
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  const variantLines = normalized.compositeVariant === "advertising"
    ? [
        "本次输出：方案B，广告设计合成。",
        "在自然成立的前提下强化商业光影、层次和广告完成度。",
      ]
    : [
        "本次输出：方案A，真实自然合成。",
        "目标像真实拍摄：主体大小、落点、透视、光向、阴影、色温、景深和边缘自然。",
      ];
  return [
    "任务类型：AI合成。不是简单融合两张图，而是把图1的主体自然合成到图2的场景里。",
    `合成模式：${normalized.fusionMode || "主体入景"}。`,
    "图1 = 主体来源；图2 = 场景来源。",
    "合成要点：大小、位置、透视、接触、遮挡、光向、投影、反射、色温、颗粒、清晰度、边缘和景深一致。",
    "禁止简单拼接、半透明叠加、左右并排、硬贴纸、双重边框或边缘穿帮。",
    ...variantLines,
    "冲突处理：优先保留图1主体识别度和用户指定的品牌、文字、Logo、电话、地址、二维码。",
    "构图：主体、头发/手脚、产品包装、Logo、标题、二维码和底部信息完整入画；中心 76% 安全区，四周只放背景和可裁切装饰。",
    ...baseDesignLines(normalized, hasExplicitCopy),
    normalized.keepOriginalRatio
      ? "比例：保持图2场景的画幅比例，让合成结果以场景为最终画面。"
      : `比例：按 ${normalized.aspectRatioLabel || "用户选择比例"} 重新组织画面，不要裁掉重要内容。`,
    outputQualityLines(normalized.quality),
    negativeLines(),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMaskEditPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput({ ...input, task: "mask_edit" });
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  return [
    "任务类型：局部涂抹修改 / inpainting。",
    "只修改 mask 白色区域；mask 外保持原图构图、文字、Logo、电话、二维码和背景。",
    "涂抹边缘自然融合，避免硬边、补丁感、脏边和色差。",
    ...baseDesignLines(normalized, hasExplicitCopy),
    "涂抹区包含文字时，只按用户明确要求改；没有新文案就不要发明文字。",
    outputQualityLines(normalized.quality),
    negativeLines(),
  ]
    .filter(Boolean)
    .join("\n");
}

export const HD_REDRAW_PROMPT_TEMPLATE =
  "请对输入图片进行高清重绘。严格保持原图整体构图、比例、文字内容和位置、Logo/二维码位置、人物/产品/设备位置、色彩风格和信息层级不变。只提升清晰度、文字边缘、小字可读性、线条、主体细节、背景质感和压缩噪点。";

export function buildHdRedrawPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput(input);
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  return [
    HD_REDRAW_PROMPT_TEMPLATE,
    "任务边界：高清重绘，不是创意改版、改尺寸、2K/4K 放大或普通 resize。",
    normalized.keepOriginalRatio
      ? "输出约束：保持原图比例、构图方向、信息层级和元素位置，只重绘清晰度与细节。"
      : `输出约束：按 ${normalized.aspectRatioLabel || "用户选择比例"} 输出${normalized.targetSize ? `，目标尺寸 ${normalized.targetSize}` : ""}；若比例不同，请改用“改尺寸/创意改版”，不要在高清重绘里重新设计。`,
    normalized.userPrompt ? `用户补充要求：${normalized.userPrompt}` : "",
    buildProtectionPrompt(normalized.protectionContext),
    buildCopyPolicy(normalized.userPrompt, hasExplicitCopy),
    buildDomainLines(`${normalized.adType}\n${normalized.userPrompt}\n${normalized.sourceAnalysis}`),
    "文字不确定时保持原视觉占位，不编造替代文案。",
    "禁止：重新设计、改文案、移动 Logo/二维码、编造电话地址、增加无关元素、白边或相框边。",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePromptInput(input: PromptRecipeInput): Required<Omit<PromptRecipeInput, "protectionContext">> & { protectionContext: ProtectionContext } {
  const userPrompt = input.userPrompt?.trim() || "";
  const autoProtectedTexts = extractProtectionFromText(`${userPrompt}\n${input.sourceAnalysis || ""}`);
  const protectionContext = normalizeProtectionContext({
    ...input.protectionContext,
    protectedTexts: [...(input.protectionContext?.protectedTexts || []), ...autoProtectedTexts],
  });
  return {
    task: input.task,
    userPrompt,
    adType: input.adType || "通用设计",
    aspectRatioLabel: input.aspectRatioLabel || "",
    targetSize: input.targetSize || "",
    quality: input.quality || "standard",
    sourceAnalysis: input.sourceAnalysis || "",
    keepOriginalRatio: Boolean(input.keepOriginalRatio),
    fitMode: input.fitMode || "",
    direction: input.direction || "",
    fusionMode: input.fusionMode || "",
    compositeVariant: input.compositeVariant || "natural",
    creativeRedesign: Boolean(input.creativeRedesign),
    creativeVariant: input.creativeVariant || "headline",
    protectionContext,
  };
}

function baseDesignLines(input: ReturnType<typeof normalizePromptInput>, hasExplicitCopy: boolean) {
  return [
    "角色：资深中文商业广告设计师，输出要像真实生产稿。",
    `用途/广告类型：${input.adType || "通用设计"}。`,
    `用户需求：${input.userPrompt || "保留核心内容，优化为专业清晰的设计方案。"}`,
    input.sourceAnalysis ? `参考图分析：${input.sourceAnalysis}` : "",
    buildCommercialDesignDirectorPrompt(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`, {
      variantDirection: input.creativeVariant === "subject" || input.compositeVariant === "advertising" ? "creative" : "stable",
      adType: input.adType,
    }),
    buildProtectionPrompt(input.protectionContext),
    buildCopyPolicy(input.userPrompt, hasExplicitCopy),
    "完整性：标题、主体、人物、产品和明确要求的文字/Logo/二维码完整入画，不贴边、不截断。",
    "输出：严格贴满目标尺寸；比例不合适就重排或扩图，不能白边、空边、相框边或裁掉主体。",
    buildDomainLines(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`),
  ];
}

function buildDomainLines(text: string) {
  if (/医院|医疗|体检|门诊|医生|科室|诊疗|中医|西医|药|健康/.test(text)) {
    return "医疗广告规则：专业、清晰、可信，避免夸张疗效、虚假背书和不可信医疗视觉；只在用户明确要求时展示电话、地址、二维码或 Logo。";
  }
  if (/科技馆|科普|研学|展馆|博物馆|儿童|亲子|活动|招募/.test(text)) {
    return "科普/活动设计规则：亲和、清晰、有参与感，突出活动主题和行动号召，不要混入医疗、体检、医院等不相关视觉元素。";
  }
  if (/公交|户外|电梯|大屏|电子屏|展板|易拉宝|广告/.test(text)) {
    return "广告物料规则：远距离识别优先，标题要大，信息层级要少而清楚；电话、地址、Logo、二维码只有明确要求时才放入画面。";
  }
  return "通用商业设计规则：紧扣用户当前主题，不要串用其他项目、行业或历史任务的元素；项目资料只作为参考，不自动上画。";
}

function buildCopyPolicy(prompt: string, hasExplicitCopy: boolean) {
  const keepContent = /内容不(少|减|变)|保留全部|全部保留/.test(prompt);
  return [
    hasExplicitCopy
      ? "文字策略：用户明确给出的文案、标题、电话、地址、品牌名尽量按原文呈现。"
      : "文字策略：没有明确文案时少字或无字；不要编造标题、电话、地址、价格、医院名或宣传语。",
    keepContent ? "内容不减：所有可见文字、关键信息和品牌资产必须尽量保留，不要删减。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function hasExplicitCopyInstruction(prompt: string) {
  return /文案|文字|标题|主标题|副标题|标语|slogan|电话|地址|医院|品牌名|写上|改成|主题[:：]|内容不(少|减|变)|保留全部|全部保留/i.test(
    prompt,
  );
}

function resizeModeInstruction(fitMode?: string) {
  if (fitMode === "smart_relayout") {
    return [
      "处理模式：智能改版重排。",
      "根据目标比例重排标题、Logo、主体、卖点和背景，像原生目标尺寸设计稿。",
      "先识别原图元素和信息层级，再按横/竖阅读逻辑重新布局。",
      "构图：full poster visible, no cropping, no cut off；重要元素放中心 76% 安全区，四周 18% 只放背景和出血装饰。",
      "禁止：简单缩放、机械裁切、拉伸、中间原图 + 两侧模糊/磨砂/玻璃补边。",
    ].join("\n");
  }
  if (fitMode === "crop") return "处理模式：安全裁切。主体、标题、Logo、二维码必须留在安全区。";
  if (fitMode === "pad") return "处理模式：补背景保完整，允许背景填充但不能白边或空边。";
  if (fitMode === "keep_ratio") return "处理模式：保持比例放大，不改比例、不加边、不裁切。";
  return "处理模式：扩图补画。保持原构图，向外补全真实背景；禁止留白、模糊边框和磨砂补边。";
}

function outputQualityLines(quality?: string) {
  if (quality === "4k") {
    return "清晰度：按 4K 商业输出思路重绘细节，强调清晰边缘、准确轮廓、干净文字、细腻材质和无压缩感。";
  }
  if (quality === "2k") {
    return "清晰度：按 2K 输出思路提升细节，保证主要文字和主体边缘清楚。";
  }
  return "清晰度：普通预览也要保持主标题、主体和关键信息清楚可读。";
}

function negativeLines() {
  return "禁止：白边、透明边、空白边框、拉伸变形、主体/标题被裁、Logo/二维码变形、乱码、错别字、重复字、水印、拼贴裂缝。";
}
