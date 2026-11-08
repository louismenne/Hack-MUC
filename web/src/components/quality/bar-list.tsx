import { cn } from '@/lib/utils';

import { pct } from './format';
export function BarList({
  items,
  total,
  barClass,
  empty,
}: {
  items: { label: string; count: number }[];
  total: number;
  barClass: string;
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((item) => item.count));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${item.count} of ${total} claims (${pct(item.count / total)})`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{item.label}</span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{item.count}</span> · {pct(item.count / total)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className={cn('h-2 rounded-full', barClass)} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
