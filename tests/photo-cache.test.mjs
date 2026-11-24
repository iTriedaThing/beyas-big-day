import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveObjectURL} from 'node:buffer';
import {createPhotoCache} from '../docs/photo-cache.js';

test('photo loads share a request and cannot restore an evicted path after sign-out',async()=>{
  const requests=[];
  const cache=createPhotoCache(()=>{
    const request=Promise.withResolvers();
    requests.push(request);
    return request.promise;
  });
  const first=cache.get('picture');
  assert.equal(cache.get('picture'),first);
  cache.retain(new Set());
  const second=cache.get('picture');
  requests[1].resolve(new Blob(['current picture']));
  const url=await second;
  requests[0].resolve(new Blob(['old picture']));
  assert.equal(await first,undefined);
  assert.equal(await cache.get('picture'),url);
  assert.equal(await resolveObjectURL(url).text(),'current picture');
  cache.retain(new Set(['other']));
  assert.equal(resolveObjectURL(url),undefined);
});

test('a failed photo download can be retried on the next render',async()=>{
  let attempts=0;
  const cache=createPhotoCache(async()=>{
    if (++attempts===1) throw new Error('offline');
    return new Blob(['available']);
  });
  await assert.rejects(cache.get('picture'),/offline/);
  assert.ok(resolveObjectURL(await cache.get('picture')));
  cache.retain(new Set());
  assert.equal(attempts,2);
});
