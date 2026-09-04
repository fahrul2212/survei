export type AiSettingsRow = {
  id: number;
  provider: "openai";
  default_model: string;
  fallback_model: string | null;
  monthly_budget_usd: number;
  company_monthly_budget_usd: number | null;
  max_output_tokens: number;
  benchmark_minimum: number;
  enabled: boolean;
  updated_at: string;
};

export type AiModelPriceRow = {
  provider: "openai";
  model: string;
  input_price_per_million_usd: number;
  output_price_per_million_usd: number;
  effective_from: string;
};

export type AiCredentialRow = {
  provider: "openai";
  encrypted_api_key: string;
  key_suffix: string;
  updated_at: string;
};

export type AiUsageRow = {
  id: string;
  organization_id: number | null;
  survey_version_id: number | null;
  requested_by: string | null;
  request_type: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  status: "pending" | "completed" | "failed" | "blocked";
  scope: Record<string, unknown>;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AiSettingsInput = {
  enabled: boolean;
  defaultModel: string;
  fallbackModel: string | null;
  monthlyBudgetUsd: number;
  companyMonthlyBudgetUsd: number | null;
  maxOutputTokens: number;
  benchmarkMinimum: number;
  inputPricePerMillionUsd: number;
  outputPricePerMillionUsd: number;
  apiKey?: string;
};

export type AiModelOption = {
  id: string;
  pricing: {
    inputPricePerMillionUsd: number;
    outputPricePerMillionUsd: number;
    verifiedAt: string;
  } | null;
};
