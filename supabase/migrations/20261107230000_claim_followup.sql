begin;
-- Claimants can supplement their own open claims; verified/system fields stay protected.
grant update (claimant_name, claimant_email, policy_number, incident_date, license_plate,
  claim_type, claim_summary, repair_type, quote_eur, injury_reported, liability_disputed,
  claimant_states_policy_active, incident_report_present, itemized_quote_present, attachments)
  on public.claims to authenticated;
create policy claims_supplement on public.claims for update to authenticated
using (submitted_by = auth.uid() and case_status = 'open'
  and public.claims_role() in ('claims_handler', 'reviewer', 'admin'))
with check (submitted_by = auth.uid() and case_status = 'open'
  and (incident_date is null or incident_date <= current_date)
  and public.claims_role() in ('claims_handler', 'reviewer', 'admin'));
commit;
