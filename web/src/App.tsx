import { StoredClaims } from '@/components/stored-claims';
import { permissions, roleOf, roleLabels } from '../../src/roles';
import { Team } from '@/components/team';
import { useAuthUser, SignOutButton } from '@/lib/auth';
import { PolicyManager } from '@/components/policy-manager';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, MoonIcon, ShieldCheckIcon, SunIcon, UploadIcon } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import { buildBuiltinDatasets, downloadFile, exportResultsCsv, loadDataset, type Dataset } from '@/lib/datasets';
import { PolicySourceProvider, usePolicySource } from '@/lib/policy-source';
import { usePersistentState } from '@/lib/storage';
import { ClaimDetail } from '@/components/claim-detail';
import { ClaimsList, filterCases, type ListFilters } from '@/components/claims-list';
import { QualityView } from '@/components/quality-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { reviewState, type ReviewState } from '../../src/review';

interface StoredUpload { name: string; csv: string }

const isString = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, string> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUpload = (value: unknown): value is StoredUpload | null =>
  value === null || (isRecord(value) && typeof value.name === 'string' && typeof value.csv === 'string');
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
  const user = useAuthUser();
  const access = permissions(user);
  const role = roleOf(user);
  const source = usePolicySource();
  const history = source.history;
  const builtinDatasets = useMemo(() => buildBuiltinDatasets(history), [history]);
  const [datasetId, setDatasetId] = usePersistentState('dataset', 'development', isString);
  const [upload, setUpload] = usePersistentState<StoredUpload | null>('upload', null, isUpload);
  const [selection, setSelection] = usePersistentState<Record<string, string>>('selection', {}, isRecord);
  const [tab, setTab] = usePersistentState('tab', 'queue', isString);
  // The audit log now lives inside the dashboard; an old saved 'audit' tab opens the dashboard.
  useEffect(() => { if (tab === 'audit') setTab('quality'); }, [tab, setTab]);
  const [filters, setFilters] = usePersistentState<ListFilters>('filters', defaultFilters, isFilters);
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

  const states = useMemo(() => new Map<string, ReviewState>(dataset.cases.map(item => [item.decision.caseId, reviewState(item.decision, [])])), [dataset]);

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
    if (tab !== 'examples') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, [role="combobox"], [role="listbox"], [role="dialog"]')) return;
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
  }, [tab, visible, selectedId, dataset.id, setSelection, pageOpen, openCase]);

  const onUpload = async (file: File | undefined) => {
    if (!file || !access.upload) return;
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
              <Badge variant="outline" className="font-mono">policy {history.active.label}{source.refreshing ? ' · checking…' : ''}</Badge>
            </TooltipTrigger>
            <TooltipContent>
              {source.origin === 'supabase' ? 'Active policy version from Supabase.' : 'Bundled copy of the policy files (Supabase not reachable).'} CSV examples use these rules. Submitted claims use saved server decisions.
            </TooltipContent>
          </Tooltip>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(tab === 'examples' || tab === 'example-quality') && <>
            <span className="text-xs text-muted-foreground">CSV examples:</span>
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
            <Button variant="outline" disabled={!access.upload} onClick={() => fileInput.current?.click()}>
              <UploadIcon data-icon="inline-start" /> Upload CSV
            </Button>
            <Button variant="outline" onClick={() => downloadFile(`results-${slug}.csv`, exportResultsCsv(dataset, states))}>
              <DownloadIcon data-icon="inline-start" /> Export results
            </Button>
            </>}
            <span className="text-xs text-muted-foreground">{user.email} · {role ? roleLabels[role] : 'Unassigned (read only)'}</span>
            <SignOutButton />
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
                ? `The active policy could not be loaded from Supabase (${source.problem}). Read-only CSV examples use the copy of policies/*.rules.json (${history.original.label} → ${history.active.label}) and may differ from the active version. Submitted claims never use fallback rules.`
                : `${source.problem}. CSV examples still follow ${history.active.label}. Submitted claims use the policy checked by the server.`}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mx-auto max-w-[1600px] gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="queue">Review queue</TabsTrigger>
            <TabsTrigger value="examples">CSV examples</TabsTrigger>
            {access.team && <TabsTrigger value="team">Team</TabsTrigger>}
            <TabsTrigger value="quality">Dashboard</TabsTrigger>
            <TabsTrigger value="example-quality">Example quality</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {tab === 'examples' || tab === 'example-quality' ? dataset.description + '. ' : ''}Recommends a handling step; never approves or pays a claim.
          </p>
        </div>

        <TabsContent value="queue"><StoredClaims /></TabsContent>
        <TabsContent value="examples">
          <p className="mb-4 text-sm text-muted-foreground">Read-only CSV examples. Review submitted claims in the Review queue.</p>
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
              <ClaimDetail item={selected} state={selectedState} onAction={() => {}} canReview={false} />
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

        {access.team && <TabsContent value="team"><Team /></TabsContent>}
        <TabsContent value="policy"><PolicyManager /></TabsContent>

        <TabsContent value="quality"><StoredClaims dashboard /></TabsContent>
        <TabsContent value="example-quality">
          <QualityView dataset={dataset} states={states} events={[]} renderLog={() => <p className="text-sm text-muted-foreground">CSV examples are read-only. Submitted-claim review activity is in the Dashboard.</p>} />
        </TabsContent>
      </Tabs>

    </div>
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
