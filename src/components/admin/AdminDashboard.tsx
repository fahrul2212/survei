import { useState, useMemo } from "react";
import { Button, SearchField } from "../ui";
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
    <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
      <div className="mb-10">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Platform administration</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Reporting progress</h1>
        <p className="mt-2 text-slate-500">Monitor company completion rates and submission statuses for the current year.</p>
      </div>

      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Companies</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {orgs.filter((o) => o.is_active).length}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Submitted</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {submitted}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">In progress</span>
          <strong className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {inProgress}
          </strong>
        </article>
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
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
                    <div className="flex items-center gap-3 text-[13px] font-semibold text-slate-900">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-slate-900 transition-all duration-500" style={{ width: `${r.completion_percent}%` }} />
                      </div>
                      <span className="w-9">{r.completion_percent}%</span>
                    </div>
                  </td>
                  <td className="mb-2 flex flex-col md:mb-0 md:p-4 md:align-middle">
                    <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">Status</span>
                    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      r.status === "submitted" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "not_started" ? "bg-slate-100 text-slate-500" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {r.status.replace("_", " ")}
                    </span>
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
        </div>
      </section>
    </div>
  );
}
