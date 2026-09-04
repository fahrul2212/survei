import { ArrowLeft } from "lucide-react";
import { Button } from "../../ui";
import type { SurveyBuilderController } from "./useSurveyBuilder";

const fieldClass = "w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10";
const labelClass = "flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500";

export function CreateSurveyView({ controller }: { controller: SurveyBuilderController }) {
  const { versions, busy, yearDraft, setYearDraft, setView, createSurvey } = controller;
  return (
    <>
      <button className="mb-4 inline-flex w-fit items-center text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={() => setView("overview")}>
        <ArrowLeft size={16} className="mr-1.5" aria-hidden="true" /> Back to surveys
      </button>
      <header className="mb-10">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">New survey cycle</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Create survey</h1>
        <p className="mt-2 text-slate-500">Choose its reporting year, then start empty or clone an existing survey. A year can contain more than one survey.</p>
      </header>
      <form className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8" onSubmit={createSurvey}>
        <div className="flex flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50 p-4" role="note">
          <strong className="text-[13px] font-bold uppercase tracking-wider text-blue-700">Draft first, publish when ready</strong>
          <span className="text-[15px] font-medium text-blue-900">A new survey starts as an editable draft. It will not be visible to companies until you publish it.</span>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <label className={labelClass}>Year
            <input name="year" type="number" value={yearDraft.year} required className={fieldClass}
              onChange={(event) => setYearDraft({ year: event.target.value, name: `Climate Transition Plan Annual Report ${event.target.value}` })} />
          </label>
          <label className={labelClass}>Name
            <input name="name" value={yearDraft.name} required className={fieldClass}
              onChange={(event) => setYearDraft({ ...yearDraft, name: event.target.value })} />
          </label>
          <label className={labelClass}>Opens<input name="opens" type="datetime-local" className={fieldClass} /></label>
          <label className={labelClass}>Closes<input name="closes" type="datetime-local" className={fieldClass} /></label>
        </div>
        <label className={labelClass}>Clone from existing survey
          <select name="clone" className={fieldClass}>
            <option value="">Start empty</option>
            {versions.map((version) => <option key={version.id} value={version.id}>{version.reporting_year} · {version.name}</option>)}
          </select>
        </label>
        <footer className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => setView("overview")} disabled={busy}>Cancel</Button>
          <Button disabled={busy}>{busy ? "Creating draft…" : "Create draft cycle"}</Button>
        </footer>
      </form>
    </>
  );
}
