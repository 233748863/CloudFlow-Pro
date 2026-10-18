import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2]);
const run = path.dirname(statePath);
assert.equal(path.dirname(run), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(run), /^[a-f0-9]{32}$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), run);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
const sql = (statement, expectedError) => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4'],
  { input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment });
  if (expectedError) {
    assert.notEqual(result.status, 0, 'Database constraint must reject the fixture');
    assert.match(result.stderr, new RegExp(`ERROR ${expectedError} \\(`), 'Unexpected database rejection category');
  } else assert.equal(result.status, 0, 'Owned settlement proposal SQL failed; raw SQL diagnostics withheld');
  return result.stdout.trim();
};
const confirmOwned = async () => assert.equal(await fs.realpath(sql('SELECT @@datadir;')), await fs.realpath(path.join(run, 'mysql-data')));
await confirmOwned();
const schema = `h2_settlement_proposal_${randomUUID().replaceAll('-', '')}`;
assert.match(schema, /^h2_settlement_proposal_[a-f0-9]{32}$/);
assert.equal(sql(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${schema}';`), '0');
const runtimeCount = () => sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';");
const before = runtimeCount();
const proposal = await fs.readFile(path.join(root, 'docs/design/H2-人事增强提案DDL.sql'), 'utf8');
const tables = ['hr_severance_rule', 'hr_severance_rule_slab', 'hr_final_settlement', 'hr_final_settlement_item', 'hr_training_recovery', 'hr_exit_interview'];
const definitions = tables.map(table => {
  const matches = [...proposal.matchAll(new RegExp(`^CREATE TABLE ${table} \\([\\s\\S]*?^\\) ENGINE=[^\\r\\n]*;`, 'gm'))];
  assert.equal(matches.length, 1, 'Exactly one approved definition is required');
  return matches[0][0];
});
if (process.argv.includes('--runtime-preflight')) {
  const existingTables = sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_name IN (${tables.map(table => `'${table}'`).join(',')});`);
  const menuConflicts = sql("SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1860 AND 1870 OR perms LIKE 'hr:settlement:%' OR perms LIKE 'hr:severance:%' OR perms LIKE 'hr:exit-interview:%' OR perms LIKE 'hr:training-recovery:%';");
  const salaryColumns = sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_salary_slip' AND column_name='reserved_settlement_id';");
  const paymentColumns = sql("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name IN ('source_biz_type','source_biz_id');");
  const paymentAmount = sql("SELECT CONCAT(numeric_precision,':',numeric_scale) FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='biz_payment_request' AND column_name='amount';");
  console.log(`H2_SETTLEMENT_PREFLIGHT: runtime_tables=${before}; existing_proposal_tables=${existingTables}; menu_conflicts=${menuConflicts}; salary_reservation_columns=${salaryColumns}; payment_source_columns=${paymentColumns}; payment_precision_scale=${paymentAmount}; writes=0`);
  assert.equal(existingTables, '0'); assert.equal(menuConflicts, '0'); assert.equal(salaryColumns, '0'); assert.equal(paymentColumns, '0');
  assert.equal(paymentAmount, '10:2');
  process.exit(0);
}
let checks = 0;
const check = (label, accepted) => { assert.ok(accepted, label); checks++; console.log(`PASS ${label}`); };
try {
  sql(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4; USE ${schema};\n${definitions.join('\n')}`);
  const query = (statement, expectedError) => sql(`USE ${schema}; ${statement}`, expectedError);
  check('批准的离职结算六表可在独立库创建', sql(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${schema}' AND table_type='BASE TABLE';`) === '6');
  query("INSERT INTO hr_final_settlement (settlement_id,tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date) VALUES (100,100000,'normal',1,1,'2020-01-01','2026-09-30');");
  query("INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date) VALUES (100000,'duplicate',1,1,'2020-01-01','2026-09-30');", 1062);
  check('同一租户离职申请不能重复建立有效普通结算', query('SELECT COUNT(*) FROM hr_final_settlement;') === '1');
  query("INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date) VALUES (200001,'normal',1,1,'2020-01-01','2026-09-30');");
  check('结算唯一约束按租户隔离', query('SELECT COUNT(*) FROM hr_final_settlement;') === '2');
  query("INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,settlement_kind,reversal_of_id,join_date,relieving_date) VALUES (100000,'reversal',1,1,'REVERSAL',100,'2020-01-01','2026-09-30');");
  query("INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,settlement_kind,reversal_of_id,join_date,relieving_date) VALUES (100000,'duplicate-reversal',1,1,'REVERSAL',100,'2020-01-01','2026-09-30');", 1062);
  check('同一原结算不能建立第二张冲正单', query("SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_kind='REVERSAL' AND active_lifecycle_id IS NULL;") === '1');
  query("UPDATE hr_final_settlement SET net_amount=1 WHERE settlement_id=100;", 3819);
  check('结算净额必须符合应付补偿减应收损失等式', query('SELECT net_amount FROM hr_final_settlement WHERE settlement_id=100;') === '0.00');
  query("INSERT INTO hr_final_settlement_item (tenant_id,settlement_id,item_type,item_name,source_biz_type,source_biz_id,amount) VALUES (100000,100,'PAYABLE','fixture','SALARY','1',12.34);");
  query("INSERT INTO hr_final_settlement_item (tenant_id,settlement_id,item_type,item_name,source_biz_type,source_biz_id,amount) VALUES (100000,100,'PAYABLE','fixture','SALARY','1',12.34);", 1062);
  check('同一结算来源只保留一条明细', query('SELECT COUNT(*) FROM hr_final_settlement_item;') === '1');
  query("INSERT INTO hr_training_recovery (tenant_id,employee_id,enrollment_id,agreement_file_id,assessed_amount,collected_amount,assessment_reason) VALUES (100000,1,1,1,100,101,'fixture');", 3819);
  check('培训追偿不能超过核定金额', query('SELECT COUNT(*) FROM hr_training_recovery;') === '0');
  query("INSERT INTO hr_severance_rule_slab (tenant_id,rule_id,sort_no,min_service_years,max_service_years,calculation_mode,compensation_months) VALUES (100000,1,1,2,1,'FIXED',1);", 3819);
  check('工龄分档上限必须大于下限', query('SELECT COUNT(*) FROM hr_severance_rule_slab;') === '0');
  check('运行业务库未新增或删除表', runtimeCount() === before);
  console.log(`H2_SETTLEMENT_PROPOSAL: checks=${checks}; failed=0; tables=6; real_mysql=true; approved_ddl_only=true; business_services_tested=false; formal_schema_modified=false; production_modified=false`);
} finally {
  await confirmOwned();
  sql(`DROP DATABASE IF EXISTS ${schema};`);
  assert.equal(sql(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${schema}';`), '0');
  assert.equal(runtimeCount(), before);
  console.log(`H2_SETTLEMENT_PROPOSAL_CLEANUP: owned_schema_remaining=0; runtime_tables=${before}; shared_redis_flush=false`);
}
