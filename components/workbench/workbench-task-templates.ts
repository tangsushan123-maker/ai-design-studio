import type { AspectRatioValue } from "@/lib/design-options";

export type WorkbenchTaskTemplateId =
  | "event_poster"
  | "store_promo"
  | "course_recruit"
  | "xiaohongshu_cover"
  | "square_social"
  | "wechat_hero"
  | "ecommerce_main"
  | "ecommerce_banner"
  | "brand_kv"
  | "expert_profile";

export type WorkbenchTaskTemplate = {
  id: WorkbenchTaskTemplateId;
  title: string;
  group: "社媒传播" | "营销转化" | "活动教育" | "品牌人物";
  ratio: AspectRatioValue;
  targetSize: string;
  variantCount: number;
  description: string;
  fieldsHint: string;
  compositionRules: string[];
  textRules: string[];
  qualityFocus: string[];
};

export type WorkbenchTaskDraft = {
  request: string;
  requiredText: string;
  style: string;
  references: string;
  variantCount: number;
};

export const emptyTaskDraft: WorkbenchTaskDraft = {
  request: "",
  requiredText: "",
  style: "",
  references: "",
  variantCount: 2,
};

export function taskDraftVariantCount(draft: WorkbenchTaskDraft, template: WorkbenchTaskTemplate) {
  const count = Number(draft.variantCount || template.variantCount);
  if (!Number.isFinite(count)) return template.variantCount;
  return Math.min(6, Math.max(1, Math.round(count)));
}

