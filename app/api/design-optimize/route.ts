import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
import sharp from "sharp";
import { toApiError } from "@/lib/api-errors";
import type { QualityValue } from "@/lib/design-options";
import type { ProtectionContext } from "@/lib/design-production";
import { imageRequestOptions, runQueuedImageModelRequestWithRetry } from "@/lib/image-request-queue";
import {
  getOpenAIRequestedSize,
  getTargetPixels,
  parseDataUrl,
  processToExactSize,
  readImageMetadata,
  readPublicImageUrl,
  saveImageBuffer,
  saveImageMetadata,
  type PixelSize,
} from "@/lib/image-utils";
import { inspectImageQuality } from "@/lib/image-quality";
import { getAnalysisModel, resolveImageModel, supportsConfigurableImageInputFidelity } from "@/lib/model-config";
import { getOpenAI } from "@/lib/openai";
import { assertSupportedImage, getImageRatio } from "@/lib/request-guards";
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
import { withCurrentConfigUser } from "@/lib/request-config-user";

export const runtime = "nodejs";

type DesignOptimizationStrength = "conservative" | "professional" | "bold";
type DesignComparisonMode = "auto" | "side_by_side" | "stacked" | "final_only";

type DesignOptimizationAnalysis = {
  industry: string;
  design_type: string;
  scene: string;
  audience: string;
  brand_tone: string;
  conversion_goal: string;
  primary_color: string;
  secondary_color: string;
  layout_structure: string;
  text_hierarchy: string[];
  main_elements: string[];
  logo_area: string;
  subject_area: string;
  optimization_areas: string[];
  compliance_risks: string[];
  recommended_style: string;
  diagnosis: string[];
  strategy: string[];
};

type DesignOptimizeInput = {
  imageBuffer: Buffer;
  fileName: string;
  mimeType: string;
  strength: DesignOptimizationStrength;
  comparisonMode: DesignComparisonMode;
  quality: QualityValue;
  prompt: string;
  industryOverride: string;
  designTypeOverride: string;
  sceneOverride: string;
  imageModel?: string;
  model?: string;
  taskTrace?: TaskRunTrace;
  sourceCompareUrl?: string;
};

