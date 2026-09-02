begin;

-- Organization roles are intentionally small and capability based. Existing
-- `member` rows remain contributors; `viewer` is strictly read-only.
alter table public.organization_members
  drop constraint if exists organization_members_role_valid;
alter table public.organization_members
  add constraint organization_members_role_valid
  check (role in ('viewer', 'member', 'company_admin'));

create or replace function app_private.organization_role(target_organization_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select member.role
  from public.organization_members member
  where member.organization_id = target_organization_id
    and member.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function app_private.can_edit_organization(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app_private.is_platform_admin())
    or coalesce((select app_private.organization_role(target_organization_id)) in ('member', 'company_admin'), false);
$$;

create or replace function app_private.is_organization_admin(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select app_private.is_platform_admin())
    or coalesce((select app_private.organization_role(target_organization_id)) = 'company_admin', false);
$$;

revoke all on function app_private.organization_role(bigint) from public, anon;
revoke all on function app_private.can_edit_organization(bigint) from public, anon;
revoke all on function app_private.is_organization_admin(bigint) from public, anon;
grant execute on function app_private.organization_role(bigint) to authenticated;
grant execute on function app_private.can_edit_organization(bigint) to authenticated;
grant execute on function app_private.is_organization_admin(bigint) to authenticated;

-- Company administrators may see their own team without exposing auth.users.
create or replace function public.get_my_organization_members(target_organization_id bigint)
returns table (
  user_id uuid,
  role text,
  full_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_organization_admin(target_organization_id) then
    raise exception 'Company administrator access required' using errcode = '42501';
  end if;

  return query
  select member.user_id, member.role, profile.full_name,
         coalesce(account.email, '')::text, member.created_at
  from public.organization_members member
  join public.profiles profile on profile.user_id = member.user_id
  join auth.users account on account.id = member.user_id
  where member.organization_id = target_organization_id
  order by case member.role when 'company_admin' then 1 when 'member' then 2 else 3 end,
           profile.full_name;
end;
$$;

create or replace function public.update_my_organization_member_role(
  target_organization_id bigint,
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  previous_role text;
begin
  if caller_id is null or not app_private.is_organization_admin(target_organization_id) then
    raise exception 'Company administrator access required' using errcode = '42501';
  end if;
  if new_role not in ('viewer', 'member', 'company_admin') then
    raise exception 'Invalid company role';
  end if;

  select role into previous_role
  from public.organization_members
  where organization_id = target_organization_id and user_id = target_user_id
  for update;
  if previous_role is null then raise exception 'Team member not found'; end if;

  if previous_role = 'company_admin' and new_role <> 'company_admin'
     and (select count(*) from public.organization_members
          where organization_id = target_organization_id and role = 'company_admin') <= 1 then
    raise exception 'Every company must keep at least one company administrator';
  end if;

  update public.organization_members set role = new_role
  where organization_id = target_organization_id and user_id = target_user_id;

  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (target_organization_id, caller_id, 'member.role_updated', 'organization_member', target_user_id::text,
          jsonb_build_object('previous_role', previous_role, 'new_role', new_role));
end;
$$;

create or replace function public.remove_my_organization_member(
  target_organization_id bigint,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_role text;
begin
  if caller_id is null or not app_private.is_organization_admin(target_organization_id) then
    raise exception 'Company administrator access required' using errcode = '42501';
  end if;
  if target_user_id = caller_id then raise exception 'You cannot remove your own access'; end if;

  select role into target_role from public.organization_members
  where organization_id = target_organization_id and user_id = target_user_id for update;
  if target_role is null then raise exception 'Team member not found'; end if;
  if target_role = 'company_admin'
     and (select count(*) from public.organization_members
          where organization_id = target_organization_id and role = 'company_admin') <= 1 then
    raise exception 'Every company must keep at least one company administrator';
  end if;

  delete from public.organization_members
  where organization_id = target_organization_id and user_id = target_user_id;
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (target_organization_id, caller_id, 'member.removed', 'organization_member', target_user_id::text,
          jsonb_build_object('role', target_role));
end;
$$;

revoke all on function public.get_my_organization_members(bigint) from public, anon;
revoke all on function public.update_my_organization_member_role(bigint, uuid, text) from public, anon;
revoke all on function public.remove_my_organization_member(bigint, uuid) from public, anon;
grant execute on function public.get_my_organization_members(bigint) to authenticated;
grant execute on function public.update_my_organization_member_role(bigint, uuid, text) to authenticated;
grant execute on function public.remove_my_organization_member(bigint, uuid) to authenticated;

create or replace function app_private.update_member_role(
  target_organization_id bigint,
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_role not in ('viewer', 'member', 'company_admin') then raise exception 'Invalid company role'; end if;
  update public.organization_members set role = new_role
  where organization_id = target_organization_id and user_id = target_user_id;
  if not found then raise exception 'Member not found'; end if;
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (target_organization_id, caller_id, 'member.role_updated', 'organization_member', target_user_id::text,
          jsonb_build_object('new_role', new_role));
end;
$$;

-- Provider-neutral reminder configuration and an idempotent delivery ledger.
create table public.reminder_policies (
  id bigint generated always as identity primary key,
  survey_version_id bigint not null unique references public.survey_versions(id) on delete cascade,
  enabled boolean not null default true,
  days_before_due smallint[] not null default array[14, 7, 3, 1]::smallint[],
  include_not_started boolean not null default true,
  include_in_progress boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_days_valid check (
    cardinality(days_before_due) between 1 and 12
    and 0 <= all(days_before_due)
    and 365 >= all(days_before_due)
  )
);

create table public.reminder_deliveries (
  id bigint generated always as identity primary key,
  policy_id bigint not null references public.reminder_policies(id) on delete cascade,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  survey_version_id bigint not null references public.survey_versions(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  reminder_key text not null unique,
  scheduled_for date not null,
  status text not null default 'pending',
  provider text,
  provider_message_id text,
  error_message text,
  attempts smallint not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_delivery_status_valid check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  constraint reminder_email_not_blank check (btrim(recipient_email) <> ''),
  constraint reminder_attempts_nonnegative check (attempts >= 0)
);

create index reminder_deliveries_status_scheduled_idx on public.reminder_deliveries (status, scheduled_for);
create index reminder_deliveries_org_survey_idx on public.reminder_deliveries (organization_id, survey_version_id);

-- Uploaded evidence remains private and is always attached to a submission.
create table public.submission_documents (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  submission_id bigint not null references public.company_submissions(id) on delete cascade,
  survey_question_id bigint references public.survey_questions(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint submission_documents_file_name_not_blank check (btrim(file_name) <> ''),
  constraint submission_documents_path_not_blank check (btrim(storage_path) <> ''),
  constraint submission_documents_size_valid check (size_bytes between 1 and 20971520)
);

create index submission_documents_submission_idx on public.submission_documents (submission_id, created_at desc);
create index submission_documents_organization_idx on public.submission_documents (organization_id);

-- AI output is a reviewable derivative of an immutable submitted snapshot.
create table public.ai_summaries (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  submission_id bigint not null references public.company_submissions(id) on delete cascade,
  snapshot_id bigint not null references public.submission_snapshots(id) on delete restrict,
  status text not null default 'pending',
  model text not null,
  prompt_version text not null default 'climate-summary-v1',
  content jsonb not null default '{}'::jsonb,
  source_question_ids bigint[] not null default '{}'::bigint[],
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_id, prompt_version),
  constraint ai_summaries_status_valid check (status in ('pending', 'completed', 'failed')),
  constraint ai_summaries_content_object check (jsonb_typeof(content) = 'object')
);

create index ai_summaries_org_created_idx on public.ai_summaries (organization_id, created_at desc);
create index ai_summaries_submission_idx on public.ai_summaries (submission_id);

create trigger reminder_policies_set_updated_at before update on public.reminder_policies
for each row execute function app_private.set_updated_at();
create trigger reminder_deliveries_set_updated_at before update on public.reminder_deliveries
for each row execute function app_private.set_updated_at();
create trigger ai_summaries_set_updated_at before update on public.ai_summaries
for each row execute function app_private.set_updated_at();

alter table public.reminder_policies enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.submission_documents enable row level security;
alter table public.ai_summaries enable row level security;

revoke all on public.reminder_policies, public.reminder_deliveries,
  public.submission_documents, public.ai_summaries from anon, authenticated;
grant select, insert, update, delete on public.reminder_policies to authenticated;
grant select on public.reminder_deliveries to authenticated;
grant select, insert, delete on public.submission_documents to authenticated;
grant select on public.ai_summaries to authenticated;
grant usage, select on sequence public.reminder_policies_id_seq to authenticated;
grant usage, select on sequence public.submission_documents_id_seq to authenticated;

create policy reminder_policies_admin_all on public.reminder_policies for all to authenticated
using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));
create policy reminder_deliveries_admin_select on public.reminder_deliveries for select to authenticated
using ((select app_private.is_platform_admin()));

create policy submission_documents_select on public.submission_documents for select to authenticated
using ((select app_private.is_platform_admin()) or (select app_private.is_organization_member(organization_id)));
create policy submission_documents_insert on public.submission_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select app_private.can_edit_organization(organization_id))
  and exists (
    select 1 from public.company_submissions submission
    where submission.id = submission_id and submission.organization_id = organization_id
  )
);
create policy submission_documents_delete on public.submission_documents for delete to authenticated
using ((select app_private.is_platform_admin()) or (select app_private.can_edit_organization(organization_id)));

create policy ai_summaries_select on public.ai_summaries for select to authenticated
using ((select app_private.is_platform_admin()) or (select app_private.is_organization_member(organization_id)));

-- Tighten existing write policies so viewers cannot initialize, edit, or submit.
drop policy if exists company_submissions_insert on public.company_submissions;
drop policy if exists company_submissions_update on public.company_submissions;
drop policy if exists answers_insert on public.answers;
drop policy if exists answers_update on public.answers;
create policy company_submissions_insert on public.company_submissions for insert to authenticated
with check ((select app_private.can_edit_organization(organization_id)) and created_by = (select auth.uid()) and status = 'draft');
create policy company_submissions_update on public.company_submissions for update to authenticated
using ((select app_private.can_edit_organization(organization_id)) and status in ('draft', 'reopened'))
with check ((select app_private.can_edit_organization(organization_id)) and status in ('draft', 'reopened'));
create policy answers_insert on public.answers for insert to authenticated
with check (updated_by = (select auth.uid()) and exists (
  select 1 from public.company_submissions submission
  where submission.id = submission_id and submission.status in ('draft', 'reopened')
    and (select app_private.can_edit_organization(submission.organization_id))
));
create policy answers_update on public.answers for update to authenticated
using (exists (
  select 1 from public.company_submissions submission
  where submission.id = submission_id and submission.status in ('draft', 'reopened')
    and (select app_private.can_edit_organization(submission.organization_id))
))
with check (updated_by = (select auth.uid()) and exists (
  select 1 from public.company_submissions submission
  where submission.id = submission_id and submission.status in ('draft', 'reopened')
    and (select app_private.can_edit_organization(submission.organization_id))
));

create or replace function app_private.enforce_submission_editor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app_private.can_edit_organization(new.organization_id) then
    raise exception 'This company role has read-only access' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists company_submissions_enforce_editor on public.company_submissions;
create trigger company_submissions_enforce_editor
before insert on public.company_submissions
for each row execute function app_private.enforce_submission_editor();

-- Keep security-definer submission operations aligned with the RLS capability.
create or replace function app_private.submit_submission(target_submission_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  submission_row public.company_submissions%rowtype;
  next_revision smallint;
  snapshot_payload jsonb;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into submission_row from public.company_submissions where id = target_submission_id for update;
  if not found or not app_private.can_edit_organization(submission_row.organization_id) then
    raise exception 'Submission not found or read-only access' using errcode = '42501';
  end if;
  if submission_row.status not in ('draft', 'reopened') then
    raise exception 'Only draft or reopened submissions can be submitted';
  end if;
  if exists (
    select 1 from public.survey_questions survey_question
    where survey_question.survey_version_id = submission_row.survey_version_id
      and survey_question.is_required
      and app_private.question_is_visible(submission_row.id, survey_question.visibility_rule)
      and not exists (
        select 1 from public.answers answer
        where answer.submission_id = submission_row.id
          and answer.survey_question_id = survey_question.id
          and answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
      )
  ) then raise exception 'Required visible answers are missing'; end if;

  next_revision := submission_row.revision_number + 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'survey_question_id', answer.survey_question_id, 'value', answer.value, 'provenance', answer.provenance
  ) order by survey_question.display_order), '[]'::jsonb)
  into snapshot_payload
  from public.answers answer
  join public.survey_questions survey_question on survey_question.id = answer.survey_question_id
  where answer.submission_id = submission_row.id;

  insert into public.submission_snapshots (submission_id, revision_number, payload, submitted_by)
  values (submission_row.id, next_revision, snapshot_payload, caller_id);
  update public.company_submissions
  set status = 'submitted', submitted_at = now(), submitted_by = caller_id, revision_number = next_revision
  where id = submission_row.id;
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, details)
  values (submission_row.organization_id, caller_id, 'submission.submitted', 'company_submission',
          submission_row.id::text, jsonb_build_object('revision_number', next_revision));
