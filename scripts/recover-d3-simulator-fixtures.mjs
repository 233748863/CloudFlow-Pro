import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createD1LeaveRuntime} from './runtime-checks/d1-leave-runtime.mjs';
import {authenticateD2PrivacyAccount} from './runtime-checks/d2-privacy-browser-auth.mjs';
import {restoreSimulatorFixtures} from './runtime-checks/d3-simulator-fixtures.mjs';

const root='D:/CloudFlowPro',output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.ok(process.argv.includes('--d3-simulator'));
assert.match(path.basename(output),/^d3-simulator-recovery-20261006-r[1-9][0-9]*$/);
const prior=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-simulator-20261006-r1');
const originalResult=fs.readFileSync(path.join(prior,'result.json'));
const failed=JSON.parse(originalResult);
const recoveredFolders=fs.readdirSync(path.dirname(prior)).filter(name=>/^d3-simulator-recovery-20261006-r[1-9][0-9]*$/.test(name)&&path.join(path.dirname(prior),name)!==output&&fs.existsSync(path.join(path.dirname(prior),name,'recovered-fixture.json'))).sort((a,b)=>Number(b.split('-r').at(-1))-Number(a.split('-r').at(-1)));
const fixture=JSON.parse(fs.readFileSync(recoveredFolders.length?path.join(path.dirname(prior),recoveredFolders[0],'recovered-fixture.json'):path.join(prior,'fixture.json'),'utf8'));
assert.equal(fixture.marker,JSON.parse(fs.readFileSync(path.join(prior,'fixture.json'),'utf8')).marker);
assert.equal(failed.passed,false);assert.equal(failed.preservation,true);assert.equal(failed.restoration,false);
const save=()=>fs.writeFileSync(path.join(output,'recovered-fixture.json'),JSON.stringify(fixture,null,2));
const hash=value=>createHash('sha256').update(value).digest('hex');
let runtime,failure;const evidence={restoration:false,preservation:false,secrets:false};
try{
  runtime=await createD1LeaveRuntime(root,output);
  const {sessions,database,sensitive,check}=runtime;
  const protectedRows=()=>{
    const tables={'components':'hr_comp_component','structures':'hr_comp_structure','grades':'hr_comp_grade','employee-compensations':'hr_employee_comp'};
    return Object.fromEntries(Object.entries(tables).map(([resource,table])=>{
      const ids=fixture.created.filter(row=>row.resource===resource).map(row=>row.id);assert.ok(ids.length&&ids.every(value=>/^[1-9][0-9]*$/.test(value)));
      return [table,hash(database('SELECT * FROM '+table+' WHERE id NOT IN ('+ids.join(',')+') ORDER BY id'))];
    }).concat([['hr_salary_slip',hash(database('SELECT * FROM hr_salary_slip ORDER BY id'))],['roles',hash(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'))]]));
  };
  const before=protectedRows(),origin=new URL(sessions.admin.page.url()).origin;
  const account=JSON.parse(fs.readFileSync(path.join(runtime.run,'private/accounts.json'),'utf8')).find(value=>value.username==='g_import_tenant');assert.ok(account);sensitive.add(account.password);
  const context=await sessions.admin.context.browser().newContext();const page=await context.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
  const identity=await authenticateD2PrivacyAccount(page,account,origin);check('foreign_owned_login',identity.authenticated&&identity.tenantId==='100001');
  const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));sessions.foreign={context,page,identity};
  await restoreSimulatorFixtures(runtime,fixture,save);evidence.restoration=true;
  check('all_other_salary_configuration_and_grants_unchanged',JSON.stringify(protectedRows())===JSON.stringify(before));
  check('original_failed_result_retained',fs.readFileSync(path.join(prior,'result.json')).equals(originalResult));evidence.preservation=true;
}catch(error){failure=error;}
finally{
  if(runtime){try{console.log('D3_SIMULATOR_RECOVERY_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}await runtime.close();}
  const result={passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,restored:fixture.restored.length,all18Complete:false,globalComplete:false,officialTaxPolicyVerified:false,failure:failure?String(failure.message).split('\n')[0].slice(0,180):undefined};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  console.log('D3_SIMULATOR_RECOVERY: '+JSON.stringify({...result,checks:result.checks.length}));if(!result.passed)process.exitCode=1;
}
