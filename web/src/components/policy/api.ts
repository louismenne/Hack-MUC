import { authenticatedFetch } from '@/lib/supabase';
import type { ImpactReport, PolicyVersionRecord } from '../../../../src/policy-api/types';
import type { PolicyDocument } from '../../../../src/policy-engine/schema';

export type { ImpactReport, PolicyVersionRecord, PolicyDocument };

export class ApiFailure extends Error {
  constructor(message: string, readonly details: string[] = [], readonly status = 0) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await authenticatedFetch(path, init); } catch { throw new ApiFailure('The policy API is not reachable.'); }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiFailure('The policy API is not reachable. Start it locally with “npm run dev”; on Vercel the Supabase variables must be set.', [], response.status);
  }
  const data = await response.json();
  if (!response.ok) throw new ApiFailure(data.error ?? 'Request failed.', data.details ?? [], response.status);
  return data as T;
}
const post = <T,>(path: string, body: unknown) => call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const policyApi = {
  overview: () => call<{ aiAvailable: boolean; versions: PolicyVersionRecord[] }>('/api/policy'),
  createDraft: (b: { investigationId?: string; investigationRevision?: number; createdBy: string; parentId?: string; rules?: PolicyDocument; changeSummary?: string }) => post<{ version: PolicyVersionRecord }>('/api/policy', { action: 'create_draft', ...b }),
  updateDraft: (b: { id: string; rules?: PolicyDocument; changeSummary?: string }) => post<{ version: PolicyVersionRecord }>('/api/policy', { action: 'update_draft', ...b }),
  discardDraft: (id: string) => post<{ discarded: string }>('/api/policy', { action: 'discard_draft', id }),
  impact: (id: string, rules?: PolicyDocument) => post<{ impact: ImpactReport }>('/api/policy', { action: 'impact', id, ...(rules ? { rules } : {}) }),
  activate: (id: string, expectedActiveId: string, expectedRevision: number) => post<{ version: PolicyVersionRecord }>('/api/policy', { action: 'activate', id, expectedActiveId, expectedRevision }),
  aiFromDocument: (b: { createdBy: string; filename: string; text?: string; pdfBase64?: string }) => post<{ version: PolicyVersionRecord }>('/api/policy-ai', { mode: 'document', ...b }),
  aiInstruction: (b: { createdBy: string; versionId: string; ruleId?: string; instruction: string }) => post<{ version?: PolicyVersionRecord; answer?: string }>('/api/policy-ai', { mode: 'instruction', ...b }),
};

export const AI_UNAVAILABLE = 'AI unavailable. Edit manually instead.';
