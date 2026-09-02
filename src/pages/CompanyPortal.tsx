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
import { Loading, NoticeBar, Shell, type Notice, Logo } from "../components/ui";
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
      <main className="centered-shell">
        <section className="setup-card">
          <Logo />
          <h1>Account awaiting company access</h1>
          <p>Ask a STICA administrator to link this account to a participating company.</p>
          <button className="button button--secondary" onClick={() => void supabase?.auth.signOut()}>Sign out</button>
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
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Company climate action programme</p>
              <h1>{org.name}</h1>
              <p>
                {version
                  ? `Your ${version.reporting_year} report is ${submission?.status ?? "not started"}.`
                  : "No reporting cycle is open."}
              </p>
            </div>
            {version?.closes_at && (
              <div className="deadline">
                <span>Submission deadline</span>
                <strong>{formatDate(version.closes_at)}</strong>
              </div>
            )}
          </div>

          {version && submission ? (
            <>
              <section className="hero-report">
                <div className="hero-copy">
                  <span className={`status-badge ${submission.status === "submitted" ? "status-badge--done" : ""}`}>
                    ● {submission.status.replace("_", " ")}
                  </span>
                  <h2>{version.name}</h2>
                  <p>Approved persistent question mappings preserve reliable prior-year responses for review.</p>
                  <button className="button button--ink" onClick={() => setView("report")}>
                    {submission.status === "submitted" ? "View submission" : "Continue reporting"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="progress-art">
                  <div
                    className="progress-ring"
                    style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
                  >
                    <div>
                      <strong>{progress}%</strong>
                      <span>complete</span>
                    </div>
                  </div>
                  <p>{answered} of {visible.length} responses completed</p>
                </div>
              </section>

              <section className="overview-grid">
                <div className="section-card">
                  <div className="section-card__head">
                    <div>
                      <p className="eyebrow">Reporting sections</p>
                      <h3>Section progress</h3>
                    </div>
                    <span>{sections.length} sections</span>
                  </div>
                  <div className="section-list">
                    {sections.map((s) => (
                      <button key={s.key} onClick={() => setView("report")}>
                        <span className="section-check">
                          {s.answered === s.total ? <Check size={16} aria-label="Complete" /> : `${Math.round((s.answered / s.total) * 100)}%`}
                        </span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>{s.answered} of {s.total} answered</small>
                        </span>
                        <span className="mini-progress">
                          <i style={{ width: `${(s.answered / s.total) * 100}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <aside className="info-card">
                  <div>
                    <span className="eyebrow info-card__eyebrow">
                      Baseline data
                    </span>
                    <div className="info-card__number">
                      {questions.filter((q) => q.carryForwardEnabled && isAnswered(answers[q.id])).length}
                    </div>
                    <h3 className="info-card__title">responses prefilled</h3>
                    <p className="info-card__copy">
                      Verified responses from prior reporting cycles are automatically carried forward for your review.
                    </p>
                  </div>
                  <button className="button info-card__action" onClick={() => setView("report")}>
                    Review responses <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </aside>
              </section>
            </>
          ) : (
            <div className="empty-state">
              <h2>No published survey</h2>
              <p>A new reporting cycle has not been opened yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {view === "history" && (
        <div className="mx-auto w-full max-w-[1400px] animate-[rise_0.4s_ease_both] px-4 py-8 md:px-8 lg:px-12 lg:pb-20">
          <div className="page-intro">
            <div>
              <p className="eyebrow eyebrow--red">Reporting archive</p>
              <h1>Previous years</h1>
              <p>Review and reference historical submissions and validated transition plans.</p>
            </div>
          </div>
          <div className="history-list">
            {versions.map((v) => {
              const s = submissions.find((x) => x.survey_version_id === v.id);
              return s ? (
                <article key={v.id}>
                  <span>{v.reporting_year}</span>
                  <div>
                    <h3>{v.name}</h3>
                    <p>{s.submitted_at ? `Submitted ${formatDate(s.submitted_at)}` : `Last saved ${formatDate(s.updated_at)}`}</p>
                  </div>
                  <strong>● {s.status}</strong>
                  <button onClick={() => void open(v)}>View report <ArrowRight size={15} aria-hidden="true" /></button>
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
