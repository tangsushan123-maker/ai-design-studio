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

  return [
    "任务：从文字需求生成一张可提案的中文商业设计图。",
    referenceImages.length ? "模式：带参考图的文生图。文字需求是主任务，参考图只按指定角色提供人物、产品、背景、风格、构图、色调、文字排版或品牌素材。" : "",
    "角色：资深中文商业广告设计师，输出要像真实生产稿，不是概念草图。",
    `用途/广告类型：${request.adType || "通用设计"}。`,
    buildTextReferencePrompt(referenceImages),
    `用户需求：${request.prompt || "根据输入信息生成一张清晰、专业、有层级的广告设计图。"}`,
    lockedCanvas,
    request.sourceAnalysis ? `参考图分析：${request.sourceAnalysis}` : "",
    protectionPrompt,
    buildCopyPolicy(request.prompt, hasExplicitCopy),
    compositionPrompt,
    "输出边界：最终画面必须被内容完整填满，严禁生成白边、透明边、空白边框或为了凑比例而补空白；比例不匹配时优先扩图和重排版，不要裁掉关键主体。",
    "设计质量：层级清楚，留白合理，字体对比强，边缘清晰，色彩统一，适合真实商业广告输出。",
    domainLines,
    "文字保护：只保护用户明确提供或参考图中真实存在的文字和资产；中文文字尽量准确、干净、可读。",
    referenceImages.length
      ? "参考图使用规则：不要混淆参考图用途；只直接使用被标记为“使用”的内容；标记为参考风格、构图、色调、文字排版或只做参考的图片，不要照搬其中不该使用的文字、Logo、人物、产品或机构信息。"
      : "",
    referenceImages.length
      ? "参考图与图生图区别：这不是以某一张原图为底稿的图生图改版，而是以文字需求为主、按角色调用多张参考图生成新的完整设计稿。"
      : "",
    buildTextToImageVariantDirection(request.variantDirection, `${request.adType || ""}\n${request.prompt || ""}`, request),
    "AI 主要负责背景、光影、质感、构图、氛围和版式层级；不要把项目记忆里的电话、地址、Logo、二维码自动变成画面元素。",
    hasExplicitCopy
      ? "用户提供了明确文案或文字方向时，才在画面中排版对应文字。"
      : "用户没有提供明确文案时，不要自行编造标题、电话、地址、价格、医院名或宣传语；可以生成无字版视觉方案或只保留参考图已有文字。",
    keepContent ? "用户强调内容不减：所有文字内容必须尽量保留，不要删减关键信息。" : "",
    keepRatio ? "用户强调比例不变：保持原图视觉比例和构图方向。" : "",
    negativePrompt,
    "禁止：乱码、水印、多余 UI 边框、假 Logo、假电话、假二维码、重复文字、文字糊成一团、无意义装饰、关键内容被裁切、任何留白边框。",
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
        "竖版海报 / 产品 / IP / 人物完整构图：full body character visible, complete mascot visible, complete product visible.",
        `人物、IP 或产品必须完整：keep head, hands and feet inside the frame; leave ${safeMargin}% safe margin on all sides; avoid oversized subject; avoid edge clipping.`,
      ]
    : [];
  return [
    "构图安全：full composition; complete subject visible; no cropping; no cut off; all important elements fully inside the canvas.",
    `安全边距：leave safe margins around the subject; centered composition; clean layout; balanced composition; enough empty space around edges; do not place important objects at the very edge; poster fully visible inside frame; 四周至少保留 ${safeMargin}% 安全边距。`,
    completeness,
    camera,
    scale,
    ...extraSubject,
    "主标题、主体人物/IP/产品、Logo、卖点、按钮、二维码、电话地址等重要元素如果出现，必须完整留在画布内，不得贴边、压边、出画、被前景遮挡或被容器截断。",
  ].filter(Boolean).join("\n");
}

