# AI security architecture

## Objective

The portal uses Cloudflare Workers as the controlled AI boundary and Supabase as the identity and system-of-record layer. The browser never receives an AI provider credential or Supabase secret key. Canonical survey answers are not modified by AI output.

## Runtime topology

```text
Browser
  | Supabase user access token
  v
Cloudflare Worker /api/ai/*
  |-- verifies token with Supabase Auth
  |-- enforces role, membership, rate and budget
  |-- reads/writes through a server-only Supabase secret key
  |-- decrypts the provider key only for an outbound provider request
  v
Supabase PostgreSQL                  OpenAI API
  | survey snapshots                  | structured response
  | settings and prices               | token usage
  | encrypted credential              |
  | summaries, usage and audit <-------
```

Static assets are served by the same Worker through the `ASSETS` binding. `/api/*` requests never fall through to the single-page application.

## Trust boundaries

### Browser

- Treat all fields, IDs, filters and role claims shown by the UI as untrusted.
- Send the current Supabase access token in the `Authorization` header.
- Never store or render provider secrets.
- Render AI output through normal React text interpolation; do not inject provider output as HTML.

### Cloudflare Worker

- Validate every access token using Supabase Auth `getUser(token)`.
- Repeat authorization for each endpoint. UI visibility is not authorization.
- Accept JSON only and enforce small body limits for control endpoints.
- Reject cross-origin state-changing requests.
- Keep outbound provider destinations fixed in code to prevent SSRF.
- Add a random request ID to API errors and use structured server logs without tokens or secrets.
- Add CSP, clickjacking, MIME-sniffing, referrer and browser permission headers to application responses.

### Supabase

- Use the publishable key in the browser together with RLS.
- Keep the secret key in Cloudflare only. It bypasses RLS, so the Worker must authorize before creating an admin client.
- Revoke browser roles from AI governance tables. The credential table deliberately has no authenticated-user policy.
- Preserve immutable submission snapshots as the source for summaries.

### AI provider

- Receive only evidence necessary for the requested task. Organisation identity is not included in summary prompts.
- Use `store: false` for summary requests.
- Treat survey text as evidence, never as instructions, to reduce prompt-injection risk.
- Moderate both the submitted evidence and generated result with `omni-moderation-latest`; fail closed when the safety check is unavailable.
- Require a strict JSON schema and verify source question IDs before persistence.

## OpenAI policy and data-control baseline

