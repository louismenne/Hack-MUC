begin;
create table public.quality_investigations (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 3 and 160),
 findings text not null default '' check(length(findings)<=4000),
 status text not null default 'open' check(status in ('open','closed')),
 revision integer not null default 0,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence) between 1 and 100)
);
alter table public.quality_investigations enable row level security;
create policy quality_read on public.quality_investigations for select to authenticated
 using(public.claims_role() in ('reviewer','policy_manager','admin'));
grant select on public.quality_investigations to authenticated;
revoke insert,update,delete on public.quality_investigations from anon,authenticated;
alter table public.policy_versions add column investigation_id uuid unique references public.quality_investigations(id);

-- Evidence and actor are resolved by the database, never accepted as client snapshots.
create function public.open_quality_investigation(p_title text,p_event_ids uuid[]) returns public.quality_investigations
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; result public.quality_investigations;
begin
 if coalesce(public.claims_role(),'') not in ('reviewer','policy_manager','admin') then raise exception 'Staff role required'; end if;
 if coalesce(cardinality(p_event_ids),0) not between 1 and 100 then raise exception 'Select 1 to 100 review events'; end if;
 select jsonb_agg(a.details || jsonb_build_object('id',a.id,'at',a.occurred_at,'action',a.action,'reviewer',a.actor_label,'sequence',a.sequence) order by a.sequence)
 into snapshot from public.audit_log a where a.id=any(p_event_ids) and a.entity_type='review' and a.details->>'decisionSource'='server_engine' and a.details->>'datasetId'='stored';
 if coalesce(jsonb_array_length(snapshot),0)<>cardinality(p_event_ids) then raise exception 'Invalid or duplicate evidence'; end if;
 insert into public.quality_investigations(title,created_by,evidence) values(btrim(p_title),auth.uid(),snapshot) returning * into result;
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details) values(auth.uid(),auth.uid()::text,'opened','quality_investigation',result.id::text,jsonb_build_object('eventIds',p_event_ids));
 return result;
end; $$;

create function public.update_quality_investigation(p_id uuid,p_revision integer,p_findings text,p_status text) returns public.quality_investigations
language plpgsql security definer set search_path='' as $$
declare result public.quality_investigations;
begin
 if coalesce(public.claims_role(),'') not in ('reviewer','policy_manager','admin') then raise exception 'Staff role required'; end if;
 update public.quality_investigations set findings=btrim(p_findings),status=p_status,revision=revision+1 where id=p_id and revision=p_revision returning * into result;
 if not found then raise exception 'Investigation changed; reload before saving'; end if;
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details) values(auth.uid(),auth.uid()::text,'updated','quality_investigation',result.id::text,jsonb_build_object('findings',result.findings,'status',result.status,'revision',result.revision));
 return result;
end; $$;
revoke all on function public.open_quality_investigation(text,uuid[]) from public,anon;
revoke all on function public.update_quality_investigation(uuid,integer,text,text) from public,anon;
grant execute on function public.open_quality_investigation(text,uuid[]) to authenticated;
grant execute on function public.update_quality_investigation(uuid,integer,text,text) to authenticated;

-- Keep the existing schema validation, owner role check and activation/revision guards.
-- Link creation atomically; retries cannot create a second draft for an investigation.
create or replace function public.write_policy_as(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; investigation public.quality_investigations;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if p_action='create' and p_data->>'investigation_id' is not null then
   if coalesce(public.claims_role(),'') not in ('policy_manager','admin') then raise exception 'Policy Manager or Admin required'; end if;
   perform pg_advisory_xact_lock(78123001);
   select * into investigation from public.quality_investigations where id=(p_data->>'investigation_id')::uuid for update;
   if not found or investigation.status<>'open' or length(btrim(investigation.findings))<10 then raise exception 'Open investigation with saved findings required'; end if;
   if investigation.revision is distinct from (p_data->>'investigation_revision')::integer then raise exception 'Investigation changed; reload before drafting'; end if;
   select to_jsonb(v) into result from public.policy_versions v where investigation_id=investigation.id;
   if result is not null then return result; end if;
   if not exists(select 1 from public.policy_versions where id=(p_data->>'parent_version_id')::uuid and status='active') then raise exception 'Active policy changed; reload before drafting'; end if;
   result:=public.write_policy(p_action,p_data);
   update public.policy_versions set investigation_id=investigation.id where id=(result->>'id')::uuid;
   select to_jsonb(v) into result from public.policy_versions v where id=(result->>'id')::uuid;
   insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details) values(auth.uid(),auth.uid()::text,'draft_linked','quality_investigation',investigation.id::text,jsonb_build_object('versionId',result->>'id','findings',investigation.findings,'revision',investigation.revision));
   return result;
 end if;
 return public.write_policy(p_action,p_data);
end; $$;
revoke all on function public.write_policy_as(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_policy_as(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
