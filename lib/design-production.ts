export type ProtectedTextItem = {
  id: string;
  text: string;
  kind:
    | "hospital"
    | "phone"
    | "address"
    | "doctor"
    | "price"
    | "title"
    | "logo"
    | "qr"
    | "medical"
    | "other";
  importance: "critical" | "high" | "normal";
  reason?: string;
};

export type ProtectedAsset = {
  id: string;
  type: "logo" | "qr" | "portrait" | "product" | "seal" | "other";
  label: string;
  importance: "critical" | "high" | "normal";
  instruction: string;
};

export type DesignLayer = {
  id: string;
  type: "background" | "person" | "text" | "logo" | "decoration" | "effect" | "unknown";
  label: string;
  locked?: boolean;
  notes?: string;
};

export type BrandProfile = {
  name?: string;
  colors?: string[];
  fontStyle?: string;
  logoPlacement?: string;
  visualTone?: string;
  rules?: string[];
};

export type DesignDiagnosis = {
  summary: string;
  aspectRatio?: string;
  mainTexts: ProtectedTextItem[];
  protectedAssets: ProtectedAsset[];
  layers: DesignLayer[];
  colorStyle?: string;
  layoutProblems: string[];
  optimizationDirections: string[];
  textProtectionNotes: string[];
  generationPrompt: string;
  brandProfile?: BrandProfile;
};

export type VersionLineage = {
  projectId?: string;
  parentIds?: string[];
  taskId?: string;
  nodeOperation?: string;
  sourceUrls?: string[];
};

export type ProtectionContext = {
  protectedTexts?: ProtectedTextItem[];
  protectedAssets?: ProtectedAsset[];
  layers?: DesignLayer[];
  brandProfile?: BrandProfile;
  designDiagnosis?: Partial<DesignDiagnosis>;
  version?: VersionLineage;
};

export function normalizeProtectionContext(value: unknown): ProtectionContext {
  if (!value || typeof value !== "object") return {};
  const source = value as ProtectionContext;

  return {
    protectedTexts: Array.isArray(source.protectedTexts)
      ? source.protectedTexts.filter((item) => Boolean(item?.text)).slice(0, 24)
      : [],
    protectedAssets: Array.isArray(source.protectedAssets)
      ? source.protectedAssets.filter((item) => Boolean(item?.label)).slice(0, 16)
      : [],
    layers: Array.isArray(source.layers) ? source.layers.filter((item) => Boolean(item?.label)).slice(0, 18) : [],
    brandProfile: source.brandProfile && typeof source.brandProfile === "object" ? source.brandProfile : undefined,
    designDiagnosis:
      source.designDiagnosis && typeof source.designDiagnosis === "object" ? source.designDiagnosis : undefined,
    version: source.version && typeof source.version === "object" ? source.version : undefined,
  };
}

export function parseProtectionContext(value: FormDataEntryValue | null | undefined): ProtectionContext {
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    return normalizeProtectionContext(JSON.parse(value));
  } catch {
    return {};
  }
}

export function buildProtectionPrompt(context?: ProtectionContext) {
  const normalized = normalizeProtectionContext(context);
  const protectedTexts = normalized.protectedTexts || [];
  const protectedAssets = normalized.protectedAssets || [];
  const layers = normalized.layers || [];
  const brand = normalized.brandProfile;

  const lines = [
    protectedTexts.length
      ? [
          "文字保护清单：以下文字属于锁定信息，必须尽量逐字保留，不要改写、删减、错字、替换同义词或编造新内容。",
          ...protectedTexts.map((item) => `- ${item.text}（${item.kind}，${importanceLabel(item.importance)}）`),
        ].join("\n")
      : "",
    protectedAssets.length
      ? [
          "资产保护清单：以下视觉资产要保持识别度和位置关系。",
          ...protectedAssets.map((item) => `- ${item.label}：${item.instruction}`),
        ].join("\n")
      : "",
    layers.length
      ? [
          "图层化处理建议：AI 可以优化背景、光影、质感、构图和氛围；锁定层不要随意移动或重画。",
          ...layers.map((item) => `- ${item.label} / ${item.type}${item.locked ? " / 锁定" : ""}${item.notes ? `：${item.notes}` : ""}`),
        ].join("\n")
      : "",
    brand
      ? [
          "品牌风格约束：",
          brand.name ? `- 品牌/机构：${brand.name}` : "",
          brand.colors?.length ? `- 品牌色：${brand.colors.join("、")}` : "",
          brand.fontStyle ? `- 字体气质：${brand.fontStyle}` : "",
          brand.logoPlacement ? `- Logo位置：${brand.logoPlacement}` : "",
          brand.visualTone ? `- 视觉气质：${brand.visualTone}` : "",
          ...(brand.rules || []).map((rule) => `- ${rule}`),
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    !brand?.logoPlacement && !protectedAssets.some((item) => item.type === "logo" || item.type === "qr")
      ? "Logo/二维码策略：未明确提供 Logo 或二维码时，不要自行生成，也不要强行预留占位。"
      : "",
    normalized.designDiagnosis?.summary ? `设计诊断摘要：${normalized.designDiagnosis.summary}` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

export function extractProtectionFromText(text: string): ProtectedTextItem[] {
  const items: ProtectedTextItem[] = [];
  const seen = new Set<string>();

  addMatches(text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g), "phone", "critical", "手机号");
  addMatches(text.match(/(?:0\d{2,3}[-\s]?)?\d{7,8}/g), "phone", "critical", "固定电话");
  addMatches(text.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,24}(?:医院|门诊|诊所|体检中心|医疗中心)/g), "hospital", "critical", "医疗机构名称");
  addMatches(text.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,12}(?:医生|主任|院长|专家|教授)/g), "doctor", "high", "医生/专家信息");
  addMatches(text.match(/(?:￥|¥)?\d+(?:\.\d+)?元/g), "price", "high", "价格信息");
  addMatches(text.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,40}(?:路|街|大道|号|楼|室|区|县|市)/g), "address", "high", "地址信息");

  return items.slice(0, 24);

  function addMatches(
    matches: RegExpMatchArray | null,
    kind: ProtectedTextItem["kind"],
    importance: ProtectedTextItem["importance"],
    reason: string,
  ) {
    for (const match of matches || []) {
      const cleaned = match.trim();
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      items.push({
        id: `protected_${items.length + 1}`,
        text: cleaned,
        kind,
        importance,
        reason,
      });
    }
  }
}

