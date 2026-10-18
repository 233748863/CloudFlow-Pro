import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Old node configuration is exercised by actual publication, launch and completion.
export async function verifyB1LegacyNodes({ admin, employee, api, successful, session, database, check, caseTag, secrets, evidence, redis }) {
  const marker = 'B1LN' + caseTag, base = '/workflow/wf', jobsRoot = '/auth/system/job';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const manager = await session('g_holiday_manager');
  const token = await manager.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  const person = (name, page) => { const id = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';'); assert.match(id, /^[1-9][0-9]*$/); return { id, page }; };
  const starter = person('g_holiday_employee', employee), reviewer = person('g_holiday_manager', manager), owner = person('g_import_admin', admin);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const config = () => database('SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name NOT LIKE ' + sql(marker + '%') + ' ORDER BY job_id;');
  const queueKeys = ['100000:sys:wf:timers', '100001:sys:wf:timers'];
  const indices = () => JSON.stringify(queueKeys.map(key => [key, redis('ZRANGE', key, 0, -1, 'WITHSCORES')]));
  const original = { grants: grants(), config: config(), indices: indices() };
  const definitions = [], instances = [], samples = [], timers = [], received = [];
  const instance = id => rows("SELECT JSON_OBJECT('status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const tasks = id => rows("SELECT JSON_OBJECT('id',task_id,'node',node_key,'user',CAST(assignee AS CHAR),'type',task_type,'priority',priority) FROM wf_task WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY task_id;');
  const records = id => rows("SELECT JSON_OBJECT('node',node_key,'type',event_type,'status',status) FROM wf_node_record WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY id;');
  const histories = id => rows("SELECT JSON_OBJECT('id',history_id,'task',task_id,'node',node_key,'type',task_type,'action',action,'user',CAST(operator_id AS CHAR)) FROM wf_task_history WHERE tenant_id=100000 AND instance_id=" + sql(id) + ' ORDER BY history_id;');
  const waitFor = async (read, accept, label, timeout = 30000) => { const deadline = Date.now() + timeout; do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < deadline); throw new Error(label); };
  const approval = (id, user) => ({ id, type: 'APPROVAL', title: id, approverType: 'USER', approverValue: user.id });
  const edge = (source, target, extra = {}) => ({ id: source + '-' + target, source, target, ...extra });
  const linear = middle => { const nodes = [{ id: 'start', type: 'START', title: '发起' }, ...middle, { id: 'end', type: 'END', title: '结束' }]; return { nodes, edges: nodes.slice(1).map((node, index) => edge(nodes[index].id, node.id)) }; };
  let formId, jobId, failure, starts = 0, completions = 0, traceChecks = 0, currentWhitelist;
  const whitelistKey = '100000:sys:config:tenant:workflow.trigger.url.whitelist';
  const whitelistBefore = redis('EXISTS', whitelistKey) === '1' ? redis('GET', whitelistKey) : null;
  const whitelistTtl = Number(redis('PTTL', whitelistKey)), whitelistCaptured = Date.now();
  const whitelistRows = () => database("SELECT config_id,SHA2(JSON_ARRAY(tenant_id,config_name,config_key,config_value,config_type,config_scope,create_by,create_time,update_by,update_time,remark),256) FROM sys_config WHERE config_key='workflow.trigger.url.whitelist' ORDER BY tenant_id,config_id;");
  const whitelistDatabaseBefore = whitelistRows();
  const server = createServer((request, response) => {
    if (request.url !== '/' + marker) { response.writeHead(404).end(); return; }
    let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 8192) request.destroy(); });
    request.on('end', () => { received.push({ method: request.method, body: JSON.parse(body) }); response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ marker, accepted: true })); });
  });
  const definition = async (name, model, deploy = true) => {
    const key = marker + '-' + name;
    const saved = successful(await post(admin, base + '/definition/save', { processKey: key, processName: key, formId, modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存旧节点定义');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    if (deploy) successful(await post(admin, base + '/definition/deploy/' + id), '发布旧节点定义');
    const stored = JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';'));
    const forbidden = ['approveSelf','directorLevel','directorFallback','rejectStrategy','rejectToNodeKey','allowAddSign','allowReduceSign','allowDelegate','allowUrge','allowRollback','allowCc','allowSelection'];
    check(name + '保存模型未补入B1新增字段', stored.nodes.every(node => forbidden.every(key => !Object.hasOwn(node, key))));
    return { id, key };
  };
  const start = async (def, name, note = marker) => {
    const context = successful(await api(employee, base + '/draft/context/' + def.id), '读取旧节点发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: def.id, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker + '-' + name, formData: { note }, nodeAssignees: {} }), '保存旧节点本人草稿');
    const result = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '真实发起旧节点流程');
    const id = result.instanceId ?? result.processInstanceId; assert.ok(id); instances.push(id); starts++; samples.push({ name, id, definitionId: def.id }); return id;
  };
  const complete = async (id, node, user, type = 'APPROVAL') => {
    const selected = tasks(id).filter(task => task.node === node && task.user === user.id); assert.equal(selected.length, 1);
    check(node + '待办人员及类型准确', selected[0].type === type);
    successful(await post(user.page, base + '/complete', { taskId: selected[0].id, action: 'APPROVE', comment: marker }), '本人真实办理旧节点待办'); completions++;
    check(node + '原待办归档一次且保存本人处理语义', histories(id).filter(item => item.task === selected[0].id && item.type === type && item.user === user.id).length === 1);
  };
  const finish = async id => {
    await waitFor(() => instance(id), item => ['PASSED', 'AUTO_PASSED'].includes(item?.status), 'Old node workflow did not finish');
    const saved = records(id), history = histories(id);
    check('旧流程结束后无待办且结束记录唯一', tasks(id).length === 0 && saved.filter(item => item.node === 'end' && item.status === 'COMPLETED').length === 1
      && database("SELECT COUNT(*) FROM wf_node_monitor WHERE tenant_id=100000 AND node_key='end' AND instance_id=" + sql(id) + ';') === '1');
    const trace = successful(await api(employee, base + '/instance/' + id + '/trace'), '本人读取旧节点实际轨迹'); traceChecks++;
    check('旧流程轨迹保留完成记录且结束唯一', trace.historyDetails.filter(item => item.nodeKey === 'end').length === 1
      && history.every(item => trace.historyDetails.some(detail => detail.historyId === item.id && detail.taskType === item.type)));
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name='timerScan';"), '0');
    for (const key of queueKeys) assert.equal(redis('ZCOUNT', key, 0, Date.now() + 300000), '0', 'No unrelated timers may become due');
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立旧节点验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);

    await new Promise((resolve, reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    const address = server.address(); assert.ok(address && typeof address === 'object');
    currentWhitelist = JSON.stringify('127.0.0.1');
    assert.equal(redis('EVAL', "local old=redis.call('GET',KEYS[1]); if ARGV[1]=='absent' then if old then return 0 end elseif old~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[3],'PX',1800000); return 1",1,whitelistKey,whitelistBefore === null ? 'absent' : 'present',whitelistBefore ?? '',currentWhitelist),'1');
    for (const mapped of [false, true]) {
      const beforeRequests = received.length;
      const scripted = await start(await definition('api-script-' + mapped,linear([{ id:'script',type:'SCRIPT',title:'旧API脚本',
        ...(mapped ? {outputs:{legacyApiStatus:'_apiStatusCode_script',legacyApiResponse:'_apiResponse_script'}} : {}),
        props:{scriptType:'API',apiUrl:'http://127.0.0.1:' + address.port + '/' + marker,apiMethod:'POST',apiBody:{marker,note:'${note}'}}},approval('after',reviewer)])),'api-script-' + mapped);
      check('旧API脚本真实请求一次并替换变量',received.length === beforeRequests + 1 && received.at(-1).method === 'POST' && received.at(-1).body.marker === marker && received.at(-1).body.note === marker);
      check('旧API调用成功后继续创建唯一后续待办',tasks(scripted).length === 1 && tasks(scripted)[0].node === 'after');
      if (mapped) check('旧API显式outputs映射持久保存响应和状态码',instance(scripted).variables.legacyApiStatus === 200 && JSON.parse(instance(scripted).variables.legacyApiResponse).accepted === true);
      await complete(scripted,'after',reviewer); await finish(scripted);
    }
    evidence.b1LegacyApiScript = true;

    // Retain the old delayMinutes and scheduleTime fields and let the actual clock expire.
    for (const timerType of ['DELAY', 'SCHEDULE']) {
      const schedule = new Date(Date.now() + 65000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
      const props = timerType === 'DELAY' ? { timerType, delayMinutes: 1 } : { timerType, scheduleTime: schedule };
      const id = await start(await definition('timer-' + timerType, linear([{ id: 'timer', type: 'TIMER', title: '旧定时', props }, approval('after', reviewer)])), 'timer-' + timerType);
      const actual = instance(id), waits = Object.values(actual.variables._wf_waits ?? {}).filter(item => item.kind === 'TIMER'); assert.equal(waits.length, 1);
      const pending = waits[0], key = 'sys:wf:timer:' + id + ':timer:root:' + pending.waitId;
      check(timerType + '旧定时实际等待且后续任务未创建', actual.status === 'PENDING' && tasks(id).length === 0 && pending.payload.expireAt > Date.now()
        && Number(redis('ZSCORE', queueKeys[0], JSON.stringify(key))) === pending.payload.expireAt);
      timers.push({ id, key, expireAt: pending.payload.expireAt, type: timerType });
    }

    const basic = await start(await definition('manual-copy-notification', linear([
      { id: 'notify', type: 'NOTIFICATION', title: '旧通知', props: { recipientType: 'INITIATOR', notificationTitle: marker + '-notice', notificationContent: '内容：${note}' } },
      { id: 'copy', type: 'COPY', title: '旧抄送', approverType: 'USERS', approverValue: [reviewer.id, reviewer.id, owner.id].join(',') },
      { id: 'manual', type: 'MANUAL', title: '本人执行', approverType: 'INITIATOR', props: { taskDescription: '核对清单', priority: 'MEDIUM' } }, approval('after', reviewer)
    ])), 'manual-copy-notification');
    check('旧人工节点本人待办阻塞后续且中优先级保持', tasks(basic).length === 1 && tasks(basic)[0].node === 'manual' && tasks(basic)[0].user === starter.id && tasks(basic)[0].priority === 'NORMAL');
    const copies = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'read',is_read) FROM wf_process_copy WHERE tenant_id=100000 AND instance_id=" + sql(basic) + " AND node_id='copy' ORDER BY user_id;");
    check('旧抄送收件人去重且准确保留两人未读记录', copies.length === 2 && copies.every(item => [reviewer.id, owner.id].includes(item.user) && item.read === 0));
    const messages = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status,'content',content) FROM sys_message_record WHERE tenant_id=100000 AND channel_type='INTERNAL' AND title=" + sql(marker + '-notice') + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'Old notification not delivered');
    check('旧通知实际送达发起人并替换表单内容', messages[0].user === starter.id && messages[0].content === '内容：' + marker);
    successful(await api(employee, '/auth/system/message/mine/' + messages[0].id), '员工读取本人旧节点通知');
    await complete(basic, 'manual', starter, 'MANUAL'); await complete(basic, 'after', reviewer); await finish(basic);
    evidence.b1LegacyManualCopyNotification = true;

    const condition = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'gate', type: 'CONDITION', title: '条件' }, approval('chosen', reviewer), approval('fallback', owner), { id: 'end', type: 'END', title: '结束' }],
      edges: [edge('start','gate'), edge('gate','chosen',{ condition: "note == 'chosen'" }), edge('gate','fallback',{ isDefault: true }), edge('chosen','end'), edge('fallback','end')] };
    const conditional = await definition('condition', condition);
    for (const [note, node, user] of [['chosen','chosen',reviewer], ['fallback','fallback',owner]]) {
      const id = await start(conditional, 'condition-' + note, note);
      check('旧条件仅创建命中分支或默认分支待办', tasks(id).length === 1 && tasks(id)[0].node === node);
      await complete(id, node, user); await finish(id);
      check('未选中的旧分支没有任务和节点完成留痕', !records(id).some(item => item.node === (node === 'chosen' ? 'fallback' : 'chosen')));
    }
    const parallel = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'split', type: 'PARALLEL', title: '并行', branchStrategy: 'PARALLEL' }, approval('left',reviewer), approval('right',owner), approval('join',reviewer), { id: 'end', type: 'END', title: '结束' }],
      edges: [edge('start','split'),edge('split','left'),edge('split','right'),edge('split','join',{isDefault:true}),edge('left','join'),edge('right','join'),edge('join','end')] };
    const parallelId = await start(await definition('parallel', parallel), 'parallel');
    check('旧并行无签署方式时创建两条独立审批', tasks(parallelId).length === 2 && tasks(parallelId).every(task => ['left','right'].includes(task.node) && task.type === 'APPROVAL'));
    await complete(parallelId,'left',reviewer);
    check('旧并行首支完成时等待剩余分支', tasks(parallelId).length === 1 && tasks(parallelId)[0].node === 'right');
    await complete(parallelId,'right',owner);
    check('旧并行全部完成后仅创建一个汇合待办', tasks(parallelId).length === 1 && tasks(parallelId)[0].node === 'join');
    await complete(parallelId,'join',reviewer); await finish(parallelId); evidence.b1LegacyGateways = true;

    const childDefinition = await definition('child', linear([approval('child-review', reviewer)]));
    for (const wait of [true, false]) {
      const parent = await start(await definition('parent-' + wait, linear([{ id: 'call', type: 'SUBPROCESS', title: '子流程', props: { subprocessId: childDefinition.key, ...(wait ? {} : { waitForCompletion: false }) } }, approval('after',owner)])), 'parent-' + wait);
      const child = database('SELECT instance_id FROM wf_process_instance WHERE tenant_id=100000 AND parent_instance_id=' + sql(parent) + ';'); assert.ok(child); instances.push(child); samples.push({ name: 'child-' + wait, id: child });
      check('旧子流程保留父子关联并继承表单变量', instance(child).variables.note === marker && tasks(child).length === 1);
      if (wait) check('旧子流程缺省等待时父流程没有后续待办', tasks(parent).length === 0);
      else { await complete(parent,'after',owner); await finish(parent); check('旧异步子流程在父结束后仍等待本人办理', tasks(child).length === 1); }
      await complete(child,'child-review',reviewer); await finish(child);
      if (wait) { await waitFor(() => tasks(parent), items => items.length === 1 && items[0].node === 'after', 'Parent did not resume after old child'); await complete(parent,'after',owner); }
      await finish(parent);
    }
    evidence.b1LegacySubprocess = true;

    for (const timer of timers) await waitFor(() => Date.now(), now => now >= timer.expireAt, 'Old timer did not reach actual expiry', 80000);
    const source = successful(await api(admin,jobsRoot + '/114'),'读取定时扫描定义'); assert.equal(source.handlerName,'timerScan'); assert.equal(source.status,'PAUSED');
    successful(await post(admin,jobsRoot,{...source,jobId:undefined,jobName:marker + '-scan',jobGroup:'B1_VERIFY',handlerParam:marker,status:'PAUSED',criticalFlag:0,alarmOnFailFlag:0,logSuccessFlag:1,retryCount:0,dispatchRetryCount:0}),'建立自有暂停定时扫描');
    jobId = database('SELECT job_id FROM sys_job WHERE deleted=0 AND job_name=' + sql(marker + '-scan') + ';'); assert.match(jobId,/^[1-9][0-9]*$/);
    const scan = async expected => {
      const execution = successful(await post(admin,jobsRoot + '/' + jobId + '/trigger'),'真实扫描自然到期的旧定时'); assert.equal(execution.accepted,true);
      const result = await waitFor(() => rows("SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows) FROM sys_job_log WHERE job_id=" + jobId + ' AND execute_no=' + sql(execution.executeNo) + ';')[0],item => item && item.status !== 'RUNNING','Old timer scan did not complete');
      check('旧定时真实扫描数量准确',result.status === 'SUCCESS' && result.affected === expected);
    };
    await scan(2);
    for (const timer of timers) {
      check(timer.type + '自然到期恢复并留下唯一自动处理记录',tasks(timer.id).length === 1 && tasks(timer.id)[0].node === 'after' && histories(timer.id).filter(item => item.node === 'timer' && item.type === 'AUTO_PASS').length === 1
        && redis('ZSCORE',queueKeys[0],JSON.stringify(timer.key)) === '' && redis('EXISTS','100000:' + timer.key) === '0');
      await complete(timer.id,'after',reviewer); await finish(timer.id);
    }
    await scan(0); evidence.b1LegacyTimers = true;
    const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))),'.cloudflow-runtime/full-prd-20260915/approved-runtime','b1-legacy-nodes-' + caseTag);
    await fs.mkdir(directory,{recursive:true}); await fs.writeFile(path.join(directory,'samples.json'),JSON.stringify(samples,null,2) + '\n',{flag:'wx'});
    console.log('B1_LEGACY_NODES_ACTUAL: ' + JSON.stringify({realStarts:starts,instances:instances.length,humanCompletions:completions,traceChecks,nodeTypes:['MANUAL','COPY','NOTIFICATION','CONDITION','PARALLEL','SUBPROCESS','SCRIPT','TIMER'],oldModelFieldsOnly:true,oldTimersNaturallyExpired:2,actualTimerScans:2,actualApiRequests:received.length,manualSelfPolicyDecisionSeparate:true,forcedWorkflowOutcomeWrites:0}));
  } catch (error) { failure = error; }
  finally {
    try {
      if (jobId) await waitFor(() => database("SELECT COUNT(*) FROM sys_job_log WHERE job_id=" + jobId + " AND execute_status='RUNNING';"),count => count === '0','Owned old timer scan still active');
      // Discover children even if an earlier assertion failed before recording them.
      for (const item of rows("SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND process_def_key LIKE " + sql(marker + '%') + ';')) if (!instances.includes(item.id)) instances.push(item.id);
      for (const id of [...instances].reverse()) if (!['PASSED','AUTO_PASSED','REJECTED','AUTO_REJECTED','TERMINATED','INVALIDATED'].includes(instance(id)?.status)) successful(await post(admin,base + '/instance/terminate',{instanceId:id,reason:marker + '-cleanup'}),'收尾自有旧节点样本');
      for (const id of definitions) {
        database('DELETE FROM wf_form_draft WHERE tenant_id=100000 AND user_id=' + starter.id + ' AND definition_id=' + sql(id) + ';');
        database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      }
      check('旧节点样本收尾且原权限任务及定时索引保持',grants() === original.grants && config() === original.config && indices() === original.indices && instances.every(id => tasks(id).length === 0));
    } catch (error) { failure = new AggregateError([failure,error].filter(Boolean),'Legacy node sample cleanup failed'); }
    try {
      if (currentWhitelist !== undefined) {
        const ttl = whitelistTtl > 0 ? Math.max(0,whitelistCaptured + whitelistTtl - Date.now()) : whitelistTtl;
        const mode = whitelistBefore === null || ttl === 0 ? 'delete' : ttl > 0 ? 'expire' : 'permanent';
        assert.equal(redis('EVAL',"local v=redis.call('GET',KEYS[1]); if v and v~=ARGV[1] then return 0 end if ARGV[2]=='delete' then redis.call('DEL',KEYS[1]) elseif ARGV[2]=='expire' then redis.call('SET',KEYS[1],ARGV[3],'PX',ARGV[4]) else redis.call('SET',KEYS[1],ARGV[3]) end return 1",1,whitelistKey,currentWhitelist,mode,whitelistBefore ?? '',String(ttl)),'1');
      }
      check('旧API验证后白名单原值有效期和数据库配置保持',whitelistRows() === whitelistDatabaseBefore && (whitelistBefore === null ? redis('EXISTS',whitelistKey) === '0' : whitelistTtl < 0 ? redis('GET',whitelistKey) === whitelistBefore && redis('PTTL',whitelistKey) === '-1' : redis('EXISTS',whitelistKey) === '0' || redis('GET',whitelistKey) === whitelistBefore));
      if (!failure) evidence.b1LegacyNodesRestoration = true;
    } catch (error) { failure = new AggregateError([failure,error].filter(Boolean),'Legacy node whitelist cleanup failed'); }
    if (server.listening) await new Promise((resolve,reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  }
  if (failure) throw failure;
}
