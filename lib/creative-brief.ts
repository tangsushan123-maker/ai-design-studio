export type CreativeStartMode = "project_library" | "single_image" | "idea";

export type CreativeProjectContext = {
  projectId?: string;
  projectName?: string;
  projectKind?: "scratch" | "formal" | "temporary";
  assetText?: string;
  assetCount?: number;
  assetNames?: string[];
  publicStyleNames?: string[];
  profile?: {
    organizationName?: string;
    brandColors?: string;
    logoName?: string;
    phone?: string;
    address?: string;
    qrCodeNote?: string;
    commonCopy?: string;
    forbiddenContent?: string;
    styleNotes?: string;
  };
};

export type CreativeImageInput = {
  id?: string;
  fileName?: string;
  url?: string;
  width?: number;
  height?: number;
  prompt?: string;
};

export type CreativeBriefInput = {
  mode: CreativeStartMode;
  userPrompt?: string;
  selectedImage?: CreativeImageInput | null;
  projectContext?: CreativeProjectContext;
};

export type CreativeImageUnderstanding = {
  designType: string;
  industry: string;
  theme: string;
  targetAudience: string;
  mainColors: string;
  layoutStructure: string;
  coreTextsAndSellingPoints: string;
  keepElements: string[];
  optimizations: string[];
  creativeDirections: string[];
};

export type CreativeIdeaCompletion = {
  industry: string;
  targetAudience: string;
  communicationGoal: string;
  coreSellingPoints: string[];
  possibleTitles: string[];
  visualStyle: string;
  creativeDirections: string[];
  materialsToCollect: string[];
};

export type CreativeDirection = {
  id: "A" | "B";
  title: string;
  strategy: string;
  prompt: string;
  caveats: string[];
  missingMaterials: string[];
};

export type CreativeBrief = {
  mode: CreativeStartMode;
  source: "rules" | "ai" | "rules+ai";
  title: string;
  projectName: string;
  temporaryProject: boolean;
  temporaryProjectName?: string;
  materialPriority: string[];
  missingMaterials: string[];
  missingMaterialsWarning?: string;
  noInventPolicy: string;
  projectContextUsed: string[];
  imageUnderstanding?: CreativeImageUnderstanding;
  ideaCompletion?: CreativeIdeaCompletion;
  directions: CreativeDirection[];
  promptContext: string;
};

const materialPriority = [
  "当前项目素材库",
  "本次上传的图片",
  "用户输入的一句话",
  "GPT 根据行业常识补全的内容",
  "公共风格库",
];

const noInventPolicy = "禁止在没有来源素材时编造机构名称、电话、地址、Logo、二维码、医生照片、真实活动信息。缺失信息只能标记为待补充。";
const missingMaterialsWarning = "当前缺少品牌素材，建议后续补充 logo、电话、地址、品牌色、真实照片，以便生成正式版本。";

export function buildCreativeBriefFallback(input: CreativeBriefInput, aiPatch?: Partial<CreativeBrief> | null): CreativeBrief {
  const mode = input.mode;
  const prompt = cleanText(input.userPrompt) || cleanText(input.projectContext?.assetText) || "商业设计创意";
  const title = titleFromPrompt(prompt, mode);
  const projectName = cleanText(input.projectContext?.projectName) || title;
  const context = summarizeProjectContext(input.projectContext);
  const industry = inferIndustry(`${prompt}\n${context.join("\n")}`);
  const designType = inferDesignType(prompt, input.selectedImage);
  const temporaryProject = mode !== "project_library" && input.projectContext?.projectKind !== "formal";
  const missingMaterials = resolveMissingMaterials(input);
  const warning = missingMaterials.length ? missingMaterialsWarning : undefined;
  const imageUnderstanding = mode === "single_image" ? buildImageUnderstanding(input, industry, designType, title) : undefined;
  const ideaCompletion = mode === "idea" ? buildIdeaCompletion(prompt, industry, title, missingMaterials) : undefined;
  const directions = mode === "single_image"
    ? imageDirections(prompt, title, imageUnderstanding, missingMaterials)
    : mode === "project_library"
      ? projectLibraryDirections(prompt, title, input.projectContext, missingMaterials)
      : ideaDirections(prompt, title, ideaCompletion, missingMaterials);

  const base: CreativeBrief = {
    mode,
    source: aiPatch ? "rules+ai" : "rules",
    title: cleanText(aiPatch?.title) || title,
    projectName,
    temporaryProject,
    temporaryProjectName: temporaryProject ? `临时项目：${title}灵感` : undefined,
    materialPriority,
    missingMaterials,
    missingMaterialsWarning: warning,
    noInventPolicy,
    projectContextUsed: context,
    imageUnderstanding,
    ideaCompletion,
    directions,
    promptContext: "",
  };

  const merged = normalizeCreativeBrief({ ...base, ...(aiPatch || {}) }, base, input);
  return {
    ...merged,
    promptContext: buildPromptContext(merged),
  };
}

