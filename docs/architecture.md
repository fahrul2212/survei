# STICA reporting portal architecture

## Product boundary

The first release stays focused on secure annual reporting: versioned surveys, persistent question IDs, carry-forward answers, company access, progress monitoring, historical import, and Excel exports. Future capabilities should extend these workflows without changing the identity of a question or mutating submitted history.

## Frontend boundaries

- `src/components/primitives.tsx` owns reusable Tailwind controls and text-overflow behavior.
- `src/components/shell.tsx` owns navigation, account identity, and responsive shell behavior.
- `src/components/admin` owns focused administrator workflows such as audit activity, company directory, and survey workspace actions.
- `src/components/question-field.tsx` dispatches shared answer controls in `src/components/questions` for company and preview experiences.
- `shared/survey-answer.ts` defines structured answer values and validation; `shared/survey-import.ts` maps verified source wording and subcolumns.
- `src/features/reporting` owns the serialized autosave queue and submission review dialog.
- `shared/email-template.ts` renders the same escaped templates used by the browser preview and Supabase email functions.
- `src/lib/portal.ts` contains domain types and pure data transformations.
- `src/lib/spreadsheet.ts` owns workbook import/export behavior.
- `src/styles.css` owns theme tokens and base rules; feature-local layout uses Tailwind utilities.

Use solid white, slate and STICA red surfaces throughout the portal and report previews. Do not introduce gradients, glass effects, decorative glow or background ornaments. Separate content with spacing, typography and borders; reserve shadows and translucent backdrops for temporary dialogs, drawers and notifications. AI analysis follows the same restrained visual language as other reporting tools.

Presentational components receive data and callbacks. A component may call Supabase directly only when it owns an isolated end-to-end workflow, as `AuditLogView` does.

## Stable annual data model

Question identity and wording are separate concerns:

1. `question_definitions.stable_key` is the durable identity used across years.
2. `question_revisions` stores wording, response type, options, and validation.
3. `survey_questions` places a revision in a reporting year and owns order, required state, section, and visibility.
4. `question_carry_forward_rules` explicitly maps prior answers when identity alone is insufficient.
5. Submitted answers and snapshots remain immutable until an administrator reopens the submission through an audited workflow.

## Extension points

### Automated reminders

`reminder_policies` and `reminder_deliveries` configure and audit deadline messages. A daily scheduled Edge Function sends through Resend; per-recipient/date idempotency keys prevent duplicate delivery.

### Multiple users and roles

Organization membership is the authorization source. `viewer` is read-only, `member` is a reporting contributor, and `company_admin` can manage the company team. Roles never come from user-editable profile metadata.

### Benchmarking

The completion benchmark RPC remains available. Question comparisons use Worker `POST /api/analysis` and `GET /api/benchmark/questions`, backed by `worker/services/analysis`. These routes calculate numeric averages/medians and allowlisted choice distributions from submitted reports without calling an AI provider. Admin filters may select companies; company callers cannot select peer identities and receive only their own detailed values plus permitted anonymous aggregates. Small positive and complementary choice cells suppress the entire distribution. See `docs/survey-parity-release.md` for cohort rules and verification.

### AI summaries and governance

Cloudflare Worker routes under `/api/ai/*` form the only AI provider boundary. The Worker verifies the Supabase access token with Auth, repeats authorization server-side, checks rate and monthly budget controls, loads an immutable submitted snapshot, and sends only the required evidence to the provider using a strict JSON schema. It records estimated and actual tokens and cost in Supabase. Summaries remain separate from canonical answers and are labelled as drafts requiring verification.

Administrator settings, model pricing and usage are managed in the AI control centre. Provider credentials are encrypted by the Worker before storage and cannot be selected through the browser-facing Supabase role. See `docs/ai-security-architecture.md` for the complete trust model.

### Document uploads

The private `report-documents` bucket uses organization/submission paths. `submission_documents` stores metadata, while matching table and object policies allow read access to company members and write access only to contributors/admins.

### API integrations

Route AI and other user-facing integrations through versioned Cloudflare Worker endpoints. Validate signatures and authenticated users, use idempotency keys where requests can be retried, log correlation IDs, and map external records to stable internal IDs rather than question wording. Supabase Edge Functions remain appropriate for database-scheduled reminder delivery.

## Export contract

The export service must continue to support all responses, one company, one question, and one reporting year. Excel is the canonical analysis format. PDF remains a presentation output generated from immutable submitted data, not a replacement for the analysis export.

## Release checks

- Build and type-check before push.
- Test administrator and company roles.
- Check 1600x900, 1024x768, and 390x844 viewports.
- Verify no horizontal page overflow, inaccessible truncated values, emoji controls, or duplicate global actions.
- Apply and verify database migrations before declaring a live error fixed.
- Re-test the deployed URL after GitHub CI/CD completes.
