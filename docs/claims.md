# Claims storage

`public.claims` is live in the linked Supabase project. Apply the `20261107203000_claims.sql` and `20261107203500_claims_form_alignment.sql` migrations, in that order, for another database. They were applied to the linked project via `supabase db query --remote --file … --yes`; they are not registered in CLI migration history by that command.

The schema matches the existing `/claim` form's contact and fact columns: claimant name/email, policy number, incident date, license plate, summary, claim/repair type, quote in EUR, claimant coverage statement and nullable boolean answers. The database generates `id`, `case_id`, `submitted_by`, `received_at`, `case_status = open`, and `is_test = false`. Unknown facts remain null. The claimant's coverage statement is separate from verified `policy_active_on_incident`.

Authenticated inserts must omit system columns and internal checks (`policy_active_on_incident`, `duplicate_flag`, `evidence_conflict`), even when the dry-run payload includes them as null. Insert only the form field columns listed in `src/claim-intake/fields.ts`. Use the signed-in user's Supabase client, never expose the service key. Column privileges prevent clients from supplying forged ownership, timestamps, statuses or internal verification flags.

Claims Handlers can submit and read only their own records. Reviewers and Admins can submit and read all records. Policy Managers can read all records but cannot submit. Unknown/unassigned roles and anonymous callers have no access. Roles are read from current Auth metadata instead of stale JWT claims. No client update/delete permission is granted yet.

The existing `/claim` UI is unchanged and still uses its dry-run adapter. Its `config.ts` table and bucket remain null. Connecting that adapter, authenticated page access, document storage and persisted review decisions are not implemented by these schema migrations. No attached files are stored in the claims table.

Database integration checks: `supabase db query --remote --file tests/sql/claims-rls.sql --yes`. Fixtures run in a rolled-back transaction and cover allowed insert/read, ownership isolation, forged system fields, future dates, unauthorized mutations, role demotion and anonymous access.
