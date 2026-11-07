# Hackathon Taktile Track

**Team LLM** · thinc! Munich hackathon · 7–8 November 2026

A deterministic, inspectable motor-claims triage core. The implementation applies the supplied fictional **policies v1 and v2** to structured CSV records. It recommends a handling step; it never approves or pays a claim. No LLM or API key is required.

## Run

Requires Node.js 22.13 or newer and npm.

```bash
npm ci
npm test
npm run typecheck
npm run triage -- --input data/labelled_development_cases.csv --output results.csv
npm run triage -- --input data/unlabelled_practice_cases.csv --output results-practice.csv
```

The CLI refuses to overwrite an existing output file or the input file. Choose a new output path for another run. Errors produce a nonzero exit code.

## Review UI

```bash
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

A React + Tailwind + shadcn/ui reviewer screen in `web/`. It runs the same `src/triage.ts` evaluator in the browser, so recommendations match the CLI exactly.

- **Review queue**: the supplied datasets or an uploaded CSV, filterable by recommendation, review status, and text. Each claim shows the automated recommendation, the rule and its policy text, the supporting facts, highlighted triggering fields, and missing or unreadable inputs. Use `j`/`k` or arrow keys to move through the list.
- **Confirm, override, revert**: an override needs a new recommendation, a reason (at least 10 characters), and a reviewer name. The automated decision is never changed; every action is appended to the audit history with the rule and policy version the reviewer saw.
- **Quality**: correct recommendations, incorrect `routine_processing`, unnecessary `human_review`, and a confusion matrix on labelled cases, shown for the engine and after reviewer overrides. Unlabelled sets are not scored.
- **Audit log**: all reviewer actions, exportable as CSV. **Export results** writes the exact seven-column judging format; reviewer overrides are kept separately in the audit export.

Reviewer actions persist in the browser's `localStorage` (`hackmuc.*` keys). That keeps the demo dependency-free; it is per browser, not shared, and not a production audit store.

## Deploy

`vercel.json` pins the Vercel build (`npm ci`, `npm run build`, output `dist/`, Vite preset), so dashboard settings cannot change it. The Vercel project belongs to Louis's personal team, which deploys only commits authored by a team member. Commits from other authors show "Deployment was blocked" until Louis redeploys or pushes a commit himself.

## Policy and evidence

The original participant policy is in `policies/policy-v1.docx`; `policies/policy-v1.txt` is its extracted text. The two original participant CSVs are copied unchanged. The official v2 change notice is preserved as `policies/policy-v2.pdf`, with extracted text in `policies/policy-v2.txt`. `data/development_v2_expectations.csv` contains explicitly team-derived v2 expectations, separate from the original data. Development labels are test expectations, never decision inputs. Practice cases have no supplied labels.

Evaluation order:

1. `v1.rule1`: human review for an inactive policy, non-motor-own-damage claim, injury, disputed liability, duplicate, conflicting evidence, or a quote **greater than €1,500**.
2. `v1.rule2`: request information when either required document is explicitly absent.
3. `v1.missing_input`: request information for absent or unreadable inputs if no known fact already requires human review.
4. `v1.rule3`: routine processing otherwise.

A quote of exactly €1,500 does not trigger human review. Structured fields are authoritative; narrative text cannot override them. Boolean parsing accepts only `true` and `false` (case-insensitive); blanks and other values remain unknown. Quotes must be finite, nonnegative decimal euro amounts, without grouping separators. Missing input columns become unknown facts. Following the policy's broad missing-input instruction, all supplied input fields are checked for absence, including descriptive and status fields.

Batch inputs must have unique, nonempty case IDs. Missing/duplicate IDs, duplicate headers, malformed CSV, and empty batches are rejected so results remain attributable. Each result contains the rule, supporting facts, missing fields, and an explanation.

## Official v2 and judging export

The organizer's notice takes effect on release and applies to **all open claims after v1 evaluation**. It changes the quote limit to **€1,200** and adds `repair_type = ev_high_voltage_battery` as a mandatory human-review trigger, regardless of quote or missing documents. Exactly €1,200 is within the amount limit; €1,201 exceeds it. All other rules and their order remain unchanged.

The CLI and browser export now emit exactly:

```text
case_id,recommendation_v1,recommendation_v2,needs_recheck,rule_v1,rule_v2,explanation
```

For closed claims, the v2 columns retain the historical v1 recommendation and rule, and `needs_recheck` is `False`. Open claims are evaluated under both official versions; `needs_recheck` is `True` when their next-step recommendation differs. Rule identifiers preserve the version. The stateless CSV path computes the v1 baseline from the supplied facts because the input format has no historical decision column; `compareOfficialPolicies` also accepts an existing historical v1 decision for persisted workflows.

The Review queue uses official v2 for open claims and historical v1 for closed claims, including uploads. Closed claims are marked historical, excluded from pending queue positions, and cannot be overridden. Old v1 review events remain in the audit log but are not applied as v2 reviewer decisions.

Quality shows v1 vs supplied v1 labels, v1 vs new expectations, and v2 vs new expectations, with changed open cases separately. **Closed claims are excluded from v2 scores.** Built-in v2 expectations are manually derived from the official notice and clearly identified as team-derived; practice predictions are not treated as labels. For uploaded data, supply `expected_v2` to score v2. Error-rate denominators are the labelled cases in each reported group.

Current development regression results: v1 matches 14/14 supplied labels; against the new expectations v1 matches 12/14 and v2 matches 14/14. Both changed development cases are corrected. This small, team-derived test set does not establish hidden-set or production accuracy.

The pure evaluator in `src/triage.ts` and batch rules in `src/claims.ts` are shared by CLI/UI. A shared hosted reviewer audit store and the business case remain future work.

## Verification

Tests cover reviewer override, revert, and confirmation rules, the quality metrics, all 14 labelled development cases, threshold boundaries, missing and unreadable fields, rule precedence, narrative isolation, output serialization, and batch input failures. The 12 unlabelled practice cases are checked for successful processing, not claimed as measured accuracy. Passing this small development set does not establish hidden-set or production performance.

## Policy workspace (rules as JSON in Supabase)

The **Policy** tab now stores policy versions in Supabase and works the same locally and on Vercel. Rules are **data**: one JSON document per version (`policies/policy-v1.rules.json` and `policies/policy-v2.rules.json` are the official versions; format in `docs/policy-rules-schema.md`). The generic engine in `src/policy-engine/` evaluates them deterministically; it does not change when a policy changes. `src/triage.ts` and the CLI use the official v1/v2 pair and need no database. The JSON workspace can evaluate experimental versions independently.

- **Overview**: active version, rules in priority order as plain text, rendered from the JSON (no AI).
- **History**: every version with status, source, creator, date and change summary; any version can be opened, and two versions can be compared in plain language.
- **Change a draft** manually (numbers, yes/no, lists) or with Claude: upload a policy document (txt, md, pdf), or give an instruction for one rule. Claude only **proposes** rule JSON; it is validated against the schema (one retry) and saved as a **draft**. Nothing becomes active without a human.
- **Review and activate**: diff to the active version, plus an impact analysis over the participant CSV cases: which **open** cases change their recommendation (`needs_recheck`), with old/new result and rule. Closed cases stay frozen. Activation archives the previous version atomically (`activate_policy_version`). Active and archived versions are immutable.

Setup: run `supabase/migrations/20261107120000_policy_versions.sql`, then `supabase/migrations/20261107183000_official_policy_v2.sql` in the Supabase SQL Editor. The second migration adds and activates `official-v2`, preserving existing user-created versions and their labels (including any experimental `v2`). It is idempotent and does not reactivate an archived official version. **The migration file is supplied in this commit; it has not been applied to the remote database by this change.** Server-side env vars (never `VITE_`-prefixed, never in the browser): `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (the `sb_secret_…` key), optional `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`). Without `ANTHROPIC_API_KEY` the AI buttons show "KI nicht verfügbar, bitte manuell bearbeiten." and everything else works.

