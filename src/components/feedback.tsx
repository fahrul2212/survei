import { useEffect } from "react";
import { X } from "lucide-react";
import { Logo } from "./brand";

export type Notice = { kind: "success" | "error"; message: string } | null;

export function Loading({ text = "Loading secure reporting data" }: { text?: string }) {
  return (
    <main className="loading-screen">
      <Logo />
      <div className="loading-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{text}</p>
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
      className={`notice notice--${notice.kind}`}
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
