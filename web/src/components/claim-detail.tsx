import {
  ArrowRightIcon, BotIcon, CircleAlertIcon, ClockIcon, CircleCheckIcon, FlaskConicalIcon, PencilLineIcon, QuoteIcon, Undo2Icon, ZapIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeFact, euro, fieldGroups, fieldLabels, recommendationMeta, ruleInfo, triggeringFields } from '@/lib/policy';
import { usePolicySource } from '@/lib/policy-source';
import type { CaseItem } from '@/lib/datasets';
import { fullDate } from '@/components/claims-list';
import { daysOpen } from '../../../src/received-at';
import { RecommendationBadge, toneSurface } from '@/components/recommendation-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReviewAction, ReviewEvent, ReviewState } from '../../../src/review';
import type { Field } from '../../../src/triage';

export const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const actionMeta: Record<ReviewAction, { label: string; icon: typeof CircleCheckIcon }> = {
  confirmed: { label: 'Confirmed', icon: CircleCheckIcon },
  overridden: { label: 'Overridden', icon: PencilLineIcon },
  reverted: { label: 'Reverted to automated', icon: Undo2Icon },
};

interface ClaimDetailProps {
  item: CaseItem;
  state: ReviewState;
  canReview: boolean;
  onAction: (action: ReviewAction) => void;
}

