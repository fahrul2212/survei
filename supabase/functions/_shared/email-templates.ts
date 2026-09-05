import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

export type EmailTemplateKey = "invitation" | "reminder";

const defaults: Record<EmailTemplateKey, { subject: string; body: string }> = {
  invitation: {
    subject: "Your STICA reporting portal invitation",
    body: "Hello {{full_name}},\n\nYou have been invited to the STICA reporting portal for {{company_name}}.\n\nReview and accept your invitation: {{action_url}}\n\nThis one-time invitation expires at {{expires_at}}. If you did not expect this invitation, you can ignore this email.",
  },
  reminder: {
    subject: "STICA report reminder: {{days_remaining}} day(s) remaining",
    body: "Hello,\n\n{{company_name}} has {{days_remaining}} day(s) remaining to complete {{survey_name}}.\n\nCurrent status: {{status}}.\n\nOpen the STICA reporting portal: {{portal_url}}",
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (match, key: string) => key in values ? values[key] : match);
}

export async function renderEmail(
  admin: SupabaseClient,
  key: EmailTemplateKey,
  values: Record<string, string>,
  link?: { value: string; label: string },
): Promise<{ subject: string; text: string; html: string }> {
  const result = await admin.from("email_templates").select("subject_template,body_template").eq("template_key", key).maybeSingle();
  const template = !result.error && result.data
    ? { subject: String(result.data.subject_template), body: String(result.data.body_template) }
    : defaults[key];
  const subject = interpolate(template.subject, values).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const text = interpolate(template.body, values).trim().slice(0, 10_000);
  let html = escapeHtml(text).replaceAll("\n", "<br>");
  if (link?.value && text.includes(link.value)) {
    html = html.replace(escapeHtml(link.value), `<a href="${escapeHtml(link.value)}">${escapeHtml(link.label)}</a>`);
  }
  return { subject, text, html: `<p>${html}</p>` };
}
