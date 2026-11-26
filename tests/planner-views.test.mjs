import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderGuests,renderPlanning} from '../docs/planner-views.js';
test('guest rendering escapes household, contact and guest content',()=>{
  const markup=renderGuests({planner_ready:true,wedding:{},members:[],invitations:[{id:'h',household_name:'<script>unsafe</script>',contact_email:'',phone:'',mailing_address:'',notes:'',archived:false}],guests:[{id:'g',invitation_id:'h',name:'<img src=x>',rsvp:'yes',tag:'<b>test</b>',dietary_flags:[]}]},{search:'',rsvp:'',tag:'',view:'active'});
  assert.ok(!markup.includes('<script>'));assert.ok(!markup.includes('<img src=x>'));assert.ok(markup.includes('&lt;img src=x&gt;'));
  assert.ok(markup.includes('1 attending, 0 pending, 0 declined'));
});
test('each household guest renders their name, actions, tags and RSVP controls in that order',()=>{
  const markup=renderGuests({
    planner_ready:true,feedback_ready:true,seating_ready:true,menu_ready:true,wedding:{},members:[],seating_units:[],
    invitations:[{id:'h',household_name:'Household',contact_email:'',phone:''}],
    guests:[
      {id:'g1',invitation_id:'h',name:'Alex Taylor',rsvp:'yes',tag:'Family'},
      {id:'g2',invitation_id:'h',name:'Sam Taylor',rsvp:'pending',tag:'Friends'},
    ],
  },{search:'',rsvp:'',tag:'',view:'active'});
  const rows=markup.split('class="guest-row ').slice(1);
  assert.equal(rows.length,2);
  for(const [index,name] of ['Alex Taylor','Sam Taylor'].entries()){
    const row=rows[index];
    assert.deepEqual([...row.matchAll(/class="(guest-person|actions guest-actions|guest-tags|rsvp-controls)"/g)].map(match=>match[1]),
      ['guest-person','actions guest-actions','guest-tags','rsvp-controls']);
    assert.ok(row.includes(`<strong title="${name}">${name}</strong>`));
    assert.ok(row.includes(`aria-label="${name} RSVP"`));
    assert.ok(row.includes('data-action="guest-seating"'));
  }
  assert.ok(rows[0].includes('data-action="menu-meal"'));
  assert.ok(!rows[1].includes('data-action="menu-meal"'));
});
test('task rendering escapes notes and titles',()=>{
  const markup=renderPlanning({planner_ready:true,wedding:{wedding_date:null},members:[],tasks:[{id:'t',title:'<script>unsafe</script>',notes:'<b>note</b>',planning_window:'12_plus',completed:false}]},'all','2026-11-13');
  assert.ok(!markup.includes('<script>'));assert.ok(markup.includes('&lt;b&gt;note&lt;/b&gt;'));
});
test('new planner screens stay usable while the additive migration is pending',()=>{
  assert.ok(renderGuests({planner_ready:false},{}).includes('Your budget is ready to use'));
  assert.ok(renderPlanning({planner_ready:false},'all','2026-11-13').includes('Your budget is ready to use'));
});
