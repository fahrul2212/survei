begin;

-- Auth refresh timestamps are deliberately excluded: only editable details change this token.
create function app_private.account_revision(target_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_array(coalesce(p.full_name,u.raw_user_meta_data->>'full_name',''),
    coalesce(u.raw_app_meta_data->>'role','company'),
    coalesce(u.raw_app_meta_data->>'portal_disabled','false')='true')::text)
  from auth.users u left join public.profiles p on p.user_id=u.id where u.id=target_user;
$$;
revoke all on function app_private.account_revision(uuid) from public,anon,authenticated;

create or replace function app_private.manage_portal_accounts(actor uuid, operation text, target uuid default null,
  input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare item auth.users%rowtype; role_name text; disabled boolean; search_text text;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'Server access required' using errcode='42501'; end if;
  if operation not in ('list','lookup') then
    perform pg_advisory_xact_lock(hashtextextended('portal-account-management',0));
  end if;
  if app_private.portal_role(actor) is distinct from 'platform_admin' then
    raise exception 'Administrator access required' using errcode='42501'; end if;
  if operation='list' then
    search_text:=left(btrim(coalesce(input->>'search','')),160);
    return (with matches as (
      select u.id,u.email,app_private.account_revision(u.id) as revision,coalesce(p.full_name,u.raw_user_meta_data->>'full_name','') as name,
        coalesce(u.raw_app_meta_data->>'role','company') as role,
        coalesce(u.raw_app_meta_data->>'portal_disabled','false')='true' as disabled,
        u.email_confirmed_at is not null as confirmed,u.created_at,u.last_sign_in_at,
        coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role))
          from public.organization_members m join public.organizations o on o.id=m.organization_id
          where m.user_id=u.id),'[]') as companies
      from auth.users u left join public.profiles p on p.user_id=u.id where u.deleted_at is null and (target is null or u.id=target)
        and (search_text='' or strpos(lower(u.email||' '||coalesce(p.full_name,'')),lower(search_text))>0)
    ) select jsonb_build_object('total',(select count(*) from matches),'users',coalesce((select jsonb_agg(x)
      from (select * from matches order by created_at desc,id limit 25
        offset greatest(0,least(10000,coalesce((input->>'page')::integer,0)))*25)x),'[]')));
  elsif operation='lookup' then
    return jsonb_build_object('exists',exists(select 1 from auth.users
      where lower(email)=lower(input->>'email') and deleted_at is null));
  end if;
  select * into strict item from auth.users where id=target and deleted_at is null for update;
  if operation not in ('update','initialize') then raise exception 'Unknown account operation'; end if;
  if operation='update' and input->>'expectedRevision' is distinct from app_private.account_revision(target) then
    raise exception 'Account changed. Reload its details before saving.' using errcode='PT409';
  end if;
  if operation='initialize' and (item.email_confirmed_at is not null
    or coalesce(item.raw_app_meta_data->>'portal_disabled','false')='true'
    or item.raw_app_meta_data->>'role' in ('platform_admin','platform_analyst')
    or input->>'role' not in ('platform_admin','platform_analyst')) then
    raise exception 'Account already initialized. Review it in Accounts.' using errcode='PT409';
  end if;
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

commit;
