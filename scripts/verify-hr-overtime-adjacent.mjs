// Current owned API regression for the existing time-request and attendance behavior.
export async function verifyHrOvertimeAdjacent(context) {
  const { fixture, employeeId, label, note, ok, call, check, database, jsonRows, sqlText, resource, lookup, cards } = context;
  const owner = employeeId('employee');
  check('相邻请假检查须已有真实两小时消费结果', context.evidence.compLeave?.passed === true);
  const counts = () => ({
    ledger: database("SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=" + sqlText(owner)),
    changes: database("SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND employee_id=" + sqlText(owner)),
    records: database("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=" + sqlText(owner)),
    months: database("SELECT COUNT(*) FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id=" + sqlText(owner)),
  });
  const before = counts();
  const calculate = date => ok('hr', '/hr/attendance/records/calculate?employeeId=' + owner + '&date=' + date);
  const tripDate = '2026-08-03';
  const initial = await calculate(tripDate);
  check('出差样本原为无卡工作日且尚无批准申请', initial.dateType === 'WORKDAY' && initial.status === 'ABSENT' && Number(initial.absentFlag) === 1);
  const number = label + '-TRIP';
  const payload = { requestNo: number, requestType: 'BUSINESS_TRIP', employeeId: owner,
    startTime: tripDate + ' 09:00:00', endTime: tripDate + ' 17:00:00', duration: '8.00',
    unit: 'HOUR', reason: note, status: 'DRAFT' };
  const requestId = await resource('adjacent-trip', 'hr', '/hr/attendance/time-requests', payload,
    lookup('hr_time_request', 'request_no', number));
  const read = () => jsonRows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'type',request_type,'status',status,'employeeId',CAST(employee_id AS CHAR),"
    + "'instanceId',process_instance_id) FROM hr_time_request WHERE tenant_id=100000 AND id=" + sqlText(requestId))[0];
  check('旧出差入口保存真实草稿且保留原类型', read().type === 'BUSINESS_TRIP' && read().status === 'DRAFT' && read().employeeId === owner);
  check('出差草稿不提前改变日考勤', (await calculate(tripDate)).status === 'ABSENT');
  await ok('hr', '/hr/attendance/time-requests/' + requestId + '/submit', 'POST');
  check('旧出差提交后保持待批状态', read().status === 'APPROVING');
  check('未批准出差仍不提前覆盖考勤', (await calculate(tripDate)).status === 'ABSENT');
  await ok('hr', '/hr/attendance/time-requests/' + requestId + '/approve', 'POST');
  const approved = await calculate(tripDate);
  check('旧出差批准后真实日考勤识别出差并消除迟到早退及缺勤标记', read().status === 'APPROVED'
    && approved.status === 'BUSINESS_TRIP' && Number(approved.lateMinutes) === 0 && Number(approved.earlyExitMinutes) === 0
    && Number(approved.absentFlag) === 0 && Number(approved.halfDayFlag) === 0);
  const list = await ok('hr', '/hr/attendance/time-requests?employeeId=' + owner + '&requestType=BUSINESS_TRIP');
  check('真实出差列表按本人和类型筛选', Array.isArray(list) && list.length === 1 && String(list[0].id) === requestId
    && list[0].requestType === 'BUSINESS_TRIP' && String(list[0].employeeId) === owner);
  const forbidden = await call('employee', '/hr/attendance/time-requests', 'POST', { ...payload, requestNo: number + '-DENIED' });
  check('普通员工仍不能使用人事时间申请管理入口', forbidden.status === 403);
  const crossTenant = await call('tenantPeer', '/hr/attendance/time-requests?employeeId=' + owner + '&requestType=BUSINESS_TRIP');
  check('跨租户读取不暴露出差记录', [403,404].includes(crossTenant.status)
    || crossTenant.status === 200 && crossTenant.body?.code === 200 && Array.isArray(crossTenant.body.data) && crossTenant.body.data.length === 0);
  const leave = await calculate('2026-09-21');
  check('真实批准调休仍由原考勤计算识别请假', leave.status === 'LEAVE' && Number(leave.absentFlag) === 0
    && Number(leave.halfDayFlag) === 0 && Number(leave.lateMinutes) === 0 && Number(leave.earlyExitMinutes) === 0);
  await cards('employee', '2026-08-04', '09:00:00', '17:00:00');
  const normal = await calculate('2026-08-04');
  check('普通成对打卡仍识别完整正常工作日', normal.status === 'NORMAL' && Number(normal.workMinutes) === 480
    && Number(normal.lateMinutes) === 0 && Number(normal.earlyExitMinutes) === 0 && Number(normal.absentFlag) === 0);
  check('出差和普通考勤预览不新增金额来源、日记录或月汇总', JSON.stringify(counts()) === JSON.stringify(before));
  context.evidence.adjacentAttendance = { passed: true, tripRequestId: requestId, tripStatus: 'BUSINESS_TRIP',
    leaveStatus: 'LEAVE', ordinaryStatus: 'NORMAL', ordinaryMinutes: 480, databaseWritesForCalculatedRecords: false };
}
