begin;
create function app_private.analysis_mapping(actor uuid, operation text, target uuid default null, input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb; proposal app_private.mapping_proposals%rowtype; definition uuid; revision uuid;
  release uuid; rule uuid; source jsonb; metric_contract jsonb;
begin
  identity:=app_private.analysis_actor(actor);
  if not (identity->>'admin')::boolean then raise exception 'Administrator required' using errcode='42501'; end if;
  if operation='catalog' then
    return jsonb_build_object('questions',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',q.id,'revisionId',r.id,'key',d.stable_key,'prompt',r.prompt,'type',r.question_type,
      'options',r.options,'validation',r.validation,'visibility',q.visibility_rule,
      'applicable',null,'value',null,'surveyId',v.id,'surveyName',v.name,'year',v.reporting_year) order by v.reporting_year,q.display_order),'[]')
      from public.survey_questions q join public.question_revisions r on r.id=q.question_revision_id
      join public.question_definitions d on d.id=r.question_id join public.survey_versions v on v.id=q.survey_version_id),
      'proposals',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'authorId',p.author_id,'status',p.status,'payload',p.payload,'createdAt',p.created_at) order by p.created_at desc),'[]') from app_private.mapping_proposals p),
      'releases',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'proposalId',l.proposal_id,'status',l.status,'reason',l.reason,'reviewerId',l.reviewer_id)),'[]') from app_private.mapping_releases l),
      'bindings',app_private.analysis_bindings(),'actorId',actor);
  elsif operation='propose' then
    if jsonb_typeof(input->'metric') is distinct from 'object' or jsonb_array_length(input->'sources') not between 1 and 100 then raise exception 'Invalid mapping proposal'; end if;
    insert into app_private.mapping_proposals(author_id,payload) values(actor,input) returning * into proposal;
    return jsonb_build_object('id',proposal.id,'status',proposal.status);
  elsif operation='publish' then
    perform pg_advisory_xact_lock(hashtextextended('analysis-mapping-publication',0));
    select * into strict proposal from app_private.mapping_proposals where id=target for update;
    if proposal.author_id=actor then raise exception 'A different administrator must review this proposal' using errcode='42501'; end if;
    if proposal.status<>'draft' then raise exception 'Proposal is no longer a draft' using errcode='40001'; end if;
    if input<>proposal.payload then raise exception 'Proposal changed during review' using errcode='40001'; end if;
    metric_contract:=proposal.payload->'metric';
    for source in select * from jsonb_array_elements(proposal.payload->'sources') loop
      perform 1 from public.survey_questions q where q.id=(source->>'questionId')::bigint and q.question_revision_id=(source->>'revisionId')::bigint for share;
      if not found then raise exception 'Question revision changed' using errcode='40001'; end if;
      if exists(select 1 from app_private.mapping_rule_sources s join app_private.mapping_rules r on r.id=s.rule_id
        join app_private.mapping_releases l on l.id=r.release_id where l.status='published'
        and r.dataset=proposal.payload->>'dataset' and s.question_id=(source->>'questionId')::bigint and s.field_path=source->>'field') then
        raise exception 'A published mapping already covers this source; revoke it before replacement' using errcode='40001';
      end if;
    end loop;
    insert into app_private.metric_definitions(code,name) values(metric_contract->>'code',metric_contract->>'name') on conflict(code) do nothing;
    select id into strict definition from app_private.metric_definitions where code=metric_contract->>'code';
    select id into revision from app_private.metric_revisions where definition_id=definition and metric_revisions.contract=metric_contract order by revision_number desc limit 1;
    if revision is null then
      insert into app_private.metric_revisions(definition_id,revision_number,contract)
      select definition,coalesce(max(revision_number),0)+1,metric_contract from app_private.metric_revisions where definition_id=definition returning id into revision;
    end if;
    insert into app_private.mapping_releases(proposal_id,status,reviewer_id,reason) values(proposal.id,'published',actor,proposal.payload->>'reason') returning id into release;
    insert into app_private.mapping_rules(release_id,metric_revision_id,dataset,relation)
      values(release,revision,proposal.payload->>'dataset',proposal.payload->>'relation') returning id into rule;
    insert into app_private.mapping_rule_sources(rule_id,question_id,revision_id,field_path,signature,transform)
      select rule,(s->>'questionId')::bigint,(s->>'revisionId')::bigint,s->>'field',s->>'signature',s->'transform' from jsonb_array_elements(proposal.payload->'sources') s;
    update app_private.mapping_proposals set status='published' where id=proposal.id;
    return jsonb_build_object('id',release,'status','published');
  elsif operation='revoke' then
    if length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'A revocation reason is required'; end if;
    update app_private.mapping_releases set status='revoked',revocation_reason=left(input->>'reason',500),revoked_by=actor,revoked_at=now() where id=target and status='published';
    if not found then raise exception 'Published mapping unavailable' using errcode='40001'; end if;
    return jsonb_build_object('id',target,'status','revoked');
  else raise exception 'Unknown mapping operation'; end if;
end; $$;
create function public.analysis_v2_mapping(actor uuid, operation text, target uuid default null, input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select app_private.analysis_mapping(actor,operation,target,input); $$;
revoke all on function app_private.analysis_mapping(uuid,text,uuid,jsonb),public.analysis_v2_mapping(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.analysis_mapping(uuid,text,uuid,jsonb),public.analysis_v2_mapping(uuid,text,uuid,jsonb) to service_role;
commit;