export function normalizeCreativeBrief(value: unknown, fallback: CreativeBrief, input: CreativeBriefInput): CreativeBrief {
  const source = value && typeof value === "object" ? value as Partial<CreativeBrief> : {};
  const directions = normalizeDirections(source.directions, fallback.directions, fallback.missingMaterials);
  const missingMaterials = normalizeStringArray(source.missingMaterials).length
    ? normalizeStringArray(source.missingMaterials)
    : fallback.missingMaterials;
  const temporaryProject = typeof source.temporaryProject === "boolean" ? source.temporaryProject : fallback.temporaryProject;
  const brief: CreativeBrief = {
    mode: isCreativeStartMode(source.mode) ? source.mode : fallback.mode,
    source: source.source === "ai" || source.source === "rules+ai" ? source.source : fallback.source,
    title: cleanText(source.title) || fallback.title,
    projectName: cleanText(source.projectName) || fallback.projectName,
    temporaryProject,
    temporaryProjectName: temporaryProject
      ? cleanText(source.temporaryProjectName) || fallback.temporaryProjectName || `临时项目：${fallback.title}灵感`
      : undefined,
    materialPriority,
    missingMaterials,
    missingMaterialsWarning: missingMaterials.length ? missingMaterialsWarning : undefined,
    noInventPolicy,
    projectContextUsed: normalizeStringArray(source.projectContextUsed).length
      ? normalizeStringArray(source.projectContextUsed)
      : fallback.projectContextUsed,
    imageUnderstanding: normalizeImageUnderstanding(source.imageUnderstanding, fallback.imageUnderstanding, input),
    ideaCompletion: normalizeIdeaCompletion(source.ideaCompletion, fallback.ideaCompletion),
    directions,
    promptContext: "",
  };
  return {
    ...brief,
    promptContext: buildPromptContext(brief),
  };
}

export function buildPromptContext(brief: CreativeBrief) {
  const image = brief.imageUnderstanding;
  const idea = brief.ideaCompletion;
  return [
    "创作前置判断：",
    `入口：${modeLabel(brief.mode)}`,
    `素材优先级：${brief.materialPriority.join(" > ")}`,
    brief.projectContextUsed.length ? `已读取项目上下文：${brief.projectContextUsed.join("；")}` : "未读取到完整项目素材库。",
    image
      ? [
          "单图分析：",
          `设计类型：${image.designType}`,
          `行业：${image.industry}`,
          `主题：${image.theme}`,
          `目标人群：${image.targetAudience}`,
          `主色调：${image.mainColors}`,
          `版式结构：${image.layoutStructure}`,
          `核心文字/卖点：${image.coreTextsAndSellingPoints}`,
          `需要保留：${image.keepElements.join(" / ")}`,
          `可优化：${image.optimizations.join(" / ")}`,
        ].join("\n")
      : "",
    idea
      ? [
          "需求补全：",
          `行业判断：${idea.industry}`,
          `目标人群：${idea.targetAudience}`,
          `传播目标：${idea.communicationGoal}`,
          `核心卖点：${idea.coreSellingPoints.join(" / ")}`,
          `可能主标题：${idea.possibleTitles.join(" / ")}`,
          `推荐风格：${idea.visualStyle}`,
          `需补充素材：${idea.materialsToCollect.join(" / ")}`,
        ].join("\n")
      : "",
    brief.missingMaterialsWarning || "",
    brief.noInventPolicy,
  ].filter(Boolean).join("\n");
}

