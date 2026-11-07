import { resolve } from 'node:path';
import { loadEnv, type Plugin } from 'vite';

type Handler = (request: Request) => Promise<Response>;

/**
 * Local dev only: serves the same /api/policy and /api/policy-ai functions that Vercel runs in
 * production, so `npm run dev` needs no extra process. Secrets come from .env.local and stay in
 * this Node process (they are not VITE_-prefixed, so they never reach the browser bundle).
 */
export function policyApiPlugin(repoRoot: string): Plugin {
  const routes: Record<string, { file: string; methods: string[] }> = {
    '/api/policy': { file: 'src/policy-api/functions/policy.ts', methods: ['GET', 'POST'] },
    '/api/policy-ai': { file: 'src/policy-api/functions/policy-ai.ts', methods: ['POST'] },
    '/api/voice-session': { file: 'src/policy-api/functions/voice-session.ts', methods: ['POST'] },
  };
  return {
    name: 'policy-api',
    apply: 'serve',
    configureServer(server) {
      for (const [key, value] of Object.entries(loadEnv(server.config.mode, repoRoot, ''))) if (process.env[key] === undefined) process.env[key] = value;
      server.middlewares.use(async (req, res, next) => {
        const route = routes[(req.url ?? '').split('?')[0]];
        if (!route) return next();
        const method = req.method ?? 'GET';
        const send = (status: number, body: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
        if (!route.methods.includes(method)) return send(405, { error: 'Methode nicht erlaubt.' });
        try {
          const chunks: Buffer[] = [];
          if (method !== 'GET') for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://localhost${req.url}`, { method, headers, body: method === 'GET' ? undefined : Buffer.concat(chunks) });
          const mod = await server.ssrLoadModule(resolve(repoRoot, route.file));
          const handler = mod[method] as Handler | undefined;
          if (!handler) return send(405, { error: 'Methode nicht erlaubt.' });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error('policy api dev error', error instanceof Error ? error.message : 'unknown');
          send(500, { error: 'Interner Fehler.' });
        }
      });
    },
  };
}
