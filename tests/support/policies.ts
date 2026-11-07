import { evaluatePolicyDocument } from '../../src/policy-engine/index.js';
import { bundledHistory, bundledV1, bundledV2 } from '../../src/policy-engine/bundled.js';

/** Test helpers: the policy JSON in policies/ evaluated by the generic engine. No rules live in test code either. */
export const policyV1 = bundledV1;
export const policyV2 = bundledV2;
export { bundledHistory };
export const decideV1 = (row: Record<string, unknown>) => evaluatePolicyDocument(bundledV1.rules, bundledV1.label, row);
export const decideV2 = (row: Record<string, unknown>) => evaluatePolicyDocument(bundledV2.rules, bundledV2.label, row);
