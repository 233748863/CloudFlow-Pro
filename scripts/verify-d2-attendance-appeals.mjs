import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d2-attendance-appeals'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-attendance-appeals-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const marker = 'D2A-' + randomUUID().replaceAll('-','').slice(0,12);
const fixture = { marker, appeals:[], stages:[], restorations:{} };
const write = (name,value) => fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const save = () => write('fixture.json',fixture);
const id = value => {const result=String(value);assert.match(result,/^[1-9]\d*$/);return result;};
const sql = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const hash = value => createHash('sha256').update(value).digest('hex');
const runtime = await createD1LeaveRuntime(root,output);
const { check,checks,database,databaseDigest,rows,sessions,requests,browserErrors,sensitive } = runtime;
const api = async (actor,url,options={}) => {
  if (!url.startsWith('/hr/ess/attendance')) return runtime.api(actor,url,options);
  assert.match(url,/^\/hr\/ess\/attendance\/(?:records|checkins|appeals)(?:\/[1-9]\d*\/cancel)?(?:\?|$)/);
  const response = await sessions[actor].page.evaluate(async supplied => {
    const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
    const headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
    const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));
    if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
    if(supplied.body!==undefined)headers['Content-Type']='application/json';
    const result=await fetch('/api'+supplied.url,{method:supplied.method||'GET',credentials:'same-origin',headers,
      ...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
    return {status:result.status,traceId:result.headers.get('X-Trace-Id'),
      body:(result.headers.get('Content-Type')||'').includes('json')?await result.json():null};
  },{url,...options});
  requests.push({actor,path:url,method:options.method||'GET',status:response.status,code:response.body?.code,traceId:response.traceId});
  return response;
};
const ok = async (actor,url,method='GET',body) => runtime.success(await api(actor,url,{method,body}),method+'_'+url.split('?')[0]);
const reject = (response,label) => check(label,[400,403,404,409].includes(response.status)&&response.body?.code!==200);
const base='/hr/attendance',ess='/hr/ess/attendance',holiday='/auth/system/holiday';
const tables=[['hr_employee','id'],['hr_shift','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],
  ['hr_attendance_record','id'],['hr_attendance_monthly','id'],['hr_attendance_appeal','id'],['hr_audit_log','id'],
  ['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
const bounds={};
const preserved=()=>Object.fromEntries(tables.map(([table,key])=>[table,databaseDigest('SELECT * FROM '+table+' WHERE '+key+'<='+bounds[table]+' ORDER BY '+key)]));
let original,employeeId,employeeBody,failure;
const evidence={correctness:false,approval:false,appendOnly:false,rollback:false,closedMonth:false,preservation:false,restoration:false,secrets:false};
const date = day => '2026-04-'+String(day).padStart(2,'0');
const stage = label => {fixture.stages.push(label);save();console.log('D2_APPEALS_STAGE: '+label);};
const dayRow = day => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employeeId',CAST(employee_id AS CHAR),'status',status,'minutes',work_minutes,'late',late_minutes,'early',early_exit_minutes,'absent',absent_flag,'half',half_day_flag,'manual',manual_adjusted_flag,'appealId',CAST(appeal_id AS CHAR),'version',version) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id="+employeeId+' AND attendance_date='+sql(date(day))+' AND deleted=0')[0];
const appealRow = appealId => rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'employeeId',CAST(employee_id AS CHAR),'recordId',CAST(attendance_record_id AS CHAR),'date',attendance_date,'status',status,'managerId',CAST(manager_id AS CHAR),'hrId',CAST(hr_reviewer_id AS CHAR),'decision',final_decision,'version',version) FROM hr_attendance_appeal WHERE tenant_id=100000 AND id="+id(appealId))[0];
const rawRows = day => rows("SELECT JSON_OBJECT('id',CAST(checkin_id AS CHAR),'method',check_method,'type',log_type,'time',DATE_FORMAT(check_time,'%Y-%m-%d %H:%i:%s'),'date',attendance_date,'recordId',CAST(attendance_record_id AS CHAR),'remark',remark) FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id="+employeeId+' AND attendance_date='+sql(date(day))+' ORDER BY checkin_id');
const rawFacts = () => hash(database('SELECT checkin_id,tenant_id,employee_id,log_type,check_time,shift_id,attendance_date,device_id,check_method,latitude,longitude,location_name,location_valid_flag,offshift_flag,skip_auto_flag,photo_file_id,remark,create_by,create_time FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id='+employeeId+' AND checkin_id<='+fixture.originalPunchBound+' ORDER BY checkin_id'));
const monthFacts = () => hash(database('SELECT * FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id='+employeeId+' AND year=2026 AND month=4 ORDER BY id'));
const dayFacts = day => hash(database('SELECT * FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id='+employeeId+' AND attendance_date='+sql(date(day))+' ORDER BY id'));
const auditCount = (domain,businessId,operation) => Number(database('SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='+sql(domain)+' AND business_id='+id(businessId)+' AND operation_type='+sql(operation)));
async function recalc(from,to,force=false) {
  const value=await ok('admin',base+'/recalculate','POST',{employeeIds:[employeeId],startDate:date(from),endDate:date(to),confirmed:true,forceOverwrite:force});
  check('synchronous_recalculation_'+from+'_'+to+'_'+force,value.asynchronous===false);
  return value;
}
async function punch(day,time,type) {
  return id(await ok('admin',base+'/checkins','POST',{employeeId,checkTime:date(day)+' '+time,logType:type,checkMethod:'CARD',
    deviceId:marker,latitude:31.2345678,longitude:121.4567891,locationName:marker,remark:marker+'-original'}));
}
async function submit(day,label,expectedCheckIn,expectedCheckOut) {
  const record=dayRow(day);
  const body={employeeId:fixture.otherEmployeeId,tenantId:100001,attendanceDate:date(day),attendanceRecordId:record.id,
    exceptionType:expectedCheckIn||expectedCheckOut?'MISSING_PUNCH':'ABSENT',reason:marker+'-'+label,expectedCheckIn,expectedCheckOut,
    status:'APPROVED',managerId:1,hrReviewerId:1,finalDecision:'REWRITE'};
  const appealId=id(await ok('employee',ess+'/appeals','POST',body));
  fixture.appeals.push({id:appealId,day,label});save();
  const row=appealRow(appealId);
  check(label+'_server_owned_pending_appeal',row.employeeId===employeeId&&row.recordId===record.id&&row.date===date(day)
    &&row.status==='PENDING'&&row.managerId===null&&row.hrId===null&&row.decision===null);
  return appealId;
}
const manager = (appealId,pass=true,label='manager') => ok('admin',base+'/appeals/'+appealId+'/manager-review?'+new URLSearchParams({pass:String(pass),remark:marker+'-'+label}),'POST');
const hr = (appealId,decision='REWRITE',label='hr') => ok('hr',base+'/appeals/'+appealId+'/hr-review?'+new URLSearchParams({finalDecision:decision,remark:marker+'-'+label}),'POST');
function approvedDay(day,appealId,manualCount) {
  const row=dayRow(day),appeal=appealRow(appealId),punches=rawRows(day);
  check('approved_day_'+day,row.status==='NORMAL'&&Number(row.minutes)===480&&Number(row.manual)===1&&row.appealId===appealId
    &&[row.late,row.early,row.absent,row.half].every(value=>Number(value)===0));
  check('approved_state_'+day,appeal.status==='APPROVED'&&appeal.decision==='REWRITE'&&appeal.managerId===sessions.admin.identity.userId&&appeal.hrId===sessions.hr.identity.userId);
  check('manual_append_count_'+day,punches.filter(value=>value.method==='MANUAL').length===manualCount
    &&punches.filter(value=>value.method==='MANUAL').every(value=>value.recordId===row.id&&value.remark.includes(appealId)));
  check('single_appeal_adjust_audit_'+day,auditCount('ATTENDANCE',row.id,'APPEAL_ADJUST')===1&&auditCount('ATTENDANCE_APPEAL',appealId,'HR_REVIEW')===1);
}
try {
  for(const [table,key]of tables)bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  original=preserved();fixture.originalBounds=bounds;fixture.originalDigest=original;save();
  const userId=id(sessions.employee.identity.userId);
  check('employee_account_initially_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+userId+' AND deleted=0')==='0');
  fixture.deptId=id(database('SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id='+id(sessions.admin.identity.userId)));
  await ok('admin',holiday+'/calendar','POST',{calendarCode:marker,calendarName:marker,defaultFlag:0,weeklyRestDays:'6,7',
    workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+sql(marker)));save();
  await ok('admin',holiday+'/date/batch','POST',{calendarId:fixture.calendarId,yearNo:2026,dates:Array.from({length:30},(_,i)=>({holidayDate:date(i+1),dateType:'WORKDAY',triplePayFlag:0}))});
  employeeBody={employeeNo:marker,name:marker,gender:'MALE',userId,deptId:fixture.deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'};
  employeeId=id(await ok('admin','/hr/employees','POST',employeeBody));fixture.employeeId=employeeId;fixture.employeeBody=employeeBody;save();
  fixture.otherEmployeeId=id(await ok('admin','/hr/employees','POST',{...employeeBody,employeeNo:marker+'-O',name:marker+'-O',userId:null}));save();
  const shift={startTime:'09:00:00',endTime:'18:00:00',breakMinutes:60,workMinutes:480,checkinWindowBeforeMinutes:30,checkoutWindowAfterMinutes:30,
    lateGraceMinutes:10,earlyExitGraceMinutes:10,halfDayHoursThreshold:4,absentHoursThreshold:2,workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',
    holidayCalendarId:fixture.calendarId,autoAttendanceFlag:1,processAttendanceAfter:'2025-01-01',markOnHolidayFlag:0,overtimeThresholdMinutes:0,status:1};
  fixture.shiftId=id(await ok('admin',base+'/shifts','POST',{...shift,shiftCode:marker,shiftName:marker}));save();
  fixture.nightShiftId=id(await ok('admin',base+'/shifts','POST',{...shift,shiftCode:marker+'-N',shiftName:marker+'-N',startTime:'22:00:00',endTime:'06:00:00',breakMinutes:0}));save();
  for(const targetId of [employeeId,fixture.otherEmployeeId])await ok('admin',base+'/schedules','POST',{targetType:'EMPLOYEE',targetId,shiftId:fixture.shiftId,effectiveStart:date(1),effectiveEnd:date(30),status:'ACTIVE'});
  await ok('admin',base+'/schedules','POST',{targetType:'EMPLOYEE',targetId:employeeId,shiftId:fixture.nightShiftId,scheduleDate:date(15),status:'ACTIVE'});
  await punch(1,'11:00:00','IN');await punch(1,'18:00:00','OUT');await punch(4,'11:00:00','IN');await punch(4,'18:00:00','OUT');await punch(15,'22:00:00','IN');
  await recalc(1,30);
  check('owned_initial_day_count',database('SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id='+employeeId+' AND deleted=0')==='30');
  fixture.originalPunchBound=database('SELECT COALESCE(MAX(checkin_id),0) FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id='+employeeId);
  fixture.originalPunchDigest=rawFacts();save();
  stage('fixture-created');
  const firstBefore=dayFacts(1),firstRaw=rawRows(1),firstId=dayRow(1).id;
  const first=await submit(1,'one-missing-in',date(1)+' 09:00:00',null);
  const duplicate=await api('employee',ess+'/appeals',{method:'POST',body:{attendanceDate:date(1),attendanceRecordId:firstId,exceptionType:'MISSING_PUNCH',reason:marker+'-duplicate'}});
  reject(duplicate,'duplicate_pending_appeal_rejected');
  check('only_one_pending_first_appeal',database('SELECT COUNT(*) FROM hr_attendance_appeal WHERE tenant_id=100000 AND employee_id='+employeeId+' AND attendance_record_id='+firstId+' AND deleted=0')==='1');
  reject(await api('hr',base+'/appeals/'+first+'/hr-review?finalDecision=REWRITE&remark=before-manager',{method:'POST'}),'hr_cannot_skip_manager');
  for(const action of ['manager-review?pass=true','hr-review?finalDecision=REWRITE'])reject(await api('employee',base+'/appeals/'+first+'/'+action,{method:'POST'}),'employee_cannot_'+action);
  check('pending_appeal_does_not_change_daily_result',dayFacts(1)===firstBefore&&JSON.stringify(rawRows(1))===JSON.stringify(firstRaw));
  await manager(first);
  check('manager_approval_does_not_apply_correction',appealRow(first).status==='PENDING'&&appealRow(first).managerId===sessions.admin.identity.userId&&dayFacts(1)===firstBefore);
  await hr(first);
  approvedDay(1,first,1);check('first_daily_identity_retained',dayRow(1).id===firstId);
  const acceptedBefore=dayFacts(1),acceptedRaw=JSON.stringify(rawRows(1));
  await hr(first,'REWRITE','repeat');
  check('repeat_final_review_is_idempotent',dayFacts(1)===acceptedBefore&&JSON.stringify(rawRows(1))===acceptedRaw&&auditCount('ATTENDANCE_APPEAL',first,'HR_REVIEW')===1);
  await recalc(1,1);
  check('recalculation_preserves_full_manual_result',dayFacts(1)===acceptedBefore);
  const own=await ok('employee',ess+'/checkins?from='+date(1)+'&to='+date(1)+'&employeeId='+fixture.otherEmployeeId);
  check('self_read_returns_own_original_and_manual_punches',own.length===3&&own.every(row=>String(row.employeeId)===employeeId)&&own.some(row=>row.checkMethod==='MANUAL'));
  evidence.approval=true;evidence.appendOnly=true;stage('single-punch-and-protection');
  const both=await submit(2,'two-missing-punches',date(2)+' 09:00:00',date(2)+' 18:00:00');await manager(both);
  const finalUrl=base+'/appeals/'+both+'/hr-review?finalDecision=REWRITE&remark=';
  const simultaneous=await Promise.all(['concurrent-a','concurrent-b'].map(label=>api('hr',finalUrl+marker+'-'+label,{method:'POST'})));
  simultaneous.forEach((response,index)=>runtime.success(response,'concurrent_hr_review_'+index));
  approvedDay(2,both,2);check('both_manual_times_exact',rawRows(2).map(value=>value.time).join('|')===date(2)+' 09:00:00|'+date(2)+' 18:00:00');
  const noPunch=await submit(3,'manual-conclusion-only');await manager(noPunch);await hr(noPunch);approvedDay(3,noPunch,0);
  stage('two-punch-concurrent-and-no-punch-correction');
  for(const [day,label,managerPass,decision]of [[4,'manager-reject',false,null],[5,'hr-reject',true,'REJECT'],[6,'ignore',true,'IGNORE'],[7,'withdraw',null,null]]) {
    const before=dayFacts(day),punches=JSON.stringify(rawRows(day));
    const appeal=await submit(day,label,date(day)+' 09:00:00',date(day)+' 18:00:00');
    if(managerPass===null)await ok('employee',ess+'/appeals/'+appeal+'/cancel','POST');
    else{await manager(appeal,managerPass,label);if(decision)await hr(appeal,decision,label);}
    const expected=label==='withdraw'?'CANCELLED':label==='ignore'?'APPROVED':'REJECTED';
    check(label+'_terminal_without_correction',appealRow(appeal).status===expected&&dayFacts(day)===before&&JSON.stringify(rawRows(day))===punches
      &&auditCount('ATTENDANCE',dayRow(day).id,'APPEAL_ADJUST')===0);
  }
  const invalid=await submit(8,'cross-day-failure',date(8)+' 09:00:00',date(9)+' 18:00:00');await manager(invalid);
  const failedDay=dayFacts(8),failedNextDay=dayFacts(9),failedMonth=monthFacts(),failedAppeal=JSON.stringify(appealRow(invalid));
  const failedRaw=database('SELECT COUNT(*) FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id='+employeeId);
  reject(await api('hr',base+'/appeals/'+invalid+'/hr-review?finalDecision=REWRITE&remark=cross-day',{method:'POST'}),'invalid_second_punch_fails');
  check('partial_punches_daily_month_and_approval_rollback',failedDay===dayFacts(8)&&failedNextDay===dayFacts(9)&&failedMonth===monthFacts()
    &&failedAppeal===JSON.stringify(appealRow(invalid))&&failedRaw===database('SELECT COUNT(*) FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id='+employeeId)
    &&auditCount('ATTENDANCE',dayRow(8).id,'APPEAL_ADJUST')===0&&auditCount('ATTENDANCE_APPEAL',invalid,'HR_REVIEW')===0);
  await ok('employee',ess+'/appeals/'+invalid+'/cancel','POST');evidence.rollback=true;
  const night=await submit(15,'night-missing-out',null,date(16)+' 06:00:00');await manager(night);await hr(night);approvedDay(15,night,1);
  check('night_manual_punch_belongs_to_previous_date',rawRows(15).some(value=>value.method==='MANUAL'&&value.time===date(16)+' 06:00:00'&&value.date===date(15))
    &&rawRows(16).length===0&&dayRow(16).status==='ABSENT');
  stage('negative-and-night-cases');
  const allDaily=rows("SELECT JSON_OBJECT('status',status,'days',COUNT(*)) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id="+employeeId+" AND deleted=0 GROUP BY status");
  const monthly=rows("SELECT JSON_OBJECT('work',work_days,'actual',actual_days,'absent',absent_days,'leave',leave_days,'late',late_times,'early',early_times) FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id="+employeeId+' AND year=2026 AND month=4')[0];
  check('summary_reflects_four_approved_corrections',Number(monthly.work)===30&&Number(monthly.actual)===5&&Number(monthly.absent)===25&&Number(monthly.leave)===0
    &&Number(monthly.late)===1&&Number(monthly.early)===0&&allDaily.some(value=>value.status==='NORMAL'&&Number(value.days)===4));
  const closed=await submit(9,'closed-month',date(9)+' 09:00:00',date(9)+' 18:00:00');await manager(closed);
  const confirmed=await ok('admin',base+'/monthly/confirm?employeeId='+employeeId+'&month=2026-04','POST');
  check('owned_month_confirmed',confirmed.status==='CONFIRMED');
  const closedDay=dayFacts(9),closedMonth=monthFacts(),closedRaw=JSON.stringify(rawRows(9)),closedAppeal=JSON.stringify(appealRow(closed));
  reject(await api('hr',base+'/appeals/'+closed+'/hr-review?finalDecision=REWRITE&remark=closed',{method:'POST'}),'closed_month_rejects_appeal_rewrite');
  reject(await api('admin',base+'/checkins',{method:'POST',body:{employeeId,checkTime:date(9)+' 09:00:00',logType:'IN',checkMethod:'MANUAL',remark:marker}}),'closed_month_rejects_manual_punch');
  reject(await api('admin',base+'/records/'+dayRow(9).id+'/adjust',{method:'PUT',body:{status:'NORMAL',workMinutes:480,expectedMinutes:480,remark:marker}}),'closed_month_rejects_manual_adjustment');
  const skipped=await recalc(9,9,true);
  check('closed_month_force_recalculation_skips',skipped.affected===0);
  check('closed_month_rejected_writes_preserve_everything',closedDay===dayFacts(9)&&closedMonth===monthFacts()&&closedRaw===JSON.stringify(rawRows(9))&&closedAppeal===JSON.stringify(appealRow(closed)));
  await ok('employee',ess+'/appeals/'+closed+'/cancel','POST');
  evidence.closedMonth=true;
  check('all_original_punch_facts_unchanged',rawFacts()===fixture.originalPunchDigest);
  check('day_uniqueness_preserved',database('SELECT CONCAT(COUNT(*),\':\',COUNT(DISTINCT attendance_date)) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id='+employeeId+' AND deleted=0')==='30:30');
  evidence.correctness=true;stage('closed-month-and-audit-complete');
}catch(error){failure=error;}
finally{
  if(employeeId) {
    try{
      for(const item of fixture.appeals){if(['DRAFT','PENDING'].includes(appealRow(item.id).status))await ok('employee',ess+'/appeals/'+item.id+'/cancel','POST');}
      fixture.restorations.pendingAppeals=true;
    }catch(error){fixture.restorations.pendingAppeals=false;failure ||=error;}
    try{
      const binding=database('SELECT COALESCE(CAST(user_id AS CHAR),\'NULL\') FROM hr_employee WHERE tenant_id=100000 AND id='+employeeId);
      check('restore_only_owned_employee_binding',binding===sessions.employee.identity.userId);
      await ok('admin','/hr/employees/'+employeeId,'PUT',{...employeeBody,userId:null});
      check('employee_account_unbound_after_test',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+id(sessions.employee.identity.userId)+' AND deleted=0')==='0');
      fixture.restorations.employeeBinding=true;
    }catch(error){fixture.restorations.employeeBinding=false;failure ||=error;}
  }
  evidence.restoration=Object.keys(fixture.restorations).length===2&&Object.values(fixture.restorations).every(Boolean);
  try{check('preexisting_business_rows_unchanged',!!original&&JSON.stringify(original)===JSON.stringify(preserved()));check('browser_no_errors',browserErrors.length===0);evidence.preservation=true;}catch(error){failure ||=error;}
  try{const scan=await runtime.scan();evidence.secrets=true;console.log('D2_APPEALS_LOG_SCAN: '+JSON.stringify(scan));}catch(error){failure ||=error;}
  await runtime.close();save();write('requests.json',requests);
  let message=failure?String(failure.message).split('\n')[0].slice(0,240):undefined;
  if(message)for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('result.json',{passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,appealCount:fixture.appeals.length,
    all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_APPEALS_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; appeals='+fixture.appeals.length+'; correctness='+evidence.correctness+'; preservation='+evidence.preservation+'; restoration='+evidence.restoration);
  if(failure){console.log('D2_APPEALS_FAILURE: '+message);process.exitCode=1;}
}
