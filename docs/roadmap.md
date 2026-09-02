# STICA Reporting Portal Roadmap

This roadmap keeps the first release focused on reliable annual reporting while leaving clear extension points for the longer-term programme.

## Phase 1 - Core reporting experience (current priority)

Goal: make the annual reporting cycle easy to complete, easy to administer, and safe to reuse year over year.

- Calm STICA-aligned UI across login, company workspace, report flow, admin dashboard, survey builder, company directory, import/export, analytics, and audit log.
- Secure authentication and company-level data isolation through Supabase Auth and RLS.
- Multiple independently named survey cycles per reporting year, each with persistent question IDs and its own lifecycle.
- Explicit carry-forward mappings: matching answers are prefilled, new questions stay blank, and retired questions are not copied.
- Conditional questions and sections for simple dependencies such as reseller status or Yes/No follow-ups.
- Company save-and-continue workflow with visible save state, review of prefilled answers, submission lock, administrator submission reopen, and close/reopen controls for whole surveys.
- Previous-year report history for each company.
- Historical Excel/CSV import and flat or pivot Excel export.
- Admin progress summary, company status filters, lightweight analytics, and audit trail.

## Phase 2 - Operational hardening

Goal: reduce administrative effort and make production support predictable.

- Add automated browser smoke coverage for company and administrator roles at 1600x900, 1024x768, and 390x844.
- Add validation summaries that link directly to unanswered or invalid questions.
- Add a review screen grouped by section before final submission.
- Add invitation resend, expiry handling, and clearer onboarding states.
- Add PDF export generated from immutable submitted snapshots.
- Add observability for failed imports, failed saves, invitation delivery, and submission errors.

## Phase 3 - Reporting operations and collaboration

Goal: support larger cohorts and more realistic company teams without changing the reporting model.

- [Implemented] Configurable, idempotent deadline reminders for companies that have not started or are still in progress.
- [Implemented] Multiple users per company with viewer, contributor, and company-admin roles.
- Comments or clarification requests attached to a report or question.
- Reopen workflow with reason, due date, and resolution status.
- Bulk company management and invite actions.
- Data retention and export policy controls.

## Phase 4 - Insights and executive summary

Goal: turn validated submissions into useful, reviewable programme insight.

- Company progress over several reporting years.
- [Implemented] Administrator company completion comparison by survey.
- Completion and response-quality trends.
- [Implemented] Anonymised company completion benchmarking with a five-company suppression threshold.
- Executive summary view for administrators: what changed, where follow-up is needed, and which themes are recurring.
- [Implemented] AI-assisted structured summaries generated through the OpenAI Responses API from submitted snapshots only, with source question IDs and model/prompt versioning.

## Phase 5 - Evidence and integrations

Goal: connect the portal to the wider climate-data workflow.

- [Implemented] Private supporting document uploads with file type, 20 MB size, submission ownership, and storage/table access controls.
- API/webhooks for approved reporting and export events.
- Optional integrations with accounting, energy, or emissions data providers.
- SSO and stronger organisation-level identity controls if participation grows materially.

## Product guardrails

- Submitted snapshots remain immutable; corrections create a new revision.
- Canonical answers remain separate from summaries, comments, and generated insights.
- Every carry-forward mapping is explicit and reviewable.
- New features must preserve company-level isolation and accessible keyboard workflows.
- Excel remains the canonical analysis export; PDF is a presentation output.

## Recommended sequence

1. Finish Phase 1 UI/UX and core workflow validation.
2. Complete Phase 2 before the next full reporting cycle.
3. Validate reminder delivery and role boundaries with production accounts.
4. Add mandatory administrator approval and publication states for external-facing AI summaries.
5. Define document retention periods before adding automated deletion.