end;
$$;

-- Privacy-preserving benchmark: aggregates are withheld below five companies.
create or replace function public.get_company_benchmark(target_survey_version_id bigint)
returns table (
  own_completion integer,
  cohort_average numeric,
  cohort_median numeric,
  percentile_rank numeric,
  cohort_size integer,
  submitted_count integer,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_org_id bigint;
  own_value integer;
  member_count integer;
begin
  select member.organization_id into target_org_id
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id
  where member.user_id = (select auth.uid()) and organization.is_active
  order by member.organization_id limit 1;
  if target_org_id is null then raise exception 'Company membership required' using errcode = '42501'; end if;

  with progress as (
    select organization.id,
      case when count(question.id) = 0 then 0 else round(
        100.0 * count(answer.id) filter (where answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb))
        / count(question.id)
      )::integer end completion,
      submission.status
    from public.organizations organization
    cross join public.survey_versions version
    left join public.company_submissions submission
      on submission.organization_id = organization.id and submission.survey_version_id = version.id
    left join public.survey_questions question on question.survey_version_id = version.id
    left join public.answers answer on answer.submission_id = submission.id and answer.survey_question_id = question.id
    where organization.is_active and version.id = target_survey_version_id
    group by organization.id, submission.status
  )
  select max(completion) filter (where id = target_org_id), count(*)
  into own_value, member_count from progress;

  if member_count < 5 then
    return query select coalesce(own_value, 0), null::numeric, null::numeric, null::numeric,
                        member_count, null::integer, true;
    return;
  end if;

  return query
  with progress as (
    select organization.id,
      case when count(question.id) = 0 then 0 else round(
        100.0 * count(answer.id) filter (where answer.value not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb))
        / count(question.id)
      )::integer end completion,
      submission.status
    from public.organizations organization
    cross join public.survey_versions version
    left join public.company_submissions submission
      on submission.organization_id = organization.id and submission.survey_version_id = version.id
    left join public.survey_questions question on question.survey_version_id = version.id
    left join public.answers answer on answer.submission_id = submission.id and answer.survey_question_id = question.id
    where organization.is_active and version.id = target_survey_version_id
    group by organization.id, submission.status
  )
  select coalesce(max(completion) filter (where id = target_org_id), 0),
         round(avg(completion), 1),
         round(percentile_cont(0.5) within group (order by completion)::numeric, 1),
         round(100.0 * count(*) filter (where completion <= own_value) / greatest(count(*), 1), 1),
         count(*)::integer,
         count(*) filter (where status = 'submitted')::integer,
         false
  from progress;
end;
$$;

revoke all on function public.get_company_benchmark(bigint) from public, anon;
grant execute on function public.get_company_benchmark(bigint) to authenticated;

-- Private Storage bucket and path-scoped access controls.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-documents', 'report-documents', false, 20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy report_documents_storage_select on storage.objects for select to authenticated
using (bucket_id = 'report-documents' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((select app_private.is_platform_admin()) or
       (select app_private.is_organization_member(((storage.foldername(name))[1])::bigint))));
create policy report_documents_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'report-documents' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and (select app_private.can_edit_organization(((storage.foldername(name))[1])::bigint)));
create policy report_documents_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'report-documents' and (storage.foldername(name))[1] ~ '^[0-9]+$'
  and ((select app_private.is_platform_admin()) or
       (select app_private.can_edit_organization(((storage.foldername(name))[1])::bigint))));

-- Hosted Supabase runs the reminder dispatcher every day at 07:00 UTC. The
-- Vault values are resolved only at execution time and never stored in source.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'stica-report-reminders-daily';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'stica-report-reminders-daily',
    '0 7 * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
          || '/functions/v1/send-report-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );
end;
$$;

commit;