export async function POST(request: Request) {
  return await withCurrentConfigUser(async () => {
  const startedAt = Date.now();
  let taskTrace: TaskRunTrace | null = null;
  try {
    const input = await parseMultipartInput(request);
    taskTrace = input.taskTrace || null;
    await recordTaskRunStarted(taskTrace);

    const openai = getOpenAI();
    const imageModel = resolveImageModel(input.imageModel, input.model);
    const sourceRatio = await getImageRatio(input.imageBuffer);
    const outputSize = getTargetPixels(sourceRatio, input.quality);
    const outputRatioLabel = `${sourceRatio.width}x${sourceRatio.height}`;
    const analysis = applyManualOverrides(
      await analyzeDesignDraft(openai, input, sourceRatio, outputSize),
      input,
    );
    const prompt = buildDesignOptimizationPrompt({
      analysis,
      comparisonMode: input.comparisonMode,
      outputSize,
      quality: input.quality,
      sourcePrompt: input.prompt,
      strength: input.strength,
    });
    const item = await createDesignOptimizationImage({
      imageBuffer: input.imageBuffer,
      imageModel,
      mimeType: input.mimeType,
      outputSize,
      prompt,
      quality: input.quality,
      sourceFileName: input.fileName,
      sourceRatio,
      strength: input.strength,
    });
    const raw = await imageResultToBuffer(item.b64_json, item.url);
    const finalPng = await processToExactSize(raw, outputSize, "png", "safe_full_bleed");
    const [actual, saved] = await Promise.all([
      readImageMetadata(finalPng),
      saveImageBuffer(finalPng, "png", {
        ratioLabel: outputRatioLabel,
        quality: input.quality,
        projectId: taskTrace?.projectId,
        storageKind: "results",
      }),
    ]);
    const qualityCheck = await inspectImageQuality(saved.path, {
      quality: input.quality,
      ratio: sourceRatio,
      expectedSize: outputSize,
      fileSizeBytes: saved.fileSizeBytes,
      aspectRatio: outputRatioLabel,
      operation: "design_optimize",
      protectionContext: buildDesignOptimizationProtectionContext(analysis),
    });
    const payload = {
      id: saved.fileName,
      url: saved.url,
      originalUrl: saved.originalUrl,
      thumbnailUrl: saved.thumbnailUrl,
      previewUrl: saved.previewUrl,
      prompt,
      variant: 1,
      ratio: sourceRatio,
      mode: `设计优化 · ${designStrengthLabel(input.strength)}`,
      model: imageModel,
      aspectRatio: outputRatioLabel,
      quality: input.quality,
      generatedAt: new Date().toISOString(),
      outputSize: { width: actual.width, height: actual.height },
      expectedOutputSize: outputSize,
      qualityCheck,
      fileSizeBytes: saved.fileSizeBytes,
      savedPath: saved.path,
      durationMs: Date.now() - startedAt,
      projectId: taskTrace?.projectId,
      nodeOperation: "design_optimize",
      sourceCompareUrl: input.sourceCompareUrl,
      sourceTaskId: taskTrace?.taskId || taskTrace?.requestId?.replace(/^req_/, "task_"),
      sourceRequestId: taskTrace?.requestId,
      sourceNodeId: taskTrace?.nodeId,
      sourceNodeName: taskTrace?.nodeName,
      sourceNodeKind: taskTrace?.nodeKind,
      designOptimization: {
        strength: input.strength,
        comparisonMode: input.comparisonMode,
        analysis,
        promptModules: {
          basePrompt: buildBasePrompt(),
          industryPrompt: industryPromptFor(analysis.industry),
          designTypePrompt: designTypePromptFor(analysis.design_type),
          scenePrompt: scenePromptFor(analysis.scene),
          safetyRules: buildSafetyRules(),
          comparisonPrompt: buildComparisonPrompt(input.comparisonMode),
        },
      },
    };
    await saveImageMetadata(saved.fileName, payload);
    const outputs: Array<Record<string, unknown>> = [payload];
    if (input.comparisonMode !== "final_only") {
      const comparisonPng = await createComparisonPng({
        after: finalPng,
        before: input.imageBuffer,
        mode: input.comparisonMode,
        sourceRatio,
      });
      const [comparisonSaved, comparisonMeta] = await Promise.all([
        saveImageBuffer(comparisonPng, "png", {
          ratioLabel: input.comparisonMode === "stacked" ? "compare-stacked" : "compare-side",
          quality: input.quality,
          projectId: taskTrace?.projectId,
          storageKind: "results",
        }),
        readImageMetadata(comparisonPng),
      ]);
      const comparisonPayload = {
        id: comparisonSaved.fileName,
        url: comparisonSaved.url,
        originalUrl: comparisonSaved.originalUrl,
        thumbnailUrl: comparisonSaved.thumbnailUrl,
        previewUrl: comparisonSaved.previewUrl,
        prompt: "设计优化修改前/修改后对比图",
        variant: 2,
        ratio: { width: comparisonMeta.width, height: comparisonMeta.height },
        mode: "设计优化 · 修改前后对比",
        model: imageModel,
        aspectRatio: `${comparisonMeta.width}x${comparisonMeta.height}`,
        quality: input.quality,
        generatedAt: payload.generatedAt,
        outputSize: { width: comparisonMeta.width, height: comparisonMeta.height },
        expectedOutputSize: { width: comparisonMeta.width, height: comparisonMeta.height },
        fileSizeBytes: comparisonSaved.fileSizeBytes,
        savedPath: comparisonSaved.path,
        durationMs: Date.now() - startedAt,
        projectId: taskTrace?.projectId,
        nodeOperation: "design_optimize",
        materialType: "修改前后对比图",
        sourceCompareUrl: input.sourceCompareUrl,
        sourceTaskId: payload.sourceTaskId,
        sourceRequestId: payload.sourceRequestId,
        sourceNodeId: payload.sourceNodeId,
        sourceNodeName: payload.sourceNodeName,
        sourceNodeKind: payload.sourceNodeKind,
        designOptimization: payload.designOptimization,
      };
      await saveImageMetadata(comparisonSaved.fileName, comparisonPayload);
      outputs.push(comparisonPayload);
    }
    await recordTaskRunFinished(taskTrace, { outputs, model: imageModel, message: `设计优化完成，服务端已保存 ${outputs.length} 个结果。` });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, outputs), image: payload, images: outputs, analysis, prompt, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "设计优化失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }

  });
}

