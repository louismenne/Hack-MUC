import { supabase } from './supabase';
import { reviewFromRow, type AuditRow } from './audit';
import { policyApi } from '@/components/policy/api';
import type { Investigation, MonitoringEvent } from '../../../src/quality-monitoring';

export async function loadMonitoring() {
  const readReviews = async () => {
    const events: MonitoringEvent[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('audit_log').select('*').eq('entity_type', 'review')
        .eq('details->>datasetId', 'stored').eq('details->>decisionSource', 'server_engine')
        .order('sequence').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      events.push(...(data as AuditRow[]).map(row => ({ ...reviewFromRow(row), sequence: row.sequence, decisionId: String(row.details.decisionId), decisionSource: String(row.details.decisionSource) })));
      if (data.length < 1000) return events;
    }
  };
  const readInvestigations = async () => {
    const items: Investigation[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('quality_investigations').select('*').order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
      if (error) throw new Error(`Quality monitoring unavailable: ${error.message}`);
      items.push(...data as Investigation[]);
      if (data.length < 1000) return items;
    }
  };
  const [events, investigations, policies] = await Promise.all([readReviews(), readInvestigations(), policyApi.overview()]);
  return { events, investigations, versions: policies.versions, loadedAt: Date.now() };
}
export async function openInvestigation(title: string, eventIds: string[]) {
  const { data, error } = await supabase.rpc('open_quality_investigation', { p_title: title, p_event_ids: eventIds });
  if (error) throw new Error(error.message);
  return data as Investigation;
}
export async function saveInvestigation(item: Investigation, findings: string, status: Investigation['status']) {
  const { data, error } = await supabase.rpc('update_quality_investigation', { p_id: item.id, p_revision: item.revision, p_findings: findings, p_status: status });
  if (error) throw new Error(error.message);
  return data as Investigation;
}
