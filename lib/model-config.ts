import { getOpenAIConfig } from "./local-config";

export function getImageModel() {
  const config = getOpenAIConfig();
  const passed = config.modelsCache.find((item) => item.capabilities.includes("image") && item.testStatus === "passed");
  return passed?.id || config.imageModel;
}

export function resolveImageModel(...candidates: unknown[]) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim();
    if (value) return value;
  }
  return getImageModel();
}

export function supportsConfigurableImageInputFidelity(modelId: string) {
  return !/\bgpt-image-2\b/i.test(modelId);
}

export function getAnalysisModel() {
  return getOpenAIConfig().textModel;
}

export function getTextModel() {
  return getOpenAIConfig().textModel;
}

export function getVideoModel() {
  return getOpenAIConfig().videoModel;
}
