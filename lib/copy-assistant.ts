import type { AspectRatioValue } from "./design-options";

export type CopyAssistantMode = "complete_brief";

export type CopyAssistantContext = {
  projectName?: string;
  organizationName?: string;
  commonCopy?: string;
  styleNotes?: string;
  forbiddenContent?: string;
  commonSizes?: string;
  ratio?: AspectRatioValue | string;
  variantCount?: number;
};

export type CopyAssistantInput = {
  prompt: string;
  mode?: CopyAssistantMode;
  context?: CopyAssistantContext;
};

export type CopyAssistantSuggestion = {
  id: string;
  title: string;
  copy: string;
  visualDirection: string;
  imagePrompt: string;
  missingInfo: string[];
};

export type CopyAssistantResult = {
  suggestions: CopyAssistantSuggestion[];
  followUpQuestions: string[];
};

export function normalizeCopyAssistantInput(input: unknown): CopyAssistantInput {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return {
    prompt: stringValue(source.prompt).slice(0, 3000),
    mode: "complete_brief",
    context: normalizeContext(source.context),
  };
}

export function buildCopyAssistantPrompt(input: CopyAssistantInput) {
  const context = input.context || {};
  return [
    "你是一个商业平面设计助理，帮助用户把模糊需求整理成可直接出图的设计内容。",
    "只输出合法 JSON，不要 Markdown，不要解释。",
    "输出字段固定为：suggestions, followUpQuestions。",
    "suggestions 输出 4 个方案。每个方案字段固定为：id,title,copy,visualDirection,missingInfo。",
    "copy 是画面可见文案；visualDirection 简单说明这个方案的大致画面方向即可，不要写成长篇提示词。",
    "不要在 copy 或 visualDirection 里写具体画面尺寸、比例、像素、高清、4K、方版、横版、竖版等描述。尺寸和清晰度由用户在界面单独选择。",
    "不要编造真实机构名称、医生资质、电话、地址、价格、二维码链接、活动日期。缺少真实信息时用 [医院名称]、[电话]、[地址] 这类占位符，并写入 missingInfo。",
    "文案要适合远距离阅读：主标题短、副标题短、卖点分组，每行尽量不超过 14 个中文字符。",
    "灯箱、门头、户外画面优先考虑远读性、留白、对比度、主视觉清楚，不要塞太多小字。",
    "如果用户需求过少，仍然给可用方案，但 missingInfo 要提示还缺哪些信息；不要阻断用户。",
    "主题优先级最高：先忠实理解用户明确写出的节日、活动、对象和用途，再把行业作为辅助背景。禁止因为行业关键词擅自替换用户主题。",
    "项目上下文只是弱参考。用户本次需求与项目上下文冲突时，必须以用户本次需求为准。不要把项目名或历史指令自动当成画面文案。",
    `当前项目名：${context.projectName || ""}`,
    `机构名称：${context.organizationName || ""}`,
    `常用文案：${context.commonCopy || ""}`,
    `风格偏好：${context.styleNotes || ""}`,
    `禁用规则：${context.forbiddenContent || ""}`,
    `用户需求：${input.prompt}`,
    "JSON 示例结构：",
    JSON.stringify({
      suggestions: [{
        id: "option_1",
        title: "方案名称",
        copy: "画面上真实显示的文案",
        visualDirection: "简短画面方向",
        missingInfo: ["仍需用户补充的信息"],
      }],
      followUpQuestions: ["可选追问"],
    }, null, 2),
  ].join("\n");
}

export function parseCopyAssistantJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

export function normalizeCopyAssistantResult(raw: unknown): CopyAssistantResult {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const suggestions = Array.isArray(source.suggestions)
    ? source.suggestions.map((item, index) => normalizeSuggestion(item, index)).filter(Boolean) as CopyAssistantSuggestion[]
    : [];
  const followUpQuestions = Array.isArray(source.followUpQuestions)
    ? source.followUpQuestions.map(stringValue).filter(Boolean).slice(0, 4)
    : [];

  return {
    suggestions: suggestions.slice(0, 6),
    followUpQuestions,
  };
}

export function buildCopyAssistantImagePrompt(suggestion: CopyAssistantSuggestion, userRequest = "") {
  return [
    userRequest.trim() ? `用户需求：${userRequest.trim()}` : "",
    suggestion.copy.trim() ? `画面文案：\n${suggestion.copy.trim()}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeSuggestion(item: unknown, index: number) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
  const copy = stringValue(source.copy);
  const visualDirection = stringValue(source.visualDirection);
  const title = stringValue(source.title) || `方案 ${index + 1}`;
  const missingInfo = Array.isArray(source.missingInfo)
    ? source.missingInfo.map(stringValue).filter(Boolean).slice(0, 6)
    : [];
  const imagePrompt = stringValue(source.imagePrompt) || [copy, visualDirection].filter(Boolean).join("\n");
  if (!copy && !imagePrompt) return null;
  return {
    id: stringValue(source.id) || `option_${index + 1}`,
    title,
    copy,
    visualDirection,
    imagePrompt,
    missingInfo,
  };
}

function normalizeContext(value: unknown): CopyAssistantContext {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    projectName: stringValue(source.projectName).slice(0, 120),
    organizationName: stringValue(source.organizationName).slice(0, 120),
    commonCopy: stringValue(source.commonCopy).slice(0, 1200),
    styleNotes: stringValue(source.styleNotes).slice(0, 1200),
    forbiddenContent: stringValue(source.forbiddenContent).slice(0, 1200),
    commonSizes: stringValue(source.commonSizes).slice(0, 1200),
    ratio: stringValue(source.ratio).slice(0, 40),
    variantCount: numberValue(source.variantCount),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
