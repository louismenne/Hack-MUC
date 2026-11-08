import { cn } from '@/lib/utils';
import { recommendationMeta } from '@/lib/policy';
import { Badge } from '@/components/ui/badge';
import type { Recommendation } from '../../../src/triage';

export const toneClasses: Record<Recommendation, string> = {
  routine_processing: 'border-border bg-transparent text-foreground',
  request_information: 'border-border bg-transparent text-foreground',
  human_review: 'border-border bg-transparent text-foreground',
};

export const toneSurface: Record<Recommendation, string> = {
  routine_processing: 'bg-card ring-border',
  request_information: 'bg-card ring-border',
  human_review: 'bg-card ring-border',
};

export const dotClasses: Record<Recommendation, string> = {
  routine_processing: 'bg-rec-routine',
  request_information: 'bg-rec-info',
  human_review: 'bg-rec-review',
};

export function RecommendationBadge({ value, short = false, className }: { value: Recommendation; short?: boolean; className?: string }) {
  const meta = recommendationMeta[value];
  return (
    <Badge variant="outline" className={cn(toneClasses[value], className)} title={meta.label}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[value])} />
      {short ? meta.short : meta.label}
    </Badge>
  );
}
