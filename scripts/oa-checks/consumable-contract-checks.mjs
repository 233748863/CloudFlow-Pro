import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const frontend = path.join(repository, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const typescript = requireFrontend('typescript');
const source = (relative) => readFileSync(path.join(repository, relative), 'utf8');
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const throws = (action, pattern) => { assert.throws(action, pattern); assertions++; };
const rejects = async (action, pattern) => { await assert.rejects(action, pattern); assertions++; };

let currentUser = { id: '3', tenantId: '100000' };
const storage = new Map();
const sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
let sequence = 0;
const load = (relative, imports) => {
  const filename = path.join(frontend, relative);
  const javascript = typescript.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const exports = {};
  vm.runInNewContext(javascript, {
    exports,
    require: (specifier) => {
      if (!Object.hasOwn(imports, specifier)) throw new Error(`Unexpected test import: ${specifier}`);
      return imports[specifier];
    },
    sessionStorage,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
  }, { filename });
  return exports;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const operations = load('src/services/api/consumableOperation.ts', { '@/utils/authStorage': { getCurrentUserSnapshot: () => currentUser } });
const firstScope = operations.consumableOperationStorageKey('request:issue:50');
same(firstScope, 'oa08:pending:100000:3:request:issue:50', 'operation storage includes both identity dimensions');
const original = { operationKey: 'original-key', version: 1, items: [{ itemId: '9007199254740993', quantity: 2 }], unitPrice: '99999999.99' };
const first = operations.freezeConsumableOperation(firstScope, original);
original.items[0].quantity = 9;
same(plain(first).items[0].quantity, 2, 'stored operation is detached from the form');
same(plain(operations.freezeConsumableOperation(firstScope, { operationKey: 'new-key', quantity: 5 })), plain(first), 'repeated click retains the complete original request');
same(plain(first).unitPrice, '99999999.99', 'money stays decimal text');
same(plain(first).items[0].itemId, '9007199254740993', 'large identifiers stay decimal text');
currentUser = { id: '4', tenantId: '100000' };
check(operations.consumableOperationStorageKey('request:issue:50') !== firstScope, 'different user cannot reuse prior pending operation');
currentUser = { id: '3', tenantId: '100001' };
check(operations.consumableOperationStorageKey('request:issue:50') !== firstScope, 'different tenant cannot reuse prior pending operation');
currentUser = null;
throws(() => operations.consumableOperationStorageKey('request:issue:50'), /请登录/);
currentUser = { id: '3' };
throws(() => operations.consumableOperationStorageKey('request:issue:50'), /信息不完整/);
currentUser = { id: '3', tenantId: '100000' };
operations.completeConsumableOperation(firstScope);
same(operations.readConsumableOperation(firstScope), null, 'confirmed completion removes only the stored request');
check(operations.newConsumableOperationKey() !== operations.newConsumableOperationKey(), 'new business actions receive new keys');

const calls = [];
let loseResponse = true;
let fetched = 0;
let purchaseVersion = 7;
const transport = {
  get: async (url) => { fetched++; return { id: '9007199254740993', version: purchaseVersion, expectedDate: '2026-09-14', items: [] }; },
  post: async (url, body) => {
    calls.push({ url, body: plain(body) });
    if (loseResponse) throw new Error('simulated response loss');
    return { operationKey: body.operationKey, replayed: true, ledgerIds: ['9007199254740999'], rows: [] };
  },
};
const purchases = load('src/services/api/purchase.ts', {
  './request': transport,
  './consumableOperation': operations,
  '@/utils/dateFormat': { toBackendDateString: (value) => value },
});
const receipt = { remark: 'actual receipt', items: [{ itemId: '9007199254740995', quantity: 1 }, { itemId: '9007199254740994', quantity: 2 }] };
await rejects(() => purchases.purchaseRequestApi.receipt('9007199254740993', receipt), /simulated response loss/);
same(fetched, 1, 'first receipt fetches the real source version');
check(!!purchases.getPendingConsumableReceipt('9007199254740993'), 'a lost response preserves the receipt');
purchaseVersion = 10;
await rejects(() => purchases.purchaseRequestApi.receipt('9007199254740993', { ...receipt, items: [{ itemId: '9007199254740995', quantity: 9 }] }), /上一笔收货尚未确认/);
same(calls.length, 1, 'changed quantity is rejected before another request');
loseResponse = false;
const replayed = await purchases.purchaseRequestApi.receipt('9007199254740993', { ...receipt, items: [...receipt.items].reverse() });
same(fetched, 1, 'retry never replaces the original source version');
same(calls[1], calls[0], 'retry sends the byte-equivalent original payload');
same(replayed.ledgerIds, ['9007199254740999'], 'receipt preserves original string ledger identifiers');
same(purchases.getPendingConsumableReceipt('9007199254740993'), null, 'successful replay clears pending receipt');
loseResponse = true;
await rejects(() => purchases.purchaseRequestApi.receipt('9007199254740993', receipt), /simulated response loss/);
same(calls[2].body.purchaseVersion, 10, 'next business action uses the new source version');
check(calls[2].body.operationKey !== calls[0].body.operationKey, 'next business action does not reuse the completed key');
purchases.clearConsumableReceiptAfterVerification('9007199254740993');
same(purchases.getPendingConsumableReceipt('9007199254740993'), null, 'explicit verified discard is available to the source UI');

for (const component of ['ConsumableLedgerPage', 'ConsumableReportsPage', 'ConsumableRequestPage']) {
  const page = source(`cloudflow-frontend/src/pages/admin/${component}.tsx`);
  check(page.includes(`export default function ${component}(`), `menu component matches real export: pages/admin/${component}`);
  check(page.includes('hasPermission'), `${component} checks real permissions`);
  check(page.includes('useConsumablePage'), `${component} reads real paged APIs`);
}
const ledgerPage = source('cloudflow-frontend/src/pages/admin/ConsumableLedgerPage.tsx');
check(ledgerPage.includes('ConsumablePurchaseSourceDialog'), 'ledger exposes source receipt verification');
const sourceDialog = source('cloudflow-frontend/src/pages/admin/consumable/ConsumablePurchaseSourceDialog.tsx');
check(sourceDialog.includes('purchaseRequestApi.receipts') && sourceDialog.includes('row.reversed'), 'source UI displays actual receipt reversal status');
check(sourceDialog.includes('clearConsumableReceiptAfterVerification') && sourceDialog.includes('pending'), 'source UI can resolve a verified pending operation');
const reporting = source('cloudflow-frontend/src/pages/admin/ConsumableReportsPage.tsx');
check(reporting.includes('Number.isSafeInteger') && reporting.includes('graphRow'), 'quantity chart refuses unsafe aggregates and uses one material');
check(!/parseFloat\(/.test(reporting), 'report never calculates money with floats');
const requestPage = source('cloudflow-frontend/src/pages/admin/ConsumableRequestPage.tsx');
check(requestPage.includes('onDiscard={mutation.discard}'), 'approval submission also supports explicit retry resolution');

const schema = source('cloudflow-backend/DB/04.cloudflow-oa.sql');
for (const table of ['oa_consumable_ledger', 'oa_consumable_request', 'oa_consumable_request_item']) {
  same((schema.match(new RegExp(`CREATE TABLE\\s+${table}\\s*\\(`, 'g')) ?? []).length, 1, `exactly one table definition: ${table}`);
}
for (const index of ['uk_consumable_ledger_operation', 'uk_consumable_ledger_source', 'uk_consumable_ledger_log', 'uk_consumable_ledger_reversal']) {
  check(schema.includes(`UNIQUE KEY ${index}`), `durable ledger uniqueness: ${index}`);
}
const ledgerSql = source('cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/OaConsumableLedgerMapper.xml');
check(!/<(?:update|delete)\s/.test(ledgerSql), 'ledger mapper has no mutation or deletion mapping');
const approvals = source('cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/ConsumableApprovalService.java');
check(approvals.includes('"_hExcludedUserIds"') && approvals.includes('getApproverId()'), 'OA freezes excluded users and checks real callback actor');
const jobs = source('cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/job/OaConsumableJobs.java');
for (const name of ['oaConsumableStockWarning', 'oaConsumableStockRecalculate']) {
  check(jobs.includes(`public void ${name}()`), `no-argument job handler signature: ${name}`);
  check(jobs.includes(`@JobHandler(value = "${name}"`), `job handler is registered: ${name}`);
}
check(!jobs.includes('@Scheduled'), 'OA maintenance uses the managed scheduler');
console.log(`PASS: ${assertions} OA-08 client/schema contracts; no network, database, service or Maven target writes`);
