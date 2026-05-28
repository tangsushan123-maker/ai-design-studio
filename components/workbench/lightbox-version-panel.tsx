"use client";

import { formatGeneratedAt } from "@/lib/workbench-format";
import { ImageFrame } from "@/components/workbench/image-frame";
import { VersionStrip } from "@/components/workbench/version-strip";
import { imageBranchId, imageKey } from "@/components/workbench/workbench-image-collection";
import { imageRatioStyle } from "@/components/workbench/workbench-image-display";
import type { ImageAsset } from "@/components/workbench/workbench-types";

type LightboxVersionPanelProps = {
  currentImage: ImageAsset;
  latestVariants: ImageAsset[];
  versions: ImageAsset[];
  onOpenVersion: (image: ImageAsset) => void;
};

export function LightboxVersionPanel({
  currentImage,
  latestVariants,
  versions,
  onOpenVersion,
}: LightboxVersionPanelProps) {
  return (
    <>
      {latestVariants.length > 1 ? (
        <section className="apple-surface-section p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="apple-section-title">同任务方案</div>
            <div className="apple-caption">{latestVariants.length} 张</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {latestVariants.map((variantImage, index) => (
              <button
                className={`overflow-hidden rounded-[16px] border text-left transition ${imageBranchId(variantImage) === imageBranchId(currentImage) ? "border-[#8fa7ff]/55 bg-[#8fa7ff]/12" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"}`}
                key={imageKey(variantImage)}
                onClick={() => onOpenVersion(variantImage)}
                type="button"
              >
                <ImageFrame alt={variantImage.fileName || variantImage.id || `方案 ${index + 1}`} className="rounded-none border-0" fit="contain" image={variantImage} preserveRatio={false} variant="thumbnail" style={{ height: 68 }} />
                <div className="p-2">
                  <div className="truncate text-[11px] font-semibold text-white/80">{variantImage.branchLabel || `方案 ${variantImage.variant || index + 1}`}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {versions.length > 1 ? (
        <section className="apple-surface-section p-3">
          <VersionStrip
            accentClassName="border-[#74e3c5]/48 bg-[#74e3c5]/10"
            items={versions.map((version, index) => ({
              id: imageKey(version),
              image: version,
              ratioStyle: imageRatioStyle(version),
              selected: imageKey(version) === imageKey(currentImage),
              subtitle: formatGeneratedAt(version.generatedAt),
              title: `版本 ${index + 1}`,
            }))}
            label="当前方案版本"
            onSelect={(itemId) => {
              const target = versions.find((version) => imageKey(version) === itemId);
              if (target) onOpenVersion(target);
            }}
          />
        </section>
      ) : null}
    </>
  );
}
