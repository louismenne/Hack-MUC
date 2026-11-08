import type { Change } from '../../../../src/policy-view/diff';
import { cn } from '@/lib/utils';
import { toneClasses } from '@/components/recommendation-badge';

const KIND: Record<Change['kind'], { label: string; tone: string }> = {
  added: { label: 'new', tone: toneClasses.routine_processing },
  removed: { label: 'removed', tone: toneClasses.human_review },
  changed: { label: 'changed', tone: toneClasses.request_information },
};

export function DiffList({ changes, empty = 'No differences' }: { changes: Change[]; empty?: string }) {
  if (!changes.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {changes.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className={cn('mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs', KIND[c.kind].tone)}>{KIND[c.kind].label}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}
