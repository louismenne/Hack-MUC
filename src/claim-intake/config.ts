/** Private Supabase storage. Set claimsTable to null only for an explicit dry-run test. */
export const claimIntakeConfig: { claimsTable: string | null; claimsBucket: string | null } = {
  claimsTable: 'claims',
  claimsBucket: 'claim-documents',
};
