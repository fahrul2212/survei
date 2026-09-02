import { useState, useMemo, FormEvent, useCallback } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Edit3, GripVertical, Plus, Settings, Trash2, ClipboardPlus, RotateCcw, Search } from "lucide-react";
import { Button, NoticeBar, PageHeader, EmptyState, SearchField, type Notice } from "../ui";
import { SurveyWorkspaceHeader } from "./SurveyWorkspaceHeader";
import { QuestionField } from "../question-field";
import { supabase } from "../../lib/supabase";
import { surveyDisplayTitle, slugify, valueAsText, type SurveyVersion, type SurveyQuestion, type QuestionType } from "../../lib/portal";

// --- Types ---
type QForm = {
  id: number | null;
  stableKey: string;
  category: string;
  prompt: string;
  help: string;
  type: QuestionType;
  options: string;
  required: boolean;
  sectionKey: string;
  sectionTitle: string;
  carry: string;
  condition: string;
  operator: string;
  expected: string;
};

const EMPTY_Q: QForm = {
  id: null,
  stableKey: "",
  category: "",
  prompt: "",
  help: "",
  type: "text",
  options: "",
  required: false,
  sectionKey: "general",
  sectionTitle: "General",
  carry: "",
  condition: "",
  operator: "equals",
  expected: "",
};

const Q_PAGE_SIZE = 12;

export function SurveyBuilder({
  versions,
  questions,
  carry,
  selected,
  busy,
  qSearch,
  qSectionFilter,
  setQSearch,
  setQSectionFilter,
  setBusy,
  setNotice,
  setSelected,
  setVersions,
  setQuestions,
  setCarry,
  loadQuestions,
  load
}: {
  versions: SurveyVersion[];
  questions: SurveyQuestion[];
  carry: Record<number, string>;
  selected: number | null;
  busy: boolean;
  qSearch: string;
  qSectionFilter: string;
  setQSearch: (s: string) => void;
  setQSectionFilter: (s: string) => void;
  setBusy: (b: boolean) => void;
  setNotice: (n: Notice) => void;
  setSelected: (id: number | null) => void;
  setVersions: (v: SurveyVersion[]) => void;
  setQuestions: (q: SurveyQuestion[]) => void;
  setCarry: (c: Record<number, string>) => void;
  loadQuestions: (vId: number) => Promise<void>;
  load: (silent?: boolean, preferredId?: number) => Promise<void>;
}) {
  const [surveyView, setSurveyView] = useState<"overview" | "create-year" | "workspace" | "question">("overview");
  const [form, setForm] = useState<QForm>(EMPTY_Q);
  const [yearDraft, setYearDraft] = useState({
    year: String(new Date().getFullYear() + 1),
    name: `Climate Transition Plan Annual Report ${new Date().getFullYear() + 1}`,
  });
  const [questionPage, setQuestionPage] = useState(0);
  const [openingVersion, setOpeningVersion] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SurveyQuestion | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // Company management (Modals & Edit)

  const selectedVersion = versions.find((v) => v.id === selected);
  
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch = !qSearch || q.prompt.toLowerCase().includes(qSearch.toLowerCase()) || q.stableKey.toLowerCase().includes(qSearch.toLowerCase());
      const matchesSection = !qSectionFilter || q.sectionKey === qSectionFilter;
      return matchesSearch && matchesSection;
    });
  }, [questions, qSearch, qSectionFilter]);

