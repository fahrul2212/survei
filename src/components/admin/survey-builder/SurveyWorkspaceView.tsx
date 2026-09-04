import { ArrowDown, ArrowUp, ClipboardPlus, Copy, Plus } from "lucide-react";
import type { SurveyQuestion } from "../../../lib/portal";
import { Button, EmptyState, SearchField } from "../../ui";
import { SurveyPreview } from "../SurveyPreview";
import { SurveyWorkspaceHeader } from "../SurveyWorkspaceHeader";
import { QUESTION_TYPE_LABELS, type SurveySection } from "./model";
import type { SurveyBuilderController } from "./useSurveyBuilder";

export function SurveyWorkspaceView({ controller }: { controller: SurveyBuilderController }) {
  const {
    selectedVersion: version, questions, carry, filteredQuestions, sections, qSearch, qSectionFilter,
    busy, openingVersion, previewMode, setPreviewMode, setView, setQSearch, setQSectionFilter,
    beginCreateSurvey, beginAddQuestion, beginNewPage, editQuestion, duplicateQuestion,
    setPendingDelete, reorderQuestion, updateLifecycle,
  } = controller;
  if (!version) return null;

  return (
    <>
      <SurveyWorkspaceHeader
        version={version}
        questionCount={questions.length}
        previewMode={previewMode}
        busy={busy}
        onBack={() => { setView("overview"); setPreviewMode(false); }}
        onTogglePreview={() => setPreviewMode((current) => !current)}
        onPublish={() => void updateLifecycle("publish")}
        onClose={() => void updateLifecycle("close")}
        onReopen={() => void updateLifecycle("reopen")}
      />

      {version.status !== "draft" && (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between" role="note">
          <div className="min-w-0">
            <strong className="block font-bold text-slate-900">This survey is {version.status === "published" ? "published (active)." : "closed (archived)."}</strong>
            <span className="mt-1 block leading-6 text-slate-600">
              {version.status === "published"
                ? "Published questions are locked to preserve stable IDs and longitudinal integrity. To modify the structure, create another draft survey."
                : "Closed surveys remain preserved for historical reporting and audit. Reopening keeps all responses and snapshots intact."}
            </span>
          </div>
          {version.status === "published" && (
            <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50" onClick={beginCreateSurvey}>
              Create another survey
            </button>
          )}
        </div>
      )}

      {previewMode ? <SurveyPreview questions={questions} carry={carry} /> : (
        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white">
          <WorkspaceToolbar
            questionCount={questions.length}
            search={qSearch}
            onSearch={(value) => setQSearch(value)}
          />
          <div className="grid min-w-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <SurveyPageNav
              sections={sections}
              questions={questions}
              activeSection={qSectionFilter}
              editable={version.status === "draft"}
              onSelect={setQSectionFilter}
              onCreate={beginNewPage}
            />
            <div className="min-w-0">
              {questions.length > 0 && (
                <div className="sticky top-[64px] z-10 flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">Current page</p>
                    <h2 className="mt-1 truncate text-lg font-bold text-slate-950">{sections.find(([key]) => key === qSectionFilter)?.[1] ?? "Questions"}</h2>
                  </div>
                  {version.status === "draft" && <Button icon={Plus} variant="primary" size="small" onClick={beginAddQuestion}>Add question</Button>}
                </div>
              )}
              {openingVersion === version.id ? <QuestionsLoading /> : filteredQuestions.length === 0 ? (
                <EmptyState
                  icon={ClipboardPlus}
                  title={questions.length === 0 ? "Start the first survey page" : "No matching questions"}
                  description={questions.length === 0
                    ? "Add the first question. Its page and question ID are prepared automatically."
                    : "Try a different search term or choose another page."}
                  action={version.status === "draft" && questions.length === 0
                    ? <Button icon={Plus} variant="primary" onClick={beginAddQuestion}>Add first question</Button>
                    : qSearch ? <Button variant="secondary" onClick={() => setQSearch("")}>Clear search</Button> : undefined}
                />
              ) : filteredQuestions.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  questions={questions}
                  carryKey={carry[question.id]}
                  editable={version.status === "draft"}
                  busy={busy}
                  onEdit={editQuestion}
                  onDuplicate={duplicateQuestion}
                  onDelete={setPendingDelete}
                  onReorder={reorderQuestion}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function WorkspaceToolbar({ questionCount, search, onSearch }: { questionCount: number; search: string; onSearch: (value: string) => void }) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Question builder</p>
        <h2 className="text-lg font-bold text-slate-900">Build questions page by page</h2>
      </div>
      {questionCount > 0 && (
        <SearchField aria-label="Search survey questions" placeholder="Search questions" value={search}
          onChange={(event) => onSearch(event.target.value)} className="w-full sm:w-64" />
      )}
    </header>
  );
}

function SurveyPageNav({ sections, questions, activeSection, editable, onSelect, onCreate }: {
  sections: SurveySection[];
  questions: SurveyQuestion[];
  activeSection: string;
  editable: boolean;
  onSelect: (key: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="min-w-0 border-b border-slate-200 bg-slate-50 p-4 lg:border-b-0 lg:border-r lg:p-5" aria-label="Survey pages">
      <div className="mb-3">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Pages</p>
        <p className="mt-1 text-xs font-semibold text-slate-600">{sections.length} pages · {questions.length} questions</p>
      </div>
      <nav className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-2 lg:grid lg:overflow-visible" aria-label="Choose a survey page">
        {sections.map(([key, title], index) => {
          const active = key === activeSection;
          const count = questions.filter((question) => question.sectionKey === key).length;
          return (
            <button key={key} type="button" onClick={() => onSelect(key)} aria-current={active ? "page" : undefined}
              className={`min-w-56 rounded-lg border px-3 py-3 text-left transition-colors lg:min-w-0 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}>
              <span className={`block text-[10px] font-bold uppercase tracking-wider ${active ? "text-slate-300" : "text-slate-400"}`}>Page {index + 1}</span>
              <span className="mt-1 block text-sm font-bold leading-5">{title}</span>
              <span className={`mt-1 block text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>{count} questions</span>
            </button>
          );
        })}
      </nav>
      {editable && questions.length > 0 && (
        <button type="button" onClick={onCreate} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-500">
          <Plus size={15} aria-hidden="true" /> New page
        </button>
      )}
    </aside>
  );
}

function QuestionRow({ question, questions, carryKey, editable, busy, onEdit, onDuplicate, onDelete, onReorder }: {
  question: SurveyQuestion;
  questions: SurveyQuestion[];
  carryKey?: string;
  editable: boolean;
  busy: boolean;
  onEdit: (question: SurveyQuestion) => void;
  onDuplicate: (question: SurveyQuestion) => void;
  onDelete: (question: SurveyQuestion) => void;
  onReorder: (question: SurveyQuestion, direction: "up" | "down") => Promise<void>;
}) {
  const moveButton = "grid size-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-900 hover:text-white disabled:pointer-events-none disabled:opacity-40";
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-b border-slate-100 p-4 transition-colors last:border-b-0 hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start md:p-5">
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        {editable && <>
          <button type="button" className={moveButton} title="Move up" disabled={busy || question.displayOrder === questions[0]?.displayOrder}
            onClick={() => void onReorder(question, "up")}><ArrowUp size={13} aria-hidden="true" /></button>
          <button type="button" className={moveButton} title="Move down" disabled={busy || question.displayOrder === questions.at(-1)?.displayOrder}
            onClick={() => void onReorder(question, "down")}><ArrowDown size={13} aria-hidden="true" /></button>
        </>}
        <span className="text-xs font-bold tabular-nums text-slate-400">{question.displayOrder}</span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold leading-6 text-slate-900">{question.prompt}</h3>
        <p className="mt-1 text-sm text-slate-500">{QUESTION_TYPE_LABELS[question.type]}{question.required ? " · Required" : ""}{carryKey ? ` / Prefill: ${carryKey}` : ""}</p>
      </div>
      {editable && (
        <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-self-end" aria-label={`Actions for ${question.stableKey}`}>
          <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50" onClick={() => onEdit(question)}>Edit</button>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-slate-400 hover:bg-slate-50" onClick={() => onDuplicate(question)}><Copy size={13} aria-hidden="true" /> Duplicate</button>
          <button type="button" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:border-red-300 hover:bg-red-100" onClick={() => onDelete(question)}>Delete</button>
        </div>
      )}
    </article>
  );
}

function QuestionsLoading() {
  return <div className="grid min-h-64 place-items-center px-6 py-12 text-center" role="status">
    <div><strong className="block text-base font-bold text-slate-900">Loading questions…</strong><p className="mt-1 text-sm text-slate-500">Preparing the question workspace.</p></div>
  </div>;
}
