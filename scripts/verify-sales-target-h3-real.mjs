import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifySalesTargetInterface } from './verify-sales-target-h3-ui.mjs';
import { prepareRefundApproval } from './refund-approval-h3-real.mjs';

export async function verifySalesTarget(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const user = name => {
    const id = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(id) && id > 0, `Missing isolated user ${name}`);
    return id;
  };
  const waitFor = async (read, accepts, label) => {
    const deadline = Date.now() + 60000;
    do {
      const result = await read();
      if (accepts(result)) return result;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const text = String(value);
    assert.match(text, /^-?\d+(?:\.\d{1,2})?$/);
    const [whole, fractional = ''] = text.replace('-', '').split('.');
    return (BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n);
  };
  const delta = (current, initial, expected, label) => check(label, cents(current) - cents(initial) === cents(expected));
  const reject = (result, label, pattern = /目标|版本|修改|口径|预览|币种|金额|对象|部门|成员|用户|权限|无权|不存在|年份|周期|月份|季度|重复|频繁|删除|操作标识|十进制/) => {
    const message = result.body?.msg || result.body?.message || '';
    check(`${label} HTTP=${result.status} code=${result.body?.code} message=${message}`,
      ([400, 403, 404, 409, 503].includes(result.status) || result.status === 200 && result.body?.code === 500)
      && result.body?.code !== 200 && pattern.test(message));
  };
  const forbidden = (result, label) => check(`${label} HTTP=${result.status} code=${result.body?.code}`, result.status === 403 && result.body?.code === 403);
  const grantSql = 'SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;';
  const grants = database(grantSql);
  const menuCount = database('SELECT COUNT(*) FROM sys_menu;');
  const adminId = user('g_import_admin');
  const employeeId = user('g_holiday_employee');
  const ensureEmployee = (id, name, deptId) => database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status,user_id,create_by)
    SELECT 100000,${literal(`H3_ST_${id}`)},${literal(name)},'MALE',${deptId},'REGULAR',${id},'isolated-target-fixture'
    WHERE NOT EXISTS (SELECT 1 FROM hr_employee WHERE tenant_id=100000 AND user_id=${id} AND deleted=0);`);
  ensureEmployee(employeeId, '销售目标隔离验收员工', 100);
  const createIdentity = (name, roleIds) => {
    assert.ok(roleIds.every(id => [8, 10].includes(id)));
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
      SELECT 100000,101,${literal(name)},${literal(name)},password,'0',0,'0','isolated-target-fixture' FROM sys_user
      WHERE tenant_id=100000 AND user_name='g_import_admin' AND NOT EXISTS
      (SELECT 1 FROM (SELECT user_name FROM sys_user WHERE tenant_id=100000) existing WHERE existing.user_name=${literal(name)});`);
    const id = user(name);
    for (const roleId of roleIds) database(`INSERT INTO sys_user_role (user_id,role_id,tenant_id) SELECT ${id},${roleId},100000
      WHERE NOT EXISTS (SELECT 1 FROM sys_user_role WHERE user_id=${id} AND role_id=${roleId} AND tenant_id=100000);`);
    check(`${name}仅使用批准角色和101部门`, database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE user_id=${id} AND tenant_id=100000;`) === roleIds.join(',')
      && database(`SELECT dept_id FROM sys_user WHERE tenant_id=100000 AND user_id=${id};`) === '101');
    ensureEmployee(id, name, 101);
    return id;
  };
  const opsId = createIdentity('g_sales_target_ops', [10]);
  createIdentity('g_sales_target_manager', [8, 10]);
  const employee = await session('g_holiday_employee');
  const ops = context.uiOnly ? null : await session('g_sales_target_ops', 'g_import_admin');
  const manager = context.uiOnly ? null : await session('g_sales_target_manager', 'g_import_admin');
  const foreign = context.uiOnly ? null : await session('g_import_tenant');
  const refundWorkflow = context.uiOnly ? null : await prepareRefundApproval(context);
  const finance = refundWorkflow?.finance;
  const today = database("SELECT DATE_FORMAT(CURDATE(),'%Y-%m-%d');");
  const [year, month] = today.split('-').map(Number);
  const prefix = `H3_ST_${caseTag}`;
  const path = '/crm/sales-target';
  const request = (suffix, changes = {}) => ({ requestKey: randomUUID().replaceAll('-', ''), targetName: `${prefix}_${suffix}`,
    dimensionType: 'OWNER', periodType: 'MONTH', targetYear: year, targetPeriod: month, ownerId: adminId,
    targetAmount: '100.00', calculationBasis: 'TEAM_V2', currency: 'CNY', status: 'ACTIVE', ...changes });
  const write = row => ({ salesTargetId: row.salesTargetId, version: row.version, targetName: row.targetName, dimensionType: row.dimensionType,
    periodType: row.periodType, targetYear: row.targetYear, targetPeriod: row.targetPeriod, ownerId: row.ownerId, deptId: row.deptId,
    targetAmount: row.targetAmount, calculationBasis: row.calculationBasis, currency: row.currency, status: row.status, remark: row.remark });
  const create = async (body, page = admin) => successful(await api(page, path, { method: 'POST', body }), '真实创建销售目标');
  const read = async (id, page = admin) => successful(await api(page, `${path}/${id}`), '真实读取销售目标');
  const edit = async (body, page = admin) => successful(await api(page, path, { method: 'PUT', body }), '真实编辑销售目标');
  const preview = async (body, page = admin) => successful(await api(page, `${path}/preview`, { method: 'POST', body }), '真实预览销售目标');
  const list = async (query = {}, page = admin) => successful(await api(page, `${path}/list?${new URLSearchParams({ targetName: prefix, pageSize: '100', ...query })}`), '真实分页查询销售目标');
  if (context.uiOnly) {
    const partner = await create(request('partner_ui', { ownerId: employeeId }));
    const uiTarget = await create(request('interface'));
    await verifySalesTargetInterface({ ...context, employee, partner, uiTarget, prefix, year, month, request, write, create, read, edit, list, waitFor, literal, cents });
    check('独立页面专项未改菜单及EMPLOYEE授权，不替代完整业务链验收', database(grantSql) === grants && database('SELECT COUNT(*) FROM sys_menu;') === menuCount);
    return;
  }
  const initialRequest = request('owner', { calculationBasis: undefined, currency: undefined, tenantId: 100001, ownerName: '伪造姓名', createBy: 'forged', achievedAmount: '999999.00' });
  let owner = await create(initialRequest);
  const partner = await create(request('partner', { ownerId: employeeId }));
  const department = await create(request('department', { dimensionType: 'DEPT', deptId: 100 }));
  const legacy = await create(request('legacy', { calculationBasis: 'OWNER_V1' }));
  const usd = await create(request('usd', { currency: 'USD' }));
  check('新建默认团队/CNY，租户和姓名审计值来自真实身份', owner.calculationBasis === 'TEAM_V2' && owner.currency === 'CNY'
    && owner.tenantId === 100000 && owner.ownerName === '导入验收负责人' && owner.createBy !== 'forged'
    && owner.targetAmount === '100.00' && typeof owner.achievedAmount === 'string');
  check('同一创建标识重放及结果查询只返回原目标', (await create(initialRequest)).salesTargetId === owner.salesTargetId
    && successful(await api(admin, `${path}/creation/${initialRequest.requestKey}`), '恢复原创建结果').salesTargetId === owner.salesTargetId);
  reject(await api(admin, path, { method: 'POST', body: { ...initialRequest, targetName: '篡改同键' } }), '相同请求标识不能创建不同内容');
  check('未知创建标识返回空结果而非伪造成功记录', successful(await api(admin, `${path}/creation/${randomUUID().replaceAll('-', '')}`), '查询不存在的创建结果') === null);

  const customerCode = `${prefix}_customer`;
  successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode, customerName: customerCode, ownerId: adminId } }), '真实创建目标验收客户');
  const customerId = Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${literal(customerCode)} AND deleted=0;`));
  assert.ok(Number.isSafeInteger(customerId) && customerId > 0);
  const newReceivable = async (suffix, contractId) => {
    const name = `${prefix}_${suffix}`;
    successful(await api(admin, '/crm/receivable', { method: 'POST', body: { customerId, receivableNo: name, receivableName: name, ownerId: adminId, plannedAmount: '500.00', contractId } }), '真实创建回款计划');
    const id = Number(database(`SELECT receivable_id FROM crm_receivable WHERE tenant_id=100000 AND receivable_no=${literal(name)} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return id;
  };
  const receipt = await newReceivable('receivable');
  const receivable = async id => successful(await api(admin, `/crm/receivable/${id}`), '读取实际收款计划');
  const team = async (ownerShare, partnerShare) => {
    const current = successful(await api(admin, `/crm/deal-team/RECEIVABLE/${receipt}`), '读取实际团队版本');
    return successful(await api(admin, `/crm/deal-team/RECEIVABLE/${receipt}`, { method: 'PUT', body: {
      teamVersion: current.teamVersion, businessVersion: current.businessVersion, remark: `${prefix}_team`,
      members: [{ salesUserId: adminId, roleType: 'OWNER', allocatedPercentage: ownerShare }, { salesUserId: employeeId, roleType: 'CO_SELLER', allocatedPercentage: partnerShare }],
    } }), '通过业务接口保存收款团队');
  };
  const collect = async (amount, id = receipt) => successful(await api(admin, `/crm/receivable/${id}/writeoff`, { method: 'POST', body: {
    version: (await receivable(id)).version, amount, writeoffDate: today, remark: `${prefix}_receipt_${amount}`,
  } }), '通过业务接口登记实际收款');
  await team('0.7000', '0.3000');
  await collect('100.01');
  const sourceId = Number(database(`SELECT event_id FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${receipt} AND event_type='RECEIPT' AND reversal_of_id IS NULL;`));
  assert.ok(Number.isSafeInteger(sourceId) && sourceId > 0);
  await team('0.2000', '0.8000');
  await collect('20.00');
  delta((await read(owner.salesTargetId)).achievedAmount, owner.achievedAmount, '74.01', '两笔实际到账按各自70/30及20/80冻结比例计主责业绩');
  delta((await read(partner.salesTargetId)).achievedAmount, partner.achievedAmount, '46.00', '协作成员仅取得两笔自己的30和16元分配');
  const refundId = successful(await api(finance, '/crm/approval/refund', { method: 'POST', body: {
    receivableId: receipt, receiptEventId: sourceId, version: (await receivable(receipt)).version, refundAmount: '5.00', reason: `${prefix}_selected_source`,
  } }), '真实财务选择第一笔款申请退5元');
  await refundWorkflow.complete(refundId);
  await waitFor(() => receivable(receipt), value => cents(value.receivedAmount) === cents('115.01'), '实际退款回调未完成');
  delta((await read(owner.salesTargetId)).achievedAmount, owner.achievedAmount, '70.51', '退款沿用第一笔70/30原分配，主责净业绩70.51');
  delta((await read(partner.salesTargetId)).achievedAmount, partner.achievedAmount, '44.50', '退款不会按当前20/80重算，协作成员净业绩44.50');
  delta((await read(department.salesTargetId)).achievedAmount, department.achievedAmount, '115.01', '同部门业绩严格等于成员净分配之和');
  delta((await read(legacy.salesTargetId)).achievedAmount, legacy.achievedAmount, '115.01', '旧口径独立保持负责人累计到账');
  evidence.receipts = true; evidence.refundCallback = true;

  const contractName = `${prefix}_USD_contract`;
  const contractId = successful(await api(admin, '/oa/contract', { method: 'POST', body: { contractNo: contractName, contractName,
    contractType: 'SALES', counterpartyName: customerCode, customerId, amount: '500.00', currency: 'USD', ownerId: adminId } }), '真实创建不同币种合同');
  const dollarReceivable = await newReceivable('USD_receivable', contractId);
  await collect('30.00', dollarReceivable);
  delta((await read(usd.salesTargetId)).achievedAmount, usd.achievedAmount, '30.00', 'USD合同到账只进入USD目标');
  delta((await read(owner.salesTargetId)).achievedAmount, owner.achievedAmount, '70.51', '不同币种实际到账不会增加CNY目标');
  const switching = { ...write(owner), calculationBasis: 'OWNER_V1' };
  reject(await api(admin, path, { method: 'PUT', body: switching }), '切换口径必须先预览并确认');
  const comparison = await preview(switching);
  check('真实预览分别展示原目标、旧累计与团队金额', comparison.confirmationRequired && cents(comparison.teamReceivedAmount) - cents(owner.achievedAmount) === cents('70.51')
    && cents(comparison.ownerReceivedAmount) - cents(legacy.achievedAmount) === cents('115.01'));
  await collect('1.00');
  reject(await api(admin, path, { method: 'PUT', body: { ...switching, basisChangeConfirmed: true, previewFingerprint: comparison.fingerprint } }), '新增实际收款使旧切换预览失效');
  check('旧预览被拒绝后目标版本和口径未改变', (await read(owner.salesTargetId)).version === owner.version && (await read(owner.salesTargetId)).calculationBasis === 'TEAM_V2');
  const currentComparison = await preview(switching);
  owner = await edit({ ...switching, basisChangeConfirmed: true, previewFingerprint: currentComparison.fingerprint });
  check('明确核对后切到旧口径并只增加一个版本', owner.calculationBasis === 'OWNER_V1' && owner.version === 1);
  delta(owner.achievedAmount, legacy.achievedAmount, '116.01', '切换后旧口径按实际累计116.01计算');
  const currencyChange = { ...write(owner), calculationBasis: 'TEAM_V2', currency: 'USD' };
  const currencyPreview = await preview(currencyChange);
  const converted = await edit({ ...currencyChange, basisChangeConfirmed: true, previewFingerprint: currencyPreview.fingerprint });
  check('币种切换预览与保存均只选择USD，不隐式汇率换算', converted.currency === 'USD' && converted.achievedAmount === (await read(usd.salesTargetId)).achievedAmount);
  for (const calculationBasis of ['TEAM_V2', 'OWNER_V1']) {
    const filtered = await list({ calculationBasis, currency: 'CNY' });
    check(`${calculationBasis}分页金额不混入另一口径或USD`, filtered.rows.length > 0 && filtered.rows.every(row => row.calculationBasis === calculationBasis && row.currency === 'CNY'));
  }
  evidence.basisSwitch = true;

  const ownOps = await create(request('ops', { ownerId: opsId }), ops);
  const peerOps = await create(request('ops_second', { ownerId: opsId }), ops);
  check('仅本人CRM运营可创建并查询自己目标', (await read(ownOps.salesTargetId, ops)).ownerId === opsId && (await list({}, ops)).rows.every(row => row.ownerId === opsId));
  reject(await api(ops, `${path}/${partner.salesTargetId}`), '仅本人运营不能按ID读取员工目标');
  reject(await api(ops, `${path}/preview`, { method: 'POST', body: write(partner) }), '仅本人运营不能预览他人金额');
  reject(await api(ops, path, { method: 'PUT', body: write(partner) }), '仅本人运营不能编辑他人目标');
  reject(await api(ops, path, { method: 'POST', body: request('ops_spoof', { ownerId: adminId }) }), '仅本人运营不能指派他人目标');
  reject(await api(ops, `${path}/${ownOps.salesTargetId},${partner.salesTargetId}?versions=0,0`, { method: 'DELETE' }), '混入无权目标的批量删除整单回滚');
  check('批量删除拒绝后有权记录也保留原版本', (await read(ownOps.salesTargetId, ops)).version === 0);
  const department101 = await create(request('department101', { dimensionType: 'DEPT', deptId: 101 }), manager);
  check('真实部门权限可维护范围内目标', (await read(department101.salesTargetId, manager)).deptId === 101 && (await list({}, manager)).rows.every(row => row.deptId === 101));
  reject(await api(manager, `${path}/${department.salesTargetId}`), '真实部门权限不能读取100部门目标');
  reject(await api(manager, path, { method: 'POST', body: request('outside_department', { dimensionType: 'DEPT', deptId: 100 }) }), '真实部门权限不能设置范围外目标');
  const selfRows = await list({}, employee);
  check('员工仅看到自己的目标及分配，未拿到部门全额', selfRows.rows.length === 1 && selfRows.rows[0].salesTargetId === partner.salesTargetId
    && cents(selfRows.rows[0].achievedAmount) - cents(partner.achievedAmount) === cents('45.30'));
  reject(await api(employee, `${path}/${converted.salesTargetId}`), '员工不能读取他人的目标');
  reject(await api(employee, `${path}/creation/${initialRequest.requestKey}`), '创建结果恢复入口同样执行员工数据范围');
  for (const [requestPath, options] of [[path, { method: 'POST', body: request('employee_denied', { ownerId: employeeId }) }],
    [path, { method: 'PUT', body: write(partner) }], [`${path}/${partner.salesTargetId}?versions=0`, { method: 'DELETE' }]])
    forbidden(await api(employee, requestPath, options), '员工读权限不允许新增编辑或删除目标');
  check('外租户查相同创建标识仅返回空结果', successful(await api(foreign, `${path}/creation/${initialRequest.requestKey}`), '外租户核对未知创建标识') === null);
  for (const [requestPath, options] of [[`${path}/${partner.salesTargetId}`, {}],
    [`${path}/preview`, { method: 'POST', body: write(partner) }], [path, { method: 'PUT', body: write(partner) }]])
    reject(await api(foreign, requestPath, options), '外租户不能读取预览恢复或编辑目标');
  check('伪造查询租户和聚合范围不能扩张员工数据', (await list({ tenantId: '100001', ownerId: String(adminId), 'scope.all': 'true' }, employee)).rows.length === 0);
  evidence.permissions = true;

  for (const [suffix, changes] of [['negative', { targetAmount: '-1' }], ['exponent', { targetAmount: '1e2' }],
    ['fraction', { targetAmount: '0.001' }], ['overflow', { targetAmount: '100000000000000.00' }], ['year', { targetYear: 10000 }],
    ['month', { targetPeriod: 13 }], ['quarter', { periodType: 'QUARTER', targetPeriod: 5 }], ['basis', { calculationBasis: 'ALL' }],
    ['currency', { currency: 'CNY,USD' }], ['subject', { ownerId: 999999999 }], ['key', { requestKey: '../../arbitrary' }]])
    reject(await api(admin, path, { method: 'POST', body: request(`invalid_${suffix}`, changes) }), `真实接口拒绝非法目标${suffix}`);
  const maximum = await create(request('maximum', { targetAmount: '99999999999999.99', targetYear: 9999, periodType: 'YEAR' }));
  check('DECIMAL(16,2)上限通过HTTP无精度损失，年度目标无月份', maximum.targetAmount === '99999999999999.99' && maximum.achievedAmount === '0.00' && maximum.targetPeriod == null);
  const concurrentRequest = request('concurrent');
  const creations = await Promise.all([api(admin, path, { method: 'POST', body: concurrentRequest }), api(admin, path, { method: 'POST', body: concurrentRequest })]);
  const first = successful(creations[0], '同键并发创建一');
  const second = successful(creations[1], '同键并发创建二');
  check('同键真实并发创建只产生一份目标', first.salesTargetId === second.salesTargetId
    && database(`SELECT COUNT(*) FROM crm_sales_target WHERE tenant_id=100000 AND target_no=${literal(`MB${concurrentRequest.requestKey}`)};`) === '1');
  const updates = await Promise.all(['甲', '乙'].map(suffix => api(admin, path, { method: 'PUT', body: { ...write(first), remark: suffix } })));
  check('同版本真实并发编辑只有一份成功且版本加一', updates.filter(result => result.status === 200 && result.body?.code === 200).length === 1
    && (await read(first.salesTargetId)).version === 1);
  reject(await api(admin, `${path}/${first.salesTargetId}?versions=0`, { method: 'DELETE' }), '过期版本不能删除已更新目标');
  successful(await api(admin, `${path}/${first.salesTargetId}?versions=1`, { method: 'DELETE' }), '按核对后的版本真实删除目标');
  check('删除真实持久化逻辑标记及版本', database(`SELECT CONCAT(deleted,':',version) FROM crm_sales_target WHERE tenant_id=100000 AND sales_target_id=${first.salesTargetId};`) === '1:2');
  reject(await api(admin, `${path}/${first.salesTargetId}`), '已删除目标不能经详情返回');
  const race = await Promise.all([api(ops, path, { method: 'PUT', body: { ...write(peerOps), remark: 'race' } }),
    api(ops, `${path}/${peerOps.salesTargetId}?versions=0`, { method: 'DELETE' })]);
  check('删除与编辑真实竞争仅一个提交', race.filter(result => result.status === 200 && result.body?.code === 200).length === 1
    && database(`SELECT version FROM crm_sales_target WHERE tenant_id=100000 AND sales_target_id=${peerOps.salesTargetId};`) === '1');
  evidence.concurrency = true;
  if (!context.httpOnly) {
    const uiTarget = await create(request('interface'));
    await verifySalesTargetInterface({ ...context, employee, partner, uiTarget, prefix, year, month, request, write, create, read, edit, list, waitFor, literal, cents });
  }
  check('销售目标专项未改菜单及EMPLOYEE任何一条授权', database(grantSql) === grants && database('SELECT COUNT(*) FROM sys_menu;') === menuCount);
}
