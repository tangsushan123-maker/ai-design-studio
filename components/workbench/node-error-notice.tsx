import { errorRecoveryTips, friendlyDisplayError } from "@/components/workbench/workbench-labels";

export function NodeErrorNotice({ className = "", compact = false, error }: { className?: string; compact?: boolean; error: string }) {
  const message = friendlyDisplayError(error);
  const tips = errorRecoveryTips(error);
  return (
    <div className={`${className} min-w-0 rounded-2xl border border-[#ff6b5f]/16 bg-[#ff6b5f]/12 ${compact ? "px-2 py-1.5" : "px-3 py-2.5"} text-[#ffb4a8]`}>
      {!compact ? <div className="mb-1 text-[11px] font-semibold text-[#ffc1b8]">错误原因</div> : null}
      <div className="min-w-0 break-words text-[11px] font-medium leading-5">{message}</div>
      {tips.length ? (
        <div className="mt-2 border-t border-[#ffb4a8]/14 pt-1.5">
          {!compact ? <div className="mb-1 text-[11px] font-semibold text-white/62">处理建议</div> : null}
          <div className="grid gap-1 text-[11px] leading-5 text-white/58">
          {tips.map((tip) => (
            <div className="flex min-w-0 gap-1.5" key={tip}>
              <span className="mt-[0.45em] size-1 shrink-0 rounded-full bg-[#ffb4a8]/70" />
              <span className="min-w-0 break-words">{tip}</span>
            </div>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
