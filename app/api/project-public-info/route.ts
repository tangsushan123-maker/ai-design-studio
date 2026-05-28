import { NextResponse } from "next/server";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { ProjectFactCandidate, ProjectFactField } from "@/lib/project-system";

export const runtime = "nodejs";

type SearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organization = (url.searchParams.get("organization") || "").trim();
  if (!organization) {
    return NextResponse.json({ error: "缺少机构名称。" }, { status: 400 });
  }

  try {
    const results = await searchPublicPages(organization);
    const candidates = buildCandidates(organization, results);
    return NextResponse.json({
      organization,
      candidates,
      sources: results.slice(0, 5),
    });
  } catch (error) {
    return NextResponse.json({ error: publicInfoErrorMessage("联网补全失败", error) }, { status: 502 });
  }
}

async function searchPublicPages(organization: string): Promise<SearchResult[]> {
  const query = `${organization} 地址 电话 官网`;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const response = await undiciFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    ...(dispatcher ? { dispatcher } : {}),
  });
  if (!response.ok) throw new Error(`公开搜索服务返回 HTTP ${response.status}`);
  const html = await response.text();
  return parseDuckDuckGoResults(html).slice(0, 8);
}

function publicInfoErrorMessage(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail ? `${action}：${detail}` : `${action}，请稍后重试。`;
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippetMatches = [...html.matchAll(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const results: SearchResult[] = [];

  titleMatches.forEach((match, index) => {
    const url = normalizeSearchUrl(decodeHtml(match[1] || ""));
    const title = cleanHtml(match[2] || "");
    const snippet = cleanHtml(snippetMatches[index]?.[1] || "");
    if (!title && !snippet) return;
    results.push({ title, snippet, url });
  });

  return results;
}

function buildCandidates(organization: string, results: SearchResult[]): ProjectFactCandidate[] {
  const now = new Date().toISOString();
  const candidates: ProjectFactCandidate[] = [];
  const combined = results.map((item) => `${item.title}。${item.snippet}`).join("\n");
  const firstUrl = results.find((item) => item.url)?.url;

  addCandidate(candidates, {
    field: "organizationName",
    label: "机构名称",
    value: organization,
    sourceLabel: "用户输入",
    sourceUrl: firstUrl,
    fetchedAt: now,
  });

  const website = firstUrl && !/duckduckgo\.com|baidu\.com|bing\.com|google\.com/i.test(firstUrl) ? firstUrl : "";
  if (website) {
    addCandidate(candidates, {
      field: "website",
      label: "官网 / 公开页面",
      value: website,
      sourceLabel: sourceLabelFromUrl(website),
      sourceUrl: website,
      fetchedAt: now,
    });
  }

  extractValues(combined, /(?:电话|联系电话|咨询电话|服务热线)[：:\s]*([+\d][\d\s\-()（）]{6,24}\d)/g).forEach((value) => {
    addCandidate(candidates, {
      field: "phone",
      label: "电话",
      value,
      sourceLabel: "公开搜索摘要",
      sourceUrl: sourceUrlForValue(results, value),
      fetchedAt: now,
    });
  });

  extractValues(combined, /(?:地址|场馆地址|联系地址)[：:\s]*([^。；;\n]{4,80})/g).filter(isUsefulAddress).forEach((value) => {
    addCandidate(candidates, {
      field: "address",
      label: "地址",
      value,
      sourceLabel: "公开搜索摘要",
      sourceUrl: sourceUrlForValue(results, value),
      fetchedAt: now,
    });
  });

  return candidates.slice(0, 8);
}

function addCandidate(
  candidates: ProjectFactCandidate[],
  input: Omit<ProjectFactCandidate, "id" | "status"> & { field: ProjectFactField },
) {
  const value = input.value.trim().replace(/\s+/g, " ");
  if (!value) return;
  const key = `${input.field}:${value}`;
  if (candidates.some((item) => `${item.field}:${item.value}` === key)) return;
  candidates.push({
    id: `fact_${input.field}_${Math.random().toString(16).slice(2, 8)}`,
    ...input,
    value,
    status: "pending",
  });
}

function extractValues(text: string, pattern: RegExp) {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const value = cleanText(match[1] || "");
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function sourceUrlForValue(results: SearchResult[], value: string) {
  return results.find((item) => `${item.title} ${item.snippet}`.includes(value))?.url;
}

function normalizeSearchUrl(value: string) {
  const decoded = value.replace(/&amp;/g, "&");
  const redirect = decoded.match(/[?&]uddg=([^&]+)/);
  if (redirect?.[1]) return decodeURIComponent(redirect[1]);
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return decoded;
}

function sourceLabelFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "公开页面";
  }
}

function cleanHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanText(value: string) {
  return value.replace(/[，,。；;]+$/g, "").replace(/\s+/g, " ").trim();
}

function isUsefulAddress(value: string) {
  if (!value || value.startsWith(",") || value.startsWith("，") || value.includes("/")) return false;
  if (/图片|照片|门票|路线|电话|攻略|地图$/.test(value)) return false;
  return /省|市|区|县|路|街|号|楼|镇|园|中心/.test(value);
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}