export function safeParseDiagnosis(raw: string): DesignDiagnosis | null {
  const jsonText = extractJson(raw);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as Partial<DesignDiagnosis>;
    return {
      summary: stringValue(parsed.summary) || "已完成设计诊断。",
      aspectRatio: stringValue(parsed.aspectRatio),
      mainTexts: normalizeProtectedTexts(parsed.mainTexts),
      protectedAssets: normalizeProtectedAssets(parsed.protectedAssets),
      layers: normalizeLayers(parsed.layers),
      colorStyle: stringValue(parsed.colorStyle),
      layoutProblems: stringArray(parsed.layoutProblems),
      optimizationDirections: stringArray(parsed.optimizationDirections).slice(0, 3),
      textProtectionNotes: stringArray(parsed.textProtectionNotes),
      generationPrompt: stringValue(parsed.generationPrompt) || "",
      brandProfile: parsed.brandProfile,
    };
  } catch {
    return null;
  }
}

export function diagnosisToDisplayText(diagnosis: DesignDiagnosis) {
  return [
    `诊断摘要：${diagnosis.summary}`,
    diagnosis.aspectRatio ? `画面比例：${diagnosis.aspectRatio}` : "",
    diagnosis.colorStyle ? `色彩风格：${diagnosis.colorStyle}` : "",
    diagnosis.mainTexts.length ? `需保护文字：${diagnosis.mainTexts.map((item) => item.text).join(" / ")}` : "",
    diagnosis.protectedAssets.length ? `需保护资产：${diagnosis.protectedAssets.map((item) => item.label).join(" / ")}` : "",
    diagnosis.layoutProblems.length ? `版式问题：${diagnosis.layoutProblems.join("；")}` : "",
    diagnosis.optimizationDirections.length ? `优化方向：${diagnosis.optimizationDirections.join("；")}` : "",
    diagnosis.generationPrompt ? `生图 Prompt：${diagnosis.generationPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return "";
}

function normalizeProtectedTexts(value: unknown): ProtectedTextItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ProtectedTextItem | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<ProtectedTextItem>;
      const text = stringValue(source.text);
      if (!text) return null;
      return {
        id: stringValue(source.id) || `protected_${index + 1}`,
        text,
        kind: source.kind || "other",
        importance: source.importance || "normal",
        reason: stringValue(source.reason),
      };
    })
    .filter((item): item is ProtectedTextItem => Boolean(item));
}

function normalizeProtectedAssets(value: unknown): ProtectedAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<ProtectedAsset>;
      const label = stringValue(source.label);
      if (!label) return null;
      return {
        id: stringValue(source.id) || `asset_${index + 1}`,
        type: source.type || "other",
        label,
        importance: source.importance || "normal",
        instruction: stringValue(source.instruction) || "保持识别度，不要改写或删除。",
      };
    })
    .filter((item): item is ProtectedAsset => Boolean(item));
}

function normalizeLayers(value: unknown): DesignLayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): DesignLayer | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Partial<DesignLayer>;
      const label = stringValue(source.label);
      if (!label) return null;
      return {
        id: stringValue(source.id) || `layer_${index + 1}`,
        type: source.type || "unknown",
        label,
        locked: Boolean(source.locked),
        notes: stringValue(source.notes),
      };
    })
    .filter((item): item is DesignLayer => Boolean(item));
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function importanceLabel(value: ProtectedTextItem["importance"]) {
  if (value === "critical") return "关键锁定";
  if (value === "high") return "重点保护";
  return "普通保护";
}
