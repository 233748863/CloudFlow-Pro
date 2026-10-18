import fs from 'node:fs/promises';
import path from 'node:path';
import { check, jsonRows, sqlText, until, pause, completeWorkflowTask, readFixture, saveFixture, privateDirectory, registerLogMarker,
  success, requestMetadata, directory, logEvidence } from './live-lib.mjs';
import { hundredths, decimal, payAmount } from './hr09-evidence.mjs';
import { preparePayFixture } from './hr09-payroll.mjs';
import { openHr09Actors } from './hr09-actors.mjs';

const payroll = '/hr/compensation/payroll';
const overtime = '/hr/attendance/overtime-requests';
const configFields = ['configId', 'tenantId', 'configScope', 'configKey', 'configName', 'configType', 'configValue', 'remark'];
const approverName = 'h_20260914_finance3';

export function correctionActorPayload(snapshot, departmentId) {
  if (!snapshot || snapshot.username !== approverName || snapshot.tenantId !== '100000'
    || !/^[1-9][0-9]*$/.test(snapshot.userId) || !/^[1-9][0-9]*$/.test(departmentId)
    || snapshot.status !== '0' || !Number.isInteger(snapshot.version) || snapshot.version < 0
    || snapshot.roleIds?.length !== 1 || snapshot.roleIds[0] !== '3') {
    throw new Error('H_HR_CORRECTION_ACTOR_INVALID');
  }
  return { userId: snapshot.userId, version: snapshot.version, deptId: departmentId, status: snapshot.status, roleIds: ['3'] };
}

export function correctionTax(gross, previousGross, previousTax) {
  const currentGross = hundredths(gross);
  const currentTax = (hundredths(previousGross) + currentGross + 5n) / 10n - hundredths(previousTax);
  if (currentTax < 0n || currentTax > currentGross) throw new Error('H_HR_CORRECTION_TAX_INVALID');
  return { gross: decimal(currentGross), tax: decimal(currentTax), net: decimal(currentGross - currentTax) };
}

export function correctionWorkflowModel(original, approverId, linked) {
  if (!original || !Array.isArray(original.nodes) || original.nodes.length !== 3
    || !Array.isArray(original.edges) || original.edges.length !== 2 || !/^[1-9][0-9]*$/.test(approverId)) {
    throw new Error('H_HR_CORRECTION_MODEL_INVALID');
  }
  const model = structuredClone(original);
  const approvals = model.nodes.filter(node => node.type === 'APPROVAL');
  if (approvals.length !== 1 || !model.nodes.some(node => node.type === 'START') || !model.nodes.some(node => node.type === 'END')) {
    throw new Error('H_HR_CORRECTION_MODEL_INVALID');
  }
  approvals[0].approverType = linked ? 'VARIABLE_USER' : 'USER';
  approvals[0].approverValue = linked ? 'hCorrectionApproverIds' : approverId;
  approvals[0].signType = 'ANY';
  approvals[0].approveSelf = 'ALLOW';
  return model;
}

function correctionRow(id) {
  const found = jsonRows(`SELECT JSON_OBJECT('id',CAST(correction_id AS CHAR),'originalSlipId',CAST(original_slip_id AS CHAR),
    'slipId',CAST(correction_slip_id AS CHAR),'instanceId',instance_id,'status',status,'version',version)
    FROM hr_payroll_correction WHERE tenant_id=100000 AND correction_id=${sqlText(id)} AND deleted=0`);
  check('补正真实单据唯一且未删除', found.length === 1);
  return found[0];
}

function actorSnapshot(userId) {
  const rows = jsonRows(`SELECT JSON_OBJECT('userId',CAST(user_id AS CHAR),'deptId',CAST(dept_id AS CHAR),
    'username',user_name,'tenantId',CAST(tenant_id AS CHAR),'status',status,'version',version,
    'owned',create_by='H-20260914') FROM sys_user WHERE tenant_id=100000 AND user_id=${sqlText(userId)} AND deleted=0`);
  check('借用补正审批人限定本组已有财务账号', rows.length === 1 && rows[0].username === approverName && Number(rows[0].owned) === 1);
  const roleIds = jsonRows(`SELECT JSON_OBJECT('id',CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE tenant_id=100000 AND user_id=${sqlText(userId)} ORDER BY role_id`).map(row => row.id);
  const postIds = jsonRows(`SELECT JSON_OBJECT('id',CAST(post_id AS CHAR)) FROM sys_user_post
    WHERE tenant_id=100000 AND user_id=${sqlText(userId)} ORDER BY post_id`).map(row => row.id);
  return { ...rows[0], roleIds, postIds };
}

