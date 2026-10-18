import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll',benefit='/hr/ess/benefit-payments';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-income-benefits'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-income-benefits-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  if(typeof value!=='number'&&typeof value!=='string')return value;
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(value));if(!match)return value;
  let coefficient=BigInt(match[1]+match[2]+(match[3]||'')),scale=(match[3]||'').length-Number(match[4]||0);
  assert.ok(Number.isSafeInteger(scale)&&Math.abs(scale)<=1000,'Bounded decimal snapshot required');
  if(scale<0){coefficient*=10n**BigInt(-scale);scale=0;}
  while(scale>0&&coefficient%10n===0n){coefficient/=10n;scale--;}
  return coefficient.toString()+'@'+scale;
};
// Read numeric JSON tokens as their original text, including values beyond JavaScript's exact integer range.
const parseSnapshot=text=>JSON.parse(text,(_key,value,context)=>{if(typeof value!=='number')return value;assert.equal(typeof context?.source,'string');return context.source;});
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const cents=value=>{const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Exact nonnegative money required');return BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));};
const money=value=>String(value/100n)+'.'+String(value%100n).padStart(2,'0');
const percent=(value,rate)=>(cents(value)*BigInt(rate)+50n)/100n;
const fixture={marker:'D3I-'+randomUUID().replaceAll('-','').slice(0,12),cases:[],schemes:[],components:[],batches:[],tasks:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={mixedSources:false,sourceFilters:false,benefitGeneration:false,snapshots:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['hr_benefit_scheme','id'],['hr_employee_benefit','id'],['hr_benefit_payment','id']];
let runtime,failure,preserved,roles,originalDigests,originalRoles,ok,api,observe,taxBody;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,check,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;save();
  const clock=new Map(),interval=Math.max(5000,Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
  assert.ok(Number.isSafeInteger(interval)&&interval<=60150);fixture.repeatIntervalMillis=interval;
  api=async(actor,url,method='GET',body)=>{
    const key=actor+' '+method+' '+url.split('?')[0];
    if(method!=='GET'){const remaining=interval-(Date.now()-(clock.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{
      if(!url.startsWith(benefit))return await runtime.api(actor,url,{method,body});
      assert.ok(new RegExp('^'+benefit+'(?:/generate)?(?:\\?|$)').test(url));
      const response=await sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        const result=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers});return{status:result.status,traceId:result.headers.get('X-Trace-Id'),body:await result.json()};
      },{url,method});
      runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
    }finally{if(method!=='GET')clock.set(key,Date.now());}
  };
  ok=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,method,body),method+'_'+url.split('?')[0]);
  observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const result=await ok('admin',pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(result.executeStatus)){task.terminal=result.executeStatus;save();return;}if(attempt>0&&attempt%30===0)console.log('D3_INCOME_PHASE: observing original task');await new Promise(resolve=>setTimeout(resolve,1000));}};
  const periods=await ok('admin',pay+'/config/periods');
  const year=Array.from({length:58},(_,index)=>2042+index).find(year=>!periods.some(period=>period.startDate<=year+'-01-31'&&period.endDate>=year+'-01-01'));
  check('unused_owned_month',year!==undefined);fixture.month=year+'-01';
  check('owned_calendar_department',database("SELECT COUNT(*) FROM sys_dept WHERE dept_id=990000164 AND tenant_id=100000 AND dept_name='D3D-b38126e08b99' AND deleted=0")==='1');
  fixture.periodId=id(await ok('admin',pay+'/periods','POST',{periodName:fixture.marker,startDate:fixture.month+'-01',endDate:fixture.month+'-31',payDate:fixture.month+'-31',frequency:'MONTHLY'}));save();
  fixture.structureId=id(await ok('admin','/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok('admin',pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  for(const name of ['基本工资','固定津贴']){const code=fixture.marker+'-'+fixture.components.length;fixture.components.push({id:id(await ok('admin','/hr/compensation/components','POST',{componentCode:code,componentName:fixture.marker+'-'+name,componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999})),code});save();}
  taxBody={slabName:fixture.marker+'-合成10%',region:'隔离测试',effectiveFrom:fixture.month+'-01',effectiveTo:fixture.month+'-31',thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证收入与社保来源组合，不代表正式政策'};
  fixture.slabId=id(await ok('admin',pay+'/tax-slabs','POST',taxBody));save();
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  for(const rates of [{personal:10,company:20},{personal:5,company:10}]){const scheme={...rates,id:id(await ok('admin','/hr/compensation/benefits','POST',{schemeCode:fixture.marker+'-'+fixture.schemes.length,schemeName:fixture.marker+'-隔离福利'+fixture.schemes.length,city:'隔离测试',effectiveDate:fixture.month+'-01',status:1,benefitConfig:{personalRate:String(rates.personal/100),companyRate:String(rates.company/100)}}))};fixture.schemes.push(scheme);save();}
  const specs=[
    {name:'penny',fixed:['100.01','0.02'],bonuses:['0.01','0.02'],bases:['0.05','0.10']},
    {name:'regular',fixed:['10000.01','0.02'],bonuses:['200.02','0.03'],bases:['1000.05','100.05']},
    {name:'large',fixed:['90071992547409.93','0.10'],bonuses:['0.01','0.02'],bases:['90071992547409.93','100.05']},
  ];
  for(const sample of specs){
    sample.changes=[];fixture.cases.push(sample);save();
    sample.employeeId=id(await ok('admin','/hr/employees','POST',{employeeNo:fixture.marker+'-'+sample.name,name:fixture.marker+'-'+sample.name,gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:fixture.month+'-01'}));save();
    sample.fixedTotal=money(sample.fixed.reduce((sum,value)=>sum+cents(value),0n));
    sample.compensationId=id(await ok('admin','/hr/compensation/employee-compensations','POST',{employeeId:sample.employeeId,structureId:fixture.structureId,componentValues:{[fixture.components[0].id]:sample.fixed[0],[fixture.components[1].code]:sample.fixed[1]},totalSalary:sample.fixedTotal,effectiveDate:fixture.month+'-01',status:'ACTIVE'}));save();
    await ok('admin','/hr/compensation/tax-profiles','POST',{employeeId:sample.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
    for(let index=0;index<fixture.schemes.length;index++)await ok('admin','/hr/compensation/employee-benefits','POST',{employeeId:sample.employeeId,schemeId:fixture.schemes[index].id,baseAmount:sample.bases[index],effectiveDate:fixture.month+'-01',status:'ACTIVE'});
    const params=new URLSearchParams({employeeId:sample.employeeId,periodMonth:fixture.month});
    check(sample.name+'_benefits_generated',(await ok('admin',benefit+'/generate?'+params,'POST')).created===2);
    const payments=await ok('admin',benefit+'?'+params);
    check(sample.name+'_two_actual_payments',payments.length===2);
    sample.payments=payments.map(row=>({id:id(row.id),schemeId:String(row.schemeId),personal:row.personalAmount,company:row.companyAmount}));save();
    for(let index=0;index<fixture.schemes.length;index++){
      const scheme=fixture.schemes[index],row=payments.find(row=>String(row.schemeId)===scheme.id);check(sample.name+'_benefit_scheme_'+index,Boolean(row));
      check(sample.name+'_personal_rounding_'+index,cents(row.personalAmount)===percent(sample.bases[index],scheme.personal));
      check(sample.name+'_company_rounding_'+index,cents(row.companyAmount)===percent(sample.bases[index],scheme.company));
      check(sample.name+'_base_exact_'+index,cents(row.baseAmount)===cents(sample.bases[index]));
    }
    const paymentDigest=hash(database('SELECT * FROM hr_benefit_payment WHERE employee_id='+sample.employeeId+' ORDER BY id'));
    check(sample.name+'_generate_again_creates_zero',(await ok('admin',benefit+'/generate?'+params,'POST')).created===0);
    check(sample.name+'_generated_rows_unchanged',hash(database('SELECT * FROM hr_benefit_payment WHERE employee_id='+sample.employeeId+' ORDER BY id'))===paymentDigest);
    const changes=sample.bonuses.map((amount,index)=>({amount,date:fixture.month+(index?'-31':'-01'),status:'APPROVED',included:true}));
    if(sample.name==='regular')changes.push(...[
      {amount:'700.07',date:fixture.month+'-15',status:'DRAFT'},
      {amount:'800.08',date:fixture.month+'-15',status:'REJECTED'},
      {amount:'900.09',date:fixture.month+'-15',status:'CANCELLED'},
      {amount:'1000.10',date:(year-1)+'-12-31',status:'APPROVED'},
      {amount:'1100.11',date:year+'-02-01',status:'APPROVED'},
    ]);
    for(const change of changes){const entry={...change,id:id(await ok('admin','/hr/compensation/changes','POST',{employeeId:sample.employeeId,changeNo:fixture.marker+'-'+sample.name+'-'+sample.changes.length,changeType:'BONUS',beforeTotal:sample.fixedTotal,afterTotal:money(cents(sample.fixedTotal)+cents(change.amount)),changeAmount:change.amount,effectiveDate:change.date,status:change.status,reason:fixture.marker+'-隔离验证'}))};sample.changes.push(entry);save();}
    console.log('D3_INCOME_PHASE: prepared '+sample.name);
  }
  evidence.benefitGeneration=true;
  const sourceDigests=()=>Object.fromEntries(fixture.cases.map(sample=>[sample.employeeId,hash(['hr_employee_comp','hr_benefit_payment','hr_comp_change'].map(table=>database('SELECT * FROM '+table+' WHERE employee_id='+sample.employeeId+' ORDER BY id')).join('\n'))]));
  const sourceBefore=sourceDigests();
  const verify=(sample,slip,label)=>{
    const personal=sample.bases.reduce((sum,value,index)=>sum+percent(value,fixture.schemes[index].personal),0n);
    const bonus=sample.bonuses.reduce((sum,value)=>sum+cents(value),0n),gross=cents(sample.fixedTotal)+bonus,taxable=gross-personal,tax=(taxable+5n)/10n;
    for(const[field,value]of Object.entries({grossTotal:gross,benefitAmount:personal,taxAmount:tax,currentTax:tax,deductionTotal:personal+tax,netTotal:gross-personal-tax,cumulativeTaxableIncome:taxable,cumulativeDeduction:personal,cumulativeTaxPayable:tax,cumulativeTaxPaid:0n}))check(label+'_'+field,cents(slip[field])===value);
    const fixed=slip.components.filter(row=>row.sourceType==='EMPLOYEE_COMPENSATION'),variables=slip.components.filter(row=>row.sourceType==='COMPENSATION_CHANGE');
    check(label+'_two_fixed_components',fixed.length===2);
    for(let index=0;index<fixture.components.length;index++){const component=fixture.components[index],row=fixed.find(row=>String(row.salaryComponentId)===component.id);check(label+'_fixed_identity_amount_'+index,row?.salaryComponentIdentity==='VERIFIED'&&cents(row.amount)===cents(sample.fixed[index])&&String(row.employeeCompId)===sample.compensationId);}
    check(label+'_exact_bonus_ids',JSON.stringify(variables.map(row=>String(row.changeId)).sort())===JSON.stringify(sample.changes.filter(row=>row.included).map(row=>row.id).sort()));
    for(const row of variables)check(label+'_bonus_amount_'+row.changeId,cents(row.amount)===cents(sample.changes.find(change=>change.id===String(row.changeId)).amount));
    const benefitSnapshot=slip.components.filter(row=>row.type==='BENEFIT_SNAPSHOT');check(label+'_benefit_month_snapshot',benefitSnapshot.length===1&&Object.keys(benefitSnapshot[0].months).length===1&&cents(benefitSnapshot[0].months[fixture.month])===personal);
    sample.expected={gross:money(gross),benefit:money(personal),tax:money(tax),net:money(gross-personal-tax)};save();
  };
  for(const sample of fixture.cases)verify(sample,await ok('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:sample.employeeId,periodId:fixture.periodId,deductUnverified:'false'})),sample.name+'_preview');
  const batch={id:id(await ok('admin',pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:fixture.cases.map(sample=>sample.employeeId),validateAttendanceFlag:0,deductUnverifiedFlag:0}))};fixture.batches.push(batch);save();
  const task={batchId:batch.id,executeNo:await ok('admin',pay+'/batches/'+batch.id+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check('original_task_success',task.terminal==='SUCCESS');
  const detail=await ok('admin',pay+'/batches/'+batch.id);check('batch_calculated',detail.batch.status==='CALCULATED'&&detail.employees.length===3&&detail.employees.every(row=>row.calcStatus==='SUCCESS'));
  const origin=new URL(sessions.admin.page.url()).origin,page=await sessions.admin.context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>runtime.browserErrors.push('income-benefits-page'));
  for(const sample of fixture.cases){sample.slipId=id(detail.employees.find(row=>String(row.employeeId)===sample.employeeId).salarySlipId);save();const slip=await ok('admin',pay+'/slips/'+sample.slipId);verify(sample,slip,sample.name+'_actual');
    fs.writeFileSync(path.join(output,sample.name+'-slip.json'),JSON.stringify(slip,null,2),{flag:'wx'});
    const stored=parseSnapshot(database('SELECT components FROM hr_salary_slip WHERE id='+sample.slipId));check(sample.name+'_stored_components_exact',hash(JSON.stringify(canonical(stored)))===hash(JSON.stringify(canonical(slip.components))));
    await page.goto(origin+'/hr/payroll?id='+sample.slipId,{waitUntil:'networkidle'});const dialog=page.getByRole('dialog');await dialog.waitFor();const text=await dialog.innerText();check(sample.name+'_actual_page_amounts',text.includes(sample.expected.net)&&text.includes(sample.expected.gross));await page.screenshot({path:path.join(output,sample.name+'-salary-page.png')});
  }
  check('all_source_rows_preserved',JSON.stringify(sourceDigests())===JSON.stringify(sourceBefore));
  evidence.mixedSources=true;evidence.sourceFilters=true;evidence.snapshots=true;evidence.browser=true;await page.close();
}catch(error){failure=error;}
finally{
  if(runtime){
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batch of fixture.batches){const detail=await ok('admin',pay+'/batches/'+batch.id);assert.notEqual(detail.batch.status,'CALCULATING');if(['DRAFT','CALCULATED','FAILED'].includes(detail.batch.status))await ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});runtime.check('owned_batch_cancelled_'+batch.id,(await ok('admin',pay+'/batches/'+batch.id)).batch.status==='CANCELLED');}});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=preserved();for(const[table,digest]of Object.entries(originalDigests))runtime.check('original_'+table+'_preserved',after[table]===digest);runtime.check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{runtime.check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_INCOME_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,tasks:fixture.tasks.length,cases:fixture.cases.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));console.log('D3_INCOME_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
