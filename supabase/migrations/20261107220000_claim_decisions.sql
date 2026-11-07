begin;
create table public.claim_decisions (
 id uuid primary key default gen_random_uuid(),
 claim_id uuid not null references public.claims(id),
 policy_id uuid not null references public.policy_versions(id),
 input_snapshot jsonb not null,
 input_hash text generated always as (md5(input_snapshot::text)) stored,
 decision jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(claim_id,policy_id,input_hash)
);
alter table public.claim_decisions enable row level security;
revoke all on public.claim_decisions from anon,authenticated;
grant select on public.claim_decisions to authenticated;
create policy decision_read on public.claim_decisions for select to authenticated using (exists(select 1 from public.claims c where c.id=claim_id));
create trigger decisions_immutable before update or delete on public.claim_decisions for each row execute function public.audit_immutable();

-- Only the server engine can write a verdict. Lock policy changes and verify the exact input read.
create function public.save_claim_decision(p_claim uuid,p_policy uuid,p_input jsonb,p_decision jsonb) returns public.claim_decisions
language plpgsql security definer set search_path='' as $$
declare c public.claims; p public.policy_versions; d public.claim_decisions;
begin
 perform pg_advisory_xact_lock(78123001);
 select * into c from public.claims where id=p_claim for update;
 if not found or c.case_status<>'open' then raise exception 'Claim missing or closed'; end if;
 select * into p from public.policy_versions where id=p_policy and status='active';
 if not found then raise exception 'Policy changed; refresh'; end if;
 if to_jsonb(c)<>p_input then raise exception 'Claim changed; refresh'; end if;
 if p_decision->>'caseId' is distinct from c.case_id or p_decision->>'policyVersion' is distinct from p.version_label
 or coalesce(p_decision->>'recommendation','') not in ('routine_processing','request_information','human_review') then raise exception 'Invalid server decision'; end if;
 insert into public.claim_decisions(claim_id,policy_id,input_snapshot,decision) values(p_claim,p_policy,p_input,p_decision)
 on conflict(claim_id,policy_id,input_hash) do nothing returning * into d;
 if d.id is null then select * into d from public.claim_decisions where claim_id=p_claim and policy_id=p_policy and input_hash=md5(p_input::text);
 else insert into public.audit_log(actor_label,action,entity_type,entity_id,details) values('Policy engine','evaluated','decision',d.id::text,jsonb_build_object('caseId',c.case_id,'policyVersion',p.version_label,'recommendation',p_decision->>'recommendation')); end if;
 return d;
end; $$;
revoke all on function public.save_claim_decision(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_claim_decision(uuid,uuid,jsonb,jsonb) to service_role;

-- Existing demo history remains readable; client-supplied demo verdicts can no longer be reviewed.
create or replace function public.record_review(p_event jsonb) returns public.audit_log
language plpgsql security definer set search_path='' as $$
declare d public.claim_decisions; c public.claims; last_event public.audit_log; saved public.audit_log; expected text; target text; reviewer text;
begin
 if coalesce(public.claims_role(),'') not in ('reviewer','admin') then raise exception 'Reviewer or Admin role required'; end if;
 if jsonb_typeof(p_event)<>'object' or octet_length(p_event::text)>12000 then raise exception 'Invalid review'; end if;
 perform pg_advisory_xact_lock(78123001);
 select * into d from public.claim_decisions where id=(p_event->>'decisionId')::uuid;
 if not found then raise exception 'Saved decision required'; end if;
 select * into c from public.claims where id=d.claim_id for update;
 if c.case_status<>'open' then raise exception 'Closed claims cannot be reviewed'; end if;
 if not exists(select 1 from public.policy_versions where id=d.policy_id and status='active') or to_jsonb(c)<>d.input_snapshot then raise exception 'Decision stale; refresh the queue'; end if;
 if coalesce(p_event->>'action','') not in ('confirmed','overridden','reverted') then raise exception 'Invalid action'; end if;
 if p_event->>'action'<>'confirmed' and length(btrim(coalesce(p_event->>'reason','')))<10 then raise exception 'A reason of at least 10 characters is required'; end if;
 select * into last_event from public.audit_log where entity_type='review' and details->>'decisionId'=d.id::text order by sequence desc limit 1;
 expected:=coalesce(last_event.details->>'next',d.decision->>'recommendation');
 if coalesce(p_event->>'expectedReviewId','')<>coalesce(last_event.id::text,'') then raise exception 'Review changed; refresh the queue'; end if;
 target:=case p_event->>'action' when 'confirmed' then expected when 'reverted' then d.decision->>'recommendation' else p_event->>'next' end;
 if coalesce(target,'') not in ('routine_processing','request_information','human_review') or (p_event->>'action' in ('overridden','reverted') and target=expected) then raise exception 'Invalid review transition'; end if;
 select email into reviewer from auth.users where id=auth.uid();
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details)
 values(auth.uid(),coalesce(reviewer,auth.uid()::text),p_event->>'action','review',c.case_id,
 jsonb_build_object('datasetId','stored','decisionId',d.id,'caseId',c.case_id,'policyVersion',d.decision->>'policyVersion','ruleId',d.decision->>'ruleId','automated',d.decision->>'recommendation','previous',expected,'next',target,'reason',coalesce(p_event->>'reason',''),'decisionSource','server_engine')) returning * into saved;
 return saved;
