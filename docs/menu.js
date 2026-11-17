import {cents,MAX_CENTS,money,csv} from './budget.js';
import {escapeHTML as esc,button as btn,select,input} from './ui.js';

export const PRICE_BASES=[['fixed','Fixed dish / package total'],['per_person','Per planning guest (shared / buffet)'],['per_choice','Per confirmed guest choosing this dish'],['per_quantity','Unit price × planned quantity']];
export function menuDiners(data) {
  return (data.guests||[]).filter(g=>!g.deleted&&!g.archived&&g.rsvp==='yes'&&(data.invitations||[]).some(i=>i.id===g.invitation_id&&!i.deleted&&!i.archived));
}
export function menuCourses(data) {return (data.menu_courses||[]).filter(c=>!c.deleted).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));}
export function activeDishes(data) {return (data.menu_options||[]).filter(o=>!o.deleted&&menuCourses(data).some(c=>c.id===o.course_id));}
export function guestMeal(data,guest,course) {
  const record=(data.guest_meals||[]).find(m=>!m.deleted&&m.guest_id===guest&&m.course_id===course);
  const option=activeDishes(data).find(o=>o.id===record?.option_id&&o.course_id===course&&o.selected);
  return {record,option,status:option?'chosen':record?.option_id?'review':'pending'};
}
export function dishCount(data,id) {
  const dish=activeDishes(data).find(o=>o.id===id),course=menuCourses(data).find(c=>c.id===dish?.course_id);
  if(!dish?.selected)return 0;
  if(dish?.selected&&course&&!course.choices_offered)return menuDiners(data).length;
  return menuDiners(data).filter(g=>(data.guest_meals||[]).some(m=>!m.deleted&&m.guest_id===g.id&&m.option_id===id)).length;
}
export function dishCost(data,dish) {
  if(dish.unit_cents===null)return null;
  const n=dish.pricing_basis==='fixed'?1:dish.pricing_basis==='per_quantity'?dish.quantity:dish.pricing_basis==='per_person'?data.wedding.planning_headcount:dishCount(data,dish.id);
  return n===null||n===undefined?null:dish.unit_cents*n;
}
export function menuEstimate(data) {
  const dishes=activeDishes(data).filter(o=>o.selected);
  const missingCourses=new Set(dishes.filter(o=>o.pricing_basis==='per_choice').map(o=>o.course_id));
  const pending=[...missingCourses].some(c=>menuDiners(data).some(g=>!guestMeal(data,g.id,c).option));
  const costs=dishes.map(o=>dishCost(data,o)),known=costs.reduce((a,b)=>a+(b??0),0),overflow=known>MAX_CENTS;
  return {cents:!dishes.length||pending||costs.includes(null)||overflow?null:known,known_cents:known,selected:dishes.length,overflow};
}
export function menuOptionRecord(fields) {
  const name=String(fields.name||'').trim(),unit=String(fields.unit||'').trim(),notes=String(fields.notes||'');
  if(!name||name.length>160)throw new Error('Enter a dish name of 1–160 characters.');
  if(!unit||unit.length>60||notes.length>4000)throw new Error('Enter a unit of 1–60 characters and notes up to 4,000 characters.');
  if(!PRICE_BASES.some(([key])=>key===fields.pricing_basis))throw new Error('Choose a pricing basis.');
  const quantity=Number(fields.quantity),rating=fields.rating?Number(fields.rating):null;
  if(!/^\d+$/.test(String(fields.quantity))||!Number.isInteger(quantity)||quantity>100000)throw new Error('Quantity must be a whole number from 0 to 100,000.');
  if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>5))throw new Error('Choose a rating from 1 to 5.');
  const unit_cents=cents(fields.price,true);
  if(fields.pricing_basis==='per_quantity'&&unit_cents*quantity>MAX_CENTS)throw new Error('Dish estimate exceeds 10,000,000.00.');
  return {course_id:fields.course_id,name,selected:fields.selected==='on',rating,vendor_id:fields.vendor_id||null,pricing_basis:fields.pricing_basis,quantity,unit,unit_cents,notes};
}
export function mealManifest(data) {
  const courses=menuCourses(data);
  return menuDiners(data).sort((a,b)=>(a.meal_table||'').localeCompare(b.meal_table||'')||(a.name||'').localeCompare(b.name||'')||a.id.localeCompare(b.id)).flatMap(g=>courses.map(c=>{
    const meal=guestMeal(data,g.id,c.id),o=meal.option;
    const shared=activeDishes(data).filter(d=>d.selected&&d.course_id===c.id);
    return {guest:g,course:c,option:o,status:c.choices_offered?meal.status:'shared',shared,household:data.invitations.find(i=>i.id===g.invitation_id)?.household_name||'',vendor:c.choices_offered?(data.vendors.find(v=>v.id===o?.vendor_id)?.name||''):[...new Set(shared.map(d=>data.vendors.find(v=>v.id===d.vendor_id)?.name).filter(Boolean))].join('; ')};
  }));
}
export function menuCSV(data) {
  return csv([['table','household','guest_id','guest','course','dish','status','vendor','dietary_flags','guest_request','caterer_confirmation'],
    ...mealManifest(data).map(r=>[r.guest.meal_table||'Unassigned',r.household,r.guest.id,r.guest.name||'Unnamed companion',r.course.name,r.status==='shared'?r.shared.map(o=>o.name).join('; '):r.option?.name||'',r.status,r.vendor,(r.guest.dietary_flags||[]).join('; '),r.guest.dietary_notes,r.guest.caterer_confirmation])]);
}
export function renderMenu(data,filters={group:'course',vendor:'',search:''}) {
  if(!data.menu_ready)return '<section class="panel empty-state"><h2>Our menu</h2><p>Menu planning is being prepared. Your existing planner is ready to use.</p></section>';
  const fmt=n=>money(n,data.wedding.currency),courses=menuCourses(data),all=activeDishes(data),selected=all.filter(o=>o.selected),diners=menuDiners(data),estimate=menuEstimate(data);
  const linked=data.expenses.find(e=>e.id===data.wedding.menu_expense_id),manifest=mealManifest(data);
  const missing=manifest.filter(r=>r.course.choices_offered&&!r.option);
  const dishes=all.filter(o=>(!filters.vendor||o.vendor_id===filters.vendor)&&(!filters.search||[o.name,o.notes,data.vendors.find(v=>v.id===o.vendor_id)?.name||''].join(' ').toLocaleLowerCase().includes(filters.search.toLocaleLowerCase())));
  const groups=filters.group==='vendor'?[...new Set(dishes.map(o=>o.vendor_id||''))].map(id=>({id,name:data.vendors.find(v=>v.id===id)?.name||'Vendor to be decided'})):courses;
  return `<section class="page-heading"><div><span class="eyebrow">SOMETHING DELICIOUS, TOGETHER</span><h2>A menu to remember</h2><p>Compare dishes, choose our favorites, and give every guest a place at the table.</p></div><div class="actions">${btn('menu-course-new','+ Add course')}${btn('menu-dish-new','+ Add dish','','')}</div></section>
    <section class="cards menu-metrics"><article class="card"><span>Selected dishes</span><strong>${selected.length}</strong><small>Multiple favorites per course welcome</small></article><article class="card"><span>Confirmed diners</span><strong>${diners.length}</strong><small>Planning headcount: ${data.wedding.planning_headcount??'not set'} ${btn('settings','Edit','','text-button')}</small></article><article class="card"><span>Choices still to settle</span><strong>${missing.length}</strong><small>Guest/course pairs, including dishes needing review</small></article><article class="card"><span>Menu estimate</span><strong>${estimate.cents===null?'Incomplete':fmt(estimate.cents)}</strong><small>${fmt(estimate.known_cents)} known${estimate.overflow?' · exceeds supported limit':''}</small></article></section>
    <section class="panel menu-budget"><h3>One menu, one catering expense</h3><p>${linked?`${esc(linked.title)} · ${linked.agreed_cents!==null?`Agreed ${fmt(linked.agreed_cents)} · revised menu estimate ${fmt(estimate.cents)}. Record a contract amendment in Budget to change the agreement.`:`Uses this menu estimate in Forecast. Its budgeted amount and vendor quotes remain recorded.`}`:'Link one existing catering expense to include the selected menu estimate in Forecast.'}</p><p class="muted">Fixed packages count once. Shared/buffet per-person dishes use the planning headcount; each selected dish is additive. Alternative plated dishes should use per-choice pricing or explicit planned quantities. Per-choice estimates stay incomplete until every attending guest has a valid choice for that course. Taxes, service, and other charges must be included as dishes/packages if needed.</p>${btn('menu-link','Choose catering expense')}${linked?btn('menu-expense','Open linked expense',linked.id):''}</section>
    <section class="panel menu-filters"><div>${select('menu-group','Group dishes by',[['course','Course'],['vendor','Vendor']],filters.group)}</div><div>${select('menu-vendor','Vendor',[['','All vendors'],...data.vendors.map(v=>[v.id,v.name])],filters.vendor)}</div><div>${input('menu-search','Find a dish',filters.search,'search')}</div></section>
    ${groups.map(group=>{const items=dishes.filter(o=>(filters.group==='vendor'?(o.vendor_id||''):o.course_id)===group.id);return `<section class="menu-course panel"><div class="section-head"><div><h3>${esc(group.name)}</h3>${filters.group==='course'?`<p class="muted">${group.choices_offered?'Each attending guest chooses one selected dish, or stays pending.':'Shared service · no individual meal choices.'}</p>`:''}</div>${filters.group==='course'?`<div class="actions">${btn('menu-course-edit','Edit course',group.id)}${btn('menu-course-delete','Delete course',group.id)}</div>`:''}</div><div class="menu-grid">${items.map(o=>`<article class="dish-card ${o.selected?'dish-selected':''}">${o.photo_path?`<img data-menu-photo="${esc(o.id)}" alt="${esc(o.name)}" loading="lazy"><small data-menu-photo-error="${esc(o.id)}"></small>`:'<div class="dish-placeholder" aria-hidden="true">✦</div>'}<div class="dish-copy"><span class="badge">${o.selected?'On our menu':'Considering'}</span><h4>${esc(o.name)}</h4><p>${esc(data.vendors.find(v=>v.id===o.vendor_id)?.name||'Vendor to be decided')} · ${esc(courses.find(c=>c.id===o.course_id)?.name)}</p><p>${fmt(o.unit_cents)} · ${esc(PRICE_BASES.find(([id])=>id===o.pricing_basis)?.[1])}</p>${o.pricing_basis==='per_quantity'?`<p>${o.quantity} ${esc(o.unit)} planned</p>`:''}<p>${dishCount(data,o.id)} confirmed choices · ${o.rating?'★'.repeat(o.rating):'Not rated'}</p><p class="preline">${esc(o.notes)}</p><div class="actions">${btn('menu-toggle',o.selected?'Remove from menu':'Select dish',o.id)}${btn('menu-dish-edit','Edit',o.id)}${btn('menu-photo','Photo',o.id)}${btn('menu-dish-delete','Delete',o.id)}</div></div></article>`).join('')||'<p>No dishes here yet. Add a dish or adjust your filters.</p>'}</div></section>`;}).join('')||'<section class="panel empty-state"><h3>Start with a course you love.</h3><p>Add starters, mains, desserts, drinks, or a course of your own.</p></section>'}
    <section class="panel menu-manifest"><div class="section-head"><div><span class="eyebrow">READY FOR THE CATERER</span><h3>Guest meals & dietary requests</h3></div><div class="actions">${btn('menu-export','Download caterer CSV')}${btn('menu-print','Print meal list')}</div></div><p>Dietary requests are separate from meal preferences and the caterer’s confirmation. A dish choice is never a promise that an allergy can be accommodated.</p><div class="menu-counts">${selected.map(o=>`<span class="dietary-count"><strong>${dishCount(data,o.id)}</strong>${esc(o.name)}</span>`).join('')}</div><div class="table-scroll"><table class="meal-table"><thead><tr><th>Table / guest</th><th>Course & choice</th><th>Dietary request</th><th>Caterer confirmation</th><th>Actions</th></tr></thead><tbody>${manifest.map(r=>`<tr><td>${esc(r.guest.meal_table||'Table unassigned')}<br><strong>${esc(r.guest.name||'Unnamed companion')}</strong><br>${esc(r.household)}</td><td>${esc(r.course.name)}<br>${esc((r.status==='shared'?r.shared.map(o=>o.name).join('; ')||'Shared menu to be decided':r.option?.name)|| (r.status==='review'?'Choice needs review':'Choice pending'))}<br>${esc(r.vendor)}</td><td>${esc((r.guest.dietary_flags||[]).join(', '))}<p>${esc(r.guest.dietary_notes)}</p></td><td>${esc(r.guest.caterer_confirmation||'Not yet confirmed')}</td><td>${r.course.choices_offered?btn('menu-meal','Choose meal',r.guest.id):''}${btn('guest-edit','Guest details',r.guest.id)}</td></tr>`).join('')||'<tr><td colspan="5">Add attending guests and courses offering choices to build the meal list.</td></tr>'}</tbody></table></div>${missing.length?`<details><summary>${missing.length} choices missing or needing review</summary><ul>${missing.map(r=>`<li>${esc(r.guest.name||'Unnamed companion')} · ${esc(r.course.name)} · ${r.status==='review'?'previous dish unavailable':'choice pending'}</li>`).join('')}</ul></details>`:''}</section>`;
}
