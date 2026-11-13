import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
for(const name of await readdir('docs')){
  if(name.endsWith('.js')){
    execFileSync(process.execPath,['--check',`docs/${name}`],{stdio:'inherit'});
    const source=await readFile(`docs/${name}`,'utf8');
    for(const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g))await readFile(`docs/${match[1]}`);
  }
  if(name.endsWith('.css')){
    const source=await readFile(`docs/${name}`,'utf8');
    for(const match of source.matchAll(/url\(['"]\.\/([^'"]+)['"]\)/g))await readFile(`docs/${match[1]}`);
  }
}
const html=await readFile('docs/index.html','utf8');
for(const match of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)) await readFile(`docs/${match[1]}`);
assert.match(html,/name="viewport"/);assert.match(html,/Content-Security-Policy/);
assert.ok(!(await readFile('docs/config.js','utf8')).includes('sb_secret_'));
console.log('JavaScript syntax, static entry assets and Pages-relative paths passed. No build step or production dependencies.');
