import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, RefreshCw, Sparkles, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type AiSummary, type AiSummaryContent } from "../../lib/portal";
import { Button, EmptyState, Loading, type Notice } from "../ui";
import { generateAiSummary } from "../../features/ai-control/api";

export function AdminSummaryModal({
  submissionId,
  organizationName,
  surveyName,
  onClose,
  setNotice,
}: {
  submissionId: number;
  organizationName: string;
  surveyName: string;
  onClose: () => void;
  setNotice: (notice: Notice) => void;
}) {
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Close on ESC
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !submissionId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_summaries")
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setNotice({ kind: "error", message: error.message });
    } else {
      setSummary(data as AiSummary | null);
    }
    setLoading(false);
  }, [submissionId, setNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (!supabase || !submissionId) return;
    setBusy(true);
    try {
      await generateAiSummary(submissionId);
      setNotice({
        kind: "success",
        message: `AI summary generated for ${organizationName}.`,
      });
      await load();
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to generate summary",
      });
    }
    setBusy(false);
  }

  const content = summary?.status === "completed" ? (summary.content as AiSummaryContent) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-summary-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="my-auto flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 p-5 sm:p-6">
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-[#d91f17]">
                <Bot size={18} aria-hidden="true" />
              </span>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#d91f17]">
                AI Climate Plan Summary
              </p>
            </div>
            <h2 id="admin-summary-title" className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {organizationName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{surveyName}</span>
              {summary && (
                <>
                  <span>•</span>
                  <span>Model: {summary.model}</span>
                  <span>•</span>
                  <span>Updated: {formatDateTime(summary.updated_at ?? summary.created_at)}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="small"
              icon={summary ? RefreshCw : Sparkles}
              disabled={busy}
              onClick={() => void generate()}
            >
              {busy ? "Generating…" : summary ? "Regenerate" : "Generate summary"}
            </Button>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              onClick={onClose}
              aria-label="Close summary modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-16">
              <Loading />
            </div>
          ) : !summary ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-12">
              <EmptyState
                icon={Bot}
                title="No AI summary generated yet"
                description="This company has submitted its survey. Click the generate button above to extract executive insights, evidence gaps, and priority actions."
                action={
                  <Button icon={Sparkles} disabled={busy} onClick={() => void generate()}>
                    {busy ? "Generating…" : "Generate AI summary"}
                  </Button>
                }
              />
            </div>
          ) : summary.status === "failed" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-[#d91f17]" />
                <h3 className="font-bold">Summary Generation Failed</h3>
              </div>
              <p className="mt-2 text-sm text-red-700">
                {summary.error_message ?? "An unexpected error occurred during AI generation. Please try regenerating."}
              </p>
              <Button size="small" variant="secondary" className="mt-4" disabled={busy} onClick={() => void generate()}>
                Retry generation
              </Button>
            </div>
          ) : content ? (
            <>
              {/* Executive Summary */}
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Executive Summary
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                  {content.executive_summary}
                </p>
              </article>

              {/* Insights: Strengths, Gaps, Notable Changes */}
              <div className="grid gap-5 md:grid-cols-3">
                {/* Strengths */}
                <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">Strengths</h3>
                  </div>
                  <ul className="space-y-2.5 text-sm text-slate-600">
                    {content.strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-600" />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                {/* Evidence Gaps */}
                <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-900">Evidence Gaps</h3>
                  </div>
                  <ul className="space-y-2.5 text-sm text-slate-600">
                    {content.gaps.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>

                {/* Notable Changes */}
                <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={16} className="text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">Notable Changes</h3>
                  </div>
                  <ul className="space-y-2.5 text-sm text-slate-600">
                    {content.notable_changes.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-600" />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>

              {/* Priority Actions */}
              <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <h3 className="text-base font-bold text-slate-900 mb-4">Recommended Priority Actions</h3>
                <div className="divide-y divide-slate-100">
                  {content.priority_actions.map((item, index) => (
                    <div key={index} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-baseline gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                          {index + 1}
                        </span>
                        <strong className="text-sm font-bold text-slate-900">{item.action}</strong>
                      </div>
                      <p className="mt-1.5 pl-7 text-sm leading-relaxed text-slate-600">
                        {item.rationale}
                      </p>
                      {item.source_question_ids.length > 0 && (
                        <span className="mt-2 block pl-7 text-xs font-semibold text-slate-400">
                          Sources: question {item.source_question_ids.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3.5 sm:px-6">
          <p className="text-xs text-slate-500">
            Generating sends the authorised submitted responses to the configured OpenAI API. Always verify the resulting draft against raw responses before sharing or external publication.
          </p>
          <Button size="small" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
