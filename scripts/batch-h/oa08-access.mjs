import { check, failureSummary, jsonRows, sqlText } from './live-lib.mjs';
import { ensureRoles } from './oa08-identities.mjs';
import { restoreOwnedRole } from './oa08-role-lease.mjs';
import { id, noCost, records, requestPath, roles, same, stockPath } from './oa08-live.mjs';
import { recordBrowserCoverage, roleUi } from './oa08-ui.mjs';

const commonMenus = [1820, 1821, 1822, 1823, 1824, 1825, 1828];
const additions = { 1: [1810, 1811, 1812, 1813, 1814, 1815, 1816, 1817, 1818, 1826, 1827, 1829],
  2: [1810, 1811, 1812, 1814, 1815, 1816, 1817, 1818, 1826, 1827, 1829], 3: [1810, 1811, 1817, 1818],
  7: [1810, 1816, 1826, 1827], 8: [1829] };

function authorization(live) {
  return jsonRows(`SELECT JSON_OBJECT('role', CAST(binding.role_id AS CHAR), 'menu', binding.menu_id, 'permission', menu.perms)
    FROM sys_role_menu binding JOIN sys_menu menu ON menu.menu_id = binding.menu_id
    WHERE binding.tenant_id = ${sqlText(live.tenantId)} AND binding.role_id BETWEEN 1 AND 11
      AND (binding.menu_id BETWEEN 1810 AND 1829 OR menu.perms LIKE 'workflow:%') ORDER BY binding.role_id, binding.menu_id`);
}

