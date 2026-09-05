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

export type AiModelOption = {
  id: string;
  pricing:
    | (Pick<AiPricing, "inputPricePerMillionUsd" | "outputPricePerMillionUsd"> & {
        verifiedAt: string;
      })
    | null;
};

export type AiModelsResponse = {
  models: AiModelOption[];
  recommendedModel: string | null;
};

export type SurveyAiResult = {
  evidence: SurveyEvidence[];
  charts: ComparisonChart[];
  content: {
    answer: string;
    key_findings: string[];
    comparisons: string[];
    caveats: string[];
    sources: Array<{ question_key: string; reporting_year: number; scope: string }>;
  };
  usage: { input: number; output: number; total: number; costUsd: number | null };
  scope: {
    years: number[];
    organization_count: number;
    question_keys: string[];
    categories: string[];
    evidence_rows: number;
  };
};

export type SurveyEvidence = {
  scope: string;
  reporting_year: number;
  survey_name: string;
  survey_version_id: number;
  question_key: string;
  category: string;
  prompt: string;
  field?: string;
  organization?: string;
  answer?: unknown;
  aggregate?: {
    responses: number;
    average?: number;
    median?: number;
    distribution?: Record<string, number>;
  };
};
export type ComparisonChart = SurveyEvidence & {
  comparison_key?: string;
  unit?: string;
  aggregate: NonNullable<SurveyEvidence["aggregate"]>;
  companies: Array<{ name: string; value: unknown }>;
};
