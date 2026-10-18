import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const root = 'D:/CloudFlowPro';
const round = process.argv[2]; assert.match(round || '', /^r[1-9][0-9]*$/);
const directory = path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime','d2-redis-select-boundary-20261005-'+round);
await fs.mkdir(directory);
const binary = path.join(root,'.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-server.exe');
const cli = path.join(path.dirname(binary),'redis-cli.exe');
const password = randomBytes(32).toString('hex');
const reservation = net.createServer();
await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
const port = reservation.address().port;
await new Promise(resolve=>reservation.close(resolve));
const config = 'd2-select-'+randomBytes(8).toString('hex')+'.conf';
await fs.writeFile(path.join(directory,config), ['bind 127.0.0.1','protected-mode yes','port '+port,'requirepass '+password,'appendonly no','save ""','logfile "server.log"'].join('\n')+'\n',{flag:'wx'});
const child = spawn(binary,[config],{cwd:directory,windowsHide:true,stdio:'ignore'});
const exit = new Promise((resolve,reject)=>{child.once('error',()=>reject(new Error('Owned Redis probe startup failed')));child.once('exit',(code,signal)=>resolve({code,signal}));});
const env = {...process.env,REDISCLI_AUTH:password};
const command = (...args) => {
  const result=spawnSync(cli,['--no-auth-warning','-h','127.0.0.1','-p',String(port),'--raw',...args],{cwd:directory,env,windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,'Owned empty Redis command failed');
  return result.stdout.trim();
};
const sockets = [];
const connect = async () => {
  const socket=net.createConnection({host:'127.0.0.1',port}); socket.setNoDelay(true); socket.setTimeout(10000);
  let pending, buffer='';
  const fail=()=>{pending?.reject(new Error('Owned Redis boundary socket failed'));pending=null;socket.destroy();};
  socket.on('error',fail);socket.on('timeout',fail);
  socket.on('data',chunk=>{buffer+=chunk.toString('utf8');const end=buffer.indexOf('\r\n');if(end>=0&&pending){const action=pending;pending=null;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);action.resolve(line);}});
  const send=args=>new Promise((resolve,reject)=>{assert.ok(!pending);pending={resolve,reject};socket.write('*'+args.length+'\r\n'+args.map(value=>'$'+Buffer.byteLength(value)+'\r\n'+value+'\r\n').join(''));});
  sockets.push(socket);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',()=>reject(new Error('Owned boundary connect failed')));});
  assert.equal(await send(['AUTH',password]),'+OK');
  // Idle diagnostic connections should remain open throughout every population measurement.
  socket.setTimeout(0);
  return {socket,send};
};
const clients=[];
const stages=[];
let ready=false, failed, outcome;
try {
  for(let attempt=0;attempt<100;attempt++) {
    if(child.exitCode!==null) throw new Error('Owned Redis exited during startup');
    try {ready=command('PING')==='PONG';} catch {}
    if(ready) break; await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Owned empty Redis startup deadline');
  assert.equal(command('DBSIZE'),'0');
  for(const population of [2,60,70,132,2]) {
    while(clients.length<population) clients.push(await connect());
    while(clients.length>population) clients.pop().socket.destroy();
    await new Promise(resolve=>setTimeout(resolve,250));
    const values=[];
    for(let index=0;index<24;index++) {
      const start=performance.now(); assert.equal(await clients.at(-1).send(['PING']),'+PONG');
      values.push(Number((performance.now()-start).toFixed(3)));
    }
    const sorted=[...values].sort((a,b)=>a-b);
    const stage={population,samples:values.length,min:sorted[0],median:sorted[12],max:sorted.at(-1),values};
    stages.push(stage);
    await fs.writeFile(path.join(directory,'progress.json'),JSON.stringify({stages},null,2));
    console.log('D2_REDIS_SELECT_STAGE: '+JSON.stringify({population,median:stage.median,min:stage.min,max:stage.max}));
  }
  assert.equal(command('DBSIZE'),'0');
} catch(error) {failed=error;}
finally {
  for(const socket of sockets) socket.destroy();
  if(ready) command('SHUTDOWN','NOSAVE');
  let timer;
  try {outcome=await Promise.race([exit,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Owned Redis shutdown deadline; retain original process')),10000);})]);}
  finally {clearTimeout(timer);}
  await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({passed:!failed,stages,originalProcess:outcome,persistentKeysCreated:0,sharedFixtureModified:false,failure:failed?String(failed.message).slice(0,180):undefined},null,2));
  console.log('D2_REDIS_SELECT_STOPPED: exit='+outcome.code+'; shared_fixture_modified=false; persistent_keys=0');
}
if(failed) throw failed;
assert.equal(outcome.code,0,'Original empty Redis process failed');
