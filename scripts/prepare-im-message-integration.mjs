import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--apply');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const statePath = realpathSync(process.argv[2]);
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
for (const candidate of [root, directory, statePath, path.join(directory, 'mysql-data')]) assert.equal(lstatSync(candidate).isSymbolicLink(), false);
const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(realpathSync(state.run), directory);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const owned = state.processes.filter(entry => entry.name === 'mysql');
assert.equal(owned.length, 1);
assert.equal(realpathSync(owned[0].marker), realpathSync(path.join(directory, 'mysql-data')));
process.kill(owned[0].id, 0);
const environment = { ...process.env };
delete environment.MYSQL_PWD;
function database(statement, readOnly = true) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    input: readOnly ? `START TRANSACTION READ ONLY;\n${statement}\nCOMMIT;` : statement,
    env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024, windowsHide: true,
  });
  assert.equal(result.status, 0, 'Owned template operation failed');
  return result.stdout.trim();
}
assert.equal(realpathSync(database('SELECT @@datadir;')), realpathSync(owned[0].marker));
const formal = readFileSync(path.join(root, 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'), 'utf8');
const start = formal.lastIndexOf('INSERT INTO cloud_flow_db.sys_message_template');
assert.ok(start >= 0);
const sql = formal.slice(start, formal.indexOf(';', start) + 1);
assert.ok(sql.includes("'IM_NOTICE_TEXT'") && sql.includes("'IM_NOTICE_DETAIL'") && sql.includes("'WECOM'"));
assert.equal((sql.match(/;/g) || []).length, 1);
const maximum = database('SELECT COALESCE(MAX(template_id),0) FROM sys_message_template;');
assert.match(maximum, /^\d+$/);
const originalQuery = `SELECT * FROM sys_message_template WHERE template_id<=${maximum} ORDER BY template_id;`;
const digest = () => createHash('sha256').update(database(originalQuery)).digest('hex');
const original = digest();
const active = Number(database("SELECT COUNT(*) FROM sys_tenant WHERE tenant_id>0 AND deleted=0 AND status='0';"));
const count = () => Number(database("SELECT COUNT(*) FROM sys_message_template notice JOIN sys_tenant tenant ON tenant.tenant_id=notice.tenant_id WHERE tenant.tenant_id>0 AND tenant.deleted=0 AND tenant.status='0' AND notice.channel_type='WECOM' AND notice.template_code IN ('IM_NOTICE_TEXT','IM_NOTICE_DETAIL') AND notice.deleted=0;"));
const before = count();
assert.ok(before <= active * 2);
console.log(`G4_IM_MESSAGE_DEFAULTS_PREFLIGHT: active_tenants=${active}; expected_templates=${active * 2}; existing=${before}; production_modified=false`);
if (process.argv.includes('--apply')) {
  database(`START TRANSACTION;\n${sql}\nCOMMIT;`, false);
  assert.equal(count(), active * 2);
  assert.equal(digest(), original);
  database(`START TRANSACTION;\n${sql}\nCOMMIT;`, false);
  assert.equal(count(), active * 2);
  assert.equal(digest(), original);
  console.log(`G4_IM_MESSAGE_DEFAULTS_APPLIED: inserted=${active * 2 - before}; total=${count()}; repeated_identical=true; existing_templates_unchanged=true; channel_created=false; production_modified=false`);
}
