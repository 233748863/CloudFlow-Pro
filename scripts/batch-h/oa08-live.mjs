import { randomUUID } from 'node:crypto';
import { api, check, checks, jsonRows, openSessions, pause, prefix, readFixture, saveFixture, sqlText, success, until } from './live-lib.mjs';

export const suite = 'oa08-live';
export const stockPath = '/oa/consumable';
export const requestPath = `${stockPath}/request`;
export const records = value => value?.rows ?? value?.records ?? (Array.isArray(value) ? value : []);
export const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected));
export const date = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export const roles = ['admin1', 'manager2', 'finance3', 'hr4', 'employee5', 'production6', 'oa7', 'sales8', 'sales9', 'operations10', 'auditor11'];

export function id(value) {
  const text = String(value ?? '');
  if (!/^[1-9][0-9]{0,18}$/.test(text) || typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('H_OA_IDENTIFIER_INVALID');
  return text;
}

export function cents(value) {
  const parts = /^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(String(value));
  if (!parts) throw new Error('H_OA_MONEY_INVALID');
  return (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] ?? '').padEnd(2, '0')));
}

export function noCost(value, label) {
  const forbidden = /^(unitPrice|amount|stockAmount|avgCost|avgCostAfter|lastPurchasePrice|balanceAmountAfter|totalAmount|issuedAmount|returnedAmount|ruleSnapshot|estimatedTotal|actualValue|thresholdValue)$/;
  const inspect = item => item == null || typeof item !== 'object'
    || Object.entries(item).every(([key, nested]) => !forbidden.test(key) && inspect(nested));
  check(label, inspect(value));
}

export class OaLive {
  async initialize() {
    this.fixture = await readFixture(suite);
    if (!this.fixture.tag) {
      this.fixture = { milestone: prefix, tag: `${prefix}-OA08-${randomUUID().slice(0, 8)}`, scenarios: {}, operations: {}, steps: {}, configurations: {}, phases: {} };
      await this.persist();
    }
    check('OA分阶段恢复资料属于当前H验收', this.fixture.milestone === prefix && this.fixture.tag.startsWith(`${prefix}-OA08-`));
    this.sessions = await openSessions(['admin', 'employee', 'peer', 'oa', 'finance', 'hr', 'sales', 'tenantPeer']);
    this.tenantId = this.sessions.accounts.admin.tenantId;
    await this.restore();
    const legacy = await readFixture('oa-first-pass');
    if (legacy.configMutationPending) {
      check('旧首段恢复资料完整且审批人原值为空', legacy.milestone === prefix && legacy.originalConfig?.configKey === 'sys.oa.consumable.approverUserId'
        && legacy.originalConfig.configValue === '');
      const current = await this.ok('admin', `/auth/system/config/${legacy.originalConfig.configId}`);
      check('旧首段审批人未被其他操作者接管', ['', legacy.temporaryApproverId].includes(current.configValue ?? '')
        && String(current.tenantId) === this.tenantId);
      if (current.configValue) await this.ok('admin', '/auth/system/config', 'PUT', legacy.originalConfig);
      const restored = await this.ok('admin', `/auth/system/config/${legacy.originalConfig.configId}`);
      check('旧首段审批人真实恢复为空', (restored.configValue ?? '') === '');
      legacy.configMutationPending = false;
      await saveFixture('oa-first-pass', legacy);
    }
    return this;
  }

  persist() { return saveFixture(suite, this.fixture); }
  call(actor, endpoint, method = 'GET', body, headers) {
    if (!this.sessions[actor]?.page) throw new Error('H_OA_REAL_IDENTITY_UNAVAILABLE');
    return api(this.sessions[actor].page, endpoint, { method, ...(body === undefined ? {} : { body }), ...(headers ? { headers } : {}) });
  }
  async ok(actor, endpoint, method = 'GET', body) {
    return success(await this.call(actor, endpoint, method, body), `${method} ${endpoint.split('?')[0]}`);
  }
  scenario(name) { return this.fixture.scenarios[name] ||= {}; }
  operation(fields = {}) { return { operationKey: `${prefix}:OA08:${randomUUID()}`, remark: `${this.fixture.tag}真实验收`, ...fields }; }