async function parseMultipartInput(request: Request): Promise<DesignOptimizeInput> {
  const formData = await request.formData();
  const image = formData.get("image");
  const sourceUrl = String(formData.get("sourceUrl") ?? "");
  if (!(image instanceof File) && !sourceUrl) throw new Error("请上传或连接一张设计稿。");
  if (image instanceof File) assertSupportedImage(image);
  const imageBuffer = image instanceof File
    ? Buffer.from(await image.arrayBuffer())
    : await readPublicImageUrl(sourceUrl);
  const fileName = image instanceof File ? image.name || "design.png" : sourceUrl.split("/").pop() || "design.png";
  const mimeType = image instanceof File ? image.type || "image/png" : mimeTypeFromFileName(fileName);
  return {
    imageBuffer,
    fileName,
    mimeType,
    strength: normalizeStrength(formData.get("strength")),
    comparisonMode: normalizeComparisonMode(formData.get("comparisonMode")),
    quality: normalizeQuality(formData.get("quality")),
    prompt: String(formData.get("prompt") ?? ""),
    industryOverride: String(formData.get("industry") ?? ""),
    designTypeOverride: String(formData.get("designType") ?? ""),
    sceneOverride: String(formData.get("scene") ?? ""),
    imageModel: String(formData.get("imageModel") ?? "") || undefined,
    model: String(formData.get("model") ?? "") || undefined,
    taskTrace: taskTraceFromFormData(formData, "design_optimize", "/api/design-optimize"),
    sourceCompareUrl: String(formData.get("sourceCompareUrl") ?? "") || (sourceUrl.startsWith("/generated/") ? sourceUrl : undefined),
  };
}