function actorUnchanged(actual, original) {
  return ['userId', 'deptId', 'username', 'tenantId', 'status'].every(field => actual[field] === original[field])
    && JSON.stringify(actual.roleIds) === JSON.stringify(original.roleIds)
    && JSON.stringify(actual.postIds) === JSON.stringify(original.postIds);
}

async function prepareApprover(context) {
  const { fixture, sessions, ok, save, eligibleOperator } = context;
  const state = fixture.payCorrection;
  const actors = await readFixture('hr09-actors');
  const accounts = JSON.parse(await fs.readFile(path.join(privateDirectory, 'accounts.private.json'), 'utf8')).payload?.identities;
  const account = accounts?.finance3;
  check('补正只借用已真实认证的隔离财务账号且不新增用户', account?.username === approverName && account.roleId === '3'
    && account.sourceUserId === '3' && account.tenantId === '100000' && account.changed === true && Boolean(account.userId));
  const original = actorSnapshot(account.userId);
  correctionActorPayload(original, sessions.accounts.employee.deptId);
  state.actor = { original, userId: original.userId, borrowed: true, created: false };
  await save();
  if (original.deptId !== sessions.accounts.employee.deptId) {
    await ok('admin', '/auth/system/user', 'PUT', correctionActorPayload(original, sessions.accounts.employee.deptId));
  }
  actors.accounts.payapprover = { ...account, deptId: sessions.accounts.employee.deptId, passwordConfigured: true, borrowedFrom: 'finance3' };
  delete actors.accounts.payapprover.storageState;
  await saveFixture('hr09-actors', actors);
  await openHr09Actors(sessions, ['payapprover'], sessions.accounts.employee.deptId);
  const current = actorSnapshot(account.userId);
  check('借用补正审批人仅变更部门且保持单一财务角色与岗位', actorUnchanged(current, { ...original, deptId: sessions.accounts.employee.deptId }));
  check('补正实际审批人独立于经办人与原工资员工', current.userId === sessions.accounts.payapprover.userId
    && state.actor.userId !== sessions.accounts.finance.userId && state.actor.userId !== sessions.accounts.employee.userId);
  eligibleOperator('payapprover', 'workflow:task:complete');
  await save();
}

async function prepareWorkflow(context, linked) {
  const { fixture, sessions, label, note, ok, save } = context;
  const state = fixture.payCorrection;
  if (!state.originalConfig) {
    const matches = jsonRows("SELECT JSON_OBJECT('id',CAST(config_id AS CHAR)) FROM sys_config WHERE tenant_id=100000 AND config_scope='1' AND config_key='sys.hr.payroll.correctionProcessKey'");
    check('工资补正流程配置在本租户唯一', matches.length === 1);
    const config = await ok('admin', `/auth/system/config/${matches[0].id}`);
    state.originalConfig = Object.fromEntries(configFields.map(field => [field, config[field] ?? null]));
    await save();
  }
  const definitions = key => jsonRows(`SELECT JSON_OBJECT('id',definition_id,'status',status,'digest',SHA2(model_json,256))
    FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sqlText(key)} AND deleted=0 ORDER BY version DESC`);
  const originals = definitions(state.originalConfig.configValue);
  check('原工资补正流程存在且保持原版本', originals.length >= 1);
  state.originalDefinition ||= originals[0];
  const processKey = linked ? 'h_20260914_hr09_pay_correction_h' : 'h_20260914_hr09_pay_correction';
  let own = definitions(processKey);
  check('临时补正流程仅保留一个验收版本', own.length <= 1);
  if (!own.length) {
    const original = await ok('admin', `/workflow/wf/definition/${state.originalDefinition.id}`);
    const originalModel = typeof original.modelJson === 'string' ? JSON.parse(original.modelJson) : original.modelJson;
    const model = correctionWorkflowModel(originalModel, sessions.accounts.payapprover.userId, linked);
    await ok('admin', '/workflow/wf/definition/save', 'POST', { processKey, processName: `${label} ${linked ? 'H关联' : '已发原单'}补正`,
      modelJson: JSON.stringify(model), formId: null, description: note, startPermissionType: 'ALL' });
    own = definitions(processKey);
  }
  check('补正临时流程由真实接口创建且唯一', own.length === 1);
  if (own[0].status === 'DRAFT') await ok('admin', `/workflow/wf/definition/deploy/${own[0].id}`, 'POST');
  state[linked ? 'linkedDefinitionId' : 'definitionId'] = own[0].id;
  await save();
  await ok('admin', '/auth/system/config', 'PUT', { ...state.originalConfig, configValue: processKey, remark: note });
  check('工资补正临时流程参数真实生效', (await ok('admin', `/auth/system/config/${state.originalConfig.configId}`)).configValue === processKey);
}

