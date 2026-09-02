# STICA reporting portal architecture

## Product boundary

The first release stays focused on secure annual reporting: versioned surveys, persistent question IDs, carry-forward answers, company access, progress monitoring, historical import, and Excel exports. Future capabilities should extend these workflows without changing the identity of a question or mutating submitted history.

## Frontend boundaries

- `src/components/primitives.tsx` owns reusable Tailwind controls and text-overflow behavior.
- `src/components/shell.tsx` owns navigation, account identity, and responsive shell behavior.
- `src/components/admin` owns focused administrator workflows such as audit activity, company directory, and survey workspace actions.
- `src/components/question-field.tsx` owns answer inputs across company and preview experiences.
- `src/lib/portal.ts` contains domain types and pure data transformations.
- `src/lib/spreadsheet.ts` owns workbook import/export behavior.
- `src/styles.css` is the legacy style foundation. New cross-cutting overrides live in `src/styles/refinements.css`; feature-local layout should prefer Tailwind utilities.

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

The company benchmark RPC returns completion aggregates only and suppresses peer metrics until five active companies are present. Administrator comparisons use authorized progress rows.

### AI summaries

The `generate-ai-summary` Edge Function sends submitted snapshot evidence to the OpenAI Responses API with a strict JSON schema and stores model/prompt versions plus source question IDs. Summaries remain separate from canonical answers and are labelled as drafts requiring verification.

### Document uploads

The private `report-documents` bucket uses organization/submission paths. `submission_documents` stores metadata, while matching table and object policies allow read access to company members and write access only to contributors/admins.

### API integrations

Route external integrations through versioned Edge Functions. Validate signatures, use idempotency keys, log correlation IDs, and map external records to stable internal IDs rather than question wording.

## Export contract

The export service must continue to support all responses, one company, one question, and one reporting year. Excel is the canonical analysis format. PDF remains a presentation output generated from immutable submitted data, not a replacement for the analysis export.

## Release checks

- Build and type-check before push.
- Test administrator and company roles.
- Check 1600x900, 1024x768, and 390x844 viewports.
- Verify no horizontal page overflow, inaccessible truncated values, emoji controls, or duplicate global actions.
- Apply and verify database migrations before declaring a live error fixed.
- Re-test the deployed URL after GitHub CI/CD completes.
