import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
assert.match(process.env.DB_URL ?? '', /^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?|$)/);
const database = process.env.CLOUDFLOW_UNIQUE_AUDIT_DATABASE || 'cloud_flow_db';
const currentAudit = process.env.CLOUDFLOW_CURRENT_UNIQUE_AUDIT === '1';
assert.ok(database === 'cloud_flow_db' || /^cf_prd_rehearsal_[a-f0-9]{32}$/.test(database));
if (database === 'cloud_flow_db') {
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'deployment-state.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (currentAudit) assert.ok(['INITIALIZED', 'RUNNING'].includes(state.status));
  else assert.equal(state.status, 'STOPPED');
}

function query(statement) {
  const result = spawnSync('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe', [
    '--no-defaults', '--host=192.168.1.173', '--port=3306', `--user=${process.env.DB_USERNAME}`, `--database=${database}`,
    '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names',
  ], { input: `START TRANSACTION READ ONLY;\n${statement};\nCOMMIT;`, encoding: 'utf8', windowsHide: true, timeout: 120000, env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD } });
  assert.equal(result.status, 0, 'Read-only constraint inspection failed');
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

const definitions = query("SELECT JSON_OBJECT('table',table_name,'index',index_name,'column',column_name,'prefix',sub_part) FROM information_schema.statistics WHERE table_schema=DATABASE() AND non_unique=0 AND index_name<>'PRIMARY' ORDER BY table_name,index_name,seq_in_index");
const groups = new Map();
for (const definition of definitions) {
  for (const identifier of [definition.table, definition.index, definition.column]) assert.match(identifier ?? '', /^[a-zA-Z][a-zA-Z0-9_]*$/);
  assert.ok(definition.prefix === null || Number.isInteger(definition.prefix) && definition.prefix > 0);
  const key = `${definition.table}:${definition.index}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(definition);
}
const statements = [...groups.values()].map(columns => {
  const first = columns[0];
  const names = columns.map(column => '`' + column.column + '`');
  const expressions = columns.map((column, index) => column.prefix ? `LEFT(${names[index]},${column.prefix})` : names[index]);
  return `SELECT JSON_OBJECT('table','${first.table}','index','${first.index}','groups',COUNT(*)) FROM (SELECT ${expressions.join(',')} FROM \`${first.table}\` FORCE INDEX(PRIMARY) WHERE ${names.map(name => `${name} IS NOT NULL`).join(' AND ')} GROUP BY ${expressions.join(',')} HAVING COUNT(*)>1) duplicate_values`;
});
const anomalies = query(statements.join('\nUNION ALL\n')).filter(value => value.groups > 0);
const result = { inspectedUniqueIndexes: groups.size, anomalies, runningDatabaseWrites: 0, checkedAt: new Date().toISOString() };
fs.writeFileSync(path.join(directory, currentAudit ? 'runtime-unique-constraints.json' : database === 'cloud_flow_db' ? 'backup-constraint-audit.json' : 'rehearsal-unique-constraints.json'), JSON.stringify(result, null, 2));
console.log(`SECONDARY_UNIQUE_INDEXES_INSPECTED=${groups.size}; INDEXES_WITH_EXISTING_DUPLICATES=${anomalies.length}; RUNTIME_WRITES=0`);
for (const anomaly of anomalies) console.log(`EXISTING_DUPLICATES table=${anomaly.table}; index=${anomaly.index}; groups=${anomaly.groups}`);
if (database !== 'cloud_flow_db' || currentAudit) assert.equal(anomalies.length, 0, 'Approved data must satisfy every secondary unique index');
