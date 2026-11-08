import { ClaimHeroMedia, ClaimRuler } from '@/components/claim-design';
import { authenticatedFetch } from '@/lib/supabase';
import type { StoredQueueItem } from '../policy-api/stored-claims';
import { clearReloadCache } from '../../web/src/lib/reload-cache';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CarIcon, CircleAlertIcon, CircleCheckIcon, FileTextIcon, FlaskConicalIcon, ImageIcon, LockIcon, RotateCcwIcon, SendIcon, SparklesIcon } from 'lucide-react';
import { SignOutButton, useAuthUser } from '@/lib/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { FieldGroup, FieldSeparator } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { followupHref, followupRequirements, savedFormValues } from './followup.js';
import { isDryRun, loadClaimForFollowup, submitClaim, type SubmitResult } from './adapter.js';
import { extractFromFiles } from './extract.js';
import { FieldControl } from './FieldControl.js';
import { FileDropzone } from './FileDropzone.js';
import { missingInformation, type MissingItem } from './completeness.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { engineColumns, fields, sections, type ColumnValue } from './fields.js';
import { permissions } from '../roles.js';
import { formatSize, sortNewFiles } from './files.js';
import type { Prefill } from './form-state.js';
import { buildPayload } from './payload.js';
import { useClaimForm } from './use-claim-form.js';
import { VoicePanel } from './voice/VoicePanel.js';
import { validate, type FormErrors } from './validation.js';

/** Sample values for the demo button (?demo=1), to show how AI-filled fields look. */
const DEMO_PREFILL: Prefill = {
  claim_type: 'motor_own_damage', claim_summary: 'Parking scrape on the rear bumper, no other vehicle involved.',
  quote_eur: '1250', incident_report_present: 'yes', itemized_quote_present: 'yes', repair_battery: 'no',
};

/** Sections whose fields sit in two columns on wider screens. */
const twoColumnSections = new Set(['contact']);
/** Sections with a divider between questions. */
const dividedSections = new Set(['facts']);

function Shell({ children }: { children: ReactNode }) {
  const user = useAuthUser();
  return (
    <div className="claim-theme claim-editorial min-h-svh">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CarIcon className="size-4" aria-hidden />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isDryRun() && (
              <Badge variant="outline">
                <FlaskConicalIcon data-icon="inline-start" /> Test mode
              </Badge>
            )}
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <section className="claim-welcome" aria-label="Motor claims introduction">
        <ClaimHeroMedia />
        <div className="claim-welcome-content"><h2>A clear start.<br /><span>At every turn.</span></h2><p>Tell us what happened. We’ll help you take the next step.</p><a href="#claim-details" className="claim-start-link">Your claim starts below <span>↓</span></a></div>
        <div className="claim-welcome-ruler"><ClaimRuler /></div>
      </section>
      <main id="claim-details" className="mx-auto max-w-2xl px-4 pt-8 pb-4">{children}</main>
    </div>
  );
}

function SectionTitle({ index, children }: { index: number; children: ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2.5">
      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">{index}</span>
      {children}
    </CardTitle>
  );
}