export function ClaimDetail({ item, state, onAction, canReview }: ClaimDetailProps) {
  const { decision, claim, label } = item;
  const { history } = usePolicySource();
  const rule = ruleInfo(decision, history);
  const triggered = triggeringFields(decision);
  const overridden = state.status === 'overridden';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader className="max-sm:has-data-[slot=card-action]:grid-cols-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{decision.caseId}</span>
            {claim.case_status && <Badge variant="secondary" className="capitalize">{String(claim.case_status)}</Badge>}
            <Badge variant="outline" className="font-mono">policy {decision.policyVersion}</Badge>
            {item.received && (
              <span className="text-xs text-muted-foreground" title={item.received.simulated ? 'Simulated arrival date for the demo; the case CSV has no timestamps.' : undefined}>
                Received {fullDate.format(item.received.at)}
                {claim.case_status === 'open' && ` · open ${daysOpen(item.received.at)} day${daysOpen(item.received.at) === 1 ? '' : 's'}`}
                {item.received.simulated && ' · simulated'}
              </span>
            )}
          </div>
          <CardTitle className="mt-1 flex gap-2 text-base leading-snug font-medium text-balance">
            <QuoteIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {String(claim.claim_summary ?? 'No claim summary supplied.')}
          </CardTitle>
          {claim.case_status === 'closed' && <p className="text-sm text-muted-foreground">Historical closed claim · saved {decision.policyVersion} decision retained · no action required.</p>}
          {item.needsRecheck && <Badge variant="outline">Changed under {decision.policyVersion} · needs recheck</Badge>}
          <CardDescription>The summary is descriptive only. Decisions use the structured fields below.</CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:mt-2 max-sm:justify-self-start">
            {overridden && (
              <Button variant="ghost" disabled={!canReview || claim.case_status === 'closed'} onClick={() => onAction('reverted')}>
                <Undo2Icon data-icon="inline-start" /> Revert
              </Button>
            )}
            <Button variant="outline" disabled={!canReview || claim.case_status === 'closed'} onClick={() => onAction('confirmed')}>Confirm</Button>
            <Button disabled={!canReview || claim.case_status === 'closed'} onClick={() => onAction('overridden')}>
              <PencilLineIcon data-icon="inline-start" /> Override
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn('rounded-lg p-3.5 ring-1', toneSurface[decision.recommendation])}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BotIcon className="size-3.5" /> Automated recommendation
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight">{recommendationMeta[decision.recommendation].label}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{decision.ruleId}</div>
            </div>
            <div className={cn('rounded-lg p-3.5 ring-1', overridden ? toneSurface[state.effective] : 'bg-muted/40 ring-border')}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <PencilLineIcon className="size-3.5" /> Current recommendation
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight">{recommendationMeta[state.effective].label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {overridden ? `Overridden by ${state.events.at(-1)?.reviewer}` : state.status === 'reviewed' ? `Confirmed by ${state.events.at(-1)?.reviewer}` : 'Automated · not overridden'}
              </div>
            </div>
          </div>
          <section aria-labelledby="why-heading" className="flex flex-col gap-2.5">
            <h3 id="why-heading" className="text-sm font-semibold">Why this recommendation</h3>
            {decision.supportingFacts.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {decision.supportingFacts.map(fact => (
                  <li key={fact} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <ZapIcon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
                    <span>{describeFact(fact)}</span>
                    {describeFact(fact) !== fact && <code className="font-mono text-xs text-muted-foreground">{fact}</code>}
                  </li>
                ))}
              </ul>
            )}
            <blockquote className="rounded-lg border-l-2 border-foreground/20 bg-muted/50 px-3.5 py-2.5 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{rule.title}</div>
              {rule.text}
            </blockquote>
            {decision.missingFields.length > 0 && (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>{decision.missingFields.length === 1 ? 'One input is missing or unreadable' : `${decision.missingFields.length} inputs are missing or unreadable`}</AlertTitle>
                <AlertDescription>
                  <p>
                    {decision.missingFields.map(field => fieldLabels[field]).join(', ')}.{' '}
                    {decision.ruleId.endsWith('.rule1') ? 'A known review trigger already applies, so these do not change the outcome.' : 'No value was invented; the engine asks for the information instead.'}
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {label && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <FlaskConicalIcon className="size-3.5" aria-hidden />
                {item.frozen ? 'V1 development label (closed claim, decision frozen)' : 'V2 expectation (team-derived for built-in cases)'} <RecommendationBadge value={label} short />
                {label === decision.recommendation
                  ? <span className="text-rec-routine-foreground">matches the engine</span>
                  : <span className="font-medium text-destructive">differs from the engine</span>}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <EvidenceCard item={item} triggered={triggered} />
        <HistoryCard item={item} events={state.events} />
      </div>
    </div>
  );
}

function EvidenceCard({ item, triggered }: { item: CaseItem; triggered: Set<Field> }) {
  const { claim, row, decision } = item;
  const missing = new Set(decision.missingFields);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Structured evidence</CardTitle>
        <CardDescription>Recorded structured claim facts. Highlighted fields fired the rule.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {fieldGroups.map((group, index) => (
          <div key={group.title} className="flex flex-col gap-1">
            {index > 0 && <Separator className="mb-3" />}
            <div className="mb-1 text-xs font-medium text-muted-foreground">{group.title}</div>
            <dl className="flex flex-col gap-0.5">
              {group.fields.map(field => {
                const raw = row[field];
                const isTriggered = triggered.has(field);
                return (
                  <div key={field} className={cn('flex items-center justify-between gap-3 rounded-md px-2 py-1.5', isTriggered && cn('ring-1', toneSurface[decision.recommendation]))}>
                    <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      {isTriggered && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ZapIcon className="size-3.5 text-foreground" aria-label="Fired the rule" />
                          </TooltipTrigger>
                          <TooltipContent>Fired {decision.ruleId}</TooltipContent>
                        </Tooltip>
                      )}
                      {fieldLabels[field]}
                    </dt>
                    <dd className="text-right text-sm font-medium">
                      <FieldValue field={field} raw={raw} parsed={claim[field]} missing={missing.has(field)} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FieldValue({ field, raw, parsed, missing }: { field: Field; raw: string | undefined; parsed: unknown; missing: boolean }) {
  if (missing) {
    const label = raw === undefined ? 'Column absent' : raw.trim() === '' ? 'Missing' : 'Unreadable';
    return (
      <span className="inline-flex items-center gap-1.5">
        {raw?.trim() && <code className="font-mono text-xs text-muted-foreground">{raw}</code>}
        <Badge variant="outline" className="border-rec-info/50 text-rec-info-foreground">
          <CircleAlertIcon /> {label}
        </Badge>
      </span>
    );
  }
  if (typeof parsed === 'boolean') return <span>{parsed ? 'Yes' : 'No'}</span>;
  if (field === 'quote_eur' && typeof parsed === 'number') return <span className="font-mono tabular-nums">{euro.format(parsed)}</span>;
  return <code className="font-mono text-xs">{String(parsed)}</code>;
}

function HistoryCard({ item, events }: { item: CaseItem; events: ReviewEvent[] }) {
  const { decision } = item;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Audit history</CardTitle>
        <CardDescription>Append-only. The automated decision is kept unchanged.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative flex flex-col gap-4 border-l pl-5">
          <TimelineEntry icon={BotIcon} title="Automated decision" meta={`Engine · policy ${decision.policyVersion} · ${decision.ruleId}`}>
            <RecommendationBadge value={decision.recommendation} />
          </TimelineEntry>
          {events.map(event => {
            const meta = actionMeta[event.action];
            return (
              <TimelineEntry key={event.id} icon={meta.icon} title={`${meta.label} by ${event.reviewer}`} meta={timeFormat.format(new Date(event.at))}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {event.previous !== event.next ? (
                    <>
                      <RecommendationBadge value={event.previous} short />
                      <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="changed to" />
                      <RecommendationBadge value={event.next} short />
                    </>
                  ) : (
                    <RecommendationBadge value={event.next} short />
                  )}
                </div>
                {event.reason && <p className="mt-1.5 text-sm text-pretty">{event.reason}</p>}
              </TimelineEntry>
            );
          })}
        </ol>
        {events.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No reviewer action yet.</p>}
      </CardContent>
    </Card>
  );
}

function TimelineEntry({ icon: Icon, title, meta, children }: { icon: typeof BotIcon; title: string; meta: string; children: React.ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute top-0 -left-[1.95rem] grid size-5 place-items-center rounded-full border bg-card">
        <Icon className="size-3 text-muted-foreground" />
      </span>
      <div className="text-sm font-medium">{title}</div>
      <div className="mb-1.5 text-xs text-muted-foreground">{meta}</div>
      {children}
    </li>
  );
}
