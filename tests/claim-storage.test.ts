import { expect, it, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimInsert, configureClaimsClient, submitClaim } from '../src/claim-intake/adapter.js';
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
