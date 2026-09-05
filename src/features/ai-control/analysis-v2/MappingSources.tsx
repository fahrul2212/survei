import { useState } from "react";
import type { Binding, Metric } from "../../../../shared/analysis/contracts";
import type { Catalog } from "./api";
export type SourceSelection = {
  questionId: number;
  field: string;
  transform: Binding["transform"];
};
type Candidate = {
  questionId: number;
  field: string;
  label: string;
  type: string;
  options: string[];
};
export function MappingSources({
  catalog,
  kind,
  options,
  selected,
  change,
}: {
  catalog: Catalog;
  kind: Metric["kind"];
  options: string[];
  selected: SourceSelection[];
  change: (sources: SourceSelection[]) => void;
}) {
  const [search, setSearch] = useState("");
  const candidates: Candidate[] = catalog.questions
    .flatMap((q) => {
      const label = `${q.year} · ${q.key} · ${q.surveyName} · ${q.prompt}`;
      const root = {
        questionId: q.id,
        field: "",
        label,
        type: q.type,
        options: q.type === "yes_no" ? ["Yes", "No"] : q.options,
      };
      const fields = Array.isArray(q.validation.fields) ? q.validation.fields : [];
      return [
        root,
        ...fields
          .filter((f) => f && typeof f === "object")
          .map((f) => {
            const field = f as { key: string; label: string; type: string; options?: string[] };
            return {
              questionId: q.id,
              field: field.key,
              label: `${label} · ${field.label ?? field.key}`,
              type: field.type,
              options: field.options ?? [],
            };
          }),
      ];
    })
    .filter((q) =>
      kind === "number"
        ? q.type === "number"
        : kind === "multiple_choice"
          ? q.type === "multiple_choice"
          : ["yes_no", "select", "single_choice"].includes(q.type),
    );
  const visible = candidates.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));
  const match = (a: SourceSelection, b: Candidate) =>
    a.questionId === b.questionId && a.field === b.field;
  const update = (c: Candidate, transform: Binding["transform"]) =>
    change(selected.map((s) => (match(s, c) ? { ...s, transform } : s)));
  return (
    <div className="min-w-0 sm:col-span-2">
      <p className="mb-2 text-xs font-semibold text-slate-600">
        {selected.length} sources selected
      </p>
      <label className="text-sm font-semibold">
        Find source questions
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search year, survey or question"
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">
        Select one source per reporting year for this measurement. Split and merged questions
        require a separate reviewed definition.
      </p>
      <div className="mt-3 grid max-h-96 gap-3 overflow-y-auto">
        {!visible.length && (
          <p className="p-3 text-sm text-slate-500">
            No matching source questions. Check the measurement type or search.
          </p>
        )}
        {visible.map((c) => {
          const selection = selected.find((s) => match(s, c));
          return (
            <div
              key={`${c.questionId}:${c.field}`}
              className="rounded-lg border border-slate-200 p-3"
            >
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!selection}
                  onChange={() =>
                    change(
                      selection
                        ? selected.filter((s) => !match(s, c))
                        : [
                            ...selected,
                            {
                              questionId: c.questionId,
                              field: c.field,
                              transform: { kind: "identity" },
                            },
                          ],
                    )
                  }
                />
                <span className="min-w-0 break-words">{c.label}</span>
              </label>
              {selection &&
                (kind === "number" ? (
                  <label className="mt-3 block text-sm">
                    Multiply source value by
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      className="mt-1 w-full rounded border border-slate-300 p-2"
                      value={selection.transform.factor ?? "1"}
                      onChange={(e) =>
                        update(
                          c,
                          e.target.value === "1"
                            ? { kind: "identity" }
                            : { kind: "scale_decimal", factor: e.target.value },
                        )
                      }
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Use 1 when the source already uses the target unit.
                    </span>
                  </label>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {c.options.map((o) => (
                      <label key={o} className="text-sm">
                        Map “{o}” to
                        <select
                          required
                          className="ml-2 rounded border border-slate-300 p-2"
                          value={
                            selection.transform.kind === "identity"
                              ? options.includes(o)
                                ? o
                                : ""
                              : (selection.transform.categories?.[o] ?? "")
                          }
                          onChange={(e) =>
                            update(c, {
                              kind: "map_category",
                              categories: {
                                ...Object.fromEntries(
                                  c.options.map((option) => [
                                    option,
                                    selection.transform.kind === "identity" &&
                                    options.includes(option)
                                      ? option
                                      : (selection.transform.categories?.[option] ?? ""),
                                  ]),
                                ),
                                [o]: e.target.value,
                              },
                            })
                          }
                        >
                          <option value="">Choose category</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
