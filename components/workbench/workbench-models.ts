import type { ModelCatalogItem } from "@/lib/openai-defaults";
import type { WorkbenchModelInfo } from "@/components/workbench/workbench-types";

export function initialImageModelFor(modelInfo: WorkbenchModelInfo) {
  const passedImages = (modelInfo.modelsCache || []).filter((item) => item.capabilities.includes("image") && item.testStatus === "passed");
  return preferredAutoImageModelId(passedImages, modelInfo.imageModel);
}

export function imageModelReadiness(modelInfo: WorkbenchModelInfo, passedImageModels: ModelCatalogItem[], effectiveImageModel: string) {
  if (!modelInfo.hasKey) {
    return {
      label: "API 未配置",
      helper: "先到设置页填入 API Key。",
      toneClass: "text-[#ffb4a8]",
    };
  }
  if (!effectiveImageModel) {
    return {
      label: "Key 已配置 · 图片模型未验证",
      helper: "到 API 设置页测试图片模型，通过后即可生成。",
      toneClass: "text-[#ffe2a3]",
    };
  }
  const active = passedImageModels.find((item) => item.id === effectiveImageModel);
  if (!active) {
    return {
      label: "图片模型已配置",
      helper: "可直接生成；建议到设置页测试一次，系统会记录模型状态。",
      toneClass: "text-[#adf8e5]",
    };
  }
  return {
    label: active?.label ? `图片模型可用 · ${active.label}` : "图片模型可用",
    helper: "图片生成、改图和增强可直接运行。",
    toneClass: "text-[#adf8e5]",
  };
}

export function preferredAutoImageModelId(models: ModelCatalogItem[], configuredModel?: string) {
  const passed = models.filter((item) => item.capabilities.includes("image") && item.testStatus === "passed");
  const byId = (pattern: RegExp) => passed.find((item) => pattern.test(item.id))?.id;
  return passed.find((item) => item.id === configuredModel)?.id
    || byId(/^gpt-image-2$/i)
    || byId(/^gpt-image-1$/i)
    || byId(/^gpt-image-1-mini$/i)
    || passed[0]?.id
    || "";
}

export function imageModelProductHint(model: ModelCatalogItem) {
  if (/^gpt-image-2$/i.test(model.id)) return "优先：画质和原生高清能力更强，适合 2K/4K、生图和画质增强";
  if (/^gpt-image-1$/i.test(model.id)) return "稳定：速度和兼容性优先，适合常规生图/改图";
  if (/^gpt-image-1-mini$/i.test(model.id)) return "轻量：更快，适合预览和低成本试稿";
  return model.lastTestMessage || model.description || model.capabilities.join(" / ");
}
