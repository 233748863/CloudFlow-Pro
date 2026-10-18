import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d2-month-appeal-page'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d2-month-appeal-page-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const marker='D2MAP'+Date.now().toString(36),fixture={marker,appeals:[],screenshots:[],restorations:{}};
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const save=()=>write('fixture.json',fixture);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const id=value=>{const result=String(value);assert.match(result,/^[1-9]\d*$/);return result;};
const runtime=await createD1LeaveRuntime(root,output);
const {check,checks,database,databaseDigest,rows,sessions,requests,browserErrors,sensitive,ok}=runtime;
const base='/hr/attendance',ess='/hr/ess/attendance',month='2026-06';
const date=day=>month+'-'+String(day).padStart(2,'0');
const pages={};
const observedReads=[];
for(const actor of ['admin','employee','hr']){
  pages[actor]=await sessions[actor].context.newPage();pages[actor].setDefaultTimeout(30000);
  pages[actor].on('pageerror',()=>browserErrors.push(actor+'-ui'));
  pages[actor].on('response',response=>{
    const url=new URL(response.url());
    if(response.request().method()!=='GET'||!['/api/hr/ess/attendance/records','/api/hr/ess/attendance/appeals'].includes(url.pathname))return;
    observedReads.push((async()=>{
      const body=await response.json();requests.push({actor,path:url.pathname,method:'GET',status:response.status(),code:body.code,count:Array.isArray(body.data)?body.data.length:null});
      if(response.status()===200&&body.code===200&&Array.isArray(body.data))check('ui_own_rows_'+url.pathname,body.data.every(row=>String(row.employeeId)===employeeId));
    })().then(()=>null,error=>error));
  });
}
const stage=label=>{fixture.phase=label;save();console.log('D2_MONTH_APPEAL_STAGE: '+label);};
const bounds={},tables=[['hr_employee','id'],['hr_shift','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],
 ['hr_attendance_record','id'],['hr_attendance_monthly','id'],['hr_attendance_appeal','id'],['hr_audit_log','id'],
 ['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
const preserved=()=>Object.fromEntries(tables.map(([table,key])=>[table,databaseDigest('SELECT * FROM '+table+' WHERE '+key+'<='+bounds[table]+' ORDER BY '+key)]));
let employeeId,employeeBody,original,failure;
const dayRow=day=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'minutes',work_minutes,'manual',manual_adjusted_flag,'appealId',CAST(appeal_id AS CHAR),'late',late_minutes) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id="+employeeId+' AND attendance_date='+sql(date(day))+' AND deleted=0')[0];
const appealRow=appealId=>rows("SELECT JSON_OBJECT('status',status,'managerId',CAST(manager_id AS CHAR),'hrId',CAST(hr_reviewer_id AS CHAR),'decision',final_decision,'reason',reason,'in',DATE_FORMAT(expected_check_in,'%Y-%m-%d %H:%i:%s'),'out',DATE_FORMAT(expected_check_out,'%Y-%m-%d %H:%i:%s')) FROM hr_attendance_appeal WHERE tenant_id=100000 AND id="+id(appealId))[0];
const ownedFacts=()=>Object.fromEntries(['hr_attendance_record','hr_attendance_monthly','hr_attendance_checkin'].map(table=>[table,hash(database('SELECT * FROM '+table+' WHERE tenant_id=100000 AND employee_id='+employeeId+' ORDER BY '+(table==='hr_attendance_checkin'?'checkin_id':'id')))]));
const monthRow=()=>rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR),'work',work_days,'actual',actual_days,'absent',absent_days,'leave',leave_days,'late',late_times,'status',status) FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id="+employeeId+' AND year=2026 AND month=6')[0];
const dialogFor=(actor,title)=>pages[actor].getByRole('dialog',{name:title,exact:true});
const field=(dialog,label,tag='input')=>dialog.getByLabel(label,{exact:false}).and(dialog.locator(tag));
const goto=async(actor,url,title)=>{
  await pages[actor].goto(new URL(url,sessions[actor].page.url()).href,{waitUntil:'domcontentloaded'});
  await pages[actor].getByRole('heading',{name:title,exact:true,level:2}).waitFor();
  const token=await pages[actor].evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
  if(token){sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));}
};
async function ownGet(resource,query=''){
  const result=await sessions.employee.page.evaluate(async supplied=>{
    const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
    const response=await fetch('/api/hr/ess/attendance/'+supplied.resource+supplied.query,{headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token},credentials:'same-origin'});
    return {status:response.status,body:await response.json()};
  },{resource,query});
  requests.push({actor:'employee',path:ess+'/'+resource+query,method:'GET',status:result.status,code:result.body.code});return result;
}
async function screenshot(actor,name){await pages[actor].screenshot({path:path.join(output,name),fullPage:false});fixture.screenshots.push(name);save();}
async function submit(actor,dialog,url,{method='POST',button='保存',reject=false}={}){
  const page=pages[actor],pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api'+url&&response.request().method()===method,{timeout:90000});
  await dialog.getByRole('button',{name:button,exact:true}).click();
  const response=await pending,body=await response.json();await response.finished();
  requests.push({actor,path:url,method,status:response.status(),code:body.code,traceId:response.headers()['x-trace-id']});
  if(reject){check('ui_rejection_'+url,[400,403,409].includes(response.status())&&body.code!==200);check('rejected_form_stays_open',await dialog.isVisible());}
  else{check('ui_success_'+url,response.status()===200&&body.code===200);await dialog.waitFor({state:'hidden'});}
  return body.data;
}
async function chooseEmployee(actor,dialog){
  const page=pages[actor];await dialog.getByRole('combobox',{name:'选择员工',exact:true}).click();
  const selector=dialogFor(actor,'选择员工');await selector.getByRole('option').first().waitFor();
  await selector.getByRole('searchbox').fill(marker);await selector.getByRole('option').filter({hasText:marker}).click();
  if(await selector.isVisible()){await selector.getByRole('searchbox').press('Escape');await selector.waitFor({state:'hidden'});}
}
async function myAppeal(day,label,times=true){
  await goto('employee','/hr/ess/attendance','我的考勤');
  const row=pages.employee.getByRole('row').filter({hasText:date(day)});await row.getByRole('button',{name:'考勤申诉',exact:true}).click();
  const dialog=dialogFor('employee','提交考勤申诉');await field(dialog,'申诉原因','textarea').fill(marker+'-'+label);
  if(times){await field(dialog,'申请补录上班时刻').fill(date(day)+'T09:00');await field(dialog,'申请补录下班时刻').fill(date(day)+'T18:00');}
  const appealId=id(await submit('employee',dialog,ess+'/appeals'));fixture.appeals.push({id:appealId,day,label});save();
  const value=appealRow(appealId);check('submitted_pending_'+label,value.status==='PENDING'&&value.managerId===null);
  if(times)check('full_local_datetime_'+label,value.in===date(day)+' 09:00:00'&&value.out===date(day)+' 18:00:00');
  return appealId;
}
async function review(actor,day,appealId,decision){
  await goto(actor,'/hr/attendance-appeals','考勤申诉');
  const filtered=pages[actor].waitForResponse(response=>new URL(response.url()).pathname==='/api'+base+'/appeals'&&new URL(response.url()).searchParams.get('keyword')===marker);
  await pages[actor].getByPlaceholder('搜索员工姓名').fill(marker);
  const filteredResponse=await filtered,filteredBody=await filteredResponse.json();
  check('management_keyword_filter_'+actor+'_'+day,filteredResponse.status()===200&&filteredBody.code===200&&filteredBody.data.rows.length>0&&filteredBody.data.rows.every(row=>String(row.employeeId)===employeeId));
  requests.push({actor,path:base+'/appeals?keyword='+marker,method:'GET',status:filteredResponse.status(),code:filteredBody.code});
  const row=pages[actor].getByRole('row').filter({hasText:marker}).filter({hasText:date(day)});
  await row.waitFor();const button=actor==='admin'?'主管审核':'HR 复核';
  await row.getByRole('button',{name:button,exact:true}).click();
  const dialog=dialogFor(actor,button);await dialog.locator('textarea').fill(marker+'-'+actor+'-'+day);
  if(actor==='hr'&&decision!=='REWRITE'||decision==='REJECT_MANAGER'){
    await dialog.locator('button[aria-haspopup="listbox"]').click();
    await pages[actor].getByRole('option',{name:decision==='REJECT_MANAGER'?'驳回':decision==='REJECT'?'保留原记录（驳回申诉）':'保留原记录（同意申诉）',exact:true}).click();
  }
  await submit(actor,dialog,base+'/appeals/'+appealId+(actor==='admin'?'/manager-review':'/hr-review'),{button:'确认'});
}
async function cancelMine(day,appealId){
  await goto('employee','/hr/ess/attendance','我的考勤');await pages.employee.getByRole('tab',{name:'我的考勤申诉',exact:true}).click();
  const row=pages.employee.getByRole('row').filter({hasText:date(day)});await row.getByRole('button',{name:'撤回',exact:true}).click();
  const dialog=dialogFor('employee','撤回考勤申诉');await dialog.getByRole('checkbox',{name:'确认撤回本次考勤申诉',exact:false}).check();
  await submit('employee',dialog,ess+'/appeals/'+appealId+'/cancel');
  check('ui_withdrawn_'+day,appealRow(appealId).status==='CANCELLED');
}
async function monthlyPage(){
  await goto('admin','/hr/attendance','考勤规则与月封账');await pages.admin.getByRole('tab',{name:'月汇总与封账',exact:true}).click();
  return pages.admin.getByRole('row').filter({has:pages.admin.getByRole('cell',{name:employeeId,exact:true})});
}
async function pickManagementDate(dialog,label,day,hour){
  await dialog.getByRole('button',{name:label,exact:true}).click();
  const dropdown=pages.admin.locator('.cf-date-dropdown');await dropdown.waitFor();
  let reached=false;
  for(let attempt=0;attempt<24;attempt++){
    const title=await dropdown.locator('.cf-date-title').innerText(),parts=title.match(/(\d+)年\s+(\d+)月/);assert.ok(parts,'Calendar month title');
    const difference=Number(parts[1])*12+Number(parts[2])-(2026*12+6);
    if(difference===0){reached=true;break;}
    await dropdown.locator('.cf-date-nav-button').nth(difference>0?0:1).click();
  }
  check('calendar_reached_owned_month_'+label,reached);
  await dropdown.locator('.cf-date-cell:not(.cf-date-cell-outside)').filter({hasText:new RegExp('^'+day+'$')}).click();
  if(hour!==undefined){
    await dropdown.locator('.cf-time-section').nth(0).getByRole('button',{name:String(hour).padStart(2,'0'),exact:true}).click();
    await dropdown.locator('.cf-time-section').nth(1).getByRole('button',{name:'00',exact:true}).click();
    await dropdown.getByRole('button',{name:'确定',exact:true}).click();
  }
  await dropdown.waitFor({state:'hidden'});
}
const evidence={monthly:false,employeeSubmit:false,reviews:false,cancel:false,closedMonth:false,preservation:false,restoration:false,secrets:false};
try{
  for(const [table,key]of tables)bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  original=preserved();fixture.originalBounds=bounds;fixture.originalDigest=original;save();
  const userId=id(sessions.employee.identity.userId);
  check('account_initially_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+userId+' AND deleted=0')==='0');
  employeeBody={employeeNo:marker,name:marker,gender:'MALE',userId,deptId:'100',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'};
  employeeId=id(await ok('admin','/hr/employees','POST',employeeBody));fixture.employeeId=employeeId;fixture.employeeBody=employeeBody;save();
  await ok('admin','/auth/system/holiday/calendar','POST',{calendarCode:marker,calendarName:marker,defaultFlag:0,weeklyRestDays:'6,7',workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+sql(marker)));
  await ok('admin','/auth/system/holiday/date/batch','POST',{calendarId:fixture.calendarId,yearNo:2026,dates:Array.from({length:30},(_,i)=>({holidayDate:date(i+1),dateType:'WORKDAY',triplePayFlag:0}))});
  fixture.shiftId=id(await ok('admin',base+'/shifts','POST',{shiftCode:marker,shiftName:marker,startTime:'09:00:00',endTime:'18:00:00',breakMinutes:60,workMinutes:480,
    checkinWindowBeforeMinutes:30,checkoutWindowAfterMinutes:30,lateGraceMinutes:10,earlyExitGraceMinutes:10,halfDayHoursThreshold:4,absentHoursThreshold:2,
    workingHoursCalcMode:'FIRST_LAST',checkinDetermineMode:'EARLIEST_LATEST',holidayCalendarId:fixture.calendarId,autoAttendanceFlag:1,processAttendanceAfter:'2025-01-01',markOnHolidayFlag:0,overtimeThresholdMinutes:0,status:1}));
  await ok('admin',base+'/schedules','POST',{targetType:'EMPLOYEE',targetId:employeeId,shiftId:fixture.shiftId,effectiveStart:date(1),effectiveEnd:date(30),status:'ACTIVE'});
  for(const [time,logType]of [['11:00:00','IN'],['18:00:00','OUT']])await ok('admin',base+'/checkins','POST',{employeeId,checkTime:date(29)+' '+time,logType,checkMethod:'CARD',remark:marker});
  await ok('admin',base+'/recalculate','POST',{employeeIds:[employeeId],startDate:date(1),endDate:date(30),confirmed:true});
  fixture.originalPunchDigest=hash(database("SELECT checkin_id,check_time,log_type,check_method,remark FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id="+employeeId+" AND check_method='CARD' ORDER BY checkin_id"));save();
  stage('month-summary-page');
  await monthlyPage();await pages.admin.getByRole('button',{name:'生成月汇总',exact:true}).click();
  let dialog=dialogFor('admin','生成月汇总');await chooseEmployee('admin',dialog);await field(dialog,'月份').fill(month);
  await submit('admin',dialog,base+'/monthly/summarize');
  const initialMonth=monthRow();check('initial_month_exact_totals',Number(initialMonth.work)===30&&Number(initialMonth.actual)===1&&Number(initialMonth.absent)===29&&Number(initialMonth.late)===1);
  const monthly=await monthlyPage();await monthly.getByRole('cell',{name:'待确认',exact:true}).waitFor();
  await screenshot('admin','month-before.png');evidence.monthly=true;
  stage('employee-appeal-page');
  const forgedEmployee=id(database('SELECT MAX(employee_id) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id<>'+employeeId));
  for(const query of ['', '?employeeId='+forgedEmployee+'&tenantId=100001']){
    const own=await ownGet('records',query);check('employee_reads_all_30_owned_records'+query,own.status===200&&own.body.code===200&&own.body.data.length===30&&own.body.data.every(row=>String(row.employeeId)===employeeId));
  }
  const firstId=dayRow(29).id,first=await myAppeal(29,'rewrite');evidence.employeeSubmit=true;
  await screenshot('employee','employee-submitted.png');
  stage('manager-and-hr-pages');
  const before=ownedFacts();await review('admin',29,first);
  check('manager_only_advances_review',appealRow(first).managerId===sessions.admin.identity.userId&&JSON.stringify(before)===JSON.stringify(ownedFacts()));
  await review('hr',29,first,'REWRITE');
  check('hr_rewrites_original_day',dayRow(29).id===firstId&&dayRow(29).status==='NORMAL'&&Number(dayRow(29).minutes)===480&&Number(dayRow(29).manual)===1&&dayRow(29).appealId===first&&Number(dayRow(29).late)===0);
  check('hr_actual_decision',appealRow(first).status==='APPROVED'&&appealRow(first).decision==='REWRITE'&&appealRow(first).hrId===sessions.hr.identity.userId);
  await pages.hr.getByRole('row').filter({hasText:date(29)}).getByRole('button',{name:'查看',exact:true}).click();
  dialog=dialogFor('hr','申诉详情');await dialog.getByText(marker+'-rewrite',{exact:true}).waitFor();
  check('detail_actual_requested_times',(await dialog.innerText()).includes(date(29)+' 09:00:00')&&(await dialog.innerText()).includes(date(29)+' 18:00:00'));
  await screenshot('hr','appeal-approved-detail.png');await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  for(const [day,decision]of [[28,'IGNORE'],[27,'REJECT']]){
    const appeal=await myAppeal(day,decision,false),facts=ownedFacts();
    await review('admin',day,appeal);await review('hr',day,appeal,decision);
    check('hr_terminal_'+decision,appealRow(appeal).status===(decision==='REJECT'?'REJECTED':'APPROVED')&&appealRow(appeal).decision===decision&&JSON.stringify(facts)===JSON.stringify(ownedFacts()));
  }
  const managerRejected=await myAppeal(24,'manager-reject',false),beforeManagerReject=ownedFacts();
  await review('admin',24,managerRejected,'REJECT_MANAGER');
  check('manager_rejection_preserves_attendance',appealRow(managerRejected).status==='REJECTED'&&JSON.stringify(beforeManagerReject)===JSON.stringify(ownedFacts()));
  evidence.reviews=true;stage('management-submit-and-owner-visibility');
  await goto('admin','/hr/attendance-appeals','考勤申诉');await pages.admin.getByRole('button',{name:'提交申诉',exact:true}).click();
  dialog=dialogFor('admin','提交考勤异常申诉');await chooseEmployee('admin',dialog);
  await pickManagementDate(dialog,'考勤日期',25);await pickManagementDate(dialog,'期望上班时间',25,9);await pickManagementDate(dialog,'期望下班时间',25,18);
  await dialog.getByRole('textbox',{name:'申诉详情',exact:true}).fill(marker+'-admin-created');
  const delegated=id(await submit('admin',dialog,base+'/appeals',{button:'提交'}));fixture.appeals.push({id:delegated,day:25,label:'admin-created'});save();
  check('management_dates_stored',appealRow(delegated).in===date(25)+' 09:00:00'&&appealRow(delegated).out===date(25)+' 18:00:00');
  const mine=await ownGet('appeals','?employeeId='+forgedEmployee+'&tenantId=100001');
  check('owner_sees_management_created_appeal',mine.status===200&&mine.body.code===200&&mine.body.data.some(row=>String(row.id)===delegated)&&mine.body.data.every(row=>String(row.employeeId)===employeeId));
  const delegatedFacts=ownedFacts();await cancelMine(25,delegated);check('owner_can_withdraw_management_created_appeal',JSON.stringify(delegatedFacts)===JSON.stringify(ownedFacts()));
  stage('withdrawal-page');
  const withdrawn=await myAppeal(26,'cancel',false),factsBeforeCancel=ownedFacts();await cancelMine(26,withdrawn);
  check('withdraw_preserves_attendance',JSON.stringify(factsBeforeCancel)===JSON.stringify(ownedFacts()));evidence.cancel=true;
  stage('month-confirmation-page');
  let row=await monthlyPage();await row.getByRole('button',{name:'确认封账',exact:true}).click();dialog=dialogFor('admin','确认月封账');
  const confirm=dialog.getByRole('checkbox',{name:'确认封账；封账后本月打卡、调整和重算被锁定',exact:false});
  check('close_confirmation_initially_unchecked',!await confirm.isChecked());
  let posted=0;const count=request=>{if(new URL(request.url()).pathname==='/api'+base+'/monthly/confirm'&&request.method()==='POST')posted++;};
  pages.admin.on('request',count);await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await pages.admin.getByText('请填写确认封账；封账后本月打卡、调整和重算被锁定',{exact:true}).waitFor();
  check('unconfirmed_close_sends_no_request',posted===0&&monthRow().status!=='CONFIRMED');await confirm.check();
  await submit('admin',dialog,base+'/monthly/confirm');pages.admin.off('request',count);
  check('single_confirm_and_same_month',posted===1&&monthRow().id===initialMonth.id&&monthRow().status==='CONFIRMED'&&Number(monthRow().late)===0);
  row=await monthlyPage();await row.getByRole('cell',{name:'已封账',exact:true}).waitFor();check('closed_row_has_no_confirm_action',await row.getByRole('button',{name:'确认封账',exact:true}).count()===0);
  await screenshot('admin','month-closed.png');
  const closedFacts=ownedFacts();
  await pages.admin.getByRole('tab',{name:'原始打卡',exact:true}).click();await pages.admin.getByRole('button',{name:'补录原始打卡',exact:true}).click();
  dialog=dialogFor('admin','补录原始打卡');await chooseEmployee('admin',dialog);await field(dialog,'打卡时间').fill(date(30)+'T09:00');await field(dialog,'说明','textarea').fill(marker+'-closed');
  await submit('admin',dialog,base+'/checkins',{reject:true});await screenshot('admin','closed-punch-rejected.png');await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await pages.admin.getByRole('tab',{name:'每日结论',exact:true}).click();
  const closedDayRow=pages.admin.getByRole('row').filter({has:pages.admin.getByRole('cell',{name:employeeId,exact:true})}).filter({hasText:date(29)});
  await closedDayRow.getByRole('button',{name:'人工调整',exact:true}).click();dialog=dialogFor('admin','人工调整日考勤');
  await dialog.getByLabel('工作分钟',{exact:true}).and(dialog.locator('input')).fill('300');await field(dialog,'调整原因','textarea').fill(marker+'-closed-adjust');
  await submit('admin',dialog,base+'/records/'+firstId+'/adjust',{method:'PUT',reject:true});await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await pages.admin.getByRole('button',{name:'范围重算',exact:true}).click();dialog=dialogFor('admin','确认范围重算');
  await chooseEmployee('admin',dialog);await field(dialog,'开始日期').fill(date(1));await field(dialog,'结束日期').fill(date(30));
  await dialog.getByRole('checkbox',{name:'覆盖人工调整记录',exact:false}).check();await dialog.getByRole('checkbox',{name:'确认重算范围',exact:false}).check();
  const skipped=await submit('admin',dialog,base+'/recalculate');check('closed_month_force_recalculation_skips',skipped.asynchronous===false&&skipped.affected===0);
  check('closed_page_attempt_preserves_rows',JSON.stringify(closedFacts)===JSON.stringify(ownedFacts()));
  check('original_card_facts_preserved',fixture.originalPunchDigest===hash(database("SELECT checkin_id,check_time,log_type,check_method,remark FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id="+employeeId+" AND check_method='CARD' ORDER BY checkin_id")));
  evidence.closedMonth=true;stage('all-page-flows-completed');
}catch(error){
  failure=error;let message=String(error.message).slice(0,4000);for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('failure-detail.json',{phase:fixture.phase,message});
  for(const actor of ['admin','employee','hr'])try{await screenshot(actor,'failure-'+actor+'.png');}catch{/* Preserve original failure. */}
}finally{
  if(employeeId){
    try{
      const pending=rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_attendance_appeal WHERE tenant_id=100000 AND employee_id="+employeeId+" AND status IN ('DRAFT','PENDING') AND deleted=0");
      for(const appeal of pending){
        // The management cancellation endpoint verifies the current employee owns the appeal.
        const response=await sessions.employee.page.evaluate(async supplied=>{
          const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
          const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice(11));
          const result=await fetch('/api/hr/ess/attendance/appeals/'+supplied+'/cancel',{method:'POST',credentials:'same-origin',headers});return {status:result.status,body:await result.json()};
        },id(appeal.id));check('cleanup_pending_owned_appeal',response.status===200&&response.body.code===200);
      }
      fixture.restorations.pendingAppeals=true;
    }catch(error){fixture.restorations.pendingAppeals=false;failure ||=error;}
    try{
      check('owned_binding_before_restore',database('SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE tenant_id=100000 AND id='+employeeId)===sessions.employee.identity.userId);
      await ok('admin','/hr/employees/'+employeeId,'PUT',{...employeeBody,userId:null});
      check('employee_binding_restored',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+id(sessions.employee.identity.userId)+' AND deleted=0')==='0');
      for(const resource of ['records','appeals']){const unbound=await ownGet(resource);check('unbound_cannot_read_'+resource,[400,403].includes(unbound.status)&&unbound.body.code!==200);}
      fixture.restorations.employeeBinding=true;
    }catch(error){fixture.restorations.employeeBinding=false;failure ||=error;}
  }
  evidence.restoration=Object.keys(fixture.restorations).length===2&&Object.values(fixture.restorations).every(Boolean);
  try{check('all_preexisting_business_rows_preserved',!!original&&JSON.stringify(original)===JSON.stringify(preserved()));check('no_browser_errors',browserErrors.length===0);evidence.preservation=true;}catch(error){failure ||=error;}
  try{const scan=await runtime.scan();evidence.secrets=true;console.log('D2_MONTH_APPEAL_LOG_SCAN: '+JSON.stringify(scan));}catch(error){failure ||=error;}
  for(const error of await Promise.all(observedReads))if(error)failure ||=error;
  await runtime.close();save();write('requests.json',requests);
  let message=failure?String(failure.message).split('\n')[0].slice(0,240):undefined;
  if(message)for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('result.json',{passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_MONTH_APPEAL_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; preservation='+evidence.preservation+'; restoration='+evidence.restoration);
  if(failure){console.log('D2_MONTH_APPEAL_FAILURE: '+message);process.exitCode=1;}
}