function buildImageUnderstanding(input: CreativeBriefInput, industry: string, designType: string, title: string): CreativeImageUnderstanding {
  const imageSize = input.selectedImage?.width && input.selectedImage?.height ? `${input.selectedImage.width}x${input.selectedImage.height}` : "尺寸待识别";
  return {
    designType,
    industry,
    theme: title,
    targetAudience: inferAudience(industry),
    mainColors: "以参考图可见主色为准，未识别前不要替换成无关品牌色。",
    layoutStructure: `以上传图版式为参考，先保留主体、信息层级和画面比例；当前记录：${imageSize}。`,
    coreTextsAndSellingPoints: "只保留参考图中真实可见或用户明确输入的核心文字；不新增电话、地址、机构名。",
    keepElements: ["参考图主题", "主体构图", "可识别文字", "已有品牌元素", "主要色彩倾向"],
    optimizations: ["强化主标题层级", "减少信息拥挤", "提升远距离识别", "统一色彩和留白", "让主体更完整"],
    creativeDirections: ["专业清晰改版", "更强视觉传播改版"],
  };
}

function buildIdeaCompletion(prompt: string, industry: string, title: string, missingMaterials: string[]): CreativeIdeaCompletion {
  return {
    industry,
    targetAudience: inferAudience(industry),
    communicationGoal: inferGoal(prompt, industry),
    coreSellingPoints: inferSellingPoints(prompt, industry),
    possibleTitles: buildPossibleTitles(title, industry),
    visualStyle: inferVisualStyle(prompt, industry),
    creativeDirections: ["信息清晰 / 专业信任 / 稳定表达", "视觉更强 / 创意更明显 / 更适合传播"],
    materialsToCollect: missingMaterials.length ? missingMaterials : ["Logo", "品牌色", "真实照片", "电话", "地址"],
  };
}

