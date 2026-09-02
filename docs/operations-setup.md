# Reporting operations setup

The migration creates the reminder tables, private document bucket, role policies, benchmark RPC, and a daily reminder job. Edge secrets are configured outside the repository.

## Edge Function secrets

Configure these secrets in the linked Supabase project:

```bash
supabase secrets set OPENAI_API_KEY=... OPENAI_SUMMARY_MODEL=gpt-5.4-mini
supabase secrets set RESEND_API_KEY=... REMINDER_FROM_EMAIL="STICA Reporting <reporting@your-domain.example>"
supabase secrets set REMINDER_CRON_SECRET=... PORTAL_URL=https://your-portal.example
```

Use a verified sending domain for `REMINDER_FROM_EMAIL`. The browser never receives the OpenAI, Resend, cron, or service-role secrets.

## Scheduler Vault values

The daily database job resolves the project URL and cron secret from Supabase Vault at runtime:

```sql
select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
select vault.create_secret('THE_SAME_REMINDER_CRON_SECRET', 'reminder_cron_secret');
```

The schedule runs at 07:00 UTC each day. Only enabled policies whose survey has a future deadline and whose configured day offset matches are sent. Every attempted recipient/date has a unique delivery key, so retries do not duplicate an email.

## Deployment

Apply the database migration, deploy all Edge Functions, then configure at least one reminder policy from **Reminders & AI** in the administrator portal. Submit a company report before generating its AI summary.
