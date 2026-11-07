import { createClient, type User } from '@supabase/supabase-js';
import { ApiError } from './handlers.js';
import publicConfig from '../../config/supabase-public.json' with { type: 'json' };

export type AuthUser = Pick<User, 'id' | 'email' | 'email_confirmed_at' | 'is_anonymous' | 'invited_at' | 'app_metadata'>;
export type Authenticate = (request: Request) => Promise<AuthUser>;

/** Invitation/admin grants only. Never authorize with user-editable user_metadata. */
export function requireTeamMember(user: AuthUser): AuthUser {
  if (user.is_anonymous || !user.email_confirmed_at || (!user.invited_at && user.app_metadata.hack_muc_access !== true)) {
    throw new ApiError(403, 'This account has not been invited to the team. Ask a project administrator for access.');
  }
  return user;
}

export function createAuthenticator(env: Record<string, string | undefined> = process.env): Authenticate {
  return async request => {
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) throw new ApiError(401, 'Please sign in.');
    const url = env.SUPABASE_URL || publicConfig.url;
    const key = env.SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey;
    if (url !== publicConfig.url && !env.SUPABASE_PUBLISHABLE_KEY) throw new ApiError(503, 'Auth configuration does not match the Supabase project.');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    // Validates with the Auth server, including current app metadata; never trust a decoded JWT alone.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new ApiError(401, 'Your session is invalid or expired. Please sign in again.');
    return requireTeamMember(data.user);
  };
}
