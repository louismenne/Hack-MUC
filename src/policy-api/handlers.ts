import { validatePolicy, type PolicyDocument } from '../policy-engine/schema.js';
import { AiError, suggestPolicy, type AiClient } from '../policy-ai/suggest.js';
import { computeImpact } from './impact.js';
import { policyHistoryFrom } from '../policy-engine/history.js';
import type { PolicyRepo, PolicyVersionRecord } from './types.js';

export interface ApiDeps {
  repo: PolicyRepo;
  storedImpact?: (base: PolicyVersionRecord, draft: PolicyVersionRecord) => Promise<import('./types.js').ImpactReport>;
  loadCases: () => Record<string, string>[];
  /** null = no ANTHROPIC_API_KEY: AI actions answer 503, everything else keeps working. */
  ai: AiClient | null;
  aiModel: string;
}
export interface ApiResult {
  status: number;
  body: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const AI_UNAVAILABLE = 'AI unavailable. Edit manually instead.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_CHARS = 60_000;
const MAX_PDF_BASE64 = 3_300_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ok = (body: unknown, status = 200): ApiResult => ({ status, body });

function str(
  body: Record<string, unknown>,
  key: string,
  { max, required = true }: { max: number; required?: boolean },
): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ApiError(400, `"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max)
    throw new ApiError(400, `"${key}" must be text of at most ${max} characters.`);
  return v.trim();
}
function uuid(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !UUID.test(v)) throw new ApiError(400, `"${key}" is not a valid version ID.`);
  return v;
}
function rulesFrom(value: unknown): PolicyDocument {
  const result = validatePolicy(value);
  if (!result.ok) throw new ApiError(422, 'The rules JSON is invalid.', result.errors);
  return result.policy;
}
async function mustGet(repo: PolicyRepo, id: string): Promise<PolicyVersionRecord> {
  const v = await repo.get(id);
  if (!v) throw new ApiError(404, 'Version not found.');
  return v;
}
async function mustActive(repo: PolicyRepo): Promise<PolicyVersionRecord> {
  const active = (await repo.list()).find((v) => v.status === 'active');
  if (!active) throw new ApiError(409, 'There is no active version.');
  return active;
}

export async function handleGet(deps: ApiDeps, url: URL): Promise<ApiResult> {
  const id = url.searchParams.get('id');
  if (id !== null) {
    if (!UUID.test(id)) throw new ApiError(400, '"id" is not a valid version ID.');
    return ok({ version: await mustGet(deps.repo, id) });
  }
  return ok({ aiAvailable: deps.ai !== null, versions: await deps.repo.list() });
}

export async function handlePost(deps: ApiDeps, raw: unknown): Promise<ApiResult> {
  if (!isObject(raw)) throw new ApiError(400, 'Expected a JSON object.');
  const { repo } = deps;
  switch (raw.action) {
    case 'create_draft': {
      const active = await mustActive(repo);
      const createdBy = str(raw, 'createdBy', { max: 100 })!;
      const parent = raw.parentId === undefined ? active : await mustGet(repo, uuid(raw, 'parentId'));
      const rules = raw.rules === undefined ? parent.rules : rulesFrom(raw.rules);
      const changeSummary = str(raw, 'changeSummary', { max: 1000, required: false }) ?? null;
      return ok(
        {
          version: await repo.createDraft({
            rules,
            changeSummary,
            source: 'edit',
            parentVersionId: parent.id,
            createdBy,
          }),
        },
        201,
      );
    }
    case 'update_draft': {
      const id = uuid(raw, 'id');
      const patch: { rules?: PolicyDocument; changeSummary?: string | null } = {};
      if (raw.rules !== undefined) patch.rules = rulesFrom(raw.rules);
      if (raw.changeSummary !== undefined)
        patch.changeSummary = str(raw, 'changeSummary', { max: 1000, required: false }) ?? null;
      if (!Object.keys(patch).length) throw new ApiError(400, 'Nothing to change.');
      const updated = await repo.updateDraft(id, patch);
      if (!updated)
        throw new ApiError(
          (await repo.get(id)) ? 409 : 404,
          'Only drafts can be edited. Active and archived versions are read-only.',
        );
      return ok({ version: updated });
    }
    case 'discard_draft': {
      const id = uuid(raw, 'id');
      if (!(await repo.deleteDraft(id)))
        throw new ApiError((await repo.get(id)) ? 409 : 404, 'Only drafts can be discarded.');
      return ok({ discarded: id });
    }
    case 'impact': {
      const draft = await mustGet(repo, uuid(raw, 'id'));
      const versions = await repo.list();
      const active = versions.find((v) => v.status === 'active');
      if (!active) throw new ApiError(409, 'There is no active version.');
      if (draft.id === active.id) throw new ApiError(400, 'The active version cannot be compared with itself.');
      // Closed claims keep the decision of the original version, not of whatever is active now.
      const originalLabel = policyHistoryFrom(versions).original.label;
      const original = versions.find((v) => v.versionLabel === originalLabel) ?? active;
      return ok({
        impact: deps.storedImpact
          ? await deps.storedImpact(active, draft)
          : computeImpact(active, draft, deps.loadCases(), original),
      });
    }
    case 'activate': {
      const draft = await mustGet(repo, uuid(raw, 'id'));
      const expectedActive = uuid(raw, 'expectedActiveId');
      if (draft.status !== 'draft')
        throw new ApiError(409, `Only a draft can be activated (this version is ${draft.status}).`);
      const expectedRevision = raw.expectedRevision;
      if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        throw new ApiError(400, 'A draft revision from the impact preview is required.');
      if (draft.revision !== expectedRevision)
        throw new ApiError(409, 'The draft has changed. Reload the impact and check again.');
      rulesFrom(draft.rules);
      const active = await mustActive(repo);
      if (active.id !== expectedActive)
        throw new ApiError(409, 'The active version has changed in the meantime. Reload the impact and check again.');
      return ok({ version: await repo.activate(draft.id, expectedActive, expectedRevision) });
    }
    default:
      throw new ApiError(400, 'Unknown action.');
  }
}

/** AI actions: Claude proposes rule JSON, which is validated and stored as a DRAFT. It never activates. */
export async function handleAi(deps: ApiDeps, raw: unknown): Promise<ApiResult> {
  if (!isObject(raw)) throw new ApiError(400, 'Expected a JSON object.');
  if (!deps.ai) throw new ApiError(503, AI_UNAVAILABLE);
  const createdBy = str(raw, 'createdBy', { max: 100 })!;
  const { repo } = deps;
  try {
    if (raw.mode === 'document') {
      const filename = str(raw, 'filename', { max: 200, required: false });
      const active = await mustActive(repo);
      let document:
        | { kind: 'text'; text: string; filename?: string }
        | { kind: 'pdf'; base64: string; filename?: string };
      if (typeof raw.pdfBase64 === 'string') {
        if (raw.pdfBase64.length > MAX_PDF_BASE64) throw new ApiError(413, 'The PDF is too large (max. about 2.4 MB).');
        document = { kind: 'pdf', base64: raw.pdfBase64, filename };
      } else {
        const text = str(raw, 'text', { max: MAX_TEXT_CHARS })!;
        document = { kind: 'text', text, filename };
      }
      const s = await suggestPolicy(
        deps.ai,
        { mode: 'document', current: active.rules, document },
        { model: deps.aiModel },
      );
      const version = await repo.createDraft({
        rules: s.policy,
        changeSummary: s.changeSummary,
        source: 'upload',
        parentVersionId: active.id,
        createdBy,
      });
      return ok({ version }, 201);
    }
    if (raw.mode === 'instruction') {
      const base = await mustGet(repo, uuid(raw, 'versionId'));
      const instruction = str(raw, 'instruction', { max: 1000 })!;
      const ruleId = str(raw, 'ruleId', { max: 64, required: false });
      if (ruleId && !base.rules.rules.some((r) => r.id === ruleId) && base.rules.default.id !== ruleId)
        throw new ApiError(400, `Rule “${ruleId}” does not exist.`);
      const s = await suggestPolicy(
        deps.ai,
        { mode: 'instruction', current: base.rules, instruction, ruleId },
        { model: deps.aiModel },
      );
      if (base.status === 'draft') {
        const summary = [base.changeSummary, s.changeSummary].filter(Boolean).join(' ').slice(0, 1000);
        const updated = await repo.updateDraft(base.id, { rules: s.policy, changeSummary: summary });
        if (!updated) throw new ApiError(409, 'The draft has since been activated or discarded.');
        return ok({ version: updated });
      }
      const version = await repo.createDraft({
        rules: s.policy,
        changeSummary: s.changeSummary,
        source: 'edit',
        parentVersionId: base.id,
        createdBy,
      });
      return ok({ version }, 201);
    }
    throw new ApiError(400, '"mode" must be "document" or "instruction".');
  } catch (error) {
    if (error instanceof AiError) throw new ApiError(502, error.message, error.details);
    throw error;
  }
}
