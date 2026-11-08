begin;
-- Revisions distinguish a new submission from a return to previously reviewed values.
alter table public.claims add column revision bigint not null default 0;
alter table public.claims add column closed_decision_id uuid references public.claim_decisions(id);
alter table public.policy_versions add column revision bigint not null default 0;

-- Compare pre-migration snapshots too; closure bookkeeping is not a policy input.
create function public.claim_input_matches(c public.claims, snapshot jsonb) returns boolean
language sql immutable set search_path='' as $$
 select (to_jsonb(c)-'closed_decision_id') =
   ((snapshot-'closed_decision_id') || jsonb_build_object('revision',coalesce((snapshot->>'revision')::bigint,0)));
$$;
revoke all on function public.claim_input_matches(public.claims,jsonb) from public,anon;
grant execute on function public.claim_input_matches(public.claims,jsonb) to authenticated,service_role;

-- A reviewer closing someone else's claim must not fail the attachment ownership check.
-- Ownership is a property of the row, not the identity executing a status update.
create function public.valid_claim_attachments(items jsonb, owner_id uuid) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(items)<>'array' then false else
 jsonb_array_length(items)<=10 and not exists (
   select 1 from jsonb_array_elements(items) item where jsonb_typeof(item)<>'object'
   or coalesce(item->>'path','') not like (owner_id::text || '/%')
   or length(coalesce(item->>'name','')) not between 1 and 255
   or coalesce(item->>'size','') !~ '^[0-9]+$'
 ) end;
$$;
revoke all on function public.valid_claim_attachments(jsonb,uuid) from public,anon;
grant execute on function public.valid_claim_attachments(jsonb,uuid) to authenticated,service_role;
alter table public.claims drop constraint claims_attachments_valid;
alter table public.claims add constraint claims_attachments_valid check (public.valid_claim_attachments(attachments,submitted_by));

-- Recover the terminal decision for already closed or rejected claims before enabling the new guard.
alter table public.claims disable trigger closed_claim_guard;
update public.claims c set closed_decision_id=(
 select d.id from public.claim_decisions d where d.claim_id=c.id
 order by (public.claim_input_matches(jsonb_populate_record(c,'{"case_status":"open"}'),d.input_snapshot)) desc,
 d.created_at desc limit 1
) where c.case_status='closed';
update public.claims c set case_status='closed',closed_decision_id=(
 select d.id from public.audit_log a join public.claim_decisions d on d.id::text=a.details->>'decisionId'
 where a.entity_type='review' and a.action='rejected' and d.claim_id=c.id order by a.sequence desc limit 1
) where c.case_status='open' and exists (
 select 1 from public.audit_log a join public.claim_decisions d on d.id::text=a.details->>'decisionId'
 where a.entity_type='review' and a.action='rejected' and d.claim_id=c.id
);
alter table public.claims enable trigger closed_claim_guard;

create or replace function public.guard_closed_claim() returns trigger language plpgsql set search_path='' as $$
declare terminal uuid;
begin
 if old.case_status='closed' then raise exception 'Closed claims are immutable'; end if;
 -- case_id is generated and is not populated in NEW until after BEFORE triggers.
 if new.case_status='closed' then
   if (to_jsonb(new)-'case_id'-'case_status'-'closed_decision_id') is distinct from (to_jsonb(old)-'case_id'-'case_status'-'closed_decision_id') then
     raise exception 'Save and evaluate claim changes before closing';
   end if;
   select d.id into terminal from public.claim_decisions d join public.policy_versions p on p.id=d.policy_id
   where d.claim_id=old.id and public.claim_input_matches(old,d.input_snapshot) and p.status='active'
   order by d.created_at desc limit 1;
   if terminal is null then raise exception 'Evaluate the claim before closing'; end if;
   new.closed_decision_id:=terminal;
 else
   new.closed_decision_id:=old.closed_decision_id;
 end if;
 new.revision:=old.revision + case when (to_jsonb(new)-'case_id'-'case_status'-'closed_decision_id'-'revision') is distinct from
   (to_jsonb(old)-'case_id'-'case_status'-'closed_decision_id'-'revision') then 1 else 0 end;
 return new;
end; $$;

create function public.bump_policy_revision() returns trigger language plpgsql set search_path='' as $$
begin
 new.revision:=old.revision + case when new.rules is distinct from old.rules or new.change_summary is distinct from old.change_summary then 1 else 0 end;
 return new;
end; $$;
create trigger policy_revision before update on public.policy_versions for each row execute function public.bump_policy_revision();
revoke all on function public.bump_policy_revision() from public,anon,authenticated;

