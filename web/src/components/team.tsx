import { useEffect, useState } from 'react';
import { useAuthUser } from '@/lib/auth';
import { authenticatedFetch } from '@/lib/supabase';
import { roles, roleLabels, type Role } from '../../../src/roles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Member = { id: string; email?: string; role: Role | null };
export function Team() {
  const actor = useAuthUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await authenticatedFetch('/api/policy?view=team');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setMembers(data.users);
  }
  useEffect(() => { void load().catch(e => setError(String(e))); }, []);
  async function assign(userId: string, role: string) {
    setBusy(true); setError('');
    try {
      const response = await authenticatedFetch('/api/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_role', userId, role }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <Card className="mx-auto max-w-3xl"><CardHeader><CardTitle>Team roles</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Claims Handlers upload claims. Reviewers record review decisions. Policy Managers edit and activate policies. Admins manage roles and have all permissions. Unassigned accounts have read-only access. Your own role cannot be changed here.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {members.map(member => <div key={member.id} className="flex items-center justify-between gap-4"><span>{member.email ?? member.id}</span><select aria-label={`Role for ${member.email ?? member.id}`} className="rounded border bg-background p-2" disabled={busy || member.id === actor.id} value={member.role ?? ''} onChange={e => void assign(member.id, e.target.value)}><option value="" disabled>Unassigned</option>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></div>)}
    <Button variant="outline" disabled={busy} onClick={() => void load().catch(e => setError(String(e)))}>Refresh</Button>
  </CardContent></Card>;
}
