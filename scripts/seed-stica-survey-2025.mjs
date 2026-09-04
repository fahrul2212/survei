import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REF = "ptqdzqxfmtonitflenod";
const URL = `https://${REF}.supabase.co`;
const rawKeys = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${REF} -o json`], { encoding: "utf8", windowsHide: true });
const serviceKey = JSON.parse(rawKeys).find((key) => key.name === "service_role")?.api_key;
if (!serviceKey) throw new Error("The authenticated Supabase CLI did not return a service_role key.");
const db = createClient(URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function assert(scope, error) { if (error) throw new Error(`${scope}: ${error.message}`); }
async function upsert(table, rows, onConflict) {
  const { data, error } = await db.from(table).upsert(rows, { onConflict }).select();
  assert(`upsert ${table}`, error);
  return data;
}

const pages = [
  [1, 7, "company-information", "Company information"],
  [8, 13, "verification-targets", "Verification and climate targets"],
  [14, 30, "transition-plans", "Climate Transition Plans"],
  [31, 34, "climate-risk", "Climate-related risk assessment"],
  [35, 37, "scope-1-2", "Scopes 1 and 2 emissions"],
  [38, 39, "scope-3", "Scope 3 emissions"],
  [40, 49, "supplier-engagement", "Supplier engagement"],
  [50, 53, "retailers", "Retailers"],
  [54, 56, "materials-strategy", "Materials strategy"],
  [57, 59, "transportation", "Transportation"],
  [60, 64, "circular-business", "Circular business models"],
  [65, 70, "customer-use", "Customer use"],
  [71, 77, "financial-integration", "Economic incentives and financial integration"],
  [78, 80, "policy-engagement", "Industry action and policy engagement"],
  [81, 82, "just-transition", "Just Transition"],
  [83, 84, "working-groups", "Working groups"],
  [85, 89, "plan-updates", "Transition Plan updates and further support"],
  [90, 92, "additional-challenges", "Additional challenges"],
];

const prompts = [
  "Please provide your primary contact information for this survey, including name, company, turnover, role, email and phone number.",
  "Please provide a secondary contact person, including name, role and email.",
  "Which type best describes your company?",
  "Which business segments does your company operate in?",
  "Which product categories does your company sell?",
  "How many employees does your company have?",
  "In which year did your company join STICA?",
  "How are your Scope 1 and 2 emissions verified?",
  "How are your Scope 3 emissions verified?",
  "What is the status of your company-wide net-zero target?",
  "What is the status of your FLAG or land-related emissions target?",
  "Which product-level climate measurement methods or KPIs do you use?",
  "Does your company publicly disclose product-level greenhouse gas emissions?",
  "What is the status of your Climate Transition Plan for Scopes 1 and 2?",
  "By what year do you expect to have a complete Climate Transition Plan for Scopes 1 and 2?",
  "What is the status of your Climate Transition Plan for Scope 3?",
  "By what year do you expect to have a complete Climate Transition Plan for Scope 3?",
  "Has the Climate Transition Plan been formally approved by the board?",
  "Does the board have formal oversight of the Climate Transition Plan?",
  "Does the board have sufficient climate competence to oversee the plan?",
  "Is executive remuneration linked to climate performance?",
  "Do you publicly disclose how executive remuneration is linked to climate performance?",
  "Is a C-suite executive formally responsible for implementing the Climate Transition Plan?",
  "Is the Climate Transition Plan integrated into strategic decision-making?",
  "Is the Climate Transition Plan integrated into financial decision-making?",
  "Is your company projected to meet its Scopes 1 and 2 targets?",
  "Is your company projected to meet its Scope 3 target?",
  "Is the company growth plan aligned with the Climate Transition Plan?",
  "Is your Climate Transition Plan publicly available?",
  "Has your company sought stakeholder feedback on the Climate Transition Plan?",
  "Does your company have a process for identifying climate-related risks and opportunities?",
  "Which climate-related topics are included in that assessment?",
  "Which elements of climate-related reporting does your company publicly disclose?",
  "Are climate-related targets defined as SMART targets?",
  "Which actions are included to reduce Scopes 1 and 2 emissions?",
  "To what extent are Scopes 1 and 2 actions quantified and time-bound?",
  "Does your company have a target to use 100% renewable electricity by 2030?",
  "Which actions are included to reduce Scope 3 emissions?",
  "To what extent are Scope 3 actions quantified and time-bound?",
  "Is your supplier list publicly available?",
  "Does your supplier list identify the tier level of each supplier?",
  "What percentage of Tier 1 suppliers are mapped?",
  "What percentage of Tier 2 suppliers are mapped?",
  "What percentage of Tier 3 suppliers are mapped?",
  "What percentage of Tier 4 suppliers are mapped?",
  "What percentage of suppliers have provided primary emissions data?",
  "Does your company have a public target to phase out coal in the supply chain?",
  "Does your company disclose incentives offered to suppliers for climate action?",
  "What are the three biggest challenges in engaging suppliers on climate action?",
  "Does your company resell external brands?",
  "Does your climate strategy cover the external brands you resell?",
  "Do you have climate targets for the external brands you resell?",
  "What are the three biggest climate challenges related to external brands?",
  "Does your company have a plan to increase the use of lower-impact materials?",
  "Does your company have time-bound targets for lower-impact materials?",
  "What are the three biggest challenges in implementing your materials strategy?",
  "Does your company have a strategy to reduce transportation emissions?",
  "Does your company have a time-bound transportation emissions target?",
  "What are the three biggest challenges in reducing transportation emissions?",
  "Are circular business models included in your Climate Transition Plan?",
  "Which circular business models are included?",
  "What percentage of annual revenue comes from circular business models?",
  "Has your company launched circular business initiatives?",
  "What are the three biggest challenges in scaling circular business models?",
  "Does your company measure greenhouse gas emissions from the customer use phase?",
  "Which methodology and KPIs are used to measure customer use-phase emissions?",
  "Which methods are used to collect product-use data?",
  "Does your company measure product longevity?",
  "Which methodology and KPIs are used to measure product longevity?",
  "Does your company engage customers to reduce climate impacts during product use?",
  "Are financial costs estimated for each transition-plan action?",
  "Does the business model aim to decouple revenue growth from emissions growth?",
  "Does your company use an internal carbon price?",
  "Does your company use other financial tools to support climate decisions?",
  "What percentage of annual revenue is invested in the Climate Transition Plan?",
  "Does your company have a plan for carbon removals?",
  "Does your company contribute to Beyond Value Chain Mitigation (BVCM)?",
  "Does your company formally engage in climate-policy advocacy?",
  "Which climate-policy advocacy activities did your company undertake?",
  "How do you ensure public-policy engagement aligns with the Climate Transition Plan?",
  "Does your company have a Just Transition plan?",
  "Which Just Transition actions or disclosures are in place?",
  "Does your company participate in STICA working groups?",
  "Which STICA working groups does your company participate in?",
  "How often is the Climate Transition Plan reviewed and updated?",
  "What additional support would help your company implement the Climate Transition Plan?",
  "May the Climate Transition Plan be shared confidentially with SFA/STICA?",
  "May the Climate Transition Plan be shared with other STICA members?",
  "Is there anything else you would like to share about your Climate Transition Plan?",
  "What are the biggest challenges to meeting your climate targets?",
  "What needs to happen for your company to meet its climate targets?",
  "Do you have any final comments or feedback for STICA?",
];

const options = {
  3: ["Brand (less than 5% of sales from other brands)", "Retailer (more than 5% of sales from other brands)", "Other"],
  4: ["Fashion", "Outdoor", "Sport", "Workwear", "Home interior", "Other"],
  5: ["Soft goods", "Home textiles", "Footwear", "Hard goods", "Mixed gear", "Beauty", "Other"],
  7: ["2019", "2020", "2021", "2022", "2023", "2024", "2025"],
  8: ["Reasonable assurance by an accredited auditor", "Limited assurance", "Verified according to ISO 14064-3", "Not verified, but target approved by SBTi", "Will verify", "Considering verification", "Not considering verification"],
  9: ["Reasonable assurance by an accredited auditor", "Limited assurance", "Verified according to ISO 14064-3", "Partially verified", "Not verified, but target approved by SBTi", "Will verify", "Considering verification", "Not considering verification"],
  10: ["Target approved by SBTi", "Committed through SBTi", "Target set but not approved by SBTi", "Target set outside a standard", "No"],
  11: ["Target approved by SBTi", "Definition exists but target is not approved", "Target set outside SBTi", "Emissions measured but no target", "No"],
  12: ["Life Cycle Assessments (LCAs)", "Environmental Product Declarations (EPDs)", "Other product methodologies", "KPI for purchased products", "KPI for sold products", "Yes, other", "No"],
  13: ["Yes, for purchased and sold products", "Yes, for sold products", "Yes, for purchased products", "No"],
  14: ["Completed and actions underway", "Partially completed and actions underway", "Development in progress", "Not yet started"],
  16: ["Completed and actions underway", "Partially completed and actions underway", "Development in progress", "Not yet started"],
  29: ["Yes, for Scopes 1, 2 and 3", "Only for Scopes 1 and 2", "Only for Scope 3", "No, but planned within one year", "No"],
  32: ["Transition risks", "Physical risks", "Climate opportunities", "Other"],
  33: ["Governance", "Risk management", "Strategy", "Metrics and targets", "None"],
  34: ["Yes, fully", "Yes, partially", "No"],
  35: ["Energy efficiency", "Renewable electricity or RECs", "Reduced fuel consumption", "Vehicle electrification", "On-site process electrification", "Renewable fuels or biogas", "Low-GWP refrigerants", "Other", "None"],
  36: ["All actions quantified with timelines", "Some actions quantified with timelines", "Actions quantified without timelines", "Not quantified"],
  38: ["Supplier measurement and targets", "Supplier energy efficiency", "Supplier renewable electricity", "Coal phase-out", "Clean thermal energy", "Lower-GHG materials", "Packaging", "Inbound or outbound distribution", "Circular business models", "Reduced new-product volume", "Other", "None"],
  39: ["All actions quantified with timelines", "Some actions quantified with timelines", "Actions quantified without timelines", "Not quantified"],
  40: ["Yes", "Partially", "No"], 41: ["Yes", "Partially", "No"],
  42: ["0%", "1–25%", "26–50%", "51–75%", "76–100%", "Do not know / no data yet"],
  43: ["0%", "1–25%", "26–50%", "51–75%", "76–100%", "Do not know / no data yet"],
  44: ["0%", "1–25%", "26–50%", "51–75%", "76–100%", "Do not know / no data yet"],
  45: ["0%", "1–25%", "26–50%", "51–75%", "76–100%", "Do not know / no data yet"],
  46: ["0%", "1–25%", "26–50%", "51–75%", "76–100%", "Do not know / no data yet"],
  61: ["Repair", "Resale", "Leasing or subscription", "Other"],
  62: ["1–5%", "6–10%", "11–20%", "21–30%", "More than 30%", "Do not know"],
  67: ["QR codes", "RFID", "Other", "None"],
  71: ["Yes", "Partially", "No"], 72: ["Yes", "Partially", "No"],
  73: ["Yes", "Partially", "No, but planning to", "No"], 74: ["Yes", "No, but planning to", "No"],
  75: ["Less than 1%", "1–5%", "6–10%", "More than 10%", "Do not know"],
  79: ["Endorsed a campaign or open letter", "Engaged politicians", "Met government representatives", "Customer advocacy", "Memberships or donations", "Feedback on STICA positions", "Other", "None"],
  82: ["Public Just Transition strategy", "Climate-adaptation investments disclosed", "Supplier consultation on climate goals", "Locally co-created adaptation measures", "Financial compensation for affected workers", "Reskilling or upskilling", "Heat and humidity monitoring", "Collective bargaining at supplier facilities", "Independent unions at supplier facilities", "Living-wage approach", "Percentage of workers paid a living wage disclosed", "Responsible supplier-exit strategy", "None"],
  84: ["WG1 Climate Action", "WG2 China", "WG2 India", "WG2 Türkiye", "WG2 Vietnam/Taiwan", "WG2 Bangladesh", "WG3 Materials", "WG4 User Phase and Circularity", "WG6 Retail", "WG7 Retail Scope 2", "WG8 Norway"],
  85: ["Quarterly", "Bi-annually", "Annually", "Every second year", "Every third year", "Other"],
  87: ["Yes", "No", "Maybe"], 88: ["Yes", "No", "Maybe"],
};

const multiple = new Set([4, 5, 12, 32, 33, 35, 38, 61, 67, 79, 82, 84]);
const single = new Set(Object.keys(options).map(Number).filter((n) => !multiple.has(n)));
const textarea = new Set([1, 2, 49, 53, 56, 59, 64, 66, 69, 80, 86, 89, 90, 91, 92]);
const number = new Set([6, 15, 17]);
const visibility = { 51: 50, 52: 50, 53: 50, 61: 60, 62: 60, 63: 60, 64: 60, 66: 65, 69: 68, 84: 83 };

const questions = prompts.map((prompt, index) => {
  const n = index + 1;
  const page = pages.find(([start, end]) => n >= start && n <= end);
  const type = multiple.has(n) ? "multiple_choice" : single.has(n) ? "single_choice" : textarea.has(n) ? "textarea" : number.has(n) ? "number" : "yes_no";
  return {
    n, stableKey: `CTP25-${String(n).padStart(3, "0")}`, prompt, type,
    options: options[n] ?? [], required: ![2, 15, 17, 30, 49, 53, 56, 59, 64, 66, 69, 80, 86, 89, 90, 91, 92].includes(n),
    sectionKey: page[2], sectionTitle: page[3], category: page[3],
    visibilityRule: visibility[n] ? { questionKey: `CTP25-${String(visibility[n]).padStart(3, "0")}`, operator: "equals", value: "Yes" } : {},
    validation: n === 7 ? { presentation: "dropdown" } : {},
  };
});
if (questions.length !== 92) throw new Error(`Expected 92 questions, found ${questions.length}.`);

async function main() {
  const [version] = await upsert("survey_versions", [{ reporting_year: 2025, name: "STICA Signatory's Survey 2025 - Climate Transition Plans", status: "draft", opens_at: null, closes_at: null, published_at: null }], "reporting_year,name");
  const definitions = await upsert("question_definitions", questions.map((q) => ({ stable_key: q.stableKey, category: q.category })), "stable_key");
  const revisions = await upsert("question_revisions", questions.map((q) => ({
    question_id: definitions.find((row) => row.stable_key === q.stableKey).id,
    revision_number: 1, prompt: q.prompt, help_text: null, question_type: q.type, options: q.options, validation: q.validation,
  })), "question_id,revision_number");
  await upsert("survey_questions", questions.map((q, index) => {
    const definition = definitions.find((row) => row.stable_key === q.stableKey);
    const revision = revisions.find((row) => row.question_id === definition.id);
    return { survey_version_id: version.id, question_revision_id: revision.id, display_order: index + 1, is_required: q.required, carry_forward_enabled: true, visibility_rule: q.visibilityRule, section_key: q.sectionKey, section_title: q.sectionTitle };
  }), "survey_version_id,question_revision_id");
  const { count, error } = await db.from("survey_questions").select("id", { count: "exact", head: true }).eq("survey_version_id", version.id);
  assert("verify survey", error);
  if (count !== 92) throw new Error(`Draft verification failed: expected 92 questions, found ${count}.`);
  console.log(JSON.stringify({ surveyVersionId: version.id, reportingYear: 2025, status: "draft", pages: pages.length, questions: count }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
