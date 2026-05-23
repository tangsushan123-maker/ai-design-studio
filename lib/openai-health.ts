export type HealthMode = "quick" | "full";

export type ModelCheck = {
  ok: boolean;
  message: string;
  skipped?: boolean;
};

export function parseHealthMode(value: string | null | undefined): HealthMode {
  return value === "full" ? "full" : "quick";
}

export function skippedImageCheck(): ModelCheck {
  return {
    ok: true,
    skipped: true,
    message: "图片模型未测试。点击完整测试会真实调用一次图片生成接口。",
  };
}
