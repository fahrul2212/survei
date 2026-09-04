-- Central AI governance for the Cloudflare Worker boundary.
-- Browser clients have no direct access to credentials, settings, prices, or usage writes.

create table public.ai_settings (
  id smallint primary key default 1,
  provider text not null default 'openai',
  default_model text not null default 'gpt-5.4-mini',
  fallback_model text,
  monthly_budget_usd numeric(14, 6) not null default 100,
  company_monthly_budget_usd numeric(14, 6),
  max_output_tokens integer not null default 2400,
  benchmark_minimum integer not null default 5,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_settings_singleton check (id = 1),
  constraint ai_settings_provider_valid check (provider in ('openai')),
  constraint ai_settings_default_model_not_blank check (btrim(default_model) <> ''),
  constraint ai_settings_fallback_model_not_blank check (fallback_model is null or btrim(fallback_model) <> ''),
  constraint ai_settings_monthly_budget_valid check (monthly_budget_usd >= 0),
  constraint ai_settings_company_budget_valid check (company_monthly_budget_usd is null or company_monthly_budget_usd >= 0),
  constraint ai_settings_output_tokens_valid check (max_output_tokens between 128 and 32768),
  constraint ai_settings_benchmark_minimum_valid check (benchmark_minimum between 5 and 100)
);

create table public.ai_provider_credentials (
  provider text primary key,
  encrypted_api_key text not null,
  key_suffix text not null,
  encryption_version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_credentials_provider_valid check (provider in ('openai')),
  constraint ai_provider_credentials_ciphertext_not_blank check (btrim(encrypted_api_key) <> ''),
  constraint ai_provider_credentials_key_suffix_valid check (char_length(key_suffix) between 2 and 12),
  constraint ai_provider_credentials_encryption_version_valid check (encryption_version > 0)
);

create table public.ai_model_prices (
  provider text not null,
  model text not null,
  input_price_per_million_usd numeric(14, 6) not null,
  output_price_per_million_usd numeric(14, 6) not null,
  effective_from timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, model),
  constraint ai_model_prices_provider_valid check (provider in ('openai')),
  constraint ai_model_prices_model_not_blank check (btrim(model) <> ''),
  constraint ai_model_prices_input_valid check (input_price_per_million_usd >= 0),
  constraint ai_model_prices_output_valid check (output_price_per_million_usd >= 0)
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint references public.organizations(id) on delete set null,
  survey_version_id bigint references public.survey_versions(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  request_type text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(14, 6),
  actual_cost_usd numeric(14, 6),
  status text not null default 'pending',
  scope jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_usage_events_request_type_not_blank check (btrim(request_type) <> ''),
  constraint ai_usage_events_provider_valid check (provider in ('openai')),
  constraint ai_usage_events_model_not_blank check (btrim(model) <> ''),
  constraint ai_usage_events_input_tokens_valid check (input_tokens is null or input_tokens >= 0),
  constraint ai_usage_events_output_tokens_valid check (output_tokens is null or output_tokens >= 0),
  constraint ai_usage_events_estimated_cost_valid check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  constraint ai_usage_events_actual_cost_valid check (actual_cost_usd is null or actual_cost_usd >= 0),
  constraint ai_usage_events_status_valid check (status in ('pending', 'completed', 'failed', 'blocked')),
  constraint ai_usage_events_scope_object check (jsonb_typeof(scope) = 'object')
);

create index ai_usage_events_created_at_idx on public.ai_usage_events (created_at desc);
create index ai_usage_events_org_created_idx on public.ai_usage_events (organization_id, created_at desc);
create index ai_usage_events_requester_created_idx on public.ai_usage_events (requested_by, created_at desc);
create index ai_usage_events_status_created_idx on public.ai_usage_events (status, created_at desc);
create index ai_usage_events_survey_version_idx on public.ai_usage_events (survey_version_id);
create index ai_settings_updated_by_idx on public.ai_settings (updated_by);
create index ai_provider_credentials_updated_by_idx on public.ai_provider_credentials (updated_by);
create index ai_model_prices_updated_by_idx on public.ai_model_prices (updated_by);

create trigger ai_settings_set_updated_at before update on public.ai_settings
for each row execute function app_private.set_updated_at();
create trigger ai_provider_credentials_set_updated_at before update on public.ai_provider_credentials
for each row execute function app_private.set_updated_at();
create trigger ai_model_prices_set_updated_at before update on public.ai_model_prices
for each row execute function app_private.set_updated_at();

alter table public.ai_settings enable row level security;
alter table public.ai_provider_credentials enable row level security;
alter table public.ai_model_prices enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on public.ai_settings, public.ai_provider_credentials,
  public.ai_model_prices, public.ai_usage_events from public, anon, authenticated;

grant select, insert, update, delete on public.ai_settings,
  public.ai_provider_credentials, public.ai_model_prices,
  public.ai_usage_events to service_role;

-- Explicit admin read policies provide defence in depth if a narrowly-scoped
-- authenticated SELECT grant is introduced later. Credentials intentionally
-- receive no authenticated policy.
create policy ai_settings_admin_select on public.ai_settings
  for select to authenticated
  using ((select app_private.is_platform_admin()));
create policy ai_model_prices_admin_select on public.ai_model_prices
  for select to authenticated
  using ((select app_private.is_platform_admin()));
create policy ai_usage_events_admin_select on public.ai_usage_events
  for select to authenticated
  using ((select app_private.is_platform_admin()));

insert into public.ai_settings (id) values (1)
on conflict (id) do nothing;
