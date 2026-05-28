export type ProjectFactField =
  | "organizationName"
  | "address"
  | "phone"
  | "website"
  | "wechat"
  | "mapLink"
  | "logo"
  | "brandColors"
  | "fonts"
  | "slogans"
  | "forbiddenContent";

export type ProjectFactStatus = "pending" | "confirmed" | "rejected";
export type LibraryKind = "project" | "public_style";
export type LibraryReferenceMode = "read_only" | "copy_into_project";
export type AssetSourceType = "user_upload" | "ai_generated" | "network_reference";
export type AssetCommercialStatus = "allowed" | "restricted" | "unknown";
export type AssetConfirmationStatus = "confirmed" | "pending";
export type ProjectAssetType =
  | "logo"
  | "image"
  | "poster"
  | "copy"
  | "icon"
  | "background"
  | "person"
  | "history_result"
  | "template"
  | "reference"
  | "style_rule"
  | "document"
  | "screenshot"
  | "video_frame"
  | "other";

export type ProjectFactCandidate = {
  id: string;
  field: ProjectFactField;
  label: string;
  value: string;
  sourceLabel: string;
  sourceUrl?: string;
  fetchedAt: string;
  status: ProjectFactStatus;
};

export type ProjectArchiveRecord = {
  projectName: string;
  organizationName: string;
  address: string;
  phone: string;
  website: string;
  wechat: string;
  mapLink: string;
  logoAssetId?: string;
  brandColors: string[];
  fonts: string[];
  slogans: string[];
  forbiddenContent: string[];
  historyDesignIds: string[];
  historyGenerationIds: string[];
  pendingFacts: ProjectFactCandidate[];
  notes: string;
  updatedAt: string;
};

export type ProjectAssetRecord = {
  id: string;
  name: string;
  sourceType: AssetSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  projectId?: string;
  libraryId: string;
  type: ProjectAssetType;
  commercialStatus: AssetCommercialStatus;
  confirmationStatus: AssetConfirmationStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  scenes: string[];
  colorTags: string[];
  fileName?: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  summary?: string;
  notes?: string;
};

export type MaterialLibraryReference = {
  id: string;
  libraryId: string;
  libraryName: string;
  kind: LibraryKind;
  linkedProjectId?: string;
  mode: LibraryReferenceMode;
  enabled: boolean;
  createdAt: string;
};

