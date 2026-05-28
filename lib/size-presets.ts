import type { AspectRatioValue } from "./design-options";

export type ResizeFitMode = "smart_relayout" | "smart_outpaint" | "crop" | "pad";

export type SizePresetCategoryId =
  | "social"
  | "video"
  | "screen"
  | "outdoor"
  | "print"
  | "device"
  | "general";

export type SizePreset = {
  id: string;
  label: string;
  category: SizePresetCategoryId;
  categoryLabel: string;
  targetRatio: AspectRatioValue | "custom";
  targetSize: string;
  hint: string;
  usage: string;
  extreme: boolean;
  recommendedMode: ResizeFitMode;
  aliases?: string[];
  physicalSize?: string;
  featuredInBatch?: boolean;
};

export const sizePresetCategories: Array<{ id: SizePresetCategoryId; label: string }> = [
  { id: "social", label: "社媒封面" },
  { id: "video", label: "视频与演示" },
  { id: "screen", label: "电子屏与条屏" },
  { id: "outdoor", label: "户外与展架" },
  { id: "print", label: "纸张与打印" },
  { id: "device", label: "手机设备" },
  { id: "general", label: "通用" },
];

export const sizePresets: SizePreset[] = [
  {
    id: "ratio_1_1",
    label: "1:1",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "1:1",
    targetSize: "1080x1080",
    hint: "方图",
    usage: "常用方形比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["方图", "正方形"],
  },
  {
    id: "ratio_4_5",
    label: "4:5",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "4:5",
    targetSize: "1080x1350",
    hint: "竖图",
    usage: "常用竖版比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["信息流", "竖版信息流", "小红书4:5"],
  },
  {
    id: "ratio_3_4",
    label: "3:4",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "3:4",
    targetSize: "1080x1440",
    hint: "竖图",
    usage: "常用竖版比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["小红书", "小红书封面", "笔记封面", "竖版封面"],
  },
  {
    id: "ratio_4_3",
    label: "4:3",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "4:3",
    targetSize: "1440x1080",
    hint: "横图",
    usage: "常用横版比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["横版4:3"],
  },
  {
    id: "ratio_16_9",
    label: "16:9",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "16:9",
    targetSize: "1920x1080",
    hint: "横图",
    usage: "常用横版比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["横版", "横屏", "视频封面", "PPT"],
  },
  {
    id: "ratio_9_16",
    label: "9:16",
    category: "general",
    categoryLabel: "常用比例",
    targetRatio: "9:16",
    targetSize: "1080x1920",
    hint: "竖图",
    usage: "常用竖版比例",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["竖版", "竖屏", "手机海报", "短视频封面"],
  },
  {
    id: "custom",
    label: "自定义",
    category: "general",
    categoryLabel: "通用",
    targetRatio: "custom",
    targetSize: "1920x1080",
    hint: "手动输入宽高",
    usage: "自定义交付尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
  },
];

export function findSizePresetByLabel(label: string) {
  return sizePresets.find((preset) => preset.label === label || preset.aliases?.includes(label));
}

export function groupSizePresetsByCategory() {
  const presetsByCategory = new Map<SizePresetCategoryId, SizePreset[]>();
  sizePresets.forEach((preset) => {
    const list = presetsByCategory.get(preset.category) || [];
    list.push(preset);
    presetsByCategory.set(preset.category, list);
  });
  return sizePresetCategories
    .map((category) => ({
      ...category,
      presets: presetsByCategory.get(category.id) || [],
    }))
    .filter((group) => group.presets.length > 0);
}

export function matchSizePresetByPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  return sizePresets.find((preset) => {
    const pool = [preset.label, ...(preset.aliases || [])];
    return pool.some((item) => lower.includes(item.toLowerCase()));
  }) || null;
}
