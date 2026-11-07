import { createClient } from '@supabase/supabase-js';
import config from '../../../config/supabase-public.json';

// Capture invitation/recovery redirects before the SDK consumes the URL fragment.
export const passwordSetupRequested = ['invite', 'recovery'].includes(new URLSearchParams(window.location.hash.slice(1)).get('type') ?? '');

// A publishable key identifies the project; it grants no privileged database access.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || config.url,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || config.publishableKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export const AUTH_REJECTED_EVENT = 'hackmuc:auth-rejected';

export async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.dispatchEvent(new CustomEvent(AUTH_REJECTED_EVENT, { detail: 401 }));
    throw new Error('Please sign in again.');
  }
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent(AUTH_REJECTED_EVENT, { detail: response.status }));
  }
  return response;
}
