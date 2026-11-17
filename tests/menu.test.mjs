import test from 'node:test';
import assert from 'node:assert/strict';
import {menuDiners,guestMeal,dishCount,menuEstimate,menuOptionRecord,mealManifest,menuCSV,renderMenu} from '../docs/menu.js';
import {expenseTotals} from '../docs/budget.js';
const sample=()=>({menu_ready:true,wedding:{currency:'USD',planning_headcount:80,menu_expense_id:'e'},vendors:[{id:'v',name:'Our caterer'}],expenses:[{id:'e',title:'Catering',agreed_cents:null}],
  menu_courses:[{id:'main',name:'Mains',sort_order:1,choices_offered:true},{id:'drinks',name:'Drinks',sort_order:2,choices_offered:false}],
  menu_options:[{id:'veg',course_id:'main',name:'Vegetable tart',selected:true,pricing_basis:'per_choice',unit_cents:2500,vendor_id:'v'},
    {id:'fish',course_id:'main',name:'Roast fish',selected:true,pricing_basis:'per_choice',unit_cents:3000,vendor_id:'v'},
    {id:'wine',course_id:'drinks',name:'Wine package',selected:true,pricing_basis:'per_person',unit_cents:1000}],
  invitations:[{id:'h',household_name:'Our friends'},{id:'archived',household_name:'Archived',archived:true}],
  guests:[{id:'a',name:'Alex',rsvp:'yes',invitation_id:'h',meal_table:'2',dietary_flags:['vegan','nut_allergy'],dietary_notes:'No nuts',caterer_confirmation:'Chef confirmed'},
    {id:'b',name:null,is_companion:true,rsvp:'yes',invitation_id:'h',meal_table:'1'},
    {id:'c',name:'Declined',rsvp:'no',invitation_id:'h'},{id:'d',name:'Archived',rsvp:'yes',invitation_id:'archived'},
    {id:'f',name:'Guest archived',rsvp:'yes',invitation_id:'h',archived:true}],
  guest_meals:[{id:'m',guest_id:'a',course_id:'main',option_id:'veg'}]});
test('meal counts include each active attending person once, including unnamed companions',()=>{
  const d=sample();assert.deepEqual(menuDiners(d).map(g=>g.id),['a','b']);assert.equal(dishCount(d,'veg'),1);assert.equal(dishCount(d,'wine'),2);
  assert.equal(guestMeal(d,'b','main').status,'pending');assert.equal(mealManifest(d).length,4);
  assert.equal(mealManifest(d)[0].guest.id,'b');assert.equal(mealManifest(d).find(r=>r.course.id==='drinks').status,'shared');
});
test('per-choice prices stay incomplete until all diners choose, without multiplying alternatives',()=>{
  const d=sample();assert.equal(menuEstimate(d).cents,null);assert.equal(menuEstimate(d).known_cents,82500);
  d.guest_meals.push({guest_id:'b',course_id:'main',option_id:'fish'});assert.equal(menuEstimate(d).cents,85500);
  d.wedding.planning_headcount=90;assert.equal(menuEstimate(d).cents,95500);
  d.guests[1].rsvp='no';assert.equal(menuEstimate(d).cents,92500);assert.equal(dishCount(d,'fish'),0);
});
test('deselected/deleted dishes invalidate choices, pending is explicit and archive/RSVP keeps history',()=>{
  const d=sample();d.menu_options[0].selected=false;assert.equal(guestMeal(d,'a','main').status,'review');assert.equal(menuEstimate(d).cents,null);
  d.menu_options[0].selected=true;assert.equal(guestMeal(d,'a','main').status,'chosen');d.guest_meals[0].option_id=null;assert.equal(guestMeal(d,'a','main').status,'pending');
  d.menu_courses[0].deleted=true;assert.ok(!mealManifest(d).some(r=>r.course.id==='main'));
});
test('fixed packages and integer quantities preserve zero, blanks, headcount and overflow',()=>{
  const d=sample();d.menu_options=[{id:'x',course_id:'drinks',selected:true,pricing_basis:'fixed',unit_cents:0}];assert.equal(menuEstimate(d).cents,0);
  d.menu_options[0].unit_cents=null;assert.equal(menuEstimate(d).cents,null);
  Object.assign(d.menu_options[0],{unit_cents:125,pricing_basis:'per_quantity',quantity:7});assert.equal(menuEstimate(d).cents,875);
  Object.assign(d.menu_options[0],{pricing_basis:'per_person',unit_cents:7500});assert.equal(menuEstimate(d).cents,600000);d.wedding.planning_headcount=90;assert.equal(menuEstimate(d).cents,675000);
  d.wedding.planning_headcount=null;assert.equal(menuEstimate(d).cents,null);d.wedding.planning_headcount=0;assert.equal(menuEstimate(d).cents,0);
  d.wedding.planning_headcount=100000;d.menu_options[0].unit_cents=1000000000;assert.equal(menuEstimate(d).overflow,true);assert.equal(menuEstimate(d).cents,null);
  d.menu_options=[];assert.equal(menuEstimate(d).cents,null);
});
test('one linked forecast replaces quote/target while booked price, payments and amendments stay separate',()=>{
  const e={id:'e',target_cents:20000,agreed_cents:null,preferred_quote_id:'q',menu_linked:true,menu_estimate_cents:15000};
  const quotes=[{id:'q',unit_cents:17000,pricing_basis:'fixed'}],payments=[{expense_id:'e',kind:'payment',amount_cents:5000}];
  assert.deepEqual(expenseTotals(e,quotes,payments),{forecast:15000,paid:5000,owed:0,credit:0,variance:-5000});
  assert.equal(expenseTotals({...e,menu_estimate_cents:null},quotes,payments).forecast,null);
  assert.equal(expenseTotals({...e,agreed_cents:18000},quotes,payments).forecast,18000);
  assert.equal(expenseTotals({...e,menu_linked:false},quotes,payments).forecast,17000);
});
test('dish validation uses exact cents and bounds quantities, names, ratings and pricing',()=>{
  const f={name:' Tart ',unit:' serving ',price:'12.05',quantity:'5',pricing_basis:'per_quantity',course_id:'main',vendor_id:'',rating:'4',selected:'on',notes:'Tasting'};
  assert.equal(menuOptionRecord(f).unit_cents,1205);assert.equal(menuOptionRecord(f).name,'Tart');assert.equal(menuOptionRecord({...f,price:''}).unit_cents,null);
  for(const diff of [{price:'1.005'},{price:'-1'},{quantity:'1.5'},{quantity:'-1'},{quantity:'100001'},{rating:'6'},{pricing_basis:'other'},{name:' '},{unit:''},{price:'10000000',quantity:'2'}])assert.throws(()=>menuOptionRecord({...f,...diff}));
});
test('menu escapes content and exports per-course preferences separately from dietary confirmation',()=>{
  const d=sample();d.menu_options[0].name='<img src=x onerror=evil()>',d.guests[0].name='=SUM(A1)';
  const html=renderMenu(d,{group:'vendor',vendor:'v',search:''});assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;img/);assert.match(html,/Our caterer/);assert.match(html,/choices missing/);
  const exported=menuCSV(d);assert.match(exported,/'=SUM/);assert.match(exported,/vegan; nut_allergy/);assert.match(exported,/No nuts/);assert.match(exported,/Chef confirmed/);assert.ok(!exported.includes('Declined'));
  assert.match(renderMenu({...d,menu_ready:false}),/being prepared/);
});
