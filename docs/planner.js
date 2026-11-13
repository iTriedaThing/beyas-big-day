const DAY_MS = 86_400_000;
export const TASK_WINDOWS = [
  {id:'12_plus',label:'12+ months before',months:-12},
  {id:'9_12',label:'9–12 months before',months:-9},
  {id:'6_9',label:'6–9 months before',months:-6},
  {id:'4_6',label:'4–6 months before',months:-4},
  {id:'2_4',label:'2–4 months before',months:-2},
  {id:'1_2',label:'1–2 months before',months:-1},
  {id:'last_month',label:'The final month',days:-14},
  {id:'last_week',label:'The final week',days:-7},
  {id:'two_days',label:'Two days before',days:-2},
  {id:'day_before',label:'The day before',days:-1},
  {id:'wedding_day',label:'The big day',days:0},
  {id:'after',label:'After the celebration',days:14},
];
export const DIETARY_FLAGS = [
  ['vegetarian','Vegetarian'],['vegan','Vegan'],['gluten_free','Gluten-free'],
  ['dairy_free','Dairy-free'],['nut_allergy','Nut allergy'],['other','Other request'],
];
export const GUEST_TAGS = ['Family','Friends','Wedding party','Colleagues','Other'];
export const STARTER_TASKS = [
  ['vision','12_plus','Talk about the celebration you both want'],
  ['budget','12_plus','Agree on a wedding budget'],
  ['venue','12_plus','Visit and choose your venue'],
  ['guest_list','9_12','Build your first guest list'],
  ['photographer','9_12','Book your photographer'],
  ['caterer','9_12','Compare catering packages'],
  ['save_dates','6_9','Send save-the-dates'],
  ['attire','6_9','Find your wedding outfits'],
  ['music','6_9','Choose your ceremony and reception music'],
  ['florals','4_6','Plan flowers and your green & purple palette'],
  ['invitations','4_6','Order your invitations'],
  ['send_invites','2_4','Send formal invitations'],
  ['menu','2_4','Finalize your menu and dietary arrangements'],
  ['vows','1_2','Write your vows'],
  ['rsvp_followup','1_2','Follow up on outstanding RSVPs'],
  ['headcount','last_month','Confirm the final headcount with your caterer'],
  ['timeline','last_month','Share the wedding-day schedule'],
  ['vendors','last_week','Confirm arrival times with your vendors'],
  ['essentials','two_days','Pack rings, outfits, and your essentials'],
  ['rehearsal','day_before','Rehearse, relax, and get some rest'],
  ['celebrate','wedding_day','Take a quiet moment together'],
  ['thank_you','after','Send your thank-you notes'],
];
function utcDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Use a valid calendar date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error('Use a valid calendar date.');
  return date;
}
export function daysUntil(weddingDate, today) {
  return weddingDate ? Math.round((utcDate(weddingDate)-utcDate(today))/DAY_MS) : null;
}
export function taskDueDate(task, weddingDate) {
  if (task.due_date) { utcDate(task.due_date); return task.due_date; }
  if (!weddingDate) return null;
  const window = TASK_WINDOWS.find(w => w.id === task.planning_window);
  if (!window) return null;
  const date = utcDate(weddingDate);
  if (window.months !== undefined) {
    const day = date.getUTCDate();
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth()+window.months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,lastDay));
  } else date.setUTCDate(date.getUTCDate()+window.days);
  return date.toISOString().slice(0,10);
}
export function guestSummary(invitations = [], guests = []) {
  const activeHouseholds = invitations.filter(i => !i.archived);
  const ids = new Set(activeHouseholds.map(i => i.id));
  const active = guests.filter(g => !g.archived && ids.has(g.invitation_id));
  const yes = active.filter(g => g.rsvp === 'yes');
  return {active,households:activeHouseholds.length,invited:active.length,yes:yes.length,
    no:active.filter(g => g.rsvp === 'no').length,pending:active.filter(g => g.rsvp === 'pending').length,
    saveDatesSent:activeHouseholds.filter(i => i.save_the_date_sent_on).length,
    invitationsSent:activeHouseholds.filter(i => i.invitation_sent_on).length,
    gifts:active.filter(g => g.gift_received).length,
    dietary:DIETARY_FLAGS.map(([id,label])=>({id,label,count:yes.filter(g=>new Set(g.dietary_flags || []).has(id)).length})),
    dietaryGuests:yes.filter(g=>(g.dietary_flags || []).length || g.dietary_notes?.trim()).length};
}
export function taskSummary(tasks = [], weddingDate, today) {
  const active=tasks.filter(t=>!t.archived);
  const done=active.filter(t=>t.completed).length;
  const upcoming=active.filter(t=>!t.completed).map(t=>({...t,effective_due:taskDueDate(t,weddingDate)}))
    .filter(t=>t.effective_due).sort((a,b)=>a.effective_due.localeCompare(b.effective_due)||a.title.localeCompare(b.title));
  return {total:active.length,done,percent:active.length?Math.round(done/active.length*100):0,
    overdue:upcoming.filter(t=>t.effective_due<today).length,upcoming,
    windows:TASK_WINDOWS.map(w=>({...w,total:active.filter(t=>t.planning_window===w.id).length,
      done:active.filter(t=>t.planning_window===w.id&&t.completed).length}))};
}
export function householdGuests(names, unnamedCount) {
  if (!Number.isInteger(unnamedCount) || unnamedCount<0 || unnamedCount>20) throw new Error('Choose between 0 and 20 unnamed companions.');
  const named=names.split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  if (named.some(name=>name.length>120)) throw new Error('Guest names must be at most 120 characters.');
  if (named.length+unnamedCount<1 || named.length+unnamedCount>50) throw new Error('A household must contain 1–50 individual guests.');
  return [...named.map(name=>({name,is_companion:false})),...Array.from({length:unnamedCount},()=>({name:null,is_companion:true}))];
}