export const workbenchTaskTemplates: WorkbenchTaskTemplate[] = [
  {
    id: "event_poster",
    title: "活动宣传海报",
    group: "活动教育",
    ratio: "9:16",
    targetSize: "1080x1920",
    variantCount: 2,
    description: "活动、发布会、讲座、招募",
    fieldsHint: "主题 / 时间地点 / 报名方式",
    compositionRules: ["主题标题优先，活动价值一眼可读。", "时间、地点、报名入口形成清晰路径。", "画面保留足够安全边距，适合手机传播。"],
    textRules: ["用户未提供时间、地点、价格、电话时不要编造。", "核心信息不要超过三层，避免堆满小字。"],
    qualityFocus: ["标题可读", "报名路径清楚", "信息不拥挤"],
  },
  {
    id: "store_promo",
    title: "门店促销海报",
    group: "营销转化",
    ratio: "9:16",
    targetSize: "1080x1920",
    variantCount: 2,
    description: "开业、到店、餐饮、美业、零售",
    fieldsHint: "优惠 / 门店 / 电话地址",
    compositionRules: ["优惠利益点必须醒目，主体服务或产品清楚。", "门店信任信息与行动入口分区明确。", "氛围可以有吸引力，但不要牺牲价格和 CTA 阅读。"],
    textRules: ["电话、地址、二维码只能使用用户或项目真实素材。", "折扣、销量、原价、库存未提供时不要编造。"],
    qualityFocus: ["优惠醒目", "CTA 清楚", "真实信息不乱编"],
  },
  {
    id: "course_recruit",
    title: "课程招生海报",
    group: "活动教育",
    ratio: "9:16",
    targetSize: "1080x1920",
    variantCount: 2,
    description: "培训、学校、课程报名",
    fieldsHint: "课程名 / 人群 / 收益",
    compositionRules: ["课程名、适合人群、核心收益按阅读顺序排列。", "画面可信、干净，少用廉价促销感。", "报名入口清楚但不喧宾夺主。"],
    textRules: ["成绩、证书、承诺效果未提供时不要编造。", "机构名、电话、二维码必须来自用户输入或项目素材。"],
    qualityFocus: ["课程收益明确", "可信不花哨", "报名路径清楚"],
  },
  {
    id: "xiaohongshu_cover",
    title: "小红书封面",
    group: "社媒传播",
    ratio: "3:4",
    targetSize: "1242x1660",
    variantCount: 2,
    description: "种草、攻略、知识卡片",
    fieldsHint: "大标题 / 钩子 / 风格",
    compositionRules: ["大标题优先，缩略图状态仍然可读。", "主视觉清楚，信息不超过三层。", "封面需要有点击钩子和鲜明记忆点。"],
    textRules: ["必须保留用户提供的大标题，不要自造机构名、电话、二维码。", "标题短促有力，避免长段说明文字。"],
    qualityFocus: ["缩略图可读", "钩子明显", "主体清晰"],
  },
  {
    id: "square_social",
    title: "方形宣传图",
    group: "社媒传播",
    ratio: "1:1",
    targetSize: "1080x1080",
    variantCount: 2,
    description: "朋友圈、社群、通用配图",
    fieldsHint: "主题 / 一句话卖点",
    compositionRules: ["画面中心明确，适合方形裁切。", "只保留最关键的标题和一条辅助信息。", "视觉要适合快速扫读和转发。"],
    textRules: ["信息少而清楚，不要自动补电话、地址、二维码。"],
    qualityFocus: ["中心主体", "少字清楚", "社媒可读"],
  },
  {
    id: "wechat_hero",
    title: "公众号首图",
    group: "社媒传播",
    ratio: "custom",
    targetSize: "900x383",
    variantCount: 2,
    description: "文章封面、品牌内容头图",
    fieldsHint: "文章标题 / 栏目 / 品牌",
    compositionRules: ["横版安全区清楚，标题不要贴边。", "主视觉横向展开，适合微信列表裁切。", "背景干净，有内容调性但不过度抢字。"],
    textRules: ["标题必须准确，不要编造栏目名、作者、机构。", "避免小字过多，保证横版封面可读。"],
    qualityFocus: ["横版安全区", "标题不贴边", "列表可读"],
  },
  {
    id: "ecommerce_main",
    title: "电商商品主图",
    group: "营销转化",
    ratio: "1:1",
    targetSize: "800x800",
    variantCount: 2,
    description: "商品首图、列表点击",
    fieldsHint: "产品 / 卖点 / 活动",
    compositionRules: ["产品主体占主要视觉面积，边缘完整。", "背景干净，卖点围绕主体服务。", "卖点不超过三组，优先点击转化。"],
    textRules: ["价格、折扣、销量、功效未提供时不要编造。", "上传产品图时必须以产品真实外观为准。"],
    qualityFocus: ["主体大且清楚", "卖点少而强", "不虚构促销"],
  },
  {
    id: "ecommerce_banner",
    title: "电商活动 Banner",
    group: "营销转化",
    ratio: "custom",
    targetSize: "750x390",
    variantCount: 2,
    description: "店铺活动、横幅入口",
    fieldsHint: "活动主题 / 利益点 / 产品",
    compositionRules: ["横向阅读顺畅，左中右层级分明。", "活动主题、利益点、产品组合形成一个主视觉。", "可以有按钮感 CTA，但不要假造跳转信息。"],
    textRules: ["优惠规则、价格、日期未提供时不要编造。"],
    qualityFocus: ["横向层级", "利益点明确", "产品组合清楚"],
  },
  {
    id: "brand_kv",
    title: "品牌横版 KV",
    group: "品牌人物",
    ratio: "16:9",
    targetSize: "1920x1080",
    variantCount: 2,
    description: "发布会、官网头图、PPT 封面",
    fieldsHint: "主题 / 品牌 / 氛围",
    compositionRules: ["主视觉统一，有高级留白和明确视觉焦点。", "适合横版展示，标题区和视觉区互不遮挡。", "强调品牌调性，不做杂乱海报感。"],
    textRules: ["品牌名、slogan 必须来自用户输入或项目资料。", "不要添加无关图标、奖项、合作方。"],
    qualityFocus: ["高级感", "留白", "主视觉统一"],
  },
  {
    id: "expert_profile",
    title: "专家/人物介绍",
    group: "品牌人物",
    ratio: "9:16",
    targetSize: "1080x1920",
    variantCount: 2,
    description: "医生、老师、讲师、顾问",
    fieldsHint: "姓名 / 职称 / 机构 / 擅长",
    compositionRules: ["人物清晰可信，姓名、职称、机构层级明确。", "整体克制专业，避免夸张营销和廉价促销。", "擅长领域和信任背书要清楚分组。"],
    textRules: ["姓名、职称、机构、擅长领域不得编造。", "医疗、教育等场景避免夸大承诺和绝对化表述。"],
    qualityFocus: ["人物清楚", "信息准确", "专业可信"],
  },
];

