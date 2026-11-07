import { describe, expect, it } from 'vitest';
import { missingInformation } from '../src/claim-intake/completeness.js';

const complete = {
  quote_eur: '650', itemized_quote_present: 'yes', incident_report_present: 'yes',
  repair_battery: 'no', injury_reported: 'no', liability_disputed: 'no',
};

describe('missingInformation', () => {
  it('is empty for a complete claim with documents', () => {
    expect(missingInformation(complete, 2)).toEqual([]);
  });

  it('lists what is missing in a short, fixed order', () => {
    const items = missingInformation({ ...complete, quote_eur: '', incident_report_present: 'no', injury_reported: 'unknown' }, 0);
    expect(items.map(i => i.key)).toEqual(['quote_eur', 'incident_report_present', 'injury_reported', 'documents']);
  });

  it('treats "don\'t know" and unanswered questions as missing', () => {
    const items = missingInformation({ ...complete, repair_battery: 'unknown', liability_disputed: '' }, 1);
    expect(items.map(i => i.label)).toEqual(['Electric-vehicle battery question', 'Fault question']);
  });
});