async function prepareSource(context) {
  const { fixture, cards, draft, recoverableOvertime, ok, save, approvalActors, note, employeeId } = context;
  const state = fixture.payCorrection;
  if (!state.periods) {
    const periods = jsonRows(`SELECT JSON_OBJECT('id',CAST(period_id AS CHAR),'start',CAST(start_date AS CHAR),'end',CAST(end_date AS CHAR))
      FROM hr_payroll_period WHERE tenant_id=100000 AND status='OPEN' AND deleted=0
      AND start_date>${sqlText(fixture.payroll.period.end)} ORDER BY start_date,period_id`);
    check('真实已发原单之后存在原目标与补正目标两个开放周期', periods.length >= 2
      && periods[0].start === '2026-09-01' && periods[1].start === '2026-10-01');
    state.periods = periods.slice(0, 2);
    await save();
  }
  if (!state.sourceDate) {
    if (state.sourceId) {
      let retired = await ok('employee', `${overtime}/${state.sourceId}`);
      check('日期冲突只回收本组未提交且未结算草稿', ['DRAFT', 'CANCELLED'].includes(retired.status)
        && !retired.instanceId && !retired.settledFlag && !retired.compChangeId && !retired.payrollCorrectionId);
      if (retired.status !== 'CANCELLED') retired = await ok('employee', `${overtime}/${state.sourceId}/cancel`, 'POST',
        { version: retired.version, reason: `${note} 测试日期与已批准调休记录冲突，保留原始卡并回收草稿` });
      check('冲突草稿经真实接口撤回且不修改历史考勤', retired.status === 'CANCELLED');
      state.retiredSourceIds = [String(retired.requestId)];
      state.retainedRawCardIds = [fixture.checkins['employee-2026-07-21-OUT-18:30:00']].filter(Boolean);
    }
    state.sourceDate = '2026-07-22';
    await save();
  }
  const raw = jsonRows(`SELECT JSON_OBJECT('type',log_type,'time',CAST(check_time AS CHAR),'own',device_id='H-20260914-HR09')
    FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))}
      AND attendance_date=${sqlText(state.sourceDate)} ORDER BY check_time,checkin_id`);
  check('补正使用独立日期且不会叠加其他原始进出卡', raw.length <= 2 && new Set(raw.map(row => row.type)).size === raw.length
    && raw.every(row => Number(row.own) === 1 && ['IN', 'OUT'].includes(row.type)
      && row.time === `${state.sourceDate} ${row.type === 'IN' ? '09:00:00' : '18:30:00'}`));
  await cards('employee', state.sourceDate, '09:00:00', '18:30:00');
  let request = await recoverableOvertime(`pay-correction-source-${state.sourceDate}`, draft(state.sourceDate, '17:30', '18:30', 'PAY'));
  state.sourceId = request.requestId;
  await save();
  if (request.status === 'DRAFT') request = await ok('employee', `${overtime}/${request.requestId}/submit`, 'POST', { version: request.version });
  if (request.status === 'SUBMITTED' && request.approvedMinutes == null) {
    request = await ok(approvalActors.reviewer, `${overtime}/${request.requestId}/review-hours`, 'POST', { version: request.version, approvedMinutes: 60, note });
  }
  check('关联补正来源工时来自真实卡点与HR核定', request.actualMinutes === 60 && request.approvedMinutes === 60);
  state.sourceAmount = payAmount(60, fixture.payroll.hourlyRate, request.rateMultiplier);
  await save();
  if (request.status === 'SUBMITTED') request = await ok('finance', `${overtime}/${request.requestId}/review-pay`, 'POST', {
    version: request.version, hourlyRate: fixture.payroll.hourlyRate, payrollPeriodId: state.periods[0].id, note });
  const settlement = await ok('finance', `${overtime}/${request.requestId}/settlement`);
  check('新PAY先冻结真实下期并等待原申请审批', settlement.payrollPeriodId === state.periods[0].id
    && settlement.settlementAmount === state.sourceAmount && request.requestId !== fixture.payroll.requestId);
}

