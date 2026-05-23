import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { toApiError } from "../lib/api-errors.ts";
import { defaultOpenAIConfig, providerPresets } from "../lib/openai-defaults.ts";
import { parseHealthMode, skippedImageCheck } from "../lib/openai-health.ts";

describe("OpenAI defaults", () => {
  it("keeps the official provider aligned with shared defaults", () => {
    const officialProvider = providerPresets.find((provider) => provider.id === "openai");

    assert.equal(officialProvider?.apiBaseUrl, defaultOpenAIConfig.apiBaseUrl);
    assert.equal(officialProvider?.imageModel, defaultOpenAIConfig.imageModel);
    assert.equal(officialProvider?.textModel, defaultOpenAIConfig.textModel);
    assert.equal(officialProvider?.videoModel, defaultOpenAIConfig.videoModel);
  });
});

describe("health mode helpers", () => {
  it("defaults to a quick health check unless full is explicitly requested", () => {
    assert.equal(parseHealthMode(null), "quick");
    assert.equal(parseHealthMode(""), "quick");
    assert.equal(parseHealthMode("image"), "quick");
    assert.equal(parseHealthMode("full"), "full");
  });

  it("marks the image check as skipped for quick tests", () => {
    assert.deepEqual(skippedImageCheck(), {
      ok: true,
      skipped: true,
      message: "图片模型未测试。点击完整测试会真实调用一次图片生成接口。",
    });
  });
});

describe("API error hygiene", () => {
  it("redacts API keys from surfaced provider errors", () => {
    const apiError = toApiError(new Error("model failed with key sk-example-secret-token"), "fallback");

    assert.equal(apiError.message.includes("sk-example-secret-token"), false);
    assert.equal(apiError.message.includes("sk-***"), true);
  });

  it("uses generic wording for blocked requests", () => {
    const apiError = toApiError(new Error("403 Your request was blocked."), "fallback");

    assert.equal(apiError.message.startsWith("请求被安全策略拦截"), true);
    assert.equal(apiError.message.includes("图片请求"), false);
  });
});

describe("HD redraw mode", () => {
  it("keeps HD redraw separate from 4K export in prompt and route code", async () => {
    const [promptSource, routeSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(promptSource.includes("请对输入图片进行高清重绘。严格保持原图整体构图"), true);
    assert.equal(promptSource.includes("不是创意改版、改尺寸、2K/4K 放大"), true);
    assert.equal(promptSource.includes("4K 高清重绘"), false);
    assert.equal(routeSource.includes('task: "hd_redraw"'), true);
    assert.equal(routeSource.includes('nodeOperation: "hd_redraw"'), true);
    assert.equal(routeSource.includes('nodeOperation: "upscale_4k"'), false);
    assert.equal(routeSource.includes("processToTarget"), false);
    assert.equal(routeSource.includes('processToExactSize(raw, outputSize, input.format, "safe_no_crop")'), true);
    assert.equal(routeSource.includes('"center_crop"'), false);
  });

  it("keeps 4K export lossless by default without image generation", async () => {
    const [routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../app/api/upscale-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
    ]);

    assert.equal(routeSource.includes("losslessUpscaleImage"), true);
    assert.equal(routeSource.includes("kernel: sharp.kernel.lanczos3"), true);
    assert.equal(routeSource.includes("usedAi: false"), true);
    assert.equal(routeSource.includes("openai.images.edit"), false);
    assert.equal(routeSource.includes("processToTarget"), false);
    assert.equal(routeSource.includes("processToExactSize"), false);

    assert.equal(workbenchSource.includes("4K无损导出"), true);
    assert.equal(workbenchSource.includes("resolveUpscaleTargetFromParams"), true);
    assert.equal(workbenchSource.includes('fetch("/api/upscale-image"'), true);
    assert.equal(workbenchSource.includes('modeLabel", force4k'), false);
  });
});

