// App wiring test with an in-memory DOM adapter and mock HTTP. Not a browser/layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installMock} from './fixture.js';
import {menuEstimate} from '../docs/menu.js';
import {config} from '../docs/config.js';

test('feedback flows render and save through the app; Forecast survives polling and tab changes',async t=>{
  const names=['document','window','sessionStorage','fetch','WebSocket','FormData','setInterval','clearInterval','setTimeout','clearTimeout'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const elements=new Map(),listeners=new Map(),windowListeners=new Map(),intervals=[];
  class Element {
    constructor(id){this.id=id;this.textContent='';this.open=false;this.isConnected=true;this.disabled=false;this.value='';this.style={setProperty(){},removeProperty(){}};this.listeners=new Map();}
    set innerHTML(html){
      this.html=html;
      for(const match of html.matchAll(/(?:^|\s)id="([^"]+)"/g))elements.set(match[1],new Element(match[1]));
      for(const [,id,options] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
        elements.get(id).value=options.match(/<option value="([^"]*)" selected>/)?.[1]??options.match(/<option value="([^"]*)"/)?.[1]??'';
      }
    }
    get innerHTML(){return this.html||'';}
    replaceChildren(){this.innerHTML='';}
    querySelector(){return new Element('button');}
    showModal(){this.open=true;}
    close(){this.open=false;this.listeners.get('close')?.();}
    append(){}reset(){}scrollIntoView(){}focus(){}select(){}setSelectionRange(){}
    addEventListener(name,handler){this.listeners.set(name,handler);}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const storage=new Map(), rootClasses=new Set(), scrollRestores=[];
  Object.assign(globalThis,{
    document:{hidden:false,body:{style:el('body').style,classList:{toggle(){}}},documentElement:{classList:{add:name=>rootClasses.add(name),remove:name=>rootClasses.delete(name)}},querySelector:s=>s.startsWith('#')?el(s.slice(1)):null,addEventListener:(name,handler)=>listeners.set(name,handler)},
    window:{location:new URL('http://localhost/'),history:{replaceState(){}},scrollY:420,scrollTo:options=>scrollRestores.push(options),addEventListener:(name,handler)=>windowListeners.set(name,handler)},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},setTimeout:()=>1,clearTimeout(){},
    fetch:async()=>{throw new Error('Unexpected real network request in app fixture');}
  });
  installMock(menuEstimate);const mockFetch=globalThis.fetch;
  let historyDelay, snapshotDelay, secondWedding;
  globalThis.fetch=async(url,options)=>{
    const response=await mockFetch(String(url).replace(config.supabaseUrl,'https://fixture.supabase.co'),options);
    if(secondWedding && String(url).endsWith('/rpc/planner_access')){
      const access=await response.json();
      access.weddings.push(secondWedding);
      return Response.json(access);
    }
    if(secondWedding && String(url).endsWith('/rpc/budget_snapshot') && JSON.parse(options.body).w===secondWedding.id){
      const snapshot=await response.json();
      snapshot.wedding={...snapshot.wedding,...secondWedding};
      for(const key of Object.keys(snapshot))if(Array.isArray(snapshot[key]))snapshot[key]=[];
      snapshot.invitations=[{id:'second-household',household_name:'Second household'}];
      snapshot.guests=[{id:'second-guest',invitation_id:'second-household',name:'Second-only guest'}];
      return Response.json(snapshot);
    }
    if(historyDelay&&String(url).includes('/record_history?'))await historyDelay;
    if(snapshotDelay&&String(url).includes('/rpc/budget_snapshot'))await snapshotDelay;
    return response;
  };
  const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
  await import('../docs/app.js');await settle();
  assert.match(el('main').innerHTML,/Sign in/);
  el('login').values={email:'example@example.invalid',password:'mock-only'};
  await el('login').onsubmit({preventDefault(){},currentTarget:el('login')});await settle();
  let focusedAction;
  const click=async(action,id='')=>{const target={dataset:{action,id},disabled:false,isConnected:true,focus(){focusedAction=action;}};await listeners.get('click')({preventDefault(){},target:{closest:()=>target}});await settle();};
  const submit=async (values,expectedError=/^$/)=>{el('edit-form').values=values;await el('edit-form').onsubmit({preventDefault(){},currentTarget:el('edit-form')});await settle();assert.match(el('form-error').textContent,expectedError);};
  await click('task-new');
  assert.equal(el('editor').open,true);
  assert.equal(rootClasses.has('editor-open'),true);
  el('cancel').onclick();
  assert.equal(rootClasses.has('editor-open'),false);
  assert.deepEqual(scrollRestores,[{top:420,behavior:'instant'}]);
  assert.equal(focusedAction,'task-new');
  assert.match(el('main').innerHTML,/class="intro-note"[\s\S]*class="intro-countdown"/);
  assert.match(el('main').innerHTML,/class="forecast-link"/);
  listeners.get('change')({target:{id:'comparison',value:'forecast'}});
  const poll=intervals.find(i=>i.ms===20000);poll.fn();await settle();
  assert.match(el('main').innerHTML,/<option value="forecast" selected>/);
  await click('tab-seating');assert.match(el('main').innerHTML,/<h2>Seating chart<\/h2>/);
  assert.match(el('main').innerHTML,/data-action="tab-seating"[^>]*aria-pressed="true"/);
  await click('tab-planning');assert.match(el('main').innerHTML,/<h2>Your road to/);
  await click('tab-vendors');assert.match(el('main').innerHTML,/<a href="https:\/\/example.invalid\//);
  await click('compare-vendor','vendor');
  await click('compare-create','Caterers');
  await submit({name:'Catering shortlist'});
  assert.match(el('main').innerHTML,/Dietary accommodations/);
  assert.match(el('main').innerHTML,/No package selected/);
  await click('compare-home');
  const listId=el('main').innerHTML.match(/data-action="compare-list" data-id="([^"]+)"/)[1];
  await click('compare-close');
  await click('expense-open','catering');
  await click('compare-quote','q2');
  await click('compare-list',listId);
  assert.match(el('main').innerHTML,/Garden dinner/);
  assert.match(el('main').innerHTML,/View agreement/);
  assert.doesNotMatch(el('main').innerHTML,/data-action="quote-edit"/);
  await click('compare-home');await click('compare-close');
  await click('tab-budget');assert.match(el('main').innerHTML,/<option value="forecast" selected>/);
  await click('settings');assert.match(el('fields').innerHTML,/<select id="f-time_zone"/);el('editor').close();
  await click('expense-edit','catering');assert.match(el('fields').innerHTML,/Budgeted amount/);el('editor').close();
  await click('payment-edit','p1');assert.match(el('fields').innerHTML,/value="900.00"/);
  await submit({expense_id:'catering',kind:'payment',amount:'1000',paid_on:'2026-11-14',payer_id:'00000000-0000-0000-0000-000000000002',installment_id:'deposit',notes:'Corrected deposit'});
  assert.match(el('main').innerHTML,/\$1,000.00/);assert.match(el('main').innerHTML,/\$2,600.00/);
  await click('payment-history','p1');assert.match(el('fields').innerHTML,/\$900.00[\s\S]*\$1,000.00/);el('editor').close();
  await click('unbook','catering');await submit({reason:'Considering another vendor'});
  assert.match(el('main').innerHTML,/\$4,000.00/);assert.match(el('main').innerHTML,/Planning/);assert.match(el('main').innerHTML,/Schedule paused while unbooked/);
  await click('payment-edit','p1');
  const selectedInstallment=el('f-installment_id').value;
  assert.equal(selectedInstallment,'deposit','a note edit must keep the payment linked to its paused schedule');
  await submit({expense_id:'catering',kind:'payment',amount:'1000',paid_on:'2026-11-14',payer_id:'00000000-0000-0000-0000-000000000002',installment_id:selectedInstallment,notes:'Deposit confirmed'});
  assert.match(el('main').innerHTML,/Schedule paused while unbooked/);
  await click('tab-guests');await click('guests-import');
  assert.match(el('fields').innerHTML,/guest-list-template.csv/);
  const guestFile=el('f-guest-file');
  guestFile.files=[new File(['household,guest_name,rsvp\nFirst,Person,maybe'],'guests.csv')];
  await guestFile.onchange();
  assert.match(el('import-preview').textContent,/Line 2 · rsvp/);
  assert.equal(el('save').disabled,true);
  const cancelEvent=new Event('cancel',{cancelable:true});
  el('editor').listeners.get('cancel')(cancelEvent);
  assert.equal(cancelEvent.defaultPrevented,false,'Escape can dismiss an invalid CSV preview');
  guestFile.files=[new File(['household,guest_name,rsvp\nFirst,<Person>,pending'],'guests.csv')];
  await guestFile.onchange();
  assert.match(el('import-preview').innerHTML,/&lt;Person&gt;/);
  assert.equal(el('save').disabled,false);
  await submit({});assert.match(el('main').innerHTML,/&lt;Person&gt;/);
  await click('household-new');
  await submit({household_name:'Sample household',guest_names:'Taylor',unnamed_count:'0',invited_by:'00000000-0000-0000-0000-000000000002',contact_email:'',phone:'',mailing_address:'',notes:'',save_the_date_sent_on:'',invitation_sent_on:''});
  assert.match(el('main').innerHTML,/From Ben/);
  await click('tab-schedule');assert.match(el('main').innerHTML,/Garden venue tour/);
  await click('event-new');await submit({title:'Cake tasting',kind:'Tasting',event_date:'2027-01-05',start_time:'14:30',location:'Sample bakery',vendor_id:'vendor',notes:'Bring questions'});
  assert.match(el('main').innerHTML,/Cake tasting/);assert.match(el('main').innerHTML,/14:30/);
  const tour={title:'Walk through <Atrium>',kind:'Tour',event_date:'2099-05-01',start_time:'11:45',location:'North & South entrance',vendor_id:'vendor',notes:''};
  await click('event-new');await submit(tour);
  const scheduledId=el('main').innerHTML.match(/Walk through &lt;Atrium&gt;[\s\S]*?data-action="event-edit" data-id="([^"]+)"/)[1];
  await click('tab-vendors');
  assert.match(el('main').innerHTML,/overall rating[\s\S]*?Scheduled tours[\s\S]*?Walk through &lt;Atrium&gt;[\s\S]*?2099-05-01[\s\S]*?11:45 · North &amp; South entrance[\s\S]*?menu dishes/);
  assert.doesNotMatch(el('main').innerHTML,/Cake tasting/);
  await click('tab-schedule');await click('event-edit',scheduledId);await submit({...tour,vendor_id:''});
  await click('tab-vendors');assert.doesNotMatch(el('main').innerHTML,/Atrium/);
  await click('tab-moodboard');await click('moodboard-edit');
  const fixtureAPI='https://fixture.supabase.co/rest/v1';
  const [wedding]=await (await mockFetch(fixtureAPI+'/weddings?select=id,version')).json();
  const partnerBoard='https://www.pinterest.com/example/partner-board/';
  await mockFetch(`${fixtureAPI}/weddings?id=eq.${wedding.id}&version=eq.${wedding.version}`,{
    method:'PATCH',body:JSON.stringify({pinterest_board_url:partnerBoard})
  });
  poll.fn();await settle();
  await submit({url:'https://www.pinterest.com/example/wedding/'},/Someone changed this record/);
  assert.ok(el('main').innerHTML.includes(partnerBoard));
  el('editor').close();await click('moodboard-edit');await submit({url:'https://www.pinterest.com/example/wedding/'});
  assert.match(el('main').innerHTML,/<iframe class="moodboard-frame"/);
  await click('tab-itinerary');assert.match(el('main').innerHTML,/Day-of itinerary/);assert.match(el('main').innerHTML,/Ben gets ready/);assert.match(el('main').innerHTML,/Maya gets ready/);
  await click('itinerary-new');await submit({title:'Shared first look',track:'Wedding party',start_time:'10:30',end_time:'11:00',day_offset:'0',location:'Courtyard',vendor_id:'',notes:'Bring flowers'});
  listeners.get('change')({target:{id:'f-itinerary-track',value:'Wedding party'}});
  assert.match(el('main').innerHTML,/Shared first look/);assert.ok(!el('main').innerHTML.includes('Maya gets ready'));
  const itineraryId=el('main').innerHTML.match(/data-action="itinerary-edit" data-id="([^"]+)"/)[1];
  await click('itinerary-edit',itineraryId);await submit({title:'Updated first look',track:'Wedding party',start_time:'10:15',end_time:'11:00',day_offset:'0',location:'Courtyard',vendor_id:'',notes:'Bring flowers'});
  assert.match(el('main').innerHTML,/Updated first look/);
  await click('itinerary-delete',itineraryId);await submit({confirm:'DELETE'});assert.ok(!el('main').innerHTML.includes('Updated first look'));assert.match(el('main').innerHTML,/Maya gets ready/);
  await click('tab-menu');assert.match(el('main').innerHTML,/A menu to remember/);assert.match(el('main').innerHTML,/Garden vegetable tart/);
  await click('menu-course-new');await submit({name:'Desserts',sort_order:'3'});
  const dessertId=el('main').innerHTML.match(/<h3>Desserts<\/h3>[\s\S]*?data-action="menu-course-edit" data-id="([^"]+)"/)[1];
  await click('menu-dish-new');await submit({name:'Lemon cakes',course_id:dessertId,vendor_id:'vendor',pricing_basis:'per_quantity',price:'3.25',quantity:'90',unit:'cake',selected:'on',rating:'5',notes:'Lemon zest'});
  assert.match(el('main').innerHTML,/Lemon cakes/);assert.match(el('main').innerHTML,/90 cake planned/);
  await click('menu-meal','sam');el('f-course_id').value='main';el('f-course_id').onchange();
  await submit({course_id:'main',option_id:'fish'});assert.match(el('main').innerHTML,/1 confirmed choices · ★★★★/);
  await click('menu-meal','morgan-guest');el('f-course_id').value='main';el('f-course_id').onchange();
  await submit({course_id:'main',option_id:'tart'});assert.match(el('main').innerHTML,/\$372.50/);
  await click('menu-link');await submit({expense_id:'catering'});
  await click('tab-budget');assert.match(el('main').innerHTML,/\$372.50/);assert.match(el('main').innerHTML,/\$1,000.00/);
  await click('menu-vendor-open','vendor');assert.match(el('main').innerHTML,/value="vendor" selected/);assert.match(el('main').innerHTML,/Lemon cakes/);
  const cakeId=el('main').innerHTML.match(/<h4>Lemon cakes<\/h4>[\s\S]*?data-action="menu-toggle" data-id="([^"]+)"/)[1];
  await click('menu-dish-delete',cakeId);await submit({confirm:'DELETE'});assert.ok(!el('main').innerHTML.includes('Lemon cakes'));assert.match(el('main').innerHTML,/\$80.00/);
  await click('tab-guests');
  const privateQuery='example search from first session';
  listeners.get('input')({target:{id:'f-guest-search',value:privateQuery,selectionStart:privateQuery.length}});
  await click('tab-budget');await click('payment-edit','p1');el('editor').close();
  assert.match(el('fields').innerHTML,/Deposit confirmed/);
  let releaseHistory, releaseSnapshot;
  historyDelay=new Promise(resolve=>{releaseHistory=resolve;});
  snapshotDelay=new Promise(resolve=>{releaseSnapshot=resolve;});
  const historyClick=click('payment-history','p1');
  poll.fn();
  await settle();
  await click('logout');
  assert.equal(el('fields').innerHTML,'');
  assert.equal(el('edit-form').onsubmit,null);
  snapshotDelay=null;
  el('login').values={email:'another@example.invalid',password:'mock-only'};
  await el('login').onsubmit({preventDefault(){},currentTarget:el('login')});await settle();
  assert.match(el('main').innerHTML,/Budget vs. paid/,'sign-in can finish while the prior session is still refreshing');
  releaseHistory();releaseSnapshot();await historyClick;
  assert.equal(el('editor').open,false,'history from the prior session must not open in this one');
  await click('tab-guests');assert.ok(!el('main').innerHTML.includes(privateQuery));
  await click('tab-budget');await click('expense-delete','catering');assert.match(el('fields').innerHTML,/quotes, installments, and payments/);
  await submit({confirm:'DELETE'});assert.ok(!el('main').innerHTML.includes('Deposit confirmed'));
  await click('wedding-access');
  assert.match(el('main').innerHTML,/Your Big Days/);
  assert.doesNotMatch(el('main').innerHTML,/Garden Table Catering/);
  const issue=el('issue-planner-invite');
  issue.values={target:'new',recipient:'founder@example.invalid'};
  for(const name of ['focus','online']){
    windowListeners.get(name)();
    await settle();
    assert.equal(el('issue-planner-invite'),issue,`Invitation draft survives ${name}`);
    assert.match(el('main').innerHTML,/Your Big Days/);
  }
  await issue.onsubmit({preventDefault(){},currentTarget:issue});
  assert.match(el('main').innerHTML,/Share this invitation/);
  const link=el('main').innerHTML.match(/data-action="revoke-planner-invite" data-id="([^"]+)"/)[1];
  await click('revoke-planner-invite',link);
  assert.doesNotMatch(el('main').innerHTML,/founder@example.invalid/);
  await click('open-wedding','10000000-0000-0000-0000-000000000001');
  assert.match(el('main').innerHTML,/Budget vs. paid/);
  assert.doesNotMatch(el('main').innerHTML,/id="aisle-panel"/,'existing weddings opt in');
  await click('aisle-toggle');
  assert.match(el('main').innerHTML,/Set wedding details/);
  await click('aisle-settings');
  assert.match(el('fields').innerHTML,/Wedding budget \(optional\)/);
  await submit({name:'Beya’s big day',currency:'USD',cap:'10000',wedding_date:'2027-06-19',time_zone:'America/New_York',planning_headcount:'90'});
  assert.match(el('main').innerHTML,/Follow up with a vendor/);
  assert.match(el('main').innerHTML,/guests are in your planner/,'the earlier CSV import counts in Aisle');
  await click('aisle-pause');
  assert.match(el('main').innerHTML,/Setup is paused/);
  await click('wedding-access');
  await click('open-wedding','10000000-0000-0000-0000-000000000001');
  assert.doesNotMatch(el('main').innerHTML,/id="aisle-panel"/);
  await click('aisle-toggle');
  assert.match(el('main').innerHTML,/Resume setup/);
  await click('aisle-resume');
  await click('aisle-vendor');
  await submit({name:'Sample florist',next_step:'Ask for a quote',vendor_kind:'vendor',rating:''});
  assert.match(el('main').innerHTML,/You’ve saved a vendor and a next step/);
  await click('aisle-finish');
  assert.match(el('main').innerHTML,/What to do next/);
  await click('tab-vendors');
  assert.match(el('main').innerHTML,/Ask for a quote/);
  let exported;
  globalThis.document.createElement=()=>({click(){exported=this.href;}});
  await click('guests-export');
  assert.match(await (await previous.get('fetch').value(exported)).text(),/Alex Rivera/);
  URL.revokeObjectURL(exported);
  secondWedding={id:'20000000-0000-0000-0000-000000000002',name:'Second wedding'};
  let finishOldRefresh;
  snapshotDelay=new Promise(resolve=>{finishOldRefresh=resolve;});
  poll.fn();await settle();
  await click('wedding-access');
  snapshotDelay=null;
  await click('open-wedding',secondWedding.id);
  finishOldRefresh();await settle();
  assert.equal(document.title,'Second wedding · Our Big Day');
  await click('guests-export');
  const secondCSV=await (await previous.get('fetch').value(exported)).text();
  URL.revokeObjectURL(exported);
  assert.match(secondCSV,/Second-only guest/);
  assert.doesNotMatch(secondCSV,/Alex Rivera/);
  await click('logout');
  assert.equal(document.title,'Our Big Day');
  assert.doesNotMatch(el('main').innerHTML,/Second wedding|Second-only guest/);
});