  async step(name, action) {
    if (this.fixture.steps[name]?.passed) return this.fixture.steps[name].result;
    const first = checks.length;
    const result = await action();
    this.fixture.steps[name] = { passed: true, result: result ?? null, checks: checks.slice(first), completedAt: new Date().toISOString() };
    await this.persist();
    return result;
  }

  async command(name, actor, endpoint, input) {
    let operation = this.fixture.operations[name];
    if (!operation) {
      operation = { actor, endpoint, body: typeof input === 'function' ? await input() : input };
      this.fixture.operations[name] = operation;
      await this.persist();
    }
    check('恢复操作保持原账号和原业务入口', operation.actor === actor && operation.endpoint === endpoint);
    const result = await this.ok(actor, endpoint, 'POST', operation.body);
    operation.result = result;
    await this.persist();
    return result;
  }

  async material(name, fields = {}) {
    const state = this.scenario(name);
    if (!state.materialName) {
      state.materialName = `${this.fixture.tag}-${name}`;
      state.materialInput = { name: state.materialName, model: 'H-OA08', unit: '个', brand: prefix, lowStockThreshold: 0,
        targetStock: 0, warnEnabled: 0, storageLocation: `${prefix}验收区`, ...fields };
      await this.persist();
    }
    if (!state.materialId) {
      const lookup = async () => records(await this.ok('admin', `${stockPath}/list?${new URLSearchParams({ name: state.materialName, pageSize: '100' })}`))
        .filter(row => row.name === state.materialName);
      let found = await lookup();
      if (!found.length) {
        await this.ok('admin', stockPath, 'POST', state.materialInput);
        found = await lookup();
      }
      check('真实创建且可恢复定位唯一H耗材', found.length === 1 && String(found[0].name).startsWith(this.fixture.tag));
      state.materialId = id(found[0].consumableId);
      await this.persist();
    }
    return state.materialId;
  }

  async readMaterial(materialId) { return this.ok('admin', `${stockPath}/${id(materialId)}`); }

  proof(materialId) {
    const tenant = sqlText(this.tenantId);
    const material = sqlText(id(materialId));
    const balances = jsonRows(`SELECT JSON_OBJECT('quantity', quantity, 'amount', CAST(stock_amount AS CHAR), 'average', CAST(avg_cost AS CHAR),
      'version', version) FROM oa_consumable WHERE tenant_id = ${tenant} AND consumable_id = ${material}`);
    const ledger = jsonRows(`SELECT JSON_OBJECT('id', CAST(ledger_id AS CHAR), 'quantity', quantity, 'amount', CAST(amount AS CHAR),
      'balance', balance_after, 'balanceAmount', CAST(balance_amount_after AS CHAR), 'logId', CAST(asset_log_id AS CHAR),
      'sourceType', source_biz_type, 'sourceId', CAST(source_biz_id AS CHAR), 'sourceItem', CAST(source_item_id AS CHAR),
      'sourceKey', source_event_key, 'type', transaction_type, 'reversalOf', CAST(reversal_of_ledger_id AS CHAR),
      'sourceLedger', CAST(source_ledger_id AS CHAR), 'operator', CAST(operator_id AS CHAR), 'beneficiary', CAST(beneficiary_id AS CHAR))
      FROM oa_consumable_ledger WHERE tenant_id = ${tenant} AND consumable_id = ${material} ORDER BY ledger_id`);
    const logs = jsonRows(`SELECT JSON_OBJECT('id', CAST(log_id AS CHAR), 'quantity', quantity_change, 'operator', CAST(operator_id AS CHAR),
      'beneficiary', CAST(target_id AS CHAR)) FROM oa_asset_log WHERE tenant_id = ${tenant} AND ref_type = '2' AND ref_id = ${material} ORDER BY log_id`);
    return { balances, ledger, logs };
  }

