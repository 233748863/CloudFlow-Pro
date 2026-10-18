import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyMeetingRecovery({ admin, api, successful, session, database, check, directory, caseTag, state }) {
  const employee = await session('g_holiday_employee');
  const redis = await ownedGatewayRedis(state);
  const quote = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
  const post = (page, route, body) => api(page, route, { method: 'POST', body });
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const eventually = async (read, predicate, label) => {
    const deadline = Date.now() + 90000; let current;
    do { current = await read(); if (predicate(current)) return current; await pause(350); } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(current)}`);
  };
  assert.equal(database('SELECT status FROM sys_job WHERE job_id=1951 AND tenant_id=100000;'), 'PAUSED', 'Owned meeting job must be manually triggered');
  const times = database("SELECT CONCAT(DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 2 DAY),'%Y-%m-%d %H:%i:%s'),',',DATE_FORMAT(DATE_ADD(NOW(),INTERVAL 49 HOUR),'%Y-%m-%d %H:%i:%s'));" ).split(',');
  const command = suffix => ({ title: `H4_RECOVERY_${caseTag}_${suffix}`, startTime: times[0], endTime: times[1], roomId: null,
    expectedAttendees: 2, attendeeIds: ['990000701'], reminders: [{ remindMinutesBefore: 43200, channelType: 'INTERNAL' }, { remindMinutesBefore: 43199, channelType: 'INTERNAL' }],
    draft: false, confirmParticipantConflicts: true, timezoneId: 'Asia/Shanghai' });
  const create = async suffix => successful(await post(employee, '/oa/meeting/booking', command(suffix)), '真实保存恢复验收会议');
  const trigger = async page => {
    const execution = successful(await post(page, '/auth/system/job/1951/trigger', {}), '真实集中会议提醒任务');
    assert.equal(execution.accepted, true);
    assert.match(execution.executeNo, /^[a-f0-9-]+$/i);
    const result = await eventually(() => database(`SELECT execute_status FROM sys_job_log WHERE execute_no=${quote(execution.executeNo)};`), value => value && !['PENDING', 'RUNNING'].includes(value), '等待真实提醒任务执行');
    assert.equal(result, 'SUCCESS');
  };
  const details = async (page, event) => successful(await api(page, `/oa/meeting/booking/${event.eventId}/delivery`), '读取恢复前后逐人投递事实');
  const delivered = values => values.length === 3 && values.every(value => value.reminder.sentFlag === 1 && value.recipients.length === 2 && value.recipients.every(person => person.status === 'SENT' && person.acceptedTime));
  const recordCount = event => database(`SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='OA_MEETING_NOTICE' AND biz_id IN(SELECT CAST(reminder_id AS CHAR) FROM oa_meeting_reminder WHERE event_id=${event.eventId});`);
  const sent = await create('SENT');
  await trigger(admin);
  await eventually(() => details(employee, sent), delivered, '恢复前邀请及两组提醒取得真实接纳');
  check('恢复前实际站内邀请及两组提醒均已向两人投递', recordCount(sent) === '6');
  const pending = await create('PENDING');
  const original = await create('RESCHEDULED');
  const changed = successful(await api(employee, `/oa/meeting/booking/${original.eventId}`, { method: 'PUT', body: { ...command('CHANGED'), version: original.version } }), '恢复前真实修改会议版本');
  const cancelled = await create('CANCELLED');
  successful(await post(employee, `/oa/meeting/booking/${cancelled.eventId}/cancel`, { version: cancelled.version, reason: '缓存恢复不得复活已取消提醒' }), '恢复前真实取消会议');
  check('恢复前未来通知仍保存在数据库，尚未伪报发送', database(`SELECT COUNT(*) FROM oa_meeting_reminder WHERE event_id=${pending.eventId} AND status='PENDING' AND sent_flag=0;`) === '3' && recordCount(pending) === '0');
  const ids = [sent, pending, original, cancelled].map(event => event.eventId);
  for (const id of ids) assert.match(String(id), /^\d+$/);
  const snapshot = () => database(`SELECT JSON_OBJECT('id',reminder_id,'event',event_id,'version',schedule_version,'key',event_key,'due',due_time,'status',status,'sent',sent_flag,'time',send_time) FROM oa_meeting_reminder WHERE event_id IN(${ids.join(',')}) ORDER BY reminder_id;`);
  const before = snapshot();
  const grants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const control = (name, action) => {
    const log = path.join(directory, `h4-cache-${caseTag}-${name}-${action.toLowerCase()}.log`);
    const output = openSync(log, 'a');
    try {
      const result = spawnSync('pwsh.exe', ['-NoProfile', '-File', path.join(scripts, 'control-batch-g-service.ps1'), '-StatePath', path.join(directory, 'state.json'), '-ServiceName', name, '-Action', action],
        { stdio: ['ignore', output, output], timeout: 300000, windowsHide: true });
      assert.ok(!result.error && result.status === 0, `Owned ${name} ${action} failed; inspect ${log}`);
    } finally { closeSync(output); }
  };
  const services = ['auth', 'oa', 'crm', 'workflow', 'gateway'];
  assert.deepEqual(state.services.map(service => service.name).sort(), [...services].sort(), 'Restart only the five owned integration services');
  const stopped = new Set();
  try {
    for (const name of [...services].reverse()) { control(name, 'Stop'); stopped.add(name); }
    const keys = redis('--scan').split(/\r?\n/).filter(Boolean);
    const streams = new Map(); const cache = [];
    for (const key of keys) {
      const type = redis('TYPE', key);
      if (type === 'stream') streams.set(key, redis('XLEN', key));
      else if (type !== 'none') cache.push(key);
    }
    assert.ok(cache.length > 0 && streams.size > 0, 'Real cache keys and durable event transport streams must exist');
    let removed = 0;
    for (let index = 0; index < cache.length; index += 100) removed += Number(redis('DEL', ...cache.slice(index, index + 100)));
    const remaining = redis('--scan').split(/\r?\n/).filter(Boolean);
    check(`隔离Redis实际清理缓存键${removed}个，保留事件队列${streams.size}个`, removed > 0 && remaining.length === streams.size
      && [...streams].every(([key, length]) => redis('TYPE', key) === 'stream' && redis('XLEN', key) === length));
    check('缓存清理没有更改任何会议提醒及实际发送事实', snapshot() === before);
    console.log(`H4_CACHE_RESET: deleted_cache_keys=${removed}; retained_event_streams=${streams.size}; stream_deleted=0; redis_database=0; flushdb=false; owned_loopback=true; production_modified=false`);
  } finally {
    const failures = [];
    for (const name of services) if (stopped.has(name)) {
      try { control(name, 'Start'); stopped.delete(name); }
      catch (failure) { failures.push(failure); }
    }
    if (failures.length) throw new AggregateError(failures, 'Owned integration service recovery failed; retained service logs identify each failure');
  }
  const refreshed = JSON.parse((await fs.readFile(path.join(directory, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
  for (const service of refreshed.services) {
    const health = await fetch(`http://127.0.0.1:${service.healthPort}/actuator/health`).then(response => response.json());
    check(`清理缓存后隔离${service.name}真实重启且健康`, health.status === 'UP');
  }
  const freshAdmin = await session('g_import_admin'); const freshEmployee = await session('g_holiday_employee');
  check('重启后仍保留完整数据库提醒事实', snapshot() === before);
  await trigger(freshAdmin);
  await eventually(() => details(freshEmployee, pending), delivered, '按数据库恢复尚未投递的会议提醒');
  await eventually(() => details(freshEmployee, changed), values => delivered(values.filter(value => value.reminder.scheduleVersion === changed.scheduleVersion)), '恢复当前版本通知');
  await eventually(() => details(freshEmployee, cancelled), values => {
    const current = values.filter(value => value.reminder.status !== 'CANCELLED');
    return current.length > 0 && current.every(value => value.reminder.sentFlag === 1);
  }, '等待取消通知取得最终投递结果');
  check('真实重启及缓存清理后从数据库补发六条站内通知', recordCount(pending) === '6');
  check('改期前旧版本和已取消的会前提醒没有恢复发送', database(`SELECT COUNT(*) FROM sys_message_record message JOIN oa_meeting_reminder reminder ON message.biz_id=CAST(reminder.reminder_id AS CHAR) AND message.biz_type='OA_MEETING_NOTICE' WHERE (reminder.event_id=${original.eventId} AND reminder.schedule_version=${original.scheduleVersion}) OR (reminder.event_id=${cancelled.eventId} AND reminder.event_key LIKE '%:REMINDER:%');`) === '0');
  const after = [sent, pending, original, cancelled].map(recordCount).join(',');
  await pause(5200); await trigger(freshAdmin); await pause(2000);
  check('重启和重复集中调度不重复发送任何已接纳会议通知', recordCount(sent) === '6' && [sent, pending, original, cancelled].map(recordCount).join(',') === after);
  check('缓存清理及真实重启没有增加员工任何授权', grants === database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'));
  console.log('H4_MEETING_RECOVERY: real_mysql=true; real_redis_cache_clear=true; retained_event_transport=true; real_service_restarts=5; real_http=true; database_reminders_recovered=true; duplicate_delivery=0; production_modified=false');
}
