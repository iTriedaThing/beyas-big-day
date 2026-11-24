import {readFile} from 'node:fs/promises';
import {createPreviewServer} from './preview-server.mjs';

async function loadFixtureAsset(file, pathname) {
  if (pathname === '/config.js') {
    return "export const config={supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'};";
  }
  if (pathname === '/fixture.js') {
    return readFile(new URL('../tests/fixture.js', import.meta.url));
  }
  if (pathname === '/app.js') {
    const app = await readFile(file, 'utf8');
    return "import {installMock} from './fixture.js';\nimport {menuEstimate as fixtureEstimate} from './menu.js';\ninstallMock(fixtureEstimate);\n" + app;
  }
  return readFile(file);
}

createPreviewServer(loadFixtureAsset).listen(4174, '127.0.0.1', () => {
  console.log('Mock-data UI preview only: http://127.0.0.1:4174');
});
