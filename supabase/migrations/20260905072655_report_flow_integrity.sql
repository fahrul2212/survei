begin;

alter table public.answers add column edit_version bigint not null default 1;
alter table public.answers add column reviewed_at timestamptz;

-- All writers, including privileged imports, advance the concurrency token.
create function app_private.advance_answer_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.edit_version := old.edit_version + 1;
  if new.value is distinct from old.value and new.reviewed_at is not distinct from old.reviewed_at then
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;
create trigger answers_advance_version before update on public.answers
for each row execute function app_private.advance_answer_version();
revoke all on function app_private.advance_answer_version() from public, anon, authenticated;

-- Company writes use the checked RPC. Administrative import functions retain access.
drop policy if exists answers_insert on public.answers;
drop policy if exists answers_update on public.answers;
create policy answers_insert on public.answers for insert to authenticated
with check ((select app_private.is_platform_admin()) and updated_by = (select auth.uid()));
create policy answers_update on public.answers for update to authenticated
using ((select app_private.is_platform_admin()))
with check ((select app_private.is_platform_admin()) and updated_by = (select auth.uid()));

create function app_private.save_report_answer(
  target_submission_id bigint, target_question_id bigint, new_value jsonb,
  expected_version bigint, confirm_review boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  report public.company_submissions%rowtype;
  previous public.answers%rowtype;
  saved public.answers%rowtype;
  page_key text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  new_value := coalesce(new_value, 'null'::jsonb);
  -- This lock also serializes against submit, preventing writes after its snapshot.
  select * into report from public.company_submissions where id = target_submission_id for update;
  if not found or not app_private.can_edit_organization(report.organization_id)
    or not exists (select 1 from public.organizations where id = report.organization_id and is_active)
  then raise exception 'Contributor access required' using errcode = '42501'; end if;
  perform 1 from public.survey_versions where id = report.survey_version_id and status = 'published' for share;
  if not found or report.status not in ('draft', 'reopened')
  then raise exception 'This report is read only' using errcode = '42501'; end if;
  select section_key into page_key from public.survey_questions
    where id = target_question_id and survey_version_id = report.survey_version_id;
  if not found then raise exception 'Question is not part of this report' using errcode = '22023'; end if;
  select * into previous from public.answers
    where submission_id = target_submission_id and survey_question_id = target_question_id;
  if (previous.id is null and expected_version is not null)
    or (previous.id is not null and previous.edit_version is distinct from expected_version)
  then raise exception 'Another user changed this answer. Review the saved answer before retrying.' using errcode = '40001'; end if;
  if confirm_review and (previous.id is null or previous.value is distinct from new_value)
  then raise exception 'Reload the answer before confirming it' using errcode = '40001'; end if;
  insert into public.answers (submission_id, survey_question_id, value, provenance, updated_by, reviewed_at)
    values (target_submission_id, target_question_id, new_value,
      case when confirm_review then previous.provenance else 'manual' end, auth.uid(), now())
    on conflict (submission_id, survey_question_id) do update set
      value = excluded.value, provenance = excluded.provenance,
      updated_by = excluded.updated_by, reviewed_at = excluded.reviewed_at
    returning * into saved;
  update public.company_submissions set current_section = page_key where id = target_submission_id;
  return jsonb_build_object('edit_version', saved.edit_version, 'reviewed_at', saved.reviewed_at, 'provenance', saved.provenance);
end;
$$;
create function public.save_report_answer(
  target_submission_id bigint, target_question_id bigint, new_value jsonb,
  expected_version bigint, confirm_review boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.save_report_answer($1, $2, $3, $4, $5);
$$;
revoke all on function app_private.save_report_answer(bigint,bigint,jsonb,bigint,boolean) from public, anon;
revoke all on function public.save_report_answer(bigint,bigint,jsonb,bigint,boolean) from public, anon;
grant execute on function app_private.save_report_answer(bigint,bigint,jsonb,bigint,boolean) to authenticated;
grant execute on function public.save_report_answer(bigint,bigint,jsonb,bigint,boolean) to authenticated;

create function app_private.require_answer_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and old.status <> 'submitted' and not app_private.is_platform_admin() then
    perform 1 from public.survey_versions where id = new.survey_version_id and status = 'published' for share;
    if not found or not exists (select 1 from public.organizations where id = new.organization_id and is_active)
    then raise exception 'This reporting cycle is closed' using errcode = '42501'; end if;
  end if;
  if new.status = 'submitted' and old.status <> 'submitted' and not app_private.is_platform_admin() and exists (
    select 1 from public.answers answer join public.survey_questions question on question.id = answer.survey_question_id
    where answer.submission_id = new.id and answer.provenance in ('prefilled', 'historical_import')
      and answer.reviewed_at is null and app_private.answer_has_value(answer.value)
      and app_private.question_is_visible(new.id, question.visibility_rule)
  ) then raise exception 'Confirm the carried-forward answers before submitting'; end if;
  return new;
end;
$$;
create trigger submission_require_review before update of status on public.company_submissions
for each row execute function app_private.require_answer_review();
revoke all on function app_private.require_answer_review() from public, anon, authenticated;

commit;
