import { aspectRatios, type AspectRatioValue, type DesignRequest } from "./design-options";

export type DesignPlan = {
  taskType: "poster_design";
  industry: string;
  scene: string;
  size: {
    width: number;
    height: number;
    ratio: string;
  };
  copywriting: {
    mainTitle: string;
    subtitle: string;
    thirdText: string;
    bodyText: string[];
    people: Array<Record<string, string>>;
    brand: string;
  };
  referenceAnalysis: {
    colorPalette: string[];
    style: string;
    layout: string;
    informationHierarchy: string;
    reusableElements: string[];
  };
  layoutPlan: {
    topArea: string;
    titleArea: string;
    mainVisualArea: string;
    peopleArea: string;
    bottomArea: string;
    textArea: string;
  };
  visualPlan: {
    background: string;
    mainVisual: string;
    decorations: string[];
    lighting: string;
    color: string;
  };
  textMode: "real_text_overlay" | "background_only" | "ai_text_preview";
  imagePrompt: string;
  negativePrompt: string;
  qualityRules: string[];
  warnings: string[];
};

export type DesignPlanInput = {
  userPrompt: string;
  title?: string;
  subtitle?: string;
  bodyText?: string[];
  sellingPoints?: string[];
  people?: Array<Record<string, string>>;
  activityInfo?: Record<string, unknown>;
  industry?: string;
  scene?: string;
  forbidden?: string[];
  historyPreference?: string;
  referenceImages?: Array<Record<string, unknown>>;
  uploadedAssets?: Array<Record<string, unknown>>;
  options?: {
    size?: string;
    aspectRatio?: AspectRatioValue | string;
    customWidth?: number;
    customHeight?: number;
    mode?: string;
    textMode?: DesignPlan["textMode"];
  };
  projectContext?: string;
  referenceAnalysis?: string;
};

