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
assert.equal(state.status, 'RUNNING'); assert.equal(await fs.realpath(state.run), run);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
const sql = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment });
  assert.equal(result.status, 0, 'Owned asset-source SQL failed; raw diagnostics withheld'); return result.stdout.trim();
};
const owned = async () => assert.equal(await fs.realpath(sql('SELECT @@datadir;')), await fs.realpath(path.join(run, 'mysql-data')));
await owned();
const oa = state.services.find(service => service.name === 'oa');
const gateway = state.services.find(service => service.name === 'gateway');
for (const service of [oa, gateway]) assert.ok(Number.isInteger(service.port) && service.port > 1024 && service.port < 65536);
const marker = `h2asset_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
assert.match(marker, /^h2asset_[a-f0-9]{16}$/);
const headers = { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-hr', 'X-Tenant-Id': '100000' };
const beforeTables = sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';");
const grants = sql('SELECT CONCAT(tenant_id,\':\',role_id,\':\',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
let checks = 0;
let requests = 0;
const check = (label, accepted) => { assert.ok(accepted, label); checks++; console.log(`PASS ${label}`); };
const get = async (employeeId, customHeaders = headers, gatewayCall = false) => {
  requests++;
  const response = await fetch(`http://127.0.0.1:${gatewayCall ? gateway.port : oa.port}${gatewayCall ? '/oa' : ''}/inner/oa/asset/employee-recovery?employeeId=${employeeId}`,
    { headers: customHeaders, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};
const rejected = (label, result) => check(`${label} HTTP=${result.status}`, result.status >= 400 && result.body?.code !== 200);
let employeeId;
try {
  sql(`INSERT INTO sys_user (tenant_id,user_name,nick_name,status,deleted,create_by) VALUES (100000,'${marker}','${marker}','1',0,'${marker}');`);
  const userId = sql(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='${marker}';`);
  assert.match(userId, /^[1-9]\d*$/);
  sql(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,employee_status,user_id,deleted,create_by)
    VALUES (100000,'${marker}','${marker}','UNKNOWN','RESIGNED',${userId},0,'${marker}');`);
  employeeId = sql(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no='${marker}';`);
  assert.match(employeeId, /^[1-9]\d*$/); assert.notEqual(employeeId, userId);
  sql(`INSERT INTO oa_asset (tenant_id,asset_code,name,status,custodian_id,owner_id,deleted,version,create_by) VALUES
    (100000,'${marker}_custody','${marker}','IN_USE',${userId},NULL,0,2,'${marker}'),
    (100000,'${marker}_borrowed','${marker}','REPAIR',NULL,${userId},0,3,'${marker}'),
    (100000,'${marker}_wrong_id','${marker}','IN_USE',${employeeId},NULL,0,0,'${marker}'),
    (100001,'${marker}_foreign','${marker}','IN_USE',${userId},NULL,0,0,'${marker}'),
    (100000,'${marker}_deleted','${marker}','IN_USE',${userId},NULL,1,0,'${marker}'),
    (100000,'${marker}_conflict','${marker}','IN_USE',${userId},${employeeId},0,4,'${marker}'),
    (100000,'${marker}_returned','${marker}','IDLE',NULL,NULL,0,0,'${marker}');`);
  const actual = await get(employeeId);
  check('真实OA接口接受受信HR来源', actual.status === 200 && actual.body?.code === 200);
  check('离职且账号停用的员工仍可核实资产', String(actual.body.data.employeeId) === employeeId && String(actual.body.data.userId) === userId);
  const assets = actual.body.data.assets;
  check('保管和领用责任均列出，员工编号同值及跨租户资产不混入', assets.length === 3 && assets.every(asset => ['custody', 'borrowed', 'conflict'].some(suffix => asset.assetCode === `${marker}_${suffix}`)));
  check('资产归属冲突明确保留', assets.find(asset => asset.assetCode.endsWith('_conflict')).ownershipConsistent === false);
  check('资产来源保留实际版本', assets.find(asset => asset.assetCode.endsWith('_custody')).version === 2);
  check('资产清单不自动计算损失或外发购置金额', assets.every(asset => !Object.hasOwn(asset, 'amount') && !Object.hasOwn(asset, 'purchaseAmount') && !Object.hasOwn(asset, 'netBookValue')));
  rejected('直接访问缺少内部身份被拒绝', await get(employeeId, {}));
  rejected('错误来源服务被拒绝', await get(employeeId, { ...headers, 'X-From-Service': 'cloudflow-service-crm' }));
  rejected('缺少租户不能查询', await get(employeeId, { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-hr' }));
  rejected('跨租户员工不能变成空清单', await get(employeeId, { ...headers, 'X-Tenant-Id': '100001' }));
  rejected('网关拒绝伪造内部调用', await get(employeeId, headers, true));
  sql(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,employee_status,user_id,deleted,create_by)
    VALUES (100000,'${marker}_duplicate','${marker}','UNKNOWN','ACTIVE',${userId},0,'${marker}');`);
  rejected('同账号关联多个员工时明确未核实', await get(employeeId));
  sql(`UPDATE hr_employee SET user_id=NULL WHERE tenant_id=100000 AND employee_no='${marker}_duplicate' AND create_by='${marker}';
    UPDATE oa_asset SET custodian_id=NULL,owner_id=NULL,version=version+1 WHERE create_by='${marker}' AND tenant_id=100000;`);
  const returned = await get(employeeId);
  check('责任解除后返回已核实空清单', returned.status === 200 && returned.body?.code === 200 && returned.body.data.assets.length === 0);
  sql(`UPDATE sys_user SET deleted=1 WHERE tenant_id=100000 AND user_name='${marker}' AND create_by='${marker}';`);
  rejected('账号关联已失效时不返回假空清单', await get(employeeId));
  console.log(`H2_SETTLEMENT_ASSET_SOURCE_HTTP: checks=${checks}; failed=0; requests=${requests}; actual_oa=true; inner_access_tested=true; settlement_ui_tested=false; production_modified=false`);
} finally {
  await owned();
  sql(`DELETE FROM oa_asset WHERE create_by='${marker}' AND tenant_id IN (100000,100001);
    DELETE FROM hr_employee WHERE create_by='${marker}' AND tenant_id=100000;
    DELETE FROM sys_user WHERE create_by='${marker}' AND tenant_id=100000 AND user_name='${marker}';`);
  assert.equal(sql(`SELECT (SELECT COUNT(*) FROM oa_asset WHERE create_by='${marker}')+(SELECT COUNT(*) FROM hr_employee WHERE create_by='${marker}')+(SELECT COUNT(*) FROM sys_user WHERE create_by='${marker}');`), '0');
  assert.equal(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"), beforeTables);
  assert.equal(sql('SELECT CONCAT(tenant_id,\':\',role_id,\':\',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'), grants);
  console.log(`H2_SETTLEMENT_ASSET_SOURCE_CLEANUP: fixture_rows=0; runtime_tables=${beforeTables}; grants_unchanged=true; shared_redis_flush=false`);
}
