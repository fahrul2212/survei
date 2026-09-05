begin;

-- A stale editor is an HTTP conflict, not a retryable transaction failure.
create or replace function app_private.manage_survey(target_id bigint, operation text, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.survey_versions%rowtype; reports integer; linked integer; new_year integer;
begin
  if not app_private.is_platform_admin() then
    raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into strict item from public.survey_versions where id=target_id for update;
  select count(*) into reports from public.company_submissions where survey_version_id=target_id;
  select count(*) into linked from app_private.mapping_rule_sources m join public.survey_questions q
    on q.id=m.question_id where q.survey_version_id=target_id;
  if operation='inspect' then return jsonb_build_object('survey',to_jsonb(item),'reports',reports,
    'canDelete',item.status='draft' and reports=0 and linked=0); end if;
  if input->>'expectedUpdatedAt' is null or (input->>'expectedUpdatedAt')::timestamptz<>item.updated_at then
    raise exception 'Survey changed. Reopen this dialog before saving.' using errcode='PT409'; end if;
  if operation='update' then
    new_year:=(input->>'year')::integer;
    if new_year is null or new_year not between 2020 and 2200 or length(btrim(coalesce(input->>'name',''))) not between 1 and 200 then
      raise exception 'Provide a name and a valid reporting year'; end if;
    if new_year<>item.reporting_year and (item.status<>'draft' or reports>0) then
      raise exception 'Reporting year is locked after publication or report creation'; end if;
    update public.survey_versions set name=btrim(input->>'name'),reporting_year=new_year,
      opens_at=(input->>'opensAt')::timestamptz,closes_at=(input->>'closesAt')::timestamptz,
      updated_at=clock_timestamp() where id=target_id;
  elsif operation='delete' then
    if item.status<>'draft' or reports>0 or linked>0 then
      raise exception 'Only unused drafts can be deleted. Close this survey to retain its history.'; end if;
    if input->>'confirmName' is distinct from item.name then raise exception 'Survey name does not match'; end if;
    delete from public.survey_versions where id=target_id;
  else raise exception 'Unknown survey operation'; end if;
  insert into public.audit_events(actor_user_id,event_type,entity_type,entity_id,details)
    values(auth.uid(),'survey.'||operation,'survey_version',target_id::text,
      jsonb_build_object('name',item.name,'reporting_year',item.reporting_year));
  return jsonb_build_object('saved',true);
end; $$;

commit;
