import { getOpenAIConfig } from "./local-config";

export function getImageModel() {
  const config = getOpenAIConfig();
  const passed = config.modelsCache.find((item) => item.capabilities.includes("image") && item.testStatus === "passed");
  return passed?.id || config.imageModel;
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
