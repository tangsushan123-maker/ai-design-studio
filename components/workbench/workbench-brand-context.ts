import { defaultBrandAssetUsage } from "@/components/workbench/workbench-config";
import { sanitizeSerializableImageUrl } from "@/components/workbench/workbench-image-lifecycle";
import { inferProjectAssetType, resolveProjectAssetMaterialType } from "@/components/workbench/workbench-project-helpers";
import {
  resolveNoVisibleProjectOutputPolicy,
  resolveVisibleProjectInfoRequests,
  sanitizeProjectMemoryForPrompt,
  shouldUseProjectPromptContext,
} from "@/components/workbench/workbench-prompt-policy";
import type {
  BrandAssetSummary,
  BrandAssetUsage,
  ImageAsset,
  MaterialLibrarySummary,
  ProjectPayload,
  ProjectProfile,
  ProtectedAssetPayload,
  ProtectedTextPayload,
  ProtectionContextPayload,
} from "@/components/workbench/workbench-types";
import {
  normalizeProjectKnowledge,
  type MaterialLibraryRecord,
  type ProjectAssetRecord,
  type ProjectFactCandidate,
  type ProjectKnowledgeBase,
} from "@/lib/project-system";

export function resolveProjectKnowledge(project: ProjectPayload | null | undefined) {
  const nextId = project?.id || "local-project";
  const nextName = project?.name || "AI 设计项目";
  const normalized = normalizeProjectKnowledge(project?.knowledge, { projectId: nextId, projectName: nextName });
  return mergeLegacyDataIntoKnowledge(normalized, {
    projectId: nextId,
    projectName: nextName,
    assets: project?.assets,
    assetText: project?.assetText,
    profile: project?.profile,
  });
}

export function resolveProjectAssets(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  const legacyAssets = restoreAssets(project?.assets);
  return legacyAssets.length ? legacyAssets : materialLibraryAssetsToImages(knowledge.materialLibrary.items);
}

export function resolveProjectAssetText(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  return project?.assetText ?? knowledge.archive.notes ?? "";
}

export function resolveProjectProfile(project: ProjectPayload | null | undefined, knowledge: ProjectKnowledgeBase) {
  const archiveProfile = archiveToProjectProfile(knowledge.archive, knowledge.materialLibrary);
  return normalizeProjectProfile({ ...archiveProfile, ...(project?.profile || {}) });
}

export function buildProjectKnowledgeFromState(input: {
  projectId: string;
  projectName: string;
  projectAssets: ImageAsset[];
  projectAssetText: string;
  projectProfile: ProjectProfile;
  currentKnowledge: ProjectKnowledgeBase;
}) {
  const normalized = normalizeProjectKnowledge(input.currentKnowledge, { projectId: input.projectId, projectName: input.projectName });
  const legacyMerged = mergeLegacyDataIntoKnowledge(normalized, {
    projectId: input.projectId,
    projectName: input.projectName,
    assets: input.projectAssets,
    assetText: input.projectAssetText,
    profile: input.projectProfile,
  });
  return {
    ...legacyMerged,
    selection: {
      ...legacyMerged.selection,
      activeProjectLibraryId: legacyMerged.materialLibrary.id,
    },
  };
}

