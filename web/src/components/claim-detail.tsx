import { ArrowRightIcon, CircleAlertIcon, CircleCheckIcon, PencilLineIcon, RefreshCwIcon, Undo2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { describeFact, euro, recommendationMeta, ruleInfo, triggeringFields } from '@/lib/policy';
import { usePolicySource } from '@/lib/policy-source';
import { reviewerGuidance, type ReviewerDecisionId } from '@/lib/reviewer-guidance';
import type { CaseItem } from '@/lib/datasets';
import { fullDate } from '@/components/claims-list';
import { daysOpen } from '../../../src/received-at';
import { RecommendationBadge, dotClasses, toneSurface } from '@/components/recommendation-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReviewAction, ReviewEvent, ReviewState } from '../../../src/review';
import type { Field, Recommendation } from '../../../src/triage';

export const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const actionLabel: Record<ReviewAction, string> = { confirmed: 'Confirmed', overridden: 'Overridden', reverted: 'Reverted', rejected: 'Rejected' };

interface ClaimDetailProps {
  item: CaseItem;
  state: ReviewState;
  canReview: boolean;
  showReviewControls?: boolean;
  /** Opens the review dialog; `next` and `title` preset a reviewer decision (e.g. approve to routine). */
  onAction: (action: ReviewAction, next?: Recommendation, title?: string) => void;
  /** Optional block shown under the decision card, e.g. the claim's attached documents. */
  documents?: React.ReactNode;
}

/**
 * Decisions a reviewer can take on a claim the engine routed to human review. They map onto the
 * saved review actions (override to a new recommendation / confirm), so every decision is stored
 * with reviewer, reason and policy version — the live override the jury checks.
 */
const reviewerDecisions: { id: ReviewerDecisionId; title: string; hint: string; action: ReviewAction; next?: Recommendation }[] = [
  { id: 'approve', title: 'Approve', hint: 'Continue in routine processing', action: 'overridden', next: 'routine_processing' },
  { id: 'contact', title: 'Request info', hint: 'Ask the claimant for missing or clearer information', action: 'overridden', next: 'request_information' },
  { id: 'keep', title: 'Keep in review', hint: 'Needs a specialist or further checks', action: 'confirmed' },
  { id: 'reject', title: 'Reject', hint: 'Decline the claim. You confirm before it is saved.', action: 'rejected' },
];


export function ClaimDetail({ item, state, onAction, canReview, showReviewControls = true, documents }: ClaimDetailProps) {
  const { decision, claim } = item;
  const { history } = usePolicySource();
  const rule = ruleInfo(decision, history);
  const triggered = triggeringFields(decision);
  const overridden = state.status === 'overridden';
  const needsHuman = decision.recommendation === 'human_review';
  const closed = claim.case_status === 'closed';
  const lastEvent = state.events.at(-1);
  const guidance = needsHuman ? reviewerGuidance(decision) : null;
  const decided = state.status !== 'pending';
  // Temporary comparison: ?suggest=below (label under the button) or ?suggest=highlight (outlined button).
  const suggestStyle = new URLSearchParams(window.location.search).get('suggest') === 'highlight' ? 'highlight' : 'below';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl leading-tight font-normal tracking-[-0.02em] text-balance">
            {String(claim.claim_summary ?? 'No claim summary supplied.')}
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {item.received && (
              <span title={item.received.simulated ? 'Simulated arrival date for the demo.' : undefined}>
                Received {fullDate.format(item.received.at)}{!closed && ` · waiting ${daysOpen(item.received.at)} days`}
              </span>
            )}
            <span aria-hidden>·</span>
            <span className="tabular-nums" title={decision.caseId}>{decision.caseId.length > 14 ? `${decision.caseId.slice(0, 12)}…` : decision.caseId}</span>
            {item.needsRecheck && (
              <Badge variant="outline" className="gap-1 border-recheck/40 text-recheck-foreground">
                <RefreshCwIcon /> Recheck · result changed under {decision.policyVersion}
              </Badge>
            )}
          </div>
          {closed && <p className="text-xs text-muted-foreground">Closed claim · saved {decision.policyVersion} decision retained · no action required.</p>}
          {showReviewControls && needsHuman && !closed && !decided && (
            <CardAction className="flex flex-wrap items-start justify-end gap-2">
              {reviewerDecisions.map(option => {
                const recommended = guidance?.decision === option.id || (guidance?.decision === 'return' && option.id === 'contact');
                return (
                  <div key={option.id} className="flex flex-col items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            option.id === 'reject' && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
                            recommended && suggestStyle === 'highlight' && 'border-foreground ring-1 ring-foreground',
                          )}
                          disabled={!canReview}
                          onClick={() => onAction(option.action, option.next, option.id === 'reject' ? undefined : option.title)}
                        >
                          {option.title}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{option.hint}</TooltipContent>
                    </Tooltip>
                    {suggestStyle === 'below' && <span className={cn('h-4 text-[11px] text-muted-foreground', !recommended && 'invisible')}>Suggested</span>}
                  </div>
                );
              })}
            </CardAction>
          )}
          {showReviewControls && (overridden || !needsHuman) && (
            <CardAction className="flex gap-2">
              {overridden && (
                <Button variant="ghost" size="sm" disabled={!canReview || closed} onClick={() => onAction('reverted')}>
                  <Undo2Icon data-icon="inline-start" /> Revert
                </Button>
              )}
              {!needsHuman && (
                <Button size="sm" disabled={!canReview || closed} onClick={() => onAction('overridden')}>
                  <PencilLineIcon data-icon="inline-start" /> Override
                </Button>
              )}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            {/* What the system did: its recommendation and the facts that fired the rule. */}
            <div className={cn('rounded-lg p-4 ring-1', toneSurface[decision.recommendation])}>
              <StepLabel n={1}>System decision</StepLabel>
              <div className="mt-1.5 flex items-center gap-2 text-base font-semibold">
                <span aria-hidden className={cn('size-2 rounded-full', dotClasses[decision.recommendation])} />
                {recommendationMeta[decision.recommendation].label}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {decision.supportingFacts.length
                  ? <>because {decision.supportingFacts.map(describeFact).join(' · ')}</>
                  : decision.missingFields.length ? 'because required input is missing' : decision.recommendation === 'routine_processing' ? 'All routine checks passed' : 'No rule triggered'}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="mt-1.5 w-fit cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2">{rule.title}</div>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{rule.text}</TooltipContent>
              </Tooltip>
            </div>

            {/* What to do: a fixed, rule-based instruction for the reviewer, or the decision already taken. */}
            <div className={cn('rounded-lg p-4 ring-1', state.status === 'rejected' ? 'bg-card ring-border' : decided ? toneSurface[state.effective] : 'bg-muted/40 ring-border')}>
              {decided ? (
                <>
                  <StepLabel n={3}>{showReviewControls ? 'Your decision' : 'Reviewer decision'}</StepLabel>
                  <div className="mt-1.5 text-sm font-semibold">
                    {state.status === 'rejected' ? 'Rejected' : state.status === 'reviewed' ? (needsHuman ? 'Kept in review' : 'Confirmed') : recommendationMeta[state.effective].label}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">by {lastEvent?.reviewer}{lastEvent?.reason ? ` · “${lastEvent.reason}”` : ''}</div>
                </>
              ) : needsHuman ? (
                <>
                  <StepLabel n={2}>Suggested next step</StepLabel>
                  <p className="mt-1.5 text-base font-semibold text-pretty">{showReviewControls ? (guidance?.action ?? 'Check the facts below.') : 'Awaiting reviewer decision.'}</p>
                  {showReviewControls && guidance && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ArrowRightIcon className="size-3.5" /> {reviewerDecisions.find(d => d.id === guidance.decision)?.title}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <StepLabel n={2}>Next step</StepLabel>
                  <div className="mt-1.5 text-base font-semibold">Handled automatically</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">No reviewer action needed.{showReviewControls && ' You can still override.'}</div>
                </>
              )}
            </div>
          </div>

          <FactsSummary item={item} triggered={triggered} />
        </CardContent>
      </Card>

      {documents}

      {state.events.length > 0 && <HistoryList item={item} events={state.events} />}
    </div>
  );
}

const flagLabels: Partial<Record<Field, string>> = {
  injury_reported: 'Injury reported',
  liability_disputed: 'Liability disputed',
  duplicate_flag: 'Possible duplicate',
  evidence_conflict: 'Evidence conflict',
};

/** One small status chip: muted when fine, coloured when it needs attention. */
function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CircleCheckIcon : CircleAlertIcon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs',
      tone === 'ok' && 'text-muted-foreground',
      tone === 'warn' && 'font-medium text-foreground [&>svg]:text-rec-info',
      tone === 'bad' && 'font-medium text-foreground [&>svg]:text-rec-review',
    )}>
      <Icon className="size-3" aria-hidden /> {children}
    </span>
  );
}

