import { useEffect } from "react";
import { X } from "lucide-react";
import { Logo } from "./brand";

export type Notice = { kind: "success" | "error"; message: string } | null;

export function Loading({ text = "Loading secure reporting data" }: { text?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6 py-12 text-center">
      <div className="grid justify-items-center">
        <Logo />
        <div className="mt-8 flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-[#d91f17]" />
          <span className="size-2 rounded-full bg-[#d91f17]/60" />
          <span className="size-2 rounded-full bg-[#d91f17]/30" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-500">{text}</p>
      </div>
    </main>
  );
}

export function NoticeBar({ notice, clear }: { notice: Notice; clear: () => void }) {
  useEffect(() => {
    if (!notice || notice.kind !== "success") return;
    const timer = window.setTimeout(clear, 5000);
    return () => window.clearTimeout(timer);
  }, [notice, clear]);

  if (!notice) return null;

  return (
    <div
      className={`fixed inset-x-4 top-4 z-50 mx-auto flex max-w-xl items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg md:inset-x-auto md:right-6 md:left-auto ${notice.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
    >
      <span>{notice.message}</span>
      <button type="button" onClick={clear} aria-label="Dismiss notification">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
