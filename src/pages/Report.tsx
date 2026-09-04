import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Eye, Info, ListX, LockKeyhole, Printer, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Button, EmptyState, QuestionField } from "../components/ui";
import { evaluateVisibility, isAnswered, valueAsText, type JsonAnswer, type Submission, type SurveyQuestion, type SurveyVersion } from "../lib/portal";

export function Report({ version, submission, questions, answers, answerProvenance, setAnswers, setAnswerProvenance, save, submit, back, editable = true }: {
  version: SurveyVersion;
  submission: Submission;
  questions: SurveyQuestion[];
  answers: Record<number, JsonAnswer>;
  answerProvenance: Record<number, "manual" | "prefilled" | "historical_import">;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, JsonAnswer>>>;
  setAnswerProvenance: React.Dispatch<React.SetStateAction<Record<number, "manual" | "prefilled" | "historical_import">>>;
  save: (q: SurveyQuestion, v: JsonAnswer) => Promise<void>;
  submit: () => Promise<void>;
  back: () => void;
  editable?: boolean;
}) {
  const visible = useMemo(() => questions.filter((q) => evaluateVisibility(q, questions, answers)), [answers, questions]);
  const pages = useMemo(() => {
    const map = new Map<string, { key: string; title: string; questions: SurveyQuestion[] }>();
    for (const q of visible) {
      if (!map.has(q.sectionKey)) map.set(q.sectionKey, { key: q.sectionKey, title: q.sectionTitle, questions: [] });
      map.get(q.sectionKey)!.questions.push(q);
    }
    return Array.from(map.values());
  }, [visible]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const readOnly = !editable || submission.status === "submitted" || version.status !== "published";
  const readOnlyLabel = !editable ? "Viewer access · read only" : version.status === "closed" ? "Survey closed" : "Submitted · read only";
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;
  const activePage = pages[activePageIndex];

  useEffect(() => {
    setActivePageIndex((index) => Math.min(index, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  async function commit(q: SurveyQuestion, value: JsonAnswer): Promise<boolean> {
    if (readOnly) return true;
    setSaving(true);
    setSaveError(false);
    try {
      await save(q, value);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function continueToNextPage() {
    if (!activePage) return;
    const requiredMissing = activePage.questions.some((q) => q.required && !isAnswered(answers[q.id]));
    if (requiredMissing) return;
    if (activePageIndex < pages.length - 1) setActivePageIndex((index) => index + 1);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void continueToNextPage();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (!activePage) {
    return <div className="grid min-h-[calc(100vh-64px)] place-items-center bg-slate-50 p-6"><EmptyState icon={ListX} title="No visible questions" description="No questions are available for your current answers." action={<Button variant="secondary" onClick={back}>Back to overview</Button>} /></div>;
  }

  const pageAnswered = activePage.questions.filter((q) => isAnswered(answers[q.id])).length;
  const pageRequiredComplete = activePage.questions.every((q) => !q.required || isAnswered(answers[q.id]));

  return (
    <>
      <div className="interactive-report-ui grid min-h-[calc(100vh-64px)] grid-cols-1 bg-slate-50 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
        {confirmSubmit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4" role="presentation" onMouseDown={() => setConfirmSubmit(false)}>
            <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 sm:p-8" role="alertdialog" aria-modal="true" aria-labelledby="submit-modal-title" onMouseDown={(e) => e.stopPropagation()}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Final submission</p>
              <h2 id="submit-modal-title" className="mb-4 text-2xl font-bold text-slate-900">Submit {version.reporting_year} report?</h2>
              <p className="mb-6 text-sm leading-6 text-slate-600">You completed <strong className="text-slate-900">{answered} of {visible.length}</strong> questions. Once submitted, an administrator must reopen the report before it can be changed.</p>
              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Continue editing</Button>
                <Button onClick={async () => { setConfirmSubmit(false); await submit(); }}>Confirm &amp; submit</Button>
              </div>
            </section>
          </div>
        )}

        <aside className="border-b border-slate-200 bg-white p-5 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:overflow-y-auto md:border-b-0 md:border-r md:p-6">
          <button className="mb-4 inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={back}><ArrowLeft size={16} className="mr-1.5" /> Back to overview</button>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Annual report {version.reporting_year}</p>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">
              {readOnly ? <><LockKeyhole size={11} /> Read only</> : saving ? <><Clock3 size={11} /> Saving</> : saveError ? <><TriangleAlert size={11} /> Save failed</> : <><Check size={11} /> Saved</>}
            </span>
          </div>
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#d91f17]" style={{ width: `${visible.length ? (answered / visible.length) * 100 : 0}%` }} /></div>
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-700"><span>Pages</span><strong className="text-[#d91f17]">{answered}/{visible.length}</strong></div>
          <nav className="flex gap-2 overflow-x-auto pb-2 md:grid md:overflow-visible" aria-label="Survey pages">
            {pages.map((page, index) => {
              const done = page.questions.filter((q) => isAnswered(answers[q.id])).length;
              const active = index === activePageIndex;
              return (
                <button key={page.key} type="button" onClick={() => setActivePageIndex(index)} aria-current={active ? "step" : undefined}
                  className={`min-w-56 rounded-lg border px-3 py-3 text-left transition-colors md:min-w-0 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${active ? "text-slate-300" : "text-slate-400"}`}>Page {index + 1}</span>
                  <span className="mt-1 block text-xs font-bold leading-5">{page.title}</span>
                  <span className={`mt-1 block text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>{done}/{page.questions.length} answered</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="p-4 sm:p-6 lg:p-10">
          <div className="mx-auto max-w-[860px] rounded-xl border border-slate-200 bg-white p-5 sm:p-8 lg:p-10">
            <header className="mb-8 border-b border-slate-200 pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Page {activePageIndex + 1} of {pages.length}</p>
                <span className="text-xs font-semibold text-slate-500">{readOnly ? readOnlyLabel : `${pageAnswered} of ${activePage.questions.length} answered`}</span>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{activePage.title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Your answers save automatically. Complete this page, then continue.</p>
            </header>

            <div className="space-y-9">
              {activePage.questions.map((q) => {
                const number = visible.indexOf(q) + 1;
                const provenance = answerProvenance[q.id];
                return (
                  <article key={q.id} className="border-b border-slate-200 pb-9 last:border-b-0 last:pb-0">
                    <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500"><span>Q{number}</span>{q.required && <span className="text-[#d91f17]">Required</span>}</div>
                    <h2 className="text-lg font-bold leading-7 text-slate-950 sm:text-xl">{q.prompt}</h2>
                    {q.helpText && <p className="mt-2 text-sm leading-6 text-slate-600">{q.helpText}</p>}
                    {(provenance === "prefilled" || provenance === "historical_import") && !readOnly && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                        {provenance === "historical_import" ? <Info size={14} className="mt-0.5 shrink-0" /> : <RotateCcw size={14} className="mt-0.5 shrink-0" />}
                        <span>{provenance === "historical_import" ? "Imported historical response" : "Prefilled from the previous report"}. Please review it.</span>
                      </div>
                    )}
                    <div className="mt-4">
                      <QuestionField question={q} value={answers[q.id]} disabled={readOnly}
                        change={(value) => { setAnswers((current) => ({ ...current, [q.id]: value })); setAnswerProvenance((current) => ({ ...current, [q.id]: "manual" })); }}
                        save={(value) => void commit(q, value)} />
                    </div>
                  </article>
                );
              })}
            </div>

            {!pageRequiredComplete && <p className="mt-7 text-sm font-medium text-[#b01710]">Answer all required questions on this page to continue.</p>}
            <footer className="mt-9 flex flex-col-reverse justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
              <Button variant="secondary" disabled={activePageIndex === 0} onClick={() => setActivePageIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={16} className="mr-1.5" /> Previous page</Button>
              {activePageIndex < pages.length - 1 ? (
                <Button disabled={!pageRequiredComplete} onClick={() => void continueToNextPage()}>Save &amp; next page <ArrowRight size={16} className="ml-1.5" /></Button>
              ) : readOnly ? (
                <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setShowPrintPreview(true)}><Eye size={16} className="mr-1.5" /> Review report</Button><Button onClick={() => window.print()}><Printer size={16} className="mr-1.5" /> Print / Save PDF</Button></div>
              ) : (
                <Button disabled={!pageRequiredComplete} onClick={() => setConfirmSubmit(true)}>Review &amp; submit <Check size={16} className="ml-1.5" /></Button>
              )}
            </footer>
          </div>
        </main>
      </div>

      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={() => setShowPrintPreview(false)}>
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" role="dialog" aria-modal="true" aria-labelledby="review-title" onMouseDown={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div><p className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Submission review</p><h2 id="review-title" className="text-lg font-bold text-slate-900">{version.reporting_year} Climate Transition Plan</h2></div>
              <div className="flex gap-2"><Button size="small" onClick={() => window.print()}><Printer size={15} className="mr-1.5" /> Print / Save PDF</Button><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" onClick={() => setShowPrintPreview(false)} aria-label="Close review"><X size={18} /></button></div>
            </header>
            <div className="space-y-8 overflow-y-auto p-5 sm:p-8">
              {pages.map((page) => <ReportPage key={page.key} title={page.title} questions={page.questions} answers={answers} />)}
            </div>
          </section>
        </div>
      )}

      <div className="hidden print:block print-document font-sans">
        <section className="stica-report-cover flex min-h-[950px] flex-col justify-between bg-[#d91f17] p-14 text-white">
          <p className="text-sm font-extrabold uppercase tracking-[0.25em]">The Scandinavian Textile Initiative for Climate Action</p>
          <div><p className="text-xs font-bold uppercase tracking-[0.3em] text-white/80">Signatory Climate Transition Plan Disclosure</p><h1 className="mt-3 text-5xl font-black">{version.reporting_year} PROGRESS REPORT</h1><p className="mt-3 text-lg font-bold">{version.name}</p></div>
          <p className="border-t border-white/30 pt-5 text-xs">Status: {submission.status} · Submission #{submission.id}</p>
        </section>
        <div className="stica-page-break" />
        <header className="mb-8 border-b-2 border-slate-900 pb-5 pt-6"><p className="text-xs font-bold uppercase tracking-widest text-[#d91f17]">STICA annual reporting</p><h1 className="mt-1 text-2xl font-bold">Climate Transition Plan Report</h1><p className="mt-1 text-sm text-slate-600">{answered} of {visible.length} questions completed</p></header>
        <main className="space-y-8">{pages.map((page) => <ReportPage key={page.key} title={page.title} questions={page.questions} answers={answers} />)}</main>
      </div>
    </>
  );
}

function ReportPage({ title, questions, answers }: { title: string; questions: SurveyQuestion[]; answers: Record<number, JsonAnswer> }) {
  return (
    <section className="print-section">
      <h2 className="mb-3 border-b border-slate-300 pb-2 text-sm font-bold uppercase tracking-wider text-slate-900">{title}</h2>
      <div className="divide-y divide-slate-200">
        {questions.map((q) => <article key={q.id} className="print-row py-3"><div className="mb-1 flex justify-between gap-3 text-xs text-slate-500"><code className="font-mono font-bold text-slate-700">{q.stableKey}</code><span>{q.category}</span></div><h3 className="mb-2 text-sm font-semibold text-slate-900">{q.prompt}</h3><div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-sm">{isAnswered(answers[q.id]) ? <span className="whitespace-pre-wrap font-medium text-slate-900">{valueAsText(answers[q.id])}</span> : <span className="italic text-slate-400">Not answered</span>}</div></article>)}
      </div>
    </section>
  );
}
