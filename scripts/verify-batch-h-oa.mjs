import { randomUUID } from 'node:crypto';
import { runOaAcceptance } from './batch-h/oa08-acceptance.mjs';
import {
  api, assertRuntime, businessBlocked, check, completeWorkflowTask, failureSummary,
  jsonRows, openSessions, pause, prefix, readFixture, saveFixture, saveResult, sqlText,
  success, until,
} from './batch-h/live-lib.mjs';

const suite = 'oa-first-pass';
const stockPath = '/oa/consumable';
const requestPath = `${stockPath}/request`;
const configPath = '/auth/system/config';
const approverKey = 'sys.oa.consumable.approverUserId';
const restoreOnly = process.argv.includes('--restore-config');
const pendingCoverage = ['采购收货与成本分摊', '分批发料/退回/冲正', '低库存/重算任务', '完整阈值规则与11角色双租户矩阵'];
let sessions;
let fixture;
let failure;
let runtimeReady = false;

const records = data => data?.rows ?? data?.records ?? (Array.isArray(data) ? data : []);
const query = values => new URLSearchParams(values).toString();
const call = (actor, path, method = 'GET', body) => api(sessions[actor].page, path, {
  method, ...(body === undefined ? {} : { body }),
});
const accepted = async (actor, path, method = 'GET', body) => success(await call(actor, path, method, body), `${method} ${path.split('?')[0]}`);
const persist = () => saveFixture(suite, fixture);
const operation = (remark, fields = {}) => ({ operationKey: `${prefix}:OA:${randomUUID()}`, remark: `${fixture.tag} ${remark}`, ...fields });
const material = () => accepted('admin', `${stockPath}/${fixture.consumableId}`);
const request = (actor = 'employee') => accepted(actor, `${requestPath}/${fixture.requestId}`);
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected));

function id(value) {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]{0,18}$/.test(text) || typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error('H_OA_IDENTIFIER_INVALID');
  }
  return text;
}

function cents(value) {
  const parts = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(String(value));
  if (!parts) throw new Error('H_OA_MONEY_INVALID');
  return (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] ?? '').padEnd(2, '0')));
}

function noCost(value, label) {
  const forbidden = /^(unitPrice|amount|stockAmount|avgCost|avgCostAfter|lastPurchasePrice|balanceAmountAfter|totalAmount|issuedAmount|returnedAmount|ruleSnapshot)$/;
  const inspect = item => item == null || typeof item !== 'object'
    || Object.entries(item).every(([key, nested]) => !forbidden.test(key) && inspect(nested));
  check(label, inspect(value));
}

function proof() {
  const tenant = sqlText(sessions.accounts.admin.tenantId);
  const consumable = sqlText(id(fixture.consumableId));
  const balances = jsonRows(`SELECT JSON_OBJECT('quantity', quantity, 'amount', CAST(stock_amount AS CHAR),
    'average', CAST(avg_cost AS CHAR), 'version', version) FROM oa_consumable
    WHERE tenant_id = ${tenant} AND consumable_id = ${consumable}`);
  const ledgers = jsonRows(`SELECT JSON_OBJECT('ledgerId', CAST(ledger_id AS CHAR), 'quantity', quantity,
    'balance', balance_after, 'amount', CAST(amount AS CHAR), 'balanceAmount', CAST(balance_amount_after AS CHAR),
    'logId', CAST(asset_log_id AS CHAR), 'sourceType', source_biz_type, 'sourceKey', source_event_key,
    'operatorId', CAST(operator_id AS CHAR), 'beneficiaryId', CAST(beneficiary_id AS CHAR))
    FROM oa_consumable_ledger WHERE tenant_id = ${tenant} AND consumable_id = ${consumable} ORDER BY ledger_id`);
  const logs = jsonRows(`SELECT JSON_OBJECT('logId', CAST(log_id AS CHAR), 'quantity', quantity_change,
    'operatorId', CAST(operator_id AS CHAR), 'beneficiaryId', CAST(target_id AS CHAR)) FROM oa_asset_log
    WHERE tenant_id = ${tenant} AND ref_type = '2' AND ref_id = ${consumable} ORDER BY log_id`);
  return { balances, ledgers, logs };
}

