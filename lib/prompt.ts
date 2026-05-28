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
  enhancementMode?: "faithful" | "texture" | string;
  protectionContext?: ProtectionContext;
};

export type DesignDirectorDirection = {
  id: "A" | "B" | "C";
  name: string;
  concept: string;
  mainVisual: string;
  layout: string;
  palette: string;
  typography: string;
  texture: string;
  scenario: string;
  risk: string;
  score: number;
};

export type DesignDirectorBrief = {
  imageType: string;
  useScene: string;
  audience: string;
  communicationGoal: string;
  title: string;
  subtitle: string;
  sellingPoints: string[];
  mainVisualConcept: string;
  creativeMetaphor: string;
  layout: string;
  colorSystem: string;
  typographyTone: string;
  textureSource: string;
  whitespaceAndSafety: string;
  industryRules: string;
  textPolicy: string;
  directions: DesignDirectorDirection[];
  recommendedDirectionId: "A" | "B" | "C";
  recommendationReason: string;
};

type NoVisibleOutputPolicy = {
  noText: boolean;
  noLogo: boolean;
  noQr: boolean;
  noContact: boolean;
  any: boolean;
};

function resolveNoVisibleOutputPolicy(prompt: string): NoVisibleOutputPolicy {
  const text = prompt || "";
  const noText = /无文字|无字|不要(?:任何)?文字|不要文案|不加文字|不要出现文字|不(?:要|需要).*文字|纯背景|无文字背景|无字背景/i.test(text);
  const noLogo = /不要\s*(?:logo|Logo|LOGO|标志|品牌标识)|无\s*(?:logo|Logo|LOGO|标志|品牌标识)|不(?:要|需要).*(?:logo|Logo|LOGO|标志|品牌标识)/i.test(text);
  const noQr = /不要.*(?:二维码|QR|qr)|无.*(?:二维码|QR|qr)|不(?:要|需要).*(?:二维码|QR|qr)/i.test(text);
  const noContact = /不要.*(?:电话|地址|联系方式|手机号|热线)|无.*(?:电话|地址|联系方式|手机号|热线)|不(?:要|需要).*(?:电话|地址|联系方式|手机号|热线)/i.test(text);
  return { noText, noLogo, noQr, noContact, any: noText || noLogo || noQr || noContact };
}

function wantsProjectOutputContext(prompt: string) {
  const text = prompt || "";
  const explicitAdd = /放上|加上|加入|添加|写上|显示|展示|露出|带上|包含|需要|必须有|要有|使用|引用|贴上/.test(text);
  const explicitProjectAsset = explicitAdd && /资料|素材|品牌|logo|Logo|LOGO|标志|电话|地址|联系方式|二维码|QR|qr|文案|标题|IP形象|ip形象|吉祥物/.test(text);
  const explicitProjectContext = /当前项目|项目资料|项目素材|素材库|项目库|项目里的|已有素材|客户资料|品牌资产|真实信息|真实文案|真实活动信息/i.test(text);
  const explicitBrandOrContact = /品牌色|品牌资产|logo|Logo|LOGO|标志|院标|馆标|电话|地址|联系方式|手机号|热线|二维码|QR|qr|机构|公司|医院|门店|客户|IP形象|ip形象|吉祥物|宣传语|slogan|口号/i.test(text);
  return explicitProjectAsset || explicitProjectContext || explicitBrandOrContact;
}

function wantsBrandOrContactOutput(prompt: string) {
  return wantsProjectOutputContext(prompt) || /logo|Logo|LOGO|品牌|标志|电话|地址|联系方式|二维码|QR|qr|机构|公司|医院|门店|客户/i.test(prompt || "");
}

function importantElementsLabel(prompt: string) {
  return wantsBrandOrContactOutput(prompt)
    ? "subject/title/requested text/logo/product/person/QR/contact"
    : "subject/title/requested text/person/product";
}

function buildContextAwareAvoidLine(prompt: string) {
  return wantsBrandOrContactOutput(prompt)
    ? "Avoid: cheap template look, clutter, fake text, misspellings, oversized logo, irrelevant icons, cropped subject, fake QR/contact info, side blur padding, frosted edges, background stretching, distorted product, unnatural face, inconsistent lighting."
    : "Avoid: cheap template look, clutter, fake text, misspellings, irrelevant icons, cropped subject, side blur padding, frosted edges, background stretching, distorted product, unnatural face, inconsistent lighting.";
}

function promptSection(title: string, lines: Array<string | false | undefined | null>) {
  const content = lines.filter(Boolean).join("\n");
  return content ? `${title}:\n${content}` : "";
}

function hasProtectionPromptContent(context: ProtectionContext) {
  return Boolean(
    context.protectedTexts?.length ||
      context.protectedAssets?.length ||
      context.layers?.some((layer) => layer.locked) ||
      context.brandProfile?.name ||
      context.brandProfile?.colors?.length ||
      context.brandProfile?.logoPlacement ||
      context.brandProfile?.visualTone ||
      context.brandProfile?.rules?.length,
  );
}

function noVisibleOutputLines(prompt: string) {
  const policy = resolveNoVisibleOutputPolicy(prompt);
  return [
    policy.noText
      ? "No visible text: generate a clean visual/background with zero titles, Chinese characters, English letters, numbers, fake text, labels, slogans, captions, phone numbers, addresses, watermarks, or tiny pseudo text."
      : "",
    policy.noLogo
      ? "No logo or brand mark: do not draw any logo, hospital name, brand identity, seal, icon-like brand mark, or logo placeholder."
      : "",
    policy.noQr
      ? "No QR code: do not draw QR codes, barcode-like blocks, scan icons, or fake QR placeholders."
      : "",
    policy.noContact
      ? "No contact information: do not draw phone numbers, addresses, map pins, contact labels, or appointment hotlines."
      : "",
  ].filter(Boolean).join("\n");
}

function sanitizedReferenceAnalysisForPrompt(sourceAnalysis: string | undefined, prompt: string) {
  const value = sourceAnalysis?.trim();
  if (!value) return "";
  const policy = resolveNoVisibleOutputPolicy(prompt);
  if (!policy.any) return value;
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/创作前置判断|需求补全|可能主标题|核心文字|常用文案|电话|地址|联系方式|二维码|QR|Logo|LOGO|logo|机构名称|医院名|品牌名|已读取项目上下文|素材优先级/.test(line)) {
        return false;
      }
      if (policy.noText && /文字|标题|副标题|卖点|标语|slogan|文案|小字|信息/.test(line)) return false;
      return true;
    })
    .join("\n");
}

export function buildDesignDirectorBriefRequestPrompt(request: DesignRequest, ratioText: string) {
  const wantsProjectContext = wantsProjectOutputContext(request.prompt);
  const personIntent = inferPersonIntent(request.prompt);
  return [
    "你是 AI 海报策划总监和商业视觉设计总监。请先把用户的一句话需求整理成结构化 Design Brief，再给出 3 个可落地设计方案。",
    "只输出合法 JSON，不要 Markdown。",
    "JSON 字段：imageType,useScene,audience,communicationGoal,title,subtitle,sellingPoints,mainVisualConcept,creativeMetaphor,layout,colorSystem,typographyTone,textureSource,whitespaceAndSafety,industryRules,textPolicy,directions,recommendedDirectionId,recommendationReason。",
    "directions 固定 3 个，id 为 A/B/C；每个包含 name,concept,mainVisual,layout,palette,typography,texture,scenario,risk,score。",
    "如果用户只输入模糊短句，例如“帮我生成一张端午节海报”，必须自动补全用途、行业/场景、受众、主标题、副标题、核心卖点、主视觉元素、节日/行业符号、色彩风格、版式结构和推荐画布比例。",
    "自动补全文案必须像真实海报上会出现的短句：例如端午通用品牌海报可用 title=端午安康，subtitle=粽叶飘香，情暖仲夏，sellingPoints 可含愿你岁岁安康，万事顺遂；医疗/医院/机构品牌端午海报要偏关怀和安康祝福，可用 title=端午安康，subtitle=粽叶飘香，安康常伴，sellingPoints 可含愿您和家人平安顺遂，身心常健；不要把“节日氛围、品牌祝福、活动转化、探索感、互动感”这类策划标签当成画面文字。",
    "除非用户明确写了活动、优惠、促销、福利、礼品、领取、报名、套餐、买赠，否则节日品牌海报不要出现“好礼、礼遇、福利、钜惠、限时、转化、到店”等促销文案。",
    "如果识别到具体行业，节日文案要按行业改写：例如科技馆/科普活动端午海报可用 title=科技里的端午 或 端午奇妙游，subtitle=传统文化与科学探索的奇妙相遇。",
    "节日海报要像真实商业活动主视觉：主标题可读、元素强相关、配色有节日气质、版式有明确标题区/主体区/信息区，不要只堆素材。",
    personIntent
      ? `用户要求加入人物时，人物是画面主体/辅助主体，不是文案；请自动判断人物类型、姿态、服装、景别和情绪。当前人物意图：${personIntent}。人物必须自然融入场景，不能像硬贴素材。`
      : "用户未明确要求人物时，不要为了填满画面硬加无关人物。",
    wantsProjectContext
      ? "规则：不要把用户所有文字都塞进图里；提炼 1 个主标题、1 个副标题、最多 3 个卖点；电话、地址、二维码、长段文字建议后期真实字体排版。"
      : "规则：不要把用户所有文字都塞进图里；只提炼必要主视觉和极少标题；长段文字与细节信息后期真实字体排版。",
    "主视觉必须强相关，不要硬凑科技线条、粒子、城市、飘带、无关人物。",
    "版式必须有设计依据：使用明确栅格、对齐轴、间距尺度、阅读动线和视觉层级，不要凭感觉摆放。",
    wantsProjectContext
      ? "默认保留 25%-40% 呼吸空间；重要元素离边缘 8%-12%；人物、产品、标题、Logo 不贴边不裁切。"
      : "默认保留 25%-40% 呼吸空间；重要主体、产品、人物和标题离边缘 8%-12%，不贴边不裁切。",
    `画布：${ratioText}，必须原生按这个比例构图，不要左右/上下磨砂补边。`,
    `广告类型：${request.adType || "通用设计"}`,
    `用户需求：${request.prompt}`,
    request.sourceAnalysis ? `参考图/来源分析：${request.sourceAnalysis}` : "",
  ].filter(Boolean).join("\n");
}