  async stock(materialId, quantity, amount, count) {
    const current = await this.readMaterial(materialId);
    const proof = this.proof(materialId);
    check('真实接口库存数量及金额符合本阶段预期', current.quantity === quantity && cents(current.stockAmount) === cents(amount));
    check('只读核对数据库缓存与接口一致', proof.balances.length === 1 && proof.balances[0].quantity === quantity && cents(proof.balances[0].amount) === cents(amount));
    check('每笔台账恰好关联一笔原日志', proof.ledger.length === count && proof.logs.length === count);
    let summedQuantity = 0;
    let summedAmount = 0n;
    for (const entry of proof.ledger) {
      summedQuantity += entry.quantity;
      summedAmount += cents(entry.amount);
      const log = proof.logs.find(row => row.id === entry.logId);
      check('逐行结存、操作人和领用人均可核对', summedQuantity === entry.balance && summedAmount === cents(entry.balanceAmount)
        && log?.quantity === entry.quantity && log.operator === entry.operator && log.beneficiary === entry.beneficiary);
    }
    check('全部真实流水汇总等于当前库存', summedQuantity === quantity && summedAmount === cents(amount));
    return current;
  }

  async deny(actor, endpoint, method, body, label, materialId, expected = /./) {
    const before = materialId ? this.proof(materialId) : null;
    const response = await this.call(actor, endpoint, method, body);
    check(`${label}返回明确4xx`, response.status >= 400 && response.status < 500 && response.status !== 429);
    check(`${label}符合拒绝原因`, expected.test(`${response.status} ${response.body?.code ?? ''} ${response.body?.msg ?? ''}`));
    if (before) same(`${label}未改变库存和流水`, this.proof(materialId), before);
    return response;
  }

  async config(key) {
    const found = records(await this.ok('admin', `/auth/system/config/list?${new URLSearchParams({ configKey: key, pageSize: '100' })}`))
      .filter(row => row.configKey === key && String(row.configScope) === '1' && String(row.tenantId) === this.tenantId);
    check('耗材政策为当前租户唯一配置', found.length === 1);
    return found[0];
  }

  async setConfig(key, value) {
    check('临时配置仅限本次耗材验收白名单', ['approverUserId', 'stockManagerUserId', 'approvalMode', 'limitMetric', 'recalculateMode']
      .some(suffix => key === `sys.oa.consumable.${suffix}`));
    const current = await this.config(key);
    let saved = this.fixture.configurations[key];
    const input = configValue => ({ configId: current.configId, configName: current.configName, configKey: key,
      configValue, configType: current.configType, configScope: current.configScope, remark: current.remark });
    if (!saved?.pending) {
      const defaults = { approverUserId: '', stockManagerUserId: '', approvalMode: 'ALWAYS', limitMetric: 'AMOUNT', recalculateMode: 'CHECK' };
      check('正式耗材政策保持未核定空值及初始停用口径', (current.configValue ?? '') === defaults[key.split('.').at(-1)]);
      saved = { original: input(current.configValue ?? ''), originalValue: current.configValue ?? '', values: [], pending: false };
      this.fixture.configurations[key] = saved;
    }
    check('配置修改前确认未被其他操作者接管', [saved.originalValue, ...saved.values].includes(current.configValue ?? ''));
    saved.values.push(String(value));
    saved.pending = true;
    await this.persist();
    if ((current.configValue ?? '') !== String(value)) {
      await pause(5200);
      await this.ok('admin', '/auth/system/config', 'PUT', input(String(value)));
    }
    check('临时耗材配置经真实接口读回确认', (await this.config(key)).configValue === String(value));
  }

