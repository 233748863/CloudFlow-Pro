import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repair only definitions incorrectly soft-deleted by named verification helpers, never workflow outcomes.
export async function repairB2DefinitionFixtures({ admin, api, successful, database, check, caseTag, accounts, evidence }) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  // Prefixes originate in the owned business-lock, timer, timeout, natural, B1 and B2 helpers.
  const pattern = '^(A3BL|A3M|A3T|A3N|A3TR|B2HT|B2H|B2SG|B2TA|B2WD|B2ST|B1AP|B1TC)[a-f0-9]{12}($|-)';
  const definitions = rows("SELECT JSON_OBJECT('id',definition_id,'key',process_key,'modelHash',SHA2(model_json,256),'status',status) FROM wf_process_definition WHERE tenant_id=100000 AND deleted=1 AND process_key REGEXP " + sql(pattern) + ' ORDER BY definition_id;');
  assert.ok(definitions.length <= 300, 'Unexpected fixture repair scope');
  const users = accounts.map(account => account.username); assert.ok(users.length > 0);
  const ids = definitions.map(definition => sql(definition.id)).join(',');
  const terminal = "('PASSED','AUTO_PASSED','REJECTED','TERMINATED','INVALIDATED','CANCELLED')";
  const business = () => definitions.length ? database("SELECT instance_id,SHA2(JSON_OBJECT('status',status,'variables',variables,'version',lock_version,'end',end_time,'deleted',deleted),256) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (" + ids + ') ORDER BY instance_id;') : '';
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const beforeBusiness = business(), beforeGrants = grants();
  if (definitions.length) {
    assert.equal(database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (' + ids + ') AND status NOT IN ' + terminal + ';'), '0', 'No live workflow may be repaired');
    assert.equal(database('SELECT COUNT(*) FROM wf_process_instance i LEFT JOIN sys_user u ON u.user_id=i.start_user_id AND u.tenant_id=i.tenant_id WHERE i.tenant_id=100000 AND i.definition_id IN (' + ids + ') AND (u.user_name IS NULL OR u.user_name NOT IN (' + users.map(sql).join(',') + '));'), '0', 'Only owned fixture accounts may be affected');
    const manifest = { kind:'owned-definition-archive-repair', tenant:100000, definitions, workflowOutcomeWrites:0, historicalInstancesPreserved:true };
    await fs.writeFile(path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime','b2-definition-fixture-repair-' + caseTag + '.json'), JSON.stringify(manifest,null,2) + '\n', {flag:'wx'});
    for (const definition of definitions) {
      assert.equal(database("UPDATE wf_process_definition SET deleted=0,status='ARCHIVED' WHERE tenant_id=100000 AND deleted=1 AND definition_id=" + sql(definition.id) + ' AND process_key=' + sql(definition.key) + ' AND SHA2(model_json,256)=' + sql(definition.modelHash) + '; SELECT ROW_COUNT();'), '1', 'Owned fixture definition changed during repair');
    }
    const after = rows("SELECT JSON_OBJECT('id',definition_id,'key',process_key,'modelHash',SHA2(model_json,256),'status',status,'deleted',deleted) FROM wf_process_definition WHERE tenant_id=100000 AND definition_id IN (" + ids + ') ORDER BY definition_id;');
    check('仅恢复自有历史定义为归档且模型保持', after.length === definitions.length && after.every((definition,index) => definition.id === definitions[index].id && definition.key === definitions[index].key && definition.modelHash === definitions[index].modelHash && definition.status === 'ARCHIVED' && definition.deleted === 0));
  }
  check('历史定义修复未改变实例状态内容及角色授权', business() === beforeBusiness && grants() === beforeGrants);
  const list = successful(await api(admin, '/workflow/wf/my-instances?pageNum=1&pageSize=20'), '恢复测试定义后读取我的申请');
  check('我的申请真实列表恢复且历史记录保留', Number.isInteger(list.total) && Array.isArray(list.rows) && list.rows.length <= 20);
  evidence.definitionFixtureArchive = true;
  console.log('B2_DEFINITION_FIXTURE_REPAIR: ' + JSON.stringify({ definitions:definitions.length, tenant:100000, historicalInstancesPreserved:true, modelContentPreserved:true, workflowOutcomeWrites:0, permissionsModified:false, actualMyInstancesRead:true }));
}
