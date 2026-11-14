// App wiring test with an in-memory DOM adapter and mock HTTP. Not a browser/layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {installMock} from './fixture.js';
import {config} from '../docs/config.js';

test('feedback flows render and save through the app; Forecast survives polling and tab changes',async t=>{
  const names=['document','window','sessionStorage','fetch','WebSocket','FormData','setInterval','clearInterval','setTimeout','clearTimeout'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const elements=new Map(),listeners=new Map(),intervals=[];
  class Element {
    constructor(id){this.id=id;this.textContent='';this.open=false;this.isConnected=true;this.disabled=false;this.value='';}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element(match[1]));}
    get innerHTML(){return this.html||'';}
    replaceChildren(){this.innerHTML='';}
    querySelector(){return new Element('button');}
    showModal(){this.open=true;}close(){this.open=false;}reset(){}scrollIntoView(){}addEventListener(){}
  }
  const el=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const storage=new Map();
  Object.assign(globalThis,{
    document:{hidden:false,querySelector:s=>s.startsWith('#')?el(s.slice(1)):null,addEventListener:(name,handler)=>listeners.set(name,handler)},
    window:{location:new URL('http://localhost/'),history:{replaceState(){}},addEventListener(){}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    FormData:class extends Map{constructor(form){super(Object.entries(form.values||{}));}},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},setTimeout:()=>1,clearTimeout(){},
    fetch:async()=>{throw new Error('Unexpected real network request in app fixture');}
  });
  installMock();const mockFetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>mockFetch(String(url).replace(config.supabaseUrl,'https://fixture.supabase.co'),options);
  const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
  await import('../docs/app.js');await settle();
  assert.match(el('main').innerHTML,/Sign in/);
  el('login').values={email:'example@example.invalid',password:'mock-only'};
  await el('login').onsubmit({preventDefault(){},currentTarget:el('login')});await settle();
  const click=async(action,id='')=>{const target={dataset:{action,id},disabled:false};await listeners.get('click')({preventDefault(){},target:{closest:()=>target}});await settle();};
  const submit=async values=>{el('edit-form').values=values;await el('edit-form').onsubmit({preventDefault(){},currentTarget:el('edit-form')});await settle();assert.equal(el('form-error').textContent,'');};
  assert.match(el('main').innerHTML,/class="intro-note"[\s\S]*class="intro-countdown"/);
  assert.match(el('main').innerHTML,/class="forecast-link"/);
  listeners.get('change')({target:{id:'comparison',value:'forecast'}});
  const poll=intervals.find(i=>i.ms===20000);poll.fn();await settle();
  assert.match(el('main').innerHTML,/<option value="forecast" selected>/);
  await click('tab-vendors');assert.match(el('main').innerHTML,/<a href="https:\/\/example.invalid\//);
  await click('tab-budget');assert.match(el('main').innerHTML,/<option value="forecast" selected>/);
  await click('settings');assert.match(el('fields').innerHTML,/<select id="f-time_zone"/);el('editor').close();
  await click('expense-edit','catering');assert.match(el('fields').innerHTML,/Budgeted amount/);el('editor').close();
  await click('payment-edit','p1');assert.match(el('fields').innerHTML,/value="900.00"/);
  await submit({expense_id:'catering',kind:'payment',amount:'1000',paid_on:'2026-11-14',payer_id:'00000000-0000-0000-0000-000000000002',installment_id:'deposit',notes:'Corrected deposit'});
  assert.match(el('main').innerHTML,/\$1,000.00/);assert.match(el('main').innerHTML,/\$2,600.00/);
  await click('payment-history','p1');assert.match(el('fields').innerHTML,/\$900.00[\s\S]*\$1,000.00/);el('editor').close();
  await click('unbook','catering');await submit({reason:'Considering another vendor'});
  assert.match(el('main').innerHTML,/\$4,000.00/);assert.match(el('main').innerHTML,/Planning/);assert.match(el('main').innerHTML,/Schedule paused while unbooked/);
  await click('tab-guests');await click('household-new');
  await submit({household_name:'Sample household',guest_names:'Taylor',unnamed_count:'0',invited_by:'00000000-0000-0000-0000-000000000002',contact_email:'',phone:'',mailing_address:'',notes:'',save_the_date_sent_on:'',invitation_sent_on:''});
  assert.match(el('main').innerHTML,/From Ben/);
  await click('tab-schedule');assert.match(el('main').innerHTML,/Garden venue tour/);
  await click('event-new');await submit({title:'Cake tasting',kind:'Tasting',event_date:'2027-01-05',start_time:'14:30',location:'Sample bakery',vendor_id:'vendor',notes:'Bring questions'});
  assert.match(el('main').innerHTML,/Cake tasting/);assert.match(el('main').innerHTML,/14:30/);
  await click('tab-moodboard');await click('moodboard-edit');await submit({url:'https://www.pinterest.com/example/wedding/'});
  assert.match(el('main').innerHTML,/<iframe class="moodboard-frame"/);
  await click('tab-budget');await click('expense-delete','catering');assert.match(el('fields').innerHTML,/quotes, installments, and payments/);
  await submit({confirm:'DELETE'});assert.ok(!el('main').innerHTML.includes('Corrected deposit'));
});
