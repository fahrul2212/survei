import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "../../lib/supabase";
import { requestSessionRecovery } from "../../lib/session-recovery";
import type { AnswerRecord, JsonAnswer, Submission, SurveyQuestion } from "../../lib/portal";
import { useAnswerAutosave } from "./useAnswerAutosave";
import type { Conflict } from "./AnswerConflict";

type Provenance = AnswerRecord["provenance"];
type Props = {
  userId: string;
  submission: Submission | null;
  editable: boolean;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  setAnswers: Dispatch<SetStateAction<Record<number, JsonAnswer>>>;
  setProvenance: Dispatch<SetStateAction<Record<number, Provenance>>>;
};

export function useReportAnswers(props: Props) {
  const versions = useRef(new Map<string, number>());
  const answers = useRef(props.answers);
  answers.current = props.answers;
  const [reviewed, setReviewed] = useState<Record<number, boolean>>({});
  const [conflict, setConflict] = useState<
    (Conflict & { provenance: Provenance; reviewed: boolean }) | null
  >(null);

  async function write(question: SurveyQuestion, value: JsonAnswer, confirmReview = false) {
    if (!supabase || !props.submission || !props.editable)
      throw new Error("This report is read only.");
    const identity = await supabase.auth.getSession();
    if (identity.data.session?.user.id !== props.userId) {
      requestSessionRecovery();
      throw new Error("Sign in with the same account before saving.");
    }
    const key = `${props.submission.id}:${question.id}`;
    const result = await supabase.rpc("save_report_answer", {
      target_submission_id: props.submission.id,
      target_question_id: question.id,
      new_value: value,
      expected_version: versions.current.get(key) ?? null,
      confirm_review: confirmReview,
    });
    if (result.error) {
      if (["40001", "PT409"].includes(result.error.code)) {
        const latest = await supabase
          .from("answers")
          .select("value,edit_version,provenance,reviewed_at")
          .eq("submission_id", props.submission.id)
          .eq("survey_question_id", question.id)
          .maybeSingle();
        if (!latest.error)
          setConflict({
            questionId: question.id,
            prompt: question.prompt,
            mine: answers.current[question.id] ?? value,
            saved: latest.data?.value ?? null,
            version: latest.data?.edit_version ?? null,
            provenance: latest.data?.provenance ?? "manual",
            reviewed: Boolean(latest.data?.reviewed_at),
          });
      }
      throw result.error;
    }
    versions.current.set(key, Number(result.data.edit_version));
    setReviewed((current) => ({ ...current, [question.id]: true }));
    props.setProvenance((current) => ({ ...current, [question.id]: result.data.provenance }));
  }
  const autosave = useAnswerAutosave(write);

  return {
    autosave,
    reviewed,
    conflict,
    closeConflict: () => setConflict(null),
    reset: (rows: AnswerRecord[]) => {
      for (const row of rows)
        versions.current.set(`${row.submission_id}:${row.survey_question_id}`, row.edit_version);
      setReviewed(
        Object.fromEntries(rows.map((row) => [row.survey_question_id, Boolean(row.reviewed_at)])),
      );
      setConflict(null);
    },
    confirm: async (question: SurveyQuestion) => {
      if (await autosave.flush()) await write(question, answers.current[question.id] ?? null, true);
    },
    resolve: async (useMine: boolean) => {
      if (!conflict || !props.submission) return;
      await autosave.flush();
      const question = props.questions.find((item) => item.id === conflict.questionId);
      if (!question) return;
      const key = `${props.submission.id}:${question.id}`;
      if (conflict.version === null) versions.current.delete(key);
      else versions.current.set(key, conflict.version);
      autosave.discard(question.id);
      const value = useMine ? (answers.current[question.id] ?? conflict.mine) : conflict.saved;
      props.setAnswers((current) => ({ ...current, [question.id]: value }));
      props.setProvenance((current) => ({
        ...current,
        [question.id]: useMine ? "manual" : conflict.provenance,
      }));
      setReviewed((current) => ({ ...current, [question.id]: !useMine && conflict.reviewed }));
      setConflict(null);
      if (useMine) autosave.enqueue(question, value);
    },
  };
}
