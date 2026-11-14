import {escapeHTML as esc,button as btn,select} from './ui.js';
import {taskDueDate,daysUntil} from './planner.js';
import {installmentBalance,money} from './budget.js';

export function webURL(value) {
  try { const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''; } catch {return '';}
}
export function websiteLink(value,label=value) {
  const url=webURL(value);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:esc(value);
}
export function pinterestBoard(value) {
  if(!value?.trim())return '';
  const url=new URL(value);
  if(url.protocol!=='https:'||!['pinterest.com','www.pinterest.com'].includes(url.hostname)||url.username||url.password||!/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)||/^\/pin\//.test(url.pathname))throw new Error('Use a full Pinterest board link: https://www.pinterest.com/username/board-name/');
  return `https://www.pinterest.com${url.pathname.replace(/\/?$/,'/')}`;
}
export function timeZones(current) {
  const zones=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Australia/Sydney','Pacific/Auckland'];
  return [...new Set(['UTC',current,...zones].filter(Boolean))].sort().map(zone=>[zone,zone.replaceAll('_',' ')]);
}
export function countdown(date,today) {
  const days=daysUntil(date,today);
  return `<div class="intro-countdown" aria-label="Wedding countdown"><strong>${days===null?'Date to come':days===0?'Today is our day!':`${Math.abs(days)} ${Math.abs(days)===1?'day':'days'} ${days<0?'married':'to go'}`}</strong>${btn('settings','Edit date','','text-button')}</div>`;
}
export const attributionOptions=members=>[['','Together / unspecified'],...members.map(m=>[m.user_id,m.display_name])];
export function scheduleEntries(data) {
  const events=(data.events||[]).map(e=>({...e,type:e.kind,source:'event',date:e.event_date,time:e.start_time?.slice(0,5)||''}));
  const tasks=(data.tasks||[]).filter(t=>!t.archived&&!t.completed).map(t=>({...t,type:'Task',source:'task',date:taskDueDate(t,data.wedding.wedding_date),time:''})).filter(t=>t.date);
  const installments=(data.installments||[]).map(i=>({...i,remaining:installmentBalance(i,data.payments)})).filter(i=>i.remaining>0).map(i=>({...i,title:`${i.label} · ${data.expenses.find(e=>e.id===i.expense_id)?.title||'Expense'}`,type:'Payment due',source:'installment',date:i.due_date,time:''}));
  return [...events,...tasks,...installments].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
}
export function renderSchedule(data,today,filter='upcoming') {
  if(!data.feedback_ready)return '<section class="panel"><h2>Schedule is being prepared</h2><p>Your existing planner is ready to use.</p></section>';
  const rows=scheduleEntries(data).filter(e=>filter==='all'||(filter==='past'?e.date<today:e.date>=today&&!e.completed));
  return `<section class="page-heading"><div><h2>Our schedule</h2><p>Tours, tastings, appointments, tasks, and outstanding payment dates, together. Times follow ${esc(data.wedding.time_zone)}.</p></div>${btn('event-new','+ Add event','','')}</section><section class="panel">${select('schedule-filter','Show',[['upcoming','Today & upcoming'],['past','Past dates'],['all','All dates']],filter)}<div class="agenda">${rows.map(e=>`<article class="agenda-row"><div><strong>${esc(e.date)}</strong><small>${esc(e.time||'All day')}</small></div><div><span class="badge">${esc(e.type)}</span><h3>${esc(e.title)}</h3>${e.completed?'<p>Completed</p>':''}<p>${esc(e.location||'')}</p>${e.vendor_id?`<p>${esc(data.vendors.find(v=>v.id===e.vendor_id)?.name||'')}</p>`:''}<p class="preline">${esc(e.notes||'')}</p>${e.remaining?`<p>${money(e.remaining,data.wedding.currency)} remaining</p>`:''}</div><div class="actions">${e.source==='event'?btn('event-edit','Edit',e.id)+btn('event-delete','Delete',e.id):e.source==='task'?btn('task-edit','Edit task',e.id):btn('payment-installment','Record payment',e.id)}</div></article>`).join('')||'<p>No dates in this view. Add a tour or tasting, set task deadlines, or schedule installments.</p>'}</div></section>`;
}
export function renderMoodboard(data) {
  const board=data.wedding.pinterest_board_url||'';
  return `<section class="panel"><div class="section-head"><h2>Our mood board</h2><div class="actions">${board?btn('moodboard-refresh','Refresh board'):''}${btn('moodboard-edit',board?'Change board':'Link Pinterest board')}</div></div><p>Keep our inspiration alongside the plan. Use a public Pinterest board; secret boards cannot be embedded. Pinterest may limit the preview or require cookies.</p>${board?`<iframe class="moodboard-frame" src="./pinterest.html#${encodeURIComponent(board)}" title="Our live Pinterest board" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe><p>${websiteLink(board,'Open board on Pinterest if the preview is unavailable')}</p>`:'<p>No board linked yet.</p>'}</section>`;
}
export function validatePhoto(file) {
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if(!file.size||file.size>5*1024*1024)throw new Error('Choose a photo no larger than 5 MB.');
  return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
}
