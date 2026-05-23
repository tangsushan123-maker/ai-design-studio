export type ModelCapability = "text" | "image" | "video" | "embedding" | "unknown";
export type ModelWireApi = "responses" | "chat_completions";
export type ModelReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ModelCatalogItem = {
  id: string;
  label: string;
  capabilities: ModelCapability[];
  description?: string;
  testStatus?: "untested" | "passed" | "failed";
  lastTestedAt?: string;
  lastTestMessage?: string;
};

export type ProviderPreset = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  siteUrl: string;
  apiBaseUrl: string;
  docsUrl: string;
  compatibility: "openai" | "gemini-openai" | "custom-openai";
  wireApi: ModelWireApi;
  requiresOpenAIAuth: boolean;
  disableResponseStorage: boolean;
  modelReasoningEffort: ModelReasoningEffort;
  apiKeyLabel: string;
  apiKeyEnv: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
  models: ModelCatalogItem[];
};

export const defaultOpenAIConfig = {
  providerId: "openai",
  apiBaseUrl: "https://api.openai.com/v1",
  siteUrl: "https://platform.openai.com",
  wireApi: "responses",
  requiresOpenAIAuth: true,
  disableResponseStorage: false,
  modelReasoningEffort: "medium",
  textModel: "gpt-5-mini",
  imageModel: "gpt-image-1",
  videoModel: "sora-2",
} as const;

