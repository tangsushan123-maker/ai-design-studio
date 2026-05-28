import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { toApiError } from "../lib/api-errors.ts";
import { defaultOpenAIConfig, providerPresets } from "../lib/openai-defaults.ts";
import { buildRuntimeDiagnostics, parseHealthMode, skippedImageCheck } from "../lib/openai-health.ts";
import { buildDeliverySummary, buildQualityReviewSummary, imageSizeLabel, qualityBadgeLabel, qualityDeliveryTone, qualityTone } from "../lib/workbench-delivery.ts";
import { deliveryFileNameForFormat } from "../lib/workbench-downloads.ts";
import { formatDuration, formatFileSize, formatGeneratedAt } from "../lib/workbench-format.ts";
import { historyMatchesFilter, historyMatchesQuery, historySearchText } from "../lib/workbench-history.ts";
import { imageManagerMatchesSearch, imageManagerSearchText } from "../lib/workbench-image-manager.ts";
import { imageSourceDetailLines, imageSourceSummary, shortImageTraceId } from "../lib/workbench-image-source.ts";
import { taskMatchesSearch, taskSearchText } from "../lib/workbench-tasks.ts";

async function readWorkbenchSource() {
  const [clientSource, configSource, nodeCatalogSource, labelSource, imageCollectionSource, composerHelperSource, operationParamSource, textReferenceSource, textReferenceInspectorSource, smartRecommendationsSource, menuSource, pngLayerResultSource, lightboxActionPanelSource, lightboxDeliveryPanelSource, lightboxEditPanelSource, lightboxHeaderSource, lightboxInfoPanelSource, lightboxPreviewPanelSource, lightboxPreviewToolbarSource, lightboxVersionPanelSource, upscaleSource, nodePromptSource, projectHelperSource, promptPolicySource, imageLifecycleSource, nodeUiSource, imageRequestSource, brandContextSource, taskHelperSource, fileActionSource, projectStorageSource, projectCapacitySource, responseSource, errorNoticeSource] = await Promise.all([
    readFile(new URL("../app/workbench-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-node-catalog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-labels.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-image-collection.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-composer-helpers.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-operation-params.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-text-references.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/text-reference-inspector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/smart-recommendations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-menus.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/png-layer-result-section.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-action-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-delivery-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-edit-panels.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-info-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-preview-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-preview-toolbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/lightbox-version-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-upscale.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-node-prompts.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-project-helpers.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-prompt-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-image-lifecycle.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-node-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-image-requests.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-brand-context.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-task-helpers.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-file-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-project-storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-project-capacity.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/workbench-response.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/workbench/node-error-notice.tsx", import.meta.url), "utf8"),
  ]);
  return `${clientSource}\n${configSource}\n${nodeCatalogSource}\n${labelSource}\n${imageCollectionSource}\n${composerHelperSource}\n${operationParamSource}\n${textReferenceSource}\n${textReferenceInspectorSource}\n${smartRecommendationsSource}\n${menuSource}\n${pngLayerResultSource}\n${lightboxActionPanelSource}\n${lightboxDeliveryPanelSource}\n${lightboxEditPanelSource}\n${lightboxHeaderSource}\n${lightboxInfoPanelSource}\n${lightboxPreviewPanelSource}\n${lightboxPreviewToolbarSource}\n${lightboxVersionPanelSource}\n${upscaleSource}\n${nodePromptSource}\n${projectHelperSource}\n${promptPolicySource}\n${imageLifecycleSource}\n${nodeUiSource}\n${imageRequestSource}\n${brandContextSource}\n${taskHelperSource}\n${fileActionSource}\n${projectStorageSource}\n${projectCapacitySource}\n${responseSource}\n${errorNoticeSource}`;
}

describe("OpenAI defaults", () => {
  it("keeps the official provider aligned with shared defaults", () => {
    const officialProvider = providerPresets.find((provider) => provider.id === "openai");

    assert.equal(officialProvider?.apiBaseUrl, defaultOpenAIConfig.apiBaseUrl);
    assert.equal(officialProvider?.imageModel, defaultOpenAIConfig.imageModel);
    assert.equal(officialProvider?.textModel, defaultOpenAIConfig.textModel);
    assert.equal(officialProvider?.videoModel, defaultOpenAIConfig.videoModel);
  });

  it("keeps production preflight available for server deploys", async () => {
    const [packageSource, preflightSource, deploySource, readmeSource, pm2Source] = await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../scripts/preflight.mjs", import.meta.url), "utf8"),
      readFile(new URL("../docs/production-deploy.md", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../ecosystem.config.cjs", import.meta.url), "utf8"),
    ]);

    assert.equal(packageSource.includes('"preflight": "node scripts/preflight.mjs"'), true);
    assert.equal(preflightSource.includes("Node.js is >=20.9.0"), true);
    assert.equal(preflightSource.includes(".env.local exists and OPENAI_API_KEY is set"), true);
    assert.equal(preflightSource.includes("missing .env.local; run cp .env.example .env.local and fill OPENAI_API_KEY"), true);
    assert.equal(preflightSource.includes("OPENAI_API_KEY is empty"), true);
    assert.equal(preflightSource.includes("public/generated is writable"), true);
    assert.equal(preflightSource.includes("Git is not tracking secrets, local data, generated images, or build info"), true);
    assert.equal(preflightSource.includes("git\", [\"ls-files\"]"), true);
    assert.equal(preflightSource.includes("allowedTrackedRuntimeFiles"), true);
    assert.equal(preflightSource.includes("*.tsbuildinfo"), true);
    assert.equal(deploySource.includes("npm run preflight"), true);
    assert.equal(readmeSource.includes("Node.js `>=20.9.0`"), true);
    assert.equal(readmeSource.includes("pm2 start ecosystem.config.cjs"), true);
    assert.equal(readmeSource.includes("pm2 reload ecosystem.config.cjs --update-env"), true);
    assert.equal(readmeSource.includes("docs/production-deploy.md"), true);
    assert.equal(readmeSource.includes("ecosystem.config.cjs"), true);
    assert.equal(deploySource.includes("pm2 logs ai-design-studio --lines 100"), true);
    assert.equal(pm2Source.includes('name: "ai-design-studio"'), true);
    assert.equal(pm2Source.includes('args: "start -H 127.0.0.1 -p 3000"'), true);
    assert.equal(pm2Source.includes('max_memory_restart: "1G"'), true);
    assert.equal(readmeSource.includes("public/generated/*"), true);
  });
});

describe("Workbench delivery helpers", () => {
  it("labels image size and quality states consistently", () => {
    assert.equal(imageSizeLabel({ outputSize: { width: 3840, height: 2160 } }), "3840 × 2160px");
    assert.equal(imageSizeLabel({ ratio: { width: 16, height: 9 } }), "16:9");
    assert.equal(qualityBadgeLabel({ quality: "4k", outputSize: { width: 1536, height: 864 } }), "未达4K");
    assert.equal(qualityBadgeLabel({ qualityCheck: { label: "1536×864px｜建议复查" } }), "建议复查");
    assert.equal(qualityBadgeLabel({ qualityCheck: { status: "white_border" } }), "有白边");
  });

  it("keeps quality tones aligned with delivery severity", () => {
    assert.equal(qualityTone({ qualityCheck: { status: "passed" } }).includes("#74e3c5"), true);
    assert.equal(qualityTone({ qualityCheck: { status: "white_border" } }).includes("#ff6b5f"), true);
    assert.equal(qualityTone({ qualityCheck: { status: "composition_risk" } }).includes("#ffe1a0"), true);
    assert.equal(qualityDeliveryTone("ready").includes("#74e3c5"), true);
    assert.equal(qualityDeliveryTone("not_ready").includes("#ff6b5f"), true);
    assert.equal(qualityDeliveryTone("needs_review").includes("#ffd166"), true);
  });

  it("builds a delivery summary with file, size, status, issues, and prompt", () => {
    const summary = buildDeliverySummary(
      {
        fileName: "poster.png",
        fileSizeBytes: 2048,
        mode: "文生图",
        model: "gpt-image-2",
        prompt: "高端商业海报",
        qualityCheck: {
          issues: ["小字需复查", "二维码需放大确认", "Logo 边缘偏软", "背景略亮"],
        },
      },
      {
        actualSizeLabel: "1536 × 864px",
        expectedSizeLabel: "3840 × 2160px",
        formatFileSize: (bytes) => `${bytes / 1024} KB`,
        qualityLabel: "需复查",
      },
    );

    assert.equal(summary.includes("文件：poster.png"), true);
    assert.equal(summary.includes("尺寸：1536 × 864px"), true);
    assert.equal(summary.includes("目标：3840 × 2160px"), true);
    assert.equal(summary.includes("大小：2 KB"), true);
    assert.equal(summary.includes("模型：gpt-image-2"), true);
    assert.equal(summary.includes("类型：文生图"), true);
    assert.equal(summary.includes("复查项：小字需复查；二维码需放大确认；Logo 边缘偏软"), true);
    assert.equal(summary.includes("背景略亮"), false);
    assert.equal(summary.includes("Prompt：高端商业海报"), true);
  });

  it("builds a concise quality review summary for handoff", () => {
    const summary = buildQualityReviewSummary(
      {
        fileName: "poster.png",
        qualityCheck: {
          actions: ["先做画质增强", "放大检查二维码"],
          clarityCheckLabel: "文字边缘需要复查",
          fourKCheckItems: [
            { label: "尺寸", passed: true, detail: "已达到目标长边" },
            { label: "文字", passed: false, detail: "小字略糊" },
          ],
          issues: ["Logo 边缘偏软"],
          textDetailLabel: "主标题可读，小字需复查",
        },
      },
      {
        actualSizeLabel: "1536 × 864px",
        expectedSizeLabel: "3840 × 2160px",
        qualityLabel: "需复查",
      },
    );

    assert.equal(summary.includes("质检对象：poster.png"), true);
    assert.equal(summary.includes("目标尺寸：3840 × 2160px"), true);
    assert.equal(summary.includes("通过：尺寸（已达到目标长边）"), true);
    assert.equal(summary.includes("复查：文字（小字略糊）"), true);
    assert.equal(summary.includes("复查：Logo 边缘偏软"), true);
    assert.equal(summary.includes("建议：先做画质增强"), true);
  });

  it("normalizes delivery download file names by requested format", () => {
    assert.equal(deliveryFileNameForFormat("generated/poster.png", "jpg"), "poster.jpg");
    assert.equal(deliveryFileNameForFormat("poster.final.webp?cache=1", "png"), "poster.final.png");
    assert.equal(deliveryFileNameForFormat("image_without_extension", "webp"), "image_without_extension.webp");
    assert.equal(deliveryFileNameForFormat(undefined, "png"), "design.png");
  });
});

describe("Workbench format helpers", () => {
  it("formats file sizes for compact UI labels", () => {
    assert.equal(formatFileSize(), "未记录");
    assert.equal(formatFileSize(512), "512 B");
    assert.equal(formatFileSize(2048), "2.0 KB");
    assert.equal(formatFileSize(24 * 1024), "24 KB");
    assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatFileSize(12 * 1024 * 1024), "12 MB");
  });

  it("formats generated time and duration labels", () => {
    assert.equal(formatGeneratedAt(), "未记录");
    assert.equal(formatGeneratedAt("not-a-date"), "not-a-date");
    assert.match(formatGeneratedAt("2026-05-28T10:08:09.000Z"), /^\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(formatDuration(-250), "0 秒");
    assert.equal(formatDuration(59000), "59 秒");
    assert.equal(formatDuration(125000), "2 分 5 秒");
  });
});

describe("Workbench history search", () => {
  it("filters project history by date and favorite state", () => {
    const image = {
      favorite: true,
      generatedAt: "2026-05-27T08:00:00.000Z",
      projectId: "project-a",
    };
    const now = new Date("2026-05-27T12:00:00.000Z");

    assert.equal(historyMatchesFilter(image, "项目", "project-a", now), true);
    assert.equal(historyMatchesFilter(image, "收藏", "project-a", now), true);
    assert.equal(historyMatchesFilter(image, "今日", "project-a", now), true);
    assert.equal(historyMatchesFilter(image, "项目", "project-b", now), false);
  });

  it("searches delivery state, source trace, model, prompt, and quality issues", () => {
    const image = {
      aspectRatio: "16:9",
      fileName: "campaign/poster.png",
      id: "img_001",
      materialCopy: "暑期活动主视觉",
      mode: "文生图",
      model: "gpt-image-2",
      outputSize: { width: 1536, height: 864 },
      projectId: "project-a",
      prompt: "高端商业海报",
      quality: "4k",
      qualityCheck: {
        actions: ["重新生成：增加安全边距"],
        clarityCheckLabel: "细节密度偏低",
        deliverability: "not_ready",
        fourKCheckItems: [{ label: "4K 尺寸", detail: "长边不足 3840", passed: false }],
        importantContentLabel: "重要信息待核对",
        issues: ["Logo 边缘偏软"],
        status: "white_border",
        textDetailLabel: "小字和二维码需放大复查",
      },
      sourceNodeName: "主视觉节点",
      sourceRequestId: "req_abcdef123456",
      targetSize: "长边3840",
    };

    assert.equal(historyMatchesQuery(image, "gpt-image-2"), true);
    assert.equal(historyMatchesQuery(image, "主视觉节点"), true);
    assert.equal(historyMatchesQuery(image, "Logo 边缘"), true);
    assert.equal(historyMatchesQuery(image, "不可交付"), true);
    assert.equal(historyMatchesQuery(image, "质检未过"), true);
    assert.equal(historyMatchesQuery(image, "质量异常"), true);
    assert.equal(historyMatchesQuery(image, "白边"), true);
    assert.equal(historyMatchesQuery(image, "安全边距"), true);
    assert.equal(historyMatchesQuery(image, "细节密度"), true);
    assert.equal(historyMatchesQuery(image, "4K 尺寸"), true);
    assert.equal(historyMatchesQuery(image, "二维码需放大复查"), true);
    assert.equal(historyMatchesQuery(image, "重要信息"), true);
    assert.equal(historyMatchesQuery(image, "1536 × 864px"), true);
    assert.equal(historySearchText(image).includes("abcdef123456"), true);
    assert.equal(historyMatchesQuery({ ...image, qualityCheck: { status: "composition_risk" } }, "主体贴边"), true);
    assert.equal(historyMatchesQuery({ ...image, qualityCheck: { status: "blurred_padding" } }, "模糊补边"), true);
    assert.equal(historyMatchesQuery({ ...image, qualityCheck: { status: "suspected_stretch" } }, "只是放大"), true);
  });
});

describe("Workbench history panel actions", () => {
  it("requires confirmation before deleting a history image", async () => {
    const historyPanelSource = await readFile(new URL("../components/workbench/history-panel.tsx", import.meta.url), "utf8");

    assert.equal(historyPanelSource.includes("confirmDeleteKey"), true);
    assert.equal(historyPanelSource.includes("再点一次删除，确认移入回收站。"), true);
    assert.equal(historyPanelSource.includes("确认删除图片"), true);
    assert.equal(historyPanelSource.includes("再次点击确认删除"), true);
  });
});

describe("Workbench image manager search", () => {
  it("searches image metadata and protection state", () => {
    const image = {
      fileName: "generated/poster.png",
      id: "img_001",
      mode: "文生图",
      nodeOperation: "text_to_image",
      prompt: "高端活动海报",
      qualityCheck: {
        actions: ["重新生成：增加安全边距"],
        clarityCheckLabel: "细节密度偏低",
        deliverability: "not_ready",
        fourKCheckItems: [{ label: "4K 尺寸", detail: "长边不足 3840", passed: false }],
        importantContentLabel: "重要信息待核对",
        issues: ["Logo 边缘偏软"],
        status: "white_border",
        textDetailLabel: "小字和二维码需放大复查",
      },
      sourceNodeName: "主视觉节点",
      sourceRequestId: "req_search_123456",
    };
    const protection = {
      canDelete: false,
      isFavorite: true,
      isLayerPack: false,
      isProjectAsset: true,
      isTrashed: false,
      protected: true,
      reasons: ["收藏", "项目素材"],
      usedByNodeNames: ["文生图"],
      usedByNodes: 1,
    };
    const operationLabel = (value) => value === "text_to_image" ? "文生图" : value || "";

    assert.equal(imageManagerMatchesSearch(image, protection, "poster", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "主视觉节点", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "项目素材", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "节点引用", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "受保护", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "不可交付", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "质检未过", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "未通过", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "白边", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "安全边距", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "二维码需放大复查", operationLabel), true);
    assert.equal(imageManagerMatchesSearch(image, protection, "4K 尺寸", operationLabel), true);
    assert.equal(imageManagerSearchText(image, protection, operationLabel).includes("req_search_123456"), true);
    assert.equal(imageManagerMatchesSearch({ ...image, qualityCheck: { status: "composition_risk" } }, protection, "安全边距不足", operationLabel), true);
    assert.equal(imageManagerMatchesSearch({ ...image, qualityCheck: { status: "blurred_padding" } }, protection, "边缘模糊", operationLabel), true);
    assert.equal(imageManagerMatchesSearch({ ...image, qualityCheck: { status: "suspected_stretch" } }, protection, "细节密度低", operationLabel), true);
  });

  it("searches cleanup and trash aliases", () => {
    const cleanableProtection = {
      canDelete: true,
      isFavorite: false,
      isLayerPack: true,
      isProjectAsset: false,
      isTrashed: false,
      protected: false,
      reasons: [],
      usedByNodeNames: [],
      usedByNodes: 0,
    };
    const trashedProtection = { ...cleanableProtection, canDelete: true, isLayerPack: false, isTrashed: true };

    assert.equal(imageManagerMatchesSearch({ id: "layer_pack" }, cleanableProtection, "可清理"), true);
    assert.equal(imageManagerMatchesSearch({ id: "layer_pack" }, cleanableProtection, "png三层"), true);
    assert.equal(imageManagerMatchesSearch({ id: "deleted" }, trashedProtection, "回收站"), true);
    assert.equal(imageManagerMatchesSearch({ id: "deleted" }, trashedProtection, "已删除"), true);
  });
});

