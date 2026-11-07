// 공용 화면 조각. 브라우저 대화상자(alert/confirm) 대신 Banner와 ConfirmBar를 쓴다.
import { useState, type ReactNode } from "react";
import { formatNumber, formatRate, formatWon } from "../../domain/money";

export function Button({ kind = "default", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "default" | "danger" | "ghost" }) {
  const k = {
    primary: "bg-emerald-800 text-white hover:bg-emerald-900 disabled:bg-stone-400",
    default: "bg-white border border-stone-300 hover:bg-stone-100 disabled:text-stone-400",
    danger: "bg-white border border-red-300 text-red-700 hover:bg-red-50",
    ghost: "text-emerald-800 hover:underline px-1",
  }[kind];
  return <button type="button" className={`rounded px-3 py-1.5 text-sm ${k} ${className}`} {...p} />;
}

export function Banner({ tone = "info", children, onClose }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; onClose?: () => void }) {
  const t = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    warn: "bg-amber-50 border-amber-300 text-amber-900",
    error: "bg-red-50 border-red-300 text-red-900",
    ok: "bg-emerald-50 border-emerald-300 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${t}`}>
      <div className="flex-1">{children}</div>
      {onClose && <button type="button" aria-label="닫기" className="px-1" onClick={onClose}>×</button>}
    </div>
  );
}

/** 위험한 일을 하기 전 "한 번 더" 묻는 띠. 사유가 필요하면 입력칸을 붙인다 */
export function ConfirmBar({ message, needReason, confirmLabel = "확인", onConfirm, onCancel }: {
  message: ReactNode; needReason?: string; confirmLabel?: string; onConfirm(reason: string): void; onCancel(): void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
      <span className="flex-1">{message}</span>
      {needReason && <input autoFocus className="input w-64" placeholder={needReason} value={reason} onChange={(e) => setReason(e.target.value)} />}
      <Button kind="primary" disabled={!!needReason && !reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
      <Button onClick={onCancel}>취소</Button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-stone-600">{label}</span>
      {children}
      {hint && <span className="text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

/** "1,234,000" 같은 입력을 원 단위 정수로. 숫자가 아니면 null */
export function parseWonInput(s: string): number | null {
  const t = s.replace(/[,\s원]/g, "");
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

export function MoneyInput({ value, onChange, allowNegative, ...rest }: { value: string; onChange(v: string): void; allowNegative?: boolean } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <input
      inputMode="numeric"
      className="input text-right tabular-nums"
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, "");
        const neg = allowNegative && raw.startsWith("-");
        const digits = raw.replace(/-/g, "").replace(/^0+(?=\d)/, "");
        onChange((neg ? "-" : "") + (digits ? formatNumber(Number(digits)) : ""));
      }}
      {...rest}
    />
  );
}

export const Won = ({ n, className = "" }: { n: number; className?: string }) => (
  <span className={`tabular-nums ${n < 0 ? "text-red-700" : ""} ${className}`}>{formatWon(n)}</span>
);

/** 집행률. 분모가 없으면 이유를 보여 준다 */
export function Rate({ rate, executed, emptyLabel = "배정 없음" }: { rate: number | null; executed: boolean; emptyLabel?: string }) {
  if (rate === null) return <span className="text-stone-500">{emptyLabel}</span>;
  if (!executed) return <span className="text-stone-500">집행 없음</span>;
  return <span className={`tabular-nums ${rate > 1 ? "font-semibold text-red-700" : rate >= 0.9 ? "text-amber-700" : ""}`}>{formatRate(rate)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">{children}</div>;
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function useFlash() {
  const [flash, setFlash] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const node = flash && <Banner tone={flash.tone} onClose={() => setFlash(null)}>{flash.text}</Banner>;
  return { flash: node, setFlash };
}

export function download(bytes: Uint8Array | Blob, name: string, type = "application/octet-stream") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes.slice().buffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
