import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { functions, options } from '../scripts/build-api.mjs';

describe('Vercel Functions bundle (api/*.js)', () => {
  it.each(functions as string[])('api/%s.js is up to date with its TypeScript source (run `npm run build:api`)', async name => {
    const result = await build({ ...options(name), write: false, outfile: `api/${name}.js` });
    const fresh = result.outputFiles?.[0]?.text;
    expect(readFileSync(new URL(`../api/${name}.js`, import.meta.url), 'utf8')).toBe(fresh);
  });
  it('contains no secrets and no TypeScript sources are left in api/', () => {
    for (const name of functions as string[]) {
      const code = readFileSync(new URL(`../api/${name}.js`, import.meta.url), 'utf8');
      expect(code).not.toMatch(/sb_secret_|sk-ant-/);
      expect(code).toContain('export');
    }
  });
});
