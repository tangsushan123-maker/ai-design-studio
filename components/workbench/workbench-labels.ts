import { formatFileSize } from "@/lib/workbench-format";
import { imageSizeLabel, qualityBadgeLabel } from "@/lib/workbench-delivery";
import { nodeCatalog } from "@/components/workbench/workbench-node-catalog";
import type { ImageAsset, NodeKind, NodeStatus, TaskRecord } from "@/components/workbench/workbench-types";

export function batchImageActionSummary({ failed, skipped, success }: { success: number; failed: number; skipped: number }) {
  return [
    `${success} 张图片`,
    failed ? `${failed} 张失败` : "",
    skipped ? `${skipped} 张跳过` : "",
  ].filter(Boolean).join("，");
}

export function taskStageLabel(kind: NodeKind, stage: NonNullable<TaskRecord["stage"]>) {
  const action = taskActionLabel(kind);
  const labels: Record<NonNullable<TaskRecord["stage"]>, string> = {
    queued: "排队中",
    preparing: `正在准备${action}素材`,
    generating: `模型正在${action}`,
    saving: "正在保存图片资源",
    quality: "正在检查尺寸和清晰度",
    completed: "完成",
    failed: "失败",
    cancelled: "已停止",
  };
  return labels[stage];
}

export function taskProgressLabel(task: TaskRecord, stage: NonNullable<TaskRecord["stage"]>) {
  if (stage === "generating") {
    const kind = taskKindFromLabel(task.type);
    if (kind === "upscale_4k") return "AI 画质增强 → 原比例 2K/4K 输出 → 文字/Logo保护 → 质检，通常 2-7 分钟";
    if (kind === "hd_redraw") return "官方 GPT Image 高保真编辑 → 原生高清输出 → 质检，通常 2-7 分钟；复杂图会更久";
    if (kind === "png_layers") return "AI 正在拆背景、文字、人物三层，通常 2-6 分钟；完成后可预览并单独下载";
    if (kind === "reference_remake") return "AI 正在分析参考图并重制高清设计，通常 2-6 分钟；精准模式会再重建真实文字";
    if (kind === "design_optimize") return "AI 正在识别行业与版式问题，并生成优化后设计，通常 2-6 分钟；完成后可前后对比";
    if (kind === "resize" || kind === "outpaint") return "正在按目标比例重排，通常 5-12 分钟；完成后会核验是否裁切";
    const estimate = kind === "fuse_images" ? "复杂合成可能需要 3-8 分钟" : "通常需要 1-5 分钟，比例重试会更久";
    return task.model ? `${task.model} 生成中，${estimate}` : `${taskStageLabel("text_to_image", "generating")}，${estimate}`;
  }
  if (stage === "quality") return "等待模型返回并检查结果";
  return taskStageLabel(taskKindFromLabel(task.type), stage);
}

export function taskActionLabel(kind: NodeKind) {
  const labels: Record<NodeKind, string> = {
    image_input: "导入",
    text_to_image: "生图",
    image_to_image: "改版",
    fuse_images: "合成",
    outpaint: "扩图",
    resize: "改版适配",
    replace_product: "替换",
    mask_edit: "局部修改",
    hd_redraw: "画质增强",
    upscale_4k: "画质增强",
    reference_remake: "参考图重制",
    design_optimize: "设计优化",
    png_layers: "PNG分层",
    output: "输出",
  };
  return labels[kind];
}

export function taskKindFromLabel(label: string): NodeKind {
  if (/^4K\s*\u5bfc\u51fa$/.test(label)) return "upscale_4k";
  return nodeCatalog.find((item) => item.label === label)?.type || "text_to_image";
}

export function completedTaskLabel(count: number, image?: ImageAsset) {
  const size = image ? imageSizeLabel(image) : "";
  const quality = image ? qualityBadgeLabel(image) : "";
  return [`完成 ${count || 1} 张`, size, quality && quality !== "待检查" ? quality : ""].filter(Boolean).join(" · ");
}

export function outputNodeTitle(image: ImageAsset, index: number) {
  if (image.materialType) return image.materialType;
  if (image.nodeOperation === "mask_edit" || image.mode?.includes("局部")) return "局部修改结果";
  if (image.nodeOperation === "hd_redraw" || image.mode?.includes("画质增强")) return "画质增强结果";
  if (image.nodeOperation === "upscale_4k") return "画质增强结果";
  if (image.nodeOperation === "reference_remake" || image.mode?.includes("参考图重制")) return "参考图重制结果";
  if (image.nodeOperation === "design_optimize" || image.mode?.includes("设计优化")) return "设计优化结果";
  if (image.nodeOperation === "png_layers" || image.pngLayerExport) return "PNG三层";
  return `方案${chineseNumber(image.variant || index + 1)}`;
}

export function imageNodeTitle(image: ImageAsset, fallback: string) {
  if (image.materialType) return outputNodeTitle(image, image.variant ? image.variant - 1 : 0);
  if (image.nodeOperation === "mask_edit" || image.mode?.includes("局部")) return "局部修改结果";
  if (image.nodeOperation === "hd_redraw" || image.mode?.includes("画质增强")) return "画质增强结果";
  if (image.nodeOperation === "upscale_4k") return "画质增强结果";
  if (image.nodeOperation === "reference_remake" || image.mode?.includes("参考图重制")) return "参考图重制结果";
  if (image.nodeOperation === "design_optimize" || image.mode?.includes("设计优化")) return "设计优化结果";
  if (image.nodeOperation === "png_layers" || image.pngLayerExport) return "PNG三层";
  const variant = image.variant || variantNumberFromLabel(image.branchLabel || fallback);
  return variant ? `方案${chineseNumber(variant)}` : fallback;
}

