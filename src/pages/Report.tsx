import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Eye,
  Info,
  ListX,
  LockKeyhole,
  Printer,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { answerIssues } from "../../shared/survey-answer";
import { SubmissionReview } from "../features/reporting/SubmissionReview";
import { Dialog } from "../components/common/Dialog";
import type { useAnswerAutosave } from "../features/reporting/useAnswerAutosave";
import { Button, EmptyState, QuestionField } from "../components/ui";
import {
  isAnswered,
  valueAsText,
  type JsonAnswer,
  type Submission,
  type SurveyQuestion,
  type SurveyVersion,
} from "../lib/portal";
import { rememberRoute, routeValue } from "../features/reporting/survey-state";
import { reportingWindow, reportingWindowMessage } from "../../shared/reporting-window";
import { useReportingClock } from "../features/reporting/useReportingClock";
import { ReportTasks } from "../features/reporting/ReportTasks";
import { usePreviousReport } from "../features/reporting/usePreviousReport";
import { useSurveyPages } from "../features/reporting/useSurveyPages";
import {
  surveyProgress,
  focusSurveyQuestion,
  hasAnswerEdit,
} from "../features/reporting/survey-progress";
import { SurveyPageNavigation } from "../features/reporting/SurveyPageNavigation";
import { PageQuestionIndex } from "../features/reporting/PageQuestionIndex";
import { PreviousAnswer } from "../features/reporting/PreviousAnswer";

