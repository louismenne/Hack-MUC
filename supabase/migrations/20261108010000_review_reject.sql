-- Reviewer may reject a claim (human in the loop): final, keeps the recommendation, reason required (>= 10 chars).
-- A rejected claim cannot be reviewed again.
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
 return saved;
end; $$;
