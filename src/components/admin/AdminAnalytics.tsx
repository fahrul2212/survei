import { useState } from "react";
import type { Organization, ProgressRow } from "../../lib/portal";
import { PageContainer, PageHeader } from "../ui";

export function AdminAnalytics({
  organizations,
  rows,
  currentRows,
}: {
  organizations: Organization[];
  rows: ProgressRow[];
  currentRows: ProgressRow[];
}) {
  const cycles = Array.from(
    new Map(rows.map((row) => [row.survey_version_id, {
      id: row.survey_version_id,
      year: row.reporting_year,
      name: row.survey_name,
    }])).values(),
  ).sort((a, b) => b.year - a.year || b.id - a.id);
  const submitted = currentRows.filter((row) => row.status === "submitted").length;
  const inProgress = currentRows.filter((row) => row.status === "draft" || row.status === "reopened").length;
  const notStarted = currentRows.filter((row) => row.status === "not_started").length;
  const activeOrganizations = organizations.filter((organization) => organization.is_active);
  const [comparisonSurveyId, setComparisonSurveyId] = useState(cycles[0]?.id ?? 0);
  const [firstOrganizationId, setFirstOrganizationId] = useState(activeOrganizations[0]?.id ?? 0);
  const [secondOrganizationId, setSecondOrganizationId] = useState(activeOrganizations[1]?.id ?? activeOrganizations[0]?.id ?? 0);
  const comparisonRows = [firstOrganizationId, secondOrganizationId].map((organizationId) => ({
    organization: organizations.find((item) => item.id === organizationId),
    row: rows.find((item) => item.organization_id === organizationId && item.survey_version_id === comparisonSurveyId),
  }));

  return (
    <PageContainer>
      <PageHeader eyebrow="Lightweight analytics" title="Participation trends" description="Track submission progress, cohort completion rates, and company trajectories across survey cycles." />
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Direct comparison</p><h2 className="mt-1 text-lg font-bold text-slate-900">Compare two companies</h2></div>
          <select value={comparisonSurveyId} onChange={(event) => setComparisonSurveyId(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" aria-label="Comparison survey">{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.year} · {cycle.name}</option>)}</select>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {comparisonRows.map((comparison, index) => <article key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <select value={index === 0 ? firstOrganizationId : secondOrganizationId} onChange={(event) => index === 0 ? setFirstOrganizationId(Number(event.target.value)) : setSecondOrganizationId(Number(event.target.value))} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" aria-label={`Company ${index + 1}`}>{activeOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>
            <div className="mt-5 flex items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Completion</span><strong className="mt-1 block text-4xl font-extrabold text-slate-900">{comparison.row?.completion_percent ?? 0}%</strong></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-slate-600">{(comparison.row?.status ?? "not_started").replace("_", " ")}</span></div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"><i className="block h-full rounded-full bg-[#d91f17]" style={{ width: `${comparison.row?.completion_percent ?? 0}%` }} /></div>
            <p className="mt-3 text-xs text-slate-500">{comparison.row?.answered_questions ?? 0} of {comparison.row?.total_questions ?? 0} questions answered</p>
          </article>)}
        </div>
      </section>
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
          <h3 className="text-lg font-bold text-slate-900">Average completion by survey</h3>
          <div className="mt-6 grid gap-4">
            {cycles.map((cycle) => {
              const cycleRows = rows.filter((row) => row.survey_version_id === cycle.id);
              const average = cycleRows.length
                ? Math.round(cycleRows.reduce((sum, row) => sum + row.completion_percent, 0) / cycleRows.length)
                : 0;
              return (
                <div key={cycle.id} className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.5fr)_3.5rem] items-center gap-3 text-sm">
                  <span className="truncate font-semibold text-slate-500" title={`${cycle.year} · ${cycle.name}`}>{cycle.year} · {cycle.name}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><i className="block h-full rounded-full bg-[#d91f17]" style={{ width: `${average}%` }} /></div>
                  <strong className="text-right tabular-nums text-slate-900">{average}%</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Current status distribution</h3>
              <p className="mt-1 text-sm text-slate-500">Reporting state across the active company cohort</p>
            </div>
            <div className="text-right">
              <strong className="block text-3xl font-extrabold tabular-nums text-slate-900">{currentRows.length}</strong>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Companies</span>
            </div>
          </div>
          <div className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${submitted} submitted, ${inProgress} in progress, ${notStarted} not started`}>
            <span className="h-full bg-emerald-600" style={{ width: `${currentRows.length ? (submitted / currentRows.length) * 100 : 0}%` }} />
            <span className="h-full bg-blue-600" style={{ width: `${currentRows.length ? (inProgress / currentRows.length) * 100 : 0}%` }} />
            <span className="h-full bg-slate-300" style={{ width: `${currentRows.length ? (notStarted / currentRows.length) * 100 : 0}%` }} />
          </div>
          <dl className="mt-5 grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="py-3 sm:py-0 sm:pr-4">
              <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500"><i className="size-2 rounded-full bg-emerald-600" />Submitted</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{submitted}</dd>
            </div>
            <div className="py-3 sm:px-4 sm:py-0">
              <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500"><i className="size-2 rounded-full bg-blue-600" />In progress</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{inProgress}</dd>
            </div>
            <div className="py-3 sm:py-0 sm:pl-4">
              <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500"><i className="size-2 rounded-full bg-slate-300" />Not started</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{notStarted}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 md:col-span-2 md:p-6">
          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Company reporting trajectory</h3>
              <p className="mt-1 text-sm text-slate-500">Completion timeline across survey cycles and participating brands</p>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{activeOrganizations.length} active companies</span>
          </div>
          <div className="divide-y divide-slate-100">
            {activeOrganizations.map((organization) => (
              <article className="grid gap-4 py-5 lg:grid-cols-[minmax(17rem,0.7fr)_minmax(0,2.3fr)] lg:items-center lg:gap-8" key={organization.id}>
                <div className="min-w-0">
                  <strong className="block truncate text-sm font-bold text-slate-900" title={organization.name}>{organization.name}</strong>
                  <span className="text-xs text-slate-500">Completion history</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-5 gap-y-3">
                  {cycles.map((cycle) => {
                    const completion = rows.find((row) => row.organization_id === organization.id && row.survey_version_id === cycle.id)?.completion_percent ?? 0;
                    return (
                      <div key={cycle.id} className="grid gap-1" title={cycle.name}>
                        <div className="flex justify-between gap-2 text-[11px] font-semibold text-slate-500"><span>{cycle.year}</span><strong className="text-slate-900">{completion}%</strong></div>
                        <i className="block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><b className="block h-full rounded-full bg-[#d91f17]" style={{ width: `${completion}%` }} /></i>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>
    </PageContainer>
  );
}
