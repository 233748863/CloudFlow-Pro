import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { approveAdvanceInUi, submitAdvanceWithLostResponse } from './verify-hr-advance-approval-ui.mjs';

export async function verifyHrAdvanceApproval(context) {
  const { admin, api, successful, session: openSession, database, check, caseTag, evidence, directory, state, requests } = context;
  const ui = process.argv.includes('--hr-advance-approval-only');
  const sensitive = new Set();
  const remember = async page => {
    if (ui) {
      const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
      assert.ok(token); sensitive.add(token.replace(/^Bearer /, ''));
      await fs.writeFile(path.join(directory, 'private', `advance-approval-secrets-${caseTag}.json`), JSON.stringify([...sensitive]), { mode: 0o600 });
    }
    return page;
  };
  const session = async (...args) => remember(await openSession(...args));
  await remember(admin);
  const root = '/hr/advance';
  const marker = `h2ap_${caseTag}`;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', ...(body === undefined ? {} : { body }) });
  const rejected = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    [400, 401, 403, 404, 409, 422].includes(result.status) && result.body?.code !== 200);
  const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
  const waitFor = async (probe, accepted, label) => {
    const deadline = Date.now() + 90000;
    do { const value = await probe(); if (accepted(value)) return value; await pause(600); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const read = async (actor, id) => successful(await api(actor, `${root}/mine/${id}`), '读取本人借款').advance;
  const loan = id => rows(`SELECT JSON_OBJECT('instance',instance_id,'approval',approval_status,'status',status,'version',version,
    'payment',CAST(payment_request_id AS CHAR),'outstanding',CAST(outstanding_amount AS CHAR),'paid',paid_time)
    FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${id};`)[0];
  const taskRows = instance => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key)
    FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(instance)} AND status='TODO';`);
  const grantsSql = 'SELECT CONCAT(tenant_id,\':\',role_id,\':\',menu_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;';
  const grantsBefore = database(grantsSql);
  const userRolesSql = 'SELECT CONCAT(tenant_id,\':\',user_id,\':\',role_id) FROM sys_user_role ORDER BY tenant_id,user_id,role_id;';
  const userRolesBefore = database(userRolesSql);
  const leaderBefore = database('SELECT HEX(COALESCE(leader,\'\')) FROM sys_dept WHERE tenant_id=100000 AND dept_id=100;');
  assert.match(leaderBefore, /^[a-fA-F0-9]*$/);
  const configKey = 'sys.hr.advance.processKey';
  const configRoot = '/auth/system/config';
  const ruleRoot = '/auth/system/rules';
  const codes = ['hr.advance.salary.multiplier', 'hr.advance.payroll.maximumNetRatio', 'hr.advance.payroll.minimumNetAmount'];
  check('隔离验收不覆盖既有借款额度规则', database(`SELECT COUNT(*) FROM sys_business_rule WHERE rule_code IN (${codes.map(literal).join(',')});`) === '0');
  const configured = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原借款流程配置').records.find(row => row.configKey === configKey);
  const journal = createOwnedRecoveryJournal(directory, `${marker}-advance`, { marker, grantsBefore, userRolesBefore, leaderBefore, configKey, configured: configured ?? null, codes });
  const identities = [];
  let removedFinanceBindings = [];
  let roleId; let trainingRoleId; let menuId; let structureId; let configChanged = false;
  const createdRules = [];
  const createPerson = (suffix, assignedRole) => {
    const username = `${marker}_${suffix}`;
    journal('create-person', { username, assignedRole });
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(username)},${literal(username)},password,'0',0,'0',${literal(marker)},NOW()
      FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';`);
    const userId = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(username)};`);
    assert.match(userId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${assignedRole});
      INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,hire_date,user_id,deleted)
      VALUES (100000,${literal(username)},${literal(username)},'UNKNOWN',100,'REGULAR','2020-01-01',${userId},0);`);
    const employeeId = database(`SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id=${userId};`);
    const person = { username, userId, employeeId }; identities.push(person);
    journal('created-person', person);
    if (trainingRoleId && ['employee', 'hr'].includes(suffix)) database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${userId},${trainingRoleId});`);
    return person;
  };
  const create = async (actor, amount, suffix, plan = {}) => String(successful(await api(actor, root, { method: 'POST',
    headers: { 'Idempotency-Key': randomUUID().replaceAll('-', '') }, body: { amount, purpose: `${marker}_${suffix}`, repayMode: 'LUMP_SUM', ...plan } }), '实际创建借款草稿'));
  const submit = async (actor, id) => post(actor, `${root}/${id}/submit`, { version: (await read(actor, id)).version });
  const complete = (actor, task, extra = {}) => post(actor, '/workflow/wf/complete', { taskId: task.id, action: 'APPROVE', comment: marker, ...extra });
  const replayPayment = async (body, headers = {}) => {
    const port = state.services.find(service => service.name === 'hr')?.port;
    assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
    const response = await fetch(`http://127.0.0.1:${port}/inner/hr/advance/payment-event`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000', ...headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const result = { status: response.status, body: await response.json() };
    requests.push({ path: '/inner/hr/advance/payment-event', method: 'POST', status: result.status, code: result.body?.code });
    return result;
  };
  try {
    database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (100000,${literal(marker)},${literal(marker)},99,'5',4,'0',0);`);
    roleId = database(`SELECT role_id FROM sys_role WHERE tenant_id=100000 AND role_key=${literal(marker)};`);
    database(`INSERT INTO sys_menu (menu_name,parent_id,order_num,path,menu_type,visible,status,perms,create_by)
      VALUES (${literal(marker)},0,99,'','F','1','0','hr:advance:submit',${literal(marker)});`);
    menuId = database(`SELECT menu_id FROM sys_menu WHERE create_by=${literal(marker)} AND perms='hr:advance:submit';`);
    assert.match(roleId, /^[1-9]\d*$/); assert.match(menuId, /^[1-9]\d*$/);
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (100000,${roleId},${menuId});`);
    if (context.trainingParticipants) {
      const trainingPermissions = ['hr:training:enroll:add', 'hr:training:enroll:edit'];
      check('组合培训使用既有报名与维护权限且不改默认角色', database(`SELECT COUNT(DISTINCT perms) FROM sys_menu
        WHERE status='0' AND perms IN (${trainingPermissions.map(literal).join(',')});`) === '2');
      database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
        VALUES (100000,${literal(`${marker}_training`)},${literal(`${marker}_training`)},99,'5',4,'0',0);`);
      trainingRoleId = database(`SELECT role_id FROM sys_role WHERE tenant_id=100000 AND role_key=${literal(`${marker}_training`)};`);
      assert.match(trainingRoleId, /^[1-9]\d*$/);
      database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT 100000,${trainingRoleId},menu_id FROM sys_menu
        WHERE status='0' AND perms IN (${trainingPermissions.map(literal).join(',')});`);
    }
    const person = createPerson('employee', 5); const peerPerson = createPerson('peer', 5);
    const leaderPerson = createPerson('leader', 2); const financePerson = createPerson('finance', 3);
    const financePeerPerson = createPerson('fin_peer', 3);
    removedFinanceBindings = rows(`SELECT JSON_OBJECT('userId',CAST(binding.user_id AS CHAR),'roleId',CAST(binding.role_id AS CHAR))
      FROM sys_user_role binding JOIN sys_role role_row ON role_row.tenant_id=binding.tenant_id AND role_row.role_id=binding.role_id
      JOIN sys_user user_row ON user_row.tenant_id=binding.tenant_id AND user_row.user_id=binding.user_id
      WHERE binding.tenant_id=100000 AND role_row.role_key='finance' AND user_row.status='0' AND user_row.deleted=0
        AND user_row.user_id NOT IN (${financePerson.userId},${financePeerPerson.userId});`);
    journal('remove-finance-bindings', { removedFinanceBindings, roleId, trainingRoleId, menuId });
    for (const binding of removedFinanceBindings) {
      assert.match(binding.userId, /^[1-9]\d*$/); assert.match(binding.roleId, /^[1-9]\d*$/);
      database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${binding.userId} AND role_id=${binding.roleId};`);
    }
    for (const identity of [person, peerPerson]) database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${identity.userId},${roleId});`);
    database(`UPDATE sys_dept SET leader=${literal(leaderPerson.userId)} WHERE tenant_id=100000 AND dept_id=100;`);
    const employee = await session(person.username, 'g_holiday_employee'); const peer = await session(peerPerson.username, 'g_holiday_employee');
    const leader = await session(leaderPerson.username, 'g_holiday_employee'); const finance = await session(financePerson.username, 'g_holiday_employee');
    const financePeer = await session(financePeerPerson.username, 'g_holiday_employee');
    const model = { nodes: [
      { id: 'start', type: 'START', title: '申请借款' },
      { id: 'manager', type: 'APPROVAL', title: '部门负责人', approverType: 'VARIABLE_USER', approverValue: 'responsibleApproverIds', allowDelegate: false, allowAddSign: false },
      { id: 'finance', type: 'APPROVAL', title: '财务复核', approverType: 'VARIABLE_USER', approverValue: 'financeApproverIds', signType: 'ANY', allowDelegate: false, allowAddSign: false },
      { id: 'end', type: 'END', title: '完成' }], edges: [{ id: 'first', source: 'start', target: 'manager' }, { id: 'second', source: 'manager', target: 'finance' }, { id: 'third', source: 'finance', target: 'end' }] };
    database(`INSERT INTO wf_process_definition (definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES (${literal(marker)},100000,${literal(marker)},${literal(marker)},1,${literal(JSON.stringify(model))},'PUBLISHED',1,0);
      INSERT INTO hr_comp_structure (tenant_id,structure_code,structure_name,component_config,status)
      VALUES (100000,${literal(marker)},${literal(marker)},JSON_OBJECT('payrollBasis',JSON_OBJECT('salaryBasis','MONTHLY','prorationBasis','CALENDAR_DAYS','benefitTiming','FIRST_PAYROLL')),1);`);
    structureId = database(`SELECT id FROM hr_comp_structure WHERE tenant_id=100000 AND structure_code=${literal(marker)};`);
    successful(await api(admin, configRoot, { method: configured ? 'PUT' : 'POST', body: { ...(configured || {}), configKey,
      configName: marker, configValue: marker, configType: 'N', configScope: '1' } }), '实际配置隔离借款审批'); configChanged = true;
    for (const identity of [person, peerPerson]) {
      successful(await post(admin, '/hr/compensation/employee-compensations', { employeeId: identity.employeeId, structureId,
        componentValues: {}, totalSalary: '10000.00', effectiveDate: '2020-01-01', status: 'ACTIVE' }), '真实加密薪资接口保存已生效月薪');
      check('工资按真实加密字段保存', database(`SELECT COUNT(*) FROM hr_employee_comp WHERE tenant_id=100000 AND employee_id=${identity.employeeId}
        AND total_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$';`) === '1');
    }
    successful(await post(admin, '/hr/compensation/employee-compensations', { employeeId: person.employeeId, structureId,
      componentValues: {}, totalSalary: '100000.00', effectiveDate: '2099-01-01', status: 'ACTIVE' }), '真实保存尚未生效的更高月薪');
    const main = await create(employee, '100.00', 'main', context.primaryRepaymentPlan || {});
    rejected(await submit(employee, main), '未核定规则时拒绝提交并保留草稿');
    check('缺规则不会预约本金或启动审批', loan(main).approval === 'DRAFT' && loan(main).instance == null);
    const values = ['0.02', '0.50', '100.00'];
    for (let index = 0; index < codes.length; index++) {
      successful(await post(admin, ruleRoot, { ruleCode: codes[index], ruleName: marker, module: 'hr', thresholdValue: values[index], effect: 'BLOCK', enabled: 1, priority: 100, remark: marker }), '规则中心创建隔离规则');
      const rule = successful(await api(admin, `${ruleRoot}/list?ruleCode=${codes[index]}&pageSize=100`), '读取实际规则').records.find(row => row.ruleCode === codes[index]);
      assert.ok(rule?.id); createdRules.push(rule);
      journal('created-rule', rule);
      const draft = successful(await post(admin, `${ruleRoot}/draft`, { ...rule, remark: `${marker}_published` }), '规则中心建立新版本');
      successful(await post(admin, `${ruleRoot}/versions/${draft.id}/publish`), '通过真实发布入口核定规则版本');
    }
    evidence.rules = true;
    const excessive = await create(employee, '200.01', 'excessive');
    const excessiveResult = await submit(employee, excessive);
    rejected(excessiveResult, '超出已生效月薪乘核定倍率的金额被拒绝');
    check('超额拒绝来自真实额度核验', excessiveResult.body?.code === 'ADVANCE_LIMIT_EXCEEDED');
    check('未来加薪未提高当前借款上限', loan(excessive).approval === 'DRAFT' && loan(excessive).instance == null);
    rejected(await post(peer, `${root}/${main}/submit`, { version: (await read(employee, main)).version }), '其他员工不能提交他人的借款');
    await pause(5100); // The earlier rejected submission still occupies the real five-second duplicate-submit window.
    const submittedVersion = (await read(employee, main)).version;
    if (ui) {
      await submitAdvanceWithLostResponse({ page: employee, record: await read(employee, main), check });
      evidence.lostResponse = true;
    }
    else successful(await post(employee, `${root}/${main}/submit`, { version: submittedVersion }), '本人实际提交借款审批');
    const started = await waitFor(() => loan(main), value => Boolean(value?.instance), '借款审批实例未绑定');
    const first = await waitFor(() => taskRows(started.instance), value => value.some(task => task.assignee === leaderPerson.userId), '负责人待办未生成');
    check('首节点只有部门负责人，财务不能提前审核', first.length === 1 && first[0].assignee === leaderPerson.userId);
    if (context.verifyFrozenOffboard) {
      await context.verifyFrozenOffboard({ marker, person, peerPerson, leaderPerson, financePerson, financePeerPerson,
        employee, peer, leader, finance, financePeer, main, started, first: first[0], create, submit, complete, loan, taskRows, read });
      return;
    }
    const detailResponse = await api(leader, `${root}/approval-task/${first[0].id}`);
    const details = successful(detailResponse, '负责人从本人待办读取借款详情');
    check('审批详情响应禁止缓存', detailResponse.cacheControl?.split(',').every(value => value.trim() === 'no-store') === true);
    check('负责人看到完整申请但没有工资快照', details.amount === '100.00' && details.purpose === `${marker}_main` && details.employeeName === person.username
      && !JSON.stringify(details).match(/Salary|Cipher|ruleSnapshot|maximumAmount|occupiedAmount/));
    rejected(await api(peer, `${root}/approval-task/${first[0].id}`), '其他员工不能读取审批详情');
    rejected(await api(finance, `${root}/approval-task/${first[0].id}`), '财务不能借用首审任务读取');
    rejected(await complete(employee, first[0]), '申请人不能自审');
    rejected(await complete(finance, first[0]), '财务不能越过部门负责人');
    rejected(await complete(leader, first[0], { variables: { financeApproverIds: [person.userId] } }), '禁止改写冻结复核人');
    const foreignRole = database('SELECT role_id FROM sys_user_role WHERE user_id=990000703 AND tenant_id=100001 ORDER BY role_id LIMIT 1;');
    assert.match(foreignRole, /^[1-9]\d*$/);
    const foreignMenus = database(`SELECT menu_id FROM sys_menu menu WHERE perms IN ('hr:advance:own','hr:advance:submit','workflow:task:complete')
      AND NOT EXISTS (SELECT 1 FROM sys_role_menu grant_row WHERE grant_row.tenant_id=100001 AND grant_row.role_id=${foreignRole} AND grant_row.menu_id=menu.menu_id);`)
      .split(/\r?\n/).filter(Boolean);
    assert.ok(foreignMenus.every(value => /^[1-9]\d*$/.test(value)));
    try {
      for (const identifier of foreignMenus) database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (100001,${foreignRole},${identifier});`);
      const foreign = await session('g_import_tenant');
      rejected(await api(foreign, `${root}/approval-task/${first[0].id}`), '相同审批权限的另一租户不能读取借款审批详情');
      rejected(await complete(foreign, first[0]), '相同审批权限的另一租户不能办理借款');
      rejected(await post(foreign, `${root}/${main}/submit`, { version: submittedVersion }), '相同提交权限的另一租户不能提交原租户借款');
      evidence.tenants = true;
    } finally {
      for (const identifier of foreignMenus) database(`DELETE FROM sys_role_menu WHERE tenant_id=100001 AND role_id=${foreignRole} AND menu_id=${identifier};`);
    }
    if (ui) await approveAdvanceInUi({ page: leader, task: first[0], expected: details, stage: 'leader', directory, caseTag, check });
    else successful(await complete(leader, first[0]), '部门负责人实际审批通过');
    const second = await waitFor(() => taskRows(started.instance), value => value.some(task => task.assignee === financePerson.userId), '财务待办未生成');
    const financeTask = second.find(task => task.assignee === financePerson.userId);
    check('首审后尚无付款单或本金', loan(main).payment == null && loan(main).outstanding === '0.00');
    successful(await api(finance, `${root}/approval-task/${financeTask.id}`), '财务复核读取完整申请');
    if (ui) {
      await approveAdvanceInUi({ page: finance, task: financeTask, expected: details, stage: 'finance', directory, caseTag, check });
      evidence.desktop = true; evidence.mobile = true;
    } else successful(await complete(finance, financeTask), '财务完成真实复核');
    const approved = await waitFor(() => loan(main), value => Boolean(value?.payment), '真实审批后付款单未建立或未绑定');
    successful(await api(leader, `${root}/approval-task/${first[0].id}`), '部门负责人从本人已办记录复查借款');
    successful(await api(finance, `${root}/approval-task/${financeTask.id}`), '财务从本人任一人复核已办记录复查借款');
    rejected(await api(peer, `${root}/approval-task/${financeTask.id}`), '其他员工不能借用财务已办记录查看借款');
    check('通过审批后只生成待付款来源，本金仍为零', approved.status === 'APPROVED' && approved.outstanding === '0.00' && !approved.paid
      && database(`SELECT COUNT(*) FROM biz_payment_request WHERE tenant_id=100000 AND source_biz_type='HR_ADVANCE' AND source_biz_id=${literal(main)} AND status='APPROVED';`) === '1');
    evidence.approval = true;
    rejected(await post(employee, `/oa/payment/request/${approved.payment}/pay`), '借款本人不能确认付款');
    const settlementNo = `${marker}_settlement`;
    database(`INSERT INTO hr_final_settlement (tenant_id,settlement_no,employee_id,lifecycle_application_id,join_date,relieving_date,approval_status,create_by)
      VALUES (100000,${literal(settlementNo)},${person.employeeId},${person.employeeId},'2020-01-01',CURRENT_DATE,'SUBMITTED',${literal(marker)});`);
    try {
      const blocked = await create(employee, '10.00', 'settlement_blocked');
      const response = await submit(employee, blocked);
      rejected(response, '离职结算占用期间不能提交新借款');
      check('提交明确报告离职结算占用且保留草稿', response.body?.code === 'ADVANCE_SETTLEMENT_PENDING' && loan(blocked).approval === 'DRAFT');
      rejected(await post(finance, `/oa/payment/request/${approved.payment}/pay`), '离职结算占用期间不能实际放款');
      check('结算占用拒绝后付款单仍待付且本金为零', database(`SELECT status FROM biz_payment_request WHERE tenant_id=100000 AND id=${approved.payment};`) === 'APPROVED'
        && loan(main).outstanding === '0.00');
    } finally {
      database(`DELETE FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_no=${literal(settlementNo)} AND create_by=${literal(marker)};`);
    }
    evidence.settlementGuard = true;
    await pause(5100);
    database(`UPDATE hr_employee SET employee_status='RESIGNED' WHERE tenant_id=100000 AND id=${person.employeeId};`);
    rejected(await post(finance, `/oa/payment/request/${approved.payment}/pay`), '审批后离职会阻止付款');
    check('拒绝付款不会产生本金', loan(main).outstanding === '0.00');
    database(`UPDATE hr_employee SET employee_status='REGULAR',name=${literal(`${marker}_renamed`)} WHERE tenant_id=100000 AND id=${person.employeeId};`);
    await pause(5100);
    const paymentFault = `h2ap_paid_${caseTag}`;
    database(`DELIMITER $$
      CREATE TRIGGER ${paymentFault} BEFORE INSERT ON outbox_event FOR EACH ROW
      BEGIN IF NEW.tenant_id=100000 AND NEW.event_type='HR_ADVANCE_PAYMENT_PAID' AND NEW.aggregate_id=${approved.payment}
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_ADVANCE_PAID_EVENT_FAULT'; END IF; END$$
      DELIMITER ;`);
    try {
      const failed = await post(finance, `/oa/payment/request/${approved.payment}/pay`);
      check('实际付款通知保存失败返回错误', failed.status === 500 && failed.body?.code !== 200);
      check('通知保存失败回滚付款状态且不产生本金', database(`SELECT status FROM biz_payment_request WHERE tenant_id=100000 AND id=${approved.payment};`) === 'APPROVED'
        && loan(main).outstanding === '0.00' && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_ADVANCE_PAYMENT_PAID' AND aggregate_id=${approved.payment};`) === '0');
    } finally { database(`DROP TRIGGER ${paymentFault};`); }
    evidence.paymentRollback = true;
    await pause(5100);
    const payments = await Promise.all([post(finance, `/oa/payment/request/${approved.payment}/pay`), post(finance, `/oa/payment/request/${approved.payment}/pay`)]);
    console.log('H2_ADVANCE_PAY_CONFIRM_ATTEMPTS: ' + JSON.stringify(payments.map(result => ({ status: result.status, code: result.body?.code }))));
    check('并发确认付款至少一次成功', payments.some(result => result.status === 200 && result.body?.code === 200));
    const funded = await waitFor(() => loan(main), value => value?.status === 'PAID', '实际付款通知未形成本金');
    check('员工更名后沿用原审批收款姓名并准确入账', funded.outstanding === '100.00' && Boolean(funded.paid)
      && database(`SELECT payee_name FROM biz_payment_request WHERE tenant_id=100000 AND id=${approved.payment};`) === person.username);
    check('一笔实际付款只产生一个通知和一次本金审计', database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_ADVANCE_PAYMENT_PAID' AND aggregate_id=${approved.payment};`) === '1'
      && database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${main} AND operation_type='FUNDED';`) === '1');
    await pause(5100);
    successful(await post(finance, `/oa/payment/request/${approved.payment}/pay`), '重复确认已付款单保持原事实');
    check('重放付款不重复增加本金', loan(main).outstanding === '100.00');
    const paidPayload = JSON.parse(database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')) FROM outbox_event
      WHERE tenant_id=100000 AND event_type='HR_ADVANCE_PAYMENT_PAID' AND aggregate_id=${approved.payment};`));
    for (const response of await Promise.all([replayPayment(paidPayload), replayPayment(paidPayload)])) successful(response, '重复投递实际已保存的付款事件');
    rejected(await replayPayment({ ...paidPayload, amount: '100.01' }), '篡改付款事件金额被拒绝');
    rejected(await replayPayment({ ...paidPayload, tenantId: '100001' }), '付款事件不能改写租户');
    rejected(await replayPayment(paidPayload, { 'X-Tenant-Id': '100001' }), '另一租户上下文不能重放原租户付款');
    rejected(await replayPayment(paidPayload, { 'X-From-Service': 'cloudflow-service-crm' }), '非OA服务不能调用放款入账入口');
    rejected(await post(employee, '/hr/inner/hr/advance/payment-event', paidPayload), '外部员工不能调用内部放款入口');
    check('事件并发重复与篡改后仍只有原本金及一次入账审计', loan(main).outstanding === '100.00'
      && database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${main} AND operation_type='FUNDED';`) === '1');
    evidence.paymentReplay = true;
    evidence.funding = true;
    if (context.verifyFundedSettlement) {
      evidence.permissions = true; evidence.http = true;
      await context.verifyFundedSettlement({ marker, person, peerPerson, leaderPerson, financePerson, financePeerPerson,
        employee, peer, leader, finance, financePeer, main, loan, createPerson });
      return;
    }
    for (const stage of ['leader', 'finance']) {
      const plan = stage === 'finance' ? { repayMode: 'SALARY_DEDUCT', repayStartMonth: database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m');"), repayMonths: 2, monthlyDeductAmount: '5.00' } : {};
      const rejectedLoan = await create(employee, '10.00', `reject_${stage}`, plan);
      successful(await submit(employee, rejectedLoan), `${stage}拒绝场景实际提交`);
      if (stage === 'finance') {
        const frozenPolicy = JSON.parse(database(`SELECT JSON_EXTRACT(rule_snapshot,'$.payrollDeduction') FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${rejectedLoan};`));
        check('工资分期借款冻结实际已发布比例和最低实发额', frozenPolicy.confirmationStatus === 'CONFIRMED'
          && Number(frozenPolicy.maximumNetRatio) === 0.5 && Number(frozenPolicy.minimumNetAmount) === 100
          && frozenPolicy.maximumNetRatioRule.ruleVersion > 0 && frozenPolicy.minimumNetAmountRule.ruleVersion > 0);
      }
      const instance = await waitFor(() => loan(rejectedLoan), value => Boolean(value?.instance), '拒绝场景实例未绑定');
      const leaderTask = (await waitFor(() => taskRows(instance.instance), value => value.some(task => task.assignee === leaderPerson.userId), '拒绝场景负责人待办未生成'))[0];
      let rejectingTask = leaderTask;
      if (stage === 'finance') {
        successful(await complete(leader, leaderTask), '财务拒绝场景先由部门负责人通过');
        rejectingTask = (await waitFor(() => taskRows(instance.instance), value => value.some(task => task.assignee === financePerson.userId), '拒绝场景财务待办未生成')).find(task => task.assignee === financePerson.userId);
      }
      const actor = stage === 'leader' ? leader : finance;
      successful(await complete(actor, rejectingTask, { action: 'REJECT' }), `${stage}通过真实待办拒绝借款`);
      if (stage === 'finance') {
        check('任一人通过模式下单人拒绝仍等待另一财务且不建立付款', loan(rejectedLoan).approval === 'SUBMITTED' && loan(rejectedLoan).payment == null);
        const lastTask = (await waitFor(() => taskRows(instance.instance), value => value.some(task => task.assignee === financePeerPerson.userId), '另一财务待办未保留')).find(task => task.assignee === financePeerPerson.userId);
        successful(await complete(financePeer, lastTask, { action: 'REJECT' }), '全部财务实际拒绝后结束复核');
      }
      const rejectedState = await waitFor(() => loan(rejectedLoan), value => value?.approval === 'REJECTED', '真实拒绝未回写借款');
      successful(await api(actor, `${root}/approval-task/${rejectingTask.id}`), `${stage}可从本人拒绝记录复查借款`);
      check(`${stage}拒绝不产生付款单和本金`, rejectedState.payment == null && rejectedState.outstanding === '0.00'
        && database(`SELECT COUNT(*) FROM biz_payment_request WHERE tenant_id=100000 AND source_biz_type='HR_ADVANCE' AND source_biz_id=${literal(rejectedLoan)};`) === '0');
    }
    evidence.rejections = true;
    const delayedLoan = await create(employee, '10.00', 'delayed_callback');
    successful(await submit(employee, delayedLoan), '延迟通知场景实际提交');
    const delayedInstance = await waitFor(() => loan(delayedLoan), value => Boolean(value?.instance), '延迟通知实例未绑定');
    const delayedLeaderTask = (await waitFor(() => taskRows(delayedInstance.instance), value => value.some(task => task.assignee === leaderPerson.userId), '延迟通知负责人待办未生成'))[0];
    successful(await complete(leader, delayedLeaderTask), '延迟通知场景负责人真实通过');
    const delayedFinanceTask = (await waitFor(() => taskRows(delayedInstance.instance), value => value.some(task => task.assignee === financePerson.userId), '延迟通知财务待办未生成')).find(task => task.assignee === financePerson.userId);
    const callbackFault = `h2ap_callback_${caseTag}`;
    database(`DELIMITER $$
      CREATE TRIGGER ${callbackFault} BEFORE INSERT ON hr_audit_log FOR EACH ROW
      BEGIN IF NEW.tenant_id=100000 AND NEW.business_domain='HR_ADVANCE' AND NEW.business_id=${delayedLoan} AND NEW.operation_type='DECISION'
        THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_ADVANCE_DECISION_FAULT'; END IF; END$$
      DELIMITER ;`);
    try {
      successful(await complete(finance, delayedFinanceTask), '真实终审成功但暂时阻止HR结果落账');
      check('通知故障期间流程已通过而HR尚待同步', database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(delayedInstance.instance)};`) === 'PASSED'
        && loan(delayedLoan).approval === 'SUBMITTED' && loan(delayedLoan).payment == null);
      const withdrawn = await post(employee, `${root}/${delayedLoan}/withdraw`, { version: loan(delayedLoan).version, reason: marker });
      rejected(withdrawn, '通知延迟不能撤回已经真实通过的流程');
      check('终审后的撤回被明确拒绝且原申请保留', withdrawn.body?.code === 'ADVANCE_WITHDRAW_STATE' && loan(delayedLoan).approval === 'SUBMITTED');
      database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${financePerson.userId} AND create_by=${literal(marker)};`);
    } finally { database(`DROP TRIGGER ${callbackFault};`); }
    try {
      await waitFor(() => loan(delayedLoan), value => Boolean(value?.payment), '审批人事后停用不应阻断真实审批结果恢复');
      check('恢复只建立一次付款来源和审批审计', database(`SELECT COUNT(*) FROM biz_payment_request WHERE tenant_id=100000 AND source_biz_type='HR_ADVANCE' AND source_biz_id=${literal(delayedLoan)};`) === '1'
        && database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_ADVANCE' AND business_id=${delayedLoan} AND operation_type='DECISION';`) === '1'
        && loan(delayedLoan).outstanding === '0.00');
    } finally {
      database(`UPDATE sys_user SET status='0' WHERE tenant_id=100000 AND user_id=${financePerson.userId} AND create_by=${literal(marker)};`);
    }
    evidence.delayedCallback = true;
    const racing = await Promise.all([create(employee, '70.00', 'race1'), create(employee, '70.00', 'race2')]);
    const race = await Promise.all(racing.map(id => submit(employee, id)));
    check('同员工并发申请共用额度，两个70元申请只允许一个成功', race.filter(result => result.status === 200 && result.body?.code === 200).length === 1
      && database(`SELECT COUNT(*) FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id IN (${racing.join(',')}) AND approval_status='SUBMITTED';`) === '1');
    const winner = racing.find(id => loan(id).approval === 'SUBMITTED');
    await waitFor(() => loan(winner), value => Boolean(value?.instance), '并发成功借款的实际审批绑定未完成');
    const withdrawalVersion = (await read(employee, winner)).version;
    successful(await post(employee, `${root}/${winner}/withdraw`, { version: withdrawalVersion, reason: marker }), '实际撤回尚未通过的借款');
    check('撤回释放待批额度且未形成付款', loan(winner).approval === 'CANCELLED' && loan(winner).payment == null);
    evidence.concurrency = true;
    evidence.permissions = true;
    evidence.http = true;
  } finally {
    if (!context.verifyFrozenOffboard && !context.verifyFundedSettlement) database(`UPDATE hr_employee SET employee_status='REGULAR' WHERE tenant_id=100000 AND employee_no LIKE ${literal(`${marker}_%`)};`);
    const unfinished = rows(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000
      AND definition_id=${literal(marker)} AND status IN ('RUNNING','PAUSED','PENDING','FAILED','RESTARTED');`);
    for (const instance of unfinished) successful(await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${marker}隔离验收结束` }), '结束本次隔离待办');
    if (configChanged) {
      if (configured) successful(await api(admin, configRoot, { method: 'PUT', body: configured }), '恢复原借款流程配置');
      else {
        const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取隔离配置').records.find(row => row.configKey === configKey);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除隔离流程配置');
      }
    }
    for (const rule of createdRules) successful(await api(admin, `${ruleRoot}/${rule.id}`, { method: 'DELETE' }), '移除隔离额度规则，保留发布历史');
    database(`UPDATE sys_dept SET leader=CONVERT(UNHEX('${leaderBefore}') USING utf8mb4) WHERE tenant_id=100000 AND dept_id=100;
      UPDATE wf_process_definition SET status='DRAFT',is_archived=1 WHERE tenant_id=100000 AND definition_id=${literal(marker)};`);
    for (const identity of identities) {
      if (context.cleanupIdentity) await context.cleanupIdentity(identity);
      else database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${identity.userId} AND create_by=${literal(marker)};`);
      database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${identity.userId};`);
    }
    for (const binding of removedFinanceBindings) database(`INSERT IGNORE INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,${binding.userId},${binding.roleId});`);
    if (roleId) database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${roleId}; DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=${roleId} AND role_key=${literal(marker)};`);
    if (trainingRoleId) database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${trainingRoleId}; DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=${trainingRoleId} AND role_key=${literal(`${marker}_training`)};`);
    if (menuId) database(`DELETE FROM sys_menu WHERE menu_id=${menuId} AND create_by=${literal(marker)};`);
    check('正式角色授权逐条保持不变', database(grantsSql) === grantsBefore);
    check('原有账号的角色关联逐条恢复', database(userRolesSql) === userRolesBefore);
    evidence.cleanup = true;
    journal('restored', { configuration: true, roles: true, leader: true, rules: true, identities: identities.map(identity => identity.userId) });
    console.log('H2_ADVANCE_APPROVAL_CLEANUP: original_grants_restored=true; rules_removed=true; financial_history_retained=true; production_modified=false');
  }
}
