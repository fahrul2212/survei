begin;
-- All AI entry points reserve against the same locked ledger, including legacy summaries.
create function app_private.reserve_ai_budget() returns trigger language plpgsql security definer set search_path='' as $$
declare settings public.ai_settings%rowtype; spent numeric; company_spent numeric;
begin
  if new.status<>'pending' then return new; end if;
  select * into strict settings from public.ai_settings where id=1 for update;
  if not settings.enabled then raise exception 'AI is disabled' using errcode='P0001'; end if;
  if new.estimated_cost_usd is null then raise exception 'Cost reservation required'; end if;
  select coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)),0),
    coalesce(sum(coalesce(actual_cost_usd,estimated_cost_usd)) filter(where organization_id=new.organization_id),0)
    into spent,company_spent from public.ai_usage_events
    where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' and status<>'blocked';
  if spent+new.estimated_cost_usd>settings.monthly_budget_usd or
    (new.organization_id is not null and settings.company_monthly_budget_usd is not null and company_spent+new.estimated_cost_usd>settings.company_monthly_budget_usd)
    then raise exception 'AI budget exceeded' using errcode='P0001'; end if;
  if (select count(*) from public.ai_usage_events where requested_by=new.requested_by and created_at>now()-interval '1 minute')>=10 then raise exception 'AI request limit reached'; end if;
  return new;
end; $$;
create trigger ai_budget_reservation before insert on public.ai_usage_events for each row execute function app_private.reserve_ai_budget();
alter table app_private.analysis_runs add column usage_event_id uuid references public.ai_usage_events(id);
create function app_private.analysis_narrative(actor uuid,operation text,run_id uuid,input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare checked jsonb; item app_private.analysis_runs%rowtype; usage_id uuid;
begin
  checked:=app_private.analysis_v2_run(actor,'read',run_id);
  if (checked->>'invalidated')::boolean then raise exception 'Mapping approval was revoked' using errcode='42501'; end if;
  select * into strict item from app_private.analysis_runs where id=run_id for update;
  if item.state<>'ready' then raise exception 'Data analysis is not ready'; end if;
  if operation='start' then
    if item.narrative_state<>'not_requested' then raise exception 'An explanation has already been requested' using errcode='40001'; end if;
    insert into public.ai_usage_events(organization_id,requested_by,request_type,provider,model,input_tokens,output_tokens,estimated_cost_usd,scope)
      values(item.organization_id,actor,'analysis_v2','openai',input->>'model',(input->>'inputTokens')::integer,
      (input->>'outputTokens')::integer,(input->>'estimatedCost')::numeric,jsonb_build_object('run_id',run_id)) returning id into usage_id;
    update app_private.analysis_runs set narrative_state='generating',usage_event_id=usage_id where id=run_id;
    return jsonb_build_object('state','generating');
  elsif operation='finish' then
    if item.narrative_state<>'generating' or input->>'state' not in ('ready','failed','rejected','outcome_unknown') then raise exception 'Invalid explanation transition'; end if;
    update app_private.analysis_runs set narrative_state=input->>'state',narrative=case when input->>'state'='ready' then input->'narrative' else null end where id=run_id;
    update public.ai_usage_events set status=case when input->>'state'='ready' then 'completed' else 'failed' end,
      actual_cost_usd=(input->>'actualCost')::numeric,input_tokens=coalesce((input->>'inputTokens')::integer,input_tokens),
      output_tokens=coalesce((input->>'outputTokens')::integer,output_tokens),completed_at=now(),error_code=case when input->>'state'='ready' then null else input->>'state' end
      where id=item.usage_event_id;
    return app_private.analysis_v2_run(actor,'read',run_id);
  else raise exception 'Unknown explanation operation'; end if;
end; $$;
create function public.analysis_v2_narrative(actor uuid,operation text,run_id uuid,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select app_private.analysis_narrative(actor,operation,run_id,input); $$;
revoke all on function app_private.reserve_ai_budget(),app_private.analysis_narrative(uuid,text,uuid,jsonb),public.analysis_v2_narrative(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.analysis_narrative(uuid,text,uuid,jsonb),public.analysis_v2_narrative(uuid,text,uuid,jsonb) to service_role;
commit;