export async function matrix(live) {
  if (process.env.CLOUDFLOW_H_OA_MATRIX_ALLOWED !== '1') throw new Error('H_OA_ROLE_MATRIX_MAINLINE_RELEASE_REQUIRED');
  const materialId = await live.material('matrix');
  const state = live.scenario('matrix');
  if (!state.authorizationBefore) { state.authorizationBefore = authorization(live); await live.persist(); }
  const failures = [];
  const attempted = [];
  for (let roleIndex = 0; roleIndex < roles.length; roleIndex++) {
    const roleId = roleIndex + 1;
    const actor = roles[roleIndex];
    if (live.fixture.steps[`matrix:role-${roleId}`]?.passed && live.fixture.steps[`browser:role-${roleId}`]?.passed) continue;
    attempted.push(roleId);
    try {
    await ensureRoles(live, [actor]);
    const expected = [...commonMenus, ...(additions[roleId] || [])].sort((left, right) => left - right);
    same(`角色${roleId}耗材授权逐项符合设计`, authorization(live).filter(row => row.role === String(roleId) && row.menu >= 1810 && row.menu <= 1829)
      .map(row => row.menu), expected);
    await live.step(`matrix:role-${roleId}`, async () => {
      const categories = await live.ok(actor, `${requestPath}/categories`);
      const catalog = await live.ok(actor, `${requestPath}/catalog?pageNum=1&pageSize=100`);
      check(`角色${roleId}可以读取业务可领目录`, Array.isArray(categories) && Array.isArray(records(catalog)));
      noCost(catalog, `角色${roleId}可领目录不携带成本`);
      let request = await live.createRequest(`matrix-role-${roleId}`, actor, [{ consumableId: materialId, applyQuantity: 1 }]);
      const own = records(await live.ok(actor, `${requestPath}/list?pageNum=1&pageSize=100`));
      check(`角色${roleId}我的申请只含本人`, own.some(row => String(row.requestId) === String(request.requestId))
        && own.every(row => String(row.applicantId) === live.sessions.accounts[actor].userId));
      if (![1, 2, 3].includes(roleId)) noCost(request, `角色${roleId}本人详情不回传成本`);
      if ([1, 2, 8].includes(roleId)) await live.ok(actor, `${requestPath}/department-list?pageNum=1&pageSize=100`);
      else await live.deny(actor, `${requestPath}/department-list`, 'GET', undefined, `角色${roleId}无部门查询权`, materialId, /403/);
      if ([1, 2, 7].includes(roleId)) {
        const dispatch = records(await live.ok(actor, `${requestPath}/dispatch-list?pageNum=1&pageSize=100`));
        check(`角色${roleId}仓管队列不泄露草稿`, dispatch.every(row => ['APPROVED', 'ISSUED'].includes(row.status)));
      } else await live.deny(actor, `${requestPath}/dispatch-list`, 'GET', undefined, `角色${roleId}无仓管队列权`, materialId, /403/);
      if ([1, 2, 3, 7].includes(roleId)) {
        const ledger = await live.ok(actor, `${stockPath}/ledger/list?consumableId=${materialId}`);
        if (roleId === 7) noCost(ledger, 'OA仓管台账列表不含成本');
      } else await live.deny(actor, `${stockPath}/ledger/list`, 'GET', undefined, `角色${roleId}无台账读取权`, materialId, /403/);
      const reportQuery = new URLSearchParams({ consumableId: materialId, from: '2026-09-14T00:00:00', to: '2026-09-14T23:59:59', groupBy: 'CONSUMABLE' });
      for (const report of ['stock', 'usage', 'cost']) {
        if ([1, 2, 3].includes(roleId)) await live.ok(actor, `${stockPath}/reports/${report}?${reportQuery}`);
        else await live.deny(actor, `${stockPath}/reports/${report}?${reportQuery}`, 'GET', undefined, `角色${roleId}无${report}报表权`, materialId, /403/);
      }
      const forbidden = [
        { permission: 1814, endpoint: `${stockPath}/${materialId}/adjust`, body: live.operation({ direction: 'IN', quantity: 1, unitPrice: '1.00' }) },
        { permission: 1815, endpoint: `${stockPath}/${materialId}/scrap`, body: live.operation({ quantity: 1 }) },
        { permission: 1813, endpoint: `${stockPath}/${materialId}/recalculate`, body: live.operation({ mode: 'CHECK', version: 0 }) },
        { permission: 1816, endpoint: `${stockPath}/${materialId}/return`, body: live.operation({ sourceLedgerId: '1', quantity: 1, requestVersion: 0 }) },
        { permission: 1812, endpoint: `${stockPath}/ledger/1/reverse`, body: live.operation() },
        { permission: 1826, endpoint: `${requestPath}/${request.requestId}/issue`, body: live.operation({ version: request.version, items: [{ itemId: id(request.items[0].itemId), quantity: 1 }] }) },
      ];
      for (const action of forbidden.filter(action => !expected.includes(action.permission))) {
        await live.deny(actor, action.endpoint, 'POST', action.body, `角色${roleId}禁止操作${action.permission}`, materialId, /403/);
      }
      await live.deny('tenantPeer', `${requestPath}/${request.requestId}`, 'GET', undefined, `第二租户不可读取角色${roleId}的申请`, materialId);
      await live.deny('tenantPeer', `${requestPath}/${request.requestId}/submit`, 'POST', { operationKey: live.operation().operationKey, version: request.version },
        `第二租户不可提交角色${roleId}的申请`, materialId);
      const spoofed = await live.call('tenantPeer', `${requestPath}/${request.requestId}`, 'GET', undefined, { 'X-Tenant-Id': live.tenantId });
      check(`角色${roleId}申请不能借租户请求头越权读取`, spoofed.status >= 400 && spoofed.status < 500 && spoofed.status !== 429);
      request = await live.ok(actor, `${requestPath}/${request.requestId}`);
      check(`角色${roleId}跨租户拒绝未推进草稿`, request.status === 'DRAFT' && request.items[0].issuedQuantity === 0);
    });
    await roleUi(live, actor, roleId, live.scenario(`matrix-role-${roleId}`).requestId);
    } catch (error) {
      failures.push({ roleId, error });
      console.error(JSON.stringify({ role: roleId, failure: failureSummary(error) }));
    } finally { await restoreOwnedRole(live); }
  }
  await recordBrowserCoverage(live, attempted, failures.map(value => value.roleId));
  if (failures.length) throw failures[0].error;
  await live.step('matrix:cross-tenant-catalog', async () => {
    const foreign = await live.ok('tenantPeer', `${requestPath}/catalog?pageNum=1&pageSize=100`);
    check('第二真实租户可领目录不泄露本租户耗材', records(foreign).every(row => String(row.consumableId) !== materialId));
    await live.deny('tenantPeer', requestPath, 'POST', { operationKey: live.operation().operationKey, purpose: `${live.fixture.tag}跨租户拒绝`,
      applyDate: '2026-09-14', items: [{ consumableId: materialId, applyQuantity: 1 }] }, '跨租户耗材不可建立申请', materialId);
  });
  same('正式角色及通用流程权限集合保持原样', authorization(live), state.authorizationBefore);
  if (process.env.CLOUDFLOW_H_WORKFLOW_PAUSED === '1') throw new Error('H_OA_WORKFLOW_TEMPORARILY_PAUSED');
  for (const roleId of [6, 7, 10, 11]) {
    const actor = roles[roleId - 1];
    try {
    await ensureRoles(live, [actor]);
    await live.step(`matrix:business-submit-${roleId}`, async () => {
      const request = await live.createRequest(`matrix-role-${roleId}`, actor, [{ consumableId: materialId, applyQuantity: 1 }]);
      await live.deny(actor, '/workflow/wf/start', 'POST', { processDefinitionKey: 'oa_consumable_request', businessKey: `${live.fixture.tag}-forbidden-${roleId}` },
        `角色${roleId}通用流程发起仍被拒绝`, materialId, /403/);
      await live.deny(actor, '/workflow/wf/definitions', 'GET', undefined, `角色${roleId}流程定义管理仍被拒绝`, materialId, /403/);
      await live.approve(`matrix-role-${roleId}`, actor, id(request.requestId), materialId);
    });
    } finally { await restoreOwnedRole(live); }
  }
  same('11个正式角色的耗材及通用工作流授权未被扩大', authorization(live), state.authorizationBefore);
  await recordBrowserCoverage(live, attempted);
  check('十一角色浏览器按钮及真实后台权限均完成逐角色核验', live.fixture.browserCoverage.remaining.length === 0
    && live.fixture.browserCoverage.passed.length === 11 && live.fixture.browserCoverage.backendPassed.length === 11);
}