export function buildDesignDirectorBriefFallback(request: DesignRequest): DesignDirectorBrief {
  const text = `${request.adType || ""}\n${request.prompt || ""}\n${request.sourceAnalysis || ""}`;
  const wantsProjectContext = wantsProjectOutputContext(request.prompt);
  const festival = inferFestivalPoster(text);
  const imageType = festival ? "节日营销海报" : inferDirectorImageType(text);
  const industry = inferDirectorIndustry(text);
  const title = festival?.title || inferDirectorTitle(request.prompt);
  const points = festival?.sellingPoints || inferDirectorSellingPoints(text);
  const isOutdoor = /户外|公交|电子屏|大屏|横幅/i.test(text);
  const isProduct = /产品|商品|包装|详情页|电商/i.test(text);
  const isMedical = industry === "医疗";
  const useScene = festival?.useScene || (isOutdoor ? "线下投放 / 远距离识别" : isProduct ? "详情页首屏 / 转化展示" : "线上传播 / 品牌宣传");
  const audience = festival?.audience || (isMedical ? "患者、家属和普通消费者" : /儿童|学生|科普|科技馆/i.test(text) ? "学生、家长和科普活动参与者" : isProduct ? "潜在消费者和渠道客户" : "目标用户和活动参与者");
  const communicationGoal = festival?.communicationGoal || (isProduct ? "突出产品质感、卖点和转化路径" : isOutdoor ? "3 秒内吸引注意并传达核心主题" : "建立信任、强化主题记忆点");
  const colorSystem = festival?.colorSystem || (isMedical
    ? "主色蓝/绿/白，辅助暖灰，少量高亮色"
    : /科技|科普|科技馆/i.test(text)
      ? "主色科技蓝或深色空间，辅助青绿/白，强调色少量点亮"
      : isProduct
        ? "主色跟随产品，背景低干扰，强调色用于卖点"
        : "1 个主色、1-2 个辅助色、1 个强调色");
  const mainVisualConcept = festival?.mainVisualConcept || (isProduct
    ? "产品是第一主体，配合展示台、真实材质高光和少量卖点标签"
    : isMedical
      ? "柔和光带、专业场景或可信医生形象表达安全、舒适、专业"
      : /科普|科技馆|科技/i.test(text)
        ? "知识光束、互动装置、探索路径和空间层次表达探索感"
        : "围绕主题建立一个清晰主视觉，而不是素材堆砌");
  const directions: DesignDirectorDirection[] = [
    {
      id: "A",
      name: "成熟商业版",
      concept: festival ? "节日主题明确、信息清晰、商业质感稳定，适合品牌活动首版提案。" : "稳版式、少文字、强信任，适合客户提案和正式投放。",
      mainVisual: mainVisualConcept,
      layout: festival?.stableLayout || (isOutdoor ? "中心主视觉 + 大标题 + 极少辅助信息" : isProduct ? "产品主体 + 卖点分区 + 干净转化区" : "主标题 / 主视觉 / 卖点三段式"),
      palette: colorSystem,
      typography: "主标题清楚，副标题克制，小字后期真实字体排版。",
      texture: "真实光影、干净边缘、统一色温和适度留白。",
      scenario: useScene,
      risk: "视觉冲击可能保守，但落地稳定。",
      score: 92,
    },
    {
      id: "B",
      name: "创意主视觉版",
      concept: festival ? "用节日符号建立更强传播记忆点，但控制元素数量和信息密度。" : "用更强隐喻和视觉记忆点表达主题，但控制元素数量。",
      mainVisual: mainVisualConcept,
      layout: festival?.creativeLayout || "中心主视觉或留白型高级构图，标题与主体错位但不贴边。",
      palette: colorSystem,
      typography: "尽量少字，保留标题空间，避免 AI 生成长中文。",
      texture: "空间层次、材质对比和柔和光效，不靠杂乱粒子。",
      scenario: festival ? "节日活动主视觉 / 线上传播" : "线上传播 / 活动主视觉",
      risk: "创意过强时可能偏离行业克制感。",
      score: isMedical || isProduct ? 86 : 90,
    },
    {
      id: "C",
      name: "留白高级版",
      concept: "减少信息密度，给真实文字和品牌资产留出后期排版空间。",
      mainVisual: mainVisualConcept,
      layout: "大留白 + 单一视觉焦点 + 安全信息区。",
      palette: colorSystem,
      typography: wantsProjectContext ? "默认无字或少字，电话、地址、二维码后期加。" : "默认无字或少字，细节信息后期真实字体排版。",
      texture: "干净背景、细腻渐变、轻量真实阴影。",
      scenario: "PPT 首页 / 海报背景 / 详情页首屏",
      risk: "需要后期真实排版补充信息。",
      score: /PPT|背景|首页/i.test(text) ? 93 : 84,
    },
  ];
  const recommendedDirectionId = directions.reduce((best, item) => (item.score > best.score ? item : best), directions[0]).id;
  return {
    imageType,
    useScene,
    audience,
    communicationGoal,
    title,
    subtitle: festival?.subtitle || points[0] || "专业、清晰、可信的主题表达",
    sellingPoints: points.slice(0, 3),
    mainVisualConcept,
    creativeMetaphor: festival?.creativeMetaphor || (isProduct ? "用产品展示台和材质高光表达品质与转化" : mainVisualConcept),
    layout: directions.find((item) => item.id === recommendedDirectionId)?.layout || directions[0].layout,
    colorSystem,
    typographyTone: festival?.typographyTone || (isMedical ? "专业可信、干净温和" : /科技|科普/i.test(text) ? "现代简洁、有探索感" : "清晰商业化、层级分明"),
    textureSource: "高级感来自留白、统一配色、真实光影、空间层次、精细边缘和商业摄影感。",
    whitespaceAndSafety: wantsProjectContext
      ? "保留 25%-40% 呼吸空间；重要元素距离边缘至少 8%-12%；主体、标题、Logo 不贴边不裁切。"
      : "保留 25%-40% 呼吸空间；重要主体、人物、产品和标题距离边缘至少 8%-12%，不贴边不裁切。",
    industryRules: buildDirectorIndustryRules(text),
    textPolicy: wantsProjectContext
      ? "AI 只生成极少文字或无字背景；长文、电话、地址、二维码、详细说明后期用真实字体排版。"
      : "AI 只生成极少文字或无字背景；细节说明后期用真实字体排版。",
    directions,
    recommendedDirectionId,
    recommendationReason: "优先选择最稳、最容易落地且不易产生裁切和乱码的一版。",
  };
}

