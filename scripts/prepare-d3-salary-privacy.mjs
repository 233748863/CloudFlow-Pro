import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { authenticateD2PrivacyAccount } from './runtime-checks/d2-privacy-browser-auth.mjs';

const root='D:/CloudFlowPro', evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const [round,backend,frontend]=process.argv.slice(4);for(const value of [round,backend,frontend])assert.match(value,/^r[1-9][0-9]*$/);
const output=path.join(evidence,'d3-salary-privacy-preparation-20261006-'+round);fs.mkdirSync(output);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),state=read(path.join(run,'state.json'));
assert.equal(state.status,'RUNNING');assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));
const hash=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
const inputs=[...read(path.join(evidence,`h3-portal-finance-20261002-backend-${backend}-inputs.json`)),...read(path.join(evidence,`h3-portal-finance-20261002-frontend-${frontend}-inputs.json`)),...['scripts/prepare-d3-salary-privacy.mjs','scripts/run-d3-salary-privacy-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs','scripts/runtime-checks/d2-privacy-browser-auth.mjs'].map(Path=>({Path,Hash:hash(fs.readFileSync(path.join(root,Path)))}))];
const unchanged=()=>{for(const item of inputs)assert.equal(hash(fs.readFileSync(path.join(root,item.Path))),item.Hash);};unchanged();
fs.writeFileSync(path.join(output,'inputs.json'),JSON.stringify(inputs,null,2));
const env={...process.env};delete env.MYSQL_PWD;
const db=statement=>{const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1',`--port=${state.mysqlPort}`,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:300000,maxBuffer:32*1024*1024});assert.equal(result.status,0,'Owned preparation SQL failed');return result.stdout.trim();};
assert.equal(fs.realpathSync(db('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const report={passed:false,marker:'D3P-CONFIG-'+randomUUID().replaceAll('-','').slice(0,12),requests:[],granted:[],formalSeed:false,jobRecovered:false};
const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));save();
const pairs=()=>db('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id');
const beforePairs=pairs(),beforeMenu=hash(db('SELECT * FROM sys_menu ORDER BY menu_id'));
const expectedAdded=Array.from({length:10},(_,index)=>'100000\t'+(index+2)+'\t1014');
assert.equal(db('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=729'),'1,2,3,4,5,6,7,8,9,10,11');
assert.equal(db('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1014'),'1');
const scratch='d3_confirm_'+randomUUID().replaceAll('-','');
assert.equal(db(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${scratch}'`),'0');
try{
  const files=fs.readdirSync(path.join(root,'cloudflow-backend/DB')).filter(name=>/^0[1-7]\./.test(name)).sort();assert.equal(files.length,7);
  for(const file of files){db((file.startsWith('01.')?'':`USE ${scratch};\n`)+fs.readFileSync(path.join(root,'cloudflow-backend/DB',file),'utf8').replace(/^\uFEFF/,'').replace(/\bcloud_flow_db\b/g,scratch));console.log('D3_CONFIRM_SEED: '+file+' passed');}
  assert.equal(db(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${scratch}' AND table_type='BASE TABLE'`),'374');
  assert.equal(db(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM ${scratch}.sys_role_menu WHERE tenant_id=100000 AND menu_id=1014`),'1,2,3,4,5,6,7,8,9,10,11');
  const employeeBefore=db('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id').split(/\r?\n/);
  const employeeAfter=db(`SELECT menu_id FROM ${scratch}.sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id`).split(/\r?\n/);
  assert.deepEqual(employeeAfter.filter(value=>value!=='1014'),employeeBefore);report.formalSeed=true;save();
}finally{assert.match(scratch,/^d3_confirm_[a-f0-9]{32}$/);db(`DROP DATABASE IF EXISTS ${scratch}`);assert.equal(db(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${scratch}'`),'0');}
const runtime=await createD1LeaveRuntime(root,output),{sessions,check}=runtime;
const origin=new URL(sessions.admin.page.url()).origin,browser=sessions.admin.context.browser();
const roleColumns=db("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_NAME='sys_role' ORDER BY ORDINAL_POSITION").split(/\r?\n/).filter(value=>!['update_time','update_by','version'].includes(value));assert.ok(roleColumns.every(value=>/^[a-z_]+$/.test(value)));
const roleRows=()=>hash(db('SELECT '+roleColumns.map(value=>'`'+value+'`').join(',')+' FROM sys_role ORDER BY role_id'));
const rolesBefore=roleRows(),roleVersionsBefore=db('SELECT role_id,version FROM sys_role ORDER BY role_id');let failure;
async function api(actor,url,method='GET',body){
  assert.ok(/^\/auth\/system\/role(?:\/(?:[2-9]|10|11))?$/.test(url)||url==='/auth/system/job/2102'||url==='/auth/system/holiday/calendar'||url==='/auth/system/dept');
  const result=await sessions[actor].page.evaluate(async({url,method,body})=>{const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice(11));if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch('/api'+url,{method,headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,body:await response.json()};},{url,method,body});
  report.requests.push({actor,url,method,status:result.status,code:result.body?.code});save();return runtime.success(result,'preparation_'+method+'_'+url);
}
try{
  for(let roleId=2;roleId<=11;roleId++){
    const role=await api('admin','/auth/system/role/'+roleId);assert.ok(!role.menuIds.map(String).includes('1014'));
    await api('admin','/auth/system/role','PUT',{...role,menuIds:[...role.menuIds,1014]});report.granted.push(roleId);save();
  }
  const beforeSet=new Set(beforePairs.split(/\r?\n/)),after=pairs().split(/\r?\n/);
  assert.deepEqual(after.filter(value=>!beforeSet.has(value)).sort(),expectedAdded.sort());assert.ok([...beforeSet].every(value=>after.includes(value)));
  assert.equal(hash(db('SELECT * FROM sys_menu ORDER BY menu_id')),beforeMenu);assert.equal(roleRows(),rolesBefore);
  assert.equal(db('SELECT role_id,CASE WHEN tenant_id=100000 AND role_id BETWEEN 2 AND 11 THEN version-1 ELSE version END FROM sys_role ORDER BY role_id'),roleVersionsBefore);report.exactGrants=true;
  const account=read(path.join(run,'private/accounts.json')).find(value=>value.username==='g_import_tenant');runtime.sensitive.add(account.password);
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateD2PrivacyAccount(page,account,origin);check('foreign_real_login',identity.authenticated&&identity.tenantId==='100001');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));sessions.foreign={context,page,identity};
  assert.equal(db("SELECT COUNT(*) FROM sys_job WHERE job_id=2102 AND tenant_id=100001 AND job_name='D3P-324b5f9a3cd8' AND status='PAUSED' AND deleted=0"),'1');
  await api('foreign','/auth/system/job/2102','DELETE');assert.equal(db('SELECT deleted FROM sys_job WHERE job_id=2102'),'1');report.jobRecovered=true;save();
  await api('foreign','/auth/system/holiday/calendar','POST',{calendarCode:report.marker,calendarName:report.marker,defaultFlag:0,weeklyRestDays:'6,7',workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  report.calendarId=db(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100001 AND calendar_code='${report.marker}'`);assert.match(report.calendarId,/^\d+$/);save();
  await api('foreign','/auth/system/dept','POST',{deptName:report.marker,parentId:0,orderNum:0,status:'0',holidayCalendarId:report.calendarId});
  report.deptId=db(`SELECT dept_id FROM sys_dept WHERE tenant_id=100001 AND dept_name='${report.marker}' AND deleted=0`);assert.match(report.deptId,/^\d+$/);save();
  report.scan=await runtime.scan();unchanged();report.passed=true;
}catch(error){failure=error;report.failure=String(error.message).slice(0,240);}
finally{await runtime.close();report.inputs=inputs.length;save();console.log('D3_PRIVACY_PREPARATION: '+JSON.stringify({passed:report.passed,grants:report.granted.length,formalSeed:report.formalSeed,jobRecovered:report.jobRecovered,calendar:Boolean(report.calendarId),department:Boolean(report.deptId),failure:report.failure}));if(failure)process.exitCode=1;}