export const providerPresets = [
  {
    id: "openai",
    label: "官方 OpenAI",
    shortLabel: "OpenAI",
    description: "官方 OpenAI API，适合 GPT、图像和 Sora 视频模型。",
    siteUrl: defaultOpenAIConfig.siteUrl,
    apiBaseUrl: defaultOpenAIConfig.apiBaseUrl,
    docsUrl: "https://platform.openai.com/docs",
    compatibility: "openai",
    wireApi: "responses",
    requiresOpenAIAuth: true,
    disableResponseStorage: false,
    modelReasoningEffort: "medium",
    apiKeyLabel: "OpenAI API Key",
    apiKeyEnv: "OPENAI_API_KEY",
    textModel: defaultOpenAIConfig.textModel,
    imageModel: defaultOpenAIConfig.imageModel,
    videoModel: defaultOpenAIConfig.videoModel,
    models: [
      { id: "gpt-5-mini", label: "GPT-5 mini", capabilities: ["text"], description: "默认分析模型。" },
      { id: "gpt-5.1", label: "GPT-5.1", capabilities: ["text"], description: "更强文本与分析模型，需账号支持。" },
      { id: "gpt-image-1", label: "GPT Image 1", capabilities: ["image"], description: "默认图片生成/编辑模型。" },
      { id: "gpt-image-1-mini", label: "GPT Image mini", capabilities: ["image"], description: "轻量图片模型，需服务商支持。" },
      { id: "sora-2", label: "Sora 2", capabilities: ["video"], description: "视频生成模型，需账号和接口支持。" },
    ],
  },
  {
    id: "ccs",
    label: "CCS / 佑词元",
    shortLabel: "CCS",
    description: "常用中转入口，按 Codex custom provider 方式接入；只填网站和密钥即可。",
    siteUrl: "https://yostoken.top",
    apiBaseUrl: "https://yostoken.top/v1",
    docsUrl: "https://yostoken.top",
    compatibility: "custom-openai",
    wireApi: "responses",
    requiresOpenAIAuth: true,
    disableResponseStorage: true,
    modelReasoningEffort: "xhigh",
    apiKeyLabel: "CCS API Key",
    apiKeyEnv: "OPENAI_API_KEY",
    textModel: "gpt-5.5",
    imageModel: "gpt-image-1",
    videoModel: "",
    models: [
      { id: "gpt-5.5", label: "gpt-5.5", capabilities: ["text"], description: "CCS 文本模型，Responses 测试通过后可用。" },
      { id: "gpt-image-1", label: "gpt-image-1", capabilities: ["image"], description: "如中转站支持图片接口，测试通过后可在首页切换。" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    shortLabel: "Router",
    description: "多模型聚合中转，文本模型最常用；图片/视频取决于模型和路由支持。",
    siteUrl: "https://openrouter.ai",
    apiBaseUrl: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/docs",
    compatibility: "custom-openai",
    wireApi: "chat_completions",
    requiresOpenAIAuth: true,
    disableResponseStorage: false,
    modelReasoningEffort: "none",
    apiKeyLabel: "OpenRouter API Key",
    apiKeyEnv: "OPENROUTER_API_KEY",
    textModel: "openai/gpt-5-mini",
    imageModel: "",
    videoModel: "",
    models: [
      { id: "openai/gpt-5-mini", label: "OpenAI GPT-5 mini", capabilities: ["text"], description: "通过 OpenRouter 路由的 GPT 模型。" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ["text"], description: "Google Gemini 文本模型。" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", capabilities: ["text"], description: "Anthropic 文本模型。" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    description: "Gemini 的 OpenAI 兼容接口，可用 OpenAI SDK 接入文本、图片和视频。",
    siteUrl: "https://ai.google.dev",
    apiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    compatibility: "gemini-openai",
    wireApi: "chat_completions",
    requiresOpenAIAuth: true,
    disableResponseStorage: false,
    modelReasoningEffort: "none",
    apiKeyLabel: "Gemini API Key",
    apiKeyEnv: "GEMINI_API_KEY",
    textModel: "gemini-2.5-flash",
    imageModel: "gemini-2.5-flash-image",
    videoModel: "veo-3.1-generate-preview",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", capabilities: ["text"], description: "快速文本/分析模型。" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ["text"], description: "更强文本推理模型。" },
      { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", capabilities: ["image"], description: "Gemini 图片生成/编辑模型。" },
      { id: "veo-3.1-generate-preview", label: "Veo 3.1", capabilities: ["video"], description: "Gemini 视频生成模型。" },
    ],
  },
  {
    id: "custom",
    label: "自定义中转",
    shortLabel: "Custom",
    description: "兼容 OpenAI 或 Responses 的中转站；模型名以平台后台为准。",
    siteUrl: "",
    apiBaseUrl: "",
    docsUrl: "",
    compatibility: "custom-openai",
    wireApi: "responses",
    requiresOpenAIAuth: true,
    disableResponseStorage: true,
    modelReasoningEffort: "xhigh",
    apiKeyLabel: "API Key",
    apiKeyEnv: "OPENAI_API_KEY",
    textModel: "gpt-5.5",
    imageModel: "",
    videoModel: "",
    models: [
      { id: "gpt-5.5", label: "gpt-5.5", capabilities: ["text"], description: "自定义中转文本模型，测试通过后可用。" },
    ],
  },
] as const satisfies ProviderPreset[];

export function findProviderPreset(providerId?: string) {
  return providerPresets.find((provider) => provider.id === providerId) || providerPresets[0];
}

export function inferModelCapabilities(modelId: string): ModelCapability[] {
  const id = modelId.toLowerCase();
  const capabilities = new Set<ModelCapability>();
  if (/(embed|embedding|text-embedding|bge-|e5-|jina-embeddings)/.test(id)) capabilities.add("embedding");
  if (/(image|imagen|dall|flux|sdxl|stable-diffusion|midjourney)/.test(id)) capabilities.add("image");
  if (/(sora|veo|video|runway|kling|hailuo|wan-|pika)/.test(id)) capabilities.add("video");
  if (!capabilities.size && /(gpt|gemini|claude|llama|qwen|deepseek|mistral|kimi|yi-|doubao|glm|ernie|hunyuan|moonshot|command|sonar)/.test(id)) capabilities.add("text");
  if (!capabilities.size) capabilities.add("unknown");
  return Array.from(capabilities);
}
