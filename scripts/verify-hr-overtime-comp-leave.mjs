import { hundredths } from './batch-h/hr09-evidence.mjs';

// Current owned runtime; business transitions use real APIs and preserve the original D leave model.
export async function verifyHrOvertimeCompLeave(context) {
const { check, jsonRows, sqlText, until, completeWorkflowTask } = context;

const leave = '/hr/attendance/leave';
const overtime = '/hr/attendance/overtime-requests';
const configFields = ['configId', 'tenantId', 'configScope', 'configKey', 'configName', 'configType', 'configValue', 'remark'];
const typeDefaults = { applicableAfterDays: 0, earnedLeaveFrequency: 'MONTHLY', encashmentFlag: 0, lwpFlag: 0,
  partialPaidFlag: 0, salaryFractionPerDay: '1.0000', optionalLeaveFlag: 0, needAttachmentFlag: 0 };

async function updateResource(context, table, idField, id, endpoint, payload) {
  const rows = jsonRows(`SELECT JSON_OBJECT('version',version) FROM ${table} WHERE tenant_id=100000 AND ${idField}=${sqlText(id)}`);
  check('调休请假临时配置使用真实当前版本', rows.length === 1 && Number.isInteger(rows[0].version));
  await context.ok('admin', endpoint, 'PUT', { ...payload, version: rows[0].version });
}

function quota(context) {
  const { fixture, employeeId } = context;
  const rows = jsonRows(`SELECT JSON_OBJECT('total',CAST(total_quota AS CHAR),'used',CAST(used_quota AS CHAR),
    'frozen',CAST(frozen_quota AS CHAR),'available',CAST(available_quota AS CHAR)) FROM hr_leave_quota
    WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))} AND leave_type_id=${sqlText(fixture.ids.compLeaveType)}
      AND period_id=${sqlText(fixture.ids.leavePeriod)} AND deleted=0`);
  check('调休请假只核对本员工本假种原周期额度', rows.length === 1);
  return rows[0];
}

async function preparePolicy(context) {
  const { fixture, employeeId, label, note, ok, save, resource, lookup, configureTypes } = context;
  const state = fixture.compLeave ||= {};
  state.restorationRequired = true;
  state.type = { ...typeDefaults, leaveCode: `${label}-AC4`, leaveName: `${label} AC4小时调休`, unit: 'HOUR', needQuota: 1, isPaid: 1,
    compensatoryFlag: 1, allowNegativeFlag: 0, allowOverAllocationFlag: 0, includeHolidayFlag: 0, earnedLeaveFlag: 0,
    carryForwardFlag: 0, roundingMode: 'NONE', quotaRule: {}, status: 0 };
  state.policy = { policyCode: `${label}-AC4`, policyName: `${label} AC4零预授予政策`, description: note, status: 'INACTIVE' };
  await save();
  await resource('compLeaveType', 'admin', '/hr/attendance/leave-types', state.type, lookup('hr_leave_type', 'leave_code', state.type.leaveCode));
  await updateResource(context, 'hr_leave_type', 'id', fixture.ids.compLeaveType,
    `/hr/attendance/leave-types/${fixture.ids.compLeaveType}`, { ...state.type, status: 1 });
  await resource('compLeavePolicy', 'admin', `${leave}/policies`, state.policy,
    lookup('hr_leave_policy', 'policy_code', state.policy.policyCode, 'policy_id'));
  const assignments = jsonRows(`SELECT JSON_OBJECT('id',CAST(assignment_id AS CHAR),'policyId',CAST(policy_id AS CHAR))
    FROM hr_leave_policy_assignment WHERE tenant_id=100000 AND employee_id=${sqlText(employeeId('employee'))}
    AND leave_period_id=${sqlText(fixture.ids.leavePeriod)} AND deleted=0`);
  check('隔离员工没有其他政策被覆盖', assignments.length <= 1 && (!assignments.length || assignments[0].policyId === fixture.ids.compLeavePolicy));
  if (!assignments.length) {
    await ok('admin', `${leave}/policies/${fixture.ids.compLeavePolicy}/details`, 'PUT', [{ leaveTypeId: fixture.ids.compLeaveType, annualDays: '0.00' }]);
  }
  await updateResource(context, 'hr_leave_policy', 'policy_id', fixture.ids.compLeavePolicy,
    `${leave}/policies/${fixture.ids.compLeavePolicy}`, { ...state.policy, status: 'ACTIVE' });
  if (!assignments.length) {
    const pending = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_policy_assignment WHERE tenant_id=100000
      AND employee_id<>${sqlText(employeeId('employee'))} AND deleted=0 AND status='ACTIVE' AND allocated_flag=0 AND effective_from<=CURRENT_DATE`);
    check('政策分配不触发其他员工待授予任务', Number(pending[0]?.count) === 0);
    await ok('admin', `${leave}/assignments`, 'POST', { employeeIds: [employeeId('employee')], policyId: fixture.ids.compLeavePolicy,
      periodId: fixture.ids.leavePeriod, assignmentBasis: 'PERIOD', effectiveFrom: '2026-07-01', effectiveTo: '2026-10-31', carryForwardFlag: 0 });
  }
  const grants = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_ledger WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId('employee'))} AND leave_type_id=${sqlText(fixture.ids.compLeaveType)}
    AND source_biz_type='POLICY_ASSIGNMENT'`);
  check('零预授予政策未生成替代加班的额度流水', Number(grants[0]?.count) === 0);
  await configureTypes({ compensatoryRatio: '1.00', compensatoryLeaveTypeId: fixture.ids.compLeaveType });
}

async function prepareWorkflow(context) {
  const { fixture, sessions, approvalActors, label, note, ok, save } = context;
  const state = fixture.compLeave;
  if (!state.originalConfig) {
    const configs = jsonRows("SELECT JSON_OBJECT('id',CAST(config_id AS CHAR)) FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'");
    check('真实请假流程参数在本租户唯一', configs.length === 1);
    const original = await ok('admin', `/auth/system/config/${configs[0].id}`);
    state.originalConfig = Object.fromEntries(configFields.map(field => [field, original[field] ?? null]));
    await save();
  }
  const processKey = 'h2ot_leave_' + context.caseTag;
  const findDefinition = key => jsonRows(`SELECT JSON_OBJECT('id',definition_id,'status',status,'digest',SHA2(model_json,256))
    FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sqlText(key)} AND deleted=0 ORDER BY version DESC`);
  const originals = findDefinition(state.originalConfig.configValue);
  check('既有D请假定义为真实已发布流程', originals.length >= 1 && originals[0].status === 'PUBLISHED');
  state.originalDefinition ||= originals[0];
  let definitions = findDefinition(processKey);
  check('专属调休请假流程不重复创建版本', definitions.length <= 1);
  if (!definitions.length) {
    const original = await ok('admin', `/workflow/wf/definition/${originals[0].id}`);
    const model = typeof original.modelJson === 'string' ? JSON.parse(original.modelJson) : structuredClone(original.modelJson);
    const nodes = model.nodes.filter(node => node.type === 'APPROVAL');
    check('仅复制D双级审批并绑定本组有效真实审批人', nodes.length === 2 && nodes[0].id === 'manager' && nodes[1].id === 'hr');
    for (const [index, actor] of [approvalActors.responsible, approvalActors.humanResources].entries()) {
      nodes[index].approverType = 'USER';
      nodes[index].approverValue = sessions.accounts[actor].userId;
    }
    await ok('admin', '/workflow/wf/definition/save', 'POST', { processKey, processName: `${label} AC4真实调休请假`,
      modelJson: JSON.stringify(model), formId: null, description: note, startPermissionType: 'ALL', startPermissionValue: '[]' });
    definitions = findDefinition(processKey);
  }
  check('专属D审批定义由真实接口创建', definitions.length === 1);
  if (definitions[0].status === 'DRAFT') await ok('admin', `/workflow/wf/definition/deploy/${definitions[0].id}`, 'POST');
  state.definitionId = definitions[0].id;
  await save();
  await ok('admin', '/auth/system/config', 'PUT', { ...state.originalConfig, configValue: processKey, remark: note });
  check('临时请假流程参数真实读取生效', (await ok('admin', `/auth/system/config/${state.originalConfig.configId}`)).configValue === processKey);
}

function approvalHistory(instanceId) {
  return jsonRows(`SELECT JSON_OBJECT('operatorId',CAST(operator_id AS CHAR),'nodeKey',node_key) FROM wf_task_history
    WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND action='APPROVE'
    ORDER BY create_time,CASE node_key WHEN 'manager' THEN 0 WHEN 'hr' THEN 1 ELSE 2 END,history_id`);
}

async function approveLeave(context, requestId) {
  const { fixture, sessions, approvalActors, ok, call, note } = context;
  const readRequest = () => jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'instanceId',process_instance_id)
    FROM hr_time_request WHERE tenant_id=100000 AND id=${sqlText(requestId)} AND deleted=0`)[0];
  const request = await until(async () => readRequest(), row => Boolean(row?.instanceId), 'D请假真实启动审批');
  const process = jsonRows(`SELECT JSON_OBJECT('definitionId',definition_id,'startUserId',CAST(start_user_id AS CHAR))
    FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(request.instanceId)}`);
  check('D请假使用本人发起及隔离双级真实定义', process.length === 1 && process[0].definitionId === fixture.compLeave.definitionId
    && process[0].startUserId === sessions.accounts.employee.userId);
  for (const [index, actor] of [approvalActors.responsible, approvalActors.humanResources].entries()) {
    const history = approvalHistory(request.instanceId);
    if (history.length > index) {
      check('D请假重跑保留既有真实审批身份', history[index].operatorId === sessions.accounts[actor].userId);
      continue;
    }
    const tasks = await until(async () => jsonRows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR))
      FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(request.instanceId)} AND status='TODO'`), rows => rows.length === 1, 'D请假顺序待办');
    check('D调休请假待办仅属于当前实际审批人', tasks[0].assignee === sessions.accounts[actor].userId);
    const own = await call('employee', '/workflow/wf/complete', 'POST', { taskId: tasks[0].id, action: 'APPROVE', comment: note, variables: {} });
    check('D调休请假申请人不能代替审批人办理', own.status === 403 || [403, 'FORBIDDEN'].includes(own.body?.code));
    await completeWorkflowTask(sessions, request.instanceId, actor);
    await until(async () => approvalHistory(request.instanceId), rows => rows.length === index + 1, 'D请假审批历史真实入库');
    if (index === 0) check('D请假首级不提前扣减为终审', readRequest().status !== 'APPROVED');
  }
  await until(async () => readRequest(), row => row?.status === 'APPROVED', 'D请假真实批准回调');
  check('D调休请假两级审批记录完整且唯一', approvalHistory(request.instanceId).length === 2);
  const mine = await ok('employee', '/hr/ess/leave/mine');
  check('本人真实请假列表反映批准结果', mine.some(row => String(row.id) === requestId && row.status === 'APPROVED' && row.unit === 'HOUR'));
}

