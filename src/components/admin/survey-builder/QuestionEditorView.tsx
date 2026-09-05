import { ArrowLeft, Plus, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { slugify, type QuestionType, type SurveyQuestion } from "../../../lib/portal";
import { Button } from "../../ui";
import type { QuestionForm, SurveySection } from "./model";
import type { SurveyBuilderController } from "./useSurveyBuilder";
import type { PreviousQuestion } from "./usePreviousQuestions";
import { AnswerDetailsEditor } from "./AnswerDetailsEditor";

const fieldClass = "w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10";
const labelClass = "flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";

export function QuestionEditorView({ controller }: { controller: SurveyBuilderController }) {
  const { form, setForm, questions, sections, busy, canSaveQuestion, cancelQuestion, saveQuestion } = controller;
  return (
    <>
      <button className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950" onClick={cancelQuestion}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to question builder
      </button>
      <header className="mb-5 max-w-3xl">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">{form.id ? "Edit question" : "Add question"}</p>
        <h1 className="max-w-[22ch] text-balance text-[clamp(1.8rem,3vw,2.35rem)] leading-[1.08] tracking-[-0.035em]">{form.id ? `Edit ${form.stableKey}` : "Create a question"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Write it exactly as companies should see it. Only the essentials are shown.</p>
      </header>
      <form className="mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-xl border border-slate-300 bg-white p-5 sm:p-7" onSubmit={saveQuestion}>
        <PageSelector form={form} sections={sections} setForm={setForm} />
        <QuestionBasics form={form} questionNumber={form.id ? questions.findIndex((question) => question.id === form.id) + 1 : questions.length + 1} setForm={setForm} />
        {(form.type === "single_choice" || form.type === "multiple_choice") && <ChoiceEditor form={form} setForm={setForm} />}
        <AnswerDetailsEditor form={form} setForm={setForm} />
        <AdvancedSettings form={form} questions={questions} setForm={setForm} previous={controller.previous} />
        <footer className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-6 sm:flex sm:items-center sm:justify-end">
          <Button className="order-1 sm:order-none" variant="secondary" onClick={cancelQuestion} disabled={busy}>Cancel</Button>
          {!form.id && <Button className="order-3 col-span-2 sm:order-none sm:col-auto" type="submit" name="saveMode" value="another" disabled={busy || !canSaveQuestion}>Save &amp; add another</Button>}
          <Button className="order-2 sm:order-none" type="submit" name="saveMode" value="done" variant="primary" disabled={busy || !canSaveQuestion}>{busy ? "Saving…" : "Done"}</Button>
        </footer>
      </form>
    </>
  );
}

type FormSectionProps = {
  form: QuestionForm;
  setForm: Dispatch<SetStateAction<QuestionForm>>;
};

function PageSelector({ form, sections, setForm }: FormSectionProps & { sections: SurveySection[] }) {
  const existingPage = sections.some(([key]) => key === form.sectionKey);
  return <>
    {sections.length > 0 && (
      <label className="grid gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">Survey page
        <select value={existingPage ? form.sectionKey : "__new"} className={fieldClass} onChange={(event) => {
          const page = sections.find(([key]) => key === event.target.value);
          setForm((current) => page
            ? { ...current, sectionKey: page[0], sectionTitle: page[1], category: page[1] }
            : { ...current, sectionKey: "", sectionTitle: "", category: "" });
        }}>
          <option value="__new">+ Create a new page</option>
          {sections.map(([key, title], index) => <option key={key} value={key}>Page {index + 1}: {title}</option>)}
        </select>
      </label>
    )}
    {!existingPage && (
      <label className={labelClass}>Page name
        <input value={form.sectionTitle} placeholder="e.g. Governance and targets" required className={fieldClass}
          onChange={(event) => setForm((current) => ({
            ...current,
            sectionTitle: event.target.value,
            sectionKey: slugify(event.target.value),
            category: current.category === current.sectionTitle ? event.target.value : current.category,
          }))} />
      </label>
    )}
  </>;
}

function QuestionBasics({ form, questionNumber, setForm }: FormSectionProps & { questionNumber: number }) {
  return <>
    <label className="grid gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-[3rem_minmax(0,1fr)] sm:items-start">
      <span className="grid size-11 place-items-center rounded-lg border border-slate-300 bg-slate-50 text-sm font-extrabold text-slate-900">Q{questionNumber}</span>
      <textarea rows={2} value={form.prompt} placeholder="Enter your question" aria-label="Question text" autoFocus required
        onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
        className="min-h-20 w-full resize-y rounded-lg border-[1.5px] border-slate-300 bg-white px-4 py-3 text-lg font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10" />
    </label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className={labelClass}>Question type
        <select value={form.type} className={fieldClass} onChange={(event) => {
          const type = event.target.value as QuestionType;
          const needsChoices = type === "single_choice" || type === "multiple_choice";
          setForm((current) => ({ ...current, type, options: needsChoices && !current.options ? "\n\n" : current.options }));
        }}>
          <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option>
          <option value="yes_no">Yes / No</option><option value="single_choice">Multiple choice (one answer)</option>
          <option value="multiple_choice">Checkboxes (multiple answers)</option><option value="date">Date</option>
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50 has-[:checked]:border-[#d91f17] has-[:checked]:bg-red-50">
        <input type="checkbox" checked={form.required} onChange={(event) => setForm((current) => ({ ...current, required: event.target.checked }))} className="size-4 rounded accent-[#d91f17]" /> Required
      </label>
    </div>
  </>;
}

function ChoiceEditor({ form, setForm }: FormSectionProps) {
  const choices = form.options.split("\n");
  const completed = choices.filter((choice) => choice.trim()).length;
  const replaceChoices = (next: string[]) => setForm((current) => ({ ...current, options: next.join("\n") }));
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Answer choices</legend>
      <div className="mt-1 grid gap-2.5">
        {choices.map((choice, index) => (
          <div key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] items-center gap-2">
            <span className={`size-4 border border-slate-400 bg-white ${form.type === "single_choice" ? "rounded-full" : "rounded"}`} aria-hidden="true" />
            <input value={choice} placeholder={`Enter answer choice ${index + 1}`} aria-label={`Answer choice ${index + 1}`} required={index < 2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"
              onChange={(event) => replaceChoices(choices.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
                if (pasted.length < 2) return;
                event.preventDefault();
                replaceChoices([...choices.slice(0, index).filter(Boolean), ...pasted, ...choices.slice(index + 1).filter(Boolean)]);
              }} />
            <button type="button" onClick={() => replaceChoices(choices.filter((_, itemIndex) => itemIndex !== index))}
              className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-red-700" aria-label={`Remove answer choice ${index + 1}`}><X size={16} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => replaceChoices([...choices, ""])} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#b01710] hover:text-[#d91f17]"><Plus size={15} aria-hidden="true" /> Add choice</button>
        <span className="text-xs text-slate-500">Tip: paste a list to create several choices at once.</span>
      </div>
      {completed < 2 && <p className="mt-2 text-xs font-semibold text-[#b01710]">Add at least two answer choices.</p>}
    </fieldset>
  );
}

function AdvancedSettings({ form, questions, setForm, previous }: FormSectionProps & { questions: SurveyQuestion[]; previous: { questions: PreviousQuestion[]; error: string } }) {
  const position = questions.find(question => question.id === form.id)?.displayOrder ?? Infinity;
  const availableQuestions = questions.filter((question) => question.displayOrder < position);
  const conditionQuestion = questions.find((question) => question.stableKey === form.condition);
  const questionOptions = (emptyLabel: string) => <>
    <option value="">{emptyLabel}</option>
    {availableQuestions.map((question, index) => <option key={question.id} value={question.stableKey}>Q{index + 1}: {question.prompt}</option>)}
  </>;
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700 marker:hidden">More settings <span className="ml-1 text-xs font-normal text-slate-500">Help text, logic and prefill</span></summary>
      <div className="grid gap-5 border-t border-slate-200 p-4 sm:p-5">
        <label className={labelClass}>Help text / guidance
          <textarea value={form.help} placeholder="Optional guidance shown below the question." className={`${fieldClass} resize-y`}
            onChange={(event) => setForm((current) => ({ ...current, help: event.target.value }))} />
        </label>
        {form.type === "single_choice" && (
          <label className={labelClass}>Answer display
            <select value={form.presentation} className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, presentation: event.target.value as QuestionForm["presentation"] }))}>
              <option value="radio">Radio buttons — easiest to scan</option><option value="dropdown">Dropdown — best for long lists</option>
            </select>
          </label>
        )}
        <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div><legend className="text-sm font-bold text-slate-900">Prefill from last year</legend><p className="text-xs text-slate-500">Choose a previous question when this answer should be carried forward.</p></div>
          <label className={labelClass}>Previous question
            <select value={form.carry} disabled={Boolean(previous.error)} className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, carry: event.target.value }))}>
              <option value="">No prefilled answer</option>
              {form.carry && !previous.questions.some(question => question.key === form.carry) && <option value={form.carry}>{form.carry} (existing mapping — source unavailable)</option>}
              {previous.questions.map(question => <option key={question.key} value={question.key}>{question.year} · {question.key}: {question.prompt}</option>)}
            </select>
            {previous.error && <span role="alert" className="text-red-700">{previous.error}</span>}
            {!previous.error && !previous.questions.length && <span className="font-normal normal-case tracking-normal">No questions from an earlier reporting year are available.</span>}
          </label>
        </fieldset>
        <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div><legend className="text-sm font-bold text-slate-900">Show only when</legend><p className="text-xs text-slate-500">Optional. Choose an earlier question and the answer that reveals this one.</p></div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <label className={labelClass}>Previous question
              <select value={form.condition} className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value, expected: "" }))}>{questionOptions("Always show this question")}</select>
            </label>
            {form.condition && <label className={labelClass}>Operator
              <select value={form.operator} className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, operator: event.target.value }))}>
                <option value="equals">Answer is</option><option value="not_equals">Answer is not</option><option value="contains">Answer includes</option><option value="is_answered">Has any answer</option>
              </select>
            </label>}
          </div>
          {form.condition && form.operator !== "is_answered" && (
            <label className={labelClass}>Trigger answer
              {conditionQuestion && (conditionQuestion.type === "yes_no" || conditionQuestion.options.length > 0) ? (
                <select value={form.expected} className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, expected: event.target.value }))}>
                  <option value="">Choose an answer</option>
                  {(conditionQuestion.type === "yes_no" ? ["Yes", "No"] : conditionQuestion.options).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : <input value={form.expected} placeholder="Enter the answer" className={fieldClass} onChange={(event) => setForm((current) => ({ ...current, expected: event.target.value }))} />}
            </label>
          )}
        </fieldset>
      </div>
    </details>
  );
}
