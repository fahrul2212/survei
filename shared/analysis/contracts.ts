export type Dataset = "production" | "synthetic";
export type Operation = "difference" | "percent_change" | "distribution";
export type DecisionStatus = "comparable" | "adjusted" | "needs_review" | "not_comparable";
export type Metric = {
  id: string;
  code: string;
  name: string;
  kind: "number" | "single_choice" | "multiple_choice";
  unit: string;
  population: string;
  scope: string;
  period: string;
  method: string;
  operations: Operation[];
  options: string[];
};
export type SourceQuestion = {
  id: number;
  revisionId: number;
  key: string;
  prompt: string;
  type: string;
  options: string[];
  validation: Record<string, unknown>;
  visibility: Record<string, unknown>;
  applicable: boolean | null;
  value: unknown;
};
export type SourcePack = {
  benchmarkEligible?: boolean;
  id: string;
  organizationId: number;
  organization: string;
  submissionId: number;
  surveyId: number;
  surveyName: string;
  year: number;
  dataset: Dataset | "unverified";
  capturedAt: string;
  origin: string;
  questions: SourceQuestion[];
};
export type Binding = {
  id: string;
  releaseId: string;
  metric: Metric;
  questionId: number;
  revisionId: number;
  field: string;
  signature: string;
  dataset: Dataset;
  relation: "identity" | "equivalent" | "convertible" | "partial" | "incompatible";
  transform: {
    kind: "identity" | "scale_decimal" | "map_category";
    factor?: string;
    categories?: Record<string, string>;
  };
};
export type Decision = {
  id: string;
  metricCode: string;
  status: DecisionStatus;
  reasons: string[];
  operations: Operation[];
  ruleIds: string[];
};
export type Evidence = {
  id: string;
  surveyId: number;
  surveyName: string;
  year: number;
  questionId: number;
  revisionId: number;
  questionKey: string;
  prompt: string;
  field: string;
  scope: "own_answer" | "company_answer" | "anonymous_group" | "selected_group";
  organization?: string;
  value?: unknown;
  method?: string;
  responses?: number;
};
export type Fact = {
  id: string;
  metricCode: string;
  operation: "value" | "mean" | "median" | "count" | "share" | "difference" | "percent_change";
  value: string;
  exact?: { numerator: string; denominator: string };
  unit: string;
  year: number;
  baselineYear?: number;
  responses: number;
  evidenceIds: string[];
  decisionId: string;
  category?: string;
};
export type Series = {
  label: string;
  year: number;
  surveyId: number;
  factId?: string;
  value: string;
  responses: number;
  evidenceIds: string[];
  role: "average" | "company" | "category";
};
export type ChartSpec = {
  id: string;
  metricCode: string;
  title: string;
  unit: string;
  kind: "grouped_bar" | "diverging_bar" | "distribution";
  domain: [number, number];
  series: Series[];
  decisionId: string;
  multiSelect: boolean;
};
export type AnalysisPackage = {
  schemaVersion: 2;
  engineVersion: string;
  dataset: Dataset;
  createdAt: string;
  cohortMode: "available_each_year" | "matched_panel";
  facts: Fact[];
  charts: ChartSpec[];
  decisions: Decision[];
  evidence: Evidence[];
  warnings: string[];
  dataQuality?: Array<{
    metricCode: string;
    year: number;
    reports: number;
    used: number;
    missing: number;
    notApplicable: number;
    unknown: number;
    invalid: number;
    panelExcluded: number;
  }>;
  coverage: {
    status: "complete" | "partial";
    comparable: number;
    needsReview: number;
    unavailable: number;
  };
};
export type AnalysisRequest = {
  years: number[];
  surveyVersionIds: number[];
  organizationIds: number[];
  questionKeys: string[];
  metricCodes: string[];
  datasetMode: Dataset;
  cohortMode: "available_each_year" | "matched_panel";
};
export type AnalysisRun = {
  id: string;
  state: string;
  createdAt: string;
  result: AnalysisPackage | null;
  narrative: Narrative | null;
  narrativeState: string;
  invalidated: boolean;
};
export type Narrative = {
  findings: Array<{ text: string; factIds: string[]; evidenceIds: string[] }>;
  limitations: string[];
};
