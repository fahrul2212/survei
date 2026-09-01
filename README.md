# STICA Climate Transition Reporting Portal

A production annual reporting portal for STICA member companies. React/Vite provides the responsive interface, Supabase provides authentication, PostgreSQL, RLS, versioned surveys and Edge Functions, and Cloudflare Workers Static Assets hosts the frontend.

## Local development

```bash
npm install
npm run dev
```

The application requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. It has no demo or local database mode. Database migrations and Edge Functions are deployed directly to the linked remote Supabase project; Docker is not part of the workflow.

## Remote Supabase workflow

```bash
npm run supabase:link
npm run supabase:push
npm run supabase:functions
```

Create the first administrator in Supabase Auth, then set `app_metadata.role` to `platform_admin`. All company accounts are subsequently invited through the portal. See `ADMIN_GUIDE.md` for the operating workflow and historical import template.

## Cloudflare deployment

```bash
npx wrangler login
npm run deploy
```

Only the publishable key belongs in the frontend environment. Never commit or expose a Supabase secret/service-role key.
