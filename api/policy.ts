import { handlePolicyRequest } from '../src/policy-api/http.js';
import { createDeps } from '../src/policy-api/server.js';

// Policy versions: list/get (GET) and create/update/discard/impact/activate (POST). Server-side only.
const handle = (request: Request) => handlePolicyRequest(request, 'policy', createDeps);
export const GET = handle;
export const POST = handle;
