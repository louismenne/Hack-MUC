import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { normalizeHeaders, outputColumns, toOutputRecord, triageRows } from './claims.js';

export { outputColumns };

export function triageCsv(input: string): string {
  const rows = parse(input, { bom: true, skip_empty_lines: true, columns: normalizeHeaders }) as Record<string, string>[];
  return stringify(triageRows(rows).map(({ decision }) => toOutputRecord(decision)), { header: true, columns: outputColumns });
}
