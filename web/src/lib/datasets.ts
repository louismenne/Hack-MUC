import { parse } from 'csv-parse/browser/esm/sync';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { normalizeHeaders, outputColumns, toOutputRecord, triageRows, type TriagedCase } from '../../../src/claims';
import { isRecommendation, type ReviewState } from '../../../src/review';
import type { Recommendation, Decision } from '../../../src/triage';
import type { PolicyHistory } from '../../../src/policy-engine';
import { receivedAt, type ReceivedAt } from '../../../src/received-at';
import expectationsCsv from '../../../data/development_v2_expectations.csv?raw';
const expectations = new Map((parse(expectationsCsv, { columns: true }) as { case_id: string; expected_v2: Recommendation }[]).map(r => [r.case_id, r.expected_v2]));
import developmentCsv from '../../../data/labelled_development_cases.csv?raw';
import practiceCsv from '../../../data/unlabelled_practice_cases.csv?raw';

export interface CaseItem extends Omit<TriagedCase, 'decision' | 'current'> {
  /** The decision in force: the active policy for open claims, the frozen original decision for closed claims. */
  decision: Decision & { caseId: string };
  /** Development label, used only for quality reporting, never as a decision input. */
  label: Recommendation | null;
  labelV1: Recommendation | null;
  labelV2: Recommendation | null;
  /** The decision before the latest policy change. */
  baseline: Decision & { caseId: string };
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

export function loadDataset(meta: Omit<Dataset, 'cases' | 'labelled'>, csv: string, history: PolicyHistory): Dataset {
  const rows = parse(csv, { bom: true, skip_empty_lines: true, columns: normalizeHeaders }) as Record<string, string>[];
  const cases = triageRows(rows, history).map(({ decision: baseline, current, ...item }): CaseItem => {
    const label = item.row.expected_v1?.trim();
    const labelV1 = isRecommendation(label) ? label : null;
    const labelV2 = isRecommendation(item.row.expected_v2) ? item.row.expected_v2 : meta.id === 'development' ? expectations.get(baseline.caseId) ?? null : null;
    return { ...item, baseline, decision: current, labelV1, labelV2, label: item.frozen ? labelV1 : labelV2, received: receivedAt(baseline.caseId, item.row.received_at) };
  });
  return { ...meta, cases, labelled: cases.some(item => item.label !== null) };
}

/** The participant datasets, decided with the given policy history. */
export const buildBuiltinDatasets = (history: PolicyHistory): Dataset[] => [
  loadDataset({ id: 'development', name: 'Development cases', description: '14 labelled cases from the participant pack', source: 'builtin' }, developmentCsv, history),
  loadDataset({ id: 'practice', name: 'Practice cases', description: '12 unlabelled cases from the participant pack', source: 'builtin' }, practiceCsv, history),
];

/** Exact seven-column judging export, independent of reviewer overrides. */
export function exportResultsCsv(dataset: Dataset, _states?: Map<string, ReviewState>): string {
  return stringify(dataset.cases.map(item => toOutputRecord({ ...item, decision: item.baseline, current: item.decision })), { header: true, columns: outputColumns });
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
