import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  close,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto rounded-xl border border-slate-300 bg-white p-0 text-slate-900 backdrop:bg-slate-950/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white p-5">
        <h2 className="text-xl font-bold">{title}</h2>
        {dismissible && (
          <button
            type="button"
            onClick={close}
            className="rounded p-2 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </dialog>
  );
}