create or replace function public.save_claim_decision(p_claim uuid,p_policy uuid,p_input jsonb,p_decision jsonb) returns public.claim_decisions
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
 select * into d from public.claim_decisions where claim_id=p_claim order by created_at desc limit 1;
 if d.policy_id=p_policy and public.claim_input_matches(c,d.input_snapshot) then return d; end if;
 insert into public.claim_decisions(claim_id,policy_id,input_snapshot,decision) values(p_claim,p_policy,p_input,p_decision)
 on conflict(claim_id,policy_id,input_hash) do nothing returning * into d;
 if d.id is null then select * into d from public.claim_decisions where claim_id=p_claim and policy_id=p_policy and input_hash=md5(p_input::text);
 else insert into public.audit_log(actor_label,action,entity_type,entity_id,details) values('Policy engine','evaluated','decision',d.id::text,jsonb_build_object('caseId',c.case_id,'policyVersion',p.version_label,'recommendation',p_decision->>'recommendation')); end if;
 return d;
end; $$;

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
 if not exists(select 1 from public.policy_versions where id=d.policy_id and status='active') or not public.claim_input_matches(c,d.input_snapshot) then raise exception 'Decision stale; refresh the queue'; end if;
 if coalesce(p_event->>'action','') not in ('confirmed','overridden','reverted','rejected') then raise exception 'Invalid action'; end if;
 if p_event->>'action'<>'confirmed' and length(btrim(coalesce(p_event->>'reason','')))<10 then raise exception 'A reason of at least 10 characters is required'; end if;
 select * into last_event from public.audit_log where entity_type='review' and details->>'decisionId'=d.id::text order by sequence desc limit 1;
 if last_event.action='rejected' then raise exception 'Claim already rejected'; end if;
 expected:=coalesce(last_event.details->>'next',d.decision->>'recommendation');
 if coalesce(p_event->>'expectedReviewId','')<>coalesce(last_event.id::text,'') then raise exception 'Review changed; refresh the queue'; end if;
 target:=case p_event->>'action' when 'confirmed' then expected when 'rejected' then expected when 'reverted' then d.decision->>'recommendation' else p_event->>'next' end;
 if coalesce(target,'') not in ('routine_processing','request_information','human_review') or (p_event->>'action' in ('overridden','reverted') and target=expected) then raise exception 'Invalid review transition'; end if;
 select email into reviewer from auth.users where id=auth.uid();
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details)
 values(auth.uid(),coalesce(reviewer,auth.uid()::text),p_event->>'action','review',c.case_id,
 jsonb_build_object('datasetId','stored','decisionId',d.id,'caseId',c.case_id,'policyVersion',d.decision->>'policyVersion','ruleId',d.decision->>'ruleId','automated',d.decision->>'recommendation','previous',expected,'next',target,'reason',coalesce(p_event->>'reason',''),'decisionSource','server_engine')) returning * into saved;
 if p_event->>'action'='rejected' then
   update public.claims set case_status='closed' where id=c.id;
 end if;
 return saved;
end; $$;

create or replace function public.write_policy(p_action text,p_data jsonb) returns jsonb
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
 if (p_data->>'expected_revision')::bigint is distinct from v.revision then raise exception 'Draft changed; refresh impact'; end if;
 update public.policy_versions set status='archived' where status='active';
 update public.policy_versions set status='active',activated_at=clock_timestamp() where id=v.id returning * into v;
 else raise exception 'Invalid policy action'; end if;
 return to_jsonb(v);
end; $$;

-- New servers enforce preview revisions; the existing RPC remains compatible with
-- older deployed servers until they are upgraded. Both are service-role only.
create function public.write_policy_revision_as(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 return public.write_policy(p_action,p_data);
end; $$;
revoke all on function public.write_policy_revision_as(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_policy_revision_as(uuid,text,jsonb) to service_role;

create or replace function public.write_policy_as(p_actor uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if coalesce(public.claims_role(),'') not in ('policy_manager','admin') then
   raise exception 'Policy Manager or Admin required';
 end if;
 if p_action='activate' and not (p_data ? 'expected_revision') then
   -- Preserve the legacy contract; never replace an explicitly supplied stale revision.
   perform pg_advisory_xact_lock(78123001);
   select revision into current_revision from public.policy_versions
     where id=(p_data->>'id')::uuid and status='draft';
   p_data:=p_data || jsonb_build_object('expected_revision',current_revision);
 end if;
 return public.write_policy(p_action,p_data);
end; $$;

commit;