export function normalizeDesignDirectorBrief(value: unknown, fallback: DesignDirectorBrief): DesignDirectorBrief {
  const source = value && typeof value === "object" ? value as Partial<DesignDirectorBrief> : {};
  const directions = Array.isArray(source.directions) && source.directions.length
    ? source.directions
      .filter((item) => Boolean(item && typeof item === "object"))
      .map((rawItem, index) => {
        const item = rawItem as Partial<DesignDirectorDirection>;
        return {
          id: item.id === "A" || item.id === "B" || item.id === "C" ? item.id : (["A", "B", "C"][index] as "A" | "B" | "C" || "A"),
          name: cleanPromptText(item.name) || fallback.directions[index]?.name || `方案 ${index + 1}`,
          concept: cleanPromptText(item.concept) || fallback.directions[index]?.concept || "",
          mainVisual: cleanPromptText(item.mainVisual) || fallback.directions[index]?.mainVisual || fallback.mainVisualConcept,
          layout: cleanPromptText(item.layout) || fallback.directions[index]?.layout || fallback.layout,
          palette: cleanPromptText(item.palette) || fallback.directions[index]?.palette || fallback.colorSystem,
          typography: cleanPromptText(item.typography) || fallback.directions[index]?.typography || fallback.typographyTone,
          texture: cleanPromptText(item.texture) || fallback.directions[index]?.texture || fallback.textureSource,
          scenario: cleanPromptText(item.scenario) || fallback.directions[index]?.scenario || fallback.useScene,
          risk: cleanPromptText(item.risk) || fallback.directions[index]?.risk || "注意裁切、文字乱码和信息拥挤。",
          score: Number.isFinite(Number(item.score)) ? Math.max(0, Math.min(100, Number(item.score))) : fallback.directions[index]?.score || 80,
        };
      })
      .slice(0, 3)
    : fallback.directions;
  while (directions.length < 3) {
    const fallbackDirection = fallback.directions[directions.length] || fallback.directions[0];
    directions.push(fallbackDirection);
  }
  const recommended = source.recommendedDirectionId === "A" || source.recommendedDirectionId === "B" || source.recommendedDirectionId === "C"
    ? source.recommendedDirectionId
    : directions.reduce((best, item) => (item.score > best.score ? item : best), directions[0]).id;
  const cleanedCopy = normalizeBriefVisibleCopy(source, fallback);
  return {
    imageType: cleanPromptText(source.imageType) || fallback.imageType,
    useScene: cleanPromptText(source.useScene) || fallback.useScene,
    audience: cleanPromptText(source.audience) || fallback.audience,
    communicationGoal: cleanPromptText(source.communicationGoal) || fallback.communicationGoal,
    title: cleanedCopy.title,
    subtitle: cleanedCopy.subtitle,
    sellingPoints: cleanedCopy.sellingPoints,
    mainVisualConcept: cleanPromptText(source.mainVisualConcept) || fallback.mainVisualConcept,
    creativeMetaphor: cleanPromptText(source.creativeMetaphor) || fallback.creativeMetaphor,
    layout: cleanPromptText(source.layout) || fallback.layout,
    colorSystem: cleanPromptText(source.colorSystem) || fallback.colorSystem,
    typographyTone: cleanPromptText(source.typographyTone) || fallback.typographyTone,
    textureSource: cleanPromptText(source.textureSource) || fallback.textureSource,
    whitespaceAndSafety: cleanPromptText(source.whitespaceAndSafety) || fallback.whitespaceAndSafety,
    industryRules: cleanPromptText(source.industryRules) || fallback.industryRules,
    textPolicy: cleanPromptText(source.textPolicy) || fallback.textPolicy,
    directions,
    recommendedDirectionId: recommended,
    recommendationReason: cleanPromptText(source.recommendationReason) || fallback.recommendationReason,
  };
}

function normalizeBriefVisibleCopy(source: Partial<DesignDirectorBrief>, fallback: DesignDirectorBrief) {
  const sourceTitle = cleanPromptText(source.title);
  const sourceSubtitle = cleanPromptText(source.subtitle);
  const allowPromotionCopy = fallback.sellingPoints.some((item) => /礼遇|好礼|优惠|福利|促销|领取|报名|套餐|买赠/.test(item));
  const title = isUsablePosterCopy(sourceTitle, "title", allowPromotionCopy) ? sourceTitle : fallback.title;
  const subtitle = isUsablePosterCopy(sourceSubtitle, "subtitle", allowPromotionCopy) ? sourceSubtitle : fallback.subtitle;
  const sourcePoints = Array.isArray(source.sellingPoints) ? source.sellingPoints.map(cleanPromptText).filter(Boolean) : [];
  const sellingPoints = [...sourcePoints.filter((item) => isUsablePosterCopy(item, "label", allowPromotionCopy)), ...fallback.sellingPoints]
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 3);
  return { title, subtitle, sellingPoints: sellingPoints.length ? sellingPoints : fallback.sellingPoints };
}

function isUsablePosterCopy(value: string, role: "title" | "subtitle" | "label", allowPromotionCopy = false) {
  if (!value) return false;
  if (value.length > (role === "title" ? 18 : 28)) return false;
  if (role === "title" && /海报|广告|宣传图|设计图|图片|生成/.test(value)) return false;
  if (!allowPromotionCopy && /好礼|礼遇|福利|钜惠|优惠|限时|促销|转化|到店|领取|套餐|买赠/.test(value)) return false;
  if (/^(节日氛围|品牌祝福|活动转化|探索感|互动感|知识传播|主题清晰|视觉完整|信息克制|核心卖点|商业转化|传播记忆点|用户转化)$/.test(value)) return false;
  if (/^(节日|品牌|活动|商业|视觉|信息|转化|传播|互动|探索|知识)(氛围|祝福|转化|感|传播|标签|卖点|策略)$/.test(value)) return false;
  if (/^(海报|广告|宣传|生成|设计|图片)$/.test(value)) return false;
  return true;
}

export function buildDesignDirectorImagePrompt(
  request: DesignRequest,
  brief: DesignDirectorBrief,
  direction: DesignDirectorDirection,
) {
  const referenceImages = normalizeTextReferenceImages(request.referenceImages);
  const strongReferenceMode = referenceImages.length > 0 && shouldUseStrongTextReferenceMode(request.prompt);
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(request.prompt);
  const autoProtectedTexts = noVisiblePolicy.noText ? [] : extractProtectionFromText(`${request.prompt}\n${request.sourceAnalysis || ""}`);
  const protectionContext = normalizeProtectionContext({
    ...request.protectionContext,
    protectedTexts: [...(request.protectionContext?.protectedTexts || []), ...autoProtectedTexts],
  });
  const wantsProjectContext = wantsProjectOutputContext(request.prompt);
  const shouldIncludeProtection = !noVisiblePolicy.noText && (wantsProjectContext || hasProtectionPromptContent(protectionContext));
  const hasExplicitCopy = hasExplicitCopyInstruction(request.prompt);
  const personIntent = inferPersonIntent(request.prompt);
  const ratio = resolveDesignRequestRatio(request);
  const sanitizedSourceAnalysis = sanitizedReferenceAnalysisForPrompt(request.sourceAnalysis, request.prompt);
  return [
    promptSection("Task", [
      `Draw a professional commercial visual design for: ${brief.title}.`,
      hasExplicitCopy
        ? `User request with possible visible copy: ${compactPromptText(request.prompt, 520)}`
        : `Non-visible design instruction from user: ${compactPromptText(request.prompt, 520)}. Treat this as art direction only, never as poster headline, subtitle, label, badge, or body copy.`,
      `Purpose/audience: ${brief.communicationGoal}; ${brief.audience}.`,
    ]),
    promptSection("Structured poster planning", [
      `Inferred design type: ${brief.imageType}.`,
      `Inferred use scene: ${brief.useScene}.`,
      `Inferred audience: ${brief.audience}.`,
      `Communication goal: ${brief.communicationGoal}.`,
      `Industry/style rules: ${brief.industryRules}.`,
    ]),
    promptSection("Planned visible copy", plannedVisibleCopyLines(brief, request.prompt, hasExplicitCopy)),
    promptSection("Canvas", [
      `Native ${ratio.label}, target ${ratio.targetWidth}x${ratio.targetHeight}; full composition. No cropping, no side blur padding, no frosted edges.`,
      `Keep ${importantElementsLabel(request.prompt)} complete inside 10-15% safe margins.`,
    ]),
    promptSection("Scene and layout execution", [
      `Primary visual elements: ${direction.mainVisual || brief.mainVisualConcept}.`,
      personIntent ? `Person direction: ${personIntent}; the person must be complete, natural, commercially lit, and integrated with the poster theme.` : "",
      `Layout zones: ${direction.layout || brief.layout}.`,
      `Color/style system: ${direction.palette || brief.colorSystem}.`,
      `Typography tone: ${brief.typographyTone}; ${direction.typography}.`,
      `Whitespace/safety: ${brief.whitespaceAndSafety}.`,
      "Do not merely draw words from the user request; execute the planned copy, visual elements, layout zones, palette, and commercial hierarchy above.",
      hasExplicitCopy
        ? "Only user text that is clearly introduced as a title/copy to be written may appear as visible typography."
        : "The raw user instruction must not appear anywhere in the image. Do not render words like optimize design, brand feeling, design feeling, professional, technology feeling, reference image, modify, improve, or similar request phrases.",
    ]),
    promptSection("Selected design direction", [
      `${direction.name} - ${direction.concept}`,
      `Main visual: ${direction.mainVisual || brief.mainVisualConcept}`,
      `Creative metaphor: ${brief.creativeMetaphor}`,
      `Layout: ${direction.layout || brief.layout}; clear grid, aligned zones, consistent spacing.`,
      `Color palette: ${direction.palette || brief.colorSystem}`,
      `Lighting/material: ${direction.texture || brief.textureSource}`,
      `Industry tone: ${brief.industryRules}`,
    ]),
    buildTextReferencePrompt(referenceImages, strongReferenceMode),
    sanitizedSourceAnalysis ? promptSection("Reference analysis", [compactPromptText(sanitizedSourceAnalysis, 720)]) : "",
    promptSection("Text policy", [
      noVisibleOutputLines(request.prompt),
      buildCopyPolicy(request.prompt, hasExplicitCopy),
      noVisiblePolicy.noText
        ? "No visible typography at all; keep clean negative space for later real-font layout."
        : wantsProjectContext
          ? "Minimal text only; avoid fake Chinese and tiny unreadable text; long copy, phone, address, QR code are reserved for real-font layout later."
          : "Minimal text only; avoid fake text and tiny unreadable text; detailed copy is reserved for real-font layout later.",
      hasExplicitCopy
        ? "Visible text source: planned visible copy and explicitly requested real copy only."
        : "Visible text source: planned visible copy only. Never use raw operation words from the user prompt as design text.",
      "AI 只生成极少文字或无字背景；真实长文后期用真实字体排版。",
    ]),
    shouldIncludeProtection ? promptSection("Protected source facts", [compactPromptText(buildProtectionPrompt(protectionContext), 560)]) : "",
    promptSection("Finish", [
      "Unified lighting, real shadows, matching perspective, natural depth, clean commercial details, no collage feeling.",
      buildContextAwareAvoidLine(request.prompt),
    ]),
  ].filter(Boolean).join("\n");
}

