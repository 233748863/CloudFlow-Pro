import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = 'D:/CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const output = process.argv[2];
assert.match(output || '', /^r[1-9][0-9]*$/);
const state = JSON.parse((await fs.readFile(path.join(run,'state.json'),'utf8')).replace(/^\uFEFF/,''));
const owned = await ownedGatewayRedis(state);
assert.equal(owned('PING'), 'PONG');
const ownedProcess = state.processes.find(value=>value.name==='redis');
const config = await fs.realpath(path.resolve(run, ownedProcess.marker));
assert.equal(path.dirname(config), await fs.realpath(run));
const text = await fs.readFile(config,'utf8');
const secret = text.match(/^requirepass (.+)\r?$/m)?.[1].trim();
assert.ok(secret);
const socket = net.createConnection({host:'127.0.0.1',port:state.redisPort});
socket.setNoDelay(true); socket.setTimeout(30000);
let pending, buffered = '';
socket.on('data',chunk=>{
  buffered += chunk.toString('utf8');
  const end = buffered.indexOf('\r\n');
  if (end >= 0 && pending) { const resolve = pending.resolve; pending=null; const line=buffered.slice(0,end); buffered=buffered.slice(end+2); resolve(line); }
});
const fail = () => { pending?.reject(new Error('Owned Redis probe connection failed')); pending=null; socket.destroy(); };
socket.on('error',fail); socket.on('timeout',fail);
const command = args => new Promise((resolve,reject)=>{
  assert.ok(!pending);
  pending={resolve,reject};
  socket.write('*'+args.length+'\r\n'+args.map(value=>'$'+Buffer.byteLength(value)+'\r\n'+value+'\r\n').join(''));
});
const measurements = [];
try {
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',()=>reject(new Error('Owned Redis connect failed')));});
  assert.equal(await command(['AUTH',secret]),'+OK');
  for (const stage of ['burst','spaced']) for (let index=0;index<20;index++) {
    if(stage==='spaced') await new Promise(resolve=>setTimeout(resolve,25));
    const start=performance.now(); const response=await command(['PING']);
    assert.equal(response,'+PONG'); measurements.push({stage,milliseconds:Number((performance.now()-start).toFixed(3))});
  }
} finally {socket.destroy();}
const summary=Object.fromEntries(['burst','spaced'].map(stage=>{
  const values=measurements.filter(value=>value.stage===stage).map(value=>value.milliseconds).sort((a,b)=>a-b);
  return [stage,{count:values.length,min:values[0],median:values[Math.floor(values.length/2)],max:values.at(-1)}];
}));
await fs.writeFile(path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime','d2-redis-latency-20261005-'+output+'.json'),JSON.stringify({summary,measurements,commands:'AUTH and PING only',counterWrites:0},null,2),{flag:'wx'});
console.log('D2_OWNED_REDIS_LATENCY: '+JSON.stringify(summary));
