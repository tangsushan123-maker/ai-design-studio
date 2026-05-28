import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  Blend,
  Brush,
  Expand,
  ImagePlus,
  Layers,
  MoveDiagonal,
  Palette,
  RefreshCcw,
  ScanLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { NodeKind } from "@/components/workbench/workbench-types";

export type WorkbenchNodeCatalogItem = {
  type: NodeKind;
  label: string;
  description: string;
  icon: ReactNode;
  hiddenFromAddMenu?: boolean;
};

export const nodeCatalog: WorkbenchNodeCatalogItem[] = [
  { type: "image_input", label: "图片输入", description: "粘贴、拖拽、上传后自动生成。", icon: <ImagePlus className="size-4" />, hiddenFromAddMenu: true },
  { type: "text_to_image", label: "文生图", description: "文字生成，可连接图片参考。", icon: <Sparkles className="size-4" /> },
  { type: "image_to_image", label: "图生图", description: "参考原图做创意改版。", icon: <Wand2 className="size-4" /> },
  { type: "fuse_images", label: "AI合成", description: "图1主体放入图2场景。", icon: <Blend className="size-4" /> },
  { type: "outpaint", label: "扩图补画", description: "AI 补全缺失画面，不是拉伸。", icon: <Expand className="size-4" /> },
  { type: "resize", label: "改比例", description: "智能改版到目标尺寸。", icon: <MoveDiagonal className="size-4" /> },
  { type: "mask_edit", label: "局部 AI 修改", description: "涂抹区域，一句话生成式修补。", icon: <Brush className="size-4" /> },
  { type: "hd_redraw", label: "画质增强", description: "Standard / Plus / Creative 后输出 4K/8K。", icon: <RefreshCcw className="size-4" /> },
  { type: "reference_remake", label: "参考图重制", description: "分析拍照参考图，重做高清同风格设计。", icon: <ScanLine className="size-4" /> },
  { type: "design_optimize", label: "设计优化", description: "上传已有设计稿，优化版式、层级和质感。", icon: <Palette className="size-4" /> },
  { type: "png_layers", label: "PNG 分层", description: "生成背景、文字、人物三张同尺寸透明 PNG。", icon: <Layers className="size-4" /> },
  { type: "output", label: "输出", description: "下载、复制、保存结果。", icon: <ArrowDownToLine className="size-4" /> },
];
