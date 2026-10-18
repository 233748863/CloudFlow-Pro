import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d2-scale-attendance'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-scale-attendance-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const marker = 'D2S-' + randomUUID().replaceAll('-', '').slice(0,12);
const fixture = { marker, employees: [], observations: [] };
const write = (name, value) => fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const save = () => write('fixture.json',fixture);
const id = value => { const text = String(value); assert.match(text,/^[1-9]\d*$/); return text; };
const sql = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const hash = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const runtime = await createD1LeaveRuntime(root,output);
const { check, checks, database, databaseDigest, rows, api, ok, requests, browserErrors, sensitive } = runtime;
const base='/hr/attendance', holiday='/auth/system/holiday';
const tables=[['hr_employee','id'],['hr_shift','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],
  ['hr_attendance_record','id'],['hr_attendance_monthly','id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id'],['sys_dept','dept_id']];
const bounds={};
const preserved=()=>Object.fromEntries(tables.map(([table,key])=>[table,databaseDigest('SELECT * FROM '+table+' WHERE '+key+'<='+bounds[table]+' ORDER BY '+key)]));
const evidence={correctness:false,asynchronous:false,results:false,ownership:false,preservation:false,secrets:false};
let original,failure;
const jobTemplates=()=>database("SELECT job_id,tenant_id,service_name,handler_name,COALESCE(handler_param,''),status,concurrent_flag,retry_count,timeout_seconds,lock_time_seconds,deleted FROM sys_job WHERE tenant_id=100000 AND handler_name='hrAttendanceRecalcAsync' ORDER BY job_id");
function counts() {
  return rows("SELECT JSON_OBJECT('days',COUNT(*),'employees',COUNT(DISTINCT r.employee_id),'absent',SUM(r.status='ABSENT'),'outsideMonth',SUM(r.attendance_date<'2026-06-01' OR r.attendance_date>'2026-06-30'),'wrongTenant',SUM(r.tenant_id<>100000)) FROM hr_attendance_record r JOIN hr_employee e ON e.id=r.employee_id WHERE e.dept_id="+fixture.deptId+" AND e.employee_no LIKE "+sql(marker+'-%')+" AND r.deleted=0")[0];
}
try {
  for(const [table,key] of tables) bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  original=preserved(); fixture.originalBounds=bounds; fixture.originalDigest=original; save();
  const templates=rows("SELECT JSON_OBJECT('id',CAST(job_id AS CHAR),'hasParameter',CASE WHEN handler_param IS NULL OR TRIM(handler_param)='' THEN 0 ELSE 1 END) FROM sys_job WHERE tenant_id=100000 AND service_name IN ('hr','cloudflow-service-hr') AND handler_name='hrAttendanceRecalcAsync' AND deleted=0");
  const defaults=templates.filter(value=>Number(value.hasParameter)===0);
  check('one_generic_template_coexists_with_parameterized_tasks',defaults.length===1 && templates.some(value=>Number(value.hasParameter)===1));
  fixture.defaultJobId=id(defaults[0].id); fixture.jobTemplateDigest=hash(jobTemplates()); save();
  await ok('admin',holiday+'/calendar','POST',{calendarCode:marker,calendarName:marker,defaultFlag:0,weeklyRestDays:'6,7',
    workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+sql(marker))); save();
  await ok('admin',holiday+'/date/batch','POST',{calendarId:fixture.calendarId,yearNo:2026,dates:Array.from({length:30},(_,index)=>({
    holidayDate:'2026-06-'+String(index+1).padStart(2,'0'),dateType:'WORKDAY',triplePayFlag:0}))});
  await ok('admin','/auth/system/dept','POST',{deptName:marker,parentId:0,orderNum:0,status:'0',holidayCalendarId:fixture.calendarId});
  fixture.deptId=id(database('SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name='+sql(marker)+' AND deleted=0')); save();
  fixture.shiftId=id(await ok('admin',base+'/shifts','POST',{shiftCode:marker,shiftName:marker,startTime:'09:00:00',endTime:'18:00:00',
    breakMinutes:60,workMinutes:480,checkinWindowBeforeMinutes:30,checkoutWindowAfterMinutes:30,lateGraceMinutes:10,earlyExitGraceMinutes:10,
    halfDayHoursThreshold:4,absentHoursThreshold:2,workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',
    holidayCalendarId:fixture.calendarId,autoAttendanceFlag:1,processAttendanceAfter:'2025-01-01',markOnHolidayFlag:0,overtimeThresholdMinutes:0,status:1})); save();
  await ok('admin',base+'/schedules','POST',{targetType:'DEPT',targetId:fixture.deptId,shiftId:fixture.shiftId,effectiveStart:'2026-06-01',effectiveEnd:'2026-06-30',status:'ACTIVE'});
  for(let index=1;index<=1000;index++) {
    const employeeId=id(await ok('admin','/hr/employees','POST',{employeeNo:marker+'-'+index,name:marker+'-'+index,gender:'MALE',deptId:fixture.deptId,
      employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'}));
    fixture.employees.push(employeeId); save();
    if(index%100===0) console.log('D2_SCALE_CREATED: employees='+index);
  }
  check('exactly_1000_owned_employees',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND dept_id='+fixture.deptId+' AND deleted=0')==='1000');
  check('owned_employees_have_no_prior_conclusions',Number(counts().days)===0);
  const submittedAt=Date.now(), started=performance.now();
  const response=await api('admin',base+'/recalculate',{method:'POST',body:{employeeIds:fixture.employees,startDate:'2026-06-01',endDate:'2026-06-30',confirmed:true,forceOverwrite:false}});
  fixture.requestMilliseconds=Number((performance.now()-started).toFixed(2));
  const accepted=runtime.success(response,'1000_employee_recalculation');
  check('accepted_asynchronous_task',accepted.asynchronous===true && typeof accepted.executeNo==='string' && accepted.executeNo.length>0);
  fixture.executeNo=accepted.executeNo; fixture.initialCounts=counts(); save();
  const registered=rows("SELECT JSON_OBJECT('jobId',CAST(job_id AS CHAR),'handler',handler_name) FROM sys_job_log WHERE tenant_id=100000 AND execute_no="+sql(fixture.executeNo));
  check('business_request_uses_generic_template_once',registered.length===1 && registered[0].jobId===fixture.defaultJobId && registered[0].handler==='hrAttendanceRecalcAsync');
  evidence.asynchronous=true;
  for(const actor of ['employee','hr']) {
    const forbidden=await api(actor,base+'/tasks/'+fixture.executeNo);
    check(actor+'_cannot_read_admin_task',forbidden.status>=400 && forbidden.body?.code!==200);
  }
  evidence.ownership=true;
  const deadline=Date.now()+600000;
  let terminal;
  while(Date.now()<deadline) {
    const status=await ok('admin',base+'/tasks/'+fixture.executeNo);
    const count=counts();
    const observation={elapsedMilliseconds:Date.now()-submittedAt,status:status.executeStatus,days:Number(count.days),employees:Number(count.employees)};
    fixture.observations.push(observation); save();
    if(fixture.observations.length>1) check('completed_days_do_not_decrease_'+fixture.observations.length,observation.days>=fixture.observations.at(-2).days);
    if(['SUCCESS','FAILED','TIMEOUT'].includes(status.executeStatus)) {terminal=status;break;}
    await delay(2000);
  }
  check('original_async_task_reached_terminal',!!terminal); fixture.terminal=terminal; save();
  check('original_async_task_succeeded',terminal.executeStatus==='SUCCESS' && Number(terminal.affectedRows)===30000);
  check('response_returned_before_full_month_finished',Number(fixture.initialCounts.days)<30000);
  const final=counts(); fixture.finalCounts=final; save();
  check('exact_30000_absent_days_for_1000_employees',Number(final.days)===30000 && Number(final.employees)===1000 && Number(final.absent)===30000 && Number(final.outsideMonth)===0 && Number(final.wrongTenant)===0);
  const grouped=rows("SELECT JSON_OBJECT('employeeId',CAST(r.employee_id AS CHAR),'days',COUNT(*),'dates',COUNT(DISTINCT r.attendance_date),'first',MIN(r.attendance_date),'last',MAX(r.attendance_date)) FROM hr_attendance_record r JOIN hr_employee e ON e.id=r.employee_id WHERE e.tenant_id=100000 AND e.dept_id="+fixture.deptId+" AND r.deleted=0 GROUP BY r.employee_id");
  check('every_employee_has_each_day_once',grouped.length===1000 && grouped.every(value=>Number(value.days)===30 && Number(value.dates)===30 && value.first==='2026-06-01' && value.last==='2026-06-30'));
  const summaries=rows("SELECT JSON_OBJECT('employeeId',CAST(m.employee_id AS CHAR),'work',m.work_days,'absent',m.absent_days,'actual',m.actual_days,'leave',m.leave_days,'status',m.status) FROM hr_attendance_monthly m JOIN hr_employee e ON e.id=m.employee_id WHERE e.tenant_id=100000 AND e.dept_id="+fixture.deptId+" AND m.year=2026 AND m.month=6");
  check('1000_month_summaries_match_daily_results',summaries.length===1000 && summaries.every(value=>Number(value.work)===30 && Number(value.absent)===30 && Number(value.actual)===0 && Number(value.leave)===0 && value.status==='DRAFT'));
  check('no_raw_punches_invented',database('SELECT COUNT(*) FROM hr_attendance_checkin c JOIN hr_employee e ON e.id=c.employee_id WHERE e.tenant_id=100000 AND e.dept_id='+fixture.deptId)==='0');
  const recordsHash=()=>hash(database('SELECT r.* FROM hr_attendance_record r JOIN hr_employee e ON e.id=r.employee_id WHERE e.tenant_id=100000 AND e.dept_id='+fixture.deptId+' ORDER BY r.id'));
  const beforeRepeatedReads=recordsHash();
  for(let index=0;index<3;index++) {
    const status=await ok('admin',base+'/tasks/'+fixture.executeNo);
    check('repeated_terminal_status_'+index,status.executeStatus==='SUCCESS' && Number(status.affectedRows)===30000);
  }
  check('status_reads_do_not_rerun_task',beforeRepeatedReads===recordsHash());
  check('all_generic_and_parameterized_job_configurations_unchanged',fixture.jobTemplateDigest===hash(jobTemplates()));
  evidence.results=true; evidence.correctness=true;
} catch(error) {failure=error;}
finally {
  try {check('preexisting_business_rows_unchanged',original && JSON.stringify(original)===JSON.stringify(preserved())); check('browser_no_errors',browserErrors.length===0); evidence.preservation=true;} catch(error){failure ||= error;}
  try {const scan=await runtime.scan(); evidence.secrets=true; console.log('D2_SCALE_LOG_SCAN: '+JSON.stringify(scan));} catch(error){failure ||= error;}
  await runtime.close(); save(); write('requests.json',requests);
  const raw=failure?String(failure.message).split('\n')[0].slice(0,220):undefined;
  const message=raw && [...sensitive].every(value=>!raw.includes(value))?raw:failure?'D2 scale attendance verification failed':undefined;
  write('result.json',{passed:!failure && Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,employeeCount:fixture.employees.length,
    executeNo:fixture.executeNo,requestMilliseconds:fixture.requestMilliseconds,initialCounts:fixture.initialCounts,finalCounts:fixture.finalCounts,terminal:fixture.terminal,all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_SCALE_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; employees='+fixture.employees.length+'; correctness='+evidence.correctness+'; preservation='+evidence.preservation);
  if(failure){console.log('D2_SCALE_FAILURE: '+message);process.exitCode=1;}
}
