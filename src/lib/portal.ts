export type JsonAnswer = string | number | boolean | string[] | null;

export type QuestionType =
  | "text"
  | "textarea"
  | "number"
  | "yes_no"
  | "single_choice"
  | "multiple_choice"
  | "date";

export type VisibilityRule = {
  questionKey?: string;
  operator?: "equals" | "not_equals" | "contains" | "is_answered";
  value?: JsonAnswer;
};

export type SurveyVersion = {
  id: number;
  reporting_year: number;
  name: string;
  status: "draft" | "published" | "closed";
  opens_at: string | null;
  closes_at: string | null;
  published_at: string | null;
};

export type Organization = {
  id: number;
  name: string;
  slug: string;
  contact_email: string | null;
  external_reference: string | null;
  is_active: boolean;
};

export type Submission = {
  id: number;
  organization_id: number;
  survey_version_id: number;
  status: "draft" | "submitted" | "reopened";
  current_section: string | null;
  submitted_at: string | null;
  reopened_at: string | null;
  revision_number: number;
  updated_at: string;
};

export type SurveyQuestion = {
  id: number;
  surveyVersionId: number;
  displayOrder: number;
  required: boolean;
  carryForwardEnabled: boolean;
  visibilityRule: VisibilityRule;
  sectionKey: string;
  sectionTitle: string;
  revisionId: number;
  definitionId: number;
  stableKey: string;
  category: string;
  prompt: string;
  helpText: string | null;
  type: QuestionType;
  options: string[];
  validation: Record<string, unknown>;
};

export type AnswerRecord = {
  id: number;
  submission_id: number;
  survey_question_id: number;
  value: JsonAnswer;
  provenance: "manual" | "prefilled" | "historical_import";
  updated_at: string;
};

export type ProgressRow = {
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  contact_email: string | null;
  survey_version_id: number;
  reporting_year: number;
  survey_name: string;
  submission_id: number | null;
  status: "not_started" | "draft" | "submitted" | "reopened";
  submitted_at: string | null;
  updated_at: string | null;
  total_questions: number;
  required_questions: number;
  answered_questions: number;
  completion_percent: number;
};

export type ExportRow = {
  reporting_year: number;
  company_name: string;
  company_slug: string;
  external_reference: string | null;
  status: string;
  submitted_at: string | null;
  section_title: string;
  display_order: number;
  question_key: string;
  category: string;
  question_prompt: string;
  question_type: string;
  answer: JsonAnswer;
  provenance: string;
  updated_at: string;
};

export type HistoricalImportRow = {
  company_name: string;
  company_slug: string;
  contact_email?: string;
  external_reference?: string;
  reporting_year: number;
  question_key: string;
  question_prompt?: string;
  question_type?: QuestionType;
  category?: string;
  section_key?: string;
  section_title?: string;
  answer: JsonAnswer;
  submitted_at?: string | null;
};

type NestedQuestionRow = {
  id: number;
  survey_version_id: number;
  display_order: number;
  is_required: boolean;
  carry_forward_enabled: boolean;
  visibility_rule: VisibilityRule | null;
  section_key: string;
  section_title: string;
  question_revision: {
    id: number;
    prompt: string;
    help_text: string | null;
    question_type: QuestionType;
    options: string[] | null;
    validation: Record<string, unknown> | null;
    question: {
      id: number;
      stable_key: string;
      category: string;
    } | Array<{
      id: number;
      stable_key: string;
      category: string;
    }>;
  } | Array<{
    id: number;
    prompt: string;
    help_text: string | null;
    question_type: QuestionType;
    options: string[] | null;
    validation: Record<string, unknown> | null;
    question: {
      id: number;
      stable_key: string;
      category: string;
    };
  }>;
};

export function parseSurveyQuestion(raw: unknown): SurveyQuestion {
  const row = raw as NestedQuestionRow;
  const revision = Array.isArray(row.question_revision) ? row.question_revision[0] : row.question_revision;
  const definition = Array.isArray(revision.question) ? revision.question[0] : revision.question;

  return {
    id: row.id,
    surveyVersionId: row.survey_version_id,
    displayOrder: row.display_order,
    required: row.is_required,
    carryForwardEnabled: row.carry_forward_enabled,
    visibilityRule: row.visibility_rule ?? {},
    sectionKey: row.section_key,
    sectionTitle: row.section_title,
    revisionId: revision.id,
    definitionId: definition.id,
    stableKey: definition.stable_key,
    category: definition.category,
    prompt: revision.prompt,
    helpText: revision.help_text,
    type: revision.question_type,
    options: revision.options ?? [],
    validation: revision.validation ?? {},
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isAnswered(value: JsonAnswer | undefined): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function valueAsText(value: JsonAnswer | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function evaluateVisibility(
  question: SurveyQuestion,
  questions: SurveyQuestion[],
  answers: Record<number, JsonAnswer>,
): boolean {
  const rule = question.visibilityRule;
  if (!rule?.questionKey) return true;
  const dependency = questions.find((candidate) => candidate.stableKey === rule.questionKey);
  if (!dependency) return false;
  const actual = answers[dependency.id];

  if (rule.operator === "is_answered") return isAnswered(actual);
  if (rule.operator === "not_equals") return JSON.stringify(actual) !== JSON.stringify(rule.value);
  if (rule.operator === "contains") {
    if (Array.isArray(actual)) return actual.some((item) => item === rule.value);
    return valueAsText(actual).toLowerCase().includes(valueAsText(rule.value).toLowerCase());
  }
  return JSON.stringify(actual) === JSON.stringify(rule.value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseImportAnswer(value: unknown): JsonAnswer {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      return text;
    }
  }
  return text;
}

export function normalizeImportMatrix(matrix: unknown[][]): HistoricalImportRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((value) => String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const required = ["company_name", "company_slug", "reporting_year", "question_key", "answer"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  return matrix.slice(1).filter((row) => row.some((value) => value !== null && value !== "")).map((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    const year = Number(record.reporting_year);
    if (!Number.isInteger(year)) throw new Error(`Invalid reporting year: ${String(record.reporting_year)}`);
    return {
      company_name: String(record.company_name ?? "").trim(),
      company_slug: slugify(String(record.company_slug ?? "")),
      contact_email: String(record.contact_email ?? "").trim() || undefined,
      external_reference: String(record.external_reference ?? "").trim() || undefined,
      reporting_year: year,
      question_key: String(record.question_key ?? "").trim().toUpperCase(),
      question_prompt: String(record.question_prompt ?? "").trim() || undefined,
      question_type: (String(record.question_type ?? "").trim() || "text") as QuestionType,
      category: String(record.category ?? "").trim() || undefined,
      section_key: slugify(String(record.section_key ?? "historical")) || "historical",
      section_title: String(record.section_title ?? "").trim() || "Historical import",
      answer: parseImportAnswer(record.answer),
      submitted_at: String(record.submitted_at ?? "").trim() || null,
    };
  });
}
