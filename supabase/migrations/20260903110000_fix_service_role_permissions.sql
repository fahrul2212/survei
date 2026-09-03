grant usage on schema app_private to anon, authenticated, service_role;
grant execute on all functions in schema app_private to authenticated, service_role;

create or replace function app_private.enforce_submission_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Allow service_role or platform admins to seed or manage submissions
  if (select auth.role()) = 'service_role' or app_private.is_platform_admin() then
    return new;
  end if;

  if not app_private.can_edit_organization(new.organization_id) then
    raise exception 'This company role has read-only access' using errcode = '42501';
  end if;
  return new;
end;
$$;
