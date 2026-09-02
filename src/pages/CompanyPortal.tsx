import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  evaluateVisibility,
  formatDate,
  isAnswered,
  parseSurveyQuestion,
  type AnswerRecord,
  type JsonAnswer,
  type Organization,
  type Submission,
  type SurveyQuestion,
  type SurveyVersion,
} from "../lib/portal";
import { Loading, NoticeBar, Shell, type Notice, Logo, Button } from "../components/ui";
import { AccountSettings } from "./AccountSettings";
import { Report } from "./Report";

const QUESTION_SELECT = `id,survey_version_id,display_order,is_required,carry_forward_enabled,visibility_rule,section_key,section_title,question_revision:question_revisions!inner(id,prompt,help_text,question_type,options,validation,question:question_definitions!inner(id,stable_key,category))`;

export function CompanyPortal({ session }: { session: Session }) {
  const [view, setView] = useState("overview");
  const [org, setOrg] = useState<Organization | null>(null);
  const [versions, setVersions] = useState<SurveyVersion[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [version, setVersion] = useState<SurveyVersion | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, JsonAnswer>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const loadSurvey = useCallback(async (v: SurveyVersion, known: Submission[]) => {
    if (!supabase) return;
    let s = known.find((x) => x.survey_version_id === v.id) ?? null;
    if (!s && v.status === "published") {
      const r = await supabase.rpc("initialize_submission", {
        target_survey_version_id: v.id,
        target_organization_id: null,
      });
      if (r.error) throw r.error;
      const q = await supabase.from("company_submissions").select("*").eq("id", r.data).single();
      if (q.error) throw q.error;
      s = q.data as Submission;
      known = [...known, s];
      setSubmissions(known);
    }
    const [qr, ar] = await Promise.all([
      supabase.from("survey_questions").select(QUESTION_SELECT).eq("survey_version_id", v.id).order("display_order"),
      s
        ? supabase.from("answers").select("*").eq("submission_id", s.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (qr.error) throw qr.error;
    if (ar.error) throw ar.error;
    setVersion(v);
    setSubmission(s);
    setQuestions((qr.data ?? []).map(parseSurveyQuestion));
    setAnswers(Object.fromEntries(((ar.data ?? []) as AnswerRecord[]).map((a) => [a.survey_question_id, a.value])));
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const m = await supabase
        .from("organization_members")
        .select("organization:organizations!inner(*)")
        .eq("user_id", session.user.id)
        .limit(1)
        .maybeSingle();
      if (m.error) throw m.error;
      const o = Array.isArray(m.data?.organization) ? m.data.organization[0] : m.data?.organization;
      if (!o) { setOrg(null); return; }
      setOrg(o as Organization);

      const [vr, sr] = await Promise.all([
        supabase.from("survey_versions").select("*").in("status", ["published", "closed"]).order("reporting_year", { ascending: false }),
        supabase.from("company_submissions").select("*").eq("organization_id", o.id),
      ]);
      if (vr.error) throw vr.error;
      if (sr.error) throw sr.error;

      const vv = (vr.data ?? []) as SurveyVersion[];
      const ss = (sr.data ?? []) as Submission[];
      setVersions(vv);
      setSubmissions(ss);

      const current = vv.find((x) => x.status === "published") ?? vv[0];
      if (current) await loadSurvey(current, ss);
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to load data" });
    } finally {
      setLoading(false);
    }
  }, [loadSurvey, session.user.id]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => questions.filter((q) => evaluateVisibility(q, questions, answers)), [answers, questions]);
  const answered = visible.filter((q) => isAnswered(answers[q.id])).length;
  const progress = visible.length ? Math.round((answered / visible.length) * 100) : 0;
  const sections = useMemo(() =>
    Object.values(
      visible.reduce<Record<string, { key: string; title: string; total: number; answered: number }>>((a, q) => {
        const x = a[q.sectionKey] ?? { key: q.sectionKey, title: q.sectionTitle, total: 0, answered: 0 };
        x.total++;
        if (isAnswered(answers[q.id])) x.answered++;
        a[q.sectionKey] = x;
        return a;
      }, {}),
    ),
  [answers, visible]);

  async function save(q: SurveyQuestion, v: JsonAnswer) {
    if (!supabase || !submission || submission.status === "submitted") return;
    const r = await supabase.from("answers").upsert(
      { submission_id: submission.id, survey_question_id: q.id, value: v, provenance: "manual", updated_by: session.user.id },
      { onConflict: "submission_id,survey_question_id" },
    );
    if (r.error) setNotice({ kind: "error", message: r.error.message });
  }

  async function submit() {
    if (!supabase || !submission) return;
    const missing = visible.filter((q) => q.required && !isAnswered(answers[q.id]));
    if (missing.length) return setNotice({ kind: "error", message: `${missing.length} required response(s) are missing.` });
    const r = await supabase.rpc("submit_submission", { target_submission_id: submission.id });
    if (r.error) return setNotice({ kind: "error", message: r.error.message });
    setNotice({ kind: "success", message: "Report submitted successfully." });
    setView("overview");
    await load();
  }

  async function open(v: SurveyVersion) {
    setLoading(true);
    try {
      await loadSurvey(v, submissions);
      setView("report");
    } catch (e) {
      setNotice({ kind: "error", message: e instanceof Error ? e.message : "Unable to open report" });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;

  if (!org) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
        <section className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Logo />
          <h1 className="text-xl font-bold text-slate-900">Account awaiting company access</h1>
          <p className="text-slate-500">Ask a STICA administrator to link this account to a participating company.</p>
          <Button variant="secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
        </section>
      </main>
    );
  }

  const navItems: Array<[string, string, string?]> = [
    ["overview", "Overview"],
    ["report", version ? `${version.reporting_year} report` : "Current report", `${answered}/${visible.length}`],
    ["history", "Previous years"],
    ["account", "Account"],
  ];

  return (
    <Shell view={view} setView={setView} items={navItems} user={session.user} name={org.name}>
      <NoticeBar notice={notice} clear={() => setNotice(null)} />

      {/* ── Report ── */}
      {view === "report" && version && submission && (
        <Report
          version={version}
          submission={submission}
          questions={questions}
          answers={answers}
          setAnswers={setAnswers}
          save={save}
          submit={submit}
          back={() => setView("overview")}
        />
      )}

      {/* ── Overview ── */}
      {view === "overview" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Company climate action programme</p>
              <h1>{org.name}</h1>
              <p>
                {version
                  ? `Your ${version.reporting_year} report is ${submission?.status ?? "not started"}.`
                  : "No reporting cycle is open."}
              </p>
            </div>
            {version?.closes_at && (
              <div className="grid min-w-[200px] gap-1 rounded-lg border border-slate-200 border-l-4 border-l-[#d91f17] bg-white p-3 px-4 shadow-sm">
                <span>Submission deadline</span>
                <strong>{formatDate(version.closes_at)}</strong>
              </div>
            )}
          </div>

          {version && submission ? (
            <>
              <section className="relative mb-7 grid min-h-[310px] grid-cols-1 overflow-hidden rounded-2xl bg-gradient-to-br from-[#c01810] via-[#e32219] to-[#9a100a] text-white shadow-lg md:grid-cols-[1.35fr_0.65fr]">
                <div className="relative z-10 p-7 md:p-11">
                  <span className={`mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest ${submission.status === "submitted" ? "border-white bg-white text-emerald-600" : "border-white/40 bg-black/15"}`}>
                    ● {submission.status.replace("_", " ")}
                  </span>
                  <h2 className="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">{version.name}</h2>
                  <p>Approved persistent question mappings preserve reliable prior-year responses for review.</p>
                  <button className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-black hover:shadow-md" onClick={() => setView("report")}>
                    {submission.status === "submitted" ? "View submission" : "Continue reporting"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="relative z-10 grid place-items-center content-center bg-black/10 p-7">
                  <div
                    className="grid size-[170px] place-items-center rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.15)]" style={{ background: `conic-gradient(white ${progress * 3.6}deg, rgba(255,255,255,0.22) 0)` }}
                    
                  >
                    <div className="flex flex-col items-center justify-center rounded-full bg-[#d81e16] size-[140px]">
                      <strong className="text-4xl font-extrabold tracking-tight">{progress}%</strong>
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-90">complete</span>
                    </div>
                  </div>
                  <p className="mt-6 text-sm font-semibold opacity-90">{answered} of {visible.length} responses completed</p>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_330px]">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 p-5 md:px-6">
                    <div>
                      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Reporting sections</p>
                      <h3 className="text-lg font-bold text-slate-900">Section progress</h3>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">{sections.length} sections</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2">
                    {sections.map((s) => (
                      <button key={s.key} className="flex w-full flex-wrap items-center justify-between border-b border-r border-slate-100 p-5 text-left transition-colors hover:bg-slate-50" onClick={() => setView("report")}>
                        <span className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                          {s.answered === s.total ? <Check size={16} aria-label="Complete" /> : `${Math.round((s.answered / s.total) * 100)}%`}
                        </span>
                        <span className="flex flex-1 flex-col pl-4">
                          <strong className="truncate text-sm font-bold text-slate-900">{s.title}</strong>
                          <small className="text-xs font-semibold text-slate-500">{s.answered} of {s.total} answered</small>
                        </span>
                        <span className="col-start-2 mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                          <i className="block h-full bg-[#d91f17] transition-all" style={{ width: `${(s.answered / s.total) * 100}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <aside className="flex flex-col justify-between overflow-hidden rounded-xl border border-emerald-700 bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-600 p-7 text-white shadow-md">
                  <div>
                    <span className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-white/90">
                      Baseline data
                    </span>
                    <div className="my-2 text-5xl font-extrabold leading-none">
                      {questions.filter((q) => q.carryForwardEnabled && isAnswered(answers[q.id])).length}
                    </div>
                    <h3 className="mb-2.5 mt-1.5 text-xl font-bold">responses prefilled</h3>
                    <p className="text-sm leading-relaxed text-white/95">
                      Verified responses from prior reporting cycles are automatically carried forward for your review.
                    </p>
                  </div>
                  <button className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all hover:bg-slate-50" onClick={() => setView("report")}>
                    Review responses <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </aside>
              </section>
            </>
          ) : (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <h2 className="mb-2 text-xl font-bold text-slate-900">No published survey</h2>
              <p className="text-slate-500">A new reporting cycle has not been opened yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {view === "history" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">Reporting archive</p>
              <h1>Previous years</h1>
              <p>Review and reference historical submissions and validated transition plans.</p>
            </div>
          </div>
          <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {versions.map((v) => {
              const s = submissions.find((x) => x.survey_version_id === v.id);
              return s ? (
                <article key={v.id} className="flex flex-col items-start gap-4 border-b border-slate-100 p-5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between md:p-6">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-700">{v.reporting_year}</span>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900">{v.name}</h3>
                    <p className="text-sm text-slate-500">{s.submitted_at ? `Submitted ${formatDate(s.submitted_at)}` : `Last saved ${formatDate(s.updated_at)}`}</p>
                  </div>
                  <strong className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${s.status === "submitted" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>● {s.status}</strong>
                  <button className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition-all hover:bg-slate-50 hover:text-[#d91f17]" onClick={() => void open(v)}>View report <ArrowRight size={15} aria-hidden="true" /></button>
                </article>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* ── Account ── */}
      {view === "account" && <AccountSettings session={session} />}
    </Shell>
  );
}