/**
 * The structured facts in three short lines instead of a grid of equal boxes:
 * the claim itself, cover and documents, and review flags. Only problems are coloured.
 */
function FactsSummary({ item, triggered }: { item: CaseItem; triggered: Set<Field> }) {
  const { claim, decision } = item;
  const missing = new Set(decision.missingFields);
  const hot = (field: Field) => triggered.has(field) && 'underline decoration-rec-review decoration-2 underline-offset-4';
  const value = (field: Field) => {
    if (missing.has(field)) return <span className="text-muted-foreground">{field === 'quote_eur' ? 'No quote' : '—'}</span>;
    const v = claim[field];
    if (field === 'quote_eur' && typeof v === 'number') return euro.format(v);
    return String(v ?? '—').replaceAll('_', ' ');
  };
  const flags = (Object.keys(flagLabels) as Field[]);
  const raised = flags.filter(field => claim[field] === true);
  const unknownFlags = flags.filter(field => missing.has(field)).map(field => flagLabels[field] ?? field);
  const cover: React.ReactNode[] = [];
  const coverOk: string[] = [];
  const unknownCover: string[] = [];
  if (missing.has('policy_active_on_incident')) unknownCover.push('Policy active');
  else if (claim.policy_active_on_incident === false) cover.push(<Chip key="cover" tone="bad">Policy not active</Chip>);
  else coverOk.push('Policy active');
  for (const [field, name] of [['incident_report_present', 'Incident report'], ['itemized_quote_present', 'Itemized quote']] as const) {
    if (missing.has(field)) unknownCover.push(name);
    else if (claim[field] === false) cover.push(<Chip key={field} tone="warn">No {name.toLowerCase()}</Chip>);
    else coverOk.push(name);
  }
  // Three columns side by side: the claim, cover & documents, flags. Only problems are coloured.
  return (
    <div className="grid gap-x-8 gap-y-4 border-t pt-4 text-sm sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <span className="label-mono">Claim</span>
        <span className={cn('w-fit', hot('claim_type'))}>{value('claim_type')}</span>
        <span className={cn('w-fit text-muted-foreground', hot('repair_type'))}>{value('repair_type')} repair</span>
        <span className={cn('w-fit text-base font-semibold tabular-nums', hot('quote_eur'))}>{value('quote_eur')}</span>
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <span className="label-mono">Cover &amp; docs</span>
        {cover}
        {coverOk.map(name => <span key={name} className="text-muted-foreground">✓ {name}</span>)}
        <Unknown items={unknownCover} />
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <span className="label-mono">Flags</span>
        {raised.map(field => <Chip key={field} tone="bad">{flagLabels[field]}</Chip>)}
        {raised.length === 0 && unknownFlags.length === 0 && <span className="text-muted-foreground">✓ None</span>}
        <Unknown items={unknownFlags} />
      </div>
    </div>
  );
}

