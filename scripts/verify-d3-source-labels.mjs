import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
const root='D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-source-labels'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-source-labels-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const sourceRounds={funded:process.argv[process.argv.indexOf('--source-funded-round')+1],approved:process.argv[process.argv.indexOf('--source-approved-round')+1]};
assert.ok(process.argv.includes('--source-funded-round')&&process.argv.includes('--source-approved-round'));
for(const round of Object.values(sourceRounds))assert.match(round||'',/^r[1-9][0-9]*$/);
const source=(name,round)=>{
  const folder=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime',name+'-20261006-'+round);
  const result=read(path.join(folder,'result.json')),fixture=read(path.join(folder,'fixture.json')),paid=read(path.join(folder,'paid-salary.json'));
  for(const flag of ['passed','payment','preservation','restoration','secrets'])assert.equal(result[flag],true,'Completed owned income source required');
  assert.equal(paid.status,'PAID');assert.equal(String(paid.tenantId),'100000');assert.equal(String(paid.employeeId),fixture.employeeId);
  assert.ok(fixture.batches.some(batch=>batch.slipId===String(paid.id)),'Paid salary must belong to selected source round');
  return {fixture,id:String(paid.id),employee:fixture.employeeId};
};
const funded=source('d3-funded-encashment',sourceRounds.funded),approved=source('d3-approved-income',sourceRounds.approved);
assert.match(funded.fixture.marker,/^D3F-[a-f0-9]{12}$/);assert.match(approved.fixture.marker,/^D3A-[a-f0-9]{12}$/);
const observations=[],evidence={content:false,browser:false,pdf:false,preservation:false,secrets:false};
let runtime,failure,original;
const samples=[{id:approved.id,employee:approved.employee,amounts:['28294.59','2829.46','25465.13','60.03','1234.56'],labels:['加班费','内推奖金'],codes:['OVERTIME','REFERRAL_BONUS']},{id:funded.id,employee:funded.employee,amounts:['27123.45','2812.36','24311.09','123.45','100.01'],labels:[funded.fixture.marker+'假期折现'],codes:[]}];
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {database,check,sessions,requests}=runtime;
  original=hash(database('SELECT * FROM hr_salary_slip ORDER BY id'));
  for(const file of ['cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrSalarySlipPrintService.java','cloudflow-frontend/src/utils/hrPayrollDisplay.ts','cloudflow-frontend/src/pages/hr/rules/HrPayrollPage.tsx'])fs.copyFileSync(path.join(root,file),path.join(output,'executed-'+path.basename(file)));
  const origin=new URL(sessions.admin.page.url()).origin;
  const lines=fs.readFileSync(path.join(runtime.run,'hr/service.args'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/),classpath=lines[lines.indexOf('-cp')+1]?.replace(/^"|"$/g,'');
  assert.ok(classpath?.includes('pdfbox-2.0.24.jar'));
  for(const sample of samples){
    check('owned_paid_salary_'+sample.id,database('SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND id='+sample.id+' AND employee_id='+sample.employee+" AND status='PAID' AND deleted=0")==='1');
    const ui=await sessions.admin.context.newPage();ui.on('pageerror',()=>runtime.browserErrors.push('salary-label'));
    await ui.goto(origin+'/hr/payroll?id='+sample.id,{waitUntil:'networkidle'});const dialog=ui.getByRole('dialog');await dialog.waitFor();const body=await dialog.innerText();
    for(const amount of sample.amounts)check('page_amount_'+sample.id+'_'+amount,body.includes(amount));
    for(const label of sample.labels)observations.push({surface:'page',salary:sample.id,label,present:body.includes(label)});
    for(const code of sample.codes)observations.push({surface:'page',salary:sample.id,label:'hide '+code,present:!body.includes(code)});
    await ui.screenshot({path:path.join(output,sample.id+'-page.png')});await ui.close();
    const before=Number(database("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='SALARY_SLIP' AND business_id="+sample.id+" AND operation_type='EXPORT_PDF'"));
    const response=await sessions.admin.page.evaluate(async supplied=>{
      const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),response=await fetch('/api/hr/compensation/payroll/slips/'+supplied+'/pdf',{credentials:'same-origin',headers:{Authorization:token.startsWith('Bearer ')?token:'Bearer '+token}});
      return{status:response.status,type:response.headers.get('Content-Type'),traceId:response.headers.get('X-Trace-Id'),bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
    },sample.id);
    requests.push({actor:'admin',path:'/hr/compensation/payroll/slips/'+sample.id+'/pdf',method:'GET',status:response.status,traceId:response.traceId});
    check('actual_pdf_'+sample.id,response.status===200&&response.type.includes('application/pdf'));
    check('pdf_audited_'+sample.id,Number(database("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='SALARY_SLIP' AND business_id="+sample.id+" AND operation_type='EXPORT_PDF'"))===before+1);
    const sampleOutput=path.join(output,sample.id);fs.mkdirSync(sampleOutput);
    const pdf=path.join(sampleOutput,sample.id+'.pdf'),txt=path.join(sampleOutput,sample.id+'.txt'),png=path.join(sampleOutput,sample.id+'-pdf.png');fs.writeFileSync(pdf,Buffer.from(response.bytes));
    const argfile=path.join(output,sample.id+'-probe.args'),args=['-Dfile.encoding=UTF-8','-cp',classpath,path.join(root,'scripts/runtime-checks/D3SalaryPdfProbe.java'),pdf,txt,png];
    fs.writeFileSync(argfile,args.map(value=>'"'+value.replaceAll('\\','/').replaceAll('"','\\"')+'"').join('\n'));
    const parsed=spawnSync('java',['@'+argfile],{encoding:'utf8',windowsHide:true,timeout:60000});fs.writeFileSync(path.join(output,sample.id+'-probe.log'),parsed.stdout+parsed.stderr);
    check('pdf_parsed_'+sample.id,parsed.status===0&&fs.existsSync(png));
    const text=fs.readFileSync(txt,'utf8').replaceAll('\u2011','-').normalize('NFKC');
    for(const amount of sample.amounts)check('pdf_amount_'+sample.id+'_'+amount,text.includes(amount));
    for(const label of sample.labels)observations.push({surface:'pdf',salary:sample.id,label,present:text.includes(label.normalize('NFKC'))});
    for(const code of sample.codes)observations.push({surface:'pdf',salary:sample.id,label:'hide '+code,present:!text.includes(code)});
    for(const internal of ['计薪口径快照','社保扣除月份快照','累计个税计算快照'])check('pdf_no_internal_'+sample.id+'_'+internal,!text.includes(internal));
  }
  evidence.browser=true;evidence.pdf=true;
  // The repaired simulator is verified by its own current suite. This suite only reads paid salary names and PDFs.
  const helper=await sessions.admin.page.evaluate(async()=>{
    const module=await import('/src/utils/hrPayrollDisplay.ts');
    if(typeof module.salaryComponentName!=='function')return{available:false};
    return{available:true,values:[
      module.salaryComponentName({name:'BONUS',sourceType:'COMPENSATION_CHANGE',changeId:1}),
      module.salaryComponentName({name:'OVERTIME',sourceType:'COMPENSATION_CHANGE',changeId:2}),
      module.salaryComponentName({name:'REFERRAL_BONUS',sourceType:'COMPENSATION_CHANGE',changeId:3}),
      module.salaryComponentName({name:'LEAVE_ENCASHMENT',sourceType:'COMPENSATION_CHANGE',changeId:4}),
      module.salaryComponentName({name:'BONUS',sourceType:'COMPENSATION_CHANGE',salaryComponentName:'自定义奖金项目'}),
      module.salaryComponentName({name:'BONUS',type:'EARNING'}),
      module.salaryComponentName({name:'UNKNOWN',sourceType:'COMPENSATION_CHANGE'}),
    ]};
  });
  observations.push({surface:'display-helper',label:'known changes, saved custom names, ordinary component and unknown names',present:helper.available&&JSON.stringify(helper.values)===JSON.stringify(['奖金','加班费','内推奖金','假期折现','自定义奖金项目','BONUS','UNKNOWN'])});
  evidence.content=observations.every(item=>item.present);
  if(!evidence.content)failure=Error('Salary source business names still shown as codes');
}catch(error){failure=error;}
finally{
  if(runtime){
    try{runtime.check('all_original_salary_rows_unchanged',original&&hash(runtime.database('SELECT * FROM hr_salary_slip ORDER BY id'))===original);evidence.preservation=true;}catch(error){failure||=error;}
    try{runtime.check('no_unhandled_browser_errors',runtime.browserErrors.length===0);console.log('D3_SOURCE_LABELS_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,readOnly:true,sourceRounds,samples,checks:runtime?.checks||[],requests:runtime?.requests.length||0,observations,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('D3_SOURCE_LABELS_RESULT: '+JSON.stringify({...result,checks:result.checks.length,observations:observations.length}));if(!result.passed)process.exitCode=1;
}
