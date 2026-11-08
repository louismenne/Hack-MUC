import { nextVersionLabel, type NewDraft, type PolicyRepo, type PolicyVersionRecord } from '../../src/policy-api/types.js';
import type { PolicyDocument } from '../../src/policy-engine/schema.js';

/** In-memory PolicyRepo with the same rules as the Supabase table: drafts only are mutable, exactly one active. */
export function memoryRepo(v1: PolicyDocument): PolicyRepo & { versions: PolicyVersionRecord[] } {
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const versions: PolicyVersionRecord[] = [{
    revision: 0, id: id(), versionLabel: 'v1', rules: v1, status: 'active', changeSummary: 'seed', source: 'seed', parentVersionId: null,
    createdBy: 'Participant policy', createdAt: new Date(2026, 10, 7, 9).toISOString(), activatedAt: new Date(2026, 10, 7, 9).toISOString(),
  }];
  const clone = <T,>(v: T): T => structuredClone(v);
  return {
    versions,
    async list() { return clone(versions); },
    async get(i) { const v = versions.find(x => x.id === i); return v ? clone(v) : null; },
    async createDraft(d: NewDraft) {
      const record: PolicyVersionRecord = {
        revision: 0, id: id(), versionLabel: nextVersionLabel(versions.map(v => v.versionLabel)), rules: clone(d.rules), status: 'draft', changeSummary: d.changeSummary,
        source: d.source, parentVersionId: d.parentVersionId, createdBy: d.createdBy, createdAt: new Date(2026, 10, 7, 10, versions.length).toISOString(), activatedAt: null,
      };
      versions.push(record);
      return clone(record);
    },
    async updateDraft(i, patch) {
      const v = versions.find(x => x.id === i);
      if (!v || v.status !== 'draft') return null;
      if ((patch.rules !== undefined && JSON.stringify(patch.rules) !== JSON.stringify(v.rules)) || (patch.changeSummary !== undefined && patch.changeSummary !== v.changeSummary)) v.revision++;
      if (patch.rules !== undefined) v.rules = clone(patch.rules);
      if (patch.changeSummary !== undefined) v.changeSummary = patch.changeSummary;
      return clone(v);
    },
    async deleteDraft(i) {
      const k = versions.findIndex(x => x.id === i && x.status === 'draft');
      if (k < 0) return false;
      versions.splice(k, 1);
      return true;
    },
    async activate(i, expectedActiveId, expectedRevision) {
      const v = versions.find(x => x.id === i);
      if (!v) throw new Error('not found');
      if (versions.find(x => x.status === 'active')?.id !== expectedActiveId || v.revision !== expectedRevision) throw new Error('Stale activation');
      if (v.status !== 'draft') throw new Error('only a draft can be activated');
      for (const x of versions) if (x.status === 'active') x.status = 'archived';
      v.status = 'active';
      v.activatedAt = new Date(2026, 10, 7, 18).toISOString();
      return clone(v);
    },
  };
}
