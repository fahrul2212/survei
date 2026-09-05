import { supabase } from "../../lib/supabase";
import { portalFetch, requestSessionRecovery } from "../../lib/session-recovery";

export type QuestionBenchmark = {
  questionKey: string;
  prompt: string;
  category: string;
  questionType: "number" | "yes_no" | "single_choice" | "multiple_choice";
  ownValue: unknown;
  cohortSize: number;
  average: number | null;
  median: number | null;
  distribution: Array<{ label: string; count: number; percent: number }> | null;
};

export type QuestionBenchmarkResponse = {
  available: boolean;
  reason?:
    | "no_submissions"
    | "no_own_submission"
    | "no_comparable_answers"
    | "privacy_threshold"
    | null;
  threshold: number;
  cohortSize: number;
  questions: QuestionBenchmark[];
};

export async function getQuestionBenchmarks(
  surveyVersionId: number,
): Promise<QuestionBenchmarkResponse> {
  if (!supabase) throw new Error("Portal connection is unavailable");
  const session = await supabase.auth.getSession();
  if (session.error || !session.data.session?.access_token) {
    requestSessionRecovery();
    throw new Error("Your session has expired. Please sign in again.");
  }
  const response = await portalFetch(
    `/api/benchmark/questions?surveyVersionId=${encodeURIComponent(surveyVersionId)}`,
    {
      headers: { Authorization: `Bearer ${session.data.session.access_token}` },
    },
  );
  const body = (await response.json().catch(() => null)) as
    | (QuestionBenchmarkResponse & { error?: string })
    | null;
  if (!response.ok) throw new Error(body?.error ?? "Unable to load question benchmarks");
  return body as QuestionBenchmarkResponse;
}
