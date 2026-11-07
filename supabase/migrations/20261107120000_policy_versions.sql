-- Policy versions for the policy-owner workspace.
-- Rules are DATA: one JSON document per version (schema: src/policy-engine/schema.ts, docs/policy-rules-schema.md).
-- Run once in the Supabase SQL Editor. Re-running is safe (idempotent).

create table if not exists public.policy_versions (
  id                uuid primary key default gen_random_uuid(),
  version_label     text not null unique check (version_label ~ '^[A-Za-z0-9._-]{1,40}$'),
  rules             jsonb not null check (jsonb_typeof(rules) = 'object'),
  status            text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  change_summary    text,
  source            text not null check (source in ('upload', 'edit', 'seed')),
  parent_version_id uuid references public.policy_versions (id),
  created_by        text not null check (length(btrim(created_by)) > 0),
  created_at        timestamptz not null default now(),
  activated_at      timestamptz,
  -- an active version always records when it was activated
  constraint active_has_activated_at check (status <> 'active' or activated_at is not null)
);

-- Exactly one active version: a second row with status 'active' violates this unique index.
create unique index if not exists policy_versions_one_active
  on public.policy_versions ((true)) where status = 'active';

create index if not exists policy_versions_parent_idx on public.policy_versions (parent_version_id);

-- Only the server (secret / service-role key) may touch this table. RLS on with no policies
-- means the publishable / anon key can neither read nor write it.
alter table public.policy_versions enable row level security;

-- Atomic activation: archives the current active version and activates the given draft in one
-- transaction, so there is never zero or two active versions. Call via supabase.rpc() from the API.
create or replace function public.activate_policy_version(p_version_id uuid)
returns public.policy_versions
language plpgsql
as $$
declare
  target public.policy_versions;
begin
  select * into target from public.policy_versions where id = p_version_id for update;
  if not found then
    raise exception 'policy version % not found', p_version_id;
  end if;
  if target.status <> 'draft' then
    raise exception 'only a draft can be activated (version % is %)', target.version_label, target.status;
  end if;
  update public.policy_versions set status = 'archived' where status = 'active';
  update public.policy_versions set status = 'active', activated_at = now()
    where id = p_version_id returning * into target;
  return target;
end;
$$;

revoke all on function public.activate_policy_version(uuid) from public, anon, authenticated;

-- Seed: the supplied participant policy v1, active. Identical to policies/policy-v1.rules.json
-- (a test keeps the two in sync).
insert into public.policy_versions (version_label, rules, status, change_summary, source, created_by, activated_at)
values (
  'v1',
  $seed${
  "schemaVersion": 1,
  "fields": {
    "case_id": { "type": "string", "label": "Case ID" },
    "case_status": { "type": "enum", "values": ["open", "closed"], "label": "Case status" },
    "claim_summary": { "type": "string", "label": "Claim summary" },
    "claim_type": { "type": "string", "label": "Claim type" },
    "repair_type": { "type": "string", "label": "Repair type" },
    "quote_eur": { "type": "number", "label": "Repair quote (EUR)" },
    "policy_active_on_incident": { "type": "boolean", "label": "Policy active on incident date" },
    "incident_report_present": { "type": "boolean", "label": "Incident report present" },
    "itemized_quote_present": { "type": "boolean", "label": "Itemized quote present" },
    "injury_reported": { "type": "boolean", "label": "Injury reported" },
    "liability_disputed": { "type": "boolean", "label": "Liability disputed" },
    "duplicate_flag": { "type": "boolean", "label": "Duplicate flag" },
    "evidence_conflict": { "type": "boolean", "label": "Evidence conflict" }
  },
  "rules": [
    {
      "id": "rule1",
      "description": "Known review trigger: the policy was not active on the incident date, the claim is not motor own damage, injury, disputed liability, a duplicate or conflicting evidence is flagged, or the quote is above EUR 1,500.",
      "when": {
        "any": [
          { "field": "policy_active_on_incident", "op": "eq", "value": false },
          { "field": "claim_type", "op": "neq", "value": "motor_own_damage" },
          { "field": "injury_reported", "op": "eq", "value": true },
          { "field": "liability_disputed", "op": "eq", "value": true },
          { "field": "duplicate_flag", "op": "eq", "value": true },
          { "field": "evidence_conflict", "op": "eq", "value": true },
          { "field": "quote_eur", "op": "gt", "value": 1500 }
        ]
      },
      "outcome": "human_review"
    },
    {
      "id": "rule2",
      "description": "A required document is explicitly absent: the incident report or the itemized quote is missing.",
      "when": {
        "any": [
          { "field": "incident_report_present", "op": "eq", "value": false },
          { "field": "itemized_quote_present", "op": "eq", "value": false }
        ]
      },
      "outcome": "request_information"
    },
    {
      "id": "missing_input",
      "description": "An input field is empty or unreadable. Nothing is guessed, and no known fact above already requires human review, so more information is requested.",
      "when": {
        "any": [
          { "field": "case_id", "op": "is_empty" },
          { "field": "case_status", "op": "is_empty" },
          { "field": "claim_summary", "op": "is_empty" },
          { "field": "claim_type", "op": "is_empty" },
          { "field": "repair_type", "op": "is_empty" },
          { "field": "quote_eur", "op": "is_empty" },
          { "field": "policy_active_on_incident", "op": "is_empty" },
          { "field": "incident_report_present", "op": "is_empty" },
          { "field": "itemized_quote_present", "op": "is_empty" },
          { "field": "injury_reported", "op": "is_empty" },
          { "field": "liability_disputed", "op": "is_empty" },
          { "field": "duplicate_flag", "op": "is_empty" },
          { "field": "evidence_conflict", "op": "is_empty" }
        ]
      },
      "outcome": "request_information"
    }
  ],
  "default": {
    "id": "rule3",
    "description": "No review trigger, no missing document, no missing input: the claim may enter normal downstream processing. This is a handling recommendation, not payment approval.",
    "outcome": "routine_processing"
  }
}$seed$::jsonb,
  'active',
  'Supplied participant policy v1 (policies/policy-v1.txt)',
  'seed',
  'Participant policy',
  now()
)
on conflict (version_label) do nothing;
