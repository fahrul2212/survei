import { useCallback, useEffect, useState } from "react";
import { BellRing, Bot, CheckCircle2, MailCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type AiSummary, type Organization, type ReminderPolicy, type SurveyVersion } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

type Delivery = { id: number; status: string; recipient_email: string; error_message: string | null; sent_at: string | null; created_at: string };

export function AdminOperations({ versions, organizations, setNotice }: {
  versions: SurveyVersion[];
  organizations: Organization[];
  setNotice: (notice: Notice) => void;
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

  return <PageContainer>
    <PageHeader eyebrow="Reporting operations" title="Reminders and AI drafts" description="Control deadline emails and review AI-generated climate plan summaries from one operational workspace." />
    <section className="grid gap-5 md:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-5"><BellRing size={19} className="text-[#d91f17]" /><strong className="mt-4 block text-3xl text-slate-900">{policies.filter((item) => item.enabled).length}</strong><span className="text-sm text-slate-500">Active reminder schedules</span></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><MailCheck size={19} className="text-emerald-600" /><strong className="mt-4 block text-3xl text-slate-900">{sentCount}</strong><span className="text-sm text-slate-500">Recent emails delivered</span></article>
      <article className="rounded-xl border border-slate-200 bg-white p-5"><Bot size={19} className="text-blue-600" /><strong className="mt-4 block text-3xl text-slate-900">{summaries.filter((item) => item.status === "completed").length}</strong><span className="text-sm text-slate-500">Completed AI drafts</span></article>
    </section>

    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4 md:px-6"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Automated email</p><h2 className="mt-1 text-lg font-bold text-slate-900">Deadline reminder schedules</h2></div>
      {activeSurveys.length === 0 ? <EmptyState icon={BellRing} title="No published surveys" description="Publish a survey before configuring its reminder schedule." /> : <div className="divide-y divide-slate-100">{activeSurveys.map((survey) => {
        const policy = policies.find((item) => item.survey_version_id === survey.id);
        return <form key={`${survey.id}-${policy?.updated_at ?? "new"}`} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_18rem_auto] lg:items-end md:px-6" onSubmit={(event) => { event.preventDefault(); const values = String(new FormData(event.currentTarget).get("days") ?? "").split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 365); void savePolicy(survey, true, values.length ? Array.from(new Set(values)) : [14, 7, 3, 1]); }}>
          <div><strong className="text-sm text-slate-900">{survey.reporting_year} · {survey.name}</strong><span className="mt-1 block text-xs text-slate-500">{survey.closes_at ? `Deadline ${new Date(survey.closes_at).toLocaleDateString("en-GB")}` : "Set a survey deadline before emails can be sent"}</span></div>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Days before deadline<input name="days" defaultValue={(policy?.days_before_due ?? [14, 7, 3, 1]).join(", ")} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" aria-label={`Reminder days for ${survey.name}`} /></label>
          <div className="flex gap-2"><Button size="small" type="submit" disabled={!survey.closes_at || busyId === survey.id}>{policy?.enabled ? "Save schedule" : "Enable"}</Button>{policy?.enabled && <Button size="small" type="button" variant="secondary" disabled={busyId === survey.id} onClick={() => void savePolicy(survey, false, policy.days_before_due)}>Pause</Button>}</div>
        </form>;
      })}</div>}
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-slate-900">Recent email delivery</h2><p className="mt-1 text-xs text-slate-500">{failedCount ? `${failedCount} recent delivery failures need attention` : "Latest automated delivery attempts"}</p></div>{deliveries.length === 0 ? <EmptyState icon={MailCheck} title="No reminders sent yet" description="Delivery records appear after a configured deadline reminder runs." /> : <div className="divide-y divide-slate-100">{deliveries.slice(0, 8).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-4"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{item.recipient_email}</strong><span className="text-xs text-slate-500">{formatDateTime(item.sent_at ?? item.created_at)}</span>{item.error_message && <p className="mt-1 text-xs text-red-700">{item.error_message}</p>}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.status === "sent" ? "bg-emerald-50 text-emerald-700" : item.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.status}</span></div>)}</div>}</section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold text-slate-900">AI summary register</h2><p className="mt-1 text-xs text-slate-500">Drafts are traceable to a submitted snapshot and model version</p></div>{summaries.length === 0 ? <EmptyState icon={Bot} title="No AI drafts yet" description="Company contributors can generate a summary after submitting a report." /> : <div className="divide-y divide-slate-100">{summaries.slice(0, 8).map((item) => { const organization = organizations.find((org) => org.id === item.organization_id); return <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-4"><div><strong className="text-sm text-slate-900">{organization?.name ?? `Company ${item.organization_id}`}</strong><span className="mt-1 block text-xs text-slate-500">{item.model} · {formatDateTime(item.created_at)}</span>{item.error_message && <p className="mt-1 text-xs text-red-700">{item.error_message}</p>}</div>{item.status === "completed" ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <span className="text-xs font-bold uppercase text-slate-500">{item.status}</span>}</div>; })}</div>}</section>
    </div>
  </PageContainer>;
}
