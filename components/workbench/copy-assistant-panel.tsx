"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Check, Loader2, MessageCircle, RefreshCw, Sparkles, WandSparkles, X } from "lucide-react";
import { readResponseErrorMessage, withClientTimeout } from "@/components/workbench/workbench-response";
import { ratioOptionLabel } from "@/components/workbench/workbench-utils";
import { AutoResizeTextarea } from "@/components/workbench/workbench-small-ui";
import { type AspectRatioValue } from "@/lib/design-options";
import { buildCopyAssistantImagePrompt, type CopyAssistantContext, type CopyAssistantSuggestion } from "@/lib/copy-assistant";

type CopyAssistantResponse = {
  ok?: boolean;
  source?: "ai";
  suggestions?: CopyAssistantSuggestion[];
  followUpQuestions?: string[];
};

export function CopyAssistantPanel({
  context,
  initialPrompt,
  onApply,
  onClose,
  onGenerate,
  onStatusChange,
  open,
  ratio,
}: {
  context: CopyAssistantContext;
  initialPrompt: string;
  onApply: (prompt: string) => void;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
  onStatusChange?: (status: "idle" | "loading" | "ready" | "error") => void;
  open: boolean;
  ratio: AspectRatioValue;
}) {
  const [draft, setDraft] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [suggestions, setSuggestions] = useState<CopyAssistantSuggestion[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const hasSuggestions = suggestions.length > 0;

  useEffect(() => {
    onStatusChange?.(loading ? "loading" : hasSuggestions ? "ready" : message?.tone === "error" ? "error" : "idle");
  }, [hasSuggestions, loading, message?.tone, onStatusChange]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  async function generateSuggestions(nextDraft = draft) {
    const prompt = nextDraft.trim();
    if (!prompt || loading) {
      setMessage({ tone: "error", text: "先简单写一句你要做什么，我再帮你补全。" });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const response = await withClientTimeout(fetch("/api/copy-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: "complete_brief",
          context: {
            ...context,
            ratio,
          },
        }),
      }), 95000, "文本模型响应超时，请检查文本模型配置后重试。");
      if (!response.ok) {
        throw new Error(await readResponseErrorMessage(response, "帮我想生成失败。"));
      }
      const data = await response.json() as CopyAssistantResponse;
      const nextSuggestions = data.suggestions || [];
      setSuggestions(nextSuggestions);
      setQuestions(data.followUpQuestions || []);
      setMessage({
        tone: "success",
        text: "模型已生成方案。文案和画面方向都可以直接修改。",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "帮我想生成失败。" });
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(suggestion: CopyAssistantSuggestion) {
    onApply(finalImagePrompt(suggestion, draft));
    setMessage({ tone: "success", text: "已把设计方案和画面文案填入输入框，可以继续加参考图或直接生成。" });
  }

  function generateWithSuggestion(suggestion: CopyAssistantSuggestion) {
    const prompt = finalImagePrompt(suggestion, draft);
    onApply(prompt);
    onGenerate(prompt);
  }

  function updateSuggestion(id: string, patch: Partial<Pick<CopyAssistantSuggestion, "copy" | "visualDirection">>) {
    setSuggestions((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  if (!open) return null;

  return (
    <section className="fixed inset-0 z-[72] flex items-end justify-center bg-[rgba(7,11,18,0.50)] px-3 pb-[92px] pt-4 backdrop-blur-md sm:items-center sm:pb-4" onClick={onClose}>
      <div className="apple-panel-strong flex max-h-[min(760px,88vh)] w-[min(920px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] shadow-[0_26px_92px_rgba(0,0,0,0.38)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#74e3c5]/14 text-[#adf8e5]">
                <Sparkles className="size-4" />
              </span>
              <div>
                <div className="text-[15px] font-semibold text-white/92">帮我想</div>
                <div className="mt-0.5 text-[11px] leading-4 text-white/44">先把想法整理成文案和画面方向，再一键引用出图。</div>
              </div>
            </div>
          </div>
          <button aria-label="关闭帮我想" className="apple-button flex size-9 shrink-0 items-center justify-center text-white/58" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r lg:border-white/10">
            <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-white/82">把一句话整理成可出图方案</div>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-white/48">{ratioOptionLabel(ratio)}</span>
              </div>
              <AutoResizeTextarea
                className="min-h-[130px] w-full resize-none rounded-[16px] border border-white/10 bg-black/20 px-3 py-2.5 text-[13px] leading-5 text-white/88 outline-none placeholder:text-white/30 focus:border-[#74e3c5]/42"
                maxHeight={420}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="例如：医院门口灯箱，消化内镜中心，想突出专业、安心、科技感"
                value={draft}
              />
              <button
                className="apple-button-primary mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-full text-[12px] font-semibold disabled:bg-white/[0.08] disabled:text-white/32"
                disabled={loading || !draft.trim()}
                onClick={() => void generateSuggestions()}
                type="button"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                {loading ? "模型正在整理方案" : hasSuggestions ? "再换一版" : "生成建议"}
              </button>
              {message ? (
                <div className={`mt-3 rounded-[14px] border px-3 py-2 text-[11px] leading-5 ${
                  message.tone === "error"
                    ? "border-[#ff6b5f]/18 bg-[#ff6b5f]/10 text-[#ffc1b8]"
                    : message.tone === "success"
                      ? "border-[#74e3c5]/16 bg-[#74e3c5]/10 text-[#adf8e5]/80"
                      : "border-[#ffe1a0]/14 bg-[#ffe1a0]/8 text-[#ffe1a0]/82"
                }`}>
                  {message.text}
                </div>
              ) : null}
              {questions.length ? (
                <div className="mt-3 space-y-1.5">
                  {questions.slice(0, 3).map((question) => (
                    <button
                      className="flex w-full items-center gap-2 rounded-[12px] bg-white/[0.045] px-2.5 py-2 text-left text-[11px] leading-4 text-white/52 transition hover:bg-white/[0.08] hover:text-white/74"
                      key={question}
                      onClick={() => setDraft((current) => `${current.trim()}\n${question.replace(/^是否需要/, "补充")}`.trim())}
                      type="button"
                    >
                      <MessageCircle className="size-3.5 shrink-0" />
                      <span>{question}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
            {hasSuggestions ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {suggestions.map((suggestion, index) => (
                  <article className="rounded-[18px] border border-white/10 bg-white/[0.045] p-3" key={suggestion.id || index}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[#adf8e5]">方案 {index + 1}</div>
                        <h3 className="mt-0.5 truncate text-[15px] font-semibold text-white/92">{suggestion.title}</h3>
                      </div>
                      <button
                        className="apple-button flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold text-white/66"
                        onClick={() => void generateSuggestions(`${draft}\n请重点重写：${suggestion.title}`)}
                        title="单独再换这个方向"
                        type="button"
                      >
                        <RefreshCw className="size-3.5" />
                        换
                      </button>
                    </div>
                    {suggestion.suitableUse || suggestion.designReason ? (
                      <div className="mt-2 grid gap-1.5">
                        {suggestion.suitableUse ? (
                          <div className="rounded-[12px] border border-white/8 bg-white/[0.035] px-2.5 py-2">
                            <div className="text-[11px] font-semibold text-white/42">适合场景</div>
                            <div className="mt-0.5 text-[11px] leading-4 text-white/58">{suggestion.suitableUse}</div>
                          </div>
                        ) : null}
                        {suggestion.designReason ? (
                          <div className="rounded-[12px] border border-[#74e3c5]/10 bg-[#74e3c5]/[0.055] px-2.5 py-2">
                            <div className="text-[11px] font-semibold text-[#adf8e5]/62">设计判断</div>
                            <div className="mt-0.5 text-[11px] leading-4 text-white/62">{suggestion.designReason}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <label className="mt-2.5 block">
                      <span className="mb-1.5 block text-[11px] font-semibold text-white/46">画面文案 · 可修改</span>
                      <AutoResizeTextarea
                        className="min-h-[128px] w-full resize-none rounded-[14px] border border-white/10 bg-black/18 p-3 text-[12px] leading-5 text-white/78 outline-none focus:border-[#74e3c5]/42"
                        maxHeight={360}
                        onChange={(event) => updateSuggestion(suggestion.id, { copy: event.target.value })}
                        value={suggestion.copy}
                      />
                    </label>
                    {suggestion.visualDirection ? (
                      <label className="mt-2 block">
                        <span className="mb-1.5 block text-[11px] font-semibold text-white/46">设计方案 · 会一起给模型</span>
                        <AutoResizeTextarea
                          className="min-h-[74px] w-full resize-none rounded-[14px] border border-white/10 bg-white/[0.035] p-2.5 text-[11px] leading-4 text-white/62 outline-none focus:border-[#74e3c5]/42"
                          maxHeight={220}
                          onChange={(event) => updateSuggestion(suggestion.id, { visualDirection: event.target.value })}
                          value={suggestion.visualDirection}
                        />
                      </label>
                    ) : null}
                    {suggestion.missingInfo?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestion.missingInfo.slice(0, 2).map((item) => (
                          <span className="rounded-full border border-[#ffe1a0]/14 bg-[#ffe1a0]/8 px-2 py-1 text-[11px] text-[#ffe1a0]/76" key={item}>缺 {item}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button className="apple-button flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold text-white/68" onClick={() => applySuggestion(suggestion)} type="button">
                        <Check className="size-4" />
                        引用方案
                      </button>
                      <button className="apple-button-primary flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold" onClick={() => generateWithSuggestion(suggestion)} type="button">
                        <ArrowUp className="size-4" />
                        生成这张
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/12 bg-white/[0.025] px-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-white/[0.06] text-white/52">
                  <Sparkles className="size-5" />
                </div>
                <div className="mt-3 text-[15px] font-semibold text-white/82">一句话也可以开始</div>
                <div className="mt-1 max-w-[360px] text-[12px] leading-5 text-white/42">
                  写用途、场景、行业或想表达的感觉，助理会拆成文案、画面方向和可直接出图的提示词。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function finalImagePrompt(suggestion: CopyAssistantSuggestion, userRequest: string) {
  return buildCopyAssistantImagePrompt(suggestion, userRequest);
}
