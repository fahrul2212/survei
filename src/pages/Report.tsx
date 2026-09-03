import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Eye, FileText, Info, ListX, LockKeyhole, Printer, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Button, EmptyState, QuestionField } from "../components/ui";
import { evaluateVisibility, isAnswered, valueAsText, type JsonAnswer, type Submission, type SurveyQuestion, type SurveyVersion } from "../lib/portal";

export function Report({
  version,
  submission,
  questions,
  answers,
  answerProvenance,
  setAnswers,
  setAnswerProvenance,
  save,
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
  setAnswerProvenance: React.Dispatch<React.SetStateAction<Record<number, "manual" | "prefilled" | "historical_import">>>;
  save: (q: SurveyQuestion, v: JsonAnswer) => Promise<void>;
  submit: () => Promise<void>;
  back: () => void;
  editable?: boolean;
}) {
  const visible = questions.filter((q) => evaluateVisibility(q, questions, answers));
  const [activeId, setActiveId] = useState(visible[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string>("all");

  const readOnly = !editable || submission.status === "submitted" || version.status !== "published";
  const readOnlyLabel = !editable ? "Viewer access · read only" : version.status === "closed" ? "Survey closed" : "Submitted · read only";
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;

  const sectionKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of visible) {
      map.set(q.sectionKey, q.sectionTitle);
    }
    return Array.from(map.entries());
  }, [visible]);

  const groupedSections = useMemo(() => {
    const map = new Map<string, { title: string; questions: SurveyQuestion[] }>();
    for (const q of visible) {
      if (!map.has(q.sectionKey)) {
        map.set(q.sectionKey, { title: q.sectionTitle, questions: [] });
      }
      map.get(q.sectionKey)!.questions.push(q);
    }
    return Array.from(map.values());
  }, [visible]);

  const filteredVisible = useMemo(() => {
    if (selectedSection === "all") return visible;
    return visible.filter((q) => q.sectionKey === selectedSection);
  }, [selectedSection, visible]);

  const navigationQuestions = selectedSection === "all" ? visible : filteredVisible;
  const active = navigationQuestions.find((q) => q.id === activeId) ?? navigationQuestions[0];
  const index = navigationQuestions.indexOf(active);
  const overallIndex = visible.indexOf(active);

  useEffect(() => {
    if (active && !navigationQuestions.some((q) => q.id === activeId)) setActiveId(active.id);
  }, [active, activeId, navigationQuestions]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (index < navigationQuestions.length - 1) {
          void commit(answers[active.id] ?? null).then((saved) => {
            if (saved) setActiveId(navigationQuestions[index + 1].id);
          });
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, answers, index, navigationQuestions]);

  if (!active) {
    return (
      <div className="grid min-h-[calc(100vh-64px)] place-items-center p-6 bg-slate-50">
        <EmptyState icon={ListX} title="No visible questions" description="This section has no questions available for your current answers." action={<Button variant="secondary" onClick={back}>Back to overview</Button>} />
      </div>
    );
  }

  async function commit(v: JsonAnswer): Promise<boolean> {
    if (readOnly) return true;
    setSaving(true);
    setSaveError(false);
    try {
      await save(active, v);
      return true;
    } catch {
      setSaveError(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="interactive-report-ui grid min-h-[calc(100vh-64px)] grid-cols-1 bg-slate-50 md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[350px_minmax(0,1fr)]">
        {/* Submit confirmation dialog */}
        {confirmSubmit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" role="presentation" onMouseDown={() => setConfirmSubmit(false)}>
            <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8" role="alertdialog" aria-modal="true" aria-labelledby="submit-modal-title" onMouseDown={(e) => e.stopPropagation()}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Final submission</p>
              <h2 id="submit-modal-title" className="mb-4 text-2xl font-bold text-slate-900">Submit {version.reporting_year} Report?</h2>
              <p className="mb-6 text-[15px] leading-relaxed text-slate-600">
                You have completed <strong className="font-semibold text-slate-900">{answered} of {visible.length}</strong> questions ({visible.length ? Math.round((answered / visible.length) * 100) : 0}%).
              </p>
              <div className="mb-8 rounded-lg bg-amber-50 p-4">
                <span className="text-sm font-medium text-amber-800">Once submitted, your report is locked for review. An administrator must reopen it if any revisions are needed.</span>
              </div>
              <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
                <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>
                  Continue editing
                </Button>
                <Button
                  onClick={async () => {
                    setConfirmSubmit(false);
                    await submit();
                  }}
                >
                  Confirm &amp; submit report
                </Button>
              </div>
            </section>
          </div>
        )}

        <aside className="flex flex-col border-b border-slate-200 bg-white p-5 md:sticky md:top-[64px] md:h-[calc(100vh-64px)] md:overflow-y-auto md:border-b-0 md:border-r md:p-6">
          <button className="mb-4 inline-flex w-fit items-center text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={back}>
            <ArrowLeft size={16} className="mr-1.5" /> Back to overview
          </button>
          <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Annual report {version.reporting_year}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {readOnly ? <><LockKeyhole size={12} /> {version.status === "closed" ? "Closed" : "Read only"}</> : saving ? <><Clock3 size={12} /> Saving…</> : saveError ? <><TriangleAlert size={12} /> Save failed</> : <><Check size={12} /> Saved</>}
          </span>
        </div>
        <h2 className="mb-3.5 text-xl font-bold leading-tight text-slate-900">{active.sectionTitle}</h2>
        
        <div className="mb-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#d91f17] transition-[width] duration-300" style={{ width: `${visible.length ? (answered / visible.length) * 100 : 0}%` }} />
          </div>
          <small className="mt-1.5 block text-xs font-semibold text-slate-500">{answered} of {visible.length} answered ({visible.length ? Math.round((answered / visible.length) * 100) : 0}%)</small>
        </div>

        {/* Section Filter */}
        {sectionKeys.length > 1 && (
          <div className="mb-2">
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#d91f17] focus:ring-1 focus:ring-[#d91f17]"
            >
              <option value="all">All sections ({visible.length} questions)</option>
              {sectionKeys.map(([k, t]) => (
                <option key={k} value={k}>{t} ({visible.filter((q) => q.sectionKey === k).length})</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 py-2 text-xs font-bold text-slate-700">
            <span>Question navigator</span>
            <strong className="text-[#d91f17]">{answered}/{visible.length}</strong>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 py-2.5 text-[11px] font-semibold text-slate-500" aria-label="Question status legend">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" />Answered</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-slate-200" />Unanswered</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#d91f17]" />Current</span>
          </div>
          <div className="grid max-h-48 min-h-0 flex-1 grid-cols-5 content-start gap-1.5 overflow-y-auto overscroll-contain pb-5 pr-1 pt-1 [scrollbar-width:none] md:max-h-none [&::-webkit-scrollbar]:hidden" role="navigation" aria-label="Question navigator" tabIndex={0}>
            {navigationQuestions.map((q) => {
              const overallIdx = visible.indexOf(q);
              const isQAnswered = isAnswered(answers[q.id]);
              const isActive = q.id === active.id;
              
              return (
                <button
                  key={q.id}
                  className={`relative grid aspect-square w-full place-items-center rounded-lg border-[1.5px] text-sm font-bold transition-colors ${
                    isActive
                      ? "z-10 border-[#d91f17] bg-[#d91f17] text-white"
                      : isQAnswered
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                  aria-label={`Question ${overallIdx + 1}, ${isQAnswered ? "answered" : "not answered"}: ${q.prompt}`}
                  title={`${overallIdx + 1}. ${q.prompt}`}
                  onClick={() => setActiveId(q.id)}
                >
                  <span>{overallIdx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="grid place-items-center p-6 md:p-14 lg:p-20">
        <div className="w-full max-w-[840px] rounded-2xl border border-slate-200 bg-white p-6 md:p-10 lg:p-12" key={active.id}>
          <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Question {overallIndex + 1} of {visible.length}</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                {readOnly ? <><LockKeyhole size={13} /> {readOnlyLabel}</> : saving ? <><Clock3 size={13} /> Saving securely…</> : saveError ? <><TriangleAlert size={13} /> Could not save</> : <><Check size={13} /> All changes saved</>}
              </span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">{active.stableKey}</code>
            </div>
          </div>
          
          <p className="mb-3 text-[13px] font-bold uppercase tracking-wider text-[#d91f17]">{active.sectionTitle} / {active.category}</p>
          <h1 className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-4xl">{active.prompt}</h1>
          
          {active.helpText && <p className="mb-6 text-[15px] leading-relaxed text-slate-600">{active.helpText}</p>}
          
          {(answerProvenance[active.id] === "prefilled" || answerProvenance[active.id] === "historical_import") && !readOnly && (
            <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                {answerProvenance[active.id] === "historical_import" ? <Info size={14} className="text-blue-500" /> : <RotateCcw size={14} className="text-blue-500" />}
                {answerProvenance[active.id] === "historical_import" ? "Imported historical response" : "Prefilled from previous verified report"}
              </span>
              <p className="text-sm text-blue-900">Please review this response and update it if your company’s current position has changed.</p>
            </div>
          )}
          
          <label className="mb-3 block text-sm font-bold text-slate-900">
            Your answer {active.required && <em className="ml-1 text-xs font-normal not-italic text-slate-400">Required</em>}
          </label>
          
          <div className="mb-10">
            <QuestionField
              question={active}
              value={answers[active.id]}
              disabled={readOnly}
              change={(v) => {
                setAnswers((a) => ({ ...a, [active.id]: v }));
                setAnswerProvenance((current) => ({ ...current, [active.id]: "manual" }));
              }}
              save={(v) => void commit(v)}
            />
          </div>
          
          <div className="flex flex-col-reverse justify-between gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setActiveId(navigationQuestions[index - 1].id)}
            >
              <ArrowLeft size={16} aria-hidden="true" className="mr-1.5" /> Previous
            </Button>
            
            {index < navigationQuestions.length - 1 ? (
              <Button
                onClick={async () => {
                  const saved = await commit(answers[active.id] ?? null);
                  if (saved) setActiveId(navigationQuestions[index + 1].id);
                }}
              >
                Save &amp; next <ArrowRight size={16} aria-hidden="true" className="ml-1.5" />
              </Button>
            ) : readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => setShowPrintPreview(true)}>
                  <Eye size={16} aria-hidden="true" className="mr-1.5" /> Review full report
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer size={16} aria-hidden="true" className="mr-1.5" /> Print / Save PDF
                </Button>
              </div>
            ) : (
              <Button onClick={() => setConfirmSubmit(true)}>
                Review &amp; submit <Check size={16} aria-hidden="true" className="ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>

    {/* Full Report Review Modal (Interactive on-screen preview) */}
    {showPrintPreview && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 sm:p-6"
        role="presentation"
        onMouseDown={() => setShowPrintPreview(false)}
      >
        <section
          className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-dialog-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Submission review</p>
              <h2 id="review-dialog-title" className="text-lg font-bold text-slate-900">
                {version.reporting_year} Annual Climate Transition Plan Report
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button size="small" onClick={() => window.print()}>
                <Printer size={15} aria-hidden="true" className="mr-1.5" /> Print / Save PDF
              </Button>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowPrintPreview(false)}
                aria-label="Close review"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-6 sm:p-8 space-y-8">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 flex flex-wrap justify-between gap-4">
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">Status</span>
                <strong className="text-sm font-bold text-slate-900 capitalize">{submission.status}</strong>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">Questions Completed</span>
                <strong className="text-sm font-bold text-slate-900">{answered} of {visible.length} ({visible.length ? Math.round((answered / visible.length) * 100) : 0}%)</strong>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">Submission Date</span>
                <strong className="text-sm font-bold text-slate-900">
                  {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString("en-GB") : "In Progress"}
                </strong>
              </div>
            </div>

            {groupedSections.map((section) => (
              <div key={section.title} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-2">
                  {section.title}
                </h3>
                <div className="space-y-3">
                  {section.questions.map((q) => {
                    const val = answers[q.id];
                    const hasAnswer = isAnswered(val);
                    return (
                      <div key={q.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <code className="font-mono font-bold text-slate-700">{q.stableKey}</code>
                          <span className="text-[11px] font-semibold text-slate-400">{q.category}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mb-2 leading-snug">{q.prompt}</p>
                        <div className="rounded border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                          {hasAnswer ? (
                            <span className="font-medium text-slate-900 whitespace-pre-wrap">{valueAsText(val)}</span>
                          ) : (
                            <span className="italic text-slate-400">Not answered</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )}

    {/* Official Document Layout for @media print */}
    <div className="hidden print:block print-document font-sans">
      <header className="border-b-2 border-slate-900 pb-6 mb-8">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#d91f17]">
              The Scandinavian Textile Initiative for Climate Action
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Annual Climate Transition Plan Report
            </h1>
            <p className="text-sm font-medium text-slate-600 mt-1">
              Reporting Cycle: {version.reporting_year} · {version.name}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block border border-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-900">
              {submission.status === "submitted" ? "Official Submission" : "Draft Report"}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              {submission.submitted_at
                ? `Submitted: ${new Date(submission.submitted_at).toLocaleDateString("en-GB")}`
                : `Generated: ${new Date().toLocaleDateString("en-GB")}`}
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-6 text-xs text-slate-600 border-t border-slate-200 pt-3">
          <span>
            <strong>Completion:</strong> {answered} of {visible.length} questions ({visible.length ? Math.round((answered / visible.length) * 100) : 0}%)
          </span>
          <span>
            <strong>Submission ID:</strong> #{submission.id}
          </span>
        </div>
      </header>

      <main className="space-y-8">
        {groupedSections.map((section) => (
          <section key={section.title} className="print-section">
            <h2 className="text-base font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-2 mb-4">
              {section.title}
            </h2>
            <div className="divide-y divide-slate-200">
              {section.questions.map((q) => {
                const val = answers[q.id];
                const isQAnswered = isAnswered(val);
                const prov = answerProvenance[q.id];
                return (
                  <article key={q.id} className="print-row py-3.5">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span className="font-mono font-bold text-slate-700">{q.stableKey}</span>
                      <span className="uppercase text-[10px] font-semibold">
                        {q.category} {prov === "prefilled" && "· Prefilled"}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-2 leading-snug">{q.prompt}</h3>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-sm">
                      {isQAnswered ? (
                        <span className="font-medium text-slate-900 break-words whitespace-pre-wrap">
                          {valueAsText(val)}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">No response provided</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      <footer className="mt-12 border-t border-slate-300 pt-4 text-xs text-slate-400 flex justify-between">
        <span>STICA Climate Transition Plan Reporting Portal</span>
        <span>Confidential &amp; Verified Institutional Reporting Record</span>
      </footer>
    </div>
  </>
);
}