export function buildDesignPlanPrompt(input: DesignPlanInput) {
  const size = resolvePlanSize(input);
  return [
    "你是 AI 设计总监。你的任务是在后台静默策划，不是直接生图，也不是把用户原话改写成提示词。",
    "只输出合法 JSON，不要 Markdown，不要解释。",
    "必须严格输出这些顶层字段：taskType,industry,scene,size,copywriting,referenceAnalysis,layoutPlan,visualPlan,textMode,imagePrompt,negativePrompt,qualityRules,warnings。",
    "后台静默规则：designPlan 只供系统内部保存和调试，默认不展示给用户；最终用户只看到生成成品图。",
    "核心规则：用户给得少时自动补全文案、行业、用途、风格、色彩、版式、主视觉和负面提示词；用户给得详细时严格遵守用户明确给出的标题、尺寸、行业、人物数量、参考风格和禁止事项，不得乱改。",
    "用户原始需求是设计指令，不是海报文案。除非用户用“标题、主标题、副标题、正文、文案、写上、文字为、活动信息、医生信息、电话、地址”等明确标注，否则不要把用户输入整句放进 copywriting。",
    "copywriting 只能放最终海报上应该真实显示的文字。禁止出现：帮我、请、生成、设计、参考图、附件、根据内容、连接到图片参考、提示词、尺寸、比例、模型、用户需求、不要、必须。",
    "文案规则：如果用户提供了正式文案，必须提取到 copywriting 里并用于最终真实叠加；不要把“下面是文案”“请生成”“参考这张图”这类说明句当成画面文字。",
    "文案拆分规则：用户只给一整段正式文案时，选最像主题口号的一句做 mainTitle，补充说明做 subtitle，剩余短句放 bodyText；不要丢失用户明确给出的正式文字。",
    "版式规则：必须像设计总监一样规划文字排版，不要把所有文字堆在画面中央。根据参考图和主体位置，规划标题区、正文卖点区、底部信息区、留白、安全边距、对齐方式和阅读动线。",
    "如果是竖版人物/产品海报，优先采用商业海报信息层级：主标题在上方偏左或上方安全区，人物/产品占视觉焦点，卖点分组排列，底部可放图标式利益点或信息栏；具体行业由用户资料决定，不要套固定行业模板。",
    "如果用户提供了参考图，必须分析参考图的排版结构和信息层级，并在 layoutPlan 里说明可复用的文字区、主体区、底部栏，不要只分析风格。",
    "参考图规则：先判断参考图到底参考配色、风格、版式、整体结构、标题字效还是人物排版。用户没说清楚时默认参考配色 + 风格 + 版式结构，但不能照抄别人的 logo、二维码、真实人物、品牌资产。",
    "出图规则：本系统不再后期盖字。你必须把最终海报需要出现的正式文案、标题、卖点和排版结构写进 imagePrompt，让图片模型直接生成完整海报。",
    "imagePrompt 只允许使用你分析后的设计方案和 copywriting，不允许直接粘贴用户原始指令。必须包含明确的海报构图要求，例如文字区、主体区、卖点区、底部信息栏、对齐方式、字体气质、字号层级、留白和安全边距。",
    "如果用户只说“端午节海报”，默认补全为节日/品牌海报：主标题“端午安康”，副标题“粽叶飘香，情暖仲夏”，辅助文案“愿你岁岁安康，万事顺遂”。不要无依据写“送礼、好礼、福利、钜惠”。",
    "如果检测到科技馆/科普活动端午主题，可用主标题“端午奇妙游”或“科技里的端午”，副标题“传统文化与科学探索的奇妙相遇”。",
    `硬尺寸：${size.width}x${size.height}，比例 ${size.ratio}。如果用户指定尺寸，必须以这个尺寸和比例策划。`,
    `用户原始需求：${input.userPrompt || ""}`,
    input.title ? `用户指定标题：${input.title}` : "",
    input.subtitle ? `用户指定副标题：${input.subtitle}` : "",
    input.bodyText?.length ? `用户正文/说明：${input.bodyText.join("；")}` : "",
    input.sellingPoints?.length ? `用户卖点：${input.sellingPoints.join("；")}` : "",
    input.people?.length ? `人物/医生信息：${JSON.stringify(input.people)}` : "",
    input.industry ? `用户指定行业：${input.industry}` : "",
    input.scene ? `用户指定场景：${input.scene}` : "",
    input.forbidden?.length ? `禁止事项：${input.forbidden.join("；")}` : "",
    input.referenceImages?.length ? `参考图/素材清单：${JSON.stringify(input.referenceImages)}` : "",
    input.uploadedAssets?.length ? `上传资产：${JSON.stringify(input.uploadedAssets)}` : "",
    input.referenceAnalysis ? `参考图视觉分析：${input.referenceAnalysis}` : "",
    input.projectContext ? `当前项目上下文/历史偏好：${input.projectContext}` : "",
    "输出 JSON 模板：",
    JSON.stringify(buildFallbackDesignPlan(input), null, 2),
  ].filter(Boolean).join("\n");
}

