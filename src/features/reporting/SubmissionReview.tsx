import { useState } from "react";
import { answerIssues } from "../../../shared/survey-answer";
import type { JsonAnswer, SurveyQuestion } from "../../lib/portal";
import { Button } from "../../components/ui";
import { Dialog } from "../../components/common/Dialog";
import { answerReviewLines } from "./answer-review";
import { groupSurveyPages } from "./survey-progress";

type Props = {
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  busy: boolean;
  close: () => void;
  edit: (question: SurveyQuestion) => void;
  submit: () => void;
  needsReview: SurveyQuestion[];
  error?: string;
  blocked?: boolean;
  preview?: boolean;
};

export function SubmissionReview({
  questions,
  answers,
  busy,
  close,
  edit,
  submit,
  needsReview,
  error,
  blocked,
  preview,
}: Props) {
  const [attentionOnly, setAttentionOnly] = useState(false);
  const invalid = questions.filter(
    (question) => answerIssues(question, answers[question.id]).length > 0,
  );
  const attention = new Set([...invalid, ...needsReview].map((question) => question.id));
  const ready = attention.size === 0 && questions.length > 0 && !blocked;
  const pages = groupSurveyPages(questions);
  return (
    <Dialog
      title={preview ? "Review preview answers" : "Review your report"}
      close={close}
      dismissible={!busy}
    >
      <p className="text-sm leading-6 text-slate-600">
        {preview
          ? "This exercises the same validation as the company form. Finishing the preview does not send or save a report."
          : "Check your answers before submitting. An administrator must reopen a submitted report before it can be changed."}
      </p>
      <div className="my-5 border-y border-slate-200 py-4">
        <h3 className="text-base font-bold">
          {ready
            ? "Ready for your final check"
            : blocked
              ? "This report is read only"
              : `${attention.size} ${attention.size === 1 ? "question needs" : "questions need"} attention`}
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {invalid.length} missing or invalid · {needsReview.length} carried-forward answers to
          confirm. Blank optional answers do not prevent submission.
        </p>
        {!!attention.size && (
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => edit(questions.find((question) => attention.has(question.id))!)}
              className="min-h-10 rounded border border-slate-300 px-3 py-2 text-xs font-semibold"
            >
              Fix the first outstanding answer
            </button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attentionOnly}
                disabled={busy}
                onChange={(event) => setAttentionOnly(event.target.checked)}
              />
              Show only questions needing attention
            </label>
          </div>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {blocked && (
        <p role="alert" className="mb-4 text-sm text-red-800">
          This report is now read only. Close this review to check its status and reporting
          deadline.
        </p>
      )}
      <div className="divide-y divide-slate-200">
        {pages.map((page, index) => {
          const rows = page.questions.filter(
            (question) => !attentionOnly || attention.has(question.id),
          );
          if (!rows.length) return null;
          const count = page.questions.filter((question) => attention.has(question.id)).length;
          return (
            <details
              key={`${page.key}-${attentionOnly}`}
              open={count > 0 || index === 0}
              className="py-4"
            >
              <summary className="cursor-pointer text-sm font-bold leading-6">
                {page.title}{" "}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {page.questions.length} {page.questions.length === 1 ? "question" : "questions"}
                  {count > 0 ? ` · ${count} need attention` : " · no outstanding requirements"}
                </span>
              </summary>
              <div className="mt-3 divide-y divide-slate-100">
                {rows.map((question) => {
                  const lines = answerReviewLines(question, answers[question.id]);
                  const issues = answerIssues(question, answers[question.id]);
                  return (
                    <article key={question.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="min-w-0 break-words text-sm font-semibold leading-6">
                          Q{question.displayOrder}. {question.prompt}
                        </h4>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => edit(question)}
                          aria-label={`Edit question ${question.displayOrder}`}
                          className="min-h-10 shrink-0 rounded px-2 text-sm font-semibold underline underline-offset-4"
                        >
                          Edit
                        </button>
                      </div>
                      {lines.length ? (
                        <dl className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                          {lines.map((line, i) => (
                            <div key={i} className="break-words">
                              {line.label && (
                                <dt className="font-medium text-slate-800">{line.label}</dt>
                              )}
                              <dd className="whitespace-pre-wrap">{line.text}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">
                          {question.required ? "No answer provided" : "Not answered · optional"}
                        </p>
                      )}
                      {!!issues.length && (
                        <p className="mt-2 text-sm leading-6 text-red-700">{issues.join(" ")}</p>
                      )}
                      {needsReview.some((item) => item.id === question.id) && (
                        <p className="mt-2 text-sm text-amber-800">
                          Confirm this carried-forward answer or update it for this report.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
        <Button type="button" onClick={close} disabled={busy}>
          Continue editing
        </Button>
        <Button type="button" variant="primary" onClick={submit} disabled={busy || !ready}>
          {busy ? "Submitting…" : preview ? "Finish preview" : "Confirm and submit"}
        </Button>
      </div>
    </Dialog>
  );
}
