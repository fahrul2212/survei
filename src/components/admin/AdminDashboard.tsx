import { useState, useMemo } from "react";
import { ArrowRight, Bot, CheckCircle2, ClipboardList, Clock3, UsersRound } from "lucide-react";
import { Button, EmptyState, PageContainer, PageHeader, ProgressBar, SearchField, StatusBadge } from "../ui";
import type { Organization, ProgressRow, SurveyVersion } from "../../lib/portal";

export function AdminDashboard({
  versions,
  orgs,
  rows,
  currentSurveyId,
  onCurrentSurveyChange,
  setView,
  onReopen,
  onOpenSummary,
}: {
  versions: SurveyVersion[];
  orgs: Organization[];
  rows: ProgressRow[];
  currentSurveyId: number | null;
  onCurrentSurveyChange: (id: number) => void;
  setView: (v: string) => void;
  onReopen: (row: ProgressRow) => void;
  onOpenSummary?: (row: ProgressRow) => void;
}) {
  const [dashSearch, setDashSearch] = useState("");
  const [dashStatusFilter, setDashStatusFilter] = useState<string>("all");

  const activeSurveys = versions.filter((v) => v.status === "published");
  const current = activeSurveys.find((v) => v.id === currentSurveyId) ?? activeSurveys[0];
  const currentRows = current ? rows.filter((r) => r.survey_version_id === current.id) : [];

  const filteredDashboardRows = useMemo(() => {
    return currentRows.filter((r) => {
      const matchesSearch =
        !dashSearch ||
        r.organization_name.toLowerCase().includes(dashSearch.toLowerCase()) ||
        (r.contact_email && r.contact_email.toLowerCase().includes(dashSearch.toLowerCase()));
      const matchesStatus =
        dashStatusFilter === "all" ||
        (dashStatusFilter === "submitted" && r.status === "submitted") ||
        (dashStatusFilter === "in_progress" && (r.status === "draft" || r.status === "reopened")) ||
        (dashStatusFilter === "not_started" && r.status === "not_started");
      return matchesSearch && matchesStatus;
    });
  }, [currentRows, dashSearch, dashStatusFilter]);

  const submitted = currentRows.filter((r) => r.status === "submitted").length;
  const inProgress = currentRows.filter((r) => r.status === "draft" || r.status === "reopened").length;
  const notStarted = currentRows.filter((r) => r.status === "not_started").length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform administration"
        title="Reporting progress"
        description={current ? `A clear view of company participation for the ${current.reporting_year} reporting cycle.` : "Create and publish a survey to start monitoring company participation."}
        actions={<Button icon={ClipboardList} variant="primary" onClick={() => setView("surveys")}>{current ? "Manage survey" : "Create survey"}</Button>}
      />

      {current && (
        <section className="mb-8 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-red-200 bg-white text-[#d91f17]"><Clock3 size={19} aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#b81711]">Current reporting cycle</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{current.reporting_year} · {current.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{submitted} of {currentRows.length} companies have submitted.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64">
            {activeSurveys.length > 1 && (
              <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Active survey
                <select
                  className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
                  value={current?.id ?? ""}
                  onChange={(event) => onCurrentSurveyChange(Number(event.target.value))}
                >
                  {activeSurveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.reporting_year} · {survey.name}</option>)}
                </select>
              </label>
            )}
            <Button variant="secondary" onClick={() => setView("companies")}>Review companies <ArrowRight size={15} aria-hidden="true" /></Button>
          </div>
        </section>
      )}

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
          <UsersRound size={18} className="mb-3 text-slate-400" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Companies</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {orgs.filter((o) => o.is_active).length}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
          <CheckCircle2 size={18} className="mb-3 text-emerald-600" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Submitted</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {submitted}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
          <Clock3 size={18} className="mb-3 text-blue-600" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">In progress</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {inProgress}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 md:p-5">
          <ClipboardList size={18} className="mb-3 text-slate-400" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Not started</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {notStarted}
          </strong>
        </article>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Company participation</p>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-slate-900">
                {current ? `${current.reporting_year} reporting cycle` : "All companies"}
              </h3>
              {current?.status && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  {current.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SearchField
              placeholder="Search company or email…"
              value={dashSearch}
              onChange={(e) => setDashSearch(e.target.value)}
              className="w-full sm:w-[260px]"
            />
            <Button variant="secondary" onClick={() => setView("data")}>
              Export data
            </Button>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
          {[
            ["all", `All (${currentRows.length})`],
            ["submitted", `Submitted (${submitted})`],
            ["in_progress", `In Progress (${inProgress})`],
            ["not_started", `Not Started (${notStarted})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDashStatusFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                dashStatusFilter === key
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredDashboardRows.length === 0 && currentRows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No company progress yet"
              description="Once a reporting cycle is published and companies begin responding, their progress will appear here."
              action={<Button variant="primary" onClick={() => setView("companies")}>Review companies</Button>}
            />
          ) : (
          <div className="text-sm text-slate-600 overflow-x-auto" role="table" aria-label="Company reporting progress">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.85fr)_6.8rem_11.5rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid" role="row">
              <span role="columnheader">Company</span>
              <span role="columnheader">Contact</span>
              <span role="columnheader">Progress</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Action</span>
            </div>
            <div className="divide-y divide-slate-100" role="rowgroup">
              {filteredDashboardRows.map((r) => (
                <article
                  key={`${r.organization_id}-${r.survey_version_id}`}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/80 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(7.5rem,0.85fr)_6.8rem_11.5rem] md:items-center md:gap-4 md:px-5 md:py-3.5"
                  role="row"
                >
                  {/* Company Name & Mobile Status */}
                  <div className="flex items-start justify-between gap-3 min-w-0 md:block" role="cell">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-bold text-slate-900" title={r.organization_name}>
                        {r.organization_name}
                      </strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 md:hidden" title={r.contact_email ?? "Not set"}>
                        {r.contact_email ?? "No contact email"}
                      </span>
                    </div>
                    <div className="shrink-0 md:hidden">
                      <StatusBadge status={r.status} />
                    </div>
                  </div>

                  {/* Desktop Contact Email */}
                  <div className="hidden min-w-0 md:block" role="cell">
                    <span className="block truncate text-sm text-slate-600" title={r.contact_email ?? "Not set"}>
                      {r.contact_email ?? "Not set"}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="min-w-0" role="cell">
                    <ProgressBar value={r.completion_percent} label="Completion" tone="dark" />
                  </div>

                  {/* Desktop Status Badge */}
                  <div className="hidden min-w-0 md:block" role="cell">
                    <StatusBadge status={r.status} />
                  </div>

                  {/* Actions */}
                  <div className="min-w-0" role="cell">
                    {r.status === "submitted" ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 md:pt-0">
                        {onOpenSummary && (
                          <Button
                            size="small"
                            variant="secondary"
                            icon={Bot}
                            onClick={() => onOpenSummary(r)}
                            title="View or generate AI summary"
                          >
                            AI summary
                          </Button>
                        )}
                        <Button size="small" variant="ghost" onClick={() => onReopen(r)}>
                          Reopen
                        </Button>
                      </div>
                    ) : (
                      <span className="text-slate-400 hidden md:inline" aria-label="No action available">—</span>
                    )}
                  </div>
                </article>
              ))}
              {filteredDashboardRows.length === 0 && (
                <div className="p-8 text-center text-slate-500">No companies matching the filter.</div>
              )}
            </div>
          </div>
          )}
      </section>
    </PageContainer>
  );
}
