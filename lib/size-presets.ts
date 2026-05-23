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
    id: "xiaohongshu_cover_34",
    label: "小红书封面",
    category: "social",
    categoryLabel: "社媒封面",
    targetRatio: "3:4",
    targetSize: "1080x1440",
    hint: "笔记封面",
    usage: "小红书图文封面",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["小红书", "笔记封面"],
    featuredInBatch: true,
  },
  {
    id: "xiaohongshu_cover_45",
    label: "小红书 4:5",
    category: "social",
    categoryLabel: "社媒封面",
    targetRatio: "4:5",
    targetSize: "1080x1350",
    hint: "信息流常用",
    usage: "竖版信息流广告",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["小红书4:5"],
  },
  {
    id: "wechat_article_cover",
    label: "公众号封面",
    category: "social",
    categoryLabel: "社媒封面",
    targetRatio: "custom",
    targetSize: "900x383",
    hint: "微信头图",
    usage: "公众号首图/文章封面",
    extreme: true,
    recommendedMode: "smart_relayout",
    aliases: ["微信封面", "公众号首图"],
  },
  {
    id: "douyin_vertical",
    label: "抖音竖版",
    category: "video",
    categoryLabel: "视频与演示",
    targetRatio: "9:16",
    targetSize: "1080x1920",
    hint: "短视频封面",
    usage: "抖音/视频号/快手竖屏",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["竖版视频", "视频号竖版"],
    featuredInBatch: true,
  },
  {
    id: "video_cover_169",
    label: "视频封面",
    category: "video",
    categoryLabel: "视频与演示",
    targetRatio: "16:9",
    targetSize: "1920x1080",
    hint: "横版视频",
    usage: "视频封面/横版屏幕",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["横版视频", "16:9视频"],
    featuredInBatch: true,
  },
  {
    id: "ppt_169",
    label: "PPT",
    category: "video",
    categoryLabel: "视频与演示",
    targetRatio: "16:9",
    targetSize: "1920x1080",
    hint: "演示文稿",
    usage: "汇报/PPT封面",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["演示文稿", "PPT背景"],
    featuredInBatch: true,
  },
  {
    id: "elevator_poster",
    label: "电梯海报",
    category: "screen",
    categoryLabel: "电子屏与条屏",
    targetRatio: "9:16",
    targetSize: "1080x1920",
    hint: "竖屏电梯屏",
    usage: "电梯屏/竖屏电子屏",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["电梯屏"],
  },
  {
    id: "led_screen_3000x300",
    label: "电子屏 3000×300",
    category: "screen",
    categoryLabel: "电子屏与条屏",
    targetRatio: "custom",
    targetSize: "3000x300",
    hint: "超宽条屏",
    usage: "门头屏/LED 条屏",
    extreme: true,
    recommendedMode: "smart_relayout",
    aliases: ["电子屏3000x300", "LED条屏", "条屏"],
    featuredInBatch: true,
  },
  {
    id: "bus_ad_3900x400",
    label: "公交广告",
    category: "outdoor",
    categoryLabel: "户外与展架",
    targetRatio: "9.75:1",
    targetSize: "3900x400",
    hint: "车身长条",
    usage: "公交车身/户外超宽广告",
    extreme: true,
    recommendedMode: "smart_relayout",
    aliases: ["公交车身", "车身广告"],
    featuredInBatch: true,
  },
  {
    id: "rollup_80x200",
    label: "易拉宝 80×200cm",
    category: "outdoor",
    categoryLabel: "户外与展架",
    targetRatio: "custom",
    targetSize: "1200x3000",
    hint: "窄版展架",
    usage: "线下展架/易拉宝",
    extreme: true,
    recommendedMode: "smart_relayout",
    physicalSize: "80×200cm",
    aliases: ["80x200 易拉宝", "易拉宝80"],
    featuredInBatch: true,
  },
  {
    id: "rollup_85x200",
    label: "易拉宝",
    category: "outdoor",
    categoryLabel: "户外与展架",
    targetRatio: "custom",
    targetSize: "1275x3000",
    hint: "常用展架",
    usage: "线下展架/易拉宝",
    extreme: true,
    recommendedMode: "smart_relayout",
    physicalSize: "85×200cm",
    aliases: ["展架", "易拉宝 85×200cm", "85x200 易拉宝"],
    featuredInBatch: true,
  },
  {
    id: "rollup_100x200",
    label: "易拉宝 100×200cm",
    category: "outdoor",
    categoryLabel: "户外与展架",
    targetRatio: "custom",
    targetSize: "1500x3000",
    hint: "宽版展架",
    usage: "线下展架/易拉宝",
    extreme: true,
    recommendedMode: "smart_relayout",
    physicalSize: "100×200cm",
    aliases: ["100x200 易拉宝", "易拉宝100"],
  },
  {
    id: "rollup_120x200",
    label: "易拉宝 120×200cm",
    category: "outdoor",
    categoryLabel: "户外与展架",
    targetRatio: "custom",
    targetSize: "1800x3000",
    hint: "加宽展架",
    usage: "线下展架/易拉宝",
    extreme: true,
    recommendedMode: "smart_relayout",
    physicalSize: "120×200cm",
    aliases: ["120x200 易拉宝", "易拉宝120"],
  },
  {
    id: "a4_landscape",
    label: "A4横版",
    category: "print",
    categoryLabel: "纸张与打印",
    targetRatio: "custom",
    targetSize: "3508x2480",
    hint: "300dpi",
    usage: "A4横向打印",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["A4 横版"],
  },
  {
    id: "a4_portrait",
    label: "A4竖版",
    category: "print",
    categoryLabel: "纸张与打印",
    targetRatio: "custom",
    targetSize: "2480x3508",
    hint: "300dpi",
    usage: "A4竖向打印",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["A4 竖版"],
    featuredInBatch: true,
  },
  {
    id: "iphone_69",
    label: "iPhone 6.9 英寸",
    category: "device",
    categoryLabel: "手机设备",
    targetRatio: "custom",
    targetSize: "1320x2868",
    hint: "App Store 截图",
    usage: "iPhone 6.9\" 显示尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["苹果手机 6.9", "iPhone 6.9", "iPhone Pro Max"],
  },
  {
    id: "iphone_63",
    label: "iPhone 6.3 英寸",
    category: "device",
    categoryLabel: "手机设备",
    targetRatio: "custom",
    targetSize: "1206x2622",
    hint: "App Store 截图",
    usage: "iPhone 6.3\" 显示尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["苹果手机 6.3", "iPhone 6.3", "iPhone Pro"],
  },
  {
    id: "iphone_61",
    label: "iPhone 6.1 英寸",
    category: "device",
    categoryLabel: "手机设备",
    targetRatio: "custom",
    targetSize: "1179x2556",
    hint: "App Store 截图",
    usage: "iPhone 6.1\" 显示尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["苹果手机 6.1", "iPhone 6.1"],
  },
  {
    id: "iphone_55",
    label: "iPhone 5.5 英寸",
    category: "device",
    categoryLabel: "手机设备",
    targetRatio: "custom",
    targetSize: "1242x2208",
    hint: "旧款兼容",
    usage: "iPhone 5.5\" 显示尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["苹果手机 5.5", "iPhone 5.5"],
  },
  {
    id: "iphone_47",
    label: "iPhone 4.7 英寸",
    category: "device",
    categoryLabel: "手机设备",
    targetRatio: "custom",
    targetSize: "750x1334",
    hint: "旧款兼容",
    usage: "iPhone 4.7\" 显示尺寸",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["苹果手机 4.7", "iPhone 4.7"],
  },
  {
    id: "square_1x1",
    label: "1:1",
    category: "general",
    categoryLabel: "通用",
    targetRatio: "1:1",
    targetSize: "1080x1080",
    hint: "通用方图",
    usage: "朋友圈/头像/方图广告",
    extreme: false,
    recommendedMode: "smart_relayout",
    aliases: ["方图", "正方形"],
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
  return sizePresetCategories
    .map((category) => ({
      ...category,
      presets: sizePresets.filter((preset) => preset.category === category.id),
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
