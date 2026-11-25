import {prepareGuestImport,maxFileBytes} from './guest-import.js';
import {aisleReady,aisleStartsOpen,renderAisle} from './aisle.js';
import {renderSeating} from './seating.js';
import {seatingForm} from './seating-editor.js';
import { config } from './config.js';
import {invitationId,loadPlannerAccess,chooseWedding,renderAccess} from './enrollment.js';
import { Api, subscribe, takeAuthRedirect } from './api.js';
import { cents, money, quoteTotal, summarize, installmentBalance, csv, localDate } from './budget.js';
import {escapeHTML as esc,button as btn,input,textarea as area,select} from './ui.js';
import {setupEditor} from './editor.js';
import {createPhotoCache} from './photo-cache.js';
import {TASK_WINDOWS,DIETARY_FLAGS,GUEST_TAGS,STARTER_TASKS,householdGuests,guestSummary} from './planner.js';
import {renderGuests,renderPlanning,plannerOverview,displayDate} from './planner-views.js';
import {websiteLink,timeZones,countdown,attributionOptions,renderSchedule,upcomingVendorTours,renderMoodboard,pinterestBoard,validatePhoto} from './features.js';
import {renderItinerary,itineraryTracks,itineraryRecord} from './itinerary.js';
import {renderMenu,menuCourses,menuDiners,guestMeal,menuOptionRecord,menuEstimate,menuCSV,PRICE_BASES} from './menu.js';

