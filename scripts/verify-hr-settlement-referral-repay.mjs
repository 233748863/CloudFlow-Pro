import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Continue one retained, actually reversed settlement. Never manufacture financial states.
export async function verifySettlementReferralRepayment(context, previous) {
  const { admin, api, successful, database, check, state, directory, caseTag, accounts, requests, evidence } = context;
  assert.match(previous, /^[a-f0-9]{12}$/);
  const retained = JSON.parse(await fs.readFile(path.join(directory, `h2-settlement-referral-results-${previous}.json`), 'utf8'));
  const prior = retained.evidence.combination;
  assert.ok(prior.referralCombination && prior.restoration && prior.secrets && prior.resignationCompleted);
  const { referral, payroll, training, leaves, employeeId, advanceId, applicationId, settlementId: originalId,
    reversalId, replacementDraftId: id } = prior;
  for (const value of [employeeId, advanceId, applicationId, originalId, reversalId, id, referral.referralId, referral.changeId,
    payroll.salaryId, training.recoveryId, ...leaves.flatMap(item => [item.quotaId, item.leaveTypeId, item.periodId])]) assert.match(value, /^[1-9]\d*$/);
  const marker = `h2rp_${caseTag}`, root = `/hr/settlement/${id}`;
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const originalAmounts = rows(`SELECT JSON_OBJECT('net',CAST(net_amount AS CHAR),'assetLoss',CAST(asset_recovery_cost AS CHAR))
    FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${originalId} AND settlement_kind='NORMAL' AND status='CLOSED';`);
  assert.equal(originalAmounts.length, 1, 'One actually closed original payment required');
  assert.equal(originalAmounts[0].assetLoss, '100.00', 'Original combination retained its verified asset loss');
  const cents = value => { assert.match(value, /^\d+\.\d{2}$/); return BigInt(value.replace('.', '')); };
  // The original payment is immutable. Returning the asset removes precisely its original
  // 100-yuan loss; all original wage, bonus, leave, loan and training sources remain unchanged.
  const expectedCents = cents(originalAmounts[0].net) + cents(originalAmounts[0].assetLoss);
  const expectedAmount = `${expectedCents / 100n}.${String(expectedCents % 100n).padStart(2, '0')}`;
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const reject = (result, label) => check(label, [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 90000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 600)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const audit = operation => rows(`SELECT after_data FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL'
    AND business_id=${referral.referralId} AND operation_type=${sql(operation)} ORDER BY id;`);
  const paidBefore = audit('BONUS_PAID'), returnedBefore = audit('BONUS_SETTLEMENT_RETURNED');
  check('续付只接续已实际付款并实际退回一次的原奖金', paidBefore.length === 1 && returnedBefore.length === 1
    && returnedBefore[0].originalPaymentEventId === paidBefore[0].paymentEventId
    && String(paidBefore[0].settlementId) === originalId && String(returnedBefore[0].reversalSettlementId) === reversalId);
  // Repayment rows appended by this run are checked separately; immutable old IDs are frozen below.
  const digestQuery = (table, order) => {
    const columns = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=${sql(table)} ORDER BY ordinal_position;`).split(/\r?\n/);
    for (const column of columns) assert.match(column, /^[a-z_][a-z0-9_]*$/);
    return `SELECT ${order},SHA2(JSON_ARRAY(${columns.map(column => `CAST(\`${column}\` AS CHAR)`).join(',')}),256)
      FROM ${table} WHERE tenant_id=100000 AND settlement_id IN (${originalId},${reversalId}) ORDER BY ${order};`;
  };
  // Hash every column inside MySQL so large calculation evidence never fills the child-process output buffer.
  const settlementDigestQuery = digestQuery('hr_final_settlement', 'settlement_id') + digestQuery('hr_final_settlement_item', 'item_id');
  const originalSettlement = () => database(settlementDigestQuery);
  const oldSnapshot = originalSettlement();
  const oldRepaymentIds = database(`SELECT repayment_id FROM hr_advance_repayment WHERE tenant_id=100000 AND advance_id=${advanceId} AND status!='RESERVED' ORDER BY repayment_id;`).split(/\r?\n/);
  for (const value of oldRepaymentIds) assert.match(value, /^[1-9]\d*$/);
  const repaymentHistory = () => database(`SELECT * FROM hr_advance_repayment WHERE tenant_id=100000 AND repayment_id IN (${oldRepaymentIds.join(',')}) ORDER BY repayment_id;`);
  const historyBefore = repaymentHistory();
  const originalRoles = () => database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const rolesBefore = originalRoles();
  const roleMenus = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const menusBefore = roleMenus();
  const summary = evidence.repayment = { previous, originalId, reversalId, settlementId: id, employeeId, referralId: referral.referralId,
    expectedAmount, originalNetAmount: originalAmounts[0].net, returnedAssetLoss: originalAmounts[0].assetLoss };
  const secrets = new Set(accounts.map(item => item.password).filter(Boolean)), identities = [];
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, '')); return page;
  };
  await remember(admin);
  const configKey = 'sys.hr.settlement.processKey', configRoot = '/auth/system/config';
  const configured = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原结算流程配置').records.find(row => row.configKey === configKey);
  let configChanged = false, failure;
  const createPerson = async (suffix, role) => {
    const username = `${marker}_${suffix}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${sql(username)},${sql(username)},password,'0',0,'0',${sql(marker)},NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND create_by=${sql(marker)};`);
    assert.match(userId, /^[1-9]\d*$/); identities.push(userId);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${role});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${sql(username)},${sql(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    return { userId, page: await remember(await context.session(username, 'g_holiday_employee')) };
  };
  try {
    check('续付草稿仍属于原真实离职员工且原单和冲正已关闭', database(`SELECT COUNT(*) FROM hr_final_settlement s
      JOIN hr_lifecycle_application a ON a.tenant_id=s.tenant_id AND a.id=s.lifecycle_application_id
      JOIN hr_employee e ON e.tenant_id=s.tenant_id AND e.id=s.employee_id
      JOIN sys_user u ON u.tenant_id=e.tenant_id AND u.user_id=e.user_id
      WHERE s.tenant_id=100000 AND s.settlement_id=${id} AND s.employee_id=${employeeId} AND s.lifecycle_application_id=${applicationId}
      AND s.status='DRAFT' AND s.approval_status='DRAFT' AND s.net_amount=${expectedAmount} AND s.settlement_kind='NORMAL'
      AND a.status='COMPLETED' AND e.employee_no=${sql(`h2ap_${previous}_employee`)} AND e.employee_status='RESIGNED' AND u.status='1';`) === '1'
      && database(`SELECT COUNT(*) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id IN (${originalId},${reversalId}) AND status='CLOSED';`) === '2');
    const hrIdentity = await createPerson('hr', 4), financeIdentity = await createPerson('finance', 3);
    const hr = hrIdentity.page, finance = financeIdentity.page;
    const read = async () => successful(await api(hr, root), '读取原冲正后续付草稿');
    let row = await read();
    const salaryIds = row.items.filter(item => item.sourceBizType === 'HR_SALARY_SLIP').map(item => String(item.sourceBizId));
    check('续付保持两张原工资且包含实际奖金工资', salaryIds.length === 2 && salaryIds.includes(payroll.salaryId));
    for (const value of salaryIds) assert.match(value, /^[1-9]\d*$/);
    const observe = (stage, current) => {
      const posted = ['posted', 'closed', 'replayed'].includes(stage), held = ['submitted', 'approved', 'confirmed'].includes(stage);
      check(`续付${stage}金额按已归还资产重新计算且无重复奖金行`, current.netAmount === expectedAmount && current.assetRecoveryCost === '0.00'
        && !current.items.some(item => item.sourceBizType === 'HR_REFERRAL'));
      const wage = current.items.find(item => item.sourceBizType === 'HR_SALARY_SLIP' && String(item.sourceBizId) === payroll.salaryId);
      const components = wage?.evidence.components.filter(item => item.sourceBizType === 'HR_REFERRAL') || [];
      check(`续付${stage}工资仅含唯一1234.56元奖金`, wage?.amount === payroll.netAmount && components.length === 1
        && String(components[0].changeId) === referral.changeId && Number(components[0].amount) === 1234.56
        && database(`SELECT digest_sha256 FROM hr_salary_slip WHERE tenant_id=100000 AND id=${payroll.salaryId};`) === payroll.digest);
      const paid = audit('BONUS_PAID');
      check(`续付${stage}保留原付款退回及录用证据`, JSON.stringify(paid[0]) === JSON.stringify(paidBefore[0])
        && JSON.stringify(audit('BONUS_SETTLEMENT_RETURNED')) === JSON.stringify(returnedBefore)
        && JSON.stringify(audit('EMPLOYMENT_SOURCE')) === JSON.stringify(referral.employment)
        && originalSettlement() === oldSnapshot && repaymentHistory() === historyBefore);
      check(`续付${stage}仅在第二次实际付款后标记奖金已付`, paid.length === (posted ? 2 : 1)
        && database(`SELECT CONCAT(bonus_status,':',IF(bonus_pay_date IS NULL,'NULL','DATED'),':',comp_change_id) FROM hr_employee_referral
          WHERE tenant_id=100000 AND referral_id=${referral.referralId};`) === `${posted ? 'PAID:DATED' : 'APPROVED:NULL'}:${referral.changeId}`);
      if (posted) check('第二次奖金付款独立编号并关联原退回和新结算', paid[1].paymentEventId !== paid[0].paymentEventId
        && typeof paid[1].paymentEventId === 'string' && paid[1].paymentEventId.length > 0
        && paid[1].previousReturnedPaymentEventId === paid[0].paymentEventId && String(paid[1].settlementId) === id
        && String(paid[1].salarySlipId) === payroll.salaryId && String(paid[1].compChangeId) === referral.changeId && paid[1].amount === referral.amount);
      check(`续付${stage}两张原工资按阶段预约和入账`, database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000
        AND id IN (${salaryIds.join(',')}) AND status='${posted ? 'PAID' : 'SUBMITTED'}'
        AND ${held || posted ? `reserved_settlement_id=${id}` : 'reserved_settlement_id IS NULL'};`) === '2');
      check(`续付${stage}借款50元工资扣还与50元结算扣还共同结清`, database(`SELECT CONCAT(outstanding_amount,':',repaid_amount,':',reserved_amount)
        FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${advanceId};`) === (posted ? '0.00:100.00:0.00' : held ? '100.00:0.00:100.00' : '100.00:0.00:50.00'));
      check(`续付${stage}培训仅在实际付款后重新收回123.45元`, database(`SELECT CONCAT(status,':',collected_amount,':',COALESCE(settlement_id,'NULL'))
        FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${training.recoveryId};`) === `${posted ? 'CLEARED:123.45' : 'CONFIRMED:0.00'}:${held || posted ? id : 'NULL'}`);
      for (const leave of leaves) {
        check(`续付${stage}${leave.unit}假期只扣回原数量`, database(`SELECT CONCAT(total_quota,':',used_quota,':',frozen_quota,':',available_quota)
          FROM hr_leave_quota WHERE tenant_id=100000 AND id=${leave.quotaId};`) === `${leave.quantity}:${posted ? leave.quantity : '0.00'}:${held ? leave.quantity : '0.00'}:${held || posted ? '0.00' : leave.quantity}`);
        check(`续付${stage}${leave.unit}保留原折现返还且只新增一次折现`, database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000
          AND employee_id=${employeeId} AND leave_type_id=${leave.leaveTypeId} AND leave_period_id=${leave.periodId} AND transaction_type='ENCASHMENT';`) === (posted ? '2' : '1')
          && database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId} AND leave_type_id=${leave.leaveTypeId}
            AND leave_period_id=${leave.periodId} AND reversal_of_id IS NOT NULL;`) === '1');
      }
      console.log(`H2_REFERRAL_REPAY_STAGE: stage=${stage}; settlement=${id}; amount=${current.netAmount}; bonus_payments=${paid.length}`);
    };
    observe('draft', row);
    row = successful(await post(hr, `${root}/calculate`, { version: row.version }), '续付按仍有效的原政策重新核对来源');
    check('真实离职后原政策和全部结算来源仍齐备', row.missingRequirements.length === 0);
    const model = { nodes: [{ id: 'start', type: 'START', title: '人事提交' },
      { id: 'finance', type: 'APPROVAL', title: '独立财务复核', approverType: 'VARIABLE_USER', approverValue: 'financeApproverIds', signType: 'ANY', allowDelegate: false, allowAddSign: false },
      { id: 'end', type: 'END', title: '完成' }], edges: [{ id: 'first', source: 'start', target: 'finance' }, { id: 'second', source: 'finance', target: 'end' }] };
    database(`INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES (${sql(marker)},100000,${sql(marker)},${sql(marker)},1,${sql(JSON.stringify(model))},'PUBLISHED',1,0);`);
    successful(await api(admin, configRoot, { method: configured ? 'PUT' : 'POST', body: { ...(configured || {}), configKey,
      configName: marker, configValue: marker, configType: 'N', configScope: '1' } }), '为续付配置独立财务复核'); configChanged = true;
    reject(await post(finance, `${root}/submit`, { version: row.version }), '财务不能代人事提交续付');
    successful(await post(hr, `${root}/submit`, { version: row.version }), '人事提交原草稿续付');
    const instanceId = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id};`), Boolean, '续付未建立审批实例');
    const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=${sql(instanceId)} AND status='TODO';`), values => values.some(item => item.assignee === financeIdentity.userId), '续付财务未取得真实待办');
    const employeeUserId = database(`SELECT user_id FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId};`);
    check('续付财务候选全部回避人事提交人和离职本人', tasks.every(item => item.node === 'finance' && item.assignee !== hrIdentity.userId && item.assignee !== employeeUserId));
    const task = tasks.find(item => item.assignee === financeIdentity.userId);
    successful(await api(finance, `/hr/settlement/approval-task/${task.id}`), '独立财务读取续付待办和来源');
    reject(await post(hr, '/workflow/wf/complete', { taskId: task.id, action: 'APPROVE', comment: marker }), '人事不能代独立财务批准续付');
    observe('submitted', await read());
    successful(await post(finance, '/workflow/wf/complete', { taskId: task.id, action: 'APPROVE', comment: marker }), '独立财务实际批准续付');
    row = await waitFor(read, value => value.approvalStatus === 'APPROVED', '续付审批尚未回写'); observe('approved', row);
    successful(await post(hr, `${root}/confirm`, { version: row.version }), '人事确认已获批续付');
    row = await waitFor(read, value => Boolean(value.funds.paymentRequestId), '续付未建立实际OA付款'); observe('confirmed', row);
    const paymentId = String(row.funds.paymentRequestId); assert.match(paymentId, /^[1-9]\d*$/);
    reject(await post(hr, `/oa/payment/request/${paymentId}/pay`), '人事不能办理续付实际付款');
    successful(await post(finance, `/oa/payment/request/${paymentId}/pay`), '财务实际第二次付款');
    row = await waitFor(read, value => value.status === 'PAID', '续付实际付款尚未入账'); observe('posted', row);
    check('续付所有来源已入账且新增借款两条实际扣还', row.items.every(item => item.posted)
      && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE tenant_id=100000 AND advance_id=${advanceId};`) === '6'
      && database(`SELECT COUNT(*) FROM hr_advance_repayment WHERE tenant_id=100000 AND advance_id=${advanceId} AND status='POSTED'
        AND repay_amount=50 AND ((settlement_id=${id} AND repay_type='SETTLEMENT') OR (salary_slip_id=${payroll.salaryId} AND repay_type='SALARY'));`) === '2');
    const payload = JSON.parse(database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')) FROM outbox_event WHERE tenant_id=100000
      AND event_type='HR_SETTLEMENT_PAYMENT_PAID' AND aggregate_id=${paymentId};`));
    const port = Number(state.services.find(service => service.name === 'hr').port);
    assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await fetch(`http://127.0.0.1:${port}/inner/hr/settlement/payment-event`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
      const result = { status: response.status, body: await response.json() };
      requests.push({ path: '/inner/hr/settlement/payment-event', method: 'POST', status: result.status, code: result.body?.code });
      successful(result, '第二次实际付款事件重复投递');
    }
    check('第二次付款事件重投两次不修改结算版本', (await read()).version === row.version);
    observe('replayed', await read());
    successful(await post(hr, `${root}/close`, { version: row.version }), '关闭实际续付结算');
    row = await read(); check('原单冲正与续付三单均已关闭', row.status === 'CLOSED'); observe('closed', row);
    check('续付不恢复离职账号且录用奖金来源唯一', database(`SELECT CONCAT(e.employee_status,':',u.status) FROM hr_employee e
      JOIN sys_user u ON u.tenant_id=e.tenant_id AND u.user_id=e.user_id WHERE e.tenant_id=100000 AND e.id=${employeeId};`) === 'RESIGNED:1'
      && database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_REFERRAL' AND source_biz_id=${sql(referral.referralId)};`) === '1');
    Object.assign(summary, { paymentId, amount: row.netAmount, independentApproval: true, posted: true, replayed: true, closed: true, historyPreserved: true });
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    const attempt = async action => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
    await attempt(async () => {
      const unfinished = rows(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sql(marker)}
        AND status IN ('RUNNING','PAUSED','FAILED','PENDING','WITHDRAWN','TASK_BACK','RESTARTED');`);
      for (const instance of unfinished) successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${marker}结束验证` }), '结束本次未完成续付审批');
    });
    await attempt(async () => {
      if (!configChanged) return;
      if (configured) successful(await api(admin, configRoot, { method: 'PUT', body: configured }), '恢复原结算审批配置');
      else {
        const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取本次续付配置').records.find(row => row.configKey === configKey);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除本次续付配置');
      }
    });
    for (const userId of identities) await attempt(async () => database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${userId} AND create_by=${sql(marker)};
      DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${userId};`));
    await attempt(async () => {
      check('续付结束原授权逐行保持且历史不改写', originalRoles() === rolesBefore && roleMenus() === menusBefore
        && originalSettlement() === oldSnapshot && repaymentHistory() === historyBefore);
      summary.restoration = true;
    });
    if (cleanupErrors.length) failure = new AggregateError([failure, ...cleanupErrors].filter(Boolean), 'Repayment or cleanup failed');
  }
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const serviceDirectory = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(serviceDirectory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const result = await scanSecretStream(createReadStream(path.join(serviceDirectory, name)), [...secrets]); files++; leaks += result.leaks;
    }
  }
  const auditScan = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('续付服务日志与审计无本轮凭据泄漏', leaks === 0 && auditScan.leaks === 0); summary.secrets = true;
  console.log('H2_REFERRAL_REPAY_SECRET_SCAN: ' + JSON.stringify({ files, values: secrets.size, leaks, databaseLeaks: auditScan.leaks }));
  console.log('H2_REFERRAL_REPAY_RESULT: ' + JSON.stringify(summary));
  if (failure) throw failure;
}
