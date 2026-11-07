import { handleVoiceSession } from '../voice-session.js';

// Signed URL for the ElevenLabs claim-intake voice agent. Login and role required; secrets stay on the server.
export const POST = (request: Request) => handleVoiceSession(request);
