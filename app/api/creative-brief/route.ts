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

    const input = (await request.json()) as CreativeBriefInput;
    const fallback = buildCreativeBriefFallback(input);
    const aiBrief = await withTimeout(tryAiCreativeBrief(input, fallback), 9000).catch(() => null);
    const brief = aiBrief
      ? normalizeCreativeBrief({ ...aiBrief, source: "ai" }, fallback, input)
      : fallback;

    return NextResponse.json({
      ok: true,
      brief,
      source: aiBrief ? "ai" : "rules",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "创作预检失败。",
      },
      { status: 500 },
    );
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
  });

  const text = response.output_text || "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json ? JSON.parse(json) as Partial<CreativeBrief> : null;
}

function buildInstruction(input: CreativeBriefInput, fallback: CreativeBrief) {
  return [
    "你是商业设计创作入口的 GPT 预检助手。只返回合法 JSON，不要 Markdown。",
    "必须根据入口类型先分析或补全，再输出两个创意方向。不要直接跳过预检。",
    "素材优先级固定为：当前项目素材库 > 本次上传的图片 > 用户输入的一句话 > GPT 根据行业常识补全的内容 > 公共风格库。",
    "严格禁止编造机构名称、电话、地址、Logo、二维码、医生照片、真实活动信息。没有来源就写入 missingMaterials 和 caveats。",
    "如果缺少 logo、电话、地址、品牌色或真实照片，missingMaterialsWarning 必须是：当前缺少品牌素材，建议后续补充 logo、电话、地址、品牌色、真实照片，以便生成正式版本。",
    "single_image 模式必须填写 imageUnderstanding：designType, industry, theme, targetAudience, mainColors, layoutStructure, coreTextsAndSellingPoints, keepElements, optimizations, creativeDirections。",
    "idea 模式必须填写 ideaCompletion：industry, targetAudience, communicationGoal, coreSellingPoints, possibleTitles, visualStyle, creativeDirections, materialsToCollect。",
    "directions 必须有两个：A=信息清晰/专业信任/稳定表达；B=视觉更强/创意更明显/更适合传播。",
    "direction.prompt 要能直接给生图/改图模型使用，并重复禁止编造真实机构信息。",
    "JSON 字段：mode, title, projectName, temporaryProject, temporaryProjectName, missingMaterials, missingMaterialsWarning, projectContextUsed, imageUnderstanding, ideaCompletion, directions。",
    `入口输入：${JSON.stringify(input)}`,
    `规则兜底：${JSON.stringify(fallback)}`,
  ].join("\n");
}
