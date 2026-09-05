begin;
grant usage on schema app_private to service_role;

create table app_private.analysis_source_packs (
  id uuid primary key default gen_random_uuid(), sequence_number bigint generated always as identity unique,
  snapshot_id bigint not null references public.submission_snapshots(id),
  submission_id bigint not null references public.company_submissions(id), organization_id bigint not null references public.organizations(id),
  survey_id bigint not null references public.survey_versions(id), reporting_year integer not null,
  dataset text not null check(dataset in ('production','synthetic','unverified')),
  origin text not null check(origin in ('submitted','reconstructed')), payload jsonb not null,
  content_hash text not null, captured_at timestamptz not null default now(), unique(snapshot_id,content_hash)
);
create index analysis_source_scope on app_private.analysis_source_packs(organization_id,reporting_year,captured_at desc);
create table app_private.analysis_cohort_publications (
  source_pack_id uuid primary key references app_private.analysis_source_packs(id), published_at timestamptz not null default now()
);
create table app_private.metric_definitions (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null
);
create table app_private.metric_revisions (
  id uuid primary key default gen_random_uuid(), definition_id uuid not null references app_private.metric_definitions(id),
  revision_number integer not null check(revision_number>0), contract jsonb not null check(jsonb_typeof(contract)='object'),
  unique(definition_id,revision_number)
);
create table app_private.mapping_proposals (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references auth.users(id),
  payload jsonb not null check(jsonb_typeof(payload)='object'), status text not null default 'draft' check(status in ('draft','published','rejected')),
  created_at timestamptz not null default now()
);
create table app_private.mapping_releases (
  id uuid primary key default gen_random_uuid(), proposal_id uuid references app_private.mapping_proposals(id),
  status text not null check(status in ('published','retired','revoked')), reviewer_id uuid references auth.users(id),
  published_at timestamptz not null default now(), reason text not null,
  revoked_by uuid references auth.users(id),revoked_at timestamptz,revocation_reason text
);
create table app_private.mapping_rules (
  id uuid primary key default gen_random_uuid(), release_id uuid not null references app_private.mapping_releases(id),
  metric_revision_id uuid not null references app_private.metric_revisions(id),
  dataset text not null check(dataset in ('production','synthetic')),
  relation text not null check(relation in ('identity','equivalent','convertible','partial','incompatible'))
);
create table app_private.mapping_rule_sources (
  id uuid primary key default gen_random_uuid(), rule_id uuid not null references app_private.mapping_rules(id),
  question_id bigint not null references public.survey_questions(id), revision_id bigint not null references public.question_revisions(id),
  field_path text not null default '', signature text not null, transform jsonb not null,
  unique(rule_id,question_id,field_path)
);
create index analysis_binding_question on app_private.mapping_rule_sources(question_id,field_path);
create table app_private.analysis_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), organization_id bigint references public.organizations(id),
  request jsonb not null, idempotency_key uuid not null, state text not null default 'computing' check(state in ('computing','ready','failed','cancelled')),
  bindings jsonb not null default '[]', result jsonb, narrative jsonb,
  narrative_state text not null default 'not_requested' check(narrative_state in ('not_requested','generating','ready','failed','rejected','outcome_unknown')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 day',
  unique(owner_id,idempotency_key)
);
create index analysis_run_owner on app_private.analysis_runs(owner_id,created_at desc);
create table app_private.analysis_run_inputs (
  run_id uuid not null references app_private.analysis_runs(id) on delete cascade,
  source_pack_id uuid not null references app_private.analysis_source_packs(id), primary key(run_id,source_pack_id)
);

