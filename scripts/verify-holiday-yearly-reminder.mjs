import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { readOwnedJobKeys } from './job-internal-signing.mjs';

export async function verifyHolidayYearlyReminder({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker='A4Y'+caseTag;
  const sql=value=>'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4)';
  const rows=query=>database(query).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(read,accept,label,ms=60000)=>{const until=Date.now()+ms;do{const value=await read();if(accept(value))return value;await sleep(300);}while(Date.now()<until);throw new Error(label);};
  const root='/auth/system/job'; const year=Number(database('SELECT YEAR(CURRENT_DATE)+1;'));
  const original=successful(await api(admin,root+'/127'),'读取原年度日历提醒任务');
  assert.ok(original.handlerName==='holidayYearlyRemind'&&original.status==='PAUSED'&&original.cronExpression==='0 0 10 1 11 ?');
  assert.equal(database("SELECT COUNT(*) FROM sys_job WHERE handler_name='holidayYearlyRemind' AND status='ENABLED' AND deleted=0;"),'0');
  const config=()=>database('SELECT tenant_id,job_id,job_name,handler_name,status,cron_expression,interval_ms,version FROM sys_job ORDER BY job_id;');
  const grants=()=>database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const oldConfig=config(); const oldGrants=grants();
  const allMessages=()=>rows("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'user',CAST(receiver_id AS CHAR),'status',send_status,'channel',channel_type,'title',title,'content',content,'link',link_url) FROM sys_message_record WHERE biz_type='SYS_HOLIDAY_YEARLY_REMIND' AND biz_id="+sql(year)+' ORDER BY record_id;');
  const beforeMessages=allMessages();
  const secrets=new Set([...accounts.map(item=>item.password).filter(Boolean),...Object.values(await readOwnedJobKeys(state))]);
  const hr=await session('g_holiday_hr'); const employee=await session('g_holiday_employee');
  for(const page of [admin,hr,employee]){const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());assert.ok(token);secrets.add(token.replace(/^Bearer /,''));}
  const originalPeople=rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',user_name) FROM sys_user WHERE tenant_id=100000 AND user_name IN ('g_import_admin','g_holiday_hr','g_holiday_employee') AND deleted=0;");
  assert.equal(originalPeople.length,3);
  assert.equal(database("SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND status='0' AND deleted=0 AND ((role_id=1 AND role_key='admin') OR (role_id=4 AND role_key='hr'));"),'2','Original admin and HR roles must be enabled');
  const idOf=name=>originalPeople.find(item=>item.name===name).id;
  const tenants=[]; const users=[]; const roles=[]; const executions=[]; let failure;
  const tenant=(suffix,status='0',expired=false,deleted=0)=>{
    const code=marker+suffix;
    database('INSERT INTO sys_tenant(tenant_code,tenant_name,status,expire_time,deleted,create_by,create_time) VALUES('+[sql(code),sql(code),sql(status),expired?'DATE_SUB(NOW(),INTERVAL 1 DAY)':'DATE_ADD(NOW(),INTERVAL 2 DAY)',deleted,sql(marker),'NOW()'].join(',')+');');
    const id=database('SELECT tenant_id FROM sys_tenant WHERE tenant_code='+sql(code)+';');assert.match(id,/^[1-9][0-9]*$/);tenants.push(id);return id;
  };
  const role=(tenantId,key,status='0',deleted=0)=>{
    database('INSERT INTO sys_role(tenant_id,role_name,role_key,role_sort,status,deleted,create_by,create_time) VALUES('+[tenantId,sql(marker),sql(key),1,sql(status),deleted,sql(marker),'NOW()'].join(',')+');');
    const id=database('SELECT role_id FROM sys_role WHERE tenant_id='+tenantId+' AND role_key='+sql(key)+';');assert.match(id,/^[1-9][0-9]*$/);roles.push(id);return id;
  };
  const user=(suffix,tenantId='100000',status='0',deleted=0)=>{
    const name=marker+suffix;
    database('INSERT INTO sys_user(tenant_id,user_name,nick_name,password,status,deleted,create_by,create_time) SELECT '+tenantId+','+sql(name)+','+sql(name)+',password,'+sql(status)+','+deleted+','+sql(marker)+',NOW() FROM sys_user WHERE user_id='+idOf('g_holiday_employee')+';');
    const id=database('SELECT user_id FROM sys_user WHERE tenant_id='+tenantId+' AND user_name='+sql(name)+';');assert.match(id,/^[1-9][0-9]*$/);users.push(id);return id;
  };
  const membership=(tenantId,userId,roleId)=>database('INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES('+tenantId+','+userId+','+roleId+');');
  const trigger=async()=>{
    const accepted=successful(await api(admin,root+'/127/trigger',{method:'POST',body:{}}),'管理员实际触发原年度维护提醒');assert.equal(accepted.accepted,true);executions.push(accepted.executeNo);
    const result=await waitFor(()=>rows("SELECT JSON_OBJECT('id',CAST(log_id AS CHAR),'status',execute_status,'affected',affected_rows,'message',result_msg,'trigger',trigger_type,'actor',trigger_by,'report',report_time) FROM sys_job_log WHERE job_id=127 AND execute_no="+sql(accepted.executeNo)+';')[0],value=>value&&value.status!=='RUNNING','Annual reminder did not complete');
    check('原127真实处理并保存手动操作者和回报',result.status==='SUCCESS'&&result.trigger==='MANUAL'&&result.actor==='g_import_admin'&&result.report&&Number.isInteger(result.affected));return result;
  };
  try{
    const active=tenant('active'); const disabled=tenant('disabled','1'); const expired=tenant('expired','0',true); const deleted=tenant('deleted','0',false,1); const deletedRoleTenant=tenant('oldrole');
    const activeAdmin=role(active,'admin');const disabledHr=role(active,'hr','1');const oldRole=role(deletedRoleTenant,'admin','0',1);
    const foreignAdmin=user('foreign',active);membership(active,foreignAdmin,activeAdmin);
    const noRoleUser=user('nohr',active);membership(active,noRoleUser,disabledHr);
    const oldRoleUser=user('oldrole',deletedRoleTenant);membership(deletedRoleTenant,oldRoleUser,oldRole);
    const excluded=[noRoleUser,oldRoleUser];
    for(const [suffix,id] of [['disabled',disabled],['expired',expired],['deleted',deleted]]){const roleId=role(id,'admin');const userId=user(suffix,id);membership(id,userId,roleId);excluded.push(userId);}
    const dual=user('dual');membership('100000',dual,'1');membership('100000',dual,'4');
    const disabledAccount=user('off','100000','1');membership('100000',disabledAccount,'1');excluded.push(disabledAccount);
    const deletedAccount=user('gone','100000','0',1);membership('100000',deletedAccount,'4');excluded.push(deletedAccount);
    const cross=user('cross');membership('100000',cross,activeAdmin);excluded.push(cross);
    database("INSERT INTO sys_message_channel(tenant_id,channel_type,channel_code,channel_name,implemented_flag,status,create_by) VALUES("+active+",'INTERNAL',"+sql(marker)+','+sql(marker)+",1,'ENABLED',"+sql(marker)+');');
    const first=await trigger();evidence.execution=true;
    const expected=[idOf('g_import_admin'),idOf('g_holiday_hr'),dual,foreignAdmin];
    const delivered=await waitFor(allMessages,values=>expected.every(id=>values.some(row=>row.user===id&&row.status==='SUCCESS')),'Admin and HR annual reminders were not actually delivered');
    check('管理员人事和其他活跃租户实际收到站内年度提醒',expected.every(id=>delivered.filter(row=>row.user===id&&row.channel==='INTERNAL').length===1));
    check('兼任管理员和人事只收一条且目标年份和日历链接准确',delivered.filter(row=>row.user===dual).length===1&&expected.every(id=>{const row=delivered.find(item=>item.user===id);return row.title.includes(String(year))&&row.content.includes(String(year))&&row.link==='/holiday';}));
    check('停用删除账号及角色过期停用删除租户和跨租户错绑均排除',excluded.every(id=>!delivered.some(row=>row.user===id))&&!delivered.some(row=>row.user===idOf('g_holiday_employee')));
    check('其他租户提醒保存在其所属租户',delivered.find(row=>row.user===foreignAdmin).tenant===active);
    evidence.recipients=true;evidence.isolation=true;
    const adminMessage=delivered.find(row=>row.user===idOf('g_import_admin'));const hrMessage=delivered.find(row=>row.user===idOf('g_holiday_hr'));
    successful(await api(admin,'/auth/system/message/mine/'+adminMessage.id),'管理员读取自己的年度维护提醒');
    successful(await api(hr,'/auth/system/message/mine/'+hrMessage.id),'人事读取自己的年度维护提醒');
    const denied=await api(employee,'/auth/system/message/mine/'+hrMessage.id);
    check('员工不能读取人事年度提醒',denied.status===403||denied.status===404||denied.body?.code===403||denied.body?.code===404);
    const foreignDenied=await api(admin,'/auth/system/message/mine/'+delivered.find(row=>row.user===foreignAdmin).id);
    check('本租户管理员不能读取另一租户私信',foreignDenied.status===403||foreignDenied.status===404||foreignDenied.body?.code===403||foreignDenied.body?.code===404);
    evidence.delivery=true;evidence.permissions=true;
    await sleep(5300);const snapshot=JSON.stringify(allMessages());const second=await trigger();await sleep(6000);
    check('同年度重复扫描仍成功且不新增重复提醒',first.affected===second.affected&&JSON.stringify(allMessages())===snapshot);evidence.deduplication=true;
    console.log('A4_YEARLY_ACTUAL: '+JSON.stringify({targetYear:year,submittedRecipients:first.affected,newMessageRecords:allMessages().length-beforeMessages.length,fixtureTenants:tenants.length,fixtureUsers:users.length,originalJob:127,executions}));
  }catch(error){failure=error;}
  finally{
    try{
      await waitFor(()=>database("SELECT COUNT(*) FROM sys_job_log WHERE job_id=127 AND execute_status='RUNNING';"),value=>value==='0','Annual reminder still running during fixture cleanup');
      if(users.length){database('DELETE FROM sys_user_role WHERE user_id IN ('+users.join(',')+');');database('UPDATE sys_user SET deleted=1 WHERE user_id IN ('+users.join(',')+') AND create_by='+sql(marker)+';');}
      if(roles.length)database('UPDATE sys_role SET deleted=1 WHERE role_id IN ('+roles.join(',')+') AND create_by='+sql(marker)+';');
      database("UPDATE sys_message_channel SET status='DISABLED',deleted=1 WHERE create_by="+sql(marker)+';');
      if(tenants.length)database("UPDATE sys_tenant SET status='1',deleted=1 WHERE tenant_id IN ("+tenants.join(',')+') AND create_by='+sql(marker)+';');
      check('原任务与授权保持且新增样本已停用并保留消息',config()===oldConfig&&grants()===oldGrants&&users.every(id=>database('SELECT deleted FROM sys_user WHERE user_id='+id+';')==='1'));
      evidence.restoration=true;
    }catch(error){failure||=error;}
  }
  let files=0,bytes=0,leaks=0;
  for(const service of state.services){const directory=path.join(state.run,service.name);const names=await fs.readdir(path.join(directory,'logs')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    for(const file of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){const scan=await scanSecretStream(createReadStream(path.join(directory,file)),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}}
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});
  check('年度提醒服务及审计日志无凭据泄漏',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('A4_YEARLY_SECRET_SCAN: '+JSON.stringify({files,bytes,values:secrets.size,leaks,databaseBytes:audit.bytes,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
