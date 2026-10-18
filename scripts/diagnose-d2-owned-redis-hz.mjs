import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = 'D:/CloudFlowPro';
const round = process.argv[2];
assert.match(round || '', /^r[1-9][0-9]*$/);
const state = JSON.parse((await fs.readFile(path.join(root,'.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'),'utf8')).replace(/^\uFEFF/,''));
const redis = await ownedGatewayRedis(state);
const getHz = () => { const parts=redis('CONFIG','GET','hz').split(/\r?\n/); assert.equal(parts[0],'hz'); return Number(parts[1]); };
const original = getHz();
assert.equal(original,10,'Expected original isolated Redis event frequency');
const evidence=path.join(root,'.cloudflow-runtime/full-prd-20260915/approved-runtime','d2-redis-hz-20261005-'+round+'.json');
await fs.writeFile(evidence,JSON.stringify({original,temporary:100,restored:false},null,2),{flag:'wx'});
let status;
try {
  assert.equal(redis('CONFIG','SET','hz','100'),'OK'); assert.equal(getHz(),100);
  const child=spawnSync(process.execPath,['scripts/diagnose-d2-owned-redis-latency.mjs',round],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000});
  status=child.status;
  for(const line of (child.stdout || '').split(/\r?\n/)) if(line.startsWith('D2_OWNED_REDIS_LATENCY:')) console.log(line);
} finally {
  assert.ok([original,100].includes(getHz()),'Another writer changed Redis frequency');
  assert.equal(redis('CONFIG','SET','hz',String(original)),'OK'); assert.equal(getHz(),original);
  await fs.writeFile(evidence,JSON.stringify({original,temporary:100,restored:true,status,keysDeleted:0,persistentConfigurationChanged:false},null,2));
  console.log('D2_OWNED_REDIS_HZ_RESTORED: hz='+original+'; key_deletion=0; persistent_config_changed=false');
}
assert.equal(status,0,'Isolated Redis latency probe failed; original setting restored');
