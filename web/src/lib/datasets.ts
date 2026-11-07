import { parse } from 'csv-parse/browser/esm/sync';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { normalizeHeaders, outputColumns, toOutputRecord, triageRows, type TriagedCase } from '../../../src/claims';
import { isRecommendation, type ReviewState } from '../../../src/review';
import { compareOfficialPolicies, type Recommendation, type Decision } from '../../../src/triage';
import { receivedAt, type ReceivedAt } from '../../../src/received-at';
import expectationsCsv from '../../../data/development_v2_expectations.csv?raw';
const expectations = new Map((parse(expectationsCsv, { columns: true }) as { case_id: string; expected_v2: Recommendation }[]).map(r => [r.case_id, r.expected_v2]));
import developmentCsv from '../../../data/labelled_development_cases.csv?raw';
import practiceCsv from '../../../data/unlabelled_practice_cases.csv?raw';

export interface CaseItem extends TriagedCase {
  /** Development label, used only for quality reporting, never as a decision input. */
  label: Recommendation | null;
  labelV1: Recommendation | null;
  labelV2: Recommendation | null;
  baseline: Decision & { caseId: string };
  needsRecheck: boolean;
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
    const comparison = compareOfficialPolicies(item.claim, item.decision);
    const labelV1 = isRecommendation(label) ? label : null;
    const labelV2 = isRecommendation(item.row.expected_v2) ? item.row.expected_v2 : meta.id === 'development' ? expectations.get(item.decision.caseId) ?? null : null;
    return {
      ...item, baseline: item.decision, decision: { ...comparison.v2, caseId: item.decision.caseId }, needsRecheck: comparison.needsRecheck, labelV1, labelV2,
      label: comparison.retained ? labelV1 : labelV2, received: receivedAt(item.decision.caseId, item.row.received_at),
    };
  });
  return { ...meta, cases, labelled: cases.some(item => item.label !== null) };
}

export const builtinDatasets: Dataset[] = [
  loadDataset({ id: 'development', name: 'Development cases', description: '14 labelled cases from the participant pack', source: 'builtin' }, developmentCsv),
  loadDataset({ id: 'practice', name: 'Practice cases', description: '12 unlabelled cases from the participant pack', source: 'builtin' }, practiceCsv),
];

/** Exact seven-column judging export, independent of reviewer overrides. */
export function exportResultsCsv(dataset: Dataset, _states?: Map<string, ReviewState>): string {
  return stringify(dataset.cases.map(item => toOutputRecord({ ...item, decision: item.baseline })), { header: true, columns: outputColumns });
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
