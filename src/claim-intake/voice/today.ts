/** Today's date as YYYY-MM-DD in Europe/Berlin. The agent uses it to turn "yesterday" into a real date. */
export function berlinToday(now: Date = new Date()): string {
  // The "en-CA" locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
