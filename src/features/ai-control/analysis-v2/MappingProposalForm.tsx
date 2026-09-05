import { useState } from "react";
import { Button } from "../../../components/ui";
import type { Catalog } from "./api";
import type { Metric } from "../../../../shared/analysis/contracts";
import { MappingSources, type SourceSelection } from "./MappingSources";
const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm";
export function MappingProposalForm({
  catalog,
  busy,
  save,
}: {
  catalog: Catalog;
  busy: boolean;
  save: (body: unknown) => void;
}) {
  const [selected, setSelected] = useState<SourceSelection[]>([]);
  const [kind, setKind] = useState<Metric["kind"]>("number"),
    [categories, setCategories] = useState("");
  const options = [
    ...new Set(
      categories
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const [values, setValues] = useState({
    code: "",
    name: "",
    unit: "",
    population: "",
    scope: "",
    period: "",
    method: "",
    reason: "",
  });
  const [dataset, setDataset] = useState("production"),
    [percent, setPercent] = useState(false);
  return (
    <details className="mt-5 border-t border-slate-200 pt-4">
      <summary className="cursor-pointer text-sm font-bold">Propose a comparison</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            operation: "propose",
            dataset,
            relation: selected.some((s) => s.transform.kind !== "identity")
              ? "convertible"
              : "equivalent",
            reason: values.reason,
            metric: {
              ...values,
              kind,
              options: kind === "number" ? [] : options,
              operations:
                kind !== "number"
                  ? ["distribution"]
                  : percent
                    ? ["difference", "percent_change"]
                    : ["difference"],
            },
            sources: selected,
          });
        }}
      >
        <fieldset disabled={busy} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            Measurement type
            <select
              className={fieldClass}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Metric["kind"]);
                setSelected([]);
              }}
            >
              <option value="number">Number</option>
              <option value="single_choice">Single choice</option>
              <option value="multiple_choice">Multiple choices</option>
            </select>
          </label>
          {kind !== "number" && (
            <label className="text-sm font-semibold">
              Comparison categories, one per line
              <textarea
                required
                rows={3}
                className={fieldClass}
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
              />
            </label>
          )}
          {Object.entries({
            code: "Metric reference (for example workforce.headcount)",
            name: "Measurement name",
            unit: "Unit",
            population: "Population covered",
            scope: "Organizational boundary",
            period: "Reporting period definition",
            method: "Measurement method",
            reason: "Reason these questions are comparable",
          }).map(([key, label]) => (
            <label key={key} className="text-sm font-semibold">
              {label}
              <input
                className={fieldClass}
                required
                maxLength={500}
                value={values[key as keyof typeof values]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-sm font-semibold">
            Dataset
            <select
              className={fieldClass}
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
              <option value="production">Production data</option>
              <option value="synthetic">Synthetic test data</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={percent}
              onChange={(e) => setPercent(e.target.checked)}
            />
            Allow percentage change (never for calendar years)
          </label>
          <MappingSources
            catalog={catalog}
            kind={kind}
            options={options}
            selected={selected}
            change={setSelected}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !selected.length}>
              Save proposal for review
            </Button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