export function mergePendingFacts(current: ProjectFactCandidate[], incoming: ProjectFactCandidate[]) {
  const seen = new Set<string>();
  return [...current, ...incoming].filter((item) => {
    const key = `${item.field}:${item.value.trim()}:${item.sourceUrl || item.sourceLabel}`;
    if (!item.value.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function restoreAssets(assets?: ImageAsset[]) {
  return Array.isArray(assets)
    ? assets
        .filter((asset) => asset.source === "asset")
        .map((asset) => ({ ...asset, source: "asset" as const }))
    : [];
}

export function normalizeProjectProfile(value: unknown): ProjectProfile {
  const source = value && typeof value === "object" ? (value as Partial<ProjectProfile>) : {};
  return {
    brandColors: safeProfileString(source.brandColors),
    primaryColors: safeProfileString(source.primaryColors) || safeProfileString(source.brandColors),
    secondaryColors: safeProfileString(source.secondaryColors),
    accentColors: safeProfileString(source.accentColors),
    backgroundColors: safeProfileString(source.backgroundColors),
    textColors: safeProfileString(source.textColors),
    colorPalettes: safeProfileString(source.colorPalettes),
    logoName: safeProfileString(source.logoName),
    organizationName: safeProfileString(source.organizationName),
    phone: safeProfileString(source.phone),
    address: safeProfileString(source.address),
    qrCodeNote: safeProfileString(source.qrCodeNote),
    commonCopy: safeProfileString(source.commonCopy),
    forbiddenContent: safeProfileString(source.forbiddenContent),
    commonSizes: safeProfileString(source.commonSizes),
    styleNotes: safeProfileString(source.styleNotes),
    keepText: safeProfileBoolean(source.keepText, true),
    keepLogo: safeProfileBoolean(source.keepLogo, false),
    keepQrCode: safeProfileBoolean(source.keepQrCode, false),
    keepFace: safeProfileBoolean(source.keepFace, true),
    keepMainSubject: safeProfileBoolean(source.keepMainSubject, true),
    onlyEditMaskedArea: safeProfileBoolean(source.onlyEditMaskedArea, true),
    brandAssetUsage: normalizeBrandAssetUsage(source.brandAssetUsage),
  };
}

export function projectProfileColors(profile: ProjectProfile) {
  return Array.from(new Set([
    ...extractColorValues(profile.primaryColors),
    ...extractColorValues(profile.secondaryColors),
    ...extractColorValues(profile.accentColors),
    ...extractColorValues(profile.backgroundColors),
    ...extractColorValues(profile.textColors),
    ...extractColorValues(profile.brandColors),
    ...extractColorValues(profile.colorPalettes),
  ]));
}

export function extractColorValues(value: string) {
  const matches = value.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi);
  return Array.from(new Set((matches || []).map((item) => item.trim())));
}

export function normalizeBrandAssetUsage(value: unknown): BrandAssetUsage {
  const source = value && typeof value === "object" ? (value as Partial<BrandAssetUsage>) : {};
  return {
    usePrimaryColors: safeProfileBoolean(source.usePrimaryColors, defaultBrandAssetUsage.usePrimaryColors),
    useSecondaryColors: safeProfileBoolean(source.useSecondaryColors, defaultBrandAssetUsage.useSecondaryColors),
    useLogo: safeProfileBoolean(source.useLogo, defaultBrandAssetUsage.useLogo),
    useIpImage: safeProfileBoolean(source.useIpImage, defaultBrandAssetUsage.useIpImage),
    useContact: safeProfileBoolean(source.useContact, defaultBrandAssetUsage.useContact),
    useQrCode: safeProfileBoolean(source.useQrCode, defaultBrandAssetUsage.useQrCode),
    useCopy: safeProfileBoolean(source.useCopy, defaultBrandAssetUsage.useCopy),
    useForbiddenRules: safeProfileBoolean(source.useForbiddenRules, defaultBrandAssetUsage.useForbiddenRules),
  };
}

export function getCurrentProjectBrandAssets(projectAssets: ImageAsset[], knowledge: ProjectKnowledgeBase) {
  return mergeProjectLibraryAssets(knowledge.materialLibrary.items, projectAssets, knowledge.materialLibrary.ownerProjectId || "local-project");
}

export function summarizeBrandAssets(profile: ProjectProfile, brandAssets: ImageAsset[]): BrandAssetSummary {
  const colors = projectProfileColors(profile);
  const logoCount = countBrandAssets(brandAssets, "logo");
  const ipCount = countBrandAssets(brandAssets, "ip");
  const qrCount = countBrandAssets(brandAssets, "qrcode");
  const copyCount = splitProfileLines(profile.commonCopy).length;
  const ruleCount = splitProfileLines(profile.forbiddenContent).length;
  const hasContact = Boolean(profile.phone.trim() || profile.address.trim());
  const totalCount = [
    colors.length,
    logoCount,
    ipCount,
    qrCount,
    hasContact ? 1 : 0,
    copyCount,
    ruleCount,
  ].filter(Boolean).length;
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const activeCount = Object.values(usage).filter(Boolean).length;
  return {
    activeCount,
    totalCount,
    colorCount: colors.length,
    logoCount,
    ipCount,
    qrCount,
    hasContact,
    copyCount,
    ruleCount,
    missing: [
      colors.length ? "" : "主色",
      logoCount ? "" : "Logo",
      hasContact ? "" : "联系方式",
      ipCount ? "" : "IP形象",
    ].filter(Boolean),
  };
}

export function countBrandAssets(assets: ImageAsset[], kind: "logo" | "ip" | "qrcode" | "background") {
  return assets.filter((asset) => assetMatchesBrandKind(asset, kind)).length;
}

export function findBrandAssets(assets: ImageAsset[], kind: "logo" | "ip" | "qrcode" | "background") {
  return assets.filter((asset) => assetMatchesBrandKind(asset, kind));
}

export function resolveBrandReferenceAssets(profile: ProjectProfile, assets: ImageAsset[]) {
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const selected = [
    ...(usage.useLogo ? findBrandAssets(assets, "logo").slice(0, 1) : []),
    ...(usage.useIpImage ? findBrandAssets(assets, "ip").slice(0, 1) : []),
    ...(usage.useQrCode ? findBrandAssets(assets, "qrcode").slice(0, 1) : []),
  ];
  const seen = new Set<string>();
  return selected.filter((asset) => {
    const key = asset.id || asset.url || asset.fileName || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(asset.url);
  }).slice(0, 3);
}

export function assetNames(assets: ImageAsset[]) {
  return assets
    .map((asset) => asset.fileName || asset.materialType || asset.mode || asset.id)
    .filter(Boolean)
    .slice(0, 6)
    .join("、");
}

export function splitProfileLines(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildProjectLibraryContext(
  knowledge: ProjectKnowledgeBase,
  projectLibraries: MaterialLibrarySummary[],
  publicStyleLibraries: MaterialLibrarySummary[],
) {
  const referenceTexts = knowledge.references
    .filter((item) => item.enabled)
    .map((item) => {
      const source = item.kind === "project"
        ? projectLibraries.find((library) => library.id === item.libraryId)
        : publicStyleLibraries.find((library) => library.id === item.libraryId);
      const description = source?.description || source?.tags?.join(" / ") || "";
      return `${item.libraryName}（${item.kind === "project" ? "项目素材库" : "公共风格库"}，${item.mode === "copy_into_project" ? "已复制到本项目" : "只读引用"}）${description ? `：${description}` : ""}`;
    });
  const styleRuleTexts = knowledge.selection.activePublicStyleLibraryIds
    .map((libraryId) => publicStyleLibraries.find((library) => library.id === libraryId))
    .filter((library): library is MaterialLibrarySummary => Boolean(library))
    .map((library) => {
      const rules = styleLibraryRulePreview(library);
      const references = styleLibraryReferencePreview(library);
      return `${library.name}：${rules}${references ? `；参考：${references}` : ""}`;
    });
  const localAssetSummary = knowledge.materialLibrary.items.slice(0, 6).map((item) => item.name).join(" / ");
  return [
    `项目档案：${knowledge.archive.projectName}${knowledge.archive.organizationName ? `，机构 ${knowledge.archive.organizationName}` : ""}`,
    localAssetSummary ? `当前项目素材库：${knowledge.materialLibrary.name}，已收录 ${knowledge.materialLibrary.items.length} 项，包括 ${localAssetSummary}` : `当前项目素材库：${knowledge.materialLibrary.name}，暂未上传素材。`,
    referenceTexts.length ? `已引用素材库：${referenceTexts.join("；")}` : "未引用其他项目素材库或公共风格库，禁止跨项目自动混用。",
    styleRuleTexts.length ? `公共风格规则：${styleRuleTexts.join("；")}` : "未启用公共风格规则，默认只按项目档案和当前需求生成。",
    "素材来源规则：用户上传和 AI 生成素材可直接使用；网络参考素材必须标注来源，默认只作参考。",
  ].join("\n");
}

export function buildProjectConstraintText(
  text: string,
  profile: ProjectProfile,
  textProtectionMode: boolean,
  taskContextNotes?: string,
  visibleRequestText?: string,
  brandAssets: ImageAsset[] = [],
) {
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText || text);
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText || "");
  const brandAssetContext = buildBrandAssetContextPack(profile, brandAssets, visibleRequestText || text);
  const projectMemory = sanitizeProjectMemoryForPrompt(text.trim(), visibleRequestText || "");
  const canMentionTextAssets = !hiddenRequests.noText;
  const profileNotes = [
    canMentionTextAssets && visibleRequests.organization && profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    projectProfileColors(profile).length ? `品牌色：${projectProfileColors(profile).join("、")}` : "",
    !hiddenRequests.noLogo && visibleRequests.logo && profile.logoName ? `用户要求 Logo：${profile.logoName}` : "",
    !hiddenRequests.noContact && visibleRequests.phone && profile.phone ? `用户要求电话：${profile.phone}` : "",
    !hiddenRequests.noContact && visibleRequests.address && profile.address ? `用户要求地址：${profile.address}` : "",
    !hiddenRequests.noQr && visibleRequests.qr && profile.qrCodeNote ? `用户要求二维码：${profile.qrCodeNote}` : "",
    canMentionTextAssets && visibleRequests.copy && profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
    !hiddenRequests.noText && profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
    profile.styleNotes ? `风格说明：${profile.styleNotes}` : "",
    profile.keepFace ? "保护人脸/人物识别度。" : "",
    profile.keepMainSubject ? "保护主体、产品和主视觉识别度。" : "",
    profile.onlyEditMaskedArea ? "onlyEditMaskedArea：局部修改时只允许修改涂抹区域。" : "",
  ].filter(Boolean);
  const notes = [projectMemory, brandAssetContext, ...profileNotes, taskContextNotes || ""].filter(Boolean).join("\n");
  if (!textProtectionMode) return notes;
  return [
    notes,
    hiddenRequests.noText ? "用户要求无文字/纯背景：项目记忆、项目文案、机构名、电话地址只作为后台资料，禁止上画。" : "",
    hiddenRequests.noLogo ? "用户要求不要 Logo：项目 Logo 和机构品牌标识禁止上画。" : "",
    hiddenRequests.noQr ? "用户要求不要二维码：二维码和扫码占位禁止上画。" : "",
    "规则：只保护用户明确要求或原图真实存在的文字/Logo/二维码；项目记忆不自动上画。",
    "成图完整铺满目标尺寸，不要白边、托板、相框边或故意留白。",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBrandAssetContextPack(profile: ProjectProfile, brandAssets: ImageAsset[], visibleRequestText = "") {
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const logoAssets = findBrandAssets(brandAssets, "logo");
  const ipAssets = findBrandAssets(brandAssets, "ip");
  const qrAssets = findBrandAssets(brandAssets, "qrcode");
  const backgroundAssets = findBrandAssets(brandAssets, "background");
  const primaryColors = extractColorValues(profile.primaryColors || profile.brandColors);
  const secondaryColors = Array.from(new Set([
    ...extractColorValues(profile.secondaryColors),
    ...extractColorValues(profile.accentColors),
    ...extractColorValues(profile.backgroundColors),
    ...extractColorValues(profile.textColors),
    ...extractColorValues(profile.colorPalettes),
  ]));
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText);
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
  const lines = [
    "【项目素材】",
    !hiddenRequests.noText && visibleRequests.organization && profile.organizationName ? `机构名称：${profile.organizationName}` : "",
    usage.usePrimaryColors && primaryColors.length ? `项目主色：${primaryColors.join("、")}` : "",
    usage.useSecondaryColors && secondaryColors.length ? `辅助配色：${secondaryColors.join("、")}` : "",
    !hiddenRequests.noLogo && usage.useLogo && (profile.logoName || logoAssets.length) ? `Logo：${[profile.logoName, assetNames(logoAssets)].filter(Boolean).join("；")}` : "",
    usage.useIpImage && ipAssets.length ? `IP形象：${assetNames(ipAssets)}` : "",
    !hiddenRequests.noContact && usage.useContact && profile.phone ? `电话：${profile.phone}` : "",
    !hiddenRequests.noContact && usage.useContact && profile.address ? `地址：${profile.address}` : "",
    !hiddenRequests.noQr && usage.useQrCode && (profile.qrCodeNote || qrAssets.length) ? `二维码：${[profile.qrCodeNote, assetNames(qrAssets)].filter(Boolean).join("；")}` : "",
    !hiddenRequests.noText && usage.useCopy && visibleRequests.copy && profile.commonCopy ? `常用宣传语：${splitProfileLines(profile.commonCopy).join("；")}` : "",
    usage.useForbiddenRules && profile.forbiddenContent ? `禁止事项：${splitProfileLines(profile.forbiddenContent).join("；")}` : "",
    backgroundAssets.length ? `常用背景：${assetNames(backgroundAssets)}` : "",
    visibleRequests.phone && !profile.phone ? "用户要求电话但项目资料未填写电话：请提示缺少电话，不要编造。" : "",
    visibleRequests.address && !profile.address ? "用户要求地址但项目资料未填写地址：请提示缺少地址，不要编造。" : "",
    visibleRequests.logo && !profile.logoName && !logoAssets.length ? "用户要求 Logo 但项目素材库未提供 Logo：不要编造 Logo。" : "",
    visibleRequests.qr && !profile.qrCodeNote && !qrAssets.length ? "用户要求二维码但项目素材库未提供二维码：不要生成假二维码。" : "",
    "调用规则：只用当前项目素材；电话/地址/Logo/二维码只有用户明确要求或开关启用才上画；缺失则不编造。",
    missingBrandAssetWarning(profile, brandAssets),
  ].filter(Boolean);
  return lines.length > 3 ? lines.join("\n") : "";
}

function missingBrandAssetWarning(profile: ProjectProfile, brandAssets: ImageAsset[]) {
  const missing = [
    projectProfileColors(profile).length ? "" : "主色",
    findBrandAssets(brandAssets, "logo").length || profile.logoName ? "" : "Logo",
    profile.phone || profile.address ? "" : "联系方式",
    findBrandAssets(brandAssets, "ip").length ? "" : "IP形象",
  ].filter(Boolean);
  return missing.length
    ? `当前项目还没有完整品牌资产，建议补充${missing.join("、")}，生成结果会更准确。缺少品牌素材时，生成结果只能作为灵感初稿，不能当正式交付稿。`
    : "";
}

export function buildProfileProtectionContext(
  profile: ProjectProfile,
  options: {
    projectId: string;
    operation: string;
    sourceImages: ImageAsset[];
    brandAssets?: ImageAsset[];
    visibleRequestText?: string;
  },
): ProtectionContextPayload {
  const hasSourceImage = options.sourceImages.length > 0;
  const protectVisibleProfileAssets = hasSourceImage && options.operation !== "text_to_image";
  const brandAssets = options.brandAssets || [];
  const usage = normalizeBrandAssetUsage(profile.brandAssetUsage);
  const visibleRequestText = options.visibleRequestText || "";
  const visibleRequests = resolveVisibleProjectInfoRequests(visibleRequestText);
  const hiddenRequests = resolveNoVisibleProjectOutputPolicy(visibleRequestText);
  const isProjectAwareTextToImage = options.operation === "text_to_image" && shouldUseProjectPromptContext(visibleRequestText);
  const contactExplicitlyRequested = visibleRequests.phone || visibleRequests.address || usage.useContact;
  const shouldProtectContact = !hiddenRequests.noText && !hiddenRequests.noContact && contactExplicitlyRequested;
  const shouldForbidInventedContact = !hiddenRequests.noText && !hiddenRequests.noContact && isProjectAwareTextToImage && !contactExplicitlyRequested;
  const logoAssets = findBrandAssets(brandAssets, "logo");
  const ipAssets = findBrandAssets(brandAssets, "ip");
  const qrAssets = findBrandAssets(brandAssets, "qrcode");
  const protectedTexts: ProtectedTextPayload[] = [
    profile.organizationName ? protectedText("organization", profile.organizationName, "other", "normal", "机构名称来自项目记忆，仅作为项目识别和校对资料") : null,
    shouldProtectContact && profile.phone ? protectedText("phone", profile.phone, "phone", "critical", "用户明确要求电话；项目电话来自品牌资产包，必须准确使用，不得编造") : null,
    shouldProtectContact && profile.address ? protectedText("address", profile.address, "address", "critical", "用户明确要求地址；项目地址来自品牌资产包，必须准确使用，不得编造") : null,
    ...(usage.useCopy ? splitProfileLines(profile.commonCopy).map((text, index) => protectedText(`copy_${index + 1}`, text, "title", "normal", "常用文案来自项目资料库")) : []),
    ...(usage.useForbiddenRules ? splitProfileLines(profile.forbiddenContent).map((text, index) => protectedText(`forbidden_${index + 1}`, text, "other", "critical", "禁改内容来自项目资料库")) : []),
  ].filter((item): item is ProtectedTextPayload => Boolean(item && item.text.trim()));

  const protectedAssets: ProtectedAssetPayload[] = [
    (usage.useLogo || (protectVisibleProfileAssets && profile.keepLogo)) && (profile.logoName || logoAssets.length)
      ? {
          id: "asset_logo",
          type: "logo",
          label: profile.logoName || assetNames(logoAssets) || "Logo/品牌标识",
          importance: "critical",
          instruction: "Logo 和品牌标识只能来自当前项目品牌资产，不得由 AI 重新发明；不确定时保持位置和视觉占位，后续可程序化回贴。",
        }
      : null,
    (usage.useQrCode || (protectVisibleProfileAssets && profile.keepQrCode)) && (profile.qrCodeNote || qrAssets.length)
      ? {
          id: "asset_qr",
          type: "qr",
          label: profile.qrCodeNote || assetNames(qrAssets) || "二维码",
          importance: "critical",
          instruction: "二维码不能交给 AI 重绘；必须保持清晰可扫码，后续应使用原始二维码回贴。",
        }
      : null,
    usage.useIpImage && ipAssets.length
      ? {
          id: "asset_ip",
          type: "portrait",
          label: assetNames(ipAssets) || "IP形象",
          importance: "high",
          instruction: "IP/医生形象只能参考当前项目素材库，保持识别度，不要混用其他项目形象。",
        }
      : null,
    protectVisibleProfileAssets && profile.keepFace
      ? {
          id: "asset_face",
          type: "portrait",
          label: "人脸/专家照片",
          importance: "critical",
          instruction: "人脸、医生/专家照片和人物识别度不要改变；需要替换时应由用户明确上传新照片。",
        }
      : null,
    protectVisibleProfileAssets && profile.keepMainSubject
      ? {
          id: "asset_subject",
          type: "product",
          label: "主体/产品/主视觉",
          importance: "high",
          instruction: "主体、产品和主视觉结构保持识别度，不要硬裁切或随意替换。",
        }
      : null,
  ].filter((item): item is ProtectedAssetPayload => Boolean(item));

  const brandColors = [
    ...(usage.usePrimaryColors ? extractColorValues(profile.primaryColors || profile.brandColors) : []),
    ...(usage.useSecondaryColors ? [
      ...extractColorValues(profile.secondaryColors),
      ...extractColorValues(profile.accentColors),
      ...extractColorValues(profile.backgroundColors),
      ...extractColorValues(profile.textColors),
      ...extractColorValues(profile.colorPalettes),
    ] : []),
  ];

  return {
    protectedTexts,
    protectedAssets,
    layers: [
      { id: "layer_background", type: "background", label: "背景层", locked: false, notes: "AI 可优化背景、光影、材质和氛围。" },
      ...(protectVisibleProfileAssets && profile.keepText
        ? [{ id: "layer_text", type: "text" as const, label: "文字层", locked: true, notes: "只保护参考图里已经存在或用户明确要求的文字。" }]
        : []),
      ...(protectVisibleProfileAssets && (profile.keepLogo || profile.keepQrCode)
        ? [{ id: "layer_logo", type: "logo" as const, label: "Logo/二维码层", locked: profile.keepLogo || profile.keepQrCode, notes: "Logo 和二维码必须保持识别准确。" }]
        : []),
      ...(protectVisibleProfileAssets && (profile.keepFace || profile.keepMainSubject)
        ? [{ id: "layer_subject", type: "person" as const, label: "主体/人脸层", locked: true, notes: "参考图里的主体、人脸、产品和主视觉主体需要保持识别度。" }]
        : []),
    ],
    brandProfile: {
      name: profile.organizationName || profile.logoName || undefined,
      colors: brandColors,
      logoPlacement: profile.keepLogo || profile.keepQrCode ? `${profile.keepLogo && profile.logoName ? `Logo：${profile.logoName}` : ""}${profile.keepQrCode && profile.qrCodeNote ? `；二维码：${profile.qrCodeNote}` : ""}` : undefined,
      visualTone: profile.styleNotes || undefined,
      rules: [
        profile.commonSizes ? `常用尺寸：${profile.commonSizes}` : "",
        usage.useForbiddenRules && profile.forbiddenContent ? `禁改内容：${profile.forbiddenContent}` : "",
        usage.useCopy && profile.commonCopy ? `常用文案：${profile.commonCopy}` : "",
        shouldProtectContact && profile.phone ? `项目真实电话：${profile.phone}。用户明确要求电话时必须准确使用。` : "未明确要求电话时不要自行生成电话。",
        shouldProtectContact && profile.address ? `项目真实地址：${profile.address}。用户明确要求地址时必须准确使用。` : "未明确要求地址时不要自行生成地址。",
        shouldForbidInventedContact ? "联系方式策略：用户只要求品牌、Logo 或 IP 时，只放对应素材；不要自动添加电话、地址、二维码、预约热线、医院代码、扫码区或联系卡片。" : "",
        usage.useLogo && (profile.logoName || logoAssets.length) ? `项目 Logo：${profile.logoName || assetNames(logoAssets)}。只使用当前项目品牌资产。` : "未提供或未启用 Logo 时不要自行生成，也不要强行预留占位。",
        usage.useQrCode && (profile.qrCodeNote || qrAssets.length) ? `项目二维码：${profile.qrCodeNote || assetNames(qrAssets)}。二维码必须来自原始素材，不要重绘。` : "未提供或未启用二维码时不要自行生成，也不要强行预留占位。",
        usage.useIpImage && ipAssets.length ? `项目 IP形象：${assetNames(ipAssets)}。只参考当前项目素材库。` : "",
        protectVisibleProfileAssets && profile.keepFace ? "保护人脸：参考图里真实存在的人物五官和照片不要改变。" : "",
        protectVisibleProfileAssets && profile.keepMainSubject ? "保护主体：参考图里的主视觉、产品和核心构图不要随意替换。" : "",
        profile.onlyEditMaskedArea ? "局部修改规则：只修改涂抹/蒙版区域，未涂抹区域保持不变。" : "",
        "项目品牌资产按用户勾选项调用；没有素材时禁止编造机构信息、电话、地址、Logo、二维码。",
        "不同项目的品牌资产不能混用；这里只能使用当前项目自己的资料和素材。",
      ].filter(Boolean),
    },
    version: {
      projectId: options.projectId,
      parentIds: options.sourceImages.map((image) => image.id || image.fileName || image.url).filter(Boolean),
      sourceUrls: options.sourceImages.map((image) => image.url).filter(Boolean),
      nodeOperation: options.operation,
    },
  };
}

function protectedText(
  id: string,
  text: string,
  kind: ProtectedTextPayload["kind"],
  importance: ProtectedTextPayload["importance"],
  reason: string,
): ProtectedTextPayload {
  return { id, text: text.trim(), kind, importance, reason };
}

export function styleLibraryRulePreview(library: MaterialLibrarySummary) {
  const rules = (library.items || [])
    .filter((item) => item.type === "style_rule")
    .slice(0, 3)
    .map((item) => item.summary || item.name)
    .filter(Boolean);
  return rules.join(" / ") || library.description || "未记录规则";
}

export function styleLibraryReferencePreview(library: MaterialLibrarySummary) {
  return (library.items || [])
    .filter((item) => item.type === "reference")
    .slice(0, 2)
    .map((item) => item.sourceLabel || item.name)
    .join(" / ");
}

function assetMatchesBrandKind(asset: ImageAsset, kind: "logo" | "ip" | "qrcode" | "background") {
  const source = [asset.fileName, asset.mode, asset.materialType, ...(Array.isArray((asset as { tags?: string[] }).tags) ? (asset as { tags?: string[] }).tags || [] : [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (kind === "logo") return source.includes("logo") || source.includes("标志") || source.includes("品牌标识");
  if (kind === "qrcode") return source.includes("二维码") || source.includes("qrcode") || /\bqr\b/.test(source);
  if (kind === "ip") return source.includes("ip形象") || source.includes("ip") || source.includes("吉祥物") || source.includes("卡通") || source.includes("角色");
  return source.includes("背景") || source.includes("background");
}

function mergeLegacyDataIntoKnowledge(
  knowledge: ProjectKnowledgeBase,
  input: {
    projectId: string;
    projectName: string;
    assets?: ImageAsset[];
    assetText?: string;
    profile?: unknown;
  },
) {
  const profile = normalizeProjectProfile(input.profile);
  return {
    ...knowledge,
    archive: {
      ...knowledge.archive,
      projectName: input.projectName,
      organizationName: profile.organizationName || knowledge.archive.organizationName,
      address: profile.address || knowledge.archive.address,
      phone: profile.phone || knowledge.archive.phone,
      brandColors: projectProfileColors(profile).length ? projectProfileColors(profile) : knowledge.archive.brandColors,
      slogans: splitProfileLines(profile.commonCopy).length ? splitProfileLines(profile.commonCopy) : knowledge.archive.slogans,
      forbiddenContent: splitProfileLines(profile.forbiddenContent).length ? splitProfileLines(profile.forbiddenContent) : knowledge.archive.forbiddenContent,
      notes: input.assetText ?? knowledge.archive.notes,
      updatedAt: new Date().toISOString(),
    },
    materialLibrary: {
      ...knowledge.materialLibrary,
      id: knowledge.materialLibrary.id || `${input.projectId}_library`,
      name: knowledge.materialLibrary.name || `${input.projectName}素材库`,
      ownerProjectId: input.projectId,
      items: mergeProjectAssetRecords(
        knowledge.materialLibrary.items,
        restoreAssets(input.assets).map((asset) => imageAssetToProjectAssetRecord(asset, knowledge.materialLibrary.id, input.projectId)),
      ),
      updatedAt: new Date().toISOString(),
    },
  };
}

function archiveToProjectProfile(archive: ProjectKnowledgeBase["archive"], materialLibrary: MaterialLibraryRecord): Partial<ProjectProfile> {
  const logoAsset = archive.logoAssetId ? materialLibrary.items.find((item) => item.id === archive.logoAssetId) : undefined;
  return {
    organizationName: archive.organizationName,
    phone: archive.phone,
    address: archive.address,
    logoName: logoAsset?.name || "",
    brandColors: archive.brandColors.join("\n"),
    primaryColors: archive.brandColors.slice(0, 1).join("\n"),
    secondaryColors: archive.brandColors.slice(1).join("\n"),
    commonCopy: archive.slogans.join("\n"),
    forbiddenContent: archive.forbiddenContent.join("\n"),
  };
}

export function imageAssetToProjectAssetRecord(asset: ImageAsset, libraryId: string, projectId: string): ProjectAssetRecord {
  return {
    id: asset.id || `asset_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    name: asset.fileName || asset.materialType || asset.mode || "项目素材",
    sourceType: "user_upload",
    sourceLabel: asset.source === "history" ? "结果图片" : "本地上传",
    sourceUrl: sanitizeSerializableImageUrl(asset.url),
    projectId,
    libraryId,
    type: inferProjectAssetType(asset),
    commercialStatus: "allowed",
    confirmationStatus: "confirmed",
    createdAt: asset.generatedAt || new Date().toISOString(),
    updatedAt: asset.generatedAt || new Date().toISOString(),
    tags: [asset.materialType, asset.mode, asset.nodeOperation].filter(Boolean) as string[],
    scenes: [asset.materialScene].filter(Boolean) as string[],
    colorTags: [],
    fileName: asset.fileName,
    url: sanitizeSerializableImageUrl(asset.url),
    mimeType: asset.file?.type,
    width: asset.outputSize?.width || asset.width,
    height: asset.outputSize?.height || asset.height,
    summary: asset.prompt,
    notes: asset.sourceStrategyTitle,
  };
}

function materialLibraryAssetsToImages(items: ProjectAssetRecord[]) {
  return items
    .filter((item) => item.url)
    .map((item) => ({
      id: item.id,
      url: item.url || "",
      prompt: item.summary || "项目素材",
      variant: 0,
      mode: item.type,
      model: item.sourceType === "ai_generated" ? "ai" : "local",
      generatedAt: item.createdAt,
      outputSize: item.width && item.height ? { width: item.width, height: item.height } : undefined,
      fileName: item.fileName || item.name,
      width: item.width,
      height: item.height,
      source: "asset" as const,
      materialType: resolveProjectAssetMaterialType(item),
      materialScene: item.scenes[0],
      sourceLabel: item.sourceLabel,
      sourceStrategyTitle: item.notes,
      targetSize: item.width && item.height ? `${item.width}x${item.height}` : undefined,
      tags: item.tags,
      colorTags: item.colorTags,
    }));
}

export function mergeProjectLibraryAssets(items: ProjectAssetRecord[], assets: ImageAsset[], projectId: string) {
  return materialLibraryAssetsToImages(
    mergeProjectAssetRecords(
      items,
      restoreAssets(assets).map((asset) => imageAssetToProjectAssetRecord(asset, `${projectId}_library`, projectId)),
    ),
  );
}

export function mergeProjectAssetRecords(current: ProjectAssetRecord[], incoming: ProjectAssetRecord[]) {
  const seen = new Set<string>();
  const merged: ProjectAssetRecord[] = [];
  for (const item of [...incoming, ...current]) {
    const key = item.fileName || item.id || item.url || item.name;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function safeProfileString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeProfileBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
