import { useState, type ReactNode } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageLink, pageHref } from '@/lib/navigation';
import { RecommendationBadge } from '@/components/recommendation-badge';
import type { Recommendation } from '../../../src/triage';

/**
 * Taktile overview: what the prototype does, one tab per jury criterion. Picking a tab swaps the
 * panel and stays there (no auto-play). The mock panels use sample data and are illustrations only.
 */

interface Topic {
  id: string;
  tab: string;
  title: string;
  text: string;
  facts: Array<[string, string]>;
  /** Page the "Open" button leads to. */
  page: string;
  cta: string;
  mock: ReactNode;
}

const Row = ({ id, rule, value }: { id: string; rule: string; value: Recommendation }) => (
  <div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
    <span className="w-20 font-mono text-xs text-muted-foreground">{id}</span>
    <RecommendationBadge value={value} />
    <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{rule}</span>
  </div>
);

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border px-2.5 py-1 text-xs">{children}</span>
);

const Bar = ({ label, width, tone }: { label: string; width: string; tone: string }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span></div>
    <div className="h-3 rounded-full bg-muted"><div className={cn('h-3 rounded-full', tone)} style={{ width }} /></div>
  </div>
);

const topics: Topic[] = [
  {
    id: 'intake',
    tab: 'Intake & decision',
    title: 'Every claim gets a recommendation, with the rule behind it',
    text: 'Routine processing, request information or human review. Rules decide; AI may read documents and draft wording but never overrides the policy. A blank field is an unknown fact, never an invented one.',
    facts: [['3', 'possible outcomes'], ['1', 'policy rule named per decision'], ['0', 'invented facts']],
    page: 'queue', cta: 'Open review queue',
    mock: (
      <div className="rounded-lg border bg-card">
        <Row id="CLM-1001" value="routine_processing" rule="default" />
        <Row id="CLM-1002" value="request_information" rule="rule2" />
        <Row id="CLM-1003" value="human_review" rule="rule1" />
        <Row id="CLM-1004" value="request_information" rule="rule3" />
      </div>
    ),
  },
  {
    id: 'change',
    tab: 'Policy change control',
    title: 'A new policy version shows its impact before it goes live',
    text: 'Edit rules or upload a policy document, review a draft, see which open claims would change, then activate. Every decision carries the policy version. Closed claims keep their original outcome.',
    facts: [['€1,200', 'quote limit in policy v2'], ['EV battery', 'work always goes to a human'], ['Closed', 'claims stay untouched']],
    page: 'policy', cta: 'Open policy',
    mock: (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm"><span className="font-medium">Draft</span><span className="text-muted-foreground">compared with the active version</span></div>
        <div className="flex flex-wrap gap-2"><Chip>open to recheck</Chip><Chip>open unchanged</Chip><Chip>closed, kept</Chip></div>
        <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Repair quote above limit → human review</div>
        <div className="flex gap-2"><Button size="sm" disabled>Activate</Button><Button size="sm" variant="ghost" disabled>Discard</Button></div>
      </div>
    ),
  },
  {
    id: 'reviewer',
    tab: 'Reviewer',
    title: 'A reviewer can override, and the override is on record',
    text: 'Accept or correct the recommendation. The correction, the reason, the reviewer and the policy version are stored with the claim and shown in the audit log.',
    facts: [['4', 'fields recorded per override'], ['Reason', 'required for a correction'], ['Audit', 'trail on every claim']],
    page: 'queue', cta: 'Open review queue',
    mock: (
      <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-center gap-2"><RecommendationBadge value="routine_processing" /><ArrowRightIcon className="size-4 text-muted-foreground" /><RecommendationBadge value="human_review" /></div>
        <div className="rounded-md border px-3 py-2 text-muted-foreground">Reason: photos show structural damage</div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Chip>reviewer</Chip><Chip>policy version</Chip><Chip>time</Chip></div>
      </div>
    ),
  },
  {
    id: 'measurement',
    tab: 'Measurement',
    title: 'Quality is measured per policy version',
    text: 'Accuracy, wrong-routine rate and unnecessary-escalation rate for every version, with the cases that changed between versions reported separately.',
    facts: [['Accuracy', 'per version'], ['Wrong routine', 'the costly mistake'], ['Changed cases', 'reported separately']],
    page: 'quality', cta: 'Open dashboard',
    mock: (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <Bar label="Accuracy" width="82%" tone="bg-foreground" />
        <Bar label="Wrong-routine rate" width="12%" tone="bg-rec-review" />
        <Bar label="Unnecessary escalation" width="24%" tone="bg-rec-info" />
        <p className="text-xs text-muted-foreground">Illustration, not measured values.</p>
      </div>
    ),
  },
  {
    id: 'business',
    tab: 'Business case',
    title: 'What triage costs today, and with the system',
    text: 'Annual triage cost before and after, payback time, the cost of errors and the cost of a policy change. All assumptions are editable, so the jury can try their own numbers.',
    facts: [['Today', 'vs. with the system'], ['Payback', 'time in months'], ['Errors', 'and policy changes priced']],
    page: 'quality', cta: 'Open dashboard',
    mock: (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <Bar label="Triage cost today" width="100%" tone="bg-muted-foreground/60" />
        <Bar label="With the system" width="45%" tone="bg-foreground" />
        <p className="text-xs text-muted-foreground">Illustration. Assumptions live on the dashboard.</p>
      </div>
    ),
  },
];

export function Overview({ canOpen }: { canOpen: (page: string) => boolean }) {
  const [selected, setSelected] = useState(topics[0].id);
  const topic = topics.find(t => t.id === selected) ?? topics[0];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 py-6">
      <section className="space-y-3">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">Team LLM · Taktile case</p>
        <h1 className="max-w-3xl text-4xl leading-tight font-medium tracking-tight md:text-5xl">Better decisions on every motor claim</h1>
        <p className="max-w-2xl text-muted-foreground">Rules decide, people stay in control, and every change is traceable. Pick an area to see what it does.</p>
      </section>

      <section aria-label="Product overview" className="space-y-4">
        <div role="tablist" aria-label="Areas" className="-mx-1 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {topics.map(t => (
            <button
              key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={t.id === selected} aria-controls="overview-panel"
              onClick={() => setSelected(t.id)}
              className={cn('shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                t.id === selected ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t.tab}
            </button>
          ))}
        </div>

        <div
          key={topic.id} id="overview-panel" role="tabpanel" aria-labelledby={`tab-${topic.id}`}
          className="grid gap-6 rounded-xl border bg-card p-6 duration-300 animate-in fade-in slide-in-from-bottom-2 md:grid-cols-2 md:p-8"
        >
          <div className="flex flex-col gap-5">
            <h2 className="text-2xl leading-snug font-medium tracking-tight">{topic.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{topic.text}</p>
            {canOpen(topic.page) && (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <PageLink href={pageHref(topic.page)}>{topic.cta}<ArrowRightIcon /></PageLink>
              </Button>
            )}
            <dl className="mt-auto grid grid-cols-3 gap-4 border-t pt-5">
              {topic.facts.map(([value, label]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-xl font-medium tracking-tight">{value}</dt>
                  <dd className="text-xs text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex items-center rounded-lg bg-muted/40 p-4 md:p-6"><div className="w-full">{topic.mock}</div></div>
        </div>
        <p className="text-xs text-muted-foreground">Panels show sample data for illustration.</p>
      </section>
    </div>
  );
}
