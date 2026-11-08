/** Capture callback intent/errors before Supabase consumes the URL fragment. Never expose tokens. */
export function authRedirectState(hash: string, search = '') {
  const params = new URLSearchParams(search);
  new URLSearchParams(hash.replace(/^#/, '')).forEach((value, key) => params.set(key, value));
  const passwordSetup = ['invite', 'recovery'].includes(params.get('type') ?? '');
  const failed = ['error', 'error_code', 'error_description'].some(key => params.has(key));
  const error = failed
    ? params.get('error_code') === 'otp_expired'
      ? 'This invitation or password-reset link has expired or has already been used. Ask an administrator for a fresh link.'
      : 'This sign-in link could not be verified. Ask an administrator for a fresh link.'
    : '';
  return { passwordSetup, error };
}

/** Fresh sign-ins have a role-specific start page; restored sessions keep their current URL. */
export function loginLandingPath(role: import('./roles.js').Role | null): string | null {
  if (role === 'claims_handler') return '/claim';
  if (role === 'reviewer' || role === 'policy_manager' || role === 'admin') return '/overview';
  return null;
}
