import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  renderEmailTemplate,
  type EmailTemplate,
  type EmailTemplateKey,
} from "../../../shared/email-template";

const sample = {
  full_name: "Alex Morgan",
  company_name: "Example Textile Company",
  action_url: "https://example.com/invitation-preview",
  expires_at: "5 September 2026, 15:00 UTC",
  days_remaining: "7",
  survey_name: "Climate Transition Plan 2025",
  status: "In progress",
  portal_url: "https://example.com/portal-preview",
};

export function EmailPreview({
  template,
  templateKey,
}: {
  template: EmailTemplate;
  templateKey: EmailTemplateKey;
}) {
  const [format, setFormat] = useState<"html" | "text">("html");
  const rendered = useMemo(
    () =>
      renderEmailTemplate(template, sample, {
        value: templateKey === "invitation" ? sample.action_url : sample.portal_url,
        label: templateKey === "invitation" ? "Accept invitation" : "Open reporting portal",
      }),
    [template, templateKey],
  );
  const document = `<html><head><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:14px/1.6 Arial,sans-serif;color:#172033;padding:16px;overflow-wrap:anywhere}a{color:#b81711;pointer-events:none}</style></head><body>${rendered.html.replaceAll("<a ", '<a tabindex="-1" ')}</body></html>`;

  return (
    <section
      className="overflow-hidden rounded-lg border border-slate-300 bg-white"
      aria-label={`${templateKey} email preview`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
          <Eye size={15} /> Live preview
        </span>
        <div className="flex gap-1">
          {(["html", "text"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              onClick={() => setFormat(value)}
              className={`rounded px-2 py-1 text-xs font-semibold ${format === value ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {value === "html" ? "Email" : "Plain text"}
            </button>
          ))}
        </div>
      </div>
      <p className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
        Subject: {rendered.subject || "(No subject)"}
      </p>
      {format === "html" ? (
        <iframe
          title={`${templateKey} email message`}
          sandbox=""
          srcDoc={document}
          className="h-72 w-full border-0"
        />
      ) : (
        <p className="min-h-72 whitespace-pre-wrap break-words p-4 text-sm leading-6 text-slate-700">
          {rendered.text}
        </p>
      )}
      <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs leading-5 text-slate-500">
        Uses your current edits and sample recipient details. Preview links are inactive. Email apps
        may render spacing differently.
      </p>
    </section>
  );
}
