/**
 * Single source of truth for the claim form. The form is rendered from this list, validation reads
 * it, and `column` is the name of the column in the future Supabase claims table.
 *
 * `engineField` marks columns the policy engine reads (see policies/*.rules.json). Everything else is
 * stored for later steps (policy check, duplicate detection, asking for missing information).
 * Never put a guess into an engine column: "Don't know" is stored as null, so the engine asks instead.
 */

export type FieldKind = 'text' | 'textarea' | 'email' | 'number' | 'date' | 'choice';
export type SectionId = 'contact' | 'claim' | 'repair' | 'facts';
export type ColumnValue = string | number | boolean | null;

export interface ChoiceOption { value: string; label: string }

export interface FieldDef {
  /** Key of the value in the form state. */
  key: string;
  /** Column name in the claims table / payload. */
  column: string;
  label: string;
  kind: FieldKind;
  section: SectionId;
  required: boolean;
  /** true: the policy engine reads this column. false: stored for later steps only. */
  engineField: boolean;
  help?: string;
  placeholder?: string;
  options?: ChoiceOption[];
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
  /** Form value (always a string) -> column value. Defaults by kind; '' always becomes null. */
  toColumn?: (value: string) => ColumnValue;
}

export const sections: { id: SectionId; title: string; description: string }[] = [
  { id: 'contact', title: 'Contact & claim details', description: 'We use these to reach you, check your policy and spot duplicate claims. The decision on your claim does not read them.' },
  { id: 'claim', title: 'About the claim', description: 'What happened, in your own words.' },
  { id: 'repair', title: 'Repair & quote', description: 'Skip anything you do not have yet. You can answer "Don\'t know".' },
  { id: 'facts', title: 'What we should know', description: 'Answer what you can. "Don\'t know" is fine: we will ask you later instead of guessing.' },
];

export const YES_NO_UNKNOWN: ChoiceOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: "Don't know" },
];

/** Yes -> true, No -> false, Don't know (or unanswered) -> null. */
export const triToBoolean = (value: string): boolean | null => (value === 'yes' ? true : value === 'no' ? false : null);

const tri = (key: string, label: string, section: SectionId, engineField: boolean, help?: string): FieldDef => ({
  key, column: key, label, kind: 'choice', section, required: false, engineField, help, options: YES_NO_UNKNOWN, toColumn: triToBoolean,
});

export const fields: FieldDef[] = [
  // ---- Contact & claim details (not read by the engine)
  { key: 'claimant_name', column: 'claimant_name', label: 'Your name', kind: 'text', section: 'contact', required: true, engineField: false, maxLength: 120, placeholder: 'Full name' },
  { key: 'claimant_email', column: 'claimant_email', label: 'Email address', kind: 'email', section: 'contact', required: true, engineField: false, maxLength: 200, placeholder: 'name@example.com', help: 'We write to this address if we need more information.' },
  { key: 'policy_number', column: 'policy_number', label: 'Policy number', kind: 'text', section: 'contact', required: false, engineField: false, maxLength: 40, pattern: /^[A-Za-z0-9 ./-]{3,40}$/, patternMessage: 'Use letters, digits, spaces, "-", "/" or ".".', help: 'You find it on your policy documents.' },
  { key: 'incident_date', column: 'incident_date', label: 'Date of the incident', kind: 'date', section: 'contact', required: false, engineField: false },
  { key: 'license_plate', column: 'license_plate', label: 'License plate', kind: 'text', section: 'contact', required: false, engineField: false, maxLength: 12, placeholder: 'e.g. M-AB 1234', pattern: /^[\p{L}0-9 -]{2,12}$/u, patternMessage: 'Use letters, digits, spaces or "-" (2 to 12 characters).', toColumn: v => v.trim().toUpperCase() },

  // ---- About the claim
  {
    key: 'claim_type', column: 'claim_type', label: 'What kind of claim is this?', kind: 'choice', section: 'claim', required: true, engineField: true,
    options: [{ value: 'motor_own_damage', label: 'Damage to my own vehicle' }, { value: 'theft', label: 'Theft' }],
  },
  { key: 'claim_summary', column: 'claim_summary', label: 'What happened?', kind: 'textarea', section: 'claim', required: true, engineField: true, maxLength: 2000, placeholder: 'Describe the incident and the damage.', help: 'This text is descriptive only. The decision uses the answers below.' },

  // ---- Repair & quote
  {
    key: 'repair_battery', column: 'repair_type', label: 'Does the repair involve the high-voltage battery of an electric vehicle?', kind: 'choice', section: 'repair', required: false, engineField: true,
    options: YES_NO_UNKNOWN, toColumn: v => (v === 'yes' ? 'ev_high_voltage_battery' : v === 'no' ? 'standard' : null),
  },
  { key: 'quote_eur', column: 'quote_eur', label: 'Repair quote (EUR)', kind: 'number', section: 'repair', required: false, engineField: true, min: 0, max: 1_000_000, placeholder: 'e.g. 1250', help: 'The total from your workshop quote. Leave empty if you do not have it yet.' },

  // ---- What we should know
  tri('injury_reported', 'Was anyone injured?', 'facts', true),
  tri('liability_disputed', 'Does anyone dispute who was at fault?', 'facts', true),
  tri('claimant_states_policy_active', 'To my knowledge, my policy was active on the day of the incident.', 'facts', false, 'This is your statement. We check the policy ourselves.'),
  tri('incident_report_present', 'Do you have an incident report (for example from the police)?', 'facts', true, 'You can attach it below.'),
  tri('itemized_quote_present', 'Does the repair quote list individual items and prices?', 'facts', true),
];

export interface SystemColumn {
  column: string;
  engineField: boolean;
  /** Where it appears in the payload relative to the form fields. */
  position: 'before' | 'after';
  note: string;
  value: (context: { now: Date; isTest: boolean }) => ColumnValue;
}

/** Columns the claimant never fills in. The system sets them, or leaves them null until a later step verifies them. */
export const systemColumns: SystemColumn[] = [
  { column: 'case_id', engineField: true, position: 'before', note: 'Assigned by the system when the claim is saved.', value: () => null },
  { column: 'case_status', engineField: true, position: 'before', note: 'New claims are open.', value: () => 'open' },
  { column: 'received_at', engineField: false, position: 'before', note: 'Time of submission, set by the system.', value: ({ now }) => now.toISOString() },
  { column: 'policy_active_on_incident', engineField: true, position: 'after', note: 'Verified by the system later. The claimant statement is claimant_states_policy_active.', value: () => null },
  { column: 'duplicate_flag', engineField: true, position: 'after', note: 'Set by duplicate detection later.', value: () => null },
  { column: 'evidence_conflict', engineField: true, position: 'after', note: 'Set when the documents are compared later.', value: () => null },
  { column: 'is_test', engineField: false, position: 'after', note: 'true while nothing is really saved (dry run).', value: ({ isTest }) => isTest },
];

export const fieldByKey = (key: string): FieldDef | undefined => fields.find(f => f.key === key);
/** All columns in payload order. */
export const payloadColumns = (): string[] => [
  ...systemColumns.filter(c => c.position === 'before').map(c => c.column),
  ...fields.map(f => f.column),
  ...systemColumns.filter(c => c.position === 'after').map(c => c.column),
];
/** Columns the policy engine reads. */
export const engineColumns = (): string[] => [
  ...systemColumns.filter(c => c.engineField).map(c => c.column),
  ...fields.filter(f => f.engineField).map(f => f.column),
];
