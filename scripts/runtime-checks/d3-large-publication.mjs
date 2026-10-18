import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

// Extends the owned large-amount fixture with actual publication and reuse of its stored tax snapshots.
export async function verifyLargePublication(runtime,fixture,output,{ok,raw,observe,same,cents,money,save}) {
  const {check,database,sessions}=runtime;
  const pay='/hr/compensation/payroll';
  const result={publication:false,pdf:false,ess:false,nextPeriod:false,presentation:false,compensationUi:false};
  const origin=new URL(sessions.admin.page.url()).origin;
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const assertAmount=(label,actual,expected)=>check(label,same(actual,expected));
  const currentAmounts=(label,slip,sample)=>{for(const [field,expected]of [['grossTotal',sample.gross],['taxAmount',sample.tax],['netTotal',sample.net]])assertAmount(label+'_'+field,slip[field],expected);};
  assert.ok(fixture.findings.every(row=>row.passed),'All draft amounts must pass before publication');
  fixture.published=[];fixture.pdfs=[];fixture.publicationScreenshots=[];save();
  const download=async entry=>{
    const response=await sessions.admin.page.evaluate(async slipId=>{
      const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
      const response=await fetch('/api/hr/compensation/payroll/slips/'+slipId+'/pdf',{credentials:'same-origin',headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token}});
      return {status:response.status,type:response.headers.get('Content-Type'),traceId:response.headers.get('X-Trace-Id'),bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
    },entry.slipId);
    runtime.requests.push({actor:'admin',method:'GET',path:pay+'/slips/'+entry.slipId+'/pdf',status:response.status,traceId:response.traceId});
    check(entry.name+'_paid_pdf_download',response.status===200&&response.type?.includes('application/pdf'));
    const directory=path.join(output,entry.name+'-pdf');fs.mkdirSync(directory);
    const pdf=Buffer.from(response.bytes);fs.writeFileSync(path.join(directory,'salary.pdf'),pdf,{flag:'wx'});
    const args=fs.readFileSync(path.join(runtime.run,'hr/service.args'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/);
    const classpath=args[args.indexOf('-cp')+1]?.replace(/^"|"$/g,'');assert.ok(classpath?.includes('pdfbox-2.0.24.jar'));
    const argfile=path.join(directory,'probe.args');
    fs.writeFileSync(argfile,['-Dfile.encoding=UTF-8','-cp',classpath,'D:/CloudFlowPro/scripts/runtime-checks/D3SalaryPdfProbe.java',path.join(directory,'salary.pdf'),path.join(directory,'salary.txt'),path.join(directory,'salary.png')].map(value=>'"'+value.replaceAll('\\','/').replaceAll('"','\\"')+'"').join('\n'));
    const probe=spawnSync('java',['@'+argfile],{encoding:'utf8',windowsHide:true,timeout:60000});
    fs.writeFileSync(path.join(directory,'probe.log'),probe.stdout+probe.stderr);
    check(entry.name+'_paid_pdf_parsed',probe.status===0);
    const text=fs.readFileSync(path.join(directory,'salary.txt'),'utf8').normalize('NFKC').replace(/[\u2010\u2011]/g,'-');
    for(const expected of [entry.gross,entry.tax,entry.net,fixture.marker+'-固定工资','工资明细'])check(entry.name+'_pdf_'+expected,text.includes(expected));
    for(const hidden of ['计薪口径快照','社保扣除月份快照'])check(entry.name+'_pdf_hides_'+hidden,!text.includes(hidden));
    fixture.pdfs.push({name:entry.name,slipId:entry.slipId,bytes:pdf.length,sha256:digest(pdf)});save();
  };
  for(const entry of fixture.cases){
    await ok(pay+'/batches/'+entry.batchId+'/submit','POST',{});
    const submitted=await ok(pay+'/slips/'+entry.slipId);check(entry.name+'_submitted',submitted.status==='SUBMITTED');currentAmounts(entry.name+'_submitted',submitted,entry);
    await ok(pay+'/batches/'+entry.batchId+'/pay','POST',{});
    const paid=await raw(pay+'/slips/'+entry.slipId,entry.name+'-paid');check(entry.name+'_paid',paid.exact.status==='PAID');currentAmounts(entry.name+'_paid',paid.exact,entry);currentAmounts(entry.name+'_paid_browser',paid.native,entry);
    fixture.published.push(entry.slipId);save();await download(entry);
  }
  result.publication=true;result.pdf=true;
  const large=fixture.cases.find(row=>row.name==='large');assert.ok(large);
  const page=await sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('publication-admin'));
  await page.goto(origin+'/hr/payroll?id='+large.slipId,{waitUntil:'networkidle'});
  const dialog=page.getByRole('dialog');await dialog.waitFor();const text=await dialog.innerText();
  for(const expected of [large.gross,large.net,'已发放',fixture.marker+'-固定工资'])check('paid_page_'+expected,text.includes(expected));
  for(const hidden of ['计薪口径快照','社保扣除月份快照','PAID'])check('paid_page_hides_'+hidden,!text.includes(hidden));
  await page.screenshot({path:path.join(output,'paid-large-page.png')});fixture.publicationScreenshots.push('paid-large-page.png');save();result.presentation=true;
  await page.keyboard.press('Escape');
  await page.getByText('薪酬福利',{exact:true}).first().click();
  await page.getByRole('tab',{name:'员工薪资',exact:true}).click();
  const formatted=await page.evaluate(async value=>(await import('/src/pages/hr/hrShared.ts')).formatMoneyValue(value),large.gross);
  check('compensation_formatter_exact',formatted.replaceAll(',','').includes(large.gross));
  await page.getByRole('button',{name:'分配薪资',exact:true}).click();
  const editor=page.getByRole('dialog');await editor.getByRole('spinbutton',{name:'总薪资',exact:true}).fill(large.gross);
  let payload;
  const capture=origin+'/api/hr/compensation/employee-compensations';
  await page.route(capture,async route=>{payload=route.request().postDataJSON();await route.abort('aborted');});
  await Promise.all([page.waitForEvent('requestfailed',{predicate:request=>request.url()===capture&&request.method()==='POST'}),editor.getByRole('button',{name:'保存',exact:true}).click()]);
  assertAmount('compensation_actual_submitted_amount',payload?.totalSalary,large.gross);
  fs.writeFileSync(path.join(output,'compensation-input.json'),JSON.stringify(payload,null,2),{flag:'wx'});
  await editor.getByRole('alert').waitFor();
  check('compensation_failed_request_keeps_input',(await editor.getByRole('spinbutton',{name:'总薪资',exact:true}).inputValue())===large.gross);
  await page.unroute(capture);await editor.getByRole('button',{name:'取消',exact:true}).click();result.compensationUi=true;

  const accountId=String(sessions.employee.identity.userId);assert.match(accountId,/^\d+$/);
  check('test_account_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${accountId} AND deleted=0`)==='0');
  const employeeBody={employeeNo:fixture.marker+'-large',name:fixture.marker+'-large',gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:fixture.month+'-01'};
  const originalEmployee=digest(database(`SELECT employee_no,name,dept_id,hire_date,employee_type,employee_status,create_by,create_time FROM hr_employee WHERE id=${large.employeeId}`));
  fixture.bindingAttempted=true;save();
  try{
    await ok('/hr/employees/'+large.employeeId,'PUT',{...employeeBody,userId:accountId});
    const essPage=await sessions.employee.context.newPage();essPage.on('pageerror',()=>runtime.browserErrors.push('publication-employee'));essPage.setDefaultTimeout(30000);
    await essPage.goto(origin+'/hr/ess/slips?id='+large.slipId,{waitUntil:'networkidle'});
    const ownDialog=essPage.getByRole('dialog');await ownDialog.waitFor();const ownText=await ownDialog.innerText();
    for(const expected of [large.gross,large.tax,large.net])check('employee_page_'+expected,ownText.includes(expected));
    await essPage.screenshot({path:path.join(output,'employee-large-page.png')});fixture.publicationScreenshots.push('employee-large-page.png');save();
    const own=runtime.success(await runtime.api('employee','/hr/ess/salary-slips/'+large.slipId),'employee_large_actual_api');currentAmounts('employee_actual_api',own,large);result.ess=true;
    await essPage.close();
  }finally{
    await ok('/hr/employees/'+large.employeeId,'PUT',{...employeeBody,userId:null});
    check('new_employee_binding_restored',database(`SELECT COUNT(*) FROM hr_employee WHERE id=${large.employeeId} AND user_id IS NULL`)==='1');
    check('new_employee_business_identity_preserved',digest(database(`SELECT employee_no,name,dept_id,hire_date,employee_type,employee_status,create_by,create_time FROM hr_employee WHERE id=${large.employeeId}`))===originalEmployee);
    fixture.bindingRestored=true;save();
  }
  const year=Number(fixture.month.slice(0,4)),nextMonth=year+'-02',end=new Date(Date.UTC(year,2,0)).toISOString().slice(0,10);
  const periods=await ok(pay+'/config/periods');check('next_month_unoccupied',!periods.some(period=>period.startDate<=end&&period.endDate>=nextMonth+'-01'));
  const periodId=String(await ok(pay+'/periods','POST',{periodName:fixture.marker+'-次月',startDate:nextMonth+'-01',endDate:end,payDate:end,frequency:'MONTHLY'}));
  const gross=cents(large.gross),tax=(gross*2n+5n)/10n-cents(large.tax);
  const next={name:'next',employeeId:large.employeeId,gross:large.gross,tax:money(tax),net:money(gross-tax),periodId};fixture.nextPayroll=next;save();
  const preview=await raw(pay+'/slips/preview?'+new URLSearchParams({employeeId:large.employeeId,periodId}),'next-preview');currentAmounts('next_preview',preview.exact,next);
  assertAmount('next_cumulative_taxable',preview.exact.cumulativeTaxableIncome,money(gross*2n));assertAmount('next_previous_paid',preview.exact.cumulativeTaxPaid,large.tax);
  next.batchId=String(await ok(pay+'/batches','POST',{payrollPeriodId:periodId,employeeIds:[large.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0}));fixture.batches.push(next.batchId);save();
  const task={batchId:next.batchId,executeNo:await ok(pay+'/batches/'+next.batchId+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);
  const detail=await ok(pay+'/batches/'+next.batchId),employee=detail.employees.find(row=>String(row.employeeId)===large.employeeId);check('next_actual_generated',employee?.calcStatus==='SUCCESS');next.slipId=String(employee.salarySlipId);save();
  currentAmounts('next_actual',await ok(pay+'/slips/'+next.slipId),next);
  await ok(pay+'/batches/'+next.batchId+'/submit','POST',{});await ok(pay+'/batches/'+next.batchId+'/pay','POST',{});fixture.published.push(next.slipId);save();
  const nextPaid=await raw(pay+'/slips/'+next.slipId,'next-paid');check('next_paid',nextPaid.exact.status==='PAID');currentAmounts('next_paid',nextPaid.exact,next);assertAmount('next_paid_cumulative',nextPaid.exact.cumulativeTaxableIncome,money(gross*2n));
  await download(next);result.nextPeriod=true;await page.close();return result;
}
