import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { authenticateD2PrivacyAccount } from './runtime-checks/d2-privacy-browser-auth.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d2-attendance-privacy'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d2-attendance-privacy-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const marker='D2P-'+randomUUID().replaceAll('-','').slice(0,12);
const fixture={marker,matrix:[],restorations:{},stages:[]};
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const save=()=>write('fixture.json',fixture);
const id=value=>{const result=String(value);assert.match(result,/^[1-9]\d*$/);return result;};
const sql=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const hash=value=>createHash('sha256').update(value).digest('hex');
const runtime=await createD1LeaveRuntime(root,output);
const {check,checks,database,databaseDigest,rows,sessions,requests,browserErrors,sensitive}=runtime;
const browser=sessions.admin.context.browser(),origin=new URL(sessions.admin.page.url()).origin;
const api=async(actor,url,options={})=>{
  assert.match(url,/^\/(?:hr\/(?:attendance|ess\/attendance|employees)|auth\/system\/(?:dept|holiday))(?:\/|\?|$)/);
  const response=await sessions[actor].page.evaluate(async supplied=>{
    const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
    const headers={};if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;
    const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));
    if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
    if(supplied.body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch('/api'+supplied.url,{method:supplied.method||'GET',credentials:'same-origin',headers,
      ...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
    return {status:response.status,traceId:response.headers.get('X-Trace-Id'),
      body:(response.headers.get('Content-Type')||'').includes('json')?await response.json():null};
  },{url,...options});
  requests.push({actor,path:url,method:options.method||'GET',status:response.status,code:response.body?.code,traceId:response.traceId});
  return response;
};
const ok=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,{method,body}),actor+'_'+method+'_'+url.split('?')[0]);
const base='/hr/attendance',ess='/hr/ess/attendance',holiday='/auth/system/holiday';
const stage=label=>{fixture.stages.push(label);save();console.log('D2_PRIVACY_STAGE: '+label);};
const tables=[['hr_employee','id'],['hr_shift','id'],['hr_attendance_rule','id'],['hr_schedule_assignment','id'],
  ['hr_attendance_checkin','checkin_id'],['hr_attendance_record','id'],['hr_attendance_monthly','id'],
  ['sys_dept','dept_id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
const bounds={};
const preserved=()=>Object.fromEntries(tables.map(([table,key])=>[table,databaseDigest('SELECT * FROM '+table+' WHERE '+key+'<='+bounds[table]+' ORDER BY '+key)]));
const grants=()=>hash(database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id')
  +'\n'+database('SELECT user_id,role_id FROM sys_user_role ORDER BY user_id,role_id'));
const evidence={correctness:false,selfEntry:false,geofence:false,scope:false,tenant:false,anonymous:false,recordPages:false,preservation:false,restoration:false,secrets:false};
let original,originalGrants,employeeId,employeeBody,failure;
const allPunches=()=>hash(database('SELECT * FROM hr_attendance_checkin ORDER BY checkin_id'));
const punchRow=punchId=>rows("SELECT JSON_OBJECT('id',CAST(checkin_id AS CHAR),'tenant',CAST(tenant_id AS CHAR),'employee',CAST(employee_id AS CHAR),'method',check_method,'latitude',latitude,'longitude',longitude,'valid',location_valid_flag,'skip',skip_auto_flag,'device',device_id,'location',location_name,'epoch',UNIX_TIMESTAMP(check_time),'date',attendance_date,'shift',CAST(shift_id AS CHAR)) FROM hr_attendance_checkin WHERE checkin_id="+id(punchId))[0];
async function addIdentity(actor,username,tenantId){
  const accounts=JSON.parse(fs.readFileSync(path.join(runtime.run,'private/accounts.json'),'utf8'));
  const account=accounts.find(value=>value.username===username);assert.ok(account,'Owned D2 account missing');sensitive.add(account.password);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',()=>browserErrors.push(actor));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateD2PrivacyAccount(page,account,origin);
  check('real_login_'+actor,identity.authenticated&&identity.tenantId===tenantId);
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
  sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));
  sessions[actor]={context,page,identity};
}
const allowedPermissions=actor=>sessions[actor].identity.permissions;
const listUrl=employee=>base+'/checkins?'+new URLSearchParams({employeeId:employee,from:'2026-01-01',to:'2026-12-31'});
async function readCase(actor,label,target,allowed){
  const response=await api(actor,listUrl(target.id));
  if(allowed){
    const data=runtime.success(response,'read_'+actor+'_'+label);
    check(actor+'_'+label+'_only_expected_location',Array.isArray(data)&&data.length>0&&data.every(row=>String(row.employeeId)===target.id)
      &&data.some(row=>row.locationName===target.location&&Number(row.latitude)===target.latitude&&Number(row.longitude)===target.longitude));
  }else{
    check(actor+'_'+label+'_denied',response.status===(actor==='anonymous'?401:403)||response.status===404||response.status===401);
    check(actor+'_'+label+'_no_location_disclosure',response.body?.code!==200
      &&!JSON.stringify(response.body).includes(target.location)
      &&!JSON.stringify(response.body).includes(String(target.latitude))&&!JSON.stringify(response.body).includes(String(target.longitude)));
  }
  fixture.matrix.push({actor,target:label,allowed,status:response.status,code:response.body?.code});save();
}
try{
  await addIdentity('manager','g_holiday_manager','100000');
  await addIdentity('foreign','g_import_tenant','100001');
  const anonymousContext=await browser.newContext({viewport:{width:1440,height:1000}});
  await anonymousContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const anonymousPage=await anonymousContext.newPage();anonymousPage.on('pageerror',()=>browserErrors.push('anonymous'));
  await anonymousPage.goto(origin,{waitUntil:'domcontentloaded'});sessions.anonymous={context:anonymousContext,page:anonymousPage};
  for(const [table,key]of tables)bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  original=preserved();originalGrants=grants();fixture.originalBounds=bounds;fixture.originalDigest=original;fixture.originalGrants=originalGrants;save();
  check('employee_and_manager_have_only_self_attendance_permission',['employee','manager'].every(actor=>allowedPermissions(actor).includes('hr:attendance:mine')&&!allowedPermissions(actor).includes('hr:attendance:list')));
  check('hr_and_foreign_admin_have_management_read_permission',allowedPermissions('hr').includes('hr:attendance:list')
    &&(allowedPermissions('foreign').includes('hr:attendance:list')||allowedPermissions('foreign').includes('*:*:*')));
  const userId=id(sessions.employee.identity.userId);
  check('employee_account_initially_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+userId+' AND deleted=0')==='0');
  fixture.deptId=id(database('SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id='+id(sessions.hr.identity.userId)));
  check('department_manager_has_same_department',database('SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id='+id(sessions.manager.identity.userId))===fixture.deptId);
  await ok('admin','/auth/system/dept','POST',{deptName:marker,parentId:0,orderNum:0,status:'0'});
  fixture.outsideDeptId=id(database('SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name='+sql(marker)+' AND deleted=0'));
  fixture.foreignDeptId=id(database('SELECT dept_id FROM sys_user WHERE tenant_id=100001 AND user_id='+id(sessions.foreign.identity.userId)));
  employeeBody={employeeNo:marker,name:marker,gender:'MALE',deptId:fixture.deptId,userId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'};
  employeeId=id(await ok('admin','/hr/employees','POST',employeeBody));fixture.employeeId=employeeId;fixture.employeeBody=employeeBody;save();
  const sameId=id(await ok('admin','/hr/employees','POST',{...employeeBody,employeeNo:marker+'-S',name:marker+'-S',userId:null}));
  const outsideId=id(await ok('admin','/hr/employees','POST',{...employeeBody,employeeNo:marker+'-O',name:marker+'-O',deptId:fixture.outsideDeptId,userId:null}));
  const foreignId=id(await ok('foreign','/hr/employees','POST',{...employeeBody,employeeNo:marker+'-F',name:marker+'-F',deptId:fixture.foreignDeptId,userId:null}));
  fixture.targets={
    own:{id:employeeId,latitude:31.2345678,longitude:121.4567891,location:marker+'-OWN'},
    same:{id:sameId,latitude:22.1234567,longitude:110.2345678,location:marker+'-SAME'},
    outside:{id:outsideId,latitude:40.1111111,longitude:116.2222222,location:marker+'-OUTSIDE'},
    foreign:{id:foreignId,latitude:35.7654321,longitude:130.1234567,location:marker+'-FOREIGN'}
  };save();
  await ok('admin',holiday+'/calendar','POST',{calendarCode:marker,calendarName:marker,defaultFlag:0,weeklyRestDays:'6,7',
    workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+sql(marker)));
  fixture.shiftId=id(await ok('admin',base+'/shifts','POST',{shiftCode:marker,shiftName:marker,startTime:'09:00:00',endTime:'18:00:00',
    breakMinutes:60,workMinutes:480,checkinWindowBeforeMinutes:60,checkoutWindowAfterMinutes:60,lateGraceMinutes:10,earlyExitGraceMinutes:10,
    halfDayHoursThreshold:4,absentHoursThreshold:2,workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',
    holidayCalendarId:fixture.calendarId,autoAttendanceFlag:1,processAttendanceAfter:'2025-01-01',markOnHolidayFlag:0,overtimeThresholdMinutes:0,status:1}));
  fixture.ruleId=id(await ok('admin',base+'/rules','POST',{ruleCode:marker,ruleName:marker,ruleType:'STANDARD',shiftId:fixture.shiftId,checkMethods:['APP','GPS','CARD'],status:1,
    configJson:{geofence:{latitude:fixture.targets.own.latitude,longitude:fixture.targets.own.longitude,radiusMeters:100}}}));
  await ok('admin',base+'/schedules','POST',{targetType:'EMPLOYEE',targetId:employeeId,ruleId:fixture.ruleId,effectiveStart:'2026-01-01',effectiveEnd:'2026-12-31',status:'ACTIVE'});save();
  for(const [label,target]of Object.entries(fixture.targets).filter(([label])=>label!=='own')){
    const actor=label==='foreign'?'foreign':'admin';
    target.punchId=id(await ok(actor,base+'/checkins','POST',{employeeId:target.id,checkTime:'2026-07-21 12:00:00',logType:'IN',checkMethod:'CARD',
      latitude:target.latitude,longitude:target.longitude,locationName:target.location,deviceId:marker,remark:marker}));
  }
  const beforeSelf=Date.now()/1000;
  const selfId=id(await ok('employee',ess+'/checkins','POST',{employeeId:foreignId,tenantId:100001,checkTime:'2025-01-01 01:00:00',
    checkMethod:'MANUAL',skipAutoFlag:1,shiftId:999999999,logType:'IN',latitude:fixture.targets.own.latitude,longitude:fixture.targets.own.longitude,
    locationName:fixture.targets.own.location,deviceId:marker+'-device',locationValidFlag:0,remark:marker}));
  const afterSelf=Date.now()/1000,self=punchRow(selfId);
  check('self_entry_controls_identity_time_method_and_skip',self.employee===employeeId&&self.tenant==='100000'&&self.method==='APP'
    &&Number(self.skip)===0&&self.shift===fixture.shiftId&&Number(self.epoch)>=Math.floor(beforeSelf)-1&&Number(self.epoch)<=Math.ceil(afterSelf)+1);
  check('self_entry_preserves_seven_decimal_coordinates_and_device',Number(self.latitude)===fixture.targets.own.latitude&&Number(self.longitude)===fixture.targets.own.longitude
    &&self.device===marker+'-device'&&self.location===fixture.targets.own.location&&Number(self.valid)===1);
  fixture.selfPunchId=selfId;evidence.selfEntry=true;stage('self-identity-and-real-time');
  fixture.boundaries=[];
  for(const [index,distance,expected]of [[0,99.98,1],[1,100.02,0]]){
    const latitude=Number((fixture.targets.own.latitude+distance/6371000*180/Math.PI).toFixed(7));
    const encodedDistance=Math.abs(latitude-fixture.targets.own.latitude)*Math.PI/180*6371000;
    const punchId=id(await ok('admin',base+'/checkins','POST',{employeeId,checkTime:'2026-07-21 12:00:0'+index,logType:'IN',checkMethod:'GPS',
      latitude,longitude:fixture.targets.own.longitude,locationName:marker+'-boundary-'+index,deviceId:marker,locationValidFlag:1-expected,remark:marker}));
    const row=punchRow(punchId);
    check('encoded_geofence_boundary_'+index,Number(row.latitude)===latitude&&Number(row.valid)===expected&&(expected===1?encodedDistance<100:encodedDistance>100));
    fixture.boundaries.push({latitude,distanceMeters:Number(encodedDistance.toFixed(6)),locationValid:expected,punchId});save();
  }
  const missing=id(await ok('admin',base+'/checkins','POST',{employeeId,checkTime:'2026-07-21 12:00:02',logType:'IN',checkMethod:'GPS',locationName:marker+'-missing',remark:marker}));
  check('missing_coordinates_are_retained_as_invalid',punchRow(missing).latitude===null&&punchRow(missing).longitude===null&&Number(punchRow(missing).valid)===0);
  const beforeInvalid=allPunches();
  for(const coordinates of [{latitude:91,longitude:0},{latitude:0,longitude:181}]){
    const response=await api('admin',base+'/checkins',{method:'POST',body:{employeeId,checkTime:'2026-07-21 12:00:03',logType:'IN',checkMethod:'GPS',...coordinates,remark:marker}});
    check('invalid_coordinate_range_rejected_'+JSON.stringify(coordinates),[400,409].includes(response.status)&&response.body?.code!==200);
  }
  check('invalid_coordinate_attempts_create_no_rows',allPunches()===beforeInvalid);
  evidence.geofence=true;stage('geofence-centre-and-two-sides');
  const rawBeforeReads=allPunches();
  for(const label of ['own','same','outside'])await readCase('admin',label,fixture.targets[label],true);
  await readCase('admin','foreign',fixture.targets.foreign,false);
  for(const label of ['own','same'])await readCase('hr',label,fixture.targets[label],true);
  for(const label of ['outside','foreign'])await readCase('hr',label,fixture.targets[label],false);
  for(const actor of ['employee','manager'])for(const label of ['own','same','outside','foreign'])await readCase(actor,label,fixture.targets[label],false);
  await readCase('foreign','foreign',fixture.targets.foreign,true);
  for(const label of ['own','same','outside'])await readCase('foreign',label,fixture.targets[label],false);
  const ownNormal=await ok('employee',ess+'/checkins?from=2026-01-01&to=2026-12-31');
  for(const label of ['same','outside','foreign']){
    const ownTampered=await ok('employee',ess+'/checkins?'+new URLSearchParams({from:'2026-01-01',to:'2026-12-31',employeeId:fixture.targets[label].id,tenantId:label==='foreign'?'100001':'100000'}));
    check('self_query_ignores_forged_target_'+label,JSON.stringify(ownTampered)===JSON.stringify(ownNormal)&&ownTampered.every(row=>String(row.employeeId)===employeeId));
  }
  check('self_read_includes_original_and_invalid_positions',ownNormal.length===4&&ownNormal.some(row=>String(row.checkinId)===selfId)
    &&ownNormal.filter(row=>Number(row.locationValidFlag)===0).length===2);
  for(const label of ['own','foreign'])await readCase('anonymous',label,fixture.targets[label],false);
  const anonymousSelf=await api('anonymous',ess+'/checkins?from=2026-01-01&to=2026-12-31');
  check('anonymous_self_endpoint_denied',[401,403].includes(anonymousSelf.status)&&anonymousSelf.body?.code!==200);
  check('read_matrix_does_not_change_any_raw_punch',allPunches()===rawBeforeReads);
  stage('daily-record-page-access');
  fixture.recordMatrix=[];
  for(const [label,target]of Object.entries(fixture.targets)){
    const actor=label==='foreign'?'foreign':'admin';
    if(label==='foreign'){
      await ok(actor,holiday+'/calendar','POST',{calendarCode:marker+'-F',calendarName:marker+'-F',defaultFlag:0,weeklyRestDays:'6,7',
        workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
      fixture.foreignCalendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100001 AND calendar_code='+sql(marker+'-F')));
      fixture.foreignShiftId=id(await ok(actor,base+'/shifts','POST',{shiftCode:marker+'-F',shiftName:marker+'-F',startTime:'09:00:00',endTime:'18:00:00',
        breakMinutes:60,workMinutes:480,workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',
        holidayCalendarId:fixture.foreignCalendarId,autoAttendanceFlag:1,processAttendanceAfter:'2025-01-01',status:1}));
      await ok(actor,base+'/schedules','POST',{targetType:'EMPLOYEE',targetId:target.id,shiftId:fixture.foreignShiftId,
        effectiveStart:'2026-01-01',effectiveEnd:'2026-12-31',status:'ACTIVE'});
      save();
    }
    target.recordId=id(await ok(actor,base+'/records','POST',{employeeId:target.id,attendanceDate:'2026-07-21',status:'NORMAL',
      workMinutes:480,expectedMinutes:480,lateMinutes:0,earlyExitMinutes:0,remark:marker+'-'+label}));
  }
  const recordBaseline=databaseDigest('SELECT * FROM hr_attendance_record ORDER BY id');
  for(const actor of ['admin','hr','foreign','employee','manager','anonymous']){
    for(const [label,target]of Object.entries(fixture.targets)){
      const query=new URLSearchParams({employeeId:target.id,pageNum:'1',pageSize:'20',startDate:'2026-07-21',endDate:'2026-07-21',tenantId:label==='foreign'?'100001':'100000'});
      const result=await api(actor,base+'/records/page?'+query);
      const hasReadPermission=['admin','hr','foreign'].includes(actor);
      const allowed=actor==='admin'&&label!=='foreign'||actor==='hr'&&['own','same'].includes(label)||actor==='foreign'&&label==='foreign';
      if(hasReadPermission){
        const resultPage=runtime.success(result,'daily_record_page_'+actor+'_'+label);
        check('daily_record_scope_'+actor+'_'+label,resultPage.pageNum===1&&resultPage.pageSize===20&&resultPage.total===(allowed?1:0)
          &&Array.isArray(resultPage.rows)&&resultPage.rows.length===(allowed?1:0)
          &&resultPage.rows.every(record=>String(record.id)===target.recordId&&String(record.employeeId)===target.id));
        const legacy=await ok(actor,base+'/records?employeeId='+target.id);
        check('daily_record_legacy_scope_matches_'+actor+'_'+label,Array.isArray(legacy)&&legacy.length===(allowed?1:0)
          &&legacy.every(record=>String(record.id)===target.recordId));
      }else{
        check('daily_record_permission_denied_'+actor+'_'+label,[401,403].includes(result.status)&&result.body?.code!==200);
      }
      check('daily_record_page_does_not_expose_location_'+actor+'_'+label,!JSON.stringify(result.body).includes(target.location));
      fixture.recordMatrix.push({actor,target:label,allowed,status:result.status,code:result.body?.code});
    }
  }
  const outsideDepartment=await ok('hr',base+'/records/page?'+new URLSearchParams({deptId:fixture.outsideDeptId,pageNum:'1',pageSize:'20'}));
  check('daily_record_department_filter_cannot_expand_scope',outsideDepartment.total===0&&outsideDepartment.rows.length===0);
  check('daily_record_reads_preserve_all_records',recordBaseline===databaseDigest('SELECT * FROM hr_attendance_record ORDER BY id'));
  check('daily_record_reads_and_manual_results_preserve_raw_punches',allPunches()===rawBeforeReads);
  evidence.recordPages=true;save();
  evidence.scope=true;evidence.tenant=true;evidence.anonymous=true;evidence.correctness=true;stage('all-role-and-tenant-read-cases');
}catch(error){failure=error;}
finally{
  if(employeeId){
    try{
      check('only_owned_employee_binding_restored',database('SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id='+employeeId)===sessions.employee.identity.userId);
      await ok('admin','/hr/employees/'+employeeId,'PUT',{...employeeBody,userId:null});
      check('employee_account_unbound_after_test',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+id(sessions.employee.identity.userId)+' AND deleted=0')==='0');
      fixture.restorations.employeeBinding=true;
    }catch(error){fixture.restorations.employeeBinding=false;failure ||=error;}
  }
  evidence.restoration=fixture.restorations.employeeBinding===true;
  try{check('preexisting_business_rows_unchanged',!!original&&JSON.stringify(original)===JSON.stringify(preserved()));
    check('all_role_and_user_grants_unchanged',originalGrants===grants());check('browser_no_errors',browserErrors.length===0);evidence.preservation=true;}catch(error){failure ||=error;}
  try{const scan=await runtime.scan();evidence.secrets=true;console.log('D2_PRIVACY_LOG_SCAN: '+JSON.stringify(scan));}catch(error){failure ||=error;}
  await runtime.close();save();write('requests.json',requests);
  let message=failure?String(failure.message).split('\n')[0].slice(0,240):undefined;
  if(message)for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('result.json',{passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,
    matrix:fixture.matrix,recordMatrix:fixture.recordMatrix,boundaries:fixture.boundaries,all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_PRIVACY_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; matrix='+fixture.matrix.length+'; correctness='+evidence.correctness+'; preservation='+evidence.preservation+'; restoration='+evidence.restoration);
  if(failure){console.log('D2_PRIVACY_FAILURE: '+message);process.exitCode=1;}
}
