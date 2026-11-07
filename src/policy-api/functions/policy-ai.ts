import { handlePolicyRequest } from '../http.js';
import { createDeps } from '../server.js';

// AI drafts (Claude proposes rule JSON; a human activates). Needs more time than the default.
export const POST = (request: Request) => handlePolicyRequest(request, 'ai', createDeps);
