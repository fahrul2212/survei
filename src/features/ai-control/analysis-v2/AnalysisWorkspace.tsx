import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Organization, SurveyVersion } from "../../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../../../components/ui";
import type { AnalysisRequest, AnalysisRun, Dataset } from "../../../../shared/analysis/contracts";
import { useRouteSelection } from "../../reporting/useRouteSelection";
import { QuestionScope } from "../QuestionScope";
import { createAnalysis } from "./api";
import { AnalysisOutput } from "./AnalysisOutput";
import { MappingReview } from "./MappingReview";

type Props = {
  canManageMappings?: boolean;
  mode: "admin" | "company";
  versions: SurveyVersion[];
  organizations?: Organization[];
  setNotice: (notice: Notice) => void;
};
const toggle = (items: number[], id: number) =>
  items.includes(id) ? items.filter((v) => v !== id) : [...items, id];
export function AnalysisWorkspace({
  mode,
  versions,
  organizations = [],
  setNotice,
  canManageMappings = mode === "admin",
}: Props) {
  const availableYears = useMemo(
    () => [...new Set(versions.map((v) => v.reporting_year))].sort((a, b) => b - a),
    [versions],
  );
  const [years, setYears] = useRouteSelection(
    "analysisYears",
    (v): v is number => typeof v === "number" && availableYears.includes(v),
  );
  const [organizationIds, setOrganizations] = useRouteSelection(
    "analysisCompanies",
    (v): v is number =>
      mode === "admin" && typeof v === "number" && organizations.some((o) => o.id === v),
  );
  const [questionKeys, setQuestions] = useRouteSelection(
    "analysisQuestions",
    (v): v is string => typeof v === "string" && /^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(v),
  );
  const [dataset, setDataset] = useState<Dataset>("production"),
    [cohort, setCohort] = useState<AnalysisRequest["cohortMode"]>("available_each_year");
  const [run, setRun] = useState<AnalysisRun | null>(null),
    [busy, setBusy] = useState(false),
    [completedScope, setCompletedScope] = useState("");
  const scope: AnalysisRequest = {
    years,
    surveyVersionIds: [],
    organizationIds: mode === "admin" ? organizationIds : [],
    questionKeys,
    metricCodes: [],
    datasetMode: dataset,
    cohortMode: cohort,
  };
  const scopeKey = JSON.stringify(scope),
    stale = !!run && completedScope !== scopeKey;
  async function compare() {
    setBusy(true);
    try {
      const result = await createAnalysis(scope, crypto.randomUUID());
      setRun(result);
      setCompletedScope(scopeKey);
    } catch (e) {
      setNotice({
        kind: "error",
        message: e instanceof Error ? e.message : "Unable to prepare analysis",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Survey analysis"
        title="Compare and understand your data"
        description={
          mode === "admin"
            ? "Compare approved measurements across years and companies, inspect their sources, then ask AI to explain the results."
            : "Explore approved measurements and eligible anonymous group statistics. Other companies’ individual answers remain private."
        }
      />
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <fieldset disabled={busy} className="min-w-0">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Dataset
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value as Dataset)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal"
              >
                <option value="production">Production reports</option>
                <option value="synthetic">Synthetic test reports</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              Comparison group
              <select
                value={cohort}
                onChange={(e) => setCohort(e.target.value as AnalysisRequest["cohortMode"])}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal"
              >
                <option value="available_each_year">Available respondents each year</option>
                <option value="matched_panel">Same respondents across years</option>
              </select>
            </label>
          </div>
          {dataset === "synthetic" && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Synthetic data for testing only. These results do not describe real company
              performance.
            </p>
          )}
          <div className="mt-5">
            <h2 className="text-sm font-bold">Reporting years</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {[null, ...availableYears].map((year) => {
                const active = year === null ? !years.length : years.includes(year);
                return (
                  <button
                    type="button"
                    key={year ?? "all"}
                    aria-pressed={active}
                    onClick={() => setYears(year === null ? [] : toggle(years, year))}
                    className={`rounded-lg border px-4 py-2 text-sm ${active ? "bg-slate-900 text-white" : "border-slate-200"}`}
                  >
                    {year ?? "All years"}
                  </button>
                );
              })}
            </div>
          </div>
          {mode === "admin" && (
            <details className="mt-5 rounded-lg border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-bold">
                Companies · {organizationIds.length || "all"}
              </summary>
              <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                {organizations.map((o) => (
                  <label key={o.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={organizationIds.includes(o.id)}
                      onChange={() => setOrganizations(toggle(organizationIds, o.id))}
                    />
                    <span className="truncate" title={o.name}>
                      {o.name}
                    </span>
                  </label>
                ))}
              </div>
              {!!organizationIds.length && (
                <button
                  type="button"
                  className="mt-3 text-sm underline"
                  onClick={() => setOrganizations([])}
                >
                  Clear company selection
                </button>
              )}
            </details>
          )}
          <QuestionScope
            versions={versions}
            years={years}
            selected={questionKeys}
            change={setQuestions}
          />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              Question numbers alone do not establish comparability. Changed wording, units and
              methods require an approved mapping.
            </p>
            <Button
              type="button"
              variant="primary"
              icon={Search}
              disabled={busy}
              onClick={() => void compare()}
            >
              {busy ? "Preparing comparison…" : "Build comparison"}
            </Button>
          </div>
        </fieldset>
      </section>
      <section className="mt-6 grid gap-5">
        {busy && (
          <p role="status" className="text-sm text-slate-600">
            Preparing your comparison…
          </p>
        )}
        {stale && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Filters changed. Build a new comparison to update the results below.
          </p>
        )}
        {run?.result && !run.invalidated ? (
          <AnalysisOutput
            key={run.id}
            run={run}
            stale={stale}
            change={(next) => setRun((current) => (current?.id === next.id ? next : current))}
          />
        ) : (
          <EmptyState
            icon={Search}
            title={run ? "Analysis unavailable" : "Start with a comparison"}
            description={
              run
                ? "The analysis may have expired or its mapping approval changed. Build a new comparison."
                : "Choose your dataset and years. Charts appear without calling an AI provider."
            }
          />
        )}
        {canManageMappings && <MappingReview />}
      </section>
    </PageContainer>
  );
}
