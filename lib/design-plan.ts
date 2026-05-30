import { aspectRatios, type AspectRatioValue, type DesignRequest } from "./design-options";

export type DesignPlanSize = {
  width: number;
  height: number;
  ratio: string;
};

export type DesignPlanCopywriting = {
  mainTitle: string;
  subtitle: string;
  thirdText: string;
  bodyText: string[];
  people: Array<Record<string, string>>;
  brand: string;
};

export type DesignPlanLayout = {
  topArea: string;
  titleArea: string;
  mainVisualArea: string;
  peopleArea: string;
  bottomArea: string;
  textArea: string;
};

export type DesignPlanVisual = {
  background: string;
  mainVisual: string;
  decorations: string[];
  lighting: string;
  color: string;
};

export type DesignPlanDirection = {
  id: "A" | "B";
  name: string;
  goal: string;
  strategy: string;
  copywriting: DesignPlanCopywriting;
  layoutPlan: DesignPlanLayout;
  visualPlan: DesignPlanVisual;
  imagePrompt: string;
  negativePrompt: string;
  qualityRules: string[];
  warnings: string[];
};

export type DesignPlan = {
  taskType: "poster_design";
  industry: string;
  scene: string;
  size: DesignPlanSize;
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
  designDirections: DesignPlanDirection[];
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
    "必须严格输出这些顶层字段：taskType,industry,scene,size,copywriting,referenceAnalysis,layoutPlan,visualPlan,textMode,imagePrompt,negativePrompt,qualityRules,warnings,designDirections。",
    "designDirections 必须固定输出两个方向：A=转化广告版，B=品牌创意版。每个方向必须包含 id,name,goal,strategy,copywriting,layoutPlan,visualPlan,imagePrompt,negativePrompt,qualityRules,warnings。",
    "后台静默规则：designPlan 只供系统内部保存和调试，默认不展示给用户；最终用户只看到生成成品图。",
    "核心规则：用户给得少时只能补全行业、用途、风格、色彩、版式、主视觉和负面提示词等执行信息；不得自动补任何画面可见文案。用户给得详细时严格遵守用户明确给出的标题、尺寸、行业、人物数量、参考风格和禁止事项，不得乱改。",
    "用户原始需求是设计指令，不是海报文案。除非用户用“标题、主标题、副标题、正文、文案、写上、文字为、活动信息、医生信息、电话、地址”等明确标注，否则不要把用户输入整句放进 copywriting。",
    "copywriting 只能放最终海报上应该真实显示的文字。禁止出现：帮我、请、生成、设计、参考图、附件、根据内容、连接到图片参考、提示词、尺寸、比例、模型、用户需求、不要、必须。",
    "文案规则：如果用户提供了正式文案，必须提取到 copywriting 里并用于一次性完整出图；不要把“下面是文案”“请生成”“参考这张图”这类说明句当成画面文字。",
    "用户输入里的标题、副标题、正文、卖点、品牌名、人名、电话、地址、活动时间、价格、说明文案都必须参与分析和分层；用户明确给出的真实文案优先使用原文，不要乱改，不要丢失。用户没有明确给出的可见文字，一律不要编。",
    "文案拆分规则：用户只给一整段正式文案时，选最像主题口号的一句做 mainTitle，补充说明做 subtitle，剩余短句放 bodyText；不要丢失用户明确给出的正式文字。",
    "字体/字效设计规则：如果用户说“参考图字体设计、字体设计、字效、艺术字、文字改成、内容是/内容为”，这不是海报策划任务，而是字效设计任务。copywriting.mainTitle 必须只放用户指定的目标文字；subtitle、thirdText、bodyText 必须留空；imagePrompt 必须要求只生成该目标文字的字体/字效，不要生成海报标题、卖点卡片、按钮、图标说明或自动文案。",
    "字体/字效参考规则：有参考图时，只参考字形气质、3D材质、颜色、光泽、阴影、气球/糖果/金属/毛绒等材质、构图角度和背景干净程度；不要复用参考图原文字，不要把参考图里的“主题海报”等文字带到结果里。",
    "版式规则：必须像设计总监一样规划文字排版，不要把所有文字堆在画面中央。根据参考图和主体位置，规划标题区、正文卖点区、底部信息区、留白、安全边距、对齐方式和阅读动线。",
    "如果是竖版人物/产品海报，优先采用商业海报信息层级：主标题在上方偏左或上方安全区，人物/产品占视觉焦点，卖点分组排列，底部可放图标式利益点或信息栏；具体行业由用户资料决定，不要套固定行业模板。",
    "如果用户提供了参考图，必须分析参考图的排版结构和信息层级，并在 layoutPlan 里说明可复用的文字区、主体区、底部栏，不要只分析风格。",
    "参考图规则：先判断参考图到底参考配色、风格、版式、整体结构、标题字效还是人物排版。用户没说清楚时默认参考配色 + 风格 + 版式结构，但不能照抄别人的 logo、二维码、真实人物、品牌资产。",
    "出图规则：本系统不再后期盖字。你必须把最终海报需要出现的正式文案、标题、卖点和排版结构写进 imagePrompt，让图片模型直接生成完整海报。",
    "当前模式是快速效果图模式：中文尽量准确、标题尽量清晰、不要乱码、不要乱编新文案；但不承诺正式商用文字 100% 准确。后续正式商用模式才会做底图生成 + 真实文字叠加。",
    "imagePrompt 必须忠实保留用户原始要求的执行意图，但不能添加用户没要的可见文字。可以整理构图、风格、材质、光影、参考图用法和负面提示词；不能擅自补营销文案、卖点、按钮、电话、地址、二维码、Logo 或解释文字。",
    "方案差异：A 必须偏看懂和转化，主标题最大、卖点清楚、行动路径明确；B 必须偏创意和品牌，概念更强、质感更高、留白更多。两个方案不能只是换颜色、换背景或同构图换元素；如果 B 与 A 太像，必须在 JSON 输出前重写 B。",
    "只有当用户明确说“帮我想文案/自动生成文案/补全文案”时，才可以创作新文案；否则 copywriting 只能来自用户原文或用户指定的目标文字。",
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
  const typographyTargetText = extractTypographyTargetText(userPrompt);
  const isTypographyDesign = isTypographyDesignRequest(text) || Boolean(typographyTargetText && /参考|字体|字效|艺术字|文字|内容/.test(text));
  const fallbackTheme = inferVisualTheme(userPrompt);
  const industry = "industry" in input && input.industry ? input.industry : isTypographyDesign ? "字体设计" : isMedical ? "医疗健康" : isTechMuseum ? "科技科普" : isDragonBoat ? "节日品牌" : "通用商业设计";
  const scene = "scene" in input && input.scene ? input.scene : isTypographyDesign ? "字效设计" : /轮播|banner|横幅/i.test(text) ? "广告轮播图" : "品牌海报";
  const mainTitle = sanitizePosterCopy(
    "title" in input && input.title ? input.title : typographyTargetText || explicitCopy.mainTitle,
    "",
    "title",
  );
  const subtitle = sanitizePosterCopy(
    isTypographyDesign ? "" : "subtitle" in input && input.subtitle ? input.subtitle : explicitCopy.subtitle,
    "",
    "subtitle",
  );
  const thirdText = isTypographyDesign ? "" : explicitCopy.thirdText || (isDragonBoat && !isTechMuseum ? "愿你岁岁安康，万事顺遂" : "");
  const textMode = resolvePlanTextMode(input);
  const baseCopywriting: DesignPlanCopywriting = {
    mainTitle,
    subtitle,
    thirdText: sanitizePosterCopy(thirdText, "", "body"),
    bodyText: isTypographyDesign ? [] : sanitizePosterCopyArray("bodyText" in input && Array.isArray(input.bodyText) ? input.bodyText : explicitCopy.bodyText, []),
    people: "people" in input && Array.isArray(input.people) ? input.people : [],
    brand: sanitizePosterCopy(explicitCopy.brand, "", "brand"),
  };
  const baseLayout: DesignPlanLayout = {
    topArea: isTypographyDesign ? "不放品牌、不放标签、不放额外标题" : "品牌名或主题标签放在上方安全区，不强行添加未知 Logo",
    titleArea: isTypographyDesign ? `画面中心只放目标字效“${mainTitle}”，字形大而完整，四周留干净边距` : "根据主体位置放置主标题和副标题，优先左对齐或上方安全区，避免压住人物/产品面部",
    mainVisualArea: isTypographyDesign ? "目标文字本身就是唯一主视觉，参考图只用于字体材质、立体感、颜色和光影" : isDragonBoat ? "粽叶、龙舟、水纹、艾草等节日主视觉" : "围绕用户主题设计清晰主视觉",
    peopleArea: isTypographyDesign ? "不添加人物、医生、模特或IP" : /人物|医生|模特|IP|ip/i.test(text) ? "按用户要求安排人物/主体位置，结合参考人物图生成完整海报" : "无人物时不强行添加人物",
    bottomArea: isTypographyDesign ? "不添加底部卖点栏、按钮、图标说明或口号" : "按用户已给信息安排卖点、时间、价格、电话、地址等底部信息；用户没给就不要编造",
    textArea: isTypographyDesign ? `只生成“${mainTitle}”四个字的字体设计，不出现任何其他中文、英文或数字` : "正式文案由图片模型直接作为海报文字生成，必须有清晰层级、对齐和分组",
  };
  const baseVisual: DesignPlanVisual = {
    background: isTypographyDesign ? "干净白色或浅色背景，突出字体本体" : "干净、有空间层次的商业海报背景",
    mainVisual: isTypographyDesign ? `参考图风格的 3D 气球/糖果质感中文艺术字“${mainTitle}”` : isDragonBoat ? "高质感粽叶与水纹节日组合主视觉" : "与用户需求强相关的核心视觉",
    decorations: isTypographyDesign ? ["彩色气球管状笔画", "果冻高光", "柔和投影", "少量轻盈装饰"] : isDragonBoat ? ["粽叶", "水纹", "艾草", "轻微金色点缀"] : ["品牌辅助图形", "光效", "层次装饰"],
    lighting: isTypographyDesign ? "明亮棚拍光，高光圆润，阴影柔和，3D 字体边缘清晰" : "柔和商业光，高级但不杂乱",
    color: isTypographyDesign ? "参考图的粉色、蓝色、黄色、绿色糖果气球配色" : isDragonBoat ? "绿色、米白、暖金为主" : "符合行业和参考图的统一配色",
  };
  const basePlan = {
    taskType: "poster_design",
    industry,
    scene,
    size,
    copywriting: baseCopywriting,
    referenceAnalysis: {
      colorPalette: isTypographyDesign ? ["泡泡粉", "天空蓝", "柠檬黄", "嫩绿色", "高光白"] : isDragonBoat ? ["艾草绿", "糯米白", "竹叶青", "暖金"] : ["主品牌色", "辅助浅色", "深色文字", "高光色"],
      style: isTypographyDesign ? "参考图同类 3D 气球糖果中文艺术字，圆润、饱满、亮面、可爱、干净" : isDragonBoat ? "现代节日品牌海报，国风元素克制融入" : "商业化、清晰、专业、有层级",
      layout: isTypographyDesign ? "单一字效主视觉居中构图，只显示目标文字，不做海报信息层级" : "上方标题区，主体视觉区，正文卖点分组区，底部信息区，所有文字由图片模型作为海报排版直接生成",
      informationHierarchy: isTypographyDesign ? "目标文字是唯一信息层级，不允许副标题、卖点、按钮、底部栏或自动说明文案" : "主标题最大，副标题次之，辅助信息和底部信息栏弱化分组",
      reusableElements: isTypographyDesign ? ["圆润管状字形", "气球/糖果材质", "高光光泽", "柔和阴影", "明亮配色"] : ["配色", "版式结构", "信息层级", "光效氛围"],
    },
    layoutPlan: baseLayout,
    visualPlan: baseVisual,
    textMode,
    imagePrompt: buildImagePromptFromFallback({ visualTheme: fallbackTheme, size, textMode, industry, scene, isDragonBoat, isTypographyDesign, typographyText: mainTitle }),
    negativePrompt: isTypographyDesign
      ? `只允许出现“${mainTitle}”，不要出现主题海报、清晰传达主题、建立专业信任、核心卖点、信息一眼看懂、画面重点明确、按钮、图标卡片、底部栏、电话、地址、二维码、logo、英文、数字、乱码中文，不要改变文字内容`
      : "不要正方形，禁止改变指定比例，不要把用户原始提示词写到画面上，不要乱码中文，不要假电话假地址，不要假二维码，不要假 logo，不要照抄参考图品牌资产，不要廉价模板感，不要主体裁切，不要边缘磨砂补边",
    qualityRules: [
      `必须是 ${size.width}x${size.height}，${size.ratio} 比例`,
      isTypographyDesign ? `只生成目标文字“${mainTitle}”的字效设计` : "最终海报直接由图片模型生成完整文字和排版，不再后期叠加文字",
      "不能把用户原始需求句子当成海报文案",
      isTypographyDesign ? "不能自动补副标题、卖点、按钮、底部信息或海报说明" : "",
      isTypographyDesign ? "参考图只参考字体风格、材质、颜色、光影和构图，不复用原文字" : "",
    ].filter(Boolean),
    warnings: ["图片模型会直接生成海报文字，请用质检关注中文准确性和排版完整度。"],
  } satisfies Omit<DesignPlan, "designDirections">;
  return {
    ...basePlan,
    designDirections: buildFallbackDesignDirections(basePlan, { visualTheme: fallbackTheme, isDragonBoat }),
  };
}

