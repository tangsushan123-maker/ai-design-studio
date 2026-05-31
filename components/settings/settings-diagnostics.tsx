import Link from "next/link";
import { ArrowLeft, CheckCircle2, Image as ImageIcon, Loader2 } from "lucide-react";
import type { ModelCatalogItem, ModelWireApi } from "@/lib/openai-defaults";
import { SettingsMiniMetric, SettingsPanel, SettingsStatusIcon } from "@/components/settings/settings-status-ui";

export type DetectionIssue = {
  step: string;
  requestUrl: string;
  status?: number;
  message: string;
  possibleCauses: string[];
  suggestions: string[];
};

export type DetectionResult = {
  ok: boolean;
  saved?: boolean;
  providerName: string;
  providerId: string;
  websiteUrl: string;
  apiBaseUrl: string;
  apiKeyStatus: "valid" | "invalid" | "unknown";
  wireApi: ModelWireApi;
  textModel: string;
  imageModel: string;
  videoModel: string;
  supportsModelsList: boolean;
  supportsResponses: boolean;
  supportsChatCompletions: boolean;
  supportsImageGeneration: boolean;
  lastTestedAt: string;
  models: ModelCatalogItem[];
  recommended: {
    textModel: string;
    imageModel: string;
    videoModel: string;
  };
  issues: DetectionIssue[];
  testedUrls: string[];
  message: string;
};

