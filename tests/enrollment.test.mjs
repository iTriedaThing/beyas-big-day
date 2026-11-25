import test from 'node:test';
import assert from 'node:assert/strict';
import {Api,subscribe} from '../docs/api.js';
import {chooseWedding,invitationId,invitationURL,loadPlannerAccess,renderAccess} from '../docs/enrollment.js';

const id='160da7f3-cdc5-4869-9401-4bf647eb85a7';
const base='https://example.invalid/planner/';
const single={enabled:true,weddings:[{id:'first',name:'Our <Wedding>'}],incoming:[],outgoing:[]};

test('shared invitation URL retains the app path and removes previous auth parameters',()=>{
  const created=invitationURL(base+'?code=private#access_token=private',id);
  assert.equal(created,base+'?invitation='+id);
  assert.equal(invitationId(created),id);
  assert.equal(invitationId(base+'?invitation=oops'),null);
});

test('verified recipients can continue on another device and explicitly select a membership',()=>{
  assert.equal(chooseWedding(single),'first');
  const pending={...single,incoming:[{id,wedding:null}]};
  assert.equal(chooseWedding(pending),null);
  assert.match(renderAccess(pending,{origin:base}),/Create your private wedding/);
  const multiple={...single,weddings:[...single.weddings,{id:'second',name:'Two'}]};
  assert.equal(chooseWedding(multiple),null);
  assert.equal(chooseWedding(multiple,{wedding:'second'}),'second');
  assert.equal(chooseWedding(multiple,{wedding:'outsider'}),null);
  assert.equal(chooseWedding(single,{linkId:id}),null);
  assert.equal(chooseWedding({...single,accepted_wedding:'first'},{linkId:id}),'first');
  assert.equal(chooseWedding({...single,accepted_wedding:'another'},{linkId:id}),null);
});

test('invitation screen escapes wedding names, distinguishes joining from founding, and scopes controls',()=>{
  const incoming={...single,incoming:[{id,wedding:'<script>wedding</script>'}]};
  const html=renderAccess(incoming,{origin:base,linkId:id});
  assert.match(html,/Join &lt;script&gt;wedding/);
  assert.doesNotMatch(html,/<script>|f-wedding_name|New beta wedding/);
  assert.match(html,/Our &lt;Wedding&gt;/);
  const operator=renderAccess({...single,operator:true},{origin:base});
  assert.match(operator,/New beta wedding/);
  const outsider=renderAccess({...single,weddings:[]},{origin:base,linkId:id});
  assert.match(outsider,/unavailable for this account/);
  assert.doesNotMatch(outsider,/issue-planner-invite|accept-planner-invite/);
});

test('only a missing enrollment RPC falls back to legacy membership discovery',async()=>{
  const calls=[];
  const api={request:async path=>{
    calls.push(path);
    if(path==='rpc/planner_access')throw Object.assign(new Error('Missing function'),{code:'PGRST202'});
    return single.weddings;
  }};
  const result=await loadPlannerAccess(api,null);
  assert.equal(result.enabled,false);
  assert.equal(chooseWedding(result),'first');
  assert.deepEqual(calls,['rpc/planner_access','weddings?select=id,name']);
  await assert.rejects(loadPlannerAccess({request:async()=>{throw new Error('Access denied');}},id),/Access denied/);
});

test('invited signup passes the link to Auth and waits for verification',async()=>{
  let request;
  const api=new Api({supabaseUrl:'https://fixture.supabase.co',publishableKey:'fixture'},{getItem:()=>null},async(url,options)=>{
    request={url:new URL(url),body:JSON.parse(options.body)};
    return Response.json({user:{id:'unconfirmed'}});
  });
  await api.registerInvited('member@example.invalid','synthetic-password',id,base);
  assert.equal(request.url.pathname,'/auth/v1/signup');
  assert.equal(request.url.searchParams.get('redirect_to'),base);
  assert.deepEqual(request.body.data,{planner_invitation:id});
  assert.equal(api.session,null);
});

test('switching weddings replaces every live filter and discards late events from the previous wedding',t=>{
  const sockets=[];
  const original=globalThis.WebSocket;
  t.after(()=>{globalThis.WebSocket=original;});
  globalThis.WebSocket=class {
    static OPEN=1;
    readyState=1;
    constructor(){sockets.push(this);}
    send(payload){this.last=JSON.parse(payload);}
    close(){this.onclose?.();}
  };
  const api={url:'https://fixture.supabase.co',key:'fixture',session:{access_token:'synthetic'}};
  const changes=[];
  for(const wedding of ['first','second']){
    const stop=subscribe(api,wedding,()=>changes.push(wedding),()=>{},true,true,true,true,true);
    t.after(stop);
    const socket=sockets.at(-1);
    socket.onopen();
    const filters=socket.last.payload.config.postgres_changes;
    assert.ok(filters.some(f=>f.table==='seating_changes'));
    assert.ok(filters.every(f=>f.filter===(f.table==='weddings'?'id':'wedding_id')+'=eq.'+wedding));
    const message={data:JSON.stringify({event:'postgres_changes'})};
    socket.onmessage(message);
    stop();
    socket.onmessage(message);
    socket.onopen();
  }
  assert.deepEqual(changes,['first','second']);
});
