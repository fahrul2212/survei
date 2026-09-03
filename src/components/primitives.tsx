import { Search, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "default" | "small" | "icon";

export type ReportingStatus = "not_started" | "draft" | "reopened" | "submitted" | "published" | "closed";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[#d91f17] text-white hover:bg-[#b81711] disabled:bg-slate-300 disabled:text-slate-500",
  secondary:
    "border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50 disabled:bg-slate-100",
  danger:
    "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
  ghost:
    "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2.5 text-sm",
  small: "min-h-9 px-3 py-2 text-xs",
  icon: "size-10 justify-center p-0",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, icon: Icon, variant = "secondary", size = "default", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d91f17] focus-visible:ring-offset-2 disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={size === "small" ? 15 : 17} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
});

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  compact = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={cn(
        "mb-7 flex items-end justify-between gap-6 max-[840px]:items-start max-[840px]:flex-col",
        compact && "mb-6",
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="mb-2 text-[0.69rem] font-extrabold uppercase tracking-[0.12em] text-[#d91f17]">
            {eyebrow}
          </p>
        )}
        <h1 className="max-w-[22ch] text-balance text-[clamp(2rem,3.5vw,2.75rem)] leading-[1.08] tracking-[-0.035em]">
          {title}
        </h1>
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">{meta}</div>}
        {description && <p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2.5 max-[560px]:w-full">{actions}</div>}
    </header>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-8 xl:px-12 lg:pb-16 xl:pb-20", className)}>{children}</div>;
}

const statusLabels: Record<ReportingStatus, string> = {
  not_started: "Not started",
  draft: "In progress",
  reopened: "Reopened",
  submitted: "Submitted",
  published: "Published",
  closed: "Closed",
};

const statusClasses: Record<ReportingStatus, string> = {
  not_started: "border-slate-200 bg-slate-50 text-slate-600",
  draft: "border-blue-200 bg-blue-50 text-blue-700",
  reopened: "border-amber-200 bg-amber-50 text-amber-800",
  submitted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-700",
};

export function StatusBadge({ status, inverse = false }: { status: ReportingStatus; inverse?: boolean }) {
  return (
    <span className={cn(
      "inline-flex w-fit self-start whitespace-nowrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em]",
      inverse ? "border-white bg-white text-[#b81711]" : statusClasses[status],
    )}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", inverse ? "bg-[#d91f17]" : status === "submitted" || status === "published" ? "bg-emerald-500" : status === "reopened" ? "bg-amber-500" : status === "draft" ? "bg-blue-500" : "bg-slate-400")} />
      {statusLabels[status]}
    </span>
  );
}

export function ProgressBar({ value, label = "Progress", tone = "red" }: { value: number; label?: string; tone?: "red" | "dark" | "emerald" | "slate" }) {
  const safeValue = Math.min(100, Math.max(0, Math.round(value)));
  const fill = safeValue === 100
    ? "bg-emerald-600"
    : tone === "emerald"
    ? "bg-emerald-600"
    : tone === "dark" || tone === "slate"
    ? "bg-slate-600"
    : "bg-[#d91f17]";
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums font-bold text-slate-900">{safeValue}%</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue}>
        <div className={cn("h-full rounded-full transition-[width] duration-300", fill)} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function SearchField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("relative block min-w-0", className)}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <span className="sr-only">{props["aria-label"] ?? "Search"}</span>
      <input
        type="search"
        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
        {...props}
      />
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center px-6 py-10 text-center">
      <div className="grid max-w-md justify-items-center">
        <Icon size={26} aria-hidden="true" className="mb-2.5 text-slate-400 stroke-[1.75]" />
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function TruncatedText({ children, className }: { children: string; className?: string }) {
  return (
    <span className={cn("block max-w-full truncate", className)} title={children}>
      {children}
    </span>
  );
}
