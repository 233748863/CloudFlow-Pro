import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

export async function verifyHrReferralCompletion(context) {
  const { admin, api, successful, session, database, check, createPerson, person, employee, referralId, candidateId, positionId, marker, candidateName } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const dates = JSON.parse(database("SELECT JSON_OBJECT('today',CAST(CURDATE() AS CHAR),'start',DATE_FORMAT(CURDATE(),'%Y-%m-01'),'end',CAST(LAST_DAY(CURDATE()) AS CHAR));"));
  for (const value of Object.values(dates)) assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const journal = (event, value) => appendFileSync(path.join(context.directory, 'private', `referral-recovery-${context.caseTag}.jsonl`), JSON.stringify({ event, ...value }) + '\n');
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (probe, accepted, label) => {
    const deadline = Date.now() + 90000;
    do { const value = await probe(); if (accepted(value)) return value; await pause(750); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const rejected = (result, label) => check(label, [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const readReferral = () => rows(`SELECT JSON_OBJECT('status',status,'bonus',bonus_status,'instance',instance_id,'changeId',comp_change_id,'version',version) FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id=${referralId};`)[0];
  const hrPerson = createPerson('hr', 4); const managerPerson = createPerson('manager', 2); const reviewerPerson = createPerson('reviewer', 4);
  const humanResources = await session(hrPerson.username, 'g_holiday_employee');
  const manager = await session(managerPerson.username, 'g_holiday_employee');
  const reviewer = await session(reviewerPerson.username, 'g_holiday_employee');
  const configured = [];
  let offerId; let hiredUserId; let componentId; let periodId; let structureId; let slabId; let batchId;
  const definitionId = `${marker}_bonus`;
  const configRoot = '/auth/system/config';
  const configure = async (key, value) => {
    const list = successful(await api(admin, `${configRoot}/list?configKey=${key}&pageSize=100`), '读取测试所需奖金配置');
    const existing = list.records.find(row => row.configKey === key);
    configured.push({ key, existing });
    journal('config-original', { key, existing: existing ?? null });
    const body = { ...(existing || {}), configKey: key, configName: '内推隔离审批核验', configValue: value, configType: 'N', configScope: '1' };
    successful(await api(admin, configRoot, { method: existing ? 'PUT' : 'POST', body }), '通过实际接口配置奖金审批');
  };
  const tasks = instance => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(instance)} AND status='TODO';`);
  const complete = async (actor, task, action = 'APPROVE') => successful(await post(actor, '/workflow/wf/complete', { taskId: task.id, action, comment: '内推真实流程隔离核验' }), '实际待办办理');
  try {
    rejected(await post(humanResources, '/hr/recruitment/offers', { candidateId, positionId, status: 'APPROVED', processInstanceId: 'forged' }), '录用创建不能伪造审批结果');
    offerId = String(successful(await post(humanResources, '/hr/recruitment/offers', { offerNo: `${marker}_offer`, candidateId, positionId, salary: '10000.00', expectedArrivalDate: dates.today, expireDate: dates.end }), '实际创建录用草稿'));
    rejected(await post(humanResources, `/hr/recruitment/offers/${offerId}/approve`), '录用管理入口不能直接批准');
    successful(await post(humanResources, `/hr/recruitment/offers/${offerId}/submit`), '实际提交录用审批');
    const offer = await waitFor(() => rows(`SELECT JSON_OBJECT('instance',process_instance_id,'status',status) FROM hr_offer WHERE tenant_id=100000 AND id=${offerId};`)[0], value => Boolean(value?.instance), '录用流程未绑定');
    check('录用提交尚未产生入职或奖金', readReferral().status !== 'HIRED' && readReferral().bonus === 'NOT_APPLICABLE');
    const offerTasks = await waitFor(() => tasks(offer.instance), value => value.length > 0, '录用待办未生成');
    rejected(await post(humanResources, '/workflow/wf/complete', { taskId: offerTasks[0].id, action: 'APPROVE' }), '录用发起人不能审批自己提交的录用');
    assert.equal(offerTasks.length, 1, '录用模型应生成一个实际审批任务');
    const adminTask = offerTasks[0];
    const assignee = rows(`SELECT JSON_OBJECT('id',actor.user_id,'username',actor.user_name,'passwordReset',actor.pwd_reset_required) FROM sys_user actor
      WHERE actor.tenant_id=100000 AND actor.user_id=${literal(adminTask.assignee)} AND actor.status='0' AND actor.deleted=0
        AND EXISTS (SELECT 1 FROM sys_user_role assignment JOIN sys_role role ON role.tenant_id=assignment.tenant_id AND role.role_id=assignment.role_id
          WHERE assignment.tenant_id=actor.tenant_id AND assignment.user_id=actor.user_id AND role.role_key='admin' AND role.status='0' AND role.deleted=0);`)[0];
    check('实际录用待办交由另一名有效管理员', Boolean(assignee) && String(assignee.id) !== hrPerson.userId);
    const passwordBefore = database(`SELECT HEX(password) FROM sys_user WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`);
    assert.match(passwordBefore, /^[A-F0-9]+$/);
    journal('credential-original', { userId: String(assignee.id), passwordHex: passwordBefore, resetRequired: assignee.passwordReset });
    let offerApprover;
    try {
      database(`UPDATE sys_user actor JOIN sys_user fixture ON fixture.tenant_id=actor.tenant_id AND fixture.user_name='g_holiday_employee'
        SET actor.password=fixture.password,actor.pwd_reset_required='0' WHERE actor.tenant_id=100000 AND actor.user_id=${literal(assignee.id)};`);
      offerApprover = await session(assignee.username, 'g_holiday_employee');
    } finally {
      database(`UPDATE sys_user SET password=UNHEX('${passwordBefore}'),pwd_reset_required=${assignee.passwordReset == null ? 'NULL' : literal(assignee.passwordReset)}
        WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`);
      check('隔离录用审批人凭据已还原且任务和角色未改写', passwordBefore === database(`SELECT HEX(password) FROM sys_user WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`)
        && rows(`SELECT JSON_OBJECT('value',pwd_reset_required) FROM sys_user WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`)[0].value === assignee.passwordReset
        && database(`SELECT CONCAT(status,':',assignee) FROM wf_task WHERE tenant_id=100000 AND task_id=${literal(adminTask.id)};`) === `TODO:${assignee.id}`);
      journal('credential-restored', { userId: String(assignee.id) });
    }
    const override = await post(offerApprover, '/workflow/wf/complete', { taskId: adminTask.id, action: 'APPROVE', variables: { offerApproverIds: [hrPerson.userId] } });
    check('录用办理不能改写提交时确定的审批人', override.body?.code === 'H_IDENTITY_OVERRIDE_FORBIDDEN');
    const changedSalary = await post(offerApprover, '/workflow/wf/complete', { taskId: adminTask.id, action: 'APPROVE', variables: { salary: '1.00' } });
    check('录用审批不能改写已提交的月薪', changedSalary.body?.code === 'H_IDENTITY_OVERRIDE_FORBIDDEN');
    if (process.argv.includes('--hr-referrals-bonus-ui')) {
      const { approveHrReferralOfferUi } = await import('./verify-hr-referrals-ui.mjs');
      await approveHrReferralOfferUi({ offerApprover, task: adminTask, marker, candidateName, directory: context.directory, check });
    } else await complete(offerApprover, adminTask);
    await waitFor(readReferral, value => value.status === 'HIRED', '真实录用审批后推荐未生效入职');
    hiredUserId = database(`SELECT user_id FROM hr_employee WHERE tenant_id=100000 AND name=(SELECT name FROM hr_candidate WHERE id=${candidateId} AND tenant_id=100000) AND deleted=0;`);
    assert.match(hiredUserId, /^[1-9]\d*$/);
    check('录用审批实际创建员工与账号并推进推荐', database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id=${hiredUserId};`) === '1' && database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(offer.instance)};`) === 'PASSED');
    check(`${candidateName.length}字符姓名经推荐招聘员工账号逐字节完整保留`, database(`SELECT COUNT(*) FROM sys_user account
      JOIN hr_employee staff ON staff.tenant_id=account.tenant_id AND staff.user_id=account.user_id
      JOIN hr_candidate candidate ON candidate.tenant_id=account.tenant_id AND candidate.id=${candidateId}
      JOIN hr_employee_referral referral ON referral.tenant_id=candidate.tenant_id AND referral.referral_id=${referralId}
      WHERE account.tenant_id=100000 AND account.user_id=${hiredUserId} AND HEX(account.nick_name)=HEX(${literal(candidateName)})
        AND HEX(staff.name)=HEX(account.nick_name) AND HEX(candidate.name)=HEX(account.nick_name) AND HEX(referral.candidate_name)=HEX(account.nick_name);`) === '1');
    check('推荐联系方式经招聘与实际建号后逐字节完整保留', database(`SELECT COUNT(*) FROM sys_user account JOIN hr_candidate candidate ON candidate.tenant_id=account.tenant_id AND candidate.id=${candidateId}
      JOIN hr_employee_referral referral ON referral.tenant_id=candidate.tenant_id AND referral.candidate_id=candidate.id AND referral.referral_id=${referralId}
      WHERE account.tenant_id=100000 AND account.user_id=${hiredUserId} AND HEX(account.email)=HEX(candidate.email) AND HEX(candidate.email)=HEX(referral.email)
        AND HEX(account.phonenumber)=HEX(candidate.phone) AND HEX(candidate.phone)=HEX(referral.contact_phone) AND account.pwd_reset_required='1';`) === '1');
    successful(await post(humanResources, `/hr/recruitment/offers/${offerId}/send`), '批准后登记录用已发送状态');
    successful(await post(humanResources, `/hr/recruitment/offers/${offerId}/accept`), '记录候选人接受录用');
    database(`INSERT INTO hr_comp_component (tenant_id,component_code,component_name,component_type,category,taxable,sort_order,status,version) VALUES (100000,${literal(marker)},${literal(marker)},'VARIABLE','OTHER',1,40,1,0);`);
    componentId = database(`SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND component_code=${literal(marker)};`);
    const existingPeriod = database(`SELECT period_id FROM hr_payroll_period WHERE tenant_id=100000 AND deleted=0 AND start_date=${literal(dates.start)} AND end_date=${literal(dates.end)} AND status='OPEN';`);
    periodId = existingPeriod || String(successful(await post(admin, '/hr/compensation/payroll/periods', { periodName: marker, frequency: 'MONTHLY', startDate: dates.start, endDate: dates.end, payDate: dates.end }), '创建开放工资周期'));
    assert.match(periodId, /^[1-9]\d*$/);
    check('奖金核定日与真实录用日在本次工资周期内', dates.today >= dates.start && dates.today <= dates.end
      && database(`SELECT COUNT(*) FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id=${referralId} AND hire_date=${literal(dates.today)};`) === '1');
    const bonus = { version: readReferral().version, amount: '1234.56', salaryComponentId: componentId, payrollPeriodId: periodId, conditionRemark: '已核对真实入职及本次奖金条件', conditionsVerified: true };
    rejected(await post(employee, `/hr/referral/${referralId}/bonus`, bonus), '推荐人不能核定自己的奖金');
    const model = { nodes: [{ id: 'start', type: 'START', title: '提交奖金核定' }, { id: 'manager', type: 'APPROVAL', title: '负责人审核', approverType: 'VARIABLE_USER', approverValue: 'responsibleApproverIds', allowDelegate: false, allowAddSign: false }, { id: 'hr', type: 'APPROVAL', title: '人事复核', approverType: 'VARIABLE_USER', approverValue: 'hrApproverIds', allowDelegate: false, allowAddSign: false }, { id: 'end', type: 'END', title: '完成' }], edges: [{ id: 'first', source: 'start', target: 'manager' }, { id: 'second', source: 'manager', target: 'hr' }, { id: 'third', source: 'hr', target: 'end' }] };
    database(`INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted) VALUES (${literal(definitionId)},100000,${literal(marker)},${literal(definitionId)},1,${literal(JSON.stringify(model))},'PUBLISHED',1,0);`);
    await configure('sys.hr.referral.processKey', definitionId);
    await configure('sys.hr.referral.approvalUsers', JSON.stringify({ responsibleUserId: managerPerson.userId, hrUserId: reviewerPerson.userId }));
    if (process.argv.includes('--hr-referrals-bonus-ui')) {
      const { submitHrReferralBonusUi } = await import('./verify-hr-referrals-ui.mjs');
      await submitHrReferralBonusUi({ humanResources, employee, marker, referralId, directory: context.directory, check,
        periodName: database(`SELECT period_name FROM hr_payroll_period WHERE tenant_id=100000 AND period_id=${periodId};`), bonus });
    } else successful(await post(humanResources, `/hr/referral/${referralId}/bonus`, bonus), '实际核定并提交奖金审批');
    const pending = await waitFor(readReferral, value => Boolean(value.instance), '奖金审批实例未绑定');
    check('奖金审批中尚未生成工资变动项', pending.bonus === 'PENDING' && pending.changeId == null);
    const first = await waitFor(() => tasks(pending.instance), value => value.length === 1, '负责人待办未生成');
    check('奖金第一步由冻结负责人办理', String(first[0].assignee) === managerPerson.userId);
    rejected(await post(employee, '/workflow/wf/complete', { taskId: first[0].id, action: 'APPROVE' }), '推荐人不能办理奖金审批');
    const changedApprover = await post(manager, '/workflow/wf/complete', { taskId: first[0].id, action: 'APPROVE', variables: { hrApproverIds: [person.userId] } });
    check('负责人不能改写奖金复核人', changedApprover.body?.code === 'H_IDENTITY_OVERRIDE_FORBIDDEN');
    const transferred = await post(manager, '/workflow/enhance/task/delegate', { taskId: first[0].id, mode: 'TRANSFER', toUserId: person.userId, toUserName: person.username, reason: '核验禁止将奖金任务转给推荐人' });
    const afterTransfer = tasks(pending.instance);
    const delegatedCount = database(`SELECT COUNT(*) FROM wf_task_delegation WHERE tenant_id=100000 AND task_id=${literal(first[0].id)};`);
    console.log(`H2_REFERRAL_TRANSFER_GUARD: status=${transferred.status}; code=${transferred.body?.code}; tasks=${afterTransfer.length}; owner_unchanged=${afterTransfer.length === 1 && String(afterTransfer[0].assignee) === managerPerson.userId}; delegation_rows=${delegatedCount}`);
    check('负责人不能将奖金审批转给推荐人', transferred.status === 400 && transferred.body?.code === 'NODE_ACTION_FORBIDDEN'
      && afterTransfer.length === 1 && String(afterTransfer[0].assignee) === managerPerson.userId && delegatedCount === '0');
    await complete(manager, first[0]);
    const second = await waitFor(() => tasks(pending.instance), value => value.length === 1 && String(value[0].assignee) === reviewerPerson.userId, '人事复核待办未生成');
    check('第一审通过仍未生成奖金工资项', readReferral().bonus === 'PENDING' && readReferral().changeId == null);
    await complete(reviewer, second[0]);
    const approved = await waitFor(readReferral, value => value.bonus === 'APPROVED', '奖金审批结果未回写');
    check('两级实际审批只产生一条加密保存的核定奖金', database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_REFERRAL' AND source_biz_id=${literal(referralId)} AND change_amount NOT REGEXP '^[0-9]+([.][0-9]+)?$' AND id=${approved.changeId};`) === '1');
    const changedSource = await post(admin, `/hr/compensation/changes/${approved.changeId}/cancel`);
    check('自动奖金工资项不能从普通入口改状态', changedSource.status === 400 && changedSource.body?.code === 'AUTOMATIC_SOURCE_IMMUTABLE');
    const legacySource = `${marker}_legacy`;
    database(`INSERT INTO hr_comp_change (tenant_id,change_no,employee_id,change_type,before_total,after_total,change_amount,effective_date,status,source_biz_type,source_biz_id)
      SELECT tenant_id,${literal(legacySource)},employee_id,'OVERTIME',before_total,after_total,change_amount,effective_date,status,'HR_OVERTIME',${literal(legacySource)}
      FROM hr_comp_change WHERE tenant_id=100000 AND id=${approved.changeId} AND source_biz_type='HR_REFERRAL' AND source_biz_id=${literal(referralId)};`);
    const legacyId = database(`SELECT id FROM hr_comp_change WHERE tenant_id=100000 AND change_no=${literal(legacySource)} AND source_biz_type='HR_OVERTIME' AND source_biz_id=${literal(legacySource)};`);
    assert.match(legacyId, /^[1-9]\d*$/);
    try {
      const legacyBefore = database(`SELECT CONCAT(status,':',version,':',HEX(change_amount)) FROM hr_comp_change WHERE tenant_id=100000 AND id=${legacyId};`);
      const legacyCancel = await post(admin, `/hr/compensation/changes/${legacyId}/cancel`);
      check('原加班工资来源继续返回原错误码且金额状态未变', legacyCancel.status === 400 && legacyCancel.body?.code === 'OVERTIME_SOURCE_IMMUTABLE'
        && database(`SELECT CONCAT(status,':',version,':',HEX(change_amount)) FROM hr_comp_change WHERE tenant_id=100000 AND id=${legacyId};`) === legacyBefore);
    } finally {
      database(`DELETE FROM hr_comp_change WHERE tenant_id=100000 AND id=${legacyId} AND change_no=${literal(legacySource)} AND source_biz_type='HR_OVERTIME' AND source_biz_id=${literal(legacySource)};`);
    }
    database(`INSERT INTO hr_comp_structure (tenant_id,structure_code,structure_name,component_config,status) VALUES (100000,${literal(marker)},${literal(marker)},JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')),1);`);
    structureId = database(`SELECT id FROM hr_comp_structure WHERE tenant_id=100000 AND structure_code=${literal(marker)};`);
    database(`INSERT INTO hr_tax_slab (tenant_id,slab_name,region,effective_from,effective_to,threshold_amount,status) VALUES (100000,${literal(marker)},${literal(marker)},'2026-01-01','2026-12-31',500,'ACTIVE');`);
    slabId = database(`SELECT slab_id FROM hr_tax_slab WHERE tenant_id=100000 AND slab_name=${literal(marker)};`);
    for (let index = 0; index < 7; index++) database(`INSERT INTO hr_tax_slab_detail (tenant_id,slab_id,level_no,from_amount,to_amount,tax_rate,quick_deduction) VALUES (100000,${slabId},${index + 1},${index * 100000},${index === 6 ? 'NULL' : (index + 1) * 100000},0.1,0);`);
    successful(await post(admin, '/hr/compensation/employee-compensations', { employeeId: person.employeeId, structureId, componentValues: {}, totalSalary: '10000.00', effectiveDate: '2020-01-01', status: 'ACTIVE' }), '实际保存推荐人的加密薪资');
    database(`INSERT INTO hr_tax_profile (tenant_id,employee_id,tax_slab_id,status) VALUES (100000,${person.employeeId},${slabId},'ACTIVE');`);
    batchId = String(successful(await post(admin, '/hr/compensation/payroll/batches', { payrollPeriodId: periodId, employeeIds: [person.employeeId], validateAttendanceFlag: 0, deductUnverifiedFlag: 0 }), '创建奖金工资批次'));
    successful(await post(admin, `/hr/compensation/payroll/batches/${batchId}/calculate`), '实际计算含奖金工资');
    const batch = await waitFor(async () => successful(await api(admin, `/hr/compensation/payroll/batches/${batchId}`), '读取工资批次'), value => value.batch.status !== 'CALCULATING', '工资计算未结束');
    check('奖金工资计算成功', batch.batch.status === 'CALCULATED' && batch.employees[0].calcStatus === 'SUCCESS');
    const slipId = String(batch.employees[0].salarySlipId);
    check('工资计算后奖金仍待支付且工资项金额完整', readReferral().bonus === 'APPROVED' && database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND id=${slipId} AND JSON_CONTAINS(components,JSON_OBJECT('sourceBizType','HR_REFERRAL','referralId',${literal(referralId)},'amount',CAST('1234.56' AS DECIMAL(14,2))));`) === '1');
    successful(await post(admin, `/hr/compensation/payroll/batches/${batchId}/submit`), '实际封存奖金工资');
    const trigger = `${marker}_paid_fault`;
    database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON hr_audit_log FOR EACH ROW BEGIN IF NEW.business_domain='HR_REFERRAL' AND NEW.business_id=${referralId} AND NEW.operation_type='BONUS_PAID' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REFERRAL_TEST_SCOPED_FAULT'; END IF; END$$\nDELIMITER ;`);
    try {
      const failed = await post(admin, `/hr/compensation/payroll/batches/${batchId}/pay`);
      check('奖金审计失败使整个发薪事务回滚', failed.status >= 400 && readReferral().bonus === 'APPROVED' && database(`SELECT status FROM hr_salary_slip WHERE id=${slipId} AND tenant_id=100000;`) === 'SUBMITTED');
    } finally { database(`DROP TRIGGER ${trigger};`); }
    await pause(5100);
    const payments = await Promise.all([post(admin, `/hr/compensation/payroll/batches/${batchId}/pay`), post(admin, `/hr/compensation/payroll/batches/${batchId}/pay`)]);
    check('并发发薪至少一次成功并实际更新奖金已付', payments.some(result => result.status === 200 && result.body?.code === 200) && readReferral().bonus === 'PAID');
    check('奖金付款审计与唯一工资单对应', database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL' AND business_id=${referralId} AND operation_type='BONUS_PAID';`) === '1');
    await pause(5100);
    const repeatedPayment = await post(admin, `/hr/compensation/payroll/batches/${batchId}/pay`);
    const paidBatch = successful(await api(admin, `/hr/compensation/payroll/batches/${batchId}`), '重复付款后读取真实结果');
    check('已支付批次拒绝重复付款且查询仍为已支付', repeatedPayment.status === 400 && repeatedPayment.body?.code === 'INVALID_PAYROLL_STATE'
      && paidBatch.batch.status === 'PAID' && readReferral().bonus === 'PAID');
    check('重复付款不产生第二笔奖金', database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_REFERRAL' AND source_biz_id=${literal(referralId)};`) === '1'
      && database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL' AND business_id=${referralId} AND operation_type='BONUS_PAID';`) === '1');
    if (process.argv.includes('--hr-referrals-bonus-ui')) {
      const origin = new URL(employee.url()).origin;
      for (const width of [1440, 320]) {
        await employee.setViewportSize({ width, height: 1050 });
        await employee.goto(`${origin}/hr/ess/referrals?referralId=${referralId}`);
        const detail = employee.getByRole('dialog', { name: '本人推荐详情', exact: true });
        await detail.getByText('奖金已随工资发放', { exact: true }).waitFor();
        check(`${width}像素本人页面显示实际已付奖金且无核定入口`, await detail.getByText('1234.56元', { exact: true }).isVisible()
          && await detail.getByRole('button', { name: '核定奖金', exact: true }).count() === 0
          && await employee.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        await employee.screenshot({ path: path.join(context.directory, `h2-referral-paid-${marker}-${width}.png`), fullPage: true });
      }
    }
  } finally {
    const unfinished = rows(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND status IN ('RUNNING','PAUSED')
      AND ((JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessType'))='OFFER' AND JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessId'))=${literal(offerId || '0')} AND start_user_id=${hrPerson.userId})
        OR (JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessType'))='HR_REFERRAL' AND JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessId'))=${literal(referralId)} AND definition_id=${literal(definitionId)}));`);
    for (const instance of unfinished) {
      successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${marker}隔离核验结束，保留审批历史` }), '结束本次未完成的隔离审批');
    }
    for (const config of configured.reverse()) {
      if (config.existing) successful(await api(admin, configRoot, { method: 'PUT', body: config.existing }), '恢复原奖金配置');
      else {
        const list = successful(await api(admin, `${configRoot}/list?configKey=${config.key}&pageSize=100`), '读取测试配置供清理');
        const added = list.records.find(row => row.configKey === config.key);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除测试专属配置');
      }
      journal('config-restored', { key: config.key });
    }
    if (offerId) database(`DELETE FROM hr_offer WHERE tenant_id=100000 AND id=${offerId} AND offer_no=${literal(`${marker}_offer`)};`);
    const ownedAccounts = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND nick_name=${literal(candidateName)};`).split(/\r?\n/).filter(Boolean);
    for (const userId of ownedAccounts) {
      assert.match(userId, /^[1-9]\d*$/);
      if (hiredUserId) assert.equal(userId, hiredUserId, 'Only the account created for this candidate may be removed');
      database(`DELETE FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId} AND name=${literal(candidateName)}; DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user_post WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${userId} AND nick_name=${literal(candidateName)};`);
    }
    database(`UPDATE wf_process_definition SET status='DRAFT',is_archived=1 WHERE tenant_id=100000 AND definition_id=${literal(definitionId)};`);
    if (structureId) database(`DELETE FROM hr_employee_comp WHERE tenant_id=100000 AND employee_id=${person.employeeId} AND structure_id=${structureId}; DELETE FROM hr_comp_structure WHERE tenant_id=100000 AND id=${structureId};`);
    if (slabId) database(`DELETE FROM hr_tax_profile WHERE tenant_id=100000 AND employee_id=${person.employeeId} AND tax_slab_id=${slabId}; DELETE FROM hr_tax_slab_detail WHERE tenant_id=100000 AND slab_id=${slabId}; DELETE FROM hr_tax_slab WHERE tenant_id=100000 AND slab_id=${slabId};`);
    if (componentId) database(`UPDATE hr_comp_component SET status=0 WHERE tenant_id=100000 AND id=${componentId};`);
    console.log('H2_REFERRAL_COMPLETION_CLEANUP: configuration_restored=true; workflow_and_financial_evidence_retained=true; production_modified=false');
  }
}
