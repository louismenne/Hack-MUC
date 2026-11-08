/** Shared UI permissions. The API evaluates these against server-verified app_metadata. */
export const roles = ['claims_handler', 'reviewer', 'policy_manager', 'admin'] as const;
export type Role = typeof roles[number];
export const roleLabels: Record<Role, string> = { claims_handler: 'Claims Handler', reviewer: 'Reviewer', policy_manager: 'Policy Manager', admin: 'Admin' };
export function isRole(value: unknown): value is Role { return roles.some(role => role === value); }
export function roleOf(user: { app_metadata: Record<string, unknown> }): Role | null {
  const role = user.app_metadata.hack_muc_role;
  return isRole(role) ? role : null;
}
export function permissions(user: { app_metadata: Record<string, unknown> }) {
  const role = roleOf(user);
  return { review: role === 'reviewer' || role === 'admin', policy: role === 'policy_manager' || role === 'admin', team: role === 'admin', upload: role === 'claims_handler' || role === 'reviewer' || role === 'admin' };
}

/** Page visibility and direct-route access use the same role boundary. */
export const appPages = ['queue', 'overview', 'quality', 'policy', 'examples', 'example-quality', 'team'] as const;
export type AppPage = typeof appPages[number];
const pagesByRole: Record<Role, readonly AppPage[]> = {
  claims_handler: ['queue'],
  reviewer: ['queue', 'overview'],
  policy_manager: ['queue', 'overview', 'quality', 'policy', 'examples', 'example-quality'],
  admin: appPages,
};
export function canAccessPage(role: Role | null, page: AppPage): boolean {
  return role !== null && pagesByRole[role].includes(page);
}
