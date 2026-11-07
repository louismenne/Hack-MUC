# Claims storage

`public.claims` is live in the linked Supabase project. Apply the `20261107203000_claims.sql` and `20261107203500_claims_form_alignment.sql` migrations, in that order, for another database. They were applied to the linked project via `supabase db query --remote --file … --yes`; they are not registered in CLI migration history by that command.

The schema matches the existing `/claim` form's contact and fact columns: claimant name/email, policy number, incident date, license plate, summary, claim/repair type, quote in EUR, claimant coverage statement and nullable boolean answers. The database generates `id`, `case_id`, `submitted_by`, `received_at`, `case_status = open`, and `is_test = false`. Unknown facts remain null. The claimant's coverage statement is separate from verified `policy_active_on_incident`.

Authenticated inserts must omit system columns and internal checks (`policy_active_on_incident`, `duplicate_flag`, `evidence_conflict`), even when the dry-run payload includes them as null. Insert only the form field columns listed in `src/claim-intake/fields.ts`. Use the signed-in user's Supabase client, never expose the service key. Column privileges prevent clients from supplying forged ownership, timestamps, statuses or internal verification flags.

Claims Handlers can submit and read only their own records. Reviewers and Admins can submit and read all records. Policy Managers can read all records but cannot submit. Unknown/unassigned roles and anonymous callers have no access. Roles are read from current Auth metadata instead of stale JWT claims. No client update/delete permission is granted yet.

The existing `/claim` page now requires invited-team sign-in and saves through the browser Supabase client, with RLS enforcing access. `config.ts` enables `claims` and the private `claim-documents` bucket. The adapter whitelists claimant columns, uploads files, inserts the claim with attachment metadata, then returns server-generated values. Confirmation appears only after a successful insert.

Apply `20261107204500_claim_attachments.sql` after the two claims migrations. Attachments are limited to 10 PDF/image files, 10 MB each. Object paths are generated under the authenticated user ID; filenames are metadata, not paths. Owners can read their uploads; review/policy/admin roles can read documents linked to visible claims. No public bucket or public URLs are used. On submission failure, the adapter attempts to clean up uploads. RLS protects documents already linked to saved claims from client deletion. Interrupted requests can leave unlinked files; retention cleanup is not automated yet. A lost response after a successful insert can leave the user unsure whether submission succeeded; submissions are not yet idempotent.

Automatic extraction remains a stub. Saved submissions are not yet connected to the sample CSV review queue or persisted review decisions. No verdict is inferred from claimant statements.

Database integration checks: `supabase db query --remote --file tests/sql/claims-rls.sql --yes`. Fixtures run in a rolled-back transaction and cover allowed insert/read, ownership isolation, forged system fields, future dates, unauthorized mutations, role demotion and anonymous access.

Live verification used a temporary authenticated Claims Handler account: submitted a claim with a PDF, checked generated ownership and protected coverage fields, read the row and private document, then verified demotion blocked further writes. All test records, files and the temporary account were removed.
