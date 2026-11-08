import { useEffect, useState } from 'react';
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/lib/auth';
import { authenticatedFetch } from '@/lib/supabase';
import { roles, roleLabels, type Role } from '../../../src/roles';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

type Member = { id: string; email?: string; role: Role | null };

const roleDescriptions: Record<Role, string> = {
  claims_handler: 'Submits claims',
  reviewer: 'Files claims and records reviews',
  policy_manager: 'Edits and activates policies',
  admin: 'All permissions, manages roles',
};

export function Team() {
  const actor = useAuthUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/policy?view=team');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMembers(data.users);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
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
  return (
    <Card className="mx-auto w-full max-w-[1600px]">
      <CardHeader>
        <CardTitle>Team roles</CardTitle>
        <CardAction>
          <Button variant="outline" disabled={busy || loading} onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" className={cn(loading && 'animate-spin')} /> Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2.5 text-xs sm:grid-cols-2">
          {roles.map(role => (
            <div key={role} className="flex gap-1.5">
              <dt className="font-medium">{roleLabels[role]}</dt>
              <dd className="text-muted-foreground">{roleDescriptions[role]}</dd>
            </div>
          ))}
        </dl>
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Could not update the team</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading && members.length === 0 ? (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Spinner /> Loading team…</p>
        ) : (
          <ul className={cn('flex flex-col divide-y', loading && 'opacity-60 transition-opacity')}>
            {members.map(member => {
              const name = member.email ?? member.id;
              const self = member.id === actor.id;
              return (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground" aria-hidden>
                      {name.slice(0, 1)}
                    </span>
                    <span className="truncate text-sm">{name}</span>
                    {self && <Badge variant="secondary">You</Badge>}
                  </span>
                  <Select value={member.role ?? undefined} disabled={busy || self} onValueChange={role => void assign(member.id, role)}>
                    <SelectTrigger className="w-44" aria-label={`Role for ${name}`}>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {roles.map(role => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
