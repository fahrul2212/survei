import { useState, useMemo } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, UsersRound } from "lucide-react";
import { Button, EmptyState, PageContainer, PageHeader, ProgressBar, SearchField, StatusBadge } from "../ui";
import type { Organization, ProgressRow, SurveyVersion } from "../../lib/portal";

export function AdminDashboard({
  versions,
  orgs,
  rows,
  setView,
}: {
  versions: SurveyVersion[];
  orgs: Organization[];
  rows: ProgressRow[];
  setView: (v: string) => void;
}) {
  const [dashSearch, setDashSearch] = useState("");
  const [dashStatusFilter, setDashStatusFilter] = useState<string>("all");
  const [reopenTarget, setReopenTarget] = useState<ProgressRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const current = versions.find((v) => v.status === "published") ?? versions[0];
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
        description={current ? `A clear view of company participation for the ${current.reporting_year} reporting cycle.` : "Create and publish a reporting year to start monitoring company participation."}
        actions={<Button icon={ClipboardList} variant="primary" onClick={() => setView("surveys")}>{current ? "Manage survey" : "Create reporting year"}</Button>}
      />

      {current && (
        <section className="mb-8 flex flex-col gap-4 rounded-xl border border-red-100 bg-red-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-[#d91f17] shadow-sm"><Clock3 size={19} aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#b81711]">Current reporting cycle</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{current.reporting_year} · {current.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{submitted} of {currentRows.length} companies have submitted.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setView("companies")}>Review companies <ArrowRight size={15} aria-hidden="true" /></Button>
        </section>
      )}

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <UsersRound size={18} className="mb-3 text-slate-400" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Companies</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {orgs.filter((o) => o.is_active).length}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <CheckCircle2 size={18} className="mb-3 text-emerald-600" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Submitted</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {submitted}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <Clock3 size={18} className="mb-3 text-blue-600" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">In progress</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {inProgress}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <ClipboardList size={18} className="mb-3 text-slate-400" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Not started</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {notStarted}
          </strong>
        </article>
      </section>

      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Company status</p>
            <h3 className="text-lg font-bold text-slate-900">{current?.reporting_year ?? "No active year"}</h3>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SearchField
              placeholder="Search company or email…"
              value={dashSearch}
              onChange={(e) => setDashSearch(e.target.value)}
              className="w-full sm:w-[220px]"
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
                  ? "bg-slate-800 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-full overflow-x-auto">
          {filteredDashboardRows.length === 0 && currentRows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No company progress yet"
              description="Once a reporting cycle is published and companies begin responding, their progress will appear here."
              action={<Button variant="primary" onClick={() => setView("companies")}>Review companies</Button>}
            />
          ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="hidden border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 md:table-header-group">
              <tr>
                <th className="p-4 font-semibold">Company</th>
                <th className="p-4 font-semibold">Contact</th>
                <th className="p-4 font-semibold">Progress</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDashboardRows.map((r) => (
                <tr key={`${r.organization_id}-${r.survey_version_id}`} className="flex flex-col p-4 transition-colors hover:bg-slate-50/50 md:table-row md:p-0">
                  <td className="mb-2 flex flex-col md:mb-0 md:p-4 md:align-middle">
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Company</span>
                    <strong className="font-semibold text-slate-900">{r.organization_name}</strong>
                  </td>
                  <td className="mb-2 flex flex-col md:mb-0 md:p-4 md:align-middle">
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Contact</span>
                    <span className="text-slate-600">{r.contact_email ?? "Not set"}</span>
                  </td>
                  <td className="mb-2 flex flex-col md:mb-0 md:p-4 md:align-middle">
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Progress</span>
                      <div className="w-full max-w-[220px]"><ProgressBar value={r.completion_percent} label="Completion" tone="dark" /></div>
                  </td>
                  <td className="mb-2 flex flex-col md:mb-0 md:p-4 md:align-middle">
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Status</span>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="flex flex-col border-t border-slate-100 pt-3 md:table-cell md:border-0 md:p-4 md:pt-4 md:align-middle">
                    <span className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Action</span>
                    {r.status === "submitted" && (
                      <Button size="small" variant="secondary" onClick={() => setReopenTarget(r)}>
                        Reopen
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredDashboardRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No companies matching the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </section>
    </PageContainer>
  );
}
