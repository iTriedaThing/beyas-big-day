import { config } from './config.js';
import { Api, subscribe, takeAuthRedirect } from './api.js';
import { cents, money, quoteTotal, summarize, installmentBalance, csv, localDate } from './budget.js';
import {escapeHTML as esc,button as btn,input,textarea as area,select} from './ui.js';
import {TASK_WINDOWS,DIETARY_FLAGS,GUEST_TAGS,STARTER_TASKS,householdGuests,guestSummary} from './planner.js';
import {renderGuests,renderPlanning,plannerOverview,displayDate} from './planner-views.js';

const $ = s => document.querySelector(s);
const initialAuthRedirect = takeAuthRedirect(window.location, window.history);
const amount = (name, label, value = null, required = false) => input(name, label, value === null ? '' : (value / 100).toFixed(2), 'text', `inputmode="decimal" ${required ? 'required' : ''} maxlength="14"`);
const dialog = $('#editor');
let api, data, totals, weddingId, tab = 'budget', selectedExpense = '', selectedCategory = '', stopLive, loading = false, loadAgain = false, syncStatus = 'Connecting…', noticeTimer;
let sessionEpoch = 0, handlingAuthRedirect = false;
const guestFilters = {search:'',rsvp:'',tag:'',view:'active'};
let taskFilter = 'all';
const fmt = value => money(value, data.wedding.currency);
const vendorName = id => data.vendors.find(v => v.id === id)?.name || 'No vendor linked';
const memberName = id => data.members.find(m => m.user_id === id)?.display_name || id;
const expenseName = id => data.expenses.find(e => e.id === id)?.title || '';
const opts = (items, field = 'name') => items.map(i => [i.id, i[field]]);
const today = () => localDate(data.wedding.time_zone);
function notify(message, persistent = false) {
  clearTimeout(noticeTimer); $('#notice').textContent = message;
  if (!persistent) noticeTimer = setTimeout(() => { $('#notice').textContent = ''; }, 6500);
}
function errorMessage(error) {
  return `${error.message}${api?.pending ? ' The outcome is unconfirmed. Retry the original save; its IDs are preserved in this tab.' : ''}`;
}
function resetPrivateUI() {
  sessionEpoch++; stopLive?.(); stopLive = null; data = null; weddingId = null;
  if (dialog.open) dialog.close();
  $('#account').replaceChildren(); $('#main').replaceChildren(); $('#notice').textContent = '';
}
function renderLogin(message = '') {
  $('#account').replaceChildren();
  $('#main').innerHTML = `<section class="panel login"><p class="eyebrow">JUST THE TWO OF YOU</p><h1>Your day, together.</h1><p>Sign in to your private wedding budget. Your partner’s changes will appear here too.</p><form id="login">${input('email', 'Email', '', 'email', 'required autocomplete="username"')}${input('password', 'Password', '', 'password', 'required autocomplete="current-password"')}<p id="login-error" role="alert">${esc(message)}</p><button type="submit">Sign in</button></form><p>${btn('reset-request', 'Forgot password?')}</p><p class="muted">Use your administrator-provisioned account. No wedding access? Ask the person setting up your planner to add your account as a member.</p></section>`;
  $('#login').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    form.querySelector('button').disabled = true;
    try { await api.signIn(fields.get('email').trim(), fields.get('password')); form.reset(); await start(); }
    catch (error) { $('#login-error').textContent = error.message; }
    finally { if (form.isConnected) form.querySelector('button').disabled = false; }
  };
}
function renderResetRequest() {
  $('#main').innerHTML = `<section class="panel login"><p class="eyebrow">GET BACK TO YOUR PLAN</p><h1>Reset your password.</h1><p>We’ll email you a link to choose a new password.</p><form id="reset-request">${input('email','Account email','','email','required autocomplete="username"')}<p id="reset-message" role="status"></p><button type="submit">Send reset email</button></form><p>${btn('back-to-login','Back to sign in')}</p></section>`;
  $('#reset-request').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    const email = new FormData(form).get('email').trim();
    form.querySelector('button').disabled = true;
    try {
      await api.requestPasswordReset(email, window.location.origin + window.location.pathname);
      if (!form.isConnected) return;
      $('#reset-message').textContent = 'If an account exists for that email, a reset link has been sent. Open the newest email and choose your new password on this page.';
    } catch (error) { if (form.isConnected) $('#reset-message').textContent = error.message; }
    finally { if (form.isConnected) form.querySelector('button').disabled = false; }
  };
}
function renderPasswordChange() {
  $('#main').innerHTML = `<section class="panel login"><p class="eyebrow">YOUR RESET LINK IS VERIFIED</p><h1>Choose a new password.</h1><p>Enter your new password twice. This changes the password for the account in your reset email.</p><form id="password-change">${input('new_password','New password','','password','required minlength="8" autocomplete="new-password"')}${input('confirm_password','Confirm new password','','password','required minlength="8" autocomplete="new-password"')}<p class="muted">Use at least 8 characters. Supabase may require additional strength.</p><p id="password-error" role="alert"></p><button type="submit">Save new password</button></form><p>${btn('cancel-recovery','Cancel and sign out')}</p></section>`;
  $('#password-change').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    if (fields.get('new_password') !== fields.get('confirm_password')) {
      $('#password-error').textContent = 'The passwords do not match.'; return;
    }
    form.querySelector('button').disabled = true;
    const cancel = $('[data-action="cancel-recovery"]'); cancel.disabled = true;
    try {
      await api.updatePassword(fields.get('new_password'));
      if (!form.isConnected) return;
      form.reset();
      // The owner verifies the new credential with an ordinary password sign-in.
      try { await api.signOut(); } catch { /* signOut always clears the local session */ }
      resetPrivateUI(); renderLogin('Password updated. Sign in with your new password.');
    } catch (error) {
      if (!form.isConnected) return;
      form.reset();
      if (!api.session) { resetPrivateUI(); renderLogin('The reset session expired. Request a new password reset email.'); }
      else $('#password-error').textContent = error.message;
    } finally { if (form.isConnected) { form.querySelector('button').disabled = false; cancel.disabled = false; } }
  };
}
async function finishAuthRedirect(parameters) {
  if (!parameters) { await start(); return; }
  handlingAuthRedirect = true; resetPrivateUI();
  $('#main').innerHTML = '<p>Verifying your email link…</p>';
  try { await api.acceptAuthRedirect(parameters); await start(); }
  catch (error) { api.setSession(null); resetPrivateUI(); renderLogin(error.message); }
  finally { handlingAuthRedirect = false; }
}
async function start() {
  resetPrivateUI();
  if (!api.session) { renderLogin(); return; }
  if (api.session.recovery) { renderPasswordChange(); return; }
  const epoch = sessionEpoch;
  $('#main').innerHTML = '<p>Loading your shared budget…</p>';
  try {
    const weddings = await api.request('weddings?select=id,name');
    if (epoch !== sessionEpoch) return;
    if (weddings.length !== 1) {
      $('#main').innerHTML = '<section class="panel"><h1>No single wedding assigned</h1><p>Your administrator must assign your account to exactly one wedding for this release. No wedding records have been loaded.</p></section>';
      renderAccount(); return;
    }
    weddingId = weddings[0].id;
    await reload();
    if (epoch === sessionEpoch && data) connectLive();
  } catch (error) {
    if (!api.session) renderLogin(error.message);
    else { $('#main').innerHTML = `<section class="panel"><h1>Couldn’t load your budget</h1><p>${esc(error.message)}</p>${btn('start', 'Try again')}</section>`; renderAccount(); }
  }
}
function renderAccount() {
  $('#account').innerHTML = api.session ? `${esc(api.session.user.email)} ${btn('logout', 'Sign out')}` : '';
}
function connectLive() {
  stopLive?.();
  if (!weddingId || !api.session) return;
  stopLive = subscribe(api, weddingId, () => reload(), status => { syncStatus = status; if ($('#sync')) $('#sync').textContent = status; },!!data?.planner_ready);
}
async function reload() {
  if (loading) { loadAgain = true; return; }
  if (!weddingId || !api.session) return;
  loading = true; const epoch = sessionEpoch;
  try {
    const snapshot = await api.snapshot(weddingId);
    if (epoch !== sessionEpoch) return;
    if (!snapshot.wedding) { resetPrivateUI(); $('#main').innerHTML = '<h1>Wedding access removed</h1><p>Contact your administrator.</p>'; renderAccount(); return; }
    const previousReady = data?.planner_ready;
    data = {...snapshot,invitations:snapshot.invitations||[],guests:snapshot.guests||[],tasks:snapshot.tasks||[]};
    totals = summarize(data); render();
    if (stopLive && previousReady !== data.planner_ready) connectLive();
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    if (!api.session) { resetPrivateUI(); renderLogin('Session expired. Sign in again.'); }
    else if (!data) throw error;
    else notify(`Refresh failed. Displayed figures may be out of date. ${error.message}`, true);
  } finally { loading = false; if (loadAgain) { loadAgain = false; void reload(); } }
}
function render() {
  renderAccount();
  const primary=tab==='guests'?btn('household-new','+ Add household','',''):tab==='planning'?btn('task-new','+ Add task','',''):btn('expense-new','+ Add expense','','')+btn('payment-new','Record payment');
  $('#main').innerHTML = `<section class="intro"><div><p class="eyebrow">BEN + MAYA · A DAY THAT’S OURS</p><h1>${esc(data.wedding.name)}</h1><p class="intro-note">A little planning. A lot of love.</p><p class="wedding-meta">${data.wedding.wedding_date?esc(displayDate(data.wedding.wedding_date)):'Our date is still a beautiful possibility'}<span>·</span>${esc(data.wedding.currency)}</p></div><div class="actions">${primary}</div></section>
    <div class="section-head utility-bar"><small id="sync" class="sync-status">${esc(syncStatus)}</small><div class="actions">${api.pending?btn('retry','Retry pending save'):''}${btn('refresh','Refresh')}${btn('settings','Wedding settings')}${btn('export','Budget CSVs')}</div></div>
    <nav class="planner-nav" aria-label="Planner sections">${[['budget','Budget','01'],['vendors','Vendors & quotes','02'],['guests','Guest list','03'],['planning','Our checklist','04']].map(([id,label,number])=>`<button type="button" data-action="tab-${id}" class="secondary" aria-pressed="${tab===id}"><span aria-hidden="true">${number}</span>${label}</button>`).join('')}</nav>
    ${tab==='budget'?renderBudget():tab==='vendors'?renderVendors():tab==='guests'?renderGuests(data,guestFilters):renderPlanning(data,taskFilter,today())}`;
}
function renderBudget() {
  const room = data.wedding.cap_cents - totals.forecast;
  const next = totals.upcoming[0];
  return `<div class="cards"><article class="card feature"><a href="#expenses">Forecast</a><span class="amount">${fmt(totals.forecast)}</span><small>${totals.unknown ? `${totals.unknown} item(s) awaiting estimate; total incomplete` : 'One price per expense'}</small></article>
    <article class="card"><a href="#payments">Paid, net of refunds</a><span class="amount">${fmt(totals.paid)}</span></article><article class="card"><a href="#expenses">Still owed</a><span class="amount">${fmt(totals.owed)}</span><small>Booked expenses only · ${fmt(totals.credit)} vendor credit</small></article><article class="card"><a href="#expenses">${room < 0 ? 'Over wedding cap' : 'Budget room'}</a><span class="amount ${room < 0 ? 'warning' : ''}">${fmt(Math.abs(room))}</span><small>Cap ${fmt(data.wedding.cap_cents)}${totals.unknown ? ' · provisional' : ''}</small></article></div>
    <section class="panel"><div class="section-head"><h2>Next payment</h2><a href="#installments">All installments</a></div>${next ? `<p><strong>${fmt(next.remaining)}</strong> · ${esc(next.label)} · ${esc(expenseName(next.expense_id))}</p><p>${esc(vendorName(data.expenses.find(e => e.id === next.expense_id)?.vendor_id))} · Due ${esc(next.due_date)} ${next.due_date < today() ? '<span class="warning">Overdue</span>' : ''}</p>${btn('payment-installment', 'Record payment', next.id)}` : '<p class="muted">No outstanding installments. Add a due date to a booked expense below.</p>'}
    <p class="muted">${fmt(totals.allocated)} allocated to item targets · ${fmt(data.wedding.cap_cents - totals.allocated)} left to allocate</p></section>
    ${plannerOverview(data,today())}
    <div class="twocol"><section class="panel"><div class="section-head"><h2>Budget vs. paid</h2><select aria-label="Chart comparison" id="comparison"><option value="paid">Paid</option><option value="forecast">Forecast</option></select></div><div class="legend"><span>Lilac: item targets</span><span>Green: paid / forecast</span></div><div id="bars">${bars('paid')}</div></section><section class="panel"><h2>Spending breakdown</h2>${breakdown()}</section></div>
    <section class="panel"><div class="section-head"><h2>Category amounts & overages</h2>${btn('category-new', 'Add category')}</div><p class="muted">Targets come from the expenses in each category. Select a category to see its items.</p><div class="table-wrap"><table><thead><tr><th>Category</th><th>Target</th><th>Forecast</th><th>Paid</th><th>Forecast vs. target</th><th></th></tr></thead><tbody>${totals.categories.map(c => `<tr><td>${btn('filter-category', esc(c.name), c.id)}</td><td>${fmt(c.target)}</td><td>${fmt(c.forecast)}${c.unknown ? ' + unknown' : ''}</td><td>${fmt(c.paid)}</td><td class="${c.forecast > c.target ? 'warning' : 'good'}">${variance(c.forecast - c.target)}</td><td>${btn('category-edit', 'Rename', c.id)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel" id="expenses"><div class="section-head"><h2>Expenses</h2>${select('category-filter', 'Filter category', [['', 'All categories'], ...opts(data.categories)], selectedCategory)}</div>${expenseTable(totals.rows.filter(e => !selectedCategory || e.category_id === selectedCategory))}</section>
    ${selectedExpense ? renderExpense(selectedExpense) : ''}
    ${renderInstallments()}${renderPayments()}`;
}
function variance(value) { return `${fmt(Math.abs(value))} ${value > 0 ? 'over' : value < 0 ? 'under' : 'on target'}`; }
function bars(key) {
  const max = Math.max(1, ...totals.categories.flatMap(c => [c.target, Math.abs(c[key])]));
  return totals.categories.map(c => `<div class="bar-row"><a href="#expenses" data-action="filter-category" data-id="${c.id}">${esc(c.name)}</a><small> · ${fmt(c.target)} target / ${fmt(c[key])} ${key}</small><svg role="img" aria-label="${esc(c.name)}: ${esc(fmt(c.target))} target; ${esc(fmt(c[key]))} ${key}" viewBox="0 0 100 9" width="100%" height="25" preserveAspectRatio="none"><rect width="100" height="9" fill="#eee9ef"/><rect width="${c.target/max*100}" height="4" fill="#b6a5c3"/><rect y="5" width="${Math.abs(c[key])/max*100}" height="4" fill="${c[key]<0?'#a4424c':'#314641'}"/></svg></div>`).join('') || '<p class="empty">Add a category and an expense to begin.</p>';
}
function breakdown() {
  if (totals.paid <= 0 || totals.categories.some(c => c.paid < 0)) return '<p class="muted">A percentage chart needs positive net spending with no category credits. Exact amounts are in the category table below.</p>';
  const colors = ['#314641','#715c83','#8f79a1','#526863','#a9b9aa','#472f5b','#b9a3c6','#203732'];
  let offset = 0;
  const circles = totals.categories.map((c, i) => {
    const share = c.paid / totals.paid * 100;
    const circle = `<circle cx="21" cy="21" r="15.915494" fill="none" stroke="${colors[i % colors.length]}" stroke-width="8" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}" transform="rotate(-90 21 21)"/>`;
    offset += share; return circle;
  }).join('');
  return `<div class="breakdown"><svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Category shares of payments net of refunds; amounts and percentages listed alongside">${circles}</svg><ul>${totals.categories.filter(c => c.paid > 0).map(c => `<li>${esc(c.name)}: ${fmt(c.paid)} (${(100 * c.paid / totals.paid).toFixed(1)}%)</li>`).join('')}</ul></div>`;
}
function expenseTable(rows) {
  return rows.length ? `<div class="table-wrap"><table><thead><tr><th>Expense / vendor</th><th>Target</th><th>Forecast</th><th>Paid</th><th>Owed / credit</th><th>Actions</th></tr></thead><tbody>${rows.map(e => `<tr><td><strong>${esc(e.title)}</strong><small>${esc(vendorName(e.vendor_id))} · ${e.agreed_cents === null ? 'Planning' : 'Booked'}</small></td><td>${fmt(e.target_cents)}</td><td>${fmt(e.forecast)}${e.variance !== null ? `<small class="${e.variance > 0 ? 'warning' : ''}">${variance(e.variance)}</small>` : ''}</td><td>${fmt(e.paid)}</td><td>${fmt(e.owed)}${e.credit ? `<small>${fmt(e.credit)} credit</small>` : ''}</td><td>${btn('expense-open', 'Details & quotes', e.id)}${btn('payment-expense', 'Payment / refund', e.id)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No expenses here yet. Add a planned expense or a purchase paid in full.</p>';
}
function renderQuote(q, expense) {
  const vendor = data.vendors.find(v => v.id === q.vendor_id);
  const contact = [vendor?.contact_name, vendor?.email, vendor?.phone, vendor?.website].filter(Boolean).join(' · ');
  const booked = q.id === expense.booked_quote_id;
  return `<article class="quote ${q.id === expense.preferred_quote_id ? 'preferred' : ''}">
    <h3>${esc(q.package_name)}</h3><p>${esc(vendorName(q.vendor_id))}</p><p class="muted">${esc(contact)}</p>
    <p class="amount">${fmt(quoteTotal(q))}</p>
    <small>${q.pricing_basis === 'per_person' ? `${fmt(q.unit_cents)} per guest × ${q.headcount} guests` : 'Fixed package price'}</small>
    <p>${esc(q.details)}</p><p>Rating: ${q.rating ? `${q.rating}/5` : 'Not rated'}</p><p>${esc(q.notes)}</p>
    ${booked ? '<p class="badge">BOOKED · preserved offer</p>' : `
      ${q.id === expense.preferred_quote_id ? '<p class="badge">PREFERRED</p>' : ''}
      <div class="actions">${btn('quote-edit', 'Edit quote', q.id)}
      ${expense.agreed_cents === null ? btn('prefer', 'Prefer this quote', q.id) + btn('book-quote', 'Book this package', q.id) : ''}</div>`}
  </article>`;
}
function renderExpense(id) {
  const e = data.expenses.find(e => e.id === id); if (!e) return '';
  const quotes = data.quotes.filter(q => q.expense_id === id);
  return `<section class="panel" id="expense-detail"><div class="section-head"><h2>${esc(e.title)}</h2><div class="actions">${btn('expense-edit', 'Edit expense', id)}${e.agreed_cents !== null ? btn('amend', 'Amend agreement', id) : btn('book', 'Book expense', id)}${btn('quote-new', 'Add quote', id)}${e.agreed_cents !== null ? btn('installment-new', 'Add installment', id) : ''}</div></div><p>${esc(e.notes)}</p>
    ${e.agreed_cents !== null ? `<p>Agreed price: <strong>${fmt(e.agreed_cents)}</strong>. Quote edits do not change this agreement.</p>` : '<p class="muted">Compare offers below. Prefer one to use its total in the forecast.</p>'}
    <div class="quote-grid">${quotes.map(q => renderQuote(q,e)).join('') || '<p class="empty">No quotes yet. Add offers for this job to compare packages side by side.</p>'}</div>
    ${e.agreed_cents === null && e.preferred_quote_id ? btn('clear-preferred', 'Use item target instead', e.id) : ''}
    ${data.amendments.filter(a => a.expense_id === id).map(a => `<p><small>Amendment ${esc(a.created_at.slice(0,10))} · ${fmt(a.previous_cents)} → ${fmt(a.agreed_cents)} · ${esc(a.reason)} · ${esc(memberName(a.entered_by))}</small></p>`).join('')}
    <p class="muted">Installment schedule: ${fmt(data.installments.filter(i => i.expense_id === id).reduce((s,i) => s+i.amount_cents,0))} · Agreed: ${fmt(e.agreed_cents)}. Unlinked payments need reconciliation against the schedule.</p></section>`;
}
function renderInstallments() {
  return `<section class="panel" id="installments"><h2>Installments & due dates</h2><p class="muted">Balances use linked payments and refunds. Unlinked transactions are included in the expense balance, but do not settle an installment.</p>${data.installments.length ? `<div class="table-wrap"><table><thead><tr><th>Due</th><th>Expense / installment</th><th>Scheduled</th><th>Remaining</th><th></th></tr></thead><tbody>${data.installments.map(i => {
    const balance = installmentBalance(i, data.payments);
    return `<tr><td>${esc(i.due_date)}${balance > 0 && i.due_date < today() ? '<small class="warning">Overdue</small>' : ''}</td><td>${esc(expenseName(i.expense_id))}<small>${esc(i.label)}</small></td><td>${fmt(i.amount_cents)}</td><td>${fmt(Math.max(0,balance))}${balance < 0 ? `<small>${fmt(-balance)} credit</small>` : ''}</td><td>${btn('payment-installment','Payment / refund',i.id)}${btn('installment-edit','Edit',i.id)}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="empty">Open a booked expense to add its deposit and balance dates.</p>'}</section>`;
}
function renderPayments() {
  return `<section class="panel" id="payments"><h2>Payment ledger</h2><p class="muted">Payments are preserved. Correct mistakes with an offsetting refund or payment. ${fmt(totals.unallocated)} net payments are not linked to installments.</p>${data.payments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Expense / installment</th><th>Type / amount</th><th>Payer / entered by</th><th>Notes</th></tr></thead><tbody>${[...data.payments].reverse().map(p => `<tr><td>${esc(p.paid_on)}</td><td>${esc(expenseName(p.expense_id))}<small>${esc(data.installments.find(i => i.id === p.installment_id)?.label || 'Unallocated — reconcile if scheduled')}</small></td><td>${esc(p.kind)}<small>${fmt(p.amount_cents)}</small></td><td>${esc(memberName(p.payer_id))}<small>Entered by ${esc(memberName(p.entered_by))}</small></td><td>${esc(p.notes)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Your first deposit, purchase, or refund will appear here.</p>'}</section>`;
}
function renderVendors() {
  return `<section class="panel"><div class="section-head"><h2>Your vendors</h2>${btn('vendor-new','Add vendor','','')}</div><p class="muted">Contact details live here. Bookings and balances come from the same expenses as your budget.</p>${data.vendors.map(v => {
    const rows = totals.rows.filter(e => e.vendor_id === v.id && e.agreed_cents !== null);
    return `<article class="panel"><div class="section-head"><h3>${esc(v.name)}</h3>${btn('vendor-edit','Edit contact',v.id)}</div><p>${esc(v.contact_name)} · ${esc(v.email)} · ${esc(v.phone)}</p><p>${esc(v.website)}</p><p>${esc(v.notes)}</p>${rows.length ? expenseTable(rows) : '<p class="muted">No booked expenses yet.</p>'}</article>`;
  }).join('') || '<p class="empty">Add vendor contacts, then add packages to an expense to compare quotes.</p>'}</section><section class="panel"><h2>Compare offers by expense</h2>${expenseTable(totals.rows)}</section>${selectedExpense ? renderExpense(selectedExpense) : ''}`;
}
function openForm(title, fields, save) {
  $('#dialog-title').textContent = title; $('#fields').innerHTML = fields; $('#form-error').textContent = '';
  $('#save').disabled = false; $('#save').textContent = api.pending ? 'Retry original save' : 'Save';
  $('#edit-form').onsubmit = async event => {
    event.preventDefault(); $('#save').disabled = true; $('#cancel').disabled = true;
    try {
      if (api.pending) await api.retryPending(); else await save(Object.fromEntries(new FormData(event.currentTarget)));
      dialog.close(); notify('Saved.'); await reload();
    } catch (error) {
      $('#form-error').textContent = errorMessage(error); $('#save').textContent = api.pending ? 'Retry original save' : 'Save';
    } finally { $('#save').disabled = false; $('#cancel').disabled = false; }
  };
  dialog.showModal();
}
function operation(path, body, method = 'POST', prefer = 'return=representation') {
  return api.mutate({ path, options: { method, body, prefer } });
}
function update(table, record, changes) {
  return operation(`${table}?id=eq.${record.id}&version=eq.${record.version}`, { ...changes, version: record.version }, 'PATCH');
}
function insert(table, record) {
  return operation(table, { id: crypto.randomUUID(), wedding_id: weddingId, ...record }, 'POST', 'return=representation,resolution=ignore-duplicates');
}
function settingsForm() {
  const w = data.wedding;
  openForm('Wedding settings', input('name','Wedding name',w.name,'text','required maxlength="120"') + select('currency','Currency (two decimal places)', ['USD','CAD','GBP','EUR','AUD','NZD'].map(c => [c,c]),w.currency) + amount('cap','Wedding cap',w.cap_cents,true) + input('wedding_date','Wedding date (optional)',w.wedding_date || '','date') + (data.planner_ready?input('planning_headcount','Planning guest count (optional)',w.planning_headcount??'','number','min="0" max="100000" step="1"'):'') + input('time_zone','IANA time zone',w.time_zone,'text','required') + '<p class="muted">Currency is fixed after your first expense. Dates follow your wedding’s time zone. Planning headcount is a starting point for new per-guest quotes; existing offers keep their saved count.</p>', f => update('weddings',w,{name:f.name.trim(),currency:f.currency,cap_cents:cents(f.cap),wedding_date:f.wedding_date || null,time_zone:f.time_zone.trim(),...(data.planner_ready?{planning_headcount:f.planning_headcount===''?null:Number(f.planning_headcount)}:{})}));
  if (data.expenses.length) $('#f-currency').disabled = true;
  // Disabled controls are omitted from FormData; retain the original currency.
  if (data.expenses.length) { const hidden = document.createElement('input'); hidden.type='hidden'; hidden.name='currency'; hidden.value=w.currency; $('#fields').append(hidden); }
}
const checkbox = (name,label,checked=false) => `<label class="check-label"><input type="checkbox" name="${name}" value="on" ${checked?'checked':''}> <span>${esc(label)}</span></label>`;
function requirePlanner() {
  if(data.planner_ready)return true;
  notify('The shared planning features are being prepared. Your budget is ready to use.');return false;
}
function householdForm(id) {
  if(!requirePlanner())return;
  const household=data.invitations.find(i=>i.id===id), householdId=household?.id||crypto.randomUUID();
  const fields=input('household_name','Household name',household?.household_name||'','text','required maxlength="160" placeholder="The Rivera family"')
    +(!household?area('guest_names','Guest names · one per line')+input('unnamed_count','Unnamed companions',0,'number','required min="0" max="20" step="1"')+'<p class="muted">Each name and each unnamed companion is one invited seat.</p>':'')
    +input('contact_email','Household email',household?.contact_email||'','email','maxlength="254"')
    +input('phone','Phone',household?.phone||'','tel','maxlength="100"')
    +area('mailing_address','Mailing address',household?.mailing_address||'')
    +input('save_the_date_sent_on','Save-the-date sent on',household?.save_the_date_sent_on||'','date')
    +input('invitation_sent_on','Formal invitation sent on',household?.invitation_sent_on||'','date')
    +area('notes','Household notes',household?.notes||'');
  openForm(household?'Edit household':'Invite your people',fields,async f=>{
    const record={household_name:f.household_name.trim(),contact_email:f.contact_email.trim(),phone:f.phone.trim(),mailing_address:f.mailing_address,
      save_the_date_sent_on:f.save_the_date_sent_on||null,invitation_sent_on:f.invitation_sent_on||null,notes:f.notes};
    if(household)return update('invitations',household,record);
    const guests=householdGuests(f.guest_names,Number(f.unnamed_count)).map(g=>({...g,id:crypto.randomUUID()}));
    return operation('rpc/create_household',{i:{...record,id:householdId,wedding_id:weddingId},g:guests});
  });
  $('#f-mailing_address').maxLength=1000;
}
function guestForm(id,invitationId) {
  if(!requirePlanner())return;
  const guest=data.guests.find(g=>g.id===id), households=data.invitations.filter(i=>!i.archived||i.id===guest?.invitation_id);
  if(!households.length){householdForm();return;}
  openForm(guest?'Edit guest':'Add a guest',select('invitation_id','Household',households.map(i=>[i.id,i.household_name]),guest?.invitation_id||invitationId||households[0].id)
    +input('name','Guest name (blank for an unnamed companion)',guest?.name||'','text','maxlength="120"')
    +checkbox('is_companion','This guest is a companion',guest?.is_companion)
    +select('rsvp','Reply',[['pending','Awaiting reply'],['yes','Joyfully attending'],['no','Unable to attend']],guest?.rsvp||'pending')
    +select('tag','Relationship',[['','No tag'],...GUEST_TAGS.map(t=>[t,t])],guest?.tag||'')
    +checkbox('gift_received','Gift received',guest?.gift_received)
    +'<fieldset class="dietary-options"><legend>Dietary needs · choose all that apply</legend>'
    +DIETARY_FLAGS.map(([key,label])=>checkbox(`diet_${key}`,label,guest?.dietary_flags?.includes(key))).join('')+'</fieldset>'
    +area('dietary_notes','Guest’s allergy or dietary request',guest?.dietary_notes||'')
    +area('caterer_confirmation','Caterer’s response / confirmation',guest?.caterer_confirmation||''),f=>{
      const name=f.name.trim()||null,is_companion=f.is_companion==='on';
      if(!name&&!is_companion)throw new Error('Enter a name or mark this guest as an unnamed companion.');
      const record={invitation_id:f.invitation_id,name,is_companion,rsvp:f.rsvp,tag:f.tag,gift_received:f.gift_received==='on',
        dietary_flags:DIETARY_FLAGS.filter(([key])=>f[`diet_${key}`]==='on').map(([key])=>key),dietary_notes:f.dietary_notes,caterer_confirmation:f.caterer_confirmation};
      return guest?update('guests',guest,record):insert('guests',record);
    });
  $('#f-dietary_notes').maxLength=2000;$('#f-caterer_confirmation').maxLength=2000;
}
function taskForm(id) {
  if(!requirePlanner())return;
  const task=data.tasks.find(t=>t.id===id);
  openForm(task?'Edit our plan':'A little next step',input('title','What needs to happen?',task?.title||'','text','required maxlength="160"')
    +select('planning_window','Planning window',TASK_WINDOWS.map(w=>[w.id,w.label]),task?.planning_window||'12_plus')
    +input('due_date','Fixed due date (optional)',task?.due_date||'','date')
    +'<p class="muted">Leave the fixed date blank to follow your wedding date and planning window.</p>'
    +select('assignee_id','Who’s taking this one?',[['','Together / unassigned'],...data.members.map(m=>[m.user_id,m.display_name])],task?.assignee_id||'')
    +checkbox('completed','Already complete',task?.completed)+area('notes','Notes',task?.notes||''),f=>{
      const record={title:f.title.trim(),planning_window:f.planning_window,due_date:f.due_date||null,assignee_id:f.assignee_id||null,completed:f.completed==='on',notes:f.notes};
      return task?update('tasks',task,record):insert('tasks',record);
    });
}
async function seedTasks() {
  if(!requirePlanner())return;
  const records=STARTER_TASKS.map(([starter_key,planning_window,title])=>({id:crypto.randomUUID(),wedding_id:weddingId,starter_key,planning_window,title}));
  await operation('tasks?on_conflict=wedding_id,starter_key',records,'POST','return=representation,resolution=ignore-duplicates');
  notify('Your editable starter checklist is ready. Existing starter tasks were preserved.');await reload();
}
async function changePlannerRecord(table,id,fields) {
  const record=data[table].find(r=>r.id===id);if(!record)throw new Error('This record changed. Refresh and try again.');
  await update(table,record,fields);await reload();
}
function exportGuests() {
  const rows=guestSummary(data.invitations,data.guests).active.map(g=>{
    const i=data.invitations.find(i=>i.id===g.invitation_id);
    return [g.id,i.household_name,g.name||'Unnamed companion',g.is_companion,g.rsvp,g.tag,g.gift_received,
      i.contact_email,i.phone,i.mailing_address,i.save_the_date_sent_on,i.invitation_sent_on,(g.dietary_flags||[]).join('; '),g.dietary_notes,g.caterer_confirmation];
  });
  const url=URL.createObjectURL(new Blob([csv([['guest_id','household','guest_name','companion','rsvp','relationship','gift_received','email','phone','address','save_the_date_sent','invitation_sent','dietary_flags','guest_request','caterer_confirmation'],...rows])],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='wedding-guests.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Exported active guests. Keep this file private.');
}
function categoryForm(id) {
  const c = data.categories.find(c => c.id === id);
  openForm(c ? 'Rename category' : 'Add category',input('name','Category name',c?.name || '','text','required maxlength="100"'), f => c ? update('categories',c,{name:f.name.trim()}) : insert('categories',{name:f.name.trim()}));
}
function vendorForm(id) {
  const v = data.vendors.find(v => v.id === id);
  openForm(v ? 'Edit vendor' : 'Add vendor', input('name','Vendor name',v?.name || '','text','required maxlength="120"') + input('contact_name','Contact person',v?.contact_name) + input('email','Email',v?.email,'email') + input('phone','Phone',v?.phone,'tel') + input('website','Website',v?.website,'url') + area('notes','Notes',v?.notes), f => v ? update('vendors',v,f) : insert('vendors',f));
}
function expenseForm(id) {
  if (!data.categories.length) { categoryForm(); return; }
  const e = data.expenses.find(e => e.id === id), expenseId = e?.id || crypto.randomUUID(), paymentId = crypto.randomUUID();
  const booked = e?.agreed_cents !== null && !!e;
  const fields = (!e ? select('mode','Entry type',[
    ['planned','Planned expense'],['booked','Booked / agreed price'],['paid','Purchase paid in full'],
  ]) : '')
    + input('title','Expense name',e?.title || '','text','required maxlength="160"')
    + select('category_id','Category',opts(data.categories),e?.category_id || data.categories[0].id)
    + amount('target','Item target (blank = unknown; 0 is a real target)',e?.target_cents ?? null)
    + (!booked ? select('vendor_id','Vendor (optional)',[['','No vendor linked'],...opts(data.vendors)],e?.vendor_id || '') : '')
    + area('notes','Notes',e?.notes)
    + (!e ? '<div id="agreement-fields" hidden>'
      + amount('agreed','Agreed price / full purchase amount') + '</div><div id="purchase-fields" hidden>'
      + input('paid_on','Purchase payment date',today(),'date')
      + select('payer_id','Purchase paid by',data.members.map(m => [m.user_id,m.display_name]),api.session.user.id)
      + '<p class="muted">Save once to record this purchase and its full payment together. No installment entry is needed. A free purchase records an agreed price of zero without a payment.</p></div>' : '');
  openForm(e ? 'Edit expense' : 'Add expense or purchase', fields, async f => {
    const fields = {title:f.title.trim(),category_id:f.category_id,target_cents:cents(f.target,true),notes:f.notes,...(!booked ? {vendor_id:f.vendor_id || null} : {})};
    if (e) return update('expenses',e,fields);
    const agreed = f.mode === 'planned' ? null : cents(f.agreed);
    const expense = {id:expenseId,wedding_id:weddingId,...fields,agreed_cents:agreed};
    const payment = f.mode === 'paid' && agreed > 0 ? {id:paymentId,wedding_id:weddingId,expense_id:expenseId,kind:'payment',amount_cents:agreed,paid_on:f.paid_on,payer_id:f.payer_id,notes:'Paid in full at purchase'} : null;
    return operation('rpc/create_expense',{e:expense,p:payment});
  });
  if (!e) $('#f-mode').onchange = () => {
    const mode = $('#f-mode').value;
    $('#agreement-fields').hidden = mode === 'planned';
    $('#purchase-fields').hidden = mode !== 'paid';
    $('#f-agreed').required = mode !== 'planned';
    $('#f-paid_on').required = mode === 'paid';
  };
}
function quoteForm(id, expenseId) {
  if (!data.vendors.length) { notify('Add a vendor contact first, then add its quote.'); vendorForm(); return; }
  const q = data.quotes.find(q => q.id === id);
  openForm(q ? 'Edit quote' : 'Add a package quote',input('package_name','Package name',q?.package_name || '','text','required maxlength="160"') + select('vendor_id','Vendor',opts(data.vendors),q?.vendor_id || data.vendors[0].id) + select('pricing_basis','Pricing basis',[['fixed','Fixed package'],['per_person','Per guest']],q?.pricing_basis || 'fixed') + amount('unit','Package price / price per guest',q?.unit_cents ?? null,true) + input('headcount','Planning headcount for per-guest offers',q?.headcount || data.wedding.planning_headcount || 1,'number','min="1" max="100000" required') + area('details','What’s included',q?.details) + select('rating','Your rating',[['','Not rated'],...['1','2','3','4','5'].map(r => [r,`${r}/5`])],String(q?.rating || '')) + area('notes','Notes',q?.notes), f => {
    const fields = {package_name:f.package_name.trim(),pricing_basis:f.pricing_basis,unit_cents:cents(f.unit),headcount:Number(f.headcount),details:f.details,rating:f.rating ? Number(f.rating) : null,notes:f.notes};
    return q ? update('quotes',q,fields) : insert('quotes',{...fields,vendor_id:f.vendor_id,expense_id:expenseId});
  });
  if (q) $('#f-vendor_id').disabled = true;
}
function bookForm(id, quoteId) {
  const e = data.expenses.find(e => e.id === id), q = data.quotes.find(q => q.id === quoteId);
  if (e.agreed_cents !== null) throw new Error('This expense is already booked. Use an amendment.');
  openForm('Record the agreement', `<p>${esc(e.title)}${q ? ` · ${esc(q.package_name)} · ${esc(vendorName(q.vendor_id))}` : ''}</p>` + amount('agreed','Agreed price',q ? quoteTotal(q) : null,true) + (!q ? select('vendor_id','Vendor',[['','No vendor linked'],...opts(data.vendors)],e.vendor_id || '') : '') + '<p class="muted">Booking uses this existing expense. Other offers stay available for reference.</p>', f => update('expenses',e,{agreed_cents:cents(f.agreed),booked_quote_id:q?.id || null,preferred_quote_id:q?.id || e.preferred_quote_id,vendor_id:q?.vendor_id || f.vendor_id || null}));
}
function amendForm(id) {
  const e = data.expenses.find(e => e.id === id);
  openForm('Amend the agreed price',amount('agreed','New agreed price',e.agreed_cents,true) + area('reason','Reason for contract amendment') + '<p class="muted">The original quote stays preserved. This change is recorded in the expense’s amendment history.</p>', f => {
    if (f.reason.trim().length < 3) throw new Error('Explain the contract amendment.');
    return update('expenses',e,{agreed_cents:cents(f.agreed),amendment_reason:f.reason.trim()});
  });
}
function installmentForm(id, expenseId) {
  const i = data.installments.find(i => i.id === id);
  openForm(i ? 'Edit installment' : 'Add installment',input('label','Installment name',i?.label || '','text','required maxlength="120"') + amount('amount','Scheduled amount',i?.amount_cents ?? null,true) + input('due_date','Due date',i?.due_date || today(),'date','required'), f => {
    const fields = {label:f.label.trim(),amount_cents:cents(f.amount),due_date:f.due_date};
    return i ? update('installments',i,fields) : insert('installments',{...fields,expense_id:expenseId});
  });
}
function paymentForm(expenseId = '', installmentId = '') {
  if (!data.expenses.length) { expenseForm(); return; }
  const id = crypto.randomUUID(), chosen = expenseId || data.expenses[0].id;
  openForm('Record payment or refund',select('expense_id','Expense',opts(data.expenses,'title'),chosen) + select('kind','Transaction type',[['payment','Payment / deposit'],['refund','Refund from vendor']]) + amount('amount','Amount',null,true) + input('paid_on','Payment / refund date',today(),'date','required') + select('payer_id','Paid by / refunded to',data.members.map(m => [m.user_id,m.display_name]),api.session.user.id) + '<div id="installment-select"></div>' + area('notes','Notes') + '<p class="muted">You can record a payment made by either partner. Your account is separately recorded as the person entering it.</p>', f => operation('rpc/record_payment',{p:{id,wedding_id:weddingId,expense_id:f.expense_id,installment_id:f.installment_id || null,kind:f.kind,amount_cents:cents(f.amount),paid_on:f.paid_on,payer_id:f.payer_id,notes:f.notes}}));
  const draw = () => {
    const expense = $('#f-expense_id').value;
    $('#installment-select').innerHTML = select('installment_id','Allocate to installment',[['','Unallocated — reconcile if scheduled'],...data.installments.filter(i => i.expense_id === expense).map(i => [i.id,`${i.label} · ${i.due_date} · ${fmt(Math.max(0,installmentBalance(i,data.payments)))} open`])],installmentId);
  };
  draw(); $('#f-expense_id').onchange = () => { installmentId=''; draw(); };
}
function exportCSVs() {
  const download = (name, rows) => {
    const url = URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  download('wedding-expenses.csv', [['expense_id','category','title','vendor','currency','target_cents','forecast_cents','agreed_cents','paid_net_cents','owed_cents','credit_cents','preferred_quote_id','booked_quote_id','notes'],...totals.rows.map(e => [e.id,data.categories.find(c => c.id === e.category_id)?.name,e.title,vendorName(e.vendor_id),data.wedding.currency,e.target_cents,e.forecast,e.agreed_cents,e.paid,e.owed,e.credit,e.preferred_quote_id,e.booked_quote_id,e.notes])]);
  download('wedding-payments.csv', [['payment_id','expense_id','expense','installment_id','kind','amount_cents','currency','date','payer','payer_id','entered_by','entered_by_id','notes'],...data.payments.map(p => [p.id,p.expense_id,expenseName(p.expense_id),p.installment_id,p.kind,p.amount_cents,data.wedding.currency,p.paid_on,memberName(p.payer_id),p.payer_id,memberName(p.entered_by),p.entered_by,p.notes])]);
  notify('Exported expense and payment CSVs. Allow multiple downloads if your browser asks. Amounts are integer cents.');
}
const actions = {
  'tab-guests':()=>{tab='guests';render();},'tab-planning':()=>{tab='planning';render();},
  'household-new':()=>householdForm(),'household-edit':householdForm,
  'household-archive':id=>changePlannerRecord('invitations',id,{archived:!data.invitations.find(i=>i.id===id).archived}),
  'guest-new':invitationId=>guestForm('',invitationId),'guest-edit':id=>guestForm(id),
  'guest-rsvp':(id,rsvp)=>changePlannerRecord('guests',id,{rsvp}),
  'guest-archive':id=>changePlannerRecord('guests',id,{archived:!data.guests.find(g=>g.id===id).archived}),
  'guests-export':exportGuests,'task-new':()=>taskForm(),'task-edit':taskForm,'tasks-seed':seedTasks,
  'task-toggle':id=>changePlannerRecord('tasks',id,{completed:!data.tasks.find(t=>t.id===id).completed}),
  'task-archive':id=>changePlannerRecord('tasks',id,{archived:!data.tasks.find(t=>t.id===id).archived}),
  'task-filter':id=>{taskFilter=id;render();},
  'reset-request': renderResetRequest, 'back-to-login': () => renderLogin(),
  'cancel-recovery': async () => {try{await api.signOut();}finally{resetPrivateUI();renderLogin();}},
  start, refresh: reload, settings: settingsForm, export: exportCSVs,
  'tab-budget': () => {tab='budget';render();}, 'tab-vendors': () => {tab='vendors';render();},
  'category-new': () => categoryForm(), 'category-edit': categoryForm,
  'filter-category': id => {selectedCategory=id;tab='budget';render();$('#expenses').scrollIntoView({block:'start'});},
  'vendor-new': () => vendorForm(), 'vendor-edit': vendorForm,
  'expense-new': () => expenseForm(), 'expense-edit': expenseForm,
  'expense-open': id => {selectedExpense=id;render();$('#expense-detail').scrollIntoView({block:'start'});},
  'quote-new': id => quoteForm('',id), 'quote-edit': id => quoteForm(id),
  prefer: async id => {const q=data.quotes.find(q => q.id===id);await update('expenses',data.expenses.find(e => e.id===q.expense_id),{preferred_quote_id:id});await reload();},
  'clear-preferred': async id => {await update('expenses',data.expenses.find(e => e.id===id),{preferred_quote_id:null});await reload();},
  book: id => bookForm(id), 'book-quote': id => {const q=data.quotes.find(q => q.id===id);bookForm(q.expense_id,id);}, amend: amendForm,
  'installment-new': id => installmentForm('',id), 'installment-edit': id => installmentForm(id),
  'payment-new': () => paymentForm(), 'payment-expense': id => paymentForm(id),
  'payment-installment': id => paymentForm(data.installments.find(i => i.id===id).expense_id,id),
  retry: async () => {await api.retryPending();notify('Original save confirmed.');await reload();},
  logout: async () => {resetPrivateUI();try{await api.signOut();}finally{renderLogin();}},
};
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]'); if (!target) return;
  event.preventDefault(); target.disabled=true;
  try {await actions[target.dataset.action]?.(target.dataset.id,target.dataset.value);} catch(error){notify(errorMessage(error),true); if(data)render();} finally{target.disabled=false;}
});
document.addEventListener('change',event => {
  if(event.target.id==='comparison') $('#bars').innerHTML=bars(event.target.value);
  if(event.target.id==='f-category-filter'){selectedCategory=event.target.value;render();}
  const guestSelects={'f-guest-rsvp':'rsvp','f-guest-tag':'tag','f-guest-view':'view'};
  if(guestSelects[event.target.id]){guestFilters[guestSelects[event.target.id]]=event.target.value;render();}
});
document.addEventListener('input',event=>{
  if(event.target.id!=='f-guest-search')return;
  guestFilters.search=event.target.value;const cursor=event.target.selectionStart;render();
  $('#f-guest-search').focus();$('#f-guest-search').setSelectionRange(cursor,cursor);
});
$('#cancel').onclick = () => dialog.close();
dialog.addEventListener('cancel',event => {if($('#save').disabled)event.preventDefault();});
window.addEventListener('focus',() => {if(api?.session && !api.session.recovery && !handlingAuthRedirect) void (data ? reload() : start());});
window.addEventListener('online',() => {if(api?.session && !api.session.recovery && !handlingAuthRedirect) void (data ? reload() : start());});
window.addEventListener('hashchange',() => {
  const parameters = takeAuthRedirect(window.location, window.history);
  if (api && parameters) void finishAuthRedirect(parameters);
});
setInterval(() => {if(api?.session && !document.hidden && data) void reload();},20000);

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) || !config.publishableKey.startsWith('sb_publishable_')) {
  $('#main').innerHTML='<section class="panel login"><p class="eyebrow">READY WHEN YOU ARE</p><h1>Set up your shared budget.</h1><p>Add your Supabase project URL and publishable key to <code>docs/config.js</code>, then reload. Follow the README to apply the migration and provision both accounts.</p></section>';
} else {
  api = new Api(config);
  api.onSession=() => {if(api.session && weddingId)connectLive();};
  void finishAuthRedirect(initialAuthRedirect);
}