export type MaterialLibraryRecord = {
  id: string;
  name: string;
  kind: LibraryKind;
  ownerProjectId?: string;
  description: string;
  tags: string[];
  items: ProjectAssetRecord[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectLibrarySelection = {
  activeProjectLibraryId?: string;
  activeReferenceLibraryIds: string[];
  activePublicStyleLibraryIds: string[];
};

export type ProjectKnowledgeBase = {
  archive: ProjectArchiveRecord;
  materialLibrary: MaterialLibraryRecord;
  references: MaterialLibraryReference[];
  selection: ProjectLibrarySelection;
};

export type PublicStyleLibraryTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
};

export const defaultPublicStyleLibraryTemplates: PublicStyleLibraryTemplate[] = [
  { id: "style_apple", name: "苹果设计风格库", description: "克制、留白、清晰层级、极简科技感。", tags: ["极简", "科技", "高级", "苹果"] },
  { id: "style_xiaomi", name: "小米设计风格库", description: "年轻科技、产品感、轻营销、明快层级。", tags: ["科技", "消费电子", "小米"] },
  { id: "style_huawei", name: "华为设计风格库", description: "高端科技、稳重、精密、品牌感。", tags: ["科技", "高端", "华为"] },
  { id: "style_nike", name: "Nike 运动风格库", description: "力量感、速度感、运动海报构图。", tags: ["运动", "年轻", "海报"] },
  { id: "style_muji", name: "MUJI 极简风格库", description: "低饱和、自然、克制留白。", tags: ["极简", "生活方式", "MUJI"] },
  { id: "style_ikea", name: "宜家家居风格库", description: "明亮、家居陈列、功能导向。", tags: ["家居", "明亮", "生活方式"] },
  { id: "style_medical_highend", name: "高端医疗风格库", description: "专业、可信、干净、高级医疗视觉。", tags: ["医疗", "高端", "可信"] },
  { id: "style_medical_general", name: "医疗健康风格库", description: "清晰、专业、信息可信、蓝白系常用。", tags: ["医疗", "健康"] },
  { id: "style_science_museum", name: "科技馆科普风格库", description: "科技感、科普友好、儿童与家庭可读。", tags: ["科技馆", "科普", "亲子"] },
  { id: "style_family_event", name: "亲子活动风格库", description: "活泼、安全、色彩友好、信息清楚。", tags: ["亲子", "活动"] },
  { id: "style_gov", name: "政务党建风格库", description: "规范、稳定、正式、红金蓝常用。", tags: ["政务", "党建"] },
  { id: "style_tcm", name: "中医国风风格库", description: "中式留白、传统纹样、沉稳可信。", tags: ["中医", "国风"] },
  { id: "style_poster_modern", name: "现代商业海报排版库", description: "现代海报排版、标题层级和商业转化结构。", tags: ["海报", "排版", "商业"] },
  { id: "style_outdoor", name: "户外广告排版库", description: "远距离识别优先，标题大，信息少而准。", tags: ["户外", "排版"] },
  { id: "style_elevator", name: "电梯海报排版库", description: "窄空间阅读、标题优先、二维码底部留足边距。", tags: ["电梯", "海报"] },
  { id: "style_bus", name: "公交广告排版库", description: "极宽比例，重点信息醒目，不堆字。", tags: ["公交广告", "超宽"] },
  { id: "style_led", name: "大屏电子屏排版库", description: "超宽信息布局，远距离阅读优先。", tags: ["电子屏", "大屏"] },
  { id: "style_wechat_cover", name: "微信公众号封面风格库", description: "竖向信息流封面，标题清晰，品牌露出稳定。", tags: ["公众号", "封面"] },
];

export function createEmptyProjectArchive(projectName: string): ProjectArchiveRecord {
  return {
    projectName,
    organizationName: "",
    address: "",
    phone: "",
    website: "",
    wechat: "",
    mapLink: "",
    brandColors: [],
    fonts: [],
    slogans: [],
    forbiddenContent: [],
    historyDesignIds: [],
    historyGenerationIds: [],
    pendingFacts: [],
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyMaterialLibrary(input: {
  id?: string;
  name: string;
  kind: LibraryKind;
  ownerProjectId?: string;
  description?: string;
  tags?: string[];
}): MaterialLibraryRecord {
  const now = new Date().toISOString();
  return {
    id: input.id || `library_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    name: input.name,
    kind: input.kind,
    ownerProjectId: input.ownerProjectId,
    description: input.description || "",
    tags: input.tags || [],
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultProjectKnowledge(input: { projectId: string; projectName: string }): ProjectKnowledgeBase {
  const materialLibrary = createEmptyMaterialLibrary({
    id: `${input.projectId}_library`,
    name: `${input.projectName}素材库`,
    kind: "project",
    ownerProjectId: input.projectId,
    description: `${input.projectName} 独立项目素材库`,
  });
  return {
    archive: createEmptyProjectArchive(input.projectName),
    materialLibrary,
    references: [],
    selection: {
      activeProjectLibraryId: materialLibrary.id,
      activeReferenceLibraryIds: [],
      activePublicStyleLibraryIds: [],
    },
  };
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) items.push(item);
  }
  return items;
}

export function normalizeProjectAssetRecord(value: unknown, libraryId: string): ProjectAssetRecord | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ProjectAssetRecord>;
  const now = new Date().toISOString();
  return {
    id: typeof source.id === "string" ? source.id : `asset_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    name: typeof source.name === "string" ? source.name : "未命名素材",
    sourceType: source.sourceType === "ai_generated" || source.sourceType === "network_reference" ? source.sourceType : "user_upload",
    sourceLabel: typeof source.sourceLabel === "string" ? source.sourceLabel : "本地上传",
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
    projectId: typeof source.projectId === "string" ? source.projectId : undefined,
    libraryId: typeof source.libraryId === "string" ? source.libraryId : libraryId,
    type: normalizeAssetType(source.type),
    commercialStatus: source.commercialStatus === "allowed" || source.commercialStatus === "restricted" ? source.commercialStatus : "unknown",
    confirmationStatus: source.confirmationStatus === "pending" ? "pending" : "confirmed",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : now,
    tags: normalizeStringArray(source.tags),
    scenes: normalizeStringArray(source.scenes),
    colorTags: normalizeStringArray(source.colorTags),
    fileName: typeof source.fileName === "string" ? source.fileName : undefined,
    url: typeof source.url === "string" ? source.url : undefined,
    mimeType: typeof source.mimeType === "string" ? source.mimeType : undefined,
    width: typeof source.width === "number" ? source.width : undefined,
    height: typeof source.height === "number" ? source.height : undefined,
    summary: typeof source.summary === "string" ? source.summary : undefined,
    notes: typeof source.notes === "string" ? source.notes : undefined,
  };
}

export function normalizeMaterialLibraryRecord(value: unknown, fallback: MaterialLibraryRecord): MaterialLibraryRecord {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<MaterialLibraryRecord>;
  return {
    ...fallback,
    id: typeof source.id === "string" ? source.id : fallback.id,
    name: typeof source.name === "string" ? source.name : fallback.name,
    kind: source.kind === "public_style" ? "public_style" : fallback.kind,
    ownerProjectId: typeof source.ownerProjectId === "string" ? source.ownerProjectId : fallback.ownerProjectId,
    description: typeof source.description === "string" ? source.description : fallback.description,
    tags: normalizeStringArray(source.tags),
    items: normalizeProjectAssetRecords(source.items, typeof source.id === "string" ? source.id : fallback.id, fallback.items),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : fallback.createdAt,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : fallback.updatedAt,
  };
}

export function normalizeProjectKnowledge(value: unknown, input: { projectId: string; projectName: string }): ProjectKnowledgeBase {
  const fallback = createDefaultProjectKnowledge(input);
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<ProjectKnowledgeBase>;
  return {
    archive: normalizeProjectArchiveRecord(source.archive, input.projectName),
    materialLibrary: normalizeMaterialLibraryRecord(source.materialLibrary, fallback.materialLibrary),
    references: normalizeMaterialLibraryReferences(source.references),
    selection: normalizeProjectLibrarySelection(source.selection, fallback.selection),
  };
}

function normalizeProjectAssetRecords(value: unknown, libraryId: string, fallback: ProjectAssetRecord[]) {
  if (!Array.isArray(value)) return fallback;
  const items: ProjectAssetRecord[] = [];
  for (const item of value) {
    const normalized = normalizeProjectAssetRecord(item, libraryId);
    if (normalized) items.push(normalized);
  }
  return items;
}

function normalizeMaterialLibraryReferences(value: unknown) {
  if (!Array.isArray(value)) return [];
  const references: MaterialLibraryReference[] = [];
  for (const item of value) {
    const normalized = normalizeMaterialLibraryReference(item);
    if (normalized) references.push(normalized);
  }
  return references;
}

function normalizeProjectFactCandidates(value: unknown) {
  if (!Array.isArray(value)) return [];
  const candidates: ProjectFactCandidate[] = [];
  for (const item of value) {
    const normalized = normalizeProjectFactCandidate(item);
    if (normalized) candidates.push(normalized);
  }
  return candidates;
}

type PublicStyleLibraryProfile = {
  rules: string[];
  colorRules: string[];
  typographyRules: string[];
  layoutRules: string[];
  avoid: string[];
  usageScenes: string[];
  references: Array<{ label: string; note: string; url?: string }>;
};

export function createDefaultPublicStyleLibraries() {
  return defaultPublicStyleLibraryTemplates.map((template) => {
    const profile = getPublicStyleLibraryProfile(template);
    const now = new Date().toISOString();
    return {
      ...createEmptyMaterialLibrary({
        id: template.id,
        name: template.name,
        kind: "public_style",
        description: template.description,
        tags: template.tags,
      }),
      items: [
        createStyleRuleAsset(template.id, `${template.name} · 风格规则`, "风格规则", profile.rules.join("；"), "内部整理风格规则", now, template.tags),
        createStyleRuleAsset(template.id, `${template.name} · 配色规则`, "配色规则", profile.colorRules.join("；"), "内部整理色彩规则", now, template.tags),
        createStyleRuleAsset(template.id, `${template.name} · 字体层级`, "字体层级", profile.typographyRules.join("；"), "内部整理字体层级", now, template.tags),
        createStyleRuleAsset(template.id, `${template.name} · 版式规则`, "版式规则", profile.layoutRules.join("；"), "内部整理版式规则", now, template.tags),
        createStyleRuleAsset(template.id, `${template.name} · 适用场景`, "适用场景", profile.usageScenes.join("；"), "内部整理适用场景", now, template.tags),
        createStyleRuleAsset(template.id, `${template.name} · 禁用项`, "禁用项", profile.avoid.join("；"), "内部整理禁用项", now, template.tags),
        ...profile.references.map((reference, index) =>
          createStyleReferenceAsset(template.id, `${template.name} · 参考 ${index + 1}`, reference.label, reference.note, reference.url, now, template.tags),
        ),
      ],
    };
  });
}

function getPublicStyleLibraryProfile(template: PublicStyleLibraryTemplate): PublicStyleLibraryProfile {
  switch (template.id) {
    case "style_apple":
      return {
        rules: ["留白充足", "层级极简", "主体突出", "信息密度低", "强调克制与秩序"],
        colorRules: ["黑白灰为主", "局部单一强调色", "避免高饱和撞色", "背景干净"],
        typographyRules: ["大标题清晰", "字重统一", "字距克制", "少用花字", "避免复杂阴影"],
        layoutRules: ["单焦点构图", "左右或上下分层清楚", "大面积留白", "少装饰"],
        avoid: ["不要堆满文案", "不要复杂渐变", "不要多种字体混用", "不要花哨边框"],
        usageScenes: ["产品海报", "高端科技", "极简品牌物料", "设备展示"],
        references: [{ label: "官方公开设计语言", note: "只提炼规则，不直接搬用图像。", url: "" }],
      };
    case "style_xiaomi":
      return {
        rules: ["年轻明快", "标题直接", "节奏清楚", "产品/主体感强"],
        colorRules: ["高识别主色", "辅色少而准", "保持清爽", "避免脏灰"],
        typographyRules: ["标题醒目", "信息分层明确", "强调数字和利益点", "少用长句"],
        layoutRules: ["内容偏紧凑但不拥挤", "视觉焦点明确", "电商/产品感强"],
        avoid: ["不要过度留白", "不要过于沉稳压抑", "不要使用过多装饰元素"],
        usageScenes: ["消费电子", "新品宣传", "活动海报", "科技感传播"],
        references: [{ label: "品牌公开视觉", note: "提炼年轻科技感和产品传播节奏。", url: "" }],
      };
    case "style_huawei":
      return {
        rules: ["高端稳重", "结构严谨", "品牌感强", "信息可信"],
        colorRules: ["深色或低饱和", "高质感渐变少量使用", "视觉稳定", "避免刺眼"],
        typographyRules: ["字重稳", "标题规范", "层级清楚", "留出呼吸感"],
        layoutRules: ["居中秩序感", "对齐严格", "边界干净", "适合高端科技内容"],
        avoid: ["不要过度年轻化", "不要卡通化", "不要过密排版"],
        usageScenes: ["高端科技", "企业品牌", "发布会", "专业传播"],
        references: [{ label: "品牌公开视觉", note: "提炼稳重、高端、可信的版式逻辑。", url: "" }],
      };
    case "style_medical_highend":
      return {
        rules: ["专业可信", "干净清晰", "信息有序", "突出安全感"],
        colorRules: ["蓝白浅青", "低饱和医疗色", "少用强对比红色", "背景保持洁净"],
        typographyRules: ["标题大且清楚", "电话与机构信息醒目", "少用花哨字体"],
        layoutRules: ["信息分区明确", "留白适中", "主体与文字分开", "适合长条或竖版海报"],
        avoid: ["不要夸张营销感", "不要使用不可信医疗承诺", "不要让小字贴边"],
        usageScenes: ["医疗广告", "专家宣传", "检查活动", "医院品牌物料"],
        references: [{ label: "医疗公开物料", note: "仅供风格分析，强调可信与清晰。", url: "" }],
      };
    case "style_science_museum":
      return {
        rules: ["科技感", "亲子友好", "信息清楚", "互动感适中"],
        colorRules: ["蓝紫或明亮科技色", "避免过暗", "用少量强调色", "保持童趣但不幼稚"],
        typographyRules: ["标题易读", "副标题清楚", "信息分层轻快", "字体现代"],
        layoutRules: ["图文平衡", "适合展览/活动导流", "留出动线和参与说明"],
        avoid: ["不要过于医疗化", "不要太严肃", "不要信息过多"],
        usageScenes: ["科技馆", "科普活动", "亲子研学", "科普展板"],
        references: [{ label: "科普公开案例", note: "提炼科技馆常见可读性和亲子友好逻辑。", url: "" }],
      };
    case "style_poster_modern":
      return {
        rules: ["商业感强", "标题驱动", "结构现代", "适合多物料延展"],
        colorRules: ["主色明确", "配色层次清楚", "避免过多颜色", "允许适度渐变"],
        typographyRules: ["标题层级鲜明", "副文案简洁", "信息区块分明"],
        layoutRules: ["上下分层常用", "横竖版都可延展", "适合电梯/海报/封面"],
        avoid: ["不要版式散", "不要文案太长", "不要标题淹没主体"],
        usageScenes: ["商业活动", "推广海报", "通用物料", "延展版式"],
        references: [{ label: "现代商业海报参考", note: "提炼通用商业海报结构，不直接照搬成品。", url: "" }],
      };
    default:
      return {
        rules: [`${template.description}；保持识别度与可读性`],
        colorRules: ["主色稳定", "辅助色少量", "避免色彩泛滥"],
        typographyRules: ["标题优先", "文字分层", "保证远距可读"],
        layoutRules: ["按用途控制信息密度", "保留安全边距", "突出主体与行动入口"],
        avoid: ["不要直接混用其他项目素材", "不要堆砌装饰", "不要信息过载"],
        usageScenes: [template.description],
        references: [{ label: "公开参考整理", note: "仅用于风格分析与规则提炼。", url: "" }],
      };
  }
}

function createStyleRuleAsset(
  libraryId: string,
  name: string,
  summaryTitle: string,
  summary: string,
  sourceLabel: string,
  now: string,
  tags: string[],
): ProjectAssetRecord {
  return {
    id: `style_${libraryId}_${summaryTitle}_${Math.random().toString(16).slice(2, 7)}`,
    name,
    sourceType: "user_upload",
    sourceLabel,
    libraryId,
    type: "style_rule",
    commercialStatus: "allowed",
    confirmationStatus: "confirmed",
    createdAt: now,
    updatedAt: now,
    tags,
    scenes: [summaryTitle],
    colorTags: [],
    summary: `${summaryTitle}：${summary}`,
    notes: "内部整理规则，仅供风格分析与生成参考。",
  };
}

function createStyleReferenceAsset(
  libraryId: string,
  name: string,
  sourceLabel: string,
  note: string,
  url: string | undefined,
  now: string,
  tags: string[],
): ProjectAssetRecord {
  return {
    id: `style_ref_${libraryId}_${Math.random().toString(16).slice(2, 7)}`,
    name,
    sourceType: "network_reference",
    sourceLabel,
    sourceUrl: url || undefined,
    libraryId,
    type: "reference",
    commercialStatus: "restricted",
    confirmationStatus: "pending",
    createdAt: now,
    updatedAt: now,
    tags,
    scenes: ["风格参考"],
    colorTags: [],
    summary: note,
    notes: "网络/公开参考素材，仅供风格分析，默认不可直接商用。",
  };
}

function normalizeProjectArchiveRecord(value: unknown, projectName: string): ProjectArchiveRecord {
  const fallback = createEmptyProjectArchive(projectName);
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<ProjectArchiveRecord>;
  return {
    ...fallback,
    projectName: typeof source.projectName === "string" ? source.projectName : projectName,
    organizationName: typeof source.organizationName === "string" ? source.organizationName : "",
    address: typeof source.address === "string" ? source.address : "",
    phone: typeof source.phone === "string" ? source.phone : "",
    website: typeof source.website === "string" ? source.website : "",
    wechat: typeof source.wechat === "string" ? source.wechat : "",
    mapLink: typeof source.mapLink === "string" ? source.mapLink : "",
    logoAssetId: typeof source.logoAssetId === "string" ? source.logoAssetId : undefined,
    brandColors: normalizeStringArray(source.brandColors),
    fonts: normalizeStringArray(source.fonts),
    slogans: normalizeStringArray(source.slogans),
    forbiddenContent: normalizeStringArray(source.forbiddenContent),
    historyDesignIds: normalizeStringArray(source.historyDesignIds),
    historyGenerationIds: normalizeStringArray(source.historyGenerationIds),
    pendingFacts: normalizeProjectFactCandidates(source.pendingFacts),
    notes: typeof source.notes === "string" ? source.notes : "",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : fallback.updatedAt,
  };
}

function normalizeProjectFactCandidate(value: unknown): ProjectFactCandidate | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<ProjectFactCandidate>;
  if (typeof source.value !== "string" || typeof source.field !== "string") return null;
  return {
    id: typeof source.id === "string" ? source.id : `fact_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    field: normalizeFactField(source.field),
    label: typeof source.label === "string" ? source.label : source.field,
    value: source.value,
    sourceLabel: typeof source.sourceLabel === "string" ? source.sourceLabel : "网络来源",
    sourceUrl: typeof source.sourceUrl === "string" ? source.sourceUrl : undefined,
    fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt : new Date().toISOString(),
    status: source.status === "confirmed" || source.status === "rejected" ? source.status : "pending",
  };
}

function normalizeMaterialLibraryReference(value: unknown): MaterialLibraryReference | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<MaterialLibraryReference>;
  if (typeof source.libraryId !== "string" || typeof source.libraryName !== "string") return null;
  return {
    id: typeof source.id === "string" ? source.id : `ref_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    libraryId: source.libraryId,
    libraryName: source.libraryName,
    kind: source.kind === "public_style" ? "public_style" : "project",
    linkedProjectId: typeof source.linkedProjectId === "string" ? source.linkedProjectId : undefined,
    mode: source.mode === "copy_into_project" ? "copy_into_project" : "read_only",
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : new Date().toISOString(),
  };
}

function normalizeProjectLibrarySelection(value: unknown, fallback: ProjectLibrarySelection): ProjectLibrarySelection {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<ProjectLibrarySelection>;
  return {
    activeProjectLibraryId: typeof source.activeProjectLibraryId === "string" ? source.activeProjectLibraryId : fallback.activeProjectLibraryId,
    activeReferenceLibraryIds: normalizeStringArray(source.activeReferenceLibraryIds),
    activePublicStyleLibraryIds: normalizeStringArray(source.activePublicStyleLibraryIds),
  };
}

function normalizeAssetType(value: unknown): ProjectAssetType {
  const allowed: ProjectAssetType[] = [
    "logo",
    "image",
    "poster",
    "copy",
    "icon",
    "background",
    "person",
    "history_result",
    "template",
    "reference",
    "style_rule",
    "document",
    "screenshot",
    "video_frame",
    "other",
  ];
  return allowed.includes(value as ProjectAssetType) ? (value as ProjectAssetType) : "other";
}

function normalizeFactField(value: unknown): ProjectFactField {
  const allowed: ProjectFactField[] = [
    "organizationName",
    "address",
    "phone",
    "website",
    "wechat",
    "mapLink",
    "logo",
    "brandColors",
    "fonts",
    "slogans",
    "forbiddenContent",
  ];
  return allowed.includes(value as ProjectFactField) ? (value as ProjectFactField) : "organizationName";
}
