/** Tolerant value parsing. Anything not clearly readable becomes `null` (= unknown fact); we never guess. */

export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null;
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return null;
}

/**
 * Accepts "1500", "1500.00", " 1 500 ", "€1,500", "1.500,00 EUR", "1500,5".
 * Ambiguous or invalid input (e.g. "1.500", "-5", "1e3", "NaN") is unknown, never a guess:
 * reading "1.500" as 1.5 would silently understate a quote.
 */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/€|eur\b/gi, '').replace(/[\s  ']/g, '');
  if (!s) return null;
  let normalized: string;
  if (/^\d+$/.test(s)) normalized = s;
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) normalized = s.replaceAll('.', '').replace(',', '.'); // 1.500,00
  else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) normalized = s.replaceAll(',', ''); // 1,500.00
  else if (s.includes(',') && s.includes('.')) return null;
  else if (s.includes(',')) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) normalized = s.replaceAll(',', '');
    else if (/^\d+,\d{1,2}$/.test(s)) normalized = s.replace(',', '.');
    else return null;
  } else {
    if (/^\d+\.\d{1,2}$/.test(s)) normalized = s;
    else return null; // includes "1.500" (ambiguous) and "1.2.3"
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  return v === '' ? null : v;
}