  async restore() {
    if (!this.sessions) return;
    const failures = [];
    for (const [key, saved] of Object.entries(this.fixture.configurations).reverse()) {
      if (!saved.pending) continue;
      try {
      const current = await this.config(key);
      check('恢复前配置仍由本次验收持有', [saved.originalValue, ...saved.values].includes(current.configValue ?? '')
        && String(current.configId) === String(saved.original.configId));
      if ((current.configValue ?? '') !== saved.originalValue) {
        await pause(5200);
        await this.ok('admin', '/auth/system/config', 'PUT', saved.original);
      }
      const restored = await this.config(key);
      const persisted = jsonRows(`SELECT JSON_OBJECT('value', config_value) FROM sys_config WHERE tenant_id = ${sqlText(this.tenantId)}
        AND config_id = ${sqlText(id(current.configId))}`);
      check('耗材政策恢复由接口与只读SQL双重确认', (restored.configValue ?? '') === saved.originalValue
        && persisted.length === 1 && (persisted[0].value ?? '') === saved.originalValue);
      saved.pending = false;
      saved.restoredAt = new Date().toISOString();
      saved.restoredByApiAndSql = true;
      await this.persist();
      } catch (error) { failures.push(error); }
    }
    try {
      if (this.fixture.masterDataRestoration?.pending) {
        const { restoreOwnedMasterData } = await import('./oa08-boundaries.mjs');
        await restoreOwnedMasterData(this);
      }
    } catch (error) { failures.push(error); }
    try { await this.restoreRule(); } catch (error) { failures.push(error); }
    try {
      const { restoreRoleIdentities } = await import('./oa08-identities.mjs');
      await restoreRoleIdentities(this);
    } catch (error) { failures.push(error); }
    if (failures.length) throw failures[0];
  }

  ruleInput(rule) {
    return { id: rule.id, ruleCode: rule.ruleCode, ruleName: rule.ruleName, module: rule.module, thresholdValue: String(rule.thresholdValue),
      effect: rule.effect, enabled: rule.enabled, priority: rule.priority, remark: rule.remark };
  }

  ruleSignature(rule) {
    return JSON.stringify({ threshold: cents(rule.thresholdValue).toString(), effect: rule.effect, enabled: rule.enabled,
      priority: rule.priority, remark: rule.remark ?? '' });
  }

  async publishRule(input, marker) {
    const signature = this.ruleSignature({ ...input, remark: marker });
    const publications = this.fixture.rulePolicy.publications ||= {};
    let version;
    if (publications[signature]) {
      const versions = records(await this.ok('admin', `/auth/system/rules/versions?${new URLSearchParams({ ruleId: String(input.id), pageSize: '100' })}`));
      version = versions.find(row => String(row.id) === publications[signature]);
      check('仅恢复本验收持久记录的规则草稿', !!version && this.ruleSignature(version) === signature
        && ['DRAFT', 'PUBLISHED'].includes(version.status));
      if (version.status === 'PUBLISHED') {
        check('已发布的验收规则与当前生效内容一致', this.ruleSignature(await this.ok('admin', `/auth/system/rules/${input.id}`)) === signature);
        return;
      }
    } else {
      version = await this.ok('admin', '/auth/system/rules/draft', 'POST', { ...input, remark: marker });
      publications[signature] = id(version.id);
      await this.persist();
    }
    await this.ok('admin', `/auth/system/rules/versions/${id(version.id)}/publish`, 'POST', {});
  }

