import assert from 'node:assert/strict';
import { a3ExecutionWriteMetadata } from './a3-execution-observation.mjs';
const id = '11111111-2222-4333-8444-555555555555';
const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const secret = 'never-retain-this-payload-value';
const line = (executeNo, status, command = 'SET') => '1790950000.123456 [0 127.0.0.1:51234] "' + command + '" "cloudflow:job:execution:' + executeNo
  + '" ' + (command === 'SET' ? '' : command === 'SETEX' ? '"600" ' : '"600000" ')
  + JSON.stringify(JSON.stringify({ executeStatus: status, affectedRows: 1, resultMsg: secret, exceptionStack: null, durationMs: 5 }))
  + (command === 'SET' ? ' "PX" "600000" "NX"' : '');
let checks = 0;
for (const command of ['SET','SETEX','PSETEX']) for (const status of ['RUNNING','SUCCESS','FAILED','SKIPPED','TIMEOUT']) {
  const result = a3ExecutionWriteMetadata(line(id, status, command), value => value === id);
  assert.deepEqual(result, { at: 1790950000123, port: 51234, executeNo: id, command: 'RESULT_SET', redisCommand: command, status });
  assert.ok(!JSON.stringify(result).includes(secret)); checks += 2;
}
assert.equal(a3ExecutionWriteMetadata(line(other, 'SUCCESS'), value => value === id), null); checks++;
assert.equal(a3ExecutionWriteMetadata(line(id, 'SUCCESS').replace('127.0.0.1', '192.0.2.1'), () => true), null); checks++;
assert.equal(a3ExecutionWriteMetadata(line(id, 'SUCCESS').replace('"SET"', '"GET"'), () => true), null); checks++;
assert.equal(a3ExecutionWriteMetadata(line(id, 'SUCCESS').replace('cloudflow:job:execution:', 'private:credentials:'), () => true), null); checks++;
assert.equal(a3ExecutionWriteMetadata(line(id, 'UNKNOWN'), () => true), null); checks++;
assert.equal(a3ExecutionWriteMetadata('1790950000.1 [0 127.0.0.1:51234] "AUTH" "' + secret + '"', () => true), null); checks++;
for (const command of ['SETEX','PSETEX']) {
  const sample = line(id, 'SUCCESS', command);
  for (const expiry of ['0','-1','oops']) {
    assert.equal(a3ExecutionWriteMetadata(sample.replace(/"600(?:000)?" /, '"' + expiry + '" '), () => true), null); checks++;
  }
  assert.equal(a3ExecutionWriteMetadata(sample.replace(/"600(?:000)?" /, ''), () => true), null); checks++;
  assert.equal(a3ExecutionWriteMetadata(line(other, 'SUCCESS', command), value => value === id), null); checks++;
}
console.log('A3_EXECUTION_OBSERVATION_CHECKS: checks=' + checks + '; failed=0; raw_payload_retained=false; protocol_only=true');
