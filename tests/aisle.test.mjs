import assert from 'node:assert/strict';
import test from 'node:test';
import {aisleReady,aisleStartsOpen,firstActions,renderAisle} from '../docs/aisle.js';

const planner = {
  wedding:{aisle_step:'first_action',aisle_paused:false},
  vendors:[],events:[],invitations:[],guests:[],tasks:[],expenses:[],guest_import_ready:true
};

test('established weddings opt in and paused or completed setup stays closed on load',()=>{
  assert.equal(aisleReady({}),false);
  assert.equal(aisleStartsOpen({aisle_step:null}),false);
  assert.equal(aisleStartsOpen({aisle_step:'settings',aisle_paused:false}),true);
  assert.equal(aisleStartsOpen({...planner.wedding,aisle_paused:true}),false);
  assert.equal(aisleStartsOpen({...planner.wedding,aisle_step:'complete'}),false);
  assert.match(renderAisle({...planner,wedding:{aisle_step:'settings',aisle_paused:true}}),/Resume setup/);
});

test('vendor follow-ups and active guests saved elsewhere count in Aisle',()=>{
  const vendors=[{id:'venue',name:'Garden <Venue>'}];
  assert.equal(firstActions({...planner,vendors}).followedUp,false);
  assert.match(renderAisle({...planner,vendors}),/Garden &lt;Venue&gt;/);
  assert.match(renderAisle({...planner,vendors}),/Import guest CSV/);
  const events=[{vendor_id:'venue',completed:false}];
  const invitations=[{id:'home'},{id:'archived',archived:true}];
  const guests=[{invitation_id:'home'},{invitation_id:'archived'}];
  const updated={...planner,vendors,events,invitations,guests};
  assert.equal(firstActions(updated).followedUp,true);
  assert.equal(firstActions(updated).guests,1);
  assert.equal(firstActions({...planner,vendors:[{...vendors[0],next_step:'Ask for a quote'}]}).followedUp,true);
  assert.match(renderAisle(updated),/1 guest is in your planner/);
  assert.match(renderAisle({...updated,wedding:{aisle_step:'complete'}}),/Add an expense/);
});
