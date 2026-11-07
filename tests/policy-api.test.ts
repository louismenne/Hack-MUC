import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validatePolicy, type PolicyDocument } from '../src/policy-engine/index.js';
import { loadCases } from '../src/policy-api/cases.js';
import { ApiError, handleAi, handleGet, handlePost, type ApiDeps } from '../src/policy-api/handlers.js';
import { handlePolicyRequest } from '../src/policy-api/http.js';
import { computeImpact } from '../src/policy-api/impact.js';
import type { PolicyVersionRecord } from '../src/policy-api/types.js';
import { memoryRepo } from './support/memory-repo.js';

const v1Json = JSON.parse(readFileSync(new URL('../policies/policy-v1.rules.json', import.meta.url), 'utf8'));
const parsed = validatePolicy(v1Json);
if (!parsed.ok) throw new Error('v1 invalid');
const v1: PolicyDocument = parsed.policy;
const cases = loadCases();
const doc = (n: number): PolicyDocument => (validatePolicy(limit(n)) as { policy: PolicyDocument }).policy;
const limit = (n: number) => { const d = structuredClone(v1Json); d.rules[0].when.any[6].value = n; return d; };

const setup = (ai: ApiDeps['ai'] = null) => {
  const repo = memoryRepo(v1);
  const deps: ApiDeps = { repo, loadCases: () => cases, ai, aiModel: 'test-model' };
  return { repo, deps };
};
const post = async (deps: ApiDeps, body: unknown) => handlePost(deps, body);
const body = (r: { body: unknown }) => r.body as any;
const rejects = async (p: Promise<unknown>, status: number) => {
  const error = await p.then(() => null, e => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  return error as ApiError;
};

describe('impact: "limit 1500 → 1200"', () => {
  it('changes exactly the expected open cases and freezes closed ones', () => {
    const { repo } = setup();
    return (async () => {
      const [active] = await repo.list();
      const draft = await repo.createDraft({ rules: doc(1200), changeSummary: null, source: 'edit', parentVersionId: active.id, createdBy: 'Louis' });
      const impact = computeImpact(active, draft, cases);
      const recheck = impact.rows.filter(r => r.needsRecheck).map(r => r.caseId);
      // 1500, 1201 and 1450 are above the new limit; exactly 1200 (PRA-002) is not.
      expect(recheck.sort()).toEqual(['DEV-010', 'PRA-003', 'PRA-004']);
      for (const id of recheck) expect(impact.rows.find(r => r.caseId === id)).toMatchObject({ before: { recommendation: 'routine_processing', ruleId: 'v1.rule3' }, after: { recommendation: 'human_review', ruleId: 'v2.rule1' } });
      expect(impact.rows.find(r => r.caseId === 'PRA-002')).toMatchObject({ changed: false, needsRecheck: false });
      // PRA-009 is closed (1350 €): it would change, but stays frozen with its recorded result.
      expect(impact.rows.find(r => r.caseId === 'PRA-009')).toMatchObject({ frozen: true, frozenWouldChange: true, changed: false, needsRecheck: false, after: { recommendation: 'routine_processing', ruleId: 'v1.rule3' } });
      expect(impact.rows.find(r => r.caseId === 'PRA-010')).toMatchObject({ frozen: true, frozenWouldChange: false });
      expect(impact.totals).toMatchObject({ cases: 26, open: 24, closed: 2, needsRecheck: 3, openUnchanged: 21, frozenClosed: 2, frozenWouldChange: 1 });
    })();
  });

  it('an identical draft changes nothing', async () => {
    const { repo } = setup();
    const [active] = await repo.list();
    const draft = await repo.createDraft({ rules: v1, changeSummary: null, source: 'edit', parentVersionId: active.id, createdBy: 'Louis' });
    const impact = computeImpact(active, draft, cases);
    expect(impact.totals.needsRecheck).toBe(0);
    expect(impact.rows.every(r => !r.changed)).toBe(true);
  });

  it('a case with unknown status is treated as open', async () => {
    const { repo } = setup();
    const [active] = await repo.list();
    const draft = await repo.createDraft({ rules: doc(100), changeSummary: null, source: 'edit', parentVersionId: active.id, createdBy: 'x' });
    const row = { ...cases[0], case_id: 'X-1', case_status: '' };
    const [r] = computeImpact(active, draft, [row]).rows;
    expect(r).toMatchObject({ caseStatus: 'unknown', frozen: false, needsRecheck: true });
  });
});

describe('policy API: versions', () => {
  it('lists versions and reports whether AI is available', async () => {
    const { deps } = setup();
    const r = await handleGet(deps, new URL('http://x/api/policy'));
    expect(body(r).aiAvailable).toBe(false);
    expect(body(r).versions).toHaveLength(1);
    expect(body(r).versions[0]).toMatchObject({ versionLabel: 'v1', status: 'active' });
  });
  it('loads one version and rejects bad or unknown ids', async () => {
    const { deps, repo } = setup();
    const [v] = await repo.list();
    expect(body(await handleGet(deps, new URL(`http://x/api/policy?id=${v.id}`))).version.versionLabel).toBe('v1');
    await rejects(handleGet(deps, new URL('http://x/api/policy?id=nope')), 400);
    await rejects(handleGet(deps, new URL('http://x/api/policy?id=00000000-0000-4000-8000-0000000000ff')), 404);
  });

  it('creates a draft from the active version, validated, with the next label', async () => {
    const { deps } = setup();
    const r = await post(deps, { action: 'create_draft', createdBy: ' Louis ', rules: limit(1200), changeSummary: 'Grenze auf 1.200 € gesenkt' });
    expect(r.status).toBe(201);
    expect(body(r).version).toMatchObject({ versionLabel: 'v2', status: 'draft', source: 'edit', createdBy: 'Louis', changeSummary: 'Grenze auf 1.200 € gesenkt' });
    const plain = await post(deps, { action: 'create_draft', createdBy: 'Louis' });
    expect(body(plain).version.versionLabel).toBe('v3');
    expect(body(plain).version.rules).toEqual(v1);
  });
  it('rejects invalid rules with readable errors, and missing names', async () => {
    const { deps, repo } = setup();
    const bad = limit(1200); bad.rules[0].when.any[0].field = 'nope';
    const e = await rejects(post(deps, { action: 'create_draft', createdBy: 'Louis', rules: bad }), 422);
    expect(e.details?.join('\n')).toContain('unknown field "nope"');
    await rejects(post(deps, { action: 'create_draft', rules: limit(1) }), 400);
    await rejects(post(deps, { action: 'create_draft', createdBy: '   ' }), 400);
    await rejects(post(deps, { action: 'wat' }), 400);
    expect(await repo.list()).toHaveLength(1);
  });

  it('only drafts can be edited: active and archived versions are immutable', async () => {
    const { deps, repo } = setup();
    const [active] = await repo.list();
    await rejects(post(deps, { action: 'update_draft', id: active.id, rules: limit(900) }), 409);
    const draft = body(await post(deps, { action: 'create_draft', createdBy: 'L' })).version;
    const edited = body(await post(deps, { action: 'update_draft', id: draft.id, rules: limit(1200) })).version;
    expect(edited.rules.rules[0].when.any[6].value).toBe(1200);
    await post(deps, { action: 'activate', id: draft.id, expectedActiveId: active.id });
    await rejects(post(deps, { action: 'update_draft', id: active.id, changeSummary: 'x' }), 409); // v1 is archived now
    await rejects(post(deps, { action: 'update_draft', id: draft.id, rules: limit(1) }), 409); // v2 is active now
    await rejects(post(deps, { action: 'discard_draft', id: draft.id }), 409);
    await rejects(post(deps, { action: 'update_draft', id: '00000000-0000-4000-8000-0000000000ff', changeSummary: 'x' }), 404);
    await rejects(post(deps, { action: 'update_draft', id: draft.id }), 400);
  });
  it('discards a draft', async () => {
    const { deps, repo } = setup();
    const draft = body(await post(deps, { action: 'create_draft', createdBy: 'L' })).version;
    await post(deps, { action: 'discard_draft', id: draft.id });
    expect(await repo.list()).toHaveLength(1);
  });
});

describe('policy API: impact and activation', () => {
  it('returns the impact of a draft against the active version', async () => {
    const { deps } = setup();
    const draft = body(await post(deps, { action: 'create_draft', createdBy: 'L', rules: limit(1200) })).version;
    const impact = body(await post(deps, { action: 'impact', id: draft.id })).impact;
    expect(impact.base.label).toBe('v1');
    expect(impact.draft.label).toBe('v2');
    expect(impact.totals.needsRecheck).toBe(3);
  });
  it('activating archives the old version and leaves exactly one active', async () => {
    const { deps, repo } = setup();
    const [v1rec] = await repo.list();
    const draft = body(await post(deps, { action: 'create_draft', createdBy: 'Louis', rules: limit(1200) })).version;
    const done = body(await post(deps, { action: 'activate', id: draft.id, expectedActiveId: v1rec.id })).version;
    expect(done).toMatchObject({ versionLabel: 'v2', status: 'active' });
    expect(done.activatedAt).toBeTruthy();
    const all = await repo.list();
    expect(all.map(v => [v.versionLabel, v.status])).toEqual([['v1', 'archived'], ['v2', 'active']]);
    expect(all.filter(v => v.status === 'active')).toHaveLength(1);
    await rejects(post(deps, { action: 'impact', id: draft.id }), 400); // active version vs itself
  });
  it('refuses a stale activation (active version changed since review) and non-drafts', async () => {
    const { deps, repo } = setup();
    const [v1rec] = await repo.list();
    const a = body(await post(deps, { action: 'create_draft', createdBy: 'A', rules: limit(1200) })).version;
    const b = body(await post(deps, { action: 'create_draft', createdBy: 'B', rules: limit(1000) })).version;
    await post(deps, { action: 'activate', id: a.id, expectedActiveId: v1rec.id });
    const e = await rejects(post(deps, { action: 'activate', id: b.id, expectedActiveId: v1rec.id }), 409);
    expect(e.message).toContain('geändert');
    await rejects(post(deps, { action: 'activate', id: a.id, expectedActiveId: a.id }), 409); // already active
    expect((await repo.list()).filter(v => v.status === 'active')).toHaveLength(1);
  });
});

describe('policy API: AI actions (mocked, no real Claude call)', () => {
  const fakeAi = (rules: unknown, summary = 'Grenze gesenkt.') => {
    const calls: Record<string, unknown>[] = [];
    return { calls, client: { messages: { async create(p: Record<string, unknown>) { calls.push(p); return { content: [{ type: 'tool_use', name: 'submit_policy', input: { change_summary: summary, rules: (rules as PolicyDocument).rules, default: (rules as PolicyDocument).default } }] }; } } } };
  };
  it('answers 503 with the German hint when no API key is configured', async () => {
    const { deps } = setup(null);
    const e = await rejects(handleAi(deps, { mode: 'instruction', createdBy: 'L', versionId: '00000000-0000-4000-8000-000000000001', instruction: 'x' }), 503);
    expect(e.message).toBe('KI nicht verfügbar, bitte manuell bearbeiten.');
  });
  it('instruction on the active version creates a DRAFT, never activates', async () => {
    const fake = fakeAi(limit(1200));
    const { deps, repo } = setup(fake.client);
    const [active] = await repo.list();
    const r = await handleAi(deps, { mode: 'instruction', createdBy: 'Louis', versionId: active.id, ruleId: 'rule1', instruction: 'Grenze auf 1.200 € senken' });
    expect(r.status).toBe(201);
    expect(body(r).version).toMatchObject({ versionLabel: 'v2', status: 'draft', source: 'edit', parentVersionId: active.id, changeSummary: 'Grenze gesenkt.' });
    expect((await repo.list()).filter(v => v.status === 'active').map(v => v.versionLabel)).toEqual(['v1']);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].model).toBe('test-model');
  });
  it('instruction on a draft updates that draft in place', async () => {
    const fake = fakeAi(limit(1200), 'Zweite Änderung.');
    const { deps, repo } = setup(fake.client);
    const draft = body(await post(deps, { action: 'create_draft', createdBy: 'L', changeSummary: 'Erste Änderung.' })).version;
    const r = await handleAi(deps, { mode: 'instruction', createdBy: 'L', versionId: draft.id, instruction: 'Grenze senken' });
    expect(r.status).toBe(200);
    expect(body(r).version.id).toBe(draft.id);
    expect(body(r).version.changeSummary).toBe('Erste Änderung. Zweite Änderung.');
    expect(await repo.list()).toHaveLength(2);
  });
  it('document upload creates an upload draft from the active version', async () => {
    const fake = fakeAi(limit(1200));
    const { deps } = setup(fake.client);
    const r = await handleAi(deps, { mode: 'document', createdBy: 'Louis', filename: 'policy-v2.md', text: '# Policy v2\nQuote limit 1200' });
    expect(body(r).version).toMatchObject({ source: 'upload', status: 'draft', versionLabel: 'v2' });
    await rejects(handleAi(deps, { mode: 'document', createdBy: 'L', pdfBase64: 'A'.repeat(3_400_000) }), 413);
  });
  it('a failing AI answer is a clear error and stores nothing', async () => {
    const bad = limit(1200); bad.rules[0].when.any[0].field = 'nope';
    const { deps, repo } = setup(fakeAi(bad).client);
    const [active] = await repo.list();
    const e = await rejects(handleAi(deps, { mode: 'instruction', createdBy: 'L', versionId: active.id, instruction: 'x' }), 502);
    expect(e.message).toContain('keinen gültigen Regelvorschlag');
    expect(e.details?.join('\n')).toContain('unknown field "nope"');
    expect(await repo.list()).toHaveLength(1);
  });
  it('validates the request', async () => {
    const { deps, repo } = setup(fakeAi(limit(1)).client);
    const [active] = await repo.list();
    await rejects(handleAi(deps, { mode: 'instruction', createdBy: 'L', versionId: active.id, instruction: 'x', ruleId: 'ghost' }), 400);
    await rejects(handleAi(deps, { mode: 'instruction', createdBy: 'L', versionId: active.id }), 400);
    await rejects(handleAi(deps, { mode: 'other', createdBy: 'L' }), 400);
  });
});

