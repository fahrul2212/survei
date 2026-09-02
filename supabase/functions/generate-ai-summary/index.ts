import { adminClient, json, preflight, requireUser } from "../_shared/supabase.ts";

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executive_summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 5 },
    gaps: { type: "array", items: { type: "string" }, maxItems: 5 },
    priority_actions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string" },
          rationale: { type: "string" },
          source_question_ids: { type: "array", items: { type: "integer" } },
        },
        required: ["action", "rationale", "source_question_ids"],
      },
    },
    notable_changes: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["executive_summary", "strengths", "gaps", "priority_actions", "notable_changes"],
};

function outputText(response: Record<string, unknown>): string {
  for (const item of (response.output as Array<Record<string, unknown>> | undefined) ?? []) {
    for (const part of (item.content as Array<Record<string, unknown>> | undefined) ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new Error("The AI response did not contain a summary");
}

async function safetyIdentifier(userId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
    const options = preflight(req); if (options) return options;
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let caller;
    try { caller = await requireUser(req); } catch { return json({ error: "Authentication required" }, 401); }
    const admin = adminClient();
    const { submissionId } = (await req.json()) as { submissionId?: number };
    const callerId = caller.id;
    const platformAdmin = caller.app_metadata?.role === "platform_admin";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_SUMMARY_MODEL") ?? "gpt-5.4-mini";
    if (!apiKey) return json({ error: "OPENAI_API_KEY is not configured" }, 503);
    if (!Number.isInteger(submissionId) || Number(submissionId) <= 0) {
      return json({ error: "A submitted report is required" }, 400);
    }

    const { data: submission, error: submissionError } = await admin
      .from("company_submissions")
      .select("id,organization_id,survey_version_id,status,revision_number, organization:organizations(name), survey:survey_versions(name,reporting_year)")
      .eq("id", submissionId!)
      .single();
    if (submissionError || !submission || submission.status !== "submitted") {
      return json({ error: "Only submitted reports can be summarized" }, 400);
    }
    if (!platformAdmin) {
      const { data: membership } = await admin.from("organization_members").select("role")
        .eq("organization_id", submission.organization_id).eq("user_id", callerId).maybeSingle();
      if (!membership || !["member", "company_admin"].includes(membership.role)) {
        return json({ error: "Contributor access required" }, 403);
      }
    }

    const { data: snapshot, error: snapshotError } = await admin
      .from("submission_snapshots").select("id,payload")
      .eq("submission_id", submission.id).eq("revision_number", submission.revision_number).single();
    if (snapshotError || !snapshot) return json({ error: "Submission snapshot not found" }, 400);

    const { data: questionRows, error: questionError } = await admin
      .from("survey_questions")
      .select("id,display_order,section_title,question_revision:question_revisions(prompt,question:question_definitions(stable_key))")
      .eq("survey_version_id", submission.survey_version_id).order("display_order");
    if (questionError) return json({ error: questionError.message }, 400);

    const values = new Map(((snapshot.payload as Array<{ survey_question_id: number; value: unknown }>) ?? [])
      .map((item) => [item.survey_question_id, item.value]));
    const evidence = (questionRows ?? []).map((row) => {
      const revision = Array.isArray(row.question_revision) ? row.question_revision[0] : row.question_revision;
      const definition = Array.isArray(revision?.question) ? revision?.question[0] : revision?.question;
      return { id: row.id, key: definition?.stable_key, section: row.section_title, prompt: revision?.prompt, answer: values.get(row.id) ?? null };
    });

    const { data: summaryRow, error: upsertError } = await admin.from("ai_summaries").upsert({
      organization_id: submission.organization_id,
      submission_id: submission.id,
      snapshot_id: snapshot.id,
      status: "pending",
      model,
      prompt_version: "climate-summary-v1",
      content: {},
      source_question_ids: [],
      requested_by: callerId,
      error_message: null,
    }, { onConflict: "snapshot_id,prompt_version" }).select("id").single();
    if (upsertError || !summaryRow) return json({ error: upsertError?.message ?? "Unable to start summary" }, 400);

    try {
      const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          store: false,
          safety_identifier: await safetyIdentifier(callerId),
          instructions: "You are a climate transition plan analyst. Summarize only the supplied evidence. Be concise, factual, neutral, and explicitly identify missing evidence. Never invent metrics or commitments. Source IDs must refer to supplied numeric question IDs.",
          input: JSON.stringify({ organization: submission.organization, survey: submission.survey, evidence }).slice(0, 180000),
          text: { format: { type: "json_schema", name: "climate_transition_summary", strict: true, schema: SUMMARY_SCHEMA } },
        }),
      });
      const responseBody = await openAiResponse.json() as Record<string, unknown>;
      if (!openAiResponse.ok) throw new Error((responseBody.error as { message?: string } | undefined)?.message ?? "OpenAI request failed");
      const content = JSON.parse(outputText(responseBody)) as { priority_actions?: Array<{ source_question_ids?: number[] }> };
      const sourceIds = Array.from(new Set((content.priority_actions ?? []).flatMap((item) => item.source_question_ids ?? [])));
      const { error: saveError } = await admin.from("ai_summaries").update({
        status: "completed", content, source_question_ids: sourceIds, error_message: null,
      }).eq("id", summaryRow.id);
      if (saveError) throw saveError;
      return json({ id: summaryRow.id, status: "completed", content });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Summary generation failed";
      await admin.from("ai_summaries").update({ status: "failed", error_message: message }).eq("id", summaryRow.id);
      return json({ error: message }, 502);
    }
});
