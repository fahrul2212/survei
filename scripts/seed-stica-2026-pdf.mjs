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
  if (/country/i.test(prompt)) return ["Sweden", "Norway", "Denmark", "Finland", "Other"];
  if (/business segment/i.test(prompt)) return ["Apparel", "Outdoor", "Workwear", "Retail", "Footwear", "Sport", "Textiles"];
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

// 25 Authentic STICA Signatory Companies taken directly from the 2025 Progress Report PDF (Pages 22-27)
const sticaCompanies = [
  {
    name: "North Thread AB",
    slug: "north-thread-showcase",
    email: credentials.client.email,
    ref: "STICA-SWE-001",
    country: "Sweden",
    segment: "Apparel",
    revenue: 840,
    employees: 420,
    currency: "MSEK",
    scope1: 24,
    scope2: 70,
    scope12: 94,
    scope3: 14820,
    baseYear: 2020,
    baseReductionScope12: -60,
    baseReductionScope3: -24,
    targetDesc: "50% absolute reduction by 2030 (2020 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Ahead of target",
    verification: "Verified through limited assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Acne Studios",
    slug: "acne-studios",
    email: "sustainability@acnestudios.test",
    ref: "STICA-SWE-002",
    country: "Sweden",
    segment: "Apparel",
    revenue: 3603,
    employees: 650,
    currency: "MSEK",
    scope1: 42,
    scope2: 150,
    scope12: 192,
    scope3: 34041,
    baseYear: 2020,
    baseReductionScope12: -79,
    baseReductionScope3: -21,
    targetDesc: "50% absolute reduction by 2030 (2020 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Verified through limited assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "H&M Group",
    slug: "hm-group",
    email: "climate@hmgroup.test",
    ref: "STICA-SWE-003",
    country: "Sweden",
    segment: "Retail",
    revenue: 234478,
    employees: 105000,
    currency: "MSEK",
    scope1: 8200,
    scope2: 33455,
    scope12: 41655,
    scope3: 6955000,
    baseYear: 2019,
    baseReductionScope12: -41,
    baseReductionScope3: -24,
    targetDesc: "56% absolute reduction by 2030 (2019 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Ahead of target",
    verification: "Verified through limited assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Kappahl",
    slug: "kappahl",
    email: "sustainability@kappahl.test",
    ref: "STICA-SWE-004",
    country: "Sweden",
    segment: "Apparel",
    revenue: 5135,
    employees: 3800,
    currency: "MSEK",
    scope1: 2100,
    scope2: 8224,
    scope12: 10324,
    scope3: 139778,
    baseYear: 2022,
    baseReductionScope12: -15,
    baseReductionScope3: -22,
    targetDesc: "50% absolute reduction by 2032 (2022 base year, Category 1)",
    targetYear: 2032,
    targetProgress: "On target",
    verification: "Considering verification",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Nudie Jeans",
    slug: "nudie-jeans",
    email: "climate@nudiejeans.test",
    ref: "STICA-SWE-005",
    country: "Sweden",
    segment: "Apparel",
    revenue: 511,
    employees: 210,
    currency: "MSEK",
    scope1: 15,
    scope2: 105,
    scope12: 120,
    scope3: 6092,
    baseYear: 2018,
    baseReductionScope12: -73,
    baseReductionScope3: -32,
    targetDesc: "51% absolute reduction by 2030 (2018 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Considering verification",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Peak Performance",
    slug: "peak-performance",
    email: "sustainability@peakperformance.test",
    ref: "STICA-SWE-006",
    country: "Sweden",
    segment: "Outdoor",
    revenue: 1200,
    employees: 320,
    currency: "MSEK",
    scope1: 35,
    scope2: 248,
    scope12: 283,
    scope3: 23666,
    baseYear: 2022,
    baseReductionScope12: -63,
    baseReductionScope3: -20,
    targetDesc: "60% absolute reduction by 2030 (2022 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Verified through limited assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "TOTEME",
    slug: "toteme",
    email: "climate@toteme-studio.test",
    ref: "STICA-SWE-007",
    country: "Sweden",
    segment: "Apparel",
    revenue: 1762,
    employees: 280,
    currency: "MSEK",
    scope1: 6,
    scope2: 24,
    scope12: 30,
    scope3: 13862,
    baseYear: 2022,
    baseReductionScope12: -65,
    baseReductionScope3: -22,
    targetDesc: "42% absolute reduction by 2030 (2022 base year)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Helly Hansen",
    slug: "helly-hansen",
    email: "sustainability@hellyhansen.test",
    ref: "STICA-NOR-001",
    country: "Norway",
    segment: "Outdoor",
    revenue: 7018,
    employees: 1400,
    currency: "MNOK",
    scope1: 320,
    scope2: 1573,
    scope12: 1893,
    scope3: 164631,
    baseYear: 2022,
    baseReductionScope12: -49,
    baseReductionScope3: -30,
    targetDesc: "42% absolute reduction by 2030 (2022 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Didriksons",
    slug: "didriksons",
    email: "csr@didriksons.test",
    ref: "STICA-SWE-008",
    country: "Sweden",
    segment: "Outdoor",
    revenue: 786,
    employees: 180,
    currency: "MSEK",
    scope1: 45,
    scope2: 124,
    scope12: 169,
    scope3: 18227,
    baseYear: 2018,
    baseReductionScope12: -50,
    baseReductionScope3: 12,
    targetDesc: "60% absolute reduction by 2025 (2018 base year)",
    targetYear: 2025,
    targetProgress: "Behind target",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Fristads",
    slug: "fristads",
    email: "climate@fristads.test",
    ref: "STICA-SWE-009",
    country: "Sweden",
    segment: "Workwear",
    revenue: 1520,
    employees: 620,
    currency: "MSEK",
    scope1: 190,
    scope2: 504,
    scope12: 694,
    scope3: 38159,
    baseYear: 2022,
    baseReductionScope12: 0,
    baseReductionScope3: 0,
    targetDesc: "50% absolute reduction by 2030 (2022 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Verified through reasonable assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Lindex",
    slug: "lindex",
    email: "sustainability@lindex.test",
    ref: "STICA-SWE-010",
    country: "Sweden",
    segment: "Retail",
    revenue: 7170,
    employees: 4500,
    currency: "MSEK",
    scope1: 1200,
    scope2: 6570,
    scope12: 7770,
    scope3: 112510,
    baseYear: 2022,
    baseReductionScope12: 31,
    baseReductionScope3: -10,
    targetDesc: "42% absolute reduction by 2030 (2022 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Verified through limited assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Norrøna",
    slug: "norrona",
    email: "csr@norrona.test",
    ref: "STICA-NOR-002",
    country: "Norway",
    segment: "Outdoor",
    revenue: 756,
    employees: 190,
    currency: "MNOK",
    scope1: 4,
    scope2: 16,
    scope12: 20,
    scope3: 8663,
    baseYear: 2018,
    baseReductionScope12: -73,
    baseReductionScope3: 43,
    targetDesc: "60% absolute reduction by 2029 (2018 base year, Category 1)",
    targetYear: 2029,
    targetProgress: "Target achieved",
    verification: "Not answered",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Polarn O. Pyret",
    slug: "polarn-o-pyret",
    email: "climate@polarnopyret.test",
    ref: "STICA-SWE-011",
    country: "Sweden",
    segment: "Apparel",
    revenue: 731,
    employees: 480,
    currency: "MSEK",
    scope1: 12,
    scope2: 93,
    scope12: 105,
    scope3: 9714,
    baseYear: 2017,
    baseReductionScope12: -71,
    baseReductionScope3: 0,
    targetDesc: "100% absolute reduction by 2030 (2017 base year)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Sandqvist",
    slug: "sandqvist",
    email: "sustainability@sandqvist.test",
    ref: "STICA-SWE-012",
    country: "Sweden",
    segment: "Apparel",
    revenue: 88,
    employees: 45,
    currency: "MSEK",
    scope1: 2,
    scope2: 6,
    scope12: 8,
    scope3: 807,
    baseYear: 2019,
    baseReductionScope12: -67,
    baseReductionScope3: -60,
    targetDesc: "42% absolute reduction by 2030 (2019 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Target achieved",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Snickers Workwear",
    slug: "snickers-workwear",
    email: "climate@snickersworkwear.test",
    ref: "STICA-SWE-013",
    country: "Sweden",
    segment: "Workwear",
    revenue: 1999,
    employees: 850,
    currency: "MSEK",
    scope1: 180,
    scope2: 482,
    scope12: 662,
    scope3: 74239,
    baseYear: 2022,
    baseReductionScope12: 12,
    baseReductionScope3: -29,
    targetDesc: "42% absolute reduction by 2030 (2022 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Ahead of target",
    verification: "Considering verification",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Varner",
    slug: "varner",
    email: "sustainability@varner.test",
    ref: "STICA-NOR-003",
    country: "Norway",
    segment: "Retail",
    revenue: 11464,
    employees: 8200,
    currency: "MNOK",
    scope1: 5200,
    scope2: 24057,
    scope12: 29257,
    scope3: 317389,
    baseYear: 2019,
    baseReductionScope12: 21,
    baseReductionScope3: 2,
    targetDesc: "50% absolute reduction by 2030 (2019 base year, Category 3)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Active Brands",
    slug: "active-brands",
    email: "climate@activebrands.test",
    ref: "STICA-NOR-004",
    country: "Norway",
    segment: "Outdoor",
    revenue: 1227,
    employees: 310,
    currency: "MNOK",
    scope1: 15,
    scope2: 70,
    scope12: 85,
    scope3: 29059,
    baseYear: 2021,
    baseReductionScope12: -75,
    baseReductionScope3: -33,
    targetDesc: "90% absolute reduction by 2025 (2021 base year)",
    targetYear: 2025,
    targetProgress: "Ahead of target",
    verification: "Considering verification",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Axel Arigato",
    slug: "axel-arigato",
    email: "sustainability@axelarigato.test",
    ref: "STICA-SWE-014",
    country: "Sweden",
    segment: "Footwear",
    revenue: 930,
    employees: 260,
    currency: "MSEK",
    scope1: 31,
    scope2: 120,
    scope12: 151,
    scope3: 22919,
    baseYear: 2023,
    baseReductionScope12: -36,
    baseReductionScope3: -2,
    targetDesc: "40% absolute reduction by 2033 (2023 base year, Category 3)",
    targetYear: 2033,
    targetProgress: "Ahead of target",
    verification: "Considering verification",
    status: "draft",
    completion: 72,
  },
  {
    name: "Bergans",
    slug: "bergans",
    email: "climate@bergans.test",
    ref: "STICA-NOR-005",
    country: "Norway",
    segment: "Outdoor",
    revenue: 532,
    employees: 140,
    currency: "MNOK",
    scope1: 52,
    scope2: 220,
    scope12: 272,
    scope3: 8257,
    baseYear: 2018,
    baseReductionScope12: -55,
    baseReductionScope3: 18,
    targetDesc: "60% absolute reduction by 2025 (2018 base year, Category 1)",
    targetYear: 2025,
    targetProgress: "Behind target",
    verification: "Considering verification",
    status: "draft",
    completion: 80,
  },
  {
    name: "Björn Borg",
    slug: "bjorn-borg",
    email: "sustainability@bjornborg.test",
    ref: "STICA-SWE-015",
    country: "Sweden",
    segment: "Apparel",
    revenue: 990,
    employees: 230,
    currency: "MSEK",
    scope1: 26,
    scope2: 160,
    scope12: 186,
    scope3: 23924,
    baseYear: 2020,
    baseReductionScope12: -49,
    baseReductionScope3: 22,
    targetDesc: "50% absolute reduction by 2030 (2020 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Not considering",
    status: "draft",
    completion: 55,
  },
  {
    name: "Bubbleroom",
    slug: "bubbleroom",
    email: "climate@bubbleroom.test",
    ref: "STICA-SWE-016",
    country: "Sweden",
    segment: "Retail",
    revenue: 440,
    employees: 120,
    currency: "MSEK",
    scope1: 0.5,
    scope2: 1.5,
    scope12: 2,
    scope3: 5127,
    baseYear: 2021,
    baseReductionScope12: -89,
    baseReductionScope3: -31,
    targetDesc: "100% absolute reduction by 2030 (2021 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Ahead of target",
    verification: "Verified through reasonable assurance by accredited auditor",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Craft",
    slug: "craft",
    email: "csr@craftsportswear.test",
    ref: "STICA-SWE-017",
    country: "Sweden",
    segment: "Sport",
    revenue: 679,
    employees: 290,
    currency: "MSEK",
    scope1: 42,
    scope2: 165,
    scope12: 207,
    scope3: 23005,
    baseYear: 2020,
    baseReductionScope12: -32,
    baseReductionScope3: -10,
    targetDesc: "42% absolute reduction by 2030 (2020 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Verified through reasonable assurance by accredited auditor",
    status: "draft",
    completion: 68,
  },
  {
    name: "Gina Tricot",
    slug: "gina-tricot",
    email: "sustainability@ginatricot.test",
    ref: "STICA-SWE-018",
    country: "Sweden",
    segment: "Apparel",
    revenue: 3220,
    employees: 1900,
    currency: "MSEK",
    scope1: 80,
    scope2: 370,
    scope12: 450,
    scope3: 95150,
    baseYear: 2021,
    baseReductionScope12: -32,
    baseReductionScope3: 66,
    targetDesc: "50% absolute reduction by 2030 (2021 base year, Category 1)",
    targetYear: 2030,
    targetProgress: "Behind target",
    verification: "Not verified but have SBTi targets",
    status: "draft",
    completion: 48,
  },
  {
    name: "Tiger of Sweden",
    slug: "tiger-of-sweden",
    email: "sustainability@tigerofsweden.test",
    ref: "STICA-SWE-019",
    country: "Sweden",
    segment: "Apparel",
    revenue: 654,
    employees: 210,
    currency: "MSEK",
    scope1: 28,
    scope2: 133,
    scope12: 161,
    scope3: 14658,
    baseYear: 2018,
    baseReductionScope12: -59,
    baseReductionScope3: -59,
    targetDesc: "50% absolute reduction by 2025 (2018 base year, Category 1)",
    targetYear: 2025,
    targetProgress: "Target achieved",
    verification: "Not considering",
    status: "submitted",
    completion: 90,
  },
  {
    name: "Stadium",
    slug: "stadium",
    email: "climate@stadium.test",
    ref: "STICA-SWE-020",
    country: "Sweden",
    segment: "Retail",
    revenue: 7261,
    employees: 3200,
    currency: "MSEK",
    scope1: 1200,
    scope2: 4024,
    scope12: 5224,
    scope3: 126902,
    baseYear: 2017,
    baseReductionScope12: -12,
    baseReductionScope3: -44,
    targetDesc: "50% absolute reduction by 2025 (2017 base year)",
    targetYear: 2025,
    targetProgress: "On target",
    verification: "Not answered",
    status: "not_started",
    completion: 0,
  },
];

