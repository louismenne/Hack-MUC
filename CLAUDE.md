# Hack-MUC — Taktile track, thinc! Munich hackathon (7–8 Nov 2026)

Team LLM. Full case brief: `docs/case/case-study.pdf`. Policy v1: `policies/policy-v1.txt`.

## The task in short
Build a claims-triage prototype for fictional motor claims. Each claim gets one of:
`routine_processing`, `request_information`, `human_review` — with the facts and policy rule behind it.
Rules decide; an LLM may extract facts or draft explanations but must never override the policy.
Blank fields are unknown facts, never invented.

Official policy v2 is in `policies/policy-v2.pdf`: €1,200 quote limit and mandatory human review for EV high-voltage battery work. Open claims follow the active Supabase version; closed claims retain the original policy outcome. Judging exports and official comparisons use the bundled v1/v2 pair.

## Deliverables (judging weight)
1. Intake + decision — correct recommendation on hidden cases, incl. after v2 and with blank fields (30%)
2. Uncertainty + change control — escalation, policy version on every decision, affected open cases, closed untouched (15%)
3. Reviewer experience — reviewer can override; record correction, reason, reviewer, policy version (20%; judges do a live override)
4. Measurement — accuracy, wrong-routine rate, unnecessary-escalation rate per version; changed cases separately (10%)
5. Business case — annual triage cost today vs. with system, payback, cost of errors, cost of a policy change (25%)

## Required submission format (scored by script)
Results CSV columns: `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`.
Closed claims: `recommendation_v2` = retained v1 decision, `needs_recheck=False`.
The CLI and browser judging export both write this seven-column format, independently of experimental active policies.

## Commands
Node is installed locally at `~/.local/node/bin` (not on PATH by default — prefix it):
```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm ci
npm test
npm run typecheck
npm run triage -- --input data/labelled_development_cases.csv --output results.csv
```
The CLI refuses to overwrite existing output files. `results*.csv` is gitignored.

## Working with the user
The user is new to coding; explain steps plainly (German is fine) and don't assume tooling knowledge.
`gh` is at `~/.local/bin/gh`.
