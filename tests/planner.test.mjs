import {test} from 'node:test';
import assert from 'node:assert/strict';
import {daysUntil,taskDueDate,taskSummary,guestSummary,householdGuests} from '../docs/planner.js';
test('each invited person, including an unnamed companion, is counted once',()=>{
  const guests=[{invitation_id:'h',rsvp:'yes'},{invitation_id:'h',rsvp:'yes',is_companion:true,name:null},{invitation_id:'h',rsvp:'pending'}];
  const summary=guestSummary([{id:'h',save_the_date_sent_on:'2026-11-01'}],guests);
  assert.equal(summary.invited,3);assert.equal(summary.yes,2);assert.equal(summary.no,0);assert.equal(summary.pending,1);
  assert.equal(summary.households,1);assert.equal(summary.saveDatesSent,1);assert.equal(summary.invitationsSent,0);
});
test('dietary restrictions count an attendee once overall and once per distinct flag',()=>{
  const guests=[{invitation_id:'h',rsvp:'yes',dietary_flags:['vegan','nut_allergy','vegan']},
    {invitation_id:'h',rsvp:'no',dietary_flags:['vegan']},{invitation_id:'h',rsvp:'pending',dietary_flags:['vegan']}];
  const s=guestSummary([{id:'h'}],guests);assert.equal(s.dietaryGuests,1);
  assert.equal(s.dietary.find(d=>d.id==='vegan').count,1);assert.equal(s.dietary.find(d=>d.id==='nut_allergy').count,1);
});
test('archived people and households are excluded from RSVP and mailing counts',()=>{
  const s=guestSummary([{id:'active'},{id:'archived',archived:true,invitation_sent_on:'2026-11-01'}],
    [{invitation_id:'active',rsvp:'yes'},{invitation_id:'active',rsvp:'yes',archived:true},{invitation_id:'archived',rsvp:'yes'}]);
  assert.equal(s.invited,1);assert.equal(s.households,1);assert.equal(s.invitationsSent,0);
});
test('countdown uses calendar dates independent of daylight saving or time of day',()=>{
  assert.equal(daysUntil('2027-03-15','2027-03-13'),2);assert.equal(daysUntil(null,'2027-03-13'),null);
  assert.equal(daysUntil('2027-03-13','2027-03-13'),0);assert.equal(daysUntil('2027-03-12','2027-03-13'),-1);
  assert.throws(()=>daysUntil('2027-02-30','2027-01-01'));
});
test('relative task dates clamp calendar months while fixed deadlines stay fixed',()=>{
  assert.equal(taskDueDate({planning_window:'1_2'},'2027-03-31'),'2027-02-28');
  assert.equal(taskDueDate({planning_window:'12_plus'},'2028-02-29'),'2027-02-28');
  assert.equal(taskDueDate({planning_window:'day_before'},'2027-03-01'),'2027-02-28');
  const fixed={planning_window:'day_before',due_date:'2027-01-10'};
  assert.equal(taskDueDate(fixed,'2027-06-01'),'2027-01-10');assert.equal(taskDueDate(fixed,null),'2027-01-10');
  assert.equal(taskDueDate({planning_window:'last_week'},null),null);
});
test('task progress excludes archived tasks and upcoming excludes completed work',()=>{
  const tasks=[{title:'Done',planning_window:'last_week',completed:true},
    {title:'Overdue',planning_window:'last_week',due_date:'2027-01-01'},
    {title:'Future',planning_window:'day_before'},
    {title:'Archived',planning_window:'last_week',archived:true}];
  const s=taskSummary(tasks,'2027-06-01','2027-02-01');
  assert.equal(s.total,3);assert.equal(s.done,1);assert.equal(s.percent,33);assert.equal(s.overdue,1);
  assert.deepEqual(s.upcoming.map(t=>t.title),['Overdue','Future']);assert.equal(s.windows.find(w=>w.id==='last_week').done,1);
});
test('household entry builds individual seats and validates limits before saving',()=>{
  const guests=householdGuests(' Alex \nSam\n',1);assert.equal(guests.length,3);
  assert.deepEqual(guests[2],{name:null,is_companion:true});assert.equal(guests[0].name,'Alex');
  assert.throws(()=>householdGuests('',0));assert.throws(()=>householdGuests('Alex',1.5));assert.throws(()=>householdGuests('A'.repeat(121),0));
});
