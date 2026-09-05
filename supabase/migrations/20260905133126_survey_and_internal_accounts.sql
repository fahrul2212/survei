begin;

-- Read current server-owned metadata so removing access also affects existing JWTs.
create function app_private.portal_role(target_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce(raw_app_meta_data->>'role','company') from auth.users
  where id=target_user and deleted_at is null
    and coalesce(raw_app_meta_data->>'portal_disabled','false')<>'true'
    and (banned_until is null or banned_until<now());
$$;
revoke all on function app_private.portal_role(uuid) from public,anon,authenticated;
create or replace function app_private.is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(app_private.portal_role(auth.uid())='platform_admin',false);
$$;
create function app_private.is_platform_analyst() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(app_private.portal_role(auth.uid())='platform_analyst',false);
$$;
revoke all on function app_private.is_platform_analyst() from public,anon;
grant execute on function app_private.is_platform_analyst() to authenticated;
create or replace function app_private.organization_role(target_organization_id bigint) returns text
language sql stable security definer set search_path='' as $$
  select m.role from public.organization_members m where m.organization_id=target_organization_id
    and m.user_id=auth.uid() and app_private.portal_role(auth.uid()) is not null limit 1;
$$;
create or replace function app_private.is_organization_member(target_organization_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.organization_role(target_organization_id) is not null;
$$;
create or replace function app_private.analysis_actor(actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role_name text; company_id bigint;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'Server access required' using errcode='42501'; end if;
  role_name:=app_private.portal_role(actor);
  if role_name is null then raise exception 'User unavailable' using errcode='42501'; end if;
  if role_name not in ('platform_admin','platform_analyst') then
    select m.organization_id into company_id from public.organization_members m
      join public.organizations o on o.id=m.organization_id and o.is_active
      where m.user_id=actor order by m.organization_id limit 1;
    if company_id is null then raise exception 'Active membership required' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('admin',role_name='platform_admin','organizationId',company_id);
end; $$;
create policy analyst_question_read on public.survey_questions for select to authenticated
  using ((select app_private.is_platform_analyst()));
create policy analyst_revision_read on public.question_revisions for select to authenticated
  using ((select app_private.is_platform_analyst()));
create policy analyst_definition_read on public.question_definitions for select to authenticated
  using ((select app_private.is_platform_analyst()));

-- One atomic operation owns role changes, self-protection, and the audit record.
create function app_private.manage_portal_accounts(actor uuid, operation text, target uuid default null,
  input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare item auth.users%rowtype; role_name text; disabled boolean; search_text text;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'Server access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('portal-account-management',0));
  if app_private.portal_role(actor) is distinct from 'platform_admin' then
    raise exception 'Administrator access required' using errcode='42501'; end if;
  if operation='list' then
    search_text:=left(btrim(coalesce(input->>'search','')),160);
    return (with matches as (
      select u.id,u.email,coalesce(p.full_name,u.raw_user_meta_data->>'full_name','') as name,
        coalesce(u.raw_app_meta_data->>'role','company') as role,
        coalesce(u.raw_app_meta_data->>'portal_disabled','false')='true' as disabled,
        u.email_confirmed_at is not null as confirmed,u.created_at,u.last_sign_in_at,
        coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role))
          from public.organization_members m join public.organizations o on o.id=m.organization_id
          where m.user_id=u.id),'[]') as companies
      from auth.users u left join public.profiles p on p.user_id=u.id where u.deleted_at is null
        and (search_text='' or strpos(lower(u.email||' '||coalesce(p.full_name,'')),lower(search_text))>0)
    ) select jsonb_build_object('total',(select count(*) from matches),'users',coalesce((select jsonb_agg(x)
      from (select * from matches order by created_at desc,id limit 25
        offset greatest(0,least(10000,coalesce((input->>'page')::integer,0)))*25)x),'[]')));
  elsif operation='lookup' then
    return jsonb_build_object('exists',exists(select 1 from auth.users
      where lower(email)=lower(input->>'email') and deleted_at is null));
  end if;
  select * into strict item from auth.users where id=target and deleted_at is null for update;
  if operation<>'update' then raise exception 'Unknown account operation'; end if;
  role_name:=input->>'role'; disabled:=(input->>'disabled')::boolean;
  if role_name is null or role_name not in ('company','platform_admin','platform_analyst')
    or disabled is null or length(btrim(coalesce(input->>'name',''))) not between 1 and 160 then
    raise exception 'Invalid account details'; end if;
  if item.id=actor and (disabled or role_name<>'platform_admin') then
    raise exception 'You cannot remove your own administrator access' using errcode='42501'; end if;
  if role_name in ('platform_admin','platform_analyst') and exists(
    select 1 from public.organization_members where user_id=target) then
    raise exception 'Remove company memberships before assigning internal access'; end if;
  if role_name='company' and item.raw_app_meta_data->>'role' in ('platform_admin','platform_analyst') then
    raise exception 'Disable internal access instead of converting an internal account'; end if;
  if item.raw_app_meta_data->>'role'='platform_admin' and (disabled or role_name<>'platform_admin')
    and not exists(select 1 from auth.users where id<>target
      and app_private.portal_role(id)='platform_admin') then
    raise exception 'At least one active administrator is required'; end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||
    jsonb_build_object('role',role_name,'portal_disabled',disabled),updated_at=now() where id=target;
  insert into public.profiles(user_id,full_name) values(target,btrim(input->>'name'))
    on conflict(user_id) do update set full_name=excluded.full_name,updated_at=now();
  insert into public.audit_events(actor_user_id,event_type,entity_type,entity_id,details)
    values(actor,'account.updated','user',target::text,jsonb_build_object(
      'previous_role',coalesce(item.raw_app_meta_data->>'role','company'),
      'role',role_name,'disabled',disabled));
  return jsonb_build_object('saved',true);
end; $$;
create function public.manage_portal_accounts(actor uuid,operation text,target uuid default null,input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select app_private.manage_portal_accounts(actor,operation,target,input); $$;
revoke all on function app_private.manage_portal_accounts(uuid,text,uuid,jsonb),
  public.manage_portal_accounts(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.manage_portal_accounts(uuid,text,uuid,jsonb),
  public.manage_portal_accounts(uuid,text,uuid,jsonb) to service_role;

create function app_private.protect_survey_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' and (old.status<>'draft' or exists(
    select 1 from public.company_submissions where survey_version_id=old.id)) then
    raise exception 'Only unused drafts can be deleted. Close this survey to retain its history.';
  end if;
  if tg_op='UPDATE' and new.reporting_year<>old.reporting_year and (old.status<>'draft' or exists(
    select 1 from public.company_submissions where survey_version_id=old.id)) then
    raise exception 'Reporting year is locked after publication or report creation';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function app_private.protect_survey_identity() from public,anon,authenticated;
create trigger protect_survey_identity before update of reporting_year or delete on public.survey_versions
for each row execute function app_private.protect_survey_identity();

create function app_private.manage_survey(target_id bigint, operation text, input jsonb default '{}')
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
    raise exception 'Survey changed. Reopen this dialog before saving.' using errcode='40001'; end if;
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
create function public.manage_survey(target_id bigint,operation text,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select app_private.manage_survey(target_id,operation,input); $$;
revoke all on function app_private.manage_survey(bigint,text,jsonb),public.manage_survey(bigint,text,jsonb) from public,anon;
grant execute on function app_private.manage_survey(bigint,text,jsonb),public.manage_survey(bigint,text,jsonb) to authenticated;
commit;