describe('HTTP wrapper', () => {
  const req = (method: string, path: string, json?: unknown) => new Request(`http://localhost${path}`, { method, headers: json === undefined ? {} : { 'content-type': 'application/json' }, body: json === undefined ? undefined : JSON.stringify(json) });
  it('turns ApiError into a JSON error and never leaks internals', async () => {
    const missing = () => { throw new ApiError(503, 'Supabase ist nicht konfiguriert.'); };
    const r = await handlePolicyRequest(req('GET', '/api/policy'), 'policy', missing);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: 'Supabase ist nicht konfiguriert.' });
    const boom = () => { throw new Error('secret-key-abc connection string'); };
    const r500 = await handlePolicyRequest(req('GET', '/api/policy'), 'policy', boom);
    expect(r500.status).toBe(500);
    expect(JSON.stringify(await r500.json())).not.toContain('secret');
  });
  it('routes GET and POST, checks method, content type and JSON', async () => {
    const { deps } = setup();
    expect((await handlePolicyRequest(req('GET', '/api/policy'), 'policy', () => deps)).status).toBe(200);
    expect((await handlePolicyRequest(req('POST', '/api/policy', { action: 'create_draft', createdBy: 'L' }), 'policy', () => deps)).status).toBe(201);
    expect((await handlePolicyRequest(req('DELETE', '/api/policy'), 'policy', () => deps)).status).toBe(405);
    expect((await handlePolicyRequest(req('GET', '/api/policy-ai'), 'ai', () => deps)).status).toBe(405);
    expect((await handlePolicyRequest(new Request('http://localhost/api/policy', { method: 'POST', body: '{}' }), 'policy', () => deps)).status).toBe(415);
    const badJson = await handlePolicyRequest(new Request('http://localhost/api/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }), 'policy', () => deps);
    expect(badJson.status).toBe(400);
    expect((await handlePolicyRequest(req('POST', '/api/policy-ai', { mode: 'instruction', createdBy: 'L' }), 'ai', () => deps)).status).toBe(503);
  });
});

describe('versions are listed with their metadata', () => {
  it('has label, status, source, creator, date and change summary', async () => {
    const { repo } = setup();
    const [v] = (await repo.list()) as PolicyVersionRecord[];
    expect(v).toMatchObject({ versionLabel: 'v1', status: 'active', source: 'seed', createdBy: 'Participant policy' });
    expect(v.createdAt).toBeTruthy();
    expect(v.changeSummary).toBeTruthy();
  });
});
