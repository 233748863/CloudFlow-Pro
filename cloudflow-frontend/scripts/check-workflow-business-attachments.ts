import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/workflowBusinessAttachments.ts', import.meta.url), 'utf8');
const compiled = { exports: {} as Record<string, (value?: Record<string, unknown>) => any> };
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { module: compiled, exports: compiled.exports });
const run = compiled.exports.getWorkflowBusinessAttachments;
let checks = 0;
function check(label: string, body: () => void) { body(); checks++; console.log(`PASS ${label}`); }
check('registered workflow types preserve their exact business binding', () => {
  for (const [businessType, bizType] of [['purchase_request', 'OA_PURCHASE_REQUEST'], ['payment_request', 'OA_PAYMENT_REQUEST'],
    ['business_trip', 'OA_BUSINESS_TRIP'], ['seal_application', 'OA_SEAL_APPLICATION'], ['seal_renewal', 'OA_SEAL_RENEWAL'],
    ['license_borrow', 'OA_LICENSE_BORROW'], ['license_renewal', 'OA_LICENSE_RENEWAL'], ['biz_contract', 'OA_CONTRACT'], ['KNOWLEDGE_DOCUMENT', 'OA_KNOWLEDGE']]) {
    const result = run({ attachmentUrl: '  oa-file:attachment:27  ', businessType, businessId: '27' });
    assert.equal(result.value, 'oa-file:attachment:27'); assert.equal(result.downloadContext.bizType, bizType);
    assert.equal(result.downloadContext.bizId, '27'); assert.equal(result.downloadContext.slot, bizType === 'OA_CONTRACT' ? 'attachment' : undefined);
  }
});
check('missing attachments produce no download surface', () => {
  for (const attachmentUrl of [undefined, null, '', '  ', [], {}]) assert.equal(Object.keys(run({ attachmentUrl })).length, 0);
  assert.equal(Object.keys(run()).length, 0);
});
check('unknown or absent business types never fall back to public access', () => {
  for (const businessType of [undefined, 'PUBLIC', 'purchase_request ', 'PURCHASE_REQUEST', '__proto__']) {
    const result = run({ attachmentUrl: 'oa-file:attachment:27', businessType, businessId: '27' });
    assert.equal(result.value, 'oa-file:attachment:27'); assert.equal(result.downloadContext, undefined);
  }
});
check('invalid or imprecise identifiers never create download context', () => {
  for (const businessId of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '', ' 27', '27 ', '01', '1e3', '9223372036854775808', {}, true]) {
    assert.equal(run({ attachmentUrl: 'oa-file:attachment:27', businessType: 'purchase_request', businessId }).downloadContext, undefined);
  }
});
check('safe numeric and full signed long string ids retain exact values', () => {
  for (const businessId of [27, Number.MAX_SAFE_INTEGER, '9223372036854775807']) {
    assert.equal(run({ attachmentUrl: 'oa-file:attachment:27', businessType: 'purchase_request', businessId }).downloadContext.bizId, String(businessId));
  }
});
console.log(`WORKFLOW_BUSINESS_ATTACHMENTS_BASIC: checks=${checks}; failed=0; production-function=true; http=false; browser=false; artifacts=none`);
