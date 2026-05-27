"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Palette,
  RefreshCcw,
  ScanLine,
  Sparkles,
  Sticker,
  SwatchBook,
  Upload,
  X,
} from "lucide-react";
import type { ProjectAssetRecord, ProjectFactCandidate, ProjectKnowledgeBase } from "@/lib/project-system";
import { ImageFrame } from "@/components/workbench/image-frame";

type ProjectProfile = {
  brandColors: string;
  primaryColors: string;
  secondaryColors: string;
  accentColors: string;
  backgroundColors: string;
  textColors: string;
  colorPalettes: string;
  logoName: string;
  organizationName: string;
  phone: string;
  address: string;
  qrCodeNote: string;
  commonCopy: string;
  forbiddenContent: string;
  commonSizes: string;
  styleNotes: string;
  keepText: boolean;
  keepLogo: boolean;
  keepQrCode: boolean;
  keepFace: boolean;
  keepMainSubject: boolean;
  onlyEditMaskedArea: boolean;
  brandAssetUsage: BrandAssetUsage;
};

type BrandAssetUsage = {
  usePrimaryColors: boolean;
  useSecondaryColors: boolean;
  useLogo: boolean;
  useIpImage: boolean;
  useContact: boolean;
  useQrCode: boolean;
  useCopy: boolean;
  useForbiddenRules: boolean;
};

type MaterialLibrarySummary = {
  id: string;
  name: string;
  kind: "project" | "public_style";
  ownerProjectId?: string;
  description: string;
  tags: string[];
  itemCount: number;
  styleRuleCount?: number;
  referenceCount?: number;
  updatedAt?: string;
  items?: ProjectAssetRecord[];
};

type AssetPanelImage = {
  id: string;
  url: string;
  fileName?: string;
  generatedAt?: string;
  model?: string;
  mode?: string;
  projectId?: string;
  targetSize?: string;
  materialType?: string;
  materialCopy?: string;
};

type AssetCategoryKey =
  | "logo"
  | "qrcode"
  | "ip"
  | "background"
  ;

type UploadCategoryKey = "logo" | "qrcode" | "ip" | "background";

const TAB_ITEMS = [
  { id: "memory", label: "记忆" },
  { id: "assets", label: "素材" },
  { id: "styles", label: "风格" },
] as const;

const STYLE_OPTIONS = ["简约高级", "科技感", "医疗专业", "活动促销", "儿童亲和", "中医国风", "政务正式"] as const;
const COMPOSITION_OPTIONS = ["留白多", "信息密集", "大标题突出", "产品突出", "人物突出", "品牌突出"] as const;
const SIZE_OPTIONS = ["1:1", "3:4", "4:5", "16:9", "9:16", "自定义"] as const;

const CATEGORY_META: Array<{
  key: AssetCategoryKey;
  label: string;
  icon: typeof Palette;
  matches: (asset: AssetPanelImage) => boolean;
}> = [
  { key: "logo", label: "Logo", icon: Palette, matches: (asset) => includesAny([asset.fileName, asset.mode, asset.materialType], ["logo"]) },
  { key: "qrcode", label: "二维码", icon: ScanLine, matches: (asset) => includesAny([asset.fileName, asset.mode, asset.materialType], ["二维码", "qr", "qrcode"]) },
  { key: "ip", label: "IP形象", icon: Sticker, matches: (asset) => includesAny([asset.fileName, asset.mode, asset.materialType], ["ip", "吉祥物", "卡通", "角色", "icon"]) },
  { key: "background", label: "背景图", icon: Sparkles, matches: (asset) => includesAny([asset.fileName, asset.mode, asset.materialType], ["背景", "background"]) },
];

