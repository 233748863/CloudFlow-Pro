import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2]);
const directory = path.dirname(statePath);
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const evidence = await fs.realpath(process.argv[3]);
assert.equal(path.dirname(evidence), directory);
assert.match(path.basename(evidence), /^im-callback-execution-[a-f0-9]{32}$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), directory);
const secret = process.env.CLOUDFLOW_IM_CALLBACK_CHECK_SECRET;
const roundTrip = process.argv[4] === 'todo-round-trip';
assert.match(secret ?? '', /^[A-F0-9]{64}$/);
const auth = state.services.find(service => service.name === 'auth');
const workflow = state.services.find(service => service.name === 'workflow');
const mysql = state.processes.find(process => process.name === 'mysql');
assert.equal(mysql.marker, path.join(directory, 'mysql-data'));
for (const port of [auth.port, workflow.port, state.mysqlPort]) assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
const environment = { ...process.env };
delete environment.MYSQL_PWD;
function database(statement) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, env: environment, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, 'Owned callback fixture SQL failed');
  return result.stdout.trim();
}
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(mysql.marker));
assert.equal(database('SELECT COUNT(*) FROM sys_im_config;'), '0', 'No vendor configurations allowed');
const tenant = randomInt(700000000, 900000000);
const config = tenant + 1;
const user = tenant + 2;
const role = tenant + 3;
const binding = tenant + 4;
const member = `callback-member-${tenant}`;
const samples = [secret];
const literal = value => value == null ? 'NULL' : `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
const encrypted = (field, value) => {
  const nonce = randomBytes(12);
  const key = createHash('sha256').update(`cloudflow:im:v1:${tenant}:WECOM:${field}:${secret}`).digest();
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const result = 'im1:' + Buffer.concat([nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
  samples.push(value, result);
  return literal(result);
};
let assertions = 0;
const check = (condition, label) => { assertions++; assert.ok(condition, label); };
const waitUntil = async (condition, timeout = 45000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 200)); }
  throw new Error('Callback execution condition timed out');
};
const fixture = { tenant, config, user, role, binding, tasks: [] };
await fs.writeFile(path.join(evidence, 'fixture.json'), JSON.stringify(fixture));
check(database(`SELECT COUNT(*) FROM sys_tenant WHERE tenant_id=${tenant};`) === '0', 'Unique dedicated tenant');
for (const [table, column, identifier] of [['sys_im_config','config_id',config], ['sys_user','user_id',user], ['sys_role','role_id',role], ['sys_im_user_mapping','mapping_id',binding]]) {
  check(database(`SELECT COUNT(*) FROM ${table} WHERE ${column}=${identifier};`) === '0', 'Unique fixture identity');
}
const menus = ['workflow:task:complete', 'workflow:task:todo', 'workflow:process:view'].map(permission => {
  const identifier = Number(database(`SELECT menu_id FROM sys_menu WHERE perms=${literal(permission)};`));
  assert.ok(Number.isSafeInteger(identifier) && identifier > 0);
  return identifier;
});
const buildTask = (action, enqueue = true, mapCard = true) => {
  const task = randomUUID();
  const definition = randomUUID();
  const instance = randomUUID();
  const event = randomInt(1000000000, 1500000000);
  const mapping = event + 1;
  check(database(`SELECT COUNT(*) FROM sys_im_callback_event WHERE callback_id=${event};`) === '0'
    && database(`SELECT COUNT(*) FROM sys_im_todo_mapping WHERE mapping_id=${mapping};`) === '0', 'Unique callback identity');
  const model = JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '开始' }, { id: 'review', type: 'APPROVAL', title: '审批', allowAgent: false }, { id: 'end', type: 'END', title: '结束' }],
    edges: [{ id: 'start-review', source: 'start', target: 'review' }, { id: 'review-end', source: 'review', target: 'end' }] });
  database(`START TRANSACTION;
    INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,model_json,status) VALUES(${literal(definition)},${tenant},'回调实际联调',${literal(definition)},${literal(model)},'PUBLISHED');
    INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,status,variables) VALUES(${literal(instance)},${tenant},${literal(definition)},${literal(definition)},${literal(instance)},${user},'RUNNING','{}');
    INSERT INTO wf_task(task_id,tenant_id,instance_id,node_key,node_name,assignee,assignee_name,status,create_time,lock_version) VALUES(${literal(task)},${tenant},${literal(instance)},'review','审批',${user},'联调账号','TODO',NOW(),0);
    ${mapCard ? `INSERT INTO sys_im_todo_mapping(mapping_id,tenant_id,config_id,task_id,assignment_version,receiver_user_id,im_type,im_user_id,card_key_hash,status,version) VALUES(${mapping},${tenant},${config},${literal(task)},0,${user},'WECOM',${literal(member)},${literal(createHash('sha256').update(task).digest('hex'))},'SENT',0);` : ''}
    ${enqueue ? `INSERT INTO sys_im_callback_event(callback_id,tenant_id,config_id,event_key,payload_hash,event_type,im_user_id,task_mapping_id,action_type,status,source_ip,occurred_time) VALUES(${event},${tenant},${config},${literal(createHash('sha256').update(String(event)).digest('hex'))},${literal('a'.repeat(64))},'template_card_event',${literal(member)},${mapping},${literal(action)},'RECEIVED','127.0.0.1',NOW());` : ''}
    COMMIT;`);
  const saved = { task, definition, instance, event, mapping, action };
  fixture.tasks.push(saved);
  return saved;
};
const eventState = event => JSON.parse(database(`SELECT JSON_OBJECT('status',status,'code',result_code) FROM sys_im_callback_event WHERE tenant_id=${tenant} AND callback_id=${event};`));
const historyCount = saved => Number(database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=${tenant} AND task_id=${literal(saved.task)};`));
const project = async (saved, expectedCode = 200) => {
  const response = await fetch(`http://127.0.0.1:${workflow.port}/inner/workflow/im-todo/project`, {
    method: 'POST', signal: AbortSignal.timeout(15000), headers: {
      'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth',
      'X-Tenant-Id': String(tenant), 'X-User-Id': '1', 'Authorization': 'Bearer forged', 'Cookie': 'Authorization=forged',
    }, body: JSON.stringify({ tenantId: tenant, mappingId: saved.mapping }),
  });
  const result = await response.json();
  check(result.code === expectedCode, 'Actual internal projection returns expected result code');
  return result.data;
};
let seeded = false;
const pausedJobs = [];
const ownedPauses = new Set();
try {
  if (roundTrip) {
    for (const handler of ['messageDeliveryRecovery', 'imTodoRecovery']) {
      const count = Number(database(`SELECT COUNT(*) FROM sys_job WHERE handler_name=${literal(handler)} AND deleted=0;`));
      assert.ok(handler === 'messageDeliveryRecovery' ? count === 1 : count === 0 || count === 1);
      if (count === 0) continue;
      const pausedJob = JSON.parse(database(`SELECT JSON_OBJECT('id',job_id,'tenant',tenant_id,'status',status,'version',version,'updated',update_time) FROM sys_job WHERE handler_name=${literal(handler)} AND deleted=0;`));
      assert.ok(['ENABLED', 'PAUSED'].includes(pausedJob.status));
      pausedJobs.push(pausedJob);
      await fs.writeFile(path.join(evidence, 'paused-delivery-jobs.json'), JSON.stringify(pausedJobs));
      if (pausedJob.status === 'ENABLED') {
        assert.equal(database(`UPDATE sys_job SET status='PAUSED',version=version+1 WHERE job_id=${pausedJob.id} AND tenant_id=${pausedJob.tenant} AND version=${pausedJob.version} AND status='ENABLED'; SELECT ROW_COUNT();`), '1');
        ownedPauses.add(pausedJob.id);
      }
      assert.equal(database(`SELECT status FROM sys_job WHERE job_id=${pausedJob.id};`), 'PAUSED');
      await waitUntil(() => database(`SELECT COUNT(*) FROM sys_job_log WHERE job_id=${pausedJob.id} AND execute_status='RUNNING';`) === '0');
    }
    await new Promise(resolve => setTimeout(resolve, 1500));
    for (const pausedJob of pausedJobs) assert.equal(database(`SELECT COUNT(*) FROM sys_job_log WHERE job_id=${pausedJob.id} AND execute_status='RUNNING';`), '0');
    console.log(`G4_IM_TODO_ROUND_TRIP_ISOLATION: delivery_jobs_paused=${pausedJobs.length}; in_flight=0; original_states_recorded=true`);
  }
  database(`START TRANSACTION;
    INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status) VALUES(${tenant},'callback_${tenant}','审批回调联调','0');
    INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted,pwd_reset_required) VALUES(${user},${tenant},'callback_${tenant}','联调账号','0',0,'0');
    INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status) VALUES(${role},${tenant},'审批回调联调','callback_check',1,'0');
    INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(${user},${role},${tenant});
    INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES${menus.map(menu => `(${role},${menu},${tenant})`).join(',')};
    INSERT INTO sys_im_config(config_id,tenant_id,im_type,corp_id,agent_id,app_secret_encrypted,token_encrypted,aes_key_encrypted,callback_url,status,todo_enabled,version) VALUES(${config},${tenant},'WECOM','callback-check','100001',${encrypted('APP_SECRET',randomBytes(24).toString('hex'))},${encrypted('TOKEN',randomBytes(16).toString('hex'))},${encrypted('AES_KEY',randomBytes(32).toString('base64').replace(/=$/,''))},${literal(`https://im-callback.example.invalid/api/auth/im/callback/${config}`)},'ENABLED',1,0);
    INSERT INTO sys_im_user_mapping(mapping_id,tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES(${binding},${tenant},${config},${user},'WECOM',${literal(member)},'SCAN_BIND',NOW(),'ACTIVE',0);
    COMMIT;`);
  seeded = true;
  await fs.writeFile(path.join(evidence, 'secret-samples.json'), JSON.stringify(samples));
  const plain = buildTask('APPROVE', false);
  const initial = await project(plain);
  check(initial.state === 'ACTIVE' && initial.directAction && initial.fields.length === 0, 'Plain task has no default form summary');
  const summary = buildTask('APPROVE', false);
  const form = randomUUID();
  const schema = JSON.stringify([
    { id: 'approved', label: '批准摘要', type: 'TEXT', imSummaryAllowed: true },
    { id: 'hidden', label: '隐藏字段', type: 'TEXT', imSummaryAllowed: true },
    { id: 'private', label: '未授权字段', type: 'TEXT' },
  ]);
  const values = Object.fromEntries(['approved', 'hidden', 'private', 'undeclared'].map(field => [field, randomBytes(24).toString('hex')]));
  samples.push(...Object.values(values));
  await fs.writeFile(path.join(evidence, 'secret-samples.json'), JSON.stringify(samples));
  await fs.writeFile(path.join(evidence, 'fixture.json'), JSON.stringify(fixture));
  database(`START TRANSACTION;
    INSERT INTO wf_form_definition(form_id,tenant_id,form_name,form_key,fields_json,form_schema,status,version,is_latest) VALUES(${literal(form)},${tenant},'摘要联调',${literal(form)},${literal(schema)},${literal(schema)},'ACTIVE',1,1);
    UPDATE wf_process_definition SET form_id=${literal(form)} WHERE tenant_id=${tenant} AND definition_id=${literal(summary.definition)};
    UPDATE wf_process_instance SET form_version=1,variables=${literal(JSON.stringify(values))} WHERE tenant_id=${tenant} AND instance_id=${literal(summary.instance)};
    INSERT INTO wf_form_field_permission(permission_id,tenant_id,definition_id,node_key,field_id,visible_flag,editable_flag,required_flag) VALUES(${literal(randomUUID())},${tenant},${literal(summary.definition)},'review','hidden',0,0,0);
    COMMIT;`);
  const filtered = await project(summary);
  check(filtered.state === 'ACTIVE' && filtered.directAction && filtered.fields.length === 1
    && filtered.fields[0].label === '批准摘要' && filtered.fields[0].value === values.approved, 'Actual services disclose only explicitly allowed visible field');
  const revokedSchema = schema.replaceAll('"imSummaryAllowed":true', '"imSummaryAllowed":false');
  database(`START TRANSACTION;
    UPDATE wf_form_definition SET is_latest=0 WHERE tenant_id=${tenant} AND form_id=${literal(form)};
    INSERT INTO wf_form_definition(form_id,tenant_id,form_name,form_key,fields_json,form_schema,status,version,is_latest) VALUES(${literal(form)},${tenant},'摘要联调',${literal(form)},${literal(revokedSchema)},${literal(revokedSchema)},'ACTIVE',2,1);
    COMMIT;`);
  check((await project(summary)).fields.length === 0, 'Latest administrator withdrawal removes previously allowed bound-version field');
  database(`UPDATE wf_process_instance SET form_version=NULL WHERE tenant_id=${tenant} AND instance_id=${literal(summary.instance)};`);
  const unknown = await project(summary);
  check(unknown.fields.length === 0 && !unknown.directAction, 'Unknown form version allows details only');
  database(`UPDATE wf_process_instance SET form_version=1 WHERE tenant_id=${tenant} AND instance_id=${literal(summary.instance)};
    UPDATE wf_task SET task_type='ADD_SIGN' WHERE tenant_id=${tenant} AND task_id=${literal(summary.task)};`);
  check(!(await project(summary)).directAction, 'Complex task allows details only');
  database(`UPDATE wf_task SET task_type='APPROVAL',lock_version=lock_version+1 WHERE tenant_id=${tenant} AND task_id=${literal(summary.task)};`);
  const stale = await project(summary);
  check(stale.state === 'CANCELLED' && stale.fields.length === 0 && !stale.directAction && !stale.title, 'Changed task version contains no active content');
  database(`UPDATE wf_task SET status='COMPLETED',lock_version=lock_version+1 WHERE tenant_id=${tenant} AND task_id=${literal(summary.task)};`);
  const completed = await project(summary);
  check(completed.state === 'COMPLETED' && completed.fields.length === 0 && !completed.title, 'Completed task exposes only terminal state');
  database(`UPDATE sys_im_user_mapping SET status='DISABLED',version=version+1 WHERE tenant_id=${tenant} AND mapping_id=${binding};`);
  check(!await project(plain, 403), 'Actual auth binding revocation prevents all projection content');
  database(`UPDATE sys_im_user_mapping SET status='ACTIVE',version=version+1 WHERE tenant_id=${tenant} AND mapping_id=${binding};`);
  check(historyCount(plain) === 0 && historyCount(summary) === 0, 'Projection performs no approval action');
  console.log('G4_IM_TODO_PROJECTION_LIVE: actual_auth=true; actual_workflow=true; actual_feign=true; recipient_database=true; field_permissions=true; permission_withdrawal=true; complex_details=true; version_changes=true; binding_revocation=true; external_sends=0');
  for (const action of ['APPROVE', 'REJECT']) {
    const saved = buildTask(action);
    await fs.writeFile(path.join(evidence, 'fixture.json'), JSON.stringify(fixture));
    await waitUntil(() => ['COMPLETED','REJECTED'].includes(eventState(saved.event).status));
    const result = eventState(saved.event);
    console.log(`G4_IM_CALLBACK_EXECUTION_CASE: action=${action}; status=${result.status}; code=${result.code}`);
    check(result.status === 'COMPLETED', 'Real recovery and both services complete approval');
    check(historyCount(saved) === 1, 'Exactly one real task action');
    const history = createHash('sha256').update(`wecom-callback\n${tenant}\n${saved.event}`).digest('hex');
    check(database(`SELECT COUNT(*) FROM wf_task_history WHERE history_id=${literal(history)} AND task_id=${literal(saved.task)} AND operator_id=${user} AND action=${literal(action)};`) === '1', 'Exact event action and actor history');
    database(`UPDATE sys_im_callback_event SET status='RETRYABLE',claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE tenant_id=${tenant} AND callback_id=${saved.event} AND status='COMPLETED';`);
    await waitUntil(() => eventState(saved.event).status === 'COMPLETED');
    check(historyCount(saved) === 1, 'Response-loss retry restores same history without reapproval');
  }
  console.log(`G4_IM_CALLBACK_EXECUTION_LIVE: assertions=${assertions}; failed=0; actual_auth=true; actual_workflow=true; actual_recovery=true; actual_feign=true; real_mysql=true; real_redis_task_lock=true; approvals=2; response_loss_recoveries=2; events=database_fixture; vendor_service=false; production_modified=false`);
  if (roundTrip) {
    fixture.roundTrips = ['APPROVE', 'REJECT'].map(action => buildTask(action, false, false));
    await fs.writeFile(path.join(evidence, 'fixture.json'), JSON.stringify(fixture));
    const execution = spawnSync('java', ['@' + path.join(evidence, 'round-trip.args')], { env: environment, encoding: 'utf8', timeout: 240000, windowsHide: true });
    await fs.writeFile(path.join(evidence, 'round-trip-java.log'), (execution.stdout ?? '') + (execution.stderr ?? ''));
    for (const line of (execution.stdout ?? '').split(/\r?\n/)) if (/^G4_IM_TODO_ROUND_TRIP[_A-Z]*:/.test(line)) console.log(line);
    assert.equal(execution.status, 0, 'Full todo round trip failed; private evidence retained');
  }
} finally {
  if (seeded) {
    database(`UPDATE sys_im_config SET status='DISABLED',todo_enabled=0,version=version+1 WHERE tenant_id=${tenant} AND config_id=${config};`);
    const unfinished = database(`SELECT COUNT(*) FROM sys_im_callback_event WHERE tenant_id=${tenant} AND status='PROCESSING' AND claim_until>NOW();`);
    if (unfinished !== '0') await waitUntil(() => database(`SELECT COUNT(*) FROM sys_im_callback_event WHERE tenant_id=${tenant} AND status='PROCESSING' AND claim_until>NOW();`) === '0', 65000);
    const tables = ['sys_im_callback_event','sys_im_todo_mapping','sys_message_delivery','sys_message_record','sys_message_channel','outbox_event','sys_im_user_mapping','sys_im_config','wf_task_history','wf_task_read','wf_task_candidate','wf_task','wf_node_monitor','wf_node_record','wf_process_snapshot','wf_process_instance','wf_form_field_permission','wf_form_definition','wf_process_definition','sys_user_role','sys_role_menu','sys_role','sys_user','sys_tenant'];
    for (const table of tables) database(`DELETE FROM ${table} WHERE tenant_id=${tenant};`);
    check(database(`SELECT COUNT(*) FROM sys_tenant WHERE tenant_id=${tenant};`) === '0', 'Owned tenant fixture removed');
    console.log('G4_IM_CALLBACK_EXECUTION_CLEANUP: primary_business_fixture_removed=true; audit_records_preserved=true; unrelated_tenants_unchanged=true');
  }
  for (const pausedJob of pausedJobs) {
    assert.equal(database(`SELECT COUNT(*) FROM sys_message_delivery WHERE tenant_id=${tenant};`), '0');
    if (ownedPauses.has(pausedJob.id)) {
      const changed = database(`UPDATE sys_job SET status=${literal(pausedJob.status)},version=version+1 WHERE job_id=${pausedJob.id} AND tenant_id=${pausedJob.tenant} AND version=${pausedJob.version + 1} AND status='PAUSED'; SELECT ROW_COUNT();`);
      assert.equal(changed, '1', 'Owned delivery job changed externally; original state retained for review');
    } else assert.equal(database(`SELECT status FROM sys_job WHERE job_id=${pausedJob.id};`), pausedJob.status);
  }
  if (pausedJobs.length) console.log(`G4_IM_TODO_ROUND_TRIP_JOB_RESTORED: jobs=${pausedJobs.length}; original_states_restored=true; fixture_deliveries=0; unrelated_jobs_unchanged=true`);
}
