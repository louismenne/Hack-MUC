import { PolicyManager } from '@/components/policy-manager';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MoonIcon, ShieldCheckIcon, SunIcon, UploadIcon } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import { buildBuiltinDatasets, downloadFile, exportResultsCsv, loadDataset, toCsv, type Dataset } from '@/lib/datasets';
import { PolicySourceProvider, usePolicySource } from '@/lib/policy-source';
import { recommendationMeta } from '@/lib/policy';
import { usePersistentState } from '@/lib/storage';
import { AuditLog } from '@/components/audit-log';
import { ClaimDetail } from '@/components/claim-detail';
import { ClaimsList, filterCases, type ListFilters } from '@/components/claims-list';
import { QualityView } from '@/components/quality-view';
import { ReviewDialog } from '@/components/review-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createReviewEvent, isRecommendation, reviewState, type ReviewAction, type ReviewEvent, type ReviewInput, type ReviewState } from '../../src/review';

interface StoredUpload { name: string; csv: string }

const isString = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, string> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUpload = (value: unknown): value is StoredUpload | null =>
  value === null || (isRecord(value) && typeof value.name === 'string' && typeof value.csv === 'string');
const isEvents = (value: unknown): value is ReviewEvent[] => Array.isArray(value) && value.every(event =>
  isRecord(event) && typeof event.id === 'string' && typeof event.caseId === 'string' && typeof event.datasetId === 'string' && isRecommendation(event.next));
const isFilters = (value: unknown): value is ListFilters => isRecord(value) && typeof value.query === 'string';

const maxUploadBytes = 2_000_000;