function settlementIdentity(id) {
  return jsonRows(`SELECT JSON_OBJECT('correctionVersion',correction.version,'correctionStatus',correction.status,
    'slipId',CAST(slip.id AS CHAR),'slipVersion',slip.version,'slipStatus',slip.status,'digest',slip.digest_sha256)
    FROM hr_payroll_correction correction JOIN hr_salary_slip slip ON slip.tenant_id=correction.tenant_id
      AND slip.id=correction.correction_slip_id WHERE correction.tenant_id=100000 AND correction.correction_id=${sqlText(id)}
      AND correction.deleted=0 AND slip.deleted=0`);
}

async function approveCorrection(context, id, linked) {
  const { fixture, sessions, ok, call, note } = context;
  const state = fixture.payCorrection;
  const correction = await until(async () => correctionRow(id), row => Boolean(row.instanceId), '真实工资补正审批实例绑定');
  const process = jsonRows(`SELECT JSON_OBJECT('definitionId',definition_id,'startUserId',CAST(start_user_id AS CHAR),
    'amountFree',NOT JSON_CONTAINS_PATH(variables,'one','$.diffAmount','$.grossAdjustment','$.deductionAdjustment','$.hourlyRate','$.settlementAmount'))
    FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(correction.instanceId)}`);
  check('补正实例使用独立正式办理人且流程变量不带金额', process.length === 1
    && process[0].definitionId === state[linked ? 'linkedDefinitionId' : 'definitionId']
    && process[0].startUserId === sessions.accounts[linked ? 'employee' : 'finance'].userId && Number(process[0].amountFree) === 1);
  if (!['APPLIED', 'APPROVED'].includes(correction.status)) {
    const unpaid = await call('finance', `${payroll}/corrections/${id}/pay`, 'POST');
    check('未批准补正禁止直接发放', unpaid.body?.code === 'CORRECTION_NOT_APPROVED');
    const tasks = await until(async () => jsonRows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=${sqlText(correction.instanceId)} AND status='TODO'`),
    rows => rows.some(row => row.assignee === sessions.accounts.payapprover.userId), '真实财务补正待办');
    const ownTask = tasks.find(row => row.assignee === sessions.accounts.payapprover.userId);
    const denied = await call(linked ? 'employee' : 'finance', '/workflow/wf/complete', 'POST',
      { taskId: ownTask.id, action: 'APPROVE', comment: note, variables: {} });
    check('补正原申请人不能替代独立财务审批人办理', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code));
    await completeWorkflowTask(sessions, correction.instanceId, 'payapprover');
    await until(async () => correctionRow(id), row => row.status === 'APPLIED', '真实工资补正批准并应用');
    const before = settlementIdentity(id);
    await pause(5100);
    const replay = await call('payapprover', '/workflow/wf/complete', 'POST',
      { taskId: ownTask.id, action: 'APPROVE', comment: note, variables: {} });
    check('已办补正审批重放被业务拒绝且应用状态版本不变', [400, 403, 404, 409].includes(replay.status)
      && replay.body?.code !== 200 && JSON.stringify(settlementIdentity(id)) === JSON.stringify(before));
    state[linked ? 'linkedApprovalReplay' : 'approvalReplay'] = true;
    await context.save();
  }
  const history = jsonRows(`SELECT JSON_OBJECT('operatorId',CAST(operator_id AS CHAR),'nodeKey',node_key,'action',action)
    FROM wf_task_history WHERE tenant_id=100000 AND instance_id=${sqlText(correction.instanceId)}
      AND action IN ('APPROVE','COUNTERSIGN_APPROVE') ORDER BY create_time,history_id`);
  check('补正仅存在一次独立财务真实同意且没有自动代批', history.length === 1
    && history[0].action === 'COUNTERSIGN_APPROVE' && history[0].operatorId === sessions.accounts.payapprover.userId
    && state[linked ? 'linkedApprovalReplay' : 'approvalReplay'] === true);
  const applied = correctionRow(id);
  const slip = await ok('finance', `${payroll}/slips/${applied.slipId}`);
  check('真实补正应用生成独立已封存工资单', applied.status === 'APPLIED' && ['SUBMITTED', 'PAID'].includes(slip.status)
    && slip.batchId == null && /^[a-f0-9]{64}$/i.test(slip.digestSha256));
  return slip;
}

async function payCorrection(context, id, expected) {
  const { fixture, ok, call, save } = context;
  const correction = correctionRow(id);
  const before = await ok('finance', `${payroll}/slips/${correction.slipId}`);
  check('补正差额及累计计税结果符合独立条件计算', hundredths(before.grossTotal) === hundredths(expected.gross)
    && hundredths(before.taxAmount) === hundredths(expected.tax) && hundredths(before.netTotal) === hundredths(expected.net));
  const denied = await call('employee', `${payroll}/corrections/${id}/pay`, 'POST');
  check('工资员工不能代替财务登记补正发放', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code));
  await pause(5100);
  if (before.status !== 'PAID') await ok('finance', `${payroll}/corrections/${id}/pay`, 'POST');
  const paid = await ok('finance', `${payroll}/slips/${correction.slipId}`);
  check('已批准补正经真实发放接口成为PAID', paid.status === 'PAID' && paid.digestSha256 === before.digestSha256);
  const beforeReplay = settlementIdentity(id);
  await pause(5100);
  await ok('finance', `${payroll}/corrections/${id}/pay`, 'POST');
  check('补正重复发放保持唯一工资单及原状态版本摘要', JSON.stringify(settlementIdentity(id)) === JSON.stringify(beforeReplay));
  fixture.payCorrection.paidCorrectionIds ||= [];
  if (!fixture.payCorrection.paidCorrectionIds.includes(id)) fixture.payCorrection.paidCorrectionIds.push(id);
  await save();
  return paid;
}

async function seedPaidCorrection(context, original) {
  const { fixture, ok, call, save, note } = context;
  const state = fixture.payCorrection;
  await prepareWorkflow(context, false);
  state.marker ||= registerLogMarker('工资补正敏感正文');
  state.seedInput ||= { originalSlipId: fixture.payroll.slipId, payrollPeriodId: state.periods[0].id,
    grossAdjustment: '12.34', deductionAdjustment: '0.00', reason: `${note} ${state.marker}` };
  await save();
  const findSeed = () => jsonRows(`SELECT JSON_OBJECT('id',CAST(correction_id AS CHAR)) FROM hr_payroll_correction
    WHERE tenant_id=100000 AND original_slip_id=${sqlText(fixture.payroll.slipId)} AND reason=${sqlText(state.seedInput.reason)} AND deleted=0`);
  let rows = findSeed();
  check('已发原单补正按真实私有标记恢复且不重复创建', rows.length <= 1 && (!state.seedId || rows[0]?.id === state.seedId));
  if (!rows.length) {
    const denied = await call('employee', `${payroll}/corrections`, 'POST', state.seedInput);
    check('普通员工不能发起工资补正', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code));
    state.deniedCreationTrace = requestMetadata(denied);
    const created = await call('finance', `${payroll}/corrections`, 'POST', state.seedInput);
    state.seedId = String(success(created, '真实创建已发工资补正'));
    state.creationTrace = requestMetadata(created);
    await save();
    const replay = await call('finance', `${payroll}/corrections`, 'POST', state.seedInput);
    rows = findSeed();
    check('同一工资补正快速重复创建被拒绝且仅有一单', replay.status === 409 && rows.length === 1 && rows[0].id === state.seedId);
    state.createReplay = true;
    await save();
  } else state.seedId = rows[0].id;
  await approveCorrection(context, state.seedId, false);
  const expected = correctionTax(state.seedInput.grossAdjustment, original.grossTotal, original.taxAmount);
  const paid = await payCorrection(context, state.seedId, expected);
  state.seedSlipId = String(paid.id);
  check('原工资真实补正使用原PAID单及明确后续周期', correctionRow(state.seedId).originalSlipId === fixture.payroll.slipId
    && paid.periodMonth === state.periods[0].start.slice(0, 7) && state.seedSlipId !== fixture.payroll.slipId && state.createReplay === true);
  fixture.completed['pay-paid-correction'] = true;
  await save();
  return paid;
}

async function linkedCorrection(context, original, seed) {
  const { fixture, approveRequest, ok, call, save, note } = context;
  const state = fixture.payCorrection;
  await approveRequest(overtime, state.sourceId, 'overtime');
  let settlement = await until(() => ok('finance', `${overtime}/${state.sourceId}/settlement`),
    row => ['NEEDS_RESOLUTION', 'CORRECTION_PENDING', 'SETTLED', 'FAILED'].includes(row.settlementStatus), '工资覆盖变化后的真实结算处理');
  await prepareWorkflow(context, true);
  if (!settlement.payrollCorrectionId) {
    check('真实已发补正覆盖冻结周期后原PAY转为明确待处置', settlement.settlementStatus === 'NEEDS_RESOLUTION'
      && settlement.lastErrorCode === 'PAYROLL_ALREADY_GENERATED' && !settlement.compChangeId && !settlement.settledFlag);
    const input = { version: settlement.version, action: 'PAY_CORRECTION', originalSlipId: state.seedSlipId,
      targetPeriodId: state.periods[1].id, reason: `${note} ${state.marker}` };
    const denied = await call('employee', `${overtime}/${state.sourceId}/settlement/resolve`, 'POST', input);
    check('员工不能自行处置加班工资补正', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code));
    const wrong = await call('finance', `${overtime}/${state.sourceId}/settlement/resolve`, 'POST',
      { ...input, originalSlipId: fixture.payroll.slipId });
    check('真实已发但属于错误周期的工资单不能充当补正原单', wrong.body?.code === 'CORRECTION_REQUIRES_PAID');
    settlement = await ok('finance', `${overtime}/${state.sourceId}/settlement/resolve`, 'POST', input);
    check('明确处置真实创建D补正且没有冒充已结算', settlement.settlementStatus === 'CORRECTION_PENDING'
      && Boolean(settlement.payrollCorrectionId) && !settlement.compChangeId && !settlement.settledFlag);
    state.linkedId = settlement.payrollCorrectionId;
    await save();
    await pause(5100);
    const current = await ok('finance', `${overtime}/${state.sourceId}/settlement`);
    const replay = await call('finance', `${overtime}/${state.sourceId}/settlement/resolve`, 'POST', { ...input, version: current.version });
    const after = await ok('finance', `${overtime}/${state.sourceId}/settlement`);
    check('补正处置重放不得再建D单且原目标保持冻结', replay.body?.code === 'RESOLUTION_NOT_ALLOWED'
      && after.payrollCorrectionId === state.linkedId && after.version === current.version
      && after.payrollPeriodId === state.periods[0].id && after.settlementAmount === state.sourceAmount);
    state.resolveReplay = true;
    await save();
  } else state.linkedId = settlement.payrollCorrectionId;
  const applied = await approveCorrection(context, state.linkedId, true);
  const snapshot = applied.components.find(row => row.type === 'TAX_SNAPSHOT');
  check('H补正工资单真实冻结原已发单加班来源及新目标', String(snapshot?.originalSlipId) === state.seedSlipId
    && String(snapshot?.overtimeRequestId) === state.sourceId && String(snapshot?.payrollPeriodId) === state.periods[1].id
    && applied.periodMonth === state.periods[1].start.slice(0, 7));
  const expected = correctionTax(state.sourceAmount, decimal(hundredths(original.grossTotal) + hundredths(seed.grossTotal)),
    decimal(hundredths(original.taxAmount) + hundredths(seed.taxAmount)));
  const paid = await payCorrection(context, state.linkedId, expected);
  settlement = await until(() => ok('finance', `${overtime}/${state.sourceId}/settlement`),
    row => row.settlementStatus === 'SETTLED', 'H补正真实应用后的结算闭合');
  const changes = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_comp_change WHERE tenant_id=100000
    AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(state.sourceId)}`);
  check('关联PAY补正真实结清且没有额外普通工资变动', settlement.settledFlag === 1 && settlement.payrollCorrectionId === state.linkedId
    && settlement.payrollPeriodId === state.periods[0].id && settlement.settlementAmount === state.sourceAmount
    && !settlement.compChangeId && Number(changes[0]?.count) === 0 && state.resolveReplay === true && paid.status === 'PAID');
  state.linkedSlipId = String(paid.id);
  fixture.completed['pay-correction'] = true;
  await save();
}

export function correctionLogLeak(value, marker) {
  if (Array.isArray(value)) return value.some(item => correctionLogLeak(item, marker));
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) =>
    (/^(diffAmount|grossAdjustment|deductionAdjustment|hourlyRate|settlementAmount|hourlyRateCipher|settlementAmountCipher|grossTotal|taxAmount|netTotal)$/i.test(key)
      && item != null && !['[REDACTED]', '***'].includes(item)) || correctionLogLeak(item, marker));
  if (typeof value !== 'string') return false;
  if (marker && value.includes(marker)) return true;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return correctionLogLeak(parsed, marker);
  } catch {}
  return /rejectedValue|rejected value\s*\[/i.test(value)
    || /(?:diffAmount|grossAdjustment|deductionAdjustment|hourlyRate|settlementAmount|grossTotal|taxAmount|netTotal)["']?\s*[:=]\s*["']?[-0-9]/i.test(value);
}

async function verifyCorrectionPrivacy(context) {
  const { fixture, save } = context;
  const state = fixture.payCorrection;
  await pause(1500);
  const ids = [state.seedId, state.linkedId];
  const audits = jsonRows(`SELECT JSON_OBJECT('before',before_data,'after',after_data) FROM hr_audit_log
    WHERE tenant_id=100000 AND business_domain='PAYROLL_CORRECTION' AND business_id IN (${ids.map(sqlText).join(',')})`);
  const paths = [...ids.map(id => `request_url LIKE ${sqlText(`%/corrections/${id}/%`)}`),
    `request_url LIKE ${sqlText(`%/overtime-requests/${state.sourceId}/settlement%`)}`,
    `trace_id=${sqlText(state.creationTrace?.traceId || '')}`].join(' OR ');
  const operations = jsonRows(`SELECT JSON_OBJECT('traceId',trace_id,'params',params,'exception',exception) FROM sys_log
    WHERE tenant_id=100000 AND (${paths})`);
  check('真实补正创建批准发放均有审计且金额正文未泄露', audits.length >= 6
    && audits.every(row => !correctionLogLeak(row, state.marker)));
  check('补正真实接口操作日志不泄露正文金额', operations.length > 0 && operations.every(row => !correctionLogLeak(row, state.marker)));
  check('真实补正创建日志已落库且请求参数未记录', Boolean(state.creationTrace?.traceId)
    && operations.some(row => row.traceId === state.creationTrace.traceId && row.params == null));
  const traces = [...new Set([...operations.map(row => row.traceId), state.creationTrace?.traceId, state.deniedCreationTrace?.traceId]
    .filter(value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value)))];
  const errors = jsonRows(`SELECT JSON_OBJECT('params',request_params,'message',exception_message,'stack',exception_stack)
    FROM sys_api_error_log WHERE tenant_id=100000 AND trace_id IN (${traces.map(sqlText).join(',')})`);
  check('补正权限失败及实际业务错误日志不泄露金额正文', errors.every(row => !correctionLogLeak(row, state.marker)));
  let scannedFiles = 0;
  const logDirectories = [directory, path.resolve(directory, '..', 'logs'), path.resolve(directory, '..', '..', 'logs'),
    path.resolve(directory, '..', '..', 'cloudflow-backend', 'logs'),
    path.resolve(directory, '..', '..', 'cloudflow-backend', 'cloudflow-service-hr', 'logs')];
  for (const parent of logDirectories) {
    let entries;
    try { entries = await fs.readdir(parent, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') continue; throw new Error('H_HR_CORRECTION_LOG_DIRECTORY_UNREADABLE'); }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.log') || entry.name.includes('.sql.')) continue;
      const text = await fs.readFile(path.join(parent, entry.name), 'utf8');
      const related = text.split(/\r?\n/).filter(line => traces.some(trace => line.includes(trace)));
      check('应用日志不含补正敏感标记及关联金额字段', !text.includes(state.marker)
        && related.every(line => !correctionLogLeak(line, state.marker)), { file: entry.name });
      scannedFiles++;
    }
  }
  const browser = logEvidence();
  check('补正已扫描实际应用日志且已观察浏览器日志未泄露', scannedFiles > 0 && browser.browserLeaks.length === 0);
  state.privacyEvidence = { auditRows: audits.length, operationRows: operations.length, errorRows: errors.length, scannedFiles,
    browserEvents: browser.browserEventsObserved, browserLeaks: browser.browserLeaks.length, amountsInWorkflow: false, checkedAt: new Date().toISOString() };
  fixture.completed['pay-correction-log-privacy'] = true;
  await save();
}