export async function policy(live) {
  const workflowPaused = process.env.CLOUDFLOW_H_WORKFLOW_PAUSED === '1';
  const deferredApprovals = [];
  const materialId = await live.material('policy');
  const request = await live.createRequest('policy-request', 'employee', [{ consumableId: materialId, applyQuantity: 1 }]);
  const endpoint = `${requestPath}/${request.requestId}/submit`;
  await live.step('policy:missing-self-foreign', async () => {
    await live.setConfig('sys.oa.consumable.approverUserId', '');
    await live.deny('employee', endpoint, 'POST', { operationKey: live.operation().operationKey, version: request.version }, '未配置审批人禁止提交', materialId);
    await live.setConfig('sys.oa.consumable.approverUserId', live.sessions.accounts.employee.userId);
    await live.deny('employee', endpoint, 'POST', { operationKey: live.operation().operationKey, version: request.version }, '审批人与申请人相同禁止提交', materialId);
    await live.setConfig('sys.oa.consumable.approverUserId', live.sessions.accounts.tenantPeer.userId);
    await live.deny('employee', endpoint, 'POST', { operationKey: live.operation().operationKey, version: request.version }, '跨租户审批人禁止提交', materialId);
    const current = await live.ok('employee', `${requestPath}/${request.requestId}`);
    check('无效审批配置的三次拒绝均保持原草稿', current.status === 'DRAFT' && current.version === request.version);
  });
  await live.setConfig('sys.oa.consumable.approverUserId', live.sessions.accounts.finance.userId);
  if (workflowPaused && !live.fixture.steps['policy:unpriced-approval']?.passed) deferredApprovals.push('unpriced-approval');
  else await live.step('policy:unpriced-approval', async () => {
    await live.setConfig('sys.oa.consumable.approvalMode', 'THRESHOLD');
    await live.setConfig('sys.oa.consumable.limitMetric', 'AMOUNT');
    await live.approve('policy-request', 'employee', id(request.requestId), materialId);
    check('从无计价依据的申请真实送审且没有库存事实', live.proof(materialId).ledger.length === 0);
  });
  const priced = await live.material('policy-priced');
  const otherUnit = await live.material('policy-other-unit', { unit: '箱' });
  for (const target of [priced, otherUnit]) {
    await live.step(`policy:price-${target}`, () => live.command(`policy:price-${target}`, 'admin', `${stockPath}/${target}/add-stock`,
      () => live.operation({ quantity: 20, unitPrice: '1.00' })));
  }
  const cases = [
    { name: 'amount-below', metric: 'AMOUNT', threshold: '10.00', quantities: [9], approval: false },
    { name: 'amount-equal', metric: 'AMOUNT', threshold: '10.00', quantities: [10], approval: false },
    { name: 'amount-above', metric: 'AMOUNT', threshold: '10.00', quantities: [11], approval: true },
    { name: 'quantity-not-summed', metric: 'QUANTITY', threshold: '5.00', quantities: [4, 4], approval: false },
    { name: 'quantity-equal', metric: 'QUANTITY', threshold: '5.00', quantities: [5, 5], approval: false },
    { name: 'quantity-above', metric: 'QUANTITY', threshold: '5.00', quantities: [6, 1], approval: true },
    { name: 'explicit-pass', metric: 'AMOUNT', threshold: '10.00', quantities: [11], effect: 'PASS', approval: false },
    { name: 'always-pass', metric: 'AMOUNT', threshold: '10.00', quantities: [1], effect: 'PASS', mode: 'ALWAYS', approval: true },
    { name: 'always-explicit-pass', metric: 'AMOUNT', threshold: '10.00', quantities: [11], effect: 'PASS', mode: 'ALWAYS', approval: true },
    { name: 'alert-above', metric: 'AMOUNT', threshold: '10.00', quantities: [11], effect: 'ALERT', approval: true },
    { name: 'blocked', metric: 'AMOUNT', threshold: '10.00', quantities: [11], effect: 'BLOCK', blocked: true },
    { name: 'disabled-rule', metric: 'AMOUNT', threshold: '10.00', quantities: [1], enabled: 0, blocked: true,
      expected: /RULE_UNAVAILABLE|RULE_DISABLED|RULE_INVALID/ },
    { name: 'fractional-quantity', metric: 'QUANTITY', threshold: '1.50', quantities: [1], blocked: true, expected: /RULE_INVALID/ },
  ];
  for (const test of cases) {
    if (workflowPaused && test.approval && !live.fixture.steps[`policy:${test.name}`]?.passed) {
      deferredApprovals.push(test.name);
      continue;
    }
    await live.step(`policy:${test.name}`, async () => {
      await live.setConfig('sys.oa.consumable.approvalMode', test.mode || 'THRESHOLD');
      await live.setConfig('sys.oa.consumable.limitMetric', test.metric);
      await live.setRule(test.name, { thresholdValue: test.threshold, effect: test.effect || 'WARN', enabled: test.enabled ?? 1 });
      const draft = await live.createRequest(`policy-${test.name}`, 'employee', test.quantities.map((quantity, index) => ({ consumableId: index ? otherUnit : priced, applyQuantity: quantity })));
      same(`规则边界${test.name}复用受控的原申请数量`, draft.items.map(item => item.applyQuantity), test.quantities);
      const before = [live.proof(priced), live.proof(otherUnit)];
      if (test.blocked) {
        await live.deny('employee', `${requestPath}/${draft.requestId}/submit`, 'POST', { operationKey: live.operation().operationKey, version: draft.version },
          `规则边界${test.name}拒绝提交`, priced, test.expected || /RULE_BLOCKED/);
        const rejected = await live.ok('employee', `${requestPath}/${draft.requestId}`);
        check(`规则边界${test.name}拒绝后仍为原版本草稿`, rejected.status === 'DRAFT' && rejected.version === draft.version);
      } else {
        const submitted = await live.command(`policy:${test.name}:submit`, 'employee', `${requestPath}/${draft.requestId}/submit`,
          () => ({ operationKey: live.operation().operationKey, version: draft.version }));
        check(`真实规则边界${test.name}按设计分流`, submitted.status === (test.approval ? 'APPROVING' : 'APPROVED'));
        if (test.approval) await live.approve(`policy-${test.name}`, 'employee', id(draft.requestId), priced);
        else {
          const approved = await live.ok('employee', `${requestPath}/${draft.requestId}`);
          check('阈值自动通过未产生工作流实例且批准原数量', !approved.instanceId && approved.items.every(item => item.approvedQuantity === item.applyQuantity));
        }
      }
      same('阈值和真实审批分流不改变两种单位的库存', [live.proof(priced), live.proof(otherUnit)], before);
    });
  }
  live.scenario('policy').deferredApprovals = deferredApprovals;
  await live.persist();
  if (deferredApprovals.length) {
    console.log(JSON.stringify({ phase: 'policy', deferredApprovals }));
    throw new Error('H_OA_WORKFLOW_TEMPORARILY_PAUSED');
  }
}
