import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyF3ProjectTasks } from './verify-f3-project-tasks.mjs';
import { verifyF3ProjectTimesheets } from './verify-f3-project-timesheets.mjs';
import { verifyF3ProjectAccounting } from './verify-f3-project-accounting.mjs';
import { verifyF3ProjectInterface } from './verify-f3-project-ui.mjs';

export async function verifyF3Projects(context) {
  const { admin, api: executeApi, successful, session, database, check, directory, caseTag, state, evidence } = context;
  assert.equal(state.verification?.mode, 'F3_PROJECTS_INDEPENDENT');
  const marker = 'F3_' + caseTag;
  const quote = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, timeout = 90000) => {
    const deadline = Date.now() + timeout;
    do {
      const value = await read();
      if (accept(value)) return value;
      await sleep(250);
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const text = String(value);
    assert.match(text, /^-?\d+(?:\.\d{1,2})?$/);
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
    return (negative ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  };
  const lastPosts = new WeakMap();
  const api = async (page, target, options = {}) => {
    const result = await executeApi(page, target, options);
    if (String(options.method || 'GET').toUpperCase() === 'POST') {
      const history = lastPosts.get(page) || new Map();
      lastPosts.set(page, history);
      history.set(target + ':' + JSON.stringify(options.body || {}), Date.now());
    }
    return result;
  };
  const get = async (target, page = admin) => successful(await api(page, target), target);
  const post = async (target, body = {}, page = admin) => {
    const history = lastPosts.get(page) || new Map();
    lastPosts.set(page, history);
    const key = target + ':' + JSON.stringify(body);
    const delay = 5200 - (Date.now() - (history.get(key) || 0));
    if (delay > 0) await sleep(delay);
    const result = await api(page, target, { method: 'POST', body });
    return successful(result, target);
  };
  const put = async (target, body, page = admin) => successful(await api(page, target, { method: 'PUT', body }), target);
  const remove = async (target, page = admin) => successful(await api(page, target, { method: 'DELETE' }), target);
  const reject = (result, label, expectedMessage) => check(label,
    ([400, 401, 403, 404, 409].includes(result.status)
      || result.status === 200 && [400, 401, 403, 404, 409].includes(result.body?.code))
    && (expectedMessage == null || result.body?.msg === expectedMessage));
  const today = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d');");
  const shifted = amount => {
    assert.ok(Number.isInteger(amount));
    return database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} DAY),'%Y-%m-%d');`);
  };
  const week = rows("SELECT JSON_OBJECT('start',DATE_FORMAT(DATE_SUB(CURRENT_DATE,INTERVAL WEEKDAY(CURRENT_DATE) DAY),'%Y-%m-%d'), 'end',DATE_FORMAT(DATE_ADD(DATE_SUB(CURRENT_DATE,INTERVAL WEEKDAY(CURRENT_DATE) DAY),INTERVAL 6 DAY),'%Y-%m-%d'));")[0];
  const manager = await session('g_import_other');
  const employee = await session('g_holiday_employee');
  const outsider = await session('g_import_tenant');
  const readonly = await session('g_import_readonly');
  const secretPath = path.join(directory, 'private/h3-core-secrets.json');
  const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
  const remember = async value => {
    if (value) secrets.add(value);
    await fs.writeFile(secretPath, JSON.stringify([...secrets]));
  };
  for (const page of [admin, manager, employee, outsider, readonly]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token);
    await remember(token.replace(/^Bearer /, ''));
  }
  const people = new Map([['990000701', admin], ['990000702', manager]]);
  const completeWorkflow = async (instance, decision = 'APPROVE', options = {}) => {
    const completed = new Set();
    const actualApprovers = new Set();
    for (let round = 0; round < 16; round++) {
      const pending = await waitFor(() => ({
        tasks: rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'candidateRoles',candidate_roles)
          FROM wf_task WHERE tenant_id=100000 AND instance_id=${quote(instance)} AND status='TODO' ORDER BY create_time,task_id;`),
        status: database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${quote(instance)};`),
      }), value => value.tasks.some(task => !completed.has(task.id))
        || ['PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED'].includes(value.status), '项目相关真实审批未推进');
      if (['PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED'].includes(pending.status)) {
        check('F3 真实审批终态与决定一致且无遗留待办', completed.size > 0 && pending.tasks.length === 0
          && pending.status === (decision === 'REJECT' ? 'REJECTED' : 'PASSED'));
        if (options.requiredApprovers) check('AC-4 跨项目工时由每位真实项目经理完成审批',
          options.requiredApprovers.every(value => actualApprovers.has(String(value))));
        return { tasks: completed.size, approvers: [...actualApprovers] };
      }
      for (const task of pending.tasks) {
        if (completed.has(task.id)) continue;
        let assignee = task.assignee;
        if (!people.has(assignee) && options.allowTransfer) {
          await post('/workflow/enhance/task/delegate', { taskId: task.id, toUserId: 990000702,
            toUserName: 'g_import_other', mode: 'TRANSFER', reason: marker + '_实际转交' });
          assignee = database(`SELECT CAST(assignee AS CHAR) FROM wf_task WHERE tenant_id=100000 AND task_id=${quote(task.id)} AND status='TODO';`);
          check('F3 前置单据审批实际转交给独立审批人', assignee === '990000702');
        }
        assert.ok(people.has(assignee), '真实审批人必须与冻结参与者一致');
        if (options.requiredApprovers) check('AC-4 工时审批待办属于原项目经理', options.requiredApprovers.map(String).includes(assignee));
        await post('/workflow/wf/complete', { taskId: task.id, action: decision, comment: marker + '_实际审批' }, people.get(assignee));
        const historyAction = String(task.candidateRoles || '').startsWith('CS:') ? 'COUNTERSIGN_' + decision : decision;
        await waitFor(() => database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${quote(task.id)}
          AND operator_id=${assignee} AND action=${quote(historyAction)};`), value => value === '1', 'F3真实审批历史未保存');
        check('F3 审批历史保存唯一真实操作者和决定类型', true);
        completed.add(task.id);
        actualApprovers.add(assignee);
      }
    }
    throw new Error('F3审批超过16轮，保留原待办和流程证据');
  };
  let projectSequence = 0;
  const project = (id, page = admin) => get('/oa/project/' + id, page);
  const taskList = (id, page = admin) => get('/oa/project/' + id + '/wbs', page);
  const createProject = async (suffix, extra = {}) => {
    const number = marker + '_' + (++projectSequence);
    const id = await post('/oa/project', { projectNo: number, projectName: marker + '_' + suffix, projectType: 'INTERNAL',
      ownerId: 990000702, ownerName: 'g_import_other', deptId: 100, startDate: shifted(-30), endDate: shifted(60),
      budgetAmount: '2000.11', estimatedCost: '1200.10', otherCostAmount: '0.00', progress: '0.00',
      status: 'DRAFT', percentCompleteMode: 'TASK_PROGRESS', sourceType: 'MANUAL', ...extra });
    const saved = await project(id);
    check('F3 项目通过真实创建入口保存唯一原编号', saved.projectNo === number && saved.status === 'DRAFT');
    await post('/oa/project/submit/' + id, {}, people.get(String(saved.ownerId)) || admin);
    const bound = await waitFor(() => project(id), value => value.instanceId && value.status === 'PENDING', '项目立项未生成真实审批实例');
    await completeWorkflow(bound.instanceId, 'APPROVE', { allowTransfer: true });
    return waitFor(() => project(id), value => value.status === 'APPROVED', '项目真实立项审批未回写');
  };
  let taskSequence = 0;
  const createTask = async (target, suffix, extra = {}) => {
    const number = marker + '_T_' + (++taskSequence);
    await post('/oa/project/wbs', { projectId: target.projectId, taskNo: number, subject: marker + '_' + suffix,
      isGroupFlag: 0, isMilestoneFlag: 0, taskWeight: '1.00', progress: '0.00', plannedHours: '8.00',
      status: 'NOT_STARTED', priority: 1, sortNo: taskSequence, plannedStart: shifted(-7) + ' 09:00:00',
      plannedEnd: shifted(7) + ' 18:00:00', ...extra });
    const matches = (await taskList(target.projectId)).filter(value => value.taskNo === number);
    check('AC-12 项目任务由真实入口完整保存', matches.length === 1);
    return matches[0];
  };
  const addEmployee = async (target, extra = {}) => {
    await post('/oa/project/member', { projectId: target.projectId, userId: 990000707, userName: '工时验收员工',
      roleCode: 'MEMBER', roleName: '项目成员', joinDate: shifted(-30), billableFlag: 1, ...extra });
    const matches = (await get('/oa/project/' + target.projectId + '/members')).filter(value => String(value.userId) === '990000707');
    check('AC-2 工时员工的项目成员关系实际保存', matches.length === 1);
    return matches[0];
  };
  const snapshot = statement => createHash('sha256').update(database(statement)).digest('hex');
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const ctx = { ...context, api, marker, quote, rows, sleep, waitFor, cents, get, post, put, remove, reject, today, shifted, week,
    manager, employee, outsider, readonly, remember, completeWorkflow, project, taskList, createProject, createTask, addEmployee, snapshot, auditBefore };
  await verifyF3ProjectTasks(ctx);
  await verifyF3ProjectTimesheets(ctx);
  await verifyF3ProjectAccounting(ctx);
  await verifyF3ProjectInterface(ctx);
}