// ── Survey builder actions ────────────────────────────────────────────────

  function beginCreateYear() {
    const next = Math.max(new Date().getFullYear(), ...versions.map((v) => v.reporting_year)) + 1;
    setYearDraft({ year: String(next), name: `Climate Transition Plan Annual Report ${next}` });
    setNotice(null);
    setSurveyView("create-year");
  }

  async function openVersion(v: SurveyVersion) {
    setBusy(true);
    setOpeningVersion(v.id);
    setNotice(null);
    setSelected(v.id);
    setQuestionPage(0);
    setQuestions([]);
    setForm(EMPTY_Q);
    setPreviewMode(false);
    setSurveyView("workspace");
    try {
      await loadQuestions(v.id);
    } catch (e) {
      setSurveyView("overview");
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to open reporting year" });
    } finally {
      setOpeningVersion(null);
      setBusy(false);
    }
  }

  async function createYear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("create_survey_year", {
        new_reporting_year: Number(f.get("year")),
        survey_name: String(f.get("name")),
        open_at: f.get("opens") ? new Date(String(f.get("opens"))).toISOString() : null,
        close_at: f.get("closes") ? new Date(String(f.get("closes"))).toISOString() : null,
        clone_from_survey_version_id: f.get("clone") ? Number(f.get("clone")) : null,
      });
      if (r.error) throw r.error;
      setSelected(Number(r.data));
      setQuestionPage(0);
      await load(true, Number(r.data));
      setSurveyView("workspace");
      setNotice({ kind: "success", message: `Draft ${yearDraft.year} created. You can now add or review questions.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to create reporting year" });
    } finally {
      setBusy(false);
    }
  }

  async function saveQ(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !selected) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("save_survey_question", {
        target_survey_version_id: selected,
        target_survey_question_id: form.id,
        stable_question_key: form.stableKey.toUpperCase(),
        question_category: form.category,
        question_prompt: form.prompt,
        question_help_text: form.help,
        response_type: form.type,
        response_options: form.options.split("\n").map((x) => x.trim()).filter(Boolean),
        response_validation: {},
        required_response: form.required,
        target_section_key: slugify(form.sectionKey),
        target_section_title: form.sectionTitle,
        target_visibility_rule: form.condition
          ? { questionKey: form.condition.toUpperCase(), operator: form.operator, ...(form.operator === "is_answered" ? {} : { value: form.expected }) }
          : {},
        carry_source_question_key: form.carry.toUpperCase() || null,
      });
      if (r.error) throw r.error;
      setForm(EMPTY_Q);
      await loadQuestions(selected);
      setSurveyView("workspace");
      setNotice({ kind: "success", message: "Question revision saved." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to save question" });
    } finally {
      setBusy(false);
    }
  }

  function edit(q: SurveyQuestion) {
    setForm({
      id: q.id,
      stableKey: q.stableKey,
      category: q.category,
      prompt: q.prompt,
      help: q.helpText ?? "",
      type: q.type,
      options: q.options.join("\n"),
      required: q.required,
      sectionKey: q.sectionKey,
      sectionTitle: q.sectionTitle,
      carry: carry[q.id] ?? "",
      condition: q.visibilityRule.questionKey ?? "",
      operator: q.visibilityRule.operator ?? "equals",
      expected: valueAsText(q.visibilityRule.value),
    });
    setSurveyView("question");
  }

  async function remove(q: SurveyQuestion) {
    if (!supabase || !selectedVersion || selectedVersion.status !== "draft") return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("delete_survey_question", { target_survey_question_id: q.id });
      if (r.error) throw r.error;
      await loadQuestions(selectedVersion.id);
      setPendingDelete(null);
      setNotice({ kind: "success", message: `${q.stableKey} removed from the draft.` });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to delete question" });
    } finally {
      setBusy(false);
    }
  }

  async function reorder(q: SurveyQuestion, dir: "up" | "down") {
    if (!supabase || !selectedVersion || selectedVersion.status !== "draft") return;
    setBusy(true);
    try {
      const r = await supabase.rpc("reorder_survey_question", {
        target_survey_question_id: q.id,
        direction: dir,
      });
      if (r.error) throw r.error;
      await loadQuestions(selectedVersion.id);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to reorder" });
    } finally {
      setBusy(false);
    }
  }

  async function publishYear() {
    if (!supabase || !selectedVersion) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("publish_survey_version", { target_survey_version_id: selectedVersion.id });
      if (r.error) throw r.error;
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Survey published. Companies can now access it." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to publish" });
    } finally {
      setBusy(false);
    }
  }

  async function closeYear() {
    if (!supabase || !selectedVersion) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await supabase.rpc("close_survey_year", { target_survey_version_id: selectedVersion.id });
      if (r.error) throw r.error;
      await load(true, selected ?? undefined);
      setNotice({ kind: "success", message: "Reporting year closed." });
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to close year" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
<div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">

          {/* Overview */}
          {surveyView === "overview" && (
            <>
              <PageHeader
                eyebrow="Survey management"
                title="Survey builder"
                description="Manage annual question sets, carry-forward mappings, and publishing status."
                actions={(
                  <Button icon={Plus} variant="primary" onClick={beginCreateYear}>
                    New reporting year
                  </Button>
                )}
              />
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
                  <div>
                    <p className="eyebrow">Reporting cycles</p>
                    <h3>{versions.length} reporting years</h3>
                  </div>
                  <span>Choose a year to open its workspace</span>
                </div>
                <div className="flex flex-col divide-y divide-slate-100">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => void openVersion(v)}
                      disabled={busy}
                      aria-busy={busy && selected === v.id}
                    >
                      <span>{v.reporting_year}</span>
                      <div>
                        <strong>{surveyDisplayTitle(v.name)}</strong>
                        <small>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${v.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{v.status}</span>
                        </small>
                      </div>
                      <em>{busy && selected === v.id ? "Opening…" : <>Open workspace <ArrowRight size={15} aria-hidden="true" /></>}</em>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Create year */}
          {surveyView === "create-year" && (
            <>
              <button className="mb-4 inline-flex w-fit items-center text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={() => setSurveyView("overview")}>
                <ArrowLeft size={16} className="mr-1.5" /> Back to reporting years
              </button>
              <div className="mb-10 flex flex-col items-start gap-3">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#d91f17]">New reporting cycle</p>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Create reporting year</h1>
                  <p className="mt-2 text-slate-500">Start empty or clone an existing year. You can review every question before publishing.</p>
                </div>
              </div>
              <form className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={createYear}>
                <div className="flex flex-col gap-1 rounded-xl border border-blue-200 bg-blue-50 p-4" role="note">
                  <strong className="text-[13px] font-bold uppercase tracking-wider text-blue-700">Draft first, publish when ready</strong>
                  <span className="text-[15px] font-medium text-blue-900">Creating a year creates an editable draft. It will not be visible to companies until you publish it.</span>
                </div>
                
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Year
                    <input
                      name="year"
                      type="number"
                      value={yearDraft.year}
                      onChange={(e) => setYearDraft({ year: e.target.value, name: `Climate Transition Plan Annual Report ${e.target.value}` })}
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Name
                    <input
                      name="name"
                      value={yearDraft.name}
                      onChange={(e) => setYearDraft({ ...yearDraft, name: e.target.value })}
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Opens<input name="opens" type="datetime-local" className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10" /></label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Closes<input name="closes" type="datetime-local" className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10" /></label>
                </div>
                
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clone from existing year
                  <select name="clone" className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10">
                    <option value="">Start empty</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>{v.reporting_year} · {v.name}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setSurveyView("overview")} disabled={busy}>Cancel</Button>
                  <Button disabled={busy}>
                    {busy ? "Creating draft…" : "Create draft cycle"}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* Workspace */}
          {surveyView === "workspace" && selectedVersion && (
            <>
              <SurveyWorkspaceHeader
                version={selectedVersion}
                questionCount={questions.length}
                previewMode={previewMode}
                busy={busy}
                onBack={() => {
                  setSurveyView("overview");
                  setPreviewMode(false);
                }}
                onTogglePreview={() => setPreviewMode((currentPreview) => !currentPreview)}
                onAddQuestion={() => {
                  setForm(EMPTY_Q);
                  setSurveyView("question");
                }}
                onPublish={() => void publishYear()}
                onClose={() => void closeYear()}
              />

              {selectedVersion.status !== "draft" && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-4 text-sm font-semibold text-slate-700" role="note">
                  <div>
                    <strong>This reporting year is {selectedVersion.status === "published" ? "published (active)" : "closed (archived)"}</strong>
                    <span>
                      {selectedVersion.status === "published"
                        ? "Published questions are locked to preserve stable IDs and longitudinal integrity. To modify question structure, create a new draft year."
                        : "Closed reporting years are preserved for historical reporting and audit."}
                    </span>
                  </div>
                  {selectedVersion.status === "published" && (
                    <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:bg-slate-50 hover:text-slate-900" onClick={beginCreateYear}>
                      Create new draft year
                    </button>
                  )}
                </div>
              )}

              {/* Preview mode */}
              {previewMode ? (
                <section className="preview-panel">
                  <div className="preview-banner">
                    <strong>Simulator preview</strong>
                    <span>This interactive view mimics what participating companies see. Responses are not saved.</span>
                  </div>
                  <div className="preview-list">
                    {questions.map((q, i) => (
                      <div key={q.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-100 p-4">
                        <div className="preview-item__meta">
                          <span className="preview-item__num">{i + 1}</span>
                          <code>{q.stableKey}</code>
                          <span className="preview-item__section">{q.sectionTitle}</span>
                          {q.required && <em className="preview-item__required">Required</em>}
                          {carry[q.id] && <span className="preview-item__carry"><RotateCcw size={13} aria-hidden="true" /> Carried from {carry[q.id]}</span>}
                        </div>
                        <p className="preview-item__prompt">{q.prompt}</p>
                        {q.helpText && <p className="preview-item__help">{q.helpText}</p>}
                        {q.visibilityRule.questionKey && (
                          <p className="preview-item__condition">
                            Visible when <code>{q.visibilityRule.questionKey}</code> {q.visibilityRule.operator} {String(q.visibilityRule.value ?? "")}
                          </p>
                        )}
                        {["single_choice", "multiple_choice", "yes_no"].includes(q.type) && (
                          <div className="preview-item__options">
                            {(q.type === "yes_no" ? ["Yes", "No"] : q.options).map((opt) => (
                              <span key={opt} className="preview-option">{opt}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col">
                    <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
                      <div className="builder-heading-row">
                        <div>
                          <p className="eyebrow">Question library</p>
                          <h3>{questions.length} questions</h3>
                        </div>
                        {questions.length > 0 && (
                          <SearchField
                            aria-label="Search survey questions"
                            placeholder="Search questions"
                            value={qSearch}
                            onChange={(event) => setQSearch(event.target.value)}
                            className="catalog-search"
                          />
                        )}
                      </div>
                    </div>

                    {openingVersion === selectedVersion.id ? (
                      <div className="empty-catalog loading-catalog" role="status">
                        <strong>Loading questions…</strong>
                        <p>Preparing the question workspace.</p>
                      </div>
                    ) : filteredQuestions.length === 0 ? (
                      <EmptyState
                        icon={ClipboardPlus}
                        title={questions.length === 0 ? "Start the question library" : "No matching questions"}
                        description={questions.length === 0
                          ? "Add the first question to prepare this reporting year. Persistent IDs keep answers aligned across years."
                          : "Try a different search term or section filter."}
                        action={selectedVersion.status === "draft" && questions.length === 0 ? (
                          <Button
                            icon={Plus}
                            variant="primary"
                            onClick={() => {
                              setForm(EMPTY_Q);
                              setSurveyView("question");
                            }}
                          >
                            Add first question
                          </Button>
                        ) : undefined}
                      />
                    ) : (
                      filteredQuestions.slice(questionPage * Q_PAGE_SIZE, questionPage * Q_PAGE_SIZE + Q_PAGE_SIZE).map((q) => (
                        <article key={q.id}>
                          <div className="q-order-controls">
                            {selectedVersion.status === "draft" && (
                              <>
                                <button
                                  type="button"
                                  className="order-btn"
                                  title="Move up"
                                  disabled={busy || q.displayOrder === questions[0]?.displayOrder}
                                  onClick={() => void reorder(q, "up")}
                                >▲</button>
                                <button
                                  type="button"
                                  className="order-btn"
                                  title="Move down"
                                  disabled={busy || q.displayOrder === questions[questions.length - 1]?.displayOrder}
                                  onClick={() => void reorder(q, "down")}
                                >▼</button>
                              </>
                            )}
                            <span className="q-display-order">{q.displayOrder}</span>
                          </div>
                          <div>
                            <code>{q.stableKey}</code>
                            <h4>{q.prompt}</h4>
                            <p>
                              {q.sectionTitle} / {q.type.replace("_", " ")}
                              {carry[q.id] ? ` / Prefill: ${carry[q.id]}` : ""}
                            </p>
                          </div>
                          {selectedVersion.status === "draft" && (
                            <div className="row-actions" aria-label={`Actions for ${q.stableKey}`}>
                              <button type="button" onClick={() => edit(q)}>Edit</button>
                              <button type="button" className="danger-link" onClick={() => setPendingDelete(q)}>Delete</button>
                            </div>
                          )}
                        </article>
                      ))
                    )}

                    {filteredQuestions.length > Q_PAGE_SIZE && (
                      <div className="catalog-pager">
                        <button
                          type="button"
                          disabled={questionPage === 0}
                          onClick={() => setQuestionPage((p) => Math.max(0, p - 1))}
                        >
                          <ArrowLeft size={15} aria-hidden="true" /> Previous
                        </button>
                        <span>
                          Page {questionPage + 1} of {Math.max(1, Math.ceil(filteredQuestions.length / Q_PAGE_SIZE))}
                        </span>
                        <button
                          type="button"
                          disabled={(questionPage + 1) * Q_PAGE_SIZE >= filteredQuestions.length}
                          onClick={() => setQuestionPage((p) => p + 1)}
                        >
                          Next <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Question editor */}
          {surveyView === "question" && selectedVersion && (
            <>
              <button
                className="back-link builder-back"
                onClick={() => { setForm(EMPTY_Q); setSurveyView("workspace"); }}
              >
                Back to {selectedVersion.reporting_year} questions
              </button>
              <div className="page-intro builder-subpage-intro">
                <div>
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">{form.id ? "Question revision" : "New question"}</p>
                  <h1>{form.id ? `Revise ${form.stableKey}` : "Add question"}</h1>
                  <p>Reporting year {selectedVersion.reporting_year}. Persistent IDs keep historical answers mapped across years.</p>
                </div>
              </div>
              <form className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={saveQ}>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Persistent ID
                    <input
                      value={form.stableKey}
                      disabled={form.id !== null}
                      onChange={(e) => setForm({ ...form, stableKey: e.target.value.toUpperCase() })}
                      pattern="[A-Z][A-Z0-9]*-[0-9]{3,}"
                      placeholder="e.g. GOV-016"
                      title="Use an uppercase category prefix, a hyphen, and at least three digits."
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Category
                    <input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="e.g. Governance, strategy and targets"
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Section key
                    <input
                      value={form.sectionKey}
                      onChange={(e) => setForm({ ...form, sectionKey: e.target.value })}
                      placeholder="e.g. governance-targets"
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Section title
                    <input
                      value={form.sectionTitle}
                      onChange={(e) => setForm({ ...form, sectionTitle: e.target.value })}
                      placeholder="e.g. Governance targets"
                      required
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                </div>
                
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Question prompt
                  <textarea
                    rows={4}
                    value={form.prompt}
                    onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                    placeholder="Write the question prompt clearly as companies will see it."
                    required
                    className="w-full resize-y rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Help text / Guidance
                  <textarea
                    value={form.help}
                    onChange={(e) => setForm({ ...form, help: e.target.value })}
                    placeholder="Optional definitions, calculation methodologies, or reporting boundaries."
                    className="w-full resize-y rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                  />
                </label>
                
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Response type
                    <select 
                      value={form.type} 
                      onChange={(e) => setForm({ ...form, type: e.target.value as QuestionType })}
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    >
                      {["text", "textarea", "number", "yes_no", "single_choice", "multiple_choice", "date"].map((x) => (
                        <option key={x} value={x}>{x.replace("_", " ")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition-all hover:bg-slate-50 has-[:checked]:border-[#d91f17] has-[:checked]:bg-red-50">
                    <input
                      type="checkbox"
                      checked={form.required}
                      onChange={(e) => setForm({ ...form, required: e.target.checked })}
                      className="size-4 rounded accent-[#d91f17]"
                    />
                    Required response
                  </label>
                </div>
                
                {["single_choice", "multiple_choice"].includes(form.type) && (
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Options (one per line)
                    <textarea
                      rows={4}
                      value={form.options}
                      onChange={(e) => setForm({ ...form, options: e.target.value })}
                      placeholder={"Option one\nOption two\nOption three"}
                      className="w-full resize-y rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                )}
                
                <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div>
                    <legend className="text-sm font-bold text-slate-900">Carry-forward mapping</legend>
                    <p className="text-xs text-slate-500">Use when this question inherits validated answers from an approved previous-year question ID.</p>
                  </div>
                  <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Source question ID
                    <input
                      value={form.carry}
                      onChange={(e) => setForm({ ...form, carry: e.target.value.toUpperCase() })}
                      placeholder="Optional, e.g. GOV-015"
                      className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                    />
                  </label>
                </fieldset>
                
                <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div>
                    <legend className="text-sm font-bold text-slate-900">Conditional visibility</legend>
                    <p className="text-xs text-slate-500">Leave Depends on empty to show this question unconditionally.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Depends on question ID
                      <input
                        value={form.condition}
                        onChange={(e) => setForm({ ...form, condition: e.target.value.toUpperCase() })}
                        placeholder="e.g. GOV-001"
                        className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Operator
                      <select 
                        value={form.operator} 
                        onChange={(e) => setForm({ ...form, operator: e.target.value })}
                        className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                      >
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not equals</option>
                        <option value="contains">Contains</option>
                        <option value="is_answered">Is answered</option>
                      </select>
                    </label>
                  </div>
                  {form.operator !== "is_answered" && (
                    <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Expected value
                      <input
                        value={form.expected}
                        onChange={(e) => setForm({ ...form, expected: e.target.value })}
                        placeholder="Value that makes this question visible"
                        className="w-full rounded-lg border-[1.5px] border-slate-200 bg-white px-4 py-3 text-[15px] font-normal normal-case tracking-normal text-slate-900 outline-none transition-all focus:border-[#d91f17] focus:ring-3 focus:ring-[#d91f17]/10"
                      />
                    </label>
                  )}
                </fieldset>
                
                <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
                  <Button
                    variant="secondary"
                    onClick={() => { setForm(EMPTY_Q); setSurveyView("workspace"); }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy}>
                    {busy ? "Saving question…" : form.id ? "Save revision" : "Add question"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
{/* ── Confirm delete question dialog ── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPendingDelete(null); }}
        >
          <section className="w-full max-w-lg animate-[rise_0.2s_ease_both] overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl md:p-8" role="alertdialog" aria-modal="true" aria-labelledby="delete-question-title">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Delete draft question</p>
            <h2 id="delete-question-title" className="mb-3 text-2xl font-bold tracking-tight text-slate-900">Remove {pendingDelete.stableKey}?</h2>
            <p className="text-[15px] leading-relaxed text-slate-600">This removes the question only from the {selectedVersion?.reporting_year} draft. Published years and historical answers remain unchanged.</p>
            <div className="my-6 flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <code>{pendingDelete.stableKey}</code>
              <strong>{pendingDelete.prompt}</strong>
            </div>
            <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 p-5 md:-mx-8 md:-mb-8">
              <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:bg-slate-50 hover:text-slate-900" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</button>
              <button type="button" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#d91f17] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#b01710]" onClick={() => void remove(pendingDelete)} disabled={busy} aria-busy={busy}>
                {busy ? "Deleting…" : "Delete question"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════ DASHBOARD ════════════════════════════════ */}
    </>
  );
}
