// Renders the weekly report from a ledger file.
export function buildReport(ledger) {
  return `Status: ${ledger.project} ${ledger.week}`;
}
