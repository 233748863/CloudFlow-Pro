import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';

const output = process.argv[process.argv.indexOf('--output') + 1];
const recoveryRound = process.argv[process.argv.indexOf('--recover-round') + 1];
assert.ok(output && process.argv.includes('--e1-references') && process.argv.includes('--recover-round'));
assert.match(recoveryRound, /^r[1-9][0-9]*$/);
const originalPath = path.join(path.dirname(output), 'e1-references-20261009-' + recoveryRound, 'result.json');
const originalBytes = await fs.readFile(originalPath);
const original = JSON.parse(originalBytes);
assert.equal(original.passed, false);
assert.ok(original.finalFailures.length > 0);
const identifiers = original.finalFailures.map(failure => {
  const found = /^DELETE_\/crm\/customer\/(\d+):status_403_code_403$/.exec(failure);
  assert.ok(found, 'Only the documented customer cleanup refusal may be recovered');
  return Number(found[1]);
});
assert.equal(new Set(identifiers).size, identifiers.length);
assert.ok(identifiers.every(id => Number.isSafeInteger(id) && id > 0 && !original.sourceFixtures.some(source => source.table === 'crm_customer' && source.id === id)));
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, database } = runtime;
const digest = value => createHash('sha256').update(value).digest('hex');
const existing = [];
for (const table of ['crm_activity', 'crm_activity_participant', 'crm_activity_reminder', 'crm_customer', 'crm_follow_up', 'crm_opportunity', 'crm_lead', 'crm_service_ticket', 'oa_contract', 'crm_contact', 'sys_role_menu']) {
  const query = 'SELECT * FROM ' + table + (table === 'crm_customer' ? ' WHERE customer_id NOT IN (' + identifiers.join(',') + ')' : '') + (table === 'sys_role_menu' ? ' ORDER BY tenant_id,role_id,menu_id' : ' ORDER BY 1');
  existing.push({ table, query, hash: digest(database(query)) });
}
const result = { passed: false, recovered: false, preservation: false, secrets: false, recoveryRound, recoveredIds: [], allAcceptanceComplete: false };
let failure;
try {
  for (const id of identifiers) {
    const row = JSON.parse(database("SELECT JSON_OBJECT('tenant',tenant_id,'code',customer_code,'owner',owner_id,'deleted',deleted) FROM crm_customer WHERE customer_id=" + id));
    check('recovery_owned_customer_' + id, row.tenant === 100000 && row.owner === Number(runtime.sessions.sales.identity.userId) && row.deleted === 0 && ['ascii', 'chinese', 'supplementary'].some(suffix => row.code === original.marker + '_name_' + suffix));
    await ok('admin', '/crm/customer/' + id, 'DELETE');
    check('recovery_customer_removed_' + id, database('SELECT deleted FROM crm_customer WHERE customer_id=' + id) === '1');
    result.recoveredIds.push(id);
  }
  result.recovered = result.recoveredIds.length === identifiers.length;
} catch (error) {
  failure = error instanceof Error ? error.message : 'Reference customer recovery failed';
} finally {
  const finalFailures = [];
  for (const entry of existing) {
    try { check('recovery_original_rows_preserved_' + entry.table, digest(database(entry.query)) === entry.hash); }
    catch { finalFailures.push(entry.table); }
  }
  check('recovery_failed_evidence_preserved', digest(await fs.readFile(originalPath)) === digest(originalBytes));
  result.preservation = finalFailures.length === 0;
  try { result.secretScan = await runtime.scan(); result.secrets = true; }
  catch { finalFailures.push('secrets'); }
  await runtime.close();
  result.finalFailures = finalFailures;
  result.passed = !failure && result.recovered && result.preservation && result.secrets;
  result.failure = failure;
  result.checks = runtime.checks;
  result.requests = runtime.requests;
  result.verifiedAt = new Date().toISOString();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log('E1_REFERENCE_RECOVERY: passed=' + result.passed + '; recovered_customers=' + result.recoveredIds.length + '; original_failed_evidence_unchanged=true');
}
assert.ok(result.passed, 'Reference customer recovery did not complete');
