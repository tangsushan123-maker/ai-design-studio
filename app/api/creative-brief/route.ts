import { NextResponse } from "next/server";
import {
  buildCreativeBriefFallback,
  normalizeCreativeBrief,
  type CreativeBrief,
  type CreativeBriefInput,
} from "@/lib/creative-brief";
import { getAnalysisModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "请用 JSON 请求体提交创作入口信息。" }, { status: 400 });
    }

    const input = await parseCreativeBriefPayload(request);
    const fallback = buildCreativeBriefFallback(input);
    const aiBrief = await withTimeout(tryAiCreativeBrief(input, fallback), 5500).catch(() => null);
    const brief = aiBrief
      ? normalizeCreativeBrief({ ...aiBrief, source: "ai" }, fallback, input)
      : fallback;

    return NextResponse.json({
      ok: true,
      brief,
      source: aiBrief ? "ai" : "rules",
    });
  } catch (error) {
    if (error instanceof InvalidCreativeBriefPayloadError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "创作预检失败。",
      },
      { status: 500 },
    );
  }
}

class InvalidCreativeBriefPayloadError extends Error {}

async function parseCreativeBriefPayload(request: Request): Promise<CreativeBriefInput> {
  try {
    const input = await request.json() as CreativeBriefInput;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InvalidCreativeBriefPayloadError("创作预检请求格式不正确。");
    }
    return input;
  } catch (error) {
    if (error instanceof InvalidCreativeBriefPayloadError) throw error;
    throw new InvalidCreativeBriefPayloadError("创作预检 JSON 无法解析，请检查请求内容后重试。");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("创作预检超时。")), timeoutMs)),
  ]);
}

async function tryAiCreativeBrief(input: CreativeBriefInput, fallback: CreativeBrief) {
  const openai = getOpenAI();
  const model = getAnalysisModel();
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: buildInstruction(input, fallback),
    },
  ];

  if (input.mode === "single_image" && input.selectedImage?.url?.startsWith("data:image/")) {
    content.push({
      type: "input_image",
      image_url: input.selectedImage.url,
      detail: "high",
    });
  }

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "user",
        content,
      },
    ],
    max_output_tokens: 1200,
  });

  const text = response.output_text || "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json ? JSON.parse(json) as Partial<CreativeBrief> : null;
}

function buildInstruction(input: CreativeBriefInput, fallback: CreativeBrief) {
  return [
    "你是商业设计创作入口的预检助手。只返回合法 JSON，不要 Markdown。",
    "先分析入口信息，再输出两个方向：A=成熟商业版，B=创意主视觉版。",
    "素材优先级：当前项目素材库 > 本次上传图片 > 用户输入 > 行业常识 > 公共风格库。",
    "禁止编造机构名称、电话、地址、Logo、二维码、医生照片和真实活动信息；缺少来源写入 missingMaterials/caveats。",
    "single_image 填 imageUnderstanding；idea 填 ideaCompletion。",
    "directions 必须有两个：A=信息清晰/专业信任/稳定表达；B=视觉更强/创意更明显/更适合传播。",
    "direction.prompt 要短、可直接给生图/改图模型使用。",
    "JSON 字段：mode, title, projectName, temporaryProject, temporaryProjectName, missingMaterials, missingMaterialsWarning, projectContextUsed, imageUnderstanding, ideaCompletion, directions。",
    `入口输入：${JSON.stringify(input)}`,
    `规则兜底：${JSON.stringify(fallback)}`,
  ].join("\n");
}
