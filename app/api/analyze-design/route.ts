import { NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import { diagnosisToDisplayText, extractProtectionFromText, safeParseDiagnosis } from "@/lib/design-production";
import { getAnalysisModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage } from "@/lib/request-guards";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "请上传一张设计图。" }, { status: 400 });
    }

    assertSupportedImage(image);
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = image.type || "image/png";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const openai = getOpenAI();
    const model = getAnalysisModel();
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "请分析这张中文商业设计/广告图，只输出一个合法 JSON 对象，不要输出 Markdown。",
                "JSON 字段必须包含：summary, aspectRatio, mainTexts, protectedAssets, layers, colorStyle, layoutProblems, optimizationDirections, textProtectionNotes, generationPrompt, brandProfile。",
                "mainTexts 数组元素格式：{id,text,kind,importance,reason}。kind 可用 hospital/phone/address/doctor/price/title/logo/qr/medical/other；importance 可用 critical/high/normal。",
                "protectedAssets 数组元素格式：{id,type,label,importance,instruction}。type 可用 logo/qr/portrait/product/seal/other。",
                "layers 数组元素格式：{id,type,label,locked,notes}。type 可用 background/person/text/logo/decoration/effect/unknown。",
                "请重点识别并锁定：医院名称、电话、地址、价格、医生姓名、科室、LOGO、二维码、主标题、医疗承诺类文字。",
                "layoutProblems 写设计问题，例如标题太小、信息拥挤、远距离识别差、色彩不统一、视觉重心偏、医疗可信感不足。",
                "optimizationDirections 给 3 个可执行方向。",
                "generationPrompt 要适合后续生图/改图模型，强调保留锁定文字和资产，只优化背景、光影、质感、构图、版式层级。",
              ].join("\n"),
            },
            {
              type: "input_image",
              image_url: dataUrl,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 1600,
    }, { timeout: 9000 });

    const raw = response.output_text || "";
    const diagnosis = safeParseDiagnosis(raw);
    const fallbackProtectedTexts = extractProtectionFromText(raw);

    return NextResponse.json({
      analysis: diagnosis ? diagnosisToDisplayText(diagnosis) : raw,
      diagnosis,
      protectionContext: {
        protectedTexts: diagnosis?.mainTexts?.length ? diagnosis.mainTexts : fallbackProtectedTexts,
        protectedAssets: diagnosis?.protectedAssets || [],
        layers: diagnosis?.layers || [],
        brandProfile: diagnosis?.brandProfile,
        designDiagnosis: diagnosis
          ? {
              summary: diagnosis.summary,
              layoutProblems: diagnosis.layoutProblems,
              optimizationDirections: diagnosis.optimizationDirections,
              textProtectionNotes: diagnosis.textProtectionNotes,
            }
          : undefined,
      },
      model,
    });
  } catch (error) {
    const apiError = toApiError(error, "分析失败。");
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