type AssetLibraryPanelProps = {
  assets: AssetPanelImage[];
  currentProjectId: string;
  imageSizeLabel: (image: AssetPanelImage) => string;
  knowledge: ProjectKnowledgeBase;
  mergeProjectLibraryAssets: (items: ProjectAssetRecord[], assets: AssetPanelImage[], currentProjectId: string) => AssetPanelImage[];
  onClose: () => void;
  onApplyPendingFact: (candidateId: string) => void;
  onDismissPendingFact: (candidateId: string) => void;
  onKnowledgeChange: (value: ProjectKnowledgeBase) => void;
  onProjectNameChange: (value: string) => void;
  onProfileChange: (value: ProjectProfile) => void;
  onRefreshLibraries: () => void;
  onSearchPublicInfo: () => void;
  onTextChange: (value: string) => void;
  onTextProtectionChange: (value: boolean) => void;
  onUpload: (files: FileList, type: UploadCategoryKey) => void;
  onPreview: (image: AssetPanelImage) => void;
  initialTab?: (typeof TAB_ITEMS)[number]["id"];
  profile: ProjectProfile;
  publicInfoSearchState: "idle" | "loading" | "done" | "error";
  publicStyleLibraries: MaterialLibrarySummary[];
  splitProfileLines: (value: string) => string[];
  styleLibraryReferencePreview: (library: MaterialLibrarySummary) => string;
  styleLibraryRulePreview: (library: MaterialLibrarySummary) => string;
  text: string;
  textProtectionMode: boolean;
};

