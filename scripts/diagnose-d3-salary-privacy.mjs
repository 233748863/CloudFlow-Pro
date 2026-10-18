import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { authenticateD2PrivacyAccount } from './runtime-checks/d2-privacy-browser-auth.mjs';

const root='D:/CloudFlowPro', evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const [round,backend,frontend]=process.argv.slice(4);for(const value of [round,backend,frontend])assert.match(value,/^r[1-9][0-9]*$/);
const output=path.join(evidence,'d3-salary-privacy-diagnosis-20261006-'+round);fs.mkdirSync(output);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash=value=>createHash('sha256').update(value).digest('hex').toUpperCase();
const inputs=[...read(path.join(evidence,`h3-portal-finance-20261002-backend-${backend}-inputs.json`)),...read(path.join(evidence,`h3-portal-finance-20261002-frontend-${frontend}-inputs.json`)),...['scripts/diagnose-d3-salary-privacy.mjs','scripts/run-d3-salary-privacy-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs','scripts/runtime-checks/d2-privacy-browser-auth.mjs'].map(Path=>({Path,Hash:hash(fs.readFileSync(path.join(root,Path)))}))];
const unchanged=()=>{for(const item of inputs)assert.equal(hash(fs.readFileSync(path.join(root,item.Path))),item.Hash);};unchanged();
fs.writeFileSync(path.join(output,'inputs.json'),JSON.stringify(inputs,null,2));
const runtime=await createD1LeaveRuntime(root,output),{database:db,sessions,check,checks}=runtime;
const prior=read(path.join(evidence,'d3-payroll-deductions-20261006-r2/fixture.json'));
const failed=read(path.join(evidence,'d3-salary-privacy-20261006-r3/fixture.json'));
const report={passed:false,requests:[],restorations:{}};const save=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({...report,checks},null,2));
const origin=new URL(sessions.admin.page.url()).origin,browser=sessions.admin.context.browser();
let bound=false,activated=false,failure;
const protectedEmployee=()=>hash(db('SELECT id,tenant_id,employee_no,name,gender,birth_date,phone,email,dept_id,post_id,position_id,employee_type,employee_status,hire_date,regular_date,resign_date,create_by,create_time,deleted FROM hr_employee WHERE id=98209282285'));
const before=protectedEmployee(),salaryBefore=hash(db('SELECT * FROM hr_salary_slip ORDER BY id'));
async function api(actor,url,method='GET',body){
  assert.ok(url==='/hr/employees/98209282285'||url==='/hr/ess/salary-slips/98209280908/confirm'||url==='/hr/compensation/payroll/tax-slabs/1512'||url==='/hr/compensation/payroll/slips/preview?employeeId=98209282288&periodId='+failed.foreignPeriod);
  const result=await sessions[actor].page.evaluate(async({url,method,body})=>{
    const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;
    const csrf=document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice(11));
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch('/api'+url,{method,headers,credentials:'same-origin',...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,traceId:response.headers.get('X-Trace-Id'),body:await response.json()};
  },{url,method,body});report.requests.push({actor,url,method,status:result.status,code:result.body?.code,traceId:result.traceId});save();return result;
}
const ok=async(...args)=>runtime.success(await api(...args),'diagnostic_'+args[0]+'_'+args[1]);
try{
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username==='g_import_tenant');runtime.sensitive.add(account.password);
  const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});const identity=await authenticateD2PrivacyAccount(page,account,origin);check('foreign_real_login',identity.authenticated&&identity.tenantId==='100001');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());runtime.sensitive.add(token);runtime.sensitive.add(token.replace(/^Bearer /,''));sessions.foreign={context,page,identity};
  const slab=failed.slabs.find(value=>value.id==='1512');check('owned_foreign_tax_inactive',db("SELECT status FROM hr_tax_slab WHERE slab_id=1512")==='INACTIVE');
  await ok('foreign','/hr/compensation/payroll/tax-slabs/1512','PUT',{...slab.body,status:'ACTIVE'});activated=true;
  const preview=await api('foreign','/hr/compensation/payroll/slips/preview?employeeId=98209282288&periodId='+failed.foreignPeriod);
  report.preview={status:preview.status,code:preview.body?.code,message:preview.body?.msg,traceId:preview.traceId};save();
  check('original_employee_unbound',db('SELECT user_id IS NULL FROM hr_employee WHERE id=98209282285')==='1');
  await ok('admin','/hr/employees/98209282285','PUT',{...prior.employees[0].body,userId:sessions.employee.identity.userId});bound=true;
  const employeePage=sessions.employee.page;await employeePage.goto(origin+'/hr/ess/slips',{waitUntil:'domcontentloaded'});
  await employeePage.locator('table tbody tr').filter({hasText:'2026-06'}).getByRole('button',{name:'查看工资单',exact:true}).click();
  const dialog=employeePage.getByRole('dialog').filter({hasText:'工资单 2026-06'});await dialog.waitFor();
  report.confirmButtonCount=await dialog.getByRole('button',{name:'确认收悉',exact:true}).count();
  report.employeePermission=sessions.employee.identity.permissions.includes('hr:ess:slip:confirm');
  await employeePage.screenshot({path:path.join(output,'employee-confirm-missing.png')});
  const confirm=await api('employee','/hr/ess/salary-slips/98209280908/confirm','POST',{});
  report.confirmResponse={status:confirm.status,code:confirm.body?.code};
  check('actual_missing_confirmation_captured',report.confirmButtonCount===0&&!report.employeePermission&&confirm.status===403);
}catch(error){failure=error;}
finally{
  const restore=async(name,action)=>{try{await action();report.restorations[name]=true;}catch(error){report.restorations[name]=false;failure||=error;}save();};
  await restore('binding',async()=>{if(bound)await ok('admin','/hr/employees/98209282285','PUT',{...prior.employees[0].body,userId:null});check('employee_unbound',db('SELECT user_id IS NULL FROM hr_employee WHERE id=98209282285')==='1');});
  await restore('tax',async()=>{if(activated)await ok('foreign','/hr/compensation/payroll/tax-slabs/1512','PUT',failed.slabs.find(value=>value.id==='1512').body);check('tax_inactive',db("SELECT status FROM hr_tax_slab WHERE slab_id=1512")==='INACTIVE');});
  try{check('employee_fields_preserved',protectedEmployee()===before);check('all_salary_fields_preserved',hash(db('SELECT * FROM hr_salary_slip ORDER BY id'))===salaryBefore);report.scan=await runtime.scan();unchanged();}catch(error){failure||=error;}
  await runtime.close();report.passed=!failure;report.inputs=inputs.length;if(failure)report.failure=String(failure.message).slice(0,240);save();
  console.log('D3_PRIVACY_DIAGNOSIS: '+JSON.stringify({passed:report.passed,checks:checks.length,preview:report.preview,confirmButton:report.confirmButtonCount,confirmStatus:report.confirmResponse?.status,restorations:report.restorations,failure:report.failure}));
  if(failure)process.exitCode=1;
}
