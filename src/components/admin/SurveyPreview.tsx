import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, RotateCcw } from "lucide-react";
import { QuestionField } from "../question-field";
import { Button } from "../ui";
import { answerIssues } from "../../../shared/survey-answer";
import type { JsonAnswer, SurveyQuestion } from "../../lib/portal";
import { useSurveyPages } from "../../features/reporting/useSurveyPages";
import { focusSurveyQuestion, surveyProgress } from "../../features/reporting/survey-progress";
import { SurveyPageNavigation } from "../../features/reporting/SurveyPageNavigation";
import { SubmissionReview } from "../../features/reporting/SubmissionReview";
import { PageQuestionIndex } from "../../features/reporting/PageQuestionIndex";

export function SurveyPreview({
  questions,
  carry,
}: {
  questions: SurveyQuestion[];
  carry: Record<number, string>;
}) {
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState(false);
  const [finished, setFinished] = useState(false);
  const { visible, pages, activePage, activePageIndex, selectPage } = useSurveyPages(
    questions,
    answers,
  );
  const heading = useRef<HTMLHeadingElement>(null),
    previousPage = useRef("");
  useEffect(() => {
    if (previousPage.current && previousPage.current !== activePage?.key) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    }
    previousPage.current = activePage?.key ?? "";
  }, [activePage?.key]);
  const progress = surveyProgress(visible, answers);
  const update = (id: number, value: JsonAnswer) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setFinished(false);
  };
  function go(key: string) {
    selectPage(key);
    setShowErrors(false);
  }
  function edit(question: SurveyQuestion) {
    setReview(false);
    selectPage(question.sectionKey);
    setShowErrors(true);
    focusSurveyQuestion(question.id, "preview-question");
  }
  function next() {
    if (!activePage) return;
    const invalid = activePage.questions.find(
      (question) => answerIssues(question, answers[question.id]).length,
    );
    setShowErrors(true);
    if (invalid) {
      focusSurveyQuestion(invalid.id, "preview-question");
      return;
    }
    go(pages[activePageIndex + 1].key);
  }
  if (!activePage)
    return (
      <p className="p-5 text-sm text-slate-600">
        No applicable questions are available to preview.
      </p>
    );
  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <Eye size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold">Company experience preview</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Interactive validation and conditional pages. Preview answers are not saved or
              submitted.
            </p>
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-600">
          {progress.complete} of {visible.length} applicable complete · {questions.length} total
          questions
        </p>
      </header>
      <div className="grid min-w-0 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r md:p-5">
          <SurveyPageNavigation
            pages={pages}
            activeKey={activePage.key}
            answers={answers}
            select={go}
          >
            <p className="mb-4 text-xs leading-5 text-slate-500">
              Pages follow the source questionnaire. Conditional pages appear when the relevant
              answer is selected.
            </p>
          </SurveyPageNavigation>
        </aside>
        <div className="min-w-0 p-5 sm:p-7">
          <header className="mb-6 border-b border-slate-200 pb-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#d91f17]">
              Page {activePageIndex + 1} of {pages.length}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              className="mt-2 scroll-mt-24 text-2xl font-bold tracking-tight"
            >
              {activePage.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Required answers must be valid to continue. Optional questions can be left blank.
            </p>
          </header>
          <PageQuestionIndex
            questions={activePage.questions}
            answers={answers}
            prefix="preview-question"
            revealErrors={() => setShowErrors(true)}
          />
          {finished && (
            <p role="status" className="mb-5 border-l-2 border-slate-600 bg-slate-50 p-4 text-sm">
              Preview completed. No report was saved or sent.
            </p>
          )}
          {showErrors &&
            activePage.questions.some(
              (question) => answerIssues(question, answers[question.id]).length,
            ) && (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              >
                <h3 className="font-semibold">Please check these answers</h3>
                <ul className="mt-2 space-y-2">
                  {activePage.questions
                    .filter((question) => answerIssues(question, answers[question.id]).length)
                    .map((question) => (
                      <li key={question.id}>
                        <button
                          type="button"
                          className="text-left underline"
                          onClick={() => focusSurveyQuestion(question.id, "preview-question")}
                        >
                          Q{question.displayOrder}:{" "}
                          {answerIssues(question, answers[question.id]).join(" ")}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          <div className="space-y-8">
            {activePage.questions.map((question) => (
              <article
                key={question.id}
                id={`preview-question-${question.id}`}
                className="scroll-mt-24 border-b border-slate-200 pb-8 last:border-0"
              >
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Q{question.displayOrder}
                  <span className={question.required ? "ml-2 text-[#d91f17]" : "ml-2"}>
                    {question.required ? "Required" : "Optional"}
                  </span>
                </p>
                <h3 className="break-words text-lg font-bold leading-7">{question.prompt}</h3>
                {question.helpText && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{question.helpText}</p>
                )}
                {carry[question.id] && (
                  <p className="mt-3 flex items-start gap-2 border-l-2 border-slate-300 pl-3 text-xs leading-5 text-slate-600">
                    <RotateCcw size={14} aria-hidden="true" className="mt-1 shrink-0" />
                    <span>
                      Can be prefilled from {carry[question.id]}. Carried-forward answers require
                      confirmation.
                    </span>
                  </p>
                )}
                <div className="mt-4">
                  <QuestionField
                    question={question}
                    value={answers[question.id]}
                    disabled={false}
                    showErrors={showErrors}
                    change={(value) => update(question.id, value)}
                    save={(value) => update(question.id, value)}
                  />
                </div>
              </article>
            ))}
          </div>
          <footer className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white py-4">
            <Button
              type="button"
              icon={ArrowLeft}
              disabled={activePageIndex === 0}
              onClick={() => go(pages[activePageIndex - 1].key)}
            >
              Previous
            </Button>
            {activePageIndex < pages.length - 1 ? (
              <Button type="button" variant="primary" icon={ArrowRight} onClick={next}>
                Next page
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => setReview(true)}>
                Review preview
              </Button>
            )}
          </footer>
        </div>
      </div>
      {review && (
        <SubmissionReview
          preview
          questions={visible}
          answers={answers}
          busy={false}
          needsReview={[]}
          close={() => setReview(false)}
          edit={edit}
          submit={() => {
            setReview(false);
            setFinished(true);
            heading.current?.focus();
          }}
        />
      )}
    </section>
  );
}
