import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Evidence } from "../../../../shared/analysis/contracts";

const scopeLabels: Record<Evidence["scope"], string> = {
  own_answer: "Your company’s answer",
  company_answer: "Company answer",
  anonymous_group: "Anonymous group",
  selected_group: "Selected group",
};

export function Sources({ items }: { items: Evidence[] }) {
  const [query, setQuery] = useState("");
  const id = useId();
  const matches = useMemo(
    () =>
      items.filter((source) =>
        [
          source.year,
          source.questionKey,
          source.prompt,
          source.organization,
          source.field,
          source.surveyName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [items, query],
  );
  return (
    <div className="min-w-0">
      {items.length > 5 && (
        <div className="mb-5">
          <label htmlFor={id} className="text-sm font-semibold">
            Find a source
          </label>
          <div className="relative mt-2">
            <Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-slate-500" />
            <input
              id={id}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Question, company or year"
              className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500" role="status">
            {matches.length} of {items.length} sources
          </p>
        </div>
      )}
      <div className="divide-y divide-slate-200">
        {matches.map((source) => (
          <article key={source.id} className="min-w-0 break-words py-5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                {source.year} · {source.questionKey}
              </span>
              <span>{scopeLabels[source.scope]}</span>
            </div>
            <h4 className="mt-2 text-sm font-semibold leading-6 text-slate-900">{source.prompt}</h4>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {source.organization ?? scopeLabels[source.scope]} · {source.surveyName}
              {source.field && ` · ${source.field}`}
              {source.responses !== undefined && ` · ${source.responses} respondents`}
            </p>
            {source.value !== undefined && (
              <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6">
                {typeof source.value === "string" ? source.value : JSON.stringify(source.value)}
              </blockquote>
            )}
            {source.method && (
              <p className="mt-2 text-xs leading-5 text-slate-600">Method: {source.method}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">Question revision {source.revisionId}</p>
          </article>
        ))}
      </div>
      {!matches.length && (
        <p className="py-5 text-sm text-slate-600">
          {items.length
            ? "No sources match this search. Try a question number or reporting year."
            : "No source evidence is available in this scope."}
        </p>
      )}
    </div>
  );
}
