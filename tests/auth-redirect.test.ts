import { expect, it } from 'vitest';
import { authRedirectState } from '../src/auth-redirect.js';
it('captures invite and recovery intent before URL consumption', () => {
 for (const type of ['invite', 'recovery']) expect(authRedirectState(`#access_token=private&type=${type}`).passwordSetup).toBe(true);
 expect(authRedirectState('#/case/DEV-001')).toEqual({ passwordSetup: false, error: '' });
});
it('explains consumed/expired callbacks without reflecting untrusted URL content', () => {
 expect(authRedirectState('#error=access_denied&error_code=otp_expired').error).toContain('already been used');
 expect(authRedirectState('', '?error_code=otp_expired').error).toContain('expired');
 const result = authRedirectState('#error_description=secret-token');
 expect(result.error).toContain('could not be verified');
 expect(JSON.stringify(result)).not.toContain('secret-token');
});
