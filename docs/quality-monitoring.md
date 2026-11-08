# Quality monitoring

The `/quality-monitoring` screen connects server-recorded review activity to human investigations and the existing policy approval workflow.

## Workflow

1. A Reviewer, Policy Manager or Admin opens **Quality monitoring**.
2. Choose a 7/30/90-day review window, a minimum reviewed-decision count (default 5), and an override threshold (default 30%). These are exploratory screen settings, not scheduled alerts.
3. Inspect the review evidence for a policy/rule group and open an investigation. Up to 100 displayed review records are saved as an immutable evidence snapshot.
4. Save findings and the proposed change. Investigations persist in Supabase and are shared with staff. Updates use a revision check to reject stale saves.
5. A Policy Manager or Admin selects **Prepare policy draft**. The server copies the active policy, links the investigation atomically, and records the handoff in the audit log. Repeated requests reuse the linked version. If a draft is discarded, a replacement can be created.
6. Edit the rules manually or use the existing AI proposal action in the draft editor. The initial copy intentionally has no rule changes. Inspect the differences and live impact, then explicitly activate through the existing confirmation dialog. The investigation is linked from the policy version and remains available after activation.
7. Return to monitoring to close the investigation or continue tracking the issue. Activation does not automatically close it.

## Metric interpretation

Only `stored` review events with `decisionSource=server_engine` are included. Synthetic/client-snapshot and CSV-example events are excluded. The latest event by audit sequence is selected for each saved decision before filtering by its review date. Repeated review clicks do not inflate the denominator; reverted overrides no longer count. Rejections are reported separately and remain in the reviewed-decision denominator.

An override means that the latest non-rejected recommendation differs from the engine recommendation. The rate is overridden / reviewed saved decisions within a policy-version/rule group. One claim evaluated under several policies can contribute separate decisions. These are review-disagreement rates, not population accuracy or confirmed errors. Groups below the minimum count remain visible as small samples.

## Deployment

Apply `supabase/migrations/20261108040000_quality_monitoring.sql` after the earlier migrations **before deploying the updated API**. It adds `quality_investigations`, staff-only read access, audited RPCs, and a unique investigation link on policy versions. The service-only policy write wrapper retains the owner permission check and existing activation/revision guards.

No Anthropic key is required for monitoring, investigation storage, manual drafting or approval. The existing optional AI assistance requires the server-side key.

## Validation and remaining scope

- Unit tests cover aggregation, reversions, thresholds, time windows, policy separation and rejected decisions.
- API tests cover linked draft creation and input validation. Role tests cover navigation and mutation boundaries.
- `tests/sql/quality-monitoring.sql` checks evidence integrity, claimant denial, reviewer/owner separation, stale saves, duplicate draft prevention, audit linkage and guarded owner activation. Its fixtures roll back.
- Browser verification uses deterministic mocked network data; SQL integration runs against an isolated PostgreSQL database. These checks do not verify the shared Supabase deployment.

Random sample assignment, verified final-outcome collection, scheduled alerts and historical snapshot replay are not implemented here. The existing impact preview evaluates stored claims and preserves closed decisions; it must not be presented as outcome-labelled historical accuracy testing.
