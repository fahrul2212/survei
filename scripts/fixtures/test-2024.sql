begin;
select pg_advisory_xact_lock(hashtext('stica-test-2024-v1'));
do $$
declare
  source_id bigint; target_id bigint; actor uuid; source_report record;
  target_report bigint; fixture_count integer;
begin
  select id into actor from auth.users where raw_app_meta_data->>'role'='platform_admin' order by created_at limit 1;
  if actor is null then raise exception 'A platform administrator is required'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','service_role','app_metadata',jsonb_build_object('role','platform_admin'))::text,true);
  select id into source_id from public.survey_versions
    where reporting_year=2025 and name='STICA Signatory''s Survey 2025 - Climate Transition Plans' and status='closed';
  if source_id is null then raise exception 'The preserved 2025 sample survey is required'; end if;
  select id into target_id from public.survey_versions where name='[TEST DATA] STICA Climate Transition Plans 2024' and reporting_year=2024;
  if target_id is not null then
    if not exists(select 1 from public.audit_events where event_type='seed.synthetic_2024' and entity_id=target_id::text)
    then raise exception 'Refusing to overwrite an unrecognized 2024 survey'; end if;
    return;
  end if;
  select count(*) into fixture_count from public.company_submissions s join public.organizations o on o.id=s.organization_id
    where s.survey_version_id=source_id and s.status='submitted'
      and o.slug ~ '^sample-textile-2025-0[1-8]$' and o.external_reference like 'SYNTHETIC-2025-%';
  if fixture_count<>8 then raise exception 'Expected exactly eight verified synthetic companies'; end if;
  if (select count(*) from public.survey_questions where survey_version_id=source_id)<>92
  then raise exception 'Expected 92 source questions'; end if;
  insert into public.survey_versions(reporting_year,name,status,opens_at,closes_at,published_at)
    values(2024,'[TEST DATA] STICA Climate Transition Plans 2024','draft','2024-10-01Z','2024-12-31T23:59:59Z','2024-10-01Z') returning id into target_id;
  insert into public.survey_questions(survey_version_id,question_revision_id,display_order,is_required,
    carry_forward_enabled,visibility_rule,section_key,section_title)
    select target_id,question_revision_id,display_order,is_required,false,visibility_rule,section_key,section_title
      from public.survey_questions where survey_version_id=source_id;
  for source_report in
    select s.id,s.organization_id from public.company_submissions s join public.organizations o on o.id=s.organization_id
      where s.survey_version_id=source_id and s.status='submitted'
        and o.slug ~ '^sample-textile-2025-0[1-8]$' and o.external_reference like 'SYNTHETIC-2025-%'
  loop
    insert into public.company_submissions(organization_id,survey_version_id,status,created_by,submitted_by,
      submitted_at,revision_number,current_section)
      values(source_report.organization_id,target_id,'submitted',actor,actor,'2024-12-15T10:00:00Z',1,'additional-challenges')
      returning id into target_report;
    insert into public.answers(submission_id,survey_question_id,value,provenance,updated_by)
      select target_report,tq.id,
        case
          when sq.display_order=6 then to_jsonb(greatest(1,floor((a.value#>>'{}')::numeric*0.8)))
          when sq.display_order in(15,17) then to_jsonb((a.value#>>'{}')::integer+1)
          when sq.display_order in(18,21) then '"No"'::jsonb
          when sq.display_order in(14,16) then '"Development in progress"'::jsonb
          when r.question_type in('text','textarea') then to_jsonb(
            '[SYNTHETIC TEST DATA, 2024] The sample company is establishing its baseline, assigning responsibilities and planning supplier engagement. Data quality and resources remain implementation gaps. Question ' || sq.display_order)
          when r.question_type='date' then '"2024-11-15"'::jsonb
          else a.value end,
        'historical_import',actor
      from public.answers a join public.survey_questions sq on sq.id=a.survey_question_id
      join public.question_revisions r on r.id=sq.question_revision_id
      join public.survey_questions tq on tq.survey_version_id=target_id and tq.question_revision_id=sq.question_revision_id
      where a.submission_id=source_report.id;
    insert into public.submission_snapshots(submission_id,revision_number,payload,submitted_by,submitted_at)
      select target_report,1,jsonb_agg(jsonb_build_object('survey_question_id',a.survey_question_id,'value',a.value,'provenance',a.provenance) order by q.display_order),actor,'2024-12-15T10:00:00Z'
        from public.answers a join public.survey_questions q on q.id=a.survey_question_id where a.submission_id=target_report;
  end loop;
  update public.survey_versions set status='closed' where id=target_id;
  insert into public.audit_events(actor_user_id,event_type,entity_type,entity_id,details)
    values(actor,'seed.synthetic_2024','survey_version',target_id::text,jsonb_build_object('synthetic',true,'source_survey_id',source_id,'companies',8,'answers',736,'purpose','Cross-year analysis testing only'));
  assert (select count(*) from public.answers a join public.company_submissions s on s.id=a.submission_id where s.survey_version_id=target_id)=736;
end;
$$;
select v.id,v.name,v.reporting_year,v.status,
  (select count(*) from public.survey_questions where survey_version_id=v.id) as questions,
  (select count(*) from public.company_submissions where survey_version_id=v.id) as companies,
  (select count(*) from public.answers a join public.company_submissions s on s.id=a.submission_id where s.survey_version_id=v.id) as answers
from public.survey_versions v where name='[TEST DATA] STICA Climate Transition Plans 2024' and reporting_year=2024;
-- The runner appends COMMIT only with --apply; otherwise all writes roll back.