export function buildFallbackDesignPlan(input: DesignPlanInput | DesignRequest): DesignPlan {
  const userPrompt = "userPrompt" in input ? input.userPrompt : input.prompt;
  const size = resolvePlanSize(input);
  const text = `${userPrompt || ""}\n${"industry" in input ? input.industry || "" : ""}\n${"scene" in input ? input.scene || "" : ""}`;
  const isDragonBoat = /端午|粽|龙舟/i.test(text);
  const isTechMuseum = /科技馆|科普|科学|探索/i.test(text);
  const isMedical = /医院|医疗|医生|科室|专家|诊疗|健康/i.test(text);
  const explicitCopy = inferCopyFromPrompt(userPrompt);
  const fallbackTheme = inferVisualTheme(userPrompt);
  const industry = "industry" in input && input.industry ? input.industry : isMedical ? "医疗健康" : isTechMuseum ? "科技科普" : isDragonBoat ? "节日品牌" : "通用商业设计";
  const scene = "scene" in input && input.scene ? input.scene : /轮播|banner|横幅/i.test(text) ? "广告轮播图" : "品牌海报";
  const mainTitle = sanitizePosterCopy("title" in input && input.title ? input.title : explicitCopy.mainTitle || (isDragonBoat ? (isTechMuseum ? "端午奇妙游" : "端午安康") : inferShortTitle(userPrompt)), "主题海报", "title");
  const subtitle = sanitizePosterCopy("subtitle" in input && input.subtitle ? input.subtitle : explicitCopy.subtitle || (isDragonBoat ? (isTechMuseum ? "传统文化与科学探索的奇妙相遇" : "粽叶飘香，情暖仲夏") : "清晰传达主题，建立专业信任"), "", "subtitle");
  const thirdText = explicitCopy.thirdText || (isDragonBoat && !isTechMuseum ? "愿你岁岁安康，万事顺遂" : "");
  const textMode = resolvePlanTextMode(input);
  return {
    taskType: "poster_design",
    industry,
    scene,
    size,
    copywriting: {
      mainTitle,
      subtitle,
      thirdText: sanitizePosterCopy(thirdText, "", "body"),
      bodyText: sanitizePosterCopyArray("bodyText" in input && Array.isArray(input.bodyText) ? input.bodyText : explicitCopy.bodyText, []),
      people: "people" in input && Array.isArray(input.people) ? input.people : [],
      brand: "",
    },
    referenceAnalysis: {
      colorPalette: isDragonBoat ? ["艾草绿", "糯米白", "竹叶青", "暖金"] : ["主品牌色", "辅助浅色", "深色文字", "高光色"],
      style: isDragonBoat ? "现代节日品牌海报，国风元素克制融入" : "商业化、清晰、专业、有层级",
      layout: "上方标题区，主体视觉区，正文卖点分组区，底部信息区，所有文字由图片模型作为海报排版直接生成",
      informationHierarchy: "主标题最大，副标题次之，辅助信息和底部信息栏用真实文字图层",
      reusableElements: ["配色", "版式结构", "信息层级", "光效氛围"],
    },
    layoutPlan: {
      topArea: "预留 logo / 品牌名真实图层位置",
      titleArea: "根据主体位置放置主标题和副标题，优先左对齐或上方安全区，避免压住人物/产品面部",
      mainVisualArea: isDragonBoat ? "粽叶、龙舟、水纹、艾草等节日主视觉" : "围绕用户主题设计清晰主视觉",
      peopleArea: /人物|医生|模特|IP|ip/i.test(text) ? "按用户要求安排人物/主体位置，结合参考人物图生成完整海报" : "无人物时不强行添加人物",
      bottomArea: "预留卖点、电话、地址、二维码、活动时间等真实图层信息栏",
      textArea: "正式文案由图片模型直接作为海报文字生成，必须有清晰层级、对齐和分组",
    },
    visualPlan: {
      background: "干净、有空间层次的商业海报背景",
      mainVisual: isDragonBoat ? "高质感粽叶与水纹节日组合主视觉" : "与用户需求强相关的核心视觉",
      decorations: isDragonBoat ? ["粽叶", "水纹", "艾草", "轻微金色点缀"] : ["品牌辅助图形", "光效", "层次装饰"],
      lighting: "柔和商业光，高级但不杂乱",
      color: isDragonBoat ? "绿色、米白、暖金为主" : "符合行业和参考图的统一配色",
    },
    textMode,
    imagePrompt: buildImagePromptFromFallback({ visualTheme: fallbackTheme, size, textMode, industry, scene, isDragonBoat }),
    negativePrompt: "不要正方形，禁止改变指定比例，不要把用户原始提示词写到画面上，不要乱码中文，不要假电话假地址，不要假二维码，不要假 logo，不要照抄参考图品牌资产，不要廉价模板感，不要主体裁切，不要边缘磨砂补边",
    qualityRules: [
      `必须是 ${size.width}x${size.height}，${size.ratio} 比例`,
      "生图模型只生成底图、主视觉、光效、装饰和占位，不负责准确中文与正式资产",
      "最终海报直接由图片模型生成完整文字和排版，不再后期叠加文字",
      "不能把用户原始需求句子当成海报文案",
    ],
    warnings: ["图片模型会直接生成海报文字，请用质检关注中文准确性和排版完整度。"],
  };
}