function projectLibraryDirections(
  prompt: string,
  title: string,
  projectContext: CreativeProjectContext | undefined,
  missingMaterials: string[],
): CreativeDirection[] {
  const context = summarizeProjectContext(projectContext).join("；") || "当前项目素材库";
  return [
    {
      id: "A",
      title: "方向 A · 项目稳定版",
      strategy: "优先调用项目素材库，保持品牌色、历史风格和关键信息稳定，适合第一版正式提案。",
      prompt: [
        `基于当前项目素材库生成「${title}」。`,
        `用户需求：${prompt}`,
        `项目上下文：${context}`,
        "方向 A：信息清晰、专业可信、版式稳定，优先使用项目已有 logo、品牌色、历史海报、真实照片、文案和活动资料。",
        sharedPromptRules(missingMaterials),
      ].join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
    {
      id: "B",
      title: "方向 B · 品牌传播版",
      strategy: "在项目素材边界内增强视觉焦点和传播感，适合社媒、活动预热或主视觉探索。",
      prompt: [
        `基于当前项目素材库生成「${title}」。`,
        `用户需求：${prompt}`,
        `项目上下文：${context}`,
        "方向 B：视觉更强、记忆点更明显，但不突破项目素材事实；用更大胆的构图、光影和层级增强传播。",
        sharedPromptRules(missingMaterials),
      ].join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
  ];
}

function imageDirections(
  prompt: string,
  title: string,
  image: CreativeImageUnderstanding | undefined,
  missingMaterials: string[],
): CreativeDirection[] {
  const analysis = image ? buildImageAnalysisText(image) : "先把上传图作为风格和内容参考。";
  return [
    {
      id: "A",
      title: "方向 A · 清晰改版",
      strategy: "以参考图为准，保留主题、主色、主体和核心文字，优化信息层级和可信感。",
      prompt: [
        `参考上传图生成「${title}」改版方向。`,
        prompt ? `用户补充：${prompt}` : "",
        analysis,
        "方向 A：信息清晰、专业信任、稳定表达。保留参考图核心元素，重点优化版式、对齐、留白、标题层级和可读性。",
        sharedPromptRules(missingMaterials),
      ].filter(Boolean).join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
    {
      id: "B",
      title: "方向 B · 传播强化",
      strategy: "仍以参考图为来源，但强化视觉冲击、画面焦点和社媒传播感。",
      prompt: [
        `参考上传图生成「${title}」创意方向。`,
        prompt ? `用户补充：${prompt}` : "",
        analysis,
        "方向 B：视觉更强、创意更明显、更适合传播。可以重构背景、光影、节奏和主视觉，但不要改变参考图真实信息。",
        sharedPromptRules(missingMaterials),
      ].filter(Boolean).join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
  ];
}

function ideaDirections(
  prompt: string,
  title: string,
  idea: CreativeIdeaCompletion | undefined,
  missingMaterials: string[],
): CreativeDirection[] {
  const completion = idea ? buildIdeaCompletionText(idea) : "";
  return [
    {
      id: "A",
      title: "方向 A · 专业清晰",
      strategy: "先把一句话扩成可执行需求，强调信息清楚、专业可信和稳定表达。",
      prompt: [
        `根据一句想法生成「${title}」灵感初稿。`,
        `用户想法：${prompt}`,
        completion,
        "方向 A：信息清晰 / 专业信任 / 稳定表达。适合做给客户确认基础主题和信息层级。",
        sharedPromptRules(missingMaterials),
      ].filter(Boolean).join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
    {
      id: "B",
      title: "方向 B · 视觉传播",
      strategy: "保留需求补全的事实边界，用更强视觉主张探索传播型方案。",
      prompt: [
        `根据一句想法生成「${title}」视觉创意初稿。`,
        `用户想法：${prompt}`,
        completion,
        "方向 B：视觉更强 / 创意更明显 / 更适合传播。适合探索主视觉记忆点和传播海报方向。",
        sharedPromptRules(missingMaterials),
      ].filter(Boolean).join("\n"),
      caveats: caveatsFromMissing(missingMaterials),
      missingMaterials,
    },
  ];
}

function sharedPromptRules(missingMaterials: string[]) {
  return [
    `素材优先级：${materialPriority.join(" > ")}。`,
    noInventPolicy,
    missingMaterials.length ? missingMaterialsWarning : "",
    "缺少真实素材时只做灵感初稿，不要伪造正式品牌落版。",
    "画面中不要出现假电话、假地址、假 Logo、假二维码、虚构医生姓名或虚构机构背书。",
  ].filter(Boolean).join("\n");
}

function buildImageAnalysisText(image: CreativeImageUnderstanding) {
  return [
    `参考图类型：${image.designType}`,
    `行业：${image.industry}`,
    `主题：${image.theme}`,
    `目标人群：${image.targetAudience}`,
    `主色调：${image.mainColors}`,
    `版式结构：${image.layoutStructure}`,
    `核心文字和卖点：${image.coreTextsAndSellingPoints}`,
    `必须保留：${image.keepElements.join(" / ")}`,
    `优化点：${image.optimizations.join(" / ")}`,
  ].join("\n");
}

function buildIdeaCompletionText(idea: CreativeIdeaCompletion) {
  return [
    `行业判断：${idea.industry}`,
    `目标人群：${idea.targetAudience}`,
    `传播目标：${idea.communicationGoal}`,
    `核心卖点：${idea.coreSellingPoints.join(" / ")}`,
    `可能主标题：${idea.possibleTitles.join(" / ")}`,
    `推荐视觉风格：${idea.visualStyle}`,
    `两个创意方向：${idea.creativeDirections.join(" / ")}`,
    `后续需补充素材：${idea.materialsToCollect.join(" / ")}`,
  ].join("\n");
}

function resolveMissingMaterials(input: CreativeBriefInput) {
  const profile = input.projectContext?.profile || {};
  const missing = [
    !cleanText(profile.logoName) ? "Logo" : "",
    !cleanText(profile.phone) ? "电话" : "",
    !cleanText(profile.address) ? "地址" : "",
    !cleanText(profile.brandColors) ? "品牌色" : "",
    !(input.projectContext?.assetCount || 0) ? "真实图片/历史海报" : "",
  ].filter(Boolean);
  if (input.mode === "project_library") return missing.filter((item) => item !== "真实图片/历史海报");
  return Array.from(new Set(missing));
}

function summarizeProjectContext(context?: CreativeProjectContext) {
  if (!context) return [];
  const profile = context.profile || {};
  return [
    cleanText(context.projectName) ? `项目：${context.projectName}` : "",
    cleanText(profile.organizationName) ? `机构：${profile.organizationName}` : "",
    cleanText(profile.brandColors) ? `品牌色：${profile.brandColors}` : "",
    cleanText(profile.logoName) ? `Logo：${profile.logoName}` : "",
    cleanText(profile.phone) ? `电话：${profile.phone}` : "",
    cleanText(profile.address) ? `地址：${profile.address}` : "",
    cleanText(profile.commonCopy) ? `常用文案：${profile.commonCopy}` : "",
    cleanText(profile.styleNotes) ? `风格：${profile.styleNotes}` : "",
    context.assetCount ? `素材数量：${context.assetCount}` : "",
    context.assetNames?.length ? `素材：${context.assetNames.slice(0, 8).join(" / ")}` : "",
    cleanText(context.assetText) ? `素材备注：${context.assetText}` : "",
  ].filter(Boolean);
}

function inferIndustry(text: string) {
  if (/胃肠镜|医院|医疗|体检|医生|门诊|科室|诊疗|健康|中医|口腔|眼科/.test(text)) return "医疗健康";
  if (/科技馆|科普|研学|展馆|博物馆|亲子|儿童|科学/.test(text)) return "科技馆/科普活动";
  if (/餐饮|美食|咖啡|茶饮|火锅|烘焙/.test(text)) return "餐饮消费";
  if (/房产|楼盘|物业|家装|装修|家居/.test(text)) return "地产家居";
  if (/教育|课程|培训|学校|招生|夏令营/.test(text)) return "教育培训";
  if (/科技|AI|软件|SaaS|数字|数据|芯片|发布会/.test(text)) return "科技服务";
  return "通用商业传播";
}

function inferDesignType(prompt: string, image?: CreativeImageInput | null) {
  if (/公交|车身/.test(prompt)) return "公交广告";
  if (/电子屏|大屏|LED/i.test(prompt)) return "电子屏广告";
  if (/小红书|封面/.test(prompt)) return "社媒封面";
  if (/活动|招募|报名/.test(prompt)) return "活动海报";
  if (/海报|广告|宣传/.test(prompt)) return "商业海报";
  if (image?.width && image.height) {
    const ratio = image.width / Math.max(1, image.height);
    if (ratio > 4) return "户外横幅广告";
    if (ratio < 0.72) return "竖版海报";
  }
  return "商业设计图";
}

function inferAudience(industry: string) {
  if (industry === "医疗健康") return "有相关检查、体检或健康咨询需求的本地用户，以及关注专业可信信息的家属。";
  if (industry === "科技馆/科普活动") return "亲子家庭、学生群体、老师和对科普活动感兴趣的城市人群。";
  if (industry === "教育培训") return "学生、家长和正在比较课程价值的人群。";
  if (industry === "科技服务") return "企业决策者、技术用户和对创新产品感兴趣的人群。";
  return "对该主题有明确需求的潜在用户。";
}

function inferGoal(prompt: string, industry: string) {
  if (/报名|招募|活动/.test(prompt)) return "让用户快速理解活动价值并产生报名/咨询动作。";
  if (/广告|宣传|海报/.test(prompt)) return "清晰传达主题和核心卖点，建立信任并促成咨询。";
  if (industry === "医疗健康") return "用专业可信的视觉降低决策焦虑，引导用户了解检查或服务。";
  return "把一句想法扩展成可视化方向，先用于内部讨论和灵感确认。";
}

function inferSellingPoints(prompt: string, industry: string) {
  if (industry === "医疗健康") return ["专业可信", "流程清晰", "服务安全感", "预约咨询便利"];
  if (industry === "科技馆/科普活动") return ["体验感", "互动性", "知识收获", "亲子友好"];
  if (industry === "科技服务") return ["效率提升", "创新感", "稳定可靠", "清晰价值"];
  return [prompt, "主题明确", "视觉完整", "便于传播"].filter(Boolean).slice(0, 4);
}

function inferVisualStyle(prompt: string, industry: string) {
  if (/苹果|极简|高级/.test(prompt)) return "苹果式极简、留白、清晰层级、轻玻璃质感。";
  if (industry === "医疗健康") return "干净、专业、可信，低饱和医疗色，信息层级清楚。";
  if (industry === "科技馆/科普活动") return "明亮科技感、亲和、有探索感，适合亲子和活动传播。";
  if (industry === "科技服务") return "现代科技、克制高级、光影清晰。";
  return "现代商业海报风格，主题清楚，视觉焦点明确。";
}

function buildPossibleTitles(title: string, industry: string) {
  if (industry === "医疗健康") return [title, "安心检查，清楚了解", "专业服务，放心预约"];
  if (industry === "科技馆/科普活动") return [title, "一起探索科学现场", "开启好奇心的一天"];
  return [title, `${title}，现在开始`, `发现${title}`];
}

function titleFromPrompt(prompt: string, mode: CreativeStartMode) {
  const cleaned = cleanText(prompt)
    .replace(/^帮?我?(想|做|生成|设计|来)?(一张|一个|一套)?/g, "")
    .replace(/(海报|广告|设计|图片|图)$/g, "$1")
    .trim();
  const title = cleaned || (mode === "single_image" ? "参考图改版" : "创意方向");
  return title.length > 16 ? title.slice(0, 16) : title;
}

function modeLabel(mode: CreativeStartMode) {
  if (mode === "project_library") return "从项目素材库开始";
  if (mode === "single_image") return "上传一张参考图开始";
  return "输入一个想法开始";
}

function caveatsFromMissing(missingMaterials: string[]) {
  return missingMaterials.length
    ? [missingMaterialsWarning, `缺少：${missingMaterials.join("、")}。`]
    : ["已读取可用项目资料，仍需在交付前人工核对真实信息。"];
}

function normalizeDirections(value: unknown, fallback: CreativeDirection[], missingMaterials: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<CreativeDirection>;
      const id = source.id === "B" || index === 1 ? "B" : "A";
      const base = fallback[index] || fallback[id === "A" ? 0 : 1];
      return {
        id,
        title: cleanText(source.title) || base.title,
        strategy: cleanText(source.strategy) || base.strategy,
        prompt: cleanText(source.prompt) || base.prompt,
        caveats: normalizeStringArray(source.caveats).length ? normalizeStringArray(source.caveats) : caveatsFromMissing(missingMaterials),
        missingMaterials: normalizeStringArray(source.missingMaterials).length ? normalizeStringArray(source.missingMaterials) : missingMaterials,
      } satisfies CreativeDirection;
    })
    .filter((item): item is CreativeDirection => Boolean(item))
    .slice(0, 2);
  if (items.length === 2) return items;
  return fallback;
}

function normalizeImageUnderstanding(value: unknown, fallback: CreativeImageUnderstanding | undefined, input: CreativeBriefInput) {
  if (input.mode !== "single_image") return undefined;
  const source = value && typeof value === "object" ? value as Partial<CreativeImageUnderstanding> : {};
  const base = fallback || buildImageUnderstanding(input, "通用商业传播", "商业设计图", titleFromPrompt(input.userPrompt || "", input.mode));
  return {
    designType: cleanText(source.designType) || base.designType,
    industry: cleanText(source.industry) || base.industry,
    theme: cleanText(source.theme) || base.theme,
    targetAudience: cleanText(source.targetAudience) || base.targetAudience,
    mainColors: cleanText(source.mainColors) || base.mainColors,
    layoutStructure: cleanText(source.layoutStructure) || base.layoutStructure,
    coreTextsAndSellingPoints: cleanText(source.coreTextsAndSellingPoints) || base.coreTextsAndSellingPoints,
    keepElements: normalizeStringArray(source.keepElements).length ? normalizeStringArray(source.keepElements) : base.keepElements,
    optimizations: normalizeStringArray(source.optimizations).length ? normalizeStringArray(source.optimizations) : base.optimizations,
    creativeDirections: normalizeStringArray(source.creativeDirections).length ? normalizeStringArray(source.creativeDirections) : base.creativeDirections,
  };
}

function normalizeIdeaCompletion(value: unknown, fallback?: CreativeIdeaCompletion) {
  if (!fallback) return undefined;
  const source = value && typeof value === "object" ? value as Partial<CreativeIdeaCompletion> : {};
  return {
    industry: cleanText(source.industry) || fallback.industry,
    targetAudience: cleanText(source.targetAudience) || fallback.targetAudience,
    communicationGoal: cleanText(source.communicationGoal) || fallback.communicationGoal,
    coreSellingPoints: normalizeStringArray(source.coreSellingPoints).length ? normalizeStringArray(source.coreSellingPoints) : fallback.coreSellingPoints,
    possibleTitles: normalizeStringArray(source.possibleTitles).length ? normalizeStringArray(source.possibleTitles) : fallback.possibleTitles,
    visualStyle: cleanText(source.visualStyle) || fallback.visualStyle,
    creativeDirections: normalizeStringArray(source.creativeDirections).length ? normalizeStringArray(source.creativeDirections) : fallback.creativeDirections,
    materialsToCollect: normalizeStringArray(source.materialsToCollect).length ? normalizeStringArray(source.materialsToCollect) : fallback.materialsToCollect,
  };
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, 12)
    : [];
}

function isCreativeStartMode(value: unknown): value is CreativeStartMode {
  return value === "project_library" || value === "single_image" || value === "idea";
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
