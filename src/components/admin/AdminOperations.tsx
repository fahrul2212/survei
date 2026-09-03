import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, FileText, MailCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type AiSummary, type Organization, type ReminderPolicy, type SurveyVersion } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

type Delivery = { id: number; status: string; recipient_email: string; error_message: string | null; sent_at: string | null; created_at: string };

export function AdminOperations({ versions, organizations, setNotice, onOpenSummary }: {
  versions: SurveyVersion[];
  organizations: Organization[];
  setNotice: (notice: Notice) => void;
  onOpenSummary?: (submissionId: number, organizationName: string, surveyName: string) => void;
}) {
  const [policies, setPolicies] = useState<ReminderPolicy[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [summaries, setSummaries] = useState<AiSummary[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [policyResult, deliveryResult, summaryResult] = await Promise.all([
      supabase.from("reminder_policies").select("*").order("updated_at", { ascending: false }),
      supabase.from("reminder_deliveries").select("id,status,recipient_email,error_message,sent_at,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("ai_summaries").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    const error = policyResult.error ?? deliveryResult.error ?? summaryResult.error;
    if (error) setNotice({ kind: "error", message: error.message });
    else {
      setPolicies((policyResult.data ?? []) as ReminderPolicy[]);
      setDeliveries((deliveryResult.data ?? []) as Delivery[]);
      setSummaries((summaryResult.data ?? []) as AiSummary[]);
    }
  }, [setNotice]);
  useEffect(() => { void load(); }, [load]);

  async function savePolicy(survey: SurveyVersion, enabled: boolean, days: number[]) {
    if (!supabase) return;
    setBusyId(survey.id);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const existing = policies.find((item) => item.survey_version_id === survey.id);
    const payload = { survey_version_id: survey.id, enabled, days_before_due: days, include_not_started: true, include_in_progress: true, created_by: existing?.created_by ?? userId };
    const { error } = await supabase.from("reminder_policies").upsert(payload, { onConflict: "survey_version_id" });
    if (error) setNotice({ kind: "error", message: error.message });
    else { setNotice({ kind: "success", message: `Reminder schedule ${enabled ? "enabled" : "paused"} for ${survey.name}.` }); await load(); }
    setBusyId(null);
  }

  const activeSurveys = versions.filter((item) => item.status === "published");
  const sentCount = deliveries.filter((item) => item.status === "sent").length;
  const failedCount = deliveries.filter((item) => item.status === "failed").length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Reporting operations"
        title="Reminders & summaries"
        description="Configure automated deadline notices and review executive summaries across reporting cycles."
      />

      {/* KPI Metric Cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Reminder schedules</span>
            <BellRing size={18} className="text-[#d91f17]" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <strong className="text-3xl font-extrabold tracking-tight text-slate-900">
              {policies.filter((item) => item.enabled).length}
            </strong>
            <span className="text-xs font-semibold text-slate-500">active policies</span>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Delivered notices</span>
            <MailCheck size={18} className="text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <strong className="text-3xl font-extrabold tracking-tight text-slate-900">{sentCount}</strong>
            <span className="text-xs font-semibold text-slate-500">sent successfully</span>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Executive summaries</span>
            <FileText size={18} className="text-slate-600" aria-hidden="true" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <strong className="text-3xl font-extrabold tracking-tight text-slate-900">
              {summaries.filter((item) => item.status === "completed").length}
            </strong>
            <span className="text-xs font-semibold text-slate-500">ready for review</span>
          </div>
        </article>
      </section>

      {/* Deadline reminder schedules */}
      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4 md:px-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Automated notification</p>
          <h2 className="mt-0.5 text-base font-bold text-slate-900">Deadline reminder schedules</h2>
        </div>
        {activeSurveys.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="No published surveys"
            description="Publish a survey before configuring its automated reminder schedule."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {activeSurveys.map((survey) => {
              const policy = policies.find((item) => item.survey_version_id === survey.id);
              return (
                <form
                  key={`${survey.id}-${policy?.updated_at ?? "new"}`}
                  className="grid gap-4 p-5 md:px-6 lg:grid-cols-[minmax(0,1.2fr)_18rem_auto] lg:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = String(new FormData(event.currentTarget).get("days") ?? "")
                      .split(",")
                      .map(Number)
                      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 365);
                    void savePolicy(survey, true, values.length ? Array.from(new Set(values)) : [14, 7, 3, 1]);
                  }}
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-bold text-slate-900">
                      {survey.reporting_year} · {survey.name}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {survey.closes_at
                        ? `Deadline: ${new Date(survey.closes_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
                        : "Set a survey deadline before reminders can be dispatched"}
                    </span>
                  </div>

                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Days before deadline
                    <input
                      name="days"
                      defaultValue={(policy?.days_before_due ?? [14, 7, 3, 1]).join(", ")}
                      placeholder="e.g. 14, 7, 3, 1"
                      className="min-h-10 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                      aria-label={`Reminder days for ${survey.name}`}
                    />
                  </label>

                  <div className="flex items-center gap-2">
                    <Button
                      size="small"
                      type="submit"
                      disabled={!survey.closes_at || busyId === survey.id}
                      variant={policy?.enabled ? "secondary" : "primary"}
                    >
                      {policy?.enabled ? "Update schedule" : "Enable"}
                    </Button>
                    {policy?.enabled && (
                      <Button
                        size="small"
                        type="button"
                        variant="ghost"
                        disabled={busyId === survey.id}
                        onClick={() => void savePolicy(survey, false, policy.days_before_due)}
                        className="text-slate-600 hover:text-slate-900"
                      >
                        Pause
                      </Button>
                    )}
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>

      {/* Registers */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Recent email delivery</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {failedCount ? `${failedCount} delivery failures need attention` : "Latest automated delivery attempts"}
            </p>
          </div>
          {deliveries.length === 0 ? (
            <EmptyState
              icon={MailCheck}
              title="No reminders sent yet"
              description="Delivery records will appear here after a configured deadline schedule executes."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {deliveries.slice(0, 8).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-slate-900">{item.recipient_email}</strong>
                    <span className="text-xs text-slate-500">{formatDateTime(item.sent_at ?? item.created_at)}</span>
                    {item.error_message && <p className="mt-1 text-xs text-red-700">{item.error_message}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      item.status === "sent"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : item.status === "failed"
                        ? "border border-red-200 bg-red-50 text-red-700"
                        : "border border-slate-200 bg-slate-100 text-slate-600"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Executive summary register</h2>
            <p className="mt-0.5 text-xs text-slate-500">Traceable drafts tied to submitted reporting snapshots</p>
          </div>
          {summaries.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No summaries generated yet"
              description="Summaries become available once company contributors submit their annual reports."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {summaries.slice(0, 8).map((item) => {
                const organization = organizations.find((org) => org.id === item.organization_id);
                const orgName = organization?.name ?? `Company ${item.organization_id}`;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="truncate text-sm font-semibold text-slate-900">{orgName}</strong>
                        {item.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            <CheckCircle2 size={11} /> Ready
                          </span>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            {item.status}
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.model} · {formatDateTime(item.created_at)}
                      </span>
                      {item.error_message && <p className="mt-1 text-xs text-red-700">{item.error_message}</p>}
                    </div>
                    {onOpenSummary && (
                      <Button
                        size="small"
                        variant="secondary"
                        icon={FileText}
                        onClick={() => onOpenSummary(item.submission_id, orgName, `Submission ${item.submission_id}`)}
                        className="text-xs font-semibold"
                      >
                        View draft
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
