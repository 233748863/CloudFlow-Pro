import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';

export async function verifyA3CrmNotifications({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'A3N' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, ms = 60000) => {
    const until = Date.now() + ms;
    do { const value = await read(); if (accept(value)) return value; await sleep(250); } while (Date.now() < until);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const root = '/auth/system/job'; const crm = state.services.find(item => item.name === 'crm'); assert.ok(crm);
  const owners = rows("SELECT JSON_OBJECT('user',CAST(user_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE user_name IN ('g_holiday_employee','g_import_tenant') AND deleted=0 AND status='0' ORDER BY tenant_id;");
  assert.equal(owners.length, 2); assert.equal(owners[0].tenant, '100000'); assert.equal(owners[1].tenant, '100001');
  for (const owner of owners) for (const value of Object.values(owner)) assert.match(value, /^[1-9][0-9]*$/);
  const redis = await ownedGatewayRedis(state);
  const config = () => database("SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,timeout_seconds,lock_time_seconds,alarm_receiver,deleted FROM sys_job WHERE job_name NOT LIKE " + sql(marker + '%') + ' ORDER BY job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig = config(); const oldGrants = grants();
  const samples = []; const tickets = []; const jobs = []; let lock; let failure;
  const summary = (kind, count) => kind === 'daily' ? 'CRM每日提醒完成：已提交' + count + '条提醒请求' : kind === 'sla' ? '工单时限提醒完成：已提交' + count + '条提醒请求' : '工单违约扫描完成：已更新' + count + '张工单';
  const logs = job => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'duration',duration_ms,'actor',trigger_by,'trigger',trigger_type,'report',report_time) FROM sys_job_log WHERE job_id=" + job.id + ' ORDER BY log_id;');
  const trigger = async job => {
    if (job.last && Date.now() - job.last < 5300) await sleep(5300 - (Date.now() - job.last));
    const result = successful(await api(admin, root + '/' + job.id + '/trigger', { method: 'POST', body: {} }), '实际触发客户提醒');
    assert.equal(result.accepted, true); job.last = Date.now(); return result.executeNo;
  };
  const complete = (job, no) => waitFor(() => logs(job).find(item => item.executeNo === no), item => item && item.status !== 'RUNNING', 'OA scan did not complete', 90000);
  const messages = () => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'biz',biz_type,'bizId',biz_id,'status',send_status,'skipReason',skip_reason,'channel',channel_type,'title',title,'content',content) FROM sys_message_record WHERE COALESCE(biz_type,'')<>'SYS_JOB' AND title LIKE " + sql('%' + marker + '%') + ' ORDER BY record_id;');
  const alarm = async failed => {
    const result = await waitFor(() => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id=" + sql(failed.executeNo) + ';'), items => items.length === 1 && items[0].status === 'SUCCESS', 'OA failure alarm missing');
    check('客户失败告警真实送达指定人', result[0].user === owners[0].user);
    successful(await api(employee, '/auth/system/message/mine/' + result[0].id), '员工读取客户任务失败告警');
  };
  const verifiedSuccess = async (job, expected, text) => {
    const no = await trigger(job); const result = await complete(job, no);
    check(job.kind + '实际成功数量摘要及耗时准确', result.status === 'SUCCESS' && result.affected === expected && result.message === text
      && Number.isInteger(result.duration) && result.actor === 'g_import_admin' && result.trigger === 'MANUAL' && result.report);
    const target = '/inner/job/status/' + no; const headers = signJobRequest(keys, 'cloudflow-auth', 'cloudflow-service-crm', 'GET', target, '');
    secrets.add(headers['X-Job-Signature']);
    const response = await fetch('http://127.0.0.1:' + crm.port + target, { headers, signal: AbortSignal.timeout(10000) }); const body = await response.json();
    check(job.kind + '服务签名反查与归档一致', response.status === 200 && body.code === 200 && body.data.affectedRows === expected && body.data.resultMsg === text);
    return result;
  };
  const openLock = async sample => {
    const env = { ...process.env }; delete env.MYSQL_PWD;
    const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--batch', '--raw', '--skip-column-names', '--unbuffered', 'cloud_flow_db'], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let exited = false; let processError = false; let released = false;
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => { processError = true; }); child.on('error', () => { processError = true; }); child.stdin.on('error', () => { processError = true; });
    const completion = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
    const release = async () => {
      if (!released) { released = true; clearTimeout(safety); if (!exited) child.stdin.end("ROLLBACK; SELECT 'A3_CRM_RELEASED';\n"); }
      const code = await Promise.race([completion, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') { child.kill(); await completion; throw new Error('Owned ticket lock release timed out'); }
      assert.ok(code === 0 && !processError && output.includes('A3_CRM_RELEASED'), 'Owned ticket lock helper failed');
    };
    const safety = setTimeout(() => { void release().catch(() => {}); }, 40000);
    lock = { release, connection: null };
    child.stdin.write('START TRANSACTION; SELECT ticket_id FROM crm_service_ticket WHERE ticket_id=' + sample.id + ' AND create_by=' + sql(marker) + " FOR UPDATE; SELECT CONCAT('A3_CRM_READY:',CONNECTION_ID());\n");
    await waitFor(() => output, value => /A3_CRM_READY:[0-9]+/.test(value), 'Borrow lock not ready', 5000);
    lock.connection = output.match(/A3_CRM_READY:([0-9]+)/)[1];
  };
  const getTicket = item => rows("SELECT JSON_OBJECT('id',CAST(ticket_id AS CHAR),'sla',sla_status,'response',response_breached_flag,'resolution',resolution_breached_flag,'deleted',deleted) FROM crm_service_ticket WHERE ticket_id=" + item.id + ';')[0];
  const ownedMessages = item => messages().filter(message => message.title.endsWith(item.name));
  const expectedLeader = owner => {
    let dept = owner.dept; const seen = new Set();
    while (dept && dept !== '0' && !seen.has(dept)) {
      seen.add(dept);
      const records = rows("SELECT JSON_OBJECT('parent',CAST(parent_id AS CHAR),'leader',leader) FROM sys_dept WHERE tenant_id=" + owner.tenant + ' AND dept_id=' + dept + " AND deleted=0 AND status='0';");
      if (!records.length) return null;
      const {parent,leader} = records[0];
      if (leader?.trim()) {
        const matches = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR)) FROM sys_user WHERE tenant_id=" + owner.tenant + " AND deleted=0 AND status='0' AND (CAST(user_id AS CHAR)=" + sql(leader) + ' OR user_name=' + sql(leader) + ' OR nick_name=' + sql(leader) + ');');
        if (matches.length === 1 && matches[0].id !== owner.user) return matches[0].id;
      }
      dept = parent;
    }
    return null;
  };
  const faultScan = async (job, item) => {
    await openLock(item); const no = await trigger(job);
    const waits = await waitFor(() => rows("SELECT JSON_OBJECT('connection',CAST(r.PROCESSLIST_ID AS CHAR),'db',d.OBJECT_SCHEMA,'table',d.OBJECT_NAME,'index',d.INDEX_NAME,'data',d.LOCK_DATA) FROM performance_schema.data_lock_waits w JOIN performance_schema.threads b ON b.THREAD_ID=w.BLOCKING_THREAD_ID JOIN performance_schema.threads r ON r.THREAD_ID=w.REQUESTING_THREAD_ID JOIN performance_schema.data_locks d ON d.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND d.ENGINE=w.ENGINE WHERE b.PROCESSLIST_ID=" + lock.connection + ';'), values => values.length > 0, 'CRM scan did not reach owned ticket lock', 25000);
    assert.ok(waits.length === 1 && waits[0].db === 'cloud_flow_db' && waits[0].table === 'crm_service_ticket' && waits[0].index === 'PRIMARY' && waits[0].data === item.id);
    assert.match(waits[0].connection, /^[1-9][0-9]*$/); database('KILL QUERY ' + waits[0].connection + ';');
    const result = await complete(job, no); await lock.release();
    check(job.kind + '单工单真实查询失败上报并保留工单租户和原异常', result.status === 'FAILED' && result.affected === null
      && result.stack.includes('工单时限扫描存在失败工单') && result.stack.includes(item.id) && result.stack.includes(item.tenant));
    await alarm(result); return result;
  };
  try {
    for (const [id,handler,kind] of [[104,'crmDailyDispatch','daily'],[105,'ticketSlaDispatch','sla'],[1552,'crmSlaBreachScan','breach']]) {
      const original = successful(await api(admin,root + '/' + id),'读取原客户提醒任务');
      assert.ok(original.handlerName === handler && original.status === 'PAUSED');
      assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE deleted=0 AND status='ENABLED' AND handler_name=" + sql(handler) + ';'),'0');
      const name = marker + kind;
      successful(await api(admin,root,{ method:'POST',body:{ ...original,jobId:undefined,jobName:name,jobGroup:'A3_VERIFY',handlerParam:marker,
        status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,
        dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:owners[0].user,logSuccessFlag:1 }}),'建立暂停客户提醒验证任务');
      const job = {id:database('SELECT job_id FROM sys_job WHERE job_name=' + sql(name) + ' AND deleted=0;'),kind};
      assert.match(job.id,/^[1-9][0-9]*$/); jobs.push(job);
      const baseline = await complete(job,await trigger(job));
      check(kind + '原隔离数据首轮真实扫描成功并保留结果',baseline.status === 'SUCCESS' && Number.isInteger(baseline.affected) && baseline.affected >= 0 && baseline.message === summary(kind,baseline.affected));
      job.baseline = baseline.affected;
      console.log('A3_CRM_NOTIFICATIONS_BASELINE: ' + JSON.stringify({kind,jobId:job.id,count:baseline.affected}));
    }
    for (const [index,owner] of owners.entries()) {
      const name = marker + index; const sample = {...owner,name}; samples.push(sample);
      database('INSERT INTO crm_customer(tenant_id,customer_code,customer_name,owner_id,dept_id,pool_flag,last_follow_up_time,create_by) VALUES('
        + owner.tenant + ',' + sql(name) + ',' + sql(name) + ',' + owner.user + ',' + owner.dept + ",'0',DATE_SUB(NOW(),INTERVAL 60 DAY)," + sql(marker) + ');');
      sample.customer = database('SELECT customer_id FROM crm_customer WHERE customer_code=' + sql(name) + ';'); assert.match(sample.customer,/^[1-9][0-9]*$/);
      database('INSERT INTO crm_receivable(tenant_id,customer_id,customer_name,receivable_no,receivable_name,planned_amount,outstanding_amount,due_date,owner_id,create_by) VALUES('
        + owner.tenant + ',' + sample.customer + ',' + sql(name) + ',' + sql(name) + ',' + sql(name) + ',100,100,CURRENT_DATE,' + owner.user + ',' + sql(marker) + ');');
      database('INSERT INTO crm_opportunity(tenant_id,customer_id,customer_name,opportunity_name,owner_id,dept_id,latest_follow_up_time,create_by) VALUES('
        + owner.tenant + ',' + sample.customer + ',' + sql(name) + ',' + sql(name) + ',' + owner.user + ',' + owner.dept + ',DATE_SUB(NOW(),INTERVAL 60 DAY),' + sql(marker) + ');');
      database('INSERT INTO crm_sla_policy(tenant_id,policy_code,policy_name,round_the_clock_flag,apply_for_resolution,create_by) VALUES('
        + owner.tenant + ',' + sql(name) + ',' + sql(name) + ',1,0,' + sql(marker) + ');');
      sample.policy = database('SELECT policy_id FROM crm_sla_policy WHERE tenant_id=' + owner.tenant + ' AND policy_code=' + sql(name) + ';'); assert.match(sample.policy,/^[1-9][0-9]*$/);
    }
    const [daily,sla,breach] = jobs;
    await verifiedSuccess(daily,daily.baseline + 6,summary('daily',daily.baseline + 6));
    const dailyMessages = await waitFor(() => messages().filter(item=>item.biz==='LEGACY_NOTICE'),items=>items.length===6 && items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Daily sample messages not terminal');
    check('每日三类提醒按租户归属本人且三个业务标题齐全',samples.every(sample=>{
      const values=dailyMessages.filter(item=>item.tenant===sample.tenant);
      return values.length===3 && values.every(item=>item.user===sample.user) && ['跟进逾期提醒','回款即将到期','商机停滞提醒'].every(label=>values.some(item=>item.title.startsWith(label)));
    }));
    evidence.daily=true;
    for (const sample of samples) {
      const kinds = sample.tenant==='100000' ? ['due','approaching','noOwner','paused','fulfilled','early','deleted','notApplicable'] : ['due'];
      for (const kind of kinds) {
        const name=sample.name+kind;
        const due=kind==='early' ? 'DATE_ADD(NOW(),INTERVAL 1 DAY)' : kind==='approaching' ? 'DATE_ADD(NOW(),INTERVAL 20 MINUTE)' : 'DATE_SUB(NOW(),INTERVAL 10 MINUTE)';
        database('INSERT INTO crm_service_ticket(tenant_id,customer_id,customer_name,ticket_no,ticket_title,owner_id,opened_time,sla_policy_id,first_response_due,sla_status,pause_start_time,resolution_minutes,deleted,create_by) VALUES('
          +sample.tenant+','+sample.customer+','+sql(sample.name)+','+sql(name)+','+sql(name)+','+(kind==='noOwner'?'NULL':sample.user)
          +',DATE_SUB(NOW(),INTERVAL 120 MINUTE),'+sample.policy+','+due+','+sql(kind==='paused'?'PAUSED':kind==='fulfilled'?'FULFILLED':kind==='notApplicable'?'NOT_APPLICABLE':'ONGOING')
          +','+(kind==='paused'?'DATE_SUB(NOW(),INTERVAL 30 MINUTE)':'NULL')+','+(kind==='fulfilled'?'60':'NULL')+','+(kind==='deleted'?1:0)+','+sql(marker)+');');
        const item={...sample,kind,name,id:database('SELECT ticket_id FROM crm_service_ticket WHERE tenant_id='+sample.tenant+' AND ticket_no='+sql(name)+';')};
        assert.match(item.id,/^[1-9][0-9]*$/); tickets.push(item);
      }
    }
    const active=tickets.filter(item=>['due','approaching'].includes(item.kind)); assert.equal(active.length,3);
    const failed=await faultScan(sla,active[0]);
    await waitFor(()=>messages().filter(item=>item.biz==='CRM_TICKET_SLA'),items=>items.length===2,'Other ticket notices did not continue');
    check('时限提醒失败后本租户后续工单及其他租户继续',ownedMessages(active[0]).length===0 && active.slice(1).every(item=>ownedMessages(item).length===1));
    evidence.slaFailure=true;
    await verifiedSuccess(sla,sla.baseline+3,summary('sla',sla.baseline+3));
    await waitFor(()=>messages().filter(item=>item.biz==='CRM_TICKET_SLA'),items=>items.length===3 && items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Recovered SLA notice missing');
    check('恢复后到期及80%提醒均唯一且六类排除工单无消息',active.every(item=>ownedMessages(item).length===1)
      && tickets.filter(item=>!active.includes(item)).every(item=>ownedMessages(item).length===0)
      && ownedMessages(active.find(item=>item.kind==='approaching'))[0].bizId.endsWith(':RESPONSE_APPROACHING'));
    const beforeRepeat=JSON.stringify(messages());
    await verifiedSuccess(sla,sla.baseline+3,summary('sla',sla.baseline+3));
    await sleep(1200);
    check('工单提醒重扫返回请求数且未新增重复消息',JSON.stringify(messages())===beforeRepeat);
    evidence.sla=true; evidence.boundaries=true; evidence.deduplication=true;
    for (const item of tickets.filter(item=>!active.includes(item))) database('UPDATE crm_service_ticket SET deleted=1 WHERE ticket_id='+item.id+' AND create_by='+sql(marker)+';');
    const approaching=active.find(item=>item.kind==='approaching');
    database('UPDATE crm_service_ticket SET first_response_due=DATE_SUB(NOW(),INTERVAL 10 MINUTE) WHERE ticket_id='+approaching.id+' AND create_by='+sql(marker)+';');
    const breachFailed=await faultScan(breach,active[0]);
    check('违约单工单失败保持原状态而后续及其他租户继续',getTicket(active[0]).sla==='ONGOING' && getTicket(active[0]).response===0
      && active.slice(1).every(item=>getTicket(item).sla==='RESPONSE_BREACHED' && getTicket(item).response===1));
    evidence.breachFailure=true;
    await verifiedSuccess(breach,1,summary('breach',1));
    check('恢复只更新遗漏的一张违约工单',active.every(item=>getTicket(item).sla==='RESPONSE_BREACHED' && getTicket(item).response===1));
    await verifiedSuccess(breach,0,summary('breach',0)); evidence.breach=true;
    const expected=active.flatMap(item=>[item.user,...(expectedLeader(item)?[expectedLeader(item)]:[])].map(user=>({tenant:item.tenant,user,bizId:item.id+':RESPONSE_BREACHED'})));
    const delivered=await waitFor(messages,items=>items.length===9+expected.length && items.every(item=>['SUCCESS','SKIPPED'].includes(item.status)),'Business messages not terminal');
    check('违约提醒发给负责人及可唯一识别的上级',expected.every(item=>delivered.filter(message=>message.tenant===item.tenant && message.user===item.user && message.bizId===item.bizId).length===1));
    check('各租户消息渠道结果如实记录',delivered.filter(item=>item.tenant==='100000').every(item=>item.status==='SUCCESS')
      && delivered.filter(item=>item.tenant==='100001').every(item=>item.status==='SKIPPED' && item.skipReason==='NO_CHANNEL'));
    for(const message of delivered.filter(item=>item.tenant==='100000' && item.user===owners[0].user)) successful(await api(employee,'/auth/system/message/mine/'+message.id),'本人读取客户提醒');
    const denied=await api(employee,root+'/log/'+failed.id);
    check('普通员工无法读取后台失败详情',denied.status===403 && !denied.body?.data);
    const other=await api(employee,'/auth/system/message/mine/'+delivered.find(item=>item.tenant==='100001').id);
    check('客户提醒禁止跨租户读取',([403,404].includes(other.status)||[403,404].includes(other.body?.code))&&!other.body?.data);
    const before=JSON.stringify(messages()); await sleep(1200);
    check('重复违约扫描无新增消息',JSON.stringify(messages())===before);
    evidence.delivery=true; evidence.permissions=true;
    console.log('A3_CRM_NOTIFICATIONS_ACTUAL: '+JSON.stringify({jobs:jobs.map(job=>({id:job.id,kind:job.kind,baseline:job.baseline})),fixtureTenants:2,
      sampleTickets:tickets.length,businessMessages:delivered.length,successes:delivered.filter(item=>item.status==='SUCCESS').length,
      skipped:delivered.filter(item=>item.status==='SKIPPED').length,forcedTerminalWrites:0,dailyDeduplicationVerified:false}));
  } catch(error) { failure=error; }
  finally {
    try { if(lock) await lock.release(); } catch(error) { failure ||= error; }
    try {
      for(const job of jobs) await waitFor(()=>logs(job),values=>values.every(item=>item.status!=='RUNNING'),'CRM job still running at cleanup',90000);
      for(const table of ['crm_service_ticket','crm_sla_policy','crm_customer','crm_receivable','crm_opportunity']) database('UPDATE '+table+' SET deleted=1 WHERE create_by='+sql(marker)+';');
      check('客户自有样本停用且原任务授权保持并保留消息审计',config()===oldConfig && grants()===oldGrants && tickets.every(item=>getTicket(item).deleted===1));
      check('工单自有行锁连接关闭',!lock?.connection || database('SELECT COUNT(*) FROM information_schema.processlist WHERE ID='+lock.connection+';')==='0');
      evidence.restoration=true;
    } catch(error) { failure ||= error; }
  }
  let files = 0; let bytes = 0; let leaks = 0;
  for (const item of state.services) {
    const directory = path.join(state.run, item.name); const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) { const scan = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks; }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('客户提醒任务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log('A3_CRM_NOTIFICATIONS_SECRET_SCAN: ' + JSON.stringify({ files, bytes, values: secrets.size, leaks, databaseBytes: audit.bytes, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
