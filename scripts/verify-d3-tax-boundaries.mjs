import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';

const root='D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-tax-boundaries'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-tax-boundaries-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const Decimal=createRequire(path.join(root,'cloudflow-frontend/package.json'))('decimal.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const cents=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Expected exact two-place money');return (match[1]? -1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));};
const money=value=>{const absolute=value<0n?-value:value;return (value<0n?'-':'')+String(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');};
const rates=[1000n,2000n,3000n,4000n,5000n,6000n,7000n],width=1000000n,threshold=300000n;
const quick=[0n,100000n,300000n,600000n,1000000n,1500000n,2100000n];
// Independent oracle integrates each marginal band in integer cents; it never uses quick deductions.
const expected=gross=>{
  const raw=gross-threshold,taxable=raw<0n?0n:raw;
  let remaining=taxable,numerator=0n;
  for(let index=0;index<rates.length&&remaining>0n;index++){
    const slice=index===6||remaining<width?remaining:width;
    numerator+=slice*rates[index];remaining-=slice;
  }
  const tax=(numerator+5000n)/10000n;
  const band=taxable===0n?0:Number((taxable-1n)/width)>6?6:Number((taxable-1n)/width);
  return {gross:money(gross),raw:money(raw),taxable:money(taxable),tax:money(tax),net:money(gross-tax),band};
};
const samples=[];
for(let edge=1;edge<=6;edge++)for(const [suffix,delta]of [['below',-1n],['at',0n],['above',1n]])
  samples.push({name:'edge'+edge+'-'+suffix,...expected(threshold+BigInt(edge)*width+delta)});
for(const amount of [4n,5n,6n])samples.push({name:'rounding-'+amount,...expected(threshold+amount)});
for(const [suffix,delta]of [['below',-1n],['at',0n],['above',1n]])samples.push({name:'threshold-'+suffix,...expected(threshold+delta)});
assert.equal(samples.length,24);
const fixture={marker:'D3T-'+randomUUID().replaceAll('-','').slice(0,12),cases:[],tasks:[],batches:[],findings:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));
save();
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id']];
const pay='/hr/compensation/payroll';
const evidence={boundaries:false,rounding:false,threshold:false,snapshots:false,browser:false,preservation:false,restoration:false,secrets:false};
let runtime,failure,taxBody,originalDigests,originalRoles,preserved,roles,observe;
const finding=(label,passed,detail={})=>{fixture.findings.push({label,passed,...detail});save();};
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,check,sessions}=runtime;
  const ok=async(url,method='GET',body)=>runtime.ok('admin',url,method,body);
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){
      const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');
      if(end==='0')break;
      digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;
    }
    return [table,digest.digest('hex')];
  }));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;save();
  observe=async task=>{
    if(task.terminal)return;
    for(let attempt=0;;attempt++){
      const value=await ok(pay+'/tasks/'+encodeURIComponent(task.executeNo));
      if(['SUCCESS','FAILED','TIMEOUT'].includes(value.executeStatus)){task.terminal=value.executeStatus;task.affectedRows=Number(value.affectedRows);save();return;}
      if(attempt>0&&attempt%30===0)console.log('D3_TAX_PHASE: observing original task');
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
  };
  const periods=await ok(pay+'/config/periods');
  const year=Array.from({length:58},(_,index)=>2042+index).find(year=>!periods.some(period=>period.startDate<=year+'-01-31'&&period.endDate>=year+'-01-01'));
  check('unused_owned_month',year!==undefined);fixture.month=year+'-01';
  fixture.periodId=id(await ok(pay+'/periods','POST',{periodName:fixture.marker,startDate:fixture.month+'-01',endDate:fixture.month+'-31',payDate:fixture.month+'-31',frequency:'MONTHLY'}));save();
  check('reuse_owned_calendar_department',database("SELECT COUNT(*) FROM sys_dept WHERE dept_id=990000164 AND tenant_id=100000 AND dept_name='D3D-b38126e08b99' AND deleted=0")==='1');
  fixture.structureId=id(await ok('/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok(pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.componentId=id(await ok('/hr/compensation/components','POST',{componentCode:fixture.marker,componentName:fixture.marker+'-固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999}));save();
  taxBody={slabName:fixture.marker+'-七档合成',region:'隔离测试',effectiveFrom:fixture.month+'-01',effectiveTo:fixture.month+'-31',thresholdAmount:money(threshold),status:'DRAFT',remark:'七档边界与分位舍入验证，不代表正式税率政策'};
  fixture.slabId=id(await ok(pay+'/tax-slabs','POST',taxBody));save();
  const bands=rates.map((rate,index)=>({levelNo:index+1,fromAmount:money(BigInt(index)*width),toAmount:index===6?null:money(BigInt(index+1)*width),taxRate:'0.'+String(rate).padStart(4,'0'),quickDeduction:money(quick[index])}));
  await ok(pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',bands);
  await ok(pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  const verify=(slip,sample,label)=>{
    const amounts={grossTotal:sample.gross,currentTax:sample.tax,taxAmount:sample.tax,netTotal:sample.net,deductionTotal:sample.tax,benefitAmount:'0.00',
      cumulativeTaxableIncome:sample.taxable,cumulativeDeduction:money(threshold),cumulativeTaxPayable:sample.tax,cumulativeTaxPaid:'0.00'};
    for(const [field,wanted]of Object.entries(amounts))finding(label+'_'+field,cents(slip[field])===cents(wanted),{expected:wanted,actual:String(slip[field])});
    const snapshots=slip.components.filter(row=>row.type==='TAX_SNAPSHOT');
    check(label+'_single_snapshot',snapshots.length===1);const snap=snapshots[0];
    finding(label+'_raw_income',cents(snap.currentTaxableIncome)===cents(sample.raw));
    finding(label+'_threshold',cents(snap.thresholdApplied)===threshold);
    finding(label+'_applied_rate',new Decimal(String(snap.taxRate)).equals(bands[sample.band].taxRate));
    finding(label+'_applied_quick',cents(snap.quickDeduction)===quick[sample.band]);
    finding(label+'_all_bands',snap.brackets.length===7&&snap.brackets.every((band,index)=>cents(band.from)===BigInt(index)*width
      &&(index===6?band.to===null:cents(band.to)===BigInt(index+1)*width)&&new Decimal(String(band.rate)).equals(bands[index].taxRate)&&cents(band.quickDeduction)===quick[index]));
  };
  for(const sample of samples){
    const entry={...sample};fixture.cases.push(entry);save();
    entry.employeeId=id(await ok('/hr/employees','POST',{employeeNo:fixture.marker+'-'+sample.name,name:fixture.marker+'-'+sample.name,gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:fixture.month+'-01'}));save();
    entry.compensationId=id(await ok('/hr/compensation/employee-compensations','POST',{employeeId:entry.employeeId,structureId:fixture.structureId,componentValues:{[fixture.componentId]:sample.gross},totalSalary:sample.gross,effectiveDate:fixture.month+'-01',status:'ACTIVE'}));save();
    await ok('/hr/compensation/tax-profiles','POST',{employeeId:entry.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
    const preview=await ok(pay+'/slips/preview?'+new URLSearchParams({employeeId:entry.employeeId,periodId:fixture.periodId}));
    verify(preview,sample,sample.name+'_preview');
    fs.writeFileSync(path.join(output,sample.name+'-preview.json'),JSON.stringify(preview,null,2),{flag:'wx'});
    if(fixture.cases.length%6===0)console.log('D3_TAX_PHASE: prepared='+fixture.cases.length);
  }
  fixture.batchId=id(await ok(pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:fixture.cases.map(row=>row.employeeId),validateAttendanceFlag:0,deductUnverifiedFlag:0}));fixture.batches.push(fixture.batchId);save();
  const task={batchId:fixture.batchId,executeNo:await ok(pay+'/batches/'+fixture.batchId+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check('original_task_success',task.terminal==='SUCCESS');
  const batch=await ok(pay+'/batches/'+fixture.batchId);
  check('batch_calculated',batch.batch.status==='CALCULATED'&&batch.employees.length===24);
  let gross=0n,tax=0n,net=0n;
  for(const sample of fixture.cases){
    const detail=batch.employees.find(row=>String(row.employeeId)===sample.employeeId);
    check(sample.name+'_calculated',detail?.calcStatus==='SUCCESS');sample.slipId=id(detail.salarySlipId);save();
    const slip=await ok(pay+'/slips/'+sample.slipId);verify(slip,sample,sample.name+'_actual');
    fs.writeFileSync(path.join(output,sample.name+'-slip.json'),JSON.stringify(slip,null,2),{flag:'wx'});
    const stored=JSON.parse(database("SELECT JSON_OBJECT('grossTotal',CAST(gross_total AS CHAR),'taxAmount',CAST(tax_amount AS CHAR),'netTotal',CAST(net_total AS CHAR),'currentTax',CAST(current_tax AS CHAR),'deductionTotal',CAST(deduction_total AS CHAR),'benefitAmount',CAST(benefit_amount AS CHAR),'cumulativeTaxableIncome',CAST(cumulative_taxable_income AS CHAR),'cumulativeDeduction',CAST(cumulative_deduction AS CHAR),'cumulativeTaxPayable',CAST(cumulative_tax_payable AS CHAR),'cumulativeTaxPaid',CAST(cumulative_tax_paid AS CHAR),'components',components) FROM hr_salary_slip WHERE id="+sample.slipId));
    verify(stored,sample,sample.name+'_stored');
    fs.writeFileSync(path.join(output,sample.name+'-stored.json'),JSON.stringify(stored,null,2),{flag:'wx'});
    gross+=cents(sample.gross);tax+=cents(sample.tax);net+=cents(sample.net);
  }
  for(const [field,wanted]of [['totalGross',gross],['totalTax',tax],['totalDeduction',tax],['totalNet',net]])finding('batch_'+field,cents(batch.batch[field])===wanted);
  const page=await sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('tax-boundary'));
  const origin=new URL(sessions.admin.page.url()).origin;
  for(const name of ['edge6-above','rounding-5','threshold-below']){
    const sample=fixture.cases.find(row=>row.name===name);
    await page.goto(origin+'/hr/payroll?id='+sample.slipId,{waitUntil:'networkidle'});
    const dialog=page.getByRole('dialog');await dialog.waitFor();const text=(await dialog.innerText()).replaceAll(',','');
    for(const field of ['gross','tax','net'])finding(name+'_browser_'+field,text.includes(sample[field]));
    await page.screenshot({path:path.join(output,name+'-page.png')});await page.keyboard.press('Escape');
  }
  await page.close();
  evidence.boundaries=fixture.cases.filter(row=>row.name.startsWith('edge')).length===18&&fixture.findings.filter(row=>row.label.startsWith('edge')).every(row=>row.passed);
  evidence.rounding=fixture.findings.filter(row=>row.label.startsWith('rounding')).every(row=>row.passed);
  evidence.threshold=fixture.findings.filter(row=>row.label.startsWith('threshold')).every(row=>row.passed);
  evidence.snapshots=fixture.findings.filter(row=>/snapshot|applied|bands|raw_income|threshold/.test(row.label)).every(row=>row.passed);
  evidence.browser=fixture.findings.filter(row=>row.label.includes('_browser_')).length===9&&fixture.findings.filter(row=>row.label.includes('_browser_')).every(row=>row.passed);
}catch(error){failure=error;}
finally{
  if(runtime){
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batchId of fixture.batches){
      const batch=await runtime.ok('admin',pay+'/batches/'+batchId);assert.notEqual(batch.batch.status,'CALCULATING');
      if(['DRAFT','CALCULATED','FAILED'].includes(batch.batch.status))await runtime.ok('admin',pay+'/batches/'+batchId+'/cancel','POST',{});
      runtime.check('owned_batch_cancelled_'+batchId,(await runtime.ok('admin',pay+'/batches/'+batchId)).batch.status==='CANCELLED');
    }});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await runtime.ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=preserved();for(const [table,digest]of Object.entries(originalDigests))runtime.check('original_'+table+'_preserved',after[table]===digest);runtime.check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{runtime.check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_TAX_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();
  const message=failure?String(failure.message).split('\n')[0].slice(0,180):undefined;
  const result={passed:!failure&&fixture.findings.length>0&&fixture.findings.every(row=>row.passed)&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],findings:fixture.findings,requests:runtime?.requests.length||0,tasks:fixture.tasks.length,cases:fixture.cases.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  console.log('D3_TAX_RESULT: '+JSON.stringify({...evidence,passed:result.passed,checks:result.checks.length,findings:result.findings.length,failedFindings:result.findings.filter(row=>!row.passed).map(row=>row.label),cases:result.cases,requests:result.requests,tasks:result.tasks,failure:message}));
  if(!result.passed)process.exitCode=1;
}
