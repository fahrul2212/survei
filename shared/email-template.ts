export type EmailTemplateKey = "invitation" | "reminder";
export type EmailTemplate = { subject: string; body: string };

export const emailPlaceholders: Record<EmailTemplateKey, string[]> = {
  invitation: ["full_name", "company_name", "action_url", "expires_at"],
  reminder: ["company_name", "days_remaining", "survey_name", "status", "portal_url"],
};

export const defaultEmailTemplates: Record<EmailTemplateKey, EmailTemplate> = {
  invitation: {
    subject: "Your STICA reporting portal invitation",
    body: "Hello {{full_name}},\n\nYou have been invited to the STICA reporting portal for {{company_name}}.\n\nReview and accept your invitation: {{action_url}}\n\nThis one-time invitation expires at {{expires_at}}. If you did not expect this invitation, you can ignore this email.",
  },
  reminder: {
    subject: "STICA report reminder: {{days_remaining}} day(s) remaining",
    body: "Hello,\n\n{{company_name}} has {{days_remaining}} day(s) remaining to complete {{survey_name}}.\n\nCurrent status: {{status}}.\n\nOpen the STICA reporting portal: {{portal_url}}",
  },
};

export function validateEmailTemplate(
  key: EmailTemplateKey,
  template: EmailTemplate,
): string | null {
  if (!template.subject.trim() || !template.body.trim()) return "Subject and message are required.";
  const fields = [...`${template.subject} ${template.body}`.matchAll(/{{\s*([^{}]+?)\s*}}/g)];
  const invalid = fields.find((match) => !emailPlaceholders[key].includes(match[1].trim()));
  if (invalid) return `Unsupported placeholder: ${invalid[0]}`;
  const link = key === "invitation" ? "action_url" : "portal_url";
  if (!new RegExp(`{{\\s*${link}\\s*}}`).test(template.body))
    return `The message must include {{${link}}}.`;
  return null;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export function renderEmailTemplate(
  template: EmailTemplate,
  values: Record<string, string>,
  link?: { value: string; label: string },
): { subject: string; text: string; html: string } {
  const interpolate = (input: string) =>
    input.replace(/{{\s*([a-z_]+)\s*}}/g, (match, key: string) =>
      Object.hasOwn(values, key) ? values[key] : match,
    );
  const subject = interpolate(template.subject)
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200);
  const text = interpolate(template.body).trim().slice(0, 10_000);
  let html = escapeHtml(text).replaceAll("\n", "<br>");
  if (link && /^https:\/\//i.test(link.value) && text.includes(link.value)) {
    html = html.replace(
      escapeHtml(link.value),
      `<a href="${escapeHtml(link.value)}">${escapeHtml(link.label)}</a>`,
    );
  }
  return { subject, text, html: `<p>${html}</p>` };
}
