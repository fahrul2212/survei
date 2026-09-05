import { useCallback, useEffect, useState } from "react";
import { Mail, Play, Save, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, type Notice } from "../../components/ui";

import { emailPlaceholders as allowed, validateEmailTemplate } from "../../../shared/email-template";
import { EmailPreview } from "./EmailPreview";

type TemplateKey = "invitation" | "reminder";
type Template = { template_key: TemplateKey; subject_template: string; body_template: string; updated_at: string };

export function EmailOperations({ setNotice, onDelivery }: { setNotice: (notice: Notice) => void; onDelivery: () => Promise<void> }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("email_templates").select("template_key,subject_template,body_template,updated_at").order("template_key");
    if (result.error) setNotice({ kind: "error", message: result.error.message });
    else setTemplates((result.data ?? []) as Template[]);
  }, [setNotice]);
  useEffect(() => { void load(); }, [load]);

  function change(key: TemplateKey, field: "subject_template" | "body_template", value: string) {
    setTemplates((current) => current.map((template) => template.template_key === key ? { ...template, [field]: value } : template));
  }

  async function save(template: Template) {
    if (!supabase) return;
    const problem = validateEmailTemplate(template.template_key, { subject: template.subject_template, body: template.body_template });
    if (problem) return setNotice({ kind: "error", message: problem });
    setBusy(`save-${template.template_key}`);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const result = await supabase.from("email_templates").update({
      subject_template: template.subject_template.trim(), body_template: template.body_template.trim(), updated_by: userId,
    }).eq("template_key", template.template_key);
    if (result.error) setNotice({ kind: "error", message: result.error.message });
    else { setNotice({ kind: "success", message: `${template.template_key === "invitation" ? "Invitation" : "Reminder"} email template saved.` }); await load(); }
    setBusy(null);
  }

  async function invoke(action: "test" | "run") {
    if (!supabase) return;
    const confirmed = window.confirm(action === "test"
      ? "Send one test reminder email to your administrator email address?"
      : "Run the reminder schedule now? Emails will be sent only when today's date matches an enabled schedule.");
    if (!confirmed) return;
    setBusy(action);
    const result = await supabase.functions.invoke("send-report-reminders", { body: { action } });
    if (result.error || result.data?.error) setNotice({ kind: "error", message: result.data?.error ?? result.error?.message ?? "Email operation failed" });
    else {
      setNotice({ kind: "success", message: action === "test" ? `Test email sent to ${result.data.recipient}.` : `Reminder run complete: ${result.data.sent} sent, ${result.data.skipped} skipped, ${result.data.failed} failed.` });
      await onDelivery();
    }
    setBusy(null);
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Email content and testing</p><h2 className="mt-0.5 text-base font-bold text-slate-900">Email templates</h2></div>
        <div className="flex flex-wrap gap-2">
          <Button size="small" variant="secondary" icon={Send} disabled={busy !== null} onClick={() => void invoke("test")}>Send saved reminder test</Button>
          <Button size="small" variant="secondary" icon={Play} disabled={busy !== null} onClick={() => void invoke("run")}>Run reminders now</Button>
        </div>
      </div>
      <div className="grid divide-y divide-slate-100 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        {templates.map((template) => (
          <form key={template.template_key} className="grid content-start gap-4 p-5 md:p-6" onSubmit={(event) => { event.preventDefault(); void save(template); }}>
            <div className="flex items-center gap-2"><Mail size={17} className="text-[#d91f17]" /><h3 className="text-sm font-bold capitalize text-slate-900">{template.template_key} email</h3></div>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Subject<input value={template.subject_template} maxLength={200} onChange={(event) => change(template.template_key, "subject_template", event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" /></label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Message<textarea value={template.body_template} maxLength={5000} rows={8} onChange={(event) => change(template.template_key, "body_template", event.target.value)} className="resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal normal-case leading-6 tracking-normal text-slate-900 outline-none focus:border-[#d91f17] focus:ring-2 focus:ring-red-100" /></label>
            <p className="text-xs leading-5 text-slate-500">Available placeholders: {allowed[template.template_key].map((item) => `{{${item}}}`).join(", ")}</p>
            <EmailPreview templateKey={template.template_key} template={{ subject: template.subject_template, body: template.body_template }} />
            <div className="flex justify-end"><Button size="small" type="submit" variant="secondary" icon={Save} disabled={busy !== null}>{busy === `save-${template.template_key}` ? "Saving…" : "Save template"}</Button></div>
          </form>
        ))}
      </div>
    </section>
  );
}
