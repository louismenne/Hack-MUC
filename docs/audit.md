# Persistent audit log

`public.audit_log` records new claim inserts/updates/deletes, policy version inserts/updates/deletes, and review actions. The migration is `20261107210000_audit_log.sql` and has been applied to the linked Supabase project. Historical changes before this migration are not backfilled.

Rows contain a UUID, monotonic sequence, server timestamp, actor UUID/label, action, entity type/ID, and JSON details. Claim events store identifiers and status without copying claimant contact details. Policy events preserve before/after version records. Database triggers write change events in the same transaction; an audit failure rolls back the business change.

The browser has SELECT access subject to RLS, and no direct INSERT/UPDATE/DELETE access. A trigger also rejects updates and deletes by privileged callers. Reviewers, Policy Managers and Admins can read the log. Claims Handlers can only read their own claim activity. Database administrators can still administer the schema; this is not external tamper-proof archival storage.

Reviewers/Admins append review events through `record_review` using a saved `decisionId`, action, reason, requested override and `expectedReviewId`. The database derives actor, time, claim, policy, rule, automated result and previous result. It locks policy changes and claim reviews, rejects changed facts, inactive policy versions, closed claims, stale review history, invalid transitions and short override reasons. Client-supplied demo verdicts can no longer be reviewed. Old demo history remains in the log; new reviews have `decisionSource: server_engine`.

`claim_decisions` stores immutable evaluations and input snapshots. Evaluation insertion and its audit event are one transaction. Repeated evaluation of the same claim/policy/input returns the same decision. Claims Handlers can read their own decisions and review events; other roles follow the claims table's read rules. The Dashboard displays submitted-claim reviews and exports them to CSV.

Policy writes use `write_policy_as`, a service-only RPC passed the API-authenticated actor. It rechecks current role and identifies that actor in policy triggers. Activation checks the expected active policy under the same lock used by reviews. Team role changes use an atomic service-only `set_team_role` RPC that preserves other metadata and appends the actor, previous role and next role. Historical system-attributed events are not rewritten. Login activity remains in Supabase Auth logs, not this application log.

Migration: `20261107220000_claim_decisions.sql` (after the original audit migration). Live SQL checks in `tests/sql/claim-decisions.sql`, `tests/sql/audit-log.sql` and `tests/sql/claims-rls.sql` roll back their fixtures. They cover ownership, privileged RPC access, forged review fields, policy changes, stale/closed decisions, immutable snapshots, actor attribution and role auditing.