export function validateWorkbenchTaskDraft(template: WorkbenchTaskTemplate, draft: WorkbenchTaskDraft) {
  const request = draft.request.trim();
  const requiredText = draft.requiredText.trim();
  const style = draft.style.trim();
  const references = draft.references.trim();
  const combined = [request, requiredText, style, references].filter(Boolean).join("\n");
  const missing: string[] = [];
  const warnings: string[] = [];
  const hasRealMaterialSignal = /上传|照片|产品图|人物图|logo|Logo|LOGO|二维码|素材|真实|参考图|已有/.test(combined);

  if (!request) missing.push("设计主题");
  if (contentSignalCount(request) < 2) missing.push("更完整的一句话需求");

  if (template.id === "event_poster") {
    if (!/(活动|讲座|发布|招募|报名|检查|开业|沙龙|展览|课程|节日|促销)/.test(combined)) missing.push("活动类型或主题");
    if (!/(时间|日期|地点|地址|报名|预约|扫码|电话|热线|微信|名额|对象|人群|面向)/.test(combined)) warnings.push("建议补充时间、地点或报名方式；缺失时不会编造。");
  }
  if (template.id === "store_promo") {
    if (!/(门店|店|餐饮|美业|零售|开业|到店|优惠|套餐|促销|服务|产品)/.test(combined)) missing.push("门店品类或促销主题");
    if (!/(优惠|折扣|满减|套餐|价格|到店|预约|电话|地址|二维码)/.test(combined)) warnings.push("建议补充优惠内容或到店行动入口。");
  }
  if (template.id === "course_recruit") {
    if (!/(课程|培训|招生|学习|班|营|老师|适合|人群|收益|能力)/.test(combined)) missing.push("课程名、适合人群或课程收益");
    if (!/(报名|时间|地点|电话|微信|二维码|名额)/.test(combined)) warnings.push("建议补充报名方式；缺失时不会编造。");
  }
  if (template.id === "xiaohongshu_cover") {
    if (!/(标题|攻略|避坑|推荐|种草|清单|方法|指南|封面|为什么|如何|必看|知识)/.test(combined) && request.length < 12) missing.push("封面大标题或内容钩子");
  }
  if (template.id === "square_social") {
    if (request.length < 8) missing.push("宣传主题和核心卖点");
  }
  if (template.id === "wechat_hero") {
    if (!/(文章|标题|栏目|主题|观点|报告|发布|活动|品牌|公众号)/.test(combined) && request.length < 12) missing.push("文章标题或封面主题");
  }
  if (template.id === "ecommerce_main") {
    if (!/(产品|商品|主图|卖点|新品|包装|材质|功能|口味|型号|套装)/.test(combined)) missing.push("产品名称或品类");
    if (!/(卖点|功能|材质|适合|优势|规格|口味|成分|场景)/.test(combined)) missing.push("核心卖点");
    if (!hasRealMaterialSignal) warnings.push("没有产品图时只能生成概念商品图，不适合直接上架。");
  }
  if (template.id === "ecommerce_banner") {
    if (!/(活动|大促|满减|上新|新品|优惠|店铺|产品|专场|福利)/.test(combined)) missing.push("活动主题或利益点");
    if (!/(产品|品类|商品|系列|套装|品牌)/.test(combined)) warnings.push("建议补充产品或品类，否则横幅会偏泛。");
  }
  if (template.id === "brand_kv") {
    if (!/(品牌|发布|主题|slogan|Slogan|主视觉|KV|官网|大会|发布会|科技|医疗|教育|餐饮)/.test(combined)) missing.push("品牌/主题/发布场景");
    if (!/(风格|高级|科技|温暖|专业|年轻|可信|极简|视觉|氛围)/.test(combined)) warnings.push("建议补充品牌调性或视觉氛围。");
  }
  if (template.id === "expert_profile") {
    if (!/[\u4e00-\u9fa5]{2,4}/.test(combined)) missing.push("专家姓名");
    if (!/(教授|医生|主任|讲师|老师|顾问|专家|博士|医师|院长)/.test(combined)) missing.push("职称或身份");
    if (!/(医院|大学|学院|机构|科室|中心|公司|集团|门诊|诊所)/.test(combined)) missing.push("机构或科室");
    if (!/(擅长|研究|方向|领域|专业|专注|口腔|儿科|眼科|消化|心内|骨科|肿瘤|皮肤|医美|种植|正畸|影像|临床|人工智能|机器人|数字化)/.test(combined)) missing.push("擅长领域或专业方向");
    if (!/(介绍|海报|宣传|简介|讲座|课程|门诊|预约|个人品牌|专家介绍)/.test(combined)) missing.push("使用场景");
    if (!hasRealMaterialSignal) warnings.push("没有真实人物照片时，只能生成概念人物版，不适合真实专家宣传。");
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueWarnings = [...new Set(warnings)];
  const questions = buildTaskFollowUpQuestions(template, uniqueMissing, combined);
  const canGenerate = uniqueMissing.length === 0;
  return {
    canGenerate,
    missing: uniqueMissing,
    warnings: uniqueWarnings,
    questions,
    message: canGenerate
      ? uniqueWarnings.length ? "可以生成，但建议补充信息让结果更准确。" : "信息基本够用，可以生成。"
      : `还缺：${uniqueMissing.join("、")}`,
  };
}

function buildTaskFollowUpQuestions(template: WorkbenchTaskTemplate, missing: string[], combined: string) {
  const questionMap: Record<string, string> = {
    设计主题: "这张图主要宣传什么主题？",
    更完整的一句话需求: "一句话补充：给谁看、做什么、希望用户做什么？",
    活动类型或主题: "这是讲座、促销、发布会、招募，还是其他活动？",
    门店品类或促销主题: "门店品类和主推优惠是什么？",
    "课程名、适合人群或课程收益": "课程名称、适合人群和核心收益分别是什么？",
    封面大标题或内容钩子: "封面最想让人点击的一句话标题是什么？",
    宣传主题和核心卖点: "这张方图要突出哪个主题和一个核心卖点？",
    文章标题或封面主题: "公众号文章标题或栏目主题是什么？",
    产品名称或品类: "产品名称、品类和真实外观要点是什么？",
    核心卖点: "最重要的 1-3 个卖点是什么？",
    活动主题或利益点: "活动主题、利益点和主推产品是什么？",
    "品牌/主题/发布场景": "品牌名、主题和发布场景是什么？",
    专家姓名: "专家姓名需要显示什么？",
    职称或身份: "专家职称或身份是什么？",
    机构或科室: "所属医院、机构或科室是什么？",
    擅长领域或专业方向: "需要突出哪些擅长领域或专业方向？",
    使用场景: "用于专家介绍、讲座海报、门诊宣传，还是个人品牌？",
  };
  const questions = missing.map((item) => questionMap[item] || `请补充：${item}`).slice(0, 4);
  if (!/(风格|高级|科技|温暖|专业|年轻|极简|活泼|国潮|商务|简约)/.test(combined)) {
    questions.push("希望画面偏高级、科技、温暖、活泼，还是更克制专业？");
  }
  if (template.id === "expert_profile" && !/(照片|人物图|真实|上传|参考图)/.test(combined)) {
    questions.push("是否有真实人物照片？没有的话只能先做概念版。");
  }
  return [...new Set(questions)].slice(0, 5);
}

function contentSignalCount(value: string) {
  const text = value.trim();
  if (!text) return 0;
  const chineseParts = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const latinParts = text.match(/[a-zA-Z0-9]{2,}/g) || [];
  return chineseParts.length + latinParts.length;
}

export function findWorkbenchTaskTemplate(id: string) {
  return workbenchTaskTemplates.find((template) => template.id === id) || workbenchTaskTemplates[0];
}

export function buildWorkbenchTaskPrompt(template: WorkbenchTaskTemplate, draft: WorkbenchTaskDraft) {
  const request = draft.request.trim();
  const requiredText = draft.requiredText.trim();
  const style = draft.style.trim();
  const references = draft.references.trim();
  const variantCount = taskDraftVariantCount(draft, template);
  return [
    `设计任务类型：${template.title}`,
    `目标用途：${template.description}`,
    `画布规格：${template.targetSize}，比例 ${template.ratio === "custom" ? "自定义" : template.ratio}。`,
    `方案数量：${variantCount} 个。每个方案应有明确不同的构图或视觉策略，不要只是换色。`,
    "方案策略：",
    ...variantStrategyLines(variantCount),
    "用户需求：",
    request || "用户未填写具体主题，请基于任务类型生成一张通用但可提案的商业设计图。",
    requiredText ? `必须出现的文字/信息：${requiredText}` : "必须出现的文字/信息：未提供。不要编造电话、地址、二维码、价格、机构名、姓名、职称、日期等真实信息。",
    style ? `风格偏好：${style}` : "风格偏好：根据任务类型选择成熟、干净、商业可交付的视觉风格。",
    references ? `参考说明：${references}` : "参考说明：未指定。若启用收藏风格，只做弱参考，不复制具体主体和文字。",
    "构图规则：",
    ...template.compositionRules.map((rule) => `- ${rule}`),
    "文字与素材规则：",
    ...template.textRules.map((rule) => `- ${rule}`),
    "- Logo、二维码、电话、地址、产品图、人物图只能使用用户上传或项目真实素材；缺失时宁可留出占位方向，不要编造。",
    "质检重点：",
    ...template.qualityFocus.map((item) => `- ${item}`),
  ].join("\n");
}

function variantStrategyLines(count: number) {
  const strategies = [
    "方案1：稳妥商业版，信息层级清楚，适合直接提案。",
    "方案2：高级品牌版，留白更强，画面更有质感。",
    "方案3：强转化版，卖点和行动入口更醒目。",
    "方案4：年轻社媒版，视觉记忆点更强，适合传播。",
    "方案5：极简留白版，减少元素，突出主体和标题。",
    "方案6：信息强化版，适合信息较多但仍保持可读。",
  ];
  return strategies.slice(0, count).map((item) => `- ${item}`);
}