/** The open case page lives in the URL (#/case/DEV-004) so the browser back button returns to the inbox. */
const caseFromHash = () => {
  const match = /^#\/case\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
};
function useOpenCase(): [string | null, (caseId: string | null) => void] {
  const [openId, setOpenId] = useState(caseFromHash);
  useEffect(() => {
    const onHash = () => setOpenId(caseFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = (caseId: string | null) => {
    if (caseId) window.location.hash = `/case/${encodeURIComponent(caseId)}`;
    else if (window.location.hash) history.pushState(null, '', window.location.pathname + window.location.search);
    setOpenId(caseId);
    window.scrollTo({ top: 0 });
  };
  return [openId, open];
}
// Reviewer inbox by default: only cases routed to human review.
const defaultFilters: ListFilters = { query: '', recommendation: 'human_review', status: 'any' };

/** The whole app decides with the active policy version from Supabase (see lib/policy-source). */
export function App() {
  return <PolicySourceProvider><AppContent /></PolicySourceProvider>;
}

function AppContent() {
  const source = usePolicySource();
  const history = source.history;
  const builtinDatasets = useMemo(() => buildBuiltinDatasets(history), [history]);
  const [datasetId, setDatasetId] = usePersistentState('dataset', 'development', isString);
  const [upload, setUpload] = usePersistentState<StoredUpload | null>('upload', null, isUpload);
  const [events, setEvents] = usePersistentState<ReviewEvent[]>('audit', [], isEvents);
  const [reviewer, setReviewer] = usePersistentState('reviewer', '', isString);
  const [selection, setSelection] = usePersistentState<Record<string, string>>('selection', {}, isRecord);
  const [tab, setTab] = usePersistentState('tab', 'queue', isString);
  const [filters, setFilters] = usePersistentState<ListFilters>('filters', defaultFilters, isFilters);
  const [dialog, setDialog] = useState<ReviewAction | null>(null);
  const [openCaseId, openCase] = useOpenCase();
  const fileInput = useRef<HTMLInputElement>(null);

  const uploaded = useMemo<Dataset | null>(() => {
    if (!upload) return null;
    try {
      return loadDataset({ id: `upload:${upload.name}`, name: upload.name, description: 'Uploaded CSV', source: 'upload' }, upload.csv, history);
    } catch {
      return null;
    }
  }, [upload, history]);
  const datasets = uploaded ? [...builtinDatasets, uploaded] : builtinDatasets;
  const dataset = datasets.find(item => item.id === datasetId) ?? datasets[0];

  const datasetEvents = useMemo(() => events.filter(event => event.datasetId === dataset.id), [events, dataset.id]);
  const states = useMemo(() => {
    const byCase = new Map<string, ReviewEvent[]>();
    for (const event of datasetEvents) byCase.set(event.caseId, [...(byCase.get(event.caseId) ?? []), event]);
    return new Map<string, ReviewState>(dataset.cases.map(item => [item.decision.caseId, reviewState(item.decision, (byCase.get(item.decision.caseId) ?? []).filter(e => e.policyVersion === item.decision.policyVersion))]));
  }, [dataset, datasetEvents]);

  const visible = useMemo(() => filterCases(dataset.cases, states, filters), [dataset, states, filters]);
  const selectedId = selection[dataset.id] && dataset.cases.some(item => item.decision.caseId === selection[dataset.id])
    ? selection[dataset.id]
    : (visible[0] ?? dataset.cases[0]).decision.caseId;
  const selected = dataset.cases.find(item => item.decision.caseId === selectedId)!;
  const selectedState = states.get(selectedId)!;
  const select = (caseId: string) => setSelection(previous => ({ ...previous, [dataset.id]: caseId }));
  const pageOpen = openCaseId !== null && dataset.cases.some(item => item.decision.caseId === openCaseId);
  const showCase = (caseId: string) => { select(caseId); openCase(caseId); };
  useEffect(() => { if (pageOpen && openCaseId !== selectedId) select(openCaseId!); });
  const pageIndex = visible.findIndex(item => item.decision.caseId === selectedId);
  const pagePrev = pageIndex > 0 ? visible[pageIndex - 1] : null;
  const pageNext = pageIndex >= 0 && pageIndex < visible.length - 1 ? visible[pageIndex + 1] : null;

  // j/k or arrow keys move through the visible queue when focus is not in a form control.
  useEffect(() => {
    if (tab !== 'queue') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (dialog || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, [role="combobox"], [role="listbox"], [role="dialog"]')) return;
      const step = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0;
      if (!step || !visible.length) return;
      event.preventDefault();
      const index = visible.findIndex(item => item.decision.caseId === selectedId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
      setSelection(previous => ({ ...previous, [dataset.id]: next.decision.caseId }));
      if (pageOpen) openCase(next.decision.caseId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, dialog, visible, selectedId, dataset.id, setSelection, pageOpen, openCase]);

  const record = (input: ReviewInput) => {
    try {
      if (selected.claim.case_status === 'closed') throw new Error('Closed claims are historical and cannot be reviewed.');
      const event = createReviewEvent(input, { id: crypto.randomUUID(), at: new Date().toISOString() });
      setEvents(previous => [...previous, event]);
      setReviewer(event.reviewer);
      setDialog(null);
      const message = event.action === 'overridden'
        ? `Override recorded: ${recommendationMeta[event.next].label}`
        : event.action === 'reverted' ? 'Reverted to the automated recommendation' : 'Recommendation confirmed';
      toast.success(`${event.caseId} · ${message}`, { description: 'Saved to the audit history. The automated decision is unchanged.' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxUploadBytes) {
      toast.error('That file is larger than 2 MB. Use the CLI for big batches.');
      return;
    }
    const csv = await file.text();
    try {
      const result = loadDataset({ id: `upload:${file.name}`, name: file.name, description: 'Uploaded CSV', source: 'upload' }, csv, history);
      setUpload({ name: file.name, csv });
      setDatasetId(result.id);
      setFilters(defaultFilters);
      toast.success(`Triaged ${result.cases.length} claims from ${file.name}`, { description: result.labelled ? 'Labels found: quality metrics are available.' : 'No expected_v1 labels: quality metrics are not scored.' });
    } catch (error) {
      toast.error(`Could not load ${file.name}`, { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const slug = dataset.id.replace(/^upload:/, '').replace(/\.csv$/i, '').replace(/[^a-z0-9-]+/gi, '-');

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Claims Triage</div>
              <div className="text-xs text-muted-foreground">Team LLM · motor own damage</div>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="font-mono">policy {history.active.label}</Badge>
            </TooltipTrigger>
            <TooltipContent>
              {source.origin === 'supabase' ? 'Active policy version from Supabase.' : 'Bundled copy of the policy files (Supabase not reachable).'} Open claims follow {history.active.label}. Closed claims keep their original {history.original.label} decision.
            </TooltipContent>
          </Tooltip>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={dataset.id} onValueChange={value => { setDatasetId(value); setFilters(defaultFilters); }}>
              <SelectTrigger className="w-52" aria-label="Dataset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  <SelectLabel>Participant pack</SelectLabel>
                  {builtinDatasets.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name} ({item.cases.length})</SelectItem>
                  ))}
                </SelectGroup>
                {uploaded && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Uploaded</SelectLabel>
                      <SelectItem value={uploaded.id}>{uploaded.name} ({uploaded.cases.length})</SelectItem>
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={event => { void onUpload(event.target.files?.[0]); event.target.value = ''; }} />
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <UploadIcon data-icon="inline-start" /> Upload CSV
            </Button>
            <Button variant="outline" onClick={() => downloadFile(`results-${slug}.csv`, exportResultsCsv(dataset, states))}>
              <DownloadIcon data-icon="inline-start" /> Export results
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {(source.origin === 'bundled' || source.problem) && (
        <div className="mx-auto max-w-[1600px] px-4 pt-4">
          <Alert variant="destructive">
            <AlertTitle>{source.origin === 'bundled' ? 'Using the bundled policy files, not the active version' : 'Could not refresh the active policy'}</AlertTitle>
            <AlertDescription>
              {source.origin === 'bundled'
                ? `The active policy could not be loaded from Supabase (${source.problem}). Decisions below come from the copy of policies/*.rules.json (${history.original.label} → ${history.active.label}) and may differ from the active version.`
                : `${source.problem}. Decisions still follow ${history.active.label}.`}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mx-auto max-w-[1600px] gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="queue">Review queue</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
            <TabsTrigger value="audit">
              Audit log
              {datasetEvents.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">{datasetEvents.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {dataset.description}. Recommends a handling step; never approves or pays a claim.
          </p>
        </div>

        <TabsContent value="queue">
          {pageOpen ? (
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => openCase(null)}>
                  <ArrowLeftIcon data-icon="inline-start" /> Back to inbox
                </Button>
                <div className="flex items-center gap-1">
                  {pageIndex >= 0 && (
                    <span className="mr-2 text-xs text-muted-foreground tabular-nums">Case {pageIndex + 1} of {visible.length}</span>
                  )}
                  <Button variant="outline" size="icon" disabled={!pagePrev} onClick={() => pagePrev && showCase(pagePrev.decision.caseId)} aria-label="Previous case">
                    <ChevronLeftIcon />
                  </Button>
                  <Button variant="outline" size="icon" disabled={!pageNext} onClick={() => pageNext && showCase(pageNext.decision.caseId)} aria-label="Next case">
                    <ChevronRightIcon />
                  </Button>
                </div>
              </div>
              <ClaimDetail item={selected} state={selectedState} onAction={setDialog} />
            </div>
          ) : (
            <div className="mx-auto max-w-5xl">
              <ClaimsList
                cases={dataset.cases}
                visible={visible}
                states={states}
                filters={filters}
                onFiltersChange={setFilters}
                selectedId={selectedId}
                onSelect={showCase}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="policy"><PolicyManager /></TabsContent>

        <TabsContent value="quality">
          <QualityView dataset={dataset} states={states} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLog
            events={datasetEvents}
            datasetName={dataset.name}
            onOpenCase={caseId => { setFilters({ ...defaultFilters, recommendation: 'all' }); setTab('queue'); showCase(caseId); }}
            onExport={() => downloadFile(`audit-${slug}.csv`, auditCsv(datasetEvents))}
            onClear={() => {
              setEvents(previous => previous.filter(event => event.datasetId !== dataset.id));
              toast.success(`Cleared the audit log for ${dataset.name.toLowerCase()}`);
            }}
          />
        </TabsContent>
      </Tabs>

      <ReviewDialog
        action={dialog}
        onOpenChange={open => !open && setDialog(null)}
        datasetId={dataset.id}
        decision={selected.decision}
        current={selectedState.effective}
        defaultReviewer={reviewer}
        onSubmit={record}
      />
    </div>
  );
}

function auditCsv(events: ReviewEvent[]): string {
  return toCsv(
    events.map(event => ({
      at: event.at, case_id: event.caseId, action: event.action, reviewer: event.reviewer, reason: event.reason,
      policy_version: event.policyVersion, rule: event.ruleId, automated: event.automated, previous: event.previous, next: event.next, event_id: event.id,
    })),
    ['at', 'case_id', 'action', 'reviewer', 'reason', 'policy_version', 'rule', 'automated', 'previous', 'next', 'event_id'],
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
