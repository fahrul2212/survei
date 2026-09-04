import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, CheckCircle2, CircleDollarSign, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../../components/ui";
import { estimateAiCost, getAiSettings, getAiUsage } from "./api";
import { AiSetupForm } from "./AiSetupForm";
import type { AiSettingsResponse, AiUsageResponse } from "./types";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const labelClass = "grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";
const inputClass = "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#d91f17] focus:ring-2 focus:ring-red-100";

export function AdminAiControl({ setNotice }: { setNotice: (notice: Notice) => void }) {
  const [configuration, setConfiguration] = useState<AiSettingsResponse | null>(null);
  const [usage, setUsage] = useState<AiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"estimate" | null>(null);
  const [estimate, setEstimate] = useState<number | null | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResult, usageResult] = await Promise.all([getAiSettings(), getAiUsage()]);
      setConfiguration(settingsResult);
      setUsage(usageResult);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to load AI controls" });
    } finally {
      setLoading(false);
    }
  }, [setNotice]);

  useEffect(() => { void load(); }, [load]);

  const budgetPercent = useMemo(() => {
    if (!usage || usage.totals.budgetUsd <= 0) return 0;
    return Math.min(100, Math.round((usage.totals.actualCostUsd / usage.totals.budgetUsd) * 100));
  }, [usage]);

  async function calculateEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configuration) return;
    const values = new FormData(event.currentTarget);
    setBusy("estimate");
    try {
      const result = await estimateAiCost(Number(values.get("inputTokens")), Number(values.get("outputTokens")), configuration.settings.defaultModel);
      setEstimate(result.estimatedCostUsd);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to estimate AI cost" });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <PageContainer><p className="py-16 text-center text-sm text-slate-500">Loading AI controls…</p></PageContainer>;
  if (!configuration || !usage) return <PageContainer><EmptyState icon={Bot} title="AI controls unavailable" description="The Cloudflare AI API could not be reached. Check the Worker and Supabase secret configuration." /></PageContainer>;

  const { settings } = configuration;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Governed AI operations"
        title="AI control centre"
        description="Connect OpenAI, choose an available model, and monitor governed usage from one protected administrator workspace."
        actions={<span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${settings.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}><span className={`size-2 rounded-full ${settings.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />{settings.enabled ? "AI enabled" : "AI disabled"}</span>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Month-to-date", money(usage.totals.actualCostUsd), CircleDollarSign, "Recorded provider cost"],
          ["Budget remaining", money(usage.totals.budgetRemainingUsd), ShieldCheck, `${budgetPercent}% used`],
          ["Projected month", money(usage.totals.projectedCostUsd), Activity, "Based on usage to date"],
          ["AI requests", String(usage.totals.requests), Bot, `${usage.totals.failed} failed · ${usage.totals.blocked} blocked`],
        ].map(([label, value, Icon, help]) => (
          <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 text-slate-500"><span className="text-xs font-bold uppercase tracking-wider">{label as string}</span><Icon size={18} className="text-[#d91f17]" /></div>
            <strong className="mt-3 block text-2xl font-extrabold tabular-nums text-slate-900">{value as string}</strong>
            <span className="mt-1 block text-xs text-slate-500">{help as string}</span>
          </article>
        ))}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <AiSetupForm key={settings.updatedAt} configuration={configuration} onSaved={load} setNotice={setNotice} />

        <div className="grid content-start gap-6">
          <form onSubmit={calculateEstimate} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900">Cost estimator</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Estimate a request using the saved price for {settings.defaultModel}.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <label className={labelClass}>Estimated input<input name="inputTokens" type="number" min="0" max="10000000" defaultValue="10000" className={inputClass} /></label>
              <label className={labelClass}>Maximum output<input name="outputTokens" type="number" min="0" max="1000000" defaultValue={settings.maxOutputTokens} className={inputClass} /></label>
            </div>
            <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-100 pt-5">
              <div><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated maximum</span><strong className="mt-1 block text-xl text-slate-900">{estimate === undefined ? "—" : estimate === null ? "Pricing unavailable" : money(estimate)}</strong></div>
              <Button type="submit" size="small" disabled={busy !== null}>{busy === "estimate" ? "Calculating…" : "Estimate"}</Button>
            </div>
          </form>

          <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3"><KeyRound size={18} className="mt-0.5 shrink-0 text-[#d91f17]" /><div><h2 className="text-sm font-bold text-slate-900">Security and data boundary</h2><p className="mt-1 text-xs leading-5 text-slate-500">Cloudflare verifies the signed-in user, role and budget before protected data is accessed. OpenAI API data is not used for training by default, but standard abuse-monitoring retention may be up to 30 days. Confirm the client DPA and retention setting before enabling AI.</p></div></div>
          </article>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"><h2 className="text-base font-bold text-slate-900">Recent AI activity</h2><p className="mt-1 text-xs text-slate-500">Provider usage and cost records for the current month.</p></div>
        {usage.recent.length === 0 ? <EmptyState icon={Activity} title="No AI usage this month" description="Completed, failed and budget-blocked requests will appear here." /> : (
          <div className="divide-y divide-slate-100">
            {usage.recent.map((item) => (
              <div key={item.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem] sm:items-center sm:px-6">
                <div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{item.requestType.replaceAll("_", " ")}</strong><span className="text-xs text-slate-500">{dateTime(item.createdAt)} · {item.model}</span></div>
                <span className="text-xs tabular-nums text-slate-600">{(item.inputTokens ?? 0).toLocaleString()} in / {(item.outputTokens ?? 0).toLocaleString()} out</span>
                <strong className="text-sm tabular-nums text-slate-900">{item.costUsd === null ? "—" : money(item.costUsd)}</strong>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : item.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{item.status === "completed" ? <CheckCircle2 size={12} /> : <TriangleAlert size={12} />}{item.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
