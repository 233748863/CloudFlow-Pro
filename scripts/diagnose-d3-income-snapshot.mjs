import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root='D:/CloudFlowPro',run=path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const directory=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-income-benefits-20261006-r2');
const output=path.join(directory,'snapshot-representation-diagnostic.json');assert.ok(!fs.existsSync(output));
const state=JSON.parse(fs.readFileSync(path.join(run,'state.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(fs.realpathSync(state.run),fs.realpathSync(run));assert.equal(state.status,'RUNNING');
const env={...process.env};delete env.MYSQL_PWD;
const database=statement=>{assert.match(statement,/^SELECT /);const result=spawnSync('mysql.exe',['--no-defaults','--protocol=TCP','--host=127.0.0.1','--port='+state.mysqlPort,'--user=root','--skip-password','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','cloud_flow_db'],{input:statement,encoding:'utf8',windowsHide:true,env,timeout:30000});assert.equal(result.status,0);return result.stdout.trim();};
assert.equal(fs.realpathSync(database('SELECT @@datadir')),fs.realpathSync(path.join(run,'mysql-data')));
const fixture=JSON.parse(fs.readFileSync(path.join(directory,'fixture.json'),'utf8')),sample=fixture.cases.find(row=>row.name==='penny');assert.match(sample.slipId,/^[1-9]\d*$/);
assert.equal(database('SELECT COUNT(*) FROM hr_salary_slip WHERE id='+sample.slipId+' AND employee_id='+sample.employeeId+' AND batch_id='+fixture.batches[0].id+' AND tenant_id=100000'),'1');
const stored=JSON.parse(database('SELECT components FROM hr_salary_slip WHERE id='+sample.slipId)),response=JSON.parse(fs.readFileSync(path.join(directory,'penny-slip.json'),'utf8')).components;
const differences=[];
const walk=(left,right,location)=>{
  if(Array.isArray(left)&&Array.isArray(right)){assert.equal(left.length,right.length);left.forEach((value,index)=>walk(value,right[index],location+'['+index+']'));return;}
  if(left&&right&&typeof left==='object'&&typeof right==='object'){assert.deepEqual(Object.keys(left).sort(),Object.keys(right).sort());Object.keys(left).forEach(key=>walk(left[key],right[key],location+'.'+key));return;}
  if(String(left)!==String(right))differences.push({path:location,stored:left,response:right,storedType:typeof left,responseType:typeof right});
};
walk(stored,response,'components');fs.writeFileSync(output,JSON.stringify({differences},null,2),{flag:'wx'});console.log(JSON.stringify({differences}));