export function normalizeDesignPlan(value: unknown, fallback: DesignPlan): DesignPlan {
  const source = value && typeof value === "object" ? value as Partial<DesignPlan> : {};
  const copy = source.copywriting && typeof source.copywriting === "object" ? source.copywriting as Partial<DesignPlan["copywriting"]> : {};
  const reference = source.referenceAnalysis && typeof source.referenceAnalysis === "object" ? source.referenceAnalysis as Partial<DesignPlan["referenceAnalysis"]> : {};
  const layout = source.layoutPlan && typeof source.layoutPlan === "object" ? source.layoutPlan as Partial<DesignPlan["layoutPlan"]> : {};
  const visual = source.visualPlan && typeof source.visualPlan === "object" ? source.visualPlan as Partial<DesignPlan["visualPlan"]> : {};
  return {
    taskType: "poster_design",
    industry: clean(source.industry) || fallback.industry,
    scene: clean(source.scene) || fallback.scene,
    size: normalizeSize(source.size, fallback.size),
    copywriting: {
      mainTitle: sanitizePosterCopy(copy.mainTitle, fallback.copywriting.mainTitle, "title"),
      subtitle: sanitizePosterCopy(copy.subtitle, fallback.copywriting.subtitle, "subtitle"),
      thirdText: sanitizePosterCopy(copy.thirdText, fallback.copywriting.thirdText, "body"),
      bodyText: sanitizePosterCopyArray(copy.bodyText, fallback.copywriting.bodyText).slice(0, 8),
      people: Array.isArray(copy.people) ? copy.people.filter((item) => item && typeof item === "object").slice(0, 8) as Array<Record<string, string>> : fallback.copywriting.people,
      brand: sanitizePosterCopy(copy.brand, fallback.copywriting.brand, "brand"),
    },
    referenceAnalysis: {
      colorPalette: normalizeStringArray(reference.colorPalette, fallback.referenceAnalysis.colorPalette).slice(0, 8),
      style: clean(reference.style) || fallback.referenceAnalysis.style,
      layout: clean(reference.layout) || fallback.referenceAnalysis.layout,
      informationHierarchy: clean(reference.informationHierarchy) || fallback.referenceAnalysis.informationHierarchy,
      reusableElements: normalizeStringArray(reference.reusableElements, fallback.referenceAnalysis.reusableElements).slice(0, 10),
    },
    layoutPlan: {
      topArea: clean(layout.topArea) || fallback.layoutPlan.topArea,
      titleArea: clean(layout.titleArea) || fallback.layoutPlan.titleArea,
      mainVisualArea: clean(layout.mainVisualArea) || fallback.layoutPlan.mainVisualArea,
      peopleArea: clean(layout.peopleArea) || fallback.layoutPlan.peopleArea,
      bottomArea: clean(layout.bottomArea) || fallback.layoutPlan.bottomArea,
      textArea: clean(layout.textArea) || fallback.layoutPlan.textArea,
    },
    visualPlan: {
      background: clean(visual.background) || fallback.visualPlan.background,
      mainVisual: clean(visual.mainVisual) || fallback.visualPlan.mainVisual,
      decorations: normalizeStringArray(visual.decorations, fallback.visualPlan.decorations).slice(0, 10),
      lighting: clean(visual.lighting) || fallback.visualPlan.lighting,
      color: clean(visual.color) || fallback.visualPlan.color,
    },
    textMode: source.textMode === "background_only" || source.textMode === "ai_text_preview" || source.textMode === "real_text_overlay" ? source.textMode : fallback.textMode,
    imagePrompt: enforceImageExecutionPolicy(sanitizeImagePrompt(clean(source.imagePrompt) || fallback.imagePrompt), source.textMode || fallback.textMode),
    negativePrompt: clean(source.negativePrompt) || fallback.negativePrompt,
    qualityRules: normalizeStringArray(source.qualityRules, fallback.qualityRules).slice(0, 10),
    warnings: normalizeStringArray(source.warnings, fallback.warnings).slice(0, 8),
  };
}