export async function runPayCorrection(context) {
  const { fixture, employeeId, ok, save } = context;
  check('工资补正只使用本轮真实已发工资原单', fixture.completed['payroll-calculation'] === true && Boolean(fixture.payroll.slipId));
  fixture.payCorrection ||= {};
  const state = fixture.payCorrection;
  state.restorationRequired = true;
  fixture.restorationRequired = true;
  await save();
  const original = await ok('finance', `${payroll}/slips/${fixture.payroll.slipId}`);
  check('补正原工资本人状态及H唯一来源均真实可核对', original.status === 'PAID' && String(original.employeeId) === employeeId('employee')
    && original.components.filter(row => String(row.overtimeRequestId) === fixture.payroll.requestId).length === 1);
  state.originalDigest ||= original.digestSha256;
  check('重跑补正不改写原已发工资封存摘要', state.originalDigest === original.digestSha256);
  await save();
  await preparePayFixture(context);
  await prepareApprover(context);
  await prepareSource(context);
  const seed = await seedPaidCorrection(context, original);
  await linkedCorrection(context, original, seed);
  const after = await ok('finance', `${payroll}/slips/${fixture.payroll.slipId}`);
  check('全部补正结束后原已发工资及加班来源保持原样', after.status === 'PAID' && after.digestSha256 === state.originalDigest
    && after.components.filter(row => String(row.overtimeRequestId) === fixture.payroll.requestId).length === 1);
  await verifyCorrectionPrivacy(context);
  state.evidence = { checkedAt: new Date().toISOString(), originalSlipId: fixture.payroll.slipId, originalDigestUnchanged: true,
    sourceRequestId: state.sourceId, correctionIds: [state.seedId, state.linkedId], paidSlipIds: [state.seedSlipId, state.linkedSlipId],
    realManualApprovals: 4, duplicateApprovalBlocked: true, duplicatePayUnchanged: true, duplicateResolutionBlocked: true };
  await save();
}

