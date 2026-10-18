import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyA3AuditArchive({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),marker='A3A'+caseTag,jobsRoot='/auth/system/job';
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const table=name=>{assert.match(name,/^[A-Za-z0-9_]{1,64}$/);return '`'+name+'`';};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label)=>{const end=Date.now()+90000;do{const result=await read();if(accept(result))return result;await sleep(250);}while(Date.now()<end);throw new Error(label);};
  const post=(page,url,body={})=>api(page,url,{method:'POST',body});
  const employee=await session('g_holiday_employee'),keys=await readOwnedJobKeys(state);
  const secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(keys)]);
  for(const page of [admin,employee]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const receiver=database("SELECT user_id FROM sys_user WHERE user_name='g_holiday_employee' AND tenant_id=100000 AND deleted=0 AND status='0';");assert.match(receiver,/^[1-9][0-9]*$/);
  const auth=state.services.find(item=>item.name==='auth');assert.ok(auth);
  const configFile=path.join(state.run,'auth/integration.properties'),originalConfig=await fs.readFile(configFile),hash=value=>createHash('sha256').update(value).digest('hex');
  assert.ok(!/^cloudflow\.audit\.archive\.dry-run=/m.test(originalConfig.toString()),'Original default preview configuration required');
  const temporaryConfig=Buffer.concat([originalConfig,Buffer.from('\ncloudflow.audit.archive.dry-run=false\n')]);
  const backup=path.join(state.run,'private','a3-audit-'+caseTag+'-original.properties');
  await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,originalConfig,{flag:'wx',mode:0o600});
  const manifest=path.join(state.run,'private','a3-audit-'+caseTag+'-runtime.json');
  let configModified=false,restartNumber=0,failure,jobId,lastTrigger;
  const switchRuntime=async actual=>{
    const expected=actual?originalConfig:temporaryConfig,next=actual?temporaryConfig:originalConfig;
    assert.equal(hash(await fs.readFile(configFile)),hash(expected),'Archive configuration changed by another writer');
    await fs.writeFile(manifest,JSON.stringify({marker,backup,configFile,originalHash:hash(originalConfig),temporaryHash:hash(temporaryConfig),phase:actual?'ACTUAL':'RESTORING'},null,2));
    await fs.writeFile(configFile,next);configModified=actual;
    const prefix=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime',marker+'-auth-'+(++restartNumber));
    const output=await fs.open(prefix+'.log','wx'),errors=await fs.open(prefix+'.err.log','wx');
    console.log('A3_AUDIT_RUNTIME_PHASE: actual='+actual+'; restarting_owned_auth=true');
    try {
      const status=await new Promise((resolve,reject)=>{
        const child=spawn('C:/Program Files/PowerShell/7/pwsh.exe',['-NoLogo','-NoProfile','-File',path.join(root,'scripts/restart-isolated-integration-service.ps1'),'-StatePath',path.join(state.run,'state.json'),'-ServiceName','auth'],
          {cwd:root,windowsHide:true,stdio:['ignore',output.fd,errors.fd]});child.once('error',reject);child.once('exit',resolve);
      });assert.equal(status,0,'Owned auth restart failed; runtime manifest and backup retained');
    } finally {await output.close();await errors.close();}
    Object.assign(state,JSON.parse((await fs.readFile(path.join(state.run,'state.json'),'utf8')).replace(/^\uFEFF/,'')));
    assert.equal(hash(await fs.readFile(configFile)),hash(next));
    await fs.writeFile(manifest,JSON.stringify({marker,backup,configFile,originalHash:hash(originalConfig),temporaryHash:hash(temporaryConfig),phase:actual?'ACTUAL_READY':'RESTORED'},null,2));
    console.log('A3_AUDIT_RUNTIME_PHASE: actual='+actual+'; owned_auth_ready=true; original_restored='+!actual);
    if(!actual)evidence.runtimeRestoration=true;
  };
  const ownModules=[marker+'one',marker+'two'],ownTables=['a3_audit_'+caseTag+'_one','a3_audit_'+caseTag+'_two'];ownTables.forEach(table);
  const sourceColumns="JSON_OBJECT('id',CAST(audit_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'module',biz_module,'name',audit_name,'field',audit_field,'before',before_val,'after',after_val,'beforeJson',before_json,'afterJson',after_json,'diff',diff_json,'high',high_risk,'risk',risk_level,'by',create_by,'time',DATE_FORMAT(create_time,'%Y-%m-%dT%H:%i:%s'))";
  const snapshot=(name,id)=>rows('SELECT '+sourceColumns+' FROM '+table(name)+' WHERE audit_id='+id+';')[0];
  const exists=name=>database('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND CAST(table_name AS BINARY)=CAST('+sql(name)+' AS BINARY);')==='1';
  const tables=()=>database('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name;');
  const policies=()=>database('SELECT id,biz_module,retain_days,archive_table,status,create_by,create_time,update_by,update_time FROM sys_audit_archive_policy WHERE biz_module NOT IN ('+ownModules.map(sql).join(',')+') ORDER BY id;');
  const configuration=()=>database('SELECT tenant_id,job_id,job_name,status,handler_name,interval_ms,cron_expression,deleted FROM sys_job WHERE job_name<>'+sql(marker)+' ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldTables=tables(),oldPolicies=policies(),oldConfig=configuration(),oldGrants=grants();
  assert.equal(oldTables.split(/\r?\n/).length,374);
  const originalPolicies=rows("SELECT JSON_OBJECT('id',id,'table',archive_table,'days',retain_days) FROM sys_audit_archive_policy WHERE status='ACTIVE' ORDER BY id;");
  assert.equal(originalPolicies.length,6);for(const item of originalPolicies){assert.equal(item.days,90);assert.match(item.table,/^sys_audit_log_(auth|workflow|oa|crm|hr|system)_archive$/);assert.equal(exists(item.table),false);}
  const originalMaximum=database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');assert.match(originalMaximum,/^[0-9]+$/);
  const originalAuditCount=database('SELECT COUNT(*) FROM sys_audit_log WHERE audit_id<='+originalMaximum+';');
  const originalEligible=()=>database("SELECT COUNT(*) FROM sys_audit_log a JOIN sys_audit_archive_policy p ON p.biz_module=a.biz_module JOIN sys_tenant t ON t.tenant_id=a.tenant_id WHERE p.id IN ("+originalPolicies.map(item=>item.id).join(',')+") AND p.status='ACTIVE' AND t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) AND a.create_time<DATE_SUB(NOW(),INTERVAL p.retain_days DAY);");
  assert.equal(originalEligible(),'0');
  const samples=[],policyIds=[];
  const create=(name,tenant,module,when="DATE_SUB(NOW(),INTERVAL 2 DAY)")=>{
    assert.ok(['DATE_SUB(NOW(),INTERVAL 2 DAY)','NOW()','NULL'].includes(when));
    const id=database('INSERT INTO sys_audit_log(tenant_id,biz_module,audit_name,audit_field,before_val,after_val,before_json,after_json,diff_json,high_risk,risk_level,create_by,create_time) VALUES('+tenant+','+sql(module)+','+sql(marker+'-'+name)+",'金额',NULL,"+sql('完整 中文 👑 value ')+','+sql('{"before":null}')+','+sql('{"after":"完整"}')+",'[]',1,'HIGH',"+sql(marker)+','+when+'); SELECT LAST_INSERT_ID();');
    assert.match(id,/^[1-9][0-9]*$/);const sample={name,id,tenant,module,original:snapshot('sys_audit_log',id)};samples.push(sample);return sample;
  };
  const logs=()=>jobId?rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'executeNo',execute_no,'status',execute_status,'affected',affected_rows,'message',result_msg,'stack',exception_stack,'actor',trigger_by,'trigger',trigger_type,'duration',duration_ms,'report',report_time) FROM sys_job_log WHERE job_id="+jobId+' ORDER BY log_id;'):[];
  const trigger=async()=>{if(lastTrigger&&Date.now()-lastTrigger<5300)await sleep(5300-(Date.now()-lastTrigger));const result=successful(await post(admin,jobsRoot+'/'+jobId+'/trigger'),'实际触发审计归档');assert.equal(result.accepted,true);lastTrigger=Date.now();return waitFor(()=>logs().find(item=>item.executeNo===result.executeNo),item=>item&&item.status!=='RUNNING','Archive execution not terminal');};
  let internalRequests=0;
  const success=async(count,summary)=>{
    const result=await trigger();check('归档实际成功数量摘要和操作者准确',result.status==='SUCCESS'&&result.affected===count&&result.message===summary&&result.actor==='g_import_admin'&&result.trigger==='MANUAL'&&Number.isInteger(result.duration)&&result.report);
    const target='/inner/job/status/'+result.executeNo,headers=signJobRequest(keys,'cloudflow-auth','cloudflow-auth','GET',target,'');secrets.add(headers['X-Job-Signature']);
    const response=await fetch('http://127.0.0.1:'+auth.port+target,{headers,signal:AbortSignal.timeout(10000)}),body=await response.json();internalRequests++;
    check('归档签名状态反查与平台保存一致',response.status===200&&body.code===200&&body.data.affectedRows===count&&body.data.resultMsg===summary);return result;
  };
  try {
    assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE handler_name='auditLogArchive' AND status='ENABLED' AND deleted=0;"),'0');
    const original=successful(await api(admin,jobsRoot+'/100'),'读取原审计归档任务');assert.equal(original.handlerName,'auditLogArchive');assert.equal(original.status,'PAUSED');
    successful(await post(admin,jobsRoot,{...original,jobId:undefined,jobName:marker,jobGroup:'A3_VERIFY',handlerParam:marker,status:'PAUSED',triggerType:'FIXED_RATE',cronExpression:null,intervalMs:60000,concurrentFlag:0,misfireStrategy:'IGNORE',retryCount:0,dispatchRetryCount:0,timeoutSeconds:90,lockTimeSeconds:90,criticalFlag:0,alarmOnFailFlag:1,alarmReceiver:receiver,logSuccessFlag:1}),'创建暂停的审计验证任务');
    jobId=database('SELECT job_id FROM sys_job WHERE job_name='+sql(marker)+' AND deleted=0;');assert.match(jobId,/^[1-9][0-9]*$/);
    for(let index=0;index<2;index++)policyIds.push(database('INSERT INTO sys_audit_archive_policy(biz_module,retain_days,archive_table,status,create_by) VALUES('+sql(ownModules[index])+',1,'+sql(ownTables[index])+",'ACTIVE',"+sql(marker)+'); SELECT LAST_INSERT_ID();'));
    const broken=create('broken',100000,ownModules[0]),same=create('same-policy-continuation',100000,ownModules[1]),other=create('other-tenant',100001,ownModules[0]);
    const recent=create('recent',100000,ownModules[0],'NOW()'),noTime=create('no-time',100000,ownModules[0],'NULL');
    await success(0,'审计归档预演完成：候选3条，实际移出0条');
    check('默认预演不移出日志且不创建冷表',tables()===oldTables&&[broken,same,other].every(item=>JSON.stringify(snapshot('sys_audit_log',item.id))===JSON.stringify(item.original)));evidence.preview=true;
    await switchRuntime(true);assert.equal(originalEligible(),'0');
    database('CREATE TABLE '+table(ownTables[0])+' LIKE sys_audit_log; INSERT INTO '+table(ownTables[0])+' SELECT * FROM sys_audit_log WHERE audit_id='+broken.id+'; UPDATE '+table(ownTables[0])+' SET after_val='+sql(marker+'-conflict')+' WHERE audit_id='+broken.id+';');
    const conflicted=snapshot(ownTables[0],broken.id),failed=await trigger();
    check('真实副本冲突准确保存失败及原始异常',failed.status==='FAILED'&&failed.affected===null&&failed.stack.includes('审计归档存在失败租户')&&failed.stack.includes('审计归档副本不完整或内容冲突'));evidence.collision=true;
    check('冲突时保留源日志和原冲突副本',JSON.stringify(snapshot('sys_audit_log',broken.id))===JSON.stringify(broken.original)&&JSON.stringify(snapshot(ownTables[0],broken.id))===JSON.stringify(conflicted));evidence.rollback=true;
    check('同租户后续策略和另一租户实际归档继续',!snapshot('sys_audit_log',same.id)&&!snapshot('sys_audit_log',other.id)&&JSON.stringify(snapshot(ownTables[1],same.id))===JSON.stringify(same.original)&&JSON.stringify(snapshot(ownTables[0],other.id))===JSON.stringify(other.original));evidence.continuation=true;
    const alarm=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status) FROM sys_message_record WHERE tenant_id=100000 AND biz_type='SYS_JOB' AND biz_id="+sql(failed.executeNo)+';'),items=>items.length===1&&items[0].status==='SUCCESS','Archive failure alarm not delivered');
    check('归档失败告警实际送达指定员工',alarm[0].user===receiver);successful(await api(employee,'/auth/system/message/mine/'+alarm[0].id),'员工读取归档失败告警');evidence.alarm=true;
    database('DELETE FROM '+table(ownTables[0])+' WHERE audit_id='+broken.id+' AND create_by='+sql(marker)+' AND after_val='+sql(marker+'-conflict')+';');
    await success(1,'审计归档完成：候选1条，新增1条，移出1条');check('修复后仅补归档原失败日志',!snapshot('sys_audit_log',broken.id)&&JSON.stringify(snapshot(ownTables[0],broken.id))===JSON.stringify(broken.original));evidence.recovery=true;
    await success(0,'审计归档完成：候选0条，新增0条，移出0条');evidence.repeat=true;
    const duplicate=create('identical-copy',100000,ownModules[0]);database('INSERT INTO '+table(ownTables[0])+' SELECT * FROM sys_audit_log WHERE audit_id='+duplicate.id+';');
    await success(1,'审计归档完成：候选1条，新增0条，移出1条');check('完全相同副本只移出原记录且保留全部字段',!snapshot('sys_audit_log',duplicate.id)&&JSON.stringify(snapshot(ownTables[0],duplicate.id))===JSON.stringify(duplicate.original));evidence.duplicate=true;
    check('近期及空日期日志保持',JSON.stringify(snapshot('sys_audit_log',recent.id))===JSON.stringify(recent.original)&&JSON.stringify(snapshot('sys_audit_log',noTime.id))===JSON.stringify(noTime.original));
    const denied=await post(employee,jobsRoot+'/'+jobId+'/trigger'),detail=await api(employee,jobsRoot+'/log/'+failed.id);
    check('普通员工不能执行归档或读取后台失败详情',denied.status===403&&detail.status===403&&!detail.body?.data);evidence.permissions=true;
    await switchRuntime(false);
    const finalPreview=create('restored-preview',100000,ownModules[0]);await success(0,'审计归档预演完成：候选1条，实际移出0条');
    check('恢复原配置后真实调用仍仅预演',JSON.stringify(snapshot('sys_audit_log',finalPreview.id))===JSON.stringify(finalPreview.original)&&!snapshot(ownTables[0],finalPreview.id));
    console.log('A3_AUDIT_ARCHIVE_ACTUAL: '+JSON.stringify({job:jobId,samples:samples.length,archived:4,retainedPreviewAndExcluded:3,realCopyConflict:true,sourceCopiesVerified:true,forcedTerminalWrites:0,internalRequests,naturalMonthlyWait:false}));
  } catch(error){failure=error;}
  finally {
    try {
      await waitFor(logs,items=>items.every(item=>item.status!=='RUNNING'),'Owned archive task still running');
      if(configModified)await switchRuntime(false);
      assert.equal(hash(await fs.readFile(configFile)),hash(originalConfig));evidence.runtimeRestoration=true;
      for(const name of ownTables)if(exists(name)){
        assert.equal(database('SELECT COUNT(*) FROM '+table(name)+' WHERE create_by IS NULL OR create_by<>'+sql(marker)+' OR biz_module NOT IN ('+ownModules.map(sql).join(',')+');'),'0','Only current verification copies may be removed');
        database('DROP TABLE '+table(name)+';');
      }
      for(const item of originalPolicies)if(exists(item.table)){assert.equal(database('SELECT COUNT(*) FROM '+table(item.table)+';'),'0','New original-policy archive must be empty');database('DROP TABLE '+table(item.table)+';');}
      for(const id of policyIds){assert.match(id,/^[1-9][0-9]*$/);database('DELETE FROM sys_audit_archive_policy WHERE id='+id+' AND create_by='+sql(marker)+' AND biz_module IN ('+ownModules.map(sql).join(',')+');');}
      check('原审计策略日志任务授权及374表全部保持',tables()===oldTables&&policies()===oldPolicies&&configuration()===oldConfig&&grants()===oldGrants&&database('SELECT COUNT(*) FROM sys_audit_log WHERE audit_id<='+originalMaximum+';')===originalAuditCount);evidence.restoration=true;
    } catch(error){console.log('A3_AUDIT_ARCHIVE_CLEANUP_FAILED: type='+error.name);failure=new AggregateError([failure,error].filter(Boolean),'Archive verification or restoration failed');}
  }
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name),names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,name)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});check('归档服务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A3_AUDIT_ARCHIVE_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
