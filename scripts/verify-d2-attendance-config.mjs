import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d2-attendance-config'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d2-attendance-config-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const marker='D2CFG'+Date.now().toString(36);
const fixture={marker,phase:'start',screenshots:[],pages:[],shiftObservations:[]};
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
const save=()=>write('fixture.json',fixture);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
const id=value=>{const result=String(value);assert.match(result,/^[1-9]\d*$/);return result;};
const runtime=await createD1LeaveRuntime(root,output);
const {check,checks,ok,database,databaseDigest,rows,sessions,requests,browserErrors,sensitive}=runtime;
// Keep the authenticated helper page intact while the real UI restores its session after reloads.
const origin=new URL(sessions.admin.page.url()).origin;
const page=await sessions.admin.context.newPage();page.on('pageerror',()=>browserErrors.push('admin-ui'));page.setDefaultTimeout(30000);
const base='/hr/attendance';
const bounds={},tables=[['hr_employee','id'],['hr_shift','id'],['hr_attendance_rule','id'],['hr_schedule_assignment','id'],
  ['hr_attendance_checkin','checkin_id'],['hr_attendance_record','id'],['hr_attendance_monthly','id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
const preserved=()=>Object.fromEntries(tables.map(([table,key])=>[table,databaseDigest('SELECT * FROM '+table+' WHERE '+key+'<='+bounds[table]+' ORDER BY '+key)]));
const stage=label=>{fixture.phase=label;save();console.log('D2_CONFIG_STAGE: '+label);};
const field=(dialog,label,tag='input')=>dialog.getByLabel(label,{exact:false}).and(dialog.locator(tag));
const fill=async(dialog,label,value)=>field(dialog,label).fill(String(value));
const select=async(dialog,label,value)=>field(dialog,label,'select').selectOption(String(value));
const dialogFor=title=>page.getByRole('dialog',{name:title,exact:true});
async function screenshot(name){await page.screenshot({path:path.join(output,name),fullPage:false});fixture.screenshots.push(name);save();}
async function tab(name){
  await page.getByRole('tab',{name,exact:true}).click();
  await page.getByRole('tabpanel').waitFor();
  check('selected_tab_'+name,await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected')==='true');
  fixture.pages.push(name);save();
}
const panel=()=>page.getByRole('tabpanel');
async function saveForm(dialog,url,method='POST'){
  const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api'+url&&response.request().method()===method,{timeout:90000});
  await dialog.getByRole('button',{name:'保存',exact:true}).click();
  const response=await pending,body=await response.json();await response.finished();
  requests.push({actor:'admin',path:url,method,status:response.status(),code:body.code,traceId:response.headers()['x-trace-id']});
  check('page_save_'+url+'_'+method,response.status()===200&&body.code===200);
  await dialog.waitFor({state:'hidden'});
  return body.data;
}
async function chooseEmployee(dialog){
  await dialog.getByRole('combobox',{name:'选择员工',exact:true}).click();
  const selector=dialogFor('选择员工');await selector.getByRole('option').first().waitFor();
  await selector.getByRole('searchbox').fill(marker);
  await selector.getByRole('option').filter({hasText:marker}).click();
  if(await selector.isVisible()){await selector.getByRole('searchbox').press('Escape');await selector.waitFor({state:'hidden'});}
}
async function edit(name,rowText){
  const row=panel(name).getByRole('row').filter({hasText:rowText});
  await row.waitFor();await row.getByRole('button',{name:'修改',exact:true}).click();
  return dialogFor('修改'+name);
}
const shiftFields=[
 ['checkinWindowBeforeMinutes','提前打卡窗口（分钟）',45],['checkoutWindowAfterMinutes','延后打卡窗口（分钟）',75],
 ['lateGraceMinutes','迟到宽限分钟',10],['earlyExitGraceMinutes','早退宽限分钟',12],
 ['halfDayHoursThreshold','半天出勤小时阈值',4],['absentHoursThreshold','缺勤小时阈值',2],
 ['workingHoursCalcMode','工时计算','PAIRED','select'],['checkinDetermineMode','进出判定','ALTERNATING','select'],
 ['holidayCalendarId','绑定日历（留空继承部门 / 租户）',null,'select'],['autoAttendanceFlag','自动计算考勤',1,'select'],
 ['processAttendanceAfter','自动计算起始日','2025-01-01'],['markOnHolidayFlag','节假日也生成打卡结论',0,'select'],
 ['overtimeThresholdMinutes','加班记录阈值（分钟）',30]
];
async function preview(expected,late){
  await tab('每日结论');await page.getByRole('button',{name:'单日试算',exact:true}).click();
  const dialog=dialogFor('单日试算');await chooseEmployee(dialog);await fill(dialog,'日期','2026-07-21');
  const result=await saveForm(dialog,base+'/records/calculate','GET');
  check('real_preview_'+expected,result.status===expected&&Number(result.workMinutes)===472&&Number(result.lateMinutes)===late);
  const previewDialog=dialogFor('单日试算结果（未保存）');await previewDialog.waitFor();
  const row=label=>previewDialog.locator('dl > div').filter({has:page.locator('dt').filter({hasText:new RegExp('^'+label+'$')})}).locator('dd');
  check('preview_rendered_'+expected,await row('判定').innerText()===(expected==='NORMAL'?'正常':'迟到')&&await row('工作分钟').innerText()==='472');
  await screenshot('preview-'+expected+'.png');
  await previewDialog.getByRole('button',{name:'关闭弹窗',exact:true}).click();
}
const evidence={shifts:false,rules:false,schedules:false,punches:false,preview:false,preservation:false,secrets:false};
const decimalHourFields=new Set(['halfDayHoursThreshold','absentHoursThreshold']);
function checkShiftField(stage,key,input,actual){
  fixture.shiftObservations.push({stage,field:key,input,actual});save();
  const matches=decimalHourFields.has(key)
    ? /^\d+(?:\.\d+)?$/.test(String(actual))&&Number(actual)===Number(input)
    : String(actual)===String(input);
  check('shift_'+stage+'_'+key,matches);
}
let original,failure;
try{
  for(const [table,key]of tables)bounds[table]=database('SELECT COALESCE(MAX('+key+'),0) FROM '+table);
  original=preserved();fixture.originalBounds=bounds;fixture.originalDigest=original;save();
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{employeeNo:marker,name:marker,gender:'MALE',deptId:'100',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2025-01-01'}));
  await ok('admin','/auth/system/holiday/calendar','POST',{calendarCode:marker,calendarName:marker,defaultFlag:0,weeklyRestDays:'6,7',
    workStartTime:'09:00:00',workEndTime:'18:00:00',lunchStartTime:'12:00:00',lunchEndTime:'13:00:00',status:'ENABLED'});
  fixture.calendarId=id(database('SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='+sql(marker)));
  shiftFields.find(entry=>entry[0]==='holidayCalendarId')[2]=fixture.calendarId;save();
  await page.goto(new URL('/hr/attendance',origin).href,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'考勤规则与月封账',exact:true}).waitFor();
  stage('shift-create');
  await tab('班次');await panel('班次').getByRole('button',{name:'新增班次',exact:true}).click();
  let dialog=dialogFor('新增班次');
  await fill(dialog,'编码',marker);await fill(dialog,'名称',marker);await fill(dialog,'应出勤分钟',480);
  for(const [,label,value,type]of shiftFields)await(type==='select'?select(dialog,label,value):fill(dialog,label,value));
  await screenshot('shift-fields.png');
  fixture.shiftId=id(await saveForm(dialog,base+'/shifts'));save();
  await page.reload({waitUntil:'domcontentloaded'});await tab('班次');dialog=await edit('班次',marker);
  for(const [key,label,value,type]of shiftFields)checkShiftField('roundtrip',key,value,await field(dialog,label,type==='select'?'select':'input').inputValue());
  const storedShift=(await ok('admin',base+'/shifts')).find(row=>String(row.id)===fixture.shiftId);
  for(const [key,,value]of shiftFields)checkShiftField('persisted',key,value,storedShift[key]);
  await dialog.getByRole('button',{name:'取消',exact:true}).click();evidence.shifts=true;
  stage('rule-create-and-reopen');
  await tab('打卡规则');await panel('打卡规则').getByRole('button',{name:'新增打卡规则',exact:true}).click();dialog=dialogFor('新增打卡规则');
  await fill(dialog,'编码',marker);await fill(dialog,'名称',marker);await select(dialog,'班次',fixture.shiftId);
  await dialog.getByRole('checkbox',{name:'定位',exact:true}).check();
  await fill(dialog,'班内休息开始','12:00');await fill(dialog,'班内休息结束','13:00');
  await fill(dialog,'围栏中心纬度','31.2345678');await fill(dialog,'围栏中心经度','121.4567891');await fill(dialog,'围栏半径',100);
  fixture.ruleId=id(await saveForm(dialog,base+'/rules'));save();
  const currentRules=await ok('admin',base+'/rules');
  check('all_rule_responses_omit_removed_workdays',currentRules.length>0&&currentRules.every(row=>!Object.hasOwn(row,'workDays')));
  await page.reload({waitUntil:'domcontentloaded'});await tab('打卡规则');dialog=await edit('打卡规则',marker);
  check('rule_methods_reopen',await dialog.getByRole('checkbox',{name:'应用',exact:true}).isChecked()&&await dialog.getByRole('checkbox',{name:'定位',exact:true}).isChecked()&&!await dialog.getByRole('checkbox',{name:'门禁卡',exact:true}).isChecked());
  for(const [label,value]of [['围栏中心纬度','31.2345678'],['围栏中心经度','121.4567891'],['围栏半径','100'],['班内休息开始','12:00'],['班内休息结束','13:00']])check('rule_reopen_'+label,await field(dialog,label).inputValue()===value);
  await screenshot('rule-reopened.png');await dialog.getByRole('button',{name:'取消',exact:true}).click();evidence.rules=true;
  stage('schedule-create-and-reopen');
  await tab('排班');await panel('排班').getByRole('button',{name:'新增排班',exact:true}).click();dialog=dialogFor('新增排班');
  await chooseEmployee(dialog);await select(dialog,'班次',fixture.shiftId);await select(dialog,'打卡规则',fixture.ruleId);
  await fill(dialog,'有效开始','2026-07-01');await fill(dialog,'有效结束','2026-07-31');
  fixture.scheduleId=id(await saveForm(dialog,base+'/schedules'));save();
  await page.reload({waitUntil:'domcontentloaded'});await tab('排班');dialog=await edit('排班',marker);
  await dialog.getByRole('combobox',{name:'选择员工',exact:true}).filter({hasText:marker}).waitFor();
  check('schedule_reopened_employee',await dialog.getByRole('combobox',{name:'选择员工',exact:true}).innerText().then(value=>value.includes(marker)));
  check('schedule_reopened_shift_rule',await field(dialog,'班次','select').inputValue()===fixture.shiftId&&await field(dialog,'打卡规则','select').inputValue()===fixture.ruleId);
  check('schedule_reopened_dates',await field(dialog,'有效开始').inputValue()==='2026-07-01'&&await field(dialog,'有效结束').inputValue()==='2026-07-31');
  await screenshot('schedule-reopened.png');await dialog.getByRole('button',{name:'取消',exact:true}).click();evidence.schedules=true;
  stage('manual-punch-page');
  await tab('原始打卡');fixture.punches=[];
  for(const [kind,time]of [['IN','2026-07-21T09:08'],['OUT','2026-07-21T18:00']]){
    await page.getByRole('button',{name:'补录原始打卡',exact:true}).click();dialog=dialogFor('补录原始打卡');
    await chooseEmployee(dialog);await select(dialog,'进出类型',kind);await fill(dialog,'打卡时间',time);
    await fill(dialog,'纬度','31.2345678');await fill(dialog,'经度','121.4567891');await fill(dialog,'地点',marker);
    await field(dialog,'说明','textarea').fill(marker+'-'+kind);
    fixture.punches.push(id(await saveForm(dialog,base+'/checkins')));save();
  }
  const punches=await ok('admin',base+'/checkins?employeeId='+fixture.employeeId+'&from=2026-07-21&to=2026-07-21');
  check('two_manual_punches_and_coordinates',punches.length===2&&punches.every(row=>row.checkMethod==='MANUAL'&&Number(row.latitude)===31.2345678&&Number(row.longitude)===121.4567891&&Number(row.locationValidFlag)===1));
  evidence.punches=true;
  const rawHash=hash(database('SELECT * FROM hr_attendance_checkin ORDER BY checkin_id'));
  stage('preview-before-rule-edit');await preview('NORMAL',0);
  await tab('班次');dialog=await edit('班次',marker);
  await fill(dialog,'迟到宽限分钟',5);await fill(dialog,'早退宽限分钟',7);
  await select(dialog,'工时计算','FIRST_LAST');await select(dialog,'进出判定','EARLIEST_LATEST');
  await saveForm(dialog,base+'/shifts/'+fixture.shiftId,'PUT');
  stage('preview-after-rule-edit');await preview('LATE',3);
  check('preview_does_not_save_daily_results',database('SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id='+fixture.employeeId)==='0');
  check('preview_and_config_change_preserve_raw_punches',rawHash===hash(database('SELECT * FROM hr_attendance_checkin ORDER BY checkin_id')));
  evidence.preview=true;stage('configuration-pages-completed');
}catch(error){
  failure=error;let message=String(error.message).slice(0,5000);
  for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('failure-detail.json',{phase:fixture.phase,message});
  try{await screenshot('failure-page.png');}catch{/* Keep the original failure. */}
}finally{
  try{check('original_business_rows_preserved',!!original&&JSON.stringify(original)===JSON.stringify(preserved()));
    check('browser_no_errors',browserErrors.length===0);evidence.preservation=true;}catch(error){failure ||=error;}
  try{const scan=await runtime.scan();evidence.secrets=true;console.log('D2_CONFIG_LOG_SCAN: '+JSON.stringify(scan));}catch(error){failure ||=error;}
  await runtime.close();save();write('requests.json',requests);
  let message=failure?String(failure.message).split('\n')[0].slice(0,240):undefined;
  if(message)for(const value of sensitive)if(value)message=message.split(value).join('[REDACTED]');
  write('result.json',{passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,
    all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_CONFIG_SUMMARY: checks='+checks.length+'; requests='+requests.length+'; correctness='+Object.values(evidence).every(Boolean)+'; preservation='+evidence.preservation);
  if(failure){console.log('D2_CONFIG_FAILURE: '+message);process.exitCode=1;}
}
