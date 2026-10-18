import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const state = JSON.parse(fs.readFileSync(path.join(directory, 'deployment-state.json'), 'utf8').replace(/^\uFEFF/, ''));
const restoredDatabase = process.env.CLOUDFLOW_RESTORED_DATABASE;
assert.equal(state.status, 'STOPPED');
assert.match(restoredDatabase ?? '', /^cf_approved_restore_[a-f0-9]{32}$/);
assert.equal(restoredDatabase, state.backup.recoveryDatabase);
assert.equal(state.backup.recoverySourceSha256, state.backup.sha256);
assert.match(process.env.DB_URL ?? '', /^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?|$)/);

function query(database, statement) {
  assert.ok(database === 'cloud_flow_db' || database === restoredDatabase);
  const result = spawnSync('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe', [
    '--no-defaults', '--host=192.168.1.173', '--port=3306', `--user=${process.env.DB_USERNAME}`, `--database=${database}`,
    '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names',
  ], { input: `START TRANSACTION READ ONLY;\n${statement};\nCOMMIT;`, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD } });
  assert.equal(result.status, 0, `Read-only backup row verification failed: ${/ERROR \d+(?: \([A-Z0-9]+\))?/.exec(result.stderr ?? '')?.[0] ?? 'UNKNOWN'}`);
  return result.stdout.trim();
}

const columnQuery = "SELECT JSON_OBJECT('table',table_name,'name',column_name,'type',column_type,'kind',data_type,'nullable',is_nullable,'default',column_default,'collation',collation_name,'extra',extra) FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position";
const sourceColumns = query('cloud_flow_db', columnQuery);
const restoredColumns = query(restoredDatabase, columnQuery).split(/\r?\n/).map(JSON.parse);
const originalColumns = sourceColumns.split(/\r?\n/).map(JSON.parse);
assert.equal(restoredColumns.length, originalColumns.length);
const jsonTextArchive = state.backup.recoveryFormat === 'JSON_TEXT_V1';
assert.ok(jsonTextArchive || state.backup.recoveryFormat === 'ORIGINAL_SCHEMA_V1');
const jsonTextArchiveColumns = [];
for (const [index, original] of originalColumns.entries()) {
  const restored = { ...restoredColumns[index] };
  if (jsonTextArchive && original.kind === 'json') {
    assert.equal(restored.kind, 'longtext'); assert.equal(restored.collation, 'utf8mb4_bin');
    jsonTextArchiveColumns.push(`${original.table}.${original.name}`);
    restored.kind = original.kind; restored.type = original.type; restored.collation = original.collation;
  }
  assert.deepEqual(restored, original, 'Unchanged restored column definition differs');
}
const tables = new Map();
for (const column of sourceColumns.split(/\r?\n/).map(JSON.parse)) {
  assert.match(column.table, /^[a-z][a-z0-9_]*$/); assert.match(column.name, /^[a-zA-Z][a-zA-Z0-9_]*$/);
  if (!tables.has(column.table)) tables.set(column.table, []);
  tables.get(column.table).push(column);
}
assert.equal(tables.size, state.backup.tables.length);
const results = [];
for (const [table, columns] of tables) {
  const values = columns.map(column => column.kind === 'json' ? `HEX(CAST(\`${column.name}\` AS CHAR CHARACTER SET utf8mb4))` : /binary|blob|bit|geometry|point|polygon|linestring/.test(column.kind) ? `HEX(\`${column.name}\`)` : `\`${column.name}\``);
  const statement = `SELECT SHA2(CAST(JSON_ARRAY(${values.join(',')}) AS CHAR CHARACTER SET utf8mb4),256) AS row_digest FROM \`${table}\``;
  const canonical = value => value.split(/\r?\n/).filter(Boolean).sort().join('\n');
  const source = canonical(query('cloud_flow_db', statement));
  const restored = canonical(query(restoredDatabase, statement));
  const digest = value => createHash('sha256').update(value).digest('hex');
  const entry = { table, columns: columns.length, sourceRows: source ? source.split(/\r?\n/).length : 0, restoredRows: restored ? restored.split(/\r?\n/).length : 0, sourceSha256: digest(source), restoredSha256: digest(restored), matched: source === restored };
  entry.exactTextMatched = entry.matched;
  if (!entry.matched && !jsonTextArchive && columns.some(column => column.kind === 'json')) {
    const comparison = spawnSync('python', [path.join(root, 'scripts/check-backup-json-values.py'), table], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
    assert.equal(comparison.status, 0, `Exact scalar and decimal JSON comparison failed for ${table}`);
    const values = JSON.parse(comparison.stdout);
    assert.equal(values.sourceRows, entry.sourceRows); assert.equal(values.restoredRows, entry.restoredRows);
    entry.matched = values.matched === true;
    entry.jsonValueComparison = values.comparison;
    console.log(`BACKUP_JSON_VALUES table=${table}; matched=${entry.matched}; original_dump_text_preserved=true`);
  }
  results.push(entry);
  if (!entry.matched) console.log(`BACKUP_ROW_MISMATCH table=${table}; source_rows=${entry.sourceRows}; restored_rows=${entry.restoredRows}`);
}
const result = { tables: results.length, matchingTables: results.filter(entry => entry.matched).length, rows: results.reduce((total, entry) => total + entry.sourceRows, 0), unchangedColumnDefinitionsMatch: true, jsonTextArchiveColumns, results, originalSchemaUniqueConflicts: state.backup.existingUniqueConflicts, completedAt: new Date().toISOString() };
fs.writeFileSync(path.join(directory, 'backup-row-verification.json'), JSON.stringify(result, null, 2));
console.log(`BACKUP_LOGICAL_ROWS: tables=${result.tables}; matching_tables=${result.matchingTables}; rows=${result.rows}; unchanged_column_definitions_match=true; json_columns_preserved_as_exact_text=${jsonTextArchiveColumns.length}; read_only=true`);
assert.equal(result.matchingTables, state.backup.tables.length, 'Backup logical rows do not match');
