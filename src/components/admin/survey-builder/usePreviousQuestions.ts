import { useEffect, useState } from "react";
import type { SurveyVersion } from "../../../lib/portal";
import { supabase } from "../../../lib/supabase";

export type PreviousQuestion = { key: string; prompt: string; year: number };
export function usePreviousQuestions(versions: SurveyVersion[], selected?: SurveyVersion) {
  const [questions, setQuestions] = useState<PreviousQuestion[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setQuestions([]);
    setError("");
    async function load() {
      const previous = versions.filter(
        (version) => selected && version.reporting_year < selected.reporting_year,
      );
      if (!supabase || !previous.length) return;
      const items: PreviousQuestion[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase
          .from("survey_questions")
          .select(
            "id,survey_version_id,question_revision:question_revisions(prompt,question:question_definitions(stable_key))",
          )
          .in(
            "survey_version_id",
            previous.map((version) => version.id),
          )
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        for (const row of result.data ?? []) {
          const revision = Array.isArray(row.question_revision)
            ? row.question_revision[0]
            : row.question_revision;
          const definition = Array.isArray(revision?.question)
            ? revision.question[0]
            : revision?.question;
          if (definition?.stable_key)
            items.push({
              key: String(definition.stable_key),
              prompt: String(revision?.prompt ?? ""),
              year: previous.find((version) => version.id === Number(row.survey_version_id))!
                .reporting_year,
            });
        }
        if ((result.data?.length ?? 0) < 500) break;
      }
      if (active)
        setQuestions([
          ...new Map(
            items.sort((a, b) => a.year - b.year).map((item) => [item.key, item]),
          ).values(),
        ]);
    }
    void load().catch(() => {
      if (active)
        setError(
          "Previous questions could not be loaded. Reopen the editor before changing prefill.",
        );
    });
    return () => {
      active = false;
    };
  }, [versions, selected]);
  return { questions, error };
}