function plannedVisibleCopyLines(brief: DesignDirectorBrief, prompt: string, hasExplicitCopy: boolean) {
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(prompt);
  if (noVisiblePolicy.noText) return ["No visible copy; reserve clean negative space for real-font layout later."];
  const isFestival = /端午|中秋|春节|新年|节日|龙舟|粽子|月饼|红包/.test(`${prompt}\n${brief.imageType}\n${brief.useScene}`);
  const [supportingCopy, ...shortLabels] = brief.sellingPoints.slice(0, 3);
  return [
    hasExplicitCopy
      ? "User provided explicit copy: keep the user's title/copy meaning and do not invent real contact information."
      : "No explicit copy was provided: use the following planned short commercial copy instead of simply repeating the raw user prompt.",
    `Headline: ${brief.title}.`,
    brief.subtitle ? `Subheadline: ${brief.subtitle}.` : "",
    isFestival && supportingCopy ? `Supporting copy: ${supportingCopy}.` : "",
    isFestival && shortLabels.length ? `Optional bottom labels: ${shortLabels.join(" / ")}.` : "",
    !isFestival && brief.sellingPoints.length ? `Selling points: ${brief.sellingPoints.slice(0, 3).join(" / ")}.` : "",
    "Use real poster copy, not planning labels such as festival mood, brand blessing, activity conversion, exploration, interaction, or knowledge communication.",
    "Use at most one headline, one subheadline, one supporting copy line, and up to three short labels. Do not invent phone numbers, addresses, QR codes, prices, dates, hospital/company names, or legal claims.",
  ].filter(Boolean);
}

export function buildTextToImagePrompt(request: DesignRequest) {
  const keepContent = /内容不(少|减|变)|保留全部|全部保留/.test(request.prompt);
  const keepRatio = request.keepOriginalRatio || /比例不变|保持比例|尺寸不变/.test(request.prompt);
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(request.prompt);
  const hasExplicitCopy = hasExplicitCopyInstruction(request.prompt);
  const referenceImages = normalizeTextReferenceImages(request.referenceImages);
  const autoProtectedTexts = noVisiblePolicy.noText ? [] : extractProtectionFromText(`${request.prompt}\n${request.sourceAnalysis || ""}`);
  const protectionContext = normalizeProtectionContext({
    ...request.protectionContext,
    protectedTexts: [...(request.protectionContext?.protectedTexts || []), ...autoProtectedTexts],
  });
  const wantsProjectContext = wantsProjectOutputContext(request.prompt);
  const shouldIncludeProtection = !noVisiblePolicy.noText && (wantsProjectContext || hasProtectionPromptContent(protectionContext));
  const protectionPrompt = shouldIncludeProtection ? buildProtectionPrompt(protectionContext) : "";
  const domainLines = buildDomainLines(`${request.adType || ""}\n${request.prompt || ""}\n${request.sourceAnalysis || ""}`);
  const lockedCanvas = textToImageCanvasLock(request);
  const compositionPrompt = buildTextToImageCompositionPrompt(request, `${request.prompt}\n${request.adType || ""}`);
  const negativePrompt = buildTextToImageNegativePrompt();
  const strongReferenceMode = referenceImages.length > 0 && shouldUseStrongTextReferenceMode(request.prompt);
  const sanitizedSourceAnalysis = sanitizedReferenceAnalysisForPrompt(request.sourceAnalysis, request.prompt);

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
    sanitizedSourceAnalysis ? `参考图分析：${sanitizedSourceAnalysis}` : "",
    buildCommercialDesignDirectorPrompt(`${request.adType || ""}\n${request.prompt || ""}`, {
      variantDirection: request.variantDirection,
      adType: request.adType,
    }),
    noVisibleOutputLines(request.prompt),
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
    wantsProjectContext ? "素材上画：项目记忆只作参考；电话、地址、Logo、二维码只有用户明确要求才放入画面。" : "",
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
  const wantsProjectContext = wantsProjectOutputContext(text);
  const densityLine = options?.variantDirection === "creative"
    ? "方向：更有视觉记忆点，但必须克制、相关、完整。"
    : wantsProjectContext ? "方向：成熟商业版，信息清晰、少文字、稳版式、品牌可信。" : "方向：成熟商业版，信息清晰、少文字、稳版式、主题可信。";
  const typeLine = /详情页|电商|商品|产品/.test(`${options?.adType || ""}\n${text}`)
    ? "场景：详情页/电商首屏突出产品、利益点和转化路径。"
    : /户外|电子屏|大屏|横幅|公交/.test(`${options?.adType || ""}\n${text}`)
      ? "场景：户外/电子屏优先远距离识别，标题少而强，主体完整。"
      : "场景：海报突出主题、情绪和传播记忆点，同时保持可读和完整。";

  return [
    "商业设计规则：",
    "- 像成熟品牌投放稿，不像模板拼贴或廉价促销传单。",
    "- 主视觉、背景、光效、道具都服务当前主题，不堆无关元素。",
    "- 信息层级最多 3 层；卖点最多 3 个；没有明确文案时少字或无字。",
    wantsProjectContext ? "- Logo 只是品牌识别，默认宽度 6%-12%，不要当主视觉。" : "",
    "- 配色控制为 1 个主色、1-2 个辅助色、1 个强调色。",
    buildLayoutDesignSystemPrompt(wantsProjectContext),
    `- ${typeLine}`,
    densityLine,
  ].filter(Boolean).join("\n");
}