async function runCompLeaveAcceptance(context) {
  const { fixture, employeeId, note, ok, call, save, cards, draft, recoverableOvertime, approveRequest,
    approvalActors, completedSettlement } = context;
  await preparePolicy(context);
  const state = fixture.compLeave;
  await cards('employee', '2026-07-21', '09:00:00', '19:30:00');
  let request = await recoverableOvertime('comp-leave-grant', draft('2026-07-21', '17:30', '19:30'));
  state.overtimeRequestId = String(request.requestId);
  await save();
  if (request.status === 'DRAFT') request = await ok('employee', `${overtime}/${request.requestId}/submit`, 'POST', { version: request.version });
  if (request.status === 'SUBMITTED') request = await ok(approvalActors.reviewer, `${overtime}/${request.requestId}/review-hours`, 'POST',
    { version: request.version, approvedMinutes: 120, note });
  await approveRequest(overtime, request.requestId, 'overtime');
  const settled = await completedSettlement(request.requestId);
  const approved = await ok('employee', `${overtime}/${request.requestId}`);
  check('AC4真实120分钟批准后仅授予两小时调休', approved.approvedMinutes === 120 && approved.status === 'APPROVED' && settled.compensatoryQuantity === '2.00'
    && settled.quantityUnit === 'HOUR' && settled.leaveTypeId === fixture.ids.compLeaveType && settled.leavePeriodId === fixture.ids.leavePeriod);
  const ledgerCount = () => jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_ledger WHERE tenant_id=100000
    AND source_biz_type='HR_OVERTIME' AND source_biz_id=${sqlText(request.requestId)}`)[0].count;
  check('AC4两小时全部来自唯一真实H调休来源', Number(ledgerCount()) === 1);
  await prepareWorkflow(context);
  const start = '2026-09-21T09:00:00';
  const end = '2026-09-21T11:00:00';
  const reason = `${note} AC4真实调休扣减`;
  const calculated = await ok('employee', `/hr/ess/leave/calculate?leaveTypeId=${fixture.ids.compLeaveType}&startTime=${encodeURIComponent(start)}&endTime=${encodeURIComponent(end)}`);
  check('D真实日历按小时计算两小时请假', hundredths(calculated) === 200n);
  const existing = jsonRows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status) FROM hr_time_request WHERE tenant_id=100000
    AND employee_id=${sqlText(employeeId('employee'))} AND leave_type_id=${sqlText(fixture.ids.compLeaveType)}
    AND request_type='LEAVE' AND reason=${sqlText(reason)} AND deleted=0`);
  check('AC4请假重跑沿用真实原单', existing.length <= 1 && (!state.leaveRequestId || existing[0]?.id === state.leaveRequestId));
  if (!existing.length) {
    const before = quota(context);
    check('D提交前额度仅由真实两小时授予构成', hundredths(before.total) === 200n && hundredths(before.available) === 200n
      && hundredths(before.used) === 0n && hundredths(before.frozen) === 0n);
    state.leaveRequestId = String(await ok('employee', '/hr/ess/leave', 'POST', { leaveTypeId: fixture.ids.compLeaveType,
      startTime: start.replace('T', ' '), endTime: end.replace('T', ' '), duration: '2.00', unit: 'HOUR', reason, attachmentFileIds: [] }));
    await save();
  } else state.leaveRequestId = existing[0].id;
  if (!existing.some(row => row.status === 'APPROVED')) {
    const frozen = quota(context);
    check('D提交真实冻结两小时且未提前消费', hundredths(frozen.total) === 200n && hundredths(frozen.frozen) === 200n
      && hundredths(frozen.used) === 0n && hundredths(frozen.available) === 0n);
  }
  await approveLeave(context, state.leaveRequestId);
  const after = quota(context);
  check('D批准后两小时冻结转为实际扣减', hundredths(after.total) === 200n && hundredths(after.used) === 200n
    && hundredths(after.frozen) === 0n && hundredths(after.available) === 0n);
  const entries = jsonRows(`SELECT JSON_OBJECT('type',transaction_type,'quantity',CAST(leave_days AS CHAR),'unit',quantity_unit,
    'periodId',CAST(leave_period_id AS CHAR)) FROM hr_leave_ledger WHERE tenant_id=100000
    AND source_biz_type='HR_TIME_REQUEST' AND source_biz_id=${sqlText(state.leaveRequestId)} ORDER BY ledger_id`);
  check('D冻结扣减解冻各有唯一真实来源且单位周期未变', entries.length === 3
    && ['FREEZE', 'APPLICATION', 'UNFREEZE'].every(type => entries.filter(row => row.type === type).length === 1)
    && entries.every(row => row.unit === 'HOUR' && row.periodId === fixture.ids.leavePeriod && Number(row.quantity) === (row.type === 'UNFREEZE' ? 2 : -2)));
  const protectedLedger = await call('admin', `${leave}/ledger/${settled.leaveLedgerId}/reverse`, 'POST', { reason: note });
  check('D通用冲正不能抹去已批准H调休来源', protectedLedger.body?.code === 'OVERTIME_SOURCE_IMMUTABLE');
  check('真实D消费不重复授予H调休', Number(ledgerCount()) === 1);
  fixture.completed['comp-leave-consumption'] = true;
  await save();
}

