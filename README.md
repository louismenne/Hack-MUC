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

## Review UI

```bash
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

A React + Tailwind + shadcn/ui reviewer screen in `web/`. It runs the same `src/triage.ts` evaluator in the browser, so recommendations match the CLI exactly.

- **Review queue**: the supplied datasets or an uploaded CSV, filterable by recommendation, review status, and text. Each claim shows the automated recommendation, the rule and its policy text, the supporting facts, highlighted triggering fields, and missing or unreadable inputs. Use `j`/`k` or arrow keys to move through the list.
- **Confirm, override, revert**: an override needs a new recommendation, a reason (at least 10 characters), and a reviewer name. The automated decision is never changed; every action is appended to the audit history with the rule and policy version the reviewer saw.
- **Quality**: correct recommendations, incorrect `routine_processing`, unnecessary `human_review`, and a confusion matrix on labelled cases, shown for the engine and after reviewer overrides. Unlabelled sets are not scored.
- **Audit log**: all reviewer actions, exportable as CSV. **Export results** writes the CLI columns plus `effective_recommendation` and `review_status`.

Reviewer actions persist in the browser's `localStorage` (`hackmuc.*` keys). That keeps the demo dependency-free; it is per browser, not shared, and not a production audit store.

## Deploy

`vercel.json` pins the Vercel build (`npm ci`, `npm run build`, output `dist/`, Vite preset), so dashboard settings cannot change it. The Vercel project belongs to Louis's personal team, which deploys only commits authored by a team member. Commits from other authors show "Deployment was blocked" until Louis redeploys or pushes a commit himself.

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

The pure evaluator in `src/triage.ts` and the batch rules in `src/claims.ts` are shared by the CLI and the review UI, and can back optional eve tools. Review state (`src/review.ts`) and quality metrics (`src/quality.ts`) are pure and tested. A shared server-side audit store and the business case remain future work.

## Verification

Tests cover reviewer override, revert, and confirmation rules, the quality metrics, all 14 labelled development cases, threshold boundaries, missing and unreadable fields, rule precedence, narrative isolation, output serialization, and batch input failures. The 12 unlabelled practice cases are checked for successful processing, not claimed as measured accuracy. Passing this small development set does not establish hidden-set or production performance.

## Policy workspace (rules as JSON in Supabase)

The **Policy** tab now stores policy versions in Supabase and works the same locally and on Vercel. Rules are **data**: one JSON document per version (`policies/policy-v1.rules.json` is v1; format in `docs/policy-rules-schema.md`). The generic engine in `src/policy-engine/` evaluates them deterministically; it does not change when a policy changes. `src/triage.ts` and the CLI are unchanged and need no database.

- **Overview**: active version, rules in priority order as plain text, rendered from the JSON (no AI).
- **History**: every version with status, source, creator, date and change summary; any version can be opened, and two versions can be compared in plain language.
- **Change a draft** manually (numbers, yes/no, lists) or with Claude: upload a policy document (txt, md, pdf), or give an instruction for one rule. Claude only **proposes** rule JSON; it is validated against the schema (one retry) and saved as a **draft**. Nothing becomes active without a human.
- **Review and activate**: diff to the active version, plus an impact analysis over the participant CSV cases: which **open** cases change their recommendation (`needs_recheck`), with old/new result and rule. Closed cases stay frozen. Activation archives the previous version atomically (`activate_policy_version`). Active and archived versions are immutable.

Setup: run `supabase/migrations/20261107120000_policy_versions.sql` once in the Supabase SQL Editor. Server-side env vars (never `VITE_`-prefixed, never in the browser): `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (the `sb_secret_…` key), optional `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`). Without `ANTHROPIC_API_KEY` the AI buttons show "KI nicht verfügbar, bitte manuell bearbeiten." and everything else works.

Run locally with `npm run dev`: a Vite middleware serves the same functions that Vercel runs (`GET/POST /api/policy`, `POST /api/policy-ai`), reading `.env.local`.

**Vercel Functions are plain JavaScript on purpose.** Vercel's TypeScript compiler for functions needs `ts.sys`, which TypeScript 7 (this repo) no longer provides, so TypeScript files in `api/` fail to build. The functions are written in `src/policy-api/functions/` and compiled by esbuild to `api/*.js` (`npm run build:api`, also run by `npm run build`). The generated files are committed; `tests/api-bundle.test.ts` fails if they are stale. Preview and Production deployments need the env vars above set for their environments.

There is **no authentication**: anyone who can open the deployed URL can create drafts, activate versions and (with an API key) trigger AI calls. Names are labels only.

> The section below describes the earlier local SQLite prototype (`src/server/`). The Policy tab no longer uses it; it is kept until the team agrees to remove it.

## Local policy management

Requires Node.js **22.13+** (built-in SQLite). Run `npm run dev` to start the Vite UI and the local policy API together. Open the printed Vite URL and select **Policy**. The API binds only to `127.0.0.1:3002`; Vite proxies `/api` to it.

1. Enter the policy owner's name and adjust the quote limit, review repair types, and required documents.
2. Save a new immutable draft. Existing drafts can be reopened; saving edits creates another version.
3. Preview the saved version against all 26 participant cases.
4. Activate after reviewing the impact. Activation rejects previews made against an older active version and runs in a database transaction.

Policies, decision snapshots, activation history, and recheck flags persist in `.local/policies.sqlite` (ignored by Git). The initial policy is the supplied v1. Later versions are user-authored configurations, **not an asserted official v2 policy**. Policy versions retain the creator, activation owner, and timestamps. Closed decisions are preserved byte-for-byte. Affected open claims receive new automated recommendations and a recheck flag; activation does not finalize a claim. Existing unresolved recheck flags survive subsequent activations.

The Policy workspace evaluates the participant cases stored in SQLite. The existing Review queue, Quality view, CSV exports, uploads, and browser-local reviewer overrides remain the **v1 baseline** and are not silently migrated. Recheck completion and integrating reviewer overrides into the database are not implemented in this change. No v2 accuracy score is claimed without v2 ground-truth labels.

API routes:

- `GET /api/policies`: versions, active policy, activation history with saved impact reports.
- `GET /api/claims`: facts, original v1 decisions, current decisions, recheck flags.
- `POST /api/policies`: `{ "actor": "Name", "config": { ... } }` creates a validated draft.
- `POST /api/policies/:id/preview`: `{}` returns impact and a preview token.
- `POST /api/policies/:id/activate`: `{ "actor": "Name", "token": "preview-token" }` activates that reviewed draft.

This is a **local development backend**, not a hosted production service. Names are audit labels, not authenticated identities. The existing Vercel deployment is static and does not run this SQLite API; hosted use needs an authenticated backend and persistent hosted database. The UI reports API unavailability instead of pretending to save changes. Keep the API on loopback until that work is done.
