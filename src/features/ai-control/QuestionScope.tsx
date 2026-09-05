import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { SurveyVersion } from "../../lib/portal";

type Option = { key: string; prompt: string };
export function QuestionScope({
  versions,
  years,
  selected,
  change,
}: {
  versions: SurveyVersion[];
  years: number[];
  selected: string[];
  change: (keys: string[]) => void;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const versionIds = useMemo(
    () =>
      versions
        .filter((version) => !years.length || years.includes(version.reporting_year))
        .map((version) => version.id),
    [versions, years],
  );
  useEffect(() => {
    let active = true;
    setError("");
    async function load() {
      if (!supabase || !versionIds.length) {
        if (active) setOptions([]);
        return;
      }
      const all: Option[] = [];
      for (let from = 0; ; from += 500) {
        const result = await supabase
          .from("survey_questions")
          .select(
            "id,question_revision:question_revisions(prompt,question:question_definitions(stable_key))",
          )
          .in("survey_version_id", versionIds)
          .order("id")
          .range(from, from + 499);
        if (result.error) throw result.error;
        for (const row of result.data ?? []) {
          const revision = Array.isArray(row.question_revision)
            ? row.question_revision[0]
            : row.question_revision;
          const definition = Array.isArray(revision?.question)
            ? revision.question[0]
            : revision?.question;
          if (definition?.stable_key)
            all.push({
              key: String(definition.stable_key),
              prompt: String(revision?.prompt ?? ""),
            });
        }
        if ((result.data?.length ?? 0) < 500) break;
      }
      if (active) setOptions([...new Map(all.map((option) => [option.key, option])).values()]);
    }
    void load().catch(() => {
      if (active) setError("Unable to load question filters. Please reopen this page.");
    });
    return () => {
      active = false;
    };
  }, [versionIds]);
  const visible = options.filter((option) =>
    `${option.key} ${option.prompt}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <details className="mt-5 rounded-xl border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-bold">
        Questions {selected.length ? `(${selected.length} selected)` : "(all)"}
      </summary>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <input
        aria-label="Search question filters"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by wording or question ID"
        className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
      />
      <div className="mt-3 grid max-h-64 gap-2 overflow-auto">
        {visible.map((option) => (
          <label key={option.key} className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={selected.includes(option.key)}
              className="mt-1 accent-red-600"
              onChange={() =>
                change(
                  selected.includes(option.key)
                    ? selected.filter((key) => key !== option.key)
                    : [...selected, option.key],
                )
              }
            />
            <span>
              <strong>{option.key}</strong> {option.prompt}
            </span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-red-700"
          onClick={() => change([])}
        >
          Include all questions
        </button>
      )}
    </details>
  );
}
