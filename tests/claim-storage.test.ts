import { expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimInsert, configureClaimsClient, loadClaimForFollowup, submitClaim } from '../src/claim-intake/adapter.js';
import { claimIntakeConfig } from '../src/claim-intake/config.js';
afterEach(() => { claimIntakeConfig.claimsTable = 'claims'; claimIntakeConfig.claimsBucket = 'claim-documents'; });
function mockClient(role = 'claims_handler', fail = false) {
 const insert = vi.fn(() => ({ select: () => ({ single: async () => fail ? { error: { message: 'denied' } } : { data: { case_id: 'CLM-server', submitted_by: 'user', is_test: false, attachments: [] }, error: null } }) }));
 const upload = vi.fn(async () => ({ error: null }));
 const remove = vi.fn(async () => ({ error: null }));
 const db = { auth: { getUser: async () => ({ data: { user: { id: 'user', app_metadata: { hack_muc_role: role } } }, error: null }) }, from: () => ({ insert }), storage: { from: () => ({ upload, remove }) } };
 configureClaimsClient(db as unknown as SupabaseClient);
 claimIntakeConfig.claimsTable = 'claims'; claimIntakeConfig.claimsBucket = 'claim-documents';
 return { insert, upload, remove };
}
it('only inserts claimant facts, never spoofed system columns or internal flags', () => {
 const row = claimInsert({ claimant_name: 'Test', submitted_by: 'someone-else', case_id: 'forged', received_at: 'yesterday', policy_active_on_incident: true, duplicate_flag: false, is_test: true });
 expect(row.claimant_name).toBe('Test');
 for (const key of ['submitted_by','case_id','received_at','policy_active_on_incident','duplicate_flag','is_test']) expect(row).not.toHaveProperty(key);
});
it('returns database-generated values only after saving and links uploaded documents', async () => {
 const { insert, upload } = mockClient();
 const result = await submitClaim({ claimant_name: 'Test' }, [new File(['pdf'], 'report.pdf', { type: 'application/pdf' })]);
 expect(result.mode).toBe('saved'); expect(result.payload.case_id).toBe('CLM-server');
 expect(upload).toHaveBeenCalledOnce();
 expect(insert.mock.calls[0]).toEqual([expect.objectContaining({ attachments: [expect.objectContaining({ name: 'report.pdf', path: expect.stringMatching(/^user\//) })] })]);
});
it('cleans uploads on failed insert and does not report success', async () => {
 const { remove } = mockClient('claims_handler', true);
 await expect(submitClaim({}, [new File(['pdf'], 'x.pdf', { type: 'application/pdf' })])).rejects.toThrow('Could not save claim');
 expect(remove).toHaveBeenCalledOnce();
});
it('rejects unauthorized roles and oversized files before writing', async () => {
 const { insert, upload } = mockClient('policy_manager');
 await expect(submitClaim({}, [])).rejects.toThrow('role required');
 expect(insert).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
 const allowed = mockClient();
 await expect(submitClaim({}, [{ name: 'large.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 } as File])).rejects.toThrow('10 MB');
 expect(allowed.upload).not.toHaveBeenCalled(); expect(allowed.insert).not.toHaveBeenCalled();
});

it('supplements the existing open claim and preserves its attachments', async () => {
 const upload = vi.fn(async () => ({ error: null }));
 const update = vi.fn(() => query);
 const eq = vi.fn(() => query);
 const query = { eq, select: () => ({ single: async () => ({ data: { id: 'claim-id', case_id: 'CLM-original' }, error: null }) }) };
 configureClaimsClient({ auth: { getUser: async () => ({ data: { user: { id: 'user', app_metadata: { hack_muc_role: 'claims_handler' } } } }) }, from: () => ({ update }), storage: { from: () => ({ upload }) } } as unknown as SupabaseClient);
 const old = { name: 'original.pdf', size: 3, type: 'application/pdf', path: 'user/original' };
 const result = await submitClaim({ quote_eur: 500 }, [new File(['new'], 'quote.pdf', { type: 'application/pdf' })], { mode: 'saved', payload: { id: 'claim-id' }, files: [old] });
 expect(eq.mock.calls).toEqual([['id', 'claim-id'], ['submitted_by', 'user'], ['case_status', 'open'], ['revision', 0]]);
 expect(update).toHaveBeenCalledWith(expect.objectContaining({ quote_eur: 500, attachments: [old, expect.objectContaining({ name: 'quote.pdf' })] }));
 expect(result.payload.case_id).toBe('CLM-original');
 expect(result.files).toHaveLength(2);
});

it('reloads only the owner’s open claim, preserving revision and attachments', async () => {
 const file = { name: 'old.pdf', path: 'user/old', type: 'application/pdf', size: 10 };
 const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: '00000000-0000-4000-8000-000000000001', revision: 4, claimant_name: 'Owner', attachments: [file] }, error: null }) };
 configureClaimsClient({ auth: { getUser: async () => ({ data: { user: { id: 'user', app_metadata: { hack_muc_role: 'claims_handler' } } } }) }, from: () => query } as unknown as SupabaseClient);
 const loaded = await loadClaimForFollowup('00000000-0000-4000-8000-000000000001');
 expect(query.eq.mock.calls).toContainEqual(['submitted_by', 'user']);
 expect(query.eq.mock.calls).toContainEqual(['case_status', 'open']);
 expect(loaded.payload.revision).toBe(4);
 expect(loaded.files).toEqual([file]);
 query.maybeSingle.mockResolvedValueOnce({ data: null, error: null } as any);
 await expect(loadClaimForFollowup('00000000-0000-4000-8000-000000000002')).rejects.toThrow('unavailable');
});

it('rejects stale follow-up writes instead of overwriting another submission', async () => {
 const query = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No matching revision' } }) };
 configureClaimsClient({ auth: { getUser: async () => ({ data: { user: { id: 'user', app_metadata: { hack_muc_role: 'claims_handler' } } } }) }, from: () => ({ update: () => query }) } as unknown as SupabaseClient);
 await expect(submitClaim({}, [], { mode: 'saved', payload: { id: 'claim', revision: 3 }, files: [] })).rejects.toThrow('Could not save claim');
 expect(query.eq).toHaveBeenCalledWith('revision', 3);
});
