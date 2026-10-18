import assert from 'node:assert/strict';
import { verifyReceivableProtectionInterface } from './verify-receivable-protection-h3-ui.mjs';
import { verifyReceivableInvoiceEntry, verifyReceivableInvoiceInterface } from './verify-receivable-invoice-entry-h3.mjs';
import { verifySelectedReceiptRefund } from './verify-receipt-refund-h3-real.mjs';
import { verifyReceivableTeam } from './verify-receivable-team-h3-real.mjs';

export async function verifyReceivableProtection(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const sales = await session('g_opportunity_sales');
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const adminId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';"));
  const grants = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  const today = database("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d');");
  const reject = (result, label, pattern = /回款|到账|收款|日期|核销|金额|版本|发票|客户|合同|说明|ID|修改|无权|禁止|不存在|频繁|重复/) => {
    const message = result.body?.msg || result.body?.message || '';
    check(`${label} HTTP=${result.status} code=${result.body?.code} message=${message}`,
      ([400, 403, 404, 409, 503].includes(result.status) || result.status === 200 && result.body?.code === 500)
      && result.body?.code !== 200 && pattern.test(message));
  };
  const forbidden = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === 403 && result.body?.code === 403);
  const read = async (id, page = admin) => successful(await api(page, `/crm/receivable/${id}`), '读取真实应收');
  const createCustomer = async suffix => {
    const name = `H3_RP_${caseTag}_${suffix}`;
    successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode: name, customerName: name, ownerId: adminId } }), '真实创建应收客户');
    const id = database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${literal(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return Number(id);
  };
  const customerId = await createCustomer('customer');
  const create = async (suffix, amount = '100.01', changes = {}) => {
    const name = `H3_RP_${caseTag}_${suffix}`;
    successful(await api(admin, '/crm/receivable', { method: 'POST', body: {
      receivableNo: name, receivableName: name, customerId, plannedAmount: amount, ownerId: adminId,
      customerName: '客户端伪造客户', ownerName: '客户端伪造负责人', ...changes,
    } }), '真实创建回款计划');
    const id = database(`SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=${literal(name)} AND deleted=0;`);
    assert.match(id, /^\d+$/);
    return read(Number(id));
  };
  const edit = async (record, changes) => {
    successful(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...record, ...changes } }), '真实编辑应收计划');
    return read(record.receivableId);
  };
  const assertAmounts = async (id, planned, received, outstanding, label) => {
    const row = await read(id);
    check(label, Number(row.plannedAmount) === planned && Number(row.receivedAmount) === received && Number(row.outstandingAmount) === outstanding);
    return row;
  };
  let record = await create('primary');
  check('真实HR及客户快照替换客户端伪造姓名且返回当前版本', record.version === 0 && record.ownerName === '导入验收负责人'
    && record.customerName === `H3_RP_${caseTag}_customer` && record.bindingLocked === false);
  const listing = successful(await api(admin, `/crm/receivable/list?customerId=${customerId}`), '读取真实应收列表');
  check('真实分页列表包含版本及绑定限制', listing.rows.find(row => row.receivableId === record.receivableId)?.version === 0);
  if (context.refundOnly) {
    await verifySelectedReceiptRefund({ ...context, sales, employee, foreign, create, read, reject, today, adminId });
    check('真实退款验证前后EMPLOYEE完整授权逐条一致', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
    return;
  }
  if (context.teamsOnly) {
    await verifyReceivableTeam({ ...context, sales, employee, foreign, create, read, reject, today, adminId, customerId, createCustomer });
    check('真实回款团队验证前后EMPLOYEE完整授权逐条一致', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
    return;
  }
  const count = () => database(`SELECT COUNT(*) FROM crm_receivable WHERE tenant_id=100000 AND customer_id=${customerId};`);
  const before = count();
  for (const [label, changes] of [
    ['禁止新增伪造到账', { receivedAmount: '1' }], ['禁止新增伪造余额', { outstandingAmount: '0' }],
    ['禁止新增伪造收款日期', { receivedDate: today }], ['禁止新增伪造收款状态', { status: 'RECEIVED' }],
    ['禁止新增伪造发票核销', { invoiceStatus: 'WRITEOFF_FULL' }], ['禁止新增直接绑定发票', { invoiceId: 99001001 }],
    ['拒绝负计划金额', { plannedAmount: '-0.01' }], ['拒绝超过分的计划金额', { plannedAmount: '0.001' }],
    ['拒绝超出十二位整数的金额', { plannedAmount: '1000000000000' }], ['拒绝指定应收主键', { receivableId: 99001001 }],
  ]) reject(await api(admin, '/crm/receivable', { method: 'POST', body: { customerId, receivableName: `H3_RP_${caseTag}_${label}`, plannedAmount: '100.01', ...changes } }), label);
  check('全部非法新增均未插入业务记录', count() === before);
  for (const [label, changes] of [
    ['普通编辑不能改到账', { receivedAmount: '1' }], ['普通编辑不能改余额', { outstandingAmount: '0' }],
    ['普通编辑不能改收款状态', { status: 'RECEIVED' }], ['普通编辑不能改发票', { invoiceId: 99001001 }],
    ['缺少页面版本不能保存', { version: undefined }],
  ]) reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...record, ...changes } }), label);
  const initial = record;
  record = await edit(record, { plannedAmount: '150.12', remark: '计划说明保持独立' });
  await assertAmounts(record.receivableId, 150.12, 0, 150.12, '普通修改金额自动重算剩余未收');
  reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...initial, plannedAmount: '200' } }), '过期页面不能覆盖新计划');
  reject(await api(admin, `/crm/receivable/${record.receivableId}/confirm`, { method: 'POST', body: {} }), '真实确认必须提供页面版本');
  const partial = { version: record.version, amount: '40.12', writeoffDate: today, remark: '本次实际收款' };
  successful(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: partial }), '真实部分核销到账');
  record = await assertAmounts(record.receivableId, 150.12, 40.12, 110, '部分核销只增加本次金额');
  check('CRM收款不伪造OA发票核销状态且保留计划说明', record.invoiceStatus === 'NONE' && record.remark === '计划说明保持独立');
  reject(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: partial }), '重复部分核销不能重复到账');
  for (const [label, changes] of [
    ['拒绝超额核销', { amount: '110.01' }], ['拒绝负核销金额', { amount: '-0.01' }],
    ['拒绝超精度核销金额', { amount: '0.001' }], ['拒绝未来实际到账', { amount: '1', writeoffDate: '2099-01-01' }],
  ]) reject(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: { ...partial, version: record.version, ...changes } }), label);
  reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...record, plannedAmount: '40.11' } }), '计划不能低于已到账金额');
  const otherCustomer = await createCustomer('other');
  reject(await api(admin, '/crm/receivable', { method: 'PUT', body: { ...record, customerId: otherCustomer } }), '已有到账不能换客户');
  reject(await api(admin, `/crm/customer/${otherCustomer}/workspace/receivable/${record.receivableId}/confirm`, { method: 'POST', body: { version: record.version } }), '客户工作台不能确认别的客户回款');
  const simultaneous = await Promise.all([
    api(admin, `/crm/receivable/${record.receivableId}/confirm`, { method: 'POST', body: { version: record.version } }),
    api(admin, `/crm/customer/${customerId}/workspace/receivable/${record.receivableId}/confirm`, { method: 'POST', body: { version: record.version } }),
  ]);
  check('应收与客户工作台两条真实入口竞争只成功一次', simultaneous.filter(value => value.status === 200 && value.body?.code === 200).length === 1);
  const settled = await assertAmounts(record.receivableId, 150.12, 150.12, 0, '并发全额确认只收当前剩余110');
  check('真实确认只有一次增量审计且版本仅增加一次', settled.version === record.version + 1
    && database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_name='CRM_RECEIVABLE_CONFIRMED' AND audit_field=${literal(`CRM_RECEIVABLE:${record.receivableId}`)} AND after_val LIKE '%110.00%';`) === '1');
  reject(await api(admin, `/crm/receivable/${record.receivableId}`, { method: 'DELETE' }), '已到账记录不能删除');
  evidence.concurrency = true;
  check('员工保留原842新增计划权限且未获确认编辑删除退款权限', database("SELECT COUNT(*) FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 AND menu_id=842;") === '1'
    && database("SELECT COUNT(*) FROM sys_role_menu roles JOIN sys_menu menu ON menu.menu_id=roles.menu_id WHERE roles.tenant_id=100000 AND roles.role_id=5 AND menu.perms IN ('crm:receivable:edit','crm:receivable:remove','crm:receivable:confirm','crm:approval:refund');") === '0');
  const employeeBefore = count();
  reject(await api(employee, '/crm/receivable', { method: 'POST', body: { customerId, receivableName: 'employee', plannedAmount: 1 } }),
    '员工既有新增权限不能写入他人客户', /无权|不存在/);
  check('员工越范围新增被拒绝且未插入回款计划', count() === employeeBefore);
  for (const [requestPath, options, label] of [
    [`/crm/receivable/${record.receivableId}`, {}, '员工不能读取应收'],
    ['/crm/receivable', { method: 'PUT', body: settled }, '员工不能修改应收'],
    [`/crm/receivable/${record.receivableId}`, { method: 'DELETE' }, '员工不能删除应收'],
    [`/crm/receivable/${record.receivableId}/confirm`, { method: 'POST', body: { version: settled.version } }, '员工不能确认到账'],
    [`/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: { version: settled.version, amount: 1 } }, '员工不能核销'],
    ['/crm/approval/refund', { method: 'POST', body: { receivableId: record.receivableId, refundAmount: 1, reason: 'not allowed' } }, '员工不能发起退款'],
  ]) forbidden(await api(employee, requestPath, options), label);
  reject(await api(sales, `/crm/receivable/${record.receivableId}`), '同租户其他负责人不能读取此应收');
  reject(await api(foreign, `/crm/receivable/${record.receivableId}`), '跨租户不能读取此应收');
  const inner = await api(admin, `/crm/inner/crm/receivable/${record.receivableId}/invoice-status`, {
    method: 'POST', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa' }, body: { invoiceId: 99001001, invoiceStatus: 'WRITEOFF_FULL' },
  });
  check('外部请求伪造内部发票来源头仍被拦截', [403, 404].includes(inner.status));
  evidence.permissions = true;
  const earlier = await create('delete_earlier');
  const later = await create('delete_later');
  successful(await api(admin, `/crm/receivable/${later.receivableId}/confirm`, { method: 'POST', body: { version: later.version } }), '准备真实不可删除应收');
  reject(await api(admin, `/crm/receivable/${earlier.receivableId},${later.receivableId}`, { method: 'DELETE' }), '批量删除遇财务历史整批回滚');
  check('批量删除失败后前一条未收计划仍存在', (await read(earlier.receivableId)).deleted === 0);
  successful(await api(admin, `/crm/receivable/${earlier.receivableId}`, { method: 'DELETE' }), '正常删除无历史计划');
  check('删除仅标记当前无历史应收', database(`SELECT deleted FROM crm_receivable WHERE tenant_id=100000 AND receivable_id=${earlier.receivableId};`) === '1');
  evidence.business = true;
  const invoiceContext = await verifyReceivableInvoiceEntry({ ...context, create, read, reject, today });
  const uiRecord = await create('interface', '123.45');
  await verifyReceivableProtectionInterface({ ...context, employee, uiRecord, read, edit });
  await verifyReceivableInvoiceInterface({ ...context, ...invoiceContext, employee, read });
  check('真实应收验证前后EMPLOYEE完整授权逐条一致', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === grants);
}
