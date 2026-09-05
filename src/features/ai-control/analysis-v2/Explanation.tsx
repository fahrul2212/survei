import { useId, useState } from "react";
import { FileSearch } from "lucide-react";
import type { AnalysisRun } from "../../../../shared/analysis/contracts";
import { Button } from "../../../components/ui";
import { explainAnalysis, readAnalysis } from "./api";
import { NarrativeReport } from "./NarrativeReport";
import { explanationStates } from "./presentation";

const prompts = [
  {
    label: "Main differences",
    question: "Explain the main differences and limitations in this comparison.",
  },
  {
    label: "Changes over time",
    question:
      "Explain the supported changes across reporting years and any limits to comparing them.",
  },
  {
    label: "Data limitations",
    question:
      "Which comparisons are unavailable or uncertain, and what source data would clarify them?",
  },
];

export function Explanation({
  run,
  change,
  stale = false,
}: {
  run: AnalysisRun;
  change: (run: AnalysisRun) => void;
  stale?: boolean;
}) {
  const [question, setQuestion] = useState(prompts[0].question);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useId();
  async function requestExplanation(refresh = false) {
    setBusy(true);
    setError("");
    try {
      change(await (refresh ? readAnalysis(run.id) : explainAnalysis(run.id, question)));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Interpretation is unavailable. Please check again later.",
      );
      if (!refresh) {
        const current = await readAnalysis(run.id).catch(() => null);
        if (current) change(current);
      }
    } finally {
      setBusy(false);
    }
  }
  if (run.narrative && run.result)
    return <NarrativeReport result={run.result} narrative={run.narrative} />;
  const canRequest =
    run.narrativeState === "not_requested" && !!run.result?.evidence.length && !stale;
  const status = explanationStates[run.narrativeState] ?? {
    title: "Interpretation is unavailable",
    description:
      "Check the request status or continue with the calculated measurements and source answers.",
  };
  return (
    <section aria-label="Request interpretation" aria-busy={busy}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Interpretation
      </p>
      <h3 className="mt-2 text-xl font-bold tracking-tight">
        {canRequest ? "Put the results in context" : "Interpretation status"}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {canRequest
          ? "Ask a focused question about this comparison. The interpretation will cite the same measurements and source answers available in this report."
          : "Your calculated measurements and available source answers can still be inspected in this report."}
      </p>
      {canRequest ? (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (canRequest && !busy) void requestExplanation();
          }}
        >
          <label htmlFor={id} className="text-sm font-semibold">
            Analysis question
          </label>
          <textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
            aria-describedby={`${id}-help`}
            className="mt-2 w-full resize-y rounded-md border border-slate-300 p-3 text-sm leading-6 disabled:bg-slate-50"
          />
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested analysis questions">
            {prompts.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                disabled={busy}
                onClick={() => setQuestion(prompt.question)}
                aria-pressed={question === prompt.question}
                className="min-h-10 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 aria-pressed:border-slate-600 aria-pressed:text-slate-900 disabled:opacity-50"
              >
                {prompt.label}
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
            <p id={`${id}-help`} className="max-w-sm text-xs leading-5 text-slate-500">
              AI assists with interpretation. Calculations and source references remain
              independently available.
            </p>
            <Button
              type="submit"
              icon={FileSearch}
              disabled={busy || question.trim().length < 5 || !canRequest}
            >
              {busy ? "Preparing interpretation…" : "Prepare interpretation"}
            </Button>
          </div>
          {busy && (
            <p className="mt-3 text-sm text-slate-600" role="status">
              You can inspect measurements while this request is processing.
            </p>
          )}
        </form>
      ) : (
        <div className="mt-6 border-l-2 border-slate-300 bg-slate-50 p-4" role="status">
          <h4 className="text-sm font-semibold">
            {stale
              ? "Update the comparison first"
              : !run.result?.evidence.length
                ? "No source answers available"
                : status.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {stale
              ? "Filters have changed. Build a new comparison before requesting an interpretation."
              : !run.result?.evidence.length
                ? "Choose a scope with available answers to prepare an interpretation."
                : status.description}
          </p>
          {!stale && run.narrativeState !== "not_requested" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void requestExplanation(true)}
              className="mt-3 min-h-10 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
            >
              {busy ? "Checking status…" : "Check request status"}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm leading-6 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
