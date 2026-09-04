begin;

-- Cover every foreign key reported by the Supabase performance advisor. These
-- indexes also keep parent-row updates/deletes from scanning the child tables.
create index if not exists ai_summaries_requested_by_idx
  on public.ai_summaries (requested_by);
create index if not exists ai_summaries_reviewed_by_idx
  on public.ai_summaries (reviewed_by);
create index if not exists reminder_deliveries_policy_id_idx
  on public.reminder_deliveries (policy_id);
create index if not exists reminder_deliveries_recipient_user_id_idx
  on public.reminder_deliveries (recipient_user_id);
create index if not exists reminder_deliveries_survey_version_id_idx
  on public.reminder_deliveries (survey_version_id);
create index if not exists reminder_policies_created_by_idx
  on public.reminder_policies (created_by);
create index if not exists submission_documents_survey_question_id_idx
  on public.submission_documents (survey_question_id);
create index if not exists submission_documents_uploaded_by_idx
  on public.submission_documents (uploaded_by);

-- Match the filters and sort order used by the portal's busiest list screens.
create index if not exists company_submissions_survey_status_org_idx
  on public.company_submissions (survey_version_id, status, organization_id);
create index if not exists audit_events_org_occurred_idx
  on public.audit_events (organization_id, occurred_at desc);
create index if not exists reminder_policies_updated_at_idx
  on public.reminder_policies (updated_at desc);
create index if not exists reminder_deliveries_created_at_idx
  on public.reminder_deliveries (created_at desc);
create index if not exists ai_summaries_created_at_idx
  on public.ai_summaries (created_at desc);

-- These composite indexes retain the foreign-key coverage of the old indexes
-- while serving the application's newest-first document and summary queries.
create index if not exists ai_summaries_submission_created_idx
  on public.ai_summaries (submission_id, created_at desc);
create index if not exists submission_documents_org_created_idx
  on public.submission_documents (organization_id, created_at desc);
drop index if exists public.ai_summaries_submission_idx;
drop index if exists public.submission_documents_organization_idx;

-- A FOR ALL administrator policy overlaps the general SELECT policy. Split it
-- by write operation so PostgreSQL evaluates only one permissive SELECT policy.
drop policy if exists organizations_admin_all on public.organizations;
create policy organizations_admin_insert on public.organizations
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy organizations_admin_update on public.organizations
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy organizations_admin_delete on public.organizations
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists organization_members_admin_all on public.organization_members;
create policy organization_members_admin_insert on public.organization_members
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy organization_members_admin_update on public.organization_members
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy organization_members_admin_delete on public.organization_members
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists survey_versions_admin_all on public.survey_versions;
create policy survey_versions_admin_insert on public.survey_versions
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy survey_versions_admin_update on public.survey_versions
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy survey_versions_admin_delete on public.survey_versions
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists question_definitions_admin_all on public.question_definitions;
create policy question_definitions_admin_insert on public.question_definitions
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy question_definitions_admin_update on public.question_definitions
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy question_definitions_admin_delete on public.question_definitions
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists question_revisions_admin_all on public.question_revisions;
create policy question_revisions_admin_insert on public.question_revisions
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy question_revisions_admin_update on public.question_revisions
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy question_revisions_admin_delete on public.question_revisions
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists survey_questions_admin_all on public.survey_questions;
create policy survey_questions_admin_insert on public.survey_questions
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy survey_questions_admin_update on public.survey_questions
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy survey_questions_admin_delete on public.survey_questions
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

drop policy if exists carry_forward_rules_admin_all on public.question_carry_forward_rules;
create policy carry_forward_rules_admin_insert on public.question_carry_forward_rules
  for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy carry_forward_rules_admin_update on public.question_carry_forward_rules
  for update to authenticated
  using ((select app_private.is_platform_admin()))
  with check ((select app_private.is_platform_admin()));
create policy carry_forward_rules_admin_delete on public.question_carry_forward_rules
  for delete to authenticated
  using ((select app_private.is_platform_admin()));

-- Keep service-role seeding compatible without the deprecated auth.role()
-- helper, and ensure every non-service caller has an authenticated identity.
create or replace function app_private.enforce_submission_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or (caller_id is not null and (select app_private.is_platform_admin())) then
    return new;
  end if;

  if caller_id is null or not (select app_private.can_edit_organization(new.organization_id)) then
    raise exception 'This company role has read-only access' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_submission_editor() from public, anon;
grant execute on function app_private.enforce_submission_editor() to authenticated, service_role;

commit;
