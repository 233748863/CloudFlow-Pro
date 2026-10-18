import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyContractFulfilmentScope } from './verify-oa-contract-fulfilment-scope.mjs';

// Dates, admission states and two test users' departments are owned fixtures. The platform job and delivery are real.
export async function verifyOaContractReminders({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `F4_REMIND_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const users = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'department',CAST(dept_id AS CHAR),'name',user_name) FROM sys_user WHERE tenant_id=100000 AND user_name IN ('g_import_admin','g_holiday_employee') AND deleted=0 AND status='0';");
  assert.equal(users.length, 2);
  const owner = users.find(user => user.name === 'g_import_admin');
  const staff = users.find(user => user.name === 'g_holiday_employee');
  for (const user of users) {
    assert.match(user.id, /^[1-9][0-9]*$/);
    if (user.department !== null) assert.match(user.department, /^[0-9]+$/);
  }
  const employee = await session('g_holiday_employee');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const date = offset => database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${offset} DAY),'%Y-%m-%d');`);
  const today = date(0);
  const configured = database("SELECT config_value FROM sys_config WHERE config_key='sys.oa.contract.fulfilmentReminderDays' AND config_scope='0';");
  assert.ok(configured === '' || configured === '7', 'This fixture requires the existing seven-day reminder threshold');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE tenant_id=100000 AND job_id=1656 AND service_name='oa' AND handler_name='oaContractFulfilmentScan';"), '1');
  const departments = new Map();
  for (const [user, manager] of [[owner, staff.id], [staff, null]]) {
    const name = `F4R_${caseTag}_${user === owner ? 'lead' : 'solo'}`;
    database(`INSERT INTO sys_dept(tenant_id,parent_id,ancestors,dept_name,leader,status,create_by,create_time)
      VALUES(100000,0,'0',${sql(name)},${manager ? sql(manager) : 'NULL'},'0',${sql(marker)},NOW());`);
    const id = database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name=${sql(name)} AND create_by=${sql(marker)};`);
    assert.match(id, /^[1-9][0-9]*$/); departments.set(user.id, id);
  }
  const contracts = [];
  const fixture = (suffix, contractOwner = owner.id, deadline = 30, tracking = 1) => {
    const name = `${marker}_${suffix}`;
    database(`INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,
      owner_id,owner_name,dept_id,status,requires_fulfilment_flag,fulfilment_deadline,start_date,end_date,create_by)
      VALUES(100000,${sql(name)},${sql(name)},${sql(marker)},'OTHER',0.00,'CNY',${contractOwner},${sql(marker)},
        ${departments.get(contractOwner)},'ACTIVE',${tracking},${sql(date(deadline))},${sql(today)},${sql(date(60))},${sql(marker)});`);
    const id = database(`SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=${sql(name)} AND create_by=${sql(marker)};`);
    assert.match(id, /^[1-9][0-9]*$/); contracts.push(id); return id;
  };
  const term = async (contractId, number, offset, responsible = staff.id) => String(successful(await api(admin, '/oa/contract/terms', {
    method: 'POST', body: { contractId: Number(contractId), termNo: number, termCategory: 'SERVICE', termContent: `${marker}_${number}`,
      requirement: `${marker}_return_${number}`, responsibleParty: 'OUR', responsibleId: Number(responsible), deadlineDate: date(offset), sortNo: number },
  }), '保存实际待提醒条款'));
  const records = (type, id) => rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'receiver',CAST(receiver_id AS CHAR),'status',send_status,'channel',channel_type,'event',outbox_event_id,'sentAt',send_time)
    FROM sys_message_record WHERE tenant_id=100000 AND biz_type=${sql(type)} AND biz_id=${sql(id)} ORDER BY record_id;`);
  const riskCount = (id, code) => Number(database(`SELECT COUNT(*) FROM oa_risk_alert WHERE tenant_id=100000 AND business_type='CONTRACT'
    AND business_id=${id} AND risk_code=${sql(code)};`));
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 90000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 500)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  let lastTrigger = 0;
  const trigger = async () => {
    const remaining = 5200 - (Date.now() - lastTrigger);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    const result = successful(await api(admin, '/auth/system/job/1656/trigger', { method: 'POST', body: {} }), '从集中任务平台触发合同履约扫描');
    assert.match(result.executeNo, /^[A-Za-z0-9_-]+$/); assert.equal(result.accepted, true);
    await waitFor(() => database(`SELECT execute_status FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${sql(result.executeNo)};`),
      status => status === 'SUCCESS', '合同履约扫描任务未实际完成');
    lastTrigger = Date.now();
  };
  try {
    for (const user of users) database(`UPDATE sys_user SET dept_id=${departments.get(user.id)} WHERE tenant_id=100000 AND user_id=${user.id} AND user_name=${sql(user.name)};`);
    const tracked = fixture('tracked');
    const due = await term(tracked, 1, 7); const later = await term(tracked, 2, 8); const overdue = await term(tracked, 3, -1);
    const done = await term(tracked, 4, 7); const waived = await term(tracked, 5, 7);
    successful(await api(admin, `/oa/contract/terms/${done}/confirm`, { method: 'POST', body: { fulfilledDate: today } }), '确认免提醒条款');
    successful(await api(admin, `/oa/contract/terms/${waived}/waive`, { method: 'POST', body: { waivedReason: marker } }), '豁免免提醒条款');
    const breached = fixture('breached', owner.id, -1); await term(breached, 1, 20);
    const disabled = fixture('disabled', owner.id, 30, 0); const disabledTerm = await term(disabled, 1, -1);
    // Model a date boundary since the last calculation; the real scheduled scan must update these stale flags.
    database(`UPDATE oa_contract_fulfilment_term SET overdue_flag=0 WHERE tenant_id=100000 AND term_id=${overdue};
      UPDATE oa_contract SET fulfilment_status='ONGOING' WHERE tenant_id=100000 AND contract_id IN (${tracked},${breached});`);
    await trigger();
    check('实际集中任务完成履约扫描', true); evidence.job = true;
    const delivered = await waitFor(() => records('CONTRACT_TERM', due), items => items.length === 1 && items[0].status === 'SUCCESS', '到期前提醒未实际送达');
    check('提前七自然日的条款送达指定责任人站内消息', delivered[0].receiver === staff.id && delivered[0].channel === 'INTERNAL'
      && Boolean(delivered[0].event) && Boolean(delivered[0].sentAt));
    check('八日外、已履约、已豁免及关闭跟踪条款均不提醒', [later, done, waived, disabledTerm].every(id => records('CONTRACT_TERM', id).length === 0));
    const overdueNotice = await waitFor(() => records('CONTRACT_TERM', overdue), items => items.length === 1 && items[0].status === 'SUCCESS', '逾期提醒未送达');
    check('逾期条款实际标记并创建唯一风险和责任人提醒', overdueNotice[0].receiver === staff.id
      && riskCount(tracked, `TERM_OVERDUE_${overdue}`) === 1
      && database(`SELECT fulfilment_status FROM oa_contract WHERE tenant_id=100000 AND contract_id=${tracked};`) === 'PARTIALLY_BREACHED'
      && database(`SELECT overdue_flag FROM oa_contract_fulfilment_term WHERE tenant_id=100000 AND term_id=${overdue};`) === '1');
    evidence.due = true; evidence.overdue = true;
    const escalated = await waitFor(() => records('CONTRACT_BREACHED', breached), items => items.length === 2 && items.every(item => item.status === 'SUCCESS'), '整体违约提醒未送达负责人及上级');
    check('整体违约分别送达负责人和真实部门上级', new Set(escalated.map(item => item.receiver)).size === 2
      && [owner.id, staff.id].every(id => escalated.some(item => item.receiver === id)) && riskCount(breached, 'FULFILMENT_BREACHED') === 1);
    database(`UPDATE sys_user SET dept_id=${departments.get(staff.id)} WHERE tenant_id=100000 AND user_id=${owner.id} AND dept_id=${departments.get(owner.id)};`);
    departments.set(owner.id, departments.get(staff.id));
    const noManager = fixture('no_manager', owner.id, -1); await term(noManager, 1, 20);
    database(`UPDATE oa_contract SET fulfilment_status='ONGOING' WHERE tenant_id=100000 AND contract_id=${noManager};`);
    await trigger();
    const solo = await waitFor(() => records('CONTRACT_BREACHED', noManager), items => items.length === 1 && items[0].status === 'SUCCESS', '无上级负责人未收到违约提醒');
    check('无上级时保留负责人唯一提醒', solo[0].receiver === owner.id && riskCount(noManager, 'FULFILMENT_BREACHED') === 1); evidence.escalation = true;
    const mine = successful(await api(employee, `/auth/system/message/mine/${delivered[0].id}`), '责任人读取实际履约提醒');
    check('消息接收者能读取原合同和履约要求', mine.content.includes(marker));
    const denied = await api(admin, `/auth/system/message/mine/${delivered[0].id}`);
    check('其他账号不能读取该员工的私人提醒', denied.body?.code !== 200 && !denied.body?.data);
    await trigger();
    check('重复扫描不重复消息或风险', records('CONTRACT_TERM', due).length === 1 && records('CONTRACT_TERM', overdue).length === 1
      && records('CONTRACT_BREACHED', breached).length === 2 && records('CONTRACT_BREACHED', noManager).length === 1
      && riskCount(tracked, `TERM_OVERDUE_${overdue}`) === 1 && riskCount(breached, 'FULFILMENT_BREACHED') === 1); evidence.deduplication = true;
    await verifyContractFulfilmentScope({ admin, api, successful, database, check, caseTag, owner, fixture, term, trigger, records, riskCount, waitFor, evidence });
    check('本轮履约提醒没有外部渠道记录', database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND channel_type<>'INTERNAL'
      AND ((biz_type='CONTRACT_BREACHED' AND biz_id IN (${contracts.join(',')})) OR (biz_type='CONTRACT_TERM' AND biz_id IN (${[due,later,overdue,done,waived,disabledTerm].join(',')})));`) === '0');
  } finally {
    for (const user of users) database(`UPDATE sys_user SET dept_id=${user.department ?? 'NULL'} WHERE tenant_id=100000 AND user_id=${user.id}
      AND user_name=${sql(user.name)} AND dept_id=${departments.get(user.id)};`);
    for (const user of users) assert.equal(database(`SELECT COALESCE(CAST(dept_id AS CHAR),'NULL') FROM sys_user WHERE tenant_id=100000 AND user_id=${user.id};`), user.department ?? 'NULL');
    console.log('F4_CONTRACT_REMINDERS_RESTORED: user_departments=2; grants_unchanged=' + String(originalGrants === grants()) + '; fixtures_and_business_retained=true');
  }
  check('恢复两名测试员工原部门且角色菜单授权未变', originalGrants === grants());
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, file)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('履约提醒六服务及数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`F4_CONTRACT_REMINDERS_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log('F4_CONTRACT_REMINDERS_SCOPE: actual_job_and_internal_delivery=true; dates_states_and_departments_are_fixtures=true; external_delivery=false; production_modified=false');
}