  async setRule(name, fields) {
    let saved = this.fixture.rulePolicy;
    const current = saved?.original?.id ? await this.ok('admin', `/auth/system/rules/${saved.original.id}`)
      : await this.ok('admin', '/auth/system/rules/effective/oa.consumable.request.limit');
    check('临时规则限定为本租户耗材领用规则', current?.ruleCode === 'oa.consumable.request.limit' && String(current.tenantId) === this.tenantId);
    if (!saved?.pending) {
      check('正式耗材规则仍为初始启用WARN零阈值', current.enabled === 1 && current.effect === 'WARN' && cents(current.thresholdValue) === 0n);
      saved = { original: this.ruleInput(current), signatures: [], pending: false };
      this.fixture.rulePolicy = saved;
    }
    check('规则修改前确认未被其他操作者接管', [this.ruleSignature(saved.original), ...saved.signatures].includes(this.ruleSignature(current)));
    const input = { ...this.ruleInput(current), ...fields, remark: `${this.fixture.tag}:${name}` };
    saved.signatures.push(this.ruleSignature(input));
    saved.pending = true;
    await this.persist();
    if (this.ruleSignature(current) !== this.ruleSignature(input)) await this.publishRule(input, input.remark);
    check('临时阈值经真实发布后生效', this.ruleSignature(await this.ok('admin', `/auth/system/rules/${current.id}`)) === this.ruleSignature(input));
  }

  async restoreRule() {
    const saved = this.fixture.rulePolicy;
    if (!saved?.pending) return;
    const current = await this.ok('admin', `/auth/system/rules/${saved.original.id}`);
    check('规则恢复前发布内容仍由本验收持有', [this.ruleSignature(saved.original), ...saved.signatures].includes(this.ruleSignature(current)));
    if (this.ruleSignature(current) !== this.ruleSignature(saved.original)) await this.publishRule(saved.original, saved.original.remark);
    const restored = await this.ok('admin', `/auth/system/rules/${saved.original.id}`);
    const persisted = jsonRows(`SELECT JSON_OBJECT('thresholdValue', CAST(threshold_value AS CHAR), 'effect', effect, 'enabled', enabled,
      'priority', priority, 'remark', remark) FROM sys_business_rule WHERE tenant_id = ${sqlText(this.tenantId)} AND id = ${sqlText(id(saved.original.id))}`);
    check('正式耗材规则经API及只读SQL恢复', this.ruleSignature(restored) === this.ruleSignature(saved.original)
      && persisted.length === 1 && this.ruleSignature(persisted[0]) === this.ruleSignature(saved.original));
    saved.pending = false;
    saved.restoredByApiAndSql = true;
    saved.restoredAt = new Date().toISOString();
    await this.persist();
  }

  async createRequest(name, actor, materialItems) {
    const state = this.scenario(name);
    if (!state.requestId) {
      const result = await this.command(`${name}:create`, actor, requestPath, () => ({ operationKey: this.operation().operationKey,
        purpose: `${this.fixture.tag}-${name}`, applyDate: date(), items: materialItems }));
      state.requestId = id(result.requestId);
      state.actor = actor;
      await this.persist();
    }
    const request = await this.ok(actor, `${requestPath}/${state.requestId}`);
    check('申请人和租户从真实登录身份取得', String(request.applicantId) === this.sessions.accounts[actor].userId);
    return request;
  }

