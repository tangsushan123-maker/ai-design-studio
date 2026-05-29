import type { FlowNode, NodeKind } from "@/components/workbench/workbench-types";

export function isComposerDrivenNode(kind: NodeKind) {
  return kind === "text_to_image" || kind === "image_to_image" || kind === "fuse_images" || kind === "resize" || kind === "outpaint" || kind === "replace_product" || kind === "hd_redraw" || kind === "mask_edit" || kind === "reference_remake" || kind === "design_optimize" || kind === "png_layers" || kind === "output";
}

export function composerTitleForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") return "文生图";
  if (node.data.kind === "image_to_image") return "图生图";
  if (node.data.kind === "fuse_images") return "AI合成";
  if (node.data.kind === "resize") return "改尺寸";
  if (node.data.kind === "outpaint") return "扩图";
  if (node.data.kind === "hd_redraw") return "增强";
  if (node.data.kind === "mask_edit") return "局部修改";
  if (node.data.kind === "reference_remake") return "参考图重制";
  if (node.data.kind === "design_optimize") return "设计优化";
  if (node.data.kind === "png_layers") return "PNG分层";
  if (node.data.kind === "output") return "输出";
  return "当前节点";
}

export function composerPlaceholderForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") return "例如：端午节品牌海报，加入一位年轻女性，青绿色国风，少字高级";
  if (node.data.kind === "image_to_image") return "写改版方向";
  if (node.data.kind === "fuse_images") return "写合成要求";
  if (node.data.kind === "resize") return "写适配要求";
  if (node.data.kind === "outpaint") return "写补画内容";
  if (node.data.kind === "hd_redraw") return "写增强方向";
  if (node.data.kind === "mask_edit") return "写局部修改";
  if (node.data.kind === "reference_remake") return "写重制要求";
  if (node.data.kind === "design_optimize") return "写优化要求";
  if (node.data.kind === "png_layers") return "可写分层要求，也可直接运行";
  if (node.data.kind === "output") return "可写导出备注，也可直接运行";
  return "输入要求";
}

export function composerHelperTextForNode(node: FlowNode) {
  if (node.data.kind === "text_to_image") {
    const textReferenceCount = textReferencePreviewCount(node);
    return textReferenceCount
      ? `已连接 ${textReferenceCount} 张图片参考，可在右侧设为使用人物/产品/Logo。`
      : "可直接写“加入人物/医生/模特/IP”，或上传人物图后在右侧选使用人物。";
  }
  if (node.data.kind === "image_to_image") return "默认快速生成 1 个创意改版方案；需要多方案可写“两张/多方案”。";
  if (node.data.kind === "fuse_images") return "图1主体放入图2场景，生成自然版和广告版。";
  if (node.data.kind === "resize") return "尺寸在右侧，底部写保留重点。";
  if (node.data.kind === "outpaint") return "说明补哪里、补什么。";
  if (node.data.kind === "hd_redraw") return "选择 Standard / Plus / Creative，按原比例输出 2K/4K/8K。";
  if (node.data.kind === "mask_edit") return "涂哪里，改哪里。";
  if (node.data.kind === "reference_remake") return "连接拍照参考图，选择快速复刻或精准重制，按参考图风格生成干净高清版。";
  if (node.data.kind === "design_optimize") return "连接已有设计稿，自动识别行业和类型，输出优化图并支持前后对比。";
  if (node.data.kind === "png_layers") return "连接成品图后，底部点运行即可生成背景、文字、人物三层 PNG。";
  if (node.data.kind === "output") return "下载、复制或保存结果。";
  return "";
}

export function canSubmitComposerForNode(node: FlowNode, prompt: string) {
  if (node.data.kind === "text_to_image") return Boolean(prompt.trim());
  return true;
}

export function requiresConnectedImageForComposer(kind: NodeKind) {
  return kind === "image_to_image" ||
    kind === "resize" ||
    kind === "outpaint" ||
    kind === "mask_edit" ||
    kind === "hd_redraw" ||
    kind === "reference_remake" ||
    kind === "design_optimize" ||
    kind === "png_layers" ||
    kind === "output";
}

