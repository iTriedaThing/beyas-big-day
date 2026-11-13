import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Api, takeAuthRedirect} from '../docs/api.js';
const config={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test'};
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const parameters=(overrides={})=>new URLSearchParams({access_token:'test-access',refresh_token:'test-refresh',expires_in:'3600',type:'recovery',...overrides});
const user={id:'test-user',email:'test@example.invalid'};

test('email redirect secrets are removed from the URL before session validation',async()=>{
  let cleaned='';
  const params=takeAuthRedirect({href:`https://app.example/planner/?keep=1#${parameters()}`},{replaceState:(_state,_title,url)=>{cleaned=url;}});
  assert.equal(cleaned,'/planner/?keep=1');
  const api=new Api(config,storage(),async(url,options)=>{
    assert.equal(cleaned,'/planner/?keep=1');
    assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    assert.equal(options.headers.Authorization,'Bearer test-access');
    assert.ok(url.endsWith('/auth/v1/user'));return Response.json(user);
  });
  await api.acceptAuthRedirect(params);
  assert.equal(api.session.user.id,user.id);assert.equal(api.session.recovery,true);
  assert.ok(api.session.expires_at>Date.now()/1000);
});
test('ordinary budget anchors remain intact',()=>{
  assert.equal(takeAuthRedirect({href:'https://app.example/planner/#expenses'},{replaceState:()=>assert.fail('must preserve anchor')}),null);
});
test('expired links and unsupported code callbacks show a safe actionable error',async()=>{
  const api=new Api(config,storage(),async()=>assert.fail('must not make a request'));
  for(const hash of ['error=access_denied&error_description=do-not-reflect-me','access_token=partial','type=recovery','code=unsupported']){
    let clean='';
    const href=hash.startsWith('code=')?`https://app.example/?${hash}`:`https://app.example/#${hash}`;
    const params=takeAuthRedirect({href},{replaceState:(_s,_t,url)=>{clean=url;}});
    await assert.rejects(api.acceptAuthRedirect(params),/Request a new password reset email/);
    assert.equal(clean,'/');assert.equal(api.session,null);
  }
});
test('an invalid token cannot replace an existing session',async()=>{
  const api=new Api(config,storage(),async()=>Response.json({message:'invalid token'},{status:401}));
  const prior={user:{id:'prior-user'},access_token:'prior-access',refresh_token:'prior-refresh',expires_at:9999999999};api.setSession(prior);
  await assert.rejects(api.acceptAuthRedirect(parameters()),/Request a new password reset email/);
  assert.equal(api.session.user.id,prior.user.id);
});
test('confirmation callbacks validate and restore a normal session',async()=>{
  const api=new Api(config,storage(),async()=>Response.json(user));
  await api.acceptAuthRedirect(parameters({type:'signup'}));assert.equal(api.session.recovery,false);
});
test('recovery mode survives reload and token refresh',async()=>{
  const saved=storage();
  const api=new Api(config,saved,async()=>Response.json(user));await api.acceptAuthRedirect(parameters());
  const restored=new Api(config,saved,async()=>Response.json({user,access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}));
  assert.equal(restored.session.recovery,true);await restored.refresh();assert.equal(restored.session.recovery,true);
});
test('password change uses the verified recovery bearer and never persists the password',async()=>{
  const saved=storage(),calls=[];
  const api=new Api(config,saved,async(url,options)=>{calls.push({url,options});return Response.json(user);});
  await api.acceptAuthRedirect(parameters());await api.updatePassword('new-test-password');
  const update=calls[1];assert.equal(update.options.method,'PUT');
  assert.equal(update.options.headers.Authorization,'Bearer test-access');
  assert.deepEqual(JSON.parse(update.options.body),{password:'new-test-password'});
  assert.equal(api.session.recovery,false);assert.equal(api.pending,null);
  assert.ok(!JSON.stringify(api.session).includes('new-test-password'));
});
test('failed password update retains recovery mode for retry',async()=>{
  const api=new Api(config,storage(),async(_url,options)=>options.method==='PUT'?Response.json({message:'Password is too weak'},{status:422}):Response.json(user));
  await api.acceptAuthRedirect(parameters());
  await assert.rejects(api.updatePassword('weak'),/too weak/);assert.equal(api.session.recovery,true);
});
test('password update completing after sign-out cannot recreate a session',async()=>{
  let finish;
  const api=new Api(config,storage(),async(_url,options)=>options.method==='PUT'?new Promise(resolve=>{finish=resolve;}):Response.json(user));
  await api.acceptAuthRedirect(parameters());
  const updating=api.updatePassword('new-test-password');
  api.setSession(null);finish(Response.json(user));await updating;
  assert.equal(api.session,null);
});
test('password update requires a session; reset requests include only email and same-page return URL',async()=>{
  const calls=[];const api=new Api(config,storage(),async(url,options)=>{calls.push({url,options});return Response.json({});});
  await assert.rejects(api.updatePassword('new-test-password'),/Open a fresh password reset link/);
  await api.requestPasswordReset('test@example.invalid','https://app.example/planner/');
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].url).searchParams.get('redirect_to'),'https://app.example/planner/');
  assert.deepEqual(JSON.parse(calls[0].options.body),{email:'test@example.invalid'});
  assert.equal(calls[0].options.headers.Authorization,undefined);
});
