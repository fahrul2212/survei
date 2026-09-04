# STICA portal security and privacy readiness

This document maps the implemented technical controls and remaining organisational work. It supports GDPR and ISO/IEC 27001 preparation; it is not legal advice and does not itself establish GDPR compliance or ISO certification.

## Implemented technical controls

- Tenant isolation with Supabase Row Level Security and server-side permission checks.
- Platform-admin, company-admin, contributor and viewer roles.
- Invitation-only account creation. No administrator-created or emailed passwords.
- Single-use, expiring invitation links; recipient chooses a 12+ character password.
- Pending, accepted, expired and revoked invitation lifecycle with resend throttling and audit events.
- Password recovery through Supabase Auth; secure-password-change setting documented for hosted Auth.
- Provider secrets remain server-side in Supabase Edge Functions or encrypted behind the Cloudflare Worker.
- Email delivery ledger uses an idempotency key to prevent duplicate reminders and limits retries.
- AI access is permission-aware: admins can select authorised companies; company users can query only their own detailed answers.
- Company benchmarks contain aggregates only and are suppressed below the configured minimum cohort size.
- Peer free-text answers are never sent to the company-user AI flow.
- AI queries use fixed database queries rather than model-generated SQL, bounded inputs, structured output, source references, moderation, rate limits, budget limits and `store: false`.
- Provider cost, token usage, success, failure and budget-block events are recorded without storing the user's natural-language AI query.
- Uploaded evidence is private and access-controlled.
- Audit records cover material administrator, invitation and reporting actions.

## Secure invitation lifecycle

1. An authorised administrator enters the recipient name, email, company and role.
2. The server validates the company, manager permission, role, rate limit and duplicate invitation state.
3. Supabase creates a one-time Auth invitation credential. Only its hash/state is controlled by Auth; the portal never stores the raw link or a password.
4. The email provider sends the link over HTTPS. The link expires after the configured short lifetime.
5. The recipient opens a portal landing page and explicitly confirms before the one-time Auth credential is consumed. This reduces accidental consumption by email-link scanners.
6. The recipient creates their own password.
7. The server rechecks the authenticated user, invitation owner, status and expiry before creating company membership.
8. Resend and revoke actions are permission-checked and audited. A revoked or expired invite cannot activate membership.

Recommended hosted settings are a 60-minute invitation/OTP lifetime, 12-character minimum password, secure password change, leaked-password screening, login/recovery CAPTCHA and MFA for platform administrators. MFA needs complete enrolment, challenge and recovery-code UX before it is mandatory.

## GDPR work still requiring the data controller

- Confirm controller/processor roles for STICA, the implementation provider, Supabase, Cloudflare, Resend and OpenAI.
- Execute DPAs and document international-transfer safeguards and processing regions.
- Establish lawful basis and transparent notices for portal accounts, reminder emails, survey responses, uploaded evidence, benchmarking and AI processing.
- Complete a DPIA before production AI analysis if the final use, scale or sensitivity creates high risk.
- Define retention periods for invitations, reminder-delivery email addresses, survey responses, evidence files, AI summaries, usage records, backups and audit logs.
- Implement and test data-subject request procedures: access, correction, restriction, objection, portability and deletion, including processor and backup handling.
- Approve the minimum benchmark cohort and suppression rules against re-identification risk. Five is a technical default, not a universal legal guarantee.
- Publish an AI notice covering purpose, model limitations, human review, source verification and whether any consequential decisions are made.
- Maintain records of processing, incident response contacts, breach-assessment workflow and the 72-hour supervisory-authority decision process.
- Review free-text questions and uploaded documents for special-category or unnecessary personal data; minimise collection wherever possible.

## ISO/IEC 27001 organisational work still required

- Define ISMS scope, interested parties, risk methodology, risk register, treatment plan and Statement of Applicability.
- Approve access-control, secure development, change-management, supplier, incident, backup, retention and acceptable-use policies.
- Perform supplier due diligence and periodic review for Supabase, Cloudflare, Resend and OpenAI.
- Establish joiner/mover/leaver reviews, privileged-access reviews and MFA enforcement for administrators.
- Add central alerting for authentication anomalies, repeated invitation abuse, failed reminder jobs, AI budget events and material audit events.
- Test backup restoration, business continuity, disaster recovery, vulnerability management, dependency patching and incident exercises.
- Separate production and non-production accounts/data and prevent real personal data from entering demo fixtures.
- Collect operational evidence, run internal audits and management review, close findings, then use an accredited certification body if certification is required.

## Before go-live

1. Add the verified Resend sender/API key and test invitation plus reminder delivery to controlled test addresses.
2. Verify hosted Supabase Auth redirect, password, email confirmation, CAPTCHA and session settings.
3. Configure the reminder cron secret in both Edge Function secrets and Supabase Vault.
4. Add and test administrator MFA before making it mandatory.
5. Approve privacy notice, retention schedule, DPA/DPIA decisions and benchmark threshold.
6. Run role-isolation, invitation-expiry/revoke, email idempotency, AI data-boundary and backup-restore tests.
7. Perform a final security review and accessibility/user-acceptance test before inviting real companies.
