export function toApiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  if (/OPENAI_API_KEY|api key|API key/i.test(message)) {
    return {
      status: 500,
      message: "缺少 OpenAI API Key。请先进入 API 配置页面保存 Key，或在 .env.local 中配置 OPENAI_API_KEY。",
    };
  }

  if (/502|bad gateway|gateway timeout|econnreset|etimedout|timeout|fetch failed|upstream/i.test(message)) {
    return {
      status: 502,
      message: "图片模型服务暂时不可用，可能是 API 代理或上游模型超时。请稍后重试，或在 API 配置里换一个更稳定/更快的图片模型。",
    };
  }

  if (/model|does not exist|not found|unsupported/i.test(message)) {
    return {
      status: 500,
      message: `当前 OpenAI 模型不可用或不支持此接口：${safeMessage(message)}。请在 API 配置页面检查图片模型 / 分析模型。`,
    };
  }

  if (/rate limit|quota|billing|insufficient/i.test(message)) {
    return {
      status: 429,
      message: `OpenAI 调用受限：${safeMessage(message)}。请检查额度、账单或稍后重试。`,
    };
  }

  if (/content policy|safety|moderation|blocked/i.test(message)) {
    return {
      status: 400,
      message: `请求被安全策略拦截：${safeMessage(message)}。请换一种更合规、更明确的描述。`,
    };
  }

  return {
    status: 500,
    message: safeMessage(message || fallback),
  };
}

function safeMessage(message: string) {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
