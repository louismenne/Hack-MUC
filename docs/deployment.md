# Production deployment

The project uses the existing Vercel Git integration for `louismenne/Hack-MUC`, targeting **hackmuc** in **louismennes-projects** at https://hackmuc.vercel.app. There is no GitHub Actions deployment workflow.

`vercel.json` configures the build and output directory. Before deployment, run `npm run typecheck`, `npm test`, and `npm run build`.

Vercel Production needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. `ANTHROPIC_API_KEY` is optional and enables AI drafting. Keep secret keys server-side; never commit environment files or add secrets to `VITE_*` variables.

A successful Git push does not guarantee a successful deployment. Vercel Hobby restricts collaboration for private repositories and requires the commit author to be the Hobby owner. Resolve author/team access in Vercel before expecting another contributor's push to deploy. See [Vercel collaboration requirements](https://vercel.com/docs/deployments/troubleshoot-project-collaboration).

After deployment, check the sign-in screen and verify anonymous policy API requests return 401. Then verify an invited account can sign in and use its assigned role. Database migrations are separate from deployment.


## Claim lifecycle and preview revisions

On a database that has not received the claim follow-up and review fixes, apply these migrations in order:

1. `supabase/migrations/20261107230000_claim_followup.sql` (owner-scoped updates to open claims).
2. `supabase/migrations/20261108010000_review_reject.sql` (review rejection action).
3. `supabase/migrations/20261108020000_review_lifecycle.sql` (claim and draft revisions, terminal decisions, final rejection).
4. `supabase/migrations/20261108030000_strict_policy_activation.sql` (remove temporary compatibility behavior and require preview revisions).

Apply the database migration before deploying the matching API and frontend. The new API reads revision columns and uses the service-only `write_policy_as` RPC, which requires the draft revision returned by the impact preview when activating. Reload any already-open policy editor after deployment.

Activation now always requires `expected_revision`. The temporary compatibility behavior and duplicate RPC are removed by the strict-activation migration. Redeploy the matching API and frontend together; an old deployment cannot activate policies until updated. Existing editors should reload and refresh their impact preview.

Applied to the linked `hack-muc` project on 8 November 2026: follow-up and lifecycle migrations; rejection was already installed. The lifecycle backfill closed one previously rejected claim. Strict activation was subsequently applied at the user's request. Column reads, repository reads, and RPC privileges were verified. An authenticated production-browser walkthrough remains unverified.

The project's earlier schema was installed outside CLI migration tracking; the remote migration list was empty. Do not blindly run `supabase db push` against this existing database. Check actual schema state and reconcile migration history before adopting CLI-managed migrations. These SQL files are not all safe to rerun.

The lifecycle migration closes previously rejected open claims and links them to their rejection decision. It preserves unchanged pre-migration decisions and reviews. New edits receive new revisions, including when facts return to an earlier value. Rejection closes the claim atomically; closed claims cannot be supplemented or re-evaluated.

Follow-up links use `/claim?claim=<uuid>` and load only the current user's open claims. Saved answers and existing attachments are restored from the database; concurrent changes require reloading before saving.

Run `tests/sql/review-lifecycle.sql` along with the existing SQL checks on a disposable database after applying all migrations. Its fixtures roll back. Run `npm run typecheck`, `npm test`, and `npm run build` for API and UI validation.
