import assert from 'node:assert/strict';

// Only an explicit, nondefault test calendar is used. Existing calendars and clock values are preserved.
export async function verifyB2WorkdayTimers({ admin, api, successful, database, check, caseTag, redis, evidence }) {
  const marker = 'B2WD' + caseTag, base = '/workflow/wf', holiday = '/auth/system/holiday';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (url, body) => api(admin, url, { method: 'POST', body });
  const dayMs = 86400000;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  assert.equal(database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d');"), today, 'Owned service dates must agree');
  const day = offset => new Date(Date.parse(today + 'T00:00:00Z') + offset * dayMs).toISOString().slice(0, 10);
  const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay();
  const future = Array.from({ length: 30 }, (_, index) => day(index + 1));
  const holidayDate = future.find(date => ![0, 6].includes(weekday(date)));
  const makeupDate = future.find(date => weekday(date) === 6);
  assert.ok(holidayDate && makeupDate && holidayDate !== makeupDate);
  const originalCalendars = () => database('SELECT tenant_id,calendar_id,calendar_code,default_flag,weekly_rest_days,status,deleted,version FROM sys_holiday_calendar WHERE calendar_code<>' + sql(marker) + ' ORDER BY tenant_id,calendar_id;');
  const calendarBefore = originalCalendars();
  const queues = [100000, 100001].map(tenant => tenant + ':sys:wf:timers');
  const indices = () => JSON.stringify(queues.map(key => [key, redis('ZRANGE', key, 0, -1, 'WITHSCORES')]));
  const indicesBefore = indices();
  const definitions = [], samples = [];
  let calendarId, formId, failure;
  const read = id => rows("SELECT JSON_OBJECT('status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const expected = amount => {
    let counted = 0, calendarDays = 0, skippedWeekends = 0, skippedHolidays = 0, makeupDays = 0;
    for (const date of future) {
      calendarDays++;
      if (date === holidayDate) skippedHolidays++;
      else if (date === makeupDate) { counted++; makeupDays++; }
      else if ([0, 6].includes(weekday(date))) skippedWeekends++;
      else counted++;
      if (counted === amount) return { date, calendarDays, skippedWeekends, skippedHolidays, makeupDays };
    }
    throw new Error('Insufficient owned calendar days');
  };
  const create = async amount => {
    const title = marker + '-' + amount;
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'timer', type: 'TIMER', title: '工作日等待',
      props: { timerType: 'DELAY', delayValue: amount, delayUnit: 'WORKDAY', calendarId, timerAction: 'AUTO_PASS' } }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-timer', source: 'start', target: 'timer' }, { id: 'timer-end', source: 'timer', target: 'end' }] };
    const saved = successful(await post(base + '/definition/save', { processKey: title, processName: title, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存工作日定时验证定义');
    const definition = saved.definitionId ?? saved.id; assert.ok(definition); definitions.push(definition);
    successful(await post(base + '/definition/deploy/' + definition), '发布工作日定时验证定义');
    const context = successful(await api(admin, base + '/draft/context/' + definition), '读取工作日定时发起上下文');
    const draft = successful(await post(base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash,
      title, formData: { note: marker }, nodeAssignees: {} }), '保存工作日定时草稿');
    const before = Date.now();
    const started = successful(await post(base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实发起工作日定时流程');
    const after = Date.now(), id = started.instanceId ?? started.processInstanceId;
    assert.ok(id); const sample = { id, amount }; samples.push(sample);
    const actual = read(id), waits = Object.values(actual.variables._wf_waits ?? {}).filter(item => item.kind === 'TIMER');
    assert.equal(waits.length, 1); const wait = waits[0], oracle = expected(amount), expiry = wait.payload.expireAt;
    sample.key = 'sys:wf:timer:' + id + ':timer:root:' + wait.waitId;
    check(amount + '个工作日的实际等待准确跨越日历例外', actual.status === 'PENDING'
      && new Date(expiry + 8 * 3600000).toISOString().slice(0, 10) === oracle.date
      && expiry - oracle.calendarDays * dayMs >= before && expiry - oracle.calendarDays * dayMs <= after
      && Number(redis('ZSCORE', queues[0], JSON.stringify(sample.key))) === expiry);
    const queried = successful(await api(admin, holiday + '/query/next-workday?' + new URLSearchParams({ calendarId, date: today, n: String(amount) })), '读取日历服务的实际工作日计算');
    check(amount + '个工作日的流程截止与日历服务一致', queried === oracle.date);
    if (amount === 8) check('实际等待同时跳过节假日和周末并计入调休工作日', oracle.skippedHolidays === 1 && oracle.skippedWeekends > 0 && oracle.makeupDays === 1);
    successful(await post('/workflow/enhance/instance/invalidate', { instanceId: id, reason: marker + '-finished-check' }), '通过正常接口收尾工作日验证流程');
    check(amount + '个工作日样本作废后清除定时索引', read(id).status === 'INVALIDATED'
      && redis('ZSCORE', queues[0], JSON.stringify(sample.key)) === '' && redis('EXISTS', '100000:' + sample.key) === '0');
    return { amount, ...oracle };
  };
  try {
    successful(await post(holiday + '/calendar', { calendarCode: marker, calendarName: marker, region: '隔离验证', defaultFlag: 0,
      weeklyRestDays: '6,7', workStartTime: '09:00:00', workEndTime: '18:00:00', lunchStartTime: '12:00:00', lunchEndTime: '13:00:00', status: 'ENABLED' }), '创建独占非默认日历');
    calendarId = database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND deleted=0 AND calendar_code=' + sql(marker) + ';');
    assert.match(calendarId, /^[1-9][0-9]*$/);
    const exceptions = [{ holidayDate, dateType: 'HOLIDAY', triplePayFlag: 1, holidayName: marker + '-holiday' },
      { holidayDate: makeupDate, dateType: 'WORKDAY', triplePayFlag: 0, holidayName: marker + '-makeup' }];
    for (const year of new Set(exceptions.map(item => Number(item.holidayDate.slice(0, 4)))))
      successful(await post(holiday + '/date/batch', { calendarId, yearNo: year, dates: exceptions.filter(item => Number(item.holidayDate.slice(0, 4)) === year) }), '通过正常日历入口保存自有例外');
    const form = successful(await post(base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立工作日验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const results = [];
    for (const amount of [1, 8]) results.push(await create(amount));
    evidence.workdayTimerDates = true;
    console.log('B2_WORKDAY_TIMERS_ACTUAL: ' + JSON.stringify({ workflows: samples.length, startDate: today, results,
      explicitOwnedCalendar: true, originalDefaultModified: false, clockChanges: 0, forcedWorkflowOutcomeWrites: 0, naturalMultiDayWait: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const sample of samples) if (['RUNNING', 'PENDING', 'PAUSED', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(read(sample.id).status))
        successful(await post(base + '/instance/terminate', { instanceId: sample.id, reason: marker + '-cleanup' }), '正常收尾自有工作日流程');
      for (const definition of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(definition) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      if (calendarId) {
        const current = successful(await api(admin, holiday + '/calendar/' + calendarId), '读取待停用的自有日历');
        assert.equal(current.calendarCode, marker); assert.equal(current.defaultFlag, 0);
        successful(await api(admin, holiday + '/calendar', { method: 'PUT', body: { ...current, status: 'DISABLED' } }), '停用已完成验证的自有日历');
      }
      check('工作日验证后原日历默认配置及定时队列保持', originalCalendars() === calendarBefore && indices() === indicesBefore
        && samples.every(sample => ['INVALIDATED', 'TERMINATED'].includes(read(sample.id).status)));
      evidence.workdayTimerRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Workday timer verification cleanup failed'); }
  }
  if (failure) throw failure;
}
