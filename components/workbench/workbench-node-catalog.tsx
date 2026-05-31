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
  { type: "text_to_image", label: "从零生成", description: "只有一句需求时，从文字直接生成多方案。", icon: <Sparkles className="size-4" /> },
  { type: "image_to_image", label: "参考原图出方案", description: "基于一张图重新设计，生成多个新方向。", icon: <Wand2 className="size-4" /> },
  { type: "fuse_images", label: "两图合成", description: "把图1主体自然放入图2场景。", icon: <Blend className="size-4" /> },
  { type: "outpaint", label: "扩图补画", description: "补全画面边缘，扩成新比例。", icon: <Expand className="size-4" /> },
  { type: "resize", label: "换尺寸/改版适配", description: "换比例或尺寸，重新排版而不是拉伸。", icon: <MoveDiagonal className="size-4" /> },
  { type: "mask_edit", label: "局部修改", description: "涂抹局部，只改指定区域。", icon: <Brush className="size-4" /> },
  { type: "hd_redraw", label: "高清/画质增强", description: "修文字、增强质感，输出 2K/4K。", icon: <RefreshCcw className="size-4" /> },
  { type: "reference_remake", label: "复刻参考图", description: "把拍照图、截图、低清参考图重制清楚。", icon: <ScanLine className="size-4" /> },
  { type: "design_optimize", label: "优化已有设计", description: "内容不变，优化版式、层级和商业质感。", icon: <Palette className="size-4" /> },
  { type: "png_layers", label: "PNG 分层交付", description: "成品图拆成背景、文字、人物三层 PNG。", icon: <Layers className="size-4" /> },
  { type: "output", label: "输出", description: "旧项目兼容：结果图现在可直接预览、下载和管理。", icon: <ArrowDownToLine className="size-4" />, hiddenFromAddMenu: true },
];
