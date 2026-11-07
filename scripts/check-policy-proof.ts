import { evaluatePolicyDocument, validatePolicy } from '../src/policy-engine/index.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'csv-parse/sync';
import { booleanFields, parseClaim } from '../src/triage.js';
import { evaluatePolicy, policyV1, policyV2, type PolicyConfig } from '../src/server/legacy-policy.js';

const lean = process.env.LEAN_BIN || 'lean';
const scratch = mkdtempSync(join(tmpdir(), 'hack-muc-proof-'));
const jsonPolicies = [policyV1, policyV2].map((policy, i) => {
  const parsed = validatePolicy(JSON.parse(readFileSync(`policies/policy-v${i + 1}.rules.json`, 'utf8')));
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return { policy, rules: parsed.policy };
});
const lines: string[] = [];
const expected: string[] = [];
const base: Record<string, string> = {
  case_id: 'generated', case_status: 'open', claim_summary: 'Structured facts only',
  claim_type: 'motor_own_damage', repair_type: 'standard', quote_eur: '1500',
  policy_active_on_incident: 'True', incident_report_present: 'True', itemized_quote_present: 'True',
  injury_reported: 'False', liability_disputed: 'False', duplicate_flag: 'False', evidence_conflict: 'False',
};
// This adapter is part of the trusted/tested bridge, not a Lean theorem about JS parsing.
function add(row: Record<string, string>, policy: PolicyConfig) {
  const c = parseClaim(row);
  const bool = (v: unknown): string => v === true ? 'T' : v === false ? 'F' : '?';
  const text = (v: unknown) => v === null ? '?' : String(v);
  const quote = c.quote_eur === null ? '?' : String(Math.round(Number(c.quote_eur) * 100));
  lines.push([
    c.policy_active_on_incident, c.incident_report_present, c.itemized_quote_present,
    c.injury_reported, c.liability_disputed, c.duplicate_flag, c.evidence_conflict,
  ].map(bool).concat([
    text(c.claim_type), text(c.repair_type), quote,
    [c.case_id, c.case_status, c.claim_summary].every(v => v !== null) ? 'T' : 'F',
    String(Math.round(policy.routineQuoteLimitEur * 100)),
    policy.humanReviewRepairTypes.includes('ev_high_voltage_battery') ? 'T' : 'F',
    bool(policy.requireIncidentReport), bool(policy.requireItemizedQuote),
  ]).join('\t'));
  const outcome = evaluatePolicy(c, policy, 'conformance').recommendation;
  const json = jsonPolicies.find(p => p.policy === policy);
  if (json && evaluatePolicyDocument(json.rules, 'conformance', row).recommendation !== outcome) throw new Error('JSON/TypeScript disagreement: ' + JSON.stringify(row));
  expected.push(outcome);
}
const policies = [policyV1, policyV2, { ...policyV1, requireIncidentReport: false, requireItemizedQuote: false }];
for (const policy of policies) {
  // Every true/false/unknown combination of all seven Boolean facts, at five quote values.
  for (let n = 0; n < 3 ** booleanFields.length; n++) {
    let digits = n;
    const row = { ...base };
    for (const field of booleanFields) { row[field] = ['True', 'False', ''][digits % 3]; digits = Math.floor(digits / 3); }
    for (const quote_eur of ['', '1200', '1200.01', '1500', '1500.01']) add({ ...row, quote_eur }, policy);
  }
  for (const claim_type of ['motor_own_damage', 'theft', ''])
    for (const repair_type of ['standard', 'ev_high_voltage_battery', ''])
      for (const field of ['case_id', 'case_status', 'claim_summary'])
        for (const missing of [false, true]) add({ ...base, claim_type, repair_type, ...(missing ? { [field]: '' } : {}) }, policy);
  for (const requireIncidentReport of [true, false]) for (const requireItemizedQuote of [true, false])
    for (const value of ['True', 'False', '']) add({ ...base, incident_report_present: value, itemized_quote_present: value }, { ...policy, requireIncidentReport, requireItemizedQuote });
}
for (const name of ['labelled_development_cases.csv', 'unlabelled_practice_cases.csv']) {
  const rows = parse(readFileSync(`data/${name}`, 'utf8'), { columns: true }) as Record<string,string>[];
  for (const row of rows) {
    if (row.expected_v1 && evaluatePolicy(parseClaim(row), policyV1, 'v1').recommendation !== row.expected_v1) throw new Error(`Development label mismatch: ${row.case_id}`);
    add(row, policyV1);
    add(row, policyV2);
  }
}
try {
  const source = readFileSync('formal/Policy.lean', 'utf8');
  if (/\b(sorry|admit|axiom)\b/.test(source)) throw new Error('Proof source contains an unchecked placeholder or custom axiom.');
  const version = execFileSync(lean, ['--version'], { encoding: 'utf8' }).trim();
  if (!version.includes('version 4.35.0,')) throw new Error(`Expected Lean 4.35.0; got ${version}`);
  console.log(version);
  console.log(execFileSync(lean, ['-o', join(scratch, 'Policy.olean'), 'formal/Policy.lean'], { encoding: 'utf8' }));
  writeFileSync(join(scratch, 'input.tsv'), lines.join('\n') + '\n');
  execFileSync(lean, ['--run', 'formal/Conformance.lean', join(scratch, 'input.tsv'), join(scratch, 'output.txt')], {
    encoding: 'utf8', env: { ...process.env, LEAN_PATH: [scratch, resolve('formal')].join(':') }, timeout: 120000,
  });
  const actual = readFileSync(join(scratch, 'output.txt'), 'utf8').trim().split('\n');
  if (actual.length !== expected.length) throw new Error(`Output length mismatch: ${actual.length} vs ${expected.length}`);
  const mismatch = actual.findIndex((value, i) => value !== expected[i]);
  if (mismatch !== -1) throw new Error(`Mismatch at case ${mismatch}: Lean ${actual[mismatch]}, TypeScript ${expected[mismatch]}; ${lines[mismatch]}`);
  console.log(`Lean proofs checked. ${expected.length} Lean/TypeScript comparisons agree, including all 26 supplied cases.`);
} finally { rmSync(scratch, { recursive: true, force: true }); }
