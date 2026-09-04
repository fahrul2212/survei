import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AiModelPriceRow } from "../domain/ai";
import { encryptSecret } from "../lib/crypto";
import { ApiError, json, requireMethod, requireSameOrigin } from "../lib/http";
import { databaseError } from "../lib/supabase";
import { loadCredential, loadPrice, loadSettings, parseSettingsInput, resolveProviderKey } from "../services/governance";

async function audit(admin: SupabaseClient, user: User, eventType: string, details: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from("audit_events").insert({
    actor_user_id: user.id,
    event_type: eventType,
    entity_type: "ai_settings",
    entity_id: "1",
    details,
  });
  if (error) throw databaseError(error, "AI settings were saved, but the audit record failed");
}

export async function settingsRoute(request: Request, env: Env, admin: SupabaseClient, user: User): Promise<Response> {
  requireMethod(request, "GET", "PUT");
  if (request.method === "GET") {
    const settings = await loadSettings(admin);
    const [price, credential] = await Promise.all([
      loadPrice(admin, settings.provider, settings.default_model),
      loadCredential(admin, settings.provider),
    ]);
    return json({
      settings: {
        provider: settings.provider,
        defaultModel: settings.default_model,
        fallbackModel: settings.fallback_model,
        monthlyBudgetUsd: Number(settings.monthly_budget_usd),
        companyMonthlyBudgetUsd: settings.company_monthly_budget_usd === null ? null : Number(settings.company_monthly_budget_usd),
        maxOutputTokens: settings.max_output_tokens,
        benchmarkMinimum: settings.benchmark_minimum,
        enabled: settings.enabled,
        updatedAt: settings.updated_at,
      },
      pricing: price ? {
        inputPricePerMillionUsd: Number(price.input_price_per_million_usd),
        outputPricePerMillionUsd: Number(price.output_price_per_million_usd),
        effectiveFrom: price.effective_from,
      } : null,
      credential: {
        configured: Boolean(credential || (env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "optional_server_fallback_key")),
        source: credential ? "dashboard" : env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "optional_server_fallback_key" ? "cloudflare" : "none",
        suffix: credential?.key_suffix ?? null,
        updatedAt: credential?.updated_at ?? null,
      },
    });
  }

  requireSameOrigin(request);
  const input = await parseSettingsInput(request);
  const settingsPayload = {
    id: 1,
    provider: "openai",
    default_model: input.defaultModel,
    fallback_model: input.fallbackModel,
    monthly_budget_usd: input.monthlyBudgetUsd,
    company_monthly_budget_usd: input.companyMonthlyBudgetUsd,
    max_output_tokens: input.maxOutputTokens,
    benchmark_minimum: input.benchmarkMinimum,
    enabled: input.enabled,
    updated_by: user.id,
  };
  const { error: settingsError } = await admin.from("ai_settings").upsert(settingsPayload, { onConflict: "id" });
  if (settingsError) throw databaseError(settingsError, "Unable to save AI settings");

  const pricePayload: AiModelPriceRow & { updated_by: string } = {
    provider: "openai",
    model: input.defaultModel,
    input_price_per_million_usd: input.inputPricePerMillionUsd,
    output_price_per_million_usd: input.outputPricePerMillionUsd,
    effective_from: new Date().toISOString(),
    updated_by: user.id,
  };
  const { error: priceError } = await admin.from("ai_model_prices").upsert(pricePayload, { onConflict: "provider,model" });
  if (priceError) throw databaseError(priceError, "Unable to save AI pricing");

  let keyChanged = false;
  if (input.apiKey) {
    const encrypted = await encryptSecret(input.apiKey, env.AI_SETTINGS_ENCRYPTION_KEY);
    const { error: credentialError } = await admin.from("ai_provider_credentials").upsert({
      provider: "openai",
      encrypted_api_key: encrypted,
      key_suffix: input.apiKey.slice(-4),
      encryption_version: 1,
      updated_by: user.id,
    }, { onConflict: "provider" });
    if (credentialError) throw databaseError(credentialError, "Unable to save the encrypted provider credential");
    keyChanged = true;
  }

  await audit(admin, user, "ai.settings.updated", {
    enabled: input.enabled,
    default_model: input.defaultModel,
    monthly_budget_usd: input.monthlyBudgetUsd,
    company_monthly_budget_usd: input.companyMonthlyBudgetUsd,
    max_output_tokens: input.maxOutputTokens,
    benchmark_minimum: input.benchmarkMinimum,
    provider_key_changed: keyChanged,
  });
  return json({ saved: true });
}

export async function testProviderRoute(request: Request, env: Env, admin: SupabaseClient): Promise<Response> {
  requireMethod(request, "POST");
  requireSameOrigin(request);
  const settings = await loadSettings(admin);
  if (settings.provider !== "openai") throw new ApiError(400, "Unsupported AI provider", "unsupported_provider");
  const apiKey = await resolveProviderKey(admin, env, settings.provider);
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(settings.default_model)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    console.error(JSON.stringify({ message: "AI provider connection test failed", status: response.status }));
    throw new ApiError(502, "The AI provider rejected the configured key or model", "provider_test_failed");
  }
  return json({ connected: true, model: settings.default_model });
}
