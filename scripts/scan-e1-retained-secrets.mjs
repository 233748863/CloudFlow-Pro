import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ownedGatewayRedis} from './owned-gateway-redis.mjs';
import {scanSecretStream,scanOwnedAuditLogs} from './portal-checks/scan-access-logs.mjs';

const root='D:/CloudFlowPro';
assert.equal(fs.realpathSync(process.cwd()),fs.realpathSync(root));
const round=process.argv[2];assert.equal(round,'r11');
const evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output=path.join(evidence,'e1-retained-secret-scan-20261007-'+round+'.json');
assert.ok(!fs.existsSync(output));
const directory=path.join(evidence,'e1-activity-core-20261007-'+round);
const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));
assert.equal(result.passed,false);assert.equal(result.secrets,false);
const started=fs.statSync(path.join(directory,'inputs.json')).birthtimeMs;
const finished=Date.parse(result.verifiedAt);assert.ok(finished>started);
const run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state=JSON.parse(fs.readFileSync(path.join(run,'state.json'),'utf8').replace(/^\uFEFF/,''));
assert.equal(state.status,'RUNNING');assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));
const env={...process.env};delete env.MYSQL_PWD;
const database=statement=>{
  assert.match(statement,/^SELECT /);
  const read=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000});
  assert.equal(read.status,0,'Owned retained scan read failed');return read.stdout.trim();
};
assert.equal(fs.realpathSync(database('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const redis=await ownedGatewayRedis(state);
const accounts=JSON.parse(fs.readFileSync(path.join(run,'private/accounts.json'),'utf8'));
const secrets=new Set();
const unwrap=value=>Array.isArray(value)&&typeof value[0]==='string'&&value[0].startsWith('java.')?value[1]:value;
for(const username of ['g_import_admin','g_opportunity_sales','g_opportunity_manager','g_import_tenant','g_holiday_employee']){
  const tenant=username==='g_import_tenant'?100001:100000;
  const account=accounts.find(entry=>entry.username===username);assert.ok(account?.password);secrets.add(account.password);
  const id=database("SELECT user_id FROM sys_user WHERE user_name='"+username+"' AND tenant_id="+tenant);
  assert.match(id,/^\d+$/);
  const session=JSON.parse(redis('GET','Authorization:login:session:'+id));
  const identity=unwrap(session.dataMap?.['cloudflow:loginUser']);
  assert.equal(String(unwrap(identity?.userId)),id);
  const loginTime=Number(unwrap(identity.login_time));assert.ok(loginTime>=started&&loginTime<=finished,'Retained token must belong to failed round');
  const token=unwrap(identity.token);assert.ok(typeof token==='string'&&token.length>16);secrets.add(token);secrets.add(token.replace(/^Bearer /,''));
}
let files=0,bytes=0,leaks=0;
for(const service of state.services){
  const directory=path.join(run,service.name,'logs');
  const paths=fs.existsSync(directory)?fs.readdirSync(directory).filter(name=>name.endsWith('.log')).map(name=>path.join(directory,name)):[];
  for(const name of ['stdout.log','stderr.log'])if(fs.existsSync(path.join(run,service.name,name)))paths.push(path.join(run,service.name,name));
  for(const file of paths){const scan=await scanSecretStream(fs.createReadStream(file),[...secrets]);files++;bytes+=scan.bytes;leaks+=scan.leaks;}
}
// Scan all retained audit rows, including the failed round; no audit is changed.
const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});bytes+=audit.bytes;leaks+=audit.leaks;
assert.ok(files>=6&&bytes>0&&leaks===0);
fs.writeFileSync(output,JSON.stringify({passed:true,round,files,bytes,sensitiveValues:secrets.size,leaks,databaseAuditScanned:true,retainedRoundTokensVerified:5,redisWrites:0,databaseWrites:0,businessPassed:false,verifiedAt:new Date().toISOString()},null,2),{flag:'wx'});
console.log('E1_RETAINED_SECRET_SCAN: files='+files+'; sensitive_values='+secrets.size+'; leaks=0; verified_round_tokens=5; writes=0; business_passed=false');
