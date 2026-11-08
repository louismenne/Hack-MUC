import { ApiError } from './handlers.js';
import { createClient } from '@supabase/supabase-js';
import type { PolicyDocument } from '../policy-engine/schema.js';
import { nextVersionLabel, type NewDraft, type PolicyRepo, type PolicyVersionRecord } from './types.js';

const COLUMNS = 'investigation_id,revision,id,version_label,rules,status,change_summary,source,parent_version_id,created_by,created_at,activated_at';

interface Row {
  investigation_id?: string | null;
  revision: number;
  id: string; version_label: string; rules: PolicyDocument; status: PolicyVersionRecord['status']; change_summary: string | null;
  source: PolicyVersionRecord['source']; parent_version_id: string | null; created_by: string; created_at: string; activated_at: string | null;
}
const toRecord = (r: Row): PolicyVersionRecord => ({
  investigationId: r.investigation_id, revision: r.revision, id: r.id, versionLabel: r.version_label, rules: r.rules, status: r.status, changeSummary: r.change_summary, source: r.source,
  parentVersionId: r.parent_version_id, createdBy: r.created_by, createdAt: r.created_at, activatedAt: r.activated_at,
});

function fail(action: string, error: { message: string }): never {
  throw new Error(`Supabase (${action}): ${error.message}`);
}

/** Server-side only: uses the secret key, which must never reach the browser. */
export function createSupabaseRepo(url: string, secretKey: string, actorId?: string): PolicyRepo {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const table = () => db.from('policy_versions');
  const write = async (action: string, data: Record<string, unknown>) => {
    if (!actorId) throw new Error('Authenticated policy actor required.');
    return db.rpc('write_policy_as', { p_actor: actorId, p_action: action, p_data: data });
  };
  const repo: PolicyRepo = {
    async list() {
      const { data, error } = await table().select(COLUMNS).order('created_at', { ascending: true });
      if (error) fail('list', error);
      return (data as unknown as Row[]).map(toRecord);
    },
    async get(id) {
      const { data, error } = await table().select(COLUMNS).eq('id', id).maybeSingle();
      if (error) fail('get', error);
      return data ? toRecord(data as unknown as Row) : null;
    },
    async createDraft(draft: NewDraft) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const label = nextVersionLabel((await repo.list()).map(v => v.versionLabel));
        const { data, error } = await write('create', {
          investigation_id: draft.investigationId, investigation_revision: draft.investigationRevision, version_label: label, rules: draft.rules, status: 'draft', change_summary: draft.changeSummary, source: draft.source,
          parent_version_id: draft.parentVersionId, created_by: draft.createdBy,
        });
        if (!error) return toRecord(data as unknown as Row);
        if (['Open investigation with saved findings required', 'Investigation changed; reload before drafting', 'Active policy changed; reload before drafting'].includes(error.message)) throw new ApiError(409, error.message);
        if (error.code !== '23505') fail('createDraft', error); // 23505 = label taken by a concurrent draft: retry
      }
      throw new Error('Supabase (createDraft): could not allocate a version label.');
    },
    async updateDraft(id, patch) {
      const columns: Record<string, unknown> = {};
      if (patch.rules !== undefined) columns.rules = patch.rules;
      if (patch.changeSummary !== undefined) columns.change_summary = patch.changeSummary;
      // The status filter makes the immutability check atomic with the write.
      const { data, error } = await write('update', { id, ...columns });
      if (error) fail('updateDraft', error);
      return data?.id ? toRecord(data as unknown as Row) : null;
    },
    async deleteDraft(id) {
      const { data, error } = await write('delete', { id });
      if (error) fail('deleteDraft', error);
      return Boolean(data?.id);
    },
    async activate(id, expectedActiveId, expectedRevision) {
      const { data, error } = await write('activate', { id, expected_active_id: expectedActiveId, expected_revision: expectedRevision });
      if (error?.message === 'Draft changed; refresh impact' || error?.message === 'Active policy changed; refresh impact') throw new ApiError(409, error.message);
      if (error) fail('activate', error);
      return toRecord(data as unknown as Row);
    },
  };
  return repo;
}
