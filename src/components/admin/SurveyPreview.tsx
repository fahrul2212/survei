import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, RotateCcw } from "lucide-react";
import { QuestionField } from "../question-field";
import { evaluateVisibility, isAnswered, type JsonAnswer, type SurveyQuestion } from "../../lib/portal";

export function SurveyPreview({ questions, carry }: { questions: SurveyQuestion[]; carry: Record<number, string> }) {
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [activePageIndex, setActivePageIndex] = useState(0);

  const visibleQuestions = useMemo(
    () => questions.filter((question) => evaluateVisibility(question, questions, answers)),
    [answers, questions],
  );

  const pages = useMemo(() => {
    const grouped = new Map<string, { key: string; title: string; questions: SurveyQuestion[] }>();
    for (const question of visibleQuestions) {
      if (!grouped.has(question.sectionKey)) {
        grouped.set(question.sectionKey, { key: question.sectionKey, title: question.sectionTitle, questions: [] });
      }
      grouped.get(question.sectionKey)!.questions.push(question);
    }
    return Array.from(grouped.values());
  }, [visibleQuestions]);

  useEffect(() => {
    setActivePageIndex((index) => Math.min(index, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  const activePage = pages[activePageIndex];
  const answered = visibleQuestions.filter((question) => isAnswered(answers[question.id])).length;
  const updateAnswer = (questionId: number, value: JsonAnswer) => setAnswers((current) => ({ ...current, [questionId]: value }));

  if (!activePage) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600"><Eye size={16} aria-hidden="true" /></span>
          <div>
            <strong className="block text-sm font-bold text-slate-900">Company experience preview</strong>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">A page-by-page preview. Answers are discarded when you leave.</p>
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums text-slate-600">{answered} of {visibleQuestions.length} answered</span>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r lg:p-5" aria-label="Preview pages">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pages</p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
            {pages.map((page, index) => {
              const pageAnswered = page.questions.filter((question) => isAnswered(answers[question.id])).length;
              const active = index === activePageIndex;
              return (
                <button key={page.key} type="button" onClick={() => setActivePageIndex(index)} aria-current={active ? "step" : undefined}
                  className={`min-w-56 rounded-lg border px-3 py-2.5 text-left transition-colors lg:min-w-0 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                  <span className={`mb-1 block text-[10px] font-bold uppercase tracking-wider ${active ? "text-slate-300" : "text-slate-400"}`}>Page {index + 1}</span>
                  <span className="block text-xs font-bold leading-5">{page.title}</span>
                  <span className={`mt-1 block text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>{pageAnswered}/{page.questions.length} answered</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-7 lg:p-9">
          <div className="mx-auto max-w-3xl">
            <div className="mb-7 border-b border-slate-200 pb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#d91f17]">Page {activePageIndex + 1} of {pages.length}</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{activePage.title}</h2>
              <p className="mt-2 text-sm text-slate-600">Complete the questions below, then continue to the next page.</p>
            </div>

            <div className="space-y-8">
              {activePage.questions.map((question) => {
                const questionNumber = visibleQuestions.indexOf(question) + 1;
                return (
                  <article key={question.id} className="border-b border-slate-200 pb-8 last:border-b-0 last:pb-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Q{questionNumber}</span>
                      {question.required && <span className="text-[#d91f17]">Required</span>}
                    </div>
                    <h3 className="text-lg font-bold leading-7 text-slate-950">{question.prompt}</h3>
                    {question.helpText && <p className="mt-2 text-sm leading-6 text-slate-600">{question.helpText}</p>}
                    {carry[question.id] && (
                      <div className="mt-3 flex items-start gap-2 border-l-2 border-emerald-600 pl-3 text-xs leading-5 text-slate-600">
                        <RotateCcw className="mt-0.5 shrink-0 text-emerald-700" size={14} aria-hidden="true" />
                        <span>Can be prefilled from <strong className="font-semibold text-slate-900">{carry[question.id]}</strong>.</span>
                      </div>
                    )}
                    <div className="mt-4">
                      <QuestionField question={question} value={answers[question.id]} disabled={false}
                        change={(value) => updateAnswer(question.id, value)} save={(value) => updateAnswer(question.id, value)} />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-9 grid grid-cols-2 gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <button type="button" disabled={activePageIndex === 0} onClick={() => setActivePageIndex((index) => Math.max(0, index - 1))}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40">
                <ArrowLeft size={16} aria-hidden="true" /> Previous
              </button>
              <span className="hidden items-center justify-center gap-2 text-xs font-medium text-slate-500 sm:inline-flex">
                {activePage.questions.every((question) => !question.required || isAnswered(answers[question.id])) && <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />}
                {activePage.questions.filter((question) => isAnswered(answers[question.id])).length} of {activePage.questions.length} answered on this page
              </span>
              <button type="button" disabled={activePageIndex >= pages.length - 1} onClick={() => setActivePageIndex((index) => Math.min(pages.length - 1, index + 1))}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-500">
                Next page <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
