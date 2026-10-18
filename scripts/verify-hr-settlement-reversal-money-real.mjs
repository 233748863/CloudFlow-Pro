import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Operates only after real reverse money has restored the sources.
export async function verifyReversalMoneyBoundaries(context) {
  const { admin, hr, finance, employee, api, successful, database, check, id, row, state, requests, evidence } = context;
  const root = `/hr/settlement/${id}`;
  const post = (actor, endpoint, body) => api(actor, endpoint, { method: 'POST', body });
  const rejected = (result, label) => check(`${label} HTTP=${result.status}`, [400,401,403,404,409,422].includes(result.status) && result.body?.code !== 200);
  assert.equal(row.status, 'PAID');
  if (row.funds.direction === 'PAYMENT') {
    const payment = String(row.funds.paymentRequestId); assert.match(payment, /^[1-9]\d*$/);
    const payload = JSON.parse(database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')) FROM outbox_event WHERE tenant_id=100000 AND event_type='HR_SETTLEMENT_PAYMENT_PAID' AND aggregate_id=${payment};`));
    const port = Number(state.services.find(service => service.name === 'hr')?.port); assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
    const replay = async (body, headers = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}/inner/hr/settlement/payment-event`, { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000', ...headers,
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const result = { status: response.status, body: await response.json() };
      requests.push({ path: '/inner/hr/settlement/payment-event', method: 'POST', status: result.status, code: result.body?.code }); return result;
    };
    successful(await replay(payload), '实际补付款事件重放保持原事实');
    rejected(await replay({ ...payload, amount: '0.01' }), '冲正补付款通知拒绝金额伪造');
    rejected(await replay(payload, { 'X-Tenant-Id': '100001' }), '冲正补付款事件拒绝跨租户重放');
    rejected(await replay(payload, { 'X-From-Service': 'cloudflow-service-crm' }), '冲正补付款拒绝冒充资金来源');
    rejected(await post(employee, '/hr/inner/hr/settlement/payment-event', payload), '员工不能调用冲正内部入账入口');
    evidence.reversalPaymentReplay = true;
  } else if (row.funds.direction === 'RECEIPT') {
    const proofId = String(row.funds.proofFileId); assert.match(proofId, /^[1-9]\d*$/);
    const proof = await api(finance, `${root}/proof/${proofId}`);
    const expected = Buffer.from('%PDF-1.7\nactual-receipt-fixture\n%%EOF');
    check('冲正实际退款凭据完整下载且禁止缓存', proof.status === 200 && proof.size === expected.length
      && proof.sha256 === createHash('sha256').update(expected).digest('hex') && proof.contentType.includes('application/pdf')
      && proof.nosniff === 'nosniff' && typeof proof.cacheControl === 'string'
      && proof.cacheControl.split(',').every(value => value.trim().toLowerCase() === 'no-store'));
    rejected(await api(admin, `/auth/system/file/${proofId}/content`), '通用文件入口不能绕过冲正退款凭据保护');
    rejected(await api(employee, `${root}/proof/${proofId}`), '离职本人不能读取冲正退款凭据');
    rejected(await post(hr, `${root}/receipt`, { version: row.version, proofFileId: proofId, actualDate: row.funds.actualDate }), '人事不能重放财务退款确认');
    await new Promise(resolve => setTimeout(resolve, 5100));
    successful(await post(finance, `${root}/receipt`, { version: row.version, proofFileId: proofId, actualDate: row.funds.actualDate }), '实际退款重复确认保持原事实');
    evidence.reversalPrivateProof = true;
  } else {
    assert.equal(row.funds.direction, 'NETTING');
    check('零净额冲正留抵销证据且无付款或收款凭据', row.funds.paymentRequestId == null && row.funds.proofFileId == null
      && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(calculation_snapshot,'$.funds.kind')) FROM hr_final_settlement WHERE tenant_id=100000 AND settlement_id=${id};`) === 'NETTING');
  }
  const latest = successful(await api(admin, root), '核对反向资金重放后的结算');
  check('反向资金重放及越权尝试不重复入账或改变金额', latest.version === row.version && latest.netAmount === row.netAmount
    && JSON.stringify(latest.items) === JSON.stringify(row.items)
    && database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_SETTLEMENT' AND business_id=${id} AND operation_type='FUNDS_RECOGNIZED';`) === '1');
}
