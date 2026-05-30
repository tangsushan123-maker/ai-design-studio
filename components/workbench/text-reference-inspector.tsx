import { type TextReferenceRole, type TextReferenceWeight } from "@/lib/design-options";
import { ImageFrame } from "@/components/workbench/image-frame";
import { maxTextReferenceImages, textReferenceRoleOptions, textReferenceWeightOptions } from "@/components/workbench/workbench-config";
import { InspectorSection } from "@/components/workbench/workbench-small-ui";
import {
  normalizeTextReferenceRole,
  normalizeTextReferenceWeight,
  textReferenceRoleDescription,
} from "@/components/workbench/workbench-text-references";
import type { ImageAsset, TextReferenceConfig } from "@/components/workbench/workbench-types";

export function TextReferenceInspector({
  items,
  onChange,
}: {
  items: Array<{ handle: string; label: string; role: TextReferenceRole; weight: TextReferenceWeight; image: ImageAsset }>;
  onChange: (index: number, patch: Partial<TextReferenceConfig>) => void;
}) {
  if (!items.length) {
    return (
      <InspectorSection title="图片参考">
        <div className="rounded-[16px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-white/44">
          最多 5 张。需要人物、产品、Logo、二维码真实进入画面时选“引用原图”；只借鉴配色、版式、字体时选“参考风格/构图/色调”。
        </div>
      </InspectorSection>
    );
  }

  return (
    <InspectorSection title={`图片参考 ${items.length}/${maxTextReferenceImages}`}>
      <div className="rounded-[16px] border border-[#74e3c5]/18 bg-[#74e3c5]/10 px-3 py-2 text-[11px] leading-5 text-[#adf8e5]">
        引用图会尽量进入画面；参考图只影响风格、构图或色调。避免靠提示词猜，逐张设置更稳定。
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-2 rounded-[16px] border border-white/10 bg-white/[0.035] p-2" key={`${item.handle}-${index}`}>
            <ImageFrame alt={item.label} className="rounded-[12px]" fit="cover" image={item.image} preserveRatio={false} variant="thumbnail" style={{ height: 46, width: 46 }} />
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-white/70">参考 {index + 1}</span>
                <span className="truncate text-[11px] text-white/38">{textReferenceRoleDescription(item.role)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-1.5">
                <select
                  className="apple-input h-8 min-w-0 rounded-[12px] px-2 text-[11px] text-white/70"
                  onChange={(event) => onChange(index, { role: normalizeTextReferenceRole(event.target.value, item.role) })}
                  title="参考图用途"
                  value={item.role}
                >
                  {textReferenceRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  className="apple-input h-8 rounded-[12px] px-2 text-[11px] text-white/70"
                  onChange={(event) => onChange(index, { weight: normalizeTextReferenceWeight(event.target.value, item.weight) })}
                  title="参考强度"
                  value={item.weight}
                >
                  {textReferenceWeightOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </InspectorSection>
  );
}
