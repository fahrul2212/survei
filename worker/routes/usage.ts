import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageRow } from "../domain/ai";
import { json, requireMethod } from "../lib/http";
import { databaseError } from "../lib/supabase";
import { loadSettings, monthStart } from "../services/governance";

export async function usageRoute(request: Request, admin: SupabaseClient): Promise<Response> {
  requireMethod(request, "GET");
  const [settings, usageResult] = await Promise.all([
    loadSettings(admin),
    admin.from("ai_usage_events").select("*").gte("created_at", monthStart()).order("created_at", { ascending: false }).limit(5000),
  ]);
  if (usageResult.error) throw databaseError(usageResult.error, "Unable to load AI usage");
  const rows = (usageResult.data ?? []) as AiUsageRow[];
  const completed = rows.filter((row) => row.status === "completed");
  const billable = rows.filter((row) => row.actual_cost_usd !== null || row.status === "completed");
  const actualCost = billable.reduce((sum, row) => sum + Number(row.actual_cost_usd ?? row.estimated_cost_usd ?? 0), 0);
  const inputTokens = billable.reduce((sum, row) => sum + Number(row.input_tokens ?? 0), 0);
  const outputTokens = billable.reduce((sum, row) => sum + Number(row.output_tokens ?? 0), 0);
  const now = new Date();
  const elapsedDays = Math.max(1, now.getUTCDate());
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const byModel = new Map<string, { requests: number; costUsd: number }>();
  for (const row of billable) {
    const current = byModel.get(row.model) ?? { requests: 0, costUsd: 0 };
    current.requests += 1;
    current.costUsd += Number(row.actual_cost_usd ?? row.estimated_cost_usd ?? 0);
    byModel.set(row.model, current);
  }
  return json({
    periodStart: monthStart(),
    totals: {
      requests: rows.length,
      completed: completed.length,
      failed: rows.filter((row) => row.status === "failed").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      inputTokens,
      outputTokens,
      actualCostUsd: Number(actualCost.toFixed(6)),
      projectedCostUsd: Number(((actualCost / elapsedDays) * daysInMonth).toFixed(6)),
      budgetUsd: Number(settings.monthly_budget_usd),
      budgetRemainingUsd: Number(Math.max(0, Number(settings.monthly_budget_usd) - actualCost).toFixed(6)),
    },
    byModel: Array.from(byModel, ([model, value]) => ({ model, requests: value.requests, costUsd: Number(value.costUsd.toFixed(6)) })),
    recent: rows.slice(0, 20).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      requestType: row.request_type,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.actual_cost_usd ?? row.estimated_cost_usd,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
}