async function assertStock(quantity, amount, expectedRows) {
  const current = await material();
  check(`真实库存为${quantity}个/${amount}元`, current.quantity === quantity && cents(current.stockAmount) === cents(amount));
  const saved = proof();
  check('数据库缓存与API一致', saved.balances.length === 1 && saved.balances[0].quantity === quantity
    && cents(saved.balances[0].amount) === cents(amount));
  check('台账和原日志恰好各记一份', saved.ledgers.length === expectedRows && saved.logs.length === expectedRows);
  let accumulatedQuantity = 0;
  let accumulatedAmount = 0n;
  for (const line of saved.ledgers) {
    accumulatedQuantity += line.quantity;
    accumulatedAmount += cents(line.amount);
    const history = saved.logs.find(item => item.logId === line.logId);
    check('台账每行结存、日志关联、操作人与领用人一致', accumulatedQuantity === line.balance
      && accumulatedAmount === cents(line.balanceAmount) && Boolean(history) && history.quantity === line.quantity
      && history.operatorId === line.operatorId && history.beneficiaryId === line.beneficiaryId);
  }
  check('当前库存数量与金额来自全部真实流水', accumulatedQuantity === quantity && accumulatedAmount === cents(amount));
  return current;
}

async function refuse(actor, path, method, body, expression, label) {
  const before = proof();
  const response = await call(actor, path, method, body);
  check(`${label}返回业务4xx`, response.status >= 400 && response.status < 500 && response.status !== 429);
  businessBlocked(response, expression, label);
  same(`${label}不改变库存、日志或台账`, proof(), before);
}

async function configuration(key) {
  const found = records(await accepted('admin', `${configPath}/list?${query({ configKey: key, pageSize: 100 })}`))
    .filter(item => item.configKey === key && String(item.tenantId) === sessions.accounts.admin.tenantId
      && String(item.configScope) === '1');
  check(`${key}为本租户唯一正式配置`, found.length === 1 && String(found[0].tenantId) === sessions.accounts.admin.tenantId);
  return found[0];
}

function configInput(saved, value) {
  return { configId: saved.configId, configName: saved.configName, configKey: saved.configKey,
    configValue: value, configType: saved.configType, configScope: saved.configScope,
    remark: saved.remark };
}

async function configureApprover() {
  const mode = await configuration('sys.oa.consumable.approvalMode');
  const metric = await configuration('sys.oa.consumable.limitMetric');
  const original = await configuration(approverKey);
  check('首段沿用正式ALWAYS/AMOUNT且审批人尚未核定', mode.configValue === 'ALWAYS'
    && metric.configValue === 'AMOUNT' && (original.configValue ?? '') === '');
  const rule = await accepted('admin', '/auth/system/rules/effective/oa.consumable.request.limit');
  check('沿用正式有效耗材规则，不伪造命中记录', rule?.ruleCode === 'oa.consumable.request.limit'
    && rule.enabled === 1 && rule.effect === 'WARN' && cents(rule.thresholdValue) === 0n);
  fixture.originalConfig = configInput(original, '');
  fixture.configMutationPending = true;
  await persist();
  await accepted('admin', configPath, 'PUT', configInput(original, sessions.accounts.finance.userId));
  const current = await accepted('admin', `${configPath}/${original.configId}`);
  check('仅将本次H财务账号临时设为审批人', current.configValue === sessions.accounts.finance.userId);
}