export function normalizeDesignPlan(value: unknown, fallback: DesignPlan): DesignPlan {
  const source = value && typeof value === "object" ? value as Partial<DesignPlan> : {};
  const copy = source.copywriting && typeof source.copywriting === "object" ? source.copywriting as Partial<DesignPlan["copywriting"]> : {};
  const reference = source.referenceAnalysis && typeof source.referenceAnalysis === "object" ? source.referenceAnalysis as Partial<DesignPlan["referenceAnalysis"]> : {};
  const layout = source.layoutPlan && typeof source.layoutPlan === "object" ? source.layoutPlan as Partial<DesignPlan["layoutPlan"]> : {};
  const visual = source.visualPlan && typeof source.visualPlan === "object" ? source.visualPlan as Partial<DesignPlan["visualPlan"]> : {};
  const people = normalizePeople(copy.people, fallback.copywriting.people);
  const textMode = source.textMode === "background_only" || source.textMode === "ai_text_preview" || source.textMode === "real_text_overlay" ? source.textMode : fallback.textMode;
  const normalizedBase = {
    taskType: "poster_design",
    industry: clean(source.industry) || fallback.industry,
    scene: clean(source.scene) || fallback.scene,
    size: normalizeSize(source.size, fallback.size),
    copywriting: {
      mainTitle: sanitizePosterCopy(copy.mainTitle, fallback.copywriting.mainTitle, "title"),
      subtitle: sanitizePosterCopy(copy.subtitle, fallback.copywriting.subtitle, "subtitle"),
      thirdText: sanitizePosterCopy(copy.thirdText, fallback.copywriting.thirdText, "body"),
      bodyText: sanitizePosterCopyArray(copy.bodyText, fallback.copywriting.bodyText).slice(0, 8),
      people,
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
    textMode,
    imagePrompt: enforceImageExecutionPolicy(sanitizeImagePrompt(clean(source.imagePrompt) || fallback.imagePrompt), textMode),
    negativePrompt: clean(source.negativePrompt) || fallback.negativePrompt,
    qualityRules: normalizeStringArray(source.qualityRules, fallback.qualityRules).slice(0, 10),
    warnings: normalizeStringArray(source.warnings, fallback.warnings).slice(0, 8),
  } satisfies Omit<DesignPlan, "designDirections">;
  return {
    ...normalizedBase,
    designDirections: normalizeDesignDirections(source.designDirections, fallback.designDirections, normalizedBase),
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

export function designDirectionToImagePrompt(plan: DesignPlan, direction: DesignPlanDirection) {
  const directionPlan: DesignPlan = {
    ...plan,
    copywriting: direction.copywriting,
    layoutPlan: direction.layoutPlan,
    visualPlan: direction.visualPlan,
    imagePrompt: direction.imagePrompt,
    negativePrompt: direction.negativePrompt,
    qualityRules: direction.qualityRules,
    warnings: direction.warnings,
  };
  return enforceImageExecutionPolicy([
    `Complete commercial poster design. Direction ${direction.id}: ${direction.name}. Canvas ${plan.size.width}x${plan.size.height}, ${plan.size.ratio}.`,
    `Industry: ${plan.industry}. Scene: ${plan.scene}.`,
    `Direction goal: ${direction.goal}`,
    `Direction strategy: ${direction.strategy}`,
    `Reference style/color/layout: ${plan.referenceAnalysis.style}; ${plan.referenceAnalysis.layout}; palette ${plan.referenceAnalysis.colorPalette.join(", ")}.`,
    `Layout zones: top ${direction.layoutPlan.topArea}; title safe area ${direction.layoutPlan.titleArea}; main visual ${direction.layoutPlan.mainVisualArea}; people ${direction.layoutPlan.peopleArea}; bottom ${direction.layoutPlan.bottomArea}.`,
    `Visual plan: background ${direction.visualPlan.background}; main visual ${direction.visualPlan.mainVisual}; decorations ${direction.visualPlan.decorations.join(", ")}; lighting ${direction.visualPlan.lighting}; color ${direction.visualPlan.color}.`,
    buildVisibleCopyPrompt(directionPlan),
    direction.imagePrompt,
    "This direction must be visually distinct from the other direction in composition, main visual strategy, copy hierarchy, and overall mood.",
  ].filter(Boolean).join("\n"), plan.textMode);
}

function buildFallbackDesignDirections(
  basePlan: Omit<DesignPlan, "designDirections">,
  context: { visualTheme: string; isDragonBoat: boolean },
): DesignPlanDirection[] {
  const isTypographyDesign = basePlan.industry === "字体设计" || basePlan.scene === "字效设计";
  if (isTypographyDesign) return buildFallbackTypographyDirections(basePlan, context);
  const bodyText = basePlan.copywriting.bodyText;
  const conversionCopy: DesignPlanCopywriting = {
    ...basePlan.copywriting,
    bodyText,
  };
  const brandCopy: DesignPlanCopywriting = {
    ...basePlan.copywriting,
    bodyText: bodyText.slice(0, 4),
  };

  return [
    {
      id: "A",
      name: "转化广告版",
      goal: "清晰、直接、好理解、适合投放，让用户第一眼看懂主题和利益点。",
      strategy: "主标题最大，主视觉明确，卖点分组清楚，信息动线直接，强调咨询、报名、购买或预约转化。",
      copywriting: conversionCopy,
      layoutPlan: {
        ...basePlan.layoutPlan,
        titleArea: "上方或左上安全区放最大主标题，副标题紧跟其下，形成直接阅读动线",
        mainVisualArea: `${basePlan.layoutPlan.mainVisualArea}，主体明确居中或偏右，占据主要注意力`,
        bottomArea: "底部信息栏只放用户提供的卖点、电话、地址、时间、价格等，不编造不存在的信息",
        textArea: "主标题最大，卖点做标签、胶囊或短条分组，辅助说明弱化，适合广告投放",
      },
      visualPlan: {
        ...basePlan.visualPlan,
        background: `${basePlan.visualPlan.background}，信息区干净，对比清楚`,
        mainVisual: `${basePlan.visualPlan.mainVisual}，一眼明确主题与转化利益`,
        decorations: [...basePlan.visualPlan.decorations, "清晰卖点标签", "行动感信息栏"].slice(0, 10),
        lighting: "明亮、有冲击力的商业广告光效，避免过度艺术化",
        color: `${basePlan.visualPlan.color}，提高标题和卖点可读性`,
      },
      imagePrompt: [
        "Direction A conversion advertising poster.",
        "Make the main title the largest visual anchor, show clear selling points, grouped readable Chinese typography, direct commercial hierarchy.",
        "Use a practical ad layout with strong subject, clean information zones, and a bottom bar only when the user provided contact, time, price, or address details.",
        `Theme concept: ${context.visualTheme}.`,
      ].join("\n"),
      negativePrompt: "不要艺术化到看不懂，不要信息堆满，不要平均字号，不要乱编电话地址二维码 logo，不要把用户原始指令写进画面，不要偏离指定比例",
      qualityRules: [
        "主标题必须最大且清楚",
        "卖点必须分组，不要堆成一段",
        "只能使用用户提供的真实电话、地址、二维码、Logo 信息",
      ],
      warnings: ["快速效果图模式下中文由图片模型直接生成，需要关注文字准确度。"],
    },
    {
      id: "B",
      name: "品牌创意版",
      goal: "高级、有创意、有记忆点、有品牌感，让画面不像普通模板图。",
      strategy: "使用更概念化的主视觉、更克制的文案层级和更多留白，构图、视觉隐喻、空间关系必须明显不同于方案A。",
      copywriting: brandCopy,
      layoutPlan: {
        ...basePlan.layoutPlan,
        topArea: "顶部保留克制品牌或主题位置，只使用用户提供的品牌文字，不编造 Logo",
        titleArea: "主标题与主视觉形成概念化关系，可用错位、留白、纵向或环绕式排版，但必须可读",
        mainVisualArea: `${basePlan.layoutPlan.mainVisualArea}，转化为更有记忆点的隐喻式主视觉和空间构图`,
        bottomArea: "底部信息极简，只保留用户明确给出的必要信息，避免促销模板感",
        textArea: "文案更克制，主标题有设计感，辅助文字少而精，留白更多",
      },
      visualPlan: {
        ...basePlan.visualPlan,
        background: `${basePlan.visualPlan.background}，更高级的空间层次与留白`,
        mainVisual: `${basePlan.visualPlan.mainVisual}，转化为品牌主视觉或视觉隐喻`,
        decorations: [...basePlan.visualPlan.decorations, "品牌符号化构图", "高级留白"].slice(0, 10),
        lighting: "高级柔和光影，质感强，有传播感",
        color: `${basePlan.visualPlan.color}，更克制统一，强调品牌气质`,
      },
      imagePrompt: [
        "Direction B brand creative poster.",
        "Do not reuse Direction A layout. Use a clearly different composition, more whitespace, stronger visual metaphor, and a premium brand key visual feeling.",
        "Keep Chinese title readable but make the mood more refined, memorable, and non-template.",
        `Theme concept: ${context.visualTheme}.`,
      ].join("\n"),
      negativePrompt: "不要和方案A同构图，不要只是换颜色，不要廉价模板感，不要促销堆字，不要乱编电话地址二维码 logo，不要把用户原始指令写进画面，不要偏离指定比例",
      qualityRules: [
        "构图必须明显不同于方案A",
        "不能只是换颜色或换背景",
        "必须保留用户明确给出的核心文案，但文字数量更克制",
      ],
      warnings: ["快速效果图模式下中文由图片模型直接生成，需要关注文字准确度。"],
    },
  ];
}

function buildFallbackTypographyDirections(
  basePlan: Omit<DesignPlan, "designDirections">,
  context: { visualTheme: string },
): DesignPlanDirection[] {
  const targetText = basePlan.copywriting.mainTitle;
  const copywriting: DesignPlanCopywriting = {
    mainTitle: targetText,
    subtitle: "",
    thirdText: "",
    bodyText: [],
    people: [],
    brand: "",
  };
  return [
    {
      id: "A",
      name: "参考字效还原版",
      goal: `严格参考图1的字体设计风格，把文字替换成“${targetText}”。`,
      strategy: "优先还原参考图的圆润3D气球糖果字体、粉色高光、彩色管状背景和干净棚拍质感；只改文字内容。",
      copywriting,
      layoutPlan: {
        ...basePlan.layoutPlan,
        titleArea: `画面中心大字只显示“${targetText}”，字形完整、清楚、边缘不裁切`,
        textArea: `只出现“${targetText}”，不出现任何副标题、卖点、按钮、解释文字或海报模板文案`,
      },
      visualPlan: basePlan.visualPlan,
      imagePrompt: [
        `Create a standalone Chinese 3D balloon candy typography design with the exact visible text: "${targetText}".`,
        "Use the reference image only for font style: rounded inflated strokes, glossy pink candy material, colorful balloon tubes, soft shadows, clean bright white background.",
        "This is not a poster layout. No subtitle, no selling points, no icon cards, no bottom information bar, no extra slogan.",
        `Do not render the reference image text. Replace it with exactly "${targetText}".`,
        `Theme concept: ${context.visualTheme}.`,
      ].join("\n"),
      negativePrompt: `不要出现主题海报、清晰传达主题、建立专业信任、核心卖点、信息一眼看懂、画面重点明确、按钮、图标卡片、底部栏、电话、地址、二维码、logo、英文、数字、乱码中文；除了“${targetText}”不要出现其他文字`,
      qualityRules: [
        `唯一可见文字必须是“${targetText}”`,
        "必须参考图1的字体设计风格和材质",
        "不能做成海报模板或营销卡片",
      ],
      warnings: ["图片模型直接生成中文艺术字，仍需人工检查文字笔画是否准确。"],
    },
    {
      id: "B",
      name: "创意字效扩展版",
      goal: `在参考图字体气质基础上，为“${targetText}”做更有动势的创意字效。`,
      strategy: "保持圆润3D糖果气球材质，但让字形更有乘风破浪的流动感、弧线和速度感；仍然只生成目标文字。",
      copywriting,
      layoutPlan: {
        ...basePlan.layoutPlan,
        titleArea: `“${targetText}”作为唯一主视觉，可略带斜向动势和波浪节奏，但必须清晰可读`,
        textArea: `只出现“${targetText}”，不出现任何其他文字或说明`,
      },
      visualPlan: {
        ...basePlan.visualPlan,
        mainVisual: `带流动弧线和浪花动势的 3D 气球糖果中文艺术字“${targetText}”`,
        decorations: ["彩色气球管状笔画", "果冻高光", "柔和投影", "轻微流动弧线", "少量浪花感装饰"],
      },
      imagePrompt: [
        `Create a creative Chinese 3D balloon candy word art with the exact visible text: "${targetText}".`,
        "Keep the reference image's glossy inflated candy typography, but add subtle wave-like motion and flowing ribbon composition matching the meaning of the phrase.",
        "No poster information hierarchy. No subtitle, no icon cards, no selling point text, no bottom bar.",
        `Only the four Chinese characters "${targetText}" may be readable.`,
      ].join("\n"),
      negativePrompt: `不要出现主题海报、清晰传达主题、建立专业信任、核心卖点、信息一眼看懂、画面重点明确、按钮、图标卡片、底部栏、电话、地址、二维码、logo、英文、数字、乱码中文；除了“${targetText}”不要出现其他文字`,
      qualityRules: [
        `唯一可见文字必须是“${targetText}”`,
        "方案B必须比方案A更有流动感和创意动势，但不能变成海报",
        "不能只是复制参考图原字",
      ],
      warnings: ["图片模型直接生成中文艺术字，仍需人工检查文字笔画是否准确。"],
    },
  ];
}

function normalizeDesignDirections(
  value: unknown,
  fallback: DesignPlanDirection[] | undefined,
  basePlan: Omit<DesignPlan, "designDirections">,
) {
  const fallbackDirections = fallback?.length
    ? fallback
    : buildFallbackDesignDirections(basePlan, {
      visualTheme: basePlan.visualPlan.mainVisual || basePlan.imagePrompt,
      isDragonBoat: /端午|粽|龙舟/i.test(`${basePlan.copywriting.mainTitle} ${basePlan.copywriting.subtitle} ${basePlan.visualPlan.mainVisual}`),
    });
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item, index) => normalizeDesignDirection(item, fallbackDirections[index] || fallbackDirections[index % fallbackDirections.length], basePlan, index))
    .slice(0, 2);
  return normalized.length >= 2 ? normalized : fallbackDirections.slice(0, 2);
}

function normalizeDesignDirection(
  value: unknown,
  fallback: DesignPlanDirection,
  basePlan: Omit<DesignPlan, "designDirections">,
  index: number,
): DesignPlanDirection {
  const source = value && typeof value === "object" ? value as Partial<DesignPlanDirection> : {};
  const copy = source.copywriting && typeof source.copywriting === "object" ? source.copywriting as Partial<DesignPlanCopywriting> : {};
  const layout = source.layoutPlan && typeof source.layoutPlan === "object" ? source.layoutPlan as Partial<DesignPlanLayout> : {};
  const visual = source.visualPlan && typeof source.visualPlan === "object" ? source.visualPlan as Partial<DesignPlanVisual> : {};
  const directionId: "A" | "B" = clean(source.id) === "B" || index === 1 ? "B" : "A";
  return {
    id: directionId,
    name: clean(source.name) || fallback.name || (directionId === "A" ? "转化广告版" : "品牌创意版"),
    goal: clean(source.goal) || fallback.goal,
    strategy: clean(source.strategy) || fallback.strategy,
    copywriting: {
      mainTitle: sanitizePosterCopy(copy.mainTitle, fallback.copywriting.mainTitle || basePlan.copywriting.mainTitle, "title"),
      subtitle: sanitizePosterCopy(copy.subtitle, fallback.copywriting.subtitle || basePlan.copywriting.subtitle, "subtitle"),
      thirdText: sanitizePosterCopy(copy.thirdText, fallback.copywriting.thirdText || basePlan.copywriting.thirdText, "body"),
      bodyText: sanitizePosterCopyArray(copy.bodyText, fallback.copywriting.bodyText || basePlan.copywriting.bodyText).slice(0, 8),
      people: normalizePeople(copy.people, fallback.copywriting.people || basePlan.copywriting.people),
      brand: sanitizePosterCopy(copy.brand, fallback.copywriting.brand || basePlan.copywriting.brand, "brand"),
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
    imagePrompt: enforceImageExecutionPolicy(sanitizeImagePrompt(clean(source.imagePrompt) || fallback.imagePrompt), basePlan.textMode),
    negativePrompt: clean(source.negativePrompt) || fallback.negativePrompt,
    qualityRules: normalizeStringArray(source.qualityRules, fallback.qualityRules).slice(0, 10),
    warnings: normalizeStringArray(source.warnings, fallback.warnings).slice(0, 8),
  };
}

function buildVisibleCopyPrompt(plan: DesignPlan) {
  const copy = plan.copywriting;
  const body = truthyStrings(copy.bodyText);
  const peopleLabel = peopleInformationLabel(copy.people);
  return [
    "Visible poster copy to render directly in the image, with professional typography and layout:",
    copy.brand ? `Brand / top label: ${copy.brand}` : "",
    copy.mainTitle ? `Main title, largest and most designed: ${copy.mainTitle}` : "",
    copy.subtitle ? `Subtitle, secondary hierarchy: ${copy.subtitle}` : "",
    copy.thirdText ? `Support line: ${copy.thirdText}` : "",
    body.length ? `Body / selling points, grouped instead of piled up: ${body.join(" / ")}` : "",
    peopleLabel ? `People information, small structured labels: ${peopleLabel}` : "",
    "Do not render the user's instruction sentence. Render only the planned visible copy above.",
  ].filter(Boolean).join("\n");
}

function normalizePeople(value: unknown, fallback: Array<Record<string, string>>) {
  if (!Array.isArray(value)) return fallback;
  const people: Array<Record<string, string>> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    people.push(item as Record<string, string>);
    if (people.length >= 8) break;
  }
  return people;
}

function truthyStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    if (item) items.push(String(item));
  }
  return items;
}

