import type { PolicyDocument } from '../policy-engine/schema.js';

export type VersionStatus = 'draft' | 'active' | 'archived';
export type VersionSource = 'upload' | 'edit' | 'seed';

export interface PolicyVersionRecord {
  id: string;
  versionLabel: string;
  rules: PolicyDocument;
  status: VersionStatus;
  changeSummary: string | null;
  source: VersionSource;
  parentVersionId: string | null;
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface NewDraft {
  rules: PolicyDocument;
  changeSummary: string | null;
  source: Exclude<VersionSource, 'seed'>;
  parentVersionId: string | null;
  createdBy: string;
}

/** Storage port. Supabase implements it in production; tests use an in-memory version. */
export interface PolicyRepo {
  list(): Promise<PolicyVersionRecord[]>;
  get(id: string): Promise<PolicyVersionRecord | null>;
  /** Assigns the next free label (v2, v3, …). */
  createDraft(draft: NewDraft): Promise<PolicyVersionRecord>;
  /** Only drafts can change; returns null if the version is missing or not a draft. */
  updateDraft(id: string, patch: { rules?: PolicyDocument; changeSummary?: string | null }): Promise<PolicyVersionRecord | null>;
  /** Only drafts can be deleted; returns false otherwise. */
  deleteDraft(id: string): Promise<boolean>;
  /** Archives the active version and activates this draft atomically. Throws if it is not a draft. */
  activate(id: string): Promise<PolicyVersionRecord>;
}

export type ImpactRecommendation = 'routine_processing' | 'request_information' | 'human_review';

export interface ImpactRow {
  caseId: string;
  caseStatus: 'open' | 'closed' | 'unknown';
  summary: string;
  before: { recommendation: ImpactRecommendation; ruleId: string };
  after: { recommendation: ImpactRecommendation; ruleId: string };
  /** The recommendation differs between the active version and the draft. */
  changed: boolean;
  /** Closed cases keep their recorded result; `after` equals `before` for them. */
  frozen: boolean;
  /** Closed case whose result WOULD change under the draft but stays frozen. */
  frozenWouldChange: boolean;
  /** Open case whose recommendation changes: it must be revisited. */
  needsRecheck: boolean;
}

export interface ImpactReport {
  base: { id: string; label: string };
  draft: { id: string; label: string };
  rows: ImpactRow[];
  totals: { cases: number; open: number; closed: number; needsRecheck: number; openUnchanged: number; frozenClosed: number; frozenWouldChange: number };
}

export function nextVersionLabel(labels: string[]): string {
  const max = labels.map(l => /^v(\d+)$/.exec(l)?.[1]).filter((n): n is string => n !== undefined).reduce((m, n) => Math.max(m, Number(n)), 0);
  return `v${max + 1}`;
}
