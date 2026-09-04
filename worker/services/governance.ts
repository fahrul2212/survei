import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCredentialRow, AiModelPriceRow, AiSettingsInput, AiSettingsRow } from "../domain/ai";
import { decryptSecret } from "../lib/crypto";
import { ApiError, readJsonObject } from "../lib/http";
import { databaseError } from "../lib/supabase";

const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,99}$/;

function finiteNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    throw new ApiError(400, `${field} is outside the allowed range`, "invalid_settings");
  }
  return numeric;
}

function nullableBudget(value: unknown): number | null {
  if (value === null || value === "") return null;
  return finiteNumber(value, "Company monthly budget", 0, 1_000_000);
}

function modelName(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !MODEL_PATTERN.test(value.trim())) {
    throw new ApiError(400, `${field} is invalid`, "invalid_settings");
  }
  return value.trim();
}

export function optionalProviderKey(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length < 20 || value.length > 512 || /\s/.test(value)) {
    throw new ApiError(400, "API key format is invalid", "invalid_api_key");
  }
  return value;
}

export async function parseSettingsInput(request: Request): Promise<AiSettingsInput> {
  const body = await readJsonObject(request);
  if (typeof body.enabled !== "boolean") throw new ApiError(400, "Enabled must be true or false", "invalid_settings");
  const apiKey = optionalProviderKey(body.apiKey);
  const inputPricePerMillionUsd = finiteNumber(body.inputPricePerMillionUsd, "Input price", 0, 100_000);
  const outputPricePerMillionUsd = finiteNumber(body.outputPricePerMillionUsd, "Output price", 0, 100_000);
  if (body.enabled && inputPricePerMillionUsd === 0 && outputPricePerMillionUsd === 0) {
    throw new ApiError(400, "Set current model pricing before enabling AI", "pricing_required");
  }
  return {
    enabled: body.enabled,
    defaultModel: modelName(body.defaultModel, "Default model")!,
    fallbackModel: modelName(body.fallbackModel, "Fallback model", true),
    monthlyBudgetUsd: finiteNumber(body.monthlyBudgetUsd, "Monthly budget", 0, 1_000_000),
    companyMonthlyBudgetUsd: nullableBudget(body.companyMonthlyBudgetUsd),
    maxOutputTokens: Math.round(finiteNumber(body.maxOutputTokens, "Maximum output tokens", 128, 32_768)),
    benchmarkMinimum: Math.round(finiteNumber(body.benchmarkMinimum, "Benchmark minimum", 5, 100)),
    inputPricePerMillionUsd,
    outputPricePerMillionUsd,
    apiKey,
  };
}

export async function loadSettings(admin: SupabaseClient): Promise<AiSettingsRow> {
  const { data, error } = await admin.from("ai_settings").select("*").eq("id", 1).single();
  if (error || !data) throw databaseError(error, "Unable to load AI settings");
  return data as AiSettingsRow;
}

export async function loadPrice(admin: SupabaseClient, provider: string, model: string): Promise<AiModelPriceRow | null> {
  const { data, error } = await admin.from("ai_model_prices").select("*")
    .eq("provider", provider).eq("model", model).maybeSingle();
  if (error) throw databaseError(error, "Unable to load AI pricing");
  return data as AiModelPriceRow | null;
}

export async function loadCredential(admin: SupabaseClient, provider: string): Promise<AiCredentialRow | null> {
  const { data, error } = await admin.from("ai_provider_credentials").select("*").eq("provider", provider).maybeSingle();
  if (error) throw databaseError(error, "Unable to load AI credential status");
  return data as AiCredentialRow | null;
}

export async function resolveProviderKey(admin: SupabaseClient, env: Env, provider: string): Promise<string> {
  const credential = await loadCredential(admin, provider);
  if (credential) return decryptSecret(credential.encrypted_api_key, env.AI_SETTINGS_ENCRYPTION_KEY);
  if (provider === "openai" && env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "optional_server_fallback_key") {
    return env.OPENAI_API_KEY;
  }
  throw new ApiError(503, "No AI provider key is configured", "provider_key_missing");
}

export function monthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function recentSpend(admin: SupabaseClient, organizationId?: number): Promise<number> {
  let query = admin.from("ai_usage_events").select("actual_cost_usd,estimated_cost_usd,status").gte("created_at", monthStart());
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.limit(5000);
  if (error) throw databaseError(error, "Unable to validate the AI budget");
  return (data ?? []).filter((row) => row.status === "completed" || row.status === "pending" || row.actual_cost_usd !== null)
    .reduce((sum, row) => sum + Number(row.actual_cost_usd ?? row.estimated_cost_usd ?? 0), 0);
}

export async function enforceAiRateLimit(admin: SupabaseClient, userId: string): Promise<void> {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await admin.from("ai_usage_events").select("id", { count: "exact", head: true })
    .eq("requested_by", userId).gte("created_at", oneMinuteAgo);
  if (error) throw databaseError(error, "Unable to validate the AI request limit");
  if ((count ?? 0) >= 10) throw new ApiError(429, "Too many AI requests. Please wait one minute.", "rate_limit_exceeded");
}