function peopleInformationLabel(people: Array<Record<string, string>>) {
  const labels: string[] = [];
  for (const person of people) {
    const parts: string[] = [];
    for (const value of Object.values(person)) {
      if (value) parts.push(String(value));
    }
    if (parts.length) labels.push(parts.join(" "));
  }
  return labels.join(" / ");
}

function buildImagePromptFromFallback(input: {
  visualTheme: string;
  size: DesignPlan["size"];
  textMode: DesignPlan["textMode"];
  industry: string;
  scene: string;
  isDragonBoat: boolean;
  isTypographyDesign?: boolean;
  typographyText?: string;
}) {
  if (input.isTypographyDesign && input.typographyText) {
    return enforceImageExecutionPolicy([
      `Create a standalone Chinese 3D typography / word art design, exact visible text: "${input.typographyText}".`,
      `Canvas ${input.size.width}x${input.size.height}, ${input.size.ratio}; keep the word art complete, centered, and not cropped.`,
      "Use the reference image style if provided: glossy inflated balloon/candy Chinese characters, rounded tube strokes, soft highlights, colorful pastel balloon ribbons, clean bright background.",
      `Only render "${input.typographyText}" as readable text. No subtitle, no slogan, no selling points, no icon cards, no bottom bar, no poster template.`,
      "Do not copy the reference image's original characters; replace them with the target text exactly.",
    ].join("\n"), input.textMode);
  }
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
    : "Render only the planned visible copy supplied by the user. If no visible copy is planned, do not invent any text. Use clear hierarchy and clean alignment when text is required. Avoid garbled characters, random extra words, fake phone/address, fake QR code, and fake logo.";
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
  const parts = collectPosterCopyParts(body, [mainTitle, subtitle, thirdText], 8);
  return {
    mainTitle: mainTitle || sanitizePosterCopy(parts[0], "", "title"),
    subtitle: subtitle || sanitizePosterCopy(parts[1], "", "subtitle"),
    thirdText: thirdText || sanitizePosterCopy(parts[2], "", "body"),
    bodyText: parts.slice(mainTitle ? 0 : 3),
    brand: sanitizePosterCopy(labeled.brand, "", "brand"),
  };
}