async function restoreCompLeave(context) {
  const { fixture, ok, save } = context;
  const state = fixture?.compLeave;
  if (!state) return;
  if (state.restorationRequired) {
    if (fixture.ids.compLeaveType) await updateResource(context, 'hr_leave_type', 'id', fixture.ids.compLeaveType,
      `/hr/attendance/leave-types/${fixture.ids.compLeaveType}`, { ...typeDefaults, ...state.type });
    if (fixture.ids.compLeavePolicy) await updateResource(context, 'hr_leave_policy', 'policy_id', fixture.ids.compLeavePolicy,
      `${leave}/policies/${fixture.ids.compLeavePolicy}`, state.policy);
    if (state.originalConfig) await ok('admin', '/auth/system/config', 'PUT', state.originalConfig);
  }
  const resources = [];
  for (const [name, table, idField, status] of [['compLeaveType', 'hr_leave_type', 'id', '0'], ['compLeavePolicy', 'hr_leave_policy', 'policy_id', 'INACTIVE']]) {
    if (!fixture.ids[name]) continue;
    const found = jsonRows(`SELECT JSON_OBJECT('id',CAST(${idField} AS CHAR),'status',CAST(status AS CHAR)) FROM ${table}
      WHERE tenant_id=100000 AND ${idField}=${sqlText(fixture.ids[name])}`);
    check('AC4新增假种及政策均已停用恢复', found.length === 1 && found[0].status === status);
    resources.push({ name, ...found[0] });
  }
  if (state.originalConfig) {
    const current = await ok('admin', `/auth/system/config/${state.originalConfig.configId}`);
    check('D请假流程参数逐字段精确恢复', configFields.every(field => String(current[field] ?? '') === String(state.originalConfig[field] ?? '')));
  }
  if (state.originalDefinition) {
    const current = jsonRows(`SELECT JSON_OBJECT('status',status,'digest',SHA2(model_json,256)) FROM wf_process_definition
      WHERE tenant_id=100000 AND definition_id=${sqlText(state.originalDefinition.id)}`);
    check('D原正式审批定义及模型未被修改', current.length === 1 && current[0].status === state.originalDefinition.status
      && current[0].digest === state.originalDefinition.digest);
  }
  state.restorationRequired = false;
  const retained = fixture.ids.compLeavePolicy ? jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM hr_leave_policy_assignment
    WHERE tenant_id=100000 AND policy_id=${sqlText(fixture.ids.compLeavePolicy)} AND deleted=0`)[0].count : 0;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), exact: true, resources, syntheticPolicyOnly: true,
    allocationQuantity: '0.00', retainedAssignmentCount: Number(retained), restoredProcessKey: state.originalConfig?.configValue ?? null };
  await save();
}


async function cancelIncompleteLeave() {
  const requestId = context.fixture.compLeave?.leaveRequestId;
  if (!requestId) return;
  const found = jsonRows("SELECT JSON_OBJECT('status',status,'instanceId',process_instance_id) FROM hr_time_request"
    + " WHERE tenant_id=100000 AND id=" + sqlText(requestId) + " AND employee_id=" + sqlText(context.employeeId('employee')));
  check('失败恢复只处理本轮本人请假原单', found.length === 1);
  if (!['PENDING', 'SUBMITTED', 'APPROVING', 'APPLYING'].includes(found[0].status)) return;
  await context.ok('employee', '/hr/ess/leave/' + requestId + '/cancel', 'POST');
  if (found[0].instanceId) await until(async () => jsonRows("SELECT JSON_OBJECT('count',COUNT(*)) FROM wf_task WHERE tenant_id=100000"
    + " AND instance_id=" + sqlText(found[0].instanceId) + " AND status IN ('TODO','SUSPENDED','DELEGATED')")[0],
    row => Number(row.count) === 0, '本轮失败请假撤回后无活动待办');
  check('失败请假撤回释放本轮冻结额度', hundredths(quota(context).frozen) === 0n);
}

let failure;
try { await runCompLeaveAcceptance(context); }
catch (error) { failure = error; }
finally {
  const errors = [];
  if (failure) {
    try { await cancelIncompleteLeave(); }
    catch (error) { errors.push(error); }
  }
  try { await restoreCompLeave(context); }
  catch (error) { errors.push(error); }
  if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'Overtime leave consumption or restoration failed');
}
if (failure) throw failure;
check('当前调休消费及专属配置恢复完整', context.fixture.completed['comp-leave-consumption'] === true
  && context.fixture.compLeave.restorationEvidence.exact);
context.evidence.compLeave = { passed: true, creditHours: '2.00', usedHours: '2.00', frozenHours: '0.00',
  overtimeRequestId: context.fixture.compLeave.overtimeRequestId, leaveRequestId: context.fixture.compLeave.leaveRequestId,
  restoration: context.fixture.compLeave.restorationEvidence };
}
