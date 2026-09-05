import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { JsonAnswer } from "../../lib/portal";
import { surveyProgress, type SurveyPage } from "./survey-progress";

type Props = {
  pages: SurveyPage[];
  activeKey: string;
  answers: Record<number, JsonAnswer>;
  provenance?: Record<number, string>;
  reviewed?: Record<number, boolean>;
  select: (key: string) => void;
  disabled?: boolean;
  children?: ReactNode;
};

export function SurveyPageNavigation({
  pages,
  activeKey,
  answers,
  provenance,
  reviewed,
  select,
  disabled,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div>
      <label className="grid gap-2 text-sm font-semibold md:hidden">
        Current page
        <select
          value={activeKey}
          disabled={disabled}
          onChange={(event) => select(event.target.value)}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          {pages.map((page, index) => (
            <option key={page.key} value={page.key}>
              {index + 1}. {page.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex min-h-11 w-full items-center justify-between text-sm font-semibold text-slate-600 md:hidden"
      >
        {expanded ? "Hide report navigation" : "Show report navigation"}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={id} className={`${expanded ? "block" : "hidden"} md:block`}>
        {children}
        <nav className="grid gap-2" aria-label="Survey pages">
          {pages.map((page, index) => {
            const progress = surveyProgress(page.questions, answers, provenance, reviewed);
            const active = page.key === activeKey;
            return (
              <button
                key={page.key}
                type="button"
                disabled={disabled}
                onClick={() => select(page.key)}
                aria-current={active ? "step" : undefined}
                className={`min-w-0 rounded-lg border px-3 py-3 text-left disabled:opacity-60 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
              >
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${active ? "text-slate-300" : "text-slate-500"}`}
                >
                  Page {index + 1}
                </span>
                <span className="mt-1 block break-words text-xs font-bold leading-5">
                  {page.title}
                </span>
                <span
                  className={`mt-1 block text-[11px] leading-5 ${active ? "text-slate-300" : "text-slate-500"}`}
                >
                  {progress.complete}/{page.questions.length} complete
                  {progress.correction > 0
                    ? ` · ${progress.correction} to correct`
                    : progress.review > 0
                      ? ` · ${progress.review} to review`
                      : progress.missing > 0
                        ? ` · ${progress.missing} required`
                        : progress.optional > 0
                          ? " · remaining optional"
                          : ""}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
