import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root='D:/CloudFlowPro',run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const marker='3f8c75b0bcd3',folder=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime/h2-overtime-current-r1-recovery-20261006');
const finishing=process.argv.includes('--finish-metadata');
if(finishing){assert.ok(fs.existsSync(path.join(folder,'before.json')));assert.ok(!fs.existsSync(path.join(folder,'result.json')));}
else{assert.ok(!fs.existsSync(folder));fs.mkdirSync(folder);}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const state=read(path.join(run,'state.json'));assert.equal(state.status,'RUNNING');
const env={...process.env};delete env.MYSQL_PWD;
const database=statement=>{const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+state.mysqlPort,'--user=root','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000});assert.equal(result.status,0,'Owned overtime recovery query failed');return result.stdout.trim();};
assert.equal(fs.realpathSync(database('SELECT @@datadir;')),fs.realpathSync(path.join(run,'mysql-data')));
const journalPath=path.join(run,'private/recovery/h2ot-'+marker+'.jsonl');
const events=fs.readFileSync(journalPath,'utf8').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(events.at(-1).event,'restoration-observed');
const original=events[0].data;let expected=events.filter(event=>event.event==='policy-observed').at(-1).data.expectedPolicy;
const fixture=read(path.join(run,'private/h2ot-'+marker+'.json'));
assert.equal(fixture.restorationRequired,false);
const literal=value=>"CONVERT(UNHEX('"+Buffer.from(String(value)).toString('hex')+"') USING utf8mb4)";
const tableKeys=Object.fromEntries(original.tableKeys);
const policies=()=>Object.fromEntries(Object.entries(original.policyBefore).map(([table,rows])=>{
 const key=tableKeys[table],keys=rows.map(row=>BigInt('0x'+row[key]).toString());
 const result=database('SELECT JSON_OBJECT('+original.columns[table].flatMap(column=>[literal(column),'HEX('+column+')']).join(',')+') FROM '+table+' WHERE '+key+' IN ('+keys.join(',')+') ORDER BY '+key+';');
 return[table,result.split(/\r?\n/).map(JSON.parse)];
}));
if(finishing){
 const actual=policies();
 for(const [table,rows]of Object.entries(original.policyBefore))for(let i=0;i<rows.length;i++)for(const column of Object.keys(rows[i])){
  if(rows[i][column]!==actual[table][i][column])assert.ok(table==='hr_comp_component'&&i===0&&column==='update_time','Only the observed automatic component timestamp remains');
 }
 expected=actual;
}
assert.deepEqual(policies(),expected,'Policy changed since failed verification');
const metadata=['version','update_by','update_time'];
for(const [table,rows]of Object.entries(original.policyBefore)){
 for(let i=0;i<rows.length;i++){
  for(const column of original.columns[table]){
   if(rows[i][column]!==expected[table][i][column])assert.ok(metadata.includes(column),'Only revision metadata may be recovered');
  }
 }
}
// R1 used HEX(number), which rounds decimals. Verify exact fractional business values
// from the independently retained API baseline before touching revision metadata.
const decimals={rate_multiplier:'rateMultiplier',compensatory_ratio:'compensatoryRatio',max_hours_per_day:'maxHoursPerDay',max_hours_per_month:'maxHoursPerMonth'};
for(const type of fixture.baseline.types){
 for(const [column,field]of Object.entries(decimals)){
  const actual=database('SELECT '+column+' FROM hr_overtime_type WHERE tenant_id=100000 AND type_id='+type.typeId+';');
  assert.equal(actual==='NULL'?null:Number(actual),type[field]==null?null:Number(type[field]),'Original exact type value');
 }
}
fs.writeFileSync(path.join(folder,finishing?'finish-before.json':'before.json'),JSON.stringify({marker,policyExpected:expected,changedColumns:metadata,sourceJournalHash:createHash('sha256').update(fs.readFileSync(journalPath)).digest('hex')},null,2),{flag:'wx'});
for(const [table,rows]of Object.entries(original.policyBefore)){
 for(let i=0;i<rows.length;i++){
  const row=rows[i],last=expected[table][i],columns=metadata.filter(column=>Object.hasOwn(row,column)&&row[column]!==last[column]);
  if(!columns.length)continue;
  if(Object.hasOwn(row,'update_time')&&!columns.includes('update_time'))columns.push('update_time');
  const predicate=original.columns[table].map(column=>'HEX('+column+') <=> '+(last[column]==null?'NULL':literal(last[column]))).join(' AND ');
  assert.equal(database('SELECT COUNT(*) FROM '+table+' WHERE '+predicate+';'),'1');
  const set=columns.map(column=>column+'='+(row[column]==null?'NULL':column==='version'?BigInt('0x'+row[column]).toString():"CONVERT(UNHEX('"+row[column]+"') USING utf8mb4)")).join(',');
  database('UPDATE '+table+' SET '+set+' WHERE '+predicate+';');
 }
}
assert.deepEqual(policies(),original.policyBefore);
const after=Object.fromEntries(original.tableKeys.map(([table,key])=>{
 const digest=createHash('sha256');let cursor='0';
 for(;;){
  const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+original.bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected;');
  if(end==='0')break;
  digest.update(database('SELECT '+key+',SHA2(CAST(JSON_ARRAY('+original.columns[table].map(column=>'HEX('+column+')').join(',')+') AS CHAR),256) FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key+';'));cursor=end;
 }return[table,digest.digest('hex')];
}));
assert.deepEqual(after,original.before);
assert.equal(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;'),original.rolesBefore);
assert.equal(database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'),original.menusBefore);
assert.equal(database("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name IN ("+original.names.map(literal).join(',')+") AND status='1';"),'5');
const result={passed:true,marker,tables:original.tableKeys.length,originalDigestRestored:true,exactTypeDecimalsPreserved:true,metadataOnly:true,accountsDisabled:5,rolesKept:true,productModified:false,failedRoundPassed:false};
fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(result,null,2));
const descriptor=fs.openSync(journalPath,'a');try{fs.writeFileSync(descriptor,JSON.stringify({event:'recovered-after-failure',at:new Date().toISOString(),data:result})+'\n');fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
console.log('H2_OVERTIME_R1_RECOVERY: '+JSON.stringify(result));
