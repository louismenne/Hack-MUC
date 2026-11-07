import { useMemo, useRef, useState } from 'react';
import { CheckCircle2Icon, FlaskConicalIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isDryRun, submitClaim, type SubmitResult } from './adapter.js';
import { extractFromFiles } from './extract.js';
import { FieldControl } from './FieldControl.js';
import { FileDropzone } from './FileDropzone.js';
import { fields, sections } from './fields.js';
import { formatSize, sortNewFiles } from './files.js';
import type { Prefill } from './form-state.js';
import { buildPayload } from './payload.js';
import { useClaimForm } from './use-claim-form.js';
import { validate, type FormErrors } from './validation.js';

/** Sample values for the demo button (?demo=1), to show how AI-filled fields look. */
const DEMO_PREFILL: Prefill = {
  claim_type: 'motor_own_damage', claim_summary: 'Parking scrape on the rear bumper, no other vehicle involved.',
  quote_eur: '1250', incident_report_present: 'yes', itemized_quote_present: 'yes', repair_battery: 'no',
};

export function ClaimPage() {
  const form = useClaimForm();
  const [files, setFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(form.values);
    setErrors(found);
    setSubmitError(null);
    const firstInvalid = fields.find(f => found[f.key]);
    if (firstInvalid) {
      const holder = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstInvalid.key}"]`);
      holder?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      holder?.querySelector<HTMLElement>('[data-field-focus]')?.focus({ preventScroll: true });
      return;
    }
    setSubmitting(true);
    try {
      setResult(await submitClaim(buildPayload(form.values, { isTest: isDryRun() }), files));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => { form.reset(); setFiles([]); setErrors({}); setResult(null); setNotice(null); window.scrollTo({ top: 0 }); };

  if (result) return <Confirmation result={result} onStartOver={startOver} />;

  const errorCount = Object.keys(errors).length;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Submit a claim</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what happened and attach your documents. It takes about five minutes.</p>
        {isDryRun() && <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground"><FlaskConicalIcon className="size-3.5" aria-hidden /> Test mode: nothing is saved yet.</p>}
      </header>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {errorCount > 0 && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Please check {errorCount} {errorCount === 1 ? 'field' : 'fields'}</AlertTitle>
            <AlertDescription>{fields.filter(f => errors[f.key]).map(f => f.label).join(' · ')}</AlertDescription>
          </Alert>
        )}

        {sections.map(section => (
          <Card key={section.id}>
            <CardHeader><CardTitle>{section.title}</CardTitle><CardDescription>{section.description}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-5">
              {fields.filter(f => f.section === section.id).map(field => (
                <FieldControl key={field.key} field={field} value={form.values[field.key] ?? ''} error={errors[field.key]} aiFilled={field.key in form.aiFilled}
                  onChange={value => { form.setValue(field.key, value); if (errors[field.key]) setErrors(({ [field.key]: _gone, ...rest }) => rest); }}
                  onConfirm={() => form.confirmAi(field.key)} />
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader><CardTitle>Documents</CardTitle><CardDescription>Incident report, repair quote, photos. We read them to speed things up and may pre-fill answers for you to check.</CardDescription></CardHeader>
          <CardContent><FileDropzone files={files} reading={reading > 0} notice={notice} onAdd={addFiles} onRemove={index => setFiles(current => current.filter((_, i) => i !== index))} /></CardContent>
        </Card>

        {demo && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
            <Badge variant="secondary">Demo</Badge>
            <span className="text-muted-foreground">Shows how fields filled by the AI look. Only empty fields are filled.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => form.applyPrefill(DEMO_PREFILL)}><SparklesIcon /> Simulate AI prefill</Button>
          </div>
        )}

        {submitError && <Alert variant="destructive"><AlertTitle>Could not submit</AlertTitle><AlertDescription>{submitError}</AlertDescription></Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={submitting}>{submitting && <Loader2Icon className="animate-spin" />} Submit claim</Button>
          <span className="text-xs text-muted-foreground"><span aria-hidden className="text-destructive">*</span> required</span>
        </div>
      </form>
    </main>
  );
}

function Confirmation({ result, onStartOver }: { result: SubmitResult; onStartOver: () => void }) {
  const dry = result.mode === 'dry-run';
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <CheckCircle2Icon className="size-6 text-rec-routine" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">{dry ? 'Dry run complete' : 'Claim submitted'}</h1>
        {dry && <Badge variant="secondary" data-testid="dry-run-label">Dry run, nothing saved</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{dry ? 'This is exactly what would be stored for this claim. No network call was made.' : 'Thank you. We have your claim.'}</p>
      <Card className="mb-4">
        <CardHeader><CardTitle>Payload</CardTitle><CardDescription>Column names come from fields.ts. null means unknown or not set yet.</CardDescription></CardHeader>
        <CardContent><pre data-testid="payload" className="max-h-[28rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{JSON.stringify(result.payload, null, 2)}</pre></CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader><CardTitle>Files ({result.files.length})</CardTitle></CardHeader>
        <CardContent>
          {result.files.length === 0 ? <p className="text-sm text-muted-foreground">No files attached.</p> : (
            <ul data-testid="file-list" className="flex flex-col divide-y text-sm">
              {result.files.map((f, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span className="truncate">{f.name}</span><span className="shrink-0 text-xs text-muted-foreground">{f.type || 'unknown type'} · {formatSize(f.size)}</span></li>)}
            </ul>
          )}
        </CardContent>
      </Card>
      <Button onClick={onStartOver}>Start over</Button>
    </main>
  );
}