export function ClaimPage() {
  const canSubmit = permissions(useAuthUser()).upload;
  const form = useClaimForm();
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existing, setExisting] = useState<SubmitResult | undefined>();
  const [requested, setRequested] = useState<string[]>([]);
  const [resumeId] = useState(() => new URLSearchParams(window.location.search).get('claim'));
  const [restoring, setRestoring] = useState(!!resumeId);
  const [restoreError, setRestoreError] = useState('');
  const restoreValues = form.restore;
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    void loadClaimForFollowup(resumeId).then(async saved => {
      if (cancelled) return;
      restoreValues(savedFormValues(saved.payload));
      setExisting(saved);
      const response = await authenticatedFetch('/api/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'evaluate_claims', claimId: resumeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not check the claim.');
      if (!cancelled && data.items?.[0]) {
        const needed = followupRequirements(data.items[0].saved.decision);
        setRequested([...needed.claimant, ...needed.internal]);
      }
    }).catch(error => { if (!cancelled) setRestoreError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [resumeId, restoreValues]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [voiceDone, setVoiceDone] = useState(false);
  // Completeness check before sending: a short "checking" step, then a nudge if something is missing.
  const [checking, setChecking] = useState(false);
  const [missing, setMissing] = useState<MissingItem[] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const demo = useMemo(() => new URLSearchParams(window.location.search).has('demo'), []);

  const addFiles = (incoming: File[]) => {
    const { accepted, rejected, duplicates } = sortNewFiles(files, incoming);
    const parts = [
      rejected.length ? `Not added (only PDF and images are accepted): ${rejected.map(f => f.name).join(', ')}.` : '',
      duplicates.length ? `Already attached: ${duplicates.map(f => f.name).join(', ')}.` : '',
    ].filter(Boolean);
    setNotice(parts.length ? parts.join(' ') : null);
    if (!accepted.length) return;
    setFiles(current => [...current, ...accepted]);
    // AI prefill hook: called automatically with the files that were just added.
    setReading(n => n + 1);
    extractFromFiles(accepted)
      .then(form.applyPrefill)
      .catch(() => setNotice('We could not read the documents automatically. Please fill in the form yourself.'))
      .finally(() => setReading(n => n - 1));
  };

  const focusField = (key: string) => {
    const holder = formRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`);
    holder?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    holder?.querySelector<HTMLElement>('input:not([type=file]):not([aria-hidden=true]), textarea, [role=radio], button')?.focus({ preventScroll: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting || checking) return;
    const found = validate(form.values);
    setErrors(found);
    setSubmitError(null);
    const firstInvalid = fields.find(f => found[f.key]);
    if (firstInvalid) {
      focusField(firstInvalid.key);
      return;
    }
    setChecking(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setChecking(false);
    const gaps = missingInformation(form.values, files.length + (existing?.files.length ?? 0));
    if (gaps.length) {
      setMissing(gaps);
      return;
    }
    await send();
  };

  /** Sends the claim as it is. Used directly, or after the claimant chose "Send anyway". */
  const send = async () => {
    setSubmitting(true);
    try {
      const saved = await submitClaim(buildPayload(form.values, { isTest: isDryRun() }), files, existing);
      clearReloadCache();
      setResult(saved);
      if (saved.mode === 'saved') window.history.replaceState(null, '', followupHref(String(saved.payload.id)));
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => { window.history.replaceState(null, '', '/claim'); setVoiceDone(false); form.reset(); setExisting(undefined); setRequested([]); setFiles([]); setErrors({}); setResult(null); setNotice(null); window.scrollTo({ top: 0 }); };

  if (restoring) return <Shell><p role="status" className="flex items-center gap-2"><Spinner /> Loading your claim…</p></Shell>;
  if (restoreError) return <Shell><Alert variant="destructive"><CircleAlertIcon /><AlertTitle>Could not resume claim</AlertTitle><AlertDescription>{restoreError}<a className="underline" href="/">Back to your claims</a></AlertDescription></Alert></Shell>;
  if (result) return <Shell><Confirmation result={result} onStartOver={startOver} onProvideInformation={missing => { setExisting(result); setRequested(missing); setFiles([]); setResult(null); setNotice(null); window.scrollTo({ top: 0 }); }} /></Shell>;

  const invalidFields = fields.filter(f => errors[f.key]);
  return (
    <Shell>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-4xl font-normal tracking-[-0.03em]">{existing ? 'Provide missing information' : 'Submit a claim'}</h1>
        <p className="text-sm text-muted-foreground">About five minutes.</p>
      </div>

      {canSubmit && <VoicePanel getValues={form.getValues} applyAnswer={form.applyVoiceAnswer} onFinished={() => setVoiceDone(true)} />}
      {voiceDone && (
        <Alert className="mb-6">
          <SparklesIcon />
          <AlertTitle>The assistant has finished</AlertTitle>
          <AlertDescription>Please check every field (yellow means filled by the AI), attach your documents, then submit the claim yourself.</AlertDescription>
        </Alert>
      )}

      {existing && <Alert><CircleAlertIcon /><AlertTitle>Info needed · {String(existing.payload.case_id)}</AlertTitle><AlertDescription>
        <p>Upload the missing documents and update the answers below, then submit for another check. Your existing documents stay attached.</p>
        <ul className="list-disc pl-5">{requested.filter(key => fields.some(f => f.column === key)).map(key => <li key={key}>{fields.find(f => f.column === key)?.label ?? key.replaceAll('_', ' ')}</li>)}</ul>
        {requested.some(key => !fields.some(f => f.column === key)) && <p>The claims team will complete the remaining internal checks. You do not need to answer those checks.</p>}
      </AlertDescription></Alert>}
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {isDryRun() && (
          <Alert>
            <FlaskConicalIcon />
            <AlertTitle>Test mode: nothing is saved yet</AlertTitle>
            <AlertDescription>Submitting shows the exact record that would be stored for this claim. No network call is made.</AlertDescription>
          </Alert>
        )}

        {!canSubmit && (
          <Alert>
            <LockIcon />
            <AlertTitle>Submission access required</AlertTitle>
            <AlertDescription>Ask an Admin to assign the Claims Handler role to submit claims.</AlertDescription>
          </Alert>
        )}

        {invalidFields.length > 0 && (
          <Alert variant="destructive" role="alert">
            <CircleAlertIcon />
            <AlertTitle>Please check {invalidFields.length} {invalidFields.length === 1 ? 'field' : 'fields'}</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {invalidFields.map(f => (
                  <li key={f.key}>
                    <button type="button" className="underline underline-offset-4 hover:text-destructive/80" onClick={() => focusField(f.key)}>{f.label}</button>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {sections.map((section, index) => {
          const sectionFields = fields.filter(f => f.section === section.id);
          return (
            <Card key={section.id}>
              <CardHeader>
                <SectionTitle index={index + 1}>{section.title}</SectionTitle>
                {section.description && <CardDescription>{section.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <FieldGroup className={twoColumnSections.has(section.id) ? 'grid gap-5 sm:grid-cols-2' : undefined}>
                  {sectionFields.map((field, i) => (
                    <Fragment key={field.key}>
                      {dividedSections.has(section.id) && i > 0 && <FieldSeparator />}
                      <FieldControl
                        field={field}
                        value={form.values[field.key] ?? ''}
                        error={errors[field.key]}
                        aiFilled={field.key in form.aiFilled}
                        onChange={value => {
                          form.setValue(field.key, value);
                          if (errors[field.key]) setErrors(({ [field.key]: _gone, ...rest }) => rest);
                        }}
                        onConfirm={() => form.confirmAi(field.key)}
                      />
                    </Fragment>
                  ))}
                </FieldGroup>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader>
            <SectionTitle index={sections.length + 1}>{existing ? 'Upload missing documents' : 'Documents'}</SectionTitle>
            <CardDescription>Up to 10 files, 10 MB each.</CardDescription>
          </CardHeader>
          <CardContent>
            {existing && <div className="mb-4"><FileItems files={existing.files} /></div>}
            <div data-field="documents"><FileDropzone files={files} reading={reading > 0} notice={notice} onAdd={addFiles} onRemove={index => setFiles(current => current.filter((_, i) => i !== index))} /></div>
          </CardContent>
        </Card>

        {demo && (
          <Item variant="outline" className="border-dashed">
            <ItemMedia variant="icon"><SparklesIcon /></ItemMedia>
            <ItemContent>
              <ItemTitle>Demo: simulate AI prefill <Badge variant="secondary">Demo</Badge></ItemTitle>
              <ItemDescription>Shows how fields filled by the AI look. Only empty fields are filled.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button type="button" size="sm" variant="outline" onClick={() => form.applyPrefill(DEMO_PREFILL)}>Simulate</Button>
            </ItemActions>
          </Item>
        )}

        {submitError && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Could not submit</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/80 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <span aria-hidden className="text-destructive">*</span> Required. Everything else may be left empty or answered “Don’t know”.
            </p>
            <Button type="submit" disabled={submitting || !canSubmit} className="shrink-0">
              {submitting ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />} Submit claim
            </Button>
          </div>
        </div>
      </form>

      {checking && (
        <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Spinner className="size-6" />
            Checking your claim…
          </div>
        </div>
      )}

      <Dialog open={missing !== null} onOpenChange={open => !open && setMissing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Some information is missing</DialogTitle>
            <DialogDescription>Adding it now saves you a follow-up from us.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5 text-sm">
            {missing?.map(item => (
              <li key={item.key} className="flex items-center gap-2">
                <CircleAlertIcon className="size-3.5 shrink-0 text-rec-info-foreground" aria-hidden /> {item.label}
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2 pt-2">
            <Button
              className="w-full"
              onClick={() => {
                const first = missing?.[0]?.key;
                setMissing(null);
                if (first) setTimeout(() => focusField(first), 50);
              }}
            >
              Continue filling out
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => { setMissing(null); void send(); }}
            >
              Send anyway
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function ColumnValueCell({ value }: { value: ColumnValue }) {
  if (value === null) return <span className="text-muted-foreground">unknown</span>;
  return <span className="tabular-nums text-xs break-all">{String(value)}</span>;
}

function FileItems({ files }: { files: SubmitResult['files'] }) {
  if (files.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No files attached</EmptyTitle>
          <EmptyDescription>Documents can speed up the decision but are not required.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ItemGroup data-testid="file-list" className="gap-2">
      {files.map((file, i) => (
        <Item key={i} role="listitem" variant="outline" size="sm">
          <ItemMedia variant="icon">{file.type.startsWith('image/') ? <ImageIcon /> : <FileTextIcon />}</ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="block w-full truncate">{file.name}</ItemTitle>
            <ItemDescription className="text-xs">{file.type || 'unknown type'} · {formatSize(file.size)}</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function Confirmation({ result, onStartOver, onProvideInformation }: { result: SubmitResult; onStartOver: () => void; onProvideInformation: (missing: string[]) => void }) {
  const [decision, setDecision] = useState<StoredQueueItem['saved']['decision'] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (result.mode !== 'saved') return;
    let cancelled = false;
    setChecking(true);
    setCheckError(null);
    setDecision(null);
    async function check() {
      for (let offset = 0; ; offset += 50) {
        const response = await authenticatedFetch('/api/policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'evaluate_claims', offset }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not check the claim.');
        if (cancelled) return;
        const item = (data.items as StoredQueueItem[]).find(item => item.claim.id === result.payload.id);
        if (item) { setDecision(item.saved.decision); return; }
        if (offset + 50 >= data.total) throw new Error('Your claim is saved, but its decision is not available yet. Please retry.');
      }
    }
    check().catch(error => { if (!cancelled) setCheckError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [result, attempt]);
  const needed = decision ? followupRequirements(decision) : { claimant: [], internal: [] };
  const dry = result.mode === 'dry-run';
  const engine = new Set(engineColumns());
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-rec-routine/15 text-rec-routine">
          <CircleCheckIcon className="size-5" aria-hidden />
        </div>
        <CardTitle className="text-xl">{dry ? 'Dry run complete' : 'Claim submitted'}</CardTitle>
        <CardDescription>
          {dry ? 'This is exactly what would be stored for this claim. Nothing has been saved.' : 'Thank you. Your claim and documents are stored privately with the claims team.'}
        </CardDescription>
        {dry && (
          <CardAction>
            <Badge variant="secondary" data-testid="dry-run-label">Nothing saved</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {checking && <p role="status" className="flex items-center gap-2 text-sm"><Spinner /> Checking your claim…</p>}
        {checkError && <Alert><CircleAlertIcon /><AlertTitle>Claim saved; decision unavailable</AlertTitle><AlertDescription>{checkError}<Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Retry decision check</Button></AlertDescription></Alert>}
        {decision?.recommendation === 'request_information' && <Alert><CircleAlertIcon /><AlertTitle>Info needed</AlertTitle><AlertDescription>
          <p>Complete any missing items listed below so your claim can be checked again.</p>
          <ul className="list-disc pl-5">{needed.claimant.map(key => <li key={key}>{fields.find(f => f.column === key)?.label ?? key.replaceAll('_', ' ')}</li>)}</ul>
          {needed.internal.length > 0 && <p>The claims team will complete the remaining internal checks. You do not need to answer those checks.</p>}
          <Button onClick={() => onProvideInformation([...needed.claimant, ...needed.internal])}>Update information or documents</Button>
        </AlertDescription></Alert>}
        {decision && decision.recommendation !== 'request_information' && <p role="status" className="text-sm">{decision.explanation}</p>}
        {dry ? (
          <Tabs defaultValue="record">
            <TabsList>
              <TabsTrigger value="record">Record</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
              <TabsTrigger value="files">Files ({result.files.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="record" className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(result.payload).map(([column, value]) => (
                    <TableRow key={column}>
                      <TableCell className="w-0 align-top whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums text-xs">{column}</span>
                          {engine.has(column) && <Badge variant="outline" className="text-[10px]">policy input</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal"><ColumnValueCell value={value} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="json" className="pt-2">
              <pre data-testid="payload" className="max-h-[28rem] overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{JSON.stringify(result.payload, null, 2)}</pre>
            </TabsContent>
            <TabsContent value="files" className="pt-2">
              <FileItems files={result.files} />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <Item variant="muted">
              <ItemContent className="min-w-0">
                <ItemDescription>Claim reference. Keep it when contacting the claims team.</ItemDescription>
                <ItemTitle className="block w-full tabular-nums text-base break-all">{String(result.payload.case_id)}</ItemTitle>
              </ItemContent>
            </Item>
            <div className="flex flex-col gap-3">
              <a href={followupHref(String(result.payload.id))} className="text-sm underline">Return to this claim to add information or documents</a>
              <h2 className="text-sm font-medium">Documents ({result.files.length})</h2>
              <FileItems files={result.files} />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onStartOver}>
          <RotateCcwIcon data-icon="inline-start" /> Submit another claim
        </Button>
      </CardFooter>
    </Card>
  );
}