export function composerSubmitStatus(node: FlowNode, prompt: string) {
  if (node.data.kind === "text_to_image") return "已更新文生图提示词并开始运行。";
  if (node.data.kind === "image_to_image") return prompt.trim() ? "已更新图生图想法并开始运行。" : "已按图生图默认要求开始运行。";
  if (node.data.kind === "fuse_images") return prompt.trim() ? "已更新合成要求并开始运行。" : "已按当前 AI 合成设置开始运行。";
  if (node.data.kind === "resize") return prompt.trim() ? "已更新改比例要求并开始运行。" : "已按当前比例、尺寸和清晰度设置开始运行。";
  if (node.data.kind === "outpaint") return prompt.trim() ? "已更新扩图要求并开始运行。" : "已按当前扩图设置开始运行。";
  if (node.data.kind === "hd_redraw") return prompt.trim() ? "已更新画质增强要求并开始运行。" : "已按当前画质增强设置开始运行。";
  if (node.data.kind === "mask_edit") return "已更新局部修改内容并开始运行。";
  if (node.data.kind === "reference_remake") return prompt.trim() ? "已更新参考图重制要求并开始运行。" : "已按当前参考图重制设置开始运行。";
  if (node.data.kind === "design_optimize") return prompt.trim() ? "已更新设计优化要求并开始运行。" : "已按当前设计优化设置开始运行。";
  if (node.data.kind === "png_layers") return "已开始 PNG 分层导出。";
  if (node.data.kind === "output") return "已开始输出。";
  return "已开始运行当前节点。";
}

export function nodeCreationHint(type: NodeKind, fromImage: boolean) {
  if (type === "text_to_image") return fromImage ? "已创建文生图节点，并连接当前图片作为参考。" : "已创建文生图节点。直接在底部输入需求即可生成。";
  if (type === "image_to_image") return fromImage ? "已创建图生图创意改版节点。默认快速出 1 个方案，需要多方案可在要求里说明。" : "已创建图生图创意改版节点。先连接图片，再写改版方向。";
  if (type === "fuse_images") return fromImage ? "已创建 AI 合成节点。当前图片是图1主体，再连接图2场景。" : "已创建 AI 合成节点。请连接图1主体和图2场景。";
  if (type === "resize") return fromImage ? "已创建改比例节点。先在右侧选目标比例、尺寸和清晰度，再运行。" : "已创建改比例节点。请先连接图片，再选择目标比例、尺寸和清晰度。";
  if (type === "outpaint") return fromImage ? "已创建扩图补画节点。下面可补充扩图想法，右侧可改方向和比例。" : "已创建扩图补画节点。请先连接图片，再决定扩到什么比例。";
  if (type === "mask_edit") return "已创建局部 AI 修改节点。先连接图片并打开涂抹面板，再写要改什么。";
  if (type === "hd_redraw") return fromImage ? "已创建画质增强节点。可选择 Standard / Plus / Creative，再输出 2K/4K/8K。" : "已创建画质增强节点。请先连接图片，再选择增强模式。";
  if (type === "reference_remake") return fromImage ? "已创建参考图重制节点。选择快速复刻或精准重制后运行。" : "已创建参考图重制节点。请先连接一张拍照参考图。";
  if (type === "design_optimize") return fromImage ? "已创建设计优化节点。选择优化强度后运行，可查看前后对比。" : "已创建设计优化节点。请先连接一张已有设计稿。";
  if (type === "png_layers") return fromImage ? "已创建 PNG 三层节点。默认 AI 三层精准，运行后可预览并单独下载。" : "已创建 PNG 三层节点。请先连接成品图，再运行生成三层 PNG。";
  return "节点已创建。";
}

function textReferencePreviewCount(node: FlowNode) {
  const refs = node.data.textReferencePreviews;
  if (!Array.isArray(refs)) return 0;
  let count = 0;
  for (const item of refs) {
    if (item && typeof item === "object" && "image" in item && item.image) count += 1;
  }
  return count;
}
