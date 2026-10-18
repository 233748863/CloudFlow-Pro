import assert from 'node:assert/strict';

export async function verifyMeetingBoundaries({ admin, api, successful, session, database, check, caseTag, employee: existingEmployee, outsider: existingHr }) {
  const employee = existingEmployee ?? await session('g_holiday_employee');
  const hr = existingHr ?? await session('g_holiday_hr');
  const hostId = '990000707'; const guestId = '990000701';
  const prefix = `H4B_${caseTag}`;
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const dayAfter = days => database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL ${days} DAY),'%Y-%m-%d');`);
  const post = (page, route, body) => api(page, route, { method: 'POST', body });
  const put = (page, route, body) => api(page, route, { method: 'PUT', body });
  const failed = (result, label, code, status = 400) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === status && String(result.body?.msg).includes(code));
  const eventually = async (read, predicate, label) => {
    const deadline = Date.now() + 90000; let value;
    do { value = await read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 350)); } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(value)}`);
  };
  const detail = async id => successful(await api(employee, `/oa/meeting/booking/${id}`), '真实会议状态读取').event;
  const room = async (suffix, extra = {}) => {
    const input = { name: `${prefix}_${suffix}`, capacity: 6, status: '1', equipmentTags: JSON.stringify([`${prefix}_${suffix}`]),
      bookableWeekdays: '[1,2,3,4,5,6,7]', openTime: null, closeTime: null, minBookingMinutes: 1,
      maxBookingMinutes: 180, advanceBookingDays: 60, bufferMinutes: 10, holidayBookableFlag: 1, needApprovalFlag: 0, ...extra };
    successful(await post(admin, '/oa/meeting-room', input), '真实创建边界检查会议室');
    const id = database(`SELECT room_id FROM oa_meeting_room WHERE tenant_id=100000 AND name=${quote(input.name)} AND deleted=0;`); assert.match(id, /^\d+$/);
    return successful(await api(admin, `/oa/meeting-room/${id}`), '真实房间规则读取');
  };
  const command = (suffix, extra = {}) => ({ title: `${prefix}_${suffix}`, roomId: null, startTime: `${dayAfter(20)} 09:00:00`, endTime: `${dayAfter(20)} 10:00:00`,
    expectedAttendees: 2, attendeeIds: [guestId], reminders: [], draft: false, confirmParticipantConflicts: true, timezoneId: 'Asia/Shanghai', ...extra });
  const create = async (suffix, extra = {}) => successful(await post(employee, '/oa/meeting/booking', command(suffix, extra)), '真实保存边界检查会议');
  const available = async (targetRoom, start, end) => successful(await api(employee, `/oa/meeting/room/available?${new URLSearchParams({ start, end, equipment: JSON.parse(targetRoom.equipmentTags)[0] })}`), '真实空闲会议室查询');
  const currentWindow = () => database("SELECT CONCAT(DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s'),',',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:%i:%s'));" ).split(',');
  const shift = (date, minutes) => database(`SELECT DATE_FORMAT(DATE_ADD(${quote(date)},INTERVAL ${minutes} MINUTE),'%Y-%m-%d %H:%i:%s');`);
  const state = async (event, targetStatus, reason) => successful(await post(employee, `/oa/meeting/booking/${event.eventId}/state`, { version: event.version, targetStatus, reason }), '真实会议五态转换');

  const calendarInput = { calendarCode: `${prefix}_CAL`, calendarName: `${prefix}会议日历`, region: '隔离会议验收', defaultFlag: 0,
    weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' };
  const employeeCalendar = await post(employee, '/auth/system/holiday/calendar', calendarInput);
  check('员工仍无节假日维护权限', employeeCalendar.status === 403 && employeeCalendar.body?.code === 403);
  successful(await post(hr, '/auth/system/holiday/calendar', calendarInput), 'HR通过真实接口维护会议日历');
  const calendarId = database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code=${quote(calendarInput.calendarCode)};`);
  assert.match(calendarId, /^\d+$/);
  const calendarRoom = await room('CAL', { holidayCalendarId: calendarId, holidayBookableFlag: 0, openTime: '09:00:00', closeTime: '18:00:00' });
  const saturday = database("SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL (12-WEEKDAY(CURRENT_DATE)) DAY),'%Y-%m-%d');");
  const sunday = database(`SELECT DATE_FORMAT(DATE_ADD(${quote(saturday)},INTERVAL 1 DAY),'%Y-%m-%d');`);
  failed(await post(employee, '/oa/meeting/booking', command('UNKNOWN_DAY', { roomId: calendarRoom.roomId, startTime: `${saturday} 09:00:00`, endTime: `${saturday} 10:00:00` })), '未核定日历不能当成普通工作日预约', 'ROOM_CALENDAR_UNVERIFIED');
  const dates = [{ holidayDate: saturday, dateType: 'WORKDAY', triplePayFlag: 0, holidayName: '隔离调休上班日' },
    { holidayDate: sunday, dateType: 'HOLIDAY', triplePayFlag: 1, holidayName: '隔离法定假日' }];
  for (const year of new Set(dates.map(value => Number(value.holidayDate.slice(0, 4))))) {
    successful(await post(hr, '/auth/system/holiday/date/batch', { calendarId, yearNo: year, dates: dates.filter(value => value.holidayDate.startsWith(`${year}-`)) }), 'HR实际保存调休及法定假日事实');
  }
  check('法定假日关闭规则在空闲查询中同样生效', (await available(calendarRoom, `${sunday} 09:00:00`, `${sunday} 10:00:00`)).total === 0);
  failed(await post(employee, '/oa/meeting/booking', command('CLOSED_HOLIDAY', { roomId: calendarRoom.roomId, startTime: `${sunday} 09:00:00`, endTime: `${sunday} 10:00:00` })), '实际锁定提交拒绝不开放的法定假日', 'ROOM_DAY_CLOSED');
  const workingSaturday = await create('WORKING_SATURDAY', { roomId: calendarRoom.roomId, startTime: `${saturday} 09:00:00`, endTime: `${saturday} 10:00:00` });
  check('OA通过真实公共日历服务允许已核定调休上班日', workingSaturday.status === 'PLANNED');
  const holidayRoom = await room('HOLIDAY_OPEN', { holidayCalendarId: calendarId, holidayBookableFlag: 1 });
  check('显式允许假日预约时空闲查询返回实际房间', (await available(holidayRoom, `${sunday} 09:00:00`, `${sunday} 10:00:00`)).total === 1);
  const holidayBooking = await create('OPEN_HOLIDAY', { roomId: holidayRoom.roomId, startTime: `${sunday} 09:00:00`, endTime: `${sunday} 10:00:00` });
  check('显式允许假日预约时实际保存成功', String(holidayBooking.roomId) === String(holidayRoom.roomId));
  failed(await post(employee, '/oa/meeting/booking', command('TOO_EARLY', { roomId: holidayRoom.roomId, startTime: `${dayAfter(61)} 09:00:00`, endTime: `${dayAfter(61)} 10:00:00` })), '超过提前60天的预约被实际拒绝', 'ROOM_ADVANCE_EXCEEDED');

  const secretName = `${prefix}不可泄漏客户名称`;
  successful(await post(admin, '/crm/customer', { customerCode: `${prefix}_CUSTOMER`, customerName: secretName, status: 'ACTIVE' }), '真实创建隔离客户');
  const customerId = database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${quote(`${prefix}_CUSTOMER`)} AND deleted=0;`);
  const crmInput = { activity: { activityType: 'MEETING', subject: `${prefix}客户内部会议`, startTime: `${dayAfter(20)} 09:00:00`, endTime: `${dayAfter(20)} 10:00:00`,
    status: 'PLANNED', bizType: 'CUSTOMER', bizId: customerId, customerId, ownerId: guestId }, participants: [{ participantType: 'USER', participantRefId: guestId, acceptanceStatus: 'NONE' }], reminders: [] };
  const crm = successful(await post(admin, '/crm/activity', crmInput), '真实创建CRM会议及创建人参与记录');
  const busyPath = `/oa/meeting/participant-busy?${new URLSearchParams({ userIds: guestId, start: crmInput.activity.startTime, end: crmInput.activity.endTime })}`;
  const hidden = successful(await api(hr, busyPath), '跨服务核查CRM忙碌时段');
  check('真实CRM活动冲突可见但无权客户名称和会议标题均不泄漏', hidden.crmVerified && hidden.busy.some(value => value.module === 'CRM' && value.title === '忙碌时段' && !value.detailsVisible && !value.businessId)
    && !JSON.stringify(hidden).includes(secretName) && !JSON.stringify(hidden).includes(crmInput.activity.subject));
  const visible = successful(await api(admin, busyPath), '授权人员核查CRM活动');
  check('授权管理员可以核对真实CRM会议标题及业务编号', visible.busy.some(value => value.module === 'CRM' && String(value.businessId) === String(crm.activity.activityId) && value.title === crmInput.activity.subject && value.detailsVisible));
  failed(await post(employee, '/oa/meeting/booking', command('CRM_CONFIRM', { confirmParticipantConflicts: false })), 'CRM参与者冲突未确认时不能直接预约', 'MEETING_PARTICIPANT_CONFIRMATION_REQUIRED', 409);
  const confirmed = await create('CRM_CONFIRMED');
  check('确认人员软冲突后仍允许保存独立内部会议', confirmed.status === 'PLANNED');
  for (const acceptanceStatus of ['TENTATIVE', 'DECLINED', 'ACCEPTED']) {
    const response = successful(await post(admin, `/oa/meeting/booking/${confirmed.eventId}/respond`, { invitationVersion: confirmed.scheduleVersion, acceptanceStatus }), '本人真实回应会议邀请');
    check(`接受状态${acceptanceStatus}与实际签到分别保存`, response.acceptanceStatus === acceptanceStatus && response.attendStatus === 'NOT_CHECKED' && !response.checkInTime);
  }
  successful(await post(admin, `/crm/activity/${crm.activity.activityId}/cancel`, { version: crm.activity.version }), '真实取消CRM会议');
  const cancelledCrm = successful(await api(admin, busyPath), '取消后的跨模块冲突复查');
  check('已取消CRM会议不继续占用人员时段', !cancelledCrm.busy.some(value => value.module === 'CRM' && String(value.businessId) === String(crm.activity.activityId)));

  const approvalRoom = await room('APPROVAL', { needApprovalFlag: 1, approverId: guestId });
  const approvalExtra = { roomId: approvalRoom.roomId, startTime: `${dayAfter(22)} 09:00:00`, endTime: `${dayAfter(22)} 10:00:00` };
  const instance = event => eventually(() => database(`SELECT IFNULL(instance_id,'') FROM oa_schedule_event WHERE event_id=${event.eventId};`), value => Boolean(value) && !value.startsWith('F:'), '等待会议审批绑定');
  const rejected = await create('REJECT', approvalExtra); const rejectInstance = await instance(rejected);
  check('待批预约在真实空闲查询中保留占位', (await available(approvalRoom, approvalExtra.startTime, approvalExtra.endTime)).total === 0);
  failed(await post(hr, '/oa/meeting/booking', command('PENDING_COLLISION', approvalExtra)), '其他用户不能抢占待批房间', 'ROOM_CONFLICT', 409);
  const taskId = await eventually(() => database(`SELECT task_id FROM wf_task WHERE instance_id=${quote(rejectInstance)} AND assignee=${guestId};`), value => Boolean(value), '等待实际审批任务');
  successful(await post(admin, '/workflow/wf/complete', { taskId, action: 'REJECT', comment: '隔离会议拒绝释放验收' }), '独立审批人通过真实工作流拒绝');
  const rejectedEvent = await eventually(() => detail(rejected.eventId), value => value.approvalStatus === 'REJECTED', '等待真实拒绝回调');
  check('真实审批拒绝后取消会议并释放房间', rejectedEvent.status === 'CANCELLED' && (await available(approvalRoom, approvalExtra.startTime, approvalExtra.endTime)).total === 1);
  const withdrawn = await create('WITHDRAW', approvalExtra); const withdrawInstance = await instance(withdrawn); const beforeWithdraw = await detail(withdrawn.eventId);
  successful(await post(employee, `/oa/meeting/booking/${withdrawn.eventId}/cancel`, { version: beforeWithdraw.version, reason: '本人撤回预约' }), '本人真实撤回待批预约');
  await eventually(() => database(`SELECT status FROM wf_process_instance WHERE instance_id=${quote(withdrawInstance)};`), value => value === 'INVALIDATED', '等待持久消息作废实际流程');
  check('本人撤回后实际工作流无待办且房间重新可约', database(`SELECT COUNT(*) FROM wf_task WHERE instance_id=${quote(withdrawInstance)};`) === '0'
    && (await available(approvalRoom, approvalExtra.startTime, approvalExtra.endTime)).total === 1);

  const recurringInput = command('SERIES', { startTime: `${dayAfter(30)} 11:00:00`, endTime: `${dayAfter(30)} 12:00:00`, attendeeIds: [], expectedAttendees: 1, recurrenceRule: 'FREQ=DAILY;COUNT=3', recurrenceEndDate: dayAfter(35) });
  const preview = successful(await post(employee, '/oa/meeting/series/preview', recurringInput), '真实周期边界预览');
  const series = successful(await post(employee, '/oa/meeting/series', { ...recurringInput, impactDigest: preview.impactDigest, confirmSeriesChanges: true }), '真实创建独立周期会议');
  const first = series.instances[0]; const second = series.instances[1];
  const changed = successful(await put(employee, `/oa/meeting/booking/${first.eventId}`, { ...recurringInput, recurrenceRule: null, recurrenceEndDate: null, title: `${prefix}_INDEPENDENT`,
    version: first.version, startTime: shift(first.startTime, 180), endTime: shift(first.endTime, 180) }), '单实例真实独立改期');
  check('单实例改期保留原发生时间及其他实例时间', changed.originalStartTime === first.originalStartTime
    && database(`SELECT DATE_FORMAT(start_time,'%Y-%m-%d %H:%i:%s') FROM oa_schedule_event WHERE event_id=${second.eventId};`) === second.startTime);
  successful(await post(employee, `/oa/meeting/booking/${second.eventId}/cancel`, { version: second.version, reason: '保留独立取消事实' }), '真实取消另一个周期实例');
  const updatedInput = { ...recurringInput, version: series.series.version, title: `${prefix}_SERIES_UPDATED`, recurrenceRule: 'FREQ=DAILY;COUNT=4' };
  const updatedPreview = successful(await post(employee, `/oa/meeting/series/preview?id=${series.series.eventId}`, updatedInput), '实际整系列变更预览');
  successful(await put(employee, `/oa/meeting/series/${series.series.eventId}`, { ...updatedInput, impactDigest: updatedPreview.impactDigest, confirmSeriesChanges: true }), '实际确认整系列变更');
  check('整系列重算不复活已取消实例、不覆盖独立改期', database(`SELECT status FROM oa_schedule_event WHERE event_id=${second.eventId};`) === 'CANCELLED'
    && database(`SELECT DATE_FORMAT(start_time,'%Y-%m-%d %H:%i:%s') FROM oa_schedule_event WHERE event_id=${first.eventId};`) === changed.startTime);
  const tooMany = await post(employee, '/oa/meeting/series/preview', { ...recurringInput, recurrenceRule: 'FREQ=DAILY;COUNT=501', recurrenceEndDate: null });
  failed(tooMany, '501个周期实例明确拒绝且不静默截断', 'MEETING_RECURRENCE_LIMIT');
  const lastFriday = database("SELECT DATE_FORMAT(DATE_SUB(LAST_DAY(DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH)), INTERVAL MOD(WEEKDAY(LAST_DAY(DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH)))+3,7) DAY),'%Y-%m-%d 09:00:00');");
  for (const [rule, startTime, expected] of [
    ['FREQ=WEEKLY;COUNT=3', `${dayAfter(26)} 09:00:00`, 3],
    ['FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', lastFriday, 3],
    ['FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=2', '2028-02-29 09:00:00', 2],
  ]) {
    const expanded = successful(await post(employee, '/oa/meeting/series/preview', { ...recurringInput, recurrenceRule: rule, startTime, endTime: shift(startTime, 60), recurrenceEndDate: null }), '真实RRULE日历展开');
    const created = expanded.changes.filter(value => value.action === 'CREATE');
    check(`真实服务展开${rule}得到${expected}份实例`, expanded.canSubmit && created.length === expected);
    if (rule.includes('BYDAY=-1FR')) check('真实月末周五展开每项均为该月最后一个星期五', created.every(value => {
      const date = new Date(`${value.startTime.replace(' ', 'T')}Z`); const next = new Date(date.getTime() + 7 * 86400000);
      return date.getUTCDay() === 5 && date.getUTCMonth() !== next.getUTCMonth();
    }));
    if (rule.startsWith('FREQ=YEARLY')) check('真实闰日实例为2028及2032年2月29日', created.map(value => value.startTime.slice(0, 10)).join(',') === '2028-02-29,2032-02-29');
  }

  const usageRoom = await room('USAGE');
  const [startTime, endTime] = currentWindow();
  let used = await create('ACTUAL', { roomId: usageRoom.roomId, startTime, endTime });
  failed(await post(employee, `/oa/meeting/booking/${used.eventId}/state`, { version: used.version, targetStatus: 'COMPLETED' }), '未实际开始的会议不能直接完成', 'MEETING_STATE_INVALID');
  used = await state(used, 'IN_PROGRESS');
  failed(await post(employee, `/oa/meeting/booking/${used.eventId}/cancel`, { version: used.version, reason: '普通主持人不能取消已开始会议' }), '员工本人写权限不能代替已开始会议管理权限', 'MEETING_STATE_INVALID');
  used = await state(used, 'COMPLETED');
  await create('FUTURE_RESERVED', { roomId: usageRoom.roomId, startTime: shift(startTime, 120), endTime: shift(startTime, 180) });
  const cancelled = await create('CANCELLED', { roomId: usageRoom.roomId, startTime: shift(startTime, 240), endTime: shift(startTime, 300) });
  await state(cancelled, 'CANCELLED', '统计排除取消会议');
  const absent = await create('NOT_HELD', { roomId: usageRoom.roomId, startTime: shift(startTime, 360), endTime: shift(startTime, 420) });
  await state(absent, 'NOT_HELD', '统计排除未举行会议');
  let usage;
  for (let pageNum = 1; !usage && pageNum <= 20; pageNum++) {
    const result = successful(await api(admin, `/oa/meeting/usage?${new URLSearchParams({ start: startTime, end: shift(startTime, 480), pageNum: String(pageNum), pageSize: '50' })}`), '真实使用率分页核算');
    usage = result.rows.find(value => String(value.room.roomId) === String(usageRoom.roomId));
    if (pageNum * 50 >= result.total) break;
  }
  check('人工核算使用率60/480=12.5%，取消、未举行及10分钟缓冲均不计入', Number(usage?.usedMinutes) === 60 && Number(usage?.openMinutes) === 480 && Number(usage?.usagePercent) === 12.5);
  check('人工核算未来预订60/480=12.5%，与实际使用分开统计', Number(usage?.bookedMinutes) === 60 && Number(usage?.bookingPercent) === 12.5);
  console.log('H4_MEETING_BOUNDARIES: real_http=true; real_calendar=true; real_crm_busy=true; real_reject_and_withdraw=true; real_recurrence=true; real_usage=true; production_modified=false');
}
