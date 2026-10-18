import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Fault only a newly created request in the owned MySQL runtime. Approvals,
// failure recording, retry and both schedule inserts use the real services.
export async function verifyHrShiftRollback(context) {
  const { fixture, database, jsonRows, sqlText, check, ok, call, save, journal, until,
    createRequest, approveRequest, bindWorkflow, employeeId, sourceAssignments, note, caseTag } = context;
  const endpoint = '/hr/attendance/shift-requests';
  const state = fixture.shiftRollback = { passed: false, restored: false, cases: [], interfaceDoubles: 0 };
  context.evidence.shiftRollback = state;
  const digest = value => createHash('sha256').update(value).digest('hex');
  const triggers = () => database("SELECT trigger_name,SHA2(CONCAT_WS('|',event_manipulation,event_object_table,action_timing,action_statement,sql_mode,definer),256) FROM information_schema.triggers WHERE trigger_schema=DATABASE() ORDER BY trigger_name;");
  const consumers = () => database('SELECT NAME,ENABLED FROM performance_schema.setup_consumers ORDER BY NAME;');
  const historySetting = () => database("SELECT ENABLED FROM performance_schema.setup_consumers WHERE NAME='events_statements_history_long';");
  const originalTriggers = triggers(), originalConsumers = consumers(), originalHistory = historySetting();
  check('调班故障诊断使用既有MySQL性能记录能力', ['YES', 'NO'].includes(originalHistory)
    && database("SELECT COUNT(*) FROM performance_schema.setup_instruments WHERE NAME IN ('statement/sql/insert','statement/sql/update') AND ENABLED='YES';") === '2');
  const originalSchedules = excluded => database(`SELECT * FROM hr_schedule_assignment WHERE tenant_id=100000
    AND target_type='EMPLOYEE' AND target_id IN (${sqlText(employeeId('employee'))},${sqlText(employeeId('peer'))})
    ${excluded ? `AND (source_shift_request_id IS NULL OR source_shift_request_id<>${sqlText(excluded)})` : ''} ORDER BY id;`);
  const frozen = id => database(`SELECT SHA2(CAST(JSON_ARRAY(tenant_id,employee_id,swap_employee_id,dept_id,
    from_date,to_date,from_shift_id,to_shift_id,from_rule_id,to_rule_id,request_mode,peer_acceptance_status,peer_responded_by,
    minimum_rest_minutes,schedule_snapshot,instance_id) AS CHAR),256) FROM hr_shift_request WHERE tenant_id=100000 AND request_id=${sqlText(id)};`);
  const auditCount = (id, action) => Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000
    AND business_domain='HR_SHIFT_REQUEST' AND business_id=${sqlText(id)} AND operation_type=${sqlText(action)};`));
  const restoreHistory = () => {
    if (originalHistory !== 'YES') {
      check('恢复诊断开关前确认仍为本轮设置', historySetting() === 'YES');
      database("UPDATE performance_schema.setup_consumers SET ENABLED='NO' WHERE NAME='events_statements_history_long' AND ENABLED='YES';");
    }
    check('调班故障后全部诊断开关恢复原值', consumers() === originalConsumers);
  };
  let historyTouched = false, failure;
  try {
    state.originalHistory = originalHistory;
    state.originalTriggerHash = digest(originalTriggers);
    journal('shift-rollback-prepared', { originalHistory, originalTriggerHash: state.originalTriggerHash });
    historyTouched = true;
    if (originalHistory !== 'YES') database("UPDATE performance_schema.setup_consumers SET ENABLED='YES' WHERE NAME='events_statements_history_long' AND ENABLED='NO';");
    check('仅临时启用独立环境的SQL失败历史', historySetting() === 'YES');
    for (const [stage, date, width] of [['second', '2026-10-23', 1440], ['finish', '2026-10-26', 320]]) {
      const sample = { stage, date, width, passed: false, triggerRemoved: false, images: [] };
      state.cases.push(sample); await save();
      let caseFailure, removeTrigger = () => {}, triggerOwned = false;
      try {
      const input = { requestMode: 'SWAP', attendanceDate: date, swapEmployeeId: employeeId('peer'), reason: note };
      const preview = await ok('employee', endpoint + '/preview', 'POST', input);
      check('故障样本原班次和休息间隔有效 ' + stage, preview.blockers.length === 0 && preview.beforeSlots.length === 2 && preview.afterSlots.length === 2);
      let request = await createRequest('shift-rollback-' + stage, endpoint, input);
      sample.requestId = String(request.requestId);
      request = await ok('employee', `${endpoint}/${sample.requestId}/submit`, 'POST', { version: request.version });
      check('故障样本仍须等待对方本人同意 ' + stage, request.status === 'WAITING_ACCEPTANCE');
      await ok('peer', `${endpoint}/${sample.requestId}/respond`, 'POST', { version: request.version, decision: 'ACCEPTED', note });
      request = await bindWorkflow(endpoint, sample.requestId, 'shift');
      sample.instanceId = request.instanceId;
      const before = originalSchedules(), beforeFrozen = frozen(sample.requestId);
      sample.beforeSchedulesHash = digest(before); sample.frozenHash = beforeFrozen;
      check('安装故障前不存在当前申请来源排班 ' + stage, sourceAssignments(sample.requestId).length === 0);
      const triggerName = `h2_shift_${caseTag}_${stage}`;
      const table = stage === 'second' ? 'hr_schedule_assignment' : 'hr_shift_request';
      const event = stage === 'second' ? 'INSERT' : 'UPDATE';
      const intended = `H2_SHIFT_${stage.toUpperCase()}_${caseTag}`;
      const guard = stage === 'second'
        ? `NEW.tenant_id=100000 AND NEW.source_shift_request_id=${sample.requestId} AND NEW.target_type='EMPLOYEE' AND NEW.target_id=${employeeId('peer')}`
        : `NEW.tenant_id=100000 AND NEW.request_id=${sample.requestId} AND OLD.status='APPROVED' AND NEW.application_status='APPLIED'`;
      const expectedRows = stage === 'second' ? 1 : 2;
      const body = `BEGIN IF ${guard} THEN IF (SELECT COUNT(*) FROM hr_schedule_assignment WHERE tenant_id=100000 AND source_shift_request_id=${sample.requestId})=${expectedRows} THEN SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1644, MESSAGE_TEXT='${intended}'; ELSE SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1644, MESSAGE_TEXT='${intended}_PRECONDITION'; END IF; END IF; END`;
      const observedTrigger = () => jsonRows(`SELECT JSON_OBJECT('table',event_object_table,'event',event_manipulation,'timing',action_timing,'body',action_statement)
        FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=${sqlText(triggerName)};`);
      removeTrigger = () => {
        const observed = observedTrigger();
        if (observed.length) {
          check('只移除定义仍完全相符的本轮故障 ' + stage, triggerOwned && observed.length === 1 && observed[0].table === table
            && observed[0].event === event && observed[0].timing === 'BEFORE' && observed[0].body === body);
          database('DROP TRIGGER ' + triggerName + ';');
        }
        check('本轮故障已移除且原触发器全部保持 ' + stage, observedTrigger().length === 0 && triggers() === originalTriggers);
        sample.triggerRemoved = true;
        journal('shift-rollback-trigger-removed', { requestId: sample.requestId, triggerName });
      };
        check('本轮故障名称未占用 ' + stage, observedTrigger().length === 0);
        sample.triggerName = triggerName; sample.triggerBodyHash = digest(body);
        journal('shift-rollback-trigger-creating', { requestId: sample.requestId, triggerName, table, event, bodyHash: sample.triggerBodyHash });
        await save();
        triggerOwned = true;
        database(`DELIMITER $$\nCREATE TRIGGER ${triggerName} BEFORE ${event} ON ${table} FOR EACH ROW ${body}$$\nDELIMITER ;\n`);
        check('故障确已安装且仅匹配本轮申请 ' + stage, observedTrigger().length === 1 && observedTrigger()[0].body === body);
        await approveRequest(endpoint, sample.requestId, 'shift');
        const failed = await until(() => ok('employee', `${endpoint}/${sample.requestId}`), value => ['FAILED', 'APPLIED'].includes(value.applicationStatus), '等待真实调班故障终态');
        const faults = jsonRows(`SELECT JSON_OBJECT('threadId',CAST(THREAD_ID AS CHAR),'eventId',CAST(EVENT_ID AS CHAR),'error',MYSQL_ERRNO,
          'sqlState',RETURNED_SQLSTATE,'message',MESSAGE_TEXT,'statementEvent',EVENT_NAME) FROM performance_schema.events_statements_history_long
          WHERE CURRENT_SCHEMA='cloud_flow_db' AND MYSQL_ERRNO=1644 AND RETURNED_SQLSTATE='45000' AND MESSAGE_TEXT=${sqlText(intended)}
          AND LOWER(SQL_TEXT) LIKE ${sqlText('%' + table + '%')} AND EVENT_NAME=${sqlText('statement/sql/' + event.toLowerCase())} ORDER BY THREAD_ID,EVENT_ID;`);
        check('实际服务连接命中指定写入故障且前置排班已存在 ' + stage, faults.length === 1);
        sample.faults = faults; sample.writesSeenBeforeFault = expectedRows;
        check('中途写入失败保留批准决定且不假报已应用 ' + stage, failed.status === 'APPROVED'
          && failed.applicationStatus === 'FAILED' && failed.lastErrorCode === 'SHIFT_APPLY_FAILED' && !failed.appliedTime);
        check('中途写入失败不残留单方排班且冻结依据保持 ' + stage, sourceAssignments(sample.requestId).length === 0
          && originalSchedules() === before && frozen(sample.requestId) === beforeFrozen);
        const afterPreview = await ok('employee', endpoint + '/preview', 'POST', input);
        check('失败后双方实际有效班次仍等于原班次 ' + stage, JSON.stringify(afterPreview.beforeSlots) === JSON.stringify(preview.beforeSlots)
          && JSON.stringify(afterPreview.afterSlots) === JSON.stringify(preview.afterSlots) && afterPreview.blockers.length === 0);
        check('失败只留一条失败审计且没有成功审计 ' + stage, auditCount(sample.requestId, 'APPLICATION_FAILED') === 1 && auditCount(sample.requestId, 'APPLIED') === 0);
        for (const actor of ['employee', 'peer']) {
          const denied = await call(actor, `${endpoint}/${sample.requestId}/application/retry`, 'POST', { version: failed.version, reason: note });
          check('普通参与人不能越权重试排班 ' + stage + '/' + actor, denied.status === 403 && [403, 'FORBIDDEN'].includes(denied.body?.code));
        }
        check('越权请求未修改失败版本或来源 ' + stage, (await ok('employee', `${endpoint}/${sample.requestId}`)).version === failed.version && sourceAssignments(sample.requestId).length === 0);
        sample.failedVersion = failed.version; sample.rolledBack = true; await save();
        removeTrigger();
        await retryFromPage(context, sample, failed, async () => {
          const applied = await until(() => ok('employee', `${endpoint}/${sample.requestId}`), value => ['APPLIED', 'FAILED'].includes(value.applicationStatus), '等待真实重试完成');
          check('排除故障后按原审批及快照完整应用 ' + stage, applied.status === 'APPROVED' && applied.applicationStatus === 'APPLIED'
            && applied.instanceId === sample.instanceId && frozen(sample.requestId) === beforeFrozen && !applied.lastErrorCode && Boolean(applied.appliedTime));
          sample.appliedVersion = applied.version;
          return applied;
        });
        const sources = sourceAssignments(sample.requestId);
        check('重试后所有此前排班完整列保持 ' + stage, originalSchedules(sample.requestId) === before);
        sample.originalSchedulesKept = true;
        check('重试后双方仅各产生一条申请当日排班 ' + stage, sources.length === 2
          && sources.every(row => row.date === date && row.start === date && row.end === date && row.status === 'PUBLISHED')
          && sources.some(row => row.employeeId === employeeId('employee') && row.shiftId === fixture.ids['shift-early'] && row.ruleId === fixture.ids['rule-early'])
          && sources.some(row => row.employeeId === employeeId('peer') && row.shiftId === fixture.ids['shift-day'] && row.ruleId === fixture.ids['rule-day']));
        const final = await ok('admin', `${endpoint}/${sample.requestId}`);
        const duplicate = await call('admin', `${endpoint}/${sample.requestId}/application/retry`, 'POST', { version: final.version, reason: note });
        check('完成后拒绝重复重试且不再次写排班 ' + stage, duplicate.body?.code === 'RETRY_NOT_ALLOWED'
          && JSON.stringify(sourceAssignments(sample.requestId)) === JSON.stringify(sources) && auditCount(sample.requestId, 'APPLIED') === 1
          && auditCount(sample.requestId, 'APPLICATION_FAILED') === 1 && auditCount(sample.requestId, 'RETRY') === 1);
        sample.assignments = sources; sample.passed = true;
      } catch (error) { caseFailure = error; }
      finally {
        try { removeTrigger(); } catch (error) { caseFailure = new AggregateError([caseFailure, error].filter(Boolean), 'Owned shift fault cleanup failed'); }
        try {
          sample.requestId ||= fixture.requests['shift-rollback-' + stage]?.requestId;
          if (sample.requestId) {
            let current = await ok('admin', `${endpoint}/${sample.requestId}`);
            if (caseFailure && ['DRAFT', 'WAITING_ACCEPTANCE', 'PENDING', 'APPROVING'].includes(current.status)) {
              journal('shift-rollback-cancel-prepared', { requestId: sample.requestId, version: current.version });
              current = await ok('employee', `${endpoint}/${sample.requestId}/cancel`, 'POST', { version: current.version, reason: note });
              sample.recoveryAction = 'CANCEL_UNAPPROVED';
              check('未终审故障样本经真实接口撤回且无来源排班 ' + stage, current.status === 'CANCELLED' && sourceAssignments(sample.requestId).length === 0);
            }
            if (current.status === 'APPROVED' && current.applicationStatus === 'PENDING') {
              current = await until(() => ok('admin', `${endpoint}/${sample.requestId}`), value => ['FAILED', 'APPLIED'].includes(value.applicationStatus), '故障收尾等待应用终态');
            }
            if (caseFailure && sample.triggerRemoved && current.status === 'APPROVED' && current.applicationStatus === 'FAILED') {
              journal('shift-rollback-recovery-retry-prepared', { requestId: sample.requestId, version: current.version });
              await ok('admin', `${endpoint}/${sample.requestId}/application/retry`, 'POST', { version: current.version, reason: note });
              sample.recoveryAction = 'RETRY_APPROVED';
              current = await until(() => ok('admin', `${endpoint}/${sample.requestId}`), value => ['FAILED', 'APPLIED'].includes(value.applicationStatus), '故障收尾真实重试');
              check('批准样本异常收尾按原审批完成双方应用 ' + stage, current.applicationStatus === 'APPLIED' && sourceAssignments(sample.requestId).length === 2);
            }
            sample.finalStatus = current.applicationStatus;
            sample.finalApprovalStatus = current.status;
            journal('shift-rollback-case-settled', { requestId: sample.requestId, status: current.status, applicationStatus: current.applicationStatus, recoveryAction: sample.recoveryAction || null });
          }
        } catch (error) { caseFailure = new AggregateError([caseFailure, error].filter(Boolean), 'Shift business cleanup failed'); }
        await save();
      }
      if (caseFailure) throw caseFailure;
    }
    state.passed = true;
  } catch (error) { failure = error; }
  finally {
    if (historyTouched) {
      try { restoreHistory(); } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Shift diagnosis restoration failed'); }
    }
    state.restored = triggers() === originalTriggers && consumers() === originalConsumers;
    state.finalTriggerHash = digest(triggers());
    await save();
    journal('shift-rollback-restored', { passed: state.passed, restored: state.restored, cases: state.cases.length });
  }
  if (failure) throw failure;
  check('两类调班故障均完成真实回滚重试并恢复诊断环境', state.passed && state.restored && state.cases.length === 2);
  fixture.completed['shift-rollback'] = true;
  context.evidence.shiftRollback = state;
  await save();
}

async function retryFromPage(context, sample, failed, awaitApplied) {
  const { sessions, directory, caseTag, check, note, save } = context;
  const page = sessions.admin.page, requestPath = `/api/hr/attendance/shift-requests/${sample.requestId}/application/retry`;
  const images = path.join(directory, 'h2-shift-rollback-ui-' + caseTag);
  await fs.mkdir(images, { recursive: true });
  const posts = [], errors = [];
  const onRequest = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === requestPath) posts.push(request.postDataJSON()); };
  const onError = error => errors.push(error.message);
  page.on('request', onRequest); page.on('pageerror', onError);
  const capture = async (phase, dialog) => {
    await page.locator('.cf-toast-viewport').waitFor({ state: 'hidden', timeout: 15000 });
    await dialog.evaluate(async element => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      await Promise.all(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
        .map(animation => animation.finished.catch(() => {})));
    });
    const layout = await dialog.evaluate(element => {
      const title = element.querySelector('.modal-title'), close = element.querySelector('[aria-label="关闭弹窗"]'), range = document.createRange();
      range.selectNodeContents(title);
      return { documentWidth: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
        titleRight: Math.max(...[...range.getClientRects()].map(rect => rect.right)), closeLeft: close.getBoundingClientRect().left,
        controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),textarea')].filter(control => control.getClientRects().length)
          .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) };
    });
    check('调班故障页面不溢出且完整标题避开关闭按钮 ' + sample.stage + '/' + phase, layout.documentWidth <= sample.width
      && layout.content <= layout.available + 1 && layout.titleRight < layout.closeLeft);
    if (sample.width === 320) check('调班故障手机操作区至少44像素 ' + phase, layout.controls.every(item => item.width >= 44 && item.height >= 44));
    const file = path.join(images, `${sample.stage}-${phase}-${sample.width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    sample.images.push({ name: path.relative(directory, file), width: sample.width, phase, layout });
  };
  try {
    await page.setViewportSize({ width: sample.width, height: 1100 });
    const url = `${new URL(page.url()).origin}/hr/shift-requests?id=${sample.requestId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const detail = page.getByRole('dialog', { name: /调班详情$/ });
    await detail.getByText('审批已通过，排班尚未应用成功；当前不能视为已经调班。重试保留原排班依据，来源变化时必须重新处理。', { exact: true }).waitFor();
    await detail.getByRole('button', { name: '重试原排班应用', exact: true }).scrollIntoViewIfNeeded();
    await capture('failed', detail);
    await detail.getByRole('button', { name: '重试原排班应用', exact: true }).click();
    const form = page.getByRole('dialog', { name: '确认重试排班应用', exact: true });
    const submit = form.getByRole('button', { name: '确认提交', exact: true });
    await form.getByLabel('重试原因').fill(note);
    check('重试原排班必须明确确认完整应用双方 ' + sample.stage, await submit.isDisabled());
    await form.getByRole('checkbox').check();
    await capture('retry-form', form);
    await submit.click();
    await form.waitFor({ state: 'hidden' });
    await awaitApplied();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await detail.getByText('已应用', { exact: true }).waitFor();
    check('应用成功后页面不再允许重试 ' + sample.stage, await detail.getByRole('button', { name: '重试原排班应用', exact: true }).count() === 0);
    await capture('applied', detail);
    check('真实重试页面只提交一次原版本及原因 ' + sample.stage, posts.length === 1 && posts[0].version === failed.version && posts[0].reason === note
      && Object.keys(posts[0]).sort().join(',') === 'reason,version' && errors.length === 0);
    sample.ui = { passed: true, posts, errors: errors.length };
  } finally { page.off('request', onRequest); page.off('pageerror', onError); await save(); }
}
