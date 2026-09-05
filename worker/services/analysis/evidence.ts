import { answerFields } from "../../../shared/survey-answer";
import { aggregate, primary, type Observation } from "./aggregate";
import type { AnalysisData } from "./load";
import { comparisonKey } from "../../../shared/question-comparison";

export type Evidence = {
  scope: string;
  reporting_year: number;
  survey_name: string;
  survey_version_id: number;
  question_key: string;
  category: string;
  prompt: string;
  field?: string;
  comparison_key?: string;
  unit?: string;
  organization?: string;
  answer?: unknown;
  aggregate?: ReturnType<typeof aggregate>;
};

export function buildEvidence(data: AnalysisData, minimum: number) {
  const { versions, submissions, questions, answers, ownOrganizationId } = data;
  const versionById = new Map(versions.map((row) => [Number(row.id), row]));
  const submissionById = new Map(submissions.map((row) => [Number(row.id), row]));
  const evidence: Evidence[] = [];
  const charts: Array<Evidence & { companies: Array<{ name: string; value: unknown }> }> = [];
  for (const question of questions) {
    const version = versionById.get(question.surveyVersionId)!;
    const common = {
      reporting_year: Number(version.reporting_year),
      survey_name: String(version.name),
      survey_version_id: question.surveyVersionId,
      question_key: question.key,
      category: question.category,
      prompt: question.prompt,
    };
    const rows = answers.filter((row) => Number(row.survey_question_id) === question.id);
    for (const row of rows) {
      const submission = submissionById.get(Number(row.submission_id))!;
      if (ownOrganizationId !== null && Number(submission.organization_id) !== ownOrganizationId)
        continue;
      const organization = Array.isArray(submission.organization)
        ? submission.organization[0]
        : submission.organization;
      evidence.push({
        ...common,
        scope: ownOrganizationId === null ? "selected_company" : "your_company",
        organization:
          ownOrganizationId === null ? String(organization?.name ?? "Company") : "Your company",
        answer: row.value,
      });
    }
    const fields = answerFields(question.validation);
    const metrics = fields.length
      ? fields
          .filter((field) => ["number", "select"].includes(field.type))
          .map((field) => ({
            field: field.key,
            type: field.type === "select" ? "single_choice" : "number",
            options: field.options ?? [],
          }))
      : [{ field: undefined, type: question.type, options: question.options }];
    for (const metric of metrics) {
      const observations: Observation[] = rows.map((row) => ({
        organizationId: Number(submissionById.get(Number(row.submission_id))!.organization_id),
        value: metric.field ? row.value?.[metric.field] : row.value,
      }));
      const result = aggregate(
        metric,
        observations,
        ownOrganizationId === null ? 1 : Math.max(3, minimum) + 1,
      );
      if (!result) continue;
      const aggregated = {
        ...common,
        field: metric.field,
        scope: ownOrganizationId === null ? "selected_group" : "anonymized_cohort",
        aggregate: result,
      };
      evidence.push(aggregated);
      const companies = rows.flatMap((row) => {
        const submission = submissionById.get(Number(row.submission_id))!;
        if (ownOrganizationId !== null && Number(submission.organization_id) !== ownOrganizationId)
          return [];
        const organization = Array.isArray(submission.organization)
          ? submission.organization[0]
          : submission.organization;
        return [
          {
            name:
              ownOrganizationId === null ? String(organization?.name ?? "Company") : "Your company",
            value: primary(metric.field ? row.value?.[metric.field] : row.value),
          },
        ];
      });
      charts.push({
        ...aggregated,
        companies,
        comparison_key: comparisonKey(question),
        unit:
          typeof question.validation.unit === "string" ? question.validation.unit : "as reported",
      });
    }
  }
  return { evidence, charts };
}
