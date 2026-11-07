# Policy rules as data (schema v1)

A policy version is **one JSON document**. The engine (`src/policy-engine/`) is fixed, generic code: it
loads a version, tries the rules **in order**, and the **first rule whose condition matches decides**.
If none matches, `default` decides. Policy changes edit the JSON, never the engine.
Source of truth for the format: `src/policy-engine/schema.ts`. v1 lives in `policies/policy-v1.rules.json`.

```jsonc
{
  "schemaVersion": 1,
  "fields": {                                   // facts a rule may use, with their type
    "quote_eur":   { "type": "number" },        // boolean | number | string | enum
    "case_status": { "type": "enum", "values": ["open", "closed"] }
  },
  "rules": [                                    // ordered = priority
    {
      "id": "rule1",                            // result rule id = "<version>.<id>", e.g. "v1.rule1"
      "description": "Plain-language text shown to reviewers and the policy owner.",
      "when": { "any": [                        // all / any nest freely (max depth 6)
        { "field": "injury_reported", "op": "eq",  "value": true },
        { "field": "quote_eur",       "op": "gt",  "value": 1500 }
      ] },
      "outcome": "human_review"                 // routine_processing | request_information | human_review
    }
  ],
  "default": { "id": "rule3", "description": "…", "outcome": "routine_processing" }
}
```

**Operators:** `eq`, `neq`, `gt`, `gte`, `lt`, `lte` (numbers only), `in`, `not_in` (value is a list),
`is_empty`, `is_not_empty` (no value). Combine with `{"all": [...]}` / `{"any": [...]}`.

**Unknown facts.** Blank, unreadable or invalid values become *unknown* and are never guessed.
An unknown fact satisfies **no** comparison (`neq`, `not_in`, `gt`… are all false); only `is_empty` matches it.
So "known human_review triggers first, then `is_empty` rules" gives the v1 behaviour: a blank field means
`request_information`, unless a known fact already requires `human_review`.

**Value parsing:** booleans `TRUE/true/1`, `FALSE/false/0`; numbers `1500`, `1500.00`, `€1,500`, `1.500,00`, spaces ok.
Ambiguous input such as `1.500` is unknown, not 1.5.

**Result per claim** (same shape as `Decision` in `src/triage.ts`):
`caseId, policyVersion, recommendation, ruleId, supportingFacts, missingFields, explanation`.
There is no automatic rejection outcome.

```ts
import { validatePolicy, evaluatePolicyDocument } from './src/policy-engine';
const r = validatePolicy(json);                          // -> { ok, policy } | { ok: false, errors: string[] }
if (r.ok) evaluatePolicyDocument(r.policy, 'v1', csvRow); // pure, deterministic, no AI
```
