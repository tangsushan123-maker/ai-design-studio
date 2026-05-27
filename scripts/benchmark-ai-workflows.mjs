import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { File } from "node:buffer";
import sharp from "sharp";

const cwd = process.cwd();
const baseUrl = process.env.BENCHMARK_BASE_URL || "http://127.0.0.1:3000";
const benchmarkMode = process.env.BENCHMARK_MODE || "full";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const projectId = `benchmark-ai-${runId}`;
const reportDir = path.join(cwd, ".cleanup-reports");
const reportPath = path.join(reportDir, `ai-task-benchmark-${runId}.json`);
const defaultTimeoutMs = Number(process.env.BENCHMARK_TIMEOUT_MS || 15 * 60 * 1000);

const sources = {
  poster: "/generated/design-20260523-asset-standard-7d185a6f.png",
  product: "/generated/design-20260523-asset-standard-ea1d312d.png",
  ip: "/generated/design-20260523-ip-standard-0c461e7f.png",
  wideLogo: "/generated/design-20260523-logo-standard-50a0bfaa.png",
  landscape: "/generated/design-20260523-900x383-standard-53080279.png",
};

const protectionContext = {
  version: {
    projectId,
    source: "ai-workflow-benchmark",
    runId,
  },
};

const allResults = {
  runId,
  projectId,
  baseUrl,
  benchmarkMode,
  startedAt: new Date().toISOString(),
  sources,
  sequential: [],
  concurrency: [],
  summary: null,
};

await fs.mkdir(reportDir, { recursive: true });

