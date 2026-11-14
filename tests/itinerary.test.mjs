import test from 'node:test';
import assert from 'node:assert/strict';
import {timeMinutes,itineraryRecord,itineraryRows,itineraryTracks,itineraryDate,endDayOffset,renderItinerary} from '../docs/itinerary.js';
const fields={title:'Ceremony',track:'Together',start_time:'11:00',end_time:'11:30',day_offset:'0',location:'Garden',notes:'Bring rings',vendor_id:''};
const data={itinerary_ready:true,wedding:{name:'Our wedding',wedding_date:'2027-06-19',time_zone:'America/New_York'},members:[{display_name:'Ben'},{display_name:'Maya'}],vendors:[],itinerary_items:[
  {id:'maya',title:'Maya gets ready',track:'Maya',start_time:'09:00:00',day_offset:0,location:'Bridal suite'},
  {id:'ben',title:'Ben gets ready',track:'Ben',start_time:'09:00:00',day_offset:0,location:'Garden room'},
  {id:'ceremony',...fields,day_offset:0},
  {id:'late',title:'Afterparty',track:'Together',start_time:'00:30',day_offset:1,location:'Lounge'},
  {id:'deleted',title:'Removed',track:'Old',start_time:'08:00',day_offset:0,deleted:true}
]};
test('itinerary validates required fields and minute times without changing local time',()=>{
  assert.equal(timeMinutes('00:00'),0);assert.equal(timeMinutes('23:59:00'),1439);
  assert.deepEqual(itineraryRecord({...fields,title:' Ceremony ',track:' Together '}),{...fields,title:'Ceremony',track:'Together',day_offset:0,vendor_id:null});
  for(const change of [{title:' '},{track:' '},{start_time:''},{start_time:'24:00'},{start_time:'09:60'},{start_time:'09:00:01'},{end_time:'11:00'},{day_offset:'2'},{location:'x'.repeat(501)},{notes:'x'.repeat(4001)}])assert.throws(()=>itineraryRecord({...fields,...change}));
});
test('combined itinerary allows parallel preparations, sorts next-day items last, and filters tracks',()=>{
  assert.deepEqual(itineraryRows(data).map(i=>i.id),['ben','maya','ceremony','late']);
  assert.deepEqual(itineraryRows(data,'Maya').map(i=>i.id),['maya']);
  assert.deepEqual(itineraryTracks(data),['Ben','Maya','Together']);
  assert.equal(itineraryRows(data).filter(i=>i.id==='ceremony').length,1);
});
test('itinerary dates follow the wedding across month/year/leap boundaries and preserve local times',()=>{
  assert.equal(itineraryDate('2028-02-28',1),'2028-02-29');assert.equal(itineraryDate('2027-12-31',1),'2028-01-01');assert.equal(itineraryDate(null,1),null);
  assert.equal(endDayOffset({day_offset:0,start_time:'23:00',end_time:'01:00'}),1);
  assert.equal(endDayOffset({day_offset:1,start_time:'23:00',end_time:'01:00'}),2);
  assert.equal(endDayOffset({day_offset:0,start_time:'09:00',end_time:null}),0);
  const changed={...data,wedding:{...data.wedding,wedding_date:'2027-08-20'}};
  assert.equal(itineraryRows(changed)[0].start_time,'09:00:00');assert.match(renderItinerary(changed),/Aug 21, 2027/);
});
test('itinerary renders combined rooms, one shared ceremony, printable details, and escaped user text',()=>{
  const html=renderItinerary(data);assert.match(html,/Bridal suite/);assert.match(html,/Garden room/);assert.equal((html.match(/<h4>Ceremony<\/h4>/g)||[]).length,1);
  assert.match(html,/itinerary-print-meta/);assert.match(html,/America\/New_York/);assert.match(html,/Following|following/);
  const unsafe={...data,itinerary_items:[{...data.itinerary_items[0],title:'<script>x</script>',track:'<b>Maya</b>',location:'<img src=x>',notes:'<svg onload=x>'}]};
  const rendered=renderItinerary(unsafe);assert.ok(!rendered.includes('<script>'));assert.match(rendered,/&lt;svg onload=x&gt;/);assert.match(rendered,/&lt;b&gt;Maya/);
  assert.ok(!renderItinerary(data,'Ben').includes('Bridal suite'));
});
test('undecided wedding dates, empty itineraries and pending migration have clear states',()=>{
  assert.match(renderItinerary({...data,wedding:{...data.wedding,wedding_date:null}}),/Date to be decided/);
  assert.match(renderItinerary({...data,itinerary_items:[]}),/Give your day a little shape/);
  const pending=renderItinerary({...data,itinerary_ready:false});assert.match(pending,/being prepared/);assert.ok(!pending.includes('data-action="itinerary-new"'));
});
