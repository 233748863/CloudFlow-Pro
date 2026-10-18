import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';

const root='D:/CloudFlowPro',pay='/hr/compensation/payroll',ded='/hr/compensation/tax-deductions',ess='/hr/ess/tax-deductions';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-deduction-statuses'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-deduction-statuses-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;};
const cents=value=>{const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));assert.ok(match,'Expected exact money');return BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));};
const money=value=>String(value/100n)+'.'+String(value%100n).padStart(2,'0');
const fixture={marker:'D3S-'+randomUUID().replaceAll('-','').slice(0,12),deductions:[],batches:[],tasks:[],restorations:{},snapshots:[]};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={proofs:false,employeeForm:false,sharedUploads:false,statuses:false,switches:false,exclusions:false,reapproval:false,snapshots:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_employee_comp','id'],['hr_comp_component','id'],['hr_comp_structure','id'],['hr_comp_change','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],['hr_tax_deduction','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['sys_file','file_id']];
let runtime,failure,preserved,roles,originalDigests,originalRoles,ok,api,taxBody,employeeBody,observe;
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {sessions,database,check}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{
    const digest=createHash('sha256');let cursor='0';
    for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}
    return [table,digest.digest('hex')];
  }));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;save();
  const writeClock=new Map();
  const configuredInterval=Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'"));
  const writeInterval=Math.max(5000,configuredInterval)+150;
  assert.ok(Number.isSafeInteger(writeInterval)&&writeInterval<=60150,'Unexpected repeat-submit interval');
  fixture.repeatIntervalMillis=writeInterval;save();
  api=async(actor,url,method='GET',body)=>{
    const key=actor+' '+method+' '+url.split('?')[0];
    if(method!=='GET'){const remaining=writeInterval-(Date.now()-(writeClock.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{
      if(!url.startsWith(ess))return await runtime.api(actor,url,{method,body});
      assert.ok(new RegExp('^'+ess+'(?:/[1-9][0-9]*(?:/proof)?)?(?:\\?|$)').test(url),'Selected ESS path only');
      const result=await sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
        const headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));
        if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        if(supplied.body!==undefined)headers['Content-Type']='application/json';
        const response=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers,...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
        return {status:response.status,traceId:response.headers.get('X-Trace-Id'),body:await response.json()};
      },{url,method,body});
      runtime.requests.push({actor,path:url,method,status:result.status,code:result.body?.code,traceId:result.traceId});return result;
    }finally{if(method!=='GET')writeClock.set(key,Date.now());}
  };
  ok=async(actor,url,method='GET',body)=>runtime.success(await api(actor,url,method,body),method+'_'+url.split('?')[0]);
  const denied=async(actor,url,method,body,code)=>{const result=await api(actor,url,method,body);check('denied_'+code,result.status>=400&&result.body?.code===code);};
  observe=async task=>{if(task.terminal)return;for(let attempt=0;;attempt++){const result=await ok('admin',pay+'/tasks/'+encodeURIComponent(task.executeNo));if(['SUCCESS','FAILED','TIMEOUT'].includes(result.executeStatus)){task.terminal=result.executeStatus;task.affectedRows=Number(result.affectedRows);save();return;}if(attempt>0&&attempt%30===0)console.log('D3_DEDUCTION_PHASE: observing original task');await new Promise(resolve=>setTimeout(resolve,1000));}};
  const periods=await ok('admin',pay+'/config/periods');
  const year=Array.from({length:58},(_,index)=>2042+index).find(year=>!periods.some(period=>period.startDate<=year+'-01-31'&&period.endDate>=year+'-01-01'));
  check('unused_owned_month',year!==undefined);fixture.month=year+'-01';
  fixture.periodId=id(await ok('admin',pay+'/periods','POST',{periodName:fixture.marker,startDate:fixture.month+'-01',endDate:fixture.month+'-31',payDate:fixture.month+'-31',frequency:'MONTHLY'}));save();
  check('reuse_owned_calendar_department',database("SELECT COUNT(*) FROM sys_dept WHERE dept_id=990000164 AND tenant_id=100000 AND dept_name='D3D-b38126e08b99' AND deleted=0")==='1');
  fixture.structureId=id(await ok('admin','/hr/compensation/structures','POST',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{}}));save();
  await ok('admin',pay+'/structures/'+fixture.structureId,'PUT',{salaryBasis:'MONTHLY',prorationBasis:'CALENDAR_DAYS',benefitTiming:'FIRST_PAYROLL'});
  fixture.componentId=id(await ok('admin','/hr/compensation/components','POST',{componentCode:fixture.marker,componentName:fixture.marker+'-固定工资',componentType:'FIXED',category:'EARNING',taxable:1,status:1,sortOrder:999}));save();
  taxBody={slabName:fixture.marker+'-合成10%',region:'隔离测试',effectiveFrom:fixture.month+'-01',effectiveTo:fixture.month+'-31',thresholdAmount:'0.00',status:'DRAFT',remark:'仅验证专项扣除审核状态，不代表正式政策'};
  fixture.slabId=id(await ok('admin',pay+'/tax-slabs','POST',taxBody));save();
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId+'/details','PUT',Array.from({length:7},(_,index)=>({levelNo:index+1,fromAmount:String(index*10000),toAmount:index===6?null:String((index+1)*10000),taxRate:'0.1000',quickDeduction:'0.00'})));
  await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'ACTIVE'});
  const account=id(sessions.employee.identity.userId);
  check('employee_account_originally_unbound',database('SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id='+account+' AND deleted=0')==='0');
  employeeBody={employeeNo:fixture.marker,name:fixture.marker,gender:'UNKNOWN',deptId:'990000164',employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:fixture.month+'-01'};
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{...employeeBody,userId:account}));save();
  fixture.compensationId=id(await ok('admin','/hr/compensation/employee-compensations','POST',{employeeId:fixture.employeeId,structureId:fixture.structureId,componentValues:{[fixture.componentId]:'10000.01'},totalSalary:'10000.01',effectiveDate:fixture.month+'-01',status:'ACTIVE'}));save();
  await ok('admin','/hr/compensation/tax-profiles','POST',{employeeId:fixture.employeeId,taxSlabId:fixture.slabId,taxResidenceCity:'隔离测试',status:'ACTIVE'});
  const proofText=fixture.marker+' synthetic tax deduction evidence only';
  const origin=new URL(sessions.admin.page.url()).origin;
  const ownPage=await sessions.employee.context.newPage();ownPage.setDefaultTimeout(30000);ownPage.on('pageerror',()=>runtime.browserErrors.push('deduction-employee'));
  await ownPage.goto(origin+'/hr/ess/tax-deductions',{waitUntil:'networkidle'});
  await ownPage.getByRole('button',{name:'新增专项扣除申报',exact:true}).click();
  const declaration=ownPage.getByRole('dialog');
  await declaration.locator('select').selectOption('CHILD_EDUCATION');
  await declaration.locator('input[type="number"]').fill('200.02');
  await declaration.locator('input[type="date"]').nth(0).fill(fixture.month+'-01');
  await declaration.locator('input[type="date"]').nth(1).fill(fixture.month+'-31');
  await declaration.locator('textarea').fill(fixture.marker+'-submitted');
  const [uploadResponse]=await Promise.all([
    ownPage.waitForResponse(response=>new URL(response.url()).pathname==='/api'+ess+'/proof'&&response.request().method()==='POST'),
    declaration.locator('input[type="file"]').setInputFiles({name:'d3-deduction-proof.txt',mimeType:'text/plain',buffer:Buffer.from(proofText)}),
  ]);
  const uploaded={status:uploadResponse.status(),traceId:uploadResponse.headers()['x-trace-id'],body:await uploadResponse.json()};
  fixture.uploadContentType=uploadResponse.request().headers()['content-type'];save();
  check('actual_upload_multipart_boundary',/^multipart\/form-data;\s*boundary=/.test(fixture.uploadContentType));
  runtime.requests.push({actor:'employee',path:ess+'/proof',method:'POST',status:uploaded.status,code:uploaded.body?.code,traceId:uploaded.traceId,via:'actual-page'});
  writeClock.set('employee POST '+ess+'/proof',Date.now());
  fixture.proof=runtime.success(uploaded,'actual_employee_proof_upload');check('scoped_private_proof',/^hr-file:HR_TAX_PROOF:[1-9]\d*$/.test(fixture.proof.reference));save();
  await declaration.getByText('d3-deduction-proof.txt',{exact:true}).waitFor();
  const [declarationResponse]=await Promise.all([
    ownPage.waitForResponse(response=>new URL(response.url()).pathname==='/api'+ess&&response.request().method()==='POST'),
    declaration.getByRole('button',{name:'保存',exact:true}).click(),
  ]);
  const declarationResult={status:declarationResponse.status(),traceId:declarationResponse.headers()['x-trace-id'],body:await declarationResponse.json()};
  runtime.requests.push({actor:'employee',path:ess,method:'POST',status:declarationResult.status,code:declarationResult.body?.code,traceId:declarationResult.traceId,via:'actual-page'});
  writeClock.set('employee POST '+ess,Date.now());
  fixture.uiDeductionId=id(runtime.success(declarationResult,'actual_employee_form_save'));save();
  await declaration.waitFor({state:'hidden'});
  const savedRow=ownPage.getByRole('row').filter({has:ownPage.getByRole('cell',{name:'200.02',exact:true})});
  await savedRow.getByRole('cell',{name:'子女教育',exact:true}).waitFor();
  check('actual_employee_form_status',await savedRow.getByRole('cell',{name:'已举证待审核',exact:true}).count()===1);
  const savedDeclaration=(await ok('employee',ess)).find(row=>String(row.id)===fixture.uiDeductionId);
  check('actual_employee_form_fields',savedDeclaration?.deductionType==='CHILD_EDUCATION'&&cents(savedDeclaration.amount)===20002n&&savedDeclaration.startDate===fixture.month+'-01'&&savedDeclaration.endDate===fixture.month+'-31'&&savedDeclaration.proofFileUrl===fixture.proof.reference&&savedDeclaration.remark===fixture.marker+'-submitted');
  await ownPage.screenshot({path:path.join(output,'employee-deduction-form-saved.png')});
  evidence.employeeForm=true;
  const specs=[
    {name:'declared',amount:'100.01',status:'DECLARED',proof:false},
    {name:'submitted',amount:'200.02',status:'PROOF_SUBMITTED',proof:true},
    {name:'verified',amount:'300.03',status:'VERIFIED',proof:true},
    {name:'rejected',amount:'400.04',status:'REJECTED',proof:true},
    {name:'expired',amount:'500.05',status:'VERIFIED',proof:true,startDate:(year-1)+'-01-01',endDate:(year-1)+'-12-31',excluded:true},
    {name:'future',amount:'600.06',status:'VERIFIED',proof:true,startDate:year+'-02-01',endDate:year+'-02-28',excluded:true},
    {name:'deleted',amount:'700.07',status:'VERIFIED',proof:true,deleted:true,excluded:true},
    {name:'open-ended',amount:'50.08',status:'VERIFIED',proof:true,endDate:null},
  ];
  for(const spec of specs){
    const entry={...spec,body:{deductionType:'CHILD_EDUCATION',amount:spec.amount,startDate:spec.startDate||fixture.month+'-01',endDate:spec.endDate===undefined?fixture.month+'-31':spec.endDate,remark:fixture.marker+'-'+spec.name,...(spec.proof?{proofFileUrl:fixture.proof.reference}:{})}};
    fixture.deductions.push(entry);save();
    entry.id=spec.name==='submitted'?fixture.uiDeductionId:id(await ok('employee',ess,'POST',entry.body));save();
    const creatorBefore=hash(database('SELECT tenant_id,employee_id,create_by,create_time FROM hr_tax_deduction WHERE id='+entry.id));
    await ok('employee',ess+'/'+entry.id,'PUT',{...entry.body,employeeId:'1',declareStatus:'VERIFIED',verifyBy:account,verifyTime:'2040-01-01 00:00:00',rejectReason:'forged',createBy:'forged-creator',tenantId:'100001'});
    check(spec.name+'_creator_tenant_preserved',hash(database('SELECT tenant_id,employee_id,create_by,create_time FROM hr_tax_deduction WHERE id='+entry.id))===creatorBefore);
    const initial=(await ok('employee',ess)).find(row=>String(row.id)===entry.id);
    check(spec.name+'_forced_owner',String(initial.employeeId)===fixture.employeeId);
    check(spec.name+'_forged_review_ignored',initial.declareStatus===(spec.proof?'PROOF_SUBMITTED':'DECLARED')&&initial.verifyBy==null&&initial.verifyTime==null&&!initial.rejectReason);
    if(spec.status==='VERIFIED'&&spec.name!=='verified')await ok('admin',ded+'/'+entry.id+'/verify?approved=true','POST',{});
    if(spec.status==='REJECTED'){await denied('admin',ded+'/'+entry.id+'/verify?approved=false','POST',{},'REASON_REQUIRED');await ok('admin',ded+'/'+entry.id+'/verify?'+new URLSearchParams({approved:'false',reason:fixture.marker+'-已核对不符'}),'POST',{});}
    if(spec.deleted)await ok('admin',ded+'/'+entry.id,'DELETE');
  }
  const declared=fixture.deductions.find(row=>row.name==='declared'),submitted=fixture.deductions.find(row=>row.name==='submitted'),verified=fixture.deductions.find(row=>row.name==='verified');
  await denied('admin',ded+'/'+declared.id+'/verify?approved=true','POST',{},'DEDUCTION_PROOF_REQUIRED');
  await denied('admin',ded,'POST',{...submitted.body,employeeId:fixture.employeeId},'FORBIDDEN');
  const beforeDenied=hash(database('SELECT * FROM hr_tax_deduction WHERE employee_id='+fixture.employeeId+' ORDER BY id'));
  for(const url of [ded,'/hr/compensation/employee-compensations']){
    const refused=await api('employee',url,'POST',{employeeId:fixture.employeeId,amount:'1.01',totalSalary:'1.01',deductionType:'CHILD_EDUCATION',startDate:fixture.month+'-01'});
    check('employee_management_write_refused_'+url,refused.status===403);
  }
  const otherDeduction=database('SELECT id FROM hr_tax_deduction WHERE tenant_id=100000 AND employee_id<>'+fixture.employeeId+' AND deleted=0 ORDER BY id LIMIT 1');
  check('existing_other_employee_deduction',Boolean(otherDeduction));
  const refusedOther=await api('employee',ess+'/'+id(otherDeduction),'PUT',declared.body);
  check('other_employee_deduction_write_refused',[400,403].includes(refusedOther.status));
  check('denied_writes_preserve_owned_rows',hash(database('SELECT * FROM hr_tax_deduction WHERE employee_id='+fixture.employeeId+' ORDER BY id'))===beforeDenied);
  const adminPage=await sessions.admin.context.newPage();adminPage.setDefaultTimeout(30000);adminPage.on('pageerror',()=>runtime.browserErrors.push('deduction-admin'));
  await adminPage.goto(origin+'/hr/payroll',{waitUntil:'networkidle'});await adminPage.getByRole('tab',{name:'专项扣除',exact:true}).click();
  const verifiedRow=adminPage.getByRole('row').filter({has:adminPage.getByRole('cell',{name:fixture.employeeId,exact:true})}).filter({has:adminPage.getByRole('cell',{name:verified.amount,exact:true})});
  await verifiedRow.getByRole('button',{name:'审核证明',exact:true}).click();
  const review=adminPage.getByRole('dialog');
  const [reviewResponse]=await Promise.all([
    adminPage.waitForResponse(response=>new URL(response.url()).pathname==='/api'+ded+'/'+verified.id+'/verify'&&response.request().method()==='POST'),
    review.getByRole('button',{name:'保存',exact:true}).click(),
  ]);
  const reviewResult=await reviewResponse.json(),reviewUrl=new URL(reviewResponse.url());
  runtime.requests.push({actor:'admin',path:reviewUrl.pathname.slice('/api'.length)+reviewUrl.search,method:'POST',status:reviewResponse.status(),code:reviewResult.code,traceId:reviewResponse.headers()['x-trace-id'],via:'actual-page'});
  writeClock.set('admin POST '+ded+'/'+verified.id+'/verify',Date.now());
  check('actual_ui_review_response',reviewResponse.status()===200&&reviewResult.code===200);
  await review.waitFor({state:'hidden'});
  check('actual_ui_review_saved',(await ok('employee',ess)).find(row=>String(row.id)===verified.id)?.declareStatus==='VERIFIED');
  fixture.uiReview=true;save();
  await adminPage.screenshot({path:path.join(output,'admin-deduction-review.png')});
  await denied('admin',ded+'/'+verified.id+'/verify?approved=true','POST',{},'DEDUCTION_PROOF_REQUIRED');
  const current=await ok('employee',ess);
  for(const entry of fixture.deductions){
    const row=current.find(item=>String(item.id)===entry.id);
    check(entry.name+'_actual_status',entry.deleted?!row:row?.declareStatus===entry.status);
    if(!entry.deleted){check(entry.name+'_amount_encrypted',database('SELECT COUNT(*) FROM hr_tax_deduction WHERE id='+entry.id+" AND amount NOT REGEXP '^[0-9]+([.][0-9]+)?$'")==='1');check(entry.name+'_amount_returned',cents(row.amount)===cents(entry.amount));}
  }
  evidence.statuses=true;
  for(const [actor,url]of [['employee',ess+'/'+verified.id+'/proof'],['admin',pay+'/deductions/'+verified.id+'/proof']]){
    const response=await sessions[actor].page.evaluate(async requestPath=>{
      const token=(await import('/src/utils/authStorage.ts')).getAuthToken();const response=await fetch('/api'+requestPath,{credentials:'same-origin',headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token}});
      return {status:response.status,traceId:response.headers.get('X-Trace-Id'),cache:response.headers.get('Cache-Control'),text:await response.text()};
    },url);
    runtime.requests.push({actor,path:url,method:'GET',status:response.status,traceId:response.traceId});
    check(actor+'_actual_proof_content',response.status===200&&hash(response.text)===hash(proofText));check(actor+'_proof_not_cached',response.cache==='no-store');
  }
  evidence.proofs=true;
  await ownPage.goto(origin+'/hr/ess/tax-deductions',{waitUntil:'networkidle'});
  check('all_visible_deduction_types_labeled',await ownPage.getByRole('cell',{name:'子女教育',exact:true}).count()===7);
  for(const label of ['已申报待举证','已举证待审核','审核通过','已驳回'])check('actual_employee_status_'+label,(await ownPage.getByText(label,{exact:true}).count())>0);
  await ownPage.screenshot({path:path.join(output,'employee-deduction-statuses.png')});
  const included=flag=>fixture.deductions.filter(row=>!row.excluded&&row.status!=='REJECTED'&&(flag||row.status==='VERIFIED'));
  const verify=(slip,entries,label)=>{
    const special=entries.reduce((sum,row)=>sum+cents(row.amount),0n),gross=1000001n,taxable=gross-special,tax=(taxable+5n)/10n;
    for(const [field,value]of Object.entries({grossTotal:gross,taxAmount:tax,currentTax:tax,deductionTotal:tax,netTotal:gross-tax,cumulativeTaxableIncome:taxable,cumulativeDeduction:special,cumulativeTaxPayable:tax,cumulativeTaxPaid:0n}))check(label+'_'+field,cents(slip[field])===value);
    const snapshots=slip.components.filter(row=>row.type==='TAX_SNAPSHOT');check(label+'_single_snapshot',snapshots.length===1);const snap=snapshots[0];
    check(label+'_exact_deduction_ids',JSON.stringify(Object.keys(snap.specialDeductions).sort())===JSON.stringify(entries.map(row=>row.id).sort()));
    for(const row of entries)check(label+'_deduction_'+row.name,cents(snap.specialDeductions[row.id])===cents(row.amount));
    fixture.snapshots.push({label,special:money(special),tax:money(tax),ids:Object.keys(snap.specialDeductions)});save();
  };
  const deductionDigest=()=>hash(database('SELECT * FROM hr_tax_deduction WHERE employee_id='+fixture.employeeId+' ORDER BY id'));
  for(const flag of [0,1]){
    const entries=included(flag),before=deductionDigest();
    const preview=await ok('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:fixture.employeeId,periodId:fixture.periodId,deductUnverified:String(flag)}));verify(preview,entries,'flag'+flag+'_preview');
    const batch={flag,id:id(await ok('admin',pay+'/batches','POST',{payrollPeriodId:fixture.periodId,employeeIds:[fixture.employeeId],validateAttendanceFlag:0,deductUnverifiedFlag:flag}))};fixture.batches.push(batch);save();
    const task={batchId:batch.id,executeNo:await ok('admin',pay+'/batches/'+batch.id+'/calculate','POST',{})};fixture.tasks.push(task);save();await observe(task);check('flag'+flag+'_task_success',task.terminal==='SUCCESS');
    const detail=await ok('admin',pay+'/batches/'+batch.id);check('flag'+flag+'_calculated',detail.batch.status==='CALCULATED'&&detail.employees[0].calcStatus==='SUCCESS');
    batch.slipId=id(detail.employees[0].salarySlipId);save();
    const slip=await ok('admin',pay+'/slips/'+batch.slipId);verify(slip,entries,'flag'+flag+'_actual');fs.writeFileSync(path.join(output,'flag'+flag+'-slip.json'),JSON.stringify(slip,null,2),{flag:'wx'});
    check('flag'+flag+'_deduction_rows_preserved',deductionDigest()===before);
    if(flag===0){
      const snapshotHash=hash(database('SELECT * FROM hr_salary_slip WHERE id='+batch.slipId));
      await ok('employee',ess+'/'+verified.id,'PUT',{...verified.body,amount:'310.04',declareStatus:'VERIFIED',verifyBy:account});
      let changed=(await ok('employee',ess)).find(row=>String(row.id)===verified.id);check('edited_verified_requires_new_review',changed.declareStatus==='PROOF_SUBMITTED'&&changed.verifyBy==null&&changed.verifyTime==null);
      const changedPreview=await ok('admin',pay+'/slips/preview?'+new URLSearchParams({employeeId:fixture.employeeId,periodId:fixture.periodId,deductUnverified:'false'}));
      verify(changedPreview,entries.filter(row=>row.id!==verified.id),'edited_verified_excluded');
      check('existing_salary_snapshot_not_rewritten',hash(database('SELECT * FROM hr_salary_slip WHERE id='+batch.slipId))===snapshotHash);
      await ok('employee',ess+'/'+verified.id,'PUT',verified.body);await ok('admin',ded+'/'+verified.id+'/verify?approved=true','POST',{});
      changed=(await ok('employee',ess)).find(row=>String(row.id)===verified.id);check('restored_amount_reapproved',changed.declareStatus==='VERIFIED'&&cents(changed.amount)===cents(verified.amount));
      check('existing_salary_after_reapproval_unchanged',hash(database('SELECT * FROM hr_salary_slip WHERE id='+batch.slipId))===snapshotHash);
      evidence.reapproval=true;evidence.snapshots=true;
    }
    await adminPage.goto(origin+'/hr/payroll?id='+batch.slipId,{waitUntil:'networkidle'});const dialog=adminPage.getByRole('dialog');await dialog.waitFor();
    check('flag'+flag+'_actual_salary_page',(await dialog.innerText()).includes(String(slip.netTotal)));await adminPage.screenshot({path:path.join(output,'flag'+flag+'-salary-page.png')});
    await ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});check('flag'+flag+'_cancelled',(await ok('admin',pay+'/batches/'+batch.id)).batch.status==='CANCELLED');
    console.log('D3_DEDUCTION_PHASE: flag='+flag+' completed');
  }
  evidence.switches=true;evidence.exclusions=true;evidence.browser=true;
  fixture.sharedUploads=[];save();
  for(const sample of [
    {name:'leave',route:'/hr/ess/leave-balance',button:'申请请假',upload:'/hr/ess/leave/files',purpose:'HR_LEAVE_PROOF'},
    {name:'grievance',route:'/hr/ess/grievances',button:'提交申诉',upload:'/hr/ess/grievances/files',purpose:'HR_GRIEVANCE'},
  ]){
    await ownPage.goto(origin+sample.route,{waitUntil:'networkidle'});
    await ownPage.getByRole('button',{name:sample.button,exact:true}).click();
    const uploadDialog=ownPage.getByRole('dialog'),fileName=fixture.marker+'-'+sample.name+'.txt';
    const [response]=await Promise.all([
      ownPage.waitForResponse(response=>new URL(response.url()).pathname==='/api'+sample.upload&&response.request().method()==='POST'),
      uploadDialog.locator('input[type="file"]').setInputFiles({name:fileName,mimeType:'text/plain',buffer:Buffer.from(proofText)}),
    ]);
    const result={status:response.status(),body:await response.json(),traceId:response.headers()['x-trace-id']};
    runtime.requests.push({actor:'employee',path:sample.upload,method:'POST',status:result.status,code:result.body?.code,traceId:result.traceId,via:'actual-page'});
    writeClock.set('employee POST '+sample.upload,Date.now());
    const file=runtime.success(result,'actual_'+sample.name+'_page_upload');
    check(sample.name+'_multipart_boundary',/^multipart\/form-data;\s*boundary=/.test(response.request().headers()['content-type']||''));
    check(sample.name+'_private_file',database('SELECT COUNT(*) FROM sys_file WHERE file_id='+id(file.fileId)+" AND tenant_id=100000 AND file_type='"+sample.purpose+"' AND COALESCE(url,'')=''")==='1');
    await uploadDialog.getByText(fileName,{exact:true}).waitFor();
    fixture.sharedUploads.push({name:sample.name,fileId:id(file.fileId),purpose:sample.purpose});save();
    await ownPage.screenshot({path:path.join(output,sample.name+'-attachment-uploaded.png')});
    await uploadDialog.getByRole('button',{name:'取消',exact:true}).click();
    await uploadDialog.waitFor({state:'hidden'});
  }
  evidence.sharedUploads=true;await ownPage.close();await adminPage.close();
}catch(error){failure=error;}
finally{
  if(runtime){
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('batches',async()=>{for(const task of fixture.tasks)await observe(task);for(const batch of fixture.batches){const detail=await ok('admin',pay+'/batches/'+batch.id);assert.notEqual(detail.batch.status,'CALCULATING');if(['DRAFT','CALCULATED','FAILED'].includes(detail.batch.status))await ok('admin',pay+'/batches/'+batch.id+'/cancel','POST',{});runtime.check('owned_batch_cancelled_'+batch.id,(await ok('admin',pay+'/batches/'+batch.id)).batch.status==='CANCELLED');}});
    await restore('employeeBinding',async()=>{if(fixture.employeeId){await ok('admin','/hr/employees/'+fixture.employeeId,'PUT',{...employeeBody,userId:null});runtime.check('owned_employee_unbound',runtime.database('SELECT COUNT(*) FROM hr_employee WHERE id='+fixture.employeeId+' AND user_id IS NULL')==='1');}});
    await restore('syntheticTax',async()=>{if(fixture.slabId)await ok('admin',pay+'/tax-slabs/'+fixture.slabId,'PUT',{...taxBody,status:'INACTIVE'});});
    await restore('originalBusiness',async()=>{if(originalDigests){const after=preserved();for(const [table,digest]of Object.entries(originalDigests))runtime.check('original_'+table+'_preserved',after[table]===digest);runtime.check('original_roles_preserved',roles()===originalRoles);evidence.preservation=true;}});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{runtime.check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_DEDUCTION_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  save();const message=failure?String(failure.message).split('\n')[0].slice(0,180):undefined;
  const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,tasks:fixture.tasks.length,deductions:fixture.deductions.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  console.log('D3_DEDUCTION_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
