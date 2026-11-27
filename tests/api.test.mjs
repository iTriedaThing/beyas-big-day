import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Api} from '../docs/api.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k) ?? null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const session={user:{id:'partner-a'},access_token:'test-token',refresh_token:'test-refresh',expires_at:9999999999};
const config={supabaseUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test'};

test('private photo uploads send the binary file and downloads use authenticated Storage',async()=>{
  const requests=[],file=new Blob(['sample-bytes'],{type:'image/png'});
  const api=new Api(config,storage(),async(url,options)=>{requests.push({url,options});return options.method==='POST'?Response.json({Key:'photo'}):new Response(file);});
  api.setSession(session);
  await api.photo('wedding/vendor/picture.png',{file});
  const blob=await api.photo('wedding/vendor/picture.png');
  assert.equal(requests[0].options.body,file);assert.equal(requests[0].options.headers['Content-Type'],'image/png');
  assert.equal(requests[1].url,'https://example.supabase.co/storage/v1/object/authenticated/vendor-photos/wedding/vendor/picture.png');
  assert.equal(requests[1].options.headers.Authorization,'Bearer test-token');assert.equal(await blob.text(),'sample-bytes');
});
test('purged pictures are removed by exact path using authenticated Storage',async()=>{
  let request;
  const api=new Api(config,storage(),async(url,options)=>{request={url,options};return Response.json([]);});
  api.setSession(session);
  await api.removeArchiveFile('menu-photos','w/d/photo.jpg');
  assert.equal(request.url,'https://example.supabase.co/storage/v1/object/menu-photos');
  assert.equal(request.options.method,'DELETE');
  assert.equal(request.options.headers.Authorization,'Bearer test-token');
  assert.deepEqual(JSON.parse(request.options.body),{prefixes:['w/d/photo.jpg']});
  await assert.rejects(api.removeArchiveFile('other','w/d/photo.jpg'),/Unknown picture bucket/);
});

test('photo requests refresh expired authorization once and report Storage failures',async()=>{
  let calls=0;
  const api=new Api(config,storage(),async url=>{
    if(url.includes('/auth/'))return Response.json({...session,access_token:'renewed',expires_in:3600});
    calls++;return calls===1?Response.json({message:'expired'},{status:401}):new Response(new Blob(['image']));
  });
  api.setSession(session);assert.equal(await (await api.photo('w/v/image.png')).text(),'image');assert.equal(calls,2);
  const failed=new Api(config,storage(),async()=>Response.json({message:'Not allowed'},{status:403}));failed.setSession(session);
  await assert.rejects(failed.photo('w/v/image.png'),/Not allowed/);
});

test('menu photo bucket is retained through auth refresh and rejects arbitrary buckets',async()=>{
  const paths=[];let first=true;
  const api=new Api(config,storage(),async url=>{
    paths.push(url);
    if(url.includes('/auth/'))return Response.json({...session,expires_in:3600});
    if(first){first=false;return Response.json({message:'expired'},{status:401});}
    return new Response(new Blob(['menu-image']));
  });api.setSession(session);
  assert.equal(await(await api.photo('w/d/photo.jpg',{bucket:'menu-photos'})).text(),'menu-image');
  assert.ok(paths.filter(p=>p.includes('/storage/')).every(p=>p.includes('/menu-photos/')));
  await assert.rejects(api.photo('w/d/photo.jpg',{bucket:'public-files'}),/Unsupported/);
});
test('default fetch preserves the browser global receiver for auth and data requests',async t=>{
  const requests=[];
  t.mock.method(globalThis,'fetch',async function(url){
    assert.ok(this===globalThis,'browser fetch must receive the global object, not the Api instance');
    requests.push(url);
    return Response.json(url.includes('/auth/') ? {...session,expires_in:3600} : []);
  });
  const api=new Api(config,storage());
  await api.signIn('test@example.invalid','test-only');
  await api.request('expenses');
  assert.equal(requests.length,2);
  assert.ok(requests[0].includes('/auth/v1/token?grant_type=password'));
  assert.ok(requests[1].endsWith('/rest/v1/expenses'));
});
test('lost-response payment retry survives reload and reuses exact payload and UUID',async()=>{
  const s=storage(),requests=[];
  const api=new Api(config,s,async(_,options)=>{requests.push(JSON.parse(options.body));throw new TypeError('Network error');});
  api.setSession(session);
  const op={path:'rpc/record_payment',options:{method:'POST',body:{p:{id:'stable-client-uuid',amount_cents:90000}}}};
  await assert.rejects(api.mutate(op));assert.deepEqual(api.pending,op);
  const restored=new Api(config,s,async(_,options)=>{requests.push(JSON.parse(options.body));return Response.json('stable-client-uuid');});
  await restored.retryPending();assert.deepEqual(requests[0],requests[1]);assert.equal(restored.pending,null);
});
test('pending transaction blocks a second save and is isolated by account',async()=>{
  const api=new Api(config,storage(),async()=>{throw new TypeError('offline');});api.setSession(session);
  await assert.rejects(api.mutate({path:'payments',options:{method:'POST',body:{id:'one'}}}));
  await assert.rejects(api.mutate({path:'payments',options:{method:'POST',body:{id:'two'}}}),/pending save/);
  api.setSession({...session,user:{id:'partner-b'}});assert.equal(api.pending,null);
});
test('stale optimistic update requires review instead of overwriting',async()=>{
  const api=new Api(config,storage(),async()=>Response.json([]));api.setSession(session);
  await assert.rejects(api.mutate({path:'expenses?id=eq.e&version=eq.1',options:{method:'PATCH',body:{version:1}}}),/Someone changed/);
  assert.equal(api.pending,null);
});
test('validation failures clear pending state and temporary failures retain it',async()=>{
  for(const status of [400,403,408,429,500]){
    const api=new Api(config,storage(),async()=>Response.json({message:'denied'},{status}));api.setSession(session);
    await assert.rejects(api.mutate({path:'payments',options:{method:'POST',body:{}}}));
    assert.equal(!!api.pending,[408,429,500].includes(status));
  }
});
test('concurrent expired requests share one refresh',async()=>{
  let refreshes=0;
  const api=new Api(config,storage(),async(url)=>{
    if(url.includes('/auth/')){refreshes++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({...session,expires_in:3600});}
    return Response.json([]);
  });api.setSession({...session,expires_at:1});
  await Promise.all([api.request('expenses'),api.request('payments')]);assert.equal(refreshes,1);
});
test('temporary refresh server failure preserves recoverable session',async()=>{
  const api=new Api(config,storage(),async()=>Response.json({message:'temporary failure'},{status:500}));api.setSession(session);
  await assert.rejects(api.refresh());assert.equal(api.session.refresh_token,session.refresh_token);
});
test('refresh completing after sign-out cannot restore the old session',async()=>{
  let finish;
  const api=new Api(config,storage(),()=>new Promise(resolve=>{finish=resolve;}));api.setSession(session);
  const refreshing=api.refresh();api.setSession(null);
  finish(Response.json({...session,expires_in:3600}));await refreshing;
  assert.equal(api.session,null);
});

test('refresh errors preserve the original pending save for its account', async () => {
  const operation = {path: 'expenses', options: {method: 'POST', body: {id: 'original'}}};
  for (const status of [400, 409, 429]) {
    const api = new Api(config, storage(), async url => {
      assert.ok(url.includes('/auth/'));
      return Response.json({message: 'Refresh failed'}, {status});
    });
    api.setSession({...session, expires_at: 1});
    await assert.rejects(api.mutate(operation), /Refresh failed/);
    assert.equal(!!api.session, status !== 400);
    api.setSession(session);
    assert.deepEqual(api.pending, operation);
  }
});

test('late unauthorized responses reuse the token already renewed by another request', async () => {
  let refreshes = 0;
  const firstResponse = Promise.withResolvers();
  const api = new Api(config, storage(), async (url, options) => {
    if (url.includes('/auth/')) {
      refreshes++;
      return Response.json({...session, access_token: 'renewed', expires_in: 3600});
    }
    if (options.headers.Authorization === 'Bearer test-token') {
      return url.includes('/storage/') ? firstResponse.promise : new Response(null, {status: 401});
    }
    return url.includes('/storage/') ? new Response('image') : Response.json([]);
  });
  api.setSession(session);
  const photo = api.photo('w/v/image.png');
  await api.request('expenses');
  firstResponse.resolve(new Response(null, {status: 401}));
  assert.equal(await (await photo).text(), 'image');
  assert.equal(refreshes, 1);
});

test('retrying while a save is in flight shares its confirmation', async () => {
  const response = Promise.withResolvers();
  let submissions = 0;
  const api = new Api(config, storage(), async () => {
    submissions++;
    return response.promise;
  });
  api.setSession(session);
  const saving = api.mutate({path: 'expenses', options: {method: 'POST', body: {id: 'first'}}});
  const retrying = api.retryPending();
  response.resolve(Response.json({id: 'first'}));
  const [original, retry] = await Promise.all([saving, retrying]);
  assert.equal(submissions, 1);
  assert.deepEqual(retry, original);
  assert.equal(api.pending, null);
});
test('sign-out clears local access while the server is still processing logout',async()=>{
  let finish, authorization;
  const api=new Api(config,storage(),async(url,options)=>{
    authorization=options.headers.Authorization;
    return new Promise(resolve=>{finish=()=>resolve(Response.json({}));});
  });
  api.setSession(session);
  const logout=api.signOut();
  assert.equal(api.session,null);
  assert.equal(authorization,'Bearer test-token');
  finish();
  await logout;
});
