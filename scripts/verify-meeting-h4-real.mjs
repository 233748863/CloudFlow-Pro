import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyMeetingInterface } from './verify-meeting-h4-ui.mjs';
import { verifyMeetingBoundaries } from './verify-meeting-h4-boundaries.mjs';
import { verifyMeetingRecovery } from './verify-meeting-h4-recovery.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyMeeting({ admin, api, successful, session, database, check, directory, caseTag, state, evidence }) {
  if (process.argv.includes('--meeting-recovery-only')) {
    return verifyMeetingRecovery({ admin, api, successful, session, database, check, directory, caseTag, state });
  }
  if (process.argv.includes('--meeting-boundaries-only')) {
    return verifyMeetingBoundaries({ admin, api, successful, session, database, check, caseTag });
  }
  for (const service of ['auth', 'oa', 'crm', 'workflow', 'gateway']) assert.ok(state.services.some(value => value.name === service), `Real ${service} required`);
  assert.equal(state.smtpFixture?.loopback, true, 'Owned TLS mail fixture required');
  const smtpSnapshot = path.join(directory, 'private', 'smtp', 'snapshot.json');
  assert.ok(Date.now() - (await fs.stat(smtpSnapshot)).mtimeMs < 10000, 'Owned TLS fixture has expired; restart only the verified isolated fixture before this test');
  const previousChannels = database("SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code REGEXP '^h4_[0-9a-f]{12}$' AND channel_type='EMAIL' AND smtp_host='localhost' AND deleted=0;").split(/\r?\n/).filter(Boolean);
  for (const channelId of previousChannels) {
    assert.match(channelId, /^\d+$/);
    successful(await api(admin, `/auth/system/message/channel/${channelId}`, { method: 'DELETE' }), '清理本隔离环境上轮H4邮件测试渠道');
  }
  database("UPDATE sys_user SET email=CONCAT(user_name,'@example.test') WHERE tenant_id=100000 AND user_id IN(990000701,990000707) AND user_name IN('g_import_admin','g_holiday_employee');");
  const employee = await session('g_holiday_employee'); const outsider = await session('g_holiday_hr'); const foreign = await session('g_import_tenant');
  const hostId = '990000707'; const guestId = '990000701';
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const waitFor = async (read, predicate, label, timeout = 60000) => {
    const deadline = Date.now() + timeout; let current;
    do { current = await read(); if (predicate(current)) return current; await new Promise(resolve => setTimeout(resolve, 300)); } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(current)}`);
  };
  const dayAfter = days => database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL ${days} DAY),'%Y-%m-%d');`);
  const date = dayAfter(2); const tomorrow = dayAfter(3);
  const window = (from, to, extra = {}) => new URLSearchParams({ start: from, end: to, ...extra }).toString();
  const reject = (response, label) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, [400, 403, 404, 409].includes(response.status) || [400, 403, 404, 409].includes(response.body?.code));
  const forbidden = (response, label) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, response.status === 403 && response.body?.code === 403);
  const post = (page, route, body) => api(page, route, { method: 'POST', body });
  const detail = async (id, page = employee) => successful(await api(page, `/oa/meeting/booking/${id}`), '读取会议详情');
  const beforeGrants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const menuDesign = JSON.parse(await fs.readFile(new URL('../docs/design/H-G剩余设计菜单清单.json', import.meta.url), 'utf8'));
  const menus = menuDesign.menus.filter(menu => menu.batch === 'H4');
  check('H4十个menu_id全部处于1950—1969批准段位', menus.length === 10 && menus.every(menu => menu.id >= 1950 && menu.id <= 1969)
    && database('SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1950 AND 1969;') === '10');
  for (const menu of menus) {
    const expected = [...menuDesign.roleSets[menu.roles]].sort((first, second) => first - second).join(',');
    const actual = database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=${menu.id};`);
    check(`菜单${menu.id}实际角色=${actual}，精确匹配批准稿`, expected === actual);
  }
  check('EMPLOYEE本批写权限精确为1952/1953/1954/1955/1958，非预期授权0', database('SELECT GROUP_CONCAT(menu_id ORDER BY menu_id) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id BETWEEN 1950 AND 1969;') === '1950,1952,1953,1954,1955,1958,1959');
  const createRoom = async (suffix, extra = {}) => {
    const input = { name: `H4_${caseTag}_${suffix}`, capacity: 6, location: '隔离验收会议区', equipment: '原设备文字保留', status: '1',
      equipmentTags: JSON.stringify([caseTag]), bookableWeekdays: '[1,2,3,4,5,6,7]', openTime: '09:00:00', closeTime: '18:00:00',
      minBookingMinutes: 30, maxBookingMinutes: 180, advanceBookingDays: 60, bufferMinutes: 10, holidayBookableFlag: 1, needApprovalFlag: 0, ...extra };
    successful(await post(admin, '/oa/meeting-room', input), '创建真实会议室');
    const id = database(`SELECT room_id FROM oa_meeting_room WHERE tenant_id=100000 AND name=${quote(input.name)} AND deleted=0;`); assert.match(id, /^\d+$/);
    return successful(await api(admin, `/oa/meeting-room/${id}`), '会议室保存回显');
  };
  let room = await createRoom('main');
  check('新房间容量、位置、原设备、结构化设备、时段、时长、提前天数和缓冲真实保存', room.capacity === 6 && room.location === '隔离验收会议区'
    && room.equipment === '原设备文字保留' && JSON.parse(room.equipmentTags)[0] === caseTag && room.openTime === '09:00:00'
    && room.maxBookingMinutes === 180 && room.advanceBookingDays === 60 && room.bufferMinutes === 10);
  const booking = (suffix, values = {}) => ({ title: `H4_${caseTag}_${suffix}`, roomId: room.roomId, startTime: `${date} 09:00:00`, endTime: `${date} 10:00:00`,
    expectedAttendees: 2, attendeeIds: [guestId], reminders: [], draft: false, confirmParticipantConflicts: true, timezoneId: 'Asia/Shanghai', ...values });
  const readiness = successful(await api(employee, '/oa/meeting/email-readiness'), '未配置邮件可用状态');
  check('外部邮件未配置明确停用并返回原因', readiness.ready === false && Boolean(readiness.reason));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const file = { name: `H4_${caseTag}.png`, type: 'image/png', content: png.toString('base64') };
  forbidden(await post(employee, '/oa/meeting-room', { name: `H4_${caseTag}_forbidden`, status: '1' }), '员工无会议室新建权限');
  forbidden(await api(employee, `/oa/meeting-room/${room.roomId}/photo`, { method: 'POST', file }), '员工无照片上传权限');
  forbidden(await api(employee, `/oa/meeting-room/${room.roomId}/booking-rule`, { method: 'PUT', body: { version: room.version } }), '员工无规则维护权限');
  forbidden(await api(employee, `/oa/meeting/usage?${window(`${date} 00:00:00`, `${tomorrow} 00:00:00`)}`), '员工无管理使用率权限');
  const photo = successful(await api(admin, `/oa/meeting-room/${room.roomId}/photo`, { method: 'POST', file }), '真实上传照片');
  check('实际照片上传响应只包含业务引用', Object.keys(photo).sort().join(',') === 'extension,fileId,fileName,size');
  await new Promise(resolve => setTimeout(resolve, 5200));
  const invalidPhoto = await api(admin, `/oa/meeting-room/${room.roomId}/photo`, { method: 'POST', file: { ...file, name: 'invalid.png', content: Buffer.from('not an image').toString('base64') } });
  check('真实存储拒绝伪造照片并返回明确400提示', invalidPhoto.status === 400 && invalidPhoto.body?.code === 400 && invalidPhoto.body.msg.includes('PNG或JPEG'));
  const rule = { version: room.version, equipmentTags: [caseTag], bookableWeekdays: [1, 2, 3, 4, 5, 6, 7], openTime: '09:00:00', closeTime: '18:00:00',
    minBookingMinutes: 30, maxBookingMinutes: 180, advanceBookingDays: 60, bufferMinutes: 10, holidayBookableFlag: 1, needApprovalFlag: 0, photoFileId: photo.fileId };
  const rulePreview = successful(await post(admin, `/oa/meeting-room/${room.roomId}/booking-rule/preview`, rule), '规则存量影响预检');
  room = successful(await api(admin, `/oa/meeting-room/${room.roomId}/booking-rule`, { method: 'PUT', body: { ...rule, impactDigest: rulePreview.impactDigest, confirmExistingConflicts: true } }), '保存照片绑定与规则');
  const downloaded = await api(employee, `/oa/meeting-room/${room.roomId}/photo`);
  check('真实浏览器经网关/OA/中央存储读取照片字节一致', downloaded.status === 200 && downloaded.sha256 === createHash('sha256').update(png).digest('hex'));
  reject(await api(foreign, `/oa/meeting-room/${room.roomId}/photo`), '跨租户照片读取拒绝');
  reject(await api(admin, `/auth/system/file/${photo.fileId}/content`), '通用文件入口不能绕过照片业务鉴权');
  reject(await post(employee, '/oa/meeting/booking', booking('short', { endTime: `${date} 09:15:00` })), '短于最短时长拒绝');
  reject(await post(employee, '/oa/meeting/booking', booking('long', { endTime: `${date} 13:00:00` })), '超过最长时长拒绝');
  reject(await post(employee, '/oa/meeting/booking', booking('closed', { startTime: `${date} 08:00:00`, endTime: `${date} 09:00:00` })), '开放时间之外拒绝');
  reject(await post(employee, '/oa/meeting/booking', booking('capacity', { expectedAttendees: 7 })), '超过会议室容量拒绝');
  reject(await post(employee, '/oa/meeting/booking', booking('unsafe_link', { joinUrl: 'javascript:alert(1)' })), '危险会议链接拒绝');
  const original = successful(await post(employee, '/oa/meeting/booking', booking('main', { joinUrl: 'https://meeting.example.test/join', reminders: [{ remindMinutesBefore: 43200, channelType: 'INTERNAL' }, { remindMinutesBefore: 43200, channelType: 'EMAIL' }] })), '员工本人真实预约');
  check('员工只能以本人为主持人创建实际预约', String(original.creatorId) === hostId && original.status === 'PLANNED' && original.approvalStatus === 'NOT_REQUIRED');
  const initialDetail = await detail(original.eventId);
  check('会前邀请没有生成签到或重复纪要行', initialDetail.invitations.length === 2 && initialDetail.invitations.every(value => value.acceptanceStatus === 'NONE' && value.attendStatus === 'NOT_CHECKED' && !value.minutesId && !value.checkInTime));
  const busy = successful(await api(outsider, `/oa/meeting/participant-busy?${window(original.startTime, original.endTime, { userIds: hostId })}`), '真实OA与CRM冲突查询');
  check('CRM服务实际可达；无权OA会议只给忙碌时段', busy.crmVerified && busy.busy.some(value => value.module === 'OA' && value.title === '忙碌时段' && !value.detailsVisible && !value.businessId));
  reject(await api(outsider, `/oa/meeting/booking/${original.eventId}`), '同租户无关系用户不能读会议详情');
  reject(await post(outsider, `/oa/meeting/booking/${original.eventId}/respond`, { invitationVersion: original.scheduleVersion, acceptanceStatus: 'ACCEPTED' }), '未受邀人员不能回应他人邀请');
  reject(await api(outsider, `/oa/meeting/booking/${original.eventId}`, { method: 'PUT', body: booking('forged_edit', { version: original.version }) }), '本人编辑权限不能编辑他人会议');
  reject(await api(foreign, `/oa/meeting/booking/${original.eventId}`), '跨租户会议详情拒绝');
  const hiddenBoard = successful(await api(outsider, `/oa/meeting/board?${window(`${date} 00:00:00`, `${tomorrow} 00:00:00`, { equipment: caseTag })}`), '无关系用户资源看板');
  check('看板占位可见但隐藏无权会议标识与标题', hiddenBoard.rows.some(lane => lane.meetings.some(value => value.title === '忙碌时段' && value.eventId == null && value.detailsVisible === false)));
  const response = successful(await post(admin, `/oa/meeting/booking/${original.eventId}/respond`, { invitationVersion: original.scheduleVersion, acceptanceStatus: 'ACCEPTED' }), '受邀人接受会议');
  check('真实接受邀请不等于出席签到', response.acceptanceStatus === 'ACCEPTED' && response.attendStatus === 'NOT_CHECKED' && !response.checkInTime);
  reject(await post(employee, '/oa/meeting/booking', booking('buffer_inside', { startTime: `${date} 10:09:00`, endTime: `${date} 11:09:00` })), '会后缓冲内一分钟仍拒绝');
  const adjacent = successful(await post(outsider, '/oa/meeting/booking', booking('buffer_edge', { startTime: `${date} 10:10:00`, endTime: `${date} 11:10:00`, attendeeIds: [], expectedAttendees: 1 })), '十分钟缓冲边界预约');
  check('十分钟缓冲没有被双向扩大成二十分钟', adjacent.startTime === `${date} 10:10:00`);
  const changed = successful(await api(employee, `/oa/meeting/booking/${original.eventId}`, { method: 'PUT', body: booking('changed', { version: original.version, startTime: `${date} 13:00:00`, endTime: `${date} 14:00:00` }) }), '本人改期');
  const changedDetail = await detail(changed.eventId);
  check('改期邀请版本增加且原接受状态重置', changed.scheduleVersion === original.scheduleVersion + 1 && changedDetail.invitations.every(value => value.acceptanceStatus === 'NONE'));
  reject(await post(admin, `/oa/meeting/booking/${changed.eventId}/respond`, { invitationVersion: original.scheduleVersion, acceptanceStatus: 'TENTATIVE' }), '过期邀请版本拒绝');
  const raceRoom = await createRoom('race');
  const raced = await Promise.all([post(employee, '/oa/meeting/booking', booking('race_employee', { roomId: raceRoom.roomId, attendeeIds: [], expectedAttendees: 1 })), post(outsider, '/oa/meeting/booking', booking('race_hr', { roomId: raceRoom.roomId, attendeeIds: [], expectedAttendees: 1 }))]);
  check('真实HTTP并发抢同房间只有一份成功', raced.filter(value => value.status === 200 && value.body?.code === 200).length === 1
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE room_id=${raceRoom.roomId} AND status='PLANNED' AND deleted=0;`) === '1');
  const seriesCommand = booking('series', { roomId: null, attendeeIds: [], expectedAttendees: 1, startTime: `${date} 15:00:00`, endTime: `${date} 16:00:00`, recurrenceRule: 'FREQ=DAILY;COUNT=3', recurrenceEndDate: dayAfter(4) });
  const preview = successful(await post(employee, '/oa/meeting/series/preview', seriesCommand), '真实周期预览');
  check('真实服务按日历规则展开全部3个周期实例', preview.canSubmit && preview.changes.filter(value => value.action === 'CREATE').length === 3);
  const createdSeries = successful(await post(employee, '/oa/meeting/series', { ...seriesCommand, impactDigest: preview.impactDigest, confirmSeriesChanges: true }), '确认创建周期');
  check('周期主记录不产生会前邀请，3个实际实例各自生效', createdSeries.instances.length === 3 && createdSeries.series.recurrenceRole === 'SERIES'
    && database(`SELECT COUNT(*) FROM oa_meeting_attendance WHERE tenant_id=100000 AND schedule_event_id=${createdSeries.series.eventId};`) === '0');
  const cancelledInstance = successful(await post(employee, `/oa/meeting/booking/${createdSeries.instances[0].eventId}/cancel`, { version: createdSeries.instances[0].version, reason: '仅取消首次实例' }), '取消单个周期实例');
  check('取消单实例保留原发生时间且其余实例不变', cancelledInstance.originalStartTime === createdSeries.instances[0].originalStartTime
    && database(`SELECT COUNT(*) FROM oa_schedule_event WHERE parent_event_id=${createdSeries.series.eventId} AND status='PLANNED' AND deleted=0;`) === '2');
  const approvalRoom = await createRoom('approval', { needApprovalFlag: 1, approverId: guestId, openTime: null, closeTime: null, minBookingMinutes: 1 });
  const numberDate = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y%m%d');");
  const numberPrefix = `OAMEET${numberDate}`;
  const previousNumber = BigInt(database(`SELECT COALESCE(MAX(CAST(SUBSTRING(process_no,${numberPrefix.length + 1}) AS UNSIGNED)),0) FROM wf_process_instance WHERE tenant_id=100000 AND process_no LIKE ${quote(`${numberPrefix}%`)};`));
  const numberingRedis = await ownedGatewayRedis(state);
  const numberKey = `100000:sys:wf:pno:OAMEET:${numberDate}`;
  numberingRedis('DEL', numberKey);
  check('审批启动前清理自有隔离环境的编号缓存，不修改既有实例', numberingRedis('EXISTS', numberKey) === '0');
  const now = database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s');"); const later = database("SELECT DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:%i:%s');");
  const approval = successful(await post(employee, '/oa/meeting/booking', booking('approval', { roomId: approvalRoom.roomId, startTime: now, endTime: later })), '需要审批的真实预约');
  check('真实需批预约在PENDING独立审批状态占位', approval.status === 'PLANNED' && approval.approvalStatus === 'PENDING');
  reject(await post(employee, `/oa/meeting/booking/${approval.eventId}/state`, { version: approval.version, targetStatus: 'IN_PROGRESS' }), '未获批不能开始会议');
  const instanceId = await waitFor(() => database(`SELECT IFNULL(instance_id,'') FROM oa_schedule_event WHERE event_id=${approval.eventId};`), value => Boolean(value) && !value.startsWith('F:'), '等待实际审批流程启动并完成预约绑定');
  const restoredNumber = database(`SELECT process_no FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`);
  check('清理编号缓存后会议审批真实启动且编号接续数据库历史', restoredNumber.startsWith(numberPrefix) && BigInt(restoredNumber.slice(numberPrefix.length)) > previousNumber);
  const task = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instanceId)};`), values => values.length === 1, '等待独立审批人任务');
  check('工作流真实办理人是冻结的独立审批人', task[0].assignee === guestId);
  successful(await post(admin, '/workflow/wf/complete', { taskId: task[0].id, action: 'APPROVE', comment: `H4_${caseTag}真实批准` }), '真实审批通过');
  await waitFor(() => detail(approval.eventId), value => value.event.approvalStatus === 'APPROVED', '等待真实审批结果回调');
  const approved = (await detail(approval.eventId)).event;
  const started = successful(await post(employee, `/oa/meeting/booking/${approval.eventId}/state`, { version: approved.version, targetStatus: 'IN_PROGRESS' }), '批准后本人开始会议');
  check('真实通过后才进入会议进行中', started.status === 'IN_PROGRESS');
  reject(await post(admin, '/oa/meeting/booking', booking('self_approve', { roomId: approvalRoom.roomId, startTime: `${tomorrow} 09:00:00`, endTime: `${tomorrow} 10:00:00`, attendeeIds: [], expectedAttendees: 1 })), '发起人与唯一审批人相同拒绝自批');
  const actual = successful(await post(admin, '/oa/meeting/booking', booking('minutes', { roomId: null, startTime: database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s');"), endTime: later, attendeeIds: [hostId] })), '纪要关联的真实会议');
  successful(await post(employee, `/oa/meeting/booking/${actual.eventId}/respond`, { invitationVersion: actual.scheduleVersion, acceptanceStatus: 'ACCEPTED' }), '邀请本人回应独立会议');
  const occurred = successful(await post(admin, `/oa/meeting/booking/${actual.eventId}/state`, { version: actual.version, targetStatus: 'IN_PROGRESS' }), '实际会议开始');
  await verifyMeetingInterface({ admin, employee, outsider, api, successful, check, database, quote, date, dayAfter, room, changed, occurred, caseTag, directory });
  evidence.uiWorkflows = true;
  const minutesId = database(`SELECT id FROM oa_meeting_minutes WHERE tenant_id=100000 AND schedule_event_id=${actual.eventId} AND deleted=0;`); assert.match(minutesId, /^\d+$/);
  const invitations = successful(await api(admin, `/oa/meeting/minutes/${minutesId}/attendance`), '原纪要邀请签到行');
  check('真实纪要页面保存复用两份邀请而未另建签到行', invitations.length === 2 && invitations.every(value => String(value.scheduleEventId) === String(actual.eventId)));
  successful(await post(admin, '/oa/meeting/minutes/attendance', { minutesId, userId: hostId, attendStatus: 'ATTEND', checkInTime: now, acceptanceStatus: 'DECLINED' }), '真实登记签到');
  const attendance = successful(await api(admin, `/oa/meeting/minutes/${minutesId}/attendance`), '读取签到事实').find(value => String(value.userId) === hostId);
  check('签到接口未篡改原接受状态，实际出席独立保存', attendance.acceptanceStatus === 'ACCEPTED' && attendance.attendStatus === 'ATTEND' && attendance.checkInTime);
  successful(await post(admin, `/oa/meeting/minutes/${minutesId}/confirm`, {}), '原纪要真实确认');
  const note = successful(await api(admin, `/oa/meeting/minutes/${minutesId}`), '确认后的纪要');
  reject(await api(admin, '/oa/meeting/minutes', { method: 'PUT', body: { ...note, minutesContent: '不可覆盖的确认正文' } }), '确认纪要不能被普通编辑覆盖');
  check('纪要保存没有暗中增加会议或会议室预约', database(`SELECT COUNT(*) FROM oa_schedule_event WHERE title=${quote(actual.title)} AND tenant_id=100000;`) === '1');
  const notification = successful(await post(employee, '/oa/meeting/booking', booking('notifications', { roomId: null, reminders: [{ remindMinutesBefore: 43200, channelType: 'INTERNAL' }, { remindMinutesBefore: 43199, channelType: 'INTERNAL' }, { remindMinutesBefore: 43200, channelType: 'EMAIL' }] })), '创建多提醒实际预约');
  const trigger = async () => successful(await post(admin, '/auth/system/job/1951/trigger', {}), '触发真实集中会议提醒任务');
  await trigger();
  const sent = await waitFor(() => successfulResult(), values => values.filter(value => value.reminder.channelType === 'INTERNAL').every(value => value.reminder.sentFlag === 1)
    && values.some(value => value.reminder.channelType === 'EMAIL' && value.recipients.some(person => person.reason?.includes('未配置'))), '真实站内投递及外部未配置结果');
  async function successfulResult() { return successful(await api(employee, `/oa/meeting/booking/${notification.eventId}/delivery`), '读取真实通知明细'); }
  check('两组会前提醒及邀请通过真实消息事件投递到站内', sent.filter(value => value.reminder.channelType === 'INTERNAL' && value.reminder.sentFlag === 1).length === 3);
  check('未配置的邮件保留真实失败原因，不影响站内及预约', sent.filter(value => value.reminder.channelType === 'EMAIL').every(value => value.reminder.sentFlag === 0)
    && (await detail(notification.eventId)).event.status === 'PLANNED');
  const deliveredBefore = database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='OA_MEETING_NOTICE' AND biz_id IN(SELECT CAST(reminder_id AS CHAR) FROM oa_meeting_reminder WHERE event_id=${notification.eventId});`);
  await new Promise(resolve => setTimeout(resolve, 5200)); await trigger(); await new Promise(resolve => setTimeout(resolve, 1500));
  check('集中任务重复执行不重复生成同一通知消息', deliveredBefore === database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='OA_MEETING_NOTICE' AND biz_id IN(SELECT CAST(reminder_id AS CHAR) FROM oa_meeting_reminder WHERE event_id=${notification.eventId});`));
  if (state.smtpFixture?.loopback) {
    evidence.smtpProvider = 'owned_tls_fixture_attempted';
    const mailDirectory = await fs.realpath(path.join(directory, 'private', 'smtp')); assert.equal(mailDirectory, await fs.realpath(state.smtpFixture.directory));
    const channel = { channelType: 'EMAIL', channelCode: `h4_${caseTag}`, channelName: `H4_${caseTag}`, provider: 'SMTP', status: 'ENABLED', smtpHost: 'localhost', smtpPort: state.smtpFixture.port,
      smtpSslFlag: 0, smtpUsername: 'fixture-user', smtpPwd: 'fixture-password', fromAddress: 'sender@example.com', fromName: 'CloudFlow Meeting', priority: 1, rateLimitMinute: 1000, dailyLimit: 10000, retryCount: 2, retryIntervalSec: 120 };
    successful(await post(admin, '/auth/system/message/channel', channel), '配置隔离TLS邮件服务');
    const channelId = database(`SELECT channel_id FROM sys_message_channel WHERE tenant_id=100000 AND channel_code=${quote(channel.channelCode)} AND deleted=0;`);
    assert.match(channelId, /^\d+$/);
    check('本次邮件渠道通过真实TLS连接与认证', successful(await post(admin, `/auth/system/message/channel/${channelId}/test`, {}), '真实TLS渠道测试').success === true);
    check('配置真实协议服务后邮件状态可用', successful(await api(employee, '/oa/meeting/email-readiness'), '已配置邮件状态').ready);
    const mail = successful(await post(employee, '/oa/meeting/booking', booking('tls_email', { roomId: null, joinUrl: 'https://meeting.example.test/real', reminders: [{ remindMinutesBefore: 43200, channelType: 'EMAIL' }] })), '真实邮件会议');
    await new Promise(resolve => setTimeout(resolve, 5200)); await trigger();
    const mailResults = await waitFor(() => api(employee, `/oa/meeting/booking/${mail.eventId}/delivery`).then(value => successful(value, '邮件实际投递结果')),
      values => values.filter(value => value.reminder.channelType === 'EMAIL').length === 2 && values.filter(value => value.reminder.channelType === 'EMAIL').every(value => value.reminder.sentFlag === 1), '等待真实TLS邮件与结果事件');
    const snapshot = JSON.parse(await fs.readFile(path.join(mailDirectory, 'snapshot.json'), 'utf8'));
    const actualMessages = snapshot.messages.filter(message => message.subject.includes(mail.title));
    check('会议邀请和会前邮件经过真实TLS协议并取得逐人接纳事实', mailResults.filter(value => value.reminder.channelType === 'EMAIL').every(value => value.recipients.length === 2 && value.recipients.every(person => person.status === 'SENT' && person.acceptedTime))
      && actualMessages.length === 4);
    check('本次四封实际邮件均含对应会议标题及安全加入链接', actualMessages.every(message => message.body.includes(mail.title) && message.body.includes(mail.joinUrl)));
    evidence.smtpProvider = 'owned_tls_fixture';
  }
  check('完整会议真实链路未增加任何EMPLOYEE权限', beforeGrants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
  await verifyMeetingBoundaries({ admin, api, successful, session, database, check, caseTag, employee, outsider });
}
