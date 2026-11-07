import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

const FILES = ['labelled_development_cases.csv', 'unlabelled_practice_cases.csv'];

/** The participant cases used for impact analysis (read from the repo's CSVs; `expected_*` columns are never used). */
export function loadCases(root = process.cwd()): Record<string, string>[] {
  return FILES.flatMap(name => parse(readFileSync(join(root, 'data', name), 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[]);
}
