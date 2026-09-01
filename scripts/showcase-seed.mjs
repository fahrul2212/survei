import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REF = "ptqdzqxfmtonitflenod";
const URL = `https://${REF}.supabase.co`;
const credentials = {
  admin: { email: "admin.showcase@webmaintain.tech", password: "STICA-Admin-2026!", name: "STICA Showcase Administrator", role: "platform_admin" },
  client: { email: "client.showcase@webmaintain.tech", password: "STICA-Client-2026!", name: "North Thread Reporting Lead", role: "company_user" },
};

const rawKeys = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${REF} -o json`], { encoding: "utf8", windowsHide: true });
const serviceKey = JSON.parse(rawKeys).find((key) => key.name === "service_role")?.api_key;
if (!serviceKey) throw new Error("The authenticated Supabase CLI did not return a service_role key.");
const db = createClient(URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function assert(scope, error) {
  if (error) throw new Error(`${scope}: ${error.message}${error.details ? ` (${error.details})` : ""}`);
}

async function upsert(table, rows, onConflict) {
  const result = [];
  for (let start = 0; start < rows.length; start += 250) {
    const { data, error } = await db.from(table).upsert(rows.slice(start, start + 250), { onConflict }).select();
    assert(`upsert ${table}`, error);
    result.push(...data);
  }
  return result;
}

async function ensureUser(account) {
  const { data: listed, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert("list users", listError);
  const current = listed.users.find((user) => user.email?.toLowerCase() === account.email);
  const payload = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.name, showcase: true },
    app_metadata: { role: account.role, showcase: true },
  };
  const response = current ? await db.auth.admin.updateUserById(current.id, payload) : await db.auth.admin.createUser(payload);
  assert(`create ${account.role}`, response.error);
  return response.data.user;
}

const sectionSpecs = [
  ["company-profile", "Company profile and reporting boundary", "ORG", [
    "Registered company name", "Organisation number or company registration ID", "Headquarters country", "Primary reporting contact name", "Primary reporting contact email", "Reporting period start date", "Reporting period end date", "Does this report cover the full consolidated group?", "Describe any entities excluded from the reporting boundary", "Number of employees at year end", "Annual net revenue in EUR", "Primary textile or apparel business segment", "Countries where owned operations are located", "Has the reporting boundary changed since last year?", "Explain material reporting-boundary changes",
  ]],
  ["governance-targets", "Governance, strategy and targets", "GOV", [
    "Is climate transition oversight assigned to the board?", "Board committee responsible for climate oversight", "Executive role accountable for the transition plan", "How often does the board review climate progress?", "Is executive remuneration linked to climate performance?", "Describe the governance process for approving this plan", "Has the company adopted a net-zero target?", "Net-zero target year", "Near-term target year", "Near-term absolute emissions reduction target (%)", "Target base year", "Are targets validated by SBTi?", "Does the strategy use a 1.5 C-aligned scenario?", "Describe the material climate risks and opportunities", "Date the transition plan was last formally approved",
  ]],
  ["emissions", "Greenhouse gas inventory", "EMI", [
    "Scope 1 emissions (tCO2e)", "Scope 2 location-based emissions (tCO2e)", "Scope 2 market-based emissions (tCO2e)", "Scope 3 total emissions (tCO2e)", "Purchased goods and services emissions (tCO2e)", "Capital goods emissions (tCO2e)", "Fuel- and energy-related emissions (tCO2e)", "Upstream transport and distribution emissions (tCO2e)", "Waste generated in operations emissions (tCO2e)", "Business travel emissions (tCO2e)", "Employee commuting emissions (tCO2e)", "Downstream transport and distribution emissions (tCO2e)", "Processing of sold products emissions (tCO2e)", "Use of sold products emissions (tCO2e)", "End-of-life treatment emissions (tCO2e)",
  ]],
  ["transition-actions", "Transition actions and implementation", "ACT", [
    "Absolute emissions reduction achieved since the base year (%)", "Renewable electricity share in owned operations (%)", "Share of preferred or lower-impact fibres (%)", "Share of suppliers covered by climate targets (%)", "Does the company have a time-bound coal phase-out plan?", "Target year for coal phase-out in the supply chain", "Describe energy-efficiency measures completed this year", "Describe renewable-energy procurement completed this year", "Describe product-design or circularity measures completed this year", "Annual transition-plan capital expenditure in EUR", "Annual transition-plan operating expenditure in EUR", "Is an internal carbon price used in investment decisions?", "Internal carbon price in EUR per tCO2e", "Key implementation barriers encountered", "Priority actions planned for the next reporting year",
  ]],
  ["value-chain", "Value chain engagement and just transition", "VAL", [
    "Share of tier 1 suppliers mapped (%)", "Share of tier 2 suppliers mapped (%)", "Share of tier 3 suppliers mapped (%)", "Share of procurement spend covered by supplier emissions data (%)", "Does supplier selection include climate criteria?", "Describe supplier climate-capacity building activities", "Number of suppliers receiving climate training", "Does the company support supplier renewable-energy access?", "Describe engagement with logistics providers", "Describe engagement with customers on product use and care", "Has a just-transition impact assessment been completed?", "Worker groups consulted during transition planning", "Describe measures to protect affected workers and communities", "Does public policy engagement align with the transition plan?", "List material trade associations and climate-policy positions",
  ]],
  ["assurance-signoff", "Data quality, assurance and sign-off", "ASS", [
    "GHG accounting standard used", "Are Scope 1 and 2 emissions externally assured?", "Are Scope 3 emissions externally assured?", "Name of external assurance provider", "Describe material estimation methods and data gaps", "Has prior-year data been restated?", "Explain any material restatements", "Public URL for the latest sustainability or annual report", "Name and role of the person approving this submission", "I confirm that this submission is complete and approved", "Approval date", "May STICA contact the reporting lead for clarification?", "Confidentiality notes for STICA reviewers", "Additional evidence or source references", "Final comments for the STICA review team",
  ]],
];

function typeFor(prompt) {
  if (/date$/i.test(prompt) || /^Date /i.test(prompt) || /period (start|end) date/i.test(prompt)) return "date";
  if (/^(Does|Is|Are|Has|May|I confirm)/i.test(prompt)) return "yes_no";
  if (/^(Describe|Explain|List)|notes|comments|barriers|actions planned|groups consulted|evidence/i.test(prompt)) return "textarea";
  if (/%|tCO2e|number of|in EUR|target year|base year|carbon price/i.test(prompt)) return "number";
  if (/country|business segment|standard used|How often/i.test(prompt)) return "single_choice";
  return "text";
}

function optionsFor(prompt) {
  if (/country/i.test(prompt)) return ["Sweden", "Denmark", "Finland", "Norway", "Other"];
  if (/business segment/i.test(prompt)) return ["Fibres", "Textiles", "Apparel", "Footwear", "Retail", "Multi-segment"];
  if (/standard used/i.test(prompt)) return ["GHG Protocol", "ISO 14064", "Other"];
  if (/How often/i.test(prompt)) return ["Monthly", "Quarterly", "Twice yearly", "Annually", "Ad hoc"];
  return [];
}

const questions = sectionSpecs.flatMap(([sectionKey, sectionTitle, prefix, prompts]) => prompts.map((prompt, index) => ({
  stableKey: `${prefix}-${String(index + 1).padStart(3, "0")}`,
  category: sectionKey,
  sectionKey,
  sectionTitle,
  prompt,
  type: typeFor(prompt),
  options: optionsFor(prompt),
  required: !/excluded|changes|provider|restatements|URL|notes|references|comments|tier 3|logistics|customers|workers|communities|associations/i.test(prompt),
})));
if (questions.length !== 90) throw new Error(`Seeder requires 90 questions, found ${questions.length}.`);

const companies = [
  ["North Thread AB (Showcase)", "north-thread-showcase", credentials.client.email, "SHOWCASE-NORTH"],
  ["Baltic Loom Group (Showcase)", "baltic-loom-showcase", "baltic@example-textile.test", "SHOWCASE-BALTIC"],
  ["Circular Fibre Co. (Showcase)", "circular-fibre-showcase", "circular@example-textile.test", "SHOWCASE-CIRCULAR"],
  ["Nordic Apparel Works (Showcase)", "nordic-apparel-showcase", "nordic@example-textile.test", "SHOWCASE-NORDIC"],
  ["Scandic Dyehouse (Showcase)", "scandic-dyehouse-showcase", "dyehouse@example-textile.test", "SHOWCASE-DYE"],
  ["Rewear Retail Partners (Showcase)", "rewear-retail-showcase", "rewear@example-textile.test", "SHOWCASE-REWEAR"],
];

function answerFor(question, companyIndex, year) {
  const change = year - 2024;
  if (question.type === "number") {
    if (/year/i.test(question.prompt)) return 2030 + (companyIndex % 3) * 5;
    if (/%/.test(question.prompt)) return Math.min(100, 24 + companyIndex * 7 + change * 4);
    if (/emissions|tCO2e/i.test(question.prompt)) return 1250 + companyIndex * 410 + change * 95;
    return 120 + companyIndex * 35 + change * 10;
  }
  if (question.type === "yes_no") return companyIndex % 3 !== 2;
  if (question.type === "date") return `${year}-08-${String(12 + companyIndex).padStart(2, "0")}`;
  if (question.type === "single_choice") return question.options[companyIndex % question.options.length];
  if (/email/i.test(question.prompt)) return `reporting${companyIndex + 1}@example-textile.test`;
  if (/URL/i.test(question.prompt)) return "https://example-textile.test/sustainability";
  if (/company name/i.test(question.prompt)) return companies[companyIndex][0];
  return question.type === "textarea"
    ? `Showcase response for ${companies[companyIndex][0]}, reporting year ${year}. Supporting evidence is recorded in the transition-plan register.`
    : `Showcase ${year} - ${companies[companyIndex][0]}`;
}

async function main() {
  const admin = await ensureUser(credentials.admin);
  const client = await ensureUser(credentials.client);
  await upsert("profiles", [{ user_id: admin.id, full_name: credentials.admin.name }, { user_id: client.id, full_name: credentials.client.name }], "user_id");

  const savedCompanies = await upsert("organizations", companies.map(([name, slug, contact_email, external_reference]) => ({ name, slug, contact_email, external_reference, is_active: true })), "slug");
  const organisations = companies.map(([, slug]) => savedCompanies.find((row) => row.slug === slug));
  await upsert("organization_members", [{ organization_id: organisations[0].id, user_id: client.id, role: "member" }], "organization_id,user_id");

  const versions = await upsert("survey_versions", [
    { reporting_year: 2024, name: "STICA Climate Transition Plan 2024", status: "closed", opens_at: "2024-09-01T00:00:00Z", closes_at: "2024-11-30T23:59:59Z", published_at: "2024-08-15T00:00:00Z" },
    { reporting_year: 2025, name: "STICA Climate Transition Plan 2025", status: "closed", opens_at: "2025-09-01T00:00:00Z", closes_at: "2025-11-30T23:59:59Z", published_at: "2025-08-15T00:00:00Z" },
    { reporting_year: 2026, name: "STICA Climate Transition Plan 2026", status: "published", opens_at: "2026-09-01T00:00:00Z", closes_at: "2026-11-30T23:59:59Z", published_at: "2026-09-01T00:00:00Z" },
  ], "reporting_year");

  const definitions = await upsert("question_definitions", questions.map((q) => ({ stable_key: q.stableKey, category: q.category })), "stable_key");
  const revisions = await upsert("question_revisions", questions.map((q) => ({
    question_id: definitions.find((row) => row.stable_key === q.stableKey).id,
    revision_number: 1,
    prompt: q.prompt,
    help_text: null,
    question_type: q.type,
    options: q.options,
    validation: q.type === "number" ? { min: 0 } : {},
  })), "question_id,revision_number");

  const surveyRows = versions.flatMap((version) => questions.map((q, index) => ({
    survey_version_id: version.id,
    question_revision_id: revisions.find((revision) => revision.question_id === definitions.find((row) => row.stable_key === q.stableKey).id).id,
    display_order: index + 1,
    is_required: q.required,
    carry_forward_enabled: true,
    visibility_rule: {},
    section_key: q.sectionKey,
    section_title: q.sectionTitle,
  })));
  const surveyQuestions = await upsert("survey_questions", surveyRows, "survey_version_id,question_revision_id");

  const previousAnswers = new Map();
  let submissionCount = 0;
  for (const year of [2024, 2025, 2026]) {
    const version = versions.find((row) => row.reporting_year === year);
    const yearQuestions = surveyQuestions.filter((row) => row.survey_version_id === version.id).sort((a, b) => a.display_order - b.display_order);
    for (let companyIndex = 0; companyIndex < organisations.length; companyIndex += 1) {
      if (year === 2026 && companyIndex === 5) continue;
      const status = year < 2026 || [1, 2].includes(companyIndex) ? "submitted" : "draft";
      const completion = year < 2026 || status === "submitted" ? 90 : companyIndex === 0 ? 72 : companyIndex === 3 ? 58 : 31;
      const [submission] = await upsert("company_submissions", [{
        organization_id: organisations[companyIndex].id,
        survey_version_id: version.id,
        status,
        current_section: questions[Math.max(0, completion - 1)].sectionKey,
        submitted_at: status === "submitted" ? `${year}-11-20T10:00:00Z` : null,
        submitted_by: status === "submitted" ? (companyIndex === 0 ? client.id : admin.id) : null,
        revision_number: status === "submitted" ? 1 : 0,
        created_by: companyIndex === 0 ? client.id : admin.id,
      }], "organization_id,survey_version_id");
      submissionCount += 1;

      const answers = await upsert("answers", yearQuestions.slice(0, completion).map((surveyQuestion, index) => {
        const source = previousAnswers.get(`${year - 1}:${companyIndex}:${questions[index].stableKey}`);
        return {
          submission_id: submission.id,
          survey_question_id: surveyQuestion.id,
          value: answerFor(questions[index], companyIndex, year),
          provenance: year === 2026 && source ? "prefilled" : "manual",
          source_answer_id: year === 2026 && source ? source : null,
          updated_by: companyIndex === 0 ? client.id : admin.id,
        };
      }), "submission_id,survey_question_id");
      answers.forEach((answer, index) => previousAnswers.set(`${year}:${companyIndex}:${questions[index].stableKey}`, answer.id));

      if (status === "submitted") {
        const { data: snapshot, error: readError } = await db.from("submission_snapshots").select("id").eq("submission_id", submission.id).eq("revision_number", 1).maybeSingle();
        assert("read snapshot", readError);
        if (!snapshot) {
          const { error } = await db.from("submission_snapshots").insert({
            submission_id: submission.id,
            revision_number: 1,
            payload: answers.map((answer) => ({ survey_question_id: answer.survey_question_id, value: answer.value, showcase: true, reporting_year: year })),
            submitted_by: companyIndex === 0 ? client.id : admin.id,
            submitted_at: `${year}-11-20T10:00:00Z`,
          });
          assert("insert snapshot", error);
        }
      }
    }
  }

  const { error: deleteAuditError } = await db.from("audit_events").delete().eq("event_type", "showcase_seeded");
  assert("clean showcase audit", deleteAuditError);
  const { error: auditError } = await db.from("audit_events").insert({
    actor_user_id: admin.id,
    event_type: "showcase_seeded",
    entity_type: "survey_version",
    entity_id: versions.find((row) => row.reporting_year === 2026).id,
    details: { showcase: true, companies: companies.length, questions: questions.length },
  });
  assert("insert showcase audit", auditError);

  writeFileSync(".env.test.local", [
    `VITE_SUPABASE_URL=${URL}`,
    "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-rlPgIvblKwQ_arZntQJxQ_qn0ALbt2",
    `TEST_ADMIN_EMAIL=${credentials.admin.email}`,
    `TEST_ADMIN_PASSWORD=${credentials.admin.password}`,
    `TEST_CLIENT_EMAIL=${credentials.client.email}`,
    `TEST_CLIENT_PASSWORD=${credentials.client.password}`,
    "",
  ].join("\n"), { mode: 0o600 });

  console.log(JSON.stringify({ success: true, organisations: organisations.length, surveyVersions: versions.length, persistentQuestions: questions.length, submissions: submissionCount }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
