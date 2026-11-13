export const MAX_CENTS = 1_000_000_000;
export function cents(value, optional = false) {
  const s = String(value).trim();
  if (s === '' && optional) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter a nonnegative amount with at most two decimal places.');
  const [whole, fraction = ''] = s.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw new Error('Amount must be at most 10,000,000.00.');
  return result;
}
export function quoteTotal(quote) {
  return quote.unit_cents * (quote.pricing_basis === 'per_person' ? quote.headcount : 1);
}
export function expenseTotals(expense, quotes, payments) {
  const quote = quotes.find(q => q.id === expense.preferred_quote_id);
  const forecast = expense.agreed_cents ?? (quote ? quoteTotal(quote) : expense.target_cents);
  const paid = payments.filter(p => p.expense_id === expense.id)
    .reduce((sum, p) => sum + (p.kind === 'refund' ? -p.amount_cents : p.amount_cents), 0);
  return { forecast, paid, owed: expense.agreed_cents === null ? 0 : Math.max(0, expense.agreed_cents - paid),
    credit: expense.agreed_cents === null ? 0 : Math.max(0, paid - expense.agreed_cents),
    variance: forecast === null || expense.target_cents === null ? null : forecast - expense.target_cents };
}
export function installmentBalance(installment, payments) {
  return installment.amount_cents - payments.filter(p => p.installment_id === installment.id)
    .reduce((sum, p) => sum + (p.kind === 'refund' ? -p.amount_cents : p.amount_cents), 0);
}
export function summarize(data) {
  const rows = data.expenses.map(e => ({ ...e, ...expenseTotals(e, data.quotes, data.payments) }));
  const categories = data.categories.map(c => {
    const items = rows.filter(e => e.category_id === c.id);
    return { ...c, target: items.reduce((s, e) => s + (e.target_cents ?? 0), 0),
      forecast: items.reduce((s, e) => s + (e.forecast ?? 0), 0), paid: items.reduce((s, e) => s + e.paid, 0),
      unknown: items.filter(e => e.forecast === null).length };
  });
  const total = key => rows.reduce((s, e) => s + (e[key] ?? 0), 0);
  const upcoming = data.installments.map(i => ({ ...i, remaining: installmentBalance(i, data.payments) }))
    .filter(i => i.remaining > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  return { rows, categories, forecast: total('forecast'), paid: total('paid'), owed: total('owed'), credit: total('credit'),
    allocated: total('target_cents'), unknown: rows.filter(e => e.forecast === null).length, upcoming,
    unallocated: data.payments.filter(p => !p.installment_id).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount_cents : p.amount_cents), 0) };
}
// Prevent spreadsheet formula execution in exported user-entered text.
export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let s = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
export function money(c, currency) {
  return c === null ? 'Awaiting estimate' : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(c / 100);
}
export function localDate(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
