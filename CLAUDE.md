# Hack-MUC — Taktile track, thinc! Munich hackathon (7–8 Nov 2026)

Team LLM. Full case brief: `docs/case/case-study.pdf`. Policy v1: `policies/policy-v1.txt`.

## The task in short
Build a claims-triage prototype for fictional motor claims. Each claim gets one of:
`routine_processing`, `request_information`, `human_review` — with the facts and policy rule behind it.
Rules decide; an LLM may extract facts or draft explanations but must never override the policy.
Blank fields are unknown facts, never invented.

Policy v2 arrives Saturday ~18:00. Then: update rules, flag open claims that need a recheck,
leave closed claims unchanged, and show before/after quality.

## Deliverables (judging weight)
1. Intake + decision — correct recommendation on hidden cases, incl. after v2 and with blank fields (30%)
2. Uncertainty + change control — escalation, policy version on every decision, affected open cases, closed untouched (15%)
3. Reviewer experience — reviewer can override; record correction, reason, reviewer, policy version (20%; judges do a live override)
4. Measurement — accuracy, wrong-routine rate, unnecessary-escalation rate per version; changed cases separately (10%)
5. Business case — annual triage cost today vs. with system, payback, cost of errors, cost of a policy change (25%)

## Required submission format (scored by script)
Results CSV columns: `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`.
Closed claims: `recommendation_v2` = retained v1 decision, `needs_recheck=False`.
Current CLI still writes the v1-only development format — the final exporter is not built yet.

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