-- New snapshots are captured in the submitting/importing transaction; old records remain untouched.
create function app_private.analysis_snapshot_visibility(survey_id bigint,payload jsonb,rule jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actual jsonb; expected jsonb:=rule->'value';
begin
  if rule is null or rule='{}'::jsonb then return true;end if;
  if rule->>'questionKey' is null then return null;end if;
  select a->'value' into actual from jsonb_array_elements(payload)a join public.survey_questions q on q.id=(a->>'survey_question_id')::bigint
    join public.question_revisions r on r.id=q.question_revision_id join public.question_definitions d on d.id=r.question_id
    where q.survey_version_id=survey_id and d.stable_key=rule->>'questionKey' limit 1;
  if jsonb_typeof(actual)='object' and actual ? 'selection' then actual:=actual->'selection';end if;
  return case coalesce(rule->>'operator','equals')
    when 'equals' then actual=expected
    when 'not_equals' then actual is distinct from expected
    when 'is_answered' then app_private.answer_has_value(actual)
    when 'contains' then case when jsonb_typeof(actual)='array' then actual @> jsonb_build_array(expected)
      else position(lower(coalesce(expected#>>'{}','')) in lower(coalesce(actual#>>'{}','')))>0 end
    else null end;
end;$$;
revoke all on function app_private.analysis_snapshot_visibility(bigint,jsonb,jsonb) from public,anon,authenticated;
create function app_private.capture_analysis_source(target_snapshot bigint, source_origin text default 'submitted')
returns uuid language plpgsql security definer set search_path='' as $$
declare snapshot public.submission_snapshots%rowtype; report public.company_submissions%rowtype;
  company public.organizations%rowtype; survey public.survey_versions%rowtype; body jsonb; source_id uuid; data_class text;
begin
  select * into strict snapshot from public.submission_snapshots where id=target_snapshot;
  select * into strict report from public.company_submissions where id=snapshot.submission_id;
  select * into strict company from public.organizations where id=report.organization_id;
  select * into strict survey from public.survey_versions where id=report.survey_version_id;
  data_class := case when company.slug ~ '^sample-textile-2025-0[1-8]$' and company.external_reference like 'SYNTHETIC-2025-%'
    and survey.id in (26,32) then 'synthetic'
    when source_origin='submitted' and not exists(select 1 from jsonb_array_elements(snapshot.payload) a where a->>'provenance'='historical_import') then 'production'
    else 'unverified' end;
  select jsonb_build_object('organizationId',company.id,'organization',company.name,'submissionId',report.id,
    'surveyId',survey.id,'surveyName',survey.name,'year',survey.reporting_year,'dataset',data_class,
    'origin',source_origin,'capturedAt',statement_timestamp(),'questions',coalesce(jsonb_agg(jsonb_build_object(
      'id',q.id,'revisionId',r.id,'key',d.stable_key,'prompt',r.prompt,'type',r.question_type,'options',r.options,
      'validation',r.validation,'visibility',q.visibility_rule,
      'applicable',case when source_origin='reconstructed' and q.visibility_rule<>'{}'::jsonb then null else app_private.analysis_snapshot_visibility(survey.id,snapshot.payload,q.visibility_rule) end,
      'value',(select a->'value' from jsonb_array_elements(snapshot.payload) a where (a->>'survey_question_id')::bigint=q.id limit 1)
    ) order by q.display_order),'[]'::jsonb)) into body
  from public.survey_questions q join public.question_revisions r on r.id=q.question_revision_id
  join public.question_definitions d on d.id=r.question_id where q.survey_version_id=survey.id;
  insert into app_private.analysis_source_packs(snapshot_id,submission_id,organization_id,survey_id,reporting_year,dataset,origin,payload,content_hash)
  values(snapshot.id,report.id,company.id,survey.id,survey.reporting_year,data_class,source_origin,body,
    encode(sha256(convert_to((body-'capturedAt')::text,'UTF8')),'hex'))
  on conflict(snapshot_id,content_hash) do nothing returning id into source_id;
  if source_id is null then select id into strict source_id from app_private.analysis_source_packs
    where snapshot_id=snapshot.id and content_hash=encode(sha256(convert_to((body-'capturedAt')::text,'UTF8')),'hex'); end if;
  return source_id;
end; $$;
create function app_private.analysis_snapshot_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform app_private.capture_analysis_source(new.id); return new; end; $$;
create trigger capture_analysis_snapshot after insert or update of payload on public.submission_snapshots
for each row execute function app_private.analysis_snapshot_trigger();

-- A new private frozen copy is reconstructed for each currently accepted report only.
do $$ declare item record; begin
  for item in select distinct on(s.id) sn.id from public.company_submissions s join public.submission_snapshots sn on sn.submission_id=s.id
    where s.status='submitted' order by s.id,sn.revision_number desc,sn.id desc
  loop perform app_private.capture_analysis_source(item.id,'reconstructed'); end loop;
end; $$;
insert into app_private.analysis_cohort_publications(source_pack_id)
select id from app_private.analysis_source_packs where dataset='synthetic';

create function app_private.analysis_immutable_record() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Published analysis source and metric records are immutable' using errcode='55000'; end; $$;
create trigger immutable_analysis_source before update or delete on app_private.analysis_source_packs for each row execute function app_private.analysis_immutable_record();
create trigger immutable_metric_revision before update or delete on app_private.metric_revisions for each row execute function app_private.analysis_immutable_record();
create trigger immutable_metric_definition before update or delete on app_private.metric_definitions for each row execute function app_private.analysis_immutable_record();
create trigger immutable_mapping_source before update or delete on app_private.mapping_rule_sources for each row execute function app_private.analysis_immutable_record();
create trigger immutable_mapping_rule before update or delete on app_private.mapping_rules for each row execute function app_private.analysis_immutable_record();
revoke all on function app_private.analysis_immutable_record() from public,anon,authenticated;

-- The gateway is service-only. Actor identity must come from Worker Auth.getUser, never request JSON.
create function app_private.analysis_actor(actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare is_admin boolean; company_id bigint;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server access required' using errcode='42501'; end if;
  select coalesce(raw_app_meta_data->>'role'='platform_admin',false) into is_admin from auth.users where id=actor and deleted_at is null;
  if not found then raise exception 'User unavailable' using errcode='42501'; end if;
  if not is_admin then
    select m.organization_id into company_id from public.organization_members m join public.organizations o on o.id=m.organization_id
      where m.user_id=actor and o.is_active order by m.organization_id limit 1;
    if company_id is null then raise exception 'Active membership required' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('admin',is_admin,'organizationId',company_id);
end; $$;

create function app_private.analysis_bindings() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'releaseId',l.id,'questionId',s.question_id,'revisionId',s.revision_id,
   'field',s.field_path,'signature',s.signature,'transform',s.transform,'relation',r.relation,'dataset',r.dataset,
   'metric',m.contract||jsonb_build_object('id',m.id,'code',d.code)) order by s.id),'[]'::jsonb)
 from app_private.mapping_rule_sources s join app_private.mapping_rules r on r.id=s.rule_id
 join app_private.mapping_releases l on l.id=r.release_id and l.status='published'
 join app_private.metric_revisions m on m.id=r.metric_revision_id join app_private.metric_definitions d on d.id=m.definition_id;
$$;

create function app_private.analysis_v2_run(actor uuid, operation text, run_id uuid default null, input jsonb default '{}', request_key uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare identity jsonb; company_id bigint; item app_private.analysis_runs%rowtype; ids uuid[]; invalidated boolean;
begin
  identity:=app_private.analysis_actor(actor); company_id:=(identity->>'organizationId')::bigint;
  if operation='create' then
    if request_key is null then raise exception 'Idempotency key required'; end if;
    if company_id is not null and jsonb_array_length(coalesce(input->'organizationIds','[]'))>0 then raise exception 'Peer selection denied' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
    select * into item from app_private.analysis_runs r where r.owner_id=actor and r.idempotency_key=request_key;
    if found then
      if item.request<>input then raise exception 'Idempotency conflict' using errcode='40001'; end if;
    else
      if (select count(*) from app_private.analysis_runs where owner_id=actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Analysis rate limit reached'; end if;
      insert into app_private.analysis_runs(owner_id,organization_id,request,idempotency_key,bindings)
        values(actor,company_id,input,request_key,app_private.analysis_bindings()) returning * into item;
      with candidates as (
        select distinct on(p.submission_id) p.id,p.submission_id from app_private.analysis_source_packs p
        join public.company_submissions s on s.id=p.submission_id and s.status='submitted'
        join public.organizations o on o.id=p.organization_id and o.is_active
        where p.dataset=input->>'datasetMode'
          and (company_id is null or p.organization_id=company_id or exists(select 1 from app_private.analysis_cohort_publications c where c.source_pack_id=p.id))
          and (company_id is not null or jsonb_array_length(input->'years')=0 or to_jsonb(p.reporting_year)<@(input->'years'))
          and (company_id is not null or jsonb_array_length(input->'surveyVersionIds')=0 or to_jsonb(p.survey_id)<@(input->'surveyVersionIds'))
          and (company_id is not null or jsonb_array_length(input->'organizationIds')=0 or to_jsonb(p.organization_id)<@(input->'organizationIds'))
        order by p.submission_id,p.sequence_number desc
      ) insert into app_private.analysis_run_inputs(run_id,source_pack_id) select item.id,c.id from candidates c;
      update app_private.analysis_runs set bindings=(select coalesce(jsonb_agg(b),'[]') from jsonb_array_elements(item.bindings)b
        where b->>'dataset'=input->>'datasetMode' and
          (jsonb_array_length(input->'metricCodes')=0 or (input->'metricCodes') ? (b->'metric'->>'code')) and
          exists(select 1 from app_private.analysis_run_inputs i join app_private.analysis_source_packs p on p.id=i.source_pack_id,
            jsonb_array_elements(p.payload->'questions') q where i.run_id=item.id and q->>'id'=b->>'questionId'))
        where id=item.id returning * into item;
    end if;
  else
    select * into item from app_private.analysis_runs r where r.id=run_id and r.owner_id=actor for update;
    if not found then raise exception 'Analysis unavailable' using errcode='42501'; end if;
  end if;
  if item.expires_at<=now() or item.organization_id is distinct from company_id then raise exception 'Analysis expired or access changed' using errcode='42501'; end if;
  invalidated:=exists(select 1 from jsonb_array_elements(item.bindings) b join app_private.mapping_releases l on l.id=(b->>'releaseId')::uuid where l.status='revoked');
  if company_id is not null and exists(
    select 1 from app_private.analysis_cohort_publications c join app_private.analysis_source_packs p on p.id=c.source_pack_id
    join public.company_submissions s on s.id=p.submission_id join public.organizations o on o.id=p.organization_id
    where p.dataset=item.request->>'datasetMode' and (not o.is_active or s.status<>'submitted' or
      exists(select 1 from app_private.analysis_source_packs newer where newer.submission_id=p.submission_id and newer.sequence_number>p.sequence_number))
  ) then invalidated:=true; end if;
  if operation='inputs' then
    if invalidated or item.state<>'computing' then raise exception 'Analysis inputs unavailable'; end if;
    if (select coalesce(sum(jsonb_array_length(p.payload->'questions')),0) from app_private.analysis_run_inputs i join app_private.analysis_source_packs p on p.id=i.source_pack_id where i.run_id=item.id)>50000 then raise exception 'Scope exceeds 50000 observations'; end if;
    if (select coalesce(sum(octet_length(p.payload::text)),0) from app_private.analysis_run_inputs i join app_private.analysis_source_packs p on p.id=i.source_pack_id where i.run_id=item.id)>8000000 then raise exception 'Scope exceeds source byte limit'; end if;
    return jsonb_build_object('packs',(select coalesce(jsonb_agg(p.payload||jsonb_build_object('id',p.id,'benchmarkEligible',exists(select 1 from app_private.analysis_cohort_publications c where c.source_pack_id=p.id)) order by p.id),'[]') from app_private.analysis_run_inputs i join app_private.analysis_source_packs p on p.id=i.source_pack_id where i.run_id=item.id),
      'bindings',item.bindings,'request',item.request,'organizationId',company_id,'createdAt',item.created_at);
  elsif operation='complete' then
    if item.state<>'computing' or invalidated then raise exception 'Analysis is not writable'; end if;
    update app_private.analysis_runs set result=input,state='ready' where id=item.id returning * into item;
  elsif operation='fail' then
    if item.state='computing' then update app_private.analysis_runs set state='failed' where id=item.id returning * into item; end if;
  elsif operation='cancel' then
    if item.state='computing' then update app_private.analysis_runs set state='cancelled' where id=item.id returning * into item; end if;
  elsif operation not in ('create','read') then raise exception 'Unknown analysis operation';
  end if;
  return jsonb_build_object('id',item.id,'state',item.state,'createdAt',item.created_at,'result',case when invalidated then null else item.result end,
    'narrative',case when invalidated then null else item.narrative end,'narrativeState',item.narrative_state,'invalidated',invalidated);
end; $$;

create function public.analysis_v2_run(actor uuid, operation text, run_id uuid default null, input jsonb default '{}', request_key uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select app_private.analysis_v2_run(actor,operation,run_id,input,request_key);
$$;

-- RLS and explicit privilege revocation keep private sources unreachable through browser roles.
do $$ declare name text; begin
  foreach name in array array['analysis_source_packs','analysis_cohort_publications','metric_definitions','metric_revisions','mapping_proposals','mapping_releases','mapping_rules','mapping_rule_sources','analysis_runs','analysis_run_inputs'] loop
    execute format('alter table app_private.%I enable row level security',name);
    execute format('revoke all on app_private.%I from public,anon,authenticated',name);
  end loop;
end; $$;
revoke all on function app_private.capture_analysis_source(bigint,text),app_private.analysis_snapshot_trigger(),app_private.analysis_actor(uuid),app_private.analysis_bindings() from public,anon,authenticated;
revoke all on function public.analysis_v2_run(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on sequence app_private.analysis_source_packs_sequence_number_seq from public,anon,authenticated;
revoke all on function app_private.analysis_v2_run(uuid,text,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function app_private.analysis_v2_run(uuid,text,uuid,jsonb,uuid) to service_role;
grant execute on function public.analysis_v2_run(uuid,text,uuid,jsonb,uuid) to service_role;
commit;
