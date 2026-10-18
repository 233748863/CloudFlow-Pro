import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = 'D:/CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
function db(sql) {
  assert.match(sql, /^SELECT\s/i); assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(sql));
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: sql, encoding: 'utf8', windowsHide: true, env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned read failed'); return result.stdout.trim();
}
assert.equal(fs.realpathSync(db('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
const rows = sql => db(sql).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (process.argv.includes('--finance')) {
  const finance = rows("SELECT JSON_OBJECT('username',u.user_name,'userId',CAST(u.user_id AS CHAR),'deptId',CAST(u.dept_id AS CHAR),'status',u.status,'reset',u.pwd_reset_required,'owned',u.create_by='advance-payroll-fixture','passwordMatchesOwnedEmployee',u.password=e.password) FROM sys_user u JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id JOIN sys_user e ON e.tenant_id=u.tenant_id AND e.user_name='g_holiday_employee' WHERE u.tenant_id=100000 AND u.deleted=0 AND r.role_key='finance' AND u.create_by='advance-payroll-fixture' ORDER BY u.user_id");
  console.log(JSON.stringify({ finance })); process.exit(0);
}
const accounts = rows("SELECT JSON_OBJECT('username',u.user_name,'userId',CAST(u.user_id AS CHAR),'deptId',CAST(u.dept_id AS CHAR),'role',r.role_key) FROM sys_user u JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_name IN ('g_import_admin','g_import_other','g_holiday_hr','g_holiday_manager','g_holiday_employee') AND u.tenant_id=100000 AND u.deleted=0 ORDER BY u.user_id,r.role_id");
const definitions = rows("SELECT JSON_OBJECT('configId',CAST(c.config_id AS CHAR),'key',c.config_value,'id',d.definition_id,'model',CAST(d.model_json AS CHAR),'version',d.version) FROM sys_config c JOIN wf_process_definition d ON d.process_key=c.config_value AND d.tenant_id=c.tenant_id WHERE c.tenant_id=100000 AND c.config_key='sys.hr.payroll.correctionProcessKey' AND c.config_scope='1' AND d.status='PUBLISHED' AND d.deleted=0 ORDER BY d.version DESC");
const periods = rows("SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'name',period_name,'start',start_date,'end',end_date,'status',status) FROM hr_payroll_period WHERE tenant_id=100000 AND deleted=0 ORDER BY start_date,period_id");
const samples = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employee',CAST(employee_id AS CHAR),'month',period_month,'status',status,'gross',CAST(gross_total AS CHAR),'tax',CAST(tax_amount AS CHAR),'net',CAST(net_total AS CHAR),'components',components) FROM hr_salary_slip WHERE tenant_id=100000 AND employee_id IN (98209282285,98209282286) AND deleted=0 ORDER BY id");
const originalCorrections = rows("SELECT JSON_OBJECT('id',CAST(c.correction_id AS CHAR),'original',CAST(c.original_slip_id AS CHAR),'slip',CAST(c.correction_slip_id AS CHAR),'status',c.status,'instance',c.instance_id) FROM hr_payroll_correction c JOIN hr_salary_slip s ON s.id=c.original_slip_id AND s.tenant_id=c.tenant_id WHERE c.tenant_id=100000 AND s.employee_id IN (98209282285,98209282286) AND c.deleted=0");
const report = { readOnly: true, accounts, definitions: definitions.map(item => ({ ...item, model: JSON.parse(item.model) })), periods, samples, originalCorrections };
const output = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-correction-inventory-20261006-r1.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ accounts, definitions: report.definitions.map(item => ({ id: item.id, key: item.key,
  nodes: item.model.nodes.map(node => ({ id: node.id, type: node.type, approverType: node.approverType, approverValue: node.approverValue, signType: node.signType, approveSelf: node.approveSelf })) })),
  periods, samples: samples.map(({ components, ...sample }) => sample), originalCorrections }));
