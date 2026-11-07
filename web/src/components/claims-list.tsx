import { CircleCheckIcon, PencilLineIcon, SearchIcon, SearchXIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { euro, recommendationMeta } from '@/lib/policy';
import type { CaseItem } from '@/lib/datasets';
import { RecommendationBadge, dotClasses } from '@/components/recommendation-badge';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { recommendations, type ReviewState, type ReviewStatus } from '../../../src/review';
import type { Recommendation } from '../../../src/triage';

export type RecommendationFilter = Recommendation | 'all';
export type StatusFilter = ReviewStatus | 'any';

export interface ListFilters {
  query: string;
  recommendation: RecommendationFilter;
  status: StatusFilter;
}

/** Case IDs are assigned in arrival order, so ascending ID = oldest first (FIFO). */
const byArrival = (a: CaseItem, b: CaseItem) => a.decision.caseId.localeCompare(b.decision.caseId, undefined, { numeric: true });

/** Position of each pending human-review case in the oldest-first queue (1 = handle next). */
export function queuePositions(cases: CaseItem[], states: Map<string, ReviewState>): Map<string, number> {
  const waiting = cases
    .filter(item => {
      const state = states.get(item.decision.caseId);
      return item.claim.case_status !== 'closed' && state?.effective === 'human_review' && state.status === 'pending';
    })
    .sort(byArrival);
  return new Map(waiting.map((item, index) => [item.decision.caseId, index + 1]));
}

export function filterCases(cases: CaseItem[], states: Map<string, ReviewState>, filters: ListFilters): CaseItem[] {
  const query = filters.query.trim().toLowerCase();
  return [...cases].sort(byArrival).filter(item => {
    const state = states.get(item.decision.caseId)!;
    if (filters.recommendation !== 'all' && state.effective !== filters.recommendation) return false;
    if (item.claim.case_status === 'closed' && filters.status !== 'any') return false;
    if (filters.status !== 'any' && state.status !== filters.status) return false;
    if (!query) return true;
    return item.decision.caseId.toLowerCase().includes(query) || String(item.claim.claim_summary ?? '').toLowerCase().includes(query);
  });
}

interface ClaimsListProps {
  cases: CaseItem[];
  visible: CaseItem[];
  states: Map<string, ReviewState>;
  filters: ListFilters;
  onFiltersChange: (filters: ListFilters) => void;
  selectedId: string | null;
  onSelect: (caseId: string) => void;
}

export function ClaimsList({ cases, visible, states, filters, onFiltersChange, selectedId, onSelect }: ClaimsListProps) {
  const counts = Object.fromEntries(recommendations.map(rec => [rec, cases.filter(item => states.get(item.decision.caseId)?.effective === rec).length]));
  const positions = queuePositions(cases, states);
  return (
    <Card className="gap-0 overflow-hidden py-0 lg:sticky lg:top-[7.25rem] lg:max-h-[calc(100svh-8.5rem)]">
      <div className="flex flex-col gap-2.5 border-b p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.query}
              onChange={event => onFiltersChange({ ...filters, query: event.target.value })}
              placeholder="Search case or summary"
              aria-label="Search claims"
              className="pl-8"
            />
          </div>
          <Select value={filters.status} onValueChange={status => onFiltersChange({ ...filters, status: status as StatusFilter })}>
            <SelectTrigger className="w-32" aria-label="Review status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="overridden">Overridden</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={filters.recommendation}
          onValueChange={value => value && onFiltersChange({ ...filters, recommendation: value as RecommendationFilter })}
          className="w-full"
          aria-label="Filter by recommendation"
        >
          <ToggleGroupItem value="all" className="flex-1">
            All <span className="text-muted-foreground tabular-nums">{cases.length}</span>
          </ToggleGroupItem>
          {(['human_review', 'request_information', 'routine_processing'] as const).map(rec => (
            <ToggleGroupItem key={rec} value={rec} className="flex-1" aria-label={recommendationMeta[rec].label}>
              <span aria-hidden className={cn('size-1.5 rounded-full', dotClasses[rec])} />
              <span className="hidden sm:inline">{recommendationMeta[rec].short.replace('Request info', 'Info').replace('Human review', 'Review')}</span>
              <span className="text-muted-foreground tabular-nums">{counts[rec]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          Oldest first · <span className="tabular-nums">{positions.size}</span> waiting for human review
        </p>
      </div>
      {visible.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
            <EmptyTitle>No matching claims</EmptyTitle>
            <EmptyDescription>Clear the search or pick another filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="pl-3">Claim</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead className="hidden pr-3 text-right sm:table-cell">Quote</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(item => {
                const id = item.decision.caseId;
                const state = states.get(id)!;
                const selected = id === selectedId;
                return (
                  <TableRow
                    key={id}
                    data-state={selected ? 'selected' : undefined}
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={() => onSelect(id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(id);
                      }
                    }}
                    className="cursor-pointer outline-none focus-visible:bg-muted/60"
                  >
                    <TableCell className="max-w-0 pl-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium">{id}</span>
                        {item.claim.case_status === 'closed' && <span className="text-xs text-muted-foreground">Historical · v1</span>}
                        {item.needsRecheck && <span className="text-xs text-muted-foreground">Changed in v2</span>}
                        {positions.has(id) && (
                          <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground tabular-nums" title="Position in the oldest-first review queue">
                            #{positions.get(id)}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{String(item.claim.claim_summary ?? 'No summary')}</div>
                    </TableCell>
                    <TableCell className="w-0">
                      <div className="flex items-center gap-1.5">
                        <RecommendationBadge value={state.effective} short />
                        {state.status === 'overridden' && <PencilLineIcon className="size-3.5 text-muted-foreground" aria-label="Overridden by reviewer" />}
                        {state.status === 'reviewed' && <CircleCheckIcon className="size-3.5 text-muted-foreground" aria-label="Reviewed" />}
                      </div>
                    </TableCell>
                    <TableCell className="hidden w-0 pr-3 text-right font-mono text-xs tabular-nums sm:table-cell">
                      {typeof item.claim.quote_eur === 'number' ? euro.format(item.claim.quote_eur) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </Card>
  );
}
