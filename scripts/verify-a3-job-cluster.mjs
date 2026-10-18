import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { observeA3SchedulerRedis } from './observe-a3-scheduler-redis.mjs';

export async function verifyA3JobCluster({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = 'a3_cluster_' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (read, accept, label, milliseconds = 30000) => {
    const deadline = Date.now() + milliseconds;
    do { const value = await read(); if (accept(value)) return value; await sleep(200); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const keys = await readOwnedJobKeys(state);
  const redis = await ownedGatewayRedis(state);
  const secrets = new Set([...accounts.map(item => item.password).filter(Boolean), ...Object.values(keys)]);
  const employee = await session('g_holiday_employee');
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }

  const root = '/auth/system/job';
  const statePath = path.join(state.run, 'state.json');
  const clusterDirectory = path.join(state.run, 'private', 'a3-cluster-' + caseTag);
  const clusterFile = path.join(clusterDirectory, 'cluster.json');
  const capacityFile = path.join(state.run, 'private', 'a3-peer-capacity-' + caseTag + '.json');
  const observationFile = path.join(state.run, 'a3-cluster-' + caseTag + '-redis.json');
  const peerDirectories = Object.fromEntries(['auth','hr'].map(name => [name, path.join(state.run, 'private', 'a3-peer-' + name + '-' + caseTag)]));
  const peers = {}; const processes = {};
  const ports = Object.fromEntries(['authBase','authPeer','hrBase','hrPeer'].map(name => [name, new Set()]));
  const helperLogs = []; const contracts = []; const manuals = [];
  const captured = new Map(); let captureChain = Promise.resolve();
  let sequence = 0; let jobId; let observer; let failure; let employeeId; let createdEmployee = false;
  let internalRequests = 0; let directManagementRequests = 0; let collect = false; let collection; let collectionFailure;
  const readManifest = filename => fs.readFile(filename, 'utf8').then(value => JSON.parse(value.replace(/^\uFEFF/, '')))
    .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const operate = async (action, service) => {
    const out = path.join(state.run, 'private', 'a3-cluster-' + caseTag + '-' + action + '-' + (service || 'cluster') + (++sequence) + '.stdout.log');
    const err = out.replace('.stdout.log', '.stderr.log');
    const output = await fs.open(out, 'wx'); const errors = await fs.open(err, 'wx'); helperLogs.push(out, err);
    let code;
    try {
      const capacity = ['Reserve','RestoreCapacity'].includes(action);
      const peer = ['Prepare','Start','Stop'].includes(action);
      const script = capacity ? 'scripts/operate-a3-peer-capacity.ps1' : peer ? 'scripts/operate-a3-job-peer.ps1' : 'scripts/operate-a3-cluster.ps1';
      const actualAction = ['RestoreCapacity','RestoreRoutes'].includes(action) ? 'Restore' : action;
      const args = ['-NoLogo','-NoProfile','-File',script,'-StatePath',statePath,'-Action',actualAction,'-Marker',caseTag];
      if (peer) args.push('-ServiceName',service);
      if (action === 'Prepare') args.push('-ClusterPair');
      // Measured original processes use 848/637 MiB privately with unchanged 512 MiB heaps.
      // Reserve 2560 MiB; each actual peer still independently requires 1536 MiB before start.
      if (action === 'Reserve') args.push('-RequiredFreeMiB','2560');
      if (action === 'Configure') args.push('-JobId',String(jobId));
      code = await new Promise((resolve,reject) => {
        const child = spawn('C:/Program Files/PowerShell/7/pwsh.exe',args,{windowsHide:true,stdio:['ignore',output.fd,errors.fd]});
        child.once('error',reject); child.once('exit',resolve);
      });
    } finally { await output.close(); await errors.close(); }
    assert.equal(code,0,'Owned cluster '+action+' failed; inspect retained diagnostics');
    const lines=(await fs.readFile(out,'utf8')).split(/\r?\n/).filter(line=>/^(A3_PEER_|A3_CAPACITY_|A3_CLUSTER_)/.test(line));
    assert.equal(lines.length,1);
    if(action==='Connections'){
      const current=JSON.parse(lines[0].slice('A3_CLUSTER_CONNECTIONS: '.length));
      for(const [name,value] of Object.entries(current)){
        if(processes[name]) assert.equal(value.process,processes[name]); else processes[name]=value.process;
        for(const port of value.ports) ports[name].add(port);
      }
      const allPorts=Object.values(ports).flatMap(value=>[...value]);
      assert.equal(new Set(allPorts).size,allPorts.length,'Four Redis client owners must be distinct');
    }else console.log(lines[0]);
  };
  const ownerOf = event => Object.keys(ports).find(name=>ports[name].has(event.port)) || 'unknown';
  const config = () => database("SELECT tenant_id,job_id,job_name,job_group,service_name,handler_name,COALESCE(handler_param,''),trigger_type,COALESCE(cron_expression,''),COALESCE(interval_ms,0),status,concurrent_flag,misfire_strategy,retry_count,retry_interval_sec,dispatch_retry_count,dispatch_retry_interval_sec,timeout_seconds,lock_time_seconds,critical_flag,log_success_flag,alarm_on_fail_flag,COALESCE(alarm_receiver,''),deleted FROM sys_job WHERE job_name<>" + sql(marker) + ' ORDER BY tenant_id,job_id;');
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalConfig = config(); const originalGrants = grants();
  const contractMessages = () => database("SELECT COUNT(*) FROM sys_message_record WHERE biz_type IN ('HR_CONTRACT_EXPIRING','HR_CONTRACT_EXPIRED');");
  const initialMessages = contractMessages();
  const enabledJobs = rows("SELECT JSON_OBJECT('service',service_name,'handler',handler_name) FROM sys_job WHERE deleted=0 AND status='ENABLED' ORDER BY handler_name;");
  assert.deepEqual(enabledJobs, ['imCallbackRecovery', 'imSyncRecovery', 'imTodoRecovery'].map(handler => ({ service: 'auth', handler })), 'Only the three original IM recovery schedules may remain enabled');
  const settleOtherWork = async phase => {
    const deadline = Date.now() + 270000;
    let announced = false;
    do {
      const pending = rows("SELECT JSON_OBJECT('executeNo',l.execute_no,'jobId',CAST(l.job_id AS CHAR),'handler',j.handler_name,'due',IF(DATE_ADD(l.start_time,INTERVAL j.timeout_seconds SECOND)<NOW(),1,0)) FROM sys_job_log l JOIN sys_job j ON j.job_id=l.job_id WHERE l.execute_status='RUNNING';")
        .filter(row => row.jobId !== jobId);
      if (!pending.length) return;
      assert.ok(pending.every(row => enabledJobs.some(job => job.handler === row.handler)), 'Unexpected pending work must be reviewed');
      if (!announced) { console.log('A3_CLUSTER_OTHER_WORK_WAIT: ' + JSON.stringify({ phase, pending: pending.map(row => row.executeNo), originalTimeoutsPreserved: true })); announced = true; }
      const overdue = pending.filter(row => row.due === 1);
      if (overdue.length) {
        const accepted = successful(await api(admin, root + '/125/trigger', { method: 'POST', body: {} }), '管理员实际巡检遗留执行记录');
        assert.equal(accepted.accepted, true);
        const result = await waitFor(() => database('SELECT execute_status FROM sys_job_log WHERE job_id=125 AND execute_no=' + sql(accepted.executeNo) + ';'), value => value && value !== 'RUNNING', 'Original result inspector did not finish');
        check(phase + '由原125实际完成遗留任务结果巡检', result === 'SUCCESS');
        const resolved = await waitFor(() => rows("SELECT JSON_OBJECT('executeNo',execute_no,'status',execute_status,'message',result_msg) FROM sys_job_log WHERE execute_no IN ("
          + overdue.map(row => sql(row.executeNo)).join(',') + ');'), values => values.length === overdue.length && values.every(row => row.status !== 'RUNNING'), 'Original pending results did not resolve');
        console.log('A3_CLUSTER_OTHER_WORK_RESOLVED: ' + JSON.stringify({ phase, originalInspector: 125, results: resolved, forcedTerminalWrites: 0 }));
      }
      await sleep(500);
    } while (Date.now() < deadline);
    throw new Error('Other actual work did not settle within its unchanged timeout allowance');
  };
  await settleOtherWork('准备前');
  assert.equal(database("SELECT COUNT(*) FROM hr_employee_contract c JOIN sys_tenant t ON t.tenant_id=c.tenant_id AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) WHERE c.deleted=0 AND ((c.end_date BETWEEN CURRENT_DATE AND DATE_ADD(CURRENT_DATE,INTERVAL 30 DAY) AND c.status IN ('ACTIVE','EFFECTIVE')) OR (c.end_date<CURRENT_DATE AND c.status NOT IN ('EXPIRED','TERMINATED')));"), '0', 'No unrelated pending contract work permitted');
  const original = successful(await api(admin, root + '/106'), '读取已验证的合同处理器配置');
  assert.equal(original.handlerName, 'employeeContractExpire'); assert.equal(original.status, 'PAUSED');
  const payload = { ...original, jobId: undefined, jobName: marker, jobGroup: 'A3_VERIFY', handlerParam: marker, triggerType: 'CRON',
    cronExpression: '*/3 * * * * *', intervalMs: 3000, status: 'PAUSED', concurrentFlag: 0, misfireStrategy: 'IGNORE',
    retryCount: 0, retryIntervalSec: 1, dispatchRetryCount: 0, dispatchRetryIntervalSec: 1, timeoutSeconds: 300, lockTimeSeconds: 30,
    criticalFlag: 0, logSuccessFlag: 1, alarmOnFailFlag: 0, alarmReceiver: '', remark: marker };
  const logRows = () => rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'trigger',trigger_type,'actor',trigger_by,'affected',affected_rows,'message',result_msg,'duration',duration_ms,'report',report_time,'startMs',UNIX_TIMESTAMP(start_time)*1000,'endMs',UNIX_TIMESTAMP(end_time)*1000) FROM sys_job_log WHERE tenant_id=100000 AND job_id=" + jobId + ' ORDER BY log_id;');
  const toggle = status => api(admin, root + '/' + jobId + '/toggle', { method: 'PUT', body: { status, confirmCritical: true } }).then(value => successful(value, '实际切换双调度双人事验证任务状态'));

  const owner = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'dept',CAST(dept_id AS CHAR)) FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee' AND deleted=0 AND status='0';")[0];
  assert.match(owner.id,/^[1-9][0-9]*$/); assert.match(owner.dept,/^[1-9][0-9]*$/);
  const messages = contractId => rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'receiver',CAST(receiver_id AS CHAR),'channel',channel_type) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='HR_CONTRACT_EXPIRING' AND biz_id=" + sql(contractId) + ' ORDER BY record_id;');
  const internal = async (port,target,method='GET',payload) => {
    const body=payload?JSON.stringify(payload):'';
    const headers=signJobRequest(keys,'cloudflow-auth','cloudflow-service-hr',method,target,body);
    secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+port+target,{method,headers,...(method==='GET'?{}:{body}),redirect:'error',signal:AbortSignal.timeout(10000)});
    internalRequests++; const value=await response.json();
    assert.ok(response.status===200 && value.code===200,'Actual signed HR protocol rejected');
    return value.data;
  };
  const captureResults = () => {
    captureChain=captureChain.then(async()=>{
      for(const row of logRows()){
        if(row.status!=='SUCCESS'||captured.has(row.executeNo))continue;
        const values=[];
        for(const port of [state.services.find(item=>item.name==='hr').port,peers.hr.port]){
          const value=await internal(port,'/inner/job/status/'+row.executeNo);
          assert.ok(value?.executeStatus==='SUCCESS');
          assert.equal(value.affectedRows,row.affected);assert.equal(value.resultMsg,row.message);assert.equal(value.durationMs,row.duration);
          values.push(value);
        }
        const writes=await waitFor(()=>observer.events.filter(event=>event.command==='RESULT_SET'&&event.executeNo===row.executeNo&&event.status==='SUCCESS'),
          value=>value.length>0,'Actual HR completion writer was not observed',5000);
        assert.equal(writes.length,1,'Only one HR process may finish each execution');
        let fired;
        if(row.trigger==='CRON'){
          const claims=observer.events.filter(event=>event.command==='SET'&&event.executeNo===row.executeNo);
          assert.equal(claims.length,1);
          assert.equal(redis('GET','cloudflow:job:dispatch-fired:'+jobId+':'+claims[0].window),row.executeNo);
          fired={window:claims[0].window,capturedAt:Date.now()};
        }
        captured.set(row.executeNo,{executeNo:row.executeNo,results:values,writer:{...writes[0]},fired,capturedAt:Date.now()});
      }
    });
    return captureChain;
  };
  const sharedWindows = since => {
    const groups=new Map();
    for(const event of observer.events.filter(item=>item.command!=='RESULT_SET'&&Number(item.window)>=since&&Number(item.window)%3000===0)){
      if(!groups.has(event.window))groups.set(event.window,new Set());
      groups.get(event.window).add(ownerOf(event));
    }
    return [...groups].filter(([,owners])=>owners.has('authBase')&&owners.has('authPeer')).map(([window])=>window).sort();
  };
  let lastManual=0;
  const directTrigger=async source=>{
    const remaining=5200-(Date.now()-lastManual);if(remaining>0)await sleep(remaining);
    const token=await admin.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);
    const port=source==='authBase'?state.services.find(item=>item.name==='auth').port:peers.auth.port;
    const response=await fetch('http://127.0.0.1:'+port+'/system/job/'+jobId+'/trigger',{
      method:'POST',headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token,'Content-Type':'application/json'},
      body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});
    directManagementRequests++;lastManual=Date.now();
    const value=await response.json();assert.ok(response.status===200&&value.code===200&&value.data?.accepted,'Authenticated actual scheduler trigger must succeed');
    return value.data;
  };

  try {
    successful(await api(admin,root,{method:'POST',body:payload}),'建立独立暂停集群验证任务');
    jobId=database('SELECT job_id FROM sys_job WHERE tenant_id=100000 AND job_name='+sql(marker)+' AND deleted=0;');assert.match(jobId,/^[1-9][0-9]*$/);
    await operate('Reserve');
    await operate('Prepare','auth');await operate('Prepare','hr');await operate('Configure');
    await operate('Start','auth');await operate('Start','hr');
    for(const name of ['auth','hr'])peers[name]=await readManifest(path.join(peerDirectories[name],'peer.json'));
    check('两套真实调度及两套真实人事服务已启动',Object.values(peers).every(peer=>peer.status==='RUNNING'&&peer.clusterConfigured));
    evidence.instances=true;
    await operate('Route');await operate('Connections');
    check('四个独立进程使用两个调度及两个人事固定地址',new Set(Object.values(processes)).size===4&&(await readManifest(clusterFile)).status==='ROUTED');
    evidence.route=true;
    await waitFor(()=>api(admin,root+'/106'),response=>response.status===200&&response.body?.code===200,'Actual gateway discovery did not become ready',15000);
    observer=await observeA3SchedulerRedis(state,jobId,secrets,{claims:true,
      ownsExecution:executeNo=>database('SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=100000 AND job_id='+jobId+' AND execute_no='+sql(executeNo)+';')==='1'});
    collect=true;
    collection=(async()=>{while(collect){await captureResults();await sleep(500);}})().catch(error=>{collectionFailure=error;});
    employeeId=database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND user_id='+owner.id+' AND deleted=0;');
    if(!employeeId){
      database('INSERT INTO hr_employee(tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by) VALUES(100000,'+sql(marker)+','+sql(marker)+",'UNKNOWN',"+owner.dept+",'ACTIVE',"+owner.id+','+sql(marker)+');');
      employeeId=database('SELECT id FROM hr_employee WHERE tenant_id=100000 AND employee_no='+sql(marker)+';');createdEmployee=true;
    }
    assert.match(employeeId,/^[1-9][0-9]*$/);
    for(const source of ['authBase','authPeer'])for(let index=0;index<4;index++){
      const contractNo=marker+'_'+contracts.length;
      database('INSERT INTO hr_employee_contract(tenant_id,employee_id,contract_type,contract_no,sign_date,start_date,end_date,status,deleted,create_by) VALUES(100000,'+employeeId
        +",'LABOR',"+sql(contractNo)+",CURRENT_DATE,CURRENT_DATE,DATE_ADD(CURRENT_DATE,INTERVAL 10 DAY),'ACTIVE',0,"+sql(marker)+');');
      const contractId=database('SELECT id FROM hr_employee_contract WHERE tenant_id=100000 AND contract_no='+sql(contractNo)+';');
      assert.match(contractId,/^[1-9][0-9]*$/);contracts.push(contractId);
      const accepted=await directTrigger(source);
      const row=await waitFor(()=>logRows().find(value=>value.executeNo===accepted.executeNo),value=>value&&value.status!=='RUNNING','Actual cluster contract did not finish');
      assert.ok(row.status==='SUCCESS'&&row.affected===1&&row.trigger==='MANUAL'&&row.actor==='g_import_admin'&&row.report);
      assert.equal(row.message,'员工合同到期扫描完成：即将到期1份，已到期0份');
      await captureResults();await operate('Connections');
      const actual=captured.get(row.executeNo);const target=ownerOf(actual.writer);
      assert.ok(['hrBase','hrPeer'].includes(target),'Actual completion must be written by an owned HR process');
      manuals.push({source,target,executeNo:row.executeNo,contractId});
      const delivered=await waitFor(()=>messages(contractId),values=>values.length===1&&values[0].status==='SUCCESS','Cluster reminder was not delivered');
      assert.ok(delivered[0].receiver===owner.id&&delivered[0].channel==='INTERNAL');
      assert.equal(database('SELECT status FROM hr_employee_contract WHERE id='+contractId+';'),'EXPIRING');
      successful(await api(employee,'/auth/system/message/mine/'+delivered[0].id),'员工读取集群实际合同提醒');
    }
    for(const source of ['authBase','authPeer'])for(const target of ['hrBase','hrPeer']){
      const matching=manuals.filter(item=>item.source===source&&item.target===target);
      check(source+'到'+target+'实际处理合同并返回准确结果',matching.length>=1);
    }
    evidence.routingMatrix=true;
    check('八份实际合同各仅一条站内提醒且员工可读取',contracts.length===8&&contracts.every(id=>messages(id).length===1)&&Number(contractMessages())===Number(initialMessages)+8);
    evidence.business=true;
    const first=manuals[0];
    const request={jobId:Number(jobId),executeNo:first.executeNo,handlerName:original.handlerName,handlerParam:marker,timeoutSeconds:payload.timeoutSeconds,lockTimeSeconds:payload.lockTimeSeconds,concurrentFlag:0};
    for(const port of [state.services.find(item=>item.name==='hr').port,peers.hr.port]){
      const accepted=await internal(port,'/inner/job/execute','POST',request);
      assert.equal(accepted.accepted,true);
      const value=await internal(port,'/inner/job/status/'+first.executeNo);
      assert.equal(value.executeStatus,'SUCCESS');assert.equal(value.affectedRows,1);
    }
    await sleep(500);
    check('两个人事实例重投同一真实执行均去重且不重复提醒',
      observer.events.filter(event=>event.command==='RESULT_SET'&&event.executeNo===first.executeNo&&event.status==='SUCCESS').length===1
      &&contracts.every(id=>messages(id).length===1));
    evidence.deduplication=true;
    const started=Date.now();await toggle('ENABLED');
    await waitFor(()=>sharedWindows(started),windows=>windows.length>=4,'Both real schedulers did not compete for four shared windows',35000);
    await operate('Connections');
    const windows=sharedWindows(started).slice(0,4);
    await waitFor(logRows,values=>windows.every(window=>{
      const claims=observer.events.filter(event=>event.command==='SET'&&event.window===window);
      return claims.some(claim=>values.some(row=>row.executeNo===claim.executeNo&&row.status==='SUCCESS'));
    }),'Actual scheduled cluster work did not finish');
    await captureResults();
    const scheduled=windows.map(window=>{
      const rowsForWindow=logRows().filter(row=>row.trigger==='CRON'&&row.startMs>=Number(window)&&row.startMs<Number(window)+3000);
      assert.equal(rowsForWindow.length,1);
      const row=rowsForWindow[0];assert.ok(row.status==='SUCCESS'&&row.affected===0&&!row.actor&&row.report);
      const actual=captured.get(row.executeNo);assert.equal(actual.fired.window,window);
      return {window,executeNo:row.executeNo,target:ownerOf(actual.writer)};
    });
    check('双调度共同计划时刻均仅一次执行且自动分配到两个人事实例',new Set(scheduled.map(item=>item.target)).size===2
      &&scheduled.every(item=>['hrBase','hrPeer'].includes(item.target)));
    evidence.scheduling=true;
    console.log('A3_CLUSTER_WINDOWS: '+JSON.stringify(scheduled));
    await toggle('PAUSED');await sleep(11000);
    await waitFor(logRows,values=>values.every(row=>row.status!=='RUNNING'),'Paused cluster work did not finish');
    const before=logRows().length;const pausedAt=Date.now();await sleep(7000);observer.assertHealthy();
    check('暂停传播后四实例没有新增派发或执行',logRows().length===before&&!observer.events.some(event=>event.at>=pausedAt));evidence.pause=true;
    collect=false;await collection;if(collectionFailure)throw collectionFailure;
    await captureResults();await operate('Connections');
    const all=logRows();
    check('全部实际日志均成功且两个人事反查结果准确一致',all.length>=12&&all.every(row=>row.status==='SUCCESS'&&captured.has(row.executeNo)));
    for(const row of all){
      const writes=observer.events.filter(event=>event.command==='RESULT_SET'&&event.executeNo===row.executeNo&&event.status==='SUCCESS');
      assert.equal(writes.length,1);assert.ok(['hrBase','hrPeer'].includes(ownerOf(writes[0])));
    }
    evidence.logs=true;
    const page=successful(await api(admin,root+'/log?jobId='+jobId+'&pageNum=1&pageSize=100'),'管理员读取集群任务全部结果');
    assert.ok(all.every(row=>page.rows.some(value=>value.executeNo===row.executeNo)));
    const denied=await api(employee,root+'/log?jobId='+jobId);
    check('员工收到提醒仍不能读取后台任务日志',denied.status===403&&!denied.body?.data);evidence.permissions=true;
    console.log('A3_CLUSTER_MATRIX: '+JSON.stringify({processes,manuals,actualExecutions:all.length}));
  }catch(error){failure=error;}
  finally{
    try{
      if(jobId){
        if(database('SELECT status FROM sys_job WHERE job_id='+jobId+' AND job_name='+sql(marker)+';')!=='PAUSED'){await toggle('PAUSED');await sleep(11000);}
        await waitFor(logRows,values=>values.every(row=>row.status!=='RUNNING'),'Actual cluster work remained in flight during cleanup',60000);
        await waitFor(()=>redis('EXISTS','cloudflow:job:lock:hr-employee-contract-expire-job'),value=>value==='0','HR business lock did not release');
      }
      await settleOtherWork('集群收尾');
      for(const id of contracts)database('UPDATE hr_employee_contract SET deleted=1 WHERE id='+id+' AND create_by='+sql(marker)+';');
      if(createdEmployee)database('UPDATE hr_employee SET deleted=1 WHERE id='+employeeId+' AND employee_no='+sql(marker)+';');
      check('原任务及授权保持且新合同停用和验证任务暂停',config()===originalConfig&&grants()===originalGrants
        &&contracts.every(id=>database('SELECT deleted FROM hr_employee_contract WHERE id='+id+';')==='1')
        &&(!jobId||database('SELECT status FROM sys_job WHERE job_id='+jobId+';')==='PAUSED'));
      evidence.restoration=true;
    }catch(error){failure||=error;}
    collect=false;if(collection)await collection;failure||=collectionFailure;
    try{
      if(observer){
        observer.assertHealthy();await observer.close();
        await fs.writeFile(observationFile,JSON.stringify({jobId,processes,manuals,results:[...captured.values()].map(item=>({...item,writer:{...item.writer,owner:ownerOf(item.writer)}})),
          events:observer.events.map(event=>({...event,owner:ownerOf(event)}))},null,2),{flag:'wx'});
      }
    }catch(error){failure||=error;if(observer)await observer.close();}
    try{
      const manifest=await readManifest(clusterFile);
      if(manifest&&manifest.status!=='RESTORED')await operate('RestoreRoutes');
      check('原调度人事和网关配置完整还原',!manifest||(await readManifest(clusterFile)).status==='RESTORED');evidence.runtimeRestoration=true;
    }catch(error){failure||=error;}
    try{
      for(const name of ['hr','auth']){
        const manifest=await readManifest(path.join(peerDirectories[name],'peer.json'));
        if(manifest&&manifest.status!=='STOPPED')await operate('Stop',name);
        assert.ok(!manifest||(await readManifest(path.join(peerDirectories[name],'peer.json'))).status==='STOPPED');
      }
      check('两个副本均按身份关闭且原进程保留',true);evidence.peerRestoration=true;
    }catch(error){failure||=error;}
    try{
      const capacity=await readManifest(capacityFile);
      if(capacity&&capacity.status!=='RESTORED')await operate('RestoreCapacity');
      check('容量恢复且原九进程六服务健康',!capacity||(await readManifest(capacityFile)).status==='RESTORED');evidence.capacityRestoration=true;
    }catch(error){failure||=error;}
  }

  const filesToScan=[...helperLogs,observationFile];
  for(const directory of [...state.services.map(item=>path.join(state.run,item.name)),...Object.values(peerDirectories),clusterDirectory]){
    for(const sub of ['','logs']){
      const folder=path.join(directory,sub);
      const names=await fs.readdir(folder).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
      for(const name of names)if(name.endsWith('.log'))filesToScan.push(path.join(folder,name));
    }
  }
  for(const name of await fs.readdir(path.dirname(capacityFile)))if(name.startsWith(path.basename(capacityFile)+'.')&&name.endsWith('.log'))filesToScan.push(path.join(path.dirname(capacityFile),name));
  let files=0;let bytes=0;let leaks=0;
  for(const filename of new Set(filesToScan)){
    if(!(await fs.stat(filename).catch(error=>{if(error.code==='ENOENT')return null;throw error;})))continue;
    const scan=await scanSecretStream(createReadStream(filename),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;
  }
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});
  check('集群验证服务与审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_CLUSTER_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  console.log('A3_CLUSTER_SCOPE: '+JSON.stringify({internalRequests,directManagementRequests,actualFourProcesses:evidence.instances,routingMatrix:evidence.routingMatrix,
    realContractReminders:evidence.business,dualSchedulers:evidence.scheduling,rawMonitorRetained:false,forcedTerminalWrites:0,nacosHeartbeatVerified:false,productionModified:false}));
  if(failure)throw failure;
}
