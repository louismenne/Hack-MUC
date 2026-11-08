import { QUALITY_AGENT_SYSTEM } from './prompt.js';
import type { QueryResult } from './query.js';
export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface QueryTrace { id: string; sql: string; purpose: string; result?: QueryResult; error?: string }
export type AgentEvent = { type: 'query'; trace: QueryTrace } | { type: 'result'; trace: QueryTrace } | { type: 'answer'; text: string } | { type: 'error'; message: string };
export interface AgentClient {
  messages: { create(body: Record<string, unknown>, options?: { signal: AbortSignal }): Promise<{ content: Array<{ type: string; [key: string]: unknown }>; stop_reason?: string | null }> };
}
const tool = {
  name: 'query_sql', description: 'Execute one read-only PostgreSQL SELECT against the LIVE production database. Supply the SQL and a short investigation purpose. Returns up to 100 rows, a timestamp and truncation status. No writes or policy changes.',
  input_schema: { type: 'object', properties: { sql: { type: 'string' }, purpose: { type: 'string' } }, required: ['sql', 'purpose'], additionalProperties: false },
};
export async function investigate({ client, model, messages, query, emit, signal }: {
  client: AgentClient; model: string; messages: ChatMessage[];
  query: (sql: string, signal: AbortSignal) => Promise<QueryResult>;
  emit: (event: AgentEvent) => void; signal: AbortSignal;
}) {
  const history: unknown[] = messages.map(m => ({ ...m }));
  let used = 0;
  let successful = 0;
  for (let round = 0; round < 10; round++) {
    signal.throwIfAborted();
    const response = await client.messages.create({
      model, max_tokens: 8000, system: QUALITY_AGENT_SYSTEM,
      messages: structuredClone(history), tools: [tool], tool_choice: used >= 8 ? { type: 'none' } : { type: 'auto' },
    }, { signal });
    history.push({ role: 'assistant', content: response.content });
    const calls = response.content.filter(block => block.type === 'tool_use');
    if (!calls.length) {
      if (!successful && round < 2) { history.push({ role: 'user', content: 'No successful production SQL evidence has been collected. Call query_sql before reporting findings. Start with SELECT count(*) AS total FROM claims.' }); continue; }
      if (!successful) throw new Error('No production SQL query succeeded. Inspect the query errors and try again.');
      const text = response.content.filter(b => b.type === 'text').map(b => String(b.text ?? '')).join('\n');
      if (!text.trim()) throw new Error(`The assistant returned no answer (${response.stop_reason ?? 'unknown stop'}). Try a more specific question.`);
      emit({ type: 'answer', text: text + (response.stop_reason === 'max_tokens' ? '\n\nThe response reached its length limit. Ask a follow-up to continue.' : '') });
      return;
    }
    const results: Record<string, unknown>[] = [];
    for (const call of calls) {
      const input = call.input as { sql?: unknown; purpose?: unknown } | null;
      const id = `Q${++used}`;
      const trace: QueryTrace = { id, sql: typeof input?.sql === 'string' ? input.sql : '', purpose: typeof input?.purpose === 'string' ? input.purpose.slice(0, 300) : '' };
      try {
        if (used > 8) throw new Error('Query budget reached. Summarize the available evidence and limitations.');
        if (call.name !== 'query_sql' || !trace.sql || !trace.purpose) throw new Error('Use query_sql with a SQL string and a purpose.');
        emit({ type: 'query', trace });
        trace.result = await query(trace.sql, signal);
        successful++;
      } catch (e) {
        signal.throwIfAborted();
        trace.error = e instanceof Error ? e.message : 'SQL query failed.';
      }
      emit({ type: 'result', trace });
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: !!trace.error, content: JSON.stringify({ remaining_queries: Math.max(0, 8-used), query_id: id, ...(trace.result ?? { error: trace.error }) }) });
    }
    if (used >= 8) results.push({ type: 'text', text: 'The SQL budget is exhausted. Now give the user a concise final answer using only successful query results, with query IDs and limitations. Do not call more tools.' });
    history.push({ role: 'user', content: results });
  }
  throw new Error('Investigation reached its step limit. Narrow the question and try again.');
}