export function parseDesignPlanJson(text: string) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function designPlanToImagePrompt(plan: DesignPlan) {
  return enforceImageExecutionPolicy([
    `Complete commercial poster design. Canvas ${plan.size.width}x${plan.size.height}, ${plan.size.ratio}.`,
    `Industry: ${plan.industry}. Scene: ${plan.scene}.`,
    `Reference style/color/layout: ${plan.referenceAnalysis.style}; ${plan.referenceAnalysis.layout}; palette ${plan.referenceAnalysis.colorPalette.join(", ")}.`,
    `Layout zones: top ${plan.layoutPlan.topArea}; title safe area ${plan.layoutPlan.titleArea}; main visual ${plan.layoutPlan.mainVisualArea}; people ${plan.layoutPlan.peopleArea}; bottom ${plan.layoutPlan.bottomArea}.`,
    `Visual plan: background ${plan.visualPlan.background}; main visual ${plan.visualPlan.mainVisual}; decorations ${plan.visualPlan.decorations.join(", ")}; lighting ${plan.visualPlan.lighting}; color ${plan.visualPlan.color}.`,
    buildVisibleCopyPrompt(plan),
    plan.imagePrompt,
  ].filter(Boolean).join("\n"), plan.textMode);
}

function buildVisibleCopyPrompt(plan: DesignPlan) {
  const copy = plan.copywriting;
  const body = Array.isArray(copy.bodyText) ? copy.bodyText.filter(Boolean) : [];
  const people = Array.isArray(copy.people) ? copy.people.filter(Boolean) : [];
  return [
    "Visible poster copy to render directly in the image, with professional typography and layout:",
    copy.brand ? `Brand / top label: ${copy.brand}` : "",
    copy.mainTitle ? `Main title, largest and most designed: ${copy.mainTitle}` : "",
    copy.subtitle ? `Subtitle, secondary hierarchy: ${copy.subtitle}` : "",
    copy.thirdText ? `Support line: ${copy.thirdText}` : "",
    body.length ? `Body / selling points, grouped instead of piled up: ${body.join(" / ")}` : "",
    people.length ? `People information, small structured labels: ${people.map((item) => Object.values(item).filter(Boolean).join(" ")).filter(Boolean).join(" / ")}` : "",
    "Do not render the user's instruction sentence. Render only the planned visible copy above.",
  ].filter(Boolean).join("\n");
}

function buildImagePromptFromFallback(input: {
  visualTheme: string;
  size: DesignPlan["size"];
  textMode: DesignPlan["textMode"];
  industry: string;
  scene: string;
  isDragonBoat: boolean;
}) {
  return enforceImageExecutionPolicy([
    `Create a complete professional commercial poster for ${input.industry} / ${input.scene}.`,
    `Canvas ${input.size.width}x${input.size.height}, ${input.size.ratio}; keep full composition, no cropping, no blurred padding.`,
    input.isDragonBoat
      ? "Use elegant Dragon Boat Festival visual elements: premium zongzi leaves, bamboo leaf shapes, subtle water ripples, warm gold accents, clean festive atmosphere."
      : `Use a clear main visual concept: ${input.visualTheme}.`,
    "Integrate the planned Chinese copy into the poster as designed typography; keep text areas clean, readable, aligned, and hierarchical.",
    "Plan a real poster composition, not a plain portrait: reserve structured text zones, grouped selling point areas, and a bottom information bar when useful.",
  ].join("\n"), input.textMode);
}

function enforceImageExecutionPolicy(prompt: string, textMode: DesignPlan["textMode"]) {
  const realTextLine = textMode === "background_only"
    ? "No visible readable text, no Chinese characters, no English letters, no numbers, no fake slogan, no fake phone/address, no fake QR code, no fake logo."
    : "Render a complete designed poster with the planned visible copy. Use real poster typography, clear hierarchy, clean alignment, grouped selling points, and an intentional commercial layout. Avoid garbled characters, random extra words, fake phone/address, fake QR code, and fake logo.";
  return [
    prompt,
    realTextLine,
    "The raw user instruction is art direction only and must never appear as poster text.",
  ].filter(Boolean).join("\n");
}

function resolvePlanTextMode(input: DesignPlanInput | DesignRequest): DesignPlan["textMode"] {
  const explicit = "prompt" in input ? input.textMode : input.options?.textMode;
  if (explicit === "background_only" || explicit === "ai_text_preview" || explicit === "real_text_overlay") return explicit;
  return "ai_text_preview";
}