describe("Image-to-image creative redesign", () => {
  it("uses creative redesign prompts and two distinct variants for image-to-image", async () => {
    const [promptSource, routeSource, workbenchSource, imageUtilsSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/edit-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(promptSource.includes("请参考输入图片的主题、品牌色、核心文案、Logo、主体形象和重要卖点，重新设计一张新的广告画面。"), true);
    assert.equal(promptSource.includes("本次输出：方案 1，大标题主导方向。"), true);
    assert.equal(promptSource.includes("本次输出：方案 2，主体视觉主导方向。"), true);
    assert.equal(promptSource.includes("差异化：两个方案至少在标题位置、主体位置、卖点排列、背景光效、画面重心中的 3 项不同。"), true);
    assert.equal(promptSource.includes("高清重绘是让原图变清楚；图生图是参考原图重新设计。"), true);
    assert.equal(promptSource.includes("构图：full composition"), true);
    assert.equal(promptSource.includes("complete text/subject visible"), true);
    assert.equal(promptSource.includes("超宽横幅："), true);
    assert.equal(promptSource.includes("垂直中心安全带"), true);

    assert.equal(routeSource.includes('creativeVariant: index === 1 ? "subject" : "headline"'), true);
    assert.equal(routeSource.includes('input_fidelity: (isCreativeImageToImage ? "low" : "high")'), true);
    assert.equal(routeSource.includes("sanitizeLegacyImageToImagePrompt"), true);
    assert.equal(routeSource.includes("IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST"), true);
    assert.equal(routeSource.includes('fitMode === "pad" ? "pad" : "crop"'), true);
    assert.equal(routeSource.includes("isSmartResize"), true);
    assert.equal(routeSource.includes('? "safe_no_crop"'), true);
    assert.equal(routeSource.includes("preparedTargetCanvas"), true);
    assert.equal(routeSource.includes("target-ratio-canvas.png"), true);
    assert.equal(routeSource.includes("buildImageToImageCompositionRetryPrompt"), true);
    assert.equal(routeSource.includes("complete subject/text visible"), true);
    assert.equal(routeSource.includes("tightenImageToImageCompositionRisk"), true);
    assert.equal(routeSource.includes("bottomEdgeRisk"), true);
    assert.equal(routeSource.includes("疑似标题、主体、IP/产品边缘或底部信息贴边/被裁切"), true);
    assert.equal(routeSource.includes("editSafeMarginPercent"), true);
    assert.equal(routeSource.includes("竖版：左右 18%"), true);
    assert.equal(promptSource.includes("中心 76% 安全区"), true);
    assert.equal(workbenchSource.includes("重要元素进中心 76% 安全区"), true);
    assert.equal(imageUtilsSource.includes('"center_crop"'), true);
    assert.equal(imageUtilsSource.includes('"safe_no_crop"'), true);
    assert.equal(imageUtilsSource.includes("buildSafeNoCropCanvas"), true);
    assert.equal(imageUtilsSource.includes("featherInternalForegroundEdges"), true);
    assert.equal(imageUtilsSource.includes("buildContainedExtendedCanvas"), false);
    assert.equal(imageUtilsSource.includes("highQualitySafeCoverCrop"), true);
    assert.equal(imageUtilsSource.includes("selectSafeCropOffset"), true);
    assert.equal(imageUtilsSource.includes("withoutEnlargement: false"), true);
    assert.equal(promptSource.includes("中间原图 + 两侧模糊/磨砂/玻璃补边"), true);
    assert.equal(promptSource.includes("模糊/磨砂/玻璃补边"), true);

    assert.equal(workbenchSource.includes("prompt: IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST"), true);
    assert.equal(workbenchSource.includes("buildCreativeImageToImageConstraintText"), true);
    assert.equal(workbenchSource.includes("参考原图做创意改版。"), true);
    assert.equal(workbenchSource.includes("默认生成两个明显不同的创意改版方向。"), true);
    assert.equal(workbenchSource.includes("compactThumbStyle(singleOutput, 72, 64)"), true);
    assert.equal(workbenchSource.includes('showCheckerboard={shouldShowCheckerboard'), true);
    assert.equal(workbenchSource.includes('style={{ height: "100%", width: "100%" }} variant="thumbnail"'), true);
    assert.equal(workbenchSource.includes("style={{ height: 128 }}"), false);
    assert.equal(workbenchSource.includes("FloatingTaskDock"), false);
    assert.equal(workbenchSource.includes("taskBadgeCount"), true);

    assert.equal(workbenchSource.includes("DesignAssistantPanel"), false);
    assert.equal(workbenchSource.includes("图生图创意改版"), true);
  });
});

describe("Text-to-image references", () => {
  it("supports structured reference images for text-to-image only", async () => {
    const [promptSource, routeSource, workbenchSource, optionsSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/generate-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/design-options.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(optionsSource.includes("export type TextReferenceRole"), true);
    assert.equal(optionsSource.includes("referenceImages?: TextReferenceImage[]"), true);

    assert.equal(promptSource.includes("模式：带参考图的文生图。文字需求为主"), true);
    assert.equal(promptSource.includes("模式：主参考图强约束"), true);
    assert.equal(promptSource.includes("shouldUseStrongTextReferenceMode"), true);
    assert.equal(promptSource.includes("第 1 张锁定版式、配色、构图和节奏"), true);
    assert.equal(promptSource.includes("【参考图角色】"), true);
    assert.equal(promptSource.includes("不要混淆参考图用途"), true);
    assert.equal(promptSource.includes("方案 1，居中构图"), true);
    assert.equal(promptSource.includes("方案 2，左右错位"), true);
    assert.equal(promptSource.includes("full composition"), true);
    assert.equal(promptSource.includes("no cropping"), true);
    assert.equal(promptSource.includes("negative prompt"), true);
    assert.equal(promptSource.includes("中心 76%"), true);
    assert.equal(promptSource.includes("商业设计规则"), true);
    assert.equal(promptSource.includes("Logo 只是品牌识别"), true);
    assert.equal(promptSource.includes("重要文字、Logo、人物、产品、IP、二维码和卖点放在画面中心 76% 内"), true);

    assert.equal(routeSource.includes("referenceManifest"), true);
    assert.equal(routeSource.includes("referenceImage_"), true);
    assert.equal(routeSource.includes("brandAsset_"), true);
    assert.equal(routeSource.includes("readImageInput(formData, `referenceImage_${index}`"), true);
    assert.equal(routeSource.includes("readImageInput(formData, `brandAsset_${index}`"), true);
    assert.equal(routeSource.includes("slice(0, 5)"), true);
    assert.equal(routeSource.includes("index <= 5"), true);
    assert.equal(routeSource.includes('variantDirection: index === 0 ? "stable" : "creative"'), true);
    assert.equal(routeSource.includes("image: referenceFiles as never"), true);
    assert.equal(routeSource.includes("normalizeTextToImageRequest"), true);
    assert.equal(routeSource.includes('const textToImageFitMode = "safe_no_crop"'), true);
    assert.equal(routeSource.includes("\"smart_outpaint\""), false);
    assert.equal(routeSource.includes("shouldRetryTextToImageQuality"), true);
    assert.equal(routeSource.includes("textToImageRiskValue"), true);
    assert.equal(routeSource.includes("attempt <= 2"), true);
    assert.equal(routeSource.includes("textToImageSafeMarginPercent"), true);
    assert.equal(routeSource.includes("tightenTextToImageCompositionRisk"), true);
    assert.equal(routeSource.includes("四周 18% 只放背景/出血装饰"), true);
    assert.equal(routeSource.includes("文生图${worst.name}高对比内容偏多"), true);
    assert.equal(routeSource.includes("qualityCheck.suspectedBlurredPadding"), true);
    assert.equal(routeSource.includes("buildCompositionRetryPrompt"), true);
    assert.equal(routeSource.includes("主体和标题缩小 10%-20%"), true);
    assert.equal(routeSource.includes("模糊/磨砂/玻璃补边"), true);

    assert.equal(workbenchSource.includes("text_to_image: ["), true);
    assert.equal(workbenchSource.includes('text_to_image: [{ id: textReferenceInputHandle, label: "图片参考" }]'), true);
    assert.equal(workbenchSource.includes("maxTextReferenceImages = 5"), true);
    assert.equal(workbenchSource.includes("用户要求 1:1 / 复刻 / 保持版式配色时"), true);
    assert.equal(workbenchSource.includes("TextReferenceInspector"), false);
    assert.equal(workbenchSource.includes("resolveTextReferenceInputs"), true);
    assert.equal(workbenchSource.includes("appendTextReferenceImages"), true);
    assert.equal(workbenchSource.includes("连接到“图片参考”入口的图片作为素材参考参与生成"), true);
  });
});

describe("AI compositing", () => {
  it("turns the old two-image fuse flow into subject-in-scene AI compositing", async () => {
    const [promptSource, routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/fuse-images/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
    ]);

    assert.equal(promptSource.includes("任务类型：AI合成。不是简单融合两张图，而是把图1的主体自然合成到图2的场景里。"), true);
    assert.equal(promptSource.includes("图1 = 主体来源；图2 = 场景来源"), true);
    assert.equal(promptSource.includes("本次输出：方案A，真实自然合成。"), true);
    assert.equal(promptSource.includes("本次输出：方案B，广告设计合成。"), true);
    assert.equal(promptSource.includes("合成要点：大小、位置、透视、接触、遮挡、光向、投影、反射、色温、颗粒、清晰度、边缘和景深一致"), true);

    assert.equal(routeSource.includes('(["natural", "advertising"] as const)'), true);
    assert.equal(routeSource.includes("getImageRatio(second.buffer)"), true);
    assert.equal(routeSource.includes('mode: "AI合成"'), true);
    assert.equal(routeSource.includes("resultItems.slice(0, 2)"), true);
    assert.equal(routeSource.includes('processToTarget(raw, context.ratio, context.quality, "png", "safe_no_crop")'), true);
    assert.equal(routeSource.includes("buildFuseCompositionRetryPrompt"), true);
    assert.equal(routeSource.includes("shouldRetryFuseQuality"), true);

    assert.equal(workbenchSource.includes('label: "AI合成"'), true);
    assert.equal(workbenchSource.includes("图1主体放入图2场景"), true);
    assert.equal(workbenchSource.includes("默认输出两个方案：方案A真实自然合成，方案B广告设计合成。"), true);
    assert.equal(workbenchSource.includes('{ id: "imageA", label: "主体" }'), true);
    assert.equal(workbenchSource.includes('{ id: "imageB", label: "场景" }'), true);
  });
});

describe("Layer output", () => {
  it("generates poster layer output after a selected result and validates transparent text PNG", async () => {
    const [routeSource, workbenchSource, historySource, imageUtilsSource, generatedImagesRoute, projectRoute, taskCenterSource] = await Promise.all([
      readFile(new URL("../app/api/layer-output/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/generated-history.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/generated-images/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/task-center.tsx", import.meta.url), "utf8"),
    ]);

    assert.equal(routeSource.includes("Only repair the transparent area of the mask"), true);
    assert.equal(routeSource.includes("detectTextRegions(image)"), true);
    assert.equal(routeSource.includes("buildTextAlphaMask(image, textRegions)"), true);
    assert.equal(routeSource.includes("exportTransparentText(image, textAlphaMask)"), true);
    assert.equal(routeSource.includes("buildRepairMask(textAlphaMask, image)"), true);
    assert.equal(routeSource.includes("compositeOriginalOutsideMask(original, inpaintResult, repairMask.alpha)"), true);
    assert.equal(routeSource.includes("renderFallbackTextLayer"), false);
    assert.equal(routeSource.includes("buildTextMaskFromGuide"), false);
    assert.equal(routeSource.includes("generateTextLayerWithRetry"), false);
    assert.equal(routeSource.includes("exportTextFull"), true);
    assert.equal(routeSource.includes("repairMask.alpha"), true);
    assert.equal(routeSource.includes("original.png"), true);
    assert.equal(routeSource.includes("background_no_text.png"), true);
    assert.equal(routeSource.includes("text_full.png"), true);
    assert.equal(routeSource.includes("text_alpha_mask.png"), true);
    assert.equal(routeSource.includes("repair_mask.png"), true);
    assert.equal(routeSource.includes("text_cropped.png"), true);
    assert.equal(routeSource.includes("background_first_pass.png"), true);
    assert.equal(routeSource.includes("quality_report.json"), true);
    assert.equal(routeSource.includes("layer-metadata.json"), true);
    assert.equal(routeSource.includes("inspectTextLayerPng"), true);
    assert.equal(routeSource.includes("hasCheckerboardBackground"), true);
    assert.equal(routeSource.includes("hasOpaqueWhiteBackground"), true);
    assert.equal(routeSource.includes("hasOpaqueBlackBackground"), true);
    assert.equal(routeSource.includes("rescueTextAlphaFromRegions"), true);
    assert.equal(routeSource.includes("buildFallbackTextAlphaFromRegions"), true);
    assert.equal(routeSource.includes("prepareTextLayerAlpha"), true);
    assert.equal(routeSource.includes("suppressBackgroundResidueFromTextAlpha"), true);
    assert.equal(routeSource.includes("shouldAnalyzeTextLayoutWithVision"), true);
    assert.equal(routeSource.includes("suspiciousSparseAlpha"), true);
    assert.equal(routeSource.includes("已强制使用 OCR 高清文字重建"), true);
    assert.equal(routeSource.includes("resolveRepairSourceAlpha"), true);
    assert.equal(routeSource.includes("extractAlphaChannel"), true);
    assert.equal(routeSource.includes("prepareBackgroundEditSource"), true);
    assert.equal(routeSource.includes("background-edit-source.png"), true);
    assert.equal(routeSource.includes("tighten_repair_mask_and_retry"), true);
    assert.equal(routeSource.includes("regenerateBackgroundNoText"), true);
    assert.equal(routeSource.includes("autoRetryReferenceBackground"), true);
    assert.equal(routeSource.includes("buildReferenceCompositeMask"), true);
    assert.equal(routeSource.includes("protectNonTextSubjectsInCompositeMask"), true);
    assert.equal(routeSource.includes("protect_original_outside_text_mask"), true);
    assert.equal(routeSource.includes("reference_remake"), true);
    assert.equal(routeSource.includes("无文字背景重生版"), true);
    assert.equal(routeSource.includes("residueCleanupApplied"), true);
    assert.equal(routeSource.includes("likelyTitleText"), true);
    assert.equal(routeSource.includes("已回退为原图像素文字层"), true);
    assert.equal(routeSource.includes("transparentPixelRatio < 0.99998"), true);
    assert.equal(routeSource.includes("无文字背景仍可能有文字残影"), true);

    assert.equal(workbenchSource.includes("LayerOutputPanel"), true);
    assert.equal(workbenchSource.includes("文字 PNG 透明检测失败。"), false);
    assert.equal(workbenchSource.includes("文字识别参考（可选）"), false);
    assert.equal(workbenchSource.includes("runs: sanitizeProjectTasks(tasks)"), true);
    assert.equal(workbenchSource.includes("restoreProjectTasks(stored?.runs || [])"), true);
    assert.equal(workbenchSource.includes("completedTaskCleanupMs"), false);
    assert.equal(workbenchSource.includes("successfulTaskAutoHideMs"), true);
    assert.equal(workbenchSource.includes("resultNodeIds"), true);
    assert.equal(workbenchSource.includes("hasTaskResultNodesOnCanvas"), true);
    assert.equal(taskCenterSource.includes("任务状态"), true);
    assert.equal(taskCenterSource.includes("需要处理"), true);
    assert.equal(taskCenterSource.includes("结果已显示在画布，稍后自动收起"), true);
    assert.equal(workbenchSource.includes("outputNodeTitle"), true);
    assert.equal(projectRoute.includes("runs: Array.isArray(input.runs) ? input.runs : []"), true);
    assert.equal(projectRoute.includes("input.runs.slice(0, 80)"), false);
    assert.equal(projectRoute.includes("runCount: project.runs?.length || 0"), true);
    assert.equal(workbenchSource.includes("canLayerOutput"), true);
    assert.equal(workbenchSource.includes("isLayerOutputTextImage"), true);
    assert.equal(workbenchSource.includes("outputs.some(isLayerOutputTextImage)"), true);
    assert.equal(workbenchSource.includes("开始拆分"), true);
    assert.equal(workbenchSource.includes("原图"), true);
    assert.equal(workbenchSource.includes("无文字背景"), true);
    assert.equal(workbenchSource.includes("文字 PNG"), true);
    assert.equal(workbenchSource.includes("调试信息"), true);
    assert.equal(workbenchSource.includes("调试输出"), false);
    assert.equal(workbenchSource.includes("text_alpha_mask.png"), true);
    assert.equal(workbenchSource.includes("repair_mask.png"), true);
    assert.equal(workbenchSource.includes("onSaveLayerOutputs"), true);
    assert.equal(workbenchSource.includes("saveLayerOutputsToProjectAssets"), true);
    assert.equal(workbenchSource.includes("项目记忆不自动上画"), true);

    assert.equal(historySource.includes("listGeneratedImageFiles"), true);
    assert.equal(imageUtilsSource.includes("readPublicImageUrl"), true);
    assert.equal(imageUtilsSource.includes("generatedDir"), true);
    assert.equal(generatedImagesRoute.includes("isSafeGeneratedRelativePath"), true);
  });
});
