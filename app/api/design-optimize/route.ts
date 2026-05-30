import { NextResponse } from "next/server";
import { toFile } from "openai/uploads";
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
import { recordTaskRunFailed, recordTaskRunFinished, recordTaskRunStarted, startTaskRunHeartbeat, taskRunResponseMeta, taskTraceFromFormData, type TaskRunTrace } from "@/lib/task-run-ledger";
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

type DesignOptimizationVariant = {
  key: "professional" | "layout";
  variant: number;
  branchLabel: string;
  mode: string;
  focus: string;
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
  let stopTaskHeartbeat = () => {};
  try {
    const input = await parseMultipartInput(request);
    taskTrace = input.taskTrace || null;
    await recordTaskRunStarted(taskTrace);
    stopTaskHeartbeat = startTaskRunHeartbeat(taskTrace, "设计优化仍在处理：正在分析版式或生成优化方案。");

    const openai = getOpenAI();
    const imageModel = resolveImageModel(input.imageModel, input.model);
    const sourceRatio = await getImageRatio(input.imageBuffer);
    const outputSize = getTargetPixels(sourceRatio, input.quality);
    const outputRatioLabel = `${sourceRatio.width}x${sourceRatio.height}`;
    const analysis = applyManualOverrides(
      await analyzeDesignDraft(openai, input, sourceRatio, outputSize),
      input,
    );
    const variants = designOptimizationVariants();
    const settledOutputs = await Promise.allSettled(
      variants.map((variant) => createDesignOptimizationOutput({
        analysis,
        imageModel,
        input,
        outputRatioLabel,
        outputSize,
        sourceRatio,
        startedAt,
        taskTrace,
        variant,
      })),
    );
    const outputs: Array<Record<string, unknown>> = [];
    for (const result of settledOutputs) {
      if (result.status === "fulfilled") outputs.push(result.value);
    }
    if (!outputs.length) {
      const failed = settledOutputs.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      throw new Error("设计优化没有返回可用方案。");
    }
    await recordTaskRunFinished(taskTrace, { outputs, model: imageModel, message: `设计优化完成，服务端已保存 ${outputs.length} 个正式方案。` });
    return NextResponse.json({ ...taskRunResponseMeta(taskTrace, startedAt, outputs), image: outputs[0], images: outputs, analysis, model: imageModel, imageModel });
  } catch (error) {
    const apiError = toApiError(error, "设计优化失败。");
    await recordTaskRunFailed(taskTrace, apiError.message);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  } finally {
    stopTaskHeartbeat();
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
                "必须像设计总监一样给出可执行优化建议：标题怎么变、人物/产品怎么摆、卖点怎么分组、背景怎么处理、颜色对比怎么加强、哪些元素要删减或弱化。",
                "diagnosis 写原稿具体问题，strategy 写下一步出图必须执行的具体改法，不要写泛泛的“优化质感”。",
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
  variant: DesignOptimizationVariant;
}) {
  return [
    "任务：设计优化。请自行分析输入图并直接输出优化后的最终图片。",
    input.sourcePrompt ? `用户原始要求：${input.sourcePrompt}` : "用户没有额外要求，请根据输入图片自行分析并优化。",
    `目标画布：${input.outputSize.width}×${input.outputSize.height}，保持原图比例。`,
    `优化强度：${designStrengthLabel(input.strength)}。`,
    `当前方案：${input.variant.branchLabel}。${input.variant.focus}`,
    "模型分析参考：",
    `行业/类型/场景：${input.analysis.industry} / ${input.analysis.design_type} / ${input.analysis.scene}`,
    `原稿问题：${(input.analysis.diagnosis || []).join(" | ") || "请根据图片自行判断"}`,
    `优化方向：${(input.analysis.strategy || []).join(" | ") || "请根据图片自行优化版式、层级、质感和可读性"}`,
    "只输出优化后的最终设计图，不要画出对比图、评分卡、分析文本或说明页。",
  ].filter(Boolean).join("\n\n");
}

function designOptimizationVariants(): DesignOptimizationVariant[] {
  return [
    {
      key: "professional",
      variant: 1,
      branchLabel: "方案 1 · 专业设计优化",
      mode: "设计优化 · 专业设计修改",
      focus: [
        "A direction: professional design modification.",
        "Improve the design like a senior commercial designer: cleaner hierarchy, stronger title dominance, better color contrast, more premium lighting/material texture, better subject/product polish, more mature visual details.",
        "Keep the original composition logic recognizable, but make the final artwork clearly more professional and commercially polished.",
      ].join(" "),
    },
    {
      key: "layout",
      variant: 2,
      branchLabel: "方案 2 · 画面排版设计",
      mode: "设计优化 · 画面排版设计",
      focus: [
        "B direction: layout and composition redesign.",
        "Prioritize picture structure, layout rhythm, text grouping, visual flow, margins, safe zones, subject placement, and information block arrangement.",
        "This variant must not just change colors. Rebuild the page layout more visibly while preserving the same core information, subject, brand recognition, and industry.",
      ].join(" "),
    },
  ];
}