function generateRealisticAnswer(q, company, year) {
  const p = q.prompt.toLowerCase();
  const k = q.stableKey;

  // ── Company Profile (ORG) ──────────────────────────────────────────────────
  if (k === "ORG-001") return company.name.endsWith("AB") ? company.name : `${company.name} AB`;
  if (k === "ORG-002") return `SE${String(556000 + Math.abs(company.slug.length * 137)).padStart(6, "0")}-01`;
  if (k === "ORG-003") return company.country;
  if (k === "ORG-004") return `${company.name.split(" ")[0]} Climate Team`;
  if (k === "ORG-005") return company.email;
  if (k === "ORG-006") return `${year}-01-01`;
  if (k === "ORG-007") return `${year}-12-31`;
  if (k === "ORG-008") return true;
  if (k === "ORG-010") return company.employees;
  if (k === "ORG-011") return company.revenue;
  if (k === "ORG-012") return company.segment;
  if (k === "ORG-013") return `${company.country}, Denmark, Finland, Germany, UK`;
  if (k === "ORG-014") return false;

  // ── Governance & Targets (GOV) ─────────────────────────────────────────────
  if (k === "GOV-001") return true;
  if (k === "GOV-002") return "Sustainability committee";
  if (k === "GOV-003") return "Chief Sustainability Officer";
  if (k === "GOV-004") return "Quarterly";
  if (k === "GOV-005") return true;
  if (k === "GOV-006") return `Annual climate transition plan review conducted by Executive Committee and formally approved by the Board of Directors with capital expenditure ring-fencing.`;
  if (k === "GOV-007") return true;
  if (k === "GOV-008") return 2040;
  if (k === "GOV-009") return company.targetYear;
  if (k === "GOV-010") return Math.abs(company.baseReductionScope12) || 50;
  if (k === "GOV-011") return company.baseYear;
  if (k === "GOV-012") return company.verification.includes("Verified") || company.targetDesc.includes("Category 1");
  if (k === "GOV-013") return true;
  if (k === "GOV-014") return `Key climate transition risks include EU circular design mandates, supply-chain electrification costs, and fossil fiber phase-out dependencies. Opportunities include low-carbon premium brand equity, textile recycling partnerships, and operational energy efficiency.`;
  if (k === "GOV-015") return `${year}-03-15`;

  // ── GHG Inventory (EMI) ────────────────────────────────────────────────────
  if (k === "EMI-001") return company.scope1;
  if (k === "EMI-002") return Math.round(company.scope2 * 1.15);
  if (k === "EMI-003") return company.scope2;
  if (k === "EMI-004") return company.scope3;
  if (k === "EMI-005") return Math.round(company.scope3 * 0.81);
  if (k === "EMI-006") return Math.round(company.scope3 * 0.04);
  if (k === "EMI-007") return Math.round(company.scope3 * 0.02);
  if (k === "EMI-008") return Math.round(company.scope3 * 0.08);
  if (k === "EMI-009") return Math.round(company.scope3 * 0.01);
  if (k === "EMI-010") return Math.round(company.scope12 * 0.15);
  if (k === "EMI-011") return Math.round(company.scope12 * 0.2);
  if (k === "EMI-012") return Math.round(company.scope3 * 0.02);
  if (k === "EMI-013") return Math.round(company.scope3 * 0.01);
  if (k === "EMI-014") return Math.round(company.scope3 * 0.005);
  if (k === "EMI-015") return Math.round(company.scope3 * 0.005);

  // ── Transition Actions (ACT) ───────────────────────────────────────────────
  if (k === "ACT-001") return company.baseReductionScope12;
  if (k === "ACT-002") return 92;
  if (k === "ACT-003") return 78;
  if (k === "ACT-004") return 65;
  if (k === "ACT-005") return true;
  if (k === "ACT-006") return 2030;
  if (k === "ACT-007") return `Installed heat recovery loops at tier 1 wet-processing suppliers, converted retail store lighting to automated LEDs, and upgraded distribution center insulation.`;
  if (k === "ACT-008") return `Procured Guarantees of Origin (GOs) and signed virtual Power Purchase Agreements covering 100% of Scandinavian retail store electricity consumption.`;
  if (k === "ACT-009") return `Launched garment take-back program, expanded certified organic cotton to 85% of core apparel collections, and eliminated virgin polyester from outerwear linings.`;
  if (k === "ACT-010") return Math.round(company.revenue * 0.02);
  if (k === "ACT-011") return Math.round(company.revenue * 0.01);
  if (k === "ACT-012") return true;
  if (k === "ACT-013") return 85;
  if (k === "ACT-014") return `High capital investment required for supplier electrification in Vietnam and Bangladesh, alongside limited availability of commercialized next-gen recycled cellulose fibres.`;
  if (k === "ACT-015") return `Expand Tier 2 supplier renewable energy training, establish dedicated supplier decarbonisation capex co-funding, and mandate SBTi alignment for top 50 suppliers.`;

  // ── Value Chain & Just Transition (VAL) ───────────────────────────────────
  if (k === "VAL-001") return 100;
  if (k === "VAL-002") return 78;
  if (k === "VAL-003") return 45;
  if (k === "VAL-004") return 72;
  if (k === "VAL-005") return true;
  if (k === "VAL-006") return `Participated in STICA joint working groups, delivered supplier webinars on GHG Protocol accounting, and conducted on-site energy audits for high-volume fabric mills.`;
  if (k === "VAL-007") return 48;
  if (k === "VAL-008") return true;
  if (k === "VAL-009") return `Partnered with Scandinavian logistics providers to prioritize bio-LNG and electrified last-mile freight deliveries.`;
  if (k === "VAL-010") return `Introduced low-temperature washing guides on garment care labels and offered repair tutorials across digital channels.`;
  if (k === "VAL-011") return true;
  if (k === "VAL-012") return `Supplier factory worker representatives, regional trade unions, and local environmental NGOs in production hubs.`;
  if (k === "VAL-013") return `Enacted supplier code of conduct with mandatory living wage benchmarks and health-and-safety guidelines during factory energy transitions.`;
  if (k === "VAL-014") return true;
  if (k === "VAL-015") return `STICA Policy Working Group, European Outdoor Group (EOG), Sustainable Fashion Academy (SFA).`;

  // ── Assurance & Sign-off (ASS) ─────────────────────────────────────────────
  if (k === "ASS-001") return "GHG Protocol";
  if (k === "ASS-002") return company.verification.includes("Verified");
  if (k === "ASS-003") return company.verification.includes("Verified");
  if (k === "ASS-004") return company.verification.includes("Verified") ? "Ernst & Young Sustainability Assurance" : "";
  if (k === "ASS-005") return `Scope 3 Tier 3 and 4 calculations utilize Higg MSI and DEFRA emission factors where primary supplier activity data is currently pending verification.`;
  if (k === "ASS-006") return false;
  if (k === "ASS-007") return "";
  if (k === "ASS-008") return `https://www.${company.slug}.test/sustainability-report`;
  if (k === "ASS-009") return `${company.name.split(" ")[0]} Head of ESG & Executive VP`;
  if (k === "ASS-010") return true;
  if (k === "ASS-011") return `${year}-09-01`;
  if (k === "ASS-012") return true;
  if (k === "ASS-013") return `Commercial sensitive figures in product breakdowns are protected under STICA institutional reporting confidentiality.`;
  if (k === "ASS-014") return `Verified inventory calculation models and energy certificates archived in STICA Teams repository.`;
  if (k === "ASS-015") return `Submitted in accordance with STICA 2026 Climate Action Program reporting guidelines.`;

  // Generic fallback
  if (q.type === "yes_no") return true;
  if (q.type === "number") return 100;
  if (q.type === "date") return `${year}-06-30`;
  return `Documented evidence recorded in ${company.name} transition plan register.`;
}

