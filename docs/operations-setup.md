# Reporting operations setup

The migration creates the reminder tables, private document bucket, role policies, benchmark RPC, and a daily reminder job. Edge secrets are configured outside the repository.

## Supabase Edge Function secrets

Configure these secrets in the linked Supabase project:

```bash
supabase secrets set RESEND_API_KEY=... REMINDER_FROM_EMAIL="STICA Reporting <reporting@your-domain.example>"
supabase secrets set REMINDER_CRON_SECRET=... PORTAL_URL=https://your-portal.example
```

Use a verified sending domain for `REMINDER_FROM_EMAIL`. The browser never receives the Resend or cron secrets.

## Cloudflare Worker secrets

Configure these values once through Cloudflare's secret controls or Wrangler. Use the current Supabase `sb_secret_...` key rather than adding a legacy service-role JWT to a new deployment.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put AI_SETTINGS_ENCRYPTION_KEY
npx wrangler secret put OPENAI_API_KEY
```

`AI_SETTINGS_ENCRYPTION_KEY` must be 32 cryptographically random bytes encoded as Base64. `OPENAI_API_KEY` is an optional server-side fallback; an administrator may instead save a provider key through the AI control centre. Never place any of these values in `wrangler.jsonc`, a `VITE_*` variable, source control, logs, or screenshots.

Use a dedicated OpenAI production project service account and a least-privilege project API key. Do not use a personal key or an organisation-admin key for runtime requests. Keep OpenAI project spend alerts and model permissions aligned with the limits configured in the portal.

Back up the encryption key in the organisation's password manager. Rotating it requires replacing or re-encrypting dashboard-managed provider credentials. Losing it makes those encrypted credentials unreadable.

## Scheduler Vault values

The daily database job resolves the project URL and cron secret from Supabase Vault at runtime:

```sql
select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
select vault.create_secret('THE_SAME_REMINDER_CRON_SECRET', 'reminder_cron_secret');
```

The schedule runs at 07:00 UTC each day. Only enabled policies whose survey has a future deadline and whose configured day offset matches are sent. Every attempted recipient/date has a unique delivery key, so retries do not duplicate an email.

## Deployment

Apply database migrations, deploy reminder Edge Functions, configure the Cloudflare Worker secrets, and deploy the Worker. In **AI control centre**, paste the OpenAI project key, load its available text models, select one, choose budgets, and only then enable AI. Known model prices are filled from the portal's dated catalogue; verify the current OpenAI price under Advanced settings when a model is not catalogued. Configure reminder policies separately from **Reminders & summaries**. Submit a company report before generating its AI summary.

Before enabling AI in production, confirm that the OpenAI project is owned by the client organisation, API data sharing is not opted in, and the applicable retention setting is documented. `store: false` is enforced in code, but standard OpenAI abuse-monitoring logs may still retain content for up to 30 days. Zero Data Retention or Modified Abuse Monitoring requires approval from OpenAI. Publish the AI processing notice and complete the applicable OpenAI business terms/DPA review first.