end; $$;

-- Closed claims retain their last saved decision, never a recomputed historical guess.
create function public.guard_closed_claim() returns trigger language plpgsql set search_path='' as $$
begin
 if old.case_status='closed' then raise exception 'Closed claims are immutable'; end if;
 if new.case_status='closed' and not exists(select 1 from public.claim_decisions d join public.policy_versions p on p.id=d.policy_id where d.claim_id=old.id and d.input_snapshot=to_jsonb(old) and p.status='active') then raise exception 'Evaluate the claim before closing'; end if;
 return new;
end; $$;
create trigger closed_claim_guard before update on public.claims for each row execute function public.guard_closed_claim();

-- Audited policy writes use the authenticated user's JWT, not a fabricated creator from JSON.
create function public.write_policy(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.policy_versions; current_id uuid;
begin
 if coalesce(public.claims_role(),'') not in ('policy_manager','admin') then raise exception 'Policy Manager or Admin required'; end if;
 perform pg_advisory_xact_lock(78123001);
 if p_action='create' then
 insert into public.policy_versions(version_label,rules,status,change_summary,source,parent_version_id,created_by)
 values(p_data->>'version_label',p_data->'rules','draft',p_data->>'change_summary',p_data->>'source',(p_data->>'parent_version_id')::uuid,auth.uid()::text) returning * into v;
 elsif p_action='update' then
 update public.policy_versions set rules=coalesce(p_data->'rules',rules),change_summary=case when p_data ? 'change_summary' then p_data->>'change_summary' else change_summary end where id=(p_data->>'id')::uuid and status='draft' returning * into v;
 elsif p_action='delete' then
 delete from public.policy_versions where id=(p_data->>'id')::uuid and status='draft' returning * into v;
 elsif p_action='activate' then
 select id into current_id from public.policy_versions where status='active';
 if current_id is distinct from (p_data->>'expected_active_id')::uuid then raise exception 'Active policy changed; refresh impact'; end if;
 select * into v from public.policy_versions where id=(p_data->>'id')::uuid and status='draft';
 if not found then raise exception 'Draft required'; end if;
 update public.policy_versions set status='archived' where status='active';
 update public.policy_versions set status='active',activated_at=clock_timestamp() where id=v.id returning * into v;
 else raise exception 'Invalid policy action'; end if;
 return to_jsonb(v);
end; $$;
revoke all on function public.write_policy(text,jsonb) from public,anon;
grant execute on function public.write_policy(text,jsonb) to authenticated;
-- Direct calls must not bypass the server's JSON schema validation.
revoke execute on function public.write_policy(text,jsonb) from authenticated;
-- Server uses service-role RPC with the verified actor; set JWT claims only inside this privileged wrapper.
create function public.write_policy_as(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 return public.write_policy(p_action,p_data);
end; $$;
revoke all on function public.write_policy_as(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_policy_as(uuid,text,jsonb) to service_role;

create function public.set_team_role(p_actor uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare previous text; email_label text;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if coalesce(public.claims_role(),'')<>'admin' or p_actor=p_user then raise exception 'Admin required; cannot change own role'; end if;
 if coalesce(p_role,'') not in ('claims_handler','reviewer','policy_manager','admin') then raise exception 'Invalid role'; end if;
 select raw_app_meta_data->>'hack_muc_role' into previous from auth.users where id=p_user and (invited_at is not null or raw_app_meta_data->>'hack_muc_access'='true') for update;
 if not found then raise exception 'Invited user required'; end if;
 update auth.users set raw_app_meta_data=jsonb_set(coalesce(raw_app_meta_data,'{}'::jsonb),'{hack_muc_role}',to_jsonb(p_role)),updated_at=now() where id=p_user;
 select email into email_label from auth.users where id=p_actor;
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details) values(p_actor,email_label,'role_changed','team',p_user::text,jsonb_build_object('previous',previous,'next',p_role));
end; $$;
revoke all on function public.set_team_role(uuid,uuid,text),public.guard_closed_claim() from public,anon,authenticated;
grant execute on function public.set_team_role(uuid,uuid,text) to service_role;
create policy audit_own_decisions on public.audit_log for select to authenticated using (
 public.claims_role()='claims_handler' and (
 (entity_type='review' and exists(select 1 from public.claims c where c.case_id=entity_id and c.submitted_by=auth.uid()))
 or (entity_type='decision' and exists(select 1 from public.claim_decisions d join public.claims c on c.id=d.claim_id where d.id::text=entity_id and c.submitted_by=auth.uid()))
 ));
commit;
