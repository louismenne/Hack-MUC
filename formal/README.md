# Lean policy verification

This directory contains a **machine-checked proof of a formal model** of the policy evaluator, plus executable differential checks against the actual TypeScript engine. It is not an end-to-end proof of the application or of the natural-language policy.

## Run

Install Lean 4.35.0 using the [official Lean installation guidance](https://lean-lang.org/install/). The `lean-toolchain` file pins this version for elan when invoked from this directory. From the repository root, set `LEAN_BIN` to the corresponding executable if it is not already on PATH:

```bash
npm ci
LEAN_BIN=/absolute/path/to/lean npm run proof
```

The command compiles `Policy.lean` (which checks all theorems), prints selected axiom dependencies, then executes the Lean evaluator on the same generated facts used by TypeScript. Intermediate files are placed in a disposable OS temp directory. There are no third-party Lean library dependencies; only Lean's bundled `Std` library is used.

Verified with Lean 4.35.0: **945,172 comparisons agree** (630,154 against the current JSON engine; the rest cover reference configurable-document variants), including all 14 labelled development cases and 12 unlabelled practice cases. This is a finite conformance check, not a formal proof of language-to-language equivalence. The labelled cases are also checked against their expected v1 labels.

## What is proved

`Policy.lean` defines typed facts with explicit unknown values, configurable quote limits and required documents, mandatory review triggers, optional repair-type review triggers, and three recommendations.

| Theorem | Statement |
|---|---|
| `first_match_wins` | Given any list of evaluated rule conditions and result payloads, the first true rule wins regardless of later rules. |
| `no_match_default` | If all evaluated rule conditions are false, the default payload is returned. |
| `ordered_rules_correct` | Selecting the first match in the three modeled official rules equals the verified decision model. |
| `correct` | For every modeled claim, policy, and recommendation, the ordered evaluator returns that recommendation **if and only if** the declarative policy permits it. |
| `unique` | The declarative policy permits at most one recommendation for a claim. |
| `review_precedence` | A known human-review trigger wins regardless of missing information or documents. |
| `missing_requests_information` | Missing information yields an information request when no review trigger is known. |
| `no_unsafe_routine` | Routine processing implies no known review trigger, no absent required document, and no missing required input. “Unsafe” refers only to these formal policy conditions. |
| `exact_boundary` | A quote exactly at the limit does not trigger amount-based review. Other triggers can still apply. |
| `v2_battery_requires_review` | Official v2 battery repairs always require human review, including missing documents or quote. |
| `v2_1200_at_boundary` / `v2_1201_requires_review` | Official €1,200 boundary and €1,201 review requirement. |
| `one_cent_above` | One cent above the limit triggers amount-based review. |
| `above_limit_requires_review` | Any amount-based review trigger produces human review. |
| `lower_limit_preserves_amount_review` | Lowering the threshold cannot remove an existing amount-based review requirement. |
| `version_label_irrelevant` | Changing a version label alone does not change a recommendation. |
| `closed_unchanged` | The abstract activation transition preserves a closed claim's recommendation and pending flag. With a false initial flag it stays false. |
| `changed_open_flagged` | A changed open recommendation is flagged for recheck. |
| `pending_recheck_preserved` | An unresolved pending flag survives another transition. |

The proof has no `sorry`, `admit`, custom axioms, or `native_decide` shortcuts. Reported theorem dependencies are the standard Lean axioms `propext` and (for the threshold monotonicity proof) `Quot.sound`. These are not application-specific assumptions.

## How this connects to TypeScript

The operational definition models the official rules in `policies/policy-v1.rules.json` and `policies/policy-v2.rules.json`, evaluated by `src/policy-engine/engine.ts`. The verification-only reference evaluator lives in `scripts/support/reference-policy.ts`; it has no application runtime consumers.

- `reviewTrigger` captures the first official rule, including v2's battery trigger and lower limit.
- `absentDocument` captures the explicit false-document rule.
- `missingInput` captures the missing-field rule; the three metadata fields are represented by one presence Boolean.
- `selectFirst` models generic first-match selection **after** conditions have been evaluated. Its theorems do not verify the JSON condition interpreter itself.
- `transition` models intended recommendation/recheck behavior, not database execution.

`scripts/check-policy-proof.ts` now uses the current engine's `normalizeFacts` to serialize official v1/v2 inputs into Lean, and compares Lean results directly with `evaluatePolicyDocument`. It does not use the reference evaluator as the oracle for these policies. Configurable-document variants are checked separately against the reference evaluator.

For each of three configurations, the checker crosses all 3^7 true/false/unknown Boolean combinations with eight quote values (unknown, zero, and below/at/above both limits), three claim types, three repair types, and present/missing summary. Additional cases exercise each metadata field, optional documents, current-engine currency/Boolean parsing, invalid status values, and all 26 supplied records. The 14 labelled records are also checked against their expected v1 labels. `Conformance.lean` evaluates each serialized fixture independently. The bridge rejects amounts outside safe cent-denominated values rather than silently rounding arbitrary fractions into the proof model.

## Scope and trust boundaries

1. **Specification:** A human must review that `Allowed`, the predicates, and the modeling choices faithfully represent the written policy. Lean proves implications of these definitions; it does not interpret the PDF.
2. **Money:** Lean uses nonnegative integer cents. Conformance examples use cent-denominated values. TypeScript uses IEEE-754 numbers and accepts more than two decimal places. Arbitrary fractional-cent input, very large numbers, rounding, and floating-point parsing are **not proved equivalent**. Do not claim numeric equivalence for all JavaScript numbers.
3. **Parsing and types:** The official-policy bridge begins after `normalizeFacts`; reference variants begin after `parseClaim`. CSV decoding, unreadable-value classification, malformed direct calls to the broad TypeScript `Claim` type, serialization, and the test adapter are not formally verified.
4. **Implementation:** The generic JSON engine permits additional input formats (such as formatted currency and 1/0 booleans); selected additional formats are checked, but not every possible input format or arbitrary user-authored JSON policy. The TypeScript program is not compiled from Lean and has not been formally translated into Lean semantics. Differential testing gives evidence, not universal implementation equivalence.
5. **Lifecycle:** The abstract transition theorems do not establish SQL atomicity, authentication, authorization, preview freshness, persistence, or concurrency safety. Those require implementation tests and review.
6. **Outputs:** Evidence strings, rule IDs, UI behavior, reviewer overrides, quality metrics, and business assumptions are outside the proof.
7. **Policy scope:** The missing-input model includes metadata/summary presence, matching the current implementation's conservative reading of the participant policy. Policy v1 does not mandate this particular interpretation unambiguously; clarify with the mentor if needed.

A stronger future guarantee would use cent-based money in the runtime and a verified or generated implementation, with a separately validated parser and database transition boundary.
