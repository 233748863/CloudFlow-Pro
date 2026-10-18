import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// Real operations create every sample; browser checks use the original instance detail page.
export async function verifyB1TaskSemantics({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence }) {
  const marker = 'B1SM' + caseTag, base = '/workflow/wf', enhance = '/workflow/enhance/task';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map((name, index) => {
    const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';');
    assert.match(id, /^[1-9][0-9]*$/); return { id, page: [admin, employee, manager][index] };
  });
  const [top, starter, reviewer] = people;
  const expected = [
    ['APPROVAL', '审批', 'clipboard-check'], ['CC', '抄送', 'mail'], ['MANUAL', '人工处理', 'hand'],
    ['COUNTERSIGN', '会签', 'users'], ['OR_SIGN', '或签', 'user-check'], ['PERCENT_SIGN', '比例签', 'percent'],
    ['SEQUENTIAL_SIGN', '顺序签', 'list-ordered'], ['WEIGHT_SIGN', '权重票签', 'scale'],
    ['TRANSFER', '转办', 'forward'], ['DELEGATE', '委派', 'share-2'], ['DELEGATE_RETURN', '委派归还', 'undo-2'],
    ['ADD_SIGN', '加签', 'user-plus'], ['REDUCE_SIGN', '减签', 'user-minus'],
    ['REJECT', '驳回', 'corner-up-left'], ['REJECT_JUMP', '驳回跳转', 'corner-up-right'],
    ['AUTO_PASS', '自动通过', 'circle-check'], ['AUTO_REJECT', '自动驳回', 'circle-x'], ['AUTO_SKIP', '自动跳过', 'skip-forward']
  ];
  const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-task-semantics-' + caseTag);
  const definitions = [], instances = [], samples = new Map();
  const identities = () => database('SELECT user_id,dept_id,status,deleted,version FROM sys_user WHERE user_id IN (' + people.map(item => item.id).join(',') + ') ORDER BY user_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const original = { identities: identities(), grants: grants() };
  const status = id => database('SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';');
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type,'status',status) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const histories = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'user',CAST(operator_id AS CHAR),'type',task_type,'action',action,'comment',comment) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  const records = id => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'node',node_key,'nodeType',node_type,'type',event_type,'status',status) FROM wf_node_record WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY id;');
  const endMonitors = id => database("SELECT COUNT(*) FROM wf_node_monitor WHERE tenant_id=100000 AND node_key='end' AND instance_id=" + sql(id) + ';');
  const snapshot = id => JSON.stringify({ tasks: tasks(id), history: histories(id), records: records(id), endMonitors: endMonitors(id), instance: database('SELECT status,lock_version,variables,end_time FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=' + sql(id) + ';') });
  const waitFor = async (read, accept, label) => { const until = Date.now() + 30000; do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 200)); } while (Date.now() < until); throw new Error(label); };
  let formId, failure, mobile, starts = 0, completions = 0, changes = 0, traceChecks = 0;
  const approval = (id, actor, props = {}) => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: actor.id, approveSelf: 'ALLOW', allowAgent: false, ...props });
  const launch = async (name, middle) => {
    const nodes = [{ id: 'start', type: 'START', title: '发起' }, ...middle, { id: 'end', type: 'END', title: '结束' }];
    const model = { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge-' + index, source: nodes[index].id, target: node.id })) };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name,
      formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存任务语义实际样本定义');
    const def = saved.definitionId ?? saved.id; assert.ok(def); definitions.push(def);
    successful(await post(admin, base + '/definition/deploy/' + def), '发布任务语义样本');
    const context = successful(await api(employee, base + '/draft/context/' + def), '读取本人发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: def, expectedVersion: 0, loadedContextHash: context.contextHash,
      title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '保存本人语义验证草稿');
    const result = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实发起语义验证流程');
    const id = result.instanceId ?? result.processInstanceId; assert.ok(id); instances.push(id); starts++;
    console.log('B1_SEMANTIC_SCENARIO: ' + name); return id;
  };
  const task = (id, node, actor, type) => {
    const found = tasks(id).filter(item => item.node === node && item.user === actor.id && item.status === 'TODO');
    assert.equal(found.length, 1); check(type + '真实待办保存正确人员及任务语义', found[0].type === type); return found[0];
  };
  const complete = async (id, current, actor, action = 'APPROVE', variables) => {
    successful(await post(actor.page, base + '/complete', { taskId: current.id, action, comment: marker + '-act-' + completions, variables }), '本人实际完成语义任务'); completions++;
    check('本人完成后持久历史包含原任务及真实操作者', !tasks(id).some(item => item.id === current.id)
      && histories(id).some(item => item.task === current.id && item.user === actor.id));
  };
  const finish = (id, terminal = 'PASSED') => {
    check('语义样本真实完成且无遗留待办', status(id) === terminal && tasks(id).length === 0);
    const ends = records(id).filter(item => item.node === 'end'), count = terminal === 'PASSED' ? 1 : 0;
    check('单次结束仅保存一条节点和监控记录且拒绝流程不伪造结束', ends.length === count && ends.every(item => item.status === 'COMPLETED') && endMonitors(id) === String(count));
  };
  const capture = async (type, id, taskId) => {
    const history = histories(id).find(item => item.type === type && (!taskId || item.task === taskId)); assert.ok(history, 'Missing persisted semantic ' + type);
    const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '本人读取真实语义轨迹');
    check(type + '轨迹匹配持久历史的任务语义和操作者', trace.historyDetails?.some(item => item.historyId === history.id
      && item.taskId === history.task && item.taskType === type && String(item.operatorId ?? '') === String(history.user ?? '') && item.action === history.action));
    samples.set(type, { type, instance: id, history }); traceChecks++;
  };
  const devices = async () => {
    await fs.mkdir(directory, { recursive: true });
    mobile = await createB2MobileBrowser({ admin: employee, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
    await employee.setViewportSize({ width: 1440, height: 1000 });
    for (const [device, page] of [['desktop', employee], ['mobile', mobile.page]]) {
      const errors = [], before = new Map(instances.map(id => [id, snapshot(id)])); let screenshots = 0, views = 0;
      const onError = error => errors.push(error.name); page.on('pageerror', onError);
      try {
        const grouped = new Map();
        for (const item of expected) { const id = samples.get(item[0]).instance; if (!grouped.has(id)) grouped.set(id, []); grouped.get(id).push(item); }
        for (const [id, items] of grouped) {
          await page.goto(new URL('/workflow/search-instance/' + id, page.url()).href, { waitUntil: 'domcontentloaded' });
          await page.getByRole('heading', { name: '流程详情', exact: true }).waitFor();
          const dialog = page.getByRole('dialog', { name: '申请详情', exact: true });
          const tab = dialog.getByRole('button', { name: '审批记录', exact: true }); await tab.waitFor();
          const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/workflow/wf/instance/' + id + '/trace'), { timeout: 30000 }).catch(() => null);
          if (device === 'mobile') await tapB2Mobile(tab); else await tab.click();
          const response = await pending, body = response ? await response.json() : null;
          check(device + '页面本人轨迹请求成功', response?.status() === 200 && body?.code === 200); views++;
          const endCount = status(id) === 'PASSED' ? 1 : 0;
          check(device + '实际轨迹接口仅返回真实经过次数的结束节点', body.data.historyDetails.filter(item => item.nodeKey === 'end').length === endCount);
          // The timeline title is a span; the model diagram uses a div and is not counted.
          await page.waitForFunction(({ count }) => [...document.querySelectorAll('[role="dialog"] span.text-sm.font-semibold')].filter(item => item.textContent === '结束').length === count, { count: endCount });
          check(device + '审批记录页面单次结束仅显示一行', await dialog.locator('span.text-sm.font-semibold').filter({ hasText: /^结束$/ }).count() === endCount);
          for (const [type, label, icon] of items) {
            const badges = dialog.locator('span').filter({ hasText: new RegExp('^' + label + '$') }).filter({ has: page.locator('svg.lucide-' + icon) });
            await badges.first().waitFor({ timeout: 30000 }); await badges.first().scrollIntoViewIfNeeded();
            check(device + '-' + type + '真实轨迹显示准确文案和专属图标', await badges.first().isVisible());
            await page.screenshot({ path: path.join(directory, device + '-' + type + '.png'), fullPage: true }); screenshots++;
          }
        }
        check(device + '只读查看没有修改流程任务或历史且无页面异常', errors.length === 0 && instances.every(id => snapshot(id) === before.get(id)));
        console.log('B1_TASK_SEMANTICS_UI: ' + JSON.stringify({ device, semantics: screenshots, views, screenshots, singleEndVerified: true, actualTouch: device === 'mobile', readOnly: true, pageErrors: errors.length }));
        evidence[device === 'desktop' ? 'b1SemanticsDesktop' : 'b1SemanticsMobile'] = true;
      } finally { page.off('pageerror', onError); }
    }
  };
  try {
    const savedForm = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立语义验证表单');
    formId = savedForm.formId ?? savedForm.id; assert.ok(formId);
    const basic = await launch('basic', [approval('copy', top, { type: 'COPY' }), approval('manual', reviewer, { type: 'MANUAL' }), approval('review', reviewer)]);
    const copied = await waitFor(() => records(basic), items => items.some(item => item.node === 'copy' && item.type === 'CC' && item.status === 'COMPLETED'), 'Copy node semantic not persisted');
    check('抄送实际建立收件记录且节点保存CC语义', database('SELECT COUNT(*) FROM wf_process_copy WHERE tenant_id=100000 AND instance_id=' + sql(basic) + " AND node_id='copy' AND user_id=" + top.id + ';') === '1');
    const manual = task(basic, 'manual', reviewer, 'MANUAL'); await complete(basic, manual, reviewer);
    const normal = task(basic, 'review', reviewer, 'APPROVAL'); await complete(basic, normal, reviewer); finish(basic);
    await capture('MANUAL', basic, manual.id); await capture('APPROVAL', basic, normal.id);
    const copyTrace = successful(await api(employee, base + '/instance/' + basic + '/trace'), '读取抄送真实节点轨迹');
    check('抄送轨迹从已保存节点记录返回CC', copyTrace.historyDetails?.some(item => item.nodeKey === 'copy' && item.taskType === 'CC' && item.nodeType === 'COPY'));
    samples.set('CC', { type: 'CC', instance: basic, record: copied.find(item => item.node === 'copy' && item.type === 'CC' && item.status === 'COMPLETED') }); traceChecks++;
    const signers = [reviewer, top, starter];
    for (const scenario of [
      { name: 'all', mode: 'ALL', type: 'COUNTERSIGN', count: 2 }, { name: 'any', mode: 'ANY', type: 'OR_SIGN', count: 1 },
      { name: 'percent', mode: 'PERCENT', type: 'PERCENT_SIGN', count: 2 }, { name: 'sequential', mode: 'SEQUENTIAL', type: 'SEQUENTIAL_SIGN', count: 2 },
      { name: 'weight-pass', mode: 'WEIGHT', type: 'WEIGHT_SIGN', count: 2 }, { name: 'weight-reject', mode: 'WEIGHT', type: 'WEIGHT_SIGN', count: 1, reject: true }
    ]) {
      const members = ['PERCENT', 'WEIGHT'].includes(scenario.mode) ? signers : signers.slice(0, 2);
      const id = await launch(scenario.name, [approval('review', reviewer, { approverType: 'USERS', approverValue: members.map(item => item.id).join(','), signType: scenario.mode,
        ...(scenario.mode === 'PERCENT' ? { passPercent: 60 } : {}), ...(scenario.mode === 'WEIGHT' ? { weightSource: 'BY_CONFIG', passWeight: 5, assigneeWeights: members.map((item, index) => ({ userId: item.id, weight: 3 - index })) } : {}) })]);
      let firstTask;
      for (let index = 0; index < scenario.count; index++) { const current = task(id, 'review', members[index], scenario.type); firstTask ??= current;
        await complete(id, current, members[index], scenario.reject ? 'REJECT' : 'APPROVE'); }
      finish(id, scenario.reject ? 'REJECTED' : 'PASSED'); await capture(scenario.type, id, firstTask.id);
      if (scenario.mode === 'WEIGHT') await capture(scenario.reject ? 'AUTO_REJECT' : 'AUTO_PASS', id);
    }
    const transferred = await launch('transfer', [approval('review', reviewer)]), transferTask = task(transferred, 'review', reviewer, 'APPROVAL');
    successful(await post(manager, enhance + '/delegate', { taskId: transferTask.id, toUserId: top.id, mode: 'TRANSFER', reason: marker }), '本人实际转办'); changes++;
    const newOwner = task(transferred, 'review', top, 'TRANSFER'); await complete(transferred, newOwner, top); finish(transferred); await capture('TRANSFER', transferred, newOwner.id);
    const delegated = await launch('delegate', [approval('review', reviewer)]), originalTask = task(delegated, 'review', reviewer, 'APPROVAL');
    const relation = successful(await post(manager, enhance + '/delegate', { taskId: originalTask.id, toUserId: top.id, mode: 'DELEGATE', reason: marker }), '本人实际委派'); changes++;
    const assigned = task(delegated, 'review', top, 'DELEGATE'); check('委派保留原任务并关联唯一受委派任务', relation.delegatedTaskId === assigned.id && tasks(delegated).some(item => item.id === originalTask.id && item.status === 'DELEGATED'));
    await complete(delegated, assigned, top); check('受委派完成后原负责人恢复且未提前结束', status(delegated) === 'RUNNING' && tasks(delegated).length === 1 && tasks(delegated)[0].id === originalTask.id);
    await capture('DELEGATE', delegated, assigned.id); await capture('DELEGATE_RETURN', delegated, originalTask.id);
    await complete(delegated, task(delegated, 'review', reviewer, 'APPROVAL'), reviewer); finish(delegated);
    const added = await launch('add-reduce', [approval('review', reviewer)]), addOriginal = task(added, 'review', reviewer, 'APPROVAL');
    successful(await post(manager, enhance + '/addSign', { taskId: addOriginal.id, userIds: [starter.id, top.id], signType: 'BEFORE', reason: marker }), '本人实际前加签'); changes++;
    const retained = task(added, 'review', starter, 'ADD_SIGN'), removed = task(added, 'review', top, 'ADD_SIGN');
    successful(await post(manager, enhance + '/removeSign', { taskId: addOriginal.id, userIds: [top.id], reason: marker }), '本人移除尚未处理的加签人'); changes++;
    check('减签消费被移除待办并保留其他加签人', !tasks(added).some(item => item.id === removed.id) && tasks(added).some(item => item.id === retained.id));
    await capture('REDUCE_SIGN', added, removed.id); await complete(added, retained, starter); await capture('ADD_SIGN', added, retained.id);
    await complete(added, task(added, 'review', reviewer, 'APPROVAL'), reviewer); finish(added);
    for (const [name, strategy, semantic] of [['return', 'TO_INITIATOR', 'REJECT'], ['jump', 'TO_PREVIOUS_NODE', 'REJECT_JUMP']]) {
      const id = await launch(name, [...(name === 'jump' ? [approval('pre', starter)] : []), approval('review', reviewer, { rejectStrategy: strategy })]);
      if (name === 'jump') await complete(id, task(id, 'pre', starter, 'APPROVAL'), starter);
      const current = task(id, 'review', reviewer, 'APPROVAL');
      successful(await post(manager, base + '/reject', { taskId: current.id, strategy, comment: marker + '-' + name }), '本人实际驳回到指定业务去向'); changes++;
      await capture(semantic, id, current.id);
      await complete(id, task(id, name === 'jump' ? 'pre' : 'start', starter, semantic), starter, 'APPROVE', name === 'return' ? { note: marker + '-resubmitted' } : undefined);
      await complete(id, task(id, 'review', reviewer, 'APPROVAL'), reviewer); finish(id);
      const reviewRecords = records(id).filter(item => item.node === 'review');
      const completedReviews = reviewRecords.filter(item => item.status === 'COMPLETED');
      check('驳回重审保留两次完成记录并区分原节点取消留痕', completedReviews.length === 2
        && completedReviews.some(item => item.type === semantic) && completedReviews.some(item => item.type === 'APPROVAL')
        && reviewRecords.every(item => ['COMPLETED', 'CANCELLED'].includes(item.status))
        && histories(id).filter(item => item.node === 'review').length === 2);
    }
    const skipped = await launch('skip', [approval('skip', starter, { approverType: 'INITIATOR', approveSelf: 'AUTO_SKIP' }), approval('review', reviewer)]);
    await capture('AUTO_SKIP', skipped); await complete(skipped, task(skipped, 'review', reviewer, 'APPROVAL'), reviewer); finish(skipped);
    check('18种任务语义均来自本轮真实业务记录', samples.size === 18 && expected.every(([type]) => samples.has(type)));
    evidence.b1SemanticsRecords = true;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'samples.json'), JSON.stringify([...samples.values()], null, 2) + '\n', { flag: 'wx' });
    await devices();
    for (const sample of samples.values()) if (sample.history) check('双端查看后原语义历史保持', JSON.stringify(histories(sample.instance).find(item => item.id === sample.history.id)) === JSON.stringify(sample.history));
    console.log('B1_TASK_SEMANTICS_ACTUAL: ' + JSON.stringify({ semanticCount: samples.size, realStarts: starts, humanCompletions: completions, changes, traceChecks,
      semantics: expected.map(([type]) => type), singleEndVerified: true, repeatedVisitsPreserved: true, copyUsesPersistedNode: true, automaticSource: 'weighted-early-completion', timeoutEvidenceSeparate: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      if (mobile) await mobile.close();
      const owned = rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE tenant_id=100000 AND process_key LIKE " + sql(marker + '-%') + ');');
      for (const { id } of owned) if (['RUNNING','PAUSED','PENDING','FAILED','WITHDRAWN','TASK_BACK','RESTARTED'].includes(status(id)))
        successful(await post(admin, base + '/instance/terminate', { instanceId: id, reason: marker + '-cleanup' }), '结束自有未完成语义验证流程');
      for (const id of definitions) { database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED',deleted=0 WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '-%') + ';'); }
      check('任务语义验证原身份权限保持且自有样本全部收尾', identities() === original.identities && grants() === original.grants
        && owned.every(item => ['PASSED','REJECTED','TERMINATED'].includes(status(item.id)) && tasks(item.id).length === 0));
      evidence.b1SemanticsRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 task semantics verification or restoration failed'); }
  }
  if (failure) throw failure;
}
