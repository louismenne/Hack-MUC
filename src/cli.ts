import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { triageCsv } from './batch.js';

try {
  const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' } } });
  if (!values.input || !values.output) throw new Error('Usage: npm run triage -- --input <claims.csv> --output <results.csv>');
  if (resolve(values.input) === resolve(values.output)) throw new Error('Input and output must be different files.');
  const result = triageCsv(await readFile(values.input, 'utf8'));
  await writeFile(values.output, result, { encoding: 'utf8', flag: 'wx' });
  console.log(`Wrote v1 recommendations to ${values.output}. Policy v2 is unavailable.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
