import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';
import { authenticateE1ActivityAccount } from './runtime-checks/e1-activity-browser-auth.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

assert.ok(process.argv.includes('--e1-departments'));
const output=process.argv[process.argv.indexOf('--output')+1];assert.ok(output);
const runtime=await createE1ActivityRuntime('D:/CloudFlowPro',output);
const {check,ok,api,database,sessions}=runtime;
const marker='E1D_'+randomUUID().replaceAll('-','').slice(0,12);
const digest=value=>createHash('sha256').update(value).digest('hex');
const sql=value=>String(value)===''?"''":'CONVERT(0x'+Buffer.from(String(value)).toString('hex')+' USING utf8mb4)';
const at=value=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,19).replace('T',' ');};
const startDate=new Date();startDate.setHours(10,0,0,0);
const start=at(startDate),end=at(startDate.getTime()+3600000);
const environment={...process.env};delete environment.MYSQL_PWD;
const mutate=statement=>{
  assert.match(statement,/^(?:INSERT|UPDATE|DELETE)\s/i);
  const response=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+runtime.state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],
    {input:statement,encoding:'utf8',windowsHide:true,env:environment,timeout:30000,maxBuffer:1024*1024});
  const errorCode=response.stderr?.match(/ERROR\s+([0-9]+)/)?.[1]||'none';
  assert.equal(response.status,0,'Owned department identity fixture write failed; mysql_code='+errorCode);return response.stdout.trim();
};
const identifier=statement=>{const value=mutate(statement);assert.match(value,/^[1-9][0-9]*$/);const number=Number(value);assert.ok(Number.isSafeInteger(number));return number;};
const originals=[],roles=[],people=[],departments=[],owned=new Set(),uiRequests=[];
const result={marker,passed:false,departments:false,selfAccess:false,scopeChanges:false,ui:false,preservation:false,secrets:false,allAcceptanceComplete:false};
for(const [table,key] of [['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id'],['sys_role','role_id'],['sys_user','user_id'],['sys_dept','dept_id'],['hr_employee','id'],['sys_api_ratelimit_rule','id']]){
  const maximum=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);assert.match(maximum,/^[0-9]+$/);
  const query='SELECT * FROM '+table+' WHERE '+key+'<='+maximum+' ORDER BY '+key;
  originals.push({table,query,hash:digest(database(query))});
}
const grantsQuery='SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id';
const bindingsQuery='SELECT * FROM sys_user_role ORDER BY tenant_id,user_id,role_id';
const grants=digest(database(grantsQuery)),bindings=digest(database(bindingsQuery));
const accounts=JSON.parse(await fs.readFile(path.join(runtime.run,'private/accounts.json'),'utf8'));
const sourceAccount=accounts.find(account=>account.username==='g_holiday_employee');assert.ok(sourceAccount);
const origin=new URL(sessions.sales.page.url()).origin;
const denied=(response,label)=>check(label,[400,403,404,409].includes(response.status)||[400,403,404,409].includes(response.body?.code));
const createDepartment=(suffix,parent=100)=>{
  const ancestors=database('SELECT ancestors FROM sys_dept WHERE tenant_id=100000 AND dept_id='+parent+' AND deleted=0');
  assert.match(ancestors,/^[0-9,]+$/);
  const department=identifier('INSERT INTO sys_dept (tenant_id,parent_id,ancestors,dept_name,status,deleted,create_by,create_time) VALUES (100000,'+parent+','+sql(ancestors+','+parent)+','+sql(marker+'_'+suffix)+",'0',0,"+sql(marker)+',NOW()); SELECT LAST_INSERT_ID();');
  departments.push(department);return department;
};
const createRole=(suffix,scopeType,scope='')=>{
  const role=identifier('INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,ds_scope,status,deleted,create_by) VALUES (100000,'+sql(marker+'_'+suffix)+','+sql(marker+'_'+suffix)+",999,'2',"+scopeType+','+sql(scope)+",'0',0,"+sql(marker)+'); SELECT LAST_INSERT_ID();');
  roles.push(role);
  mutate('INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT DISTINCT 100000,'+role+',grants.menu_id FROM sys_user_role membership JOIN sys_role_menu grants ON grants.tenant_id=membership.tenant_id AND grants.role_id=membership.role_id JOIN sys_menu menu ON menu.menu_id=grants.menu_id WHERE membership.tenant_id=100000 AND membership.user_id='+Number(sessions.sales.identity.userId)+" AND COALESCE(menu.perms,'')<>'crm:activity:assign'");
  return role;
};
const createPerson=(actor,department,role)=>{
  const username=marker+'_'+actor;
  const userId=identifier('INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time) SELECT 100000,'+department+','+sql(username)+','+sql(username)+",password,'0',0,'0',"+sql(marker)+',NOW() FROM sys_user WHERE tenant_id=100000 AND user_name='+sql(sourceAccount.username)+" AND deleted=0 AND status='0'; SELECT LAST_INSERT_ID();");
  const person={actor,username,userId,department,role};people.push(person);
  mutate('INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,'+userId+','+role+')');
  person.employeeId=identifier('INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by,deleted) VALUES (100000,'+sql(username)+','+sql(username)+",'MALE',"+department+",'REGULAR',"+userId+','+sql(marker)+',0); SELECT LAST_INSERT_ID();');
  return person;
};
let gatewayRedis;
const waitForLogin=async()=>{
  gatewayRedis||=await ownedGatewayRedis(runtime.state);
  const matching=gatewayRedis('HVALS','cloudflow:ratelimit:rules:active').split(/\r?\n/).filter(Boolean).map(value=>JSON.parse(value)).filter(rule=>rule.status==='ACTIVE'&&rule.pathPattern==='/auth/login'&&rule.httpMethod==='POST');
  assert.equal(matching.length,1);const rule=matching[0];assert.equal(rule.dimension,'IP');
  const limit=Math.max(rule.rps,rule.burst??rule.rps);
  assert.ok(Number.isInteger(limit)&&limit>0&&rule.windowSeconds>0&&rule.windowSeconds<=60);
  const counter='ratelimit:'+rule.id+':127.0.0.1';
  while(Number(gatewayRedis('GET',counter)||'0')>=limit){
    const remaining=Number(gatewayRedis('PTTL',counter));assert.ok(remaining>0&&remaining<=60000);
    await new Promise(resolve=>setTimeout(resolve,Math.min(remaining+150,60000)));
  }
};
const login=async person=>{
  await waitForLogin();
  if(sessions[person.actor])await sessions[person.actor].context.close();
  const context=await runtime.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const loginPage=await context.newPage();
  loginPage.on('pageerror',()=>runtime.browserErrors.push('login_'+person.actor));
  await loginPage.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateE1ActivityAccount(loginPage,{...sourceAccount,username:person.username},origin);
  check('owned_login_'+person.actor,identity.authenticated&&identity.tenantId==='100000'&&identity.userId===String(person.userId));
  const token=await loginPage.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
  runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));
  sessions[person.actor]={page:loginPage,context,identity};
  check('owned_activity_permissions_'+person.actor,['crm:activity:list','crm:activity:add','crm:activity:edit'].every(permission=>identity.permissions.includes(permission))&&!identity.permissions.includes('crm:activity:assign')&&!identity.permissions.includes('*:*:*'));
};
const sorted=values=>[...values].sort((left,right)=>left-right);
const sameIds=(actual,expected)=>JSON.stringify(sorted(actual))===JSON.stringify(sorted(expected));
const ids=value=>value.rows.map(row=>row.activityId);
const query=(parameters={},actor='supervisor')=>ok(actor,'/crm/activity/calendar?'+new URLSearchParams({subject:marker,pageSize:100,...parameters}));
const detail=(id,actor='supervisor')=>ok(actor,'/crm/activity/'+id);
const create=async(actor,suffix,participants=[])=>{
  const value=await ok(actor,'/crm/activity','POST',{activity:{activityType:'MEETING',subject:marker+'_'+suffix,status:'PLANNED',priority:'MEDIUM',bizType:'NONE',startTime:start,endTime:end,description:marker+'_private_description'},participants,reminders:[]});
  check('created_'+suffix,Number.isSafeInteger(value.activity.activityId)&&value.activity.activityId>0);
  owned.add(value.activity.activityId);return value;
};
const safeFailure=error=>{
  let message=error instanceof Error?error.message:'E1 department verification failed';
  for(const secret of runtime.sensitive)if(secret)message=message.replaceAll(secret,'[REDACTED]');
  return message.slice(0,2000);
};
let failure,page;
try{
  check('server_browser_same_day',database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d')")===start.slice(0,10));
  const local=createDepartment('local');
  const child=createDepartment('child',local);
  const outside=createDepartment('outside');
  const supervisorRole=createRole('supervisor',3);
  const memberRole=createRole('member',4);
  const supervisor=createPerson('supervisor',local,supervisorRole);
  for(const person of [supervisor,createPerson('peer',local,memberRole),createPerson('child',child,memberRole),createPerson('outside',outside,memberRole)])await login(person);
  const own=await create('supervisor','own');
  const peer=await create('peer','same_department');
  const subordinate=await create('child','child_department');
  const unrelated=await create('outside','unrelated');
  let invited=await create('outside','invited',[{participantType:'USER',participantRefId:supervisor.userId,acceptanceStatus:'NONE'}]);
  const all=[own,peer,subordinate,unrelated,invited];
  const ownId=own.activity.activityId,invitedId=invited.activity.activityId;
  const redis=gatewayRedis;
  const cacheKey='user:datascope:100000:'+supervisor.userId;
  const numericValues=value=>Array.isArray(value)?value.flatMap(numericValues):typeof value==='number'?[value]:[];
  const assertCache=(scopeType,departmentIds,label)=>{
    const encoded=redis('GET',cacheKey);check(label+'_present',encoded.length>0);
    const decoded=JSON.parse(encoded);
    const snapshot=Array.isArray(decoded)?decoded.find(value=>value&&typeof value==='object'&&!Array.isArray(value)):decoded;
    check(label+'_identity',snapshot&&Number(snapshot.tenantId)===100000&&Number(snapshot.userId)===supervisor.userId);
    check(label+'_scope',Number(snapshot.dsType)===scopeType&&sameIds(numericValues(snapshot.dsDeptIds),departmentIds));
    const ttl=Number(redis('PTTL',cacheKey));check(label+'_ttl',ttl>0&&ttl<=300000);
  };
  const phases=[
    {type:3,departments:[local],expected:[own,peer,invited]},
    {type:2,departments:[local,child],expected:[own,peer,subordinate,invited]},
    {type:1,departments:[child],expected:[own,subordinate,invited]}
  ];
  for(const phase of phases){
    const label='scope_'+phase.type;
    if(phase.type!==3){
      const role=await ok('admin','/auth/system/role/'+supervisorRole);
      check(label+'_owned_role',role.roleName===marker+'_supervisor'&&role.menuIds.length>0);
      await ok('admin','/auth/system/role','PUT',{...role,dsType:phase.type,dsScope:phase.type===1?String(child):''});
      const changed=await ok('admin','/auth/system/role/'+supervisorRole);
      check(label+'_role_saved',changed.dsType===phase.type&&changed.dsScope===(phase.type===1?String(child):'')&&sameIds(changed.menuIds,role.menuIds));
      assertCache(phase.type,phase.departments,label+'_refreshed_cache');
      const revoked=await api('supervisor','/crm/activity/'+ownId);
      check(label+'_previous_session_revoked',revoked.status===401||revoked.body?.code===401);
      await login(supervisor);
    }
    assertCache(phase.type,phase.departments,label+'_real_login_cache');
    const expected=phase.expected.map(value=>value.activity.activityId);
    const visible=await query();
    check(label+'_calendar_union',visible.total===expected.length&&sameIds(ids(visible),expected));
    const personal=await query({ownerId:supervisor.userId});
    check(label+'_personal_union',personal.total===2&&sameIds(ids(personal),[ownId,invitedId]));
    for(const view of ['TODAY','WEEK']){
      const filtered=await query({view});
      check(label+'_personal_'+view,filtered.total===2&&sameIds(ids(filtered),[ownId,invitedId]));
    }
    const paged=[];
    for(let pageNumber=1;pageNumber<=expected.length+1;pageNumber++){
      const current=await query({pageNum:pageNumber,pageSize:1});
      check(label+'_pagination_'+pageNumber,current.total===expected.length&&current.rows.length===(pageNumber<=expected.length?1:0));
      paged.push(...ids(current));
    }
    check(label+'_pagination_complete',new Set(paged).size===paged.length&&sameIds(paged,expected));
    for(const item of all){
      const activityId=item.activity.activityId;
      if(expected.includes(activityId))check(label+'_detail_'+item.activity.subject.slice(marker.length+1),(await detail(activityId)).activity.activityId===activityId);
      else denied(await api('supervisor','/crm/activity/'+activityId),label+'_denied_'+item.activity.subject.slice(marker.length+1));
    }
    for(const item of phase.expected.filter(value=>value.activity.activityId!==ownId)){
      const current=await detail(item.activity.activityId);
      const before=digest(database('SELECT * FROM crm_activity WHERE activity_id='+item.activity.activityId));
      denied(await api('supervisor','/crm/activity',{method:'PUT',body:{activity:{...current.activity,description:marker+'_forbidden'},participants:current.participants,reminders:[]}}),label+'_readonly_'+item.activity.subject.slice(marker.length+1));
      check(label+'_rejected_write_preserved_'+item.activity.subject.slice(marker.length+1),digest(database('SELECT * FROM crm_activity WHERE activity_id='+item.activity.activityId))===before);
    }
    check(label+'_foreign_tenant_empty',(await query({},'foreign')).total===0);
    denied(await api('foreign','/crm/activity/'+ownId),label+'_foreign_tenant_detail_denied');
    page=await sessions.supervisor.context.newPage();page.setDefaultTimeout(30000);
    page.on('pageerror',()=>runtime.browserErrors.push(label));
    page.on('response',response=>{const url=new URL(response.url());if(url.pathname.startsWith('/api/'))uiRequests.push({scope:phase.type,path:url.pathname,method:response.request().method(),status:response.status()});});
    await page.goto(origin+'/office/crm/activity',{waitUntil:'networkidle'});
    await page.getByRole('textbox',{name:'搜索活动',exact:true}).fill(marker);
    await page.locator('.fc-dayGridMonth-view').waitFor();
    const expectedSubjects=phase.expected.map(value=>value.activity.subject);
    await page.waitForFunction(({prefix,subjects})=>{const actual=[...document.querySelectorAll('a.fc-event')].map(element=>element.textContent||'').filter(value=>value.includes(prefix));return actual.length===subjects.length&&subjects.every(subject=>actual.some(value=>value.includes(subject)));},{prefix:marker,subjects:expectedSubjects});
    check(label+'_ui_month_union',await page.locator('a.fc-event').filter({hasText:marker}).count()===expected.length);
    for(const item of phase.expected){
      const event=page.locator('a.fc-event').filter({hasText:item.activity.subject}).first();
      check(label+'_ui_month_editability_'+item.activity.subject.slice(marker.length+1),await event.evaluate(element=>element.classList.contains('fc-event-draggable'))===(item.activity.activityId===ownId));
    }
    await page.screenshot({path:path.join(output,'departments-'+phase.type+'-month.png'),fullPage:true});
    await page.getByRole('combobox',{name:'显示方式',exact:true}).selectOption('list');
    const assertList=async(subjects,suffix)=>{
      await page.waitForFunction(expectedSubjects=>{const actual=[...document.querySelectorAll('table.unity-data-table tbody tr td:first-child button')].map(element=>element.textContent);return actual.length===expectedSubjects.length&&expectedSubjects.every(subject=>actual.includes(subject));},subjects);
      check(label+'_ui_'+suffix,await page.locator('table.unity-data-table tbody tr td:first-child button').count()===subjects.length);
    };
    await assertList(expectedSubjects,'list_union');
    await page.screenshot({path:path.join(output,'departments-'+phase.type+'-list.png'),fullPage:true});
    await page.getByRole('combobox',{name:'我的活动',exact:true}).selectOption('TODAY');
    await assertList([own.activity.subject,invited.activity.subject],'personal_union');
    await page.screenshot({path:path.join(output,'departments-'+phase.type+'-personal.png'),fullPage:true});
    await page.getByRole('button',{name:invited.activity.subject,exact:true}).click();
    const dialog=page.getByRole('dialog',{name:invited.activity.subject,exact:true});await dialog.waitFor();
    check(label+'_ui_invitation_readonly',await dialog.getByRole('button',{name:'保存活动',exact:true}).count()===0);
    if(phase.type===1)await page.screenshot({path:path.join(output,'departments-invitation-readonly.png'),fullPage:true});
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();
    if(phase.type!==1)await page.close();
  }
  result.departments=true;result.selfAccess=true;result.scopeChanges=true;
  await ok('supervisor','/crm/activity/'+invitedId+'/respond','POST',{acceptanceStatus:'DECLINED'});
  invited=await detail(invitedId);
  check('declined_invitation_still_readable',invited.participants.some(value=>value.participantRefId===supervisor.userId&&value.acceptanceStatus==='DECLINED'));
  check('declined_invitation_still_personal',sameIds(ids(await query({ownerId:supervisor.userId})),[ownId,invitedId]));
  await ok('outside','/crm/activity','PUT',{activity:invited.activity,participants:[],reminders:[]});
  denied(await api('supervisor','/crm/activity/'+invitedId),'removed_invitation_detail_denied');
  check('removed_invitation_not_personal',sameIds(ids(await query({ownerId:supervisor.userId})),[ownId]));
  check('removed_invitation_department_union_kept',sameIds(ids(await query()),[ownId,subordinate.activity.activityId]));
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('textbox',{name:'搜索活动',exact:true}).fill(marker);
  await page.getByRole('combobox',{name:'我的活动',exact:true}).selectOption('TODAY');
  await page.waitForFunction(subject=>{const elements=[...document.querySelectorAll('table.unity-data-table tbody tr td:first-child button')];return elements.length===1&&elements[0].textContent===subject;},own.activity.subject);
  check('removed_invitation_ui_hidden',await page.getByRole('button',{name:invited.activity.subject,exact:true}).count()===0);
  await page.screenshot({path:path.join(output,'departments-invitation-removed.png'),fullPage:true});
  result.ui=true;
  check('browser_no_runtime_errors',runtime.browserErrors.length===0);
  check('ui_requests_all_successful',uiRequests.every(value=>value.status<400));
}catch(error){
  failure=safeFailure(error);
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'departments-failure.png'),fullPage:true}).catch(()=>{});
}finally{
  const finalFailures=[];
  const finalize=async task=>{try{await task();}catch(error){const message=safeFailure(error);finalFailures.push(message);failure||=message;}};
  for(const activityId of owned)await finalize(()=>ok('admin','/crm/activity/'+activityId,'DELETE'));
  for(const role of roles)await finalize(async()=>{
    check('cleanup_owned_role_'+role,database('SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND role_id='+role+' AND create_by='+sql(marker))==='1');
    await ok('admin','/auth/system/role/'+role,'DELETE');
    check('cleanup_role_deleted_'+role,database('SELECT COUNT(*) FROM sys_role WHERE tenant_id=100000 AND role_id='+role+' AND deleted=1')==='1');
  });
  for(const person of people)await finalize(async()=>{
    if(sessions[person.actor]){
      const revoked=await api(person.actor,'/crm/activity/calendar?'+new URLSearchParams({subject:marker}));
      check('cleanup_session_revoked_'+person.actor,revoked.status===401||revoked.body?.code===401);
    }
    mutate('DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id='+person.userId+' AND role_id='+person.role);
    mutate("UPDATE sys_user SET status='1',deleted=1,update_by="+sql(marker)+' WHERE tenant_id=100000 AND user_id='+person.userId+' AND user_name='+sql(person.username)+' AND create_by='+sql(marker));
    if(person.employeeId)mutate('UPDATE hr_employee SET deleted=1 WHERE tenant_id=100000 AND id='+person.employeeId+' AND user_id='+person.userId+' AND create_by='+sql(marker));
    check('cleanup_user_disabled_'+person.actor,database("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id="+person.userId+" AND status='1' AND deleted=1")==='1');
  });
  for(const department of [...departments].reverse())await finalize(()=>mutate("UPDATE sys_dept SET status='1',deleted=1 WHERE tenant_id=100000 AND dept_id="+department+' AND create_by='+sql(marker)));
  await finalize(()=>check('owned_fixtures_inactive',database('SELECT (SELECT COUNT(*) FROM crm_activity WHERE tenant_id=100000 AND deleted=0 AND subject LIKE '+sql(marker+'%')+')+(SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND create_by='+sql(marker)+')+(SELECT COUNT(*) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND create_by='+sql(marker)+')')==='0'));
  for(const original of originals)await finalize(()=>check('original_rows_preserved_'+original.table,digest(database(original.query))===original.hash));
  await finalize(()=>check('role_grants_preserved',digest(database(grantsQuery))===grants));
  await finalize(()=>check('user_role_bindings_preserved',digest(database(bindingsQuery))===bindings));
  result.preservation=finalFailures.length===0;
  await finalize(async()=>{result.secretScan=await runtime.scan();result.secrets=true;});result.finalFailures=finalFailures;
  await runtime.close();result.passed=!failure;result.failure=failure;result.checks=runtime.checks;result.requests=runtime.requests;result.uiRequests=uiRequests;result.verifiedAt=new Date().toISOString();
  result.fixtureCounts={departments:departments.length,roles:roles.length,users:people.length,activities:owned.size};
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_DEPARTMENTS: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; ui_requests='+uiRequests.length+'; departments='+result.departments+'; self_access='+result.selfAccess+'; scope_changes='+result.scopeChanges+'; ui='+result.ui+'; all_acceptance_complete=false');
}
if(failure)throw new Error(failure);