export function AssetLibraryPanel(props: AssetLibraryPanelProps) {
  const {
    assets,
    currentProjectId,
    imageSizeLabel,
    knowledge,
    mergeProjectLibraryAssets,
    onApplyPendingFact,
    onClose,
    onDismissPendingFact,
    onKnowledgeChange,
    onProjectNameChange,
    onProfileChange,
    onRefreshLibraries,
    onSearchPublicInfo,
    onTextChange,
    onTextProtectionChange,
    onUpload,
    onPreview,
    initialTab = "memory",
    profile,
    publicInfoSearchState,
    publicStyleLibraries,
    splitProfileLines,
    styleLibraryReferencePreview,
    styleLibraryRulePreview,
    text,
    textProtectionMode,
  } = props;

  const [tab, setTab] = useState<(typeof TAB_ITEMS)[number]["id"]>(initialTab);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AssetCategoryKey>("logo");
  const [uploadCategory, setUploadCategory] = useState<UploadCategoryKey>("logo");
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const mergedAssets = useMemo(
    () => mergeProjectLibraryAssets(knowledge.materialLibrary.items, assets, currentProjectId),
    [assets, currentProjectId, knowledge.materialLibrary.items, mergeProjectLibraryAssets],
  );

  const categoryMap = useMemo(() => {
    const buckets = new Map<AssetCategoryKey, AssetPanelImage[]>();
    CATEGORY_META.forEach((item) => buckets.set(item.key, []));

    mergedAssets.forEach((asset) => {
      const matched = CATEGORY_META.find((item) => item.matches(asset));
      if (matched) buckets.get(matched.key)?.push(asset);
    });

    return buckets;
  }, [mergedAssets]);

  const selectedStyles = useMemo(() => new Set(splitProfileLines(profile.styleNotes)), [profile.styleNotes, splitProfileLines]);
  const selectedSizes = useMemo(() => new Set(splitProfileLines(profile.commonSizes)), [profile.commonSizes, splitProfileLines]);
  const activeStyleLibraries = useMemo(() => new Set(knowledge.selection.activePublicStyleLibraryIds), [knowledge.selection.activePublicStyleLibraryIds]);

  const summaryOrganization = knowledge.archive.organizationName || profile.organizationName || "未填写";
  const allBrandColors = profileBrandColorValues(profile);
  const summaryBrandColors = allBrandColors.join(" / ") || knowledge.archive.brandColors.join(" / ") || "未填写";
  const summaryCopy = splitProfileLines(profile.commonCopy).join(" / ") || knowledge.archive.slogans.join(" / ") || "未填写";
  const summaryUpdatedAt = knowledge.archive.updatedAt ? new Date(knowledge.archive.updatedAt).toLocaleDateString("zh-CN") : "刚刚";
  const brandAssetStatus = [
    categoryMap.get("logo")?.length ? "Logo" : "",
    categoryMap.get("ip")?.length ? "IP" : "",
    categoryMap.get("qrcode")?.length ? "二维码" : "",
  ].filter(Boolean);

  function updateKnowledge(next: Partial<ProjectKnowledgeBase["archive"]>) {
    onKnowledgeChange({
      ...knowledge,
      archive: {
        ...knowledge.archive,
        ...next,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  function updateProjectMemory(
    field:
      | "projectName"
      | "organizationName"
      | "phone"
      | "address"
      | "brandColors"
      | "primaryColors"
      | "secondaryColors"
      | "accentColors"
      | "backgroundColors"
      | "textColors"
      | "colorPalettes"
      | "logoName"
      | "qrCodeNote"
      | "commonCopy",
    value: string,
  ) {
    if (field === "projectName") {
      onProjectNameChange(value);
      updateKnowledge({ projectName: value });
      return;
    }
    if (field === "organizationName") {
      onProfileChange({ ...profile, organizationName: value });
      updateKnowledge({ organizationName: value });
      return;
    }
    if (field === "phone") {
      onProfileChange({ ...profile, phone: value });
      updateKnowledge({ phone: value });
      return;
    }
    if (field === "address") {
      onProfileChange({ ...profile, address: value });
      updateKnowledge({ address: value });
      return;
    }
    if (field === "brandColors") {
      onProfileChange({ ...profile, brandColors: value });
      updateKnowledge({ brandColors: extractColorValues(value) });
      return;
    }
    if (field === "primaryColors" || field === "secondaryColors" || field === "accentColors" || field === "backgroundColors" || field === "textColors" || field === "colorPalettes") {
      const nextProfile = { ...profile, [field]: value };
      onProfileChange(nextProfile);
      updateKnowledge({ brandColors: profileBrandColorValues(nextProfile) });
      return;
    }
    if (field === "logoName") {
      onProfileChange({ ...profile, logoName: value });
      return;
    }
    if (field === "qrCodeNote") {
      onProfileChange({ ...profile, qrCodeNote: value });
      return;
    }
    onProfileChange({ ...profile, commonCopy: value });
    updateKnowledge({ slogans: splitProfileLines(value) });
  }

  function updateExtraMemory(
    field: "website" | "wechat" | "mapLink" | "fonts" | "forbiddenContent" | "notes" | "text",
    value: string,
  ) {
    if (field === "text") {
      onTextChange(value);
      return;
    }
    if (field === "fonts") {
      updateKnowledge({ fonts: splitProfileLines(value) });
      return;
    }
    if (field === "forbiddenContent") {
      onProfileChange({ ...profile, forbiddenContent: value });
      updateKnowledge({ forbiddenContent: splitProfileLines(value) });
      return;
    }
    updateKnowledge({ [field]: value });
  }

  function toggleStylePreference(value: string) {
    const next = new Set(selectedStyles);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onProfileChange({ ...profile, styleNotes: Array.from(next).join("\n") });
  }

  function toggleSizePreference(value: string) {
    const next = new Set(selectedSizes);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onProfileChange({ ...profile, commonSizes: Array.from(next).join("\n") });
  }

  function togglePublicStyleLibrary(libraryId: string) {
    const next = new Set(activeStyleLibraries);
    if (next.has(libraryId)) next.delete(libraryId);
    else next.add(libraryId);
    onKnowledgeChange({
      ...knowledge,
      selection: {
        ...knowledge.selection,
        activePublicStyleLibraryIds: Array.from(next),
      },
    });
  }

  return (
    <section className="apple-panel-strong apple-drawer fixed bottom-4 left-[52px] top-4 z-50 flex w-[min(340px,calc(100vw-68px))] flex-col overflow-hidden sm:left-[96px] sm:w-[348px]">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-white/92">项目记忆与素材</div>
            <div className="mt-1 text-[12px] text-white/42">{knowledge.archive.projectName || "未命名"}</div>
          </div>
          <button aria-label="关闭项目记忆与素材" className="apple-button flex size-9 items-center justify-center text-white/56" onClick={onClose} title="关闭面板" type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="apple-surface-section mt-4 p-3">
          <div className="grid grid-cols-3 gap-2">
            <SummaryChip label="素材" value={`${mergedAssets.length} 张`} />
            <SummaryChip label="品牌色" value={allBrandColors.length ? `${allBrandColors.length} 个` : "未填"} />
            <SummaryChip label="品牌包" value={brandAssetStatus.length ? brandAssetStatus.join(" / ") : "未选"} />
          </div>
          {knowledge.archive.pendingFacts.length ? (
            <div className="apple-status-warning mt-3 rounded-full border px-3 py-1.5 text-[11px]">
              待确认公开资料 {knowledge.archive.pendingFacts.length} 条
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {TAB_ITEMS.map((item) => (
            <button
              className={`apple-segment h-9 rounded-full px-2 text-[12px] font-medium ${tab === item.id ? "apple-segment-active" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={uploadRef}
        className="hidden"
        multiple
        type="file"
        onChange={(event) => {
          if (event.target.files?.length) onUpload(event.target.files, uploadCategory);
          event.currentTarget.value = "";
        }}
      />

      <div className="min-h-0 flex-1 overflow-auto px-3.5 py-3.5">
        {tab === "memory" ? (
          <div className="space-y-4">
            <section className="apple-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold text-white/88">当前项目</div>
                  <div className="mt-1 text-[12px] text-white/42">AI 生成时读取的基础记忆</div>
                </div>
                <button className="apple-button px-3.5 py-2 text-[11px]" onClick={() => setMemoryExpanded((value) => !value)} type="button">
                  {memoryExpanded ? "收起" : "编辑"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="apple-button px-3 py-1.5 text-[11px]"
                  onClick={onSearchPublicInfo}
                  type="button"
                >
                  {publicInfoSearchState === "loading" ? "补全中" : "联网补全"}
                </button>
                {knowledge.archive.pendingFacts.length ? (
                  <span className="apple-status-warning rounded-full border px-3 py-1.5 text-[11px]">
                    待确认 {knowledge.archive.pendingFacts.length} 条
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-2.5">
                <InfoRow label="项目名称" value={knowledge.archive.projectName || "未填写"} />
                <InfoRow label="项目类型" value="设计项目" />
                <InfoRow label="机构名称" value={summaryOrganization} />
                <InfoRow label="素材数量" value={`${mergedAssets.length} 张`} />
                <InfoRow label="最近更新" value={summaryUpdatedAt} />
                <InfoRow label="品牌色" value={summaryBrandColors} />
                <InfoRow label="品牌包" value={brandAssetStatus.join(" / ") || "未选择"} />
                <InfoRow label="常用宣传语" value={summaryCopy} />
                {allBrandColors.length ? <ColorSwatches colors={allBrandColors} /> : null}
              </div>

              {knowledge.archive.pendingFacts.length ? (
                <div className="apple-status-warning mt-4 rounded-[18px] border p-3">
                  <div className="mb-2 text-[12px] font-semibold text-[#ffe1a0]">待确认公开资料</div>
                  <div className="space-y-2">
                    {knowledge.archive.pendingFacts.slice(0, 6).map((candidate) => (
                      <PendingFactRow
                        candidate={candidate}
                        key={candidate.id}
                        onApply={() => onApplyPendingFact(candidate.id)}
                        onDismiss={() => onDismissPendingFact(candidate.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {memoryExpanded ? (
                <div className="mt-5 space-y-3.5 border-t border-white/8 pt-4">
                  <FieldBlock label="项目名称" value={knowledge.archive.projectName} onChange={(value) => updateProjectMemory("projectName", value)} />
                  <FieldBlock label="机构名称" value={profile.organizationName} onChange={(value) => updateProjectMemory("organizationName", value)} />
                  <FieldBlock label="电话" value={profile.phone} onChange={(value) => updateProjectMemory("phone", value)} />
                  <FieldBlock label="地址" value={profile.address} onChange={(value) => updateProjectMemory("address", value)} />
                  <FieldBlock label="Logo 名称" placeholder="如：品牌 Logo / 活动标识" value={profile.logoName} onChange={(value) => updateProjectMemory("logoName", value)} />
                  <FieldBlock
                    label="主色"
                    multiline
                    placeholder="#0F7C60"
                    value={profile.primaryColors}
                    onChange={(value) => updateProjectMemory("primaryColors", value)}
                    colors={extractColorValues(profile.primaryColors)}
                  />
                  <FieldBlock
                    label="辅助色"
                    multiline
                    placeholder="#DFF5EC #FFFFFF"
                    value={profile.secondaryColors}
                    onChange={(value) => updateProjectMemory("secondaryColors", value)}
                    colors={extractColorValues(profile.secondaryColors)}
                  />
                  <FieldBlock
                    label="强调色"
                    placeholder="#F6C85F"
                    value={profile.accentColors}
                    onChange={(value) => updateProjectMemory("accentColors", value)}
                    colors={extractColorValues(profile.accentColors)}
                  />
                  <FieldBlock
                    label="背景色 / 渐变"
                    multiline
                    placeholder="#F8FFFC 或 linear-gradient..."
                    value={profile.backgroundColors}
                    onChange={(value) => updateProjectMemory("backgroundColors", value)}
                    colors={extractColorValues(profile.backgroundColors)}
                  />
                  <FieldBlock
                    label="文字色"
                    placeholder="#10231F"
                    value={profile.textColors}
                    onChange={(value) => updateProjectMemory("textColors", value)}
                    colors={extractColorValues(profile.textColors)}
                  />
                  <FieldBlock
                    label="配色方案"
                    multiline
                    placeholder="主色：绿色；辅助色：浅绿、白色；强调色：金色"
                    value={profile.colorPalettes}
                    onChange={(value) => updateProjectMemory("colorPalettes", value)}
                    colors={extractColorValues(profile.colorPalettes)}
                  />
                  <FieldBlock
                    label="旧版品牌色"
                    multiline
                    placeholder="兼容旧项目，可继续粘贴色值"
                    value={profile.brandColors}
                    onChange={(value) => updateProjectMemory("brandColors", value)}
                    colors={extractColorValues(profile.brandColors)}
                  />
                  <FieldBlock
                    label="二维码说明"
                    placeholder="公众号 / 咨询 / 活动报名"
                    value={profile.qrCodeNote}
                    onChange={(value) => updateProjectMemory("qrCodeNote", value)}
                  />
                  <FieldBlock
                    label="常用宣传语"
                    multiline
                    placeholder="写 1-3 条常用表达"
                    value={profile.commonCopy}
                    onChange={(value) => updateProjectMemory("commonCopy", value)}
                  />

                  <button className="apple-button flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-[11px]" onClick={() => setMoreExpanded((value) => !value)} type="button">
                    <span>更多信息</span>
                    {moreExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>

                  {moreExpanded ? (
                    <div className="space-y-3.5 rounded-[18px] border border-white/8 bg-white/[0.045] p-3.5">
                      <FieldBlock label="官网" value={knowledge.archive.website} onChange={(value) => updateExtraMemory("website", value)} />
                      <FieldBlock label="公众号" value={knowledge.archive.wechat} onChange={(value) => updateExtraMemory("wechat", value)} />
                      <FieldBlock label="地图链接" value={knowledge.archive.mapLink} onChange={(value) => updateExtraMemory("mapLink", value)} />
                      <FieldBlock label="常用字体" multiline placeholder="一行一个" value={knowledge.archive.fonts.join("\n")} onChange={(value) => updateExtraMemory("fonts", value)} />
                      <FieldBlock
                        label="禁用内容"
                        multiline
                        placeholder="不要出现的内容、术语或画面"
                        value={profile.forbiddenContent}
                        onChange={(value) => updateExtraMemory("forbiddenContent", value)}
                      />
                      <FieldBlock
                        label="项目备注"
                        multiline
                        placeholder="补充项目背景、口径或注意事项"
                        value={knowledge.archive.notes}
                        onChange={(value) => updateExtraMemory("notes", value)}
                      />
                      <FieldBlock
                        label="文档摘要"
                        multiline
                        placeholder="这里放给 AI 调用的文档摘要、活动资料、文案材料"
                        value={text}
                        onChange={(value) => updateExtraMemory("text", value)}
                      />

                      <div className="flex items-center justify-between rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
                        <div>
                          <div className="text-[12px] font-medium text-white/78">文字保护</div>
                          <div className="mt-0.5 text-[11px] text-white/42">开启后会优先保护关键文案，不随意改字。</div>
                        </div>
                        <button
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${textProtectionMode ? "bg-[#74e3c5] text-[#07121f]" : "bg-white/8 text-white/62"}`}
                          onClick={() => onTextProtectionChange(!textProtectionMode)}
                          type="button"
                        >
                          {textProtectionMode ? "已开启" : "已关闭"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {tab === "assets" ? (
          <div className="space-y-4">
            <section className="apple-panel p-4">
              <div className="mb-3">
                <div className="mb-2.5 text-[11px] text-white/42">素材类型</div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_META.map((item) => {
                    const active = uploadCategory === item.key;
                    return (
                      <button
                      className={`rounded-full px-3.5 py-2 text-[11px] transition ${active ? "bg-white text-[#07121f]" : "bg-white/[0.05] text-white/64 hover:bg-white/[0.08]"}`}
                        key={item.key}
                        onClick={() => {
                          setUploadCategory(item.key);
                          setActiveCategory(item.key);
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="apple-button-primary flex-1 px-3 py-2.5 text-[11px] font-semibold" onClick={() => uploadRef.current?.click()} type="button">
                  <Upload className="mr-1 inline size-3.5" />
                  上传{categoryLabel(uploadCategory)}
                </button>
                <button className="apple-button px-3 py-2.5 text-[11px]" onClick={onRefreshLibraries} type="button">
                  <RefreshCcw className="mr-1 inline size-3.5" />
                  刷新
                </button>
              </div>
            </section>

            <section className="apple-panel p-4">
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_META.map((category) => {
                  const Icon = category.icon;
                  const count = categoryMap.get(category.key)?.length || 0;
                  const active = activeCategory === category.key;
                  return (
                    <button
                    className={`apple-interactive-card p-3.5 text-left ${active ? "is-selected" : ""}`}
                      key={category.key}
                      onClick={() => setActiveCategory(category.key)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`flex size-8 items-center justify-center rounded-xl ${active ? "bg-white/14 text-white" : "bg-white/[0.05] text-white/54"}`}>
                          <Icon className="size-4" />
                        </span>
                        <span className="apple-pill px-2 py-1 text-[11px]">{count}</span>
                      </div>
                      <div className="mt-2.5 text-[13px] font-semibold text-white/84">{category.label}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                {categoryMap.get(activeCategory)?.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {categoryMap.get(activeCategory)?.map((asset) => (
                    <button
                        className="apple-interactive-card p-2.5 text-left"
                        key={asset.id}
                        onClick={() => asset.url && onPreview(asset)}
                        title={[asset.fileName, asset.materialType, asset.url ? imageSizeLabel(asset) : ""].filter(Boolean).join("\n")}
                        type="button"
                      >
                        {asset.url ? (
                          <ImageFrame alt={asset.fileName || asset.id} className="aspect-[4/3] rounded-[14px]" image={{ url: asset.url }} preserveRatio={false} variant="thumbnail" />
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center rounded-[14px] border border-dashed border-white/10 bg-white/[0.03] text-white/34">
                            <FileText className="size-5" />
                          </div>
                        )}
                        <div className="mt-2.5 truncate text-[12px] font-semibold text-white/82">{asset.fileName || asset.mode || "项目素材"}</div>
                        <div className="mt-1 text-[11px] text-white/42">{assetImageTypeLabel(asset)}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="apple-empty-state px-4 py-8 text-center">
                    <div className="text-[13px] font-semibold text-white/76">这个分类还没有素材</div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "styles" ? (
          <div className="space-y-4">
            <section className="apple-panel p-4">
              <div className="text-[15px] font-semibold text-white/88">本次生成偏好</div>
              <div className="mt-1 text-[12px] leading-5 text-white/42">风格、构图、尺寸</div>

              <PreferenceGroup items={STYLE_OPTIONS} label="设计风格" selected={selectedStyles} onToggle={toggleStylePreference} />
              <PreferenceGroup items={COMPOSITION_OPTIONS} label="画面倾向" selected={selectedStyles} onToggle={toggleStylePreference} />
              <PreferenceGroup items={SIZE_OPTIONS} label="常用尺寸" selected={selectedSizes} onToggle={toggleSizePreference} />
            </section>

            <section className="apple-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-white/88">公共风格</div>
                </div>
                <span className="apple-pill px-2.5 py-1 text-[11px]">{activeStyleLibraries.size} 已引用</span>
              </div>

              {publicStyleLibraries.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {publicStyleLibraries.map((library) => {
                  const active = activeStyleLibraries.has(library.id);
                  const keywords = library.tags.slice(0, 4).join(" / ") || styleLibraryRulePreview(library);
                  return (
                    <article
                      className={`apple-interactive-card p-3 ${active ? "is-selected" : ""}`}
                      key={library.id}
                      title={[library.description, styleLibraryRulePreview(library), styleLibraryReferencePreview(library)].filter(Boolean).join("\n")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`flex size-8 items-center justify-center rounded-xl ${active ? "bg-white/14 text-white" : "bg-white/[0.05] text-white/56"}`}>
                          <SwatchBook className="size-4" />
                        </span>
                        <button
                          className={active ? "apple-button-primary px-2.5 py-1.5 text-[11px] font-semibold" : "apple-button px-2.5 py-1.5 text-[11px]"}
                          onClick={() => togglePublicStyleLibrary(library.id)}
                          type="button"
                        >
                          {active ? "取消" : "引用"}
                        </button>
                      </div>
                      <div className="mt-2.5 text-[12px] font-semibold text-white/84">{simplifyLibraryName(library.name)}</div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/42">{keywords}</div>
                    </article>
                  );
                  })}
                </div>
              ) : (
                <div className="apple-empty-state mt-3 px-4 py-8 text-center text-[12px] text-white/46">暂无风格卡片</div>
              )}
            </section>

          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="apple-surface-section px-3 py-2.5">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium text-white/82">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="apple-surface-section flex items-start justify-between gap-3 px-3 py-3">
      <span className="shrink-0 text-[11px] text-white/42">{label}</span>
      <span className="min-w-0 text-right text-[12px] leading-5 text-white/78">{value}</span>
    </div>
  );
}

function PendingFactRow({
  candidate,
  onApply,
  onDismiss,
}: {
  candidate: ProjectFactCandidate;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="apple-surface-section p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-white/78">{candidate.label}</div>
          <div className="mt-1 break-words text-[12px] leading-5 text-white/64">{candidate.value}</div>
          <div className="mt-1 truncate text-[11px] text-white/38">
            来源：{candidate.sourceUrl ? candidate.sourceUrl : candidate.sourceLabel}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button className="apple-button-primary rounded-full px-2.5 py-1 text-[11px] font-semibold" onClick={onApply} type="button">
            应用
          </button>
          <button className="apple-button rounded-full px-2.5 py-1 text-[11px]" onClick={onDismiss} type="button">
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldBlock({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  colors,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  colors?: string[];
}) {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] text-white/44">{label}</div>
      {multiline ? (
        <textarea
          className="apple-input min-h-[88px] w-full rounded-[18px] px-3.5 py-3 text-[12px] text-white/76 outline-none"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      ) : (
        <input
          className="apple-input h-11 w-full rounded-[18px] px-3.5 text-[12px] text-white/76 outline-none"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
      {colors?.length ? <ColorSwatches className="mt-2" colors={colors} /> : null}
    </label>
  );
}

function ColorSwatches({ colors, className = "" }: { colors: string[]; className?: string }) {
  if (!colors.length) {
    return <div className={`text-[11px] text-white/34 ${className}`}>未识别到色值</div>;
  }
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {colors.slice(0, 12).map((color) => (
        <span
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2 text-[10px] text-white/62"
          key={color}
          title={color}
        >
          <span className="size-4 rounded-full border border-white/18" style={{ background: color }} />
          {color}
        </span>
      ))}
    </div>
  );
}

function PreferenceGroup({
  items,
  label,
  selected,
  onToggle,
}: {
  items: readonly string[];
  label: string;
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const isSizeGroup = /尺寸|比例/.test(label);
  return (
    <div className="mt-4">
      <div className="mb-2.5 text-[11px] text-white/42">{label}</div>
      <div className={isSizeGroup ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
        {items.map((item) => {
          const active = selected.has(item);
          return (
            <button
              className={isSizeGroup
                ? `flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[17px] border px-1.5 text-[14px] font-semibold transition ${
                    active
                      ? "border-white/75 bg-white text-[#07121f] shadow-[0_14px_34px_rgba(255,255,255,0.16)]"
                      : "border-white/10 bg-white/[0.055] text-white/58 hover:bg-white/[0.09] hover:text-white/74"
                  }`
                : `rounded-full px-3.5 py-2 text-[11px] transition ${active ? "bg-[#74e3c5] text-[#07121f]" : "bg-white/[0.05] text-white/64 hover:bg-white/[0.08]"}`}
              key={item}
              onClick={() => onToggle(item)}
              type="button"
            >
              {isSizeGroup ? <RatioPreferenceGlyph ratio={item} selected={active} /> : null}
              <span className="whitespace-nowrap">{item}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RatioPreferenceGlyph({ ratio, selected }: { ratio: string; selected: boolean }) {
  const normalized = ratio === "自定义" ? "custom" : ratio;
  const [rawWidth, rawHeight] = normalized === "custom" ? [5, 4] : normalized.split(":").map((item) => Number(item) || 1);
  const width = Math.max(9, Math.min(22, rawWidth >= rawHeight ? 22 : Math.round((rawWidth / rawHeight) * 22)));
  const height = Math.max(9, Math.min(22, rawHeight > rawWidth ? 22 : Math.round((rawHeight / rawWidth) * 22)));
  return (
    <span aria-hidden="true" className={`flex h-[22px] w-6 shrink-0 items-center justify-center ${selected ? "text-[#07121f]" : "text-white/58"}`}>
      <span
        className={`block rounded-[4px] border ${selected ? "border-[#07121f]/70 bg-[#07121f]/7" : "border-current bg-white/[0.035]"}`}
        style={{ height, width }}
      />
    </span>
  );
}

function assetImageTypeLabel(asset: AssetPanelImage) {
  if (asset.materialType) return asset.materialType;
  if (includesAny([asset.fileName, asset.mode], ["logo"])) return "Logo";
  if (includesAny([asset.fileName, asset.mode], ["二维码", "qr"])) return "二维码";
  if (includesAny([asset.fileName, asset.mode], ["背景", "background"])) return "背景图";
  if (includesAny([asset.fileName, asset.mode], ["ip", "吉祥物", "卡通", "角色", "icon"])) return "IP形象";
  return "素材";
}

function categoryLabel(value: UploadCategoryKey) {
  return CATEGORY_META.find((item) => item.key === value)?.label || "素材";
}

function profileBrandColorValues(profile: ProjectProfile) {
  return Array.from(
    new Set([
      ...extractColorValues(profile.primaryColors),
      ...extractColorValues(profile.secondaryColors),
      ...extractColorValues(profile.accentColors),
      ...extractColorValues(profile.backgroundColors),
      ...extractColorValues(profile.textColors),
      ...extractColorValues(profile.brandColors),
      ...extractColorValues(profile.colorPalettes),
    ]),
  );
}

function extractColorValues(value: string) {
  const matches = value.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)/gi);
  return Array.from(new Set((matches || []).map((item) => item.trim())));
}

function simplifyLibraryName(value: string) {
  return value.replace(/设计风格库|风格库|排版库/g, "").trim();
}

function includesAny(values: Array<string | undefined>, needles: string[]) {
  const source = values.filter(Boolean).join(" ").toLowerCase();
  return needles.some((needle) => source.includes(needle.toLowerCase()));
}
