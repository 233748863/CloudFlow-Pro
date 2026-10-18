import assert from 'node:assert/strict';

export async function verifyHolidayConsumers({ admin, api, successful, session, database, check, caseTag, pending }) {
  const base = '/auth/system/holiday';
  const prefix = `A4C_${caseTag}`;
  const numericId = value => { const result = String(value); assert.match(result, /^\d+$/); return result; };
  const denied = result => result.status === 403 || result.body?.code === 403;
  const row = statement => JSON.parse(database(statement));
  const originalDefault = numericId(database("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND status='ENABLED' AND deleted=0;"));
  const hr = await session('g_holiday_hr');
  let defaultChanged = false;
  let policyId;
  let primaryFailure;
  const cleanupFailures = [];
  const saveCalendar = async (suffix, dates = []) => {
    const calendarCode = `${prefix}_${suffix}`;
    successful(await api(hr, `${base}/calendar`, { method: 'POST', body: {
      calendarCode, calendarName: `消费方验收-${caseTag}-${suffix}`, region: '隔离验收', defaultFlag: 0,
      weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00',
      lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED',
    } }), 'HR通过真实接口创建专用日历');
    const calendarId = numericId(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='${calendarCode}' AND deleted=0;`));
    if (dates.length) await saveDates(calendarId, dates);
    return calendarId;
  };
  const saveDates = async (calendarId, dates) => successful(await api(hr, `${base}/date/batch`, {
    method: 'POST', body: { calendarId, yearNo: 2027, dates },
  }), 'HR真实保存日期例外');
  const selectDefault = async calendarId => {
    const current = successful(await api(hr, `${base}/calendar/${calendarId}`), '读取待设默认日历');
    successful(await api(hr, `${base}/calendar`, { method: 'PUT', body: { ...current, defaultFlag: 1 } }), '真实修改租户默认日历');
  };
  const day = (holidayDate, dateType, triplePayFlag = 0) => ({ holidayDate, dateType, triplePayFlag, holidayName: `隔离验收-${dateType}` });
  try {
    const defaultCalendar = await saveCalendar('DEFAULT');
    const departmentCalendar = await saveCalendar('DEPT', [day('2027-01-04', 'REST')]);
    const shiftDates = [day('2027-01-04', 'HOLIDAY', 1), day('2027-01-05', 'REST')];
    const shiftCalendar = await saveCalendar('SHIFT', shiftDates);
    defaultChanged = true;
    await selectDefault(defaultCalendar);
    check('专用租户默认日历真实生效且全租户仍只有一个默认', database("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0;") === defaultCalendar);
    const departmentName = `日历消费验收-${caseTag}`;
    successful(await api(admin, '/auth/system/dept', { method: 'POST', body: {
      deptName: departmentName, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: departmentCalendar,
    } }), '真实创建部门日历绑定');
    const departmentId = numericId(database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name='${departmentName}' AND deleted=0;`));
    const employeeId = numericId(successful(await api(admin, '/hr/employees', { method: 'POST', body: {
      employeeNo: prefix, name: `消费日历员工-${caseTag}`, gender: 'MALE', deptId: departmentId,
      employeeType: 'FULL_TIME', employeeStatus: 'REGULAR', hireDate: '2026-01-01',
    } }), '通过HR服务真实创建专用员工'));
    check('员工归属由HR接口真实落库', database(`SELECT dept_id FROM hr_employee WHERE id=${employeeId} AND tenant_id=100000 AND employee_no='${prefix}';`) === departmentId);
    const createLeaveType = async (suffix, unit, includeHolidayFlag) => numericId(successful(await api(hr, '/hr/attendance/leave-types', {
      method: 'POST', body: { leaveCode: `${prefix}_${suffix}`, leaveName: `日历验收-${suffix}-${caseTag}`, unit,
        needQuota: 0, isPaid: 1, includeHolidayFlag, roundingMode: 'NONE', status: 1 },
    }), '真实创建请假类型'));
    const excludeType = await createLeaveType('DAY', 'DAY', 0);
    const includeType = await createLeaveType('INCLUDE', 'DAY', 1);
    const hourlyType = await createLeaveType('HOUR', 'HOUR', 0);
    const resolve = async (date = '2027-01-04') => String(successful(await api(admin, `${base}/query/resolve-calendar?employeeId=${employeeId}&date=${date}`), '认证服务解析员工日历'));
    const leave = async (type = excludeType, startTime = '2027-01-04T09:00:00', endTime = '2027-01-06T18:00:00') => Number(successful(await api(admin,
      `/hr/attendance/leave-days?${new URLSearchParams({ employeeId, leaveTypeId: type, startTime, endTime })}`), 'HR真实请假时长计算'));
    const attendance = async (date = '2027-01-04') => successful(await api(admin, `/hr/attendance/records/calculate?employeeId=${employeeId}&date=${date}`), 'HR真实考勤计算');
    check('无排班时认证服务采用部门日历', await resolve() === departmentCalendar);
    check('HR原有部门数据范围仍拒绝其他部门员工', denied(await api(hr, `/hr/attendance/records/calculate?employeeId=${employeeId}&date=2027-01-04`)));
    check('HR请假实际扣除部门休息日得到2天', await leave() === 2);
    check('HR含假日规则仍计算3天', await leave(includeType) === 3);
    check('HR小时假扣除部门休息日和两天午休得到16小时', await leave(hourlyType) === 16);
    check('HR真实上午请假保留0.5天精度', await leave(excludeType, '2027-01-06T09:00:00', '2027-01-06T11:00:00') === 0.5);
    const departmentAttendance = await attendance();
    check('HR无班次的部门休息日应出勤为0', departmentAttendance.dateType === 'REST' && departmentAttendance.expectedMinutes === 0);
    const shiftBody = {
      shiftCode: `${prefix}_SHIFT`, shiftName: `日历班次-${caseTag}`, startTime: '09:00:00', endTime: '18:00:00',
      breakMinutes: 60, workMinutes: 480, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST',
      holidayCalendarId: shiftCalendar, markOnHolidayFlag: 0, autoAttendanceFlag: 0, status: 1,
    };
    const shiftId = numericId(successful(await api(hr, '/hr/attendance/shifts', { method: 'POST', body: shiftBody }), '通过HR接口真实创建班次'));
    const scheduleBody = { targetType: 'EMPLOYEE', targetId: employeeId, targetName: `消费日历员工-${caseTag}`,
      shiftId, effectiveStart: '2027-01-04', effectiveEnd: '2027-01-06', status: 'ACTIVE' };
    const scheduleId = numericId(successful(await api(admin, '/hr/attendance/schedules', { method: 'POST', body: scheduleBody }), '真实创建日期范围排班'));
    const saveShift = async changes => {
      const version = Number(database(`SELECT version FROM hr_shift WHERE id=${shiftId} AND tenant_id=100000;`));
      successful(await api(hr, `/hr/attendance/shifts/${shiftId}`, { method: 'PUT', body: { ...shiftBody, version, ...changes } }), '真实更新班次');
    };
    check('HR新增排班后认证服务缓存立即改用班次日历', await resolve() === shiftCalendar);
    check('HR请假遵循班次日历的两个非工作日得到1天', await leave() === 1);
    const shiftAttendance = await attendance();
    check('HR考勤遵循班次法定假日且应出勤为0', shiftAttendance.dateType === 'HOLIDAY' && shiftAttendance.expectedMinutes === 0);
    const workdayAttendance = await attendance('2027-01-06');
    check('班次普通工作日应出勤480分钟', workdayAttendance.dateType === 'WORKDAY' && workdayAttendance.expectedMinutes === 480);
    await saveShift({ markOnHolidayFlag: 1 });
    const holidayAttendance = await attendance();
    check('明确启用节假日考勤后应出勤480分钟并保留假日类型', holidayAttendance.dateType === 'HOLIDAY' && holidayAttendance.expectedMinutes === 480);
    await saveShift({ markOnHolidayFlag: 0 });
    check('班次部分修改保留数据库非空默认参数', database(`SELECT checkin_window_before_minutes=0 AND checkout_window_after_minutes=0 AND half_day_hours_threshold=4 AND absent_hours_threshold=0 FROM hr_shift WHERE id=${shiftId};`) === '1');
    const shiftedVersion = Number(database(`SELECT version FROM hr_shift WHERE id=${shiftId};`));
    const staleShift = await api(hr, `/hr/attendance/shifts/${shiftId}`, { method: 'PUT', body: { ...shiftBody, holidayCalendarId: null, version: shiftedVersion - 1 } });
    check('陈旧班次版本被拒绝且不清空原绑定', staleShift.status === 400 && staleShift.body?.code === 'SHIFT_VERSION_CONFLICT' && database(`SELECT holiday_calendar_id FROM hr_shift WHERE id=${shiftId};`) === shiftCalendar);
    successful(await api(hr, `/hr/attendance/shifts/${shiftId}`, { method: 'PUT', body: { shiftName: `省略日历-${caseTag}`, version: shiftedVersion } }), '只修改名称时不传日历字段');
    check('省略班次日历字段保持原绑定', database(`SELECT holiday_calendar_id FROM hr_shift WHERE id=${shiftId};`) === shiftCalendar && await resolve() === shiftCalendar);

    const customerCode = `${prefix}_CUSTOMER`;
    successful(await api(admin, '/crm/customer', { method: 'POST', body: {
      customerCode, customerName: `日历工单客户-${caseTag}`, status: 'ACTIVE',
    } }), '通过CRM真实创建专用客户');
    const customerId = numericId(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code='${customerCode}' AND deleted=0;`));
    policyId = numericId(successful(await api(admin, '/crm/sla/policy', { method: 'POST', body: {
      policy: { policyCode: `${prefix}_SLA`, policyName: `日历工单策略-${caseTag}`, entityType: 'CUSTOMER', entityId: customerId,
        holidayCalendarId: shiftCalendar, applyForResolution: 1, roundTheClockFlag: 0, defaultFlag: 0, priority: 1,
        effectiveStart: '2027-01-01', effectiveEnd: '2027-12-31', status: 'ENABLED' },
      priorities: [{ priorityCode: 'P4', priorityName: '普通', firstResponseMinutes: 60, resolutionMinutes: 120, sortNo: 4 }],
      rules: [{ ruleType: 'FULFILL', ticketStatus: 'RESOLVED' }],
    } }), '真实保存仅用于专用客户的工作日SLA策略'));
    const preview = async openedTime => successful(await api(admin, '/crm/sla/preview', { method: 'POST', body: {
      customerId, severity: 'P4', openedTime,
    } }), 'CRM真实工作日截止时间试算');
    const assertDeadlines = (label, ticket, firstResponseDue, resolutionDue) => check(label,
      String(ticket.slaPolicyId) === policyId && ticket.slaStatus === 'ONGOING'
      && ticket.firstResponseDue === firstResponseDue && ticket.resolutionDue === resolutionDue);
    assertDeadlines('CRM跳过法定假日和休息日，首响与解决时限精确落在1月6日',
      await preview('2027-01-04 09:00:00'), '2027-01-06 10:00:00', '2027-01-06 11:00:00');
    const ticketTitle = `日历真实工单-${caseTag}`;
    successful(await api(admin, '/crm/ticket', { method: 'POST', body: {
      customerId, ticketTitle, severity: 'P4', openedTime: '2027-01-04 09:00:00',
    } }), '通过业务接口真实保存工单');
    const persisted = row(`SELECT JSON_OBJECT('id',CAST(ticket_id AS CHAR),'policy',CAST(sla_policy_id AS CHAR),'response',DATE_FORMAT(first_response_due,'%Y-%m-%d %H:%i:%s'),'resolution',DATE_FORMAT(resolution_due,'%Y-%m-%d %H:%i:%s')) FROM crm_service_ticket WHERE tenant_id=100000 AND customer_id=${customerId} AND ticket_title='${ticketTitle}' AND deleted=0;`);
    const ticketId = numericId(persisted.id);
    check('真实工单保存结果含实际策略和跨假期截止时间', persisted.policy === policyId && persisted.response === '2027-01-06 10:00:00' && persisted.resolution === '2027-01-06 11:00:00');
    assertDeadlines('CRM业务详情回读与真实入库的截止时间一致', successful(await api(admin, `/crm/ticket/${ticketId}`), '读取真实工单'), persisted.response, persisted.resolution);
    const changedDates = [day('2027-01-04', 'WORKDAY'), day('2027-01-05', 'REST')];
    await saveDates(shiftCalendar, changedDates);
    const changedStarted = performance.now();
    check('认证服务日期变更立即传入HR请假得到2天', await leave() === 2);
    const changedAttendance = await attendance();
    check('同一HR考勤缓存立即读取工作日和480应出勤分钟', changedAttendance.dateType === 'WORKDAY' && changedAttendance.expectedMinutes === 480);
    assertDeadlines('同一CRM进程立即采用日历变更后的当日截止时间',
      await preview('2027-01-04 09:00:00'), '2027-01-04 10:00:00', '2027-01-04 11:00:00');
    console.log(`HOLIDAY_CONSUMER_VISIBILITY: three_http_reads_ms=${(performance.now() - changedStarted).toFixed(3)}; stale_results=0; waits=0; isolated=true`);
    assertDeadlines('CRM计时精确扣除午休', await preview('2027-01-04 11:30:00'), '2027-01-04 13:30:00', '2027-01-04 14:30:00');
    assertDeadlines('CRM跨周末工作时限落到下周一', await preview('2027-01-08 17:30:00'), '2027-01-11 09:30:00', '2027-01-11 10:30:00');
    await saveDates(shiftCalendar, [...changedDates, day('2027-01-09', 'WORKDAY')]);
    assertDeadlines('新增周六调休后CRM立即在周六累计时限', await preview('2027-01-08 17:30:00'), '2027-01-09 09:30:00', '2027-01-09 10:30:00');

    await saveShift({ holidayCalendarId: null });
    check('真实班次接口显式空值清除日历绑定', database(`SELECT holiday_calendar_id IS NULL FROM hr_shift WHERE id=${shiftId} AND tenant_id=100000;`) === '1');
    check('班次清空后认证服务立即回退部门日历', await resolve() === departmentCalendar);
    check('班次清空后HR请假按部门日历得到2天', await leave() === 2);
    const clearedAttendance = await attendance();
    check('班次清空后HR考勤立即采用部门休息日', clearedAttendance.dateType === 'REST' && clearedAttendance.expectedMinutes === 0);
    await saveShift({ holidayCalendarId: shiftCalendar });
    check('恢复班次绑定后认证服务立即切回班次日历', await resolve() === shiftCalendar);
    const inheritedShift = numericId(successful(await api(hr, '/hr/attendance/shifts', { method: 'POST', body: {
      ...shiftBody, shiftCode: `${prefix}_INHERIT`, shiftName: `继承班次-${caseTag}`, holidayCalendarId: null,
    } }), '真实创建继承部门日历的班次'));
    successful(await api(admin, `/hr/attendance/schedules/${scheduleId}`, { method: 'PUT', body: { ...scheduleBody, shiftId: inheritedShift } }), '通过HR接口修改排班班次');
    check('修改排班后持久化班次和跨服务日历缓存均更新', database(`SELECT shift_id FROM hr_schedule_assignment WHERE id=${scheduleId} AND tenant_id=100000;`) === inheritedShift && await resolve() === departmentCalendar);
    successful(await api(admin, `/hr/attendance/schedules/${scheduleId}`, { method: 'DELETE' }), '通过HR接口删除本次排班');
    check('排班删除按既有表结构真实移除记录', database(`SELECT COUNT(*) FROM hr_schedule_assignment WHERE id=${scheduleId} AND tenant_id=100000;`) === '0');
    check('删除排班后解析仍采用部门日历', await resolve() === departmentCalendar);
    const department = successful(await api(admin, `/auth/system/dept/${departmentId}`), '读取本次部门版本');
    successful(await api(admin, '/auth/system/dept', { method: 'PUT', body: {
      deptId: departmentId, deptName: departmentName, parentId: 0, version: department.version, holidayCalendarId: null,
    } }), '通过认证服务清空部门日历');
    check('部门清空后统一解析采用租户默认日历', await resolve() === defaultCalendar);
    check('部门清空后HR请假立即采用默认日历得到3天', await leave() === 3);
    const defaultAttendance = await attendance();
    check('部门清空且无排班时HR考勤为工作日待配置', defaultAttendance.dateType === 'WORKDAY' && defaultAttendance.status === 'PENDING');
    check('仅计算请假考勤未伪造申请、出勤和原始打卡', database(`SELECT (SELECT COUNT(*) FROM hr_time_request WHERE employee_id=${employeeId})+(SELECT COUNT(*) FROM hr_attendance_record WHERE employee_id=${employeeId})+(SELECT COUNT(*) FROM hr_attendance_checkin WHERE employee_id=${employeeId});`) === '0');
    const referenced = await api(hr, `${base}/calendar/${shiftCalendar}`, { method: 'DELETE' });
    check('已被真实SLA策略和班次引用的日历删除被拒绝', referenced.body?.code !== 200 && database(`SELECT deleted FROM sys_holiday_calendar WHERE calendar_id=${shiftCalendar};`) === '0');
    const employee = await session('g_holiday_employee');
    try {
      check('EMPLOYEE不能新增班次', denied(await api(employee, '/hr/attendance/shifts', { method: 'POST', body: { ...shiftBody, shiftCode: `${prefix}_DENIED` } })));
      check('EMPLOYEE不能修改班次日历', denied(await api(employee, `/hr/attendance/shifts/${shiftId}`, { method: 'PUT', body: { ...shiftBody, holidayCalendarId: null } })));
      check('EMPLOYEE不能新增排班', denied(await api(employee, '/hr/attendance/schedules', { method: 'POST', body: scheduleBody })));
      check('员工拒绝后班次绑定与排班删除结果不变', database(`SELECT holiday_calendar_id FROM hr_shift WHERE id=${shiftId};`) === shiftCalendar && database(`SELECT COUNT(*) FROM hr_schedule_assignment WHERE id=${scheduleId};`) === '0');
    } finally { await employee.context().close(); }
    const foreign = await session('g_import_tenant');
    try {
      const foreignAttendance = await api(foreign, `/hr/attendance/records/calculate?employeeId=${employeeId}&date=2027-01-04`);
      check('其他租户无法计算本租户员工考勤', foreignAttendance.status === 404 && foreignAttendance.body?.code === 'EMPLOYEE_NOT_FOUND' && Object.keys(foreignAttendance.body?.data || {}).length === 0);
      const foreignPolicy = await api(foreign, `/crm/sla/policy/${policyId}`);
      check('其他租户不能读取日历策略', foreignPolicy.body?.code !== 200 && !foreignPolicy.body?.data);
    } finally { await foreign.context().close(); }
    pending.push('本专项未核定正式年度节假日或工资政策；请假计算与考勤计算不等于业务申请、审批或工资入账', '加班类型及其余工资/申诉业务消费方须单独复核；本专项未修改正式服务或正式数据库');
    console.log('HOLIDAY_CONSUMER_HTTP: assignment_fallback=SHIFT,DEPT,DEFAULT; leave=true; attendance=true; crm_preview=true; crm_ticket_persisted=true; calendar_mutation_cross_service=true; employee_write_denied=true; business_sql_fixtures=0; production_modified=false');
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (policyId) {
      try {
        successful(await api(admin, `/crm/sla/policy/${policyId}/disable`, { method: 'POST' }), '停用本次专用客户策略');
        check('本次专用策略已停用且保留真实工单证据', database(`SELECT status FROM crm_sla_policy WHERE policy_id=${policyId} AND tenant_id=100000;`) === 'DISABLED');
      } catch (error) { cleanupFailures.push(error); }
    }
    if (defaultChanged) {
      try {
        await selectDefault(originalDefault);
        check('隔离租户原默认日历在退出前真实恢复且仍唯一', database("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND deleted=0;") === originalDefault);
      } catch (error) { cleanupFailures.push(error); }
    }
    await hr.context().close();
    console.log(`HOLIDAY_CONSUMER_RESTORE: original_default=${originalDefault}; failures=${cleanupFailures.length}; production_modified=false`);
  }
  if (primaryFailure || cleanupFailures.length) throw new AggregateError([primaryFailure, ...cleanupFailures].filter(Boolean),
    [primaryFailure?.message, ...cleanupFailures.map(error => error.message)].filter(Boolean).join('; '));
}
