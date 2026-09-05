import { api } from "../../lib/api-client";
export { api } from "../../lib/api-client";
import type {
  AiModelsResponse,
  AiSettingsResponse,
  AiSettingsUpdate,
  AiUsageResponse,
  SurveyAiResult,
  ComparisonChart,
} from "./types";

export function getAiSettings(): Promise<AiSettingsResponse> {
  return api("/api/ai/settings");
}

export function updateAiSettings(settings: AiSettingsUpdate): Promise<{ saved: true }> {
  return api("/api/ai/settings", { method: "PUT", body: JSON.stringify(settings) });
}

export function testAiProvider(): Promise<{ connected: true; model: string }> {
  return api("/api/ai/settings/test", { method: "POST", body: "{}" });
}

export function getAiModels(apiKey?: string): Promise<AiModelsResponse> {
  return api("/api/ai/models", {
    method: "POST",
    body: JSON.stringify(apiKey ? { apiKey } : {}),
  });
}

export function getAiUsage(): Promise<AiUsageResponse> {
  return api("/api/ai/usage");
}

export function estimateAiCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): Promise<{
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

export function exploreSurveyData(input: {
  question: string;
  years?: number[];
  organizationIds?: number[];
  questionKeys?: string[];
  categories?: string[];
}): Promise<SurveyAiResult> {
  return api("/api/ai/explore", { method: "POST", body: JSON.stringify(input) });
}

export function compareSurveyData(input: {
  years?: number[];
  organizationIds?: number[];
  questionKeys?: string[];
}) {
  return api<{ charts: ComparisonChart[]; threshold: number }>("/api/analysis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
