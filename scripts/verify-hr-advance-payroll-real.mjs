import assert from 'node:assert/strict';

export async function verifyHrAdvancePayroll(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const root = '/hr/compensation/payroll';
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const post = (actor, endpoint, body) => api(actor, `${root}${endpoint}`, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const read = async endpoint => successful(await api(admin, `${root}${endpoint}`), `真实工资查询${endpoint}`);
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (probe, accepted, label) => {
    const deadline = Date.now() + 180000;
    let current;
    do {
      current = await probe();
      if (accepted(current)) return current;
      await pause(500);
    } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(current)}`);
  };
  const reject = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    [400, 401, 403, 404, 409, 422, 500, 503].includes(result.status) && result.body?.code !== undefined && result.body.code !== 200);
  const rejectCode = (result, label, code) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    [400, 403, 409].includes(result.status) && result.body?.code === code);
  const cents = value => {
    const text = String(value);
    assert.match(text, /^-?\d+(\.\d{1,2})?$/);
    const [whole, fraction = ''] = text.replace('-', '').split('.');
    return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n);
  };
  const employeeGrants = database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
  const createEmployee = (suffix, roleId) => {
    const username = `h2adv_${suffix}_${caseTag}`;
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0','advance-payroll-fixture',NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${roleId});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    assert.match(employeeId, /^[1-9]\d*$/);
    return { username, userId, employeeId };
  };
  const person = createEmployee('employee', 5);
  const peer = createEmployee('peer', 5);
  const financePerson = createEmployee('finance', 3);
  check('隔离补正财务与员工同部门且沿用正式财务角色', database(`SELECT COUNT(*) FROM sys_user actor
    JOIN sys_user_role assignment ON assignment.tenant_id=actor.tenant_id AND assignment.user_id=actor.user_id
    JOIN sys_role role ON role.tenant_id=assignment.tenant_id AND role.role_id=assignment.role_id
    WHERE actor.tenant_id=100000 AND actor.user_id=${financePerson.userId} AND actor.dept_id=100
      AND actor.status='0' AND actor.deleted=0 AND role.role_key='finance' AND role.status='0' AND role.deleted=0;`) === '1');
  const employee = await session(person.username, 'g_holiday_employee');
  const otherEmployee = await session(peer.username, 'g_holiday_employee');
  const periods = new Map();
  for (const month of ['2026-07', '2026-08', '2026-09']) {
    const start = `${month}-01`;
    const end = `${month}-${month.endsWith('09') ? '30' : '31'}`;
    const existing = rows(`SELECT JSON_OBJECT('id',period_id,'status',status) FROM hr_payroll_period
      WHERE tenant_id=100000 AND deleted=0 AND start_date=${literal(start)} AND end_date=${literal(end)};`);
    check(`核对${month}隔离工资周期无歧义`, existing.length <= 1 && (!existing.length || existing[0].status === 'OPEN'));
    const id = existing.length ? existing[0].id : successful(await post(admin, '/periods', {
      periodName: `借款连接隔离周期_${month}`, frequency: 'MONTHLY', startDate: start, endDate: end, payDate: end,
    }), '真实接口创建薪资周期');
    periods.set(month, String(id));
  }
  const structureCode = `advance_structure_${caseTag}`;
  database(`INSERT INTO hr_comp_structure (tenant_id,structure_code,structure_name,component_config,status)
    VALUES (100000,${literal(structureCode)},${literal(structureCode)},JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')),1);`);
  const structureId = database(`SELECT id FROM hr_comp_structure WHERE tenant_id=100000 AND structure_code=${literal(structureCode)};`);
  const slabName = `仅隔离验收合成税率_${caseTag}`;
  database(`INSERT INTO hr_tax_slab (tenant_id,slab_name,region,effective_from,effective_to,threshold_amount,status)
    VALUES (100000,${literal(slabName)},${literal(`TEST_ADV_${caseTag}`)},'2026-01-01','2026-12-31',500,'ACTIVE');`);
  const slabId = database(`SELECT slab_id FROM hr_tax_slab WHERE tenant_id=100000 AND slab_name=${literal(slabName)};`);
  for (let index = 0; index < 7; index++) {
    database(`INSERT INTO hr_tax_slab_detail (tenant_id,slab_id,level_no,from_amount,to_amount,tax_rate,quick_deduction)
      VALUES (100000,${slabId},${index + 1},${index * 100000},${index === 6 ? 'NULL' : (index + 1) * 100000},0.1,0);`);
  }
  const salaryComponents = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'code',component_code) FROM hr_comp_component WHERE tenant_id=100000 AND component_code='BASE' AND component_type='FIXED' AND status=1;");
  check('工资来源使用唯一有效的本租户基本工资项目', salaryComponents.length === 1);
  const salaryComponent = salaryComponents[0];
  for (const target of [person, peer]) {
    successful(await api(admin, '/hr/compensation/employee-compensations', { method: 'POST', body: {
      employeeId: target.employeeId, structureId, componentValues: { [target === person ? salaryComponent.code : salaryComponent.id]: '10000.00' }, totalSalary: '10000.00', effectiveDate: '2020-01-01', status: 'ACTIVE',
    } }), '通过真实薪资接口加密保存测试工资');
    check('测试工资已加密入库，未用明文绕过薪资读取', database(`SELECT COUNT(*) FROM hr_employee_comp
      WHERE tenant_id=100000 AND employee_id=${target.employeeId} AND total_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$';`) === '1');
    database(`INSERT INTO hr_tax_profile (tenant_id,employee_id,tax_slab_id,status) VALUES (100000,${target.employeeId},${slabId},'ACTIVE');`);
  }
  const before = await read(`/slips/preview?employeeId=${person.employeeId}&periodId=${periods.get('2026-07')}`);
  check('实际算薪预览保存精确项目编号及薪酬来源', before.components.some(component => component.sourceType === 'EMPLOYEE_COMPENSATION'
    && component.salaryComponentId === salaryComponent.id && component.salaryComponentIdentity === 'VERIFIED'
    && component.employeeCompId != null && cents(component.amount) === 1000000n));
  const fund = (target, suffix, principal, monthly) => {
    const advanceNo = `advance_${suffix}_${caseTag}`;
    const policy = { ruleId: 93001, ruleVersion: 1, payrollDeduction: { confirmationStatus: 'CONFIRMED', maximumNetRatio: 1, minimumNetAmount: 0 } };
    const source = 1000000000000 + Number(target.employeeId) * 10 + suffix;
    database(`INSERT INTO hr_employee_advance (tenant_id,advance_no,employee_id,advance_amount,purpose,apply_date,repay_mode,repay_start_month,
      repay_months,monthly_deduct_amount,repaid_amount,outstanding_amount,reserved_amount,written_off_amount,status,approval_status,payment_request_id,paid_time,rule_snapshot)
      VALUES (100000,${literal(advanceNo)},${target.employeeId},${principal},'测试前置放款，未经过OA实际支付','2026-06-01','SALARY_DEDUCT','2026-07',12,${monthly},
      0,${principal},0,0,'PAID','APPROVED',${source},'2026-06-01 10:00:00',${literal(JSON.stringify(policy))});`);
    return database(`SELECT advance_id FROM hr_employee_advance WHERE tenant_id=100000 AND advance_no=${literal(advanceNo)};`);
  };
  const firstLoan = fund(person, 1, 60, 60);
  const secondLoan = fund(person, 2, 300, 100);
  const peerLoan = fund(peer, 3, 200, 50);
  const balance = id => rows(`SELECT JSON_OBJECT('status',status,'repaid',repaid_amount,'outstanding',outstanding_amount,'reserved',reserved_amount)
    FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${id};`)[0];
  const entryRows = id => rows(`SELECT JSON_OBJECT('id',repayment_id,'advanceId',advance_id,'amount',repay_amount,'month',repay_month,'status',status,'reversalOf',reversal_of_id)
    FROM hr_advance_repayment WHERE tenant_id=100000 AND salary_slip_id=${id} ORDER BY repayment_id;`);
  const after = await read(`/slips/preview?employeeId=${person.employeeId}&periodId=${periods.get('2026-07')}`);
  check('真实算薪预览只扣本金160元且不改变应税收入', cents(before.netTotal) - cents(after.netTotal) === 16000n
    && cents(before.taxAmount) === cents(after.taxAmount) && cents(before.grossTotal) === cents(after.grossTotal));
  check('预览未形成实际扣款预约', balance(firstLoan).reserved === 0 && balance(secondLoan).reserved === 0);
  const newBatch = async () => String(successful(await post(admin, '/batches', {
    payrollPeriodId: periods.get('2026-07'), employeeIds: [person.employeeId], validateAttendanceFlag: 0, deductUnverifiedFlag: 0,
  }), '真实接口创建借款员工工资批次'));
  const calculate = async id => {
    successful(await post(admin, `/batches/${id}/calculate`), '真实集中任务受理工资计算');
    const detail = await waitFor(() => read(`/batches/${id}`), value => value.batch.status !== 'CALCULATING', '实际工资计算未结束');
    check('实际任务计算成功且仅包含当前员工', detail.batch.status === 'CALCULATED' && detail.employees.length === 1
      && detail.employees[0].calcStatus === 'SUCCESS' && String(detail.employees[0].employeeId) === person.employeeId);
    return String(detail.employees[0].salarySlipId);
  };
  const cancelled = await newBatch();
  reject(await post(employee, `/batches/${cancelled}/calculate`), '普通员工不能计算工资');
  const cancelledSlip = await calculate(cancelled);
  check('实际计算保存两笔预约并保持已还为零', entryRows(cancelledSlip).length === 2 && entryRows(cancelledSlip).every(entry => entry.status === 'RESERVED')
    && balance(firstLoan).repaid === 0 && balance(firstLoan).reserved === 60 && balance(secondLoan).reserved === 100);
  evidence.calculation = true;
  successful(await post(admin, `/batches/${cancelled}/cancel`), '真实取消工资批次');
  check('取消先释放全部预约并保留原金额', entryRows(cancelledSlip).every(entry => entry.status === 'RELEASED')
    && balance(firstLoan).reserved === 0 && balance(secondLoan).reserved === 0
    && database(`SELECT deleted FROM hr_salary_slip WHERE id=${cancelledSlip};`) === '1');
  evidence.cancellation = true;
  await pause(5100);
  const batchId = await newBatch();
  const salaryId = await calculate(batchId);
  successful(await post(admin, `/batches/${batchId}/submit`), '真实提交并封存工资');
  reject(await post(employee, `/batches/${batchId}/pay`), '普通员工不能发薪');
  reject(await api(otherEmployee, `/hr/ess/salary-slips/${salaryId}`), '其他员工不能读取本人工资');
  const visible = successful(await api(employee, `/hr/ess/salary-slips/${salaryId}`), '本人读取真实封存工资');
  check('本人看到两笔明确借款扣还及正确实发额', visible.components.filter(component => component.sourceBizType === 'HR_ADVANCE').length === 2
    && cents(visible.netTotal) === cents(after.netTotal));
  check('真实封存工资保留可核验项目来源', visible.components.some(component => component.salaryComponentId === salaryComponent.id
    && component.salaryComponentCode === salaryComponent.code && component.salaryComponentIdentity === 'VERIFIED'));
  const monthBasis = visible.components.filter(component => component.type === 'PAYROLL_BASIS');
  check('真实工资保存逐月分摊依据且合计等于原固定工资', monthBasis.length === 1 && monthBasis[0].evidenceVersion === 2
    && monthBasis[0].componentAllocation === 'PROPORTIONAL_POSTED_FIXED_GROSS'
    && monthBasis[0].monthlyPortions.length === 1 && monthBasis[0].monthlyPortions[0].month === '2026-07'
    && cents(monthBasis[0].monthlyPortions[0].postedGross) === 1000000n && cents(monthBasis[0].postedFixedGross) === 1000000n);
  check('真实工资分摊差额保存明确来源类型', visible.components.filter(component => component.sourceType === 'PAYROLL_PRORATION_ADJUSTMENT').length === 1);
  evidence.permissions = true;
  const faultName = `h2_advance_audit_${caseTag}`;
  database(`DELIMITER $$
    CREATE TRIGGER ${faultName} BEFORE INSERT ON hr_audit_log FOR EACH ROW
    BEGIN IF NEW.business_domain='HR_ADVANCE' AND NEW.business_id=${secondLoan} AND NEW.operation_type='SALARY_POST'
    THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_ADVANCE_SCOPED_AUDIT_FAULT'; END IF; END$$
    DELIMITER ;`);
  try {
    reject(await post(admin, `/batches/${batchId}/pay`), '真实还款审计故障阻止发薪');
    check('第二笔审计故障回滚整批工资与第一笔扣还', (await read(`/batches/${batchId}`)).batch.status === 'SUBMITTED'
      && (await read(`/slips/${salaryId}`)).status === 'SUBMITTED' && balance(firstLoan).repaid === 0
      && balance(firstLoan).reserved === 60 && entryRows(salaryId).every(entry => entry.status === 'RESERVED'));
  } finally { database(`DROP TRIGGER ${faultName};`); }
  await pause(5100);
  const payments = await Promise.all([post(admin, `/batches/${batchId}/pay`), post(admin, `/batches/${batchId}/pay`)]);
  check('并发真实发薪至少一次成功且单据只支付一次', payments.some(result => result.status === 200 && result.body?.code === 200)
    && (await read(`/batches/${batchId}`)).batch.status === 'PAID' && (await read(`/slips/${salaryId}`)).status === 'PAID');
  check('最后一期清零且另一借款只扣约定100元', balance(firstLoan).status === 'CLEARED' && balance(firstLoan).outstanding === 0
    && balance(secondLoan).repaid === 100 && balance(secondLoan).outstanding === 200 && balance(secondLoan).reserved === 0
    && entryRows(salaryId).length === 2 && entryRows(salaryId).every(entry => entry.status === 'POSTED'));
  evidence.payment = true; evidence.concurrency = true;
  const originalEntry = entryRows(salaryId).find(entry => String(entry.advanceId) === firstLoan);
  const correctionRequest = { originalSlipId: salaryId, payrollPeriodId: periods.get('2026-08'), grossAdjustment: 0, deductionAdjustment: 0,
    advanceRepaymentIds: [String(originalEntry.id)], reason: `核实原借款扣还后退回_${caseTag}` };
  reject(await post(employee, '/corrections', correctionRequest), '普通员工不能退回借款工资扣款');
  const correctionId = String(successful(await post(admin, '/corrections', correctionRequest), '真实提交仅借款退回的工资补正'));
  reject(await post(admin, `/corrections/${correctionId}/pay`), '补正未审批不能先支付');
  const correctionRow = () => rows(`SELECT JSON_OBJECT('status',status,'instance',instance_id,'slipId',correction_slip_id)
    FROM hr_payroll_correction WHERE tenant_id=100000 AND correction_id=${correctionId};`)[0];
  const bound = await waitFor(correctionRow, value => Boolean(value?.instance), '真实工资补正流程未绑定');
  const workflowVariables = rows(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(bound.instance)};`)[0];
  const initiatorId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';");
  check('借款工资补正冻结真实财务名单和模型，排除发起人与借款员工', Boolean(workflowVariables._hDefinition)
    && String(workflowVariables.applicantUserId) === initiatorId && workflowVariables._hExcludedUserIds.includes(initiatorId)
    && Array.isArray(workflowVariables.hCorrectionApproverIds) && workflowVariables.hCorrectionApproverIds.length > 0
    && !workflowVariables.hCorrectionApproverIds.includes(initiatorId) && !workflowVariables.hCorrectionApproverIds.includes(person.userId));
  const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task
    WHERE tenant_id=100000 AND instance_id=${literal(bound.instance)} AND status='TODO';`), value => value.length === 1, '财务真实审批任务未生成');
  const task = tasks[0];
  const assignee = rows(`SELECT JSON_OBJECT('id',actor.user_id,'username',actor.user_name,'passwordReset',actor.pwd_reset_required) FROM sys_user actor
    WHERE actor.tenant_id=100000 AND actor.user_id=${literal(task.assignee)} AND actor.status='0' AND actor.deleted=0
      AND EXISTS (SELECT 1 FROM sys_user_role assignment WHERE assignment.tenant_id=actor.tenant_id
        AND assignment.user_id=actor.user_id AND assignment.role_id=3);`)[0];
  check('真实流程选定另一名有效财务，测试不改写任务办理人', Boolean(assignee) && String(assignee.id) !== person.userId);
  const passwordBefore = database(`SELECT HEX(password) FROM sys_user WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`);
  assert.match(passwordBefore, /^[A-F0-9]+$/);
  let finance;
  try {
    database(`UPDATE sys_user actor JOIN sys_user fixture ON fixture.tenant_id=actor.tenant_id AND fixture.user_name='g_holiday_employee'
      SET actor.password=fixture.password,actor.pwd_reset_required='0' WHERE actor.tenant_id=100000 AND actor.user_id=${literal(assignee.id)};`);
    finance = await session(assignee.username, 'g_holiday_employee');
  } finally {
    database(`UPDATE sys_user SET password=UNHEX('${passwordBefore}'),pwd_reset_required=${assignee.passwordReset == null ? 'NULL' : literal(assignee.passwordReset)}
      WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`);
    check('隔离财务登录凭据临时前置已还原，审批任务及角色保持原样', passwordBefore === database(`SELECT HEX(password) FROM sys_user
      WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`) && rows(`SELECT JSON_OBJECT('value',pwd_reset_required) FROM sys_user
      WHERE tenant_id=100000 AND user_id=${literal(assignee.id)};`)[0].value === assignee.passwordReset);
  }
  rejectCode(await api(admin, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: '发起人不能自批借款补正' } }), '补正发起人不能绕过独立财务', 'H_SELF_APPROVAL_FORBIDDEN');
  reject(await api(employee, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: '借款员工不能自批返还' } }), '借款员工不能审批本人返还');
  rejectCode(await api(finance, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: '篡改冻结名单应拒绝',
    variables: { hCorrectionApproverIds: [person.userId] } } }), '财务不能通过完成任务改写冻结名单', 'H_IDENTITY_OVERRIDE_FORBIDDEN');
  rejectCode(await api(finance, '/workflow/enhance/task/delegate', { method: 'POST', body: { taskId: task.id, mode: 'TRANSFER',
    toUserId: person.userId, toUserName: person.username, reason: '冻结财务任务禁止转回借款人' } }), '财务不能把借款补正转给借款人', 'H_PARTICIPANT_CHANGE_FORBIDDEN');
  check('错误审批和改派均未改变原任务及还款本金', database(`SELECT CONCAT(status,':',assignee) FROM wf_task
    WHERE tenant_id=100000 AND task_id=${literal(task.id)};`) === `TODO:${assignee.id}` && correctionRow().status === 'PENDING'
    && balance(firstLoan).status === 'CLEARED' && balance(firstLoan).repaid === 60);
  successful(await api(finance, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: `独立财务核实原扣款_${caseTag}` } }), '另一名财务完成真实工资补正审批');
  const approved = await waitFor(correctionRow, value => value?.status === 'APPLIED', '补正审批真实回调未完成');
  check('补正审批通过仍不提前退回借款本金', balance(firstLoan).status === 'CLEARED' && balance(firstLoan).repaid === 60);
  const delta = await read(`/slips/${approved.slipId}`);
  check('补正工资仅返还60元且不改变税额', cents(delta.netTotal) === 6000n && cents(delta.grossTotal) === 0n && cents(delta.taxAmount) === 0n);
  await pause(5100);
  successful(await post(admin, `/corrections/${correctionId}/pay`), '真实支付补正工资后退回原借款扣还');
  check('实际补正保留原款并新增唯一反向流水', balance(firstLoan).repaid === 0 && balance(firstLoan).outstanding === 60
    && entryRows(salaryId).find(entry => String(entry.id) === String(originalEntry.id)).status === 'REVERSED'
    && entryRows(approved.slipId).length === 1 && entryRows(approved.slipId)[0].amount === -60
    && String(entryRows(approved.slipId)[0].reversalOf) === String(originalEntry.id) && entryRows(approved.slipId)[0].month === '2026-07');
  evidence.correction = true;
  successful(await api(admin, `/hr/ess/salary-slips/generate?periodMonth=2026-09&employeeId=${peer.employeeId}`, { method: 'POST' }), '既有单张月度工资入口计算借款扣还');
  const singleId = database(`SELECT id FROM hr_salary_slip WHERE tenant_id=100000 AND employee_id=${peer.employeeId} AND period_month='2026-09' AND deleted=0;`);
  assert.match(singleId, /^[1-9]\d*$/);
  const single = successful(await api(otherEmployee, `/hr/ess/salary-slips/${singleId}`), '本人读取单张入口封存工资');
  check('单张生成按数字项目键保存相同精确身份', single.components.some(component => component.salaryComponentId === salaryComponent.id
    && component.salaryComponentKey === salaryComponent.id && component.salaryComponentIdentity === 'VERIFIED'));
  check('单张工资入口同样保存完整月份和实发前固定工资依据', single.components.some(component => component.type === 'PAYROLL_BASIS'
    && component.evidenceVersion === 2 && component.periodStart === '2026-09-01' && component.periodEnd === '2026-09-30'
    && component.monthlyPortions.length === 1 && cents(component.monthlyPortions[0].postedGross) === 1000000n));
  check('单张生成只预约50元并保持未真实还款', single.status === 'SUBMITTED' && entryRows(singleId).length === 1
    && entryRows(singleId)[0].status === 'RESERVED' && balance(peerLoan).reserved === 50 && balance(peerLoan).repaid === 0);
  evidence.singleGeneration = true;
  check('工资专项没有改动任何普通员工角色授权', employeeGrants === database('SELECT CONCAT(tenant_id,\':\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;'));
  check('真实借款工资专项各连接均取得结果', Object.values(evidence).every(Boolean));
}