describe("Workbench image source trace", () => {
  it("builds compact source summaries with request fallback", () => {
    const image = {
      nodeOperation: "text_to_image",
      sourceNodeName: "主视觉节点",
      sourceRequestId: "req_abcdef123456",
    };
    const labelForOperation = (value) => value === "text_to_image" ? "文生图" : value || "";

    assert.equal(imageSourceSummary(image, labelForOperation), "主视觉节点 · 请求 cdef123456");
    assert.equal(imageSourceSummary({ sourceStrategyTitle: "项目历史结果" }, labelForOperation), "项目历史结果");
    assert.equal(imageSourceSummary({}, labelForOperation), "来源未记录");
  });

  it("builds source detail lines for delivery inspection", () => {
    const lines = imageSourceDetailLines(
      {
        durationMs: 125000,
        generatedAt: "2026-05-28T10:00:00.000Z",
        sourceNodeId: "node_text_to_image_main",
        sourceNodeKind: "text_to_image",
        sourceNodeName: "主视觉节点",
        sourceRequestId: "req_abcdef123456",
        sourceTaskId: "task_taskid123456",
      },
      {
        formatDuration: (milliseconds) => `${Math.round(milliseconds / 1000)} 秒`,
        formatGeneratedAt: (value) => `时间 ${value}`,
        labelForOperation: (value) => value === "text_to_image" ? "文生图" : value || "",
      },
    );

    assert.deepEqual(lines, [
      { label: "来源节点", value: "主视觉节点 · 文生图" },
      { label: "节点ID", value: "image_main" },
      { label: "任务ID", value: "skid123456" },
      { label: "请求ID", value: "cdef123456" },
      { label: "耗时", value: "125 秒" },
      { label: "生成时间", value: "时间 2026-05-28T10:00:00.000Z" },
    ]);
  });

  it("shortens trace ids consistently", () => {
    assert.equal(shortImageTraceId("req_abcdef123456"), "cdef123456");
    assert.equal(shortImageTraceId("task_short"), "short");
    assert.equal(shortImageTraceId("node_123456789012345"), "6789012345");
  });
});

describe("Workbench node result panel", () => {
  it("surfaces quality review actions directly on result thumbnails", async () => {
    const nodeResultsSource = await readFile(new URL("../components/workbench/node-results-panel.tsx", import.meta.url), "utf8");

    assert.equal(nodeResultsSource.includes("actions?: string[]"), true);
    assert.equal(nodeResultsSource.includes("const firstAction = image.qualityCheck?.actions?.[0]"), true);
    assert.equal(nodeResultsSource.includes("建议：{firstAction}"), true);
    assert.equal(nodeResultsSource.includes("line-clamp-1 px-1 text-[11px] text-[#ffe1a0]/76"), true);
    assert.equal(nodeResultsSource.includes("rounded-[10px] border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px]"), true);
  });
});