function resolvePlanSize(input: DesignPlanInput | DesignRequest): DesignPlan["size"] {
  const options = "options" in input ? input.options : undefined;
  const sizeText = options?.size || "";
  const parsed = /(\d{3,5})\s*[x×*]\s*(\d{3,5})/i.exec(sizeText);
  const customWidth = "customWidth" in input ? input.customWidth : options?.customWidth;
  const customHeight = "customHeight" in input ? input.customHeight : options?.customHeight;
  if (parsed) return sizeFromNumbers(Number(parsed[1]), Number(parsed[2]));
  if (customWidth && customHeight) return sizeFromNumbers(customWidth, customHeight);
  const aspectRatio = ("aspectRatio" in input ? input.aspectRatio : options?.aspectRatio) || "16:9";
  const ratio = aspectRatios.find((item) => item.value === aspectRatio) || aspectRatios.find((item) => item.value === "16:9")!;
  if (ratio.value === "9:16") return { width: 1080, height: 1920, ratio: "9:16" };
  if (ratio.value === "1:1") return { width: 1200, height: 1200, ratio: "1:1" };
  if (ratio.value === "4:5") return { width: 1080, height: 1350, ratio: "4:5" };
  if (ratio.value === "3:4") return { width: 1200, height: 1600, ratio: "3:4" };
  if (ratio.value === "4:3") return { width: 1600, height: 1200, ratio: "4:3" };
  return { width: 1600, height: 900, ratio: "16:9" };
}

function sizeFromNumbers(width: number, height: number) {
  const safeWidth = Math.max(256, Math.round(width));
  const safeHeight = Math.max(256, Math.round(height));
  return { width: safeWidth, height: safeHeight, ratio: `${simplifyRatio(safeWidth, safeHeight)}` };
}

function simplifyRatio(width: number, height: number) {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a || 1);
}

function normalizeSize(value: unknown, fallback: DesignPlan["size"]) {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<DesignPlan["size"]>;
  const width = Number(source.width);
  const height = Number(source.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 256 || height < 256) return fallback;
  return { width: Math.round(width), height: Math.round(height), ratio: clean(source.ratio) || simplifyRatio(width, height) };
}

function inferShortTitle(text: string) {
  const explicitCopy = inferCopyFromPrompt(text);
  if (explicitCopy.mainTitle) return explicitCopy.mainTitle;
  if (/端午|粽|龙舟/i.test(text)) return "端午安康";
  const theme = inferVisualTheme(text);
  return sanitizePosterCopy(theme.replace(/海报|图片|设计|生成/g, "").trim(), "主题海报", "title");
}

function inferCopyFromPrompt(text: string) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const labeled = {
    mainTitle: extractLabeledCopy(normalized, ["主标题", "标题", "大标题", "主题"]),
    subtitle: extractLabeledCopy(normalized, ["副标题", "小标题"]),
    thirdText: extractLabeledCopy(normalized, ["辅助文案", "三级文案", "说明文案"]),
    brand: extractLabeledCopy(normalized, ["品牌", "品牌名", "机构名称", "医院名称", "公司名称"]),
  };
  const body = [
    ...extractRepeatedLabeledCopy(normalized, ["文案", "正文", "卖点", "活动信息", "医生信息", "文字", "海报文字"]),
    ...extractQuotedCopyAfterVerb(normalized),
  ];
  const mainTitle = sanitizePosterCopy(labeled.mainTitle || "", "", "title");
  const subtitle = sanitizePosterCopy(labeled.subtitle || "", "", "subtitle");
  const thirdText = sanitizePosterCopy(labeled.thirdText || "", "", "body");
  const parts = body
    .flatMap(splitPosterCopy)
    .map((item) => sanitizePosterCopy(item, "", "body"))
    .filter(Boolean)
    .filter((item) => !sameCopy(item, mainTitle) && !sameCopy(item, subtitle) && !sameCopy(item, thirdText))
    .slice(0, 8);
  return {
    mainTitle: mainTitle || sanitizePosterCopy(parts[0], "", "title"),
    subtitle: subtitle || sanitizePosterCopy(parts[1], "", "subtitle"),
    thirdText: thirdText || sanitizePosterCopy(parts[2], "", "body"),
    bodyText: parts.slice(mainTitle ? 0 : 3),
  };
}

