-- Official organizer policy v2. Apply after 20261107120000_policy_versions.sql.
-- Preserves all experimental versions (including any pre-existing version named v2).
-- Uses official-v2 to avoid reinterpreting historical user-created labels.
-- Creates official-v2 as a DRAFT only. It is NOT activated here: a policy owner reviews it in the
-- Policy tab (diff and impact on open cases) and activates it there.
begin;
lock table public.policy_versions in share row exclusive mode;
insert into public.policy_versions
  (version_label, rules, status, change_summary, source, parent_version_id, created_by)
values ('official-v2', $official_v2${
  "schemaVersion": 1,
  "fields": {
    "case_id": {
      "type": "string",
      "label": "Case ID"
    },
    "case_status": {
      "type": "enum",
      "values": [
        "open",
        "closed"
      ],
      "label": "Case status"
    },
    "claim_summary": {
      "type": "string",
      "label": "Claim summary"
    },
    "claim_type": {
      "type": "string",
      "label": "Claim type"
    },
    "repair_type": {
      "type": "string",
      "label": "Repair type"
    },
    "quote_eur": {
      "type": "number",
      "label": "Repair quote (EUR)"
    },
    "policy_active_on_incident": {
      "type": "boolean",
      "label": "Policy active on incident date"
    },
    "incident_report_present": {
      "type": "boolean",
      "label": "Incident report present"
    },
    "itemized_quote_present": {
      "type": "boolean",
      "label": "Itemized quote present"
    },
    "injury_reported": {
      "type": "boolean",
      "label": "Injury reported"
    },
    "liability_disputed": {
      "type": "boolean",
      "label": "Liability disputed"
    },
    "duplicate_flag": {
      "type": "boolean",
      "label": "Duplicate flag"
    },
    "evidence_conflict": {
      "type": "boolean",
      "label": "Evidence conflict"
    }
  },
  "rules": [
    {
      "id": "rule1",
      "description": "Known review trigger: inactive coverage, non-motor-own-damage claim, injury, disputed liability, duplicate, evidence conflict, quote above EUR 1,200, or EV high-voltage battery repair. This takes priority over missing documents.",
      "when": {
        "any": [
          {
            "field": "policy_active_on_incident",
            "op": "eq",
            "value": false
          },
          {
            "field": "claim_type",
            "op": "neq",
            "value": "motor_own_damage"
          },
          {
            "field": "injury_reported",
            "op": "eq",
            "value": true
          },
          {
            "field": "liability_disputed",
            "op": "eq",
            "value": true
          },
          {
            "field": "duplicate_flag",
            "op": "eq",
            "value": true
          },
          {
            "field": "evidence_conflict",
            "op": "eq",
            "value": true
          },
          {
            "field": "quote_eur",
            "op": "gt",
            "value": 1200
          },
          {
            "field": "repair_type",
            "op": "eq",
            "value": "ev_high_voltage_battery"
          }
        ]
      },
      "outcome": "human_review"
    },
    {
      "id": "rule2",
      "description": "A required document is explicitly absent: the incident report or the itemized quote is missing.",
      "when": {
        "any": [
          {
            "field": "incident_report_present",
            "op": "eq",
            "value": false
          },
          {
            "field": "itemized_quote_present",
            "op": "eq",
            "value": false
          }
        ]
      },
      "outcome": "request_information"
    },
    {
      "id": "missing_input",
      "description": "An input field is empty or unreadable. Nothing is guessed, and no known fact above already requires human review, so more information is requested.",
      "when": {
        "any": [
          {
            "field": "case_id",
            "op": "is_empty"
          },
          {
            "field": "case_status",
            "op": "is_empty"
          },
          {
            "field": "claim_summary",
            "op": "is_empty"
          },
          {
            "field": "claim_type",
            "op": "is_empty"
          },
          {
            "field": "repair_type",
            "op": "is_empty"
          },
          {
            "field": "quote_eur",
            "op": "is_empty"
          },
          {
            "field": "policy_active_on_incident",
            "op": "is_empty"
          },
          {
            "field": "incident_report_present",
            "op": "is_empty"
          },
          {
            "field": "itemized_quote_present",
            "op": "is_empty"
          },
          {
            "field": "injury_reported",
            "op": "is_empty"
          },
          {
            "field": "liability_disputed",
            "op": "is_empty"
          },
          {
            "field": "duplicate_flag",
            "op": "is_empty"
          },
          {
            "field": "evidence_conflict",
            "op": "is_empty"
          }
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
}
$official_v2$::jsonb, 'draft',
  'Organizer policy-v2.pdf: EUR 1,200 limit; all EV high-voltage battery work requires human review; closed claims retain v1.',
  'seed', (select id from public.policy_versions where version_label = 'v1'), 'Organizer v2 notice')
on conflict (version_label) do nothing;
-- Safety check only (changes nothing): official-v2 must be the organizer seed, not a user-made policy.
do $$
declare target public.policy_versions;
begin
  select * into target from public.policy_versions where version_label = 'official-v2';
  if target.source <> 'seed' then
    raise exception 'official-v2 is already used by a non-official policy; inspect before migrating';
  end if;
end $$;
commit;
