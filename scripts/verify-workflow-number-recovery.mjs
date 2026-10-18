import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2]);
const directory = path.dirname(statePath);
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
assert.equal(path.basename(statePath), 'state.json');
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(await fs.realpath(state.run), directory);
assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const ownedRedis = await ownedGatewayRedis(state);
assert.equal(ownedRedis('PING'), 'PONG');
const configuration = await fs.readFile(path.resolve(directory, state.processes.find(process => process.name === 'redis').marker), 'utf8');
const password = configuration.match(/^requirepass (.+)$/m)?.[1]?.trim();
assert.ok(password);
const workflow = path.join(root, 'cloudflow-backend/cloudflow-service-workflow');
const dependencies = (await fs.readFile(path.join(workflow, 'target/batch-b-classpath.txt'), 'utf8')).trim();
const classpath = [path.join(workflow, 'src/main/resources'), path.join(workflow, 'target/classes'), dependencies].join(path.delimiter);
const output = path.join(workflow, 'target/number-recovery-checks');
await fs.mkdir(output, { recursive: true });
const logConfig = path.join(output, 'logback.xml');
await fs.writeFile(logConfig, '<configuration><root level="ERROR"/></configuration>');
const source = path.join(root, 'scripts/workflow-checks/WorkflowProcessNumberDatabaseChecks.java');
const compiled = spawnSync('javac.exe', ['-J-Dfile.encoding=UTF-8', '-encoding', 'UTF-8', '-cp', classpath, '-d', output, source],
  { encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(compiled.stdout || ''); process.stderr.write(compiled.stderr || '');
assert.equal(compiled.status, 0, 'Compile current numbering checks after compiling workflow');
const verified = spawnSync('java.exe', ['-Dfile.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai', `-Dlogback.configurationFile=${logConfig}`, '-cp', [output, classpath].join(path.delimiter),
  'WorkflowProcessNumberDatabaseChecks', `jdbc:mysql://127.0.0.1:${state.mysqlPort}/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`,
  path.join(directory, 'mysql-data'), String(state.redisPort)],
{ encoding: 'utf8', windowsHide: true, timeout: 150000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CLOUDFLOW_OWNED_REDIS_PASSWORD: password } });
process.stdout.write(verified.stdout || ''); process.stderr.write(verified.stderr || '');
assert.equal(verified.status, 0, 'Real isolated numbering recovery checks failed');
console.log('WORKFLOW_NUMBER_RECOVERY_EXIT=0; production_modified=false');