This implementation follows the current [OpenAI Usage Policies](https://openai.com/policies/usage-policies/) and [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data/):

- OpenAI API inputs and outputs are not used for model training by default unless the API organisation explicitly opts in.
- `store: false` prevents Responses API application-state storage, but it does **not** by itself remove standard abuse-monitoring retention. OpenAI documents that those logs may retain customer content for up to 30 days by default.
- If the programme requires stricter handling, the OpenAI organisation must be approved for Zero Data Retention or Modified Abuse Monitoring; this cannot be enabled by application code alone.
- A SHA-256 hash of the authenticated user ID is sent as `safety_identifier`; email addresses and usernames are not sent for this purpose.
- The [Moderation API](https://developers.openai.com/api/reference/cli/resources/moderations) checks both input and output using `omni-moderation-latest`.
- AI summaries are labelled as drafts and require human verification against source responses. They must not be used to make automated high-impact decisions about individuals.
- Before production activation, confirm the organisation's lawful basis, privacy notice, OpenAI business terms/DPA as applicable, data-region requirements, authorised data categories, and deletion/retention procedure.
- Review this baseline when OpenAI policies change and at least once per reporting cycle. Record the review in the project governance log.

## Endpoints

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /api/ai/settings` | Platform administrator | Read non-secret configuration and masked credential status |
| `PUT /api/ai/settings` | Platform administrator | Save limits, price and optionally replace the encrypted provider key |
| `POST /api/ai/settings/test` | Platform administrator | Test the saved model and provider credential |
| `GET /api/ai/usage` | Platform administrator | Read current-month usage, spend and projection |
| `POST /api/ai/estimate` | Platform administrator | Estimate cost using saved pricing |
| `POST /api/ai/summary` | Platform administrator or company contributor | Generate a summary from an authorized submitted snapshot |

## Credential lifecycle

1. The administrator enters a replacement provider key over HTTPS.
2. The Worker validates the session and platform-admin role.
3. AES-256-GCM encrypts the key with a fresh 96-bit IV.
4. Supabase stores only ciphertext, key suffix, encryption version and audit metadata.
5. The encryption key remains a Cloudflare secret and is not stored in Supabase.
6. Read endpoints return only `configured`, source, suffix and update time.
7. For an AI call, the Worker decrypts the key in request memory and sends it only to the fixed provider origin.

The environment `OPENAI_API_KEY` can be used as a fallback when no dashboard-managed credential exists. Dashboard credentials take precedence.

## Budget and cost calculation

Model prices are editable configuration stamped with an effective time, not hard-coded assumptions. Before a provider request, the Worker estimates input tokens, reserves the configured maximum output, and calculates:

```text
estimated cost =
  input tokens * input price per million / 1,000,000
  + output tokens * output price per million / 1,000,000
```

The request is blocked if its estimate would exceed the platform monthly budget or optional company monthly budget. After completion, provider-reported token counts replace the estimate for actual cost. Pricing must be configured before AI can run.

Cost is an operational estimate rather than an invoice. Provider billing can include adjustments not represented by token prices; reconcile the portal total against the provider account periodically.

## Abuse and privacy controls

- Ten requests per user per rolling minute are allowed by the initial database-backed limiter.
- Platform and optional company budgets are checked before provider calls.
- Provider-incurred cost is retained even when an output is subsequently rejected by moderation.
- Benchmark displays must never expose peer rows and must suppress results below the configured minimum, which cannot be lower than five.
- Company contributors can generate only for an organisation where they are a `member` or `company_admin`.
- Viewer accounts cannot generate summaries.
- Administrator actions that change AI settings are written to the existing audit trail without recording the key.

For high concurrency, replace the initial rate counter with a Durable Object or Cloudflare Rate Limiting binding so the check and increment are atomic at the edge.

## Database objects

- `ai_settings`: singleton provider, models, budgets, output limit, privacy threshold and feature switch.
- `ai_provider_credentials`: encrypted key material; server-only.
- `ai_model_prices`: editable per-million-token prices.
- `ai_usage_events`: request status, scope, token counts and estimated/actual cost.
- `ai_summaries`: reviewable output tied to immutable snapshots.
- `audit_events`: administrator configuration history.

## Deployment checklist

1. Apply Supabase migrations and run database advisors.
2. Configure Cloudflare secrets; never use repository variables for secret values.
3. Run `npm run cf:types` after binding or variable-name changes.
4. Run `npm run build` so both React and Worker TypeScript are checked.
5. Deploy through the protected `main` branch workflow.
6. Enter current model prices in AI control centre.
7. Test provider connectivity, set conservative budgets, then enable AI.
8. Exercise administrator, contributor and viewer accounts.
9. Confirm credential values never appear in browser responses, Worker logs or audit details.
10. Compare recorded monthly usage with the provider bill.
11. Confirm OpenAI data-sharing is not opted in and document whether standard retention, Modified Abuse Monitoring, or Zero Data Retention applies.
12. Publish a user-facing AI notice that explains the data sent, purpose, human-review requirement, and contact/deletion route before enabling AI.

## Incident response

- Provider key suspected leaked: revoke it at the provider, replace it in the dashboard or Cloudflare, and inspect `ai_usage_events` and provider logs.
- Supabase secret key suspected leaked: rotate it immediately and update the Cloudflare secret.
- Encryption key suspected leaked: replace it and replace every dashboard-managed provider credential.
- Unexpected spend: disable AI from the control centre, inspect usage by model and company, then lower budgets before re-enabling.
- Cross-company data concern: disable AI, preserve logs, verify membership checks and snapshot scope, then rotate elevated credentials if compromise is possible.
