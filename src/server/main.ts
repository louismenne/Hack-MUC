import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { PolicyStore } from './store.js';
mkdirSync('.local', { recursive: true });
const seeds = ['labelled_development_cases.csv', 'unlabelled_practice_cases.csv'].flatMap(name => parse(readFileSync(`data/${name}`, 'utf8'), { columns: true }) as Record<string,string>[]);
const store = new PolicyStore(process.env.POLICY_DB ?? '.local/policies.sqlite', seeds);
store.installOfficialV2();
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status: number, body: unknown) => { res.writeHead(status); res.end(JSON.stringify(body)); };
  try {
    // Local prototype: browser mutations must originate from our local Vite UI.
    if (req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1):(5173|5174)$/.test(req.headers.origin)) { send(403, { error: 'Origin not allowed.' }); return; }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/api/policies') { send(200, { policies: store.list(), active: store.active(), history: store.history() }); return; }
    if (req.method === 'GET' && path === '/api/claims') { send(200, store.claims()); return; }
    if (req.method !== 'POST') { send(404, { error: 'Not found' }); return; }
    if (!req.headers['content-type']?.includes('application/json')) { send(415, { error: 'JSON required.' }); return; }
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 32000) throw new Error('Request too large.'); }
    const data = JSON.parse(body || '{}');
    if (path === '/api/policies') { send(201, store.draft(data.config, data.actor)); return; }
    const match = /^\/api\/policies\/([a-z0-9-]+)\/(preview|activate)$/.exec(path);
    if (!match) { send(404, { error: 'Not found' }); return; }
    send(200, match[2] === 'preview' ? store.preview(match[1]) : store.activate(match[1], data.token, data.actor));
  } catch (error) { send(400, { error: error instanceof Error ? error.message : 'Request failed' }); }
});
server.listen(3002, '127.0.0.1', () => console.log('Policy API on http://127.0.0.1:3002'));
process.on('SIGTERM', () => server.close(() => { store.close(); process.exit(); }));
