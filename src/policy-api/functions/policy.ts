import { handlePolicyRequest } from '../http.js';
import { createDeps } from '../server.js';

// Policy versions: list/get (GET) and create/update/discard/impact/activate (POST). Server-side only.
const handle = (request: Request) => handlePolicyRequest(request, 'policy', actorId => createDeps(process.env, actorId));
export const GET = handle;
export const POST = handle;