function buildLayoutDesignSystemPrompt(includeBrandSlots = true) {
  return [
    "版式设计规范：",
    "- 栅格：使用 4/8/12 栅格或明确左右/上下分区；同组内容共用同一左/中/右对齐轴。",
    includeBrandSlots
      ? "- 对齐：标题、副标题、卖点、按钮、Logo、二维码落在清晰对齐线；禁止随机漂浮、错位和不齐。"
      : "- 对齐：标题、副标题、卖点、按钮和主体落在清晰对齐线；禁止随机漂浮、错位和不齐。",
    "- 间距：使用统一 spacing scale；组内近、组间远，留白服务阅读层级。",
    "- 层级：主标题 > 主视觉 > 核心卖点 > 辅助信息；主标题约为副标题 1.6-2.4 倍。",
    includeBrandSlots ? "- Logo：默认宽度 6%-10%，最大 12%；放品牌区或安全角，不压主标题，不贴边。" : "",
    "- 动线：按 Z/F/中心焦点之一组织阅读顺序；文字区和主体区分区明确，不互相遮挡。",
    "- 一致性：字体风格不超过 2 个；圆角、描边、阴影、图标和装饰风格统一。",
  ].filter(Boolean).join("\n");
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
  const wantsProjectContext = wantsProjectOutputContext(text);
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
    wantsProjectContext
      ? `中心安全区：重要文字、Logo、人物、产品、IP、二维码和卖点放在画面中心 76% 内；四周至少 ${safeMargin}% 只放可延展背景、纹理和装饰。`
      : `中心安全区：重要主体、人物、产品、标题和卖点放在画面中心 76% 内；四周至少 ${safeMargin}% 只放可延展背景、纹理和装饰。`,
    wantsProjectContext ? "尺度：主标题高度不超过画面 25%；Logo 宽度 6%-12%；卖点 3-5 个以内。" : "尺度：主标题高度不超过画面 25%；主体中等完整；卖点 3-5 个以内。",
    wantsProjectContext ? "版式落点：所有主要元素必须落在清晰栅格和对齐轴上；标题区、主体区、卖点区、品牌区要分组明确。" : "版式落点：所有主要元素必须落在清晰栅格和对齐轴上；标题区、主体区和卖点区要分组明确。",
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

function cleanPromptText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactPromptText(value: unknown, maxLength: number) {
  const text = cleanPromptText(value);
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function inferDirectorImageType(text: string) {
  if (/详情页|电商|商品/.test(text)) return "详情页 / 产品首屏";
  if (/PPT|幻灯|汇报|首页/.test(text)) return "PPT 背景 / 首页";
  if (/户外|公交|电梯|电子屏|大屏|横幅/.test(text)) return "户外广告 / 电子屏";
  if (/易拉宝|展架/.test(text)) return "易拉宝 / 展架";
  if (/封面|视频/.test(text)) return "视频封面";
  return /海报|活动|宣传/.test(text) ? "商业海报" : "商业视觉设计";
}

function inferDirectorIndustry(text: string) {
  if (/医疗|医院|医生|患者|胃|肠|内镜|体检|药|康复|口腔/.test(text)) return "医疗";
  if (/科普|科技馆|科技|AI|机器人|课程|学校|学生/.test(text)) return "科普科技";
  if (/产品|包装|电商|商品|详情页/.test(text)) return "产品电商";
  if (/教育|培训|研学|亲子|儿童/.test(text)) return "教育活动";
  return "通用商业";
}

function inferDirectorTitle(prompt: string) {
  const normalized = cleanUserDesignIntent(prompt).replace(/[。.!！?？].*$/, "");
  const titleMatch = normalized.match(/(?:主标题|标题|主题)[:：]\s*([^，,；;\n]+)/);
  if (titleMatch?.[1]) return titleMatch[1].slice(0, 18);
  const posterTheme = normalized.match(/([\u4e00-\u9fa5A-Za-z0-9·]{2,16})(?:海报|广告|宣传图|视觉|主视觉|封面)/);
  if (posterTheme?.[1]) return posterTheme[1].slice(0, 18);
  const cleanTheme = normalized
    .replace(/(?:海报|广告|宣传图|视觉|主视觉|封面|图片|设计图)$/g, "")
    .replace(/^(?:一张|一个|一版|一套)/, "")
    .trim();
  if (cleanTheme && !/^(帮我|生成|设计|制作|做|来个|想要|需要)$/.test(cleanTheme)) return cleanTheme.slice(0, 18);
  return "商业主题视觉";
}

function inferDirectorSellingPoints(text: string) {
  const points = cleanUserDesignIntent(text)
    .split(/[，,；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 24)
    .filter((item) => !/海报|详情页|尺寸|比例|生成|设计|图片|帮我|做一张|来一张|文生图|提示词/.test(item))
    .slice(0, 3);
  if (points.length) return points;
  if (/医疗|医生|患者/.test(text)) return ["专业可信", "舒适安心", "流程清晰"];
  if (/产品|包装|商品/.test(text)) return ["品质感", "核心卖点", "清晰转化"];
  if (/科普|科技/.test(text)) return ["探索感", "互动感", "知识传播"];
  return ["主题清晰", "视觉完整", "信息克制"];
}

function cleanUserDesignIntent(prompt: string) {
  return cleanPromptText(prompt)
    .replace(/^(?:请|麻烦|帮我|给我|帮忙|我要|想要|需要|帮我生成|帮我设计|生成|设计|制作|做|做一张|来一张|出一张|出个|来个)\s*/g, "")
    .replace(/(?:一下|看看|试试|可以吗|谢谢)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferPersonIntent(prompt: string) {
  const text = prompt || "";
  if (!/(人物|人像|真人|模特|医生|专家|老师|学生|儿童|孩子|家庭|老人|年轻|女性|男性|男士|女士|主持人|讲解员|IP形象|吉祥物|卡通形象|全身|半身|头像|肖像|person|portrait|model)/i.test(text)) return "";
  const explicitAdd = /(加|加入|添加|放入|放上|出现|使用|带|要有|需要|包含|安排|突出|换成|替换)/.test(text);
  if (!explicitAdd && !/(人物|人像|真人|模特|医生|专家|IP形象|吉祥物|卡通形象)/.test(text)) return "";
  const type =
    /医生|专家|主任|护士/.test(text) ? "professional medical staff, trustworthy and friendly"
      : /老师|讲师|学生|儿童|孩子|亲子|家庭/.test(text) ? "education/family friendly people, natural interaction"
        : /IP形象|吉祥物|卡通形象/.test(text) ? "brand IP mascot character, recognizable and complete"
          : /女性|女士|女/.test(text) ? "female model, natural expression"
            : /男性|男士|男/.test(text) ? "male model, natural expression"
              : "suitable commercial poster person";
  const framing = /全身/.test(text) ? "full body" : /头像|肖像|人像/.test(text) ? "portrait or bust" : /半身/.test(text) ? "half body" : "medium shot or full figure as layout requires";
  return `${type}; ${framing}; complete head, hands, body edges inside safe margins; do not invent identity-sensitive uniforms, badges, hospital/company names, phone numbers, or addresses.`;
}

function inferFestivalPoster(text: string) {
  if (/端午|龙舟|粽子|艾草|五彩绳/.test(text)) {
    const industry = inferDirectorIndustry(text);
    const hasPromotionIntent = /活动|促销|优惠|折扣|福利|礼品|好礼|礼遇|领取|报名|套餐|买赠|门店|到店|转化/.test(text);
    if (industry === "科普科技") {
      return {
        title: "科技里的端午",
        subtitle: "传统文化与科学探索的奇妙相遇",
        sellingPoints: ["一起发现端午里的科学奥秘", "民俗实验", "互动探索"],
        useScene: "科技馆科普活动 / 亲子研学 / 线上海报",
        audience: "学生、家长和科普活动参与者",
        communicationGoal: "把端午传统文化转化为可参与、可探索的科普活动，吸引亲子家庭报名或到馆体验",
        colorSystem: "青绿、米白为主，搭配科技蓝和少量金色；传统纹样与科学光效克制融合",
        mainVisualConcept: "粽子、龙舟、水纹、艾草与科学装置、星轨、互动实验台结合，表达传统文化里的科学探索",
        creativeMetaphor: "用龙舟水纹连接科学轨迹，让传统节日变成一场可探索的奇妙旅程",
        stableLayout: "上方主标题 / 中央粽子龙舟与科学装置主视觉 / 底部活动信息与馆方留白区",
        creativeLayout: "龙舟水纹形成探索路径，科学光轨环绕粽子主视觉，标题与主体错位但保持安全边距",
        typographyTone: "现代国风结合科技感标题字，副标题清楚，避免长文和伪中文小字",
      };
    }
    if (industry === "医疗") {
      return {
        title: "端午安康",
        subtitle: "粽叶飘香，安康常伴",
        sellingPoints: ["愿您和家人平安顺遂，身心常健", "健康相伴", "安心守护"],
        useScene: "医院品牌节日海报 / 节日问候 / 线上传播",
        audience: "患者、家属、社区居民和医院品牌关注者",
        communicationGoal: "用端午节日氛围传达医院的专业、温和与长期陪伴，不做促销和送礼暗示",
        colorSystem: "青绿、米白、浅金为主，整体干净温和；竹叶、水纹和传统纹样保持克制",
        mainVisualConcept: "粽叶、艾草、竹影、水纹、柔和晨光与医院品牌标识形成清爽安康的节日画面",
        creativeMetaphor: "用艾草清香和粽叶包裹感表达平安、守护与节日关怀",
        stableLayout: "左上品牌区 / 右侧或中上主标题 / 中部节日主视觉 / 底部简短祝福与留白区",
        creativeLayout: "竹影和水纹形成柔和动线，标题稳重醒目，品牌区清楚但不压主视觉",
        typographyTone: "稳重现代国风标题字，副标题温和清楚，避免促销口吻和拥挤小字",
      };
    }
    return {
      title: "端午安康",
      subtitle: "粽叶飘香，情暖仲夏",
      sellingPoints: hasPromotionIntent ? ["愿你岁岁安康，万事顺遂", "粽香礼遇", "仲夏好礼"] : ["愿你岁岁安康，万事顺遂", "粽香仲夏", "安康相伴"],
      useScene: hasPromotionIntent ? "节日活动海报 / 线上传播 / 门店活动预热" : "品牌节日海报 / 节日问候 / 线上传播",
      audience: "品牌用户、门店顾客和线上活动参与者",
      communicationGoal: hasPromotionIntent
        ? "用端午节日情绪吸引注意，传达祝福和活动信息，提升传播与到店/转化意愿"
        : "用端午节日情绪传达品牌问候和陪伴感，建立温和、可信、有节日记忆点的品牌形象",
      colorSystem: "青绿、米白为主，少量金色点缀；水纹、竹叶和传统纹样保持克制高级",
      mainVisualConcept: "粽子、龙舟、水纹、艾草、祥云或竹叶构成主视觉，结合现代商业留白和节日仪式感",
      creativeMetaphor: hasPromotionIntent
        ? "用龙舟动势和粽叶包裹感表达节日活力、团圆祝福和品牌礼遇"
        : "用龙舟动势和粽叶包裹感表达节日活力、平安祝福和品牌陪伴",
      stableLayout: "上方主标题 / 中央粽子与龙舟主视觉 / 底部活动信息与品牌留白区",
      creativeLayout: "龙舟水纹形成动势斜线，粽子作为视觉焦点，标题与主体错位但保持安全边距",
      typographyTone: "现代国风标题字，副标题简洁，避免长文和伪中文小字",
    };
  }
  if (/中秋|月饼|月亮|桂花|团圆/.test(text)) {
    return {
      title: "月满中秋",
      subtitle: "中秋限定礼遇",
      sellingPoints: ["团圆氛围", "礼赠场景", "品牌温度"],
      useScene: "节日营销 / 礼赠传播 / 线上海报",
      audience: "品牌用户、礼赠客户和活动参与者",
      communicationGoal: "用团圆和礼赠情绪建立节日记忆点，承接品牌活动或产品转化",
      colorSystem: "暖金、月白、深蓝或桂花橙为主，质感温润，不做廉价促销红",
      mainVisualConcept: "明月、月饼、桂花、礼盒和云纹形成中心主视觉，保留高级留白",
      creativeMetaphor: "用圆月和礼盒表达团圆、礼遇与品牌心意",
      stableLayout: "上方主标题 / 中央月亮礼盒主视觉 / 底部活动信息区",
      creativeLayout: "月亮作为大背景焦点，礼盒或月饼前景错位构图，信息区清晰分层",
      typographyTone: "温润国风标题字，字数克制，细节文案后期排版",
    };
  }
  if (/春节|新年|除夕|拜年|红包|年货/.test(text)) {
    return {
      title: "新春大吉",
      subtitle: "新年限定礼遇",
      sellingPoints: ["新年氛围", "喜庆祝福", "活动转化"],
      useScene: "春节营销 / 门店活动 / 线上传播",
      audience: "品牌用户、家庭消费人群和活动参与者",
      communicationGoal: "用喜庆节日氛围吸引注意，传达祝福、优惠或年货活动",
      colorSystem: "中国红、暖金和少量米白，保持高级质感，避免杂乱廉价",
      mainVisualConcept: "灯笼、红包、窗花、祥云、礼盒和金色光效构成节日主视觉",
      creativeMetaphor: "用打开的礼盒和升腾祥云表达好运、礼遇和品牌祝福",
      stableLayout: "上方大标题 / 中央礼盒灯笼主视觉 / 底部活动信息区",
      creativeLayout: "红金节日元素环绕中心主视觉，标题和礼盒错位形成动势",
      typographyTone: "喜庆但克制的标题字，避免过多金属描边和拥挤小字",
    };
  }
  return null;
}

function buildDirectorIndustryRules(text: string) {
  if (/端午|中秋|春节|新年|节日|龙舟|粽子|月饼|红包/.test(text)) return "节日营销：符号必须强相关，节日元素服务主题和活动转化；主标题清楚，主体完整，避免素材堆砌、廉价促销感和伪中文小字。";
  const industry = inferDirectorIndustry(text);
  if (industry === "医疗") return "医疗类：专业、可信、干净、温和、安全；不要低价促销感、恐吓患者、过度科幻或杂乱背景。";
  if (industry === "科普科技") return "科普/科技馆：探索、知识、互动、公益；活泼但不幼稚，有空间感，不要商业促销堆砌。";
  if (industry === "产品电商") return "产品/详情页：产品第一主体；背景不抢产品；卖点最多 3 个；不改变产品结构、Logo、包装文字。";
  if (/户外|公交|电子屏|大屏|横幅/.test(text)) return "户外广告：远距离可读，字少，冲击强，背景简单，3 秒内看懂。";
  if (/PPT|背景|首页/.test(text)) return "PPT 背景：干净、留白、标题空间充足，主视觉不抢正文。";
  return "通用商业：主题相关、层级清楚、少字、留白充分、配色统一。";
}

function normalizeTextReferenceImages(value: DesignRequest["referenceImages"]) {
  return Array.isArray(value) ? value.filter((item) => Boolean(item?.label)).slice(0, 5) : [];
}

function buildTextReferencePrompt(referenceImages: NonNullable<DesignRequest["referenceImages"]>, strongReferenceMode = false) {
  if (!referenceImages.length) return "";
  return [
    "【参考图角色】",
    "控制方式：先区分结构、风格、主体、产品、Logo 和文字排版，再决定是否进入画面。",
    ...referenceImages.map((item, index) => {
      const label = item.label || `参考图${index + 1}`;
      return `${label}：${textReferenceRoleInstruction(item.role)}；权重：${textReferenceWeightLabel(item.weight)}。${item.fileName ? `文件：${item.fileName}。` : ""}`;
    }),
    "",
    "【生成要求】",
    strongReferenceMode
      ? "强参考：第 1 张参考图是主参考，优先保持它的版式骨架、色彩关系、信息层级、视觉重心、活动主题、核心文案和整体气质；只替换用户明确要求修改的内容。"
      : "严格按上面的参考图角色使用素材：人物、产品、主体、背景、风格、构图、色调、文字排版、Logo、IP形象和装饰元素各用各的，不要把参考图身份混在一起。",
    strongReferenceMode
      ? "第 2-5 张参考图只能补充人物、产品、Logo、IP、背景、装饰或局部质感，不能改变第 1 张的主体版式和配色方向。"
      : "输出一张完整新设计图，不是把参考图机械拼贴，也不是图生图复刻。",
    "参考图职责要分开：结构参考只控制版式，风格参考只控制色彩/质感，主体/产品/Logo 参考才可进入画面。",
    "不要把不同参考图的人物身份、品牌标识、包装文字和机构信息混合编造。",
  ].join("\n");
}

export function shouldUseStrongTextReferenceMode(prompt: string) {
  return /1\s*[:：比]\s*1|一比一|复刻|仿照|照着|照抄|同款|参考图|参考画面|画面参考|参考.*内容|参考.*文案|参考.*活动|活动信息|活动内容不变|其他不变|内容不变|主体不变|只改|只替换|稍微修改|轻微修改|小改|保持版式|版式不变|保持配色|配色不变|板式配色|版式配色|按这个版式|用这个版式|沿用版式|沿用配色|把.+改成|换成/.test(prompt);
}

function textReferenceRoleInstruction(role: string) {
  const labels: Record<string, string> = {
    person: "使用其中的人物主体，保持人物识别度和自然融合",
    product: "使用其中的产品，保持产品识别度、透视和质感",
    subject: "使用其中的主体元素，作为本次画面的主要视觉来源",
    background: "使用其中的背景场景，按新设计需要重新融合光影和空间",
    style: "参考整体设计风格、色调、质感和排版感觉，不直接照搬具体内容",
    composition: "作为主参考：参考版式结构、画面重心、信息层级和可见活动内容",
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
            resizeModeInstruction(normalized),
            normalized.fitMode === "smart_outpaint"
              ? "按目标画布扩展背景、光影和空间，保留原版式、原标题位置、主体比例和视觉重心；成图必须贴满目标画布。"
              : "按新比例重排视觉重心、标题区、主体区和信息区；使用栅格、对齐轴和统一间距；成图必须贴满目标画布。",
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
        "Variant: subject-led design. Make the person/product/IP the first focal point; arrange title and selling points around it.",
      ]
    : [
        "本次输出：方案 1，大标题主导方向。",
        "Variant: headline-led design. Make the main headline area stronger; subject and selling points support the headline.",
      ];
  const ratioLine = input.keepOriginalRatio
    ? "Canvas: keep the reference aspect ratio, but redesign layout, text area, subject area, and visual center."
    : `Canvas: native ${input.aspectRatioLabel || "selected ratio"}${input.targetSize ? `, target ${input.targetSize}` : ""}; redesign for this canvas, no crop or padding.`;

  return [
    "Edit the input image into a new commercial design. This is creative redesign, not high-definition restoration.",
    "高清重绘是让原图变清楚；图生图是参考原图重新设计。",
    ratioLine,
    `User direction: ${compactPromptText(input.userPrompt || IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST, 900)}`,
    ...variantLines,
    "Preserve from the input: theme, brand color direction, core copy meaning, logo identity, main person/product/IP recognizability, and important selling points.",
    "差异化：两个方案至少在标题位置、主体位置、卖点排列、背景光效、画面重心中的 3 项不同。",
    "Redesign: title position, subject position, selling point grouping, background lighting, and visual weight should feel intentionally new.",
    "构图：full composition, complete text/subject visible, 12-16% safe margins, no edge clipping.",
    "超宽横幅：标题和卖点放在垂直中心安全带，主标题高度不超过横幅高度 35%。",
    compactPromptText(buildCreativeImageToImageProtectionPrompt(input.protectionContext), 900),
    buildDomainLines(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`),
    "Avoid: copying the original layout, tiny changes only, fake text, fake logo, fake phone/address/QR code, missing core information, watermark, cropping, side blur padding.",
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
        "Variant B: advertising composite. Make it more polished, layered, and commercial while keeping the placement believable.",
      ]
    : [
        "本次输出：方案A，真实自然合成。",
        "Variant A: natural realistic composite. It should look like one real shot, not a pasted object.",
      ];
  return [
    "任务类型：AI合成。不是简单融合两张图，而是把图1的主体自然合成到图2的场景里。",
    "Edit image 2 by adding the main subject from image 1 into the scene.",
    `Composite goal: ${compactPromptText(normalized.fusionMode || "主体入景", 500)}.`,
    "图1 = 主体来源；图2 = 场景来源",
    "Image 1 = subject source. Image 2 = scene/background source.",
    "合成要点：大小、位置、透视、接触、遮挡、光向、投影、反射、色温、颗粒、清晰度、边缘和景深一致。",
    "Match scale, placement, perspective, contact, occlusion, light direction, shadow, reflection, color temperature, grain, sharpness, edge softness, and depth of field.",
    ...variantLines,
    "Preserve subject identity from image 1 and any user-specified brand/text/logo/phone/address/QR assets.",
    "Composition: subject, hair/hands/feet/product edges/logo/title/QR/bottom info complete inside the safe area.",
    ...baseDesignLines(normalized, hasExplicitCopy),
    normalized.keepOriginalRatio
      ? "Canvas: keep image 2 scene aspect ratio."
      : `Canvas: native ${normalized.aspectRatioLabel || "selected ratio"}${normalized.targetSize ? `, target ${normalized.targetSize}` : ""}; no cropped important content.`,
    outputQualityLines(normalized.quality),
    "Avoid: side-by-side collage, transparent overlay, sticker edges, double border, pasted look, mismatched light, cropped subject, fake text/logo/QR.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMaskEditPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput({ ...input, task: "mask_edit" });
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  return [
    "任务类型：局部 AI 修改 / inpainting。",
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
  "AI 画质增强流程：以输入图片为唯一事实来源，先做高保真图像编辑增强，再进行 2K/4K/8K 商业输出和最终质检。保持原图比例，不使用模糊补边、磨砂补边、白边或裁切。";

export function buildHdRedrawPrompt(input: PromptRecipeInput) {
  const normalized = normalizePromptInput(input);
  const hasExplicitCopy = hasExplicitCopyInstruction(normalized.userPrompt);
  const enhancementMode = normalizeQualityEnhanceMode(normalized.enhancementMode);
  const modePrompt = enhancementMode === "creative"
    ? [
        "画质模式：Creative / 质感高清重绘。",
        "Mode: Creative texture redraw.",
        "Best for low-text hero visuals, food, products, backgrounds, and atmosphere images.",
        "Keep the original composition, subject placement, theme, color direction, and layout.",
        "Generatively rebuild texture, material detail, highlights, shadows, reflections, depth, clean edges, and commercial photography quality.",
        "Protect faces, text, logos, QR codes, and product structure from random redraw; 不能生成式乱重绘。",
      ]
    : enhancementMode === "plus"
      ? [
          "画质模式：Plus / 图文双清晰增强。",
          "Mode: Plus text-and-visual enhancement.",
          "Keep all text, logo text, package text, QR code, positions, and layout faithful.",
          "Enhance non-text visual areas: product material, edge detail, highlights, shadows, background texture, and commercial finish.",
          "Goal: text stays accurate and more readable; image areas become clearer and more premium.",
        ]
      : [
        "画质模式：Standard / 文字优先高清修复。",
        "Mode: Standard text-first faithful enhancement.",
        "Best for posters, detail pages, screenshots, and images with lots of text.",
        "Strictly preserve composition, content, typography, logo, QR code, faces, product shape, element positions, and information hierarchy.",
        "Improve only text stroke clarity, edge sharpness, small-text readability, icon lines, denoise, deblocking, and overall crispness.",
        "Do not redesign, rewrite, replace, add content, change faces, or hallucinate details; 不要 AI 脑补新内容。",
      ];
  return [
    HD_REDRAW_PROMPT_TEMPLATE,
    "Task: high-fidelity image enhancement and 4K-ready restoration, not image redesign.",
    "Edit the input image for high-fidelity quality enhancement and 2K/4K-ready commercial output.",
    "Use the input image as the source of truth for composition, crop, layout, object identity, typography positions, colors, lighting direction, and scene structure.",
    "Improve clarity, edge sharpness, texture detail, material definition, denoise, deblocking, antialiasing, and subtle lighting/detail quality.",
    ...modePrompt,
    normalized.keepOriginalRatio
      ? `Output: keep original aspect ratio and layout; target ${normalized.targetSize || "2K/4K"}.`
      : `Output: ${normalized.aspectRatioLabel || "selected ratio"}${normalized.targetSize ? `, target ${normalized.targetSize}` : ""}; do not redesign the layout for quality enhancement.`,
    normalized.keepOriginalRatio ? "比例保护：画质增强必须优先保持源图宽高比，不拉伸、不裁切、不重排。" : "",
    normalized.userPrompt ? `User extra requirement: ${compactPromptText(normalized.userPrompt, 700)}` : "",
    compactPromptText(buildProtectionPrompt(normalized.protectionContext), 700),
    buildCopyPolicy(normalized.userPrompt, hasExplicitCopy),
    "Text handling: keep original characters and positions; sharpen readable strokes when possible; never invent replacement copy.",
    "官方输出要求：直接由 GPT Image 编辑链路完成高清保真增强，不依赖本地超分、锐化或补边伪装高清。",
    "Avoid: layout redesign, changed text, fake text, fake QR code, moved logo, changed face identity, changed product geometry, added elements, frame/border, white/black edge, blur padding, frosted side fill.",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeQualityEnhanceMode(value: string) {
  if (value === "plus" || value === "plus_enhance") return "plus";
  if (value === "creative" || value === "texture" || value === "texture_redraw" || value === "creative_redraw" || value === "ai_redraw") return "creative";
  return "standard";
}

function normalizePromptInput(input: PromptRecipeInput): Required<Omit<PromptRecipeInput, "protectionContext">> & { protectionContext: ProtectionContext } {
  const userPrompt = input.userPrompt?.trim() || "";
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(userPrompt);
  const autoProtectedTexts = noVisiblePolicy.noText ? [] : extractProtectionFromText(`${userPrompt}\n${input.sourceAnalysis || ""}`);
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
    enhancementMode: input.enhancementMode || "standard",
    protectionContext,
  };
}

function baseDesignLines(input: ReturnType<typeof normalizePromptInput>, hasExplicitCopy: boolean) {
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(input.userPrompt);
  const sanitizedSourceAnalysis = sanitizedReferenceAnalysisForPrompt(input.sourceAnalysis, input.userPrompt);
  const importantElements = importantElementsLabel(input.userPrompt);
  return [
    "Role: senior Chinese commercial designer. Produce a finished, usable design, not a template collage.",
    `Use case: ${input.adType || "通用设计"}.`,
    `User request: ${compactPromptText(input.userPrompt || "保留核心内容，优化为专业清晰的设计方案。", 720)}`,
    sanitizedSourceAnalysis ? `Reference analysis: ${compactPromptText(sanitizedSourceAnalysis, 720)}` : "",
    "Design rules: clear grid, shared alignment axes, consistent spacing, controlled palette, one focal point, real lighting, natural depth.",
    noVisibleOutputLines(input.userPrompt),
    noVisiblePolicy.noText ? "" : compactPromptText(buildProtectionPrompt(input.protectionContext), 560),
    buildCopyPolicy(input.userPrompt, hasExplicitCopy),
    noVisiblePolicy.noText
      ? "Completeness: keep only the requested visual subject/background complete inside safe margins; no text/logo/QR/contact elements should appear."
      : `Completeness: ${importantElements} stay fully visible inside safe margins.`,
    "Output: fill the target canvas natively; no white border, empty frame, crop, stretch, blur padding, or frosted edge.",
    buildDomainLines(`${input.adType}\n${input.userPrompt}\n${input.sourceAnalysis}`),
  ];
}

function buildDomainLines(text: string) {
  if (/医院|医疗|体检|门诊|医生|科室|诊疗|中医|西医|药|健康/.test(text)) {
    return "医疗广告规则：专业、清晰、可信，避免夸张疗效、虚假背书和不可信医疗视觉。";
  }
  if (/科技馆|科普|研学|展馆|博物馆|儿童|亲子|活动|招募/.test(text)) {
    return "科普/活动设计规则：亲和、清晰、有参与感，突出活动主题和行动号召，不要混入医疗、体检、医院等不相关视觉元素。";
  }
  if (/公交|户外|电梯|大屏|电子屏|展板|易拉宝|广告/.test(text)) {
    return "广告物料规则：远距离识别优先，标题要大，信息层级要少而清楚。";
  }
  return "通用商业设计规则：紧扣用户当前主题，不要串用无关行业或历史任务元素。";
}

function buildCopyPolicy(prompt: string, hasExplicitCopy: boolean) {
  const keepContent = /内容不(少|减|变)|保留全部|全部保留/.test(prompt);
  const noVisiblePolicy = resolveNoVisibleOutputPolicy(prompt);
  const wantsProjectContext = wantsProjectOutputContext(prompt);
  return [
    noVisiblePolicy.noText
      ? "文字策略：用户要求无文字/不要文字；成图必须无可见文字、无假中文、无英文字母、无数字、无标语、无电话地址、无水印。"
      : "",
    noVisiblePolicy.noLogo ? "Logo 策略：用户要求不要 Logo；不要生成任何品牌标识、院名、机构名或类似 Logo 的占位图形。" : "",
    noVisiblePolicy.noQr ? "二维码策略：用户要求不要二维码；不要生成二维码、条码、扫码图标或假二维码块。" : "",
    noVisiblePolicy.noContact ? "联系方式策略：用户要求不要联系方式；不要生成电话、地址、热线、地图定位或预约信息。" : "",
    hasExplicitCopy
      ? wantsProjectContext
        ? "文字策略：用户明确给出的文案、标题、电话、地址、品牌名尽量按原文呈现。"
        : "文字策略：用户明确给出的标题或短文案尽量按原文呈现；不要额外添加未要求的信息。"
      : "文字策略：没有明确文案时少字或无字；用户输入只是设计指令，绝不能把原始提示词、操作词、审美词写到画面上；不要编造未提供的真实信息或宣传语。",
    keepContent ? "内容不减：所有可见文字、关键信息和品牌资产必须尽量保留，不要删减。" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function hasExplicitCopyInstruction(prompt: string) {
  if (resolveNoVisibleOutputPolicy(prompt).noText) return false;
  const text = prompt || "";
  if (/标题\s*[:：]|主标题\s*[:：]|副标题\s*[:：]|文案\s*[:：]|标语\s*[:：]|slogan\s*[:：]/i.test(text)) return true;
  if (/(写上|加上文字|添加文字|放上文字|显示文字|文字改成|文案改成|标题改成)[“"「『《]?[^，。,.；;]{2,32}/i.test(text)) return true;
  if (/把(?:标题|主标题|副标题|文案|标语|slogan|文字)\s*改成\s*[“"「『《]?[^，。,.；;]{2,32}/i.test(text)) return true;
  if (/[“"「『《][^”"」』》]{2,32}[”"」』》]\s*(?:这句|这几个字|作为|当作)?\s*(?:标题|主标题|副标题|文案|标语|slogan|文字)/i.test(text)) return true;
  if (/(电话|地址|联系方式|二维码|QR|qr)/i.test(text) && /(写上|加上|加入|显示|展示|放上|要有|包含|使用)/i.test(text)) return true;
  if (/内容不(少|减|变)|保留全部|全部保留/i.test(text)) return true;
  return false;
}

function resizeModeInstruction(input: ReturnType<typeof normalizePromptInput>) {
  if (input.fitMode === "smart_relayout") {
    return [
      "处理模式：智能改版重排 / 新尺寸新排版。",
      "原图只作为主题、品牌色、主体素材和核心信息参考，不把原图坐标、原标题位置、原主体位置当成锁定布局。",
      "根据目标比例重排标题、Logo、主体、卖点和背景，像原生目标尺寸设计稿；内容保留含义和识别度，但位置必须服从新画布。",
      "先识别原图元素和信息层级，再按横/竖阅读逻辑重新布局；必须有栅格、对齐轴、分区和统一间距。",
      resizeOrientationInstruction(input.aspectRatioLabel, input.targetSize),
      "构图：full poster visible, no cropping, no cut off；重要元素放中心 76% 安全区，四周 18% 只放背景和出血装饰。",
      "禁止：照搬原横版/竖版坐标、简单缩放、机械裁切、拉伸、中间原图 + 两侧模糊/磨砂/玻璃补边。",
    ].join("\n");
  }
  if (input.fitMode === "crop") return "处理模式：安全裁切。主体、标题、Logo、二维码必须留在安全区。";
  if (input.fitMode === "pad") return "处理模式：补背景保完整，允许背景填充但不能白边或空边。";
  if (input.fitMode === "keep_ratio") return "处理模式：保持比例放大，不改比例、不加边、不裁切。";
  return "处理模式：扩图补画。保持原版式、原标题位置、主体比例和视觉重心，只向四周或指定方向补全真实背景、空间、光影和必要延展内容；禁止留白、模糊边框和磨砂补边。";
}

function resizeOrientationInstruction(aspectRatioLabel: string, targetSize: string) {
  const size = parseTargetSizeForPrompt(targetSize);
  const vertical = Boolean(size && size.height > size.width) || /9:16|3:4|4:5|竖/.test(aspectRatioLabel);
  const horizontal = Boolean(size && size.width > size.height) || /16:9|4:3|3:2|横/.test(aspectRatioLabel);
  if (vertical) {
    return "竖版重排：这是竖版新设计，不是横版海报放进竖版画布。标题放上方或中上方居中安全区，主体放中部或中下部，卖点/电话/地址进入底部或标题下方信息区；原图右侧标题位置不能照搬。";
  }
  if (horizontal) {
    return "横版重排：这是横版新设计，不是竖版图片裁成横版。标题、主体和卖点按横向阅读动线重新分区，主体完整，左右留出安全边距，不能把原竖版中心构图机械放大裁切。";
  }
  return "方图重排：标题、主体和卖点围绕中心视觉焦点重新平衡，不能照搬原横版或竖版的边缘位置。";
}

function parseTargetSizeForPrompt(targetSize: string) {
  const match = targetSize.match(/(\d+)\s*[×xX]\s*(\d+)/);
  if (!match) return null;
  return {
    width: Number(match[1]) || 0,
    height: Number(match[2]) || 0,
  };
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
