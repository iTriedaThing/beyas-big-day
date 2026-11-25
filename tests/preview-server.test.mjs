import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPreviewServer} from '../scripts/preview-server.mjs';

test('the local server keeps serving Pages assets after an invalid URL', async t => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(origin + '/bad%')).status, 400);
  assert.equal((await fetch(origin + '/fixture.js')).status, 404);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const template=await fetch(origin+'/guest-list-template.csv');
  assert.equal(template.status,200);
  assert.match(template.headers.get('content-type'),/^text\/csv/);
  assert.match(await template.text(),/^household,guest_name,/);
  assert.match(await page.text(), /src="\.\/app\.js"/);
  const manifest = await fetch(origin + '/app.webmanifest');
  assert.equal(manifest.headers.get('content-type'), 'application/manifest+json');
  assert.equal((await manifest.json()).start_url, './');
});
