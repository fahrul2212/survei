import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.4";

import { defaultEmailTemplates as defaults, renderEmailTemplate, type EmailTemplateKey } from "../../../shared/email-template.ts";
export type { EmailTemplateKey } from "../../../shared/email-template.ts";

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
  return renderEmailTemplate(template, values, link);
}
