export type AiControlSettings = {
  provider: "openai";
  defaultModel: string;
  fallbackModel: string | null;
  monthlyBudgetUsd: number;
  companyMonthlyBudgetUsd: number | null;
  maxOutputTokens: number;
  benchmarkMinimum: number;
  enabled: boolean;
  updatedAt: string;
};

export type AiPricing = {
  inputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
  effectiveFrom: string;
};

export type AiCredentialStatus = {
  configured: boolean;
  source: "dashboard" | "cloudflare" | "none";
  suffix: string | null;
  updatedAt: string | null;
};

export type AiSettingsResponse = {
  settings: AiControlSettings;
  pricing: AiPricing | null;
  credential: AiCredentialStatus;
};

export type AiUsageResponse = {
  periodStart: string;
  totals: {
    requests: number;
    completed: number;
    failed: number;
    blocked: number;
    inputTokens: number;
    outputTokens: number;
    actualCostUsd: number;
    projectedCostUsd: number;
    budgetUsd: number;
    budgetRemainingUsd: number;
  };
  byModel: Array<{ model: string; requests: number; costUsd: number }>;
  recent: Array<{
    id: string;
    organizationId: number | null;
    requestType: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    status: "pending" | "completed" | "failed" | "blocked";
    createdAt: string;
  }>;
};

export type AiSettingsUpdate = Omit<AiControlSettings, "provider" | "updatedAt"> & {
  inputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
  apiKey?: string;
};
