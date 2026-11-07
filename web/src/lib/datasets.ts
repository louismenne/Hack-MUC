import { parse } from 'csv-parse/browser/esm/sync';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { normalizeHeaders, outputColumns, toOutputRecord, triageRows, type TriagedCase } from '../../../src/claims';
import { isRecommendation, type ReviewState } from '../../../src/review';
import type { Recommendation } from '../../../src/triage';
import { receivedAt, type ReceivedAt } from '../../../src/received-at';
import developmentCsv from '../../../data/labelled_development_cases.csv?raw';
import practiceCsv from '../../../data/unlabelled_practice_cases.csv?raw';

export interface CaseItem extends TriagedCase {
  /** Development label, used only for quality reporting, never as a decision input. */
  label: Recommendation | null;
  /** When the claim arrived. Simulated for the participant cases (see src/received-at.ts); never a decision input. */
  received: ReceivedAt | null;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  source: 'builtin' | 'upload';
  cases: CaseItem[];
  labelled: boolean;
}

export function loadDataset(meta: Omit<Dataset, 'cases' | 'labelled'>, csv: string): Dataset {
  const rows = parse(csv, { bom: true, skip_empty_lines: true, columns: normalizeHeaders }) as Record<string, string>[];
  const cases = triageRows(rows).map(item => {
    const label = item.row.expected_v1?.trim();
    return { ...item, label: isRecommendation(label) ? label : null, received: receivedAt(item.decision.caseId, item.row.received_at) };
  });
  return { ...meta, cases, labelled: cases.some(item => item.label !== null) };
}

export const builtinDatasets: Dataset[] = [
  loadDataset({ id: 'development', name: 'Development cases', description: '14 labelled cases from the participant pack', source: 'builtin' }, developmentCsv),
  loadDataset({ id: 'practice', name: 'Practice cases', description: '12 unlabelled cases from the participant pack', source: 'builtin' }, practiceCsv),
];

/** CLI-identical columns plus the reviewer outcome, so exports stay comparable with `npm run triage`. */
export function exportResultsCsv(dataset: Dataset, states: Map<string, ReviewState>): string {
  const records = dataset.cases.map(({ decision }) => {
    const state = states.get(decision.caseId);
    return { ...toOutputRecord(decision), effective_recommendation: state?.effective ?? decision.recommendation, review_status: state?.status ?? 'pending' };
  });
  return stringify(records, { header: true, columns: [...outputColumns, 'effective_recommendation', 'review_status'] });
}

export function toCsv(records: Record<string, string>[], columns: string[]): string {
  return stringify(records, { header: true, columns });
}

export function downloadFile(name: string, contents: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