  async approve(name, actor, requestId, materialId) {
    await this.setConfig('sys.oa.consumable.approverUserId', this.sessions.accounts.finance.userId);
    let request = await this.ok(actor, `${requestPath}/${requestId}`);
    if (request.status === 'DRAFT') {
      const before = this.proof(materialId);
      const submitted = await this.command(`${name}:submit`, actor, `${requestPath}/${requestId}/submit`,
        () => ({ operationKey: this.operation().operationKey, version: request.version }));
      check('真实提交进入审批且未自动批准', submitted.status === 'APPROVING');
      same('提交审批没有预占或扣减库存', this.proof(materialId), before);
    }
    request = await until(() => this.ok(actor, `${requestPath}/${requestId}`), value => ['APPROVED', 'ISSUED'].includes(value.status)
      || value.status === 'APPROVING' && value.instanceId && !String(value.instanceId).startsWith('F:'), 'OA绑定真实工作流实例', 120000);
    const snapshot = jsonRows(`SELECT rule_snapshot FROM oa_consumable_request WHERE tenant_id = ${sqlText(this.tenantId)} AND request_id = ${sqlText(id(requestId))}`);
    check('真实审批快照冻结申请人及不同身份的审批人', snapshot.length === 1
      && JSON.stringify(snapshot[0]._hExcludedUserIds) === JSON.stringify([this.sessions.accounts[actor].userId])
      && JSON.stringify(snapshot[0].approverIds) === JSON.stringify([this.sessions.accounts.finance.userId]));
    if (request.status === 'APPROVING') {
      if (['employee', 'peer'].includes(actor)) {
        const instance = await this.ok(actor, `/workflow/wf/instance/${request.instanceId}`);
        check('申请人真实取得本次流程变量用于成本隔离核验', instance.variables != null);
        const variables = typeof instance.variables === 'string' ? JSON.parse(instance.variables) : instance.variables;
        noCost(variables, '申请人通用流程详情不泄露被隐藏的成本变量');
      }
      const task = await until(async () => {
        const current = await this.ok(actor, `${requestPath}/${requestId}`);
        if (current.status === 'APPROVED') return { completed: true };
        return records(await this.ok('finance', '/workflow/wf/todo?pageNum=1&pageSize=100'))
          .find(row => String(row.instanceId || row.processInstanceId) === String(request.instanceId));
      }, Boolean, '真实审批人收到领用待办或回调已落地', 120000);
      if (!task.completed) {
      await this.step(`${name}:self-rejected`, () => this.deny(actor, '/workflow/wf/complete', 'POST',
        { taskId: task.taskId || task.id, action: 'APPROVE', comment: `${prefix}自审拒绝验收`, variables: {} }, '申请人自审', materialId));
      const before = this.proof(materialId);
      await this.ok('finance', '/workflow/wf/complete', 'POST', { taskId: task.taskId || task.id, action: 'APPROVE', comment: `${prefix}双身份真实审批`, variables: {} });
      request = await until(() => this.ok(actor, `${requestPath}/${requestId}`), value => value.status === 'APPROVED', '真实审批回调落地', 120000);
      same('真实批准回调未扣库存', this.proof(materialId), before);
      await pause(5500);
      const repeated = await this.call('finance', '/workflow/wf/complete', 'POST', { taskId: task.taskId || task.id,
        action: 'APPROVE', comment: `${prefix}真实重复审批核验`, variables: {} });
      check('重复真实审批明确拒绝或返回幂等成功', repeated.status === 200 && repeated.body?.code === 200 || [400, 404, 409].includes(repeated.status));
      const history = jsonRows(`SELECT JSON_OBJECT('count', COUNT(*)) FROM wf_task_history WHERE tenant_id = ${sqlText(this.tenantId)}
        AND task_id = ${sqlText(String(task.taskId || task.id))} AND action = 'APPROVE'`);
      check('同审批任务只留下一个真实批准事实', history.length === 1 && history[0].count === 1);
      const afterReplay = await this.ok(actor, `${requestPath}/${requestId}`);
      check('重复审批不再次推进领用主单版本', afterReplay.status === request.status && afterReplay.version === request.version);
      same('重复审批没有产生库存和流水', this.proof(materialId), before);
      }
      request = await this.ok(actor, `${requestPath}/${requestId}`);
    }
    const approvedHistory = request.instanceId ? jsonRows(`SELECT JSON_OBJECT('operator', CAST(operator_id AS CHAR)) FROM wf_task_history
      WHERE tenant_id = ${sqlText(this.tenantId)} AND instance_id = ${sqlText(String(request.instanceId))} AND action = 'APPROVE'`) : [];
    check('批准有不同于申请人的真实指定审批历史', approvedHistory.length === 1 && approvedHistory[0].operator === this.sessions.accounts.finance.userId
      && approvedHistory[0].operator !== this.sessions.accounts[actor].userId);
    check('批准数量来源于真实审批结果', ['APPROVED', 'ISSUED'].includes(request.status)
      && request.items.every(item => item.approvedQuantity === item.applyQuantity));
    noCost(await this.ok(actor, `${requestPath}/${requestId}`), '申请人详情不回传成本或规则金额');
    return request;
  }
}
