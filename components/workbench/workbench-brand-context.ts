import { defaultBrandAssetUsage } from "@/components/workbench/workbench-config";
import { sanitizeSerializableImageUrl } from "@/components/workbench/workbench-image-lifecycle";
import { inferProjectAssetType, resolveProjectAssetMaterialType } from "@/components/workbench/workbench-project-helpers";
import type {
  BrandAssetSummary,
  BrandAssetUsage,
  ImageAsset,
  ProjectPayload,
  ProjectProfile,
} from "@/components/workbench/workbench-types";
import {
  normalizeProjectKnowledge,
  type MaterialLibraryRecord,
  type ProjectAssetRecord,
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
