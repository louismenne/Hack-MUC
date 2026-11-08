import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { productionQuery } from './sql.js';
import publicConfig from '../../config/supabase-public.json' with { type: 'json' };
export interface QueryResult { rows: Record<string, unknown>[]; truncated: boolean; queriedAt: string }
const exec = promisify(execFile);

export function parseCliRows(stdout: string): unknown {
  const parsed = JSON.parse(stdout);
  // The CLI uses a rows envelope in agent mode and a bare array otherwise.
  return Array.isArray(parsed) ? parsed : parsed?.rows;
}

/** Keep PostgreSQL's diagnostic, never CLI command lines, credentials or result data. */
export function sqlDiagnostic(raw: string): string | undefined {
  let message = raw;
  for (let depth = 0; depth < 3; depth++) {
    const json = message.split('\n').find(line => line.trim().startsWith('{')) ?? message.slice(message.indexOf('{'));
    try {
      const parsed = JSON.parse(json);
      const next = parsed.error?.message ?? parsed.message;
      if (typeof next !== 'string') break;
      message = next;
    } catch { break; }
  }
  const match = /ERROR:\s+([A-Z0-9]{5}):\s*([^\r\n]+)/.exec(message);
  if (!match) return undefined;
  return `PostgreSQL ${match[1]}: ${match[2].replace(/(?:sk[-]ant[-]|sbp[_]|sb[_]secret[_])[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300)}`;
}

/** Model input cannot select a project, endpoint, credentials, or a write-capable transport. */
export async function queryProduction(sql: string, signal: AbortSignal, env = process.env): Promise<QueryResult> {
  const query = productionQuery(sql);
  const project = new URL(publicConfig.url).hostname.split('.')[0];
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  let rows: unknown;
  if (env.SUPABASE_MANAGEMENT_TOKEN) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query/read-only`, {
      method: 'POST', signal: timeout,
      headers: { Authorization: `Bearer ${env.SUPABASE_MANAGEMENT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!response.ok) {
      const detail = sqlDiagnostic(await response.text());
      if (detail) throw new Error(detail);
      if (response.status === 401 || response.status === 403) throw new Error(`Production database access denied (${response.status}). Check SUPABASE_MANAGEMENT_TOKEN and its database read permission.`);
      throw new Error(`Production SQL request failed (${response.status}). Check server database access.`);
    }
    const text = await response.text();
    if (text.length > 250000) throw new Error('Query result too large. Select fewer columns or aggregate the results.');
    rows = JSON.parse(text);
  } else if (env.QUALITY_AGENT_LOCAL_CLI === '1' && !env.VERCEL) {
    // Enabled only by the Vite dev plugin. Uses the existing local CLI login, never a shell.
    try {
      const result = await exec('supabase', ['db', 'query', `--remote=${project}`, '--read-only', '--output-format', 'json', query], { signal: timeout, maxBuffer: 300000 });
      rows = parseCliRows(result.stdout);
    } catch (error) {
      if (timeout.aborted) throw new Error('Production query timed out or was stopped. Simplify the query and try again.');
      const failure = error as { code?: string; stdout?: string; stderr?: string };
      if (failure.code === 'ENOENT') throw new Error('Supabase CLI is not on the dev server PATH. Install it or configure SUPABASE_MANAGEMENT_TOKEN, then restart the server.');
      const detail = sqlDiagnostic(failure.stdout ?? '') ?? sqlDiagnostic(failure.stderr ?? '');
      throw new Error(detail ?? 'Production database connection failed. Verify the local Supabase CLI login and project access.');
    }
  } else throw new Error('Configure SUPABASE_MANAGEMENT_TOKEN on the server for production SQL access.');
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Unexpected database response.');
  return { rows: rows.slice(0, 100), truncated: rows.length > 100, queriedAt: new Date().toISOString() };
}
