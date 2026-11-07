# Persistent audit log

`public.audit_log` records new claim inserts/updates/deletes, policy version inserts/updates/deletes, and review actions. The migration is `20261107210000_audit_log.sql` and has been applied to the linked Supabase project. Historical changes before this migration are not backfilled.

Rows contain a UUID, monotonic sequence, server timestamp, actor UUID/label, action, entity type/ID, and JSON details. Claim events store identifiers and status without copying claimant contact details. Policy events preserve before/after version records. Database triggers write change events in the same transaction; an audit failure rolls back the business change.

The browser has SELECT access subject to RLS, and no direct INSERT/UPDATE/DELETE access. A trigger also rejects updates and deletes by privileged callers. Reviewers, Policy Managers and Admins can read the log. Claims Handlers can only read their own claim activity. Database administrators can still administer the schema; this is not external tamper-proof archival storage.

Reviewers/Admins append review events through `record_review`. It derives actor identity from `auth.uid()`, stamps the time and validates allowed transitions and reasons. An advisory transaction lock serializes reviews of the same dataset/case/policy and rejects stale previous outcomes. Uploaded demo dataset IDs are namespaced by user. The audit UI is append-only and has no Reset control. The review queue loads persisted events and refreshes on focus or manually. Existing browser-local events are not imported as trusted history.

The current review queue still evaluates sample/imported CSV data in the browser. Those review snapshots are marked `decisionSource: client_snapshot`: the database verifies the reviewer and transition, not the automated verdict or underlying CSV facts. Actual submitted claims are stored separately; integrating them into the shared review queue is a separate change.

Policy API writes use the service key, so their audit actor is explicitly `Server / database` rather than an invented human actor. The recorded version retains `createdBy`, but that identifies the creator, not necessarily the editor/activator. Team-role changes and logins are not yet in this application audit table.

Checks: `supabase db query --remote --file tests/sql/audit-log.sql --yes`. The transaction rolls back fixtures and verifies automatic claim/policy events, reviewer identity/time, RLS, denied direct writes, immutable records, reason/transition validation, stale-review rejection and upload scope isolation.