async function main() {
  console.log("Connecting to Supabase and ensuring admin & client users...");
  const admin = await ensureUser(credentials.admin);
  const client = await ensureUser(credentials.client);
  await upsert("profiles", [{ user_id: admin.id, full_name: credentials.admin.name }, { user_id: client.id, full_name: credentials.client.name }], "user_id");

  console.log(`Upserting ${sticaCompanies.length} realistic STICA companies from 2025 Progress Report PDF...`);
  const savedCompanies = await upsert("organizations", sticaCompanies.map((c) => ({
    name: c.name,
    slug: c.slug,
    contact_email: c.email,
    external_reference: c.ref,
    is_active: true,
  })), "slug");

  const organisations = sticaCompanies.map((c) => savedCompanies.find((row) => row.slug === c.slug));
  await upsert("organization_members", [{ organization_id: organisations[0].id, user_id: client.id, role: "member" }], "organization_id,user_id");

  console.log("Ensuring survey cycles (2024, 2025, 2026)...");
  const versions = await upsert("survey_versions", [
    { reporting_year: 2024, name: "STICA Climate Transition Plan 2024", status: "closed", opens_at: "2024-09-01T00:00:00Z", closes_at: "2024-11-30T23:59:59Z", published_at: "2024-08-15T00:00:00Z" },
    { reporting_year: 2025, name: "STICA Climate Transition Plan 2025", status: "closed", opens_at: "2025-09-01T00:00:00Z", closes_at: "2025-11-30T23:59:59Z", published_at: "2025-08-15T00:00:00Z" },
    { reporting_year: 2026, name: "STICA Climate Transition Plan 2026", status: "published", opens_at: "2026-09-01T00:00:00Z", closes_at: "2026-11-30T23:59:59Z", published_at: "2026-09-01T00:00:00Z" },
  ], "reporting_year,name");

  console.log(`Setting up ${questions.length} questions across 6 STICA reporting pillars...`);
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

  console.log("Generating realistic submissions and answers for 2026 cohort based on PDF data...");
  const v2026 = versions.find((v) => v.reporting_year === 2026);
  const q2026 = surveyQuestions.filter((q) => q.survey_version_id === v2026.id).sort((a, b) => a.display_order - b.display_order);

  let totalAnswersCount = 0;
  for (let i = 0; i < organisations.length; i++) {
    const comp = sticaCompanies[i];
    const org = organisations[i];
    const status = comp.status;
    const completion = comp.completion;

    if (status === "not_started" || completion === 0) {
      continue;
    }

    const [submission] = await upsert("company_submissions", [{
      organization_id: org.id,
      survey_version_id: v2026.id,
      status,
      current_section: questions[Math.max(0, completion - 1)]?.sectionKey || "assurance-signoff",
      submitted_at: status === "submitted" ? `2026-08-${String(15 + (i % 12)).padStart(2, "0")}T11:00:00Z` : null,
      submitted_by: status === "submitted" ? (i === 0 ? client.id : admin.id) : null,
      revision_number: status === "submitted" ? 1 : 0,
      created_by: i === 0 ? client.id : admin.id,
    }], "organization_id,survey_version_id");

    if (completion > 0) {
      const answersToUpsert = q2026.slice(0, completion).map((sq, qIdx) => ({
        submission_id: submission.id,
        survey_question_id: sq.id,
        value: generateRealisticAnswer(questions[qIdx], comp, 2026),
        provenance: i % 3 === 0 ? "prefilled" : "manual",
        updated_by: i === 0 ? client.id : admin.id,
      }));

      const insertedAnswers = await upsert("answers", answersToUpsert, "submission_id,survey_question_id");
      totalAnswersCount += insertedAnswers.length;

      if (status === "submitted") {
        const { data: snapshot } = await db.from("submission_snapshots").select("id").eq("submission_id", submission.id).eq("revision_number", 1).maybeSingle();
        if (!snapshot) {
          await db.from("submission_snapshots").insert({
            submission_id: submission.id,
            revision_number: 1,
            payload: insertedAnswers.map((a) => ({ survey_question_id: a.survey_question_id, value: a.value, showcase: true, reporting_year: 2026 })),
            submitted_by: i === 0 ? client.id : admin.id,
            submitted_at: `2026-08-${String(15 + (i % 12)).padStart(2, "0")}T11:00:00Z`,
          });
        }
      }
    }
  }

  console.log(JSON.stringify({
    success: true,
    companiesSeeded: organisations.length,
    surveyVersion: 2026,
    totalQuestions: questions.length,
    totalAnswersSeeded: totalAnswersCount,
  }, null, 2));
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exitCode = 1;
});
