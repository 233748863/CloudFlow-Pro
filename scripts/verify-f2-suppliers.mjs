import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyF2SupplierFoundation } from './verify-f2-supplier-foundation.mjs';
import { verifyF2SupplierPurchasing } from './verify-f2-supplier-purchasing.mjs';
import { verifyF2SupplierGovernance } from './verify-f2-supplier-governance.mjs';
import { verifyF2SupplierInterface } from './verify-f2-supplier-ui.mjs';

export async function verifyF2Suppliers(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, evidence } = context;
  assert.equal(state.verification?.mode, 'F2_SUPPLIERS_INDEPENDENT');
  const marker = 'F2_' + caseTag;
  const quote = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, timeout = 90000) => {
    const deadline = Date.now() + timeout;
    do { const result = await read(); if (accept(result)) return result; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const text = String(value); assert.match(text, /^-?\d+(?:\.\d{1,2})?$/);
    const negative = text.startsWith('-'); const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
    return (negative ? -1n : 1n) * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  };
  const get = async (target, page = admin) => successful(await api(page, target), target);
  const lastPosts = new WeakMap();
  const post = async (target, body = {}, page = admin) => {
    const history = lastPosts.get(page) || new Map(); lastPosts.set(page, history);
    const key = target + ':' + JSON.stringify(body);
    const pause = 5200 - (Date.now() - (history.get(key) || 0)); if (pause > 0) await sleep(pause);
    const result = await api(page, target, { method: 'POST', body }); history.set(key, Date.now());
    return successful(result, target);
  };
  const reject = (result, label, expectedBusinessMessage) => check(label,
    ([400, 401, 403, 404, 409].includes(result.status)
      || result.status === 200 && [400, 401, 403, 404, 409].includes(result.body?.code))
    && (expectedBusinessMessage == null || result.body?.msg === expectedBusinessMessage));
  const today = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d');");
  const shifted = amount => {
    assert.ok(Number.isInteger(amount));
    return database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} DAY),'%Y-%m-%d');`);
  };
  const month = amount => {
    assert.ok(Number.isInteger(amount));
    return rows(`SELECT JSON_OBJECT('start',DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} MONTH),'%Y-%m-01'),
      'end',DATE_FORMAT(LAST_DAY(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} MONTH)),'%Y-%m-%d'));`)[0];
  };
  const other = await session('g_import_other');
  const outsider = await session('g_import_tenant');
  const readonly = await session('g_import_readonly');
  const employee = await session('g_holiday_employee');
  const secretPath = path.join(directory, 'private/h3-core-secrets.json');
  const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
  const remember = async value => { if (value) secrets.add(value); await fs.writeFile(secretPath, JSON.stringify([...secrets])); };
  for (const page of [admin, other, outsider, readonly, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); await remember(token.replace(/^Bearer /, ''));
  }
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const messageBefore = database('SELECT COALESCE(MAX(record_id),0) FROM sys_message_record;');
  let sequence = 0;
  const supplier = (id, page = admin) => get('/oa/supplier/' + id, page);
  const createSupplier = async (suffix, extra = {}, page = admin) => {
    const serial = ++sequence;
    const input = { supplierName: marker + '_' + suffix, supplierCode: marker + '_' + serial,
      creditCode: 'F2' + caseTag.toUpperCase() + String(serial).padStart(4, '0'), supplierType: 'MANUFACTURER',
      status: 'ACTIVE', currency: 'CNY', ...extra };
    await post('/oa/supplier', input, page);
    const found = (await get('/oa/supplier/list?pageNum=1&pageSize=100&supplierName=' + encodeURIComponent(input.supplierName), page)).records
      .filter(value => value.supplierCode === input.supplierCode);
    check('AC-1 创建供应商后从真实列表定位唯一记录', found.length === 1 && found[0].supplierId != null);
    return supplier(found[0].supplierId, page);
  };
  const changeSupplier = async (value, patch, page = admin) => {
    successful(await api(page, '/oa/supplier', { method: 'PUT', body: { ...value, ...patch } }), '真实修改供应商');
    return supplier(value.supplierId, page);
  };
  const createCategory = async (suffix, patch = {}, page = admin) => {
    const id = await post('/oa/supplier/categories', { categoryCode: marker + '_' + suffix,
      categoryName: marker + '_' + suffix, parentId: 0, status: 'ACTIVE', sortNo: 1, ...patch }, page);
    return (await get('/oa/supplier/categories', page)).find(value => String(value.categoryId) === String(id));
  };
  const qualifications = id => get(`/oa/supplier/${id}/qualifications`);
  const saveQualification = async input => {
    const id = await post('/oa/supplier/qualifications', input);
    return (await qualifications(input.supplierId)).find(value => String(value.qualificationId) === String(id));
  };
  const createQualification = (value, suffix, patch = {}) => saveQualification({ supplierId: value.supplierId,
    qualificationType: 'BUSINESS_LICENSE', certName: marker + '_' + suffix, certNo: marker + '_' + suffix,
    issueOrg: '本机验收机构', issueDate: shifted(-30), expireDate: shifted(30), longTermFlag: 0, reminderDays: 7, ...patch });
  const verifyQualification = async (value, accepted = true, reason = '') => {
    await post(`/oa/supplier/qualifications/${value.qualificationId}/verify`, { accepted, reason });
    return (await qualifications(value.supplierId)).find(row => String(row.qualificationId) === String(value.qualificationId));
  };
  const cards = id => get('/oa/supplier/scorecards?supplierId=' + id + '&pageNum=1&pageSize=100');
  const card = async (supplierId, id) => (await cards(supplierId)).rows.find(value => String(value.scorecardId) === String(id));
  const criteria = id => get(`/oa/supplier/scorecards/${id}/criteria`);
  const fourCriteria = score => [
    { criteriaCode: 'DELIVERY_ON_TIME', criteriaName: '交付及时率', weight: '0.3000', score, maxScore: '100.00', dataSource: 'MANUAL' },
    { criteriaCode: 'QUALITY', criteriaName: '质量合格率', weight: '0.3000', score, maxScore: '100.00', dataSource: 'MANUAL' },
    { criteriaCode: 'PRICE', criteriaName: '价格竞争力', weight: '0.2000', score, maxScore: '100.00', dataSource: 'MANUAL' },
    { criteriaCode: 'SERVICE', criteriaName: '服务响应', weight: '0.2000', score, maxScore: '100.00', dataSource: 'MANUAL' },
  ];
  const saveCard = async (value, period, items, previous = null) => {
    const id = await post('/oa/supplier/scorecards', { scorecard: { ...previous, supplierId: value.supplierId,
      periodType: 'MONTHLY', periodStart: period.start, periodEnd: period.end, remark: marker + '_评分' }, criteria: items });
    return card(value.supplierId, id);
  };
  const confirmCard = async (value, page = admin) => { await post(`/oa/supplier/scorecards/${value.scorecardId}/confirm`, {}, page); return supplier(value.supplierId); };
  const messages = () => rows(`SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'recipient',CAST(receiver_id AS CHAR),'title',title,
    'content',content,'status',send_status,'channel',channel_type,'businessType',biz_type,'businessId',biz_id)
    FROM sys_message_record WHERE tenant_id=100000 AND record_id>${messageBefore} AND content LIKE ${quote('%' + marker + '%')} ORDER BY record_id;`);
  const ctx = { ...context, marker, quote, rows, sleep, waitFor, cents, get, post, reject, today, shifted, month,
    other, outsider, readonly, employee, secrets, remember, auditBefore, messageBefore, messages,
    supplier, createSupplier, changeSupplier, createCategory, qualifications, saveQualification, createQualification,
    verifyQualification, cards, card, criteria, fourCriteria, saveCard, confirmCard };
  try {
    await verifyF2SupplierFoundation(ctx);
    await verifyF2SupplierPurchasing(ctx);
    await verifyF2SupplierGovernance(ctx);
    const auditRows = rows(`SELECT JSON_OBJECT('id',CAST(audit_id AS CHAR),'name',audit_name,'operator',create_by,'risk',high_risk,
      'before',before_json,'after',after_json,'diff',diff_json) FROM sys_audit_log WHERE tenant_id=100000 AND audit_id>${auditBefore}
      AND audit_name IN ('确认供应商评分','提交供应商治理审批','供应商治理审批通过','供应商治理审批驳回','供应商准入拦截');`);
    const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
    const parsed = auditRows.map(value => ({ ...value, before: decode(value.before), after: decode(value.after), diff: decode(value.diff) }));
    const scoreAudits = parsed.filter(value => value.name === '确认供应商评分');
    const expectedConfirmedCards = Number(database("SELECT COUNT(*) FROM oa_supplier_scorecard card JOIN oa_supplier supplier"
      + " ON supplier.supplier_id=card.supplier_id AND supplier.tenant_id=card.tenant_id WHERE card.tenant_id=100000"
      + " AND card.status='CONFIRMED' AND card.deleted=0 AND supplier.supplier_name LIKE " + quote(marker + '%') + ";"));
    const submissions = parsed.filter(value => value.name === '提交供应商治理审批');
    const decisions = parsed.filter(value => ['供应商治理审批通过', '供应商治理审批驳回'].includes(value.name));
    const admissionAudits = parsed.filter(value => value.name === '供应商准入拦截');
    const auditObservations = [
      { name: 'AC-15/18 核心审计包含评分确认、治理提交及审批结果', passed: ['确认供应商评分','提交供应商治理审批','供应商治理审批通过','供应商治理审批驳回']
        .every(name => parsed.some(value => value.name === name)) },
      { name: 'AC-15/18 核心审计保存供应商编号、操作者及真实变更前后状态', passed: parsed.length > 0
        && parsed.every(value => value.operator && value.before?.supplierId && value.after?.supplierId
          && String(value.before.supplierId) === String(value.after.supplierId)) },
      { name: 'NFR/AC-18 被拒绝的供应商准入实际保留独立审计', passed: parsed.some(value => value.name === '供应商准入拦截') },
      { name: 'NFR/AC-9 每张实际确认评分卡只记一次真实状态变化', passed: expectedConfirmedCards > 0
        && scoreAudits.length === expectedConfirmedCards
        && new Set(scoreAudits.map(value => String(value.after?.state?.scorecard?.scorecardId))).size === expectedConfirmedCards
        && scoreAudits.every(value => value.before?.state?.scorecard?.status === 'DRAFT'
          && value.after?.state?.scorecard?.status === 'CONFIRMED'
          && String(value.before.state.scorecard.scorecardId) === String(value.after.state.scorecard.scorecardId)) },
      { name: 'NFR/AC-9 旧周期确认保留当前供应商状态并记录实际评分卡变化', passed: scoreAudits.some(value =>
        value.after?.details?.currentRatingUpdated === false
        && JSON.stringify(value.before.state.supplier) === JSON.stringify(value.after.state.supplier)) },
      { name: 'NFR/AC-15 治理提交保存实际申请人与冻结审批状态', passed: submissions.length > 0
        && submissions.every(value => String(value.after?.operatorId) === '990000701'
          && value.before?.state?.supplier?.instanceId == null && value.after?.state?.supplier?.instanceId
          && value.after?.details?.action && value.after?.details?.reason) },
      { name: 'NFR/AC-15 审批结果记录真实审批人并与已清空的实例状态一致', passed: decisions.length > 0
        && decisions.every(value => String(value.after?.operatorId) === '990000702'
          && value.after?.approval?.processInstanceId === value.before?.state?.supplier?.instanceId
          && value.after?.state?.supplier?.instanceId === null) },
      { name: 'NFR/AC-18 准入拒绝保留实际采购场景、操作者和原因且供应商状态不变', passed: admissionAudits.length > 0
        && admissionAudits.every(value => String(value.after?.operatorId) === '990000701'
          && value.after?.details?.scene === 'PURCHASE' && value.after?.details?.reason
          && JSON.stringify(value.before.state) === JSON.stringify(value.after.state)) },
    ];
    await fs.writeFile(path.join(directory, `f2-audit-observations-${caseTag}.json`), JSON.stringify({ observations: auditObservations, records: parsed }, null, 2), { flag: 'wx' });
    for (const observation of auditObservations) check(observation.name, observation.passed);
    evidence.audit = true;
    await verifyF2SupplierInterface(ctx);
    check('F2 证据保留真实业务请求且不记录文件签名', context.requests.length > 0
      && context.requests.every(value => !value.path.includes('?') && !value.path.includes('previewToken=')));
    await remember();
  } catch (error) {
    await admin.screenshot({ path: path.join(directory, `f2-suppliers-failure-${caseTag}.png`), fullPage: true }).catch(() => {});
    throw error;
  }
}
