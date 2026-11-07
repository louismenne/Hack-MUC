import { cn } from '@/lib/utils';
import { recommendationMeta } from '@/lib/policy';
import { Badge } from '@/components/ui/badge';
import type { Recommendation } from '../../../src/triage';

export const toneClasses: Record<Recommendation, string> = {
  routine_processing: 'border-rec-routine/40 bg-rec-routine/10 text-rec-routine-foreground',
  request_information: 'border-rec-info/50 bg-rec-info/15 text-rec-info-foreground',
  human_review: 'border-rec-review/40 bg-rec-review/10 text-rec-review-foreground',
};

export const toneSurface: Record<Recommendation, string> = {
  routine_processing: 'bg-rec-routine/8 ring-rec-routine/30',
  request_information: 'bg-rec-info/10 ring-rec-info/40',
  human_review: 'bg-rec-review/8 ring-rec-review/30',
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
