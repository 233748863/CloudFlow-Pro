import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// Real workflow HTTP endpoints and real outbound TCP, with an exclusively owned receiving service.
export async function verifyWorkflowHttpTrigger({ admin, employee, api, successful, database, check, caseTag, secrets, evidence, redis }) {
  const marker = 'B2HT' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label) => { const deadline = Date.now() + 30000; do { const value = await read(); if (accept(value)) return value; await sleep(100); } while (Date.now() < deadline); throw new Error(label); };
  const headerSecret = 'fixture-' + randomUUID(); secrets.add(headerSecret);
  const received = [], behaviors = new Map(), timers = new Set(), definitions = [], samples = [];
  const configKey = '100000:sys:config:tenant:workflow.trigger.url.whitelist';
  const original = redis('EXISTS', configKey) === '1' ? redis('GET', configKey) : null;
  const originalTtl = Number(redis('PTTL', configKey)), capturedAt = Date.now();
  const configRows = () => database("SELECT config_id,SHA2(JSON_ARRAY(tenant_id,config_name,config_key,config_value,config_type,config_scope,create_by,create_time,update_by,update_time,remark),256) FROM sys_config WHERE config_key='workflow.trigger.url.whitelist' ORDER BY tenant_id,config_id;");
  const beforeConfig = configRows(); let currentConfig, formId, failure;
  const server = createServer((request, response) => {
    if (!request.url?.startsWith('/' + marker + '/')) { response.writeHead(404).end(); return; }
    const name = request.url.slice(marker.length + 2), behavior = behaviors.get(name);
    let body = '';
    request.on('data', chunk => { body += chunk.toString(); if (body.length > 16384) request.destroy(); });
    request.on('end', () => {
      received.push({ name, method: request.method, identity: request.headers['x-workflow-trigger-id'], authorized: request.headers.authorization === 'Bearer ' + headerSecret, body });
      if (!behavior) { response.writeHead(404).end(); return; }
      const send = () => {
        if (response.destroyed) return;
        if (behavior.redirect) { response.writeHead(302, { Location: '/' + marker + '/unexpected' }).end(); return; }
        response.writeHead(behavior.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accepted: behavior.status === 200, marker, scenario: name }));
      };
      if (behavior.delay) { const timer = setTimeout(() => { timers.delete(timer); send(); }, behavior.delay); timers.add(timer); }
      else send();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); assert.ok(address && typeof address === 'object' && address.address === '127.0.0.1');
  const origin = 'http://127.0.0.1:' + address.port;
  const configure = value => {
    const next = JSON.stringify(value), expected = currentConfig ?? original;
    const result = redis('EVAL', "local old=redis.call('GET',KEYS[1]); if ARGV[1]=='absent' then if old then return 0 end elseif old~=ARGV[2] then return 0 end redis.call('SET',KEYS[1],ARGV[3],'PX',1800000); return 1", 1, configKey, expected === null ? 'absent' : 'present', expected ?? '', next);
    assert.equal(result, '1', 'Whitelist changed by another writer'); currentConfig = next;
  };
  const instance = id => rows("SELECT JSON_OBJECT('id',instance_id,'status',status,'variables',CAST(variables AS JSON)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=" + sql(id) + ';')[0];
  const deadLetter = id => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'retry',retry_count,'payload',payload_json) FROM wf_callback_dead_letter WHERE tenant_id=100000 AND process_instance_id=" + sql(id) + " AND business_type='WORKFLOW_TRIGGER' ORDER BY id;");
  const hits = name => received.filter(item => item.name === name);
  const start = async (name, props = {}) => {
    const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'trigger', type: 'SCRIPT', title: '外部调用', props: { triggerType: 'HTTP_CALLBACK', actionUrl: origin + '/' + marker + '/' + name, actionMethod: 'POST', actionHeaders: { Authorization: 'Bearer ' + headerSecret }, actionBody: { marker, scenario: name }, callAsync: false, failStrategy: 'BLOCK', retryCount: 0, timeoutSeconds: 3, ...props } }, { id: 'end', type: 'END', title: '结束' }], edges: [{ id: 'start-trigger', source: 'start', target: 'trigger' }, { id: 'trigger-end', source: 'trigger', target: 'end' }] };
    const saved = successful(await post(admin, base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name, formId, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' }), '保存外调验证定义');
    const definition = saved.definitionId ?? saved.id; assert.ok(definition); definitions.push(definition);
    check('外调定义保存时请求凭据加密', !database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(definition) + ';').includes(headerSecret));
    successful(await post(admin, base + '/definition/deploy/' + definition), '发布外调验证定义');
    const context = successful(await api(employee, base + '/draft/context/' + definition), '员工读取外调发起上下文');
    const draft = successful(await post(employee, base + '/draft', { definitionId: definition, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker + '-' + name, formData: { note: marker }, nodeAssignees: {} }), '员工保存外调草稿');
    const began = Date.now();
    const started = successful(await post(employee, base + '/start', { draftId: draft.draftId, expectedVersion: draft.lockVersion }), '员工发起真实外调流程');
    const id = started.instanceId ?? started.processInstanceId; assert.ok(id); const sample = { id, name, elapsed: Date.now() - began, async: Boolean(props.callAsync) }; samples.push(sample);
    await waitFor(() => instance(id), value => value && !['RUNNING', 'PENDING'].includes(value.status), 'External trigger workflow did not finish');
    return sample;
  };
  const assertPassed = sample => check(sample.name + '调用后继续并自动结束流程', instance(sample.id).status === 'AUTO_PASSED');
  try {
    const recoveryTag = process.env.CLOUDFLOW_B2_HTTP_RECOVERY_MARKER;
    if (recoveryTag) {
      assert.match(recoveryTag, /^[a-f0-9]{12}$/); assert.notEqual(recoveryTag, caseTag);
      const key = 'B2HT' + recoveryTag + '-failure-to_dlq';
      const previous = rows("SELECT JSON_OBJECT('id',CAST(l.id AS CHAR),'instance',i.instance_id,'status',l.status,'instanceStatus',i.status,'deleted',d.deleted) FROM wf_callback_dead_letter l JOIN wf_process_instance i ON i.instance_id=l.process_instance_id AND i.tenant_id=l.tenant_id JOIN wf_process_definition d ON d.definition_id=i.definition_id AND d.tenant_id=i.tenant_id WHERE l.tenant_id=100000 AND l.business_type='WORKFLOW_TRIGGER' AND i.process_def_key=" + sql(key) + ' AND i.title=' + sql(key) + ' AND d.process_key=' + sql(key) + ';');
      assert.equal(previous.length, 1, 'Recovery requires exactly the identified owned sample');
      const old = previous[0]; assert.equal(old.deleted, 1); assert.equal(old.instanceStatus, 'AUTO_PASSED');
      assert.ok(['PENDING', 'IGNORED'].includes(old.status), 'Unexpected recovery record state');
      if (old.status === 'PENDING') successful(await post(admin, base + '/callback/dlq/' + old.id + '/ignore'), '收尾指定旧轮外调验证记录');
      check('指定旧轮外调失败记录通过管理入口收尾且保留历史', deadLetter(old.instance).length === 1 && deadLetter(old.instance)[0].status === 'IGNORED');
      console.log('B2_HTTP_TRIGGER_RECOVERY: ' + JSON.stringify({ marker: recoveryTag, deadLetter: old.id, status: 'IGNORED', historyRetained: true }));
    }
    const form = successful(await post(admin, base + '/form/save', { formKey: marker, formName: marker, fieldsJson: JSON.stringify([{ id: 'note', type: 'TEXT', label: '说明' }]) }), '建立外调验证表单'); formId = form.formId ?? form.id; assert.ok(formId);
    configure('[]');
    for (const [name, url] of [['denied-loopback', origin + '/' + marker + '/denied-loopback'], ['denied-private', 'http://10.0.0.1/'], ['denied-lan', 'http://192.168.1.1/'], ['denied-scheme', 'file:///C:/Windows/win.ini']]) {
      const sample = await start(name, { actionUrl: url });
      check(name + '未授权地址或协议在真实流程中被拒绝', instance(sample.id).status === 'FAILED' && received.length === 0);
    }
    evidence.httpAddressProtection = true;
    configure('127.0.0.1');
    behaviors.set('sync-success', { status: 200 });
    const success = await start('sync-success'); assertPassed(success);
    check('同步外调真实收到方法请求体凭据及稳定请求编号', hits(success.name).length === 1 && hits(success.name)[0].method === 'POST' && hits(success.name)[0].authorized && JSON.parse(hits(success.name)[0].body).marker === marker && /^[a-f0-9-]{36}$/.test(hits(success.name)[0].identity));
    check('同步响应写入真实流程变量', instance(success.id).variables._apiStatusCode_trigger === 200 && JSON.parse(instance(success.id).variables._apiResponse_trigger).scenario === success.name); evidence.httpSyncSuccess = true;
    for (const strategy of ['BLOCK', 'SKIP', 'TO_DLQ']) {
      const name = 'failure-' + strategy.toLowerCase(); behaviors.set(name, { status: 503 });
      const sample = await start(name, { failStrategy: strategy });
      check(name + '真实失败按既定策略处理', hits(name).length === 1 && instance(sample.id).status === (strategy === 'BLOCK' ? 'FAILED' : 'AUTO_PASSED'));
      const letters = deadLetter(sample.id);
      check(name + '失败登记与策略一致', letters.length === (strategy === 'TO_DLQ' ? 1 : 0));
      if (strategy === 'TO_DLQ') {
        const letter = letters[0], payload = JSON.stringify(letter.payload);
        check('外调失败重放数据加密保存', letter.status === 'PENDING' && letter.payload !== null && typeof letter.payload === 'object' && !payload.includes(headerSecret) && !payload.includes(origin));
        const denied = await post(employee, base + '/callback/dlq/' + letter.id + '/replay'); check('普通员工不能重放后台外调', denied.status === 403);
        const failedReplay = await post(admin, base + '/callback/dlq/' + letter.id + '/replay'); check('外调重放失败时记录继续保留', failedReplay.body?.code !== 200 && deadLetter(sample.id)[0].status === 'PENDING');
        behaviors.set(name, { status: 200 }); await sleep(5500);
        successful(await post(admin, base + '/callback/dlq/' + letter.id + '/replay'), '管理员重放真实失败外调');
        check('外调恢复重放完成且沿用原请求编号', deadLetter(sample.id)[0].status === 'REPLAYED' && hits(name).length === 3 && new Set(hits(name).map(item => item.identity)).size === 1 && instance(sample.id).status === 'AUTO_PASSED');
        await sleep(5500); const before = received.length, repeated = await post(admin, base + '/callback/dlq/' + letter.id + '/replay');
        check('已完成外调重放不能再次发送', repeated.body?.code !== 200 && received.length === before); evidence.httpReplay = true;
      }
    }
    evidence.httpFailureStrategies = true;
    behaviors.set('redirect', { redirect: true }); const redirected = await start('redirect', { failStrategy: 'SKIP' }); assertPassed(redirected);
    check('真实302响应未被自动跟随', hits('redirect').length === 1 && hits('unexpected').length === 0); evidence.httpNoRedirect = true;
    behaviors.set('timeout', { status: 200, delay: 3000 }); const timeout = await start('timeout', { timeoutSeconds: 1, failStrategy: 'SKIP' }); assertPassed(timeout);
    check('同步外调一秒超时后按跳过策略返回', timeout.elapsed >= 900 && timeout.elapsed < 8000 && hits('timeout').length === 1); evidence.httpTimeout = true;
    behaviors.set('async-success', { status: 200 }); const asynchronous = await start('async-success', { callAsync: true }); assertPassed(asynchronous);
    const messages = rows("SELECT JSON_OBJECT('status',status,'retry',retry_count,'content',content) FROM wf_transaction_message WHERE tenant_id=100000 AND business_id=" + sql(asynchronous.id) + " AND business_type='WORKFLOW_TRIGGER';");
    check('异步HTTP在真实后台完成且持久请求加密', hits(asynchronous.name).length === 1 && messages.length === 1 && messages[0].status === 'SUCCESS' && messages[0].retry === 1 && !messages[0].content.includes(headerSecret)); evidence.httpAsyncSuccess = true;
    console.log('B2_HTTP_TRIGGER_ACTUAL: ' + JSON.stringify({ workflows: samples.length, realOutboundRequests: received.length, listenerLoopback: true, realWorkflowEndpoints: true, whitelistScopedToTenant: 100000, failStrategies: 3, realDeadLetterReplay: true, forcedWorkflowOutcomeWrites: 0 }));
  } catch (error) { failure = error; }
  finally {
    try {
      for (const sample of samples) {
        for (const letter of deadLetter(sample.id)) if (letter.status === 'PENDING') {
          successful(await post(admin, base + '/callback/dlq/' + letter.id + '/ignore'), '收尾本轮外调验证失败记录');
          check('本轮未完成重放记录已忽略并保留历史', deadLetter(sample.id).find(item => item.id === letter.id)?.status === 'IGNORED');
        }
        if (['RUNNING', 'PENDING', 'PAUSED', 'FAILED', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED'].includes(instance(sample.id).status)) successful(await post(admin, base + '/instance/terminate', { instanceId: sample.id, reason: marker + '-cleanup' }), '结束自有外调验证流程');
      }
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'HTTP trigger workflow cleanup failed'); }
    try {
      if (currentConfig !== undefined) {
        const ttl = originalTtl > 0 ? Math.max(0, capturedAt + originalTtl - Date.now()) : originalTtl;
        const mode = original === null || ttl === 0 ? 'delete' : ttl > 0 ? 'expire' : 'permanent';
        assert.equal(redis('EVAL', "local v=redis.call('GET',KEYS[1]); if v and v~=ARGV[1] then return 0 end if ARGV[2]=='delete' then redis.call('DEL',KEYS[1]) elseif ARGV[2]=='expire' then redis.call('SET',KEYS[1],ARGV[3],'PX',ARGV[4]) else redis.call('SET',KEYS[1],ARGV[3]) end return 1", 1, configKey, currentConfig, mode, original ?? '', String(ttl)), '1');
      }
      check('外调原白名单配置恢复且数据库参数保持', configRows() === beforeConfig && (original === null ? redis('EXISTS', configKey) === '0' : originalTtl < 0 ? redis('GET', configKey) === original && redis('PTTL', configKey) === '-1' : redis('EXISTS', configKey) === '0' || redis('GET', configKey) === original)); evidence.httpRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'HTTP trigger whitelist restoration failed'); }
    for (const timer of timers) clearTimeout(timer);
    await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  }
  if (failure) throw failure;
}
