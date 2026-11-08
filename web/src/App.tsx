import { StoredClaims } from '@/components/stored-claims';
import { permissions, roleOf, roleLabels, canAccessPage } from '../../src/roles';
import { Team } from '@/components/team';
import { useAuthUser, signOut } from '@/lib/auth';
import { PolicyManager } from '@/components/policy-manager';
import { TaktileLogo } from '@/components/taktile-logo';
import { useEffect, useMemo, useRef } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UploadIcon, UsersIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from '@/lib/theme';
import { toast } from 'sonner';
import { buildBuiltinDatasets, downloadFile, exportResultsCsv, loadDataset, type Dataset } from '@/lib/datasets';
import { PolicySourceProvider, usePolicySource } from '@/lib/policy-source';
import { usePersistentState } from '@/lib/storage';
import { ClaimDetail } from '@/components/claim-detail';
import { ClaimsList, filterCases, type ListFilters } from '@/components/claims-list';
import { QualityView } from '@/components/quality-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { navigate, pages, pageHref, PageLink, useRoute } from '@/lib/navigation';
import { reviewState, type ReviewState } from '../../src/review';

interface StoredUpload { name: string; csv: string }

const isString = (value: unknown): value is string => typeof value === 'string';
const isRecord = (value: unknown): value is Record<string, string> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUpload = (value: unknown): value is StoredUpload | null =>
  value === null || (isRecord(value) && typeof value.name === 'string' && typeof value.csv === 'string');
const isFilters = (value: unknown): value is ListFilters => isRecord(value) && typeof value.query === 'string';

const maxUploadBytes = 2_000_000;

// Reviewer inbox by default: only cases routed to human review.
const defaultFilters: ListFilters = { query: '', recommendation: 'human_review', status: 'any' };

/** The whole app decides with the active policy version from Supabase (see lib/policy-source). */
export function App() {
  const user = useAuthUser();
  const role = roleOf(user);
  if (role === 'claims_handler') return <PolicySourceProvider><ClaimantApp /></PolicySourceProvider>;
  if (!role) return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl">Account awaiting a role</h1>
      <p className="my-4">Ask an administrator to assign your role before using the app.</p>
      <Button onClick={() => void signOut()}>Sign out</Button>
    </main>
  );
  return <PolicySourceProvider><AppContent /></PolicySourceProvider>;
}

/** Claimants see their submissions; policy history supplies explanations, not staff tools. */
function ClaimantApp() {
  const user = useAuthUser();
  const route = useRoute();
  useEffect(() => {
    document.title = 'My claims · Claims Triage';
    if (route.page !== 'queue') navigate(pageHref('queue'));
  }, [route.page]);
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3">
          <PageLink href={pageHref('queue')} aria-label="My claims"><TaktileLogo className="h-3.5 w-auto" /></PageLink>
          <nav aria-label="Claims navigation" className="flex items-center gap-4 text-sm">
            <PageLink href={pageHref('queue')} aria-current="page">My claims</PageLink>
            <a href="/claim">File a claim</a>
          </nav>
          <div className="ml-auto"><AccountMenu email={user.email ?? ''} roleLabel="Claims Handler" canManageTeam={false} /></div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-4"><StoredClaims /></main>
    </div>
  );
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
  const route = useRoute();
  const tab = canAccessPage(role, route.page) ? route.page : 'queue';
  const navPages = pages.filter(page => !('menuOnly' in page) && canAccessPage(role, page.id));
  useEffect(() => {
    if (!canAccessPage(role, route.page)) navigate(pageHref('queue'));
  }, [role, route.page]);
  useEffect(() => {
    document.title = `${pages.find(page => page.id === tab)?.label ?? 'Review queue'} · Claims Triage`;
  }, [tab]);
  const [filters, setFilters] = usePersistentState<ListFilters>('filters', defaultFilters, isFilters);
  const openCaseId = tab === 'examples' ? route.caseId : null;
  const openCase = (caseId: string | null) => navigate(pageHref('examples', caseId ? new URLSearchParams({ case: caseId }) : undefined));
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
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 md:h-14 md:flex-nowrap md:py-0">
          <PageLink href={pageHref('queue')} aria-label="Taktile · go to Review queue"
            className="flex h-8 shrink-0 items-center rounded-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <TaktileLogo className="h-3.5 w-auto" aria-hidden />
          </PageLink>

          <nav aria-label="Main navigation" className="order-last -mx-1 flex w-full gap-1 overflow-x-auto [scrollbar-width:none] md:order-none md:mx-0 md:w-auto [&::-webkit-scrollbar]:hidden">
            {navPages.map(page => (
              <PageLink key={page.id} href={page.path} aria-current={tab === page.id ? 'page' : undefined}
                className={`shrink-0 px-2 py-1.5 text-sm whitespace-nowrap underline-offset-[1.15rem] transition-colors focus-visible:outline-2 focus-visible:outline-ring ${tab === page.id ? 'text-foreground underline decoration-foreground decoration-1' : 'text-muted-foreground hover:text-foreground'}`}>
                {page.label}
              </PageLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AccountMenu email={user.email ?? ''} roleLabel={role ? roleLabels[role] : 'Unassigned (read only)'} canManageTeam={access.team} />
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

      <main className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4">
        {(tab === 'examples' || tab === 'example-quality') && (
          <div className={`flex w-full flex-wrap items-center justify-between gap-3 ${tab === 'examples' ? 'mx-auto max-w-[1600px]' : ''}`}>
            <p className="text-sm text-muted-foreground">{dataset.description}. Read-only examples; submitted claims are reviewed in the Review queue.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dataset.id} onValueChange={value => { setDatasetId(value); setFilters(defaultFilters); }}>
                <SelectTrigger className="w-52" aria-label="CSV example dataset">
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
            </div>
          </div>
        )}

        {tab === 'queue' && <StoredClaims />}
        {tab === 'examples' && <section>
          {pageOpen ? (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
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
              <ClaimDetail item={selected} state={selectedState} onAction={() => {}} canReview={false} showReviewControls={false} />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[1600px]">
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
        </section>}

        {tab === 'team' && (access.team ? <Team /> : <p>Admin role required to view the team.</p>)}
        {tab === 'policy' && <PolicyManager />}

        {tab === 'quality' && <StoredClaims dashboard />}
        {tab === 'example-quality' && <section>
          <QualityView dataset={dataset} states={states} events={[]} renderLog={() => <p className="text-sm text-muted-foreground">CSV examples are read-only. Submitted-claim review activity is in the Dashboard.</p>} />
        </section>}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-xs text-muted-foreground">
        Recommends a handling step; never approves or pays a claim.
      </footer>
    </div>
  );
}

const themes = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const;

function initials(email: string) {
  const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Account, team management, theme and sign-out live here so the top bar stays uncluttered. */
function AccountMenu({ email, roleLabel, canManageTeam }: { email: string; roleLabel: string; canManageTeam: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Account menu for ${email}`}>
          <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">{initials(email)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{email}</div>
          <div className="text-xs text-muted-foreground">{roleLabel}</div>
        </div>
        {canManageTeam && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate(pageHref('team'))}>
            <UsersIcon /> Team &amp; roles
          </DropdownMenuItem>
        </>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={value => setTheme(value as typeof theme)}>
          {themes.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} onSelect={event => event.preventDefault()}>
              <Icon /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut().then(error => { if (error) toast.error(error); })}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
