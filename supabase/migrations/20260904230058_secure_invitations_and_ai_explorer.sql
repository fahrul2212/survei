-- Track invitation lifecycle without storing invitation tokens or passwords.
-- Auth links remain single-use credentials managed by Supabase Auth.

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id bigint not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  role text not null default 'member',
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  sent_count smallint not null default 1,
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_method text not null default 'supabase_auth',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_invitations_email_not_blank check (btrim(email) <> ''),
  constraint user_invitations_email_lowercase check (email = lower(email)),
  constraint user_invitations_name_not_blank check (btrim(full_name) <> ''),
  constraint user_invitations_role_valid check (role in ('viewer', 'member', 'company_admin')),
  constraint user_invitations_status_valid check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint user_invitations_sent_count_valid check (sent_count between 1 and 100),
  constraint user_invitations_expiry_valid check (expires_at > created_at),
  constraint user_invitations_delivery_valid check (delivery_method in ('supabase_auth', 'resend'))
);

create unique index user_invitations_one_pending_idx
  on public.user_invitations (organization_id, lower(email))
  where status = 'pending';
create index user_invitations_auth_user_idx on public.user_invitations (auth_user_id);
create index user_invitations_invited_by_idx on public.user_invitations (invited_by);
create index user_invitations_org_status_idx on public.user_invitations (organization_id, status, created_at desc);
create index user_invitations_pending_expiry_idx on public.user_invitations (expires_at)
  where status = 'pending';

create trigger user_invitations_set_updated_at
before update on public.user_invitations
for each row execute function app_private.set_updated_at();

alter table public.user_invitations enable row level security;
revoke all on public.user_invitations from public, anon, authenticated;
grant select on public.user_invitations to authenticated;
grant select, insert, update, delete on public.user_invitations to service_role;

create policy user_invitations_select_own on public.user_invitations
for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy user_invitations_select_managers on public.user_invitations
for select to authenticated
using (
  (select app_private.is_platform_admin())
  or exists (
    select 1
    from public.organization_members member
    where member.organization_id = user_invitations.organization_id
      and member.user_id = (select auth.uid())
      and member.role = 'company_admin'
  )
);
