import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { PolicyStore, validateConfig } from '../src/server/store.js';
import { parseClaim } from '../src/triage.js';
import { evaluatePolicy, policyV1 } from '../src/server/legacy-policy.js';
const rows = ['labelled_development_cases.csv', 'unlabelled_practice_cases.csv'].flatMap(n => parse(readFileSync(`data/${n}`, 'utf8'), { columns: true }) as Record<string,string>[]);
const stores: PolicyStore[] = [];
afterEach(() => { for (const s of stores.splice(0)) s.close(); });
function store() { const s = new PolicyStore(':memory:', rows); stores.push(s); return s; }
const proposed = { ...policyV1, routineQuoteLimitEur: 1200, humanReviewRepairTypes: ['ev_high_voltage_battery'] };
describe('policy lifecycle', () => {
  it('previews without modifying decisions; activates with closed history intact', () => {
    const s = store(); const before = s.claims(); const draft = s.draft(proposed, 'Max'); const p = s.preview(draft.id);
    expect(s.claims()).toEqual(before); expect(p.changed).toBeGreaterThan(0); expect(p.closed).toBe(2);
    s.activate(draft.id, p.token, 'Owner');
    expect(s.active().id).toBe(draft.id); expect(s.history()).toHaveLength(1);
    for (const original of before) {
      const current = s.claims().find(c => c.caseId === original.caseId)!;
      expect(current.baseline).toEqual(original.baseline);
      if (original.facts.case_status === 'closed') expect(current).toEqual(original);
      else expect(current.current.policyVersion).toBe(draft.id);
    }
    expect(s.claims().find(c => c.caseId === 'PRA-003')?.needsRecheck).toBe(true);
    expect(s.claims().find(c => c.caseId === 'PRA-002')?.needsRecheck).toBe(false);
  });
  it('rejects absent, wrong-draft, stale and reused previews atomically', () => {
    const s = store(); const a = s.draft(proposed, 'Max'); const b = s.draft(policyV1, 'Max');
    const p = s.preview(a.id); const q = s.preview(b.id);
    expect(() => s.activate(a.id, '', 'Max')).toThrow();
    expect(() => s.activate(b.id, p.token, 'Max')).toThrow();
    s.activate(a.id, p.token, 'Max');
    expect(() => s.activate(b.id, q.token, 'Max')).toThrow(/stale/);
    expect(() => s.activate(a.id, p.token, 'Max')).toThrow();
    expect(s.active().id).toBe(a.id); expect(s.history()).toHaveLength(1);
  });
  it('keeps unresolved recheck flags when a later policy leaves outcomes unchanged', () => {
    const s = store(); const a = s.draft(proposed, 'Max'); s.activate(a.id, s.preview(a.id).token, 'Max');
    const b = s.draft(proposed, 'Max'); s.activate(b.id, s.preview(b.id).token, 'Max');
    expect(s.claims().find(c => c.caseId === 'PRA-003')?.needsRecheck).toBe(true);
  });
  it('persists policy, decisions and audit across reopening the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'policy-test-')); const path = join(dir, 'db.sqlite');
    try {
      const a = new PolicyStore(path, rows); const d = a.draft(proposed, 'Max'); a.activate(d.id, a.preview(d.id).token, 'Owner'); a.close();
      const b = new PolicyStore(path, rows); expect(b.active().id).toBe(d.id); expect(b.history()).toHaveLength(1); expect(b.claims().find(c => c.caseId === 'PRA-003')?.needsRecheck).toBe(true); b.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('requires an owner and validates server-side configuration', () => {
    const s = store(); expect(() => s.draft(proposed, '')).toThrow();
    for (const value of [-1, NaN, Infinity, '1200', null]) expect(() => validateConfig({ ...policyV1, routineQuoteLimitEur: value })).toThrow();
    expect(() => validateConfig({ ...policyV1, requireIncidentReport: 'false' })).toThrow();
    expect(() => validateConfig({ ...policyV1, humanReviewRepairTypes: [123] })).toThrow();
  });
  it('uses configurable documents without weakening mandatory review triggers', () => {
    const row = rows.find(r => r.case_id === 'DEV-001')!;
    const config = { ...policyV1, requireIncidentReport: false };
    expect(evaluatePolicy(parseClaim({ ...row, incident_report_present: '' }), config, 'v2').recommendation).toBe('routine_processing');
    expect(evaluatePolicy(parseClaim({ ...row, incident_report_present: '', injury_reported: 'True' }), config, 'v2').recommendation).toBe('human_review');
  });
});
