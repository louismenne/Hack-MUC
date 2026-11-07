/**
 * Where claims are stored. Both are null for now: the form runs as a DRY RUN and makes no network call.
 *
 * To switch to Supabase later: set `claimsTable` (name of the table) and `claimsBucket` (name of the storage
 * bucket for the attached documents), then implement the TODO in adapter.ts. Nothing else needs to change.
 */
export const claimIntakeConfig: { claimsTable: string | null; claimsBucket: string | null } = {
  claimsTable: null,
  claimsBucket: null,
};
