import type { SurveyBuilderController } from "./useSurveyBuilder";

export function DeleteQuestionDialog({ controller }: { controller: SurveyBuilderController }) {
  const { pendingDelete: question, selectedVersion, busy, setPendingDelete, removeQuestion } = controller;
  if (!question) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingDelete(null); }}>
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl md:p-8" role="alertdialog" aria-modal="true" aria-labelledby="delete-question-title">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Delete draft question</p>
        <h2 id="delete-question-title" className="mb-3 text-2xl font-bold tracking-tight text-slate-900">Remove {question.stableKey}?</h2>
        <p className="text-[15px] leading-relaxed text-slate-600">This removes the question only from the {selectedVersion?.reporting_year} draft. Published years and historical answers remain unchanged.</p>
        <div className="my-6 flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <code>{question.stableKey}</code><strong>{question.prompt}</strong>
        </div>
        <footer className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5 md:-mx-8 md:-mb-8">
          <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</button>
          <button type="button" className="rounded-lg bg-[#d91f17] px-4 py-2 text-sm font-bold text-white hover:bg-[#b01710]" onClick={() => void removeQuestion(question)} disabled={busy} aria-busy={busy}>
            {busy ? "Deleting…" : "Delete question"}
          </button>
        </footer>
      </section>
    </div>
  );
}