function isTypographyDesignRequest(text: string) {
  return /(参考图\s*\d*\s*字体|字体设计|字效|艺术字|立体字|3d\s*字|3D\s*字|文字改成|字体修改|改成.{0,12}(字|文字)|内容是|内容为)/i.test(text);
}

function extractTypographyTargetText(text: string) {
  const normalized = clean(text);
  const patterns = [
    /(?:内容是|内容为|文字是|文字为|改成|修改成|换成)\s*[「“"']?([\u4e00-\u9fa5A-Za-z0-9]{2,12})[」”"']?/i,
    /(?:字体修改成|字体改成|字效改成|艺术字改成)\s*[「“"']?([\u4e00-\u9fa5A-Za-z0-9]{2,12})[」”"']?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const value = sanitizePosterCopy(match?.[1], "", "title");
    if (value) return value;
  }
  return "";
}

function collectPosterCopyParts(body: string[], excluded: string[], limit: number) {
  const parts: string[] = [];
  for (const item of body) {
    for (const part of splitPosterCopy(item)) {
      const text = sanitizePosterCopy(part, "", "body");
      if (!text || excluded.some((value) => sameCopy(text, value))) continue;
      parts.push(text);
      if (parts.length >= limit) return parts;
    }
  }
  return parts;
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
  const copies: string[] = [];
  for (const match of text.matchAll(/[“"「『](.*?)[”"」』]/g)) {
    if (match[1]) copies.push(match[1]);
  }
  return copies;
}

function splitPosterCopy(text: string) {
  const items = clean(text)
    .replace(/[「」"“”]/g, " ")
    .replace(/(主标题|标题|副标题|正文|文案|辅助文案|卖点|活动信息|医生信息|文字|海报文字)\s*[:：]/g, "；")
    .split(/(?:\s*[\/｜|]\s*|\s{2,}|[，。；;]\s*)/);
  const copy: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (value) copy.push(value);
  }
  return copy;
}

function sanitizePosterCopyArray(value: unknown, fallback: string[]) {
  const items = Array.isArray(value) ? value : [];
  const cleaned: string[] = [];
  for (const item of items) {
    const copy = sanitizePosterCopy(item, "", "body");
    if (copy) cleaned.push(copy);
  }
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
    .trim() || "Professional complete commercial poster with clean visual hierarchy, premium lighting, clear main visual, and readable planned typography.";
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items: string[] = [];
  for (const item of value) {
    const text = clean(item);
    if (text) items.push(text);
  }
  return items.length ? items : fallback;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
