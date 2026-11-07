import { createClient } from '@supabase/supabase-js';
import { isRole, roleOf } from '../roles.js';
import { ApiError } from './handlers.js';
import type { AuthUser } from './auth.js';

export function createTeamAdmin(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new ApiError(503, 'Supabase admin configuration is missing.');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
}
export async function listTeam(admin = createTeamAdmin()) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 100 });
    if (error) throw new ApiError(502, 'Could not load team members.');
    users.push(...data.users.filter(u => u.invited_at || u.app_metadata.hack_muc_access === true).map(u => ({ id: u.id, email: u.email, role: roleOf(u) })));
    if (data.users.length < 100) break;
  }
  return { status: 200, body: { users } };
}
export async function setTeamRole(actor: AuthUser, input: unknown, admin = createTeamAdmin()) {
  const body = input as { userId?: unknown; role?: unknown } | null;
  if (!body || typeof body.userId !== 'string' || !isRole(body.role)) throw new ApiError(400, 'A user ID and valid role are required.');
  // Prevent accidental self-demotion. Project admins can recover roles via Supabase.
  if (body.userId === actor.id) throw new ApiError(400, 'You cannot change your own role.');
  const { data, error } = await admin.getUserById(body.userId);
  if (error || !data.user) throw new ApiError(404, 'Team member not found.');
  const target = data.user;
  if (!target.invited_at && target.app_metadata.hack_muc_access !== true) throw new ApiError(403, 'Only invited team members can be assigned a role.');
  const updated = await admin.updateUserById(target.id, { app_metadata: { ...target.app_metadata, hack_muc_role: body.role } });
  if (updated.error) throw new ApiError(502, 'Could not update the role.');
  return { status: 200, body: { user: { id: target.id, email: target.email, role: body.role } } };
}
