import { useEffect, useMemo } from 'react';
import { ArrowUpRightIcon, MinusIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { navigate, pageHref } from '@/lib/navigation';
import { bundledHistory } from '../../../src/policy-engine/bundled';
import { qualityReport, type QualityReport } from '../../../src/quality';
import {
  defaultBusinessAssumptions, errorCost, escalationsPerWrongPayment, manualErrorCost,
  policyChangeCost, productionRates, summary, triageCost, type BusinessAssumptions, type MeasuredRates,
} from '../../../src/business-case';
import { buildBuiltinDatasets, officialComparison } from '@/lib/datasets';
import { usePersistentState } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;

/** Error rates of each policy version, measured on the labelled development cases (same data as Test cases). */
function useMeasuredRates() {
  return useMemo(() => {
    const dataset = buildBuiltinDatasets(bundledHistory).find(d => d.id === 'development')!;
    const official = new Map(officialComparison(dataset).map(item => [item.current.caseId, item]));
    const v1Cases = dataset.cases.filter(c => c.labelV1 !== null);
    const v2Cases = dataset.cases.filter(c => c.labelV2 !== null && !c.frozen);
    const rate = (label: string, r: QualityReport): MeasuredRates => ({
      label, cases: r.labelled,
      wrongRoutineRate: r.labelled ? r.incorrectRoutine / r.labelled : 0,
      unnecessaryReviewRate: r.labelled ? r.unnecessaryReview / r.labelled : 0,
    });
    const v1 = rate('v1 rules on v1 cases', qualityReport(v1Cases.map(c => ({ expected: c.labelV1!, predicted: official.get(c.decision.caseId)!.decision.recommendation }))));
    const stale = rate('v1 rules after the v2 change', qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.decision.recommendation }))));
    const v2 = rate('v2 rules on v2 cases', qualityReport(v2Cases.map(c => ({ expected: c.labelV2!, predicted: official.get(c.decision.caseId)!.current.recommendation }))));
    const changedShare = v2Cases.length ? v2Cases.filter(c => official.get(c.decision.caseId)!.needsRecheck).length / v2Cases.length : 0;
    return { v1, stale, v2, changedShare };
  }, []);
}

/** Where each default comes from. Only primary sources; defaults not listed here are our estimates. */
const sources: { label: string; value: string; source: string; url: string }[] = [
  { label: 'Claims per year', value: '60,000', source: 'GDV 2023', url: 'https://www.gdv.de/gdv/medien/medieninformationen/qualitaetsstandards-koennen-streit-ueber-kfz-schadensgutachten-vermeiden-185538' },
  { label: 'Cost of a wrong payment', value: '€1,000', source: 'GDV 2023', url: 'https://www.gdv.de/gdv/medien/medieninformationen/qualitaetsstandards-koennen-streit-ueber-kfz-schadensgutachten-vermeiden-185538' },
  { label: 'Routine share', value: '40 %', source: 'GDV 2023', url: 'https://www.gdv.de/gdv/medien/medieninformationen/glasbruch-schaeden-auto-statistik-kfz-versicherung-182344' },
  { label: 'Wrongly waved through', value: '0.5 %', source: 'GDV', url: 'https://www.gdv.de/gdv/themen/schaden-unfall/versicherungsbetrug' },
  { label: 'Staff cost per hour', value: '€45', source: 'Destatis 2025', url: 'https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/04/PD26_148_624.html' },
];


type Field = { key: keyof BusinessAssumptions; label: string; unit: string; percent?: boolean; kind: 'slider' | 'stepper'; min: number; max: number; step: number };
const groups: { title: string; fields: Field[] }[] = [
  { title: 'Volume and cost', fields: [
    { key: 'claimsPerYear', label: 'Claims per year', unit: '', kind: 'slider', min: 5_000, max: 300_000, step: 5_000 },
    { key: 'hourlyCostEur', label: 'Staff cost per hour', unit: '€', kind: 'slider', min: 20, max: 100, step: 1 },
    { key: 'oneOffCostEur', label: 'One-off rollout cost', unit: '€', kind: 'slider', min: 0, max: 1_000_000, step: 10_000 },
    { key: 'runningCostEur', label: 'Running cost per year', unit: '€', kind: 'slider', min: 0, max: 500_000, step: 5_000 },
  ] },
  { title: 'Minutes per claim', fields: [
    { key: 'manualMinutes', label: 'Manual triage today', unit: 'min', kind: 'stepper', min: 1, max: 60, step: 1 },
    { key: 'routineMinutes', label: 'Routine check', unit: 'min', kind: 'stepper', min: 0, max: 30, step: 1 },
    { key: 'infoMinutes', label: 'Information request', unit: 'min', kind: 'stepper', min: 0, max: 30, step: 1 },
    { key: 'reviewMinutes', label: 'Human review', unit: 'min', kind: 'stepper', min: 1, max: 60, step: 1 },
  ] },
  { title: 'Mix and errors', fields: [
    { key: 'shareRoutine', label: 'Routine share', unit: '%', percent: true, kind: 'slider', min: 0, max: 1, step: 0.01 },
    { key: 'shareInfo', label: 'Information share', unit: '%', percent: true, kind: 'slider', min: 0, max: 1, step: 0.01 },
    { key: 'manualWrongRoutineRate', label: 'Wrongly waved through today', unit: '%', percent: true, kind: 'slider', min: 0, max: 0.05, step: 0.001 },
    { key: 'systemWrongRoutineFloor', label: 'Error floor with system', unit: '%', percent: true, kind: 'slider', min: 0, max: 0.05, step: 0.001 },
    { key: 'wrongPaymentCostEur', label: 'Cost of a wrong payment', unit: '€', kind: 'slider', min: 100, max: 10_000, step: 100 },
  ] },
  { title: 'Policy change', fields: [
    { key: 'policyChangesPerYear', label: 'Policy changes per year', unit: '', kind: 'stepper', min: 0, max: 24, step: 1 },
    { key: 'reviewers', label: 'Reviewers to retrain', unit: '', kind: 'stepper', min: 1, max: 200, step: 1 },
    { key: 'trainingHours', label: 'Training per reviewer', unit: 'h', kind: 'stepper', min: 0, max: 16, step: 1 },
    { key: 'openClaimsAtChange', label: 'Open claims at the change', unit: '', kind: 'slider', min: 100, max: 20_000, step: 100 },
    { key: 'manualRecheckMinutes', label: 'Manual recheck per claim', unit: 'min', kind: 'stepper', min: 1, max: 60, step: 1 },
    { key: 'ownerHours', label: 'Owner time with the system', unit: 'h', kind: 'stepper', min: 1, max: 40, step: 1 },
  ] },
];

