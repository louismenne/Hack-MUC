# Hackathon Taktile Track

**Team LLM** · thinc! Munich hackathon · 7–8 November 2026

A deterministic, inspectable motor-claims triage core. This initial implementation applies the supplied fictional **policy v1** to structured CSV records. It recommends a handling step; it never approves or pays a claim. No LLM or API key is required.

## Run

Requires Node.js 22 or newer and npm.

```bash
npm ci
npm test
npm run typecheck
npm run triage -- --input data/labelled_development_cases.csv --output results.csv
npm run triage -- --input data/unlabelled_practice_cases.csv --output results-practice.csv
```

The CLI refuses to overwrite an existing output file or the input file. Choose a new output path for another run. Errors produce a nonzero exit code.

## Policy and evidence

The original participant policy is in `policies/policy-v1.docx`; `policies/policy-v1.txt` is its extracted text. Both CSVs in `data/` are copied unchanged from the participant materials. Development labels are test expectations, never decision inputs. Practice cases have no supplied labels.

Evaluation order:

1. `v1.rule1`: human review for an inactive policy, non-motor-own-damage claim, injury, disputed liability, duplicate, conflicting evidence, or a quote **greater than €1,500**.
2. `v1.rule2`: request information when either required document is explicitly absent.
3. `v1.missing_input`: request information for absent or unreadable inputs if no known fact already requires human review.
4. `v1.rule3`: routine processing otherwise.

A quote of exactly €1,500 does not trigger human review. Structured fields are authoritative; narrative text cannot override them. Boolean parsing accepts only `true` and `false` (case-insensitive); blanks and other values remain unknown. Quotes must be finite, nonnegative decimal euro amounts, without grouping separators. Missing input columns become unknown facts. Following the policy's broad missing-input instruction, all supplied input fields are checked for absence, including descriptive and status fields.

Batch inputs must have unique, nonempty case IDs. Missing/duplicate IDs, duplicate headers, malformed CSV, and empty batches are rejected so results remain attributable. Each result contains the rule, supporting facts, missing fields, and an explanation.

## Current output and scope

The initial **v1-only development format** is:

```text
case_id,policy_version,recommendation_v1,rule_v1,supporting_facts,missing_fields,explanation,v2_status
```

`supporting_facts` and `missing_fields` are JSON arrays inside CSV cells. `v2_status` is always `unavailable`: no v2 policy was supplied, and this implementation does not fabricate one.

This is **not yet the final seven-column judging format**. Once v2 is supplied, add version comparison, affected-open-claim detection, and the required submission exporter. Closed claims must retain their recorded v1 recommendation with `needs_recheck=False`; the current runner only evaluates v1 and does not modify stored claims or implement rechecks.

The pure evaluator in `src/triage.ts` is shared infrastructure for a future review UI and optional eve tools. Reviewer overrides, persistence, the quality dashboard, and the business case remain future work. The existing `index.html` is preserved.

## Verification

Tests cover all 14 labelled development cases, threshold boundaries, missing and unreadable fields, rule precedence, narrative isolation, output serialization, and batch input failures. The 12 unlabelled practice cases are checked for successful processing, not claimed as measured accuracy. Passing this small development set does not establish hidden-set or production performance.