function buildTextToImageNegativePrompt() {
  return [
    "负面提示词 / negative prompt:",
    "cropped, cut off, out of frame, partial body, missing head, missing feet, missing hands, text cut off, object cut off, over zoomed, too close up, edge clipping, incomplete composition",
    "不要生成：主体被裁切、标题被裁切、IP边缘被裁切、产品不完整、人物缺头/缺手/缺脚、重要文字贴边、画面过度放大、像被放大截图一样的构图。",
  ].join("\n");
}

function safeMarginPercent(value?: string) {
  const parsed = Number(String(value || "").replace("%", ""));
  if ([5, 10, 15, 20].includes(parsed)) return parsed;
  return 10;
}

function compositionCompletenessInstruction(value?: string) {
  if (value === "大留白") return "构图完整度：大留白。主体更小、边缘更松，四周明显留出呼吸空间。";
  if (value === "全身/全物体") return "构图完整度：全身/全物体。人物、IP、产品必须完整可见，宁可缩小主体也不能裁切。";
  if (value === "标准") return "构图完整度：标准。保证主标题、主体和关键信息完整，不贴边。";
  return "构图完整度：更完整。默认 zoom out 一点，主体完整进入画布，标题和主体周围留足安全边距。";
}

function cameraDistanceInstruction(value?: string) {
  if (value === "近景") return "镜头距离：近景但不能贴脸或裁切，保留完整头部、手部和主体轮廓。";
  if (value === "远景") return "镜头距离：远景，主体完整更小，画面留白更多。";
  if (value === "自动") return "镜头距离：自动选择，但优先保证主体完整和边缘安全。";
  return "镜头距离：中景，主体清楚但不过度放大。";
}

function subjectScaleInstruction(value?: string) {
  if (value === "大") return "主体大小：大，但必须完整放进画布，四周仍保留安全边距。";
  if (value === "小") return "主体大小：小，留白更多，适合标题和卖点排版。";
  return "主体大小：中，避免 oversized subject 和 too close up。";
}

function needsFullSubjectComposition(text: string) {
  return /竖版|海报|手机|9[:：]16|产品|商品|包装|IP|ip|形象|吉祥物|人物|人像|全身|头像|主角|主体/.test(text);
}

function normalizeTextReferenceImages(value: DesignRequest["referenceImages"]) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item?.label)).slice(0, 6) : [];
}

function buildTextReferencePrompt(referenceImages: NonNullable<DesignRequest["referenceImages"]>) {
  if (!referenceImages.length) return "";
  return [
    "【参考图角色】",
    ...referenceImages.map((item, index) => {
      const label = item.label || `参考图${index + 1}`;
      return `${label}：${textReferenceRoleInstruction(item.role)}；权重：${textReferenceWeightLabel(item.weight)}。${item.fileName ? `文件：${item.fileName}。` : ""}`;
    }),
    "",
    "【生成要求】",
    "严格按上面的参考图角色使用素材：人物、产品、主体、背景、风格、构图、色调、文字排版、Logo、IP形象和装饰元素各用各的，不要把参考图身份混在一起。",
    "输出一张完整新设计图，不是把参考图机械拼贴，也不是图生图复刻。",
  ].join("\n");
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
          "任务类型：AI 扩图 / outpainting，不是普通改尺寸。",
          `扩展方向：${normalized.direction || "四周"}。`,
          "把原图放在合理位置，向外补全背景、光影、材质、空间、装饰元素和版式延展，让画面成为完整设计稿。",
          "禁止只加白边或模糊边框；缺失区域要重新生成有内容、有设计感的画面。",
        ]
      : normalized.task === "resize"
        ? [
            "任务类型：AI 改尺寸 / 比例重绘，不是简单缩放，不是只改预览框。",
            resizeModeInstruction(normalized.fitMode),
            "根据新比例重新安排视觉重心、留白、标题区、主体区和信息区，最终文件必须真实符合目标比例。",
            "禁止把原图缩小后放在中间，禁止左右或上下出现模糊补边、磨砂补边、玻璃边框、空白边、黑边或白边；整张画面必须铺满目标画布。",
          ]
        : [
            "任务类型：图生图 / 参考图优化。",
            "保留参考图核心信息和可识别内容，优化版式、光影、背景质感、清晰度和商业完成度。",
            "不要把整张图随意改成另一个主题；未指定要改变的内容尽量保持。",
          ];

  return [...base, ratioLine, ...taskLines, outputQualityLines(normalized.quality), negativeLines()].filter(Boolean).join("\n");
}

