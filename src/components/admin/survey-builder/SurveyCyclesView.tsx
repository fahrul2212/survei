import { ArrowRight, Plus } from "lucide-react";
import { surveyDisplayTitle } from "../../../lib/portal";
import { Button, PageHeader, StatusBadge } from "../../ui";
import type { SurveyBuilderController } from "./useSurveyBuilder";

export function SurveyCyclesView({ controller }: { controller: SurveyBuilderController }) {
  const { versions, busy, selected, beginCreateSurvey, openVersion } = controller;
  return (
    <>
      <PageHeader
        eyebrow="Survey management"
        title="Survey builder"
        description="Manage survey cycles, carry-forward mappings, and publishing status. Multiple surveys can share the same reporting year."
        actions={<Button icon={Plus} variant="primary" onClick={beginCreateSurvey}>New survey</Button>}
      />
      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Survey cycles</p>
            <h2 className="text-lg font-bold text-slate-900">{versions.length} {versions.length === 1 ? "survey" : "surveys"}</h2>
          </div>
          <span className="text-sm text-slate-600">Choose a survey to open its workspace</span>
        </header>
        <div className="flex flex-col divide-y divide-slate-100">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              className="grid w-full grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:z-10 sm:grid-cols-[5rem_minmax(0,1fr)_auto] md:px-6"
              onClick={() => void openVersion(version)}
              disabled={busy}
              aria-busy={busy && selected === version.id}
            >
              <span className="text-lg font-bold tabular-nums text-slate-900">{version.reporting_year}</span>
              <span className="min-w-0">
                <strong className="block truncate text-sm font-bold text-slate-900" title={surveyDisplayTitle(version.name)}>{surveyDisplayTitle(version.name)}</strong>
                <small className="mt-1 block text-xs font-medium text-slate-500">Annual reporting workspace</small>
              </span>
              <span className="col-span-2 flex items-center justify-between gap-4 pl-20 sm:col-span-1 sm:justify-end sm:pl-0">
                <StatusBadge status={version.status} label={version.status === "draft" ? "Draft" : undefined} />
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  {busy && selected === version.id ? "Opening…" : <>Open <ArrowRight size={15} aria-hidden="true" /></>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
