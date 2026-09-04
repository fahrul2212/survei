import { supabase } from "../../lib/supabase";
import type { AiSettingsResponse, AiSettingsUpdate, AiUsageResponse } from "./types";

type ApiErrorBody = { error?: string };

async function token(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session has expired. Please sign in again.");
  return data.session.access_token;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await token();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? (body as ApiErrorBody).error
      : null;
    throw new Error(message || "The AI service could not complete this request.");
  }
  return body as T;
}

export function getAiSettings(): Promise<AiSettingsResponse> {
  return api("/api/ai/settings");
}

export function updateAiSettings(settings: AiSettingsUpdate): Promise<{ saved: true }> {
  return api("/api/ai/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export function testAiProvider(): Promise<{ connected: true; model: string }> {
  return api("/api/ai/settings/test", { method: "POST", body: "{}" });
}

export function getAiUsage(): Promise<AiUsageResponse> {
  return api("/api/ai/usage");
}

export function estimateAiCost(inputTokens: number, outputTokens: number, model: string): Promise<{
  estimatedCostUsd: number | null;
  pricingConfigured: boolean;
}> {
  return api("/api/ai/estimate", {
    method: "POST",
    body: JSON.stringify({ inputTokens, outputTokens, model }),
  });
}

export function generateAiSummary(submissionId: number): Promise<unknown> {
  return api("/api/ai/summary", { method: "POST", body: JSON.stringify({ submissionId }) });
}