const clean = (v: number, step: number) => Math.round(v / step) * step;
const shown = (f: Field, v: number) => (f.percent ? `${+(v * 100).toFixed(1)}` : num.format(v));

/** One assumption: a slider for wide ranges, − / + for small counts. The value can always be typed. */
function AssumptionRow({ f, value, onChange }: { f: Field; value: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(f.max, Math.max(f.min, clean(v, f.step))));
  const typed = (text: string) => {
    const n = Number(text.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) set(f.percent ? n / 100 : n);
  };
  const input = (
    <input
      aria-label={f.label} inputMode="decimal" key={value}
      defaultValue={shown(f, value)}
      onBlur={e => typed(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-20 rounded-md border bg-transparent px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:border-ring"
    />
  );
  if (f.kind === 'stepper') {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
        <span className="min-w-0 truncate">{f.label}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-7" aria-label={`Decrease ${f.label}`} onClick={() => set(value - f.step)} disabled={value <= f.min}><MinusIcon /></Button>
          <span className="w-12 text-center tabular-nums">{shown(f, value)}{f.unit && <span className="ml-0.5 text-xs text-muted-foreground">{f.unit}</span>}</span>
          <Button variant="outline" size="icon" className="size-7" aria-label={`Increase ${f.label}`} onClick={() => set(value + f.step)} disabled={value >= f.max}><PlusIcon /></Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">{f.label}</span>
        <span className="flex items-center gap-1">{f.unit === '€' && <span className="text-xs text-muted-foreground">€</span>}{input}{f.unit && f.unit !== '€' && <span className="text-xs text-muted-foreground">{f.unit}</span>}</span>
      </div>
      <input type="range" aria-label={`${f.label} slider`} min={f.min} max={f.max} step={f.step} value={value}
        onChange={e => set(Number(e.target.value))} className="h-1.5 w-full cursor-pointer accent-foreground" />
    </div>
  );
}


const isAssumptions = (v: unknown): v is BusinessAssumptions =>
  typeof v === 'object' && v !== null && Object.keys(defaultBusinessAssumptions).every(k => typeof (v as Record<string, unknown>)[k] === 'number');

/** Two bars on one scale: today vs. with the system. */
function Compare({ today, withSystem, todayNote, withNote }: { today: number; withSystem: number; todayNote?: string; withNote?: string }) {
  const max = Math.max(today, withSystem, 1);
  const row = (label: string, value: number, note: string | undefined, tone: string) => (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 rounded-full bg-muted"><div className={cn('h-2 rounded-full', tone)} style={{ width: `${(value / max) * 100}%` }} /></div>
      <span className="w-28 text-right tabular-nums">{eur.format(value)}</span>
      {note && <span className="col-start-2 col-end-4 -mt-2 text-xs text-muted-foreground">{note}</span>}
    </div>
  );
  return <div className="space-y-3">{row('Today', today, todayNote, 'bg-muted-foreground/60')}{row('With system', withSystem, withNote, 'bg-foreground')}</div>;
}

export function BusinessCase() {
  const [a, setA] = usePersistentState<BusinessAssumptions>('business-case-v3', defaultBusinessAssumptions, isAssumptions);
  const measured = useMeasuredRates();
  // Opened from the Overview: Close and Esc go back there, as everywhere else in the app.
  const close = () => navigate(pageHref('overview'));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select')) return;
      navigate(pageHref('overview'));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const triage = triageCost(a);
  const rates = productionRates(a, measured.v2);
  const result = summary(a, rates, measured.changedShare);
  const manual = manualErrorCost(a);
  const versions = [measured.v1, measured.stale, measured.v2].map(m => ({ ...m, cost: errorCost(a, productionRates(a, m)).totalEur }));
  const change = policyChangeCost(a, measured.changedShare);
  const ratio = escalationsPerWrongPayment(a);

  const kpis = [
    { label: 'Net benefit per year', value: eur.format(result.netBenefitEur) },
    { label: 'Payback', value: result.paybackMonths === null ? 'Not reached' : `${result.paybackMonths.toFixed(1)} months` },
    { label: 'Staff hours saved per year', value: num.format(triage.staffHoursSaved) },
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1600px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={close} aria-label="Close business case (Esc)">
            <XIcon data-icon="inline-start" /> Close <kbd className="ml-1 rounded border px-1 tabular-nums text-[10px] text-muted-foreground">Esc</kbd>
          </Button>
          <h2 className="text-3xl font-normal tracking-[-0.03em]">Business case</h2>
          <p className="text-sm text-muted-foreground">
            Mid-sized European motor insurer · per year ·{' '}
            <Popover>
              <PopoverTrigger className="underline underline-offset-2 hover:text-foreground">Sources</PopoverTrigger>
              <PopoverContent align="start" className="w-[26rem] p-0 text-sm">
                <div className="border-b px-4 py-2.5 text-xs text-muted-foreground">Sources for the defaults</div>
                <table className="w-full">
                  <tbody className="divide-y">
                    {sources.map(item => (
                      <tr key={item.label}>
                        <td className="py-2 pl-4 whitespace-nowrap">{item.label}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{item.value}</td>
                        <td className="py-2 pr-4 text-right">
                          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap underline-offset-2 hover:underline">
                            {item.source}<ArrowUpRightIcon className="size-3 text-muted-foreground" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">All other defaults are our estimates.</div>
              </PopoverContent>
            </Popover>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {kpis.map(k => (
            <Card key={k.label} size="sm"><CardHeader>
              <CardDescription className="label-mono">{k.label}</CardDescription>
              <div className="text-4xl font-light tracking-[-0.03em] tabular-nums transition-all">{k.value}</div>
            </CardHeader></Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>1 · Triage cost per year</CardTitle><CardDescription>Staff time for triage, plus the system's running cost.</CardDescription></CardHeader>
          <CardContent>
            <Compare today={triage.todayEur} withSystem={triage.withSystemEur}
              todayNote={`${num.format(a.claimsPerYear)} claims × ${a.manualMinutes} min`}
              withNote={`Routine ${a.routineMinutes} min · info ${a.infoMinutes} min · review ${a.reviewMinutes} min · + ${eur.format(a.runningCostEur)} running`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2 · Cost of errors per year</CardTitle><CardDescription>Measured error rates on the {measured.v2.cases} labelled test cases, applied to the yearly volume.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <Compare today={manual.totalEur} withSystem={errorCost(a, rates).totalEur}
              todayNote={`${pct(a.manualWrongRoutineRate)} wrongly waved through × ${eur.format(a.wrongPaymentCostEur)}`}
              withNote={`Measured ${pct(measured.v2.wrongRoutineRate)} wrong routine under v2; we assume at least ${pct(a.systemWrongRoutineFloor)}`} />
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-normal">Policy</th><th className="font-normal">Wrong routine</th><th className="font-normal">Unnecessary review</th><th className="text-right font-normal">Cost per year</th></tr></thead>
              <tbody className="divide-y">
                {versions.map(v => (
                  <tr key={v.label}>
                    <td className="py-2">{v.label}</td>
                    <td className="tabular-nums">{pct(v.wrongRoutineRate)}</td>
                    <td className="tabular-nums">{pct(v.unnecessaryReviewRate)}</td>
                    <td className="text-right tabular-nums">{eur.format(v.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm">
              1 wrong payment = <strong className="font-medium tabular-nums">{num.format(ratio)}</strong> unnecessary reviews, so uncertain cases go to a person.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>3 · Cost of one policy change</CardTitle><CardDescription>The v2 change as the example: {pct(measured.changedShare)} of open test cases changed outcome. Counted {a.policyChangesPerYear}× per year in the net benefit.</CardDescription></CardHeader>
          <CardContent>
            <Compare today={change.todayEur} withSystem={change.withSystemEur}
              todayNote={`Retrain ${a.reviewers} reviewers × ${a.trainingHours} h, recheck all ${num.format(change.claimsToRecheckToday)} open claims by hand`}
              withNote={`Owner ${a.ownerHours} h with live impact preview, review only the ${num.format(change.claimsToRecheckWithSystem)} flagged claims`} />
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Assumptions</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => setA(defaultBusinessAssumptions)}><RotateCcwIcon data-icon="inline-start" />Reset</Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map(group => (
            <section key={group.title} className="space-y-3">
              <h3 className="text-xs text-muted-foreground">{group.title}</h3>
              {group.fields.map(f => <AssumptionRow key={f.key} f={f} value={a[f.key]} onChange={v => setA(prev => ({ ...prev, [f.key]: v }))} />)}
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
