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
export function quotePriceBasis(quote, currency) {
  return quote.pricing_basis === 'per_person'
    ? `${money(quote.unit_cents, currency)} per guest × ${quote.headcount} guests`
    : 'Fixed package price';
}
function netPayments(payments, include) {
  let total = 0;
  for (const payment of payments) {
    if (include(payment)) total += payment.kind === 'refund' ? -payment.amount_cents : payment.amount_cents;
  }
  return total;
}
function expenseForecast(expense, quotes) {
  if (expense.agreed_cents != null) return expense.agreed_cents;
  // A linked menu owns the forecast even while its estimate is incomplete.
  if (expense.menu_linked) return expense.menu_estimate_cents;
  const quote = quotes.find(q => q.id === expense.preferred_quote_id);
  return quote ? quoteTotal(quote) : expense.target_cents;
}
export function expenseTotals(expense, quotes, payments) {
  const forecast = expenseForecast(expense, quotes);
  const paid = netPayments(payments, p => p.expense_id === expense.id);
  return { forecast, paid, owed: expense.agreed_cents === null ? 0 : Math.max(0, expense.agreed_cents - paid),
    credit: expense.agreed_cents === null ? 0 : Math.max(0, paid - expense.agreed_cents),
    variance: forecast === null || expense.target_cents === null ? null : forecast - expense.target_cents };
}
export function installmentBalance(installment, payments) {
  return installment.amount_cents - netPayments(payments, p => p.installment_id === installment.id);
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
    unallocated: netPayments(data.payments, p => !p.installment_id) };
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
