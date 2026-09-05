import { useEffect, useMemo, useState } from "react";
import { BarChart3, HelpCircle, Search, TrendingUp } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { valueAsText, type ExportRow, type Organization, type ProgressRow } from "../../lib/portal";
import { Button, DataTablePagination, EmptyState, PageContainer, PageHeader, SearchField, StatusBadge } from "../ui";

export function AdminAnalytics({
  organizations,
  rows,
  currentRows,
}: {
  organizations: Organization[];
  rows: ProgressRow[];
  currentRows: ProgressRow[];
}) {
  const [activeTab, setActiveTab] = useState<"cohort" | "questions">("cohort");

  const cycles = useMemo(() => {
    return Array.from(
      new Map(
        rows.map((row) => [
          row.survey_version_id,
          {
            id: row.survey_version_id,
            year: row.reporting_year,
            name: row.survey_name,
          },
        ]),
      ).values(),
    ).sort((a, b) => b.year - a.year || b.id - a.id);
  }, [rows]);

  // ── Cohort stats ───────────────────────────────────────────────────────────
  const submitted = currentRows.filter((row) => row.status === "submitted").length;
  const inProgress = currentRows.filter((row) => row.status === "draft" || row.status === "reopened").length;
  const notStarted = currentRows.filter((row) => row.status === "not_started").length;
  const activeOrganizations = organizations.filter((organization) => organization.is_active);

  // Trajectory pagination
  const [trajectoryPage, setTrajectoryPage] = useState(0);
  const [trajectoryPageSize, setTrajectoryPageSize] = useState(10);
  const totalTrajectoryPages = Math.max(1, Math.ceil(activeOrganizations.length / trajectoryPageSize));
  const pagedActiveOrganizations = useMemo(() => {
    return activeOrganizations.slice(trajectoryPage * trajectoryPageSize, (trajectoryPage + 1) * trajectoryPageSize);
  }, [activeOrganizations, trajectoryPage, trajectoryPageSize]);

  const [comparisonSurveyId, setComparisonSurveyId] = useState(cycles[0]?.id ?? 0);
  const [firstOrganizationId, setFirstOrganizationId] = useState(activeOrganizations[0]?.id ?? 0);
  const [secondOrganizationId, setSecondOrganizationId] = useState(
    activeOrganizations[1]?.id ?? activeOrganizations[0]?.id ?? 0,
  );

  const comparisonRows = [firstOrganizationId, secondOrganizationId].map((organizationId) => ({
    organization: organizations.find((item) => item.id === organizationId),
    row: rows.find((item) => item.organization_id === organizationId && item.survey_version_id === comparisonSurveyId),
  }));

  // ── Question analytics state ───────────────────────────────────────────────
  const [questionSurveyId, setQuestionSurveyId] = useState(cycles[0]?.id ?? 0);
  const [exportRows, setExportRows] = useState<ExportRow[]>([]);
  const [loadingExport, setLoadingExport] = useState(false);
  const [selectedQuestionKey, setSelectedQuestionKey] = useState<string>("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [companyDrillSearch, setCompanyDrillSearch] = useState("");
  const [drillPage, setDrillPage] = useState(0);
  const [drillPageSize, setDrillPageSize] = useState(10);

  useEffect(() => {
    if (!supabase || !questionSurveyId) return;
    let isMounted = true;
    setLoadingExport(true);
    supabase
      .from("reporting_export")
      .select("*")
      .eq("survey_version_id", questionSurveyId)
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (!isMounted) return;
        setLoadingExport(false);
        if (error) {
          console.error("Failed to load question analytics", error);
          return;
        }
        const loaded = (data as ExportRow[]) ?? [];
        setExportRows(loaded);
        if (loaded.length > 0 && (!selectedQuestionKey || !loaded.some((r) => r.question_key === selectedQuestionKey))) {
          setSelectedQuestionKey(loaded[0].question_key);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [questionSurveyId]);

  const uniqueQuestions = useMemo(() => {
    const map = new Map<string, { key: string; prompt: string; type: string; category: string; order: number }>();
    for (const r of exportRows) {
      if (!map.has(r.question_key)) {
        map.set(r.question_key, {
          key: r.question_key,
          prompt: r.question_prompt,
          type: r.question_type,
          category: r.category,
          order: r.display_order,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [exportRows]);

  const filteredQuestions = useMemo(() => {
    if (!questionSearch.trim()) return uniqueQuestions;
    const term = questionSearch.toLowerCase();
    return uniqueQuestions.filter(
      (q) =>
        q.key.toLowerCase().includes(term) ||
        q.prompt.toLowerCase().includes(term) ||
        q.category.toLowerCase().includes(term),
    );
  }, [uniqueQuestions, questionSearch]);

  const activeQuestion = useMemo(() => {
    return uniqueQuestions.find((q) => q.key === selectedQuestionKey) ?? uniqueQuestions[0];
  }, [uniqueQuestions, selectedQuestionKey]);

  const questionResponses = useMemo(() => {
    if (!activeQuestion) return [];
    return exportRows.filter((r) => r.question_key === activeQuestion.key);
  }, [exportRows, activeQuestion]);

  const answeredRows = useMemo(() => {
    return questionResponses.filter((r) => {
      const val = valueAsText(r.answer).trim();
      return val !== "" && val !== "null" && val !== "undefined";
    });
  }, [questionResponses]);

  const categoricalDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of answeredRows) {
      const text = valueAsText(r.answer).trim();
      if (text) {
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
    }
    const total = answeredRows.length;
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [answeredRows]);

  const multiChoiceDistribution = useMemo(() => {
    if (activeQuestion?.type !== "multiple_choice") return [];
    const counts = new Map<string, number>();
    for (const r of answeredRows) {
      if (Array.isArray(r.answer)) {
        for (const opt of r.answer) {
          const str = String(opt).trim();
          if (str) {
            counts.set(str, (counts.get(str) ?? 0) + 1);
          }
        }
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        count,
        percent: answeredRows.length > 0 ? Math.round((count / answeredRows.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeQuestion, answeredRows]);

  const numericStats = useMemo(() => {
    if (activeQuestion?.type !== "number") return null;
    const nums = answeredRows
      .map((r) => Number(r.answer))
      .filter((n) => !Number.isNaN(n) && typeof n === "number");
    if (nums.length === 0) return null;
    const sum = nums.reduce((acc, curr) => acc + curr, 0);
    return {
      count: nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: Math.round((sum / nums.length) * 10) / 10,
      total: sum,
    };
  }, [activeQuestion, answeredRows]);

  const drillDownRows = useMemo(() => {
    if (!companyDrillSearch.trim()) return questionResponses;
    const term = companyDrillSearch.toLowerCase();
    return questionResponses.filter(
      (r) =>
        r.company_name.toLowerCase().includes(term) ||
        valueAsText(r.answer).toLowerCase().includes(term),
    );
  }, [questionResponses, companyDrillSearch]);

  const totalDrillPages = Math.max(1, Math.ceil(drillDownRows.length / drillPageSize));
  const pagedDrillDownRows = useMemo(() => {
    return drillDownRows.slice(drillPage * drillPageSize, (drillPage + 1) * drillPageSize);
  }, [drillDownRows, drillPage, drillPageSize]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Programme intelligence"
        title="Analytics & insights"
        description="Monitor cohort progress trends and explore question responses across participating companies."
      />

      {/* Primary Analytics Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("cohort")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === "cohort"
              ? "border-[#d91f17] text-[#d91f17]"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
          }`}
        >
          <TrendingUp size={16} aria-hidden="true" />
          Cohort participation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("questions")}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === "questions"
              ? "border-[#d91f17] text-[#d91f17]"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
          }`}
        >
          <BarChart3 size={16} aria-hidden="true" />
          Question breakdown across companies
        </button>
      </div>

      {activeTab === "cohort" && (
        <>
          {/* Direct comparison */}
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Benchmark</p>
                <h2 className="mt-1 text-base font-bold text-slate-900">Compare two companies</h2>
              </div>
              <select
                value={comparisonSurveyId}
                onChange={(event) => setComparisonSurveyId(Number(event.target.value))}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                aria-label="Comparison survey"
              >
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.year} · {cycle.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {comparisonRows.map((comparison, index) => (
                <article key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <select
                    value={index === 0 ? firstOrganizationId : secondOrganizationId}
                    onChange={(event) =>
                      index === 0
                        ? setFirstOrganizationId(Number(event.target.value))
                        : setSecondOrganizationId(Number(event.target.value))
                    }
                    className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                    aria-label={`Company ${index + 1}`}
                  >
                    {activeOrganizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-5 flex items-end justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Completion</span>
                      <strong className="mt-1 block text-3xl font-extrabold tracking-tight text-slate-900">
                        {comparison.row?.completion_percent ?? 0}%
                      </strong>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold capitalize text-slate-700">
                      {(comparison.row?.status ?? "not_started").replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-slate-200">
                    <i
                      className="block h-full rounded-full bg-slate-700"
                      style={{ width: `${comparison.row?.completion_percent ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-2.5 text-xs text-slate-500">
                    {comparison.row?.answered_questions ?? 0} of {comparison.row?.total_questions ?? 0} questions answered
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Average completion by survey */}
            <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900">Average completion by survey</h3>
              <p className="mt-0.5 text-xs text-slate-500">Overall cohort progress per reporting cycle</p>
              <div className="mt-5 grid gap-4">
                {cycles.map((cycle) => {
                  const cycleRows = rows.filter((row) => row.survey_version_id === cycle.id);
                  const average = cycleRows.length
                    ? Math.round(cycleRows.reduce((sum, row) => sum + row.completion_percent, 0) / cycleRows.length)
                    : 0;
                  return (
                    <div
                      key={cycle.id}
                      className="grid grid-cols-[minmax(7rem,0.9fr)_minmax(0,1.5fr)_3.5rem] items-center gap-3 text-sm"
                    >
                      <span className="truncate font-semibold text-slate-700" title={`${cycle.year} · ${cycle.name}`}>
                        {cycle.year} · {cycle.name}
                      </span>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <i
                          className={`block h-full rounded-full ${average === 100 ? "bg-emerald-600" : "bg-slate-600"}`}
                          style={{ width: `${average}%` }}
                        />
                      </div>
                      <strong className="text-right tabular-nums text-slate-900">{average}%</strong>
                    </div>
                  );
                })}
              </div>
            </article>

            {/* Current status distribution */}
            <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Current status distribution</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Reporting state across the active cohort</p>
                </div>
                <div className="text-right">
                  <strong className="block text-2xl font-extrabold tabular-nums text-slate-900">{currentRows.length}</strong>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Companies</span>
                </div>
              </div>
              <div
                className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${submitted} submitted, ${inProgress} in progress, ${notStarted} not started`}
              >
                <span
                  className="h-full bg-emerald-600"
                  style={{ width: `${currentRows.length ? (submitted / currentRows.length) * 100 : 0}%` }}
                />
                <span
                  className="h-full bg-blue-600"
                  style={{ width: `${currentRows.length ? (inProgress / currentRows.length) * 100 : 0}%` }}
                />
                <span
                  className="h-full bg-slate-300"
                  style={{ width: `${currentRows.length ? (notStarted / currentRows.length) * 100 : 0}%` }}
                />
              </div>
              <dl className="mt-5 grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="py-2.5 sm:py-0 sm:pr-4">
                  <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <i className="size-2 rounded-full bg-emerald-600" />
                    Submitted
                  </dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{submitted}</dd>
                </div>
                <div className="py-2.5 sm:px-4 sm:py-0">
                  <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <i className="size-2 rounded-full bg-blue-600" />
                    In progress
                  </dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{inProgress}</dd>
                </div>
                <div className="py-2.5 sm:py-0 sm:pl-4">
                  <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <i className="size-2 rounded-full bg-slate-300" />
                    Not started
                  </dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{notStarted}</dd>
                </div>
              </dl>
            </article>

            {/* Trajectory */}
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs md:col-span-2 md:p-6">
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Company reporting trajectory</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Completion across survey cycles and member brands</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {activeOrganizations.length} active companies
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {pagedActiveOrganizations.map((organization) => (
                  <article
                    className="grid gap-3 py-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2.2fr)] lg:items-center lg:gap-8"
                    key={organization.id}
                  >
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-bold text-slate-900" title={organization.name}>
                        {organization.name}
                      </strong>
                      <span className="text-xs text-slate-500">{organization.external_reference ?? "Member company"}</span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-x-5 gap-y-2">
                      {cycles.map((cycle) => {
                        const completion =
                          rows.find((row) => row.organization_id === organization.id && row.survey_version_id === cycle.id)
                            ?.completion_percent ?? 0;
                        return (
                          <div key={cycle.id} className="grid gap-1" title={cycle.name}>
                            <div className="flex justify-between gap-2 text-[11px] font-semibold text-slate-500">
                              <span>{cycle.year}</span>
                              <strong className="tabular-nums text-slate-900">{completion}%</strong>
                            </div>
                            <i className="block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                              <b
                                className={`block h-full rounded-full ${completion === 100 ? "bg-emerald-600" : "bg-slate-600"}`}
                                style={{ width: `${completion}%` }}
                              />
                            </i>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
              <DataTablePagination
                page={trajectoryPage}
                totalPages={totalTrajectoryPages}
                totalItems={activeOrganizations.length}
                pageSize={trajectoryPageSize}
                onPageChange={setTrajectoryPage}
                onPageSizeChange={setTrajectoryPageSize}
                itemName="companies"
              />
            </article>
          </section>
        </>
      )}

      {/* Question Breakdown Across Companies (Brief Section 10) */}
      {activeTab === "questions" && (
        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Question List Sidebar */}
          <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Reporting cycle
                <select
                  value={questionSurveyId}
                  onChange={(e) => setQuestionSurveyId(Number(e.target.value))}
                  className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                >
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.year} · {cycle.name}
                    </option>
                  ))}
                </select>
              </label>

              <SearchField
                placeholder="Filter questions…"
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
              />
            </div>

            <div className="border-t border-slate-100 pt-2">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {filteredQuestions.length} questions available
              </p>
              <div className="max-h-[600px] overflow-y-auto space-y-1 pr-1">
                {loadingExport ? (
                  <p className="py-8 text-center text-xs text-slate-500">Loading survey questions…</p>
                ) : filteredQuestions.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">No questions match filter.</p>
                ) : (
                  filteredQuestions.map((q) => {
                    const isSelected = q.key === activeQuestion?.key;
                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => {
                          setSelectedQuestionKey(q.key);
                          setDrillPage(0);
                        }}
                        className={`w-full rounded-lg p-2.5 text-left transition-all ${
                          isSelected
                            ? "border border-slate-900 bg-slate-900 text-white shadow-xs"
                            : "border border-transparent bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-mono text-[11px] font-bold uppercase ${
                              isSelected ? "text-slate-300" : "text-[#d91f17]"
                            }`}
                          >
                            {q.key}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              isSelected ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {q.type.replace("_", " ")}
                          </span>
                        </div>
                        <p
                          className={`mt-1 line-clamp-2 text-xs font-semibold leading-relaxed ${
                            isSelected ? "text-white" : "text-slate-800"
                          }`}
                        >
                          {q.prompt}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* Question Analytics Detail */}
          <div className="space-y-6">
            {activeQuestion ? (
              <>
                {/* Header Card */}
                <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#d91f17]">{activeQuestion.key}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-bold uppercase tracking-wider text-slate-500">
                        {activeQuestion.category}
                      </span>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-bold uppercase tracking-wider text-slate-600 text-[10px]">
                      {activeQuestion.type.replace("_", " ")}
                    </span>
                  </div>

                  <h2 className="mt-3 text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
                    {activeQuestion.prompt}
                  </h2>

                  {/* Summary Bar */}
                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Responses</span>
                      <strong className="mt-0.5 block text-xl font-extrabold text-slate-900">
                        {answeredRows.length}
                      </strong>
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Response rate</span>
                      <strong className="mt-0.5 block text-xl font-extrabold text-slate-900">
                        {questionResponses.length > 0
                          ? Math.round((answeredRows.length / questionResponses.length) * 100)
                          : 0}
                        %
                      </strong>
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total surveyed</span>
                      <strong className="mt-0.5 block text-xl font-extrabold text-slate-900">
                        {questionResponses.length}
                      </strong>
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Unanswered</span>
                      <strong className="mt-0.5 block text-xl font-extrabold text-slate-500">
                        {questionResponses.length - answeredRows.length}
                      </strong>
                    </div>
                  </div>
                </article>

                {/* Aggregated Visualizations */}
                {(activeQuestion.type === "yes_no" || activeQuestion.type === "single_choice") && (
                  <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">Response distribution across companies</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Proportion of companies choosing each response option</p>

                    {categoricalDistribution.length === 0 ? (
                      <p className="mt-6 text-sm text-slate-500">No responses recorded yet for this question.</p>
                    ) : (
                      <div className="mt-6 space-y-4">
                        {categoricalDistribution.map((item) => (
                          <div key={item.value} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <strong className="font-semibold text-slate-800">{item.value}</strong>
                              <span className="tabular-nums text-xs text-slate-500 font-semibold">
                                {item.count} companies ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  item.value.toLowerCase() === "yes"
                                    ? "bg-emerald-600"
                                    : item.value.toLowerCase() === "no"
                                    ? "bg-slate-500"
                                    : "bg-slate-700"
                                }`}
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeQuestion.type === "multiple_choice" && (
                  <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">Selection frequency across companies</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Companies may select more than one option</p>

                    {multiChoiceDistribution.length === 0 ? (
                      <p className="mt-6 text-sm text-slate-500">No selections recorded yet for this question.</p>
                    ) : (
                      <div className="mt-6 space-y-4">
                        {multiChoiceDistribution.map((item) => (
                          <div key={item.value} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <strong className="font-semibold text-slate-800">{item.value}</strong>
                              <span className="tabular-nums text-xs text-slate-500 font-semibold">
                                {item.count} companies ({item.percent}%)
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-slate-700 transition-all duration-300"
                                style={{ width: `${item.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}

                {activeQuestion.type === "number" && numericStats && (
                  <article className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-xs">
                    <h3 className="text-base font-bold text-slate-900">Numeric metrics across reporting cohort</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Statistical aggregate of submitted numeric values</p>
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Average value</span>
                        <strong className="mt-1 block text-2xl font-extrabold text-slate-900 tabular-nums">
                          {numericStats.avg.toLocaleString()}
                        </strong>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Minimum</span>
                        <strong className="mt-1 block text-2xl font-extrabold text-slate-900 tabular-nums">
                          {numericStats.min.toLocaleString()}
                        </strong>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Maximum</span>
                        <strong className="mt-1 block text-2xl font-extrabold text-slate-900 tabular-nums">
                          {numericStats.max.toLocaleString()}
                        </strong>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total reported</span>
                        <strong className="mt-1 block text-2xl font-extrabold text-slate-900 tabular-nums">
                          {numericStats.total.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </article>
                )}

                {/* Company Drill-down Table */}
                <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Company responses</h3>
                      <p className="text-xs text-slate-500">Individual answers submitted by participating companies</p>
                    </div>
                    <SearchField
                      placeholder="Search company or answer…"
                      value={companyDrillSearch}
                      onChange={(e) => {
                        setCompanyDrillSearch(e.target.value);
                        setDrillPage(0);
                      }}
                      className="w-full sm:w-[240px]"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                      <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Company</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Answer</th>
                          <th className="px-5 py-3">Provenance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drillDownRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-sm text-slate-500">
                              No company responses found.
                            </td>
                          </tr>
                        ) : (
                          pagedDrillDownRows.map((r) => {
                            const valText = valueAsText(r.answer);
                            const hasVal = valText && valText !== "null";
                            return (
                              <tr key={r.company_slug} className="transition-colors hover:bg-slate-50">
                                <td className="px-5 py-3.5">
                                  <strong className="block text-sm font-bold text-slate-900">
                                    {r.company_name}
                                  </strong>
                                  <span className="text-xs text-slate-400">{r.company_slug}</span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <StatusBadge status={r.status as any} />
                                </td>
                                <td className="px-5 py-3.5 max-w-md">
                                  {hasVal ? (
                                    <span className="font-semibold text-slate-900 leading-relaxed break-words">
                                      {valText}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Not answered</span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5">
                                  <span className="rounded px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600 bg-slate-100">
                                    {r.provenance.replace("_", " ")}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <DataTablePagination
                    page={drillPage}
                    totalPages={totalDrillPages}
                    totalItems={drillDownRows.length}
                    pageSize={drillPageSize}
                    onPageChange={setDrillPage}
                    onPageSizeChange={setDrillPageSize}
                    itemName="responses"
                  />
                </article>
              </>
            ) : (
              <EmptyState
                icon={HelpCircle}
                title="Select a question"
                description="Choose any question from the sidebar to inspect company response distributions."
              />
            )}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
