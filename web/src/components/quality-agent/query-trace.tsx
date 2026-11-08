import { ChevronRightIcon, DatabaseIcon, Loader2Icon } from 'lucide-react';
import type { QueryTrace as Trace } from '../../../../src/quality-agent/agent';

/** One SQL step as a compact, expandable evidence row. */
export function QueryTrace({ trace }: { trace: Trace }) {
  const pending = !trace.result && !trace.error;
  const status = trace.error ? 'Failed' : trace.result ? `${trace.result.rows.length}${trace.result.truncated ? '+' : ''} rows` : 'Running';
  return <details className="group rounded-lg border text-xs open:bg-muted/30">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
      {pending ? <Loader2Icon aria-hidden className="size-3.5 shrink-0 animate-spin" /> : <DatabaseIcon aria-hidden className="size-3.5 shrink-0" />}
      {/* Answers cite queries as [Q1], [Q2]…, so the id stays visible. */}
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80">{trace.id}</span>
      <span className="min-w-0 flex-1 truncate">{trace.purpose || 'SQL query'}</span>
      <span className={`shrink-0 tabular-nums ${trace.error ? 'text-destructive' : ''}`}>{status}</span>
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
    </summary>
    <div className="flex flex-col gap-2 border-t p-2.5">
      <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">{trace.sql}</pre>
      {trace.error && <p role="alert" className="text-destructive">{trace.error}</p>}
      {trace.result && <>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(trace.result.rows, null, 2)}</pre>
        <p className="text-muted-foreground">{new Date(trace.result.queriedAt).toLocaleString('en-GB')}{trace.result.truncated ? ' · first 100 rows' : ''}</p>
      </>}
    </div>
  </details>;
}
