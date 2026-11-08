import { ClaimHeroMedia, ClaimRuler } from '@/components/claim-design';
import { TaktileLogo } from '@/components/taktile-logo';
import { clearReloadCache } from './reload-cache';
import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { AUTH_REJECTED_EVENT, authRedirectError, passwordSetupRequested, supabase } from './supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Context = createContext<User | null>(null);
export function useAuthUser(): User {
  const user = useContext(Context);
  if (!user) throw new Error('Sign in is required.');
  return user;
}

const CustomerFacing = createContext(false);
export function AuthProvider({ children, customerFacing = false }: { children: ReactNode; customerFacing?: boolean }) {
  return <CustomerFacing.Provider value={customerFacing}><AuthSession>{children}</AuthSession></CustomerFacing.Provider>;
}

function AuthSession({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(passwordSetupRequested);
  const [error, setError] = useState(authRedirectError);

  useEffect(() => {
    let alive = true;
    let revision = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'INITIAL_SESSION') revision++;
      if (!alive) return;
      setUser(session?.user ?? null);
      if (event !== 'INITIAL_SESSION') setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { clearReloadCache(); setRecovery(false); }
      if (event === 'SIGNED_IN') setError('');
    });
    const initialRevision = revision;
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive || revision !== initialRevision) return;
      // Verify current roles before restoring any cached claim data on reload.
      const verified = data.session ? await supabase.auth.getUser() : null;
      if (!alive || revision !== initialRevision) return;
      if (verified?.error) clearReloadCache();
      setUser(verified?.data.user ?? null);
      setLoading(false);
      if (error) setError('Unable to restore your session. Please sign in again.');
    }).catch(() => {
      if (!alive || revision !== initialRevision) return;
      clearReloadCache();
      setUser(null);
      setLoading(false);
      setError('Unable to restore your session. Please sign in again.');
    });
    // Refresh role display on focus; backend always checks fresh metadata independently.
    const refreshUser = () => {
      const startedAt = revision;
      void supabase.auth.getUser().then(({ data }) => { if (alive && revision === startedAt && data.user) setUser(data.user); }).catch(() => {});
    };
    window.addEventListener('focus', refreshUser);
    const rejected = (event: Event) => {
      setError((event as CustomEvent).detail === 403 ? 'Your account does not have team access.' : 'Your session expired. Please sign in again.');
      clearReloadCache();
      setUser(null);
      // Local sign-out also clears persisted session state, without blocking the UI.
      void supabase.auth.signOut({ scope: 'local' });
    };
    window.addEventListener(AUTH_REJECTED_EVENT, rejected);
    return () => { alive = false; subscription.unsubscribe(); window.removeEventListener('focus', refreshUser); window.removeEventListener(AUTH_REJECTED_EVENT, rejected); };
  }, []);

  if (loading) return <div className="grid min-h-svh place-items-center" role="status">Restoring your session…</div>;
  if (!user) return <SignIn initialError={error || (recovery ? 'The password-reset link did not establish a session. Open a fresh link in this browser; do not reuse a link that was already opened.' : '')} />;
  if (recovery) return <SetPassword onComplete={() => setRecovery(false)} />;
  const invited = !user.is_anonymous && !!user.email_confirmed_at && (!!user.invited_at || user.app_metadata.hack_muc_access === true);
  if (!invited) return <AuthCard title="Team access required" description="Ask a project administrator to invite your account."><SignOutButton /></AuthCard>;
  return <Context.Provider value={user}><div key={`${user.id}:${String(user.app_metadata.hack_muc_role)}`}>{children}</div></Context.Provider>;
}

function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const customerFacing = useContext(CustomerFacing);
  if (customerFacing) return <main className="claim-theme auth-editorial">
    <section className="auth-story"><ClaimHeroMedia /><div className="auth-brand"><TaktileLogo className="h-5 w-auto" /><span>MOTOR CLAIMS / CUSTOMER PORTAL</span></div><div className="auth-story-copy"><p className="editorial-label">A CLEARER WAY FORWARD</p><h1>Clarity.<br />At every turn.</h1><p>Tell us what happened.<br />We’ll help you take the next step.</p></div><div className="auth-story-bottom"><ClaimRuler /><span>MOTOR CLAIMS — TEAM LLM</span></div></section>
    <section className="auth-form-side"><div className="auth-topline"><span className="editorial-label">YOUR CLAIM STARTS HERE</span><span className="live-dot" /></div><Card className="auth-form-card"><CardHeader><p className="editorial-label">LET’S GET YOU STARTED.</p><CardTitle className="text-3xl font-normal tracking-[-0.03em]">{title === 'Sign in to Team LLM Taktile case' ? 'Welcome back.' : title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card><div className="auth-footnote"><span>Clear steps. People in control.</span><span>MOTOR CLAIMS</span></div></section>
  </main>;
  return <main className="grid min-h-svh place-items-center bg-muted/30 p-6"><Card className="w-full max-w-sm"><CardHeader><CardTitle className="text-3xl font-normal tracking-[-0.03em]">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></main>;
}

function SignIn({ initialError }: { initialError: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(initialError);
  useEffect(() => setError(initialError), [initialError]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError('Sign-in failed. Check your email and password.');
    } catch { setError('Unable to reach the sign-in service. Please retry.'); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) setError('Unable to send a reset email. Please retry later.');
      else setMessage('If an account exists for this email, you will receive a password-reset link.');
    } catch { setError('Unable to reach the sign-in service.'); }
    finally { setBusy(false); }
  }
  return <AuthCard title="Sign in to Team LLM Taktile case" description="Team LLM · Invited team members only">
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1 text-sm">Email<Input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block space-y-1 text-sm">Password<Input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <Button className="w-full" disabled={busy} type="submit">{busy ? 'Please wait…' : 'Sign in'}</Button>
      <Button className="w-full" variant="ghost" disabled={busy} type="button" onClick={() => void reset()}>Forgot password / set initial password</Button>
    </form>
  </AuthCard>;
}

function SetPassword({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(error.message);
      else { window.history.replaceState(null, '', window.location.pathname); onComplete(); }
    } catch { setError('Unable to save your password. Please retry.'); }
    finally { setBusy(false); }
  }
  return <AuthCard title="Set your password" description="Choose a password with at least 12 characters."><form onSubmit={submit} className="space-y-4">
    <label className="block space-y-1 text-sm">New password<Input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label className="block space-y-1 text-sm">Confirm password<Input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
    <SignOutButton />
  </form></AuthCard>;
}

/** Signs out of this browser. Resolves to an error message, or '' on success. */
export async function signOut(): Promise<string> {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return error ? 'Could not sign out. Please retry.' : '';
  } catch { return 'Could not sign out. Please retry.'; }
}

export function SignOutButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setError(await signOut());
    setBusy(false);
  }
  return <><Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>Sign out</Button>{error && <span role="alert" className="text-xs text-destructive">{error}</span>}</>;
}