Run locally with `npm run dev`: a Vite middleware serves the same functions that Vercel runs (`GET/POST /api/policy`, `POST /api/policy-ai`), reading `.env.local`.

**Vercel Functions are plain JavaScript on purpose.** Vercel's TypeScript compiler for functions needs `ts.sys`, which TypeScript 7 (this repo) no longer provides, so TypeScript files in `api/` fail to build. The functions are written in `src/policy-api/functions/` and compiled by esbuild to `api/*.js` (`npm run build:api`, also run by `npm run build`). The generated files are committed; `tests/api-bundle.test.ts` fails if they are stale. Preview and Production deployments need the env vars above set for their environments.

There is **no authentication**: anyone who can open the deployed URL can create drafts, activate versions and (with an API key) trigger AI calls. Names are labels only.

> The section below describes the earlier local SQLite prototype (`src/server/`). The Policy tab no longer uses it; it is kept until the team agrees to remove it.

## Legacy local policy API

`src/server/` and its SQLite database (`.local/policies.sqlite`) remain available for local lifecycle tests and via `npm run dev:api`. They are **not the backend of the current Supabase Policy tab**. The local API seeds v1 and installs official v2 once without deleting experimental versions or history. Local databases are ignored by Git.

The current Review queue, Quality view, and judging CSV use official v1/v2 independently of experimental workspace policies. Reviewer overrides remain browser-local, uploads are not persisted in Supabase, and a hosted claim/decision history store remains future work. Supabase's impact analysis preserves closed cases using their v1 result from the unchanged participant facts; a production system should load recorded historical decisions instead of recomputing them.

## Formal policy verification (Lean)

`formal/Policy.lean` proves the modeled decision procedure equivalent to a declarative policy specification, including review precedence, missing-information handling, quote boundaries, and abstract closed-claim preservation. Run `LEAN_BIN=/path/to/lean npm run proof` with Lean 4.35.0. The executable bridge also compares Lean and TypeScript on 33,055 cases.

See `formal/README.md` for theorem statements and the precise scope: this is a proof of the Lean model plus conformance testing, **not a universal proof of the TypeScript application, parser, or database**.
