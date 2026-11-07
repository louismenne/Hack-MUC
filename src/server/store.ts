import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { parseClaim, type Claim, type Decision } from '../triage.js';
import { evaluatePolicy, evaluateV1, policyV1, policyV2, type PolicyConfig } from './legacy-policy.js';

export interface PolicyVersion { id: string; config: PolicyConfig; status: 'draft' | 'active' | 'retired'; createdBy: string; createdAt: string; activatedBy?: string; activatedAt?: string }
export interface Impact { caseId: string; status: string; before: Decision; after: Decision; changed: boolean; needsRecheck: boolean; retained: boolean }
export interface Preview { token: string; baseVersion: string; rows: Impact[]; changed: number; closed: number; total: number }
export function validateConfig(value: unknown): PolicyConfig {
  const c = value as PolicyConfig;
  if (!c || typeof c !== 'object' || typeof c.routineQuoteLimitEur !== 'number' || !Number.isFinite(c.routineQuoteLimitEur) || c.routineQuoteLimitEur < 0 || c.routineQuoteLimitEur > 1e9) throw new Error('Quote limit must be a number between 0 and 1 billion.');
  if (typeof c.requireIncidentReport !== 'boolean' || typeof c.requireItemizedQuote !== 'boolean') throw new Error('Document requirements must be Boolean values.');
  if (!Array.isArray(c.humanReviewRepairTypes) || c.humanReviewRepairTypes.length > 50 || c.humanReviewRepairTypes.some(v => typeof v !== 'string' || !/^[a-z0-9_]{1,80}$/.test(v))) throw new Error('Repair types must be lowercase identifiers.');
  return { routineQuoteLimitEur: c.routineQuoteLimitEur, humanReviewRepairTypes: [...new Set(c.humanReviewRepairTypes)], requireIncidentReport: c.requireIncidentReport, requireItemizedQuote: c.requireItemizedQuote };
}
function actor(value: unknown): string { if (typeof value !== 'string' || !value.trim() || value.length > 100) throw new Error('Policy owner name is required (max 100 characters).'); return value.trim(); }
export class PolicyStore {
  db: DatabaseSync;
  constructor(path: string, rows: Record<string, string>[]) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS policies(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS claims(id TEXT PRIMARY KEY, facts TEXT NOT NULL, baseline TEXT NOT NULL, current TEXT NOT NULL, needs_recheck INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS previews(token TEXT PRIMARY KEY, policy TEXT NOT NULL, base TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, policy TEXT NOT NULL, body TEXT NOT NULL);`);
    if (!this.db.prepare('SELECT id FROM policies LIMIT 1').get()) this.save({ id: 'v1', config: policyV1, status: 'active', createdBy: 'Participant policy', createdAt: new Date().toISOString() });
    for (const row of rows) {
      const facts = parseClaim(row); const baseline = evaluateV1(facts);
      if (!baseline.caseId) throw new Error('Seed case ID missing.');
      this.db.prepare('INSERT OR IGNORE INTO claims(id,facts,baseline,current) VALUES(?,?,?,?)').run(baseline.caseId, JSON.stringify(facts), JSON.stringify(baseline), JSON.stringify(baseline));
    }
  }
  /** One-time organizer migration; existing experimental versions/history are retained. */
  installOfficialV2() {
    const existing = this.list().find(p => p.id === 'official-v2');
    if (existing && existing.status !== 'draft') return;
    if (!existing) this.save({ id: 'official-v2', config: policyV2, status: 'draft', createdBy: 'Organizer v2 notice', createdAt: new Date().toISOString() });
    this.activate('official-v2', this.preview('official-v2').token, 'Organizer v2 notice');
  }
  save(p: PolicyVersion) { this.db.prepare('INSERT OR REPLACE INTO policies VALUES(?,?)').run(p.id, JSON.stringify(p)); }
  list(): PolicyVersion[] { return this.db.prepare('SELECT body FROM policies ORDER BY rowid').all().map(r => JSON.parse(String(r.body))); }
  active() { return this.list().find(p => p.status === 'active')!; }
  get(id: string) { const p = this.list().find(p => p.id === id); if (!p) throw new Error('Policy not found.'); return p; }
  draft(config: unknown, by: unknown) {
    const p: PolicyVersion = { id: `draft-${randomUUID()}`, config: validateConfig(config), status: 'draft', createdBy: actor(by), createdAt: new Date().toISOString() };
    this.save(p); return p;
  }
  preview(id: string): Preview {
    const p = this.get(id); if (p.status !== 'draft') throw new Error('Only drafts can be previewed for activation.');
    const rows: Impact[] = this.db.prepare('SELECT * FROM claims ORDER BY id').all().map(r => {
      const facts: Claim = JSON.parse(String(r.facts)); const before: Decision = JSON.parse(String(r.current));
      const retained = facts.case_status === 'closed';
      const after = retained ? before : evaluatePolicy(facts, p.config, p.id === 'official-v2' ? 'v2' : p.id);
      const changed = after.recommendation !== before.recommendation;
      return { caseId: String(r.id), status: String(facts.case_status), before, after, changed, needsRecheck: !retained && (changed || Boolean(r.needs_recheck)), retained };
    });
    const result: Preview = { token: randomUUID(), baseVersion: this.active().id, rows, changed: rows.filter(r => r.changed).length, closed: rows.filter(r => r.retained).length, total: rows.length };
    this.db.prepare('INSERT INTO previews VALUES(?,?,?,?)').run(result.token, id, result.baseVersion, JSON.stringify(result)); return result;
  }
  activate(id: string, token: unknown, by: unknown) {
    const owner = actor(by);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const p = this.get(id); const active = this.active();
      const preview = this.db.prepare('SELECT * FROM previews WHERE token=?').get(typeof token === 'string' ? token : '');
      if (p.status !== 'draft' || !preview || preview.policy !== id || preview.base !== active.id) throw new Error('Preview is missing or stale. Preview this draft again before activation.');
      const report: Preview = JSON.parse(String(preview.body)); const at = new Date().toISOString();
      this.save({ ...active, status: 'retired' }); this.save({ ...p, status: 'active', activatedBy: owner, activatedAt: at });
      for (const r of report.rows) if (!r.retained) this.db.prepare('UPDATE claims SET current=?,needs_recheck=? WHERE id=?').run(JSON.stringify(r.after), Number(r.needsRecheck), r.caseId);
      this.db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(randomUUID(), at, owner, id, JSON.stringify(report));
      this.db.exec('COMMIT'); return this.get(id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  claims() { return this.db.prepare('SELECT * FROM claims ORDER BY id').all().map(r => ({ caseId: r.id, facts: JSON.parse(String(r.facts)), baseline: JSON.parse(String(r.baseline)), current: JSON.parse(String(r.current)), needsRecheck: Boolean(r.needs_recheck) })); }
  history() { return this.db.prepare('SELECT * FROM history ORDER BY at DESC').all().map(r => ({ ...r, body: JSON.parse(String(r.body)) })); }
  close() { this.db.close(); }
}
