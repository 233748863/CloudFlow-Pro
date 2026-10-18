import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateD2PrivacyAccount} from './runtime-checks/d2-privacy-browser-auth.mjs';
import {restoreSimulatorFixtures} from './runtime-checks/d3-simulator-fixtures.mjs';
import {grantSimulatorPermission,restoreSimulatorPermission} from './runtime-checks/d3-simulator-role.mjs';

const root='D:/CloudFlowPro',endpoint='/hr/compensation/simulate';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d3-simulator'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d3-simulator-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output,'result.json')));
const fixture={marker:'D3S-'+randomUUID().replaceAll('-','').slice(0,12),created:[],restored:[]};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={calculation:false,baseline:false,validation:false,scope:false,tenant:false,browser:false,preservation:false,restoration:false,secrets:false};
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=value=>{const text=String(value);assert.match(text,/^[1-9][0-9]*$/);return text;};
let runtime,failure,preserved,original,simulationSnapshot;
const cents=value=>{const match=/^(-?)(\d+)\.(\d{2})$/.exec(String(value));assert.ok(match,'Exact two-decimal amount required');return (match[1]? -1n:1n)*(BigInt(match[2])*100n+BigInt(match[3]));};
const money=value=>String(value/100n)+'.'+String(value%100n).padStart(2,'0');
try {
  runtime=await createD1LeaveRuntime(root,output);
  const {sessions,database,check,ok,api,sensitive,browserErrors}=runtime;
  const tables=['hr_employee','hr_employee_comp','hr_comp_component','hr_comp_structure','hr_comp_grade','hr_salary_slip','sys_role_menu'];
  const bounds=Object.fromEntries(tables.filter(table=>table!=='sys_role_menu').map(table=>[table,database('SELECT COALESCE(MAX(id),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(table=>{
    if(table==='sys_role_menu')return[table,hash(database('SELECT * FROM sys_role_menu ORDER BY role_id,menu_id'))];
    const digest=createHash('sha256');let cursor='0';
    for(;;){const end=database('SELECT COALESCE(MAX(id),0) FROM (SELECT id FROM '+table+' WHERE id>'+cursor+' AND id<='+bounds[table]+' ORDER BY id LIMIT 500) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE id>'+cursor+' AND id<='+end+' ORDER BY id'));cursor=end;}
    return[table,digest.digest('hex')];
  }));
  original=preserved();fixture.original=original;save();
  const origin=new URL(sessions.admin.page.url()).origin;
  for(const [actor,username,tenant] of [['manager','g_holiday_manager','100000'],['foreign','g_import_tenant','100001']]){
    const account=JSON.parse(fs.readFileSync(path.join(runtime.run,'private/accounts.json'),'utf8')).find(value=>value.username===username);assert.ok(account);sensitive.add(account.password);
    const context=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();page.on('pageerror',()=>browserErrors.push(actor));await page.goto(origin,{waitUntil:'domcontentloaded'});
    const identity=await authenticateD2PrivacyAccount(page,account,origin);check('real_login_'+actor,identity.authenticated&&identity.tenantId===tenant);
    const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));
    sessions[actor]={context,page,identity};
  }
  const create=async(actor,resource,body)=>{const created=id(await ok(actor,'/hr/compensation/'+resource,'POST',body));fixture.created.push({actor,resource,id:created});save();return created;};
  const members=[];
  for(const [name,type,category,taxable] of [['基本工资','FIXED','BASE',1],['奖金','VARIABLE','BONUS',1],['扣减','DEDUCTION','OTHER',1],['公司成本','COMPANY','BENEFIT',1]]){
    const code=fixture.marker+'-'+members.length;
    members.push({id:await create('admin','components',{componentCode:code,componentName:fixture.marker+name,componentType:type,category,taxable,status:1,sortOrder:990}),code,name});
  }
  fixture.members=members;
  fixture.structureId=await create('admin','structures',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{itemIds:members.map(row=>Number(row.id))}});
  fixture.gradeId=await create('admin','grades',{gradeCode:fixture.marker,gradeName:fixture.marker,currency:'CNY',minSalary:'0.00',midSalary:'5000.01',maxSalary:'10000.00',status:1});
  fixture.foreignComponent=await create('foreign','components',{componentCode:fixture.marker+'-foreign',componentName:fixture.marker+'异租户',componentType:'FIXED',category:'BASE',taxable:1,status:1,sortOrder:990});
  fixture.foreignStructure=await create('foreign','structures',{structureCode:fixture.marker,structureName:fixture.marker,status:1,componentConfig:{itemIds:[Number(fixture.foreignComponent)]}});
  const department=database("SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_id=990000164 AND deleted=0");check('owned_department',department==='990000164');
  fixture.employeeId=id(await ok('admin','/hr/employees','POST',{employeeNo:fixture.marker,name:fixture.marker,gender:'UNKNOWN',deptId:department,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01'}));save();
  const currentValues={[members[0].id]:'10000.01',[members[1].code]:'123.45'};
  for(const [date,status,total,values] of [['2026-01-01','ACTIVE','9000.00',undefined],['2026-10-01','ACTIVE','10123.46',currentValues],['2026-10-02','INACTIVE','9999.99',undefined],['2099-01-01','ACTIVE','8888.88',undefined]]){
    await create('admin','employee-compensations',{employeeId:fixture.employeeId,structureId:fixture.structureId,effectiveDate:date,status,totalSalary:total,componentValues:values});
  }
  const call=async(actor,body)=>ok(actor,endpoint,'POST',body);
  simulationSnapshot=hash(database('SELECT * FROM hr_employee_comp ORDER BY id')+database('SELECT * FROM hr_salary_slip ORDER BY id'));
  const base={structureId:fixture.structureId,socialPersonalRate:'0'};
  const initial=await call('admin',{...base,employeeId:fixture.employeeId});
  check('current_effective_employee_salary',initial.gross==='10123.46'&&initial.breakdown.find(row=>String(row.componentId)===members[0].id).amount==='10000.01');
  const inherited=await call('admin',{employeeId:fixture.employeeId,socialPersonalRate:'0'});
  check('employee_structure_resolved_by_server',String(inherited.structureId)===fixture.structureId&&inherited.gross===initial.gross);evidence.baseline=true;
  const zero=await call('admin',{...base,gradeId:fixture.gradeId,componentOverrides:{[members[0].code]:'0'}});
  check('explicit_zero_beats_grade_mid',zero.gross==='0.00'&&zero.netSalary==='0.00'&&zero.breakdown.length===4);
  const grade=await call('admin',{...base,gradeId:fixture.gradeId});
  check('base_category_uses_grade_mid',grade.gross==='5000.01');
  const mixed=await call('admin',{...base,socialBase:'10000.01',socialPersonalRate:'0.105',specialDeductions:'100.01',componentOverrides:{[members[0].code]:'10000.01',[members[1].code]:'123.45',[members[2].code]:'23.45',[members[3].code]:'999.99'}});
  check('company_cost_excluded_and_deduction_applied',mixed.gross==='10100.01'&&mixed.taxableGross==='10100.01'&&mixed.breakdown.find(row=>row.componentType==='COMPANY').amount==='999.99');
  check('social_rounding_and_parameter_echo',mixed.socialPersonal==='1050.00'&&mixed.socialBase==='10000.01'&&mixed.specialDeductions==='100.01');
  check('existing_monthly_estimate_parameters',mixed.threshold==='5000.00');
  check('independent_monthly_tax_and_net',mixed.taxableIncome==='3950.00'&&mixed.personalTax==='185.00'&&mixed.netSalary==='8865.01');
  fixture.mixed=mixed;save();
  const large=await call('admin',{...base,componentOverrides:{[members[0].code]:'90071992547409.93'}});
  check('large_input_and_result_preserved',large.gross==='90071992547409.93'&&large.breakdown[0].amount==='90071992547409.93');
  const expectedLargeTax=((cents(large.gross)-500000n)*45n+50n)/100n-1516000n;
  check('independent_integer_cent_large_tax',large.personalTax===money(expectedLargeTax)&&large.netSalary===money(cents(large.gross)-expectedLargeTax));
  const upper=await call('admin',{...base,componentOverrides:{[members[0].code]:'9999999999999999.99'}});
  check('maximum_amount_preserved',upper.gross==='9999999999999999.99');evidence.calculation=true;
  const badBodies=[{}, {...base,componentOverrides:{outside:'1'}}, {...base,componentOverrides:{[members[0].code]:'-0.01'}}, {...base,componentOverrides:{[members[0].code]:'0.001'}},
    {...base,componentOverrides:{[members[0].code]:'10000000000000000.00'}},{...base,socialBase:'-1'},{...base,socialPersonalRate:'1.01'},{...base,specialDeductions:'-1'},{...base,gradeId:'99999999999999'},{...base,city:'上海'},{...base,componentOverrides:{[members[0].code]:null}}];
  for(let index=0;index<badBodies.length;index++){const result=await api('admin',endpoint,{method:'POST',body:badBodies[index]});check('invalid_input_'+index,result.status===400&&result.body?.code==='SIMULATION_INVALID');}
  evidence.validation=true;
  const foreign=await call('foreign',{structureId:fixture.foreignStructure,socialPersonalRate:'0',componentOverrides:{[fixture.marker+'-foreign']:'77.77'}});
  check('actual_foreign_tenant_uses_own_components',foreign.gross==='77.77'&&foreign.breakdown.length===1&&String(foreign.breakdown[0].componentId)===fixture.foreignComponent);
  for(const [actor,structureId] of [['admin',fixture.foreignStructure],['foreign',fixture.structureId]]){const denied=await api(actor,endpoint,{method:'POST',body:{structureId}});check('foreign_structure_denied_'+actor,denied.status===400&&denied.body?.code==='SIMULATION_INVALID');}
  evidence.tenant=true;
  await grantSimulatorPermission(runtime,fixture,save);
  check('manager_simulation_permission',sessions.manager.identity.permissions.includes('hr:compensation:list')||sessions.manager.identity.permissions.includes('*:*:*'));
  check('manager_can_use_granted_simulator',(await call('manager',{...base,componentOverrides:{[members[0].code]:'0'}})).gross==='0.00');
  const scoped=await api('manager',endpoint,{method:'POST',body:{...base,employeeId:fixture.employeeId}});
  check('manager_outside_employee_scope_denied',scoped.status===403&&scoped.body?.code==='FORBIDDEN');evidence.scope=true;
  const ui=await sessions.admin.context.newPage();ui.on('pageerror',()=>browserErrors.push('simulator'));
  await ui.goto(origin+'/hr/compensation',{waitUntil:'networkidle'});await ui.getByRole('button',{name:'薪酬模拟器',exact:true}).click();const dialog=ui.getByRole('dialog');
  await dialog.getByLabel('薪资结构',{exact:true}).click();await ui.getByRole('option',{name:fixture.marker,exact:true}).click();
  await dialog.locator('#salary-simulation-component-'+members[0].id).fill('90071992547409.93');await dialog.locator('#salary-simulation-socialPersonalRate').fill('0');
  let waiting=ui.waitForResponse(response=>response.url().endsWith('/api'+endpoint)&&response.request().method()==='POST');
  await dialog.getByRole('button',{name:'模拟计算',exact:true}).click();let response=await waiting;let body=await response.json();
  check('real_page_posts_exact_component_amount',response.request().postDataJSON().componentOverrides[members[0].code]==='90071992547409.93'&&String(response.request().postDataJSON().structureId)===fixture.structureId);
  check('real_page_result_success',response.status()===200&&body.data.gross==='90071992547409.93');
  runtime.requests.push({actor:'admin-page',path:endpoint,method:'POST',status:response.status(),code:body.code,traceId:response.headers()['x-trace-id']});
  await dialog.getByRole('region',{name:'模拟结果'}).getByText('¥ 90071992547409.93',{exact:true}).first().waitFor();
  check('real_page_exposes_estimate_boundary',(await dialog.innerText()).includes('月度估算，仅供比较'));
  await ui.screenshot({path:path.join(output,'simulator-desktop.png')});
  await dialog.locator('#salary-simulation-component-'+members[0].id).fill('0');check('changed_conditions_clear_previous_result',!(await dialog.innerText()).includes('¥ 90071992547409.93'));
  await ui.setViewportSize({width:390,height:844});
  waiting=ui.waitForResponse(response=>response.url().endsWith('/api'+endpoint)&&response.request().method()==='POST');await dialog.getByRole('button',{name:'模拟计算',exact:true}).click();response=await waiting;body=await response.json();
  check('mobile_zero_request_and_result',response.request().postDataJSON().componentOverrides[members[0].code]==='0'&&body.data.gross==='0.00');
  runtime.requests.push({actor:'admin-mobile',path:endpoint,method:'POST',status:response.status(),code:body.code,traceId:response.headers()['x-trace-id']});
  await ui.screenshot({path:path.join(output,'simulator-mobile.png')});
  const mobileResult=dialog.getByRole('region',{name:'模拟结果'});
  await mobileResult.getByText('¥ 0.00',{exact:true}).first().waitFor();
  await mobileResult.scrollIntoViewIfNeeded();
  check('mobile_result_zero_rendered',(await mobileResult.innerText()).includes('估算实发')&&(await mobileResult.innerText()).includes('¥ 0.00'));
  check('mobile_dialog_fits_viewport',await dialog.evaluate(element=>element.getBoundingClientRect().width<=window.innerWidth&&document.documentElement.scrollWidth<=window.innerWidth));
  await ui.screenshot({path:path.join(output,'simulator-mobile-result.png')});await ui.close();evidence.browser=true;
} catch(error){failure=error;}
finally {
  if(runtime){
    try{if(simulationSnapshot)runtime.check('simulation_does_not_modify_any_salary_or_assignment',simulationSnapshot===hash(runtime.database('SELECT * FROM hr_employee_comp ORDER BY id')+runtime.database('SELECT * FROM hr_salary_slip ORDER BY id')));}catch(error){failure||=error;}
    try{await restoreSimulatorPermission(runtime,fixture,save);}catch(error){failure||=error;}
    try{
      await restoreSimulatorFixtures(runtime,fixture,save);
      evidence.restoration=fixture.roleGrantRestored===true;
    }catch(error){failure||=error;}
    try{runtime.check('all_original_rows_and_role_grants_unchanged',original&&JSON.stringify(preserved())===JSON.stringify(original));evidence.preservation=true;}catch(error){failure||=error;}
    try{runtime.check('no_unhandled_browser_error',runtime.browserErrors.length===0);console.log('D3_SIMULATOR_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,all18Complete:false,officialTaxPolicyVerified:false,globalComplete:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log('D3_SIMULATOR_RESULT: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
