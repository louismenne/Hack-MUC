# Team LLM Taktile case

**Team LLM · Taktile track · thinc! Munich · 7–8 November 2026**

A motor-claims assessment app with deterministic policy rules, human review, and an audit trail. Each claim receives one recommendation: **routine processing**, **request information**, or **human review**. It never approves payment.

[Open the demo](https://hackmuc.vercel.app)

## Demo accounts

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Claims Handler | `demo.claims-handler@hackmuc.example.com` | `Demo-ndY7kG-cYzVii3CU!7a` | Submit claims; view own submissions |
| Reviewer | `demo.reviewer@hackmuc.example.com` | `Demo-b6g5TeGZzjSb_CaF!7a` | Review queue only; confirm, override, and reject |
| Policy Manager | `demo.policy-manager@hackmuc.example.com` | `Demo-4YtdQlm-NJjF14ea!7a` | View claims; create, edit, and activate policies |
| Admin | `demo.admin@hackmuc.example.com` | `Demo-Iyr6Pp4FnccUdvwv!7a` | All app permissions, including team-role management |

Shared hackathon accounts; passwords are case-sensitive. These email addresses have no inbox, so password recovery is unavailable. Admin has full app access. Disable the demo accounts after judging.

## Try it

- **File a claim:** sign in as Claims Handler, open **File a claim**, and submit facts and attachments. **My claims** shows your submissions.
- **Review a claim:** sign in as Reviewer and open **Review queue**. Inspect a submitted claim, record an override and reason, then check its audit history.
- **Test a CSV:** sign in as Admin, open **CSV examples**, upload the file, and click **Export results**. CSV examples are read-only; they cannot be overridden.
- **Change policy:** sign in as Policy Manager or Admin. Create a draft, inspect its impact, and explicitly activate it. Optional AI assistance creates drafts only.

## Run locally

Requires Node.js **22.13+** and npm.

```bash
npm ci
npm run dev        # http://localhost:5173
```

The web app uses Supabase Auth and storage. Configure `.env.local` with server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; add `ANTHROPIC_API_KEY` only for AI policy drafting. For a new Supabase project, follow [authentication setup](docs/auth.md) and apply `supabase/migrations/` in filename order.

The batch CLI works without Supabase or AI keys:

```bash
npm run triage -- --input data/unlabelled_practice_cases.csv --output results.csv
```

Replace the input path with the judges’ CSV. Output files must not already exist. Browser uploads are limited to 2 MB; use the CLI for larger files.

## Judging contract

The CLI and browser export always use the **official v1/v2 policies**, independently of workspace policy edits or reviewer overrides:

```text
case_id,recommendation_v1,recommendation_v2,needs_recheck,rule_v1,rule_v2,explanation
```

- **Open claims:** evaluate both versions; recheck when the recommendation changes.
- **Closed claims:** retain the v1 recommendation and rule; `needs_recheck=False`. CSV history is reconstructed from supplied facts; submitted claims retain saved decisions.
- **Missing facts:** remain unknown. Narrative text and expected-answer labels never override structured inputs.
- **Invalid batches:** empty inputs, missing/duplicate case IDs, duplicate headers, and malformed CSVs are rejected.

Official v2 lowers the review threshold from **€1,500 to €1,200** and requires human review for EV high-voltage battery work. Exactly €1,200 remains within the amount limit.

The participant pack contains **14 labelled development cases** and **12 unlabelled practice cases**. V2 expectations are team-derived. Development results do not establish hidden-test accuracy; unlabelled predictions are never treated as ground truth.

## Checks and deployment

```bash
npm test
npm run typecheck
npm run build
```

Vercel deploys through the repository’s Git integration. The build generates the API bundles and web assets. See [deployment notes](docs/deployment.md).

## Further details

- [Authentication and roles](docs/auth.md)
- [Claims, attachments, and saved decisions](docs/claims.md)
- [Audit history](docs/audit.md)
- [Quality monitoring and investigations](docs/quality-monitoring.md)
- [Policy JSON format](docs/policy-rules-schema.md)
- [Savings assumptions](docs/savings-model.md)
- [Lean verification and its limits](formal/README.md)

Core rules live in `src/policy-engine/`, APIs in `src/policy-api/`, intake in `src/claim-intake/`, and the React app in `web/`. Original policy documents and CSVs are in `policies/` and `data/`.

**Current limits:** document extraction is not implemented; savings are estimates; uploaded CSVs remain browser-local. Submitted claims, decisions, and audit events persist in Supabase.
