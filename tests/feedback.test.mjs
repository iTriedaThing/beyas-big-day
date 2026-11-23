import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webURL,websiteLink,pinterestBoard,timeZones,countdown,scheduleEntries,upcomingVendorTours,renderSchedule,renderMoodboard,validatePhoto} from '../docs/features.js';

test('vendor links reject executable protocols and escape labels',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','https://user:password@example.com','not a url'])assert.equal(webURL(url),'');
  assert.match(websiteLink('https://example.com/?a=1&b=2','<Venue>'),/href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(websiteLink('https://example.com','<Venue>'),/&lt;Venue&gt;/);
});
test('Pinterest accepts only full HTTPS board URLs and normalizes away tracking',()=>{
  assert.equal(pinterestBoard('https://pinterest.com/ben/our-day/?utm_source=x'),'https://www.pinterest.com/ben/our-day/');
  assert.equal(pinterestBoard(''),'');
  for(const url of ['http://pinterest.com/u/b/','https://pinterest.com.evil.test/u/b/','https://www.pinterest.com/pin/123/','https://pin.it/abc','https://www.pinterest.com/u/','https://user@pinterest.com/u/b/'])assert.throws(()=>pinterestBoard(url));
});
test('timezone dropdown retains saved aliases and UTC',()=>{
  const zones=timeZones('US/Eastern').map(([id])=>id);assert.ok(zones.includes('US/Eastern'));assert.ok(zones.includes('UTC'));assert.ok(zones.includes('America/New_York'));
});
test('top countdown covers undecided, today, future, and married states',()=>{
  assert.match(countdown(null,'2026-11-14'),/Date to come/);
  assert.match(countdown('2026-11-14','2026-11-14'),/Today is our day/);
  assert.match(countdown('2026-11-15','2026-11-14'),/1 day to go/);
  assert.match(countdown('2026-11-13','2026-11-14'),/1 day married/);
});
const data={feedback_ready:true,wedding:{wedding_date:'2027-06-19',time_zone:'America/New_York',currency:'USD'},vendors:[],expenses:[{id:'expense',title:'Venue'}],payments:[{installment_id:'settled',kind:'payment',amount_cents:100}],
  events:[{id:'visit',title:'<Tour>',kind:'Tour',event_date:'2026-11-16',start_time:'10:00:00'},{id:'early',title:'Tasting',kind:'Tasting',event_date:'2026-11-16',start_time:'09:00:00'}],
  tasks:[{id:'fixed',title:'Call',planning_window:'last_week',due_date:'2026-11-15'},{id:'done',completed:true,title:'Done',due_date:'2026-11-14'},{id:'archived',archived:true,title:'Gone',due_date:'2026-11-14'}],
  installments:[{id:'open',expense_id:'expense',label:'Deposit',due_date:'2026-11-17',amount_cents:200},{id:'settled',expense_id:'expense',label:'Paid',due_date:'2026-11-14',amount_cents:100}]};
test('agenda merges dated tasks, events, and only outstanding installments once, in order',()=>{
  assert.deepEqual(scheduleEntries(data).map(e=>e.id),['fixed','early','visit','open']);
  assert.equal(scheduleEntries(data)[3].remaining,200);
  const html=renderSchedule(data,'2026-11-16');assert.ok(!html.includes('>Call<'));assert.match(html,/&lt;Tour&gt;/);assert.match(html,/America\/New_York/);
});
test('mood board uses an isolated preview and retains an accessible fallback',()=>{
  const html=renderMoodboard({wedding:{pinterest_board_url:'https://www.pinterest.com/u/b/'}});
  assert.match(html,/<iframe/);assert.ok(!html.includes('allow-same-origin'));assert.match(html,/Open board on Pinterest/);
});
test('vendor cards include only linked upcoming tours in agenda order, including all-day tours today',()=>{
  const tour={kind:'Tour',title:'Visit',vendor_id:'venue',event_date:'2026-11-23'};
  const events=[
    {...tour,id:'tomorrow',event_date:'2026-11-24'}, {...tour,id:'afternoon',start_time:'15:00:00'},
    {...tour,id:'all-day',start_time:null}, {...tour,id:'morning',start_time:'09:30:00'},
    {...tour,kind:'Tasting'}, {...tour,vendor_id:null}, {...tour,completed:true},
    {...tour,deleted:true}, {...tour,event_date:'2026-11-22'}
  ];
  assert.deepEqual(upcomingVendorTours(events,'2026-11-23').map(e=>[e.id,e.time]),
    [['all-day',''],['morning','09:30'],['afternoon','15:00'],['tomorrow','']]);
});
test('Pinterest bootstrap and JSONP scripts are allowed only inside the isolated preview',()=>{
  const policy=file=>readFileSync(new URL(file,import.meta.url),'utf8').match(/content="(default-src[^"\n]+)"/)[1];
  const frame=policy('../docs/pinterest.html').split(';').find(rule=>rule.trim().startsWith('script-src')).trim().split(/\s+/).slice(1);
  // The widget loads pinit_main.js and then requests board data through a JSONP script.
  assert.deepEqual(frame,["'self'",'https://assets.pinterest.com','https://widgets.pinterest.com']);
  const main=policy('../docs/index.html').split(';').find(rule=>rule.trim().startsWith('script-src')).trim();
  assert.equal(main,"script-src 'self'");
});
test('photo validation rejects empty, oversized, and active content files',()=>{
  assert.equal(validatePhoto({size:5*1024*1024,type:'image/jpeg'}),'jpg');
  for(const file of [{size:1,type:'image/svg+xml'},{size:0,type:'image/png'},{size:5242881,type:'image/webp'}])assert.throws(()=>validatePhoto(file));
});
