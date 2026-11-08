import { handleQualityChat } from '../../quality-agent/http.js';
export const GET = (request: Request) => handleQualityChat(request);
export const POST = GET;
