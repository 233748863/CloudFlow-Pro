import assert from 'node:assert/strict';
import { getRefundApprovalFields, getRefundApproverDescription } from '../src/utils/workflowRefundDisplay';
import { getWorkflowSummaryParts } from '../src/utils/workflowFormDisplay';

export const runRefundApprovalDisplayChecks = (): number => {
  let checks = 0;
  const detail = {
    approvalNo: 'RFD00000000000000000000000000000000', customerName: '客户甲', receivableName: '计划甲',
    receiptEventId: '9223372036854775807', refundAmount: '999999999999.99', currency: 'CNY',
    businessOwnerName: '负责人甲', reason: '<script>保留原文</script>\n分笔退款',
    financeReviewerIds: ['101', '102'], modelDigest: 'internal-evidence', callbackStreamKey: 'internal-callback',
  };
  const original = JSON.stringify(detail);
  const fields = getRefundApprovalFields(detail);
  assert.equal(fields?.length, 7); checks++;
  assert.equal(fields?.find(field => field.key === 'refundAmount')?.value, 'CNY 999999999999.99'); checks++;
  assert.equal(fields?.find(field => field.key === 'receiptEventId')?.value, '#9223372036854775807'); checks++;
  assert.equal(fields?.find(field => field.key === 'reason')?.value, detail.reason); checks++;
  assert.ok(!/internal-|financeReviewerIds|modelDigest/.test(JSON.stringify(fields))); checks++;
  assert.equal(JSON.stringify(detail), original); checks++;
  for (const invalid of [undefined, null, [], 'invalid', {}, { ...detail, reason: {} }, { ...detail, receiptEventId: 12 },
    { ...detail, customerName: '' }, { ...detail, businessOwnerName: null }, { ...detail, currency: 'CNY<script>' }]) {
    assert.equal(getRefundApprovalFields(invalid), null); checks++;
  }
  for (const refundAmount of ['0.00', '-1.00', '0.001', '1e1', 'NaN', '1000000000000.00', 1]) {
    assert.equal(getRefundApprovalFields({ ...detail, refundAmount }), null); checks++;
  }
  assert.equal(getRefundApprovalFields({ ...detail, refundAmount: '0.10' })?.find(field => field.key === 'refundAmount')?.value, 'CNY 0.10'); checks++;
  assert.equal(getRefundApprovalFields({ ...detail, reason: ' ' })?.find(field => field.key === 'reason')?.value, '未填写'); checks++;
  const variables = { businessType: 'crm_refund', refundApproval: detail, _hDefinition: { modelDigest: 'secret' } };
  assert.deepEqual(getWorkflowSummaryParts(variables, 3), ['客户甲', 'CNY 999999999999.99', detail.reason]); checks++;
  assert.deepEqual(getWorkflowSummaryParts(variables, 0), []); checks++;
  assert.deepEqual(getWorkflowSummaryParts({ businessType: 'crm_refund', refundApproval: {} }), ['退款详情待核实']); checks++;
  assert.deepEqual(getWorkflowSummaryParts({ reason: '原有业务' }), ['原有业务']); checks++;
  assert.equal(getRefundApproverDescription('流程变量: customerOwnerApproverIds'), '客户业务负责人'); checks++;
  assert.equal(getRefundApproverDescription('流程变量: financeReviewerIds'), '另一名财务（排除申请人和首审人）'); checks++;
  assert.equal(getRefundApproverDescription('负责人甲'), '负责人甲'); checks++;
  assert.equal(getRefundApproverDescription(undefined), undefined); checks++;
  console.log(`H3_REFUND_APPROVAL_DISPLAY_CHECKS: assertions=${checks}; failed=0; exact_amounts=true; internal_fields_hidden=true`);
  return checks;
};