function log(message) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[${stamp}] ${message}`);
}

function requestMeta(name) {
  const id = `${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${randomUUID().slice(0, 8)}`;
  return {
    requestId: `req_${runId}_${id}`,
    taskId: `task_${runId}_${id}`,
    projectId,
    nodeId: `node_${id}`,
    nodeName: name,
    nodeKind: name.split("_")[0] || "benchmark",
  };
}

function appendTraceToForm(form, meta) {
  for (const [key, value] of Object.entries(meta)) form.append(key, value);
  form.append("protectionContext", JSON.stringify(protectionContext));
}

function withTraceJson(body, meta) {
  return { ...body, ...meta, protectionContext };
}

async function fetchJson(route, options = {}, timeoutMs = defaultTimeoutMs) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  return { status: response.status, ok: response.ok, data };
}

async function taskRun(requestId) {
  const response = await fetchJson(`/api/task-runs?requestIds=${encodeURIComponent(requestId)}`, {}, 30_000).catch((error) => ({
    status: 0,
    ok: false,
    data: { error: error instanceof Error ? error.message : String(error) },
  }));
  return response.data?.runs?.[0] || null;
}

function isTerminalRun(run) {
  return Boolean(run && (run.state === "finished" || run.state === "failed" || run.state === "cancelled"));
}

async function waitForBackendRun(requestId, timeoutMs, pollMs = 5000) {
  const started = performance.now();
  let latest = await taskRun(requestId);
  while (latest && !isTerminalRun(latest) && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    latest = await taskRun(requestId);
  }
  return latest;
}

function summarizePayload(data) {
  const images = Array.isArray(data?.images)
    ? data.images
    : data?.image
      ? [data.image]
      : data?.url
        ? [data]
        : [];
  const urls = images.map((item) => item?.url || item?.originalUrl || item?.fileName).filter(Boolean);
  const qualityStatuses = images.map((item) =>
    item?.qualityCheck?.status ||
    item?.qualityCheck?.losslessExport?.passed ||
    item?.maskProtectionCheck?.status ||
    item?.alphaCheck?.canDownload ||
    null,
  ).filter((item) => item !== null);
  return {
    outputCount: images.length,
    urls,
    modes: images.map((item) => item?.mode).filter(Boolean),
    model: data?.model || data?.processingEngine || images.find((item) => item?.model)?.model || "",
    fallbackUsed: Boolean(data?.fallbackUsed || images.some((item) => item?.fallbackUsed)),
    qualityStatuses,
    alphaValid: data?.alphaCheck?.canDownload ?? images.find((item) => item?.alphaCheck)?.alphaCheck?.canDownload,
    layerGroupId: data?.groupId,
    metadataUrl: data?.metadata?.metadataUrl,
    error: data?.error,
  };
}

function summarizeBackendRun(run) {
  const outputs = Array.isArray(run?.outputs) ? run.outputs : [];
  return {
    outputCount: outputs.length,
    urls: outputs.map((item) => item?.url || item?.originalUrl || item?.fileName).filter(Boolean),
    modes: outputs.map((item) => item?.mode).filter(Boolean),
    model: run?.model || outputs.find((item) => item?.model)?.model || "",
    qualityStatuses: outputs.map((item) => item?.qualityCheck?.status || item?.alphaCheck?.canDownload || null).filter((item) => item !== null),
  };
}

async function runTask(factory, phase = "sequential") {
  const task = await factory();
  const meta = requestMeta(task.name);
  await task.attachTrace?.(meta);
  log(`${phase} start: ${task.name}`);
  const started = performance.now();
  let response;
  let error = "";
  try {
    response = await fetchJson(task.route, task.fetchOptions(), task.timeoutMs || defaultTimeoutMs);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    response = { status: 0, ok: false, data: { error } };
  }
  let run = await taskRun(meta.requestId);
  const shouldPollBackend =
    run &&
    !isTerminalRun(run) &&
    (!response.ok || response.status === 0 || /fetch failed|timeout|aborted|network/i.test(error));
  if (shouldPollBackend) {
    log(`${phase} verify: ${task.name} frontend connection ended, polling backend run`);
    run = await waitForBackendRun(meta.requestId, task.backendPollTimeoutMs || task.timeoutMs || defaultTimeoutMs);
  }
  const durationMs = Math.round(performance.now() - started);
  const payload = summarizePayload(response.data);
  const backendPayload = summarizeBackendRun(run);
  const outputCount = payload.outputCount || backendPayload.outputCount;
  const record = {
    name: task.name,
    route: task.route,
    operation: task.operation,
    requestId: meta.requestId,
    httpStatus: response.status,
    httpOk: response.ok,
    durationMs,
    durationSec: Number((durationMs / 1000).toFixed(1)),
    recommendedTimeoutMs: Math.max(60_000, durationMs * 2),
    recommendedTimeoutSec: Number((Math.max(60_000, durationMs * 2) / 1000).toFixed(1)),
    outputCount,
    urls: payload.urls.length ? payload.urls : backendPayload.urls,
    modes: payload.modes.length ? payload.modes : backendPayload.modes,
    model: payload.model || backendPayload.model,
    fallbackUsed: payload.fallbackUsed,
    alphaValid: payload.alphaValid,
    qualityStatuses: payload.qualityStatuses.length ? payload.qualityStatuses : backendPayload.qualityStatuses,
    layerGroupId: payload.layerGroupId,
    metadataUrl: payload.metadataUrl,
    backendRun: run ? {
      state: run.state,
      status: run.status,
      durationMs: run.durationMs,
      outputCount: run.outputCount,
      error: run.error,
      message: run.message,
    } : null,
    ok: (response.ok && (outputCount > 0 || task.allowNoImages === true)) || (run?.state === "finished" && (backendPayload.outputCount > 0 || task.allowNoImages === true)),
    error: payload.error || error || run?.error || "",
    rawKeys: response.data && typeof response.data === "object" ? Object.keys(response.data).slice(0, 20) : [],
  };
  log(`${phase} done: ${task.name} ${record.ok ? "OK" : "FAIL"} ${record.durationSec}s outputs=${record.outputCount}`);
  return record;
}

function jsonTask(name, operation, route, body, timeoutMs, extra = {}) {
  let tracedBody = body;
  return {
    name,
    operation,
    route,
    timeoutMs,
    ...extra,
    attachTrace(meta) {
      tracedBody = withTraceJson(body, meta);
    },
    fetchOptions() {
      return {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(tracedBody),
      };
    },
  };
}

function formTask(name, operation, route, buildForm, timeoutMs) {
  let form = null;
  return {
    name,
    operation,
    route,
    timeoutMs,
    async attachTrace(meta) {
      form = await buildForm();
      appendTraceToForm(form, meta);
    },
    fetchOptions() {
      return { method: "POST", body: form };
    },
  };
}

async function sourceMaskFile(sourceUrl, label) {
  const sourcePath = path.join(cwd, "public", sourceUrl.replace(/^\//, ""));
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;
  const left = Math.round(width * 0.28);
  const top = Math.round(height * 0.2);
  const boxWidth = Math.round(width * 0.28);
  const boxHeight = Math.round(height * 0.06);
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect x="${left}" y="${top}" width="${boxWidth}" height="${boxHeight}" rx="${Math.max(8, Math.round(width * 0.012))}" fill="white"/></svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new File([buffer], `${label}-mask.png`, { type: "image/png" });
}

function creativeBriefTask() {
  return jsonTask("creative_brief_ai", "creative_brief", "/api/creative-brief", {
    mode: "idea",
    text: "为胃肠镜舒适检查活动生成一张医疗商业海报，突出专业、安心、少文字、高级感。",
    adType: "海报",
    projectName: "Benchmark",
    selectedProjectId: projectId,
  }, 60_000, { allowNoImages: true });
}

function textToImageTask({ name = "text_to_image_2k_design_director", quality = "2k", promptSuffix = "" } = {}) {
  return jsonTask(name, "text_to_image", "/api/generate-image", {
    prompt: `胃肠镜舒适检查活动商业海报，专业可信，柔和蓝绿色医疗空间，主视觉是安心睡眠与消化道光带隐喻，少文字，主体完整，留白充足。${promptSuffix}`,
    adType: "海报",
    aspectRatio: "3:4",
    quality,
    safeMargin: "15%",
    cameraDistance: "中景",
    subjectScale: "中",
  }, quality === "standard" ? 8 * 60_000 : 15 * 60_000);
}

function imageToImageTask({ name = "image_to_image_ai_redesign" } = {}) {
  return formTask(name, "image_to_image", "/api/edit-image", async () => {
    const form = new FormData();
    form.append("sourceUrl", sources.poster);
    form.append("prompt", "在不裁切画面、不改核心文字和主体的前提下，优化版式层级、光影、商业质感和配色，让它更像成熟投放海报。");
    form.append("modeLabel", "图生图");
    form.append("aspectRatio", "3:4");
    form.append("quality", "standard");
    form.append("fitMode", "smart_relayout");
    form.append("adType", "海报");
    return form;
  }, 12 * 60_000);
}

function aiResizeTask({ name = "ai_resize_9x16_no_crop" } = {}) {
  return formTask(name, "resize", "/api/edit-image", async () => {
    const form = new FormData();
    form.append("sourceUrl", sources.poster);
    form.append("prompt", "把现有海报改成竖版 9:16，完整保留主体、标题、Logo、重要文字和底部信息；只重排空间，不裁切，不磨砂补边。");
    form.append("modeLabel", "AI改尺寸");
    form.append("aspectRatio", "9:16");
    form.append("quality", "standard");
    form.append("fitMode", "smart_relayout");
    form.append("adType", "海报");
    return form;
  }, 12 * 60_000);
}

function qualityEnhanceTask({ name = "quality_enhance_plus_4k", mode = "plus", quality = "4k" } = {}) {
  return jsonTask(name, "hd_redraw", "/api/redraw-upscale-image", {
    imageUrl: sources.poster,
    aspectRatio: "custom",
    quality,
    format: "png",
    keepOriginalRatio: true,
    exactSize: false,
    enhancementMode: mode,
    prompt: mode === "creative"
      ? "对画面做商业质感高清重绘，增强材质、光影和边缘细节，但保持构图和主体位置。"
      : "文字优先高清修复，保持文字、Logo、二维码、人物和产品不变，提升清晰度和小字可读性。",
  }, 15 * 60_000);
}

function transparentTask({ name = "transparent_gpt_fast", mode = "gpt_fast", sourceUrl = sources.product, cutoutType = "product" } = {}) {
  return jsonTask(name, "remove_background", "/api/transparent-png", {
    imageUrl: sourceUrl,
    mode,
    cutoutType,
    removeWhiteEdge: true,
    removeBlackEdge: true,
    edgeShrink: 1,
    edgeFeather: 1,
  }, 12 * 60_000);
}

function maskEditTask({ name = "mask_edit_cleanup_ai", sourceUrl = sources.poster } = {}) {
  return formTask(name, "mask_edit", "/api/mask-edit-image", async () => {
    const form = new FormData();
    form.append("sourceUrl", sourceUrl);
    form.append("mask", await sourceMaskFile(sourceUrl, name));
    form.append("prompt", "去掉涂抹区域内的旧文字和残影，补成周围一致的干净背景。");
    form.append("taskMode", "text_remove");
    form.append("regionType", "text");
    form.append("protectionStrength", "strict");
    form.append("edgeBlend", "standard");
    form.append("quality", "standard");
    return form;
  }, 15 * 60_000);
}

function layerOutputTask({ name = "layer_output_ai_rebuild" } = {}) {
  return formTask(name, "layer_output", "/api/layer-output", async () => {
    const form = new FormData();
    form.append("sourceUrl", sources.poster);
    form.append("includeBackground", "true");
    form.append("includeTextLayer", "true");
    form.append("maskStrength", "strong");
    form.append("keepGlow", "true");
    form.append("outputCroppedText", "true");
    form.append("backgroundMode", "reference_remake");
    form.append("originalImageId", "benchmark-source-poster");
    return form;
  }, 20 * 60_000);
}

function fuseTask({ name = "fuse_images_ai" } = {}) {
  return formTask(name, "fuse_images", "/api/fuse-images", async () => {
    const form = new FormData();
    form.append("sourceUrlA", sources.ip);
    form.append("sourceUrlB", sources.landscape);
    form.append("prompt", "把图1主体自然融合到图2商业海报场景中，匹配光影、透视和色温，主体完整，不裁切，不生成无关元素。");
    form.append("aspectRatio", "16:9");
    form.append("quality", "standard");
    form.append("keepOriginalRatio", "false");
    return form;
  }, 12 * 60_000);
}

function losslessUpscaleTask({ name = "lossless_4k_export_local" } = {}) {
  return jsonTask(name, "upscale_4k", "/api/upscale-image", {
    imageUrl: sources.poster,
    aspectRatio: "custom",
    quality: "4k",
    format: "png",
    keepOriginalRatio: true,
  }, 4 * 60_000);
}

async function saveReport() {
  allResults.updatedAt = new Date().toISOString();
  await fs.writeFile(reportPath, `${JSON.stringify(allResults, null, 2)}\n`);
}

function buildSummary() {
  const flat = [
    ...allResults.sequential,
    ...allResults.concurrency.flatMap((group) => group.results),
  ];
  const completed = flat.filter((item) => item.ok);
  const failed = flat.filter((item) => !item.ok);
  const sorted = [...flat].sort((a, b) => a.durationMs - b.durationMs);
  const aiOnly = sorted.filter((item) => item.model !== "none" && item.operation !== "upscale_4k");
  const byOperation = {};
  for (const item of flat) {
    byOperation[item.operation] ||= [];
    byOperation[item.operation].push(item.durationMs);
  }
  const operationStats = Object.fromEntries(Object.entries(byOperation).map(([operation, durations]) => {
    const values = durations.sort((a, b) => a - b);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    return [operation, {
      count: values.length,
      minSec: Number((values[0] / 1000).toFixed(1)),
      avgSec: Number((avg / 1000).toFixed(1)),
      maxSec: Number((values.at(-1) / 1000).toFixed(1)),
      recommendedTimeoutSec: Number((Math.max(60_000, values.at(-1) * 2) / 1000).toFixed(1)),
    }];
  }));
  const stableConcurrency = allResults.concurrency
    .filter((group) => group.results.every((item) => item.ok))
    .map((group) => group.size)
    .sort((a, b) => a - b)
    .at(-1) || 0;
  return {
    total: flat.length,
    completed: completed.length,
    failed: failed.length,
    fastest: sorted[0] ? { name: sorted[0].name, sec: sorted[0].durationSec } : null,
    fastestAi: aiOnly[0] ? { name: aiOnly[0].name, sec: aiOnly[0].durationSec } : null,
    slowest: sorted.at(-1) ? { name: sorted.at(-1).name, sec: sorted.at(-1).durationSec } : null,
    failedNames: failed.map((item) => ({ name: item.name, error: item.error, httpStatus: item.httpStatus })),
    operationStats,
    stableConcurrency,
    generatedUrlsHash: createHash("sha256").update(flat.flatMap((item) => item.urls).join("\n")).digest("hex").slice(0, 12),
  };
}

async function runSequential() {
  const fullTasks = [
    creativeBriefTask,
    () => textToImageTask({ name: "text_to_image_standard", quality: "standard" }),
    () => imageToImageTask(),
    () => aiResizeTask(),
    () => transparentTask({ name: "transparent_gpt_fast_product", mode: "gpt_fast", sourceUrl: sources.product, cutoutType: "product" }),
    () => transparentTask({ name: "transparent_gpt_retouch_cutout_product", mode: "gpt_retouch_cutout", sourceUrl: sources.product, cutoutType: "product" }),
    () => transparentTask({ name: "transparent_product_refine_ai", mode: "product_refine", sourceUrl: sources.product, cutoutType: "product" }),
    () => maskEditTask(),
    () => qualityEnhanceTask({ name: "quality_enhance_standard_4k", mode: "standard", quality: "4k" }),
    () => qualityEnhanceTask({ name: "quality_enhance_plus_4k", mode: "plus", quality: "4k" }),
    () => qualityEnhanceTask({ name: "quality_enhance_creative_2k", mode: "creative", quality: "2k" }),
    () => layerOutputTask(),
    () => fuseTask(),
    () => losslessUpscaleTask(),
  ];
  const smokeTasks = [
    creativeBriefTask,
    () => textToImageTask({ name: "smoke_text_to_image_standard", quality: "standard" }),
    () => imageToImageTask({ name: "smoke_image_to_image_target_canvas" }),
    () => aiResizeTask({ name: "smoke_ai_resize_9x16" }),
    () => transparentTask({ name: "smoke_transparent_gpt_fast", mode: "gpt_fast", sourceUrl: sources.product, cutoutType: "product" }),
    () => maskEditTask({ name: "smoke_mask_edit_cleanup" }),
    () => qualityEnhanceTask({ name: "smoke_quality_standard_2k", mode: "standard", quality: "2k" }),
    () => fuseTask({ name: "smoke_fuse_images_ai" }),
  ];
  const tasks = benchmarkMode === "smoke" ? smokeTasks : fullTasks;
  for (const factory of tasks) {
    const record = await runTask(factory, "sequential");
    allResults.sequential.push(record);
    await saveReport();
  }
}

async function runConcurrencyGroup(size, factories) {
  log(`parallel group start: ${size} tasks`);
  const started = performance.now();
  const results = await Promise.all(factories.map((factory) => runTask(factory, `parallel-${size}`)));
  const wallDurationMs = Math.round(performance.now() - started);
  const group = {
    size,
    wallDurationMs,
    wallDurationSec: Number((wallDurationMs / 1000).toFixed(1)),
    successCount: results.filter((item) => item.ok).length,
    failedCount: results.filter((item) => !item.ok).length,
    results,
  };
  allResults.concurrency.push(group);
  await saveReport();
  log(`parallel group done: ${size} tasks success=${group.successCount}/${size} wall=${group.wallDurationSec}s`);
}

async function runConcurrency() {
  if (benchmarkMode === "smoke") return;
  await runConcurrencyGroup(2, [
    () => textToImageTask({ name: "parallel2_text_to_image_standard", quality: "standard", promptSuffix: " 并发测试A。" }),
    () => transparentTask({ name: "parallel2_transparent_gpt_fast", mode: "gpt_fast", sourceUrl: sources.product, cutoutType: "product" }),
  ]);
  await runConcurrencyGroup(3, [
    () => textToImageTask({ name: "parallel3_text_to_image_standard", quality: "standard", promptSuffix: " 并发测试B。" }),
    () => qualityEnhanceTask({ name: "parallel3_quality_standard_2k", mode: "standard", quality: "2k" }),
    () => aiResizeTask({ name: "parallel3_ai_resize_9x16" }),
  ]);
  await runConcurrencyGroup(4, [
    () => textToImageTask({ name: "parallel4_text_to_image_standard", quality: "standard", promptSuffix: " 并发测试C。" }),
    () => transparentTask({ name: "parallel4_transparent_gpt_fast", mode: "gpt_fast", sourceUrl: sources.product, cutoutType: "product" }),
    () => qualityEnhanceTask({ name: "parallel4_quality_standard_2k", mode: "standard", quality: "2k" }),
    () => maskEditTask({ name: "parallel4_mask_edit_cleanup" }),
  ]);
}

log(`AI workflow benchmark started: ${projectId}`);
await fetchJson("/api/health-openai", { method: "POST" }, 60_000).then((result) => {
  allResults.health = {
    httpStatus: result.status,
    ok: result.ok,
    providerType: result.data?.providerType,
    imageModel: result.data?.imageModel,
    analysisModel: result.data?.analysisModel,
  };
});
await saveReport();
await runSequential();
await runConcurrency();
allResults.summary = buildSummary();
allResults.completedAt = new Date().toISOString();
await saveReport();
log(`AI workflow benchmark completed. Report: ${reportPath}`);
console.log(JSON.stringify(allResults.summary, null, 2));
