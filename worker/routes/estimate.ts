import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, json, readJsonObject, requireMethod, requireSameOrigin } from "../lib/http";
import { calculateCost } from "../services/cost";
import { loadPrice, loadSettings } from "../services/governance";

export async function estimateRoute(request: Request, admin: SupabaseClient): Promise<Response> {
  requireMethod(request, "POST");
  requireSameOrigin(request);
  const body = await readJsonObject(request, 8_000);
  const inputTokens = Number(body.inputTokens);
  const outputTokens = Number(body.outputTokens);
  if (!Number.isInteger(inputTokens) || inputTokens < 0 || inputTokens > 10_000_000
    || !Number.isInteger(outputTokens) || outputTokens < 0 || outputTokens > 1_000_000) {
    throw new ApiError(400, "Token estimates are invalid", "invalid_estimate");
  }
  const settings = await loadSettings(admin);
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : settings.default_model;
  const price = await loadPrice(admin, settings.provider, model);
  return json({
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: calculateCost(inputTokens, outputTokens, price),
    pricingConfigured: Boolean(price),
  });
}