export async function restorePayCorrection(context) {
  const { fixture, ok, save } = context;
  const state = fixture?.payCorrection;
  if (!state) return;
  if (state.restorationRequired) {
    if (state.originalConfig) await ok('admin', '/auth/system/config', 'PUT', state.originalConfig);
    if (state.actor?.original) {
      const current = actorSnapshot(state.actor.userId);
      if (!actorUnchanged(current, state.actor.original)) {
        await ok('admin', '/auth/system/user', 'PUT', correctionActorPayload(current, state.actor.original.deptId));
      }
    }
  }
  if (state.originalConfig) {
    const current = await ok('admin', `/auth/system/config/${state.originalConfig.configId}`);
    check('工资补正正式流程配置逐字段精确恢复', configFields.every(field => String(current[field] ?? '') === String(state.originalConfig[field] ?? '')));
  }
  if (state.originalDefinition) {
    const found = jsonRows(`SELECT JSON_OBJECT('status',status,'digest',SHA2(model_json,256)) FROM wf_process_definition
      WHERE tenant_id=100000 AND definition_id=${sqlText(state.originalDefinition.id)}`);
    check('补正原正式流程状态和模型保持原值', found.length === 1 && found[0].status === state.originalDefinition.status
      && found[0].digest === state.originalDefinition.digest);
  }
  const restored = state.actor?.original ? actorSnapshot(state.actor.userId) : null;
  if (restored) {
    check('借用补正财务身份部门角色岗位及启用状态精确恢复', actorUnchanged(restored, state.actor.original));
    const actors = await readFixture('hr09-actors');
    if (actors.accounts?.payapprover?.userId === restored.userId) {
      actors.accounts.payapprover.deptId = restored.deptId;
      delete actors.accounts.payapprover.storageState;
      await saveFixture('hr09-actors', actors);
    }
  }
  state.restorationRequired = false;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), exact: true, restoredProcessKey: state.originalConfig?.configValue ?? null,
    approverStatus: restored?.status ?? null, approverUserId: restored?.userId ?? null, approverDepartmentRestored: Boolean(restored),
    quotaChanged: false, addedUserCount: 0, originalDefinitionUnchanged: true,
    retainedCorrectionCount: [state.seedId, state.linkedId].filter(Boolean).length };
  await save();
}
