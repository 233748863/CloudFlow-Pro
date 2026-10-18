import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyHrAdvanceApproval } from './verify-hr-advance-approval-real.mjs';

export async function verifyWorkflowHAdvanceOffboard(context) {
  const { admin, api, successful, session, database, check, caseTag, secrets, evidence, redis, accounts } = context;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 150000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 400)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const rememberSession = async (...args) => {
    const page = await session(...args);
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, '')); return page;
  };
  const events = [], ownNames = [], helperEvidence = {};
  const leaseKey = event => {
    const digest = createHash('sha256');
    for (const value of ['cloudflow-event-consumer-group:cloudflow-service-workflow', '100000', event.id]) {
      const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeInt32BE(bytes.length); digest.update(size).update(bytes);
    }
    return 'cloudflow:event:idem:' + digest.digest('hex');
  };
  const eventFor = async (type, id) => {
    const event = await waitFor(() => rows("SELECT JSON_OBJECT('id',event_id,'payload',payload_json) FROM outbox_event WHERE tenant_id=100000 AND event_type=" + sql(type) + ' AND aggregate_id=' + id + ' ORDER BY id DESC LIMIT 1;')[0], Boolean, 'Actual H offboard event missing');
    if (!events.some(item => item.id === event.id)) events.push(event); return event;
  };
  const done = event => waitFor(() => redis('HGET', leaseKey(event), 'state'), value => value === 'DONE', 'Actual H offboard event unfinished');
  const disable = async identity => {
    if (!ownNames.includes(identity.username)) ownNames.push(identity.username);
    const current = successful(await api(admin, '/auth/system/user/' + identity.userId), '读取H离职专用账号');
    if (current.status !== '1') successful(await api(admin, '/auth/system/user', { method: 'PUT', body: {
      userId: identity.userId, userName: identity.username, nickName: current.nickName, deptId: current.deptId,
      status: '1', version: current.version, roleIds: current.roleIds,
    } }), '通过真实管理入口停用H离职专用账号');
    const event = await eventFor('USER_DISABLED', identity.userId); await done(event); return event;
  };
  const acknowledged = (stream, group, id, deleted) => waitFor(() => {
    const parts = redis('XINFO', 'GROUPS', stream).split(/\r?\n/), index = parts.indexOf(group); if (index < 0) return false;
    const end = parts.indexOf('name', index + 1), own = parts.slice(index, end < 0 ? undefined : end), last = own[own.indexOf('last-delivered-id') + 1];
    if (!last) return false;
    const a = last.split('-').map(BigInt), b = id.split('-').map(BigInt);
    return (a[0] > b[0] || a[0] === b[0] && a[1] >= b[1]) && redis('XPENDING', stream, group, id, id, 1) === '' && (!deleted || redis('XRANGE', stream, id, id) === '');
  }, Boolean, 'H offboard delivery acknowledgement missing');
  const task = id => rows("SELECT JSON_OBJECT('id',task_id,'owner',CAST(assignee AS CHAR),'name',assignee_name,'status',status,'version',lock_version,'from',CAST(disabled_from_user_id AS CHAR),'fromName',disabled_from_user_name,'releaseVersion',disabled_release_version,'event',disabled_release_event_id) FROM wf_task WHERE tenant_id=100000 AND task_id=" + sql(id) + ';')[0];
  const related = instance => database("SELECT SHA2(CAST(JSON_OBJECT('id',task_id,'owner',assignee_id,'name',assignee_name,'version',version,'action',action) AS CHAR),256) FROM wf_task_monitor WHERE tenant_id=100000 AND instance_id=" + sql(instance) + ' ORDER BY task_id;')
    + '\n' + database('SELECT COUNT(*) FROM wf_task_delegation WHERE tenant_id=100000 AND instance_id=' + sql(instance) + ';');
  const original = () => database("SELECT SHA2(CAST(JSON_OBJECT('id',t.task_id,'owner',t.assignee,'name',t.assignee_name,'status',t.status,'version',t.lock_version,'from',t.disabled_from_user_id,'fromName',t.disabled_from_user_name,'releaseVersion',t.disabled_release_version,'event',t.disabled_release_event_id) AS CHAR),256) FROM wf_task t LEFT JOIN wf_process_instance i ON i.tenant_id=t.tenant_id AND i.instance_id=t.instance_id WHERE i.process_def_key IS NULL OR i.process_def_key <> " + sql('h2ap_' + caseTag) + ' ORDER BY t.task_id;');
  const before = original(); let failure;
  try {
    await verifyHrAdvanceApproval({ ...context, evidence: helperEvidence, session: rememberSession, cleanupIdentity: disable,
      verifyFrozenOffboard: async setup => {
        const { marker, person, peerPerson, leaderPerson, financePerson, financePeerPerson, employee, peer, leader,
          main, started, first, create, submit, complete, loan, taskRows, read } = setup;
        const pending = [{ loanId: main, actor: employee, instance: started.instance }];
        try {
        const second = await create(peer, '100.00', 'offboard_finance');
        pending.push({ loanId: second, actor: peer });
        successful(await submit(peer, second), '另一员工通过真实借款入口提交财务离职场景');
        const secondLoan = await waitFor(() => loan(second), value => Boolean(value?.instance), 'Second actual advance did not start');
        pending[1].instance = secondLoan.instance;
        const managerTask = await waitFor(() => taskRows(secondLoan.instance), value => value.length === 1, 'Second manager task missing');
        successful(await complete(leader, managerTask[0]), '真实负责人审批后进入财务复核');
        const financeTasks = await waitFor(() => taskRows(secondLoan.instance), value => value.some(item => item.assignee === financePerson.userId), 'Actual finance stage missing');
        const hr = await rememberSession('g_holiday_hr');
        const cases = [
          { stage: 'manager', donor: leaderPerson, successor: peerPerson, targets: [person, peerPerson, financePerson], id: first.id, instance: started.instance, loanId: main, actor: employee },
          { stage: 'finance', donor: financePerson, successor: financePeerPerson, targets: [peerPerson, person, financePeerPerson], id: financeTasks.find(item => item.assignee === financePerson.userId).id, instance: secondLoan.instance, loanId: second, actor: peer },
        ];
        for (const item of cases) {
          const initialLoan = JSON.stringify(loan(item.loanId));
          const direct = task(item.id), directRelated = related(item.instance);
          assert.equal(direct.owner, item.donor.userId);
          const legacy = async target => {
            const stream = 'hr:stream:employee-left', group = 'group:workflow:hr-employee-left';
            const id = redis('XADD', stream, '*', 'userId', item.donor.userId, 'tenantId', '100000', 'employeeName', item.donor.username, 'successorUserId', target.userId);
            await acknowledged(stream, group, id, true);
          };
          for (const [index, target] of item.targets.entries()) {
            await legacy(target);
            check('借款' + item.stage + '直接归属拒绝离职替换目标' + (index + 1), JSON.stringify(task(item.id)) === JSON.stringify(direct) && related(item.instance) === directRelated && JSON.stringify(loan(item.loanId)) === initialLoan);
          }
          const disabled = await disable(item.donor), released = task(item.id), releasedRelated = related(item.instance);
          check('借款' + item.stage + '停用后真实释放并保存原审批归属', released.owner === null && released.status === 'TODO' && released.from === item.donor.userId
            && released.fromName === item.donor.username && released.releaseVersion === released.version && released.event === disabled.id);
          for (const [index, target] of item.targets.entries()) {
            await legacy(target);
            check('借款' + item.stage + '释放后拒绝离职替换目标' + (index + 1), JSON.stringify(task(item.id)) === JSON.stringify(released) && related(item.instance) === releasedRelated && JSON.stringify(loan(item.loanId)) === initialLoan);
          }
          const application = successful(await post(hr, '/hr/lifecycle/applications', { applicationNo: marker + '_' + item.stage,
            employeeId: item.donor.employeeId, type: 'RESIGNATION', status: 'DRAFT', effectiveDate: database('SELECT CURRENT_DATE;'), successorUserId: item.successor.userId, detailJson: { reason: marker } }), '人事创建冻结审批人真实离职申请');
          for (const action of ['submit', 'approve']) successful(await post(hr, '/hr/lifecycle/applications/' + application + '/' + action), '实际提交及审批冻结审批人离职');
          for (const handover of successful(await api(hr, '/hr/lifecycle/applications/' + application + '/tasks'), '读取实际离职交接任务')) successful(await post(hr, '/hr/lifecycle/tasks/' + handover.id + '/complete'), '实际办理冻结审批人离职交接');
          const approved = successful(await api(hr, '/hr/lifecycle/applications/' + application), '读取实际离职版本');
          successful(await post(hr, '/hr/lifecycle/applications/' + application + '/complete', { version: approved.version }), '人事实际完成冻结审批人离职');
          const offboard = await eventFor('EMPLOYEE_OFFBOARDED', item.donor.employeeId); await done(offboard);
          check('借款' + item.stage + '实际HR离职共享消费保留冻结待办及金额', JSON.stringify(task(item.id)) === JSON.stringify(released) && related(item.instance) === releasedRelated && JSON.stringify(loan(item.loanId)) === initialLoan);
          const nextPage = item.stage === 'manager' ? peer : setup.financePeer;
          const denied = await api(nextPage, '/workflow/wf/todo/' + item.id);
          check('借款' + item.stage + '离职接任人不能读取未获得的冻结待办', [400, 403, 404, 409, 422].includes(denied.status) && denied.body?.code !== 200);
          for (const event of [disabled, offboard]) {
            const id = redis('XADD', 'cloudflow:event:stream', '*', 'payload', event.payload);
            await acknowledged('cloudflow:event:stream', 'cloudflow-event-consumer-group:cloudflow-service-workflow', id, false);
          }
          check('借款' + item.stage + '重投原停用离职事件仍保留冻结归属来源', JSON.stringify(task(item.id)) === JSON.stringify(released) && related(item.instance) === releasedRelated && JSON.stringify(loan(item.loanId)) === initialLoan);
          successful(await post(item.actor, '/hr/advance/' + item.loanId + '/withdraw', { version: (await read(item.actor, item.loanId)).version, reason: marker }), '本人实际撤回无法继续原审批的专用借款');
          await waitFor(() => taskRows(item.instance), value => value.length === 0, 'Actual advance withdrawal did not finish workflow cancellation');
          check('借款' + item.stage + '撤回后无本金付款且冻结待办结束', loan(item.loanId).approval === 'CANCELLED' && loan(item.loanId).payment === null && loan(item.loanId).outstanding === '0.00' && taskRows(item.instance).length === 0);
        }
        evidence.hAdvanceDirect = true; evidence.hAdvanceReleased = true; evidence.hAdvanceHr = true; evidence.hAdvanceRepeat = true;
        console.log('A3_OFFBOARD_H_ADVANCE_ACTUAL: stages=2; direct_target_cases=6; released_target_cases=6; real_hr_applications=2; original_events_replayed=4; actual_business_withdrawals=2; all_h_business_types=false; forced_business_terminal_writes=0');
        } finally {
          for (const item of pending) {
            const current = loan(item.loanId);
            if (current?.approval === 'SUBMITTED') successful(await post(item.actor, '/hr/advance/' + item.loanId + '/withdraw', {
              version: (await read(item.actor, item.loanId)).version, reason: marker + '_cleanup',
            }), '失败收尾仍由申请人实际撤回专用借款');
            if (current?.instance) await waitFor(() => taskRows(current.instance), value => value.length === 0, 'Owned advance cleanup did not close workflow tasks');
          }
        }
      },
    });
  } catch (error) { failure = error; }
  finally {
    try {
      for (const event of events) await done(event);
      check('H借款离职专用配置角色恢复且原待办保持', helperEvidence.cleanup === true && original() === before);
      evidence.hAdvanceRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'H advance offboard verification or restoration failed'); }
    for (const username of ownNames) { const index = accounts.findIndex(item => item.username === username); if (index >= 0) accounts.splice(index, 1); }
  }
  if (failure) throw failure;
}
