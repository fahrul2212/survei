import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, RotateCcw } from "lucide-react";
import { QuestionField } from "../question-field";
import { evaluateVisibility, isAnswered, type JsonAnswer, type SurveyQuestion } from "../../lib/portal";

export function SurveyPreview({
  questions,
  carry,
}: {
  questions: SurveyQuestion[];
  carry: Record<number, string>;
}) {
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleQuestions = useMemo(
    () => questions.filter((question) => evaluateVisibility(question, questions, answers)),
    [answers, questions],
  );

  const sections = useMemo(() => {
    const order: Array<{ key: string; title: string }> = [];
    for (const question of visibleQuestions) {
      if (!order.some((section) => section.key === question.sectionKey)) {
        order.push({ key: question.sectionKey, title: question.sectionTitle });
      }
    }
    return order;
  }, [visibleQuestions]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, visibleQuestions.length - 1)));
  }, [visibleQuestions.length]);

  const active = visibleQuestions[activeIndex];
  const answered = visibleQuestions.filter((question) => isAnswered(answers[question.id])).length;
  const activeSectionIndex = active ? sections.findIndex((section) => section.key === active.sectionKey) : -1;

  function updateAnswer(questionId: number, value: JsonAnswer) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function openSection(sectionKey: string) {
    const nextIndex = visibleQuestions.findIndex((question) => question.sectionKey === sectionKey);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  }

  if (!active) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600">
            <Eye size={16} aria-hidden="true" />
          </span>
          <div>
            <strong className="block text-sm font-bold text-slate-900">Company experience preview</strong>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">Answers stay in this preview and are discarded when you leave.</p>
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums text-slate-600">{answered} of {visibleQuestions.length} answered</span>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-slate-200 bg-slate-50 p-4 lg:border-r lg:border-b-0 lg:p-5" aria-label="Preview sections">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Sections</p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
            {sections.map((section, index) => {
              const sectionQuestions = visibleQuestions.filter((question) => question.sectionKey === section.key);
              const sectionAnswered = sectionQuestions.filter((question) => isAnswered(answers[question.id])).length;
              const activeSection = index === activeSectionIndex;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => openSection(section.key)}
                  aria-current={activeSection ? "step" : undefined}
                  className={`min-w-52 rounded-lg border px-3 py-2.5 text-left transition-colors lg:min-w-0 ${activeSection ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                >
                  <span className="block truncate text-xs font-bold">{section.title}</span>
                  <span className={`mt-1 block text-[11px] ${activeSection ? "text-slate-300" : "text-slate-500"}`}>{sectionAnswered}/{sectionQuestions.length} answered</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-7 lg:p-9">
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
              <span className="text-xs font-bold tabular-nums text-slate-500">Question {activeIndex + 1} of {visibleQuestions.length}</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">{active.stableKey}</code>
              {active.required && <span className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Required</span>}
            </div>

            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{active.sectionTitle}</p>
            <h2 className="text-balance text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl">{active.prompt}</h2>
            {active.helpText && <p className="mt-3 text-sm leading-6 text-slate-600">{active.helpText}</p>}

            {carry[active.id] && (
              <div className="mt-5 flex min-w-0 items-start gap-2 border-l-2 border-emerald-600 pl-3 text-sm leading-5 text-slate-600">
                <RotateCcw className="mt-0.5 shrink-0 text-emerald-700" size={15} aria-hidden="true" />
                <span className="min-w-0">In the live report, this answer can be prefilled from <strong className="font-semibold text-slate-900">{carry[active.id]}</strong>.</span>
              </div>
            )}

            <div className="mt-7">
              <label className="mb-2 block text-sm font-bold text-slate-900">Your answer</label>
              <QuestionField
                question={active}
                value={answers[active.id]}
                disabled={false}
                change={(value) => updateAnswer(active.id, value)}
                save={(value) => updateAnswer(active.id, value)}
              />
            </div>

            <div className="mt-9 grid grid-cols-2 gap-3 border-t border-slate-200 pt-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 sm:px-4"
              >
                <ArrowLeft size={16} aria-hidden="true" /> Previous
              </button>
              <span className="hidden items-center justify-center gap-2 text-xs font-medium text-slate-500 sm:inline-flex">
                {isAnswered(answers[active.id]) && <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />}
                {isAnswered(answers[active.id]) ? "Answer recorded in preview" : "Answer this question to test the flow"}
              </span>
              <button
                type="button"
                disabled={activeIndex >= visibleQuestions.length - 1}
                onClick={() => setActiveIndex((index) => Math.min(visibleQuestions.length - 1, index + 1))}
                className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-500 sm:px-4"
              >
                Next<span className="hidden sm:inline"> question</span> <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
