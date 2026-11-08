import { parse, toSql } from 'pgsql-ast-parser';

// These CTEs are evaluated by production PostgreSQL on EVERY tool call. No copied dataset.
// Exclude contact details, policy references, attachments, and arbitrary audit metadata.
export const LIVE_RELATIONS = `
claims AS (SELECT id, case_id, case_status, received_at, claim_type, repair_type, quote_eur,
 policy_active_on_incident, incident_report_present, itemized_quote_present, injury_reported,
 liability_disputed, duplicate_flag, evidence_conflict, is_test FROM public.claims),
decisions AS (SELECT id, claim_id, policy_id, created_at,
 decision->>'policyVersion' AS policy_version, decision->>'ruleId' AS rule_id,
 decision->>'recommendation' AS recommendation, decision->'missingFields' AS missing_fields,
 (input_snapshot->>'quote_eur')::numeric AS quote_eur,
 input_snapshot->>'repair_type' AS repair_type FROM public.claim_decisions),
reviews AS (SELECT id, sequence, occurred_at, action,
 details->>'decisionId' AS decision_id, details->>'caseId' AS case_id,
 details->>'policyVersion' AS policy_version, details->>'ruleId' AS rule_id,
 details->>'automated' AS automated, details->>'next' AS next,
 left(details->>'reason', 500) AS reason FROM public.audit_log
 WHERE entity_type='review' AND details->>'datasetId'='stored' AND details->>'decisionSource'='server_engine'),
latest_reviews AS (SELECT DISTINCT ON (decision_id) * FROM reviews ORDER BY decision_id, sequence DESC),
policies AS (SELECT id, version_label, status, rules, created_at, activated_at FROM public.policy_versions)`;

const relations = new Set(['claims', 'decisions', 'reviews', 'latest_reviews', 'policies']);
const nodeTypes = new Set(['select', 'with', 'union', 'union all', 'table', 'statement', 'ref', 'call', 'binary', 'unary', 'integer', 'numeric', 'string', 'boolean', 'null', 'cast', 'case', 'list', 'ternary', 'extract', 'keyword', 'array', 'array select', 'member', 'arrayIndex', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN']);
const functions = new Set(['count', 'sum', 'avg', 'min', 'max', 'round', 'abs', 'coalesce', 'nullif', 'date_trunc', 'date_part', 'now', 'lower', 'upper', 'length', 'left', 'greatest', 'least', 'row_number', 'rank', 'dense_rank', 'lag', 'lead', 'jsonb_array_length', 'jsonb_typeof', 'jsonb_extract_path_text']);
const types = new Set(['text', 'numeric', 'decimal', 'int', 'integer', 'bigint', 'float', 'float8', 'double precision', 'real', 'boolean', 'date', 'timestamp', 'timestamptz', 'interval', 'uuid']);

/** Fail closed on unknown SQL constructs. The database read-only execution is a second boundary. */
export function productionQuery(sql: string): string {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > 8000) throw new Error('Use one SELECT query of at most 8,000 characters.');
  let statements;
  try { statements = parse(sql); } catch { throw new Error('SQL could not be parsed. Use PostgreSQL SELECT syntax with the documented relations.'); }
  if (statements.length !== 1 || !['select', 'with', 'union', 'union all'].includes(statements[0].type)) throw new Error('Only one read-only SELECT query is allowed.');
  const check = (v: unknown, names: Set<string>): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(item => check(item, names)); return; }
    const o = v as Record<string, any>;
    if (o.type === 'with') {
      const local = new Set(names);
      for (const binding of o.bind) {
        if (relations.has(binding.alias.name)) throw new Error('Do not redefine the supplied relations.');
        check(binding.statement, local);
        local.add(binding.alias.name);
      }
      check(o.in, local);
      return;
    }
    if (typeof o.type === 'string' && !nodeTypes.has(o.type)) throw new Error(`Unsupported SQL construct: ${o.type}.`);
    if (o.type === 'table' && (o.name?.schema || !names.has(o.name?.name))) throw new Error('Query only claims, decisions, reviews, latest_reviews, policies, or your own SELECT CTEs.');
    if (o.type === 'ref' && o.table?.schema) throw new Error('Schema-qualified references are not allowed.');
    if (o.type === 'call' && (o.function?.schema || !functions.has(o.function?.name?.toLowerCase()))) throw new Error('This SQL function is not permitted. Use standard aggregate/date functions.');
    if (o.type === 'cast' && (o.to?.schema || !types.has(o.to?.name?.toLowerCase()))) throw new Error('This SQL cast is not permitted.');
    if (o.for || o.into) throw new Error('Locking or writing SELECT queries are not permitted.');
    Object.values(o).forEach(item => check(item, names));
  };
  check(statements, new Set(relations));
  const clean = toSql.statement(statements[0]).replace(/;\s*$/, '');
  return `WITH ${LIVE_RELATIONS} SELECT * FROM (${clean}) AS agent_result LIMIT 101`;
}