describe("Workbench task search", () => {
  it("searches task metadata, request ids, errors, and result images", () => {
    const task = {
      error: "API timeout from upstream",
      id: "task_001",
      model: "gpt-image-2",
      nodeName: "主视觉节点",
      outputs: [{
        fileName: "result/poster.png",
        mode: "文生图",
        qualityCheck: {
          actions: ["重新生成：增加安全边距"],
          deliverability: "not_ready",
          fourKCheckItems: [{ label: "4K 尺寸", detail: "长边不足 3840", passed: false }],
          issues: ["Logo 边缘偏软"],
          status: "white_border",
          textDetailLabel: "小字和二维码需放大复查",
        },
        url: "/generated/poster.png",
      }],
      progressLabel: "模型仍在生成",
      projectName: "活动项目",
      requestId: "req_task_search_123456",
      status: "failed",
      targetSize: "长边3840",
      type: "text_to_image",
    };

    assert.equal(taskMatchesSearch(task, "主视觉节点"), true);
    assert.equal(taskMatchesSearch(task, "gpt-image-2"), true);
    assert.equal(taskMatchesSearch(task, "timeout"), true);
    assert.equal(taskMatchesSearch(task, "可重试"), true);
    assert.equal(taskMatchesSearch(task, "poster.png"), true);
    assert.equal(taskMatchesSearch(task, "不可交付"), true);
    assert.equal(taskMatchesSearch(task, "质检未过"), true);
    assert.equal(taskMatchesSearch(task, "未通过"), true);
    assert.equal(taskMatchesSearch(task, "白边"), true);
    assert.equal(taskMatchesSearch(task, "安全边距"), true);
    assert.equal(taskMatchesSearch(task, "二维码需放大复查"), true);
    assert.equal(taskMatchesSearch(task, "4K 尺寸"), true);
    assert.equal(taskSearchText(task).includes("req_task_search_123456"), true);
  });

  it("searches localized task status aliases", () => {
    const queued = {
      id: "task_queue",
      nodeName: "排队节点",
      status: "queued",
      type: "text_to_image",
    };
    const completed = {
      backendRunState: "finished",
      id: "task_done",
      nodeName: "完成节点",
      result: { url: "/generated/done.png" },
      status: "completed",
      type: "text_to_image",
    };

    assert.equal(taskMatchesSearch(queued, "待执行"), true);
    assert.equal(taskMatchesSearch(completed, "已完成"), true);
    assert.equal(taskMatchesSearch(completed, "有结果"), true);
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

  it("exposes safe runtime diagnostics for deployment checks", async () => {
    const [routeSource, deploySource] = await Promise.all([
      readFile(new URL("../app/api/health-openai/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../docs/production-deploy.md", import.meta.url), "utf8"),
    ]);
    const diagnostics = buildRuntimeDiagnostics();

    assert.equal(typeof diagnostics.nodeVersion, "string");
    assert.equal(diagnostics.runtime, "nodejs");
    assert.match(diagnostics.serverTime, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(routeSource.includes("diagnostics: buildRuntimeDiagnostics()"), true);
    assert.equal(routeSource.includes("const [textResult, imageResult, videoResult] = await Promise.all"), true);
    assert.equal(routeSource.includes('mode === "full" ? testConfiguredModel("image", imageModel) : Promise.resolve(null)'), true);
    assert.equal(routeSource.includes("const textResult = await testConfiguredModel"), false);
    assert.equal(deploySource.includes("diagnostics.nodeVersion"), true);
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

describe("Settings model management", () => {
  it("guards model row actions with busy and delete confirmation states", async () => {
    const [settingsSource, settingsModelGroupSource, settingsUtilsSource, settingsRouteSource, modelsManageSource, modelsRefreshSource, modelsTestSource, providersDetectSource, providerDetectorSource] = await Promise.all([
      readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/settings/settings-model-group.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/settings/settings-page-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/models/manage/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/models/refresh/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/models/test/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/providers/detect/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/provider-detector.ts", import.meta.url), "utf8"),
    ]);
    const settingsUiSource = `${settingsSource}\n${settingsModelGroupSource}`;

    assert.equal(settingsSource.includes("settingsRequestFailure"), true);
    assert.equal(settingsSource.includes("readSettingsJson"), true);
    assert.equal(settingsSource.includes("data.message || data.error || (response.ok ? \"检测完成\" : \"检测失败\")"), true);
    assert.equal(settingsSource.includes("读取配置失败"), true);
    assert.equal(settingsSource.includes("保存配置失败"), true);
    assert.equal(settingsSource.includes("检测失败"), true);
    assert.equal(settingsSource.includes("测试失败"), true);
    assert.equal(settingsUiSource.includes("activeModelAction"), true);
    assert.equal(settingsSource.includes("disabled={isBusy}"), true);
    assert.equal(settingsSource.includes("disabled={isBusy || !advancedUrl}"), true);
    assert.equal(settingsSource.includes("isBusy={isBusy}"), true);
    assert.equal(settingsUiSource.includes("disabled={isBusy || Boolean(activeModelAction)}"), true);
    assert.equal(settingsUiSource.includes("confirmDeleteId"), true);
    assert.equal(settingsUiSource.includes("runModelAction"), true);
    assert.equal(settingsUiSource.includes("测试中"), true);
    assert.equal(settingsUiSource.includes("保存中"), true);
    assert.equal(settingsUiSource.includes("删除中"), true);
    assert.equal(settingsUiSource.includes("确认删"), true);
    assert.equal(settingsSource.includes("serverHealth"), true);
    assert.equal(settingsSource.includes("reloadServerHealth"), true);
    assert.equal(settingsSource.includes("刷新服务器诊断"), true);
    assert.equal(settingsUtilsSource.includes("nodeRuntimeStatus"), true);
    assert.equal(settingsUtilsSource.includes("已满足 >=20.9"), true);
    assert.equal(settingsUtilsSource.includes("需升级到 >=20.9"), true);
    assert.equal(settingsUiSource.includes("apple-status-success rounded-full border px-2 py-0.5 text-[11px]"), true);
    assert.equal(settingsUiSource.includes("apple-status-danger rounded-full border px-2 py-0.5 text-[11px]"), true);
    assert.equal(settingsUiSource.includes("apple-pill-accent px-2 py-0.5 text-[11px]"), true);
    assert.equal(settingsUiSource.includes("apple-pill px-2 py-1 text-[10px]"), false);
    assert.equal(settingsUtilsSource.includes("healthKeyLabel"), true);
    assert.equal(settingsUtilsSource.includes("formatServerTime"), true);
    assert.equal(settingsRouteSource.includes("settingsErrorMessage"), true);
    assert.equal(settingsRouteSource.includes("parseSettingsPayload"), true);
    assert.equal(settingsRouteSource.includes("InvalidSettingsPayloadError"), true);
    assert.equal(settingsRouteSource.includes("配置 JSON 无法解析"), true);
    assert.equal(settingsRouteSource.includes("{ status: 400 }"), true);
    assert.equal(settingsRouteSource.includes("Array.isArray(body.modelsCache) ? body.modelsCache : currentLocal.modelsCache"), true);
    assert.equal(settingsSource.includes("modelsCache: overrides?.modelsCache ?? modelsCache"), true);
    assert.equal(settingsSource.includes("supportsImageGeneration"), true);
    assert.equal(providersDetectSource.includes("const result = await detectProvider({"), true);
    assert.equal(providersDetectSource.includes("save: Boolean(body.save)"), true);
    assert.equal(providersDetectSource.includes("groupModels"), false);
    assert.equal(providerDetectorSource.includes("function groupModels"), true);
    assert.equal(providerDetectorSource.includes("models.forEach((model) => {"), true);
    assert.equal(providerDetectorSource.includes('models.filter((model) => model.capabilities.includes("text"))'), false);
    assert.equal(modelsManageSource.includes("modelManageErrorMessage"), true);
    assert.equal(modelsManageSource.includes("parseModelManagePayload"), true);
    assert.equal(modelsManageSource.includes("InvalidModelManagePayloadError"), true);
    assert.equal(modelsManageSource.includes("模型保存 JSON 无法解析"), true);
    assert.equal(modelsManageSource.includes("模型删除 JSON 无法解析"), true);
    assert.equal(modelsManageSource.includes('modelManageErrorMessage("模型保存失败", error)'), true);
    assert.equal(modelsManageSource.includes('modelManageErrorMessage("模型删除失败", error)'), true);
    assert.equal(modelsRefreshSource.includes("modelRouteErrorMessage"), true);
    assert.equal(modelsRefreshSource.includes('modelRouteErrorMessage("刷新模型列表失败", error)'), true);
    assert.equal(modelsTestSource.includes("modelTestRouteErrorMessage"), true);
    assert.equal(modelsTestSource.includes("parseModelTestPayload"), true);
    assert.equal(modelsTestSource.includes("InvalidModelTestPayloadError"), true);
    assert.equal(modelsTestSource.includes("模型测试 JSON 无法解析"), true);
    assert.equal(modelsTestSource.includes('modelTestRouteErrorMessage("模型测试失败", error)'), true);
    assert.equal(providersDetectSource.includes("parseProviderDetectPayload"), true);
    assert.equal(providersDetectSource.includes("InvalidProviderDetectPayloadError"), true);
    assert.equal(providersDetectSource.includes("自动检测 JSON 无法解析"), true);
  });
});

describe("Image size requests", () => {
  it("requests native gpt-image-2 standard sizes for common ratios", async () => {
    const [imageUtilsSource, sizePresetsSource] = await Promise.all([
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/size-presets.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(imageUtilsSource.includes("getOpenAIConstrainedTargetPixels"), true);
    assert.equal(imageUtilsSource.includes("8_294_400"), true);
    assert.equal(imageUtilsSource.includes("floorToMultipleOf16"), true);
    assert.equal(imageUtilsSource.includes("clampRatioForGptImage2"), true);
    assert.equal(imageUtilsSource.includes('return getOpenAIImageSize(ratio);'), true);
    assert.equal(sizePresetsSource.includes("const presetsByCategory = new Map"), true);
    assert.equal(sizePresetsSource.includes("sizePresets.filter((preset) => preset.category === category.id)"), false);
  });
});

describe("Generated image serving", () => {
  it("uses conditional cache headers to avoid rereading unchanged images", async () => {
    const [routeSource, cacheSource] = await Promise.all([
      readFile(new URL("../app/generated/[...path]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/http-file-cache.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(routeSource.includes("fileCacheHeaders(fileStat"), true);
    assert.equal(routeSource.includes("requestMatchesFileCache(request"), true);
    assert.equal(cacheSource.includes('request.headers.get("if-none-match")'), true);
    assert.equal(cacheSource.includes('request.headers.get("if-modified-since")'), true);
    assert.equal(routeSource.includes("status: 304"), true);
    assert.equal(cacheSource.includes('"Content-Length": String(fileStat.size)'), true);
    assert.equal(cacheSource.includes('"Last-Modified": fileStat.mtime.toUTCString()'), true);
  });

  it("serves previews with cheap existence checks and conditional cache hits", async () => {
    const [previewRouteSource, imageUtilsSource, cacheSource] = await Promise.all([
      readFile(new URL("../app/api/image-preview/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/http-file-cache.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(imageUtilsSource.includes("stat(variantPath).then((fileStat) => fileStat.isFile())"), true);
    assert.equal(imageUtilsSource.includes("readFile(variantPath).then(() => true)"), false);
    assert.equal(previewRouteSource.includes('fileCacheHeaders(fileStat, "image/webp", "public, max-age=31536000, immutable", "preview")'), true);
    assert.equal(previewRouteSource.includes("requestMatchesFileCache(request"), true);
    assert.equal(cacheSource.includes('request.headers.get("if-none-match")'), true);
    assert.equal(previewRouteSource.includes("status: 304"), true);
    assert.equal(cacheSource.includes('"Cache-Control": cacheControl'), true);
  });

  it("coalesces concurrent preview variant builds", async () => {
    const imageUtilsSource = await readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8");

    assert.equal(imageUtilsSource.includes("const imageVariantBuilds = new Map"), true);
    assert.equal(imageUtilsSource.includes("const pending = imageVariantBuilds.get(variantPath)"), true);
    assert.equal(imageUtilsSource.includes("if (pending) return pending"), true);
    assert.equal(imageUtilsSource.includes("imageVariantBuilds.set(variantPath, build)"), true);
    assert.equal(imageUtilsSource.includes("imageVariantBuilds.delete(variantPath)"), true);
    assert.equal(imageUtilsSource.includes("async function buildImageVariant"), true);
  });

  it("does not block image responses on preview variant generation", async () => {
    const imageUtilsSource = await readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8");

    assert.equal(imageUtilsSource.includes("void ensureImageVariants(fileName, buffer).catch(() => null)"), true);
    assert.equal(imageUtilsSource.includes("const variants = {"), true);
    assert.equal(imageUtilsSource.includes('thumbnailUrl: getImageVariantApiUrl(publicUrl, "thumbnail")'), true);
    assert.equal(imageUtilsSource.includes('previewUrl: getImageVariantApiUrl(publicUrl, "preview")'), true);
    assert.equal(imageUtilsSource.includes("const variants = await ensureImageVariants"), false);
    assert.equal(imageUtilsSource.includes("getImageVariantUrl("), false);
  });

  it("reuses saved buffer sizes instead of restatting generated files", async () => {
    const saveRoutes = [
      "../app/api/generate-image/route.ts",
      "../app/api/edit-image/route.ts",
      "../app/api/fuse-images/route.ts",
      "../app/api/reference-remake/route.ts",
      "../app/api/redraw-upscale-image/route.ts",
      "../app/api/design-optimize/route.ts",
      "../app/api/mask-edit-image/route.ts",
    ];
    const [imageUtilsSource, ...routeSources] = await Promise.all([
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
      ...saveRoutes.map((routePath) => readFile(new URL(routePath, import.meta.url), "utf8")),
    ]);
    const combinedRouteSource = routeSources.join("\n");

    assert.equal(imageUtilsSource.includes("fileSizeBytes: buffer.byteLength"), true);
    assert.equal(combinedRouteSource.includes("stat(saved.path)"), false);
    assert.equal(combinedRouteSource.includes("savedStat.size"), false);
    assert.equal(combinedRouteSource.includes("comparisonStat.size"), false);
    assert.equal(combinedRouteSource.includes("fileSizeBytes: saved.fileSizeBytes"), true);
  });

  it("checks generated image restore conflicts without reading image files", async () => {
    const generatedImagesRouteSource = await readFile(new URL("../app/api/generated-images/route.ts", import.meta.url), "utf8");

    assert.equal(generatedImagesRouteSource.includes("rename(sourceImagePath, restoredImagePath)"), true);
    assert.equal(generatedImagesRouteSource.includes("return (await stat(filePath)).isFile()"), true);
    assert.equal(generatedImagesRouteSource.includes("await readFile(filePath);"), false);
    assert.equal(generatedImagesRouteSource.includes("readJsonWithBackup<unknown>(metadataPath, {})"), true);
    assert.equal(generatedImagesRouteSource.includes('readFile(metadataPath, "utf8")'), false);
    assert.equal(generatedImagesRouteSource.includes("JSON.parse(raw)"), false);
  });

  it("reuses generated image metadata already loaded for permission checks", async () => {
    const generatedImagesRouteSource = await readFile(new URL("../app/api/generated-images/route.ts", import.meta.url), "utf8");

    assert.equal(generatedImagesRouteSource.includes("restoreGeneratedImage(fileName, current)"), true);
    assert.equal(generatedImagesRouteSource.includes("moveGeneratedImageToTrash(fileName, current)"), true);
    assert.equal(generatedImagesRouteSource.includes("async function restoreGeneratedImage(fileName: string, current: Record<string, unknown>)"), true);
    assert.equal(generatedImagesRouteSource.includes("async function moveGeneratedImageToTrash(fileName: string, current: Record<string, unknown>)"), true);
    assert.equal(generatedImagesRouteSource.includes("await Promise.all([\n        unlink(imagePath).catch(() => {}),\n        unlink(metadataPath).catch(() => {}),\n      ])"), true);
    assert.equal(generatedImagesRouteSource.includes("const current = await readGeneratedMetadata(sourceMetadataPath)"), false);
  });
});

describe("Local JSON storage", () => {
  it("avoids duplicate sync existence checks when reading config files", async () => {
    const [storeSource, configSource] = await Promise.all([
      readFile(new URL("../lib/local-json-store.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/local-config.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(storeSource.includes("readJsonWithBackupSync"), true);
    assert.equal(storeSource.includes("readFileSync(filePath"), true);
    assert.equal(storeSource.includes("existsSync"), false);
    assert.equal(configSource.includes("function readActiveLocalConfig"), true);
    assert.equal(configSource.includes("function normalizeLocalConfig"), true);
    assert.equal(configSource.includes("return normalizeLocalConfig(readActiveLocalConfig())"), true);
    assert.equal(configSource.includes("function configPathForUser"), true);
    assert.equal(configSource.includes("function normalizeModelCache"), true);
    assert.equal(configSource.includes("modelsCache: normalizeModelCache(parsed.modelsCache)"), true);
    assert.equal(configSource.includes("const normalizedModelCache = input.modelsCache === undefined ? null : normalizeModelCache(input.modelsCache)"), true);
    assert.equal(configSource.includes("input.modelsCache.filter(isModelCatalogItem).length"), false);
  });
});

describe("TypeScript quality gates", () => {
  it("keeps unused code checks enabled in the default typecheck", async () => {
    const tsconfigSource = await readFile(new URL("../tsconfig.json", import.meta.url), "utf8");
    const tsconfig = JSON.parse(tsconfigSource);

    assert.equal(tsconfig.compilerOptions.strict, true);
    assert.equal(tsconfig.compilerOptions.noUnusedLocals, true);
    assert.equal(tsconfig.compilerOptions.noUnusedParameters, true);
  });
});

describe("Bounded local IO", () => {
  it("limits multi-account JSON reads with a shared concurrency helper", async () => {
    const [asyncUtilsSource, generatedHistorySource, adminAccountsSource, materialLibrariesSource, projectRouteSource, brandReferenceSource, editRouteSource, fuseRouteSource, redrawRouteSource, maskEditRouteSource] = await Promise.all([
      readFile(new URL("../lib/async-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/generated-history.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/accounts/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/material-libraries/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/brand-reference-images.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/edit-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/fuse-images/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/mask-edit-image/route.ts", import.meta.url), "utf8"),
    ]);
    const brandReferenceRouteSource = `${editRouteSource}\n${fuseRouteSource}\n${redrawRouteSource}\n${maskEditRouteSource}`;

    assert.equal(asyncUtilsSource.includes("export async function mapWithConcurrency"), true);
    assert.equal(generatedHistorySource.includes('import { mapWithConcurrency } from "./async-utils"'), true);
    assert.equal(brandReferenceSource.includes('import { mapWithConcurrency } from "./async-utils"'), true);
    assert.equal(brandReferenceSource.includes("brandReferenceInputReadConcurrency = 3"), true);
    assert.equal(brandReferenceSource.includes("mapWithConcurrency("), true);
    assert.equal(brandReferenceSource.includes("Promise.all("), false);
    assert.equal(brandReferenceRouteSource.match(/readBrandReferenceImages\(formData\)/g)?.length, 4);
    assert.equal(brandReferenceRouteSource.includes("async function readBrandReferenceImage"), false);
    assert.equal(adminAccountsSource.includes("accountSummaryReadConcurrency = 8"), true);
    assert.equal(adminAccountsSource.includes("mapWithConcurrency(users, accountSummaryReadConcurrency"), true);
    assert.equal(adminAccountsSource.includes("const [projectStats, config] = await Promise.all"), true);
    assert.equal(adminAccountsSource.includes('user.role === "owner" && !scopedKey'), true);
    assert.equal(adminAccountsSource.includes("readJsonWithBackup"), true);
    assert.equal(adminAccountsSource.includes("async function readJsonFile"), false);
    assert.equal(materialLibrariesSource.includes("projectLibraryReadConcurrency = 8"), true);
    assert.equal(materialLibrariesSource.includes("mapWithConcurrency(users, projectLibraryReadConcurrency"), true);
    assert.equal(materialLibrariesSource.includes("createSharedRootProjectStoreLoader"), true);
    assert.equal(materialLibrariesSource.includes("pending ||= readRootProjectStore()"), true);
    assert.equal(materialLibrariesSource.includes("readProjectLibraries(user.id, loadRootProjectStore)"), true);
    assert.equal(projectRouteSource.includes("ownerProjectStoreReadConcurrency = 8"), true);
    assert.equal(projectRouteSource.includes("mapWithConcurrency("), true);
    assert.equal(projectRouteSource.includes('import { readJsonWithBackup, writeJsonAtomic } from "@/lib/local-json-store"'), true);
    assert.equal(projectRouteSource.includes("readJsonWithBackup<ProjectStore | null>(filePath, null)"), true);
    assert.equal(projectRouteSource.includes("readJsonWithBackup<StoredProject | null>(filePath, null)"), true);
    assert.equal(projectRouteSource.includes('readFile(filePath, "utf-8")'), false);
    assert.equal(projectRouteSource.includes("rootProjectsBackupPath"), false);
    assert.equal(projectRouteSource.includes("rootLegacyProjectBackupPath"), false);
    assert.equal(projectRouteSource.includes("readProjectStoreFile(`${scopedProjectsPath}.bak`)"), false);
    assert.equal(projectRouteSource.includes("readProjectFile(`${scopedLegacyProjectPath}.bak`)"), false);
    assert.equal(adminAccountsSource.includes("Promise.all(users.map"), false);
    assert.equal(materialLibrariesSource.includes("Promise.all(users.map"), false);
    assert.equal(projectRouteSource.includes("Promise.all(\n    orderedUsers.map"), false);
  });
});

describe("Remote image import security", () => {
  it("blocks local and private image URLs before server-side fetches", async () => {
    const routeSource = await readFile(new URL("../app/api/import-image/route.ts", import.meta.url), "utf8");

    assert.equal(routeSource.includes('import { lookup } from "node:dns/promises"'), true);
    assert.equal(routeSource.includes('import { isIP } from "node:net"'), true);
    assert.equal(routeSource.includes("fetchAllowedImageUrl"), true);
    assert.equal(routeSource.includes("assertPublicHttpImageUrl"), true);
    assert.equal(routeSource.includes("parseImportImagePayload"), true);
    assert.equal(routeSource.includes("InvalidImportImagePayloadError"), true);
    assert.equal(routeSource.includes("导入图片 JSON 无法解析"), true);
    assert.equal(routeSource.includes("parseImageUrl"), true);
    assert.equal(routeSource.includes("normalizeHostname"), true);
    assert.equal(routeSource.includes("redirect: \"manual\""), true);
    assert.equal(routeSource.includes("isPrivateAddress"), true);
    assert.equal(routeSource.includes("不支持导入本机或内网图片链接"), true);
  });
});

describe("Quality enhance mode", () => {
  it("unifies HD redraw and 4K output into quality enhancement modes", async () => {
    const [promptSource, routeSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(promptSource.includes("AI 画质增强流程：以输入图片为唯一事实来源"), true);
    assert.equal(promptSource.includes("Task: high-fidelity image enhancement and 4K-ready restoration"), true);
    assert.equal(promptSource.includes("画质模式：Standard / 文字优先高清修复"), true);
    assert.equal(promptSource.includes("画质模式：Plus / 图文双清晰增强"), true);
    assert.equal(promptSource.includes("画质模式：Creative / 质感高清重绘"), true);
    assert.equal(promptSource.includes("不要 AI 脑补新内容"), true);
    assert.equal(promptSource.includes("不能生成式乱重绘"), true);
    assert.equal(promptSource.includes("比例保护：画质增强必须优先保持源图宽高比"), true);
    assert.equal(promptSource.includes("4K 高清重绘"), false);
    assert.equal(routeSource.includes('task: "hd_redraw"'), true);
    assert.equal(routeSource.includes('nodeOperation: "hd_redraw"'), true);
    assert.equal(routeSource.includes('nodeOperation: "upscale_4k"'), false);
    assert.equal(routeSource.includes("processToTarget"), false);
    assert.equal(routeSource.includes("processToExactSize"), false);
    assert.equal(routeSource.includes("getOpenAIRequestedSize"), true);
    assert.equal(routeSource.includes("normalizeOfficialQualityEnhanceTarget"), true);
    assert.equal(routeSource.includes("targetAdjusted"), true);
    assert.equal(routeSource.includes("resolveQualityEnhanceOfficialSize"), true);
    assert.equal(routeSource.includes("officialSizeWouldDistortRatio"), true);
    assert.equal(routeSource.includes('return "auto";'), true);
    assert.equal(routeSource.includes("ratioProtected"), true);
    assert.equal(routeSource.includes("official_gpt_image_edit"), true);
    assert.equal(routeSource.includes("resolveQualityEnhanceTarget"), true);
    assert.equal(routeSource.includes("encodeQualityEnhanceOutput"), true);
    assert.equal(routeSource.includes("enhanceFor4KClarity"), false);
    assert.equal(routeSource.includes("progressiveSuperResolution"), false);
    assert.equal(routeSource.includes("preserveSourceTextDetails"), false);
    assert.equal(routeSource.includes("kernel: sharp.kernel.lanczos3"), false);
    assert.equal(promptSource.includes("官方输出要求：直接由 GPT Image 编辑链路完成高清保真增强"), true);
    assert.equal(promptSource.includes("本地超分、锐化或补边"), true);
    assert.equal(routeSource.includes("enhancementMode"), true);
    assert.equal(routeSource.includes("sourceCompareUrl"), true);
    assert.equal(routeSource.includes("parseRedrawUpscaleJsonPayload"), true);
    assert.equal(routeSource.includes("InvalidRedrawUpscalePayloadError"), true);
    assert.equal(routeSource.includes("画质增强 JSON 无法解析"), true);
    assert.equal(routeSource.includes("isLocalGeneratedUrl(sourceUrl)"), true);
    assert.equal(routeSource.includes('formData.get("sourceUrl")'), true);
    assert.equal(routeSource.includes("readPublicImageUrl(sourceUrl)"), true);
    assert.equal(routeSource.includes("webp"), true);
    assert.equal(routeSource.includes("runQueuedImageModelRequestWithRetry"), true);
    assert.equal(routeSource.includes("imageRequestOptions()"), true);
    assert.equal(routeSource.includes("const [file, brandFiles] = await Promise.all"), true);
    assert.equal(routeSource.includes("const file = await toFile(input.imageBuffer"), false);
    assert.equal(routeSource.includes("const brandFiles = await Promise.all((input.brandReferenceImages || []).map"), false);
    assert.equal(routeSource.includes("const [actual, saved] = await Promise.all"), true);
    assert.equal(routeSource.includes("const actual = await readImageMetadata(output)"), false);
    assert.equal(routeSource.includes("const saved = await saveImageBuffer(output"), false);
    assert.equal(routeSource.includes("retryTransientImageRequest"), false);
    assert.equal(routeSource.includes('"center_crop"'), false);
  });

  it("routes 4K export through AI quality enhancement by default", async () => {
    const [aiRouteSource, workbenchSource, resultPreviewSource, localRouteExists] = await Promise.all([
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/result-preview-tools.tsx", import.meta.url), "utf8"),
      access(new URL("../app/api/upscale-image/route.ts", import.meta.url)).then(() => true, () => false),
    ]);
    const workbenchPreviewSource = `${workbenchSource}\n${resultPreviewSource}`;

    assert.equal(localRouteExists, false);
    assert.equal(aiRouteSource.includes("openai.images.edit"), true);
    assert.equal(aiRouteSource.includes('input_fidelity: "high"'), true);
    assert.equal(aiRouteSource.includes('quality: "high"'), true);
    assert.equal(workbenchSource.includes('fitMode: "standard_enhance"'), true);
    assert.equal(workbenchSource.includes('force4k ? "standard_enhance"'), true);
    assert.equal(workbenchSource.includes('!modelInfo.hasKey && node.data.kind !== "output"'), true);
    const removedOldQualityExportSentence = ["4K ", "导出默认走 AI 保真增强"].join("");
    const removedStandaloneQualityExportLabel = ["4K", "导出"].join("");
    assert.equal(workbenchSource.includes(removedOldQualityExportSentence), false);
    assert.equal(workbenchSource.includes("Standard 修文字，Plus 图文双清晰，Creative 做质感重绘，再输出到目标尺寸"), true);
    assert.equal(workbenchSource.includes("画质增强"), true);
    assert.equal(workbenchSource.includes(removedStandaloneQualityExportLabel), false);
    assert.equal(workbenchSource.includes("Standard"), true);
    assert.equal(workbenchSource.includes("Plus"), true);
    assert.equal(workbenchSource.includes("Creative"), true);
    assert.equal(workbenchSource.includes("8K长边7680"), false);
    assert.equal(workbenchSource.includes("qualityEnhanceTargetOptionsForImage"), true);
    assert.equal(workbenchSource.includes("qualityForQualityEnhanceTarget"), true);
    assert.equal(workbenchSource.includes("items.indexOf(value)"), false);
    assert.equal(workbenchSource.includes("standard_enhance"), true);
    assert.equal(workbenchSource.includes("plus_enhance"), true);
    assert.equal(workbenchSource.includes("creative_redraw"), true);
    assert.equal(workbenchSource.includes("hiddenFromAddMenu: true"), true);
    assert.equal(workbenchSource.includes("nodeCatalog.filter((item) => !item.hiddenFromAddMenu)"), true);
    assert.equal(workbenchSource.includes("resolveUpscaleTargetFromParams"), true);
    assert.equal(workbenchSource.includes('fetch("/api/upscale-image"'), false);
    assert.equal(workbenchSource.includes('fetch("/api/redraw-upscale-image"'), true);
    assert.equal(workbenchSource.includes("按原比例无损导出"), false);
    assert.equal(workbenchSource.includes("正在本地按原比例无损放大"), false);
    assert.equal(workbenchPreviewSource.includes("ImageComparisonSlider"), true);
    assert.equal(workbenchSource.includes("compareBefore"), true);
    assert.equal(workbenchSource.includes("comparisonImageFromSourceUrl"), true);
    assert.equal(workbenchPreviewSource.includes("优化前"), true);
    assert.equal(workbenchPreviewSource.includes("优化后"), true);
    assert.equal(workbenchSource.includes('modeLabel", force4k'), false);
  });

  it("surfaces 4K deliverability and text detail recovery checks", async () => {
    const [qualitySource, routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../lib/image-quality.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
    ]);

    assert.equal(qualitySource.includes("ImageDeliverabilityStatus"), true);
    assert.equal(qualitySource.includes("fourKCheckItems"), true);
    assert.equal(qualitySource.includes("文字/Logo保护"), true);
    assert.equal(qualitySource.includes("无磨砂补边"), true);
    assert.equal(qualitySource.includes("normalizeBlurredPaddingRisk"), true);
    assert.equal(qualitySource.includes("源图本身为边缘留白构图"), true);
    assert.equal(qualitySource.includes("可预览，需复查"), true);
    assert.equal(routeSource.includes("official_gpt_image_edit"), true);
    assert.equal(workbenchSource.includes("交付检查"), true);
    assert.equal(workbenchSource.includes("qualityDeliveryTone"), true);
    assert.equal(workbenchSource.includes("官方 GPT Image 高保真编辑 → 原生高清输出 → 质检"), true);
    assert.equal(workbenchSource.includes("rounded-full border px-2 py-0.5 text-[11px] ${qualityDeliveryTone(image.qualityCheck.deliverability)"), true);
    assert.equal(workbenchSource.includes("text-[11px] leading-5 ${image.qualityCheck.textDetailRisk"), true);
    assert.equal(workbenchSource.includes("mt-2 space-y-1.5 text-[11px] leading-5 text-white/52"), true);
  });
});

describe("Controlled local mask editing", () => {
  it("keeps local edits mask-bound with a simplified generative-fill UI", async () => {
    const [routeSource, workbenchSource, maskEditorSource, maskEditingSource] = await Promise.all([
      readFile(new URL("../app/api/mask-edit-image/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/mask-editor-modal.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/mask-editing.ts", import.meta.url), "utf8"),
    ]);
    const maskUiSource = `${workbenchSource}\n${maskEditorSource}\n${maskEditingSource}`;

    assert.equal(routeSource.includes("prepareControlledMask"), true);
    assert.equal(routeSource.includes("minimumUsableMaskPixels"), true);
    assert.equal(routeSource.includes("expandBinaryMaskToMinimum"), true);
    assert.equal(routeSource.includes("shouldUseRawMaskAfterCleanup"), true);
    assert.equal(routeSource.includes("rawPixels > 0 && solidPixels === 0"), true);
    assert.equal(routeSource.includes("candidateName"), true);
    assert.equal(routeSource.includes("maskClientCoverage"), true);
    assert.equal(routeSource.includes("coverageDrift"), true);
    assert.equal(routeSource.includes("shouldUseRawMaskForCoverageDrift"), true);
    assert.equal(routeSource.includes("toSingleChannelMaskBuffer"), true);
    assert.equal(routeSource.includes("let imageBufferPromise: Promise<Buffer>"), true);
    assert.equal(routeSource.includes("const [imageBuffer, maskBuffer] = await Promise.all([imageBufferPromise, maskBufferPromise])"), true);
    assert.equal(routeSource.includes("const [originalMeta, maskMeta] = await Promise.all"), true);
    assert.equal(routeSource.includes("const [imageFile, brandFiles] = await Promise.all"), true);
    assert.equal(routeSource.includes("const brandReferenceImages = await readBrandReferenceImages(formData)"), false);
    assert.equal(routeSource.includes("const maskBuffer = mask instanceof File ? Buffer.from(await mask.arrayBuffer()) : await readPublicImageUrl(maskUrl)"), false);
    assert.equal(routeSource.includes("red_paint"), true);
    assert.equal(routeSource.includes("nearFullWhiteMask"), true);
    assert.equal(routeSource.includes("tinyBlackResidue"), true);
    assert.equal(routeSource.includes("当前保存的涂抹蒙版为空"), true);
    assert.equal(routeSource.includes("maskMaxCoverage"), true);
    assert.equal(routeSource.includes("涂抹区域太小，请扩大涂抹范围"), false);
    assert.equal(routeSource.includes("composeControlledMaskedEdit"), true);
    assert.equal(routeSource.includes("inspectMaskEditQuality"), true);
    assert.equal(routeSource.includes("outsideChangedPixelRatio"), true);
    assert.equal(routeSource.includes("insideChangedPixelRatio"), true);
    assert.equal(routeSource.includes("findMaskComponents"), true);
    assert.equal(routeSource.includes("maskComponentPrompt"), true);
    assert.equal(routeSource.includes("componentReports"), true);
    assert.equal(routeSource.includes("unchangedComponentCount"), true);
    assert.equal(routeSource.includes("疑似仍有文字/Logo 残留"), true);
    assert.equal(routeSource.includes("Do not ignore small masked islands"), true);
    assert.equal(routeSource.includes("do not protect or restore masked typography"), true);
    assert.equal(routeSource.includes("shouldRetryMaskEditAttempt"), true);
    assert.equal(routeSource.includes("mask 内区域几乎没有变化"), true);
    assert.equal(routeSource.includes("Retry instruction: the previous attempt looked almost unchanged"), true);
    assert.equal(routeSource.includes("buildLocalCleanupFallback"), true);
    assert.equal(routeSource.includes("shouldApplyLocalCleanupFallback"), true);
    assert.equal(routeSource.includes("localCleanupFallbackApplied"), true);
    assert.equal(routeSource.includes("AI 局部生成变化不足，已切换本地清理兜底。"), true);
    assert.equal(routeSource.includes("这类无变化结果不会再作为成功结果保存。"), true);
    assert.equal(routeSource.includes("Task: Local cleanup and background reconstruction."), true);
    assert.equal(routeSource.includes("Task: Local object replacement."), true);
    assert.equal(routeSource.includes("Task: Remove text inside the masked area."), true);
    assert.equal(routeSource.includes("Do not replace old text with different text"), true);
    assert.equal(routeSource.includes("Generative fill rule: edit only the masked area"), true);
    assert.equal(routeSource.includes("Do not let AI render the final Chinese text"), true);
    assert.equal(routeSource.includes("applyDeterministicTextOverlay"), true);
    assert.equal(routeSource.includes("deterministicTextApplied"), true);
    assert.equal(routeSource.includes("Output size must stay"), true);
    assert.equal(routeSource.includes("mask 外区域发生变化。"), true);

    assert.equal(maskUiSource.includes("局部 AI 修改"), true);
    assert.equal(maskUiSource.includes("去掉这里并补全背景"), true);
    assert.equal(maskUiSource.includes("去掉文字"), true);
    assert.equal(maskUiSource.includes("替换成新内容"), true);
    assert.equal(maskUiSource.includes("局部高清修复"), true);
    assert.equal(maskUiSource.includes("局部换背景"), true);
    assert.equal(maskUiSource.includes("快捷指令"), true);
    assert.equal(maskUiSource.includes("画笔大小"), true);
    assert.equal(maskUiSource.includes("橡皮擦"), true);
    assert.equal(maskUiSource.includes("撤销"), true);
    assert.equal(maskUiSource.includes("清空涂抹"), true);
    assert.equal(maskUiSource.includes("按住对比原图"), true);
    assert.equal(maskUiSource.includes("恢复原图"), true);
    assert.equal(maskUiSource.includes("扩大 mask"), false);
    assert.equal(maskUiSource.includes("缩小 mask"), false);
    assert.equal(maskUiSource.includes("createEditableMaskCanvas"), false);
    assert.equal(maskUiSource.includes("inferSimpleMaskEditIntent"), true);
    assert.equal(maskUiSource.includes("isEditorRedMaskPixel"), true);
    assert.equal(maskUiSource.includes("countEditableMaskPixels"), true);
    assert.equal(maskUiSource.includes("if (stats.redPaintCount > 0) return alpha > 8 && isEditorRedMaskPixel"), true);
    assert.equal(workbenchSource.includes("maskValidated"), true);
    assert.equal(workbenchSource.includes("maskEditorInitialMaskUrl"), true);
    assert.equal(workbenchSource.includes("isLegacyUnvalidatedMask"), true);
    assert.equal(workbenchSource.includes("clearInvalidMaskState"), true);
    assert.equal(workbenchSource.includes("需重新确认涂抹"), true);
    assert.equal(workbenchSource.includes("涂抹蒙版未通过像素校验"), true);
    assert.equal(workbenchSource.includes("局部修改结果"), true);
    assert.equal(workbenchSource.includes("局部修改质检"), true);
    assert.equal(workbenchSource.includes("已检查"), true);
    assert.equal(workbenchSource.includes("个涂抹区域"), true);
    assert.equal(maskUiSource.includes("系统会自动放大蒙版边缘"), true);
    assert.equal(maskUiSource.includes("context.arc(to.x, to.y, Math.max(1, brushSize / 2)"), true);
    assert.equal(maskUiSource.includes("resetMaskCanvas"), true);
    assert.equal(maskUiSource.includes("生成中..."), true);
    assert.equal(maskUiSource.includes("局部修改启动失败"), true);
    assert.equal(workbenchSource.includes("mask-editor-draft"), true);
    assert.equal(workbenchSource.includes("beforeunload"), true);
    assert.equal(workbenchSource.includes("当前项目仍有未保存或运行中的内容"), true);
    assert.equal(maskUiSource.includes("已恢复上次未保存的涂抹草稿"), true);
    assert.equal(workbenchSource.includes("未涂抹区域会强制保持原图不变"), true);
    assert.equal(workbenchSource.includes("buildMaskEditPrompt(params"), false);
    assert.equal(maskEditorSource.includes("px-2.5 py-1.5 text-[10px]"), false);
    assert.equal(maskEditorSource.includes("text-[10px] leading-5"), false);
    assert.equal(maskEditorSource.includes("apple-pill ml-auto px-2.5 py-1 text-[11px]"), true);
  });
});

describe("Removed image workflows", () => {
  it("removes transparent cutout and poster layer extraction from routes and UI", async () => {
    const [workbenchSource, historySource, taskCenterSource] = await Promise.all([
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/history-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/task-center.tsx", import.meta.url), "utf8"),
    ]);
    const removedUiLabels = ["透明" + "抠图", "透明" + "扣图", "分层" + "拆图"];

    await assert.rejects(readFile(new URL("../app/api/transparent-png/route.ts", import.meta.url), "utf8"));
    await assert.rejects(readFile(new URL("../app/api/layer-output/route.ts", import.meta.url), "utf8"));
    await assert.rejects(readFile(new URL("../app/api/layer-output-regression/route.ts", import.meta.url), "utf8"));
    await assert.rejects(readFile(new URL("../lib/layer-output-regression.ts", import.meta.url), "utf8"));

    for (const source of [workbenchSource, historySource, taskCenterSource]) {
      for (const label of removedUiLabels) {
        assert.equal(source.includes(label), false);
      }
    }

    assert.equal(workbenchSource.includes("remove_background"), true);
    assert.equal(workbenchSource.includes("layer_output"), true);
    assert.equal(workbenchSource.includes("removedFeatureTextMarkers"), true);
    assert.equal(workbenchSource.includes("filterEdgesForNodes"), true);
    assert.equal(historySource.includes("canLayerOutput"), false);
  });
});

describe("PNG three-layer export", () => {
  it("exports same-canvas transparent PNG layers with in-preview single-layer downloads", async () => {
    const [routeSource, workbenchSource, resultPreviewSource, ledgerSource] = await Promise.all([
      readFile(new URL("../app/api/export-png-layers/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/result-preview-tools.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/task-run-ledger.ts", import.meta.url), "utf8"),
    ]);
    const workbenchPreviewSource = `${workbenchSource}\n${resultPreviewSource}`;

    assert.equal(routeSource.includes("01_background.png"), true);
    assert.equal(routeSource.includes("02_text.png"), true);
    assert.equal(routeSource.includes("03_person.png"), true);
    assert.equal(routeSource.includes("Create the clean background layer for a 3-layer PNG export."), true);
    assert.equal(routeSource.includes("Create a full-canvas text-only visual layer from the input design."), true);
    assert.equal(routeSource.includes("chroma magenta background (#ff00ff)"), true);
    assert.equal(routeSource.includes("ensureUsefulTextLayer"), true);
    assert.equal(routeSource.includes("keyOutChromaBackground"), true);
    assert.equal(routeSource.includes("createAiPersonVisualTransparentLayer"), true);
    assert.equal(routeSource.includes("cleanTransparentLayerMatte"), true);
    assert.equal(routeSource.includes("AI-generated person-only visual layer"), true);
    assert.equal(routeSource.includes("The person itself is an image layer"), true);
    assert.equal(routeSource.includes("Every non-person design element must be pure #ff00ff"), true);
    assert.equal(routeSource.includes("generate a clean natural continuation"), true);
    assert.equal(routeSource.includes("background, text, and person"), true);
    assert.equal(routeSource.includes("same-canvas transparent PNGs"), true);
    assert.equal(routeSource.includes("foreground graphic covers part of the person"), true);
    assert.equal(routeSource.includes("project_layers/layers.json"), false);
    assert.equal(routeSource.includes("project_layers/quality_report.json"), false);
    assert.equal(routeSource.includes("postprocessLayerPackage"), false);
    assert.equal(routeSource.includes("shouldUsePositionLockedTextLayer"), false);
    assert.equal(routeSource.includes("extractSourcePixelsByLightMask"), false);
    assert.equal(routeSource.includes("TEXT MATTE"), false);
    assert.equal(routeSource.includes("lockBackgroundOutsideRemovalMask"), false);
    assert.equal(routeSource.includes("inspectLayerPackageReconstruction"), false);
    assert.equal(routeSource.includes("背景层使用 AI 独立生成"), false);
    assert.equal(routeSource.includes("背景层已锁定非文字/人物区域"), false);
    assert.equal(routeSource.includes("文字层已切换为位置锁定重建"), false);
    assert.equal(routeSource.includes("Keep the original text positions"), true);
    assert.equal(routeSource.includes("Use the exact same full canvas size and keep the person in the same visual area"), true);
    assert.equal(routeSource.includes("getGeneratedProjectRelativeDir"), true);
    assert.equal(routeSource.includes('getGeneratedProjectRelativeDir(taskTrace?.projectId, "layer-packs")'), true);
    assert.equal(routeSource.includes("buildStoredZip"), false);
    assert.equal(routeSource.includes("zipFileSizeBytes"), false);
    assert.equal(routeSource.includes("zipFileName"), false);
    assert.equal(routeSource.includes("zipUrl"), false);
    assert.equal(routeSource.includes("normalizeLayerPng"), true);
    assert.equal(routeSource.includes("ensureAlpha()"), true);
    assert.equal(routeSource.includes("canvasWidth"), true);
    assert.equal(routeSource.includes("transparentPixelRatio"), true);
    assert.equal(routeSource.includes("createAiTextVisualTransparentLayer"), true);
    assert.equal(routeSource.includes("renderLayerWithFallback"), true);
    assert.equal(routeSource.includes("recordTaskRunFinished"), true);
    assert.equal(routeSource.includes("parsePngLayerExportPayload"), true);
    assert.equal(routeSource.includes("InvalidPngLayerExportPayloadError"), true);
    assert.equal(routeSource.includes("PNG 分层 JSON 无法解析"), true);
    assert.equal(routeSource.includes("已使用兜底层"), true);
    assert.equal(routeSource.includes("warnings"), true);
    assert.equal(routeSource.includes("keyOutCornerBackground"), true);
    assert.equal(routeSource.includes("04_decoration.png"), false);
    assert.equal(routeSource.includes("07_title_text.png"), false);
    assert.equal(routeSource.includes("PNG 三层已生成"), true);
    assert.equal(routeSource.includes("pngLayerExport: layerResult"), true);
    assert.equal(routeSource.includes("fileSizeBytes: png.byteLength"), true);
    assert.equal(routeSource.includes("layerStat"), false);
    assert.equal(routeSource.includes('import { mkdir, stat, writeFile } from "node:fs/promises"'), false);
    assert.equal(ledgerSource.includes("pngLayerExport?: unknown"), true);
    assert.equal(ledgerSource.includes("pngLayerExport: objectValue(source.pngLayerExport)"), true);

    assert.equal(workbenchSource.includes("PNG 分层导出节点"), true);
    assert.equal(workbenchSource.includes("AI三层精准"), true);
    assert.equal(workbenchSource.includes("快速三层"), true);
    assert.equal(workbenchSource.includes('InspectorSection title="PNG 三层"'), true);
    assert.equal(workbenchSource.includes("PNG 三层结果"), true);
    assert.equal(workbenchSource.includes("按需单独下载"), true);
    assert.equal(workbenchSource.includes("pngLayerDisplayName"), true);
    assert.equal(workbenchSource.includes("pngLayerPreviewImage"), true);
    assert.equal(workbenchSource.includes("预览三层"), true);
    assert.equal(workbenchSource.includes("按需下载单层 PNG"), true);
    assert.equal(workbenchSource.includes('useState<PngLayerExportMode>("ai_precise")'), false);
    assert.equal(workbenchSource.includes("导出 PNG 分层 ZIP"), false);
    assert.equal(workbenchSource.includes("下载 ZIP"), false);
    assert.equal(workbenchSource.includes("PngLayerStackPreview"), false);
    assert.equal(workbenchSource.includes("PngLayerExportPanel"), false);
    assert.equal(workbenchPreviewSource.includes("warnings?: string[]"), true);
    assert.equal(workbenchSource.includes("层兜底"), true);
    assert.equal(workbenchSource.includes('"png_layers"'), true);
    assert.equal(workbenchSource.includes("executePngLayers"), true);
    assert.equal(workbenchSource.includes("PNG 分层导出节点"), true);
    assert.equal(workbenchSource.includes("/api/export-png-layers"), true);
    assert.equal(workbenchSource.includes("生成 ZIP"), false);
  });
});

describe("Image-to-image creative redesign", () => {
  it("uses creative redesign prompts and two distinct variants for image-to-image", async () => {
    const [promptSource, routeSource, workbenchSource, imageUtilsSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/edit-image/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
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
    assert.equal(routeSource.includes('const inputFidelity = (isCreativeImageToImage || isSmartResize) ? "low" : "high"'), true);
    assert.equal(routeSource.includes("sanitizeLegacyImageToImagePrompt"), true);
    assert.equal(routeSource.includes("wantsMultipleImageOutputs(promptText)"), true);
    assert.equal(routeSource.includes("resultItems.slice(0, targetCount)"), true);
    assert.equal(routeSource.includes("const brandFilesPromise = Promise.all"), true);
    assert.equal(routeSource.includes("const [file, brandFiles, mask] = await Promise.all"), true);
    assert.equal(routeSource.includes("shouldUseAiOutpaint && preparedTargetCanvas ? toFile(preparedTargetCanvas.mask"), true);
    assert.equal(routeSource.includes("const brandFiles = await brandFilesPromise"), false);
    assert.equal(routeSource.includes("const brandFiles = await Promise.all(brandReferenceImages.map"), false);
    assert.equal(routeSource.includes("IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST"), true);
    assert.equal(routeSource.includes('fitMode === "pad" ? "pad" : "crop"'), true);
    assert.equal(routeSource.includes("isSmartResize"), true);
    assert.equal(routeSource.includes('? "strict_full_bleed"'), true);
    assert.equal(routeSource.includes("buildNativeEditRatioRetryPrompt"), true);
    assert.equal(routeSource.includes("markEditRatioFallback"), false);
    assert.equal(routeSource.includes("buildEditModelNativeSizeFallbackPrompt"), true);
    assert.equal(routeSource.includes("shouldRetryEditSizeWithNativeFallback"), true);
    assert.equal(routeSource.includes("getOpenAIImageSize(ratio)"), true);
    assert.equal(routeSource.includes('"safe_full_bleed"'), false);
    assert.equal(routeSource.includes("buildMissingEditVariantRetryPrompt"), true);
    assert.equal(routeSource.includes("preparedTargetCanvas"), true);
    assert.equal(routeSource.includes("target-ratio-canvas.png"), true);
    assert.equal(routeSource.includes("isSmartResize ||"), true);
    assert.equal(routeSource.includes("buildSmartResizeGenerateFallbackPrompt"), true);
    assert.equal(routeSource.includes("runQueuedImageModelRequestWithRetry"), true);
    assert.equal(routeSource.includes("target_canvas_relayout"), true);
    assert.equal(routeSource.includes("shouldUseAiOutpaint ||"), true);
    assert.equal(routeSource.includes("sanitizeSmartResizePrompt"), true);
    assert.equal(routeSource.includes("不要保留原图坐标"), true);
    assert.equal(routeSource.includes("智能改版重试：按目标画布重新排版"), true);
    assert.equal(routeSource.includes("扩图补画重试：保留原版式和原视觉重心"), true);
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
    assert.equal(promptSource.includes("处理模式：智能改版重排 / 新尺寸新排版。"), true);
    assert.equal(promptSource.includes("原图只作为主题、品牌色、主体素材和核心信息参考"), true);
    assert.equal(promptSource.includes("竖版重排：这是竖版新设计，不是横版海报放进竖版画布。"), true);
    assert.equal(promptSource.includes("原图右侧标题位置不能照搬"), true);
    assert.equal(promptSource.includes("处理模式：扩图补画。保持原版式、原标题位置、主体比例和视觉重心"), true);
    assert.equal(workbenchSource.includes("智能改版：新尺寸新排版"), true);
    assert.equal(workbenchSource.includes("扩展成 ${preset}"), true);
    assert.equal(workbenchSource.includes("原横版右侧文字位置不能照搬"), true);

    assert.equal(workbenchSource.includes("prompt: IMAGE_TO_IMAGE_CREATIVE_DEFAULT_REQUEST"), true);
    assert.equal(workbenchSource.includes("buildCreativeImageToImageConstraintText"), true);
    assert.equal(workbenchSource.includes("参考原图做创意改版。"), true);
    assert.equal(workbenchSource.includes("默认生成 2 个创意改版方案，核心识别保留，版式明显不同。"), true);
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
    const [promptSource, routeSource, workbenchSource, optionsSource, creativeBriefSource, creativeBriefRouteSource, queueSource, deliverySource, designPlanSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/generate-image/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
      readFile(new URL("../lib/design-options.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/creative-brief.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/creative-brief/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-request-queue.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/workbench-delivery.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/design-plan.ts", import.meta.url), "utf8"),
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
    assert.equal(promptSource.includes("buildDesignDirectorBriefRequestPrompt"), true);
    assert.equal(promptSource.includes("AI 海报策划总监"), true);
    assert.equal(promptSource.includes("Design Brief"), true);
    assert.equal(promptSource.includes("directions 固定 3 个"), true);
    assert.equal(creativeBriefRouteSource.includes("parseCreativeBriefPayload"), true);
    assert.equal(creativeBriefRouteSource.includes("InvalidCreativeBriefPayloadError"), true);
    assert.equal(creativeBriefRouteSource.includes("创作预检 JSON 无法解析"), true);
    assert.equal(promptSource.includes("buildDesignDirectorImagePrompt"), true);
    assert.equal(promptSource.includes("Selected design direction"), true);
    assert.equal(promptSource.includes("AI 只生成极少文字或无字背景"), true);
    assert.equal(promptSource.includes("No cropping, no side blur padding, no frosted edges"), true);
    assert.equal(promptSource.includes("版式设计规范"), true);
    assert.equal(promptSource.includes("4/8/12 栅格"), true);
    assert.equal(promptSource.includes("清晰对齐线"), true);
    assert.equal(promptSource.includes("主标题约为副标题 1.6-2.4 倍"), true);
    assert.equal(promptSource.includes("版式落点：所有主要元素必须落在清晰栅格和对齐轴上"), true);
    assert.equal(routeSource.includes("版式修正：按 4/8/12 栅格重排"), true);
    assert.equal(creativeBriefSource.includes("版式设计依据：使用明确栅格、对齐轴、统一间距、清晰分组和阅读动线"), true);

    assert.equal(routeSource.includes("referenceManifest"), true);
    assert.equal(routeSource.includes("referenceImage_"), true);
    assert.equal(routeSource.includes("brandAsset_"), true);
    assert.equal(routeSource.includes("const textReferenceInputReadConcurrency = 4"), true);
    assert.equal(routeSource.includes("mapWithConcurrency(inputs, textReferenceInputReadConcurrency"), true);
    assert.equal(routeSource.includes("fileKey: `referenceImage_${index}`"), true);
    assert.equal(routeSource.includes("fileKey: `brandAsset_${index}`"), true);
    assert.equal(routeSource.includes("slice(0, 5)"), true);
    assert.equal(promptSource.includes("references.length >= 5"), true);
    assert.equal(routeSource.includes("references.length >= 5"), true);
    assert.equal(promptSource.includes("value.filter((item) => Boolean(item?.label)).slice(0, 5)"), false);
    assert.equal(routeSource.includes("parsed.filter((item) => Boolean(item?.label)).slice(0, 5)"), false);
    assert.equal(routeSource.includes("for (let index = 1; index <= 5"), false);
    assert.equal(routeSource.includes("buildPromptsFromDesignPlan"), true);
    assert.equal(routeSource.includes("Never use the raw user sentence as visible poster copy"), true);
    assert.equal(routeSource.includes("文生图/图片参考编辑"), true);
    assert.equal(routeSource.includes("parseTextToImageJsonPayload"), true);
    assert.equal(routeSource.includes("InvalidTextToImagePayloadError"), true);
    assert.equal(routeSource.includes("文生图 JSON 无法解析"), true);
    assert.equal(routeSource.includes("image: referenceFiles.length > 1 ? (referenceFiles as never) : referenceFiles[0]"), true);
    assert.equal(routeSource.includes("input_fidelity: strongReferenceMode ? \"high\" : \"low\""), true);
    assert.equal(routeSource.includes("bodyWithReferenceAnalysis"), true);
    assert.equal(routeSource.includes("buildTextReferenceSummaryGenerationPrompt"), true);
    assert.equal(routeSource.includes("compactReferenceImagePrompt"), true);
    assert.equal(routeSource.includes("limitPromptText(referenceSummary, 1800)"), true);
    assert.equal(routeSource.includes("活动主题、核心文案、人物/产品/服务"), true);
    assert.equal(routeSource.includes("normalizeTextToImageRequest"), true);
    assert.equal(routeSource.includes("createTextToImageDesignPlan"), true);
    assert.equal(routeSource.includes("getAnalysisModel"), true);
    assert.equal(routeSource.includes("resolveImageModel(body.imageModel, body.model)"), true);
    assert.equal(routeSource.includes("imageModel: String(formData.get(\"imageModel\")"), true);
    assert.equal(workbenchSource.includes("appendImageModel(formData"), true);
    assert.equal(workbenchSource.includes("图片模型"), true);
    assert.equal(workbenchSource.includes('findBrandAssets(assets, "logo").slice(0, 1)'), true);
    assert.equal(workbenchSource.includes('findBrandAssets(assets, "ip").slice(0, 1)'), true);
    assert.equal(workbenchSource.includes('if (index === 0) return "composition";'), true);
    assert.equal(workbenchSource.includes("活动主题、核心文案、版式骨架"), true);
    assert.equal(workbenchSource.includes("function countTextReferenceEdges"), true);
    assert.equal(workbenchSource.includes("edges.filter((edge) => edge.target === connection.target && isTextReferenceTargetHandle(edge.targetHandle)).length"), false);
    assert.equal(workbenchSource.includes("edges.filter((edge) => edge.target === selectedTextNode.id && isTextReferenceTargetHandle(edge.targetHandle)).length"), false);
    assert.equal(workbenchSource.includes("function countEdgesFromSource"), true);
    assert.equal(workbenchSource.includes("edges.filter((edge) => edge.source === source.id).length"), false);
    assert.equal(workbenchSource.includes("function countSuccessfulResults"), true);
    assert.equal(workbenchSource.includes("results.filter(Boolean).length"), false);
    assert.equal(workbenchSource.includes("function countEnabledUsage"), true);
    assert.equal(workbenchSource.includes("uniqueImagesNotOnCanvas([image])"), false);
    assert.equal(creativeBriefRouteSource.includes("getAnalysisModel"), true);
    assert.equal(creativeBriefRouteSource.includes("getImageModel"), false);
    assert.equal(routeSource.includes("buildDesignPlanPrompt"), true);
    assert.equal(routeSource.includes("normalizeDesignPlan"), true);
    assert.equal(routeSource.includes("designPlan"), true);
    assert.equal(routeSource.includes("normalizeProvidedDesignPlan"), false);
    assert.equal(designPlanSource.includes("后台静默规则"), true);
    assert.equal(designPlanSource.includes("copywriting 只能放最终海报上应该真实显示的文字"), true);
    assert.equal(designPlanSource.includes("用户原始需求是设计指令，不是海报文案"), true);
    assert.equal(designPlanSource.includes("出图规则：本系统不再后期盖字"), true);
    assert.equal(designPlanSource.includes("imagePrompt 只允许使用你分析后的设计方案和 copywriting"), true);
    assert.equal(designPlanSource.includes("sanitizePosterCopy"), true);
    assert.equal(designPlanSource.includes("for (const match of text.matchAll"), true);
    assert.equal(designPlanSource.includes(".map((match) => match[1]).filter(Boolean)"), false);
    assert.equal(designPlanSource.includes("value.map(clean).filter(Boolean)"), false);
    assert.equal(routeSource.includes("applyDesignPlanTextOverlay"), false);
    assert.equal(routeSource.includes("Generate the final complete poster directly"), true);
    assert.equal(routeSource.includes('const textToImageFitMode = "strict_full_bleed"'), true);
    assert.equal(routeSource.includes("buildNativeRatioRetryPrompt"), true);
    assert.equal(routeSource.includes("\"smart_outpaint\""), false);
    assert.equal(routeSource.includes("shouldRetryTextToImageQuality"), true);
    assert.equal(routeSource.includes("textToImageRiskValue"), true);
    assert.equal(routeSource.includes("textToImageGenerationProfile"), true);
    assert.equal(routeSource.includes('label: "参考精修", targetCount: 2, maxRetries: 0'), true);
    assert.equal(routeSource.includes('label: "快速预览", targetCount: 2, maxRetries: 1'), true);
    assert.equal(routeSource.includes('label: "标准出图", targetCount: 2, maxRetries: 1'), true);
    assert.equal(routeSource.includes('label: "正式高清", targetCount: 2, maxRetries: 2'), true);
    assert.equal(routeSource.includes("max_output_tokens: 2200"), true);
    assert.equal(routeSource.includes("timeout: 15_000"), true);
    assert.equal(routeSource.includes("modelCallPolicy"), true);
    assert.equal(routeSource.includes("targetCanvasFirst"), true);
    assert.equal(routeSource.includes("shouldUseTextToImageTargetCanvasFirst"), true);
    assert.equal(routeSource.includes("supportsImageRequestBatchCount"), true);
    assert.equal(routeSource.includes("if (hasReferenceFiles) return false"), true);
    assert.equal(routeSource.includes("buildTextToImageBatchPrompt"), true);
    assert.equal(routeSource.includes("createImageRequest(batchPrompt, targetCount)"), true);
    assert.equal(routeSource.includes("方案 2：同一需求下更有创意记忆点"), true);
    assert.equal(routeSource.includes("方案 2 只参考以下差异方向，不要重复整段规则"), true);
    assert.equal(routeSource.includes("generationProfile.maxRetries"), true);
    assert.equal(routeSource.includes("hasReferenceFiles"), true);
    assert.equal(routeSource.includes("designBriefCache"), false);
    assert.equal(routeSource.includes("shouldUseFastDesignBrief"), false);
    assert.equal(routeSource.includes("textToImageSafeMarginPercent"), true);
    assert.equal(routeSource.includes("tightenTextToImageCompositionRisk"), true);
    assert.equal(routeSource.includes("四周 18% 只放背景/出血装饰"), true);
    assert.equal(routeSource.includes("文生图${worst.name}高对比内容偏多"), true);
    assert.equal(routeSource.includes("qualityCheck.suspectedBlurredPadding"), true);
    assert.equal(routeSource.includes("buildCompositionRetryPrompt"), true);
    assert.equal(routeSource.includes("主体和标题缩小 10%-20%"), true);
    assert.equal(routeSource.includes("模糊/磨砂/玻璃补边"), true);
    assert.equal(routeSource.includes("allowSafeRatioFallback"), true);
    assert.equal(routeSource.includes("markTextToImageRatioFallback"), false);
    assert.equal(routeSource.includes('"safe_full_bleed"'), false);
    assert.equal(routeSource.includes("buildMissingTextVariantRetryPrompt"), true);
    assert.equal(routeSource.includes("createImageRequestWithSize"), true);
    assert.equal(routeSource.includes("shouldRetryImageSizeWithNativeFallback"), true);
    assert.equal(routeSource.includes("buildModelNativeSizeFallbackPrompt"), true);
    assert.equal(routeSource.includes("getOpenAIImageSize(ratio)"), true);
    assert.equal(routeSource.includes("shouldForceAiPosterPlanning"), false);
    assert.equal(routeSource.includes("compact.length <= 42"), false);
    assert.equal(designPlanSource.includes("端午节海报"), true);
    assert.equal(designPlanSource.includes("端午安康"), true);
    assert.equal(designPlanSource.includes("粽叶飘香，情暖仲夏"), true);
    assert.equal(designPlanSource.includes("科技里的端午"), true);
    assert.equal(designPlanSource.includes("除非用户用“标题、主标题、副标题、正文、文案、写上、文字为、活动信息、医生信息、电话、地址”等明确标注"), true);
    assert.equal(promptSource.includes("hasPromotionIntent ?"), true);
    assert.equal(promptSource.includes('["愿你岁岁安康，万事顺遂", "粽香仲夏", "安康相伴"]'), true);
    assert.equal(promptSource.includes('title: "科技里的端午"'), true);
    assert.equal(promptSource.includes('subtitle: "传统文化与科学探索的奇妙相遇"'), true);
    assert.equal(promptSource.includes("Use real poster copy, not planning labels"), true);
    assert.equal(promptSource.includes("粽子、龙舟、水纹、艾草、祥云或竹叶构成主视觉"), true);
    assert.equal(promptSource.includes("青绿、米白为主，少量金色点缀"), true);
    assert.equal(promptSource.includes("上方主标题 / 中央粽子与龙舟主视觉 / 底部活动信息与品牌留白区"), true);
    assert.equal(promptSource.includes("节日营销：符号必须强相关"), true);

    assert.equal(workbenchSource.includes("text_to_image: ["), true);
    assert.equal(workbenchSource.includes('text_to_image: [{ id: textReferenceInputHandle, label: "图片参考" }]'), true);
    assert.equal(workbenchSource.includes("maxTextReferenceImages = 5"), true);
    assert.equal(workbenchSource.includes("const selectedComposerImageModel = composerModel.trim()"), true);
    assert.equal(workbenchSource.includes("function activeImageModelForNode"), true);
    assert.equal(workbenchSource.includes("if (selected) return selected"), true);
    assert.equal(workbenchSource.includes("appendImageModel(formData, node"), true);
    assert.equal(workbenchSource.includes("用户要求参考画面 / 活动信息 / 内容不变"), true);
    assert.equal(workbenchSource.includes("TextReferenceInspector"), true);
    assert.equal(workbenchSource.includes("resolveTextReferenceInputs"), true);
    assert.equal(workbenchSource.includes("appendTextReferenceImages"), true);
    assert.equal(workbenchSource.includes("连接到“图片参考”入口的图片作为素材参考参与生成"), true);
    assert.equal(workbenchSource.includes("imageFromSingleResponse"), true);
    assert.equal(workbenchSource.includes("normalizeImageTaskResponse(await readJsonResponse(response))"), true);
    assert.equal(deliverySource.includes('status === "composition_risk" || status === "blurred_padding"'), true);
    assert.equal(deliverySource.includes('status === "size_insufficient" || status === "ratio_mismatch" || status === "suspected_stretch" || status === "white_border" || status === "failed" || status === "empty"'), true);
    assert.equal(workbenchSource.includes("const imageTaskTimeoutMs = 35 * 60 * 1000"), true);
    assert.equal(workbenchSource.includes("const imageTaskStuckMs = 12 * 60 * 1000"), true);
    assert.equal(workbenchSource.includes("通常需要 1-5 分钟，比例重试会更久"), true);
    assert.equal(queueSource.includes("const imageRequestConcurrency = 2"), true);
    assert.equal(queueSource.includes("acquireImageRequestSlot"), true);
    assert.equal(queueSource.includes("releaseImageRequestSlot"), true);
  });

  it("keeps plain creative prompts gated away from project brand/contact context", async () => {
    const [promptSource, workbenchSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
    ]);

    assert.equal(promptSource.includes("function wantsProjectOutputContext"), true);
    assert.equal(promptSource.includes("const wantsProjectContext = wantsProjectOutputContext(request.prompt)"), true);
    assert.equal(promptSource.includes("wantsProjectContext ? \"素材上画"), true);
    assert.equal(promptSource.includes("buildLayoutDesignSystemPrompt(wantsProjectContext)"), true);
    assert.equal(promptSource.includes("wantsProjectContext ? \"- Logo 只是品牌识别"), true);
    assert.equal(promptSource.includes("wantsProjectContext ? \"尺度：主标题高度不超过画面 25%；Logo 宽度"), true);
    assert.equal(promptSource.includes("promptSection(\"Task\""), true);
    assert.equal(promptSource.includes("promptSection(\"Canvas\""), true);
    assert.equal(promptSource.includes("buildContextAwareAvoidLine(request.prompt)"), true);
    assert.equal(promptSource.includes("arr.indexOf(item)"), false);
    assert.equal(promptSource.includes("shouldIncludeProtection ? promptSection(\"Protected source facts\", [compactPromptText(buildProtectionPrompt(protectionContext), 560)]) : \"\""), true);
    assert.equal(promptSource.includes("通用商业设计规则：紧扣用户当前主题，不要串用无关行业或历史任务元素。"), true);
    assert.equal(workbenchSource.includes("function shouldUseProjectPromptContext"), true);
    assert.equal(workbenchSource.includes("shouldUseProjectPromptContext(visibleRequestText) ? buildNodeProjectConstraintText"), true);
    assert.equal(workbenchSource.includes("requireExplicitProjectContext"), true);
    assert.equal(workbenchSource.includes("projectContext: shouldUseProjectPromptContext(prompt) ? buildCreativeProjectContext"), true);
    assert.equal(workbenchSource.includes("visibleRequestText?: string"), true);
    assert.equal(workbenchSource.includes("const profileColors = projectProfileColors(profile)"), true);
    assert.equal(workbenchSource.includes("projectProfileColors(profile).length ? `品牌色"), false);
    assert.equal(workbenchSource.includes("function sourceImageVersionRefs"), true);
    assert.equal(workbenchSource.includes("options.sourceImages.map((image) => image.id"), false);
    assert.equal(workbenchSource.includes("options.sourceImages.map((image) => image.url"), false);
    assert.equal(workbenchSource.includes("const contactExplicitlyRequested = visibleRequests.phone || visibleRequests.address || usage.useContact"), true);
    assert.equal(workbenchSource.includes("const shouldProtectContact = !hiddenRequests.noText && !hiddenRequests.noContact && contactExplicitlyRequested"), true);
    assert.equal(workbenchSource.includes("shouldForbidInventedContact"), true);
    assert.equal(workbenchSource.includes("用户只要求品牌、Logo 或 IP 时，只放对应素材"), true);
  });
});

describe("Project public info extraction", () => {
  it("deduplicates discovered facts in one pass", async () => {
    const routeSource = await readFile(new URL("../app/api/project-public-info/route.ts", import.meta.url), "utf8");

    assert.equal(routeSource.includes("for (const match of text.matchAll(pattern))"), true);
    assert.equal(routeSource.includes("array.indexOf(value)"), false);
  });
});

describe("Design production protection", () => {
  it("normalizes limited protection arrays in one pass", async () => {
    const source = await readFile(new URL("../lib/design-production.ts", import.meta.url), "utf8");

    assert.equal(source.includes("function normalizeLimitedItems"), true);
    assert.equal(source.includes("source.protectedTexts.filter"), false);
    assert.equal(source.includes("source.protectedAssets.filter"), false);
    assert.equal(source.includes("source.layers.filter"), false);
  });
});

describe("Workbench clipboard utilities", () => {
  it("shares supported image type checks instead of rebuilding them per call", async () => {
    const utilsSource = await readFile(new URL("../components/workbench/workbench-utils.ts", import.meta.url), "utf8");

    assert.equal(utilsSource.includes("const supportedImageTypes = new Set"), true);
    assert.equal(utilsSource.includes("const supportedTypes = new Set"), false);
  });
});

describe("Workbench image collection helpers", () => {
  it("shares image key list extraction for result cleanup paths", async () => {
    const workbenchSource = await readWorkbenchSource();

    assert.equal(workbenchSource.includes("export function imageKeys"), true);
    assert.equal(workbenchSource.includes("targetImages.map(imageKey).filter(Boolean)"), false);
    assert.equal(workbenchSource.includes("images.map(imageKey).filter(Boolean)"), false);
  });
});

describe("Workflow canvas performance", () => {
  it("degrades node, edge, and portal-heavy UI during canvas interactions", async () => {
    const [workbenchSource, workbenchTypesSource, globalsSource] = await Promise.all([
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/workbench-types.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
    const workbenchContractSource = `${workbenchSource}\n${workbenchTypesSource}`;

    assert.equal(workbenchSource.includes("isCanvasPanning"), true);
    assert.equal(workbenchSource.includes("isCanvasZooming"), true);
    assert.equal(workbenchSource.includes("isNodeDragging"), true);
    assert.equal(workbenchSource.includes("isConnecting"), true);
    assert.equal(workbenchSource.includes("isLowZoom"), true);
    assert.equal(workbenchSource.includes("isLargeWorkflow"), true);
    assert.equal(workbenchSource.includes("isPerformanceMode"), true);
    assert.equal(workbenchSource.includes("onlyRenderVisibleElements"), true);
    assert.equal(workbenchSource.includes("resolveNodeRenderLevel"), true);
    assert.equal(workbenchSource.includes("if (input.isLowZoom) return input.selected ? \"compact\" : \"mini\""), true);
    assert.equal(workbenchSource.includes("if (input.isLargeWorkflow && !input.selected) return \"compact\""), true);
    assert.equal(workbenchSource.includes("input.isPerformanceMode && !input.selected"), false);
    assert.equal(workbenchContractSource.includes('type NodeRenderLevel = "full" | "compact" | "mini"'), true);
    assert.equal(workbenchSource.includes('type: isPerformanceMode ? "straight" : edge.type'), true);
    assert.equal(workbenchSource.includes("workflow-edge-compact"), true);
    assert.equal(workbenchSource.includes("nodeMenuOpen && !isPerformanceMode"), true);
    assert.equal(workbenchSource.includes('className={`node-workflow-flow ${isPerformanceMode ? "is-performance-mode" : ""}`}'), true);
    assert.equal(workbenchSource.includes('absolute left-[-36px] flex items-center gap-1.5 text-[11px]'), true);
    assert.equal(workbenchSource.includes('operationNodeSubtitle(data, catalog?.description, textReferences.length)}</p>'), true);
    assert.equal(workbenchSource.includes('line-clamp-1 text-[9px] leading-4">{operationNodeSubtitle'), false);
    assert.equal(workbenchSource.includes("mr-1 text-[11px] text-white/38"), true);
    assert.equal(workbenchSource.includes("apple-caption min-w-0 truncate text-[9.5px]"), false);
    assert.equal(workbenchSource.includes("apple-caption shrink-0 text-[11px]"), true);
    assert.equal(workbenchSource.includes('truncate text-[11px] text-white/38">{textReferenceRoleDescription'), true);
    assert.equal(workbenchSource.includes("apple-pill px-2 py-1 text-[11px]"), true);
    assert.equal(workbenchSource.includes("composerStarterPrompts"), false);
    assert.equal(workbenchSource.includes("做一张高端电商产品主图"), false);
    assert.equal(workbenchSource.includes("做一张门店活动海报"), false);
    assert.equal(workbenchSource.includes("做一张国潮风人物海报"), false);
    assert.equal(workbenchSource.includes("!displayPrompt.trim() && starterPrompts.length"), false);
    assert.equal(workbenchSource.includes("const composerDisplayRatio = selectedNode?.data.kind === \"text_to_image\" ? ratioParam(selectedNode.data.params.aspectRatio) : composerRatio;"), true);
    assert.equal(workbenchSource.includes("const composerDisplayQuality = selectedNode?.data.kind === \"text_to_image\" ? qualityParam(selectedNode.data.params.quality) : composerQuality;"), true);
    assert.equal(workbenchSource.includes('ratio={composerDisplayRatio}'), true);
    assert.equal(workbenchSource.includes('quality={composerDisplayQuality}'), true);
    assert.equal(workbenchSource.includes('function changeComposerRatio(value: AspectRatioValue)'), true);
    assert.equal(workbenchSource.includes('updateNodeParam(selectedNode.id, "aspectRatio", value)'), true);
    assert.equal(workbenchSource.includes("function reusableTextToImageNode()"), true);
    assert.equal(workbenchSource.includes("已复用现有文生图节点并开始运行。"), true);
    assert.equal(workbenchSource.includes("creativeStartBusyRef.current"), true);
    assert.equal(workbenchSource.includes("apple-button max-w-full truncate rounded-full px-2.5 py-1 text-[10px]"), false);
    assert.equal(workbenchSource.includes("apple-button rounded-full px-2.5 py-1 text-[10px]"), false);
    assert.equal(workbenchSource.includes("apple-button px-2 py-1.5 text-[10px]"), false);
    assert.equal(workbenchSource.includes("text-[10px] leading-4"), false);
    assert.equal(workbenchSource.includes("text-[9px] leading-3"), false);
    assert.equal(workbenchSource.includes("PNG 三层结果"), true);
    assert.equal(workbenchSource.includes("mt-2 rounded-[12px] border border-[#f5c66a]/24 bg-[#f5c66a]/10 p-2 text-[11px] leading-5"), true);

    assert.equal(globalsSource.includes(".node-workflow-flow.is-performance-mode .apple-node-card"), true);
    assert.equal(globalsSource.includes("backdrop-filter: none"), true);
    assert.equal(globalsSource.includes(".workflow-edge-compact"), true);
    assert.equal(globalsSource.includes(".react-flow__edge-text"), true);
  });
});

describe("Project stability and task tracing", () => {
  it("keeps local snapshots and explicit task run traces", async () => {
    const [workbenchSource, workbenchTypesSource, taskCenterSource, ledgerSource, routeSource, generateRouteSource, generatedImagesRouteSource, generatedHistorySource, historyPanelSource, imageManagerPanelSource, projectLibraryPanelSource, projectHomeSource, projectCreationSource, assetLibraryPanelSource, imageUtilsSource, imageQualitySource, imageResourceRouteSource, projectRouteSource, editRouteSource, redrawRouteSource, imageSourceSource, materialLibrariesRouteSource] = await Promise.all([
      readWorkbenchSource(),
      readFile(new URL("../components/workbench/workbench-types.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/task-center.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/task-run-ledger.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/task-runs/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/generate-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/generated-images/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/generated-history.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/history-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/image-manager-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/project-library-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/project-home-screen.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/project-creation-modal.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/asset-library-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-utils.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/image-quality.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/image-resource/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/edit-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/redraw-upscale-image/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/workbench-image-source.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/material-libraries/route.ts", import.meta.url), "utf8"),
    ]);
    const workbenchContractSource = `${workbenchSource}\n${workbenchTypesSource}`;
    const workbenchUiSource = `${workbenchSource}\n${imageManagerPanelSource}\n${projectLibraryPanelSource}\n${projectHomeSource}\n${projectCreationSource}\n${assetLibraryPanelSource}\n${imageSourceSource}`;

    assert.equal(workbenchContractSource.includes("type ProjectSnapshot"), true);
    assert.equal(workbenchSource.includes("const projectSnapshotLimit = 5"), true);
    assert.equal(workbenchSource.includes("const projectSnapshotIntervalMs = 30 * 1000"), true);
    assert.equal(workbenchSource.includes("const projectCapacityNodeWarning = 80"), true);
    assert.equal(workbenchSource.includes("const projectCapacityImageWarning = 200"), true);
    assert.equal(workbenchSource.includes("const projectCapacityJsonWarningBytes = 8 * 1024 * 1024"), true);
    assert.equal(workbenchSource.includes("projectCapacitySummary"), true);
    assert.equal(workbenchSource.includes("function countProjectUserFacingImages"), true);
    assert.equal(workbenchSource.includes("historyImages.filter((image) => imageBelongsToProject(image, projectId) && isUserFacingResultImage(image)).length"), false);
    assert.equal(workbenchSource.includes("historyImages.filter((image) => imageBelongsToProject(image, projectId)).filter(isUserFacingResultImage)"), false);
    assert.equal(workbenchSource.includes("项目体积"), true);
    assert.equal(projectRouteSource.includes("parseProjectPayload"), true);
    assert.equal(projectRouteSource.includes("InvalidProjectPayloadError"), true);
    assert.equal(projectRouteSource.includes("项目 JSON 无法解析，保存已拒绝"), true);
    assert.equal(projectRouteSource.includes("parseProjectDeletePayload"), true);
    assert.equal(projectRouteSource.includes("InvalidProjectDeletePayloadError"), true);
    assert.equal(projectRouteSource.includes("项目删除 JSON 无法解析"), true);
    assert.equal(projectRouteSource.includes("{ status: 400 }"), true);
    assert.equal(workbenchSource.includes("图片管理批量清理"), true);
    assert.equal(workbenchSource.includes("saveProjectSnapshot(\"auto\")"), true);
    assert.equal(workbenchSource.includes("flushProjectPayloadForPageLifecycle(\"leave\")"), true);
    assert.equal(workbenchContractSource.includes("type ProjectLocalCachePointer"), true);
    assert.equal(workbenchContractSource.includes("type ProjectTaskCachePointer"), true);
    assert.equal(workbenchSource.includes("readLegacyProjectLocalCache"), true);
    assert.equal(workbenchSource.includes("writeProjectLocalCachePointer"), true);
    assert.equal(workbenchSource.includes("isProjectLocalCachePointer"), true);
    assert.equal(workbenchSource.includes("isProjectTaskCachePointer"), true);
    assert.equal(workbenchSource.includes("projectResourceNormalizeConcurrency = 4"), true);
    assert.equal(workbenchSource.includes("new Map<string, Promise<ImageAsset | null | undefined>>()"), true);
    assert.equal(workbenchSource.includes("const pending = ensureImageAssetResource(image)"), true);
    assert.equal(workbenchSource.includes("const commonCopyLines = splitProfileLines(profile.commonCopy)"), true);
    assert.equal(workbenchSource.includes("brandColors: projectProfileColors(profile).length"), false);
    assert.equal(workbenchSource.includes("slogans: splitProfileLines(profile.commonCopy).length"), false);
    assert.equal(workbenchSource.includes("mapWithConcurrency(payload.assets || [], projectResourceNormalizeConcurrency"), true);
    assert.equal(workbenchSource.includes("Promise.all((payload.assets || []).map"), false);
    assert.equal(workbenchSource.includes('storageMode: "file"'), true);
    assert.equal(workbenchSource.includes("payload: stablePayload"), false);
    assert.equal(workbenchSource.includes("完整项目已保存到项目文件；浏览器缓存只保留轻量指针。"), true);
    assert.equal(workbenchSource.includes("任务详情已迁移到项目文件和 task-runs.local.json；浏览器缓存只保留轻量指针。"), true);
    assert.equal(workbenchSource.includes("persistProjectPayloadForLifecycleExit"), true);
    assert.equal(workbenchSource.includes("projectLifecycleKeepaliveLimitBytes"), true);
    assert.equal(workbenchSource.includes('navigator.sendBeacon("/api/project"'), true);
    assert.equal(workbenchSource.includes("restoreLatestSnapshot"), false);
    assert.equal(workbenchSource.includes("恢复最近本地备份"), false);
    assert.equal(workbenchSource.includes("备份"), false);
    assert.equal(workbenchSource.includes("本地快照"), false);
    assert.equal(workbenchSource.includes("requestId"), true);
    assert.equal(workbenchSource.includes("projectName"), true);
    assert.equal(workbenchSource.includes("taskProjectContextRef"), true);
    assert.equal(workbenchSource.includes("模型配置检测失败"), true);
    assert.equal(workbenchSource.includes("NodeErrorNotice"), true);
    assert.equal(workbenchSource.includes("errorRecoveryTips"), true);
    assert.equal(workbenchSource.includes("进入 API 设置测试 Key、余额和模型权限"), true);
    assert.equal(workbenchSource.includes("先把输入图片接到节点左侧入口"), true);
    assert.equal(workbenchSource.includes("notifyBackendTaskCancelled"), true);
    assert.equal(workbenchSource.includes("backendRunState"), true);
    assert.equal(workbenchSource.includes("lastHeartbeatAt"), true);
    assert.equal(workbenchSource.includes('formData.append("projectId", projectId)'), true);
    assert.equal(workbenchSource.includes("projectId: image.projectId || projectId"), true);
    assert.equal(workbenchSource.includes('id.replace(/^task_/, "req_")'), true);
    assert.equal(workbenchSource.includes('backendRunState: "waiting"'), true);
    assert.equal(workbenchSource.includes('backendRunState: "active"'), true);
    assert.equal(workbenchSource.includes('backendRunState: "finished"'), true);
    assert.equal(workbenchSource.includes('backendRunState: "failed"'), true);
    assert.equal(workbenchSource.includes('backendRunState: "cancelled"'), true);

    assert.equal(taskCenterSource.includes("shortTaskRequestId"), true);
    assert.equal(taskCenterSource.includes("taskRunStateLabel"), true);
    assert.equal(taskCenterSource.includes("TaskMachinePhase"), true);
    assert.equal(taskCenterSource.includes("taskMachinePhase"), true);
    assert.equal(taskCenterSource.includes("TaskPhaseRail"), true);
    assert.equal(taskCenterSource.includes("结果核验"), true);
    assert.equal(taskCenterSource.includes("运行较久，仍在等服务端结果"), true);
    assert.equal(taskCenterSource.includes("请求 {shortTaskRequestId(task.requestId)}"), true);
    assert.equal(taskCenterSource.includes("项目 {task.projectName"), true);
    assert.equal(taskCenterSource.includes("进程 {taskRunStateLabel(task.backendRunState)}"), true);
    assert.equal(taskCenterSource.includes("buildTaskCenterGroups(matchedTasks, visibleCount, isDeferredQueuedTask, isTaskPossiblyStuck)"), true);
    assert.equal(taskCenterSource.includes("function buildTaskCenterGroups"), true);
    assert.equal(taskCenterSource.includes("for (const task of tasks)"), true);
    assert.equal(workbenchSource.includes("let running = 0"), true);
    assert.equal(workbenchSource.includes("tasks.filter(isTaskActivelyRunning).length"), false);
    assert.equal(workbenchSource.includes("tasks.filter(isDeferredQueuedTask).length"), false);
    assert.equal(taskCenterSource.includes("function taskNeedsAttention"), true);
    assert.equal(taskCenterSource.includes("const finishedTasks = matchedTasks.filter(isFinishedTask)"), false);
    assert.equal(taskCenterSource.includes("onDeleteFinished(finishedTasks.map((task) => task.id))"), true);
    assert.equal(taskCenterSource.includes("清理匹配已结束"), true);
    assert.equal(taskCenterSource.includes("activeTaskAction"), true);
    assert.equal(taskCenterSource.includes("confirmActionKey"), true);
    assert.equal(taskCenterSource.includes("runTaskAction"), true);
    assert.equal(taskCenterSource.includes("runConfirmedTaskAction"), true);
    assert.equal(taskCenterSource.includes("停止中"), true);
    assert.equal(taskCenterSource.includes("重试中"), true);
    assert.equal(taskCenterSource.includes("删除中"), true);
    assert.equal(taskCenterSource.includes("确认删除"), true);
    assert.equal(taskCenterSource.includes("清理中"), true);
    assert.equal(taskCenterSource.includes("确认清理"), true);
    assert.equal(workbenchSource.includes("function removeFinishedTasks(targetTaskIds?: string[])"), true);
    assert.equal(workbenchSource.includes("targetIdSet.has(task.id)"), true);
    assert.equal(taskCenterSource.includes('waiting: "等待"'), true);
    assert.equal(taskCenterSource.includes('active: "运行"'), true);
    assert.equal(taskCenterSource.includes('finished: "已完成"'), true);
    assert.equal(taskCenterSource.includes('failed: "异常"'), true);
    assert.equal(taskCenterSource.includes('cancelled: "已停"'), true);

    assert.equal(ledgerSource.includes("task-runs.local.json"), true);
    assert.equal(ledgerSource.includes("recordTaskRunStarted"), true);
    assert.equal(ledgerSource.includes("recordTaskRunFinished"), true);
    assert.equal(ledgerSource.includes("recordTaskRunFailed"), true);
    assert.equal(ledgerSource.includes("recordTaskRunCancelled"), true);
    assert.equal(ledgerSource.includes("removeTaskRuns"), true);
    assert.equal(ledgerSource.includes("clearFinishedTaskRuns"), true);
    assert.equal(ledgerSource.includes("taskRunResponseMeta"), true);
    assert.equal(ledgerSource.includes("已忽略后到的失败/取消记录"), true);
    assert.equal(ledgerSource.includes("sanitizeTaskRunOutputs"), true);
    assert.equal(ledgerSource.includes("requestIdSetFromList"), true);
    assert.equal(ledgerSource.includes("normalizeStoredTaskRuns"), true);
    assert.equal(ledgerSource.includes("store.runs.filter(isTaskRunRecord).slice"), false);
    assert.equal(ledgerSource.includes("new Set((requestIds || []).map"), false);
    assert.equal(ledgerSource.includes("new Set(requestIds.map"), false);
    assert.equal(ledgerSource.includes("resultGroupId?: string"), true);
    assert.equal(ledgerSource.includes("sourceTaskId?: string"), true);
    assert.equal(ledgerSource.includes("projectId?: string"), true);
    assert.equal(ledgerSource.includes("projectName?: string"), true);
    assert.equal(routeSource.includes("requestIds"), true);
    assert.equal(routeSource.includes("taskRunRequestIdLimit"), true);
    assert.equal(routeSource.includes("taskRunErrorMessage"), true);
    assert.equal(routeSource.includes("parseTaskRunPayload"), true);
    assert.equal(routeSource.includes("InvalidTaskRunPayloadError"), true);
    assert.equal(routeSource.includes("任务记录 JSON 无法解析"), true);
    assert.equal(routeSource.includes('taskRunErrorMessage("读取任务记录失败", error)'), true);
    assert.equal(routeSource.includes('taskRunErrorMessage("更新任务记录失败", error)'), true);
    assert.equal(routeSource.includes("emptyTaskRunSummary"), true);
    assert.equal(routeSource.includes("function taskRunSummary"), true);
    assert.equal(routeSource.includes("runs.filter((run) => run.state"), false);
    assert.equal(routeSource.includes("list.map((item) => stringValue(item))"), false);
    assert.equal(routeSource.includes("projectId"), true);
    assert.equal(routeSource.includes('action === "delete"'), true);
    assert.equal(routeSource.includes('action === "clear_finished"'), true);
    assert.equal(routeSource.includes('action !== "cancel"'), true);
    assert.equal(routeSource.includes("recordTaskRunCancelled"), true);
    assert.equal(routeSource.includes("summary"), true);
    assert.equal(generateRouteSource.includes("taskTraceFromFormData"), true);
    assert.equal(generateRouteSource.includes("taskTraceFromJson"), true);
    assert.equal(generateRouteSource.includes("recordTaskRunFinished(taskTrace"), true);
    assert.equal(generateRouteSource.includes("taskRunResponseMeta(taskTrace"), true);
    assert.equal(generateRouteSource.includes('storageKind: "results"'), true);
    assert.equal(generateRouteSource.includes("projectId: protectionContext.version?.projectId || taskTrace?.projectId"), true);
    assert.equal(editRouteSource.includes('storageKind: "results"'), true);
    assert.equal(redrawRouteSource.includes('storageKind: "results"'), true);
    assert.equal(workbenchSource.includes("normalizeImageTaskResponse"), true);
    assert.equal(workbenchSource.includes("data.outputs"), true);
    assert.equal(workbenchSource.includes("data.image"), true);
    assert.equal(workbenchSource.includes("backendTaskSyncKey"), true);
    assert.equal(workbenchSource.includes("dismissedTaskStorageKey"), true);
    assert.equal(workbenchSource.includes("dismissedImageStorageKey"), true);
    assert.equal(workbenchSource.includes("filterDismissedRestoredNodes"), true);
    assert.equal(workbenchSource.includes("imageSourceDismissedForProject"), true);
    assert.equal(workbenchSource.includes('body: JSON.stringify({ action: "delete", requestIds, projectId })'), true);
    assert.equal(workbenchSource.includes('body: JSON.stringify({ action: "clear_finished", projectId })'), true);
    assert.equal(workbenchSource.includes("服务端任务记录同步删除失败"), true);
    assert.equal(workbenchSource.includes("服务端停止同步失败"), true);
    assert.equal(workbenchSource.includes("服务端任务记录同步清理失败"), true);
    assert.equal(workbenchSource.includes("activeProjectSyncFailed"), true);
    assert.equal(workbenchSource.includes("同步默认项目失败"), true);
    assert.equal(workbenchSource.includes("图片版本关系同步失败"), true);
    assert.equal(workbenchSource.includes("new URLSearchParams({ requestIds: backendTaskSyncKey, projectId })"), true);
    assert.equal(workbenchSource.includes("serverTaskRunOutputs"), true);
    assert.equal(workbenchSource.includes("activeProjectIdRef.current === taskProjectId"), true);
    assert.equal(workbenchSource.includes("refreshProjectHistory"), true);
    assert.equal(workbenchSource.includes("imageBelongsToProject"), true);
    assert.equal(workbenchSource.includes("fetchTaskHistoryOutputsByRequests"), true);
    assert.equal(workbenchSource.includes("const seenRequestIds = new Set<string>()"), true);
    assert.equal(workbenchSource.includes("new Set(requestIds.map"), false);
    assert.equal(workbenchSource.includes("new Map(uniqueRequestIds.map"), false);
    assert.equal(workbenchSource.includes("任务记录未完整写入，但已从项目结果库核验到图片"), true);
    assert.equal(workbenchSource.includes("image.sourceRequestId === task.requestId"), true);
    assert.equal(workbenchSource.includes("image.sourceNodeId === task.nodeId"), true);
    assert.equal(workbenchSource.includes("imageSourceSummary"), true);
    assert.equal(workbenchSource.includes("imageSourceDetailLines"), true);
    assert.equal(workbenchSource.includes("function imageBranchVersions"), true);
    assert.equal(workbenchSource.includes("function latestImagesForResultGroup"), true);
    assert.equal(workbenchSource.includes("imageBranchVersions(historyImages, image)"), true);
    assert.equal(workbenchSource.includes("latestImagesForResultGroup(historyImages, image)"), true);
    assert.equal(workbenchUiSource.includes("来源节点"), true);
    assert.equal(workbenchUiSource.includes("请求ID"), true);
    assert.equal(workbenchSource.includes("activeActionLabel"), true);
    assert.equal(workbenchSource.includes("confirmLightboxAction"), true);
    assert.equal(workbenchSource.includes("if (activeActionLabel) return"), true);
    assert.equal(workbenchSource.includes("runConfirmedAction"), true);
    assert.equal(workbenchSource.includes("再点一次确认"), true);
    assert.equal(workbenchSource.includes("disabled={actionBusy}"), true);
    assert.equal(workbenchSource.includes("onToggleMoreActions"), true);
    assert.equal(workbenchSource.includes("disabled={actionBusy} onClick={() => void onRunAction(\"下载 PNG\""), true);
    assert.equal(workbenchSource.includes("ProjectCreationModal"), true);
    assert.equal(projectCreationSource.includes("export function ProjectCreationModal"), true);
    assert.equal(projectCreationSource.includes("const [creating, setCreating]"), true);
    assert.equal(projectCreationSource.includes("onSubmit={submitProject}"), true);
    assert.equal(projectCreationSource.includes('type="submit"'), true);
    assert.equal(projectCreationSource.includes("disabled={creating}"), true);
    assert.equal(projectCreationSource.includes("创建中"), true);
    assert.equal(workbenchSource.includes("activeInspectorAction"), true);
    assert.equal(workbenchSource.includes("runInspectorAction"), true);
    assert.equal(workbenchSource.includes("打开中"), true);
    assert.equal(workbenchSource.includes("启动中"), true);
    assert.equal(workbenchSource.includes("activeRecommendation"), true);
    assert.equal(workbenchSource.includes("activeSelection"), true);
    assert.equal(workbenchSource.includes("activeQuickAction"), true);
    assert.equal(workbenchSource.includes("创建二次优化节点"), true);
    assert.equal(workbenchSource.includes("创建改尺寸任务"), true);
    assert.equal(workbenchSource.includes("创建 AI 画质增强任务"), true);
    assert.equal(workbenchSource.includes("打开局部修改"), true);
    assert.equal(workbenchSource.includes("删除中..."), true);
    assert.equal(workbenchSource.includes("确认删除"), true);
    assert.equal(workbenchSource.includes("服务端确认完成，结果已恢复到画布"), true);
    assert.equal(workbenchSource.includes("appendTaskTrace(formData"), true);
    assert.equal(workbenchSource.includes("taskTracePayload(taskId"), true);
    assert.equal(workbenchContractSource.includes('type RightPanelTab = "params" | "tasks" | "library" | "images"'), true);
    assert.equal(workbenchUiSource.includes("图片管理"), true);
    assert.equal(workbenchUiSource.includes("ImageManagerPanel"), true);
    assert.equal(workbenchUiSource.includes("imageDeletionProtection"), true);
    assert.equal(workbenchUiSource.includes("selectedSummary"), true);
    assert.equal(workbenchUiSource.includes("activeKeys"), false);
    assert.equal(workbenchUiSource.includes("当前显示 {filteredRows.length}/{managedRows.length} 张"), true);
    assert.equal(workbenchUiSource.includes("downloadingKey"), true);
    assert.equal(workbenchUiSource.includes("disabled={Boolean(downloadingKey)}"), true);
    assert.equal(workbenchUiSource.includes("\"下载中\""), true);
    assert.equal(workbenchUiSource.includes("batchActionLabel"), true);
    assert.equal(workbenchUiSource.includes("runBatchAction"), true);
    assert.equal(workbenchUiSource.includes("actionMessage"), true);
    assert.equal(workbenchUiSource.includes("\"移动中...\""), true);
    assert.equal(workbenchUiSource.includes("rowActionKey"), true);
    assert.equal(workbenchUiSource.includes("runRowAction"), true);
    assert.equal(workbenchUiSource.includes("confirmActionKey"), true);
    assert.equal(workbenchUiSource.includes("runConfirmedBatchAction"), true);
    assert.equal(workbenchUiSource.includes("runConfirmedRowAction"), true);
    assert.equal(workbenchUiSource.includes("loadingMoreKey"), true);
    assert.equal(workbenchSource.includes("batchImageMutationConcurrency = 3"), true);
    assert.equal(workbenchSource.includes("mapWithConcurrency(candidates, batchImageMutationConcurrency"), true);
    assert.equal(workbenchSource.includes("metadataPatchConcurrency = 4"), true);
    assert.equal(workbenchSource.includes("mapWithConcurrency(\n      images.filter((image) => image.fileName),\n      metadataPatchConcurrency"), true);
    assert.equal(workbenchUiSource.includes("确认彻删"), true);
    assert.equal(workbenchUiSource.includes("确认移入回收站"), true);
    assert.equal(workbenchUiSource.includes("\"恢复中\""), true);
    assert.equal(workbenchUiSource.includes("\"处理中\""), true);
    assert.equal(workbenchSource.includes("onDeleteHistory={deleteHistoryImage}"), true);
    assert.equal(workbenchSource.includes("onRestoreHistory={restoreHistoryImage}"), true);
    assert.equal(workbenchSource.includes("onBatchDeleteHistory={deleteHistoryImagesBatch}"), true);
    assert.equal(workbenchSource.includes("batchImageActionSummary"), true);
    assert.equal(workbenchSource.includes("张失败"), true);
    assert.equal(workbenchSource.includes("张跳过"), true);
    assert.equal(workbenchSource.includes("loadImageManagerHistory"), true);
    assert.equal(workbenchSource.includes("loadImageManagerTrash"), true);
    assert.equal(workbenchSource.includes('new URLSearchParams({ limit: "60", offset: String(offset) })'), true);
    assert.equal(workbenchSource.includes('new URLSearchParams({ mode: "trash", limit: "60", offset: String(offset) })'), true);
    assert.equal(workbenchUiSource.includes("回收站"), true);
    assert.equal(workbenchSource.includes('action: "restore"'), true);
    assert.equal(generatedImagesRouteSource.includes('const generatedTrashDirName = "_trash"'), true);
    assert.equal(generatedImagesRouteSource.includes("generatedImageErrorMessage"), true);
    assert.equal(generatedImagesRouteSource.includes("generatedImageListMaxLimit"), true);
    assert.equal(generatedImagesRouteSource.includes('generatedImageErrorMessage("读取图片列表失败", error)'), true);
    assert.equal(generatedImagesRouteSource.includes('generatedImageErrorMessage("更新图片信息失败", error)'), true);
    assert.equal(generatedImagesRouteSource.includes('generatedImageErrorMessage("删除失败", error)'), true);
    assert.equal(generatedImagesRouteSource.includes("moveGeneratedImageToTrash"), true);
    assert.equal(generatedImagesRouteSource.includes("restoreGeneratedImage"), true);
    assert.equal(generatedHistorySource.includes("trashOnly?: boolean"), true);
    assert.equal(generatedHistorySource.includes('entry.name === generatedTrashDirName && !options.includeTrash'), true);
    assert.equal(generatedHistorySource.includes("historyImageMetadataFromSaved(savedMetadata) || await sharp(fullPath).metadata()"), true);
    assert.equal(generatedHistorySource.includes("numberValue(outputSize?.width) || numberValue(savedMetadata.width)"), true);
    assert.equal(generatedHistorySource.includes("sortTime: historyMetadataSortTime(savedMetadata)"), true);
    assert.equal(generatedHistorySource.includes("const savedFileSizeBytes = numberValue(savedMetadata.fileSizeBytes)"), true);
    assert.equal(generatedHistorySource.includes("const savedGeneratedAt = stringValue(savedMetadata.generatedAt)"), true);
    assert.equal(generatedHistorySource.includes("savedFileSizeBytes === undefined || !savedGeneratedAt ? await stat(fullPath) : undefined"), true);
    assert.equal(generatedHistorySource.includes("fileSizeBytes: savedFileSizeBytes ?? fileStat?.size ?? 0"), true);
    assert.equal(generatedHistorySource.includes("cachedFileStat || await stat(fullPath)"), false);
    assert.equal(generatedHistorySource.includes("historySortTime(metadata"), false);
    assert.equal(generatedHistorySource.includes("historyDirectoryReadConcurrency = 16"), true);
    assert.equal(generatedHistorySource.includes("historyMetadataReadConcurrency = 48"), true);
    assert.equal(generatedHistorySource.includes("historyImageBuildConcurrency = 8"), true);
    assert.equal(generatedHistorySource.includes("mapWithConcurrency(entries, historyDirectoryReadConcurrency"), true);
    assert.equal(generatedHistorySource.includes("Promise.all(entries.map"), false);
    assert.equal(generatedHistorySource.includes("mapWithConcurrency("), true);
    assert.equal(workbenchSource.includes("imageMatchesGeneratedFile"), true);
    assert.equal(workbenchSource.includes("applyHistoryFavoriteState"), true);
    assert.equal(workbenchSource.includes("favorite: nextFavorite"), true);
    assert.equal(workbenchSource.includes("metadata: { favorite: nextFavorite }"), true);
    assert.equal(workbenchSource.includes("throw new Error(\"收藏状态保存失败。\")"), true);
    assert.equal(workbenchSource.includes("data.error || `删除项目失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `打开项目失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `项目列表刷新失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("打开项目失败：接口没有返回有效项目数据。"), true);
    assert.equal(workbenchSource.includes("projectListLoadingRef"), true);
    assert.equal(workbenchSource.includes("projectListLoading"), true);
    assert.equal(workbenchSource.includes("projectListError"), true);
    assert.equal(workbenchSource.includes("materialLibrariesLoadingRef"), true);
    assert.equal(workbenchSource.includes("data.error || `素材库刷新失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `结果加载失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `图片管理加载失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `回收站加载失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("data.error || `公开资料查询失败（HTTP ${response.status}）。`"), true);
    assert.equal(workbenchSource.includes("readResponseErrorMessage(response, \"删除结果图片失败\")"), true);
    assert.equal(workbenchSource.includes("readResponseErrorMessage(response, \"恢复图片失败\")"), true);
    assert.equal(materialLibrariesRouteSource.includes("materialLibraryErrorMessage"), true);
    assert.equal(materialLibrariesRouteSource.includes('materialLibraryErrorMessage("读取素材库失败", error)'), true);
    assert.equal(materialLibrariesRouteSource.includes('materialLibraryErrorMessage("保存素材库失败", error)'), true);
    assert.equal(materialLibrariesRouteSource.includes("parseMaterialLibraryPayload"), true);
    assert.equal(materialLibrariesRouteSource.includes("InvalidMaterialLibraryPayloadError"), true);
    assert.equal(materialLibrariesRouteSource.includes("素材库 JSON 无法解析"), true);
    assert.equal(materialLibrariesRouteSource.includes("function materialLibraryItemCounts"), true);
    assert.equal(materialLibrariesRouteSource.includes('library.items.filter((item) => item.type === "style_rule")'), false);
    assert.equal(materialLibrariesRouteSource.includes('library.items.filter((item) => item.type === "reference")'), false);
    assert.equal(workbenchSource.includes("refreshMaterialLibraries({ quiet: true })"), true);
    assert.equal(workbenchSource.includes("imageImportInFlightRef"), true);
    assert.equal(workbenchSource.includes("正在导入上一张图片，请稍候。"), true);
    assert.equal(workbenchSource.includes("current.filter((item) => item.id !== node.id)"), true);
    assert.equal(workbenchSource.includes("onRefreshProjects"), true);
    assert.equal(workbenchSource.includes("项目列表刷新失败。"), true);
    assert.equal(workbenchSource.includes("ProjectHomeScreen"), true);
    assert.equal(projectHomeSource.includes("export function ProjectHomeScreen"), true);
    assert.equal(projectHomeSource.includes("ProjectHomeItem"), true);
    assert.equal(projectHomeSource.includes("正在刷新项目列表"), true);
    assert.equal(workbenchSource.includes("organization: explicitAdd"), true);
    assert.equal(workbenchSource.includes("保留|保持|沿用|复用|还原"), true);
    assert.equal(workbenchSource.includes("visibleRequests.organization"), true);
    assert.equal(projectLibraryPanelSource.includes("confirmDeleteId"), true);
    assert.equal(projectLibraryPanelSource.includes("deletingId"), true);
    assert.equal(projectLibraryPanelSource.includes("openingId"), true);
    assert.equal(projectLibraryPanelSource.includes("refreshing"), true);
    assert.equal(projectLibraryPanelSource.includes("确认删除"), true);
    assert.equal(projectLibraryPanelSource.includes("删除中"), true);
    assert.equal(projectLibraryPanelSource.includes("刷新中"), true);
    assert.equal(projectLibraryPanelSource.includes("打开中..."), true);
    assert.equal(projectLibraryPanelSource.includes("window.confirm"), false);
    assert.equal(assetLibraryPanelSource.includes("activePanelAction"), true);
    assert.equal(assetLibraryPanelSource.includes("runPanelAction"), true);
    assert.equal(assetLibraryPanelSource.includes("uploadingCategory"), true);
    assert.equal(assetLibraryPanelSource.includes("补全中"), true);
    assert.equal(assetLibraryPanelSource.includes("刷新中"), true);
    assert.equal(assetLibraryPanelSource.includes("上传中"), true);
    assert.equal(assetLibraryPanelSource.includes("应用中"), true);
    assert.equal(assetLibraryPanelSource.includes("忽略中"), true);
    assert.equal(workbenchSource.includes("window.confirm"), false);
    assert.equal(workbenchSource.includes("skipConfirm"), false);
    assert.equal(workbenchSource.includes("这张图已受保护"), true);
    assert.equal(workbenchUiSource.includes("可清理"), true);
    assert.equal(workbenchUiSource.includes('"需复查"'), true);
    assert.equal(workbenchUiSource.includes("reviewCount"), true);
    assert.equal(workbenchUiSource.includes("imageManagerQualityTag"), true);
    assert.equal(workbenchUiSource.includes("不可交付"), true);
    assert.equal(workbenchUiSource.includes("质检未过"), true);
    assert.equal(workbenchUiSource.includes("搜索文件、来源、质检、保护状态"), true);
    assert.equal(taskCenterSource.includes("搜索节点、模型、质检、请求、错误、状态"), true);
    assert.equal(taskCenterSource.includes("taskHasQualityConcern"), true);
    assert.equal(taskCenterSource.includes("结果已在画布，但质检提示未完全通过"), true);
    assert.equal(generatedImagesRouteSource.includes("requestIds"), true);
    assert.equal(generatedImagesRouteSource.includes("readGeneratedMetadata"), true);
    assert.equal(generatedImagesRouteSource.includes("parseGeneratedImagePayload"), true);
    assert.equal(generatedImagesRouteSource.includes("InvalidGeneratedImagePayloadError"), true);
    assert.equal(generatedImagesRouteSource.includes("更新图片 JSON 无法解析"), true);
    assert.equal(generatedImagesRouteSource.includes("删除图片 JSON 无法解析"), true);
    assert.equal(generatedHistorySource.includes("requestIds?: string[]"), true);
    assert.equal(generatedHistorySource.includes("requestScopeFromList"), true);
    assert.equal(generatedHistorySource.includes("new Set((options.requestIds || []).map"), false);
    assert.equal(generatedHistorySource.includes("new Set([...requestIdSet].map"), false);
    assert.equal(generatedHistorySource.includes("sourceRequestId && requestIdSet.has(sourceRequestId)"), true);
    assert.equal(historyPanelSource.includes("historySourceLine"), true);
    assert.equal(historyPanelSource.includes("sourceRequestId?: string"), true);
    assert.equal(historyPanelSource.includes("来源未记录"), true);
    assert.equal(historyPanelSource.includes('aria-label="加入画布"'), true);
    assert.equal(historyPanelSource.includes('aria-label="改尺寸"'), true);
    assert.equal(historyPanelSource.includes('aria-label="画质增强"'), true);
    assert.equal(historyPanelSource.includes("confirmDeleteKey"), true);
    assert.equal(historyPanelSource.includes("确认删除图片"), true);
    assert.equal(historyPanelSource.includes("actionMessage"), true);
    assert.equal(historyPanelSource.includes("deletingKey"), true);
    assert.equal(historyPanelSource.includes("favoritingKey"), true);
    assert.equal(historyPanelSource.includes("toggleFavorite"), true);
    assert.equal(historyPanelSource.includes("filterCounts"), true);
    assert.equal(historyPanelSource.includes("loadingMoreLocal"), true);
    assert.equal(historyPanelSource.includes("loadMoreResults"), true);
    assert.equal(historyPanelSource.includes("runInlineAction"), true);
    assert.equal(historyPanelSource.includes("historyImageKey"), true);
    assert.equal(historyPanelSource.includes("truncate text-[11px] text-white/38"), true);
    assert.equal(historyPanelSource.includes("truncate text-[11px] text-[#ffe1a0]/76"), true);
    assert.equal(historyPanelSource.includes("rounded-full px-1.5 py-0.5 text-[11px] leading-none"), true);
    assert.equal(historyPanelSource.includes("rounded-[14px] border px-3 py-2 text-[10px] leading-4"), false);
    assert.equal(imageManagerPanelSource.includes("truncate text-[11px] text-white/40"), true);
    assert.equal(imageManagerPanelSource.includes("truncate text-[11px] text-white/36"), true);
    assert.equal(imageManagerPanelSource.includes("rounded-full border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-2 py-0.5 text-[11px]"), true);
    assert.equal(imageManagerPanelSource.includes("apple-button h-8 px-2.5 text-[10px]"), false);
    assert.equal(imageManagerPanelSource.includes("text-[9px] text-white/34"), false);
    assert.equal(workbenchUiSource.includes("favoritingKey"), true);
    assert.equal(workbenchUiSource.includes("\"收藏中\""), true);
    assert.equal(workbenchUiSource.includes("\"取消中\""), true);
    assert.equal(imageUtilsSource.includes("GeneratedStorageKind"), true);
    assert.equal(imageUtilsSource.includes("getGeneratedProjectRelativeDir"), true);
    assert.equal(imageUtilsSource.includes('path.join("projects", safeProjectId, kind)'), true);
    assert.equal(imageResourceRouteSource.includes('formData.get("projectId")'), true);
    assert.equal(imageResourceRouteSource.includes("const [saved, metadata, alphaCheck] = await Promise.all"), true);
    assert.equal(imageResourceRouteSource.includes("const saved = await saveImageBuffer"), false);
    assert.equal(imageResourceRouteSource.includes('storageKind: file.name?.startsWith("mask-") ? "masks" : "uploads"'), true);
    assert.equal(imageQualitySource.includes("sourceDetailScore"), true);
    assert.equal(imageQualitySource.includes("buildClarityComparison(sourceDetailScore, detailScore)"), true);
    assert.equal(imageQualitySource.includes("const detailScore = await estimateDetailScore(input)"), false);
    assert.equal(imageQualitySource.includes("包含项目真实文字、Logo、二维码或联系方式"), true);
    assert.equal(imageQualitySource.includes("逐项核对项目真实信息"), true);
  });
});

describe("AI compositing", () => {
  it("turns the old two-image fuse flow into subject-in-scene AI compositing", async () => {
    const [promptSource, routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/fuse-images/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
    ]);

    assert.equal(promptSource.includes("任务类型：AI合成。不是简单融合两张图，而是把图1的主体自然合成到图2的场景里。"), true);
    assert.equal(promptSource.includes("图1 = 主体来源；图2 = 场景来源"), true);
    assert.equal(promptSource.includes("本次输出：方案A，真实自然合成。"), true);
    assert.equal(promptSource.includes("本次输出：方案B，广告设计合成。"), true);
    assert.equal(promptSource.includes("合成要点：大小、位置、透视、接触、遮挡、光向、投影、反射、色温、颗粒、清晰度、边缘和景深一致"), true);

    assert.equal(routeSource.includes('(["natural", "advertising"] as const)'), true);
    assert.equal(routeSource.includes("const [first, second] = await Promise.all"), true);
    assert.equal(routeSource.includes('readImageInput(formData, "imageA", "sourceUrlA", "subject-source.png")'), true);
    assert.equal(routeSource.includes('readImageInput(formData, "imageB", "sourceUrlB", "scene-source.png")'), true);
    assert.equal(routeSource.includes('const first = await readImageInput(formData, "imageA"'), false);
    assert.equal(routeSource.includes("const brandFilesPromise = Promise.all"), true);
    assert.equal(routeSource.includes("const [imageA, imageB, brandFiles] = await Promise.all"), true);
    assert.equal(routeSource.includes("const brandFiles = await brandFilesPromise"), false);
    assert.equal(routeSource.includes("const brandFiles = await Promise.all(brandReferenceImages.map"), false);
    assert.equal(routeSource.includes("wantsMultipleImageOutputs"), true);
    assert.equal(routeSource.includes("getImageRatio(second.buffer)"), true);
    assert.equal(routeSource.includes('mode: "AI合成"'), true);
    assert.equal(routeSource.includes("resultItems.slice(0, targetCount)"), true);
    assert.equal(routeSource.includes('processToTarget(raw, context.ratio, context.quality, "png", "strict_full_bleed")'), true);
    assert.equal(routeSource.includes("buildFuseNativeRatioRetryPrompt"), true);
    assert.equal(routeSource.includes("markFuseRatioFallback"), false);
    assert.equal(routeSource.includes('"safe_full_bleed"'), false);
    assert.equal(routeSource.includes("buildFuseModelNativeSizeFallbackPrompt"), true);
    assert.equal(routeSource.includes("shouldRetryFuseSizeWithNativeFallback"), true);
    assert.equal(routeSource.includes("getOpenAIImageSize(ratio)"), true);
    assert.equal(routeSource.includes("安全全画幅比例适配"), false);
    assert.equal(routeSource.includes("buildFuseCompositionRetryPrompt"), true);
    assert.equal(routeSource.includes("shouldRetryFuseQuality"), true);

    assert.equal(workbenchSource.includes('label: "AI合成"'), true);
    assert.equal(workbenchSource.includes("图1主体放入图2场景"), true);
    assert.equal(workbenchSource.includes("默认先输出 1 张真实自然合成；用户明确要求多方案时再输出广告设计合成方案。"), true);
    assert.equal(workbenchSource.includes('{ id: "imageA", label: "主体" }'), true);
    assert.equal(workbenchSource.includes('{ id: "imageB", label: "场景" }'), true);
  });
});

describe("Reference remake", () => {
  it("adds a standalone reference remake node and API route", async () => {
    const [routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../app/api/reference-remake/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
    ]);

    assert.equal(workbenchSource.includes('"reference_remake"'), true);
    assert.equal(workbenchSource.includes('label: "参考图重制"'), true);
    assert.equal(workbenchSource.includes('fetch("/api/reference-remake"'), true);
    assert.equal(workbenchSource.includes("referenceRemakeModeParam"), true);
    assert.equal(workbenchSource.includes("快速复刻"), true);
    assert.equal(workbenchSource.includes("精准重制"), true);
    assert.equal(routeSource.includes("taskTraceFromFormData(formData, \"reference_remake\""), true);
    assert.equal(routeSource.includes("recordTaskRunStarted"), true);
    assert.equal(routeSource.includes("recordTaskRunFinished"), true);
    assert.equal(routeSource.includes("getAnalysisModel()"), true);
    assert.equal(routeSource.includes("openai.responses.create"), true);
    assert.equal(routeSource.includes("openai.images.edit"), true);
    assert.equal(routeSource.includes("不是高清修复任务"), true);
    assert.equal(routeSource.includes("不要保留原图里的透视变形"), false);
    assert.equal(routeSource.includes("perspective distortion, glare, stains"), true);
    assert.equal(workbenchSource.includes("在底部输入框写需求"), true);
    assert.equal(workbenchSource.includes("confirmedTextLayers"), false);
    assert.equal(routeSource.includes("textOverride"), true);
    assert.equal(routeSource.includes("compositeDetectedText"), true);
    assert.equal(routeSource.includes("resolveReferenceDesignRatio"), true);
    assert.equal(routeSource.includes("getOpenAIConstrainedTargetPixels(targetDesignRatio, input.quality)"), true);
    assert.equal(routeSource.includes("ratioFromBbox(analysis.design_bbox)"), true);
    assert.equal(routeSource.includes("detectColorfulDesignBbox"), true);
    assert.equal(routeSource.includes("chooseReferenceDesignBbox"), true);
    assert.equal(routeSource.includes("normalizeFlatAssetOutput"), true);
    assert.equal(routeSource.includes("Flat sign/label asset policy"), true);
    assert.equal(routeSource.includes("Flat artwork asset policy"), true);
    assert.equal(routeSource.includes("buildReferenceRemakeProtectionContext"), true);
    assert.equal(routeSource.includes("protectionContext: buildReferenceRemakeProtectionContext(effectiveAnalysis)"), true);
    assert.equal(routeSource.includes("const [canvasFile, referenceFile] = await Promise.all"), true);
    assert.equal(routeSource.includes("const canvasFile = await toFile(canvas"), false);
    assert.equal(routeSource.includes("const referenceFile = await toFile(input.imageBuffer"), false);
    assert.equal(routeSource.includes("const [actual, saved] = await Promise.all"), true);
    assert.equal(routeSource.includes("const actual = await readImageMetadata(finalPng)"), false);
    assert.equal(routeSource.includes("const saved = await saveImageBuffer(finalPng"), false);
    assert.equal(routeSource.includes("wooden door"), true);
    assert.equal(routeSource.includes("fitImageOnCleanWhiteCanvas"), true);
    assert.equal(routeSource.includes('background: "#ffffff"'), true);
    assert.equal(workbenchSource.includes('InspectorSection title="参考图重制"'), true);
    assert.equal(routeSource.includes("nodeOperation: \"reference_remake\""), true);
  });
});

describe("Workbench compact typography", () => {
  it("keeps project and material panel status text above the tiny label floor", async () => {
    const panelSources = await Promise.all([
      readFile(new URL("../components/workbench/project-creation-modal.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/project-home-screen.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/project-library-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/asset-library-panel.tsx", import.meta.url), "utf8"),
    ]);

    assert.equal(panelSources.some((source) => source.includes("text-[9px]") || source.includes("text-[10px]")), false);
    assert.equal(panelSources.some((source) => source.includes("leading-4")), false);
  });

  it("keeps result and task status cards readable in dense panels", async () => {
    const [taskCenterSource, nodeResultsSource, resultPreviewSource, deliveryBadgeSource] = await Promise.all([
      readFile(new URL("../components/workbench/task-center.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/node-results-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/result-preview-tools.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/delivery-status-badge.tsx", import.meta.url), "utf8"),
    ]);

    assert.equal(taskCenterSource.includes("rounded-full px-2.5 py-1 text-[10px]"), false);
    assert.equal(taskCenterSource.includes("rounded-[14px] border px-3 py-2 text-[10px] leading-4"), false);
    assert.equal(taskCenterSource.includes("rounded-full px-2.5 py-1 text-[11px]"), true);
    assert.equal(taskCenterSource.includes("rounded-[14px] border px-3 py-2 text-[11px] leading-5"), true);
    assert.equal(nodeResultsSource.includes("text-[10px]"), false);
    assert.equal(resultPreviewSource.includes("px-2.5 py-1 text-[10px] font-semibold"), false);
    assert.equal(deliveryBadgeSource.includes("text-[8px]"), false);
    assert.equal(deliveryBadgeSource.includes("px-2 py-0.5 text-[11px] leading-5"), true);
  });
});

describe("Account navigation", () => {
  it("keeps account actions separate from API settings", async () => {
    const [accountSwitcherSource, accountsPageSource, settingsPageSource, globalsSource, authSource] = await Promise.all([
      readFile(new URL("../components/account-switcher.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/accounts/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(accountSwitcherSource.includes("子账号管理"), true);
    assert.equal(accountSwitcherSource.includes("切换账号"), true);
    assert.equal(accountSwitcherSource.includes('href="/accounts"'), true);
    assert.equal(accountSwitcherSource.includes("account-menu__identity"), false);
    assert.equal(accountSwitcherSource.includes("displayName"), false);
    assert.equal(accountsPageSource.includes("<AdminAccountsManager />"), true);
    assert.equal(settingsPageSource.includes("AdminAccountsManager"), false);
    assert.equal(globalsSource.includes("account-menu__identity"), false);
    assert.equal(authSource.includes("let ownerCount = 0"), true);
    assert.equal(authSource.includes('store.users.filter((user) => user.role === "owner").length'), false);
  });
});

describe("Collection normalization performance", () => {
  it("keeps hot array cleanup paths single-pass", async () => {
    const [projectSystemSource, promptSource, assetLibrarySource, referenceRemakeSource, maskEditSource] = await Promise.all([
      readFile(new URL("../lib/project-system.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/prompt.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/workbench/asset-library-panel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/reference-remake/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/mask-edit-image/route.ts", import.meta.url), "utf8"),
    ]);

    assert.equal(projectSystemSource.includes("value.filter((item): item is string"), false);
    assert.equal(promptSource.includes("source.sellingPoints.map(cleanPromptText).filter(Boolean)"), false);
    assert.equal(assetLibrarySource.includes("Array.from(new Set((matches || []).map"), false);
    assert.equal(referenceRemakeSource.includes("data.image_layers.map(stringValue).filter(Boolean)"), false);
    assert.equal(referenceRemakeSource.includes("data.risks.map(stringValue).filter(Boolean)"), false);
    assert.equal(maskEditSource.includes(".filter((item) => item.text).slice(0, 8)"), false);
    assert.equal(maskEditSource.includes(".filter((item) => item.label).slice(0, 8)"), false);
  });
});

describe("Design optimization", () => {
  it("adds a standalone design optimization node and modular industry-aware API route", async () => {
    const [routeSource, workbenchSource] = await Promise.all([
      readFile(new URL("../app/api/design-optimize/route.ts", import.meta.url), "utf8"),
      readWorkbenchSource(),
    ]);

    assert.equal(workbenchSource.includes('"design_optimize"'), true);
    assert.equal(workbenchSource.includes('label: "设计优化"'), true);
    assert.equal(workbenchSource.includes('fetch("/api/design-optimize"'), true);
    assert.equal(workbenchSource.includes("保守优化"), true);
    assert.equal(workbenchSource.includes("专业优化"), true);
    assert.equal(workbenchSource.includes("大幅优化"), true);
    assert.equal(workbenchSource.includes("designComparisonModeParam"), true);
    assert.equal(workbenchSource.includes("compareBefore"), true);
    assert.equal(routeSource.includes("taskTraceFromFormData(formData, \"design_optimize\""), true);
    assert.equal(routeSource.includes("recordTaskRunStarted"), true);
    assert.equal(routeSource.includes("recordTaskRunFinished"), true);
    assert.equal(routeSource.includes("getAnalysisModel()"), true);
    assert.equal(routeSource.includes("openai.responses.create"), true);
    assert.equal(routeSource.includes("openai.images.edit"), true);
    assert.equal(routeSource.includes("buildBasePrompt"), true);
    assert.equal(routeSource.includes("industryPromptFor"), true);
    assert.equal(routeSource.includes("designTypePromptFor"), true);
    assert.equal(routeSource.includes("scenePromptFor"), true);
    assert.equal(routeSource.includes("buildSafetyRules"), true);
    assert.equal(routeSource.includes("buildComparisonPrompt"), true);
    assert.equal(routeSource.includes("buildDesignOptimizationProtectionContext"), true);
    assert.equal(routeSource.includes("protectionContext: buildDesignOptimizationProtectionContext(analysis)"), true);
    assert.equal(routeSource.includes("const [actual, saved] = await Promise.all"), true);
    assert.equal(routeSource.includes("const [comparisonSaved, comparisonMeta] = await Promise.all"), true);
    assert.equal(routeSource.includes("const actual = await readImageMetadata(finalPng)"), false);
    assert.equal(routeSource.includes("const saved = await saveImageBuffer(finalPng"), false);
    assert.equal(routeSource.includes("const comparisonSaved = await saveImageBuffer(comparisonPng"), false);
    assert.equal(routeSource.includes("const comparisonMeta = await readImageMetadata(comparisonPng)"), false);
    assert.equal(routeSource.includes("medical/health"), true);
    assert.equal(routeSource.includes("beauty/cosmetics"), true);
    assert.equal(routeSource.includes("beer/beverage"), true);
    assert.equal(routeSource.includes("food design"), true);
    assert.equal(routeSource.includes("government/public-service"), true);
    assert.equal(routeSource.includes("nodeOperation: \"design_optimize\""), true);
    assert.equal(routeSource.includes("sourceCompareUrl"), true);
    assert.equal(routeSource.includes("Do not draw a design audit report"), true);
  });
});
