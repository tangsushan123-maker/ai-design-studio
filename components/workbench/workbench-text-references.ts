import type { AspectRatioValue, TextReferenceRole, TextReferenceWeight } from "@/lib/design-options";
import { legacyTextReferenceHandles, maxTextReferenceImages, textReferenceInputHandle, textReferenceRoleOptions } from "@/components/workbench/workbench-config";
import type { ImageAsset, TextReferenceConfig } from "@/components/workbench/workbench-types";
import { inferRatioFromTargetSize, ratioParam, stringParam } from "@/components/workbench/workbench-utils";

export function isTextReferenceTargetHandle(handle: unknown) {
  return textReferenceInputHandle === handle || legacyTextReferenceHandles.includes(handle as (typeof legacyTextReferenceHandles)[number]);
}

export function normalizeTextReferenceConfigs(value: unknown): TextReferenceConfig[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Partial<TextReferenceConfig> => Boolean(entry && typeof entry === "object"))
    .slice(0, maxTextReferenceImages)
    .map((item, index) => {
      const fallback = defaultTextReferenceConfig(stringParam(item.handle) || textReferenceInputHandle, index);
      return {
        handle: stringParam(item.handle) || textReferenceInputHandle,
        role: normalizeTextReferenceRole(item.role, fallback.role),
        weight: normalizeTextReferenceWeight(item.weight, fallback.weight),
      };
    });
}

export function defaultTextReferenceConfig(handle: string, index = 0, image?: ImageAsset | null): TextReferenceConfig {
  const inferredRole = inferTextReferenceRole(image, index);
  return {
    handle,
    role: inferredRole,
    weight: inferredRole === "reference_only" ? "medium" : "high",
  };
}

export function inferTextReferenceRole(image: ImageAsset | null | undefined, index = 0): TextReferenceRole {
  const text = `${image?.materialType || ""} ${image?.mode || ""} ${image?.fileName || ""}`.toLowerCase();
  if (/logo|标识|品牌/.test(text)) return "logo";
  if (/ip|形象|卡通|角色/.test(text)) return "ip";
  if (/产品|商品|包装|product/.test(text)) return "product";
  if (/人物|人像|医生|专家|person|portrait/.test(text)) return "person";
  if (/背景|background/.test(text)) return "background";
  if (index === 0) return "composition";
  return "reference_only";
}

export function normalizeTextReferenceRole(value: unknown, fallback: TextReferenceRole = "reference_only"): TextReferenceRole {
  return textReferenceRoleOptions.some((item) => item.value === value) ? value as TextReferenceRole : fallback;
}

export function normalizeTextReferenceWeight(value: unknown, fallback: TextReferenceWeight = "medium"): TextReferenceWeight {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

export function shouldUseStrongTextReferenceMode(prompt: string) {
  return /1\s*[:：比]\s*1|一比一|复刻|仿照|照着|照抄|同款|参考图|参考画面|画面参考|参考.*内容|参考.*文案|参考.*活动|活动信息|活动内容不变|其他不变|内容不变|主体不变|只改|只替换|稍微修改|轻微修改|小改|保持版式|版式不变|保持配色|配色不变|板式配色|版式配色|按这个版式|用这个版式|沿用版式|沿用配色|把.+改成|换成/.test(prompt);
}

export function textReferenceRoleDescription(value: unknown) {
  const role = normalizeTextReferenceRole(value);
  const descriptions: Record<TextReferenceRole, string> = {
    person: "锁人物",
    product: "锁产品",
    subject: "锁主体",
    background: "借背景",
    style: "借风格",
    composition: "借版式",
    color: "借色调",
    typography: "借排版",
    logo: "锁 Logo",
    ip: "锁 IP",
    decoration: "借装饰",
    reference_only: "只参考",
  };
  return descriptions[role];
}

export function ratioFromImage(image: Pick<ImageAsset, "aspectRatio" | "outputSize" | "width" | "height">): AspectRatioValue {
  const width = image.outputSize?.width || image.width;
  const height = image.outputSize?.height || image.height;
  if (width && height) {
    const inferred = inferRatioFromTargetSize(`${width}x${height}`);
    if (inferred !== "custom") return inferred;
  }
  return ratioParam(image.aspectRatio);
}
