begin;

-- Pure value inspection only; required by the security-invoker progress view.
grant execute on function app_private.answer_has_value(jsonb) to authenticated;

create or replace view public.admin_submission_progress
with (security_invoker = true)
as
select
  organization.id as organization_id,
  organization.name as organization_name,
  organization.slug as organization_slug,
  organization.contact_email,
  version.id as survey_version_id,
  version.reporting_year,
  version.name as survey_name,
  submission.id as submission_id,
  coalesce(submission.status, 'not_started') as status,
  submission.submitted_at,
  submission.updated_at,
  count(survey_question.id)::integer as total_questions,
  count(survey_question.id) filter (where survey_question.is_required)::integer as required_questions,
  count(answer.id) filter (
    where app_private.answer_has_value(answer.value)
  )::integer as answered_questions,
  case
    when count(survey_question.id) = 0 then 0
    else round(
      100.0 * count(answer.id) filter (
        where app_private.answer_has_value(answer.value)
      ) / count(survey_question.id)
    )::integer
  end as completion_percent
from public.organizations organization
cross join public.survey_versions version
left join public.company_submissions submission
  on submission.organization_id = organization.id
  and submission.survey_version_id = version.id
left join public.survey_questions survey_question
  on survey_question.survey_version_id = version.id
left join public.answers answer
  on answer.submission_id = submission.id
  and answer.survey_question_id = survey_question.id
where organization.is_active
group by organization.id, version.id, submission.id;

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
        100.0 * count(answer.id) filter (where app_private.answer_has_value(answer.value))
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
        100.0 * count(answer.id) filter (where app_private.answer_has_value(answer.value))
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

commit;