const $ = s => document.querySelector(s);
const initialAuthRedirect = takeAuthRedirect(window.location, window.history);
let inviteLink=invitationId(window.location.href), access=null, hubOptions=null;
const amount = (name, label, value = null, required = false) => input(name, label, value === null ? '' : (value / 100).toFixed(2), 'text', `inputmode="decimal" ${required ? 'required' : ''} maxlength="14"`);
const dialog = $('#editor');
const editor = setupEditor(dialog, $('#editor-body'));
let api, data, totals, weddingId, tab = 'budget', selectedExpense = '', selectedCategory = '', stopLive, loading = false, loadAgain = false, syncStatus = 'Connecting…', noticeTimer;
let sessionEpoch = 0, handlingAuthRedirect = false;
let guestFilters, menuFilters;
let taskFilter = 'all', comparison = 'paid', scheduleFilter = 'upcoming', itineraryTrack='';
let seatingEvent='reception', seatingUnit='';
let aisleOpen=null;
const budgetActions = () => btn('expense-new','+ Add expense','','') + btn('payment-new','Record payment');
const plannerSections = {
  budget: {label:'Budget', render:renderBudget, primary:budgetActions},
  vendors: {label:'Vendors & quotes', render:renderVendors, primary:budgetActions},
  guests: {
    label:'Guest list', render:() => renderGuests(data,guestFilters),
    primary:() => btn('household-new','+ Add household','','')
  },
  planning: {
    label:'Our checklist', render:() => renderPlanning(data,taskFilter,today()),
    primary:() => btn('task-new','+ Add task','','')
  },
  schedule: {
    label:'Schedule', render:() => renderSchedule(data,today(),scheduleFilter),
    primary:() => btn('event-new','+ Add event','','')
  },
  moodboard: {
    label:'Mood board', render:() => renderMoodboard(data),
    primary:() => btn('moodboard-edit','Link Pinterest board')
  },
  itinerary: {
    label:'Day-of itinerary', render:() => renderItinerary(data,itineraryTrack),
    primary:() => data.itinerary_ready ? btn('itinerary-new','+ Add activity','','') : ''
  },
  menu: {
    label:'Our menu', render:() => renderMenu(data,menuFilters),
    primary:() => data.menu_ready ? btn('menu-dish-new','+ Add dish','','') : ''
  },
  seating: {label:'Seating chart', render:() => renderSeating(data,seatingEvent,seatingUnit)}
};
const menuPhotos = createPhotoCache(path => api.photo(path,{bucket:'menu-photos'}));
const vendorPhotoCache = createPhotoCache(path => api.photo(path));
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
  access=null; hubOptions=null; document.title='Our Big Day';
  tab='budget'; selectedExpense=''; selectedCategory=''; itineraryTrack='';
  guestFilters={search:'',rsvp:'',tag:'',table:'',view:'active'};
  menuFilters={group:'course',vendor:'',search:''};
  seatingEvent='reception'; seatingUnit='';
  aisleOpen=null;
  $('#back-to-top').hidden=true;
  document.body.classList.toggle('printing-itinerary',false);
  document.body.classList.toggle('printing-menu',false);
  menuPhotos.retain(new Set());
  vendorPhotoCache.retain(new Set());
  sessionEpoch++; stopLive?.(); stopLive = null; data = null; totals = null; weddingId = null;
  loading=false; loadAgain=false; syncStatus='Connecting…';
  if (dialog.open) dialog.close();
  $('#edit-form').onsubmit=null;
  $('#fields').replaceChildren(); $('#dialog-title').textContent=''; $('#form-error').textContent='';
  $('#account').replaceChildren(); $('#main').replaceChildren(); $('#notice').textContent = '';
}
function renderLogin(message = '') {
  $('#account').replaceChildren();
  $('#main').innerHTML = `<section class="panel login"><h1>Your day, together.</h1><p>${inviteLink?'Sign in with the email address on your invitation, or create your account below.':'Sign in to your private wedding planner.'}</p><form id="login">${input('email','Email','','email','required autocomplete="username"')}${input('password','Password','','password','required autocomplete="current-password"')}<p id="login-error" role="alert">${esc(message)}</p><button type="submit">Sign in</button></form><p>${btn('reset-request','Forgot password?')}</p>${inviteLink?btn('register-invited','Create invited account'):'<p class="muted">New to Our Big Day? Open the invitation link shared with you.</p>'}</section>`;
  $('#login').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    form.querySelector('button').disabled = true;
    try { await api.signIn(fields.get('email').trim(), fields.get('password')); form.reset(); await start(); }
    catch (error) { $('#login-error').textContent = error.message; }
    finally { if (form.isConnected) form.querySelector('button').disabled = false; }
  };
}
function renderRegistration() {
  if (!inviteLink) return renderLogin();
  $('#main').innerHTML=`<section class="panel login"><h1>Create your account</h1><form id="register-invited">${input('email','Invited email address','','email','required autocomplete="email"')}${input('password','Choose a password','','password','required minlength="8" autocomplete="new-password"')}<p>We’ll send an email to confirm this address.</p><p id="register-error" role="alert"></p><button type="submit">Create account</button></form><p>${btn('back-to-login','Back to sign in')}</p></section>`;
  $('#register-invited').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget, fields=new FormData(form), button=form.querySelector('button');
    button.disabled=true;
    try {
      await api.registerInvited(fields.get('email').trim(),fields.get('password'),inviteLink,window.location.origin+window.location.pathname);
      if (form.isConnected) renderLogin('Check your email to confirm your account. If you already have an account, sign in or reset your password.');
    } catch(error) { if (form.isConnected) $('#register-error').textContent=error.message; }
    finally { button.disabled=false; }
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
async function start(options={}) {
  resetPrivateUI();
  if (!api.session) { renderLogin(); return; }
  if (api.session.recovery) { renderPasswordChange(); return; }
  const epoch = sessionEpoch;
  $('#main').innerHTML = '<p>Loading your planner…</p>';
  try {
    const next=await loadPlannerAccess(api,inviteLink);
    if (epoch !== sessionEpoch) return;
    access=next;
    const chosen=chooseWedding(access,{...options,linkId:inviteLink});
    if (!chosen) {
      renderAccount();
      if (api.pending) {
        $('#main').innerHTML=`<section class="panel"><h1>Finish your pending save</h1><p>Confirm the original save before choosing a wedding.</p>${btn('access-retry','Retry original save')}</section>`;
      } else showAccess(options);
      return;
    }
    clearInviteLink();
    weddingId=chosen;
    await reload();
    if (epoch === sessionEpoch && data) connectLive();
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    if (!api.session) renderLogin(error.message);
    else { $('#main').innerHTML = `<section class="panel"><h1>Couldn’t load your planner</h1><p>${esc(error.message)}</p>${btn('start', 'Try again')}</section>`; renderAccount(); }
  }
}
function renderAccount() {
  $('#account').innerHTML = api.session ? `${esc(api.session.user.email)} ${data&&(access?.enabled||access?.weddings.length>1)?btn('wedding-access','Weddings & invitations'):''} ${btn('logout','Sign out')}` : '';
}
function clearInviteLink() {
  if (!inviteLink) return;
  const url=new URL(window.location.href); url.searchParams.delete('invitation');
  window.history.replaceState(null,'',url.pathname+url.search+url.hash); inviteLink=null;
}
function showAccess(options={}) {
  hubOptions=options;
  $('#main').innerHTML=renderAccess(access,{...options,linkId:inviteLink,origin:window.location.href});
  const accept=$('#accept-planner-invite'), issue=$('#issue-planner-invite');
  if (accept) accept.onsubmit=e=>submitAccess(e,'accept_planner_invite',f=>({invitation:accept.dataset.id,member_name:f.member_name,wedding_name:f.wedding_name||null,zone:f.zone||null}));
  if (issue) issue.onsubmit=e=>submitAccess(e,'issue_planner_invite',f=>({w:f.target==='new'?null:f.target,recipient:f.recipient}));
  const share=$('#f-share-link');
  if (share) { share.focus(); share.select(); }
}
async function submitAccess(event,command,body) {
  event.preventDefault();
  const form=event.currentTarget, submit=form.querySelector('button'), epoch=sessionEpoch;
  const args=body(Object.fromEntries(new FormData(form)));
  submit.disabled=true;
  try {
    const id=await api.request('rpc/'+command,{method:'POST',body:args});
    if (epoch!==sessionEpoch || !form.isConnected) return;
    if (command==='accept_planner_invite') await start({wedding:id});
    else await start({hub:true,issued:id,target:args.w||'new'});
  } catch(error) {
    if (epoch===sessionEpoch && form.isConnected) {
      let alert=form.querySelector('[role="alert"]');
      if (!alert) { alert=document.createElement('p');alert.setAttribute('role','alert');form.insertBefore(alert,submit); }
      alert.textContent=error.message;
    }
  } finally { submit.disabled=false; }
}
function connectLive() {
  stopLive?.();
  if (!weddingId || !api.session) return;
  stopLive = subscribe(api, weddingId, () => reload(), status => { syncStatus = status; if ($('#sync')) $('#sync').textContent = status; },!!data?.planner_ready,!!data?.feedback_ready,!!data?.itinerary_ready,!!data?.menu_ready,!!data?.seating_ready);
}
async function reload() {
  if (loading) { loadAgain = true; return; }
  if (!weddingId || !api.session) return;
  loading = true; const epoch = sessionEpoch;
  try {
    const snapshot = await api.snapshot(weddingId);
    if (epoch !== sessionEpoch) return;
    if (!snapshot.wedding) { resetPrivateUI(); $('#main').innerHTML = '<h1>Wedding access removed</h1><p>Contact your administrator.</p>'; renderAccount(); return; }
    const previousReady = data?.planner_ready, previousFeedback=data?.feedback_ready,previousItinerary=data?.itinerary_ready,previousMenu=data?.menu_ready,previousSeating=data?.seating_ready;
    data = {...snapshot,invitations:snapshot.invitations||[],guests:snapshot.guests||[],tasks:snapshot.tasks||[],events:snapshot.events||[],vendor_photos:snapshot.vendor_photos||[],itinerary_items:snapshot.itinerary_items||[],menu_courses:snapshot.menu_courses||[],menu_options:snapshot.menu_options||[],guest_meals:snapshot.guest_meals||[]};
    menuPhotos.retain(new Set(data.menu_options.map(dish => dish.photo_path)));
    vendorPhotoCache.retain(new Set(data.vendor_photos.map(photo => photo.storage_path)));
    if(selectedCategory&&!data.categories.some(c=>c.id===selectedCategory))selectedCategory='';
    if(itineraryTrack&&!itineraryTracks(data).includes(itineraryTrack))itineraryTrack='';
    totals = summarize(data); render();
    if (stopLive && (previousReady !== data.planner_ready||previousFeedback!==data.feedback_ready||previousItinerary!==data.itinerary_ready||previousMenu!==data.menu_ready||previousSeating!==data.seating_ready)) connectLive();
  } catch (error) {
    if (epoch !== sessionEpoch) return;
    if (!api.session) { resetPrivateUI(); renderLogin('Session expired. Sign in again.'); }
    else if (!data) throw error;
    else notify(`Refresh failed. Displayed figures may be out of date. ${error.message}`, true);
  } finally {
    // A previous account's refresh may finish while this account is still loading.
    if (epoch === sessionEpoch) {
      loading = false;
      if (loadAgain) { loadAgain = false; void reload(); }
    }
  }
}
function isAisleOpen() {
  return aisleReady(data.wedding) && (aisleOpen ?? aisleStartsOpen(data.wedding));
}
function render() {
  document.body.classList.toggle('printing-itinerary',tab==='itinerary');
  document.body.classList.toggle('printing-menu',tab==='menu');
  const previousBoard=document.querySelector('.moodboard-frame');
  renderAccount();
  const section = plannerSections[tab];
  const primary = section.primary?.() ?? '';
  const showAisle = isAisleOpen();
  document.title=data.wedding.name+' · Our Big Day';
  $('#main').innerHTML = `<section class="intro"><div><p class="eyebrow">${data.members.map(m=>esc(m.display_name)).join(' + ')}</p><h1>${esc(data.wedding.name)}</h1><p class="intro-note">A little planning. A lot of love.</p>${countdown(data.wedding.wedding_date,today())}<p class="wedding-meta">${data.wedding.wedding_date?esc(displayDate(data.wedding.wedding_date)):'Our date is still a beautiful possibility'}<span>·</span>${esc(data.wedding.currency)}</p></div><div class="actions">${primary}</div></section>
    <div class="section-head utility-bar"><small id="sync" class="sync-status">${esc(syncStatus)}</small><div class="actions">${api.pending?btn('retry','Retry pending save'):''}${btn('refresh','Refresh')}${aisleReady(data.wedding)?`<button type="button" class="secondary" id="ask-aisle" data-action="aisle-toggle" aria-expanded="${showAisle}">Ask Aisle</button>`:''}${btn('settings','Wedding settings')}${btn('export','Budget CSVs')}</div></div>
    ${showAisle ? renderAisle(data,$('#f-aisle-vendor')?.value) : ''}
    <nav class="planner-nav" id="planner-sections" aria-label="Planner sections">${Object.entries(plannerSections).map(([id,{label}],index)=>`<button type="button" data-action="tab-${id}" class="secondary" aria-pressed="${tab===id}"><span aria-hidden="true">${String(index+1).padStart(2,'0')}</span>${label}</button>`).join('')}</nav>
    ${section.render()}`;
  updateBackToTop();
  const nextBoard=document.querySelector('.moodboard-frame');
  if(previousBoard&&nextBoard&&previousBoard.getAttribute('src')===nextBoard.getAttribute('src'))nextBoard.replaceWith(previousBoard);
  if (tab === 'vendors') void displayPhotos(data.vendor_photos,'storage_path','data-photo',vendorPhotoCache);
  if (tab === 'menu') void displayPhotos(data.menu_options,'photo_path','data-menu-photo',menuPhotos);
}
function showSeatingUnit(id) {
  seatingUnit=id; render();
  const heading=id?$('#unit-title'):$('#f-seating-unit');
  heading?.focus();
}
function editSeating(action,id,event) {
  if(action==='person' && data.seating_ready && !data.seating_units.some(u=>u.event===event)){
    tab='seating'; seatingEvent=event; showSeatingUnit(''); return;
  }
  return seatingForm(action,id,{data,event,selectedId:tab==='seating'?seatingUnit:'',openForm,
    save:(plan,expected,command)=>operation('rpc/change_seating',{w:weddingId,plan,expected,request_id:crypto.randomUUID(),command})});
}
function updateBackToTop() {
  const nav=document.querySelector('.planner-nav');
  $('#back-to-top').hidden=!nav || nav.getBoundingClientRect().bottom>0;
}
window.addEventListener('scroll',updateBackToTop,{passive:true});
window.addEventListener('resize',updateBackToTop);
$('#back-to-top').onclick=()=>{
  const current=document.querySelector('.planner-nav [aria-pressed="true"]');
  current?.focus({preventScroll:true});
  $('#planner-sections')?.scrollIntoView({block:'start'});
};
function renderBudget() {
  const room = data.wedding.cap_cents - totals.forecast;
  const next = totals.upcoming[0];
  return `<div class="cards"><article class="card feature forecast-card"><a class="forecast-link" href="#expenses">Forecast</a><span class="amount">${fmt(totals.forecast)}</span><small>${totals.unknown ? `${totals.unknown} item(s) awaiting estimate; total incomplete` : 'One price per expense'}</small></article>
    <article class="card"><a href="#payments">Paid, net of refunds</a><span class="amount">${fmt(totals.paid)}</span></article><article class="card"><a href="#expenses">Still owed</a><span class="amount">${fmt(totals.owed)}</span><small>Booked expenses only · ${fmt(totals.credit)} vendor credit</small></article><article class="card"><a href="#expenses">${room < 0 ? 'Over wedding cap' : 'Budget room'}</a><span class="amount ${room < 0 ? 'warning' : ''}">${fmt(Math.abs(room))}</span><small>Cap ${fmt(data.wedding.cap_cents)}${totals.unknown ? ' · provisional' : ''}</small></article></div>
    <section class="panel"><div class="section-head"><h2>Next payment</h2><a href="#installments">All installments</a></div>${next ? `<p><strong>${fmt(next.remaining)}</strong> · ${esc(next.label)} · ${esc(expenseName(next.expense_id))}</p><p>${esc(vendorName(data.expenses.find(e => e.id === next.expense_id)?.vendor_id))} · Due ${esc(next.due_date)} ${next.due_date < today() ? '<span class="warning">Overdue</span>' : ''}</p>${btn('payment-installment', 'Record payment', next.id)}` : '<p class="muted">No outstanding installments. Add a due date to a booked expense below.</p>'}
    <p class="muted">${fmt(totals.allocated)} allocated to budgeted amounts · ${fmt(data.wedding.cap_cents - totals.allocated)} left to allocate</p></section>
    ${plannerOverview(data,today())}
    <div class="twocol"><section class="panel"><div class="section-head"><h2>Budget vs. paid</h2><select aria-label="Chart comparison" id="comparison"><option value="paid" ${comparison==='paid'?'selected':''}>Paid</option><option value="forecast" ${comparison==='forecast'?'selected':''}>Forecast</option></select></div><div class="legend"><span>Lilac: budgeted amounts</span><span>Green: paid / forecast</span></div><div id="bars">${bars(comparison)}</div></section><section class="panel"><h2>Spending breakdown</h2>${breakdown()}</section></div>
    <section class="panel"><div class="section-head"><h2>Category amounts & overages</h2>${btn('category-new', 'Add category')}</div><p class="muted">Budgeted amounts come from the expenses in each category. Select a category to see its items.</p><div class="table-wrap"><table><thead><tr><th>Category</th><th>Budgeted amount</th><th>Forecast</th><th>Paid</th><th>Forecast vs. budgeted amount</th><th></th></tr></thead><tbody>${totals.categories.map(c => `<tr><td>${btn('filter-category', esc(c.name), c.id)}</td><td>${fmt(c.target)}</td><td>${fmt(c.forecast)}${c.unknown ? ' + unknown' : ''}</td><td>${fmt(c.paid)}</td><td class="${c.forecast > c.target ? 'warning' : 'good'}">${variance(c.forecast - c.target)}</td><td>${btn('category-edit', 'Rename', c.id)}${data.feedback_ready?btn('category-delete','Delete',c.id):''}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel" id="expenses"><div class="section-head"><h2>Expenses</h2>${select('category-filter', 'Filter category', [['', 'All categories'], ...opts(data.categories)], selectedCategory)}</div>${expenseTable(totals.rows.filter(e => !selectedCategory || e.category_id === selectedCategory))}</section>
    ${selectedExpense ? renderExpense(selectedExpense) : ''}
    ${renderInstallments()}${renderPayments()}`;
}
function variance(value) { return `${fmt(Math.abs(value))} ${value > 0 ? 'over' : value < 0 ? 'under' : 'on budget'}`; }
function bars(key) {
  const max = Math.max(1, ...totals.categories.flatMap(c => [c.target, Math.abs(c[key])]));
  return totals.categories.map(c => `<div class="bar-row"><a href="#expenses" data-action="filter-category" data-id="${c.id}">${esc(c.name)}</a><small> · ${fmt(c.target)} budgeted / ${fmt(c[key])} ${key}</small><svg role="img" aria-label="${esc(c.name)}: ${esc(fmt(c.target))} budgeted; ${esc(fmt(c[key]))} ${key}" viewBox="0 0 100 9" width="100%" height="25" preserveAspectRatio="none"><rect width="100" height="9" fill="#eee9ef"/><rect width="${c.target/max*100}" height="4" fill="#b6a5c3"/><rect y="5" width="${Math.abs(c[key])/max*100}" height="4" fill="${c[key]<0?'#a4424c':'#314641'}"/></svg></div>`).join('') || '<p class="empty">Add a category and an expense to begin.</p>';
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
  return rows.length ? `<div class="table-wrap"><table><thead><tr><th>Expense / vendor</th><th>Budgeted amount</th><th>Forecast</th><th>Paid</th><th>Owed / credit</th><th>Actions</th></tr></thead><tbody>${rows.map(e => `<tr><td><strong>${esc(e.title)}</strong><small>${esc(vendorName(e.vendor_id))} · ${e.agreed_cents === null ? 'Planning' : 'Booked'}</small></td><td>${fmt(e.target_cents)}</td><td>${fmt(e.forecast)}${e.variance !== null ? `<small class="${e.variance > 0 ? 'warning' : ''}">${variance(e.variance)}</small>` : ''}</td><td>${fmt(e.paid)}</td><td>${fmt(e.owed)}${e.credit ? `<small>${fmt(e.credit)} credit</small>` : ''}</td><td>${btn('expense-open', 'Details & quotes', e.id)}${btn('payment-expense', 'Payment / refund', e.id)}${data.feedback_ready?btn('expense-delete','Delete',e.id):''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No expenses here yet. Add a planned expense or a purchase paid in full.</p>';
}
function renderQuote(q, expense) {
  const vendor = data.vendors.find(v => v.id === q.vendor_id);
  const booked = q.id === expense.booked_quote_id;
  return `<article class="quote ${q.id === expense.preferred_quote_id ? 'preferred' : ''}">
    <h3>${esc(q.package_name)}</h3><p>${esc(vendorName(q.vendor_id))}</p><p class="muted">${esc([vendor?.contact_name,vendor?.email,vendor?.phone].filter(Boolean).join(' · '))} ${websiteLink(vendor?.website||'')}</p>
    <p class="amount">${fmt(quoteTotal(q))}</p>
    <small>${q.pricing_basis === 'per_person' ? `${fmt(q.unit_cents)} per guest × ${q.headcount} guests` : 'Fixed package price'}</small>
    <p>${esc(q.details)}</p><p>Rating: ${q.rating ? `${q.rating}/5` : 'Not rated'}</p><p>${esc(q.notes)}</p>
    ${booked ? '<p class="badge">BOOKED · preserved offer</p>' : `
      ${q.id === expense.preferred_quote_id ? '<p class="badge">PREFERRED</p>' : ''}
      <div class="actions">${btn('quote-edit', 'Edit quote', q.id)}
      ${expense.agreed_cents === null ? btn('prefer', 'Prefer this quote', q.id) + btn('book-quote', 'Book this package', q.id) : ''}</div>`}
  ${data.feedback_ready&&!booked?btn('quote-delete','Delete quote',q.id):''}</article>`;
}
function renderExpense(id) {
  const e = data.expenses.find(e => e.id === id); if (!e) return '';
  const quotes = data.quotes.filter(q => q.expense_id === id);
  return `<section class="panel" id="expense-detail"><div class="section-head"><h2>${esc(e.title)}</h2><div class="actions">${btn('expense-edit', 'Edit expense', id)}${e.agreed_cents !== null ? btn('amend', 'Amend agreement', id)+(data.feedback_ready?btn('unbook','Unbook agreement',id):'') : btn('book', 'Book expense', id)}${btn('quote-new', 'Add quote', id)}${e.agreed_cents !== null ? btn('installment-new', 'Add installment', id) : ''}</div></div><p>${esc(e.notes)}</p>
    ${e.menu_linked?`<p class="good">Linked menu estimate: <strong>${fmt(e.menu_estimate_cents)}</strong>. ${e.agreed_cents!==null?'The booked agreement remains the Forecast.':'The menu supplies Forecast while linked, ahead of quotes or the budgeted amount.'} ${btn('tab-menu','Review menu')}</p>`:''}
    ${e.agreed_cents !== null ? `<p>Agreed price: <strong>${fmt(e.agreed_cents)}</strong>. Quote and menu edits do not change this agreement.</p>` : `<p class="muted">Compare offers below. ${e.menu_linked?'Unlink the menu to use the preferred quote or budgeted amount in Forecast.':'Prefer one to use its total in the forecast.'}</p>`}
    <div class="quote-grid">${quotes.map(q => renderQuote(q,e)).join('') || '<p class="empty">No quotes yet. Add offers for this job to compare packages side by side.</p>'}</div>
    ${e.agreed_cents === null && e.preferred_quote_id ? btn('clear-preferred',e.menu_linked?'Clear preferred quote (menu stays linked)':'Use budgeted amount instead', e.id) : ''}
    ${data.amendments.filter(a => a.expense_id === id).map(a => `<p><small>Amendment ${esc(a.created_at.slice(0,10))} · ${fmt(a.previous_cents)} → ${a.agreed_cents===null?'Unbooked':fmt(a.agreed_cents)} · ${esc(a.reason)} · ${esc(memberName(a.entered_by))}</small></p>`).join('')}
    <p class="muted">Installment schedule: ${fmt(data.installments.filter(i => i.expense_id === id).reduce((s,i) => s+i.amount_cents,0))} · Agreed: ${fmt(e.agreed_cents)}. Unlinked payments need reconciliation against the schedule.</p></section>`;
}
function renderInstallments() {
  return `<section class="panel" id="installments"><h2>Installments & due dates</h2><p class="muted">Balances use linked payments and refunds. Unlinked transactions are included in the expense balance, but do not settle an installment.</p>${data.installments.length ? `<div class="table-wrap"><table><thead><tr><th>Due</th><th>Expense / installment</th><th>Scheduled</th><th>Remaining</th><th></th></tr></thead><tbody>${data.installments.map(i => {
    const balance = installmentBalance(i, data.payments);
    return `<tr><td>${esc(i.due_date)}${balance > 0 && i.due_date < today() ? '<small class="warning">Overdue</small>' : ''}</td><td>${esc(expenseName(i.expense_id))}<small>${esc(i.label)}</small></td><td>${fmt(i.amount_cents)}</td><td>${fmt(Math.max(0,balance))}${balance < 0 ? `<small>${fmt(-balance)} credit</small>` : ''}</td><td>${btn('payment-installment','Payment / refund',i.id)}${btn('installment-edit','Edit',i.id)}${data.feedback_ready?btn('installment-delete','Delete',i.id):''}</td></tr>`;
  }).join('')}</tbody></table></div>` : '<p class="empty">Open a booked expense to add its deposit and balance dates.</p>'}</section>`;
}
function renderPayments() {
  return `<section class="panel" id="payments"><h2>Payment ledger</h2><p class="muted">${data.feedback_ready?'Edit or delete incorrect records below. Changes keep a private history and update balances; they do not move money.':'Payments are preserved. Record an offsetting transaction to correct a mistake.'} ${fmt(totals.unallocated)} net payments are not linked to installments.</p>${data.payments.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Expense / installment</th><th>Type / amount</th><th>Payer / entered by</th><th>Notes / actions</th></tr></thead><tbody>${[...data.payments].reverse().map(p => `<tr><td>${esc(p.paid_on)}</td><td>${esc(expenseName(p.expense_id))}<small>${esc(data.installments.find(i => i.id === p.installment_id)?.label || (p.installment_id?'Schedule paused while unbooked':'Unallocated — reconcile if scheduled'))}</small></td><td>${esc(p.kind)}<small>${fmt(p.amount_cents)}</small></td><td>${esc(memberName(p.payer_id))}<small>Entered by ${esc(memberName(p.entered_by))}</small></td><td>${esc(p.notes)}${data.feedback_ready?btn('payment-edit','Edit',p.id)+btn('payment-delete','Delete',p.id)+btn('payment-history','History',p.id):''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Your first deposit, purchase, or refund will appear here.</p>'}</section>`;
}
function renderVendorTours(tours) {
  if (!tours.length) return '<p class="muted">No upcoming tours.</p>';
  return `<section class="vendor-tours"><h4>Scheduled tours</h4><ul>${tours.map(tour=>`<li><strong>${esc(tour.title)}</strong><br><time datetime="${esc(tour.date)}">${esc(displayDate(tour.date))}</time> · ${esc(tour.time || 'All day')}${tour.location?' · '+esc(tour.location):''}</li>`).join('')}</ul></section>`;
}
function renderVendors() {
  const tours = data.feedback_ready ? upcomingVendorTours(data.events,today()) : [];
  return `<section class="panel"><div class="section-head"><h2>Your vendors</h2>${btn('vendor-new','Add vendor','','')}</div><p class="muted">Contact details live here. Bookings and balances come from the same expenses as your budget.</p>${[...data.vendors].sort((a,b)=>(b.rating||0)-(a.rating||0)||a.name.localeCompare(b.name)).map(v => {
    const rows = totals.rows.filter(e => e.vendor_id === v.id && e.agreed_cents !== null);
    return `<article class="panel"><div class="section-head"><h3>${esc(v.name)}</h3><div class="actions">${btn('vendor-edit','Edit details',v.id)}${data.feedback_ready?btn('photo-new','Attach picture',v.id)+btn('event-vendor','Schedule visit',v.id)+btn('vendor-delete','Delete',v.id):''}</div></div><p>${esc(v.contact_name)} · ${esc(v.email)} · ${esc(v.phone)}</p><p class="vendor-website">${websiteLink(v.website)}</p><p>${esc(v.vendor_kind==='venue'?'Venue':'Vendor')} · ${v.rating?`${v.rating}/5 overall rating`:'Not rated yet'}</p>${data.feedback_ready?renderVendorTours(tours.filter(tour=>tour.vendor_id===v.id)): ''}${v.next_step?`<p><strong>Next step</strong> · ${esc(v.next_step)}</p>`:''}${vendorPhotos(v.id)}<p>${esc(v.notes)}</p>${data.menu_ready?`<p>${data.menu_options.filter(o=>o.vendor_id===v.id).length} menu dishes ${btn('menu-vendor-open','View dishes',v.id)}</p>`:''}${rows.length ? expenseTable(rows) : '<p class="muted">No booked expenses yet.</p>'}</article>`;
  }).join('') || '<p class="empty">Add vendor contacts, then add packages to an expense to compare quotes.</p>'}</section><section class="panel"><h2>Compare offers by expense</h2>${expenseTable(totals.rows)}</section>${selectedExpense ? renderExpense(selectedExpense) : ''}`;
}
function openForm(title, fields, save) {
  const epoch = sessionEpoch;
  $('#save').hidden=false;
  $('#dialog-title').textContent = title; $('#fields').innerHTML = fields; $('#form-error').textContent = '';
  $('#save').disabled = false; $('#cancel').disabled = false; $('#save').textContent = api.pending ? 'Retry original save' : 'Save';
  $('#edit-form').onsubmit = async event => {
    event.preventDefault(); $('#save').disabled = true; $('#cancel').disabled = true;
    try {
      if (api.pending) await api.retryPending(); else await save(Object.fromEntries(new FormData(event.currentTarget)));
      if (epoch !== sessionEpoch) return;
      dialog.close(); notify('Saved.'); await reload();
    } catch (error) {
      if (epoch !== sessionEpoch) return;
      const message = $('#form-error');
      message.textContent = errorMessage(error);
      message.scrollIntoView({block:'nearest'});
      $('#save').textContent = api.pending ? 'Retry original save' : 'Save';
    } finally {
      if (epoch === sessionEpoch) { $('#save').disabled = false; $('#cancel').disabled = false; }
    }
  };
  editor.open();
}
function operation(path, body, method = 'POST', prefer = 'return=representation') {
  return api.mutate({ path, options: { method, body, prefer } });
}
function update(table, record, changes) {
  return operation(`${table}?id=eq.${record.id}&version=eq.${record.version}`, { ...changes, version: record.version }, 'PATCH');
}
async function saveAisle(changes) {
  if (api.pending) throw new Error('Retry the pending save before updating Aisle.');
  const epoch = sessionEpoch;
  aisleOpen=true;
  await update('weddings', data.wedding, changes);
  if (epoch !== sessionEpoch) return;
  await reload();
  if (epoch === sessionEpoch && isAisleOpen()) $('#aisle-title')?.focus();
}
function insert(table, record) {
  return operation(table, { id: crypto.randomUUID(), wedding_id: weddingId, ...record }, 'POST', 'return=representation,resolution=ignore-duplicates');
}
function settingsForm(guided = false) {
  const w = data.wedding;
  const currencyLocked=data.expenses.length||data.menu_options.some(o=>o.unit_cents!==null);
  const advanceAisle = aisleReady(w) && (w.aisle_step === 'settings' || (guided && !w.aisle_step));
  openForm(guided ? 'Your wedding details' : 'Wedding settings',
    input('name','Wedding name',w.name,'text','required maxlength="120"')
    + select('currency','Currency (two decimal places)', ['USD','CAD','GBP','EUR','AUD','NZD'].map(c => [c,c]),w.currency)
    + amount('cap',guided?'Wedding budget (optional)':'Wedding cap',guided && !w.cap_cents ? null : w.cap_cents,!guided)
    + input('wedding_date','Wedding date (optional)',w.wedding_date || '','date')
    + (data.planner_ready?input('planning_headcount','Planning guest count (optional)',w.planning_headcount??'','number','min="0" max="100000" step="1"'):'')
    + select('time_zone','Time zone',timeZones(w.time_zone),w.time_zone)
    + '<p class="muted">Currency is fixed after your first expense or recorded menu price. Dates follow your wedding’s time zone. Planning headcount is a starting point for new per-guest quotes; existing offers keep their saved count.</p>',
    f => update('weddings',w,{
      name:f.name.trim(),currency:f.currency,cap_cents:cents(f.cap,guided) ?? 0,
      wedding_date:f.wedding_date || null,time_zone:f.time_zone.trim(),
      ...(data.planner_ready?{planning_headcount:f.planning_headcount===''?null:Number(f.planning_headcount)}:{}),
      ...(advanceAisle?{aisle_step:'first_action'}:{})
    }));
  if (currencyLocked) $('#f-currency').disabled = true;
  // Disabled controls are omitted from FormData; retain the original currency.
  if (currencyLocked) { const hidden = document.createElement('input'); hidden.type='hidden'; hidden.name='currency'; hidden.value=w.currency; $('#fields').append(hidden); }
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
    +(!household?area('guest_names','Guest names · one per line')+input('unnamed_count','Unnamed companions',0,'number','required min="0" max="20" step="1"')+(data.feedback_ready?select('invited_by','Guests from',attributionOptions(data.members)):'')+'<p class="muted">Each name and each unnamed companion is one invited seat.</p>':'')
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
    const guests=householdGuests(f.guest_names,Number(f.unnamed_count)).map(g=>({...g,id:crypto.randomUUID(),...(data.feedback_ready?{invited_by:f.invited_by||null}:{})}));
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
    +(data.feedback_ready?select('invited_by','Guest from',attributionOptions(data.members),guest?.invited_by||''):'')
    +select('tag','Relationship',[['','No tag'],...GUEST_TAGS.map(t=>[t,t])],guest?.tag||'')
    +checkbox('gift_received','Gift received',guest?.gift_received)
    +'<fieldset class="dietary-options"><legend>Dietary needs · choose all that apply</legend>'
    +DIETARY_FLAGS.map(([key,label])=>checkbox(`diet_${key}`,label,guest?.dietary_flags?.includes(key))).join('')+'</fieldset>'
    +area('dietary_notes','Guest’s allergy or dietary request',guest?.dietary_notes||'')
    +area('caterer_confirmation','Caterer’s response / confirmation',guest?.caterer_confirmation||'')
    +(data.menu_ready&&!data.seating_ready?input('meal_table','Caterer table label (optional)',guest?.meal_table||'','text','maxlength="100"')+'<p>Save guest details, then use Choose meals to record a dish for each course.</p>':''),f=>{
      const name=f.name.trim()||null,is_companion=f.is_companion==='on';
      if(!name&&!is_companion)throw new Error('Enter a name or mark this guest as an unnamed companion.');
      const record={...(data.menu_ready&&!data.seating_ready?{meal_table:f.meal_table.trim()}:{}),...(data.feedback_ready?{invited_by:f.invited_by||null}:{}),invitation_id:f.invitation_id,name,is_companion,rsvp:f.rsvp,tag:f.tag,gift_received:f.gift_received==='on',
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
function importGuests() {
  if (!data.guest_import_ready) throw new Error('The guest import database update is required.');
  if (api.pending) throw new Error('Retry the pending save before starting an import.');
  const w=weddingId, requestId=crypto.randomUUID();
  let preview=null;
  openForm('Import guest list',
    '<a href="./guest-list-template.csv" download>Download the blank CSV template</a>'+
    '<p>Use one row per person. Repeat the household name for people sharing an invitation. For an unnamed plus-one, leave guest_name blank and enter yes in companion.</p>'+
    '<p>Email, phone and address are shared by the household. RSVP accepts yes, no or pending. Blank replies start as pending. Save as comma-separated CSV UTF-8, up to 1 MiB and 1,000 people.</p>'+
    input('guest-file','Guest CSV','','file','accept=".csv,text/csv" required')+
    '<div id="import-preview" role="status" class="preline"></div>',
    async ()=>{
      if (!preview) throw new Error('Select a valid CSV and review the guest list first.');
      fileInput.disabled=true;
      try { await operation('rpc/import_guest_csv',{w,request_id:requestId,households:preview.households}); }
      finally { fileInput.disabled=!!api.pending; }
    });
  const fileInput=$('#f-guest-file'), result=$('#import-preview'), save=$('#save');
  save.disabled=true; save.textContent='Import guests';
  fileInput.onchange=async ()=>{
    const file=fileInput.files[0];
    preview=null; save.disabled=true; $('#form-error').textContent='';
    result.textContent=file?'Checking the guest list…':'Choose a CSV file.';
    if (!file) return;
    const current=()=>fileInput.isConnected && dialog.open && file===fileInput.files[0];
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Choose a .csv file. In Excel, save a copy as CSV UTF-8 (comma delimited).');
      if (file.size>maxFileBytes) throw new Error('The file exceeds 1 MiB. Split it into smaller files, keeping households together.');
      let bytes;
      try { bytes=await file.arrayBuffer(); }
      catch { throw new Error('The browser could not read the selected file. Save a local copy, then select it again.'); }
      if (!current()) return;
      let source;
      try { source=new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
      catch { throw new Error('The file could not be read as UTF-8. Save it again as CSV UTF-8.'); }
      preview=prepareGuestImport(source,data.invitations);
      const {guestCount,households}=preview;
      result.innerHTML=`<p>Ready to add <strong>${guestCount} ${guestCount===1?'guest':'guests'}</strong> across <strong>${households.length} ${households.length===1?'household':'households'}</strong>.</p><details><summary>Review names by household</summary><ul>${households.map(h=>`<li><strong>${esc(h.household)}</strong> · ${h.people.map(g=>esc(g.name||'Unnamed companion')).join(', ')}</li>`).join('')}</ul></details>`;
      save.disabled=false;
    } catch(error) {
      if (current()) { result.textContent='Nothing imported. '+error.message; fileInput.value=''; }
    }
  };
}
function exportGuests() {
  const rows=guestSummary(data.invitations,data.guests).active.map(g=>{
    const i=data.invitations.find(i=>i.id===g.invitation_id);
    return [g.id,i.household_name,g.name||'Unnamed companion',g.invited_by?memberName(g.invited_by):'Together / unspecified',g.is_companion,g.rsvp,g.tag,g.gift_received,
      i.contact_email,i.phone,i.mailing_address,i.save_the_date_sent_on,i.invitation_sent_on,(g.dietary_flags||[]).join('; '),g.dietary_notes,g.caterer_confirmation];
  });
  const url=URL.createObjectURL(new Blob([csv([['guest_id','household','guest_name','invited_by','companion','rsvp','relationship','gift_received','email','phone','address','save_the_date_sent','invitation_sent','dietary_flags','guest_request','caterer_confirmation'],...rows])],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='wedding-guests.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Exported active guests. Keep this file private.');
}
function categoryForm(id) {
  const c = data.categories.find(c => c.id === id);
  openForm(c ? 'Rename category' : 'Add category',input('name','Category name',c?.name || '','text','required maxlength="100"'), f => c ? update('categories',c,{name:f.name.trim()}) : insert('categories',{name:f.name.trim()}));
}
function vendorForm(id, guided = false) {
  const v = data.vendors.find(v => v.id === id);
  if (id && guided && !v) throw new Error('This vendor is no longer available. Refresh Aisle to choose another.');
  const nextStep = aisleReady(data.wedding) ? input('next_step',guided?'What will you do next?':'Next step (optional)',v?.next_step||'','text',`maxlength="500" placeholder="Ask for a quote" ${guided?'required':''}`) : '';
  openForm(guided && v ? 'Record a vendor follow-up' : v ? 'Edit vendor' : 'Add vendor',
    input('name','Vendor name',v?.name || '','text','required maxlength="120"')
    + nextStep + input('contact_name','Contact person',v?.contact_name)
    + input('email','Email',v?.email,'email') + input('phone','Phone',v?.phone,'tel') + input('website','Website',v?.website,'url')
    + (data.feedback_ready?select('vendor_kind','Type',[['vendor','Vendor'],['venue','Venue']],v?.vendor_kind||'vendor')
      + select('rating','Overall rating',[['','Not rated'],...['1','2','3','4','5'].map(r=>[r,`${r}/5`])],String(v?.rating||'')):'')
    + area('notes','Notes',v?.notes), f => {
      const record={...f,...(data.feedback_ready?{rating:f.rating?Number(f.rating):null}:{})};
      if ('next_step' in f) record.next_step=f.next_step.trim() || null;
      if (guided && !record.next_step) throw new Error('Enter what you’ll do next with this vendor.');
      return v ? update('vendors',v,record) : insert('vendors',record);
    });
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
    + amount('target','Budgeted amount (blank = unknown; 0 is a real amount)',e?.target_cents ?? null)
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
function paymentForm(expenseId = '', installmentId = '', paymentId = '') {
  if (!data.expenses.length) { expenseForm(); return; }
  const payment=data.payments.find(p=>p.id===paymentId);
  const id = payment?.id||crypto.randomUUID(), chosen = payment?.expense_id||expenseId || data.expenses[0].id;
  installmentId=payment?.installment_id||installmentId;
  openForm(payment?'Edit payment or refund':'Record payment or refund',select('expense_id','Expense',opts(data.expenses,'title'),chosen) + select('kind','Transaction type',[['payment','Payment / deposit'],['refund','Refund from vendor']],payment?.kind||'payment') + amount('amount','Amount',payment?.amount_cents??null,true) + input('paid_on','Payment / refund date',payment?.paid_on||today(),'date','required') + select('payer_id','Paid by / refunded to',data.members.map(m => [m.user_id,m.display_name]),payment?.payer_id||api.session.user.id) + '<div id="installment-select"></div>' + area('notes','Notes',payment?.notes||'') + '<p class="muted">Recording or editing a transaction does not move money. Original recorder attribution and change history are preserved.</p>', f => {
    const record={expense_id:f.expense_id,installment_id:f.installment_id || null,kind:f.kind,amount_cents:cents(f.amount),paid_on:f.paid_on,payer_id:f.payer_id,notes:f.notes};
    if(!record.amount_cents)throw new Error('Payments and refunds must be greater than zero.');
    return payment?update('payments',payment,record):operation('rpc/record_payment',{p:{id,wedding_id:weddingId,...record}});
  });
  const draw = () => {
    const expense = $('#f-expense_id').value;
    const installments = data.installments.filter(i => i.expense_id === expense);
    const options = [['','Unallocated — reconcile if scheduled'], ...installments.map(i => [
      i.id, `${i.label} · ${i.due_date} · ${fmt(Math.max(0,installmentBalance(i,data.payments)))} open`
    ])];
    // Unbooking hides the schedule from the snapshot but keeps existing allocations.
    if (payment?.installment_id && payment.expense_id === expense &&
        !installments.some(i => i.id === payment.installment_id)) {
      options.push([payment.installment_id,'Current installment (schedule paused)']);
    }
    $('#installment-select').innerHTML = select('installment_id','Allocate to installment',options,installmentId);
  };
  draw(); $('#f-expense_id').onchange = () => { installmentId=''; draw(); };
}
function requireFeedback() {
  if(!data.feedback_ready)throw new Error('These updates need the reviewed database migration before they can be used.');
}
function unbookForm(id) {
  requireFeedback();const e=data.expenses.find(e=>e.id===id);
  openForm('Unbook agreement',`<p>Return ${esc(e.title)} to planning. Forecast returns to ${e.menu_linked?'its linked menu estimate':'its budgeted amount'}. Existing payments and agreement history stay recorded; installment reminders pause until it is booked again. This does not cancel a real vendor contract or refund money.</p>`+area('reason','Reason for unbooking'),f=>{
    if(f.reason.trim().length<3)throw new Error('Enter a reason for unbooking.');
    return update('expenses',e,{agreed_cents:null,preferred_quote_id:null,booked_quote_id:null,amendment_reason:f.reason.trim()});
  });
}
function deleteForm(table,id) {
  requireFeedback();const record=data[table].find(r=>r.id===id);if(!record)throw new Error('Refresh and review this record.');
  const label=record.title||record.name||record.household_name||record.package_name||record.label||record.caption||table.replaceAll('_',' ');
  const messages={
    categories:'This also deletes every expense in this category, their quotes, installments, and payment/refund records from active totals.',
    vendors:'This also deletes expenses linked to this vendor, their payments and schedules, all offers from this vendor, and attached pictures. Scheduled visits, day-of activities, and menu dishes remain, without the vendor link.',
    expenses:'This also deletes its quotes, installments, and payments/refunds from active totals.',
    invitations:'This also deletes every guest in this household and removes their seats and replies from counts.',
    installments:'Its payments remain recorded but become unallocated. This does not change the expense agreement.',
    quotes:'If this is preferred, forecast returns to the budgeted amount. Unbook an agreement before deleting its booked quote.',
    payments:'This removes the transaction from balances and may reopen or reduce an amount owed. It does not refund or transfer money.',
    guests:'This removes this person from active seat, RSVP, and dietary counts.',
    tasks:'This removes this task from checklist progress and the schedule.',events:'This removes the event from the schedule.',vendor_photos:'This removes the picture from the vendor gallery.',itinerary_items:'This removes the activity from the day-of itinerary and its printable copy.',menu_courses:'This also removes its dishes. Existing choices will need review; catering forecasts update.',menu_options:'This removes the dish and its photo from the menu. Affected guest choices will need review; catering forecasts update.'
  };
  openForm(`Delete ${label}`,`<p class="warning">${esc(messages[table])}</p><p>This removes it from the planner and exports. Private history is retained for accountability. There is no restore button for deleted records.</p>`+input('confirm','Type DELETE to confirm','','text','required autocomplete="off"'),f=>{
    if(f.confirm!=='DELETE')throw new Error('Type DELETE to confirm.');
    return operation('rpc/delete_record',{t:table,r:id,v:record.version});
  });
}
async function paymentHistory(id) {
  const epoch = sessionEpoch;
  const history=await api.request(`record_history?table_name=eq.payments&record_id=eq.${encodeURIComponent(id)}&order=created_at.desc`);
  if (epoch !== sessionEpoch) return;
  openForm('Payment change history',history.map(h=>`<article><p>${esc(h.created_at)} · ${esc(memberName(h.entered_by))}</p><p>${esc(h.previous.kind)} ${fmt(h.previous.amount_cents)} on ${esc(h.previous.paid_on)} → ${esc(h.current_record.kind)} ${fmt(h.current_record.amount_cents)} on ${esc(h.current_record.paid_on)}</p><p>Payer: ${esc(memberName(h.previous.payer_id))} → ${esc(memberName(h.current_record.payer_id))}</p><p>Expense: ${esc(expenseName(h.previous.expense_id))} → ${esc(expenseName(h.current_record.expense_id))}</p><p>Installment: ${esc(h.previous.installment_id||'Unallocated')} → ${esc(h.current_record.installment_id||'Unallocated')}</p><p>Notes: ${esc(h.previous.notes)} → ${esc(h.current_record.notes)}</p></article>`).join('')||'<p>No edits recorded yet.</p>',()=>{});
  $('#save').hidden=true;
}
function eventForm(id,vendorId='') {
  requireFeedback();const e=data.events.find(e=>e.id===id);
  openForm(e?'Edit scheduled event':'Schedule a tour, tasting, or appointment',input('title','Event',e?.title||'','text','required maxlength="160"')
    +select('kind','Type',['Tour','Tasting','Appointment','Other'].map(k=>[k,k]),e?.kind||'Tour')
    +input('event_date','Date',e?.event_date||today(),'date','required')+input('start_time',`Time (optional) · ${data.wedding.time_zone}`,e?.start_time?.slice(0,5)||'','time')
    +input('location','Location',e?.location||'','text','maxlength="500"')+select('vendor_id','Vendor / venue (optional)',[['','No vendor linked'],...opts(data.vendors)],e?.vendor_id||vendorId)
    +checkbox('completed','Completed',e?.completed)+area('notes','Notes',e?.notes||''),f=>{
      const record={...f,title:f.title.trim(),vendor_id:f.vendor_id||null,start_time:f.start_time||null,completed:f.completed==='on'};
      return e?update('events',e,record):insert('events',record);
    });
}
function requireMenu() {
  if(!data.menu_ready)throw new Error('Menu planning needs its reviewed database migration before it can be used.');
}
function menuCourseForm(id) {
  requireMenu();const course=data.menu_courses.find(c=>c.id===id);
  openForm(course?'Edit course':'Add a course',input('name','Course name',course?.name||'','text','required maxlength="100" list="course-names"')
    +'<datalist id="course-names"><option value="Starters"><option value="Mains"><option value="Desserts"><option value="Drinks"></datalist>'
    +input('sort_order','Display order',course?.sort_order??menuCourses(data).length*10,'number','required min="0" max="1000" step="1"')
    +checkbox('choices_offered','Ask each attending guest for one choice in this course',course?.choices_offered??true)
    +'<p class="muted">Turn this off for shared service such as a buffet or drinks. Several selected dishes may be offered in either case.</p>',f=>{
      const name=f.name.trim(),sort_order=Number(f.sort_order);
      if(!name||!Number.isInteger(sort_order)||sort_order<0||sort_order>1000)throw new Error('Enter a course name and whole-number display order from 0 to 1,000.');
      const record={name,sort_order,choices_offered:f.choices_offered==='on'};
      return course?update('menu_courses',course,record):insert('menu_courses',record);
    });
}
function menuDishForm(id) {
  requireMenu();const dish=data.menu_options.find(o=>o.id===id),courses=menuCourses(data);
  if(!courses.length){menuCourseForm();return;}
  openForm(dish?'Edit a dish':'A delicious possibility',input('name','Dish / package name',dish?.name||'','text','required maxlength="160"')
    +select('course_id','Course',opts(courses),dish?.course_id||courses[0].id)
    +select('vendor_id','Prepared by',[['','Vendor to be decided'],...opts(data.vendors)],dish?.vendor_id||'')
    +checkbox('selected','Include on our menu',dish?.selected)
    +select('rating','Our rating',[['','Not rated'],...['1','2','3','4','5'].map(n=>[n,`${n} / 5`])],String(dish?.rating||''))
    +select('pricing_basis','How is it priced?',PRICE_BASES,dish?.pricing_basis||'per_person')
    +amount('price','Price (blank = unknown)',dish?.unit_cents??null)
    +input('quantity','Planned quantity (used only for unit × quantity)',dish?.quantity??1,'number','required min="0" max="100000" step="1"')
    +input('unit','Quantity unit',dish?.unit||'serving','text','required maxlength="60"')
    +'<p class="muted">Shared per-person dishes each use the planning headcount. For alternative plated dishes, use per-confirmed-choice pricing or planned quantities. Selecting a dish never books a vendor or records a payment.</p>'
    +area('notes','Ingredients, inclusions & tasting notes',dish?.notes||''),f=>{
      const record=menuOptionRecord(f);
      if(record.pricing_basis==='per_choice'&&!courses.find(c=>c.id===record.course_id)?.choices_offered)throw new Error('Enable guest choices on this course to use per-choice pricing.');
      return dish?update('menu_options',dish,record):insert('menu_options',record);
    });
}
function menuMealForm(guestId) {
  requireMenu();const guest=menuDiners(data).find(g=>g.id===guestId),courses=menuCourses(data).filter(c=>c.choices_offered);
  if(!guest)throw new Error('Set this guest’s RSVP to Attending and restore their household before choosing meals.');
  if(!courses.length)throw new Error('Add a course with guest choices first.');
  let currentMeal;
  openForm(`Meals for ${guest.name||'Unnamed companion'}`,select('course_id','Course',opts(courses),courses[0].id)
    +'<div id="meal-choice"></div><p>Choose one of our selected dishes, or explicitly leave this course pending. Save, then reopen for another course.</p>'
    +`<p>Guest request: ${esc([...(guest.dietary_flags||[]),guest.dietary_notes].filter(Boolean).join(' · ')||'None recorded')}</p><p>Caterer confirmation: ${esc(guest.caterer_confirmation||'Not yet confirmed')}</p>`,f=>{
      const record={guest_id:guest.id,course_id:f.course_id,option_id:f.option_id||null};
      return currentMeal?update('guest_meals',currentMeal,record):insert('guest_meals',record);
    });
  const draw=()=>{
    const course=$('#f-course_id').value,meal=guestMeal(data,guest.id,course);
    currentMeal=meal.record;
    $('#meal-choice').innerHTML=select('option_id','Meal choice',[['','Choice pending'],...data.menu_options.filter(o=>o.course_id===course&&o.selected).map(o=>[o.id,`${o.name} · ${vendorName(o.vendor_id)}`])],meal.option?.id||'')
      +(meal.status==='review'?'<p class="warning">The previous dish is no longer selected or available. Choose again or save as pending.</p>':'');
  };draw();$('#f-course_id').onchange=draw;
}
function menuLinkForm() {
  requireMenu();const estimate=menuEstimate(data),wedding=data.wedding;
  openForm('Link our catering expense',select('expense_id','One existing expense',[['','No expense linked'],...opts(data.expenses,'title')],data.wedding.menu_expense_id||'')
    +`<p>Current menu estimate: ${fmt(estimate.cents)}. Unbooked Forecast uses the linked menu estimate instead of its preferred quote or budgeted amount. Booked agreements and payments stay unchanged. This does not create an expense.</p>`
    +'<p>To include catering fees, rentals, tax, or service in this estimate, add selected fixed-price package lines. Unlinking restores the usual quote/budget forecast.</p>',f=>update('weddings',wedding,{menu_expense_id:f.expense_id||null}));
}
function menuPhotoForm(id) {
  requireMenu();const dish=data.menu_options.find(o=>o.id===id);let path='',uploaded=false;
  const epoch=sessionEpoch;
  openForm(`Photo for ${dish.name}`,input('file','Dish photo · JPEG, PNG, WebP; up to 5 MB','','file','accept="image/jpeg,image/png,image/webp"')
    +(dish.photo_path?checkbox('remove','Remove current photo'):'')+'<p>Save the dish first, then attach a private photo. A replacement gets a new private file.</p>',async f=>{
      if(f.remove==='on')return update('menu_options',dish,{photo_path:null});
      if(!uploaded){
        const file=$('#f-file').files[0],ext=validatePhoto(file);
        path=`${weddingId}/${dish.id}/${crypto.randomUUID()}.${ext}`;
        await api.photo(path,{file,bucket:'menu-photos'});
        if(epoch!==sessionEpoch)return;
        uploaded=true;$('#f-file').disabled=true;
      }
      return update('menu_options',dish,{photo_path:path});
    });
}
function downloadMenu() {
  const url=URL.createObjectURL(new Blob([menuCSV(data)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='wedding-caterer-meals.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Exported the attending guest meal list. Keep dietary and contact information private.');
}
function itineraryForm(id) {
  if(!data.itinerary_ready)throw new Error('The day-of itinerary is being prepared. Your existing planner is ready to use.');
  const item=data.itinerary_items.find(i=>i.id===id);
  openForm(item?'Edit day-of activity':'Add a day-of activity',input('title','Activity',item?.title||'','text','required maxlength="160"')
    +select('day_offset','Day',[['0','Wedding day'],['1','Following day (after midnight)']],String(item?.day_offset||0))
    +input('start_time','Start time',item?.start_time?.slice(0,5)||'','time','required')+input('end_time','End time (optional)',item?.end_time?.slice(0,5)||'','time')
    +'<p class="muted">Times follow the wedding time zone. An end time earlier than the start means the activity ends the next day.</p>'
    +input('track','Who / track',item?.track||'Together','text','required maxlength="100" list="itinerary-tracks"')
    +`<datalist id="itinerary-tracks">${itineraryTracks(data).map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>`
    +'<p class="muted">Choose a planner member, Together, or a custom track such as Wedding party.</p>'
    +input('location','Location',item?.location||'','text','maxlength="500"')
    +select('vendor_id','Vendor / venue (optional)',[['','No vendor linked'],...opts(data.vendors)],item?.vendor_id||'')
    +area('notes','Notes',item?.notes||''),f=>{
      const record=itineraryRecord(f);return item?update('itinerary_items',item,record):insert('itinerary_items',record);
    });
}
function moodboardForm() {
  requireFeedback();
  const wedding = data.wedding;
  openForm('Link our Pinterest board',
    input('url','Public Pinterest board URL',wedding.pinterest_board_url||'','url','placeholder="https://www.pinterest.com/username/board-name/"')
    +'<p>Use a public board link, not a shortened pin link. Leave blank to remove it. The preview loads Pinterest content inside the app.</p>',
    f => update('weddings',wedding,{pinterest_board_url:pinterestBoard(f.url)}));
}
function vendorPhotos(id) {
  return `<div class="vendor-photos">${data.vendor_photos.filter(p=>p.vendor_id===id).map(p=>`<figure><img data-photo="${esc(p.id)}" alt="${esc(p.caption||'Vendor or venue picture')}" loading="lazy"><figcaption>${esc(p.caption)} ${btn('photo-delete','Delete picture',p.id)}</figcaption><small data-photo-error="${esc(p.id)}"></small></figure>`).join('')}</div>`;
}
async function displayPhotos(records, pathField, attribute, cache) {
  await Promise.all(records.map(async record => {
    if (!record[pathField]) return;
    // Bind to this render's nodes. A later render may show a replacement for the same record.
    const image = document.querySelector(`[${attribute}="${record.id}"]`);
    if (!image) return;
    const error = document.querySelector(`[${attribute}-error="${record.id}"]`);
    try {
      const url = await cache.get(record[pathField]);
      if (url && image.isConnected) image.src = url;
    } catch {
      if (error?.isConnected) error.textContent = 'Photo unavailable. Refresh to retry.';
    }
  }));
}
function photoForm(vendorId) {
  requireFeedback();const id=crypto.randomUUID(),epoch=sessionEpoch;let uploaded=false,path='';
  openForm('Attach a vendor or venue picture',input('file','Picture (JPEG, PNG, WebP; up to 5 MB)','','file','accept="image/jpeg,image/png,image/webp" required')+input('caption','Caption','','text','maxlength="300"'),async f=>{
    if(!uploaded){
      const file=$('#f-file').files[0],ext=validatePhoto(file);
      path=`${weddingId}/${vendorId}/${id}.${ext}`;
      await api.photo(path,{file});
      if(epoch!==sessionEpoch)return;
      uploaded=true;$('#f-file').disabled=true;
    }
    return insert('vendor_photos',{id,vendor_id:vendorId,storage_path:path,caption:f.caption});
  });
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
  'aisle-toggle':()=>{aisleOpen=!isAisleOpen();render();$(aisleOpen?'#aisle-title':'#ask-aisle')?.focus();},
  'aisle-close':()=>{aisleOpen=false;render();$('#ask-aisle')?.focus();},
  'aisle-settings':()=>{if(api.pending)throw new Error('Retry the pending save before editing details in Aisle.');settingsForm(true);},
  'aisle-vendor':id=>{
    if(api.pending)throw new Error('Retry the pending save before editing a vendor in Aisle.');
    vendorForm(id==='selected'?$('#f-aisle-vendor').value:'',true);
  },
  'aisle-import':importGuests,
  'aisle-pause':()=>saveAisle({aisle_paused:true}),
  'aisle-resume':()=>saveAisle({aisle_paused:false}),
  'aisle-finish':()=>saveAisle({aisle_step:'complete',aisle_paused:false}),
  'register-invited':renderRegistration,
  'wedding-access':()=>{if(api.pending)throw new Error('Retry the pending save before changing weddings.');return start({hub:true,target:weddingId});},
  'access-refresh':()=>start({hub:true,target:hubOptions?.target}),
  'access-retry':async()=>{const epoch=sessionEpoch;await api.retryPending();if(epoch===sessionEpoch)await start({hub:true});},
  'open-wedding':id=>start({wedding:id}),
  'choose-planner-invite':id=>showAccess({...hubOptions,selected:id,issued:null}),
  'show-invite-link':id=>showAccess({...hubOptions,issued:id}),
  'revoke-planner-invite':async id=>{
    const epoch=sessionEpoch;
    await api.request('rpc/revoke_planner_invite',{method:'POST',body:{invitation:id}});
    if(epoch===sessionEpoch)await start({hub:true,target:hubOptions?.target});
  },
  ...Object.fromEntries(Object.keys(plannerSections).map(id => [`tab-${id}`, () => {
    aisleOpen=false;
    tab = id;
    render();
  }])),
  'seating-event':event=>{seatingEvent=event;showSeatingUnit('');},
  'seating-open':showSeatingUnit,'seating-overview':()=>showSeatingUnit(''),
  'guest-seating':id=>editSeating('person',id,'reception'),
  ...Object.fromEntries(['add','edit','delete','number','assign','person','chair'].map(action=>['seating-'+action,id=>editSeating(action,id,seatingEvent)])),
  'menu-course-new':()=>menuCourseForm(),'menu-course-edit':menuCourseForm,
  'menu-dish-new':()=>menuDishForm(),'menu-dish-edit':menuDishForm,
  'menu-toggle':id=>changePlannerRecord('menu_options',id,{selected:!data.menu_options.find(o=>o.id===id).selected}),
  'menu-meal':menuMealForm,'menu-link':menuLinkForm,'menu-photo':menuPhotoForm,
  'menu-expense':id=>{selectedExpense=id;tab='budget';render();},
  'menu-vendor-open':id=>{menuFilters.vendor=id;menuFilters.group='vendor';tab='menu';render();},
  'menu-export':()=>downloadMenu(),'menu-print':()=>window.print(),
  'itinerary-new':()=>itineraryForm(),'itinerary-edit':itineraryForm,
  'itinerary-print':()=>window.print(),
  'unbook':unbookForm,'payment-edit':id=>paymentForm('','',id),'payment-history':paymentHistory,
  'event-new':()=>eventForm(),'event-edit':eventForm,'event-vendor':id=>eventForm('',id),
  'moodboard-edit':moodboardForm,'moodboard-refresh':()=>{const frame=document.querySelector('.moodboard-frame');if(frame)frame.src=frame.getAttribute('src');},'photo-new':photoForm,
  ...Object.fromEntries([['expense','expenses'],['vendor','vendors'],['category','categories'],['household','invitations'],['guest','guests'],['task','tasks'],['quote','quotes'],['installment','installments'],['payment','payments'],['event','events'],['photo','vendor_photos'],['itinerary','itinerary_items'],['menu-course','menu_courses'],['menu-dish','menu_options']].map(([action,table])=>[`${action}-delete`,id=>deleteForm(table,id)])),
  'household-new':()=>householdForm(),'household-edit':householdForm,
  'household-archive':id=>changePlannerRecord('invitations',id,{archived:!data.invitations.find(i=>i.id===id).archived}),
  'guest-new':invitationId=>guestForm('',invitationId),'guest-edit':id=>guestForm(id),
  'guest-rsvp':(id,rsvp)=>changePlannerRecord('guests',id,{rsvp}),
  'guest-archive':id=>changePlannerRecord('guests',id,{archived:!data.guests.find(g=>g.id===id).archived}),
  'guests-import':importGuests,'guests-export':exportGuests,'task-new':()=>taskForm(),'task-edit':taskForm,'tasks-seed':seedTasks,
  'task-toggle':id=>changePlannerRecord('tasks',id,{completed:!data.tasks.find(t=>t.id===id).completed}),
  'task-archive':id=>changePlannerRecord('tasks',id,{archived:!data.tasks.find(t=>t.id===id).archived}),
  'task-filter':id=>{taskFilter=id;render();},
  'reset-request': renderResetRequest, 'back-to-login': () => renderLogin(),
  'cancel-recovery': async () => {try{await api.signOut();}finally{resetPrivateUI();renderLogin();}},
  start, refresh: reload, settings: () => settingsForm(), export: exportCSVs,
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
  const wasOpen = dialog.open;
  event.preventDefault(); target.disabled=true;
  try {
    const result = actions[target.dataset.action]?.(target.dataset.id,target.dataset.value);
    if (!wasOpen && dialog.open) editor.rememberOpener(target);
    await result;
  } catch(error){notify(errorMessage(error),true); if(data)render();} finally{target.disabled=false;}
});
document.addEventListener('change',event => {
  if(event.target.id==='f-seating-unit'&&event.target.value)showSeatingUnit(event.target.value);
  if(event.target.id==='comparison'){comparison=event.target.value;$('#bars').innerHTML=bars(comparison);}
  if(event.target.id==='f-menu-group'){menuFilters.group=event.target.value;render();}
  if(event.target.id==='f-menu-vendor'){menuFilters.vendor=event.target.value;render();}
  if(event.target.id==='f-schedule-filter'){scheduleFilter=event.target.value;render();}
  if(event.target.id==='f-itinerary-track'){itineraryTrack=event.target.value;render();}
  if(event.target.id==='f-category-filter'){selectedCategory=event.target.value;render();}
  const guestSelects={'f-guest-rsvp':'rsvp','f-guest-tag':'tag','f-guest-table':'table','f-guest-view':'view'};
  if(guestSelects[event.target.id]){guestFilters[guestSelects[event.target.id]]=event.target.value;render();}
});
document.addEventListener('input',event=>{
  if(event.target.id==='f-menu-search'){menuFilters.search=event.target.value;const cursor=event.target.selectionStart;render();$('#f-menu-search').focus();$('#f-menu-search').setSelectionRange(cursor,cursor);return;}
  if(event.target.id!=='f-guest-search')return;
  guestFilters.search=event.target.value;const cursor=event.target.selectionStart;render();
  $('#f-guest-search').focus();$('#f-guest-search').setSelectionRange(cursor,cursor);
});
$('#cancel').onclick = () => dialog.close();
dialog.addEventListener('cancel',event => {if($('#cancel').disabled)event.preventDefault();});
window.addEventListener('focus',() => {if(api?.session && !api.session.recovery && !handlingAuthRedirect && !hubOptions) void (data ? reload() : start());});
window.addEventListener('online',() => {if(api?.session && !api.session.recovery && !handlingAuthRedirect && !hubOptions) void (data ? reload() : start());});
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