export function compactImageMeta(image: ImageAsset) {
  return [image.targetSize || imageSizeLabel(image), image.fileSizeBytes ? formatFileSize(image.fileSizeBytes) : ""].filter(Boolean).join(" · ");
}

export function variantNumberFromLabel(value: string) {
  const match = value.match(/方案\s*(\d+)/u);
  return match ? Number(match[1]) || 0 : 0;
}

export function chineseNumber(value: number) {
  const labels = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value >= 1 && value <= 10) return labels[value];
  return String(value);
}

export function taskFailureHint(message: string) {
  if (isInvalidMaskFailure(message)) return "涂抹无效：请重新打开局部 AI 修改并重新涂抹";
  if (/非 .*原生比例|目标画布原生比例|比例图片|阻止裁切/.test(message)) return "比例保护：模型没按目标比例返回，已避免裁切；建议重试或改用 AI 改版适配";
  if (/timeout|超时|504|gateway/i.test(message)) return "超时：可继续重试或切换更快图片模型";
  if (/401|403|key|密钥|余额|quota|balance/i.test(message)) return "接口不可用：检查 Key、余额或模型权限";
  if (/model|模型/i.test(message)) return "模型不可用：切换模型或重新检测中转站";
  return "失败：查看错误后重试";
}

export function isInvalidMaskFailure(message: string) {
  return /涂抹区域太小|请先涂抹要修改的区域|蒙版尺寸|蒙版为空|涂抹蒙版为空|涂抹蒙版未通过像素校验|重新涂抹/.test(message);
}

export function errorRecoveryTips(message: string) {
  const clean = message.toLowerCase();
  if (isInvalidMaskFailure(message)) return ["重新打开局部 AI 修改，把目标、阴影和边缘完整涂满。", "蒙版必须和原图尺寸一致，换图后需要重新涂抹。"];
  if (/请输入文字需求|prompt|文生图节点需要填写/.test(message)) return ["补充清楚的目标、用途、主体、文字和风格后再运行。", "有参考图时先连接图片参考，再选择参考角色和权重。"];
  if (/需要连接|请上传|请提供|没有检测到|请选择/.test(message)) return ["先把输入图片接到节点左侧入口，或上传/导入一张可用图片。", "如果图片来自网页链接，改用本地上传可以减少读取失败。"];
  if (/json|请求格式|接口返回格式异常/i.test(message)) return ["刷新页面后重试，避免旧页面状态继续发送异常请求。", "如果一直出现，请保存项目并重新打开。"];
  if (/key|密钥|401|403|quota|余额|balance|permission|权限/i.test(message)) return ["进入 API 设置测试 Key、余额和模型权限。", "确认图片模型、分析模型都已通过检测。"];
  if (/model|模型/.test(message)) return ["到 API 设置重新检测模型，或切换为已通过测试的图片模型。", "中转站模型名要和服务商后台保持一致。"];
  if (/timeout|timed out|超时|502|503|504|gateway|fetch failed|network|upstream/i.test(clean)) return ["稍后重试，或切换更快/更稳定的图片模型。", "重任务可降低质量目标或减少参考图数量后再运行。"];
  if (/比例|裁切|原生比例|画布/.test(message)) return ["改用常见比例重新生成，或打开精确尺寸让系统先做目标画布。", "避免让主体和大标题贴边，给四周留出安全边距。"];
  return [];
}

export function shouldWaitForBackendAfterClientError(message: string) {
  return /任务响应超时|timeout|timed out|fetch failed|failed to fetch|network|load failed|aborted|aborterror|502|503|504|bad gateway|gateway timeout|upstream/i.test(message);
}

export function friendlyDisplayError(message: string) {
  if (message.includes("真实原因：")) {
    return message
      .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320);
  }
  if (/502|bad gateway|gateway timeout|nginx|upstream|timeout|fetch failed/i.test(message)) {
    return "图片模型服务暂时不可用，可能是 API 代理或上游模型超时。请稍后重试，或在 API 配置里换一个更稳定/更快的图片模型。";
  }

  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

export function nodeKindLabel(kind: NodeKind) {
  return nodeCatalog.find((item) => item.type === kind)?.label || kind;
}

export function taskStatusLabel(status: NodeStatus) {
  const labels: Record<NodeStatus, string> = {
    idle: "空闲",
    queued: "等待中",
    running: "运行中",
    saving: "保存中",
    completed: "成功",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status];
}

export function nodeOperationLabel(value?: string) {
  if (!value) return "未知节点";
  const labels: Record<string, string> = {
    text_to_image: "文生图节点",
    image_to_image: "图生图节点",
    fuse_images: "AI合成节点",
    outpaint: "AI扩图节点",
    resize: "AI改版适配节点",
    hd_redraw: "画质增强节点",
    upscale_4k: "画质增强节点",
    reference_remake: "参考图重制节点",
    design_optimize: "设计优化节点",
    png_layers: "PNG 分层导出节点",
    mask_edit: "局部 AI 修改节点",
    "图片融合": "AI合成节点",
    "AI合成": "AI合成节点",
    "文生图": "文生图节点",
  };
  return labels[value] || value;
}
