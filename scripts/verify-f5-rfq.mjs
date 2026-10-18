import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyF5RfqMail } from './verify-f5-rfq-mail.mjs';
import { verifyF5RfqQuotes } from './verify-f5-rfq-quotes.mjs';
import { verifyF5RfqAwards } from './verify-f5-rfq-awards.mjs';
import { verifyF5RfqInterface } from './verify-f5-rfq-ui.mjs';

export async function verifyF5Rfq(context) {
  const { admin, successful, check, directory, caseTag, state, evidence } = context;
  assert.equal(state.verification?.mode, 'F5_RFQ_INDEPENDENT');
  const marker = 'F5_' + caseTag;
  const secretPath = path.join(directory, 'private/h3-core-secrets.json');
  const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    if (!token) return;
    const secret = token.replace(/^Bearer /, '');
    if (!secrets.has(secret)) {
      secrets.add(secret);
      await fs.writeFile(secretPath, JSON.stringify([...secrets]));
    }
  };
  const session = async username => {
    const page = await context.session(username);
    await remember(page);
    return page;
  };
  const lastPosts = new WeakMap();
  const api = async (page, target, options = {}) => {
    const result = await context.api(page, target, options);
    if (String(options.method || 'GET').toUpperCase() === 'POST') {
      const history = lastPosts.get(page) || new Map();
      lastPosts.set(page, history);
      history.set(target + ':' + JSON.stringify(options.body || options.file || {}), Date.now());
    }
    return result;
  };
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
  const get = async (target, page = admin) => successful(await api(page, target), target);
  const post = async (target, body = {}, page = admin) => {
    const prior = lastPosts.get(page)?.get(target + ':' + JSON.stringify(body)) || 0;
    const remaining = 5200 - (Date.now() - prior);
    if (remaining > 0) await sleep(remaining);
    return successful(await api(page, target, { method: 'POST', body }), target);
  };
  const reject = (result, label, message) => check(label,
    ([400, 401, 403, 404, 409].includes(result.status)
      || result.status === 200 && [400, 401, 403, 404, 409].includes(result.body?.code))
    && (message == null || result.body?.msg === message));
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const controlledInputs = [];
  const database = statement => {
    const result = context.database(statement);
    if (/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+/i.test(statement)) {
      controlledInputs.push({ statement, scope: 'owned independent database', systemClockChanged: false });
    }
    return result;
  };
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const snapshot = statement => createHash('sha256').update(database(statement)).digest('hex');
  const today = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d');");
  const shifted = amount => {
    assert.ok(Number.isInteger(amount));
    return database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} DAY),'%Y-%m-%d');`);
  };
  const cents = value => {
    const text = String(value);
    assert.match(text, /^-?\d+(?:\.\d{1,2})?$/);
    const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
    return (text.startsWith('-') ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  };
  const trigger = async handler => {
    const jobId = database(`SELECT job_id FROM sys_job WHERE tenant_id=100000 AND deleted=0 AND handler_name=${sql(handler)};`);
    assert.match(jobId, /^[1-9][0-9]*$/);
    const accepted = await post('/auth/system/job/' + jobId + '/trigger');
    check('F5 任务由实际平台受理 ' + handler, accepted.accepted === true && !!accepted.executeNo);
    const result = await waitFor(() => rows(`SELECT JSON_OBJECT('status',execute_status,'reported',report_time)
      FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${sql(accepted.executeNo)};`)[0],
    value => value && value.status !== 'RUNNING', 'F5 任务未完成：' + handler, 180000);
    check('F5 任务真实执行成功并回报 ' + handler, result.status === 'SUCCESS' && !!result.reported);
    return accepted.executeNo;
  };
  const ctx = { ...context, marker, session, remember, api, sleep, waitFor, get, post, reject, sql, database, rows,
    snapshot, today, shifted, cents, trigger, controlledInputs };
  ctx.completeWorkflow = async (instance, decision = 'APPROVE') => {
    const finished = new Set();
    for (let round = 0; round < 16; round++) {
      const current = await waitFor(() => ({
        status: database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(instance)};`),
        tasks: rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'roles',candidate_roles)
          FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(instance)} AND status='TODO' ORDER BY create_time,task_id;`),
      }), value => ['PASSED', 'REJECTED'].includes(value.status) || value.tasks.some(task => !finished.has(task.id)),
      'F5 真实审批未推进');
      if (['PASSED', 'REJECTED'].includes(current.status)) {
        check('F5 真实审批结束且无遗留待办', finished.size > 0 && current.tasks.length === 0
          && current.status === (decision === 'REJECT' ? 'REJECTED' : 'PASSED'));
        return;
      }
      for (const task of current.tasks) {
        if (finished.has(task.id)) continue;
        check('F5 审批待办属于配置的独立审批人', task.assignee === '990000702');
        await post('/workflow/wf/complete', { taskId: task.id, action: decision, comment: marker + '_实际审批' }, ctx.manager);
        const action = String(task.roles || '').startsWith('CS:') ? 'COUNTERSIGN_' + decision : decision;
        await waitFor(() => database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000
          AND task_id=${sql(task.id)} AND operator_id=990000702 AND action=${sql(action)};`),
        value => value === '1', 'F5 实际审批历史未保存');
        finished.add(task.id);
      }
    }
    throw new Error('F5 审批超过16轮，保留原流程证据');
  };
  await remember(admin);
  try {
    await verifyF5RfqMail({ ...ctx, check: (label, passed) => check(
      (/耗材|首100|翻页|选择控件|跨页|取消物料|搜索返回/.test(label) ? 'AC-1/2 '
        : /截止/.test(label) ? 'AC-15 ' : /不泄露|逐家|保密|附件/.test(label) ? 'AC-18 ' : 'AC-14 ') + label, passed) });
    evidence.mail = true;
    evidence.deadlines = true;
    evidence.mailPrivacy = true;
    evidence.selection = true;
    ctx.manager = await session('g_import_other');
    ctx.recorder = await session('g_import_readonly');
    ctx.employee = await session('g_holiday_employee');
    ctx.outsider = await session('g_import_tenant');
    ctx.auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
    await verifyF5RfqQuotes(ctx);
    await verifyF5RfqAwards(ctx);
    await verifyF5RfqInterface(ctx);
  } finally {
    await fs.writeFile(path.join(directory, `f5-controlled-inputs-${caseTag}.json`), JSON.stringify({
      inputs: controlledInputs, priorRuntimeWritten: false, systemClockChanged: false,
      deadlineEvidence: 'Explicit dates on owned test RFQs; real task execution; no claim of overnight observation',
    }, null, 2), { flag: 'wx' });
  }
}
