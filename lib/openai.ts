import OpenAI from "openai";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { getOpenAIConfig } from "./local-config";
import type { ResolvedOpenAIConfig } from "./local-config";

let client: OpenAI | null = null;
let clientApiKey = "";
let clientBaseUrl = "";
let clientProviderId = "";
let clientProxyUrl = "";
let globalProxyUrl = "";

export function getOpenAI() {
  const config = getOpenAIConfig();
  const proxyUrl = getProxyUrl();

  if (!config.apiKey) {
    throw new Error("缺少 OPENAI_API_KEY，请先在 API 配置页面设置，或在 .env.local 中配置服务端环境变量。");
  }

  if (!client || clientApiKey !== config.apiKey || clientBaseUrl !== config.apiBaseUrl || clientProviderId !== config.providerId || clientProxyUrl !== proxyUrl) {
    configureGlobalProxy(proxyUrl);

    client = createOpenAIClient(config);
    clientApiKey = config.apiKey;
    clientBaseUrl = config.apiBaseUrl;
    clientProviderId = config.providerId;
    clientProxyUrl = proxyUrl;
  }

  return client;
}

export function createOpenAIClient(config: Pick<ResolvedOpenAIConfig, "apiKey" | "apiBaseUrl" | "providerId">) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.apiBaseUrl,
    fetch: shouldUseSanitizedFetch(config) ? sanitizedOpenAIFetch : undefined,
  });
}

function shouldUseSanitizedFetch(config: Pick<ResolvedOpenAIConfig, "apiBaseUrl" | "providerId">) {
  return config.providerId === "ccs" || /yostoken|ccswitch|ccs/i.test(config.apiBaseUrl);
}

async function sanitizedOpenAIFetch(input: RequestInfo | URL, init?: globalThis.RequestInit) {
  const sourceHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  const headers = new Headers();
  const authorization = sourceHeaders.get("authorization");
  const contentType = sourceHeaders.get("content-type");
  if (authorization) headers.set("Authorization", authorization);
  if (contentType) headers.set("Content-Type", contentType);
  if (sourceHeaders.get("accept")) headers.set("Accept", "application/json");
  return fetch(input, { ...init, headers });
}

function configureGlobalProxy(proxyUrl: string) {
  if (!proxyUrl || globalProxyUrl === proxyUrl) return;

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  globalProxyUrl = proxyUrl;
}

function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    ""
  );
}
