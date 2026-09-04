import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bot, CheckCircle2, CircleDollarSign, KeyRound, Save, ShieldCheck, TestTube2, TriangleAlert } from "lucide-react";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../../components/ui";
import { estimateAiCost, getAiSettings, getAiUsage, testAiProvider, updateAiSettings } from "./api";
import type { AiSettingsResponse, AiUsageResponse } from "./types";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const inputClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100";
const labelClass = "grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";

export function AdminAiControl({ setNotice }: { setNotice: (notice: Notice) => void }) {
  const [configuration, setConfiguration] = useState<AiSettingsResponse | null>(null);
  const [usage, setUsage] = useState<AiUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "test" | "estimate" | null>(null);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy("save");
    try {
      const apiKey = String(values.get("apiKey") ?? "").trim();
      await updateAiSettings({
        enabled: values.get("enabled") === "on",
        defaultModel: String(values.get("defaultModel") ?? "").trim(),
        fallbackModel: String(values.get("fallbackModel") ?? "").trim() || null,
        monthlyBudgetUsd: Number(values.get("monthlyBudgetUsd")),
        companyMonthlyBudgetUsd: String(values.get("companyMonthlyBudgetUsd") ?? "").trim()
          ? Number(values.get("companyMonthlyBudgetUsd")) : null,
        maxOutputTokens: Number(values.get("maxOutputTokens")),
        benchmarkMinimum: Number(values.get("benchmarkMinimum")),
        inputPricePerMillionUsd: Number(values.get("inputPricePerMillionUsd")),
        outputPricePerMillionUsd: Number(values.get("outputPricePerMillionUsd")),
        ...(apiKey ? { apiKey } : {}),
      });
      event.currentTarget.reset();
      setNotice({ kind: "success", message: "AI settings and pricing saved securely." });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Unable to save AI settings" });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    try {
      const result = await testAiProvider();
      setNotice({ kind: "success", message: `Connection confirmed for ${result.model}.` });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Connection test failed" });
    } finally {
      setBusy(null);
    }
  }

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

  const { settings, pricing, credential } = configuration;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Governed AI operations"
        title="AI control centre"
        description="Manage the provider, model pricing, budgets, privacy threshold, and usage from one protected administrator workspace."
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
        <form key={settings.updatedAt} onSubmit={save} className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
            <h2 className="text-base font-bold text-slate-900">Provider, limits and privacy</h2>
            <p className="mt-1 text-xs text-slate-500">Changes apply to administrator and company AI requests.</p>
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <label className={`${labelClass} sm:col-span-2`}>
              <span className="flex items-center justify-between gap-3"><span>OpenAI project service-account key</span><span className={`normal-case tracking-normal ${credential.configured ? "text-emerald-700" : "text-amber-700"}`}>{credential.configured ? `Connected${credential.suffix ? ` · ••••${credential.suffix}` : " via Cloudflare"}` : "Not configured"}</span></span>
              <input name="apiKey" type="password" autoComplete="new-password" className={inputClass} placeholder="Leave blank to keep the current key" />
              <span className="normal-case tracking-normal text-slate-400">Use a dedicated, least-privilege production project key. It is encrypted by the Worker and never returned to this page.</span>
            </label>
            <label className={labelClass}>Default model<input name="defaultModel" required defaultValue={settings.defaultModel} className={inputClass} /></label>
            <label className={labelClass}>Fallback model<input name="fallbackModel" defaultValue={settings.fallbackModel ?? ""} className={inputClass} placeholder="Optional" /></label>
            <label className={labelClass}>Monthly budget (USD)<input name="monthlyBudgetUsd" type="number" min="0" max="1000000" step="0.01" required defaultValue={settings.monthlyBudgetUsd} className={inputClass} /></label>
            <label className={labelClass}>Per-company budget (USD)<input name="companyMonthlyBudgetUsd" type="number" min="0" max="1000000" step="0.01" defaultValue={settings.companyMonthlyBudgetUsd ?? ""} className={inputClass} placeholder="No separate limit" /></label>
            <label className={labelClass}>Maximum output tokens<input name="maxOutputTokens" type="number" min="128" max="32768" required defaultValue={settings.maxOutputTokens} className={inputClass} /></label>
            <label className={labelClass}>Benchmark minimum<input name="benchmarkMinimum" type="number" min="5" max="100" required defaultValue={settings.benchmarkMinimum} className={inputClass} /></label>
            <label className={labelClass}>Input price / 1M tokens<input name="inputPricePerMillionUsd" type="number" min="0" max="100000" step="0.000001" required defaultValue={pricing?.inputPricePerMillionUsd ?? 0} className={inputClass} /></label>
            <label className={labelClass}>Output price / 1M tokens<input name="outputPricePerMillionUsd" type="number" min="0" max="100000" step="0.000001" required defaultValue={pricing?.outputPricePerMillionUsd ?? 0} className={inputClass} /></label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <input name="enabled" type="checkbox" defaultChecked={settings.enabled} className="mt-0.5 size-4 accent-[#d91f17]" />
              <span><strong className="block text-sm text-slate-900">Enable AI features</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Requests remain blocked until a provider key and model pricing are configured.</span></span>
            </label>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button type="button" variant="secondary" icon={TestTube2} disabled={busy !== null || !credential.configured} onClick={() => void testConnection()}>{busy === "test" ? "Testing…" : "Test connection"}</Button>
            <Button type="submit" variant="primary" icon={Save} disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save AI settings"}</Button>
          </div>
        </form>

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