function extractLabeledCopy(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|[\\n；;。])\\s*${label}\\s*[:：]\\s*([^\\n；;。]+)`, "i");
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return "";
}

function extractRepeatedLabeledCopy(text: string, labels: string[]) {
  const results: string[] = [];
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|[\\n；;。])\\s*${label}\\s*[:：]\\s*([^\\n]+)`, "gi");
    for (const match of text.matchAll(pattern)) {
      if (match[1]?.trim()) results.push(match[1].trim());
    }
  }
  return results;
}

function extractQuotedCopyAfterVerb(text: string) {
  if (!/(写上|文字为|内容为|文案为|改成|显示|放上)/.test(text)) return [];
  return [...text.matchAll(/[“"「『](.*?)[”"」』]/g)].map((match) => match[1]).filter(Boolean);
}

function splitPosterCopy(text: string) {
  return clean(text)
    .replace(/[「」"“”]/g, " ")
    .replace(/(主标题|标题|副标题|正文|文案|辅助文案|卖点|活动信息|医生信息|文字|海报文字)\s*[:：]/g, "；")
    .split(/(?:\s*[\/｜|]\s*|\s{2,}|[，。；;]\s*)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizePosterCopyArray(value: unknown, fallback: string[]) {
  const items = Array.isArray(value) ? value : [];
  const cleaned = items
    .map((item) => sanitizePosterCopy(item, "", "body"))
    .filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}

function sanitizePosterCopy(value: unknown, fallback: string, role: "title" | "subtitle" | "body" | "brand") {
  const text = clean(value)
    .replace(/^[-*#\d.、\s]+/, "")
    .replace(/^(下面是|以下是)?\s*(主标题|标题|副标题|正文|文案|辅助文案|品牌|品牌名)\s*[:：]\s*/i, "")
    .replace(/[「」"“”]/g, "")
    .trim();
  if (!text || isInstructionLikeCopy(text)) return fallback;
  const maxLength = role === "title" ? 18 : role === "subtitle" ? 28 : role === "brand" ? 24 : 36;
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function isInstructionLikeCopy(text: string) {
  const normalized = text.toLowerCase();
  if (/(帮我|请|生成|设计|做一张|来一张|出一张|参考图|附件|根据内容|我的附件|连接到|图片参考|提示词|文生图|模型|尺寸|比例|用户需求|原始需求|不要|不能|别把|必须|需要|应该|可以|怎么|看看|优化|修改|这句话写到画面|写到画面上)/i.test(normalized)) return true;
  if (/(海报|图片|poster|image).{0,8}(生成|设计|制作|优化)/i.test(normalized)) return true;
  return false;
}

function inferVisualTheme(text: string) {
  const cleaned = clean(text)
    .replace(/不要把这句话写到画面上|不能把这句话写到画面上|别把这句话写到画面上|把这句话写到画面上/g, " ")
    .replace(/(帮我|请|根据内容|我的附件|参考图|附件|生成|设计|做一张|来一张|出一张|文生图|图片|海报|提示词|尺寸|比例|不要|不能|别把|必须|需要|看看|优化|修改|文案|主标题|副标题|正文|卖点|方向)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/端午|粽|龙舟/i.test(text)) return "Dragon Boat Festival brand poster with zongzi leaves, water ripples, restrained Chinese festive details";
  if (/医院|医疗|医生|诊疗|健康/i.test(text)) return "professional medical healthcare poster with clean technology atmosphere and trustworthy visual hierarchy";
  if (/科技馆|科普|科学|探索/i.test(text)) return "science education event poster with futuristic discovery atmosphere and structured exhibition layout";
  return cleaned ? cleaned.slice(0, 80) : "professional commercial poster theme with clear central visual and premium composition";
}

function sameCopy(left: string, right: string) {
  if (!left || !right) return false;
  const normalize = (value: string) => value.replace(/\s+/g, "").replace(/[「」"“”'']/g, "");
  return normalize(left) === normalize(right);
}

function sanitizeImagePrompt(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isInstructionLikeCopy(line))
    .join("\n")
    .trim() || "Professional commercial poster base image with clean visual hierarchy, premium lighting, clear main visual, and safe empty areas for real text overlay.";
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map(clean).filter(Boolean);
  return items.length ? items : fallback;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
