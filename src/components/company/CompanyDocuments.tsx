import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Trash2, UploadCloud } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatDateTime, type Organization, type Submission, type SubmissionDocument, type SurveyVersion } from "../../lib/portal";
import { Button, EmptyState, PageContainer, PageHeader, type Notice } from "../ui";

const MAX_BYTES = 20 * 1024 * 1024;
const safeFileName = (name: string) => name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document";

export function CompanyDocuments({ organization, submissions, versions, canEdit, setNotice }: {
  organization: Organization;
  submissions: Submission[];
  versions: SurveyVersion[];
  canEdit: boolean;
  setNotice: (notice: Notice) => void;
}) {
  const [documents, setDocuments] = useState<SubmissionDocument[]>([]);
  const [submissionId, setSubmissionId] = useState(String(submissions[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("submission_documents").select("*").eq("organization_id", organization.id).order("created_at", { ascending: false });
    if (error) setNotice({ kind: "error", message: error.message });
    else setDocuments((data ?? []) as SubmissionDocument[]);
  }, [organization.id, setNotice]);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    if (!supabase || !submissionId) return;
    if (file.size > MAX_BYTES) return setNotice({ kind: "error", message: "The maximum document size is 20 MB." });
    setBusy(true);
    const path = `${organization.id}/${submissionId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const uploaded = await supabase.storage.from("report-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) setNotice({ kind: "error", message: uploaded.error.message });
    else {
      const metadata = await supabase.from("submission_documents").insert({
        organization_id: organization.id, submission_id: Number(submissionId), storage_path: path,
        file_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (metadata.error) {
        await supabase.storage.from("report-documents").remove([path]);
        setNotice({ kind: "error", message: metadata.error.message });
      } else { setNotice({ kind: "success", message: "Document uploaded securely." }); await load(); }
    }
    if (inputRef.current) inputRef.current.value = "";
    setBusy(false);
  }

  async function download(document: SubmissionDocument) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from("report-documents").createSignedUrl(document.storage_path, 60);
    if (error) setNotice({ kind: "error", message: error.message });
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(document: SubmissionDocument) {
    if (!supabase || !window.confirm(`Delete ${document.file_name}?`)) return;
    setBusy(true);
    const storage = await supabase.storage.from("report-documents").remove([document.storage_path]);
    if (storage.error) setNotice({ kind: "error", message: storage.error.message });
    else {
      const metadata = await supabase.from("submission_documents").delete().eq("id", document.id);
      if (metadata.error) setNotice({ kind: "error", message: metadata.error.message });
      else { setNotice({ kind: "success", message: "Document deleted." }); await load(); }
    }
    setBusy(false);
  }

  function surveyLabel(submission: Submission) {
    const survey = versions.find((version) => version.id === submission.survey_version_id);
    return survey ? `${survey.reporting_year} · ${survey.name}` : `Submission ${submission.id}`;
  }

  return (
    <PageContainer>
      <PageHeader eyebrow="Supporting evidence" title="Documents" description="Keep evidence files private and attached to the correct survey submission." />
      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-end sm:justify-between md:p-6">
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Attach to survey<select value={submissionId} onChange={(event) => setSubmissionId(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100"><option value="">Choose a submission</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{surveyLabel(submission)}</option>)}</select></label>
        <div>
          <input ref={inputRef} className="sr-only" id="evidence-upload" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg" disabled={!canEdit || busy || !submissionId} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          <Button icon={UploadCloud} disabled={!canEdit || busy || !submissionId} onClick={() => inputRef.current?.click()}>{busy ? "Uploading…" : "Upload document"}</Button>
        </div>
      </section>
      {!canEdit && <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Viewer access is read-only. You can download existing evidence but cannot upload or delete files.</p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {documents.length === 0 ? <EmptyState icon={FileText} title="No documents uploaded" description="Upload policies, calculations, certifications, or other evidence used in the report." /> : (
          <div className="divide-y divide-slate-100">
            {documents.map((document) => {
              const submission = submissions.find((item) => item.id === document.submission_id);
              return <article key={document.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-6">
                <div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{document.file_name}</strong><span className="mt-1 block text-xs text-slate-500">{submission ? surveyLabel(submission) : "Archived submission"} · {(document.size_bytes / 1024 / 1024).toFixed(1)} MB · {formatDateTime(document.created_at)}</span></div>
                <div className="flex gap-2"><Button size="small" variant="secondary" icon={Download} onClick={() => void download(document)}>Download</Button>{canEdit && <Button size="icon" variant="ghost" aria-label={`Delete ${document.file_name}`} disabled={busy} onClick={() => void remove(document)}><Trash2 size={16} /></Button>}</div>
              </article>;
            })}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