/** Small section label: system decision, suggestion, your decision (read top to bottom). */
function StepLabel({ children }: { n?: number; children: React.ReactNode }) {
  return <div className="label-mono">{children}</div>;
}

/** Unanswered questions, named plainly in grey. */
function Unknown({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">Not answered</span>
      {items.map(item => <span key={item} className="text-muted-foreground">– {item}</span>)}
    </div>
  );
}

/** Reviewer actions on this claim, newest first. The automated decision itself never changes. */
function HistoryList({ item, events }: { item: CaseItem; events: ReviewEvent[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm">History</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2 text-sm">
          {[...events].reverse().map(event => (
            <li key={event.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {event.action === 'overridden' ? <PencilLineIcon className="size-3.5 text-muted-foreground" /> : event.action === 'reverted' ? <Undo2Icon className="size-3.5 text-muted-foreground" /> : <CircleCheckIcon className="size-3.5 text-muted-foreground" />}
              <span className="font-medium">{actionLabel[event.action]}</span>
              {event.previous !== event.next && (
                <span className="flex items-center gap-1">
                  <RecommendationBadge value={event.previous} short /> <ArrowRightIcon className="size-3 text-muted-foreground" /> <RecommendationBadge value={event.next} short />
                </span>
              )}
              <span className="text-xs text-muted-foreground">{event.reviewer} · {timeFormat.format(new Date(event.at))} · {event.policyVersion ?? item.decision.policyVersion}</span>
              {event.reason && <span className="w-full pl-5 text-xs text-pretty">{event.reason}</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
