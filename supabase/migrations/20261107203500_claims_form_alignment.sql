begin;
-- Match the existing /claim form's column names; keep ownership/system facts protected.
alter table public.claims rename column policy_reference to policy_number;
alter table public.claims rename column created_at to received_at;
alter table public.claims alter column incident_date drop not null;
alter table public.claims add column claimant_name text not null check (length(btrim(claimant_name)) between 1 and 120);
alter table public.claims add column claimant_email text not null check (length(claimant_email) between 3 and 200 and claimant_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.claims add column license_plate text check (length(license_plate) between 2 and 12);
alter table public.claims add column claimant_states_policy_active boolean;
alter table public.claims add column is_test boolean not null default false;
alter table public.claims drop constraint claims_claim_summary_check;
alter table public.claims add constraint claims_claim_summary_check check (length(btrim(claim_summary)) between 1 and 2000);
revoke insert (policy_active_on_incident) on public.claims from authenticated;
grant insert (claimant_name, claimant_email, license_plate, claimant_states_policy_active) on public.claims to authenticated;
drop policy claims_submit on public.claims;
create policy claims_submit on public.claims for insert to authenticated with check (
  public.claims_role() in ('claims_handler', 'reviewer', 'admin')
  and submitted_by = auth.uid() and case_status = 'open'
  and (incident_date is null or incident_date <= current_date)
  and policy_active_on_incident is null and duplicate_flag is null and evidence_conflict is null
  and is_test = false
);
commit;
