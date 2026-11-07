begin;
create table public.audit_log (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,
 actor_label text not null,
 action text not null,
 entity_type text not null,
 entity_id text not null,
 details jsonb not null default '{}'::jsonb
);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id, sequence);
create index audit_log_review_idx on public.audit_log((details->>'datasetId'), (details->>'caseId'), (details->>'policyVersion'), sequence) where entity_type = 'review';
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (
 public.claims_role() in ('reviewer','policy_manager','admin')
 or (public.claims_role() = 'claims_handler' and actor_id = auth.uid() and entity_type = 'claim')
);
create function public.audit_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Audit records cannot be changed or deleted'; end;
$$;
create trigger audit_no_changes before update or delete on public.audit_log for each row execute function public.audit_immutable();
create function public.audit_business_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare item jsonb; previous jsonb; label text;
begin
 item := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous := case when TG_OP = 'UPDATE' then to_jsonb(old) else null end;
 select email into label from auth.users where id = auth.uid();
 insert into public.audit_log(actor_id, actor_label, action, entity_type, entity_id, details)
 values (auth.uid(), coalesce(label, 'Server / database'),
 lower(TG_OP), case when TG_TABLE_NAME = 'claims' then 'claim' else 'policy' end, item->>'id',
 case when TG_TABLE_NAME = 'claims' then jsonb_build_object('caseId', item->>'case_id', 'status', item->>'case_status', 'previousStatus', previous->>'case_status')
 else jsonb_build_object('version', item->>'version_label', 'status', item->>'status', 'previousStatus', previous->>'status', 'createdBy', item->>'created_by', 'before', previous, 'after', case when TG_OP = 'DELETE' then null else item end) end);
 return case when TG_OP = 'DELETE' then old else new end;
end;
$$;
create trigger claims_audit after insert or update or delete on public.claims for each row execute function public.audit_business_change();
create trigger policies_audit after insert or update or delete on public.policy_versions for each row execute function public.audit_business_change();

-- Review snapshots are explicitly caller-supplied demo decisions, not engine-verified verdicts.
create function public.record_review(p_event jsonb) returns public.audit_log
language plpgsql security definer set search_path = '' as $$
declare last_event public.audit_log; saved public.audit_log; reviewer text; expected text;
begin
 if public.claims_role() is null or public.claims_role() not in ('reviewer','admin') then raise exception 'Reviewer or Admin role required'; end if;
 if jsonb_typeof(p_event) <> 'object' or octet_length(p_event::text) > 12000 then raise exception 'Invalid review'; end if;
 if coalesce(p_event->>'datasetId','') not in ('development','practice') and
 coalesce(p_event->>'datasetId','') not like ('upload:' || auth.uid()::text || ':%') then raise exception 'Invalid dataset scope'; end if;
 if coalesce(length(btrim(p_event->>'caseId')),0) not between 1 and 200 or
 coalesce(length(btrim(p_event->>'policyVersion')),0) not between 1 and 100 or
 coalesce(length(btrim(p_event->>'ruleId')),0) not between 1 and 200 then raise exception 'Missing review identifiers'; end if;
 if coalesce(p_event->>'action','') not in ('confirmed','overridden','reverted') or
 coalesce(p_event->>'automated','') not in ('routine_processing','request_information','human_review') or
 coalesce(p_event->>'previous','') not in ('routine_processing','request_information','human_review') or
 coalesce(p_event->>'next','') not in ('routine_processing','request_information','human_review') then raise exception 'Invalid review outcome'; end if;
 if p_event->>'action' <> 'confirmed' and length(btrim(coalesce(p_event->>'reason',''))) < 10 then raise exception 'A review reason of at least 10 characters is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws('|', p_event->>'datasetId',p_event->>'caseId',p_event->>'policyVersion'),0));
 select * into last_event from public.audit_log where entity_type='review'
 and details->>'datasetId'=p_event->>'datasetId' and details->>'caseId'=p_event->>'caseId'
 and details->>'policyVersion'=p_event->>'policyVersion' order by sequence desc limit 1;
 expected := coalesce(last_event.details->>'next',p_event->>'automated');
 if p_event->>'previous' <> expected then raise exception 'Review changed; refresh the queue and retry'; end if;
 if (p_event->>'action'='confirmed' and p_event->>'next'<>expected) or
 (p_event->>'action'='overridden' and p_event->>'next'=expected) or
 (p_event->>'action'='reverted' and (p_event->>'next'<>p_event->>'automated' or expected=p_event->>'automated')) then raise exception 'Invalid review transition'; end if;
 select email into reviewer from auth.users where id=auth.uid();
 insert into public.audit_log(actor_id,actor_label,action,entity_type,entity_id,details)
 values(auth.uid(),coalesce(reviewer,auth.uid()::text),p_event->>'action','review',p_event->>'caseId',
 jsonb_build_object('datasetId',p_event->>'datasetId','caseId',p_event->>'caseId','policyVersion',p_event->>'policyVersion','ruleId',p_event->>'ruleId','automated',p_event->>'automated','previous',p_event->>'previous','next',p_event->>'next','reason',coalesce(p_event->>'reason',''),'decisionSource','client_snapshot')) returning * into saved;
 return saved;
end;
$$;
revoke all on function public.audit_immutable(), public.audit_business_change(), public.record_review(jsonb) from public, anon, authenticated;
grant execute on function public.record_review(jsonb) to authenticated;
commit;
