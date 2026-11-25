import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareGuestImport,maxFileBytes} from '../docs/guest-import.js';
import {csv} from '../docs/budget.js';

const template=readFileSync(new URL('../docs/guest-list-template.csv',import.meta.url),'utf8').trim();
test('downloadable template groups nonadjacent people and accepts Excel UTF-8 and quoted addresses',()=>{
  const source='\uFEFF'+template+'\r\nLee,"Ari ""AJ"" Lee",,YES,,+1 555 0100,"Apt 2,\r\nMain Street",Vegetarian\r\nChen,Jo,,,,,,\r\nlee,,yes,,a@example.com,,,\r\n';
  const {households,guestCount}=prepareGuestImport(source);
  assert.equal(guestCount,3);
  assert.equal(households.length,2);
  assert.equal(households[0].email,'a@example.com');
  assert.equal(households[0].address,'Apt 2,\nMain Street');
  assert.equal(households[0].phone,'+1 555 0100');
  assert.deepEqual(households[0].people.map(p=>[p.name,p.companion,p.rsvp,p.line]),[['Ari "AJ" Lee',false,'yes',2],['',true,'pending',5]]);
});
test('invalid files identify the line, field and correction before producing a batch',()=>{
  const source='guest_name,household,rsvp,email\nAri,Lee,maybe,invalid\nari,LEE,yes,a@example.com\n';
  assert.throws(()=>prepareGuestImport(source),err=>/Line 2 · rsvp/.test(err.message) && /Line 2 · email/.test(err.message) && /Line 3 · guest_name.*line 2/.test(err.message));
  assert.throws(()=>prepareGuestImport('household,guest_name,phone\nA,X,123\nA,Y,456'),/Line 3 · phone/);
  assert.throws(()=>prepareGuestImport('household,guest_name\nLee,A',[{household_name:' LEE ',archived:true}]),/Line 2 · household.*Already/);
  assert.throws(()=>prepareGuestImport('household,guest_name\na,"multi\nline"\nb,x,extra'),/Line 4 · columns/);
});
test('header, quoting, file and guest limits give actionable errors',()=>{
  for (const [file,message] of [
    ['',/empty/],[template,/headers only/],['household,guest_name,wedding_id\nA,B,1',/unrecognized column "wedding_id"/],
    ['guest_name,guest_name',/repeats/],['household\nA',/missing.*guest_name/],
    ['household,guest_name\na,"b',/Line 2.*closing quote/],['household,guest_name\na,b\u0000',/Line 2.*control/],
    ['x'.repeat(maxFileBytes+1),/1 MiB/],
    ['household,guest_name\n'+Array.from({length:1001},(_,i)=>i+',A').join('\n'),/1,000/],
    ['household,guest_name\n'+Array.from({length:51},(_,i)=>'A,'+i).join('\n'),/Line 52 · household/]
  ]) assert.throws(()=>prepareGuestImport(file),message);
});
test('punctuation and spreadsheet-like text stay literal and are protected by the existing exporter',()=>{
  const {households}=prepareGuestImport('household,guest_name\nFamily,=example');
  assert.equal(households[0].people[0].name,'=example');
  assert.match(csv([[households[0].people[0].name]]),/"'=example"/);
});
