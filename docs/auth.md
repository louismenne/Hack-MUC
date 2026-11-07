# Supabase authentication

The React app requires email/password sign-in before mounting the claims UI. `@supabase/supabase-js` restores and refreshes sessions, accepts invitation/password-recovery links, and signs users out. Policy requests send the access token as a Bearer header.

Both `/api/policy` and `/api/policy-ai` validate the token with Supabase `auth.getUser()` on every request, before reading data or invoking Claude. Missing/invalid sessions receive 401. Accounts without a confirmed email and a server-recorded invitation (or `app_metadata.hack_muc_access = true`, set only by an administrator) receive 403. Anonymous accounts are rejected. User-editable metadata never grants access. Roles come exclusively from server-managed `app_metadata.hack_muc_role`; missing or unknown roles grant read-only access. Policy mutations and Claude drafting require Policy Manager or Admin. Role administration requires Admin. Permission failures return 403 without signing out an otherwise valid session.

The server records the authenticated user UUID as `createdBy`; callers cannot impersonate another creator. Reviewer names in the UI come from the signed-in account. Review events now persist in the append-only Supabase audit log. Reviewer identity/time and permissions are server-verified; the automated decision snapshot still comes from the browser demo engine. CSV uploads remain browser-local data scoped by user UUID. Previous unscoped demo data is not imported into a user's account. Signing out unmounts the app and removes the active session; local per-user demo data remains on that browser.

## Configuration

The checked-in `config/supabase-public.json` contains only the **publishable** key and public URL of `hack-muc` (`ipkwqhuwdsvsjzgltsom`). A publishable key is intended for browser use and cannot bypass RLS. No secret/service-role key is bundled. The existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` still power the policy repository.

For a different project, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` before building, and matching `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` on the server. Never put secret/service-role keys in `VITE_*` variables. The server refuses to combine another project's URL with the bundled public key.

## Supabase configuration and first invitations

After admin access was granted on 7 November 2026, the Auth configuration was applied and verified: public signup disabled, canonical site URL and local redirects configured, minimum password length 12. A fresh config comparison reported no differences. The public Auth settings endpoint confirmed email sign-in enabled and anonymous sign-in disabled. Invitations were sent to Maximilian and Louis for the local app. Both accounts have verified Admin roles. A complete authenticated browser walkthrough has not yet been verified.

In [Supabase Authentication](https://supabase.com/dashboard/project/ipkwqhuwdsvsjzgltsom/auth/users):

1. **Configured:** disable **Allow new users to sign up**. This prevents unwanted registration at the Auth service; the app separately rejects non-invited accounts even while signup remains enabled.
2. **Configured:** set **Site URL** to `https://hackmuc.vercel.app`.
3. **Configured:** allow redirect URLs `https://hackmuc.vercel.app`, `http://localhost:5173`, and `http://localhost:5174`. Preserve existing project preview URLs if previews are used.
4. **Configured:** set minimum password length to 12 (the password-setup form enforces this too).
5. Use **Invite user** for each team email. Invitations must return to a deployment containing this auth implementation. The invite link opens password setup; future visits use email/password. The login page also provides password recovery. Do not enable anonymous sign-in.
6. If the default mail service restricts invitation recipients, configure SMTP or use an allowed team email. Invitations for Maximilian and Louis have already been sent.

An administrator-created account without an invitation needs `app_metadata.hack_muc_access: true` and a confirmed email. Grant this via the Supabase Admin API or dashboard's administrative user tools, never via the browser client's editable user metadata. The authorization check reads current metadata from the Auth server. To remove access, revoke the grant/invitation as appropriate or ban the account using Supabase's admin controls; sign out its sessions as well.

## Local development and verification

`npm run dev` runs Vite and its protected API middleware. It no longer starts the unauthenticated legacy SQLite server; `npm run dev:api` is a separate, opt-in localhost-only legacy demo and is not used by the app.

Run `npm run build:api`, `npm run typecheck`, `npm test`, and `npm run build`. Auth tests cover missing/invalid tokens, invited/admin-granted users, public signup rejection, anonymous/unconfirmed accounts, user-metadata forgery, and creator impersonation. Verify that anonymous requests to `/api/policy` and `/api/policy-ai` return 401 after deployment.

Full invitation/password-recovery delivery and a real authenticated UI session require the owner setup and an invited account. Public CSV examples and policy JSON shipped in the static bundle are demo assets, not confidential documents.

## Team roles

| Role | Upload claims | Review / override | Edit, draft and activate policy | Assign roles |
| --- | --- | --- | --- | --- |
| Claims Handler (`claims_handler`) | Yes | No | No | No |
| Reviewer (`reviewer`) | Yes | Yes | No | No |
| Policy Manager (`policy_manager`) | No | No | Yes | No |
| Admin (`admin`) | Yes | Yes | Yes | Yes |

All invited members can read the demo claims, policy versions, comparisons and reports. These are internal team roles, not a customer/claimant portal: there is no claim ownership or customer data isolation. Unassigned users have read-only access until an Admin assigns a role.

Admins use the **Team** tab. `GET /api/policy?view=team` lists invited members and `POST /api/policy` with `action: set_role`, `userId`, and `role` updates their server-managed app metadata while preserving other keys. Self-role changes are rejected. Supabase project administrators can bootstrap/recover an Admin via `auth.admin.updateUserById(id, { app_metadata: { hack_muc_role: 'admin' } })` from a trusted server. Role names are validated; neither request-supplied roles nor user_metadata grant permissions.

Policy and team authorization always reads current user metadata from Supabase Auth, so an old JWT does not retain policy-management rights after demotion. The UI refreshes its role display when the window regains focus or the user signs in again. The claim form saves to Supabase under RLS, and review writes use a role-checked database function. The sample CSV queue remains separate from submitted claims. See docs/claims.md and docs/audit.md. Role changes do not yet have a dedicated application audit log.