async function analyzeDesignDraft(
  openai: ReturnType<typeof getOpenAI>,
  input: DesignOptimizeInput,
  sourceRatio: PixelSize,
  outputSize: PixelSize,
): Promise<DesignOptimizationAnalysis> {
  const fallback = designAnalysisFallback(sourceRatio);
  try {
    const response = await openai.responses.create({
      model: getAnalysisModel(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "请分析这张已经完成的设计稿，并只输出 JSON，不要输出解释。",
                "任务是后续做专业设计优化，不是高清修复、不是参考图复刻。",
                "必须识别：行业类型、设计类型、使用场景、目标人群、品牌调性、核心转化目标、主色、辅助色、版式结构、文字层级、主要元素、logo区域、人物/产品区域、可优化区域、合规风险。",
                "JSON 字段必须包含：industry, design_type, scene, audience, brand_tone, conversion_goal, primary_color, secondary_color, layout_structure, text_hierarchy, main_elements, logo_area, subject_area, optimization_areas, compliance_risks, recommended_style, diagnosis, strategy。",
                "不要编造看不见的电话、地址、价格、Logo 或二维码。看不清就写不确定。",
                `原图比例约为 ${sourceRatio.width}:${sourceRatio.height}，计划输出 ${outputSize.width}x${outputSize.height}。`,
                input.prompt ? `用户本次优化要求：${input.prompt}` : "",
              ].filter(Boolean).join("\n"),
            },
            {
              type: "input_image",
              image_url: `data:${input.mimeType || "image/png"};base64,${input.imageBuffer.toString("base64")}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 2000,
    }, { timeout: 45_000 });
    return normalizeDesignAnalysis(parseJsonObject(response.output_text || ""), fallback);
  } catch {
    return fallback;
  }
}

function buildDesignOptimizationPrompt(input: {
  analysis: DesignOptimizationAnalysis;
  comparisonMode: DesignComparisonMode;
  outputSize: PixelSize;
  quality: QualityValue;
  sourcePrompt: string;
  strength: DesignOptimizationStrength;
}) {
  return [
    buildBasePrompt(),
    `Canvas: ${input.outputSize.width} x ${input.outputSize.height}. Keep the source aspect ratio. Design natively for this canvas. No crop, no padding, no blurred side extension.`,
    `Optimization strength: ${designStrengthLabel(input.strength)}. ${strengthPromptFor(input.strength)}`,
    `Detected industry: ${input.analysis.industry}.`,
    `Detected design type: ${input.analysis.design_type}.`,
    `Detected scene: ${input.analysis.scene}.`,
    `Audience: ${input.analysis.audience}.`,
    `Brand tone: ${input.analysis.brand_tone}.`,
    `Conversion goal: ${input.analysis.conversion_goal}.`,
    `Color system: primary ${input.analysis.primary_color}; secondary ${input.analysis.secondary_color}.`,
    `Layout structure: ${input.analysis.layout_structure}.`,
    `Text hierarchy to preserve: ${(input.analysis.text_hierarchy || []).join(" | ") || "preserve visible hierarchy"}.`,
    `Main elements to preserve: ${(input.analysis.main_elements || []).join(" | ") || "preserve main visual elements"}.`,
    `Logo area: ${input.analysis.logo_area}.`,
    `Person/product area: ${input.analysis.subject_area}.`,
    `Optimization focus: ${(input.analysis.optimization_areas || []).join(" | ") || "hierarchy, spacing, color, focal point, readability"}.`,
    industryPromptFor(input.analysis.industry),
    designTypePromptFor(input.analysis.design_type),
    scenePromptFor(input.analysis.scene),
    input.sourcePrompt ? `User instruction: ${input.sourcePrompt}` : "",
    buildSafetyRules(),
    buildComparisonPrompt(input.comparisonMode),
    "Do not draw a design audit report, score card, before/after split screen, or explanatory text into the image.",
    "Output only the optimized final design image.",
  ].filter(Boolean).join("\n\n");
}

async function createDesignOptimizationImage(input: {
  imageBuffer: Buffer;
  imageModel: string;
  mimeType: string;
  outputSize: PixelSize;
  prompt: string;
  quality: QualityValue;
  sourceFileName: string;
  sourceRatio: PixelSize;
  strength: DesignOptimizationStrength;
}) {
  const openai = getOpenAI();
  const sourceFile = await toFile(input.imageBuffer, input.sourceFileName || "design.png", { type: input.mimeType || "image/png" });
  const requestedSize = getOpenAIRequestedSize(input.sourceRatio, input.quality, input.imageModel);
  const response = await runQueuedImageModelRequestWithRetry(
    { label: `设计优化/${designStrengthLabel(input.strength)}/${input.imageModel}` },
    () => openai.images.edit({
      model: input.imageModel,
      image: sourceFile,
      prompt: input.prompt,
      size: requestedSize as "1024x1024",
      quality: input.quality === "standard" ? "medium" : "high",
      output_format: "png",
      background: "opaque",
      ...(supportsConfigurableImageInputFidelity(input.imageModel) ? { input_fidelity: input.strength === "bold" ? "low" as const : "high" as const } : {}),
      n: 1,
    }, imageRequestOptions()),
  );
  const item = response.data?.[0];
  if (!item) throw new Error("设计优化没有返回图片。");
  return item;
}

async function createComparisonPng(input: {
  after: Buffer;
  before: Buffer;
  mode: DesignComparisonMode;
  sourceRatio: PixelSize;
}) {
  const layout = input.mode === "stacked" || (input.mode === "auto" && input.sourceRatio.width < input.sourceRatio.height * 0.82)
    ? "stacked"
    : "side_by_side";
  const beforeMeta = await readImageMetadata(input.before);
  const afterMeta = await readImageMetadata(input.after);
  const panelWidth = Math.max(1, afterMeta.width || beforeMeta.width || 1536);
  const panelHeight = Math.max(1, afterMeta.height || beforeMeta.height || 1024);
  const labelHeight = Math.max(64, Math.round(panelHeight * 0.06));
  const gap = Math.max(16, Math.round(Math.min(panelWidth, panelHeight) * 0.025));
  const canvas = layout === "stacked"
    ? { width: panelWidth, height: (panelHeight + labelHeight) * 2 + gap }
    : { width: panelWidth * 2 + gap, height: panelHeight + labelHeight };
  const beforePanel = await buildComparisonPanel(input.before, panelWidth, panelHeight, "修改前");
  const afterPanel = await buildComparisonPanel(input.after, panelWidth, panelHeight, "修改后");
  const placements = layout === "stacked"
    ? [
        { input: beforePanel, left: 0, top: 0 },
        { input: afterPanel, left: 0, top: panelHeight + labelHeight + gap },
      ]
    : [
        { input: beforePanel, left: 0, top: 0 },
        { input: afterPanel, left: panelWidth + gap, top: 0 },
      ];
  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 14, g: 17, b: 24, alpha: 1 },
    },
  })
    .composite(placements)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function buildComparisonPanel(buffer: Buffer, width: number, height: number, label: string) {
  const labelHeight = Math.max(64, Math.round(height * 0.06));
  const image = await processToExactSize(buffer, { width, height }, "png", "safe_no_crop");
  const labelSvg = Buffer.from([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${labelHeight}" viewBox="0 0 ${width} ${labelHeight}">`,
    `<rect width="${width}" height="${labelHeight}" fill="#0e1118"/>`,
    `<text x="${Math.round(width / 2)}" y="${Math.round(labelHeight * 0.64)}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="${Math.max(24, Math.round(labelHeight * 0.42))}" font-weight="700" fill="${label === "修改后" ? "#adf8e5" : "#ffffff"}">${label}</text>`,
    "</svg>",
  ].join(""));
  return sharp({
    create: {
      width,
      height: height + labelHeight,
      channels: 4,
      background: { r: 14, g: 17, b: 24, alpha: 1 },
    },
  })
    .composite([
      { input: image, left: 0, top: 0 },
      { input: labelSvg, left: 0, top: height },
    ])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function buildBasePrompt() {
  return [
    "Professional design optimization task.",
    "Improve an existing finished design while preserving its core information, main subject, brand recognition, and intended communication goal.",
    "Optimize visual hierarchy, typography spacing, alignment, margins, color harmony, focal point, readability, subject texture, lighting, and conversion path.",
    "The result should look like a mature commercial design refinement, not a random redesign and not simple upscaling.",
  ].join("\n");
}

function industryPromptFor(industry: string) {
  const key = industry.toLowerCase();
  if (/医疗|健康|医院|医生|medical|health/.test(key)) return "Industry rules: medical/health design should be professional, trustworthy, clean, restrained, compliant, calm, and authority-building. Avoid fear, exaggerated cure claims, cheap promotion, and visual clutter.";
  if (/化妆|美妆|护肤|美容|cosmetic|beauty/.test(key)) return "Industry rules: beauty/cosmetics design should feel refined, premium, glossy, ingredient-aware, skin-texture-sensitive, and brand-led. Emphasize product finish, soft light, and clean luxury.";
  if (/啤酒|饮料|酒|茶|咖啡|beverage|beer|drink/.test(key)) return "Industry rules: beer/beverage design should communicate cold freshness, activity, gathering mood, youthfulness, taste, and conversion. Make price and call-to-action clear when visible.";
  if (/餐饮|食品|外卖|饭|菜|food|restaurant/.test(key)) return "Industry rules: food design should increase appetite, warmth, texture, price clarity, and store/action guidance. Food must look fresh and credible.";
  if (/教育|培训|课程|学校|education|course/.test(key)) return "Industry rules: education design should build trust, explain course value, show outcomes, clarify registration path, and avoid noisy decoration.";
  if (/文旅|旅游|活动|文化|展览|travel|tourism|event/.test(key)) return "Industry rules: culture/travel/event design should emphasize theme atmosphere, culture, participation, memory point, and shareability.";
  if (/科技|数码|软件|ai|芯片|tech|digital/.test(key)) return "Industry rules: technology/digital design should be clean, ordered, futuristic, capability-focused, precise, and low-clutter.";
  if (/政务|公益|政府|公共|public|government/.test(key)) return "Industry rules: government/public-service design should be formal, clear, standardized, trustworthy, and accessible. Avoid over-commercial styling.";
  if (/零售|快消|促销|电商|retail|fmcg|sale/.test(key)) return "Industry rules: retail/FMCG design should have strong visual impact, clear offer, visible selling points, simple reading path, and fast conversion.";
  return "Industry rules: general commercial design should have clear hierarchy, strong subject, orderly information, unified style, and explicit conversion path.";
}

function designTypePromptFor(designType: string) {
  const key = designType.toLowerCase();
  if (/海报|poster/.test(key)) return "Design type rules: poster optimization should create a strong first focal point, clear title hierarchy, enough breathing space, and a concise information path.";
  if (/横幅|banner|广告|公交|电梯|户外|标识|sign/.test(key)) return "Design type rules: banner/signage/OOH optimization should improve distance readability, reduce small clutter, strengthen main headline and subject, and keep safe margins.";
  if (/详情|电商|product|商品/.test(key)) return "Design type rules: ecommerce/product optimization should keep product accurate, sharpen benefit hierarchy, improve material highlights, and make CTA/price areas clear.";
  if (/专家|人物|医生|介绍|profile/.test(key)) return "Design type rules: profile/expert optimization should keep identity and face unchanged, improve credibility, portrait lighting, title/name hierarchy, and institution trust cues.";
  if (/封面|cover/.test(key)) return "Design type rules: cover optimization should make topic and visual hook readable at thumbnail size, with fewer competing elements.";
  return "Design type rules: preserve the current design type and improve hierarchy, alignment, margins, and focal clarity.";
}

function scenePromptFor(scene: string) {
  const key = scene.toLowerCase();
  if (/线下|户外|公交|电梯|现场|offline|outdoor/.test(key)) return "Scene rules: offline/outdoor use requires larger text, stronger contrast, simpler background, and recognition within three seconds.";
  if (/线上|社交|朋友圈|小红书|抖音|online|social/.test(key)) return "Scene rules: online/social use requires stronger hook, refined thumbnail readability, controlled decoration, and shareable visual mood.";
  if (/ppt|汇报|会议/.test(key)) return "Scene rules: PPT/presentation use requires clean background, readable title area, and reduced decorative noise.";
  if (/详情|电商|落地页|landing/.test(key)) return "Scene rules: detail page/landing use requires conversion hierarchy, benefit blocks, product trust, and scan-friendly sections.";
  return "Scene rules: match the detected use scene and optimize readability, hierarchy, and conversion path.";
}

function strengthPromptFor(strength: DesignOptimizationStrength) {
  if (strength === "bold") return "Keep core information and main subject, but allow a stronger overall redesign of layout, visual atmosphere, hierarchy, color system, and commercial style.";
  if (strength === "professional") return "Re-adjust information hierarchy and local layout; make the image more mature while preserving key content, subject, and brand recognition.";
  return "Mostly keep the original layout; improve clarity, spacing, color, lighting, material texture, margins, and readability without major rearrangement.";
}

function buildSafetyRules() {
  return [
    "Safety rules:",
    "Do not rewrite key Chinese text, names, titles, prices, dates, phone numbers, addresses, hospital names, brand names, activity rules, QR codes, or legal/compliance claims.",
    "Do not invent a logo. If the original logo is unclear, keep the logo area conservative rather than making up a new brand mark.",
    "Do not change a real person identity, face, expression, age, body proportion, or portrait identity.",
    "Do not change product structure, packaging shape, brand marks, QR codes, or product proportions.",
    "Do not add unrelated elements. Do not crop important content. Do not create fake before/after labels in the image.",
  ].join("\n");
}

function buildDesignOptimizationProtectionContext(analysis: DesignOptimizationAnalysis): ProtectionContext {
  const protectedTexts = analysis.text_hierarchy
    .map((text) => text.trim())
    .filter((text) => text && !/不确定|看不清|无|none/i.test(text))
    .slice(0, 12)
    .map((text, index) => ({
      id: `design_text_${index + 1}`,
      text,
      kind: "title" as const,
      importance: index < 3 ? "high" as const : "normal" as const,
      reason: "设计优化分析识别到的原稿文字层级，交付前需要核对。",
    }));
  const protectedAssets = analysis.logo_area && !/不确定|看不清|无|none/i.test(analysis.logo_area)
    ? [{
        id: "design_logo_area",
        type: "logo" as const,
        label: analysis.logo_area,
        importance: "high" as const,
        instruction: "保持原稿 Logo/品牌区域识别度，不要编造新标志。",
      }]
    : [];
  return { protectedTexts, protectedAssets };
}

function buildComparisonPrompt(mode: DesignComparisonMode) {
  if (mode === "final_only") return "Comparison policy: output only the optimized final artwork. The app may compare it with the original separately.";
  if (mode === "stacked") return "Comparison policy: the app will show original above and optimized below. Do not bake this stacked comparison into the generated image.";
  if (mode === "side_by_side") return "Comparison policy: the app will show original left and optimized right. Do not bake this side-by-side comparison into the generated image.";
  return "Comparison policy: the app will automatically choose a before/after comparison layout. Generate only the optimized artwork.";
}

function applyManualOverrides(analysis: DesignOptimizationAnalysis, input: DesignOptimizeInput) {
  return {
    ...analysis,
    industry: input.industryOverride.trim() || analysis.industry,
    design_type: input.designTypeOverride.trim() || analysis.design_type,
    scene: input.sceneOverride.trim() || analysis.scene,
  };
}

function normalizeDesignAnalysis(value: unknown, fallback: DesignOptimizationAnalysis): DesignOptimizationAnalysis {
  if (!value || typeof value !== "object") return fallback;
  const data = value as Record<string, unknown>;
  return {
    industry: stringValue(data.industry) || fallback.industry,
    design_type: stringValue(data.design_type) || fallback.design_type,
    scene: stringValue(data.scene) || fallback.scene,
    audience: stringValue(data.audience) || fallback.audience,
    brand_tone: stringValue(data.brand_tone) || fallback.brand_tone,
    conversion_goal: stringValue(data.conversion_goal) || fallback.conversion_goal,
    primary_color: stringValue(data.primary_color) || fallback.primary_color,
    secondary_color: stringValue(data.secondary_color) || fallback.secondary_color,
    layout_structure: stringValue(data.layout_structure) || fallback.layout_structure,
    text_hierarchy: stringArray(data.text_hierarchy, fallback.text_hierarchy),
    main_elements: stringArray(data.main_elements, fallback.main_elements),
    logo_area: stringValue(data.logo_area) || fallback.logo_area,
    subject_area: stringValue(data.subject_area) || fallback.subject_area,
    optimization_areas: stringArray(data.optimization_areas, fallback.optimization_areas),
    compliance_risks: stringArray(data.compliance_risks, fallback.compliance_risks),
    recommended_style: stringValue(data.recommended_style) || fallback.recommended_style,
    diagnosis: stringArray(data.diagnosis, fallback.diagnosis),
    strategy: stringArray(data.strategy, fallback.strategy),
  };
}

function designAnalysisFallback(sourceRatio: PixelSize): DesignOptimizationAnalysis {
  return {
    industry: "通用商业设计",
    design_type: sourceRatio.width >= sourceRatio.height ? "横版设计稿" : "竖版设计稿",
    scene: "通用传播",
    audience: "目标用户",
    brand_tone: "清晰、专业、商业化",
    conversion_goal: "提升识别度和转化路径",
    primary_color: "沿用原图主色",
    secondary_color: "沿用原图辅助色",
    layout_structure: "保留原有主体和信息结构，优化层级、留白和对齐",
    text_hierarchy: ["主标题", "副标题", "补充信息"],
    main_elements: ["主体视觉", "文字信息", "品牌区域"],
    logo_area: "按原图位置保护",
    subject_area: "按原图主体区域保护",
    optimization_areas: ["信息层级", "对齐", "留白", "颜色统一", "主体质感", "可读性"],
    compliance_risks: ["关键信息需保持原文，不可由 AI 改写"],
    recommended_style: "层级清晰、主体突出、风格统一",
    diagnosis: ["画面可优化层级、留白、对齐和视觉焦点"],
    strategy: ["保留核心信息和主体，提升版式成熟度、质感和商业完成度"],
  };
}

async function imageResultToBuffer(base64?: string | null, url?: string | null) {
  if (base64) return Buffer.from(base64, "base64");
  if (!url) throw new Error("图片接口没有返回可用图片。");
  if (url.startsWith("data:")) return parseDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error("下载设计优化结果失败。");
  return Buffer.from(await response.arrayBuffer());
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeStrength(value: unknown): DesignOptimizationStrength {
  if (value === "bold") return "bold";
  if (value === "professional") return "professional";
  return "conservative";
}

function normalizeComparisonMode(value: unknown): DesignComparisonMode {
  if (value === "side_by_side" || value === "stacked" || value === "final_only") return value;
  return "auto";
}

function normalizeQuality(value: unknown): QualityValue {
  return value === "4k" || value === "2k" ? value : "standard";
}

function designStrengthLabel(strength: DesignOptimizationStrength) {
  if (strength === "bold") return "大幅优化";
  if (strength === "professional") return "专业优化";
  return "保守优化";
}

function stringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items: string[] = [];
  for (const item of value) {
    const text = stringValue(item);
    if (text) items.push(text);
  }
  return items.length ? items : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function mimeTypeFromFileName(fileName: string) {
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  if (/\.webp$/i.test(fileName)) return "image/webp";
  return "image/png";
}