async function restoreConfiguration() {
  if (!fixture?.configMutationPending) return;
  check('恢复资料只属于H耗材审批人配置', fixture.milestone === prefix
    && fixture.originalConfig?.configKey === approverKey && fixture.originalConfig.configValue === '');
  const current = await accepted('admin', `${configPath}/${fixture.originalConfig.configId}`);
  check('恢复前确认配置未被其他操作者接管', current.configKey === approverKey
    && String(current.tenantId) === sessions.accounts.admin.tenantId
    && ['', fixture.temporaryApproverId].includes(current.configValue ?? ''));
  if (current.configValue === fixture.originalConfig.configValue) {
    check('审批人保持未核定原值，无需恢复写入', true);
    fixture.configMutationPending = false;
    await persist();
    return;
  }
  await pause(5200);
  await accepted('admin', configPath, 'PUT', fixture.originalConfig);
  const restored = await accepted('admin', `${configPath}/${fixture.originalConfig.configId}`);
  check('审批人已恢复未核定空值', restored.configValue === '');
  fixture.configMutationPending = false;
  await persist();
}

async function firstPass() {
  check('五个H账号身份和最小角色隔离', ['admin', 'oa', 'employee', 'peer', 'finance'].every((actor, index) =>
    sessions.accounts[actor].roleId === ['1', '7', '5', '5', '3'][index]
    && sessions.accounts[actor].tenantId === sessions.accounts.admin.tenantId)
    && sessions.accounts.employee.userId !== sessions.accounts.peer.userId);
  const name = `${fixture.tag} 真实领用耗材`;
  await accepted('admin', stockPath, 'POST', { name, model: 'H-OA08', unit: '个', brand: prefix,
    lowStockThreshold: 0, targetStock: 0, warnEnabled: 0, storageLocation: `${prefix}验收区` });
  const found = records(await accepted('admin', `${stockPath}/list?${query({ name, pageSize: 100 })}`)).filter(item => item.name === name);
  check('真实创建唯一H前缀零库存耗材', found.length === 1 && found[0].name.startsWith(prefix));
  fixture.consumableId = id(found[0].consumableId);
  await persist();
  await assertStock(0, '0.00', 0);
  const inboundPath = `${stockPath}/${fixture.consumableId}/add-stock`;
  fixture.inbound = operation('首笔手工入库', { quantity: 10, unitPrice: '2.00' });
  await persist();
  const inbound = await accepted('admin', inboundPath, 'POST', fixture.inbound);
  const beforeRetry = proof();
  const replay = await accepted('admin', inboundPath, 'POST', fixture.inbound);
  check('同键立即重放返回原流水ID', replay.replayed === true && JSON.stringify(replay.ledgerIds) === JSON.stringify(inbound.ledgerIds));
  same('入库重放未重复记账', proof(), beforeRetry);
  noCost(await accepted('oa', `${stockPath}/ledger/${inbound.ledgerIds[0]}`), 'OA仓管入库台账不回传成本字段');
  await refuse('admin', inboundPath, 'POST', { ...fixture.inbound, quantity: 11 }, /IDEMPOTENCY_CONFLICT/, '同键不同数量被拒绝');
  await accepted('admin', inboundPath, 'POST', operation('第二价格入库', { quantity: 10, unitPrice: '4.00' }));
  const weighted = await assertStock(20, '60.00', 2);
  check('移动加权单价为3元', cents(weighted.avgCost) === 300n);
  await refuse('employee', inboundPath, 'POST', operation('员工越权入库', { quantity: 1, unitPrice: '1.00' }), /403|权限|permission|forbidden/i, '员工无库存写权限');
  await refuse('admin', `${stockPath}/${fixture.consumableId}/reduce-stock`, 'POST', operation('负库存回滚', { quantity: 21, stockOutType: 'LOSS' }), /STOCK_NOT_ENOUGH/, '超库存出库整笔回滚');
  fixture.create = { operationKey: operation('创建申请').operationKey, purpose: `${fixture.tag} 真实领用申请`,
    applyDate: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    items: [{ consumableId: fixture.consumableId, applyQuantity: 3, remark: `${prefix}领取3个` }] };
  await persist();
  const created = await accepted('employee', requestPath, 'POST', fixture.create);
  fixture.requestId = id(created.requestId);
  await persist();
  const draft = await request();
  check('申请人从真实登录身份冻结，草稿不扣库存', draft.status === 'DRAFT'
    && String(draft.applicantId) === sessions.accounts.employee.userId && draft.items.length === 1 && draft.items[0].applyQuantity === 3);
  fixture.itemId = id(draft.items[0].itemId);
  noCost(draft, '申请人详情不泄露估价与成本快照');
  await refuse('peer', `${requestPath}/${fixture.requestId}`, 'GET', undefined, /^400 INVALID_PARAMETER: 耗材业务参数无效，请核对后重试$/, '同角色其他员工不可查看申请');
  fixture.submit = { operationKey: operation('提交审批').operationKey, version: draft.version };
  await persist();
  await refuse('peer', `${requestPath}/${fixture.requestId}/submit`, 'POST', fixture.submit, /^400 INVALID_PARAMETER: 耗材业务参数无效，请核对后重试$/, '其他员工不可代提交申请');
  await configureApprover();
  const beforeApproval = proof();
  const submitted = await accepted('employee', `${requestPath}/${fixture.requestId}/submit`, 'POST', fixture.submit);
  check('ALWAYS真实进入审批，未自动批准', submitted.status === 'APPROVING');
  const bound = await until(request, value => value?.status === 'APPROVING' && Boolean(value.instanceId)
    && !value.instanceId.startsWith('F:'), '耗材Outbox绑定真实实例', 120000);
  fixture.instanceId = String(bound.instanceId);
  await persist();
  same('提交与实例绑定不占用或扣减库存', proof(), beforeApproval);
  const frozen = jsonRows(`SELECT rule_snapshot FROM oa_consumable_request WHERE tenant_id = ${sqlText(sessions.accounts.admin.tenantId)}
    AND request_id = ${sqlText(fixture.requestId)}`);
  check('服务端冻结原申请人排除名单与真实审批人', frozen.length === 1
    && JSON.stringify(frozen[0]._hExcludedUserIds) === JSON.stringify([sessions.accounts.employee.userId])
    && JSON.stringify(frozen[0].approverIds) === JSON.stringify([sessions.accounts.finance.userId]));
  const task = await until(async () => records(await accepted('finance', '/workflow/wf/todo?pageNum=1&pageSize=100'))
    .find(item => String(item.instanceId || item.processInstanceId) === fixture.instanceId), Boolean, 'H财务收到真实待办', 120000);
  await refuse('employee', '/workflow/wf/complete', 'POST', { taskId: task.taskId || task.id,
    action: 'APPROVE', comment: `${prefix}验证申请人不可自审`, variables: {} }, /SELF_APPROVAL|EXCLUDED|H_PARTICIPANT|无权|权限|审批人|办理人|操作人|403|本人|参与人/i, '申请人不能办理自己的审批任务');
  await completeWorkflowTask(sessions, fixture.instanceId, 'finance');
  const approved = await until(request, value => value?.status === 'APPROVED', '真实终审回调批准领用申请', 120000);
  check('批准数量来自真实回调', approved.items[0].approvedQuantity === 3 && approved.items[0].issuedQuantity === 0);
  same('真实批准回调不扣库存', proof(), beforeApproval);
  const dispatch = await accepted('oa', `${requestPath}/${fixture.requestId}/dispatch-detail`);
  fixture.issue = operation('仓管实物发料', { version: dispatch.version, allowPartial: false,
    items: [{ itemId: fixture.itemId, quantity: 3 }] });
  await persist();
  await refuse('employee', `${requestPath}/${fixture.requestId}/issue`, 'POST', fixture.issue, /403|权限|permission|forbidden/i, '申请人不能替仓管发料');
  const issued = await accepted('oa', `${requestPath}/${fixture.requestId}/issue`, 'POST', fixture.issue);
  check('仓管真实发足3个且状态为ISSUED', issued.status === 'ISSUED' && issued.rows.length === 1 && issued.rows[0].issuedQuantity === 3);
  await assertStock(17, '51.00', 3);
  const out = await accepted('finance', `${stockPath}/ledger/${issued.ledgerIds[0]}`);
  check('财务读到真实领用成本与来源', out.quantity === -3 && cents(out.amount) === -900n
    && out.sourceBizType === 'CONSUMABLE_REQUEST' && String(out.sourceBizId) === fixture.requestId
    && out.sourceEventKey === `CONSUMABLE_REQUEST:${fixture.requestId}:${fixture.itemId}:${fixture.issue.operationKey}`);
  const afterIssue = proof();
  const issuedReplay = await accepted('oa', `${requestPath}/${fixture.requestId}/issue`, 'POST', fixture.issue);
  check('发料原版本原请求立即重放成功', issuedReplay.replayed === true
    && JSON.stringify(issuedReplay.ledgerIds) === JSON.stringify(issued.ledgerIds));
  same('发料重放不再次扣库存', proof(), afterIssue);
  noCost(await accepted('oa', `${stockPath}/ledger/${issued.ledgerIds[0]}`), '仓管台账详情成本脱敏');
  noCost(await request(), '申请人发料后详情成本脱敏');
  fixture.status = 'FIRST_PASS_COMPLETED';
  await persist();
}