export const IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST =
  "参考输入图片的主题、品牌色、核心文案、Logo、主体形象和重要卖点，重新设计一张明显不同的新广告画面。";

export const IMAGE_TO_IMAGE_CREATIVE_REDESIGN_PROMPT =
  "请参考输入图片的主题、品牌色、核心文案、logo、主体形象和重要卖点，重新设计一张新的广告画面。不要复刻原图版式，不要只是轻微优化，不要只是调整元素位置。请重新规划标题排版、主体位置、卖点信息层级、背景氛围、光效、装饰元素和视觉重心。必须保留核心文案含义、品牌识别、logo、品牌色、主体识别和重要卖点，但整体构图和视觉表现要明显不同，像设计师重新做了一版设计。";

function buildCreativeImageToImagePrompt(input: ReturnType<typeof normalizePromptInput>) {
  const variantLines = input.creativeVariant === "subject"
    ? [
        "本次输出：方案 2，主体视觉主导方向。",
        "主体人物 / 产品 / IP 更突出，作为第一视觉焦点。",
        "标题围绕主体重新排版，卖点以标签、卡片或环绕方式出现。",
        "画面更有亲和力和传播感，整体和方案 1 明显不同。",
      ]
    : [
        "本次输出：方案 1，大标题主导方向。",
        "主标题更强、更醒目，画面适合远距离阅读。",
        "主体人物 / 产品作为辅助视觉，卖点信息更规整。",
        "整体偏广告投放和转化，视觉重心由标题带动。",
      ];
  const ratioLine = input.keepOriginalRatio
    ? "画幅：沿用参考图画幅比例，但重新规划构图、标题区、主体区和视觉重心。"
    : `画幅：按 ${input.aspectRatioLabel || "用户选择比例"} 重新组织画面${input.targetSize ? `，最终目标尺寸 ${input.targetSize}` : ""}。`;

  return [
    "任务类型：图生图 / 创意改版。高清重绘是让原图变清楚；图生图是参考原图重新设计。",
    IMAGE_TO_IMAGE_CREATIVE_REDESIGN_PROMPT,
    ratioLine,
    input.userPrompt ? `用户补充创意方向：${input.userPrompt}` : "",
    ...variantLines,
    "强制差异化：两个方案必须至少在标题位置、主体位置、卖点排列方式、背景光效、画面重心、装饰元素、信息区布局中的 3 项不同。",
    "失败判定：如果结果只是复刻参考图、轻微微调、只换一点位置，或看起来像高清重绘，就视为失败。",
    "必须延续：主标题含义、品牌识别、Logo、品牌色、主体人物 / 产品 / IP 的识别度、重要卖点。",
    "医疗广告规则：关键信息只使用参考图或项目资料中真实存在的内容；不要乱编机构、电话、地址、价格、医生姓名和医疗承诺。",
    buildCreativeImageToImageProtectionPrompt(input.protectionContext),
    "文案策略：参考图中已有的核心标题和重要卖点要延续含义；可以重新拆分、重排、强化层级，但不要编造电话、地址、Logo 或二维码。",
    buildDomainLines(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`),
    "完成度：输出要像真实广告设计师重新做的一版方案，信息层级清楚、画面干净、商业感强。",
    "禁止：复刻原图版式、轻微优化、单纯调位置、高清重绘式处理、替换成无关主题、丢失核心标题含义、丢失品牌识别、虚构医疗关键信息、乱码、水印、假 Logo、假电话、假二维码。",
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
        "在自然合成成立的前提下，强化广告画面完成度：主体更醒目，背景更有商业光效、空间层次和视觉记忆点。",
        "允许加入克制的广告设计语言，例如光晕、投影、产品台面、标签区、海报氛围和品牌色呼应，但不要破坏真实透视和主体识别。",
      ]
    : [
        "本次输出：方案A，真实自然合成。",
        "目标像真实拍摄或真实放入同一现场：主体大小、落点、透视、光向、阴影、色温、景深和边缘都要自然。",
        "不要做夸张海报特效，优先让图1主体可信地存在于图2场景里。",
      ];
  return [
    "任务类型：AI合成。不是简单融合两张图，而是把图1的主体自然合成到图2的场景里。",
    `合成模式：${normalized.fusionMode || "主体入景"}。`,
    "图1 = 主体来源：可以是人物、产品、IP形象、Logo、设备、物体或需要替换/穿戴/展示的内容。",
    "图2 = 场景来源：可以是背景、风景、空间、海报场景、风格、光影、服装或承载主体的画面环境。",
    "核心合成要求：自动处理主体大小、位置、透视、接触关系、遮挡层次、光影方向、投影、反射、色温、颗粒、清晰度、边缘融合和景深，让结果像真实处在同一个画面。",
    "禁止把两张图做成简单拼接、半透明叠加、左右并排、硬贴纸、双重边框或边缘发光穿帮。",
    ...variantLines,
    "如果用户要求产品换Logo、人物换服装、产品放入场景、人物进入风景、IP进入海报或Logo放入背景，请按“图1主体/元素 + 图2目标场景或承载物”的逻辑完成自然合成。",
    "如果两张图冲突，优先保留图1主体识别度、用户指定主体、品牌、文字、Logo、电话、地址和二维码；不要虚构不存在的机构信息。",
    ...baseDesignLines(normalized, hasExplicitCopy),
    normalized.keepOriginalRatio
      ? "比例：保持图2场景的画幅比例，让合成结果以场景为最终画面。"
      : `比例：按 ${normalized.aspectRatioLabel || "用户选择比例"} 重新组织画面，不要裁掉重要内容。`,
    "合成结果必须风格统一、光影一致、边缘自然，没有拼贴裂缝、重复边框、素材穿帮、主体漂浮、阴影缺失或文字乱码。",
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
    "只修改 mask 白色区域；mask 外区域必须保持原图像素、构图、文字、Logo、电话、二维码和背景不变。",
    "如果模型无法完全遵守，后处理会锁定 mask 外区域，所以请把注意力集中在涂抹区域内部。",
    "涂抹区域边缘要自然融合，避免硬边、补丁感、脏边、明显色差。",
    ...baseDesignLines(normalized, hasExplicitCopy),
    "如果涂抹区域包含中文文字，只按用户明确要求修改；没有明确新文案时，不要发明新文字。",
    outputQualityLines(normalized.quality),
    negativeLines(),
  ]
    .filter(Boolean)
    .join("\n");
}

export const HD_REDRAW_PROMPT_TEMPLATE =
  "请对输入图片进行高清重绘。严格保持原图整体构图、比例、文字内容、文字位置、logo位置、二维码位置、人物/产品/设备位置、色彩风格和信息层级不变。不要重新设计，不要改文案，不要替换元素，不要增加无关内容。请重点提升画面清晰度、文字边缘锐度、小字可读性、图标线条清晰度、人物和设备细节、背景质感、光影层次，并修复模糊、噪点和压缩痕迹。输出一张真正更清晰、更干净、更适合广告投放和印刷使用的高清重绘版本。";

export function buildHdRedrawPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput(input);
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  return [
    HD_REDRAW_PROMPT_TEMPLATE,
    "任务边界：这是独立的高清重绘模式，不是创意改版，不是改尺寸，不是 2K/4K 放大，不是普通 resize，也不是简单锐化。",
    normalized.keepOriginalRatio
      ? "输出约束：保持原图比例、构图方向、信息层级和元素位置，只重绘清晰度与细节。"
      : `输出约束：按 ${normalized.aspectRatioLabel || "用户选择比例"} 输出${normalized.targetSize ? `，目标尺寸 ${normalized.targetSize}` : ""}；若比例不同，请改用“改尺寸/创意改版”，不要在高清重绘里重新设计。`,
    normalized.userPrompt ? `用户补充要求：${normalized.userPrompt}` : "",
    buildProtectionPrompt(normalized.protectionContext),
    buildCopyPolicy(normalized.userPrompt, hasExplicitCopy),
    buildDomainLines(`${normalized.adType}\n${normalized.userPrompt}\n${normalized.sourceAnalysis}`),
    "如果文字识别不确定，保持原位置和视觉占位，不要编造替代文案；优先保护已有字形和版式。",
    "质检标准：最终判断以视觉清晰度、文字边缘、小字可读性、图标线条、人物/产品/设备细节和噪点压缩痕迹为准，不以像素尺寸变大作为高清标准。",
    "禁止：重新创意改版、改尺寸、4K导出式硬放大、改变文案、改变 logo、移动二维码、编造电话地址、增加无关元素、删减重要内容、制造白边或相框边。",
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
    buildProtectionPrompt(input.protectionContext),
    buildCopyPolicy(input.userPrompt, hasExplicitCopy),
    "画面完整性：标题、主体、人物、产品和用户明确要求的文字/Logo/二维码必须完整，不要贴边、截断、遮挡或被扩图吞掉。",
    "输出边界：最终文件必须严格贴满目标尺寸，不允许白边、空边、透明边、相框边或任何为了凑尺寸出现的空白区域；如果比例不合适，优先重新排版或扩图，不要直接裁掉主体。",
    "商业设计要求：信息层级清楚，主次明确，留白成熟，字体对比强，背景服务主体，不要为了氛围牺牲可读性。",
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
      ? "文字策略：用户提供的文案、标题、电话、地址、品牌名必须尽量按原文逐字呈现，避免错字、漏字和额外字符。"
      : "文字策略：用户没有提供明确文案时，不要自行编造标题、电话、地址、价格、医院名或宣传语；优先生成无字视觉或保留参考图已有文字。",
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
      "请根据目标尺寸重新设计版式，不要简单裁切、缩放或拉伸原图。请重新安排标题、Logo、主体、卖点和背景，使画面适合目标比例。",
      "结果必须像原本就是按目标比例设计的成图；不要输出中间原图 + 两侧模糊背景/磨砂背景/虚化延展的拼贴效果。",
      "第一步：识别原图元素，包括 Logo、主标题、副标题、主体人物/产品/IP形象、卖点信息、按钮/二维码/电话地址、背景、装饰元素、底部信息和需要保持不变的内容。",
      "第二步：判断信息层级。主标题优先级最高；Logo 必须保留；主体人物或产品不能被裁掉；核心卖点必须保留；装饰元素可以重新安排；背景可以扩展或重绘；次要信息可以缩小或移动。",
      "第三步：根据目标尺寸重新规划布局。横版改竖版时，Logo 放左上或顶部，主标题放上半区，主体放中部或下半区，卖点改成竖向排列，背景重新适配竖版阅读逻辑。竖版改横版时，标题放左侧或上方，主体放右侧或中间，卖点横向排列，背景横向延展并保持左右空间平衡。",
      "第四步：生成新设计。保持原设计风格、品牌色、标题含义、Logo 和主体识别度；不要简单缩放、机械裁切、拉伸变形或丢失核心内容。",
    ].join("\n");
  }
  if (fitMode === "crop") return "处理模式：居中裁切。允许裁切多余边缘，但主体、标题、电话、Logo 和二维码必须留在合理边距内。";
  if (fitMode === "pad") return "处理模式：留白填充。只有此模式允许留白或背景填充，并且要明确保持画面完整。";
  if (fitMode === "keep_ratio") return "处理模式：保持比例放大。不要改比例、不要加白边、不要裁切，只增强清晰度。";
  return "处理模式：扩图补画。保持原构图，向外补全真实背景和画面内容；默认禁止留白、模糊边框、磨砂补边，必须让目标比例成为完整新设计。";
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
  return "禁止：白边、透明边、空白边框、上下大空白、左右大空白、拉伸变形、主体被裁、标题被裁、Logo 变形、二维码变形、乱码、错别字、重复字、水印、假界面边框、拼贴裂缝、硬裁主体来凑比例。";
}
