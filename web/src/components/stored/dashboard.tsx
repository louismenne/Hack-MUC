import { downloadFile, toCsv, type CaseItem } from '@/lib/datasets';
import { QualityView } from '../quality-view';
import { AuditLog } from '../audit-log';
import { ActivityLog } from '../activity-log';

import type { ReviewEvent, ReviewState } from '../../../../src/review';
export function StoredDashboard({
  cases,
  states,
  events,
}: {
  cases: CaseItem[];
  states: Map<string, ReviewState>;
  events: ReviewEvent[];
}) {
  return (
    <QualityView
      dataset={{
        id: 'stored',
        name: 'Submitted claims',
        description: 'Submitted claims evaluated on the server',
        source: 'stored',
        cases,
        labelled: false,
      }}
      states={states}
      events={events}
      renderLog={(events) => (
        <>
          <AuditLog
            events={events}
            datasetName="Submitted claims"
            onExport={() =>
              downloadFile(
                'submitted-claim-reviews.csv',
                toCsv(
                  events.map((event) => ({
                    at: event.at,
                    case_id: event.caseId,
                    action: event.action,
                    reviewer: event.reviewer,
                    policy_version: event.policyVersion,
                    rule: event.ruleId,
                    automated: event.automated,
                    previous: event.previous,
                    next: event.next,
                    reason: event.reason,
                  })),
                  [
                    'at',
                    'case_id',
                    'action',
                    'reviewer',
                    'policy_version',
                    'rule',
                    'automated',
                    'previous',
                    'next',
                    'reason',
                  ],
                ),
              )
            }
          />
          <ActivityLog />
        </>
      )}
    />
  );
}
