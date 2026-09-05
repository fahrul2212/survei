import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { JsonAnswer, Submission } from "../../lib/portal";

export type PreviousAnswerRecord = {
  prompt: string;
  type: string;
  options: string[];
  validation: Record<string, unknown>;
  value: JsonAnswer;
};
type Previous = { year: number; name: string; answers: Record<string, PreviousAnswerRecord> };
const first = <T>(value: T | T[]) => (Array.isArray(value) ? value[0] : value);

export function usePreviousReport(report: Submission, year: number, enabled: boolean) {
  const [previous, setPrevious] = useState<Previous | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || !supabase) return;
    const client = supabase;
    let active = true;
    setLoading(true);
    setError("");
    setPrevious(null);
    async function load() {
      const reports = await client
        .from("company_submissions")
        .select("id,survey:survey_versions!inner(id,reporting_year,name)")
        .eq("organization_id", report.organization_id)
        .eq("status", "submitted")
        .lt("survey.reporting_year", year);
      if (reports.error) throw reports.error;
      const candidates = (reports.data ?? [])
        .map((row) => ({ id: row.id, survey: first(row.survey) }))
        .sort(
          (a, b) => b.survey.reporting_year - a.survey.reporting_year || b.survey.id - a.survey.id,
        );
      const selected = candidates[0];
      if (!selected) return;
      const result = await client
        .from("answers")
        .select(
          "value,question:survey_questions!inner(revision:question_revisions!inner(prompt,question_type,options,validation,definition:question_definitions!inner(stable_key)))",
        )
        .eq("submission_id", selected.id);
      if (result.error) throw result.error;
      const answers = Object.fromEntries(
        (result.data ?? []).map((row) => {
          const revision = first(first(row.question).revision);
          return [
            first(revision.definition).stable_key,
            {
              prompt: revision.prompt,
              type: revision.question_type,
              options: revision.options,
              validation: revision.validation,
              value: row.value,
            },
          ];
        }),
      );
      if (active)
        setPrevious({ year: selected.survey.reporting_year, name: selected.survey.name, answers });
    }
    void load()
      .catch(() => {
        if (active)
          setError("Previous report could not be loaded. Turn comparison off and on to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, report.organization_id, year]);
  return { previous, loading, error };
}