export function SetupChecklist({
  hasKey,
  hasProvider,
  imageModel,
  isBusy,
  onAddSuggestedImageModel,
  onDetectAndSave,
  onTestImageModel,
  passedImageCount,
  suggestedImageModels,
  supportsImageGeneration,
}: {
  hasKey: boolean;
  hasProvider: boolean;
  imageModel: ModelCatalogItem | null;
  isBusy: boolean;
  onAddSuggestedImageModel: (model: ModelCatalogItem) => void;
  onDetectAndSave: () => void;
  onTestImageModel: () => void;
  passedImageCount: number;
  suggestedImageModels: ModelCatalogItem[];
  supportsImageGeneration: boolean;
}) {
  const imageReady = passedImageCount > 0;
  return (
    <SettingsPanel title="接入流程">
      <div className="space-y-2">
        <ChecklistRow done={hasProvider} label="填写中转站地址" detail={hasProvider ? "已填写请求地址" : "先填官网或 API 地址"} />
        <ChecklistRow done={hasKey} label="配置 API Key" detail={hasKey ? "Key 已保存或本次已输入" : "Key 不会显示明文"} />
        <ChecklistRow done={supportsImageGeneration || imageReady} label="检测并保存配置" detail={supportsImageGeneration ? "图片接口已通过检测" : "自动识别接口和推荐模型"} />
        <ChecklistRow done={imageReady} label="测试图片模型" detail={imageReady ? `${passedImageCount} 个图片模型可用于工作台` : imageModel ? `待测试：${imageModel.label || imageModel.id}` : "还没有图片模型"} />
      </div>
      {!imageReady && suggestedImageModels.length ? (
        <div className="mt-3 rounded-[14px] border border-[#ffd166]/18 bg-[#ffd166]/10 p-3">
          <div className="text-xs font-semibold text-[#ffe1a3]">缺少图片模型时可先添加推荐项</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestedImageModels.map((model) => (
              <button
                className="apple-button px-2.5 py-1.5 text-[11px] text-white/72 disabled:opacity-50"
                disabled={isBusy}
                key={model.id}
                onClick={() => onAddSuggestedImageModel(model)}
                type="button"
              >
                添加 {model.label || model.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        <button
          className="apple-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={isBusy || !hasKey || !hasProvider}
          onClick={onDetectAndSave}
          type="button"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          检测并保存
        </button>
        <button
          className="apple-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white/74 disabled:opacity-50"
          disabled={isBusy || !imageModel}
          onClick={onTestImageModel}
          type="button"
        >
          <ImageIcon className="size-4" />
          测试图片模型
        </button>
        <Link className={`apple-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold ${imageReady ? "text-[#adf8e5]" : "text-white/52"}`} href="/">
          <ArrowLeft className="size-4" />
          返回工作台
        </Link>
      </div>
    </SettingsPanel>
  );
}

function ChecklistRow({ detail, done, label }: { detail: string; done: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-2">
      <SettingsStatusIcon state={done ? "success" : "idle"} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/78">{label}</div>
        <div className="mt-0.5 truncate text-xs text-white/42">{detail}</div>
      </div>
    </div>
  );
}

export function DetectionSummary({ result }: { result: DetectionResult | null }) {
  if (!result) {
    return (
      <div className="apple-empty-state mt-4 p-4 text-sm text-white/46">
        输入地址和 Key 后自动检测，成功模型会保存为可切换模型。
      </div>
    );
  }

  return (
    <section className="apple-surface-section mt-4 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/86">{result.ok ? "检测通过" : "需要处理"}</div>
          <div className="apple-caption mt-1">{result.message}</div>
        </div>
        <SettingsStatusIcon state={result.ok ? "success" : "error"} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <SettingsMiniMetric label="可用地址" value={result.apiBaseUrl || "未确认"} ok={Boolean(result.apiBaseUrl && result.ok)} />
        <SettingsMiniMetric label="Key" value={result.apiKeyStatus === "valid" ? "可用" : result.apiKeyStatus === "invalid" ? "无效" : "未知"} ok={result.apiKeyStatus === "valid"} />
        <SettingsMiniMetric label="接口" value={[result.supportsResponses ? "Responses" : "", result.supportsChatCompletions ? "Chat" : ""].filter(Boolean).join(" / ") || "未通过"} ok={result.supportsResponses || result.supportsChatCompletions} />
        <SettingsMiniMetric label="模型列表" value={result.supportsModelsList ? "支持" : "不支持"} ok={result.supportsModelsList} />
        <SettingsMiniMetric label="文本模型" value={result.textModel || result.recommended.textModel || "手动填写"} ok={Boolean(result.textModel)} />
        <SettingsMiniMetric label="图片生成" value={result.supportsImageGeneration ? result.imageModel || "支持" : "未通过"} ok={result.supportsImageGeneration} />
      </div>
      {result.models?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {result.models.slice(0, 12).map((model) => (
            <span className={model.testStatus === "passed" ? "apple-pill-accent px-2 py-1 text-[11px]" : "apple-pill px-2 py-1 text-[11px]"} key={model.id}>
              {model.id}
            </span>
          ))}
          {result.models.length > 12 ? <span className="apple-count-badge px-2 py-1 text-[11px]">+{result.models.length - 12}</span> : null}
        </div>
      ) : null}
      {result.issues?.length ? (
        <div className="mt-3 space-y-2">
          {result.issues.slice(0, 4).map((item, index) => (
            <DiagnosisItem issue={item} key={`${item.step}-${index}-${item.requestUrl}`} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DiagnosisItem({ issue }: { issue: DetectionIssue }) {
  return (
    <div className="rounded-[12px] border border-[#ff8b80]/20 bg-[#ff453a]/10 p-3 text-xs leading-5 text-white/64">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#ffb4a8]">{stepLabel(issue.step)}</span>
        {issue.status ? <span className="apple-pill px-2 py-0.5 text-[11px]">HTTP {issue.status}</span> : null}
      </div>
      <div className="mt-1 break-words text-white/52">{issue.requestUrl || "未发起请求"}</div>
      <div className="mt-1 text-white/72">{issue.message}</div>
      {issue.possibleCauses?.length ? <div className="mt-1">可能：{issue.possibleCauses.slice(0, 3).join(" / ")}</div> : null}
      {issue.suggestions?.length ? <div className="mt-1">建议：{issue.suggestions.slice(0, 2).join(" ")}</div> : null}
    </div>
  );
}

function stepLabel(step: string) {
  if (step === "models") return "模型列表";
  if (step === "responses") return "Responses";
  if (step === "chat_completions") return "Chat";
  if (step === "images") return "图片";
  if (step === "address") return "地址";
  return "诊断";
}
