// Read-only hosted smoke test. Uses only the public frontend configuration.
import assert from 'node:assert/strict';
import { config } from '../docs/config.js';

assert.match(config.supabaseUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
assert.ok(config.publishableKey.startsWith('sb_publishable_'), 'Configure the publishable key first');
const tables = ['weddings', 'wedding_members', 'categories', 'vendors', 'expenses',
  'quotes', 'installments', 'payments', 'contract_amendments'];
if (process.argv.includes('--planner')) tables.push('invitations','guests','tasks');
const checks = tables.map(table => ({ label: table, path: `${table}?select=*&limit=1` }));
checks.push({ label: 'budget_snapshot RPC', path: 'rpc/budget_snapshot', method: 'POST',
  body: { w: '00000000-0000-0000-0000-000000000000' } });

let failures = 0;
for (const check of checks) {
  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${check.path}`, {
      method: check.method || 'GET',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      ...(check.body ? { body: JSON.stringify(check.body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    // Empty data alone is insufficient: this project's anonymous role has no read grants.
    assert.ok([401, 403].includes(response.status), `expected access denial; received HTTP ${response.status}`);
    const result = await response.json();
    assert.equal(result.code, '42501', 'expected a database permission denial, not an invalid API key or gateway error');
    console.log(`PASS ${check.label}: signed-out access denied (${response.status})`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${check.label}: ${error.message}`);
  }
}
if (failures) process.exitCode = 1;
else console.log(`All ${checks.length} signed-out Data API checks passed. No hosted records were written.`);
