import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateFormTest} from './runtime-checks/form-browser-auth.mjs';

const root='D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-official-tax'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-official-tax-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const cents=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Expected exact money');return(match[1]?-1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));};
const money=value=>{const absolute=value<0n?-value:value;return(value<0n?'-':'')+String(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');};
const limits=[3600000n,14400000n,30000000n,42000000n,66000000n,96000000n,null];
const rates=[300n,1000n,2000n,2500n,3000n,3500n,4500n];
const quick=[0n,252000n,1692000n,3192000n,5292000n,8592000n,18192000n];
const threshold=500000n;
const bands=rates.map((rate,index)=>({levelNo:index+1,fromAmount:money(index?limits[index-1]:0n),toAmount:limits[index]===null?null:money(limits[index]),taxRate:'0.'+String(rate).padStart(4,'0'),quickDeduction:money(quick[index])}));
// Independent expected tax integrates marginal bands in integer cents, without quick deductions.
function expected(gross,previousRaw=0n,previousDeduction=0n,previousPaid=0n){
  const raw=gross-threshold,cumulativeRaw=previousRaw+raw,taxable=cumulativeRaw<0n?0n:cumulativeRaw;
  let numerator=0n,lower=0n;
  for(let index=0;index<rates.length;index++){
    const upper=limits[index]===null||taxable<limits[index]?taxable:limits[index];
    if(upper>lower)numerator+=(upper-lower)*rates[index];
    if(limits[index]===null||taxable<=limits[index])break;
    lower=limits[index];
  }
  const payable=(numerator+5000n)/10000n,tax=payable>previousPaid?payable-previousPaid:0n;
  return{gross:money(gross),raw:money(raw),cumulativeRaw:money(cumulativeRaw),taxable:money(taxable),deduction:money(previousDeduction+threshold),payable:money(payable),paid:money(previousPaid),tax:money(tax),net:money(gross-tax),band:limits.findIndex(limit=>limit===null||taxable<=limit)};
}
const boundaryCases=[];
for(let edge=0;edge<6;edge++)for(const[suffix,delta]of[['below',-1n],['at',0n],['above',1n]])boundaryCases.push({name:'edge'+(edge+1)+'-'+suffix,wanted:expected(threshold+limits[edge]+delta)});
for(const amount of[49n,50n,51n])boundaryCases.push({name:'rounding-'+amount,wanted:expected(threshold+amount)});
for(const[suffix,delta]of[['below',-1n],['at',0n],['above',1n]])boundaryCases.push({name:'threshold-'+suffix,wanted:expected(threshold+delta)});
assert.equal(boundaryCases.length,24);
const january=expected(2300000n),february=expected(2300000n,1800000n,500000n,54000n),march=expected(2300000n,3600000n,1000000n,108000n),april=expected(0n,5400000n,1500000n,288000n);
assert.deepEqual([january.tax,february.tax,march.tax,april.tax,april.payable],['540.00','540.00','1800.00','0.00','2380.00']);
const fixture={marker:'D3O-'+randomUUID().replaceAll('-','').slice(0,12),periods:{},reusedPeriods:[],cases:[],batches:[],tasks:[],slips:[],slabs:[],findings:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2));
save();
const pay='/hr/compensation/payroll';
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id']];
const evidence={boundaries:false,rounding:false,threshold:false,cumulative:false,zeroIncome:false,yearReset:false,activation:false,snapshots:false,browser:false,preservation:false,restoration:false,secrets:false};
let runtime,failure,preserved,roleHash,periodDigest,originalRoles,originalBusiness,originalPeriods,observe;
const finding=(label,passed,detail={})=>{fixture.findings.push({label,passed,...detail});save();assert.ok(passed,label);};
try{
  runtime=await createD1LeaveRuntime(root,output);
  const{database,check,sessions}=runtime;
  const financeName='h2adv_finance_870861120861',expectedFinanceId='990001030';
  check('existing_owned_finance_identity',database("SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id=990001030 AND u.user_name='h2adv_finance_870861120861' AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'")==='1');
  const financeBase=JSON.parse(fs.readFileSync(path.join(runtime.run,'private/accounts.json'),'utf8')).find(account=>account.username==='g_holiday_employee');
  assert.ok(financeBase,'Owned payroll fixture account missing');
  const financeAccount={...financeBase,username:financeName};
  const ok=(url,method='GET',body)=>runtime.ok('admin',url,method,body);
  const periods=await ok(pay+'/config/periods');
  const months=['2026-01','2026-02','2026-03','2026-04','2027-01'];
  for(const month of months){
    const end=month+'-'+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();
    const candidates=periods.filter(row=>row.startDate===month+'-01'&&row.endDate===end&&row.status==='OPEN').sort((a,b)=>Number(a.periodId)-Number(b.periodId));
    if(candidates.length){fixture.periods[month]=id(candidates[0].periodId);fixture.reusedPeriods.push(id(candidates[0].periodId));}
    else check('no_conflicting_period_'+month,!periods.some(row=>row.startDate<=end&&row.endDate>=month+'-01'));
  }
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}
    return[table,digest.digest('hex')];
  }));
  roleHash=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  const periodBound=id(database('SELECT MAX(period_id) FROM hr_payroll_period'));
  const periodColumns=database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='hr_payroll_period' ORDER BY ordinal_position").split(/\r?\n/).filter(column=>!['version','update_time','update_by'].includes(column));
  periodColumns.forEach(column=>assert.match(column,/^[a-z_]+$/));
  const reused=fixture.reusedPeriods.length?fixture.reusedPeriods.join(','):'0';
  periodDigest=()=>({untouched:hash(database('SELECT * FROM hr_payroll_period WHERE period_id<='+periodBound+' AND period_id NOT IN ('+reused+') ORDER BY period_id')),reusedBusiness:hash(database('SELECT '+periodColumns.join(',')+' FROM hr_payroll_period WHERE period_id IN ('+reused+') ORDER BY period_id'))});
  originalBusiness=preserved();originalRoles=roleHash();originalPeriods=periodDigest();fixture.originalBounds=bounds;fixture.originalBusiness=originalBusiness;fixture.originalPeriods=originalPeriods;save();
  observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const status=await ok(pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(status.executeStatus)){task.terminal=status.executeStatus;task.affectedRows=Number(status.affectedRows);save();return;}if(attempt>0&&attempt%30===0)console.log('D3_OFFICIAL_PHASE: observing original calculation');await new Promise(resolve=>setTimeout(resolve,1000));}};
  for(const month of months)if(!fixture.periods[month]){const end=month+'-'+new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();fixture.periods[month]=id(await ok(pay+'/periods','POST',{periodName:fixture.marker+'-'+month,startDate:month+'-01',endDate:end,payDate:end,frequency:'MONTHLY'}));save();}
  check('owned_calendar_department',database("SELECT COUNT(*) FROM sys_dept WHERE dept_id=990000164 AND tenant_id=100000 AND dept_name='D3D-b38126e08b99' AND deleted=0")==='1');
  fixture.structureId=id(await ok('/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok(pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.componentId=id(await ok('/hr/compensation/components','POST',{componentCode:fixture.marker,componentName:fixture.marker+'-普通固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999}));save();
  for(const year of[2026,2027]){
    const body={slabName:fixture.marker+'-'+year,region:fixture.marker+'-'+year,effectiveFrom:year+'-01-01',effectiveTo:year+'-12-31',thresholdAmount:'5000.00',status:'DRAFT',remark:year===2026?'已批准普通居民工资政策的隔离验收':'仅按已批准案例验证跨年重置；不声明2027年度正式适用政策'};
    const slabId=id(await ok(pay+'/tax-slabs','POST',body));fixture.slabs.push({id:slabId,year,body});save();await ok(pay+'/tax-slabs/'+slabId+'/details','PUT',bands);
  }
  fixture.cases=[{name:'main',wanted:january},...boundaryCases];save();
  for(const sample of fixture.cases){
    sample.employeeId=id(await ok('/hr/employees','POST',{employeeNo:fixture.marker+'-'+sample.name,name:fixture.marker+'-'+sample.name,gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01'}));save();
    await ok('/hr/compensation/employee-compensations','POST',{employeeId:sample.employeeId,structureId:fixture.structureId,componentValues:{[fixture.componentId]:sample.wanted.gross},totalSalary:sample.wanted.gross,effectiveDate:'2026-01-01',status:'ACTIVE'});
    sample.profileId=id(await ok('/hr/compensation/tax-profiles','POST',{employeeId:sample.employeeId,taxSlabId:fixture.slabs[0].id,taxResidenceCity:'政策验收样本',status:'ACTIVE',...(sample.name==='main'?{taxConfig:{verificationMarker:fixture.marker}}:{})}));save();
  }
  const main=fixture.cases[0],firstSlab=fixture.slabs[0],nextSlab=fixture.slabs[1];
  check('new_profile_allowances_encrypted',database('SELECT COUNT(*) FROM hr_tax_profile WHERE id IN ('+fixture.cases.map(sample=>sample.profileId).join(',')+") AND threshold NOT REGEXP '^[0-9]+([.][0-9]+)?$'")===String(fixture.cases.length));
  const draft=await runtime.api('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:main.employeeId,periodId:fixture.periods['2026-01']}));
  check('complete_but_draft_table_rejected',draft.status===400&&draft.body?.code==='TAX_TABLE_PENDING');
  const slabDigest=()=>hash(database('SELECT * FROM hr_tax_slab WHERE slab_id='+firstSlab.id)+database('SELECT * FROM hr_tax_slab_detail WHERE slab_id='+firstSlab.id+' ORDER BY slab_detail_id'));
  const beforeDenial=slabDigest();
  for(const actor of['hr','employee']){const response=await runtime.api(actor,pay+'/tax-slabs/'+firstSlab.id,{method:'PUT',body:{...firstSlab.body,status:'ACTIVE'}});check(actor+'_activation_rejected',response.status===403);check(actor+'_rejection_keeps_tax_table',slabDigest()===beforeDenial);}
  await ok(pay+'/tax-slabs/'+firstSlab.id,'PUT',{...firstSlab.body,status:'ACTIVE'});
  check('administrator_activated_table',database('SELECT status FROM hr_tax_slab WHERE slab_id='+firstSlab.id)==='ACTIVE');
  const origin=new URL(sessions.admin.page.url()).origin;
  runtime.sensitive.add(financeAccount.password);
  const context=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const financePage=await context.newPage();await financePage.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateFormTest(financePage,financeAccount,origin);check('real_finance_login',identity.authenticated&&identity.tenantId==='100000'&&identity.userId===expectedFinanceId);
  const financeUserId=id(identity.userId);
  check('finance_role_without_administrator',database("SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE ur.tenant_id=100000 AND ur.user_id="+financeUserId+" AND r.role_key='finance' AND r.deleted=0 AND r.status='0'")==='1'&&database("SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE ur.tenant_id=100000 AND ur.user_id="+financeUserId+" AND r.role_key='admin'")==='0');
  const financeToken=await financePage.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(financeToken);runtime.sensitive.add(financeToken.replace(/^Bearer /,''));sessions.finance={context,page:financePage,identity};
  await runtime.ok('finance',pay+'/tax-slabs/'+nextSlab.id,'PUT',{...nextSlab.body,status:'ACTIVE'});
  check('finance_activated_table',database('SELECT status FROM hr_tax_slab WHERE slab_id='+nextSlab.id)==='ACTIVE');evidence.activation=true;
  function verify(slip,wanted,label){
    for(const[field,value]of Object.entries({grossTotal:wanted.gross,currentTax:wanted.tax,taxAmount:wanted.tax,netTotal:wanted.net,deductionTotal:wanted.tax,benefitAmount:'0.00',cumulativeTaxableIncome:wanted.taxable,cumulativeDeduction:wanted.deduction,cumulativeTaxPayable:wanted.payable,cumulativeTaxPaid:wanted.paid}))finding(label+'_'+field,cents(slip[field])===cents(value),{expected:value,actual:String(slip[field])});
    const snapshots=slip.components.filter(row=>row.type==='TAX_SNAPSHOT');check(label+'_one_snapshot',snapshots.length===1);const snapshot=snapshots[0];
    finding(label+'_monthly_allowance',cents(snapshot.thresholdApplied)===threshold);
    finding(label+'_current_raw',cents(snapshot.currentTaxableIncome)===cents(wanted.raw));
    finding(label+'_cumulative_raw',cents(snapshot.cumulativeRawIncome)===cents(wanted.cumulativeRaw));
    finding(label+'_chosen_band',Number(snapshot.taxRate)===Number(rates[wanted.band])/10000&&cents(snapshot.quickDeduction)===quick[wanted.band]);
    finding(label+'_all_seven_official_bands',snapshot.brackets.length===7&&snapshot.brackets.every((band,index)=>cents(band.from)===cents(bands[index].fromAmount)&&(limits[index]===null?band.to===null:cents(band.to)===limits[index])&&Number(band.rate)===Number(rates[index])/10000&&cents(band.quickDeduction)===quick[index]));
  }
  const rowDigest=slipId=>hash(database('SELECT * FROM hr_salary_slip WHERE id='+id(slipId)));
  for(const[month,wanted]of[['2026-01',january],['2026-02',february],['2026-03',march],['2026-04',april],['2027-01',january]]){
    if(month==='2026-04'||month==='2027-01')await ok('/hr/compensation/employee-compensations','POST',{employeeId:main.employeeId,structureId:fixture.structureId,componentValues:{[fixture.componentId]:wanted.gross},totalSalary:wanted.gross,effectiveDate:month+'-01',status:'ACTIVE'});
    if(month==='2027-01'){
      await ok('/hr/compensation/tax-profiles/'+main.profileId,'PUT',{employeeId:main.employeeId,taxSlabId:nextSlab.id,taxResidenceCity:'政策验收样本',status:'ACTIVE'});
      const profiles=await ok('/hr/compensation/tax-profiles?'+new URLSearchParams({employeeId:main.employeeId}));
      const profile=profiles.find(row=>String(row.id)===main.profileId);
      check('changed_table_preserves_unsubmitted_profile_fields',profile&&String(profile.taxSlabId)===nextSlab.id&&cents(profile.threshold)===threshold&&profile.taxConfig?.verificationMarker===fixture.marker);
    }
    const samples=month==='2026-01'?fixture.cases:[{...main,wanted}];
    for(const sample of samples){const preview=await ok(pay+'/slips/preview?'+new URLSearchParams({employeeId:sample.employeeId,periodId:fixture.periods[month]}));verify(preview,sample.wanted,month+'_'+sample.name+'_preview');}
    const batchId=id(await ok(pay+'/batches','POST',{payrollPeriodId:fixture.periods[month],employeeIds:samples.map(sample=>sample.employeeId),validateAttendanceFlag:0,deductUnverifiedFlag:0}));fixture.batches.push({id:batchId,month});save();
    const task={batchId,executeNo:await ok(pay+'/batches/'+batchId+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check(month+'_original_task_success',task.terminal==='SUCCESS'&&task.affectedRows===samples.length);
    const batch=await ok(pay+'/batches/'+batchId);check(month+'_batch_calculated',batch.batch.status==='CALCULATED'&&batch.employees.length===samples.length);
    for(const sample of samples){
      const detail=batch.employees.find(row=>String(row.employeeId)===sample.employeeId);check(month+'_'+sample.name+'_success',detail?.calcStatus==='SUCCESS');const slipId=id(detail.salarySlipId);
      const slip=await ok(pay+'/slips/'+slipId);verify(slip,sample.wanted,month+'_'+sample.name+'_actual');write(month+'-'+sample.name+'-slip.json',slip);
      const stored=JSON.parse(database("SELECT JSON_OBJECT('grossTotal',CAST(gross_total AS CHAR),'taxAmount',CAST(tax_amount AS CHAR),'netTotal',CAST(net_total AS CHAR),'currentTax',CAST(current_tax AS CHAR),'deductionTotal',CAST(deduction_total AS CHAR),'benefitAmount',CAST(benefit_amount AS CHAR),'cumulativeTaxableIncome',CAST(cumulative_taxable_income AS CHAR),'cumulativeDeduction',CAST(cumulative_deduction AS CHAR),'cumulativeTaxPayable',CAST(cumulative_tax_payable AS CHAR),'cumulativeTaxPaid',CAST(cumulative_tax_paid AS CHAR),'components',components) FROM hr_salary_slip WHERE id="+slipId));
      verify(stored,sample.wanted,month+'_'+sample.name+'_stored');fixture.slips.push({id:slipId,month,name:sample.name,wanted:sample.wanted});save();
    }
    await ok(pay+'/batches/'+batchId+'/submit','POST',{});
    for(const entry of fixture.slips.filter(row=>row.month===month)){check(month+'_'+entry.name+'_submitted',database('SELECT status FROM hr_salary_slip WHERE id='+entry.id)==='SUBMITTED');entry.digest=rowDigest(entry.id);}save();
    for(const entry of fixture.slips)check(month+'_old_submitted_kept_'+entry.id,rowDigest(entry.id)===entry.digest);
    console.log('D3_OFFICIAL_PHASE: month='+month+'; employees='+samples.length+'; main_tax='+wanted.tax);
  }
  evidence.cumulative=true;evidence.zeroIncome=true;evidence.yearReset=true;evidence.boundaries=true;evidence.rounding=true;evidence.threshold=true;evidence.snapshots=true;
  const page=await sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('official-tax'));
  for(const[month,width]of[['2026-03',1440],['2026-04',390],['2027-01',1440]]){
    const entry=fixture.slips.find(row=>row.month===month&&row.name==='main');await page.setViewportSize({width,height:1000});await page.goto(origin+'/hr/payroll?id='+entry.id,{waitUntil:'networkidle'});const dialog=page.getByRole('dialog');await dialog.waitFor();const text=(await dialog.innerText()).replaceAll(',','');
    for(const field of['gross','tax','net'])finding(month+'_browser_'+field,text.includes(entry.wanted[field]));await page.screenshot({path:path.join(output,month+'-main-page.png')});await page.keyboard.press('Escape');
  }
  await page.close();evidence.browser=true;
}catch(error){failure=error;}
finally{
  if(runtime){
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batch of fixture.batches){const detail=await runtime.ok('admin',pay+'/batches/'+batch.id);assert.notEqual(detail.batch.status,'CALCULATING');if(!['SUBMITTED','CANCELLED'].includes(detail.batch.status))await runtime.ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});}});
    await restore('taxTables',async()=>{for(const slab of fixture.slabs)await runtime.ok('admin',pay+'/tax-slabs/'+slab.id,'PUT',{...slab.body,status:'INACTIVE'});});
    await restore('originalBusiness',async()=>{if(originalBusiness){const after=preserved();for(const[table,digest]of Object.entries(originalBusiness))runtime.check('original_'+table+'_kept',after[table]===digest);runtime.check('original_roles_kept',roleHash()===originalRoles);runtime.check('original_period_business_kept',JSON.stringify(periodDigest())===JSON.stringify(originalPeriods));evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{runtime.check('no_browser_errors',runtime.browserErrors.length===0);console.log('D3_OFFICIAL_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const message=failure?String(failure.message).split('\n')[0].slice(0,200):undefined;
  const safe=message&&[...(runtime?.sensitive||[])].some(value=>value&&message.includes(value))?'Official tax verification failed':message;
  const passed=!failure&&fixture.findings.length>0&&fixture.findings.every(row=>row.passed)&&Object.values(evidence).every(Boolean);
  const result={passed,...evidence,checks:runtime?.checks||[],findings:fixture.findings,requests:runtime?.requests.length||0,tasks:fixture.tasks.length,cases:fixture.cases.length,slips:fixture.slips.length,reusedPeriods:fixture.reusedPeriods,officialTaxPolicyVerified:passed,officialPolicyYear:2026,nextYearScope:'Same approved numerical rules in a dedicated cross-year test, not 2027 policy certification',all18Complete:false,globalComplete:false,failure:safe};
  write('result.json',result);write('requests.json',runtime?.requests||[]);
  console.log('D3_OFFICIAL_RESULT: '+JSON.stringify({...evidence,passed,checks:result.checks.length,findings:result.findings.length,requests:result.requests,tasks:result.tasks,cases:result.cases,slips:result.slips,failure:safe}));if(!passed)process.exitCode=1;
}
