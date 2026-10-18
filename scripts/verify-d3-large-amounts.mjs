import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { verifyLargePublication } from './runtime-checks/d3-large-publication.mjs';

const root='D:/CloudFlowPro';
const publish=process.argv.includes('--d3-large-publication');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-large-amounts'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),publish?/^d3-large-publication-20261006-r[1-9][0-9]*$/:/^d3-large-amounts-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const Decimal=createRequire(path.join(root,'cloudflow-frontend/package.json'))('decimal.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
// Tokenize JSON values without changing digits inside JSON strings; expected arithmetic uses integer cents.
const lossless=text=>JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,(token,number)=>number?JSON.stringify(number):token));
const cents=value=>{const match=/^(\d+)\.(\d{2})$/.exec(value);assert.ok(match);return BigInt(match[1])*100n+BigInt(match[2]);};
const money=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
const same=(actual,expected)=>{try{return new Decimal(String(actual)).equals(expected);}catch{return false;}};
const fixture={marker:'D3L-'+randomUUID().replaceAll('-','').slice(0,12),cases:[],batches:[],tasks:[],findings:[],restorations:{},screenshots:[]};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const samples=[['fraction','0.03'],['large','90071992547409.93'],['maximum','9999999999999999.99']].map(([name,gross])=>{
  const grossCents=cents(gross),tax=(grossCents+5n)/10n;return {name,gross,tax:money(tax),net:money(grossCents-tax)};
});
let runtime,failure,taxBody,originalDigests,originalRoles;
const evidence={storage:false,calculation:false,transport:false,browser:false,input:false,preservation:false,restoration:false,secrets:false};
if(publish)Object.assign(evidence,{publication:false,pdf:false,ess:false,nextPeriod:false,presentation:false,compensationUi:false});
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id']];
const pay='/hr/compensation/payroll';
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,rows,sessions,check}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]));
  runtime.digests=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 1000) selected`);if(end==='0')break;digest.update(database(`SELECT * FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key}`));cursor=end;}return [table,digest.digest('hex')];}));
  runtime.roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=runtime.digests();originalRoles=runtime.roles();fixture.bounds=bounds;fixture.originalDigests=originalDigests;save();
  runtime.ok=async(url,method='GET',body)=>runtime.success(await runtime.api('admin',url,{method,body}),method+'_'+url.split('?')[0]);
  const ok=runtime.ok;
  for(const originalSlip of ['98209280908','98209280914','98209280916','98209280917','98209280918']){
    const original=await ok(pay+'/slips/'+originalSlip);check('original_sealed_salary_readable_'+originalSlip,original.status==='PAID');
  }
  const observe=runtime.observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const value=await ok(pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(value.executeStatus)){task.terminal=value.executeStatus;task.affectedRows=Number(value.affectedRows);save();return;}if(attempt>0&&attempt%30===0)console.log('D3_LARGE_PHASE: observing_original_task='+task.executeNo);await new Promise(resolve=>setTimeout(resolve,1000));}};
  const finding=(label,passed,details={})=>{fixture.findings.push({label,passed,...details});save();};
  const raw=async(url,label)=>{
    const result=await sessions.admin.page.evaluate(async requestPath=>{const token=(await import('/src/utils/authStorage.ts')).getAuthToken();const response=await fetch('/api'+requestPath,{credentials:'same-origin',headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token}});return {status:response.status,text:await response.text(),traceId:response.headers.get('X-Trace-Id')};},url);
    const exact=lossless(result.text),native=JSON.parse(result.text);
    runtime.requests.push({actor:'admin',path:url,method:'GET',status:result.status,code:native.code,traceId:result.traceId});
    check(label+'_raw_request_success',result.status===200&&String(exact.code)==='200');
    fs.writeFileSync(path.join(output,label+'.json'),result.text,{flag:'wx'});
    return {exact:exact.data,native:native.data};
  };
  const periods=await ok(pay+'/config/periods');const year=Array.from({length:58},(_,index)=>2042+index).find(year=>!periods.some(period=>period.startDate<=`${year}-01-31`&&period.endDate>=`${year}-01-01`));
  check('unused_owned_synthetic_month',year!==undefined);fixture.month=year+'-01';
  fixture.periodId=id(await ok(pay+'/periods','POST',{periodName:fixture.marker,startDate:year+'-01-01',endDate:year+'-01-31',payDate:year+'-01-31',frequency:'MONTHLY'}));save();
  check('reuse_owned_calendar_department',database("SELECT COUNT(*) FROM sys_dept WHERE dept_id=990000164 AND tenant_id=100000 AND dept_name='D3D-b38126e08b99' AND deleted=0")==='1');
  fixture.structureId=id(await ok('/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));
  await ok(pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.componentId=id(await ok('/hr/compensation/components','POST',{componentCode:fixture.marker,componentName:fixture.marker+'-固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999}));
  taxBody={slabName:fixture.marker+'-合成10%',region:'隔离测试',effectiveFrom:year+'-01-01',effectiveTo:publish?new Date(Date.UTC(year,2,0)).toISOString().slice(0,10):year+'-01-31',thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证已批准18位金额，不代表正式政策'};
  fixture.slabId=id(await ok(pay+'/tax-slabs','POST',taxBody));save();
  await ok(pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  for(const sample of samples){
    const entry={...sample};fixture.cases.push(entry);save();
    entry.employeeId=id(await ok('/hr/employees','POST',{employeeNo:fixture.marker+'-'+sample.name,name:fixture.marker+'-'+sample.name,gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:year+'-01-01'}));save();
    entry.compensationId=id(await ok('/hr/compensation/employee-compensations','POST',{employeeId:entry.employeeId,structureId:fixture.structureId,componentValues:{[fixture.componentId]:sample.gross},totalSalary:sample.gross,effectiveDate:year+'-01-01',status:'ACTIVE'}));save();
    await ok('/hr/compensation/tax-profiles','POST',{employeeId:entry.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
    const compensationRows=await raw('/hr/compensation/employee-compensations?employeeId='+entry.employeeId,sample.name+'-compensation');
    const compensation={exact:compensationRows.exact.find(row=>String(row.id)===entry.compensationId),native:compensationRows.native.find(row=>String(row.id)===entry.compensationId)};
    check(sample.name+'_owned_compensation_returned',Boolean(compensation.exact&&compensation.native));
    finding(sample.name+'_compensation_server_exact',same(compensation.exact.totalSalary,sample.gross),{expected:sample.gross,actual:String(compensation.exact.totalSalary)});
    finding(sample.name+'_compensation_browser_exact',same(compensation.native.totalSalary,sample.gross),{expected:sample.gross,actual:String(compensation.native.totalSalary)});
    finding(sample.name+'_component_saved_exact',same(compensation.exact.componentValues[fixture.componentId],sample.gross));
    check(sample.name+'_encrypted_storage',database(`SELECT COUNT(*) FROM hr_employee_comp WHERE id=${entry.compensationId} AND total_salary NOT REGEXP '^[0-9]+([.][0-9]+)?$'`)==='1');
    const preview=await raw(pay+'/slips/preview?'+new URLSearchParams({employeeId:entry.employeeId,periodId:fixture.periodId}),sample.name+'-preview');
    for(const [field,wanted]of [['grossTotal',sample.gross],['taxAmount',sample.tax],['netTotal',sample.net]]){
      finding(sample.name+'_preview_server_'+field,same(preview.exact[field],wanted),{expected:wanted,actual:String(preview.exact[field])});
      finding(sample.name+'_preview_browser_'+field,same(preview.native[field],wanted),{expected:wanted,actual:String(preview.native[field])});
    }
    entry.batchId=id(await ok(pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:[entry.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:0}));fixture.batches.push(entry.batchId);save();
    const task={batchId:entry.batchId,executeNo:await ok(pay+'/batches/'+entry.batchId+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);
    const detail=await ok(pay+'/batches/'+entry.batchId);check(sample.name+'_batch_finished',detail.batch.status==='CALCULATED');
    const employee=detail.employees.find(employee=>String(employee.employeeId)===entry.employeeId);entry.calculation={task:task.terminal,status:employee.calcStatus,error:employee.errorMessage};save();
    finding(sample.name+'_actual_generated',employee.calcStatus==='SUCCESS',entry.calculation);
    if(employee.calcStatus==='SUCCESS'){
      entry.slipId=id(employee.salarySlipId);save();
      const actual=lossless(database(`SELECT JSON_OBJECT('gross',CAST(gross_total AS CHAR),'tax',CAST(tax_amount AS CHAR),'net',CAST(net_total AS CHAR),'components',components) FROM hr_salary_slip WHERE id=${entry.slipId}`));
      for(const field of ['gross','tax','net'])finding(sample.name+'_database_'+field,actual[field]===sample[field],{expected:sample[field],actual:actual[field]});
      const slip=await raw(pay+'/slips/'+entry.slipId,sample.name+'-slip');
      for(const [field,wanted]of [['grossTotal',sample.gross],['taxAmount',sample.tax],['netTotal',sample.net]]){
        finding(sample.name+'_slip_server_'+field,same(slip.exact[field],wanted),{expected:wanted,actual:String(slip.exact[field])});
        finding(sample.name+'_slip_browser_'+field,same(slip.native[field],wanted),{expected:wanted,actual:String(slip.native[field])});
      }
      for(const [label,value]of [['database',actual],['server',slip.exact],['browser',slip.native]]){
        const components=value.components;
        const basis=components.find(row=>row.type==='PAYROLL_BASIS');
        const taxSnapshot=components.find(row=>row.type==='TAX_SNAPSHOT');
        const fixed=components.find(row=>String(row.salaryComponentId)===fixture.componentId);
        finding(sample.name+'_'+label+'_component_amount',same(fixed?.amount,sample.gross));
        finding(sample.name+'_'+label+'_basis_gross',same(basis?.postedFixedGross,sample.gross));
        finding(sample.name+'_'+label+'_taxable_snapshot',same(taxSnapshot?.currentTaxableIncome,sample.gross));
      }
    }
  }
  if(publish)Object.assign(evidence,await verifyLargePublication(runtime,fixture,output,{ok,raw,observe,same,cents,money,save}));
  const page=await sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('large-ui'));
  const origin=new URL(sessions.admin.page.url()).origin;
  const selected=fixture.cases.find(entry=>entry.name==='large'&&entry.slipId);
  if(selected){
    await page.goto(origin+'/hr/payroll?id='+selected.slipId,{waitUntil:'networkidle'});const dialog=page.getByRole('dialog');await dialog.waitFor();const text=await dialog.innerText();
    finding('large_actual_page_gross_exact',text.includes(selected.gross));finding('large_actual_page_net_exact',text.includes(selected.net));
    await page.screenshot({path:path.join(output,'large-salary.png'),fullPage:false});fixture.screenshots.push('large-salary.png');
    await page.keyboard.press('Escape');
    await page.getByRole('tab',{name:'工资补正',exact:true}).click();await page.getByRole('button',{name:'创建工资补正',exact:true}).click();
    const editor=page.getByRole('dialog'),input=editor.getByRole('spinbutton',{name:/应发调整金额/});
    await input.fill(selected.gross);await input.blur();
    await editor.getByRole('spinbutton',{name:/扣款调整金额/}).fill('0.01');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const value=await input.inputValue();finding('large_actual_input_exact',same(value,selected.gross),{expected:selected.gross,actual:value});
    await editor.getByRole('spinbutton',{name:/原已发放工资单编号/}).fill('98209280908');
    await editor.getByRole('combobox',{name:/补正归属周期/}).selectOption(fixture.periodId);
    await editor.getByRole('textbox',{name:/补正原因/}).fill(fixture.marker+'-仅捕获发送前载荷');
    let submittedPayload;
    const captureRoute=origin+'/api/hr/compensation/payroll/corrections';
    await page.route(captureRoute,async route=>{submittedPayload=route.request().postData();await route.abort('aborted');});
    await Promise.all([
      page.waitForEvent('requestfailed',{predicate:request=>request.url()===captureRoute&&request.method()==='POST'}),
      editor.getByRole('button',{name:'确认',exact:true}).click(),
    ]);
    await editor.getByRole('button',{name:'确认',exact:true}).waitFor();
    check('browser_input_payload_captured_without_backend_write',typeof submittedPayload==='string');
    const exactPayload=lossless(submittedPayload);
    finding('large_actual_submitted_amount_exact',same(exactPayload.grossAdjustment,selected.gross),{expected:selected.gross,actual:String(exactPayload.grossAdjustment)});
    fs.writeFileSync(path.join(output,'input-payload.json'),submittedPayload,{flag:'wx'});
    await page.unroute(captureRoute);
    await editor.getByRole('button',{name:'取消',exact:true}).click();
  }
  evidence.storage=fixture.findings.filter(item=>item.label.includes('compensation_server')||item.label.includes('_component_saved_exact')).every(item=>item.passed);
  evidence.calculation=fixture.findings.filter(item=>item.label.includes('_database_')||item.label.includes('_actual_generated')).every(item=>item.passed);
  evidence.transport=fixture.findings.filter(item=>item.label.includes('_server_')).every(item=>item.passed);
  evidence.browser=fixture.findings.filter(item=>item.label.includes('_browser_')||item.label.includes('_actual_page_')).every(item=>item.passed);
  evidence.input=fixture.findings.some(item=>item.label==='large_actual_submitted_amount_exact'&&item.passed);
}catch(error){failure=error;}
finally{
  if(runtime){
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await runtime.observe(task);for(const batchId of fixture.batches){const result=await runtime.ok(pay+'/batches/'+batchId);assert.notEqual(result.batch.status,'CALCULATING');if(['DRAFT','CALCULATED','FAILED'].includes(result.batch.status))await runtime.ok(pay+'/batches/'+batchId+'/cancel','POST',{});const status=(await runtime.ok(pay+'/batches/'+batchId)).batch.status;runtime.check('owned_batch_terminal_'+batchId,status==='CANCELLED'||publish&&status==='PAID');}});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await runtime.ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=runtime.digests();for(const [table,digest]of Object.entries(originalDigests))runtime.check('original_'+table+'_preserved',after[table]===digest);runtime.check('original_role_grants_preserved',runtime.roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{runtime.check('browser_no_unhandled_errors',runtime.browserErrors.length===0);console.log('D3_LARGE_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const failedFindings=fixture.findings.filter(item=>!item.passed);const message=failure?String(failure.message).split('\n')[0].slice(0,180):undefined;
  const result={passed:!failure&&failedFindings.length===0&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],findings:fixture.findings,requests:runtime?.requests.length||0,tasks:fixture.tasks.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  console.log('D3_LARGE_RESULT: '+JSON.stringify({passed:result.passed,...evidence,checks:result.checks.length,findings:fixture.findings.length,failedFindings:failedFindings.map(item=>item.label),requests:result.requests,tasks:result.tasks,failure:message}));
  if(!result.passed)process.exitCode=1;
}