async function createDesignOptimizationOutput(input: {
  analysis: DesignOptimizationAnalysis;
  imageModel: string;
  input: DesignOptimizeInput;
  outputRatioLabel: string;
  outputSize: PixelSize;
  sourceRatio: PixelSize;
  startedAt: number;
  taskTrace: TaskRunTrace | null;
  variant: DesignOptimizationVariant;
}) {
  const prompt = buildDesignOptimizationPrompt({
    analysis: input.analysis,
    comparisonMode: "final_only",
    outputSize: input.outputSize,
    quality: input.input.quality,
    sourcePrompt: input.input.prompt,
    strength: input.input.strength,
    variant: input.variant,
  });
  const item = await createDesignOptimizationImage({
    imageBuffer: input.input.imageBuffer,
    imageModel: input.imageModel,
    mimeType: input.input.mimeType,
    outputSize: input.outputSize,
    prompt,
    quality: input.input.quality,
    sourceFileName: input.input.fileName,
    sourceRatio: input.sourceRatio,
    strength: input.input.strength,
    variant: input.variant,
  });
  const raw = await imageResultToBuffer(item.b64_json, item.url);
  const finalPng = await processToExactSize(raw, input.outputSize, "png", "safe_full_bleed");
  const [actual, saved] = await Promise.all([
    readImageMetadata(finalPng),
    saveImageBuffer(finalPng, "png", {
      ratioLabel: input.outputRatioLabel,
      quality: input.input.quality,
      projectId: input.taskTrace?.projectId,
      storageKind: "results",
    }),
  ]);
  const qualityCheck = await inspectImageQuality(saved.path, {
    quality: input.input.quality,
    ratio: input.sourceRatio,
    expectedSize: input.outputSize,
    fileSizeBytes: saved.fileSizeBytes,
    aspectRatio: input.outputRatioLabel,
    operation: "design_optimize",
    protectionContext: buildDesignOptimizationProtectionContext(input.analysis),
  });
  const payload = {
    id: saved.fileName,
    url: saved.url,
    originalUrl: saved.originalUrl,
    thumbnailUrl: saved.thumbnailUrl,
    previewUrl: saved.previewUrl,
    prompt,
    variant: input.variant.variant,
    branchLabel: input.variant.branchLabel,
    ratio: input.sourceRatio,
    mode: input.variant.mode,
    model: input.imageModel,
    aspectRatio: input.outputRatioLabel,
    quality: input.input.quality,
    generatedAt: new Date().toISOString(),
    outputSize: { width: actual.width, height: actual.height },
    expectedOutputSize: input.outputSize,
    qualityCheck,
    fileSizeBytes: saved.fileSizeBytes,
    savedPath: saved.path,
    durationMs: Date.now() - input.startedAt,
    projectId: input.taskTrace?.projectId,
    nodeOperation: "design_optimize",
    sourceCompareUrl: input.input.sourceCompareUrl,
    sourceTaskId: input.taskTrace?.taskId || input.taskTrace?.requestId?.replace(/^req_/, "task_"),
    sourceRequestId: input.taskTrace?.requestId,
    sourceNodeId: input.taskTrace?.nodeId,
    sourceNodeName: input.taskTrace?.nodeName,
    sourceNodeKind: input.taskTrace?.nodeKind,
    designOptimization: {
      strength: input.input.strength,
      comparisonMode: "lightbox_only",
      variant: input.variant.key,
      analysis: input.analysis,
      promptModules: {
        basePrompt: buildBasePrompt(),
        industryPrompt: industryPromptFor(input.analysis.industry),
        designTypePrompt: designTypePromptFor(input.analysis.design_type),
        scenePrompt: scenePromptFor(input.analysis.scene),
        safetyRules: buildSafetyRules(),
        comparisonPrompt: buildComparisonPrompt("final_only"),
      },
    },
  };
  await saveImageMetadata(saved.fileName, payload);
  return payload;
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
  variant: DesignOptimizationVariant;
}) {
  const openai = getOpenAI();
  const sourceFile = await toFile(input.imageBuffer, input.sourceFileName || "design.png", { type: input.mimeType || "image/png" });
  const requestedSize = getOpenAIRequestedSize(input.sourceRatio, input.quality, input.imageModel);
  const response = await runQueuedImageModelRequestWithRetry(
    { label: `${input.variant.mode}/${designStrengthLabel(input.strength)}/${input.imageModel}` },
    () => openai.images.edit({
      model: input.imageModel,
      image: sourceFile,
      prompt: input.prompt,
      size: requestedSize as "1024x1024",
      quality: input.quality === "standard" ? "medium" : "high",
      output_format: "png",
      background: "opaque",
      ...(supportsConfigurableImageInputFidelity(input.imageModel) ? { input_fidelity: input.strength === "conservative" ? "high" as const : "low" as const } : {}),
      n: 1,
    }, imageRequestOptions()),
  );
  const item = response.data?.[0];
  if (!item) throw new Error("设计优化没有返回图片。");
  return item;
}

function buildBasePrompt() {
  return [
    "Professional design optimization task.",
    "Improve an existing finished design while preserving its core information, main subject, brand recognition, and intended communication goal.",
    "Optimize visual hierarchy, typography spacing, alignment, margins, color harmony, focal point, readability, subject texture, lighting, and conversion path.",
    "This is not image enhancement, not upscaling, and not a subtle retouch. The optimized design must be visibly better and clearly different in layout quality, hierarchy, spacing, and commercial polish.",
    "Use the design director analysis below as the execution plan. The image model must implement those optimization suggestions directly.",
    "Keep the original visible copy meaning, brand/person/product identity, and industry, but redraw the design as a refined commercial layout when strength allows it.",
    "If the original draft is already clean, still improve composition, title dominance, information grouping, contrast, breathing room, background depth, and visual focus.",
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
