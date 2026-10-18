// Original HR09 safety cases, injected with the current owned runtime only.
export async function verifyHrShiftSafety(context) {
const { check, jsonRows, sqlText, until } = context;

const shifts = '/hr/attendance/shift-requests';

async function runShiftSafety(context) {
  const { fixture, employeeId, note, ok, call, save, setting, createRequest, bindWorkflow, sourceAssignments } = context;
  check('调班安全验收以两类真实应用结果为依据', fixture.completed['shift-single-minimal'] === true && fixture.completed['shift-swap-minimal'] === true);
  for (const name of ['shift-single-minimal', 'shift-swap-minimal']) {
    const requestId = fixture.requests[name].requestId;
    const before = sourceAssignments(requestId);
    check('安全验收来源排班完整', before.length === (name.includes('swap') ? 2 : 1));
    for (const source of before) {
      const response = await call('admin', `/hr/attendance/schedules/${source.id}`, 'PUT', {
        targetType: 'EMPLOYEE', targetId: source.employeeId, shiftId: source.shiftId, ruleId: source.ruleId,
        effectiveStart: source.start, effectiveEnd: source.end, scheduleDate: source.date, status: 'PUBLISHED',
      });
      check('通用排班修改不能改写H来源', response.body?.code === 'H_SCHEDULE_IMMUTABLE');
      const deleted = await call('admin', `/hr/attendance/schedules/${source.id}`, 'DELETE');
      check('通用排班删除不能删除H来源', deleted.body?.code === 'H_SCHEDULE_IMMUTABLE');
    }
    check('通用入口拒绝后双人排班未被部分改变', JSON.stringify(sourceAssignments(requestId)) === JSON.stringify(before));
  }
  const input = { requestMode: 'SINGLE', attendanceDate: '2026-10-20', targetShiftId: fixture.ids['shift-early'], targetRuleId: fixture.ids['rule-early'], reason: note };
  await setting('sys.hr.shift.minimumRestMinutes', '');
  const missing = await ok('employee', `${shifts}/preview`, 'POST', input);
  check('缺少核定休息政策时真实预览阻断', missing.blockers.some(value => value.code === 'MINIMUM_REST_NOT_CONFIGURED'));
  await setting('sys.hr.shift.minimumRestMinutes', '1441');
  const insufficient = await ok('employee', `${shifts}/preview`, 'POST', input);
  check('前后班次休息不足真实阻断', insufficient.blockers.some(value => value.code === 'SHIFT_REST_INSUFFICIENT'));
  await setting('sys.hr.shift.minimumRestMinutes', '600');
  const valid = await ok('employee', `${shifts}/preview`, 'POST', input);
  check('临时核定休息时间仅用于测试且恢复后可通过', valid.blockers.length === 0 && valid.minimumRestMinutes === 600);
  let declined = await createRequest('shift-peer-declined', shifts, { requestMode: 'SWAP', attendanceDate: '2026-10-21', swapEmployeeId: employeeId('peer'), reason: note });
  if (declined.status === 'DRAFT') declined = await ok('employee', `${shifts}/${declined.requestId}/submit`, 'POST', { version: declined.version });
  if (declined.status === 'WAITING_ACCEPTANCE') {
    await ok('peer', `${shifts}/${declined.requestId}/respond`, 'POST', { version: declined.version, decision: 'DECLINED', note });
    declined = await ok('employee', `${shifts}/${declined.requestId}`);
  }
  check('对方真实拒绝后不启动审批不生成排班', declined.status === 'REJECTED' && declined.peerAcceptanceStatus === 'DECLINED'
    && !declined.instanceId && sourceAssignments(declined.requestId).length === 0);
  const repeated = await call('peer', `${shifts}/${declined.requestId}/respond`, 'POST', { version: declined.version, decision: 'ACCEPTED', note });
  check('拒绝后不得重放同意改变终态', repeated.body?.code === 'STATE_CONFLICT');
  let cancelled = await createRequest('shift-cancel-approving', shifts, { ...input, attendanceDate: '2026-10-22' });
  if (cancelled.status === 'DRAFT') cancelled = await ok('employee', `${shifts}/${cancelled.requestId}/submit`, 'POST', { version: cancelled.version });
  if (['PENDING', 'APPROVING'].includes(cancelled.status)) {
    cancelled = await bindWorkflow(shifts, cancelled.requestId, 'shift');
    cancelled = await ok('employee', `${shifts}/${cancelled.requestId}/cancel`, 'POST', { version: cancelled.version, reason: note });
  }
  check('已启动审批调班可由本人真实撤回', cancelled.status === 'CANCELLED' && Boolean(cancelled.instanceId));
  const terminal = await until(async () => jsonRows(`SELECT JSON_OBJECT('status',status) FROM wf_process_instance
    WHERE tenant_id=100000 AND instance_id=${sqlText(cancelled.instanceId)}`),
  found => found.length === 1 && found[0].status === 'INVALIDATED', '真实调班撤回同步工作流作废终态');
  const activeTasks = jsonRows(`SELECT JSON_OBJECT('count',COUNT(*)) FROM wf_task
    WHERE tenant_id=100000 AND instance_id=${sqlText(cancelled.instanceId)} AND status IN ('TODO','SUSPENDED','DELEGATED')`);
  check('撤回后工作流作废且无活动任务或排班副作用', terminal[0].status === 'INVALIDATED'
    && Number(activeTasks[0]?.count) === 0 && sourceAssignments(cancelled.requestId).length === 0);
  fixture.completed['shift-safety'] = true;
  fixture.completed['shift-cancel-approving'] = true;
  await save();
}


await runShiftSafety(context);
context.evidence.shiftSafety = true;
}
