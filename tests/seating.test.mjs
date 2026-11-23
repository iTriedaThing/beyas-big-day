import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSeating,seatingPlan} from '../docs/seating.js';
import {seatingForm} from '../docs/seating-editor.js';

const data={
  seating_ready:true, seating_revisions:{reception:4},
  invitations:[{id:'h',household_name:'Family'},{id:'old',archived:true}],
  guests:[{id:'a',invitation_id:'h',name:'<Alex>',rsvp:'yes'},{id:'b',invitation_id:'h',name:null,rsvp:'pending'},
    {id:'c',invitation_id:'h',rsvp:'no'},{id:'d',invitation_id:'old',rsvp:'yes'}],
  seating_units:[{id:'t',event:'reception',position:1,label:'Head & family',capacity:4,shape:'rectangle'},
    {id:'r',event:'ceremony',position:1,label:'Family',capacity:8,shape:'row',reserved:true}],
  seating_placements:[{guest_id:'a',unit_id:'t',event:'reception',seat:2}]
};
test('each event has independent assignments and includes active pending companions',()=>{
  const reception=seatingPlan(data,'reception');
  assert.deepEqual(reception.guests.map(g=>g.id),['a','b']);
  assert.equal(reception.byUnit.get('t')[0].seat,2);
  assert.equal(seatingPlan(data,'ceremony').byGuest.size,0);
  assert.match(renderSeating(data,'reception',''),/1 assigned · 3 open seats · 1 unassigned/);
  assert.match(renderSeating(data,'ceremony',''),/Altar/);
  assert.match(renderSeating(data,'ceremony',''),/Reserved · 0 \/ 8/);
});
test('detail and list navigation use escaped names and numbered seats',()=>{
  const detail=renderSeating(data,'reception','t');
  assert.match(detail,/Head &amp; family/);
  assert.match(detail,/&lt;Alex&gt;/);
  assert.match(detail,/Seat 2/);
  assert.match(detail,/class="chair assigned"/);
  assert.match(renderSeating(data,'reception','removed'),/Go to a table/);
  assert.match(renderSeating({},'reception',''),/database update/);
});
test('edits capture the original revision and deletion requires the displayed label',()=>{
  let submit, saved;
  const state=structuredClone(data);
  const ctx={event:'reception',data:state,openForm:(_,fields,cb)=>{submit=cb;},save:(...args)=>{saved=args;}};
  seatingForm('delete','t',ctx);
  state.seating_revisions.reception=5;
  assert.throws(()=>submit({confirm:'wrong'}),/name exactly/);
  submit({confirm:'Head & family'});
  assert.deepEqual(saved,['reception',4,{action:'delete',unit_id:'t'}]);
});
test('large capacities keep the diagram bounded and retain exact assignment numbers',()=>{
  const state=structuredClone(data);
  state.seating_units[0].capacity=100000;
  state.seating_placements[0].seat=99999;
  const detail=renderSeating(state,'reception','t');
  assert.match(detail,/Seat 99999/);
  assert.match(detail,/99999 open/);
  assert.ok(detail.length<5000);
});