if (!process.argv.includes('--legacy-first-pass')) {
  await runOaAcceptance();
} else {
try {
  assertRuntime();
  runtimeReady = true;
  const previous = await readFixture(suite);
  if (!restoreOnly) check('无未恢复的上轮OA临时配置；异常中断请先用--restore-config', !previous.configMutationPending);
  sessions = await openSessions(['admin', 'oa', 'employee', 'peer', 'finance']);
  if (restoreOnly) {
    fixture = previous;
    check('仅恢复H首段已保存的配置', fixture.milestone === prefix && Boolean(fixture.configMutationPending));
    await restoreConfiguration();
    fixture.status = 'CONFIGURATION_RECOVERED';
  } else {
    if (previous.tag) await saveFixture(`${suite}-${Date.now()}`, previous);
    fixture = { milestone: prefix, tag: `${prefix}-OA-${randomUUID().slice(0, 8)}`, status: 'RUNNING',
      temporaryApproverId: sessions.accounts.finance.userId, configMutationPending: false, startedAt: new Date().toISOString() };
    await persist();
    await firstPass();
  }
} catch (error) {
  failure = error;
  console.error(JSON.stringify(failureSummary(error)));
} finally {
  if (sessions && fixture) {
    try { await restoreConfiguration(); }
    catch (error) {
      failure = error;
      fixture.status = 'CONFIGURATION_RESTORE_FAILED';
      console.error(JSON.stringify(failureSummary(error)));
    }
    if (failure && fixture.status !== 'CONFIGURATION_RESTORE_FAILED') fixture.status = 'FAILED';
    try { await persist(); } catch (error) { failure ??= error; }
  }
  if (runtimeReady) {
    try { await saveResult(restoreOnly ? `${suite}-recovery` : suite, failure, {
      scope: restoreOnly ? '仅恢复配置，不代表业务验收' : 'OA手工入库→真实审批→发料首段',
      pendingCoverage, configurationRestored: Boolean(fixture) && !fixture.configMutationPending,
      consumableId: fixture?.consumableId, requestId: fixture?.requestId,
    }); } catch (error) { failure ??= error; }
  }
  if (sessions?.browser) {
    try { await sessions.browser.close(); } catch (error) { failure ??= error; }
  }
  if (failure) process.exitCode = 1;
}
}