export function Report({
  version,
  submission,
  questions,
  answers,
  answerProvenance,
  setAnswers,
  setAnswerProvenance,
  autosave,
  reviewed,
  confirmAnswer,
  submit,
  back,
  editable = true,
}: {
  version: SurveyVersion;
  submission: Submission;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  answerProvenance: Record<number, "manual" | "prefilled" | "historical_import">;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, JsonAnswer>>>;
  setAnswerProvenance: React.Dispatch<
    React.SetStateAction<Record<number, "manual" | "prefilled" | "historical_import">>
  >;
  autosave: ReturnType<typeof useAnswerAutosave>;
  reviewed: Record<number, boolean>;
  confirmAnswer: (question: SurveyQuestion) => Promise<void>;
  submit: () => Promise<void>;
  back: () => void;
  editable?: boolean;
}) {
  const now = useReportingClock();
  const [comparePrevious, setComparePrevious] = useState(false);
  const history = usePreviousReport(submission, version.reporting_year, comparePrevious);
  const { visible, pages, activePage, activePageIndex, selectPage } = useSurveyPages(
    questions,
    answers,
    routeValue("section") || submission.current_section || "",
  );
  const navigationLock = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const readOnly =
    !editable || submission.status === "submitted" || reportingWindow(version, now) !== "open";
  const readOnlyLabel = !editable
    ? "Viewer access · read only"
    : reportingWindow(version, now) !== "open"
      ? reportingWindowMessage(version, now)
      : "Submitted · read only";
  const progress = surveyProgress(visible, answers, answerProvenance, reviewed);
  const answered = progress.complete;
  const invalid = visible.filter((q) => answerIssues(q, answers[q.id]).length > 0);
  const needsReview = visible.filter(
    (q) => isAnswered(answers[q.id]) && answerProvenance[q.id] !== "manual" && !reviewed[q.id],
  );
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    if (!activePage) return;
    rememberRoute("section", activePage.key);
    document.getElementById("report-page-heading")?.focus({ preventScroll: true });
    document.getElementById("report-page-heading")?.scrollIntoView({ block: "start" });
  }, [activePage?.key]);

  const focusQuestion = (question: SurveyQuestion) => focusSurveyQuestion(question.id);

  function updateAnswer(question: SurveyQuestion, value: JsonAnswer) {
    if (!hasAnswerEdit(answers[question.id], value)) return;
    autosave.enqueue(question, value);
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setAnswerProvenance((current) => ({ ...current, [question.id]: "manual" }));
  }

  async function navigatePage(key: string) {
    if (navigationLock.current || submitting) return false;
    navigationLock.current = true;
    setNavigating(true);
    setFlowError("");
    try {
      if (!readOnly && !(await autosave.flush())) {
        setFlowError(
          "Your latest changes could not be saved. Retry saving before leaving this page.",
        );
        return false;
      }
      selectPage(key);
      setShowErrors(false);
      return true;
    } catch {
      setFlowError("This page could not be saved. Your answers remain here; please retry.");
      return false;
    } finally {
      navigationLock.current = false;
      setNavigating(false);
    }
  }

  async function continueToNextPage() {
    if (!activePage || navigationLock.current || submitting) return;
    setShowErrors(true);
    const firstInvalid = activePage.questions.find((q) => answerIssues(q, answers[q.id]).length);
    if (!readOnly && firstInvalid) {
      focusQuestion(firstInvalid);
      return;
    }
    if (activePageIndex < pages.length - 1) await navigatePage(pages[activePageIndex + 1].key);
    else if (!readOnly) setConfirmSubmit(true);
  }

  function reviewQuestion(question: SurveyQuestion) {
    setConfirmSubmit(false);
    selectPage(question.sectionKey);
    setShowErrors(true);
    focusQuestion(question);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !confirmSubmit &&
        !submitting &&
        !navigating &&
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        void continueToNextPage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!activePage) {
    return (
      <div className="grid min-h-[calc(100vh-64px)] place-items-center bg-slate-50 p-6">
        <EmptyState
          icon={ListX}
          title="No visible questions"
          description="No questions are available for your current answers."
          action={
            <Button variant="secondary" onClick={back}>
              Back to overview
            </Button>
          }
        />
      </div>
    );
  }

  const pageAnswered = surveyProgress(
    activePage.questions,
    answers,
    answerProvenance,
    reviewed,
  ).complete;
  const pageRequiredComplete =
    readOnly || activePage.questions.every((q) => answerIssues(q, answers[q.id]).length === 0);

  return (
    <>
      <div className="interactive-report-ui grid min-h-[calc(100vh-64px)] grid-cols-1 bg-slate-50 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
        {confirmSubmit && (
          <SubmissionReview
            questions={visible}
            answers={answers}
            busy={submitting}
            error={flowError}
            blocked={readOnly}
            needsReview={needsReview}
            close={() => setConfirmSubmit(false)}
            edit={reviewQuestion}
            submit={() => {
              void (async () => {
                if (readOnly || submitting) return;
                setSubmitting(true);
                setFlowError("");
                try {
                  if (await autosave.flush()) await submit();
                  else
                    setFlowError(
                      "Some changes could not be saved. Continue editing and retry saving before submitting.",
                    );
                } catch (error) {
                  setFlowError(
                    error instanceof Error
                      ? error.message
                      : "The report could not be submitted. Please retry.",
                  );
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
          />
        )}

        <aside className="border-b border-slate-200 bg-white p-5 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:overflow-y-auto md:border-b-0 md:border-r md:p-6">
          <button
            className="mb-4 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-900"
            disabled={submitting || navigating}
            onClick={back}
          >
            <ArrowLeft size={16} className="mr-1.5" /> Back to overview
          </button>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Annual report {version.reporting_year}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
              {readOnly ? (
                <>
                  <LockKeyhole size={11} /> Read only
                </>
              ) : autosave.state === "saving" ? (
                <>
                  <Clock3 size={11} /> Saving
                </>
              ) : autosave.state === "failed" ? (
                <>
                  <TriangleAlert size={11} /> Save failed
                </>
              ) : autosave.state === "pending" ? (
                <>
                  <Clock3 size={11} /> Unsaved changes
                </>
              ) : (
                <>
                  <Check size={11} /> Saved
                </>
              )}
            </span>
          </div>
          {autosave.state === "failed" && (
            <button
              type="button"
              onClick={() =>
                void autosave.retry().then((saved) => {
                  if (saved) setFlowError("");
                })
              }
              className="mb-3 text-sm font-bold text-red-700 underline"
            >
              Save failed — retry
            </button>
          )}
          <p className="mb-3 text-xs text-slate-500">
            {questions.length} total questions · {visible.length} currently applicable
          </p>
          {!readOnly && (
            <p className="mb-3 text-xs leading-5 text-slate-600">
              {progress.ready
                ? `Required answers are ready. ${progress.optional} optional questions left blank.`
                : `${invalid.length} need an answer or correction · ${needsReview.length} carried-forward answers need review`}
            </p>
          )}
          <div
            role="progressbar"
            aria-label="Completed applicable questions"
            aria-valuemin={0}
            aria-valuemax={visible.length}
            aria-valuenow={answered}
            className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-[#d91f17]"
              style={{ width: `${visible.length ? (answered / visible.length) * 100 : 0}%` }}
            />
          </div>
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Complete answers</span>
            <strong className="text-[#d91f17]">
              {answered}/{visible.length}
            </strong>
          </div>
          <SurveyPageNavigation
            pages={pages}
            activeKey={activePage.key}
            answers={answers}
            provenance={answerProvenance}
            reviewed={reviewed}
            disabled={navigating || submitting}
            select={(key) => void navigatePage(key)}
          >
            <ReportTasks
              questions={visible}
              answers={answers}
              provenance={answerProvenance}
              reviewed={reviewed}
              readOnly={readOnly}
              disabled={navigating || submitting}
              jump={async (q) => {
                if (!(await navigatePage(q.sectionKey))) return false;
                reviewQuestion(q);
                return true;
              }}
            />
            <label className="mb-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={comparePrevious}
                onChange={(e) => setComparePrevious(e.target.checked)}
                className="mt-1 accent-red-600"
              />
              Compare previous year
            </label>
            {comparePrevious && (
              <p className="mb-4 text-xs leading-5 text-slate-600">
                {history.loading
                  ? "Loading previous report…"
                  : history.error ||
                    (history.previous
                      ? `Comparing with ${history.previous.year}: ${history.previous.name}`
                      : "No submitted report is available from an earlier year.")}
              </p>
            )}
          </SurveyPageNavigation>
        </aside>

        <main className="p-4 sm:p-6 lg:p-10">
          <div className="mx-auto max-w-[860px] rounded-xl border border-slate-200 bg-white p-5 sm:p-8 lg:p-10">
            <header className="mb-8 border-b border-slate-200 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">
                  Page {activePageIndex + 1} of {pages.length} applicable pages
                </p>
                <span className="text-xs font-semibold text-slate-500">
                  {readOnly
                    ? readOnlyLabel
                    : `${pageAnswered} of ${activePage.questions.length} complete`}
                </span>
              </div>
              <h1
                id="report-page-heading"
                tabIndex={-1}
                className="mt-2 scroll-mt-24 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl"
              >
                {activePage.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {readOnly
                  ? "This report is preserved for reference."
                  : "Your answers save automatically. Required answers must be valid to continue; optional questions can be left blank."}
              </p>
            </header>
            {!readOnly && (
              <PageQuestionIndex
                questions={activePage.questions}
                answers={answers}
                disabled={navigating || submitting}
                revealErrors={() => setShowErrors(true)}
              />
            )}
            {flowError && !confirmSubmit && (
              <p
                role="alert"
                className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                {flowError}
              </p>
            )}
            {navigating && (
              <p role="status" className="mb-4 text-sm text-slate-600">
                Saving this page…
              </p>
            )}
            {showErrors &&
              !readOnly &&
              activePage.questions.some((q) => answerIssues(q, answers[q.id]).length) && (
                <section
                  className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4"
                  role="alert"
                >
                  <h2 className="font-semibold text-red-900">Please check these answers</h2>
                  <ul className="mt-2 grid gap-2 text-sm">
                    {activePage.questions
                      .filter((q) => answerIssues(q, answers[q.id]).length)
                      .map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => focusQuestion(q)}
                            className="text-left text-red-800 underline"
                          >
                            Q{q.displayOrder}: {answerIssues(q, answers[q.id]).join(" ")}
                          </button>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

            <div className="space-y-9">
              {activePage.questions.map((q) => {
                const number = q.displayOrder;
                const provenance = answerProvenance[q.id];
                return (
                  <article
                    key={q.id}
                    id={`report-question-${q.id}`}
                    tabIndex={-1}
                    className="scroll-mt-24 border-b border-slate-200 pb-9 last:border-b-0 last:pb-0"
                  >
                    <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Q{number}</span>
                      {q.required && <span className="text-[#d91f17]">Required</span>}
                      {!q.required && <span>Optional</span>}
                    </div>
                    <h2 className="text-lg font-bold leading-7 text-slate-950 sm:text-xl">
                      {q.prompt}
                    </h2>
                    {q.helpText && (
                      <p className="mt-2 text-sm leading-6 text-slate-600">{q.helpText}</p>
                    )}
                    {comparePrevious && history.previous && (
                      <PreviousAnswer
                        previous={history.previous.answers[q.stableKey]}
                        current={q}
                        value={answers[q.id]}
                        year={history.previous.year}
                      />
                    )}
                    {(provenance === "prefilled" || provenance === "historical_import") &&
                      !readOnly && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                          {provenance === "historical_import" ? (
                            <Info size={14} className="mt-0.5 shrink-0" />
                          ) : (
                            <RotateCcw size={14} className="mt-0.5 shrink-0" />
                          )}
                          <div>
                            <span>
                              {provenance === "historical_import"
                                ? "Imported historical response"
                                : "Prefilled from the previous report"}
                              .{" "}
                              {reviewed[q.id]
                                ? "Confirmed for this report."
                                : "Review and confirm, or edit anything that changed."}
                            </span>
                            {!reviewed[q.id] && isAnswered(answers[q.id]) && (
                              <button
                                type="button"
                                disabled={
                                  confirming !== null || answerIssues(q, answers[q.id]).length > 0
                                }
                                className="mt-2 block font-bold underline disabled:text-slate-500"
                                onClick={() => {
                                  setConfirming(q.id);
                                  void confirmAnswer(q)
                                    .catch((error) =>
                                      setFlowError(
                                        error instanceof Error
                                          ? error.message
                                          : "This answer could not be confirmed. Please retry.",
                                      ),
                                    )
                                    .finally(() => setConfirming(null));
                                }}
                              >
                                {confirming === q.id
                                  ? "Confirming…"
                                  : "Confirm this answer is still correct"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    <div className="mt-4">
                      <QuestionField
                        question={q}
                        value={answers[q.id]}
                        disabled={readOnly || submitting || navigating}
                        showErrors={showErrors}
                        change={(value) => updateAnswer(q, value)}
                        save={(value) => updateAnswer(q, value)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>

            {!pageRequiredComplete && (
              <p className="mt-7 text-sm font-medium text-[#b01710]">
                Complete required answers and correct any invalid entries to continue.
              </p>
            )}
            <footer className="sticky bottom-0 mt-9 flex flex-col-reverse justify-between gap-3 border-t border-slate-200 bg-white py-4 sm:flex-row sm:items-center">
              <Button
                variant="secondary"
                disabled={activePageIndex === 0 || navigating || submitting}
                onClick={() => void navigatePage(pages[activePageIndex - 1].key)}
              >
                <ArrowLeft size={16} className="mr-1.5" /> Previous page
              </Button>
              {activePageIndex < pages.length - 1 ? (
                <Button
                  variant="primary"
                  disabled={submitting || navigating}
                  onClick={() => void continueToNextPage()}
                >
                  {readOnly ? "Next page" : navigating ? "Saving…" : "Save & next page"}{" "}
                  <ArrowRight size={16} className="ml-1.5" />
                </Button>
              ) : readOnly ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setShowPrintPreview(true)}>
                    <Eye size={16} className="mr-1.5" /> Review report
                  </Button>
                  <Button onClick={() => window.print()}>
                    <Printer size={16} className="mr-1.5" /> Print / Save PDF
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  disabled={submitting || navigating}
                  onClick={() => {
                    setFlowError("");
                    setConfirmSubmit(true);
                  }}
                >
                  Review &amp; submit <Check size={16} className="ml-1.5" />
                </Button>
              )}
            </footer>
          </div>
        </main>
      </div>

      {showPrintPreview && (
        <Dialog
          title={`${version.reporting_year} Climate Transition Plan`}
          close={() => setShowPrintPreview(false)}
        >
          <Button onClick={() => window.print()}>
            <Printer size={16} className="mr-2" />
            Print / Save PDF
          </Button>
          <div className="mt-6 space-y-8">
            {pages.map((page) => (
              <ReportPage
                key={page.key}
                title={page.title}
                questions={page.questions}
                answers={answers}
              />
            ))}
          </div>
        </Dialog>
      )}

      <div className="hidden print:block print-document font-sans">
        <section className="stica-report-cover flex min-h-[950px] flex-col justify-between bg-[#d91f17] p-14 text-white">
          <p className="text-sm font-extrabold uppercase tracking-[0.25em]">
            The Scandinavian Textile Initiative for Climate Action
          </p>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/80">
              Signatory Climate Transition Plan Disclosure
            </p>
            <h1 className="mt-3 text-5xl font-black">{version.reporting_year} PROGRESS REPORT</h1>
            <p className="mt-3 text-lg font-bold">{version.name}</p>
          </div>
          <p className="border-t border-white/30 pt-5 text-xs">
            Status: {submission.status} · Submission #{submission.id}
          </p>
        </section>
        <div className="stica-page-break" />
        <header className="mb-8 border-b-2 border-slate-900 pb-5 pt-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[#d91f17]">
            STICA annual reporting
          </p>
          <h1 className="mt-1 text-2xl font-bold">Climate Transition Plan Report</h1>
          <p className="mt-1 text-sm text-slate-600">
            {answered} of {visible.length} questions completed
          </p>
        </header>
        <main className="space-y-8">
          {pages.map((page) => (
            <ReportPage
              key={page.key}
              title={page.title}
              questions={page.questions}
              answers={answers}
            />
          ))}
        </main>
      </div>
    </>
  );
}

function ReportPage({
  title,
  questions,
  answers,
}: {
  title: string;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
}) {
  return (
    <section className="print-section">
      <h2 className="mb-3 border-b border-slate-300 pb-2 text-sm font-bold uppercase tracking-wider text-slate-900">
        {title}
      </h2>
      <div className="divide-y divide-slate-200">
        {questions.map((q) => (
          <article key={q.id} className="print-row py-3">
            <div className="mb-1 flex justify-between gap-3 text-xs text-slate-500">
              <code className="font-mono font-bold text-slate-700">{q.stableKey}</code>
              <span>{q.category}</span>
            </div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{q.prompt}</h3>
            <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-sm">
              {isAnswered(answers[q.id]) ? (
                <span className="whitespace-pre-wrap font-medium text-slate-900">
                  {valueAsText(answers[q.id])}
                </span>
              ) : (
                <span className="italic text-slate-400">Not answered</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
