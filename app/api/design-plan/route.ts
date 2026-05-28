import { NextResponse } from "next/server";
import { toApiError } from "@/lib/api-errors";
import {
  buildDesignPlanPrompt,
  buildFallbackDesignPlan,
  designPlanToImagePrompt,
  normalizeDesignPlan,
  parseDesignPlanJson,
  type DesignPlanInput,
} from "@/lib/design-plan";
import { getAnalysisModel } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
    try {
      const contentType = request.headers.get("content-type") || "";
      const isMultipart = contentType.includes("multipart/form-data");
      const { input, images } = isMultipart
        ? await designPlanInputFromFormData(await request.formData())
        : { input: await request.json() as DesignPlanInput, images: [] as Array<{ dataUrl: string; label: string }> };

      if (!input.userPrompt?.trim()) {
        return NextResponse.json({ error: "请输入作图需求。" }, { status: 400 });
      }

      const fallback = buildFallbackDesignPlan(input);
      let rawPlan: unknown = null;
      try {
        const openai = getOpenAI();
        const prompt = buildDesignPlanPrompt({
          ...input,
          referenceAnalysis: [
            input.referenceAnalysis,
            images.length ? `已收到 ${images.length} 张参考/素材图片，请分析其配色、风格、版式、信息层级、主视觉、人物排版、可复用元素和不可照抄元素。` : "",
          ].filter(Boolean).join("\n"),
        });
        const response = await openai.responses.create({
          model: getAnalysisModel(),
          input: images.length
            ? [{
                role: "user",
                content: [
                  { type: "input_text", text: prompt },
                  ...images.map((image) => ({
                    type: "input_image",
                    image_url: image.dataUrl,
                    detail: "low",
                  })),
                ],
              }] as never
            : prompt,
          max_output_tokens: 2200,
        }, { timeout: 15000 });
        rawPlan = parseDesignPlanJson(response.output_text || "");
      } catch {
        rawPlan = null;
      }

      const designPlan = normalizeDesignPlan(rawPlan, fallback);
      const imagePrompt = designPlanToImagePrompt(designPlan);
      return NextResponse.json({
        ok: true,
        designPlan: {
          ...designPlan,
          imagePrompt,
        },
        imagePrompt,
        negativePrompt: designPlan.negativePrompt,
        textOverlayPlan: {
          mode: designPlan.textMode,
          copywriting: designPlan.copywriting,
          layoutPlan: designPlan.layoutPlan,
          requiredRealLayers: ["正式中文", "logo", "二维码", "电话", "地址", "人物照片"].filter((item) =>
            item === "正式中文" || JSON.stringify(input).includes(item.replace("正式中文", "")),
          ),
        },
        warnings: designPlan.warnings,
      });
    } catch (error) {
      const apiError = toApiError(error, "设计方案生成失败。");
      return NextResponse.json({ error: apiError.message }, { status: apiError.status });
    }
  });
}

async function designPlanInputFromFormData(formData: FormData) {
  const input: DesignPlanInput = {
    userPrompt: stringValue(formData.get("userPrompt")) || stringValue(formData.get("prompt")),
    industry: stringValue(formData.get("industry")),
    scene: stringValue(formData.get("scene")),
    referenceImages: parseJsonArray(formData.get("referenceManifest")),
    uploadedAssets: parseJsonArray(formData.get("uploadedAssets")),
    projectContext: stringValue(formData.get("projectContext")),
    options: {
      aspectRatio: stringValue(formData.get("aspectRatio")),
      customWidth: numberValue(formData.get("customWidth")),
      customHeight: numberValue(formData.get("customHeight")),
      mode: stringValue(formData.get("mode")) || "commercial",
      textMode: textModeValue(formData.get("textMode")),
    },
  };
  const images: Array<{ dataUrl: string; label: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    if (!key.startsWith("referenceImage") && !key.startsWith("assetImage")) continue;
    const buffer = Buffer.from(await value.arrayBuffer());
    if (!buffer.length) continue;
    images.push({
      dataUrl: `data:${value.type || "image/png"};base64,${buffer.toString("base64")}`,
      label: value.name || key,
    });
  }
  return { input, images: images.slice(0, 4) };
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: FormDataEntryValue | null) {
  const num = Number(stringValue(value));
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function textModeValue(value: FormDataEntryValue | null) {
  const text = stringValue(value);
  return text === "background_only" || text === "ai_text_preview" || text === "real_text_overlay" ? text : undefined;
}

function parseJsonArray(value: FormDataEntryValue | null): Array<Record<string, unknown>> {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}
