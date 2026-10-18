import { createHash } from 'node:crypto';
import { hundredths } from './batch-h/hr09-evidence.mjs';

// Uses the current owned sessions and real workflow, never the old live-lib connection.
export function overtimeCorrectionWorkflow(context, state) {
  const { fixture, sessions, database, jsonRows, sqlText, check, ok, call, save, until, pause, label, note } = context;
  const pay = '/hr/compensation/payroll', configKey = 'sys.hr.payroll.correctionProcessKey';
  const hash = sql => createHash('sha256').update(database(sql)).digest('hex');
  const correction = id => jsonRows(`SELECT JSON_OBJECT('id',CAST(correction_id AS CHAR),'originalSlip',CAST(original_slip_id AS CHAR),
    'slip',CAST(correction_slip_id AS CHAR),'instance',instance_id,'status',status,'version',version)
    FROM hr_payroll_correction WHERE tenant_id=100000 AND correction_id=${sqlText(id)} AND deleted=0`)[0];
  const identity = id => {
    const row = correction(id);
    return hash(`SELECT * FROM hr_payroll_correction WHERE correction_id=${sqlText(id)}`)
      + hash(`SELECT * FROM hr_salary_slip WHERE id=${sqlText(row.slip)}`);
  };
  const prepare = async linked => {
    if (!state.originalConfig) {
      const row = jsonRows(`SELECT JSON_OBJECT('id',CAST(config_id AS CHAR)) FROM sys_config WHERE tenant_id=100000
        AND config_scope='1' AND config_key=${sqlText(configKey)}`);
      check('原工资补正配置唯一且属于当前租户', row.length === 1);
      const original = await ok('admin', `/auth/system/config/${row[0].id}`);
      state.originalConfig = Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key => [key, original[key] ?? null]));
      const definitions = jsonRows(`SELECT JSON_OBJECT('id',definition_id) FROM wf_process_definition WHERE tenant_id=100000
        AND process_key=${sqlText(original.configValue)} AND deleted=0 ORDER BY version DESC LIMIT 1`);
      check('原补正定义存在并保留完整原件', definitions.length === 1);
      state.originalDefinition = definitions[0].id;
      state.originalDefinitionHash = hash(`SELECT * FROM wf_process_definition WHERE definition_id=${sqlText(state.originalDefinition)}`);
      await save();
    }
    const key = linked ? 'linkedDefinition' : 'seedDefinition';
    if (!state[key]) {
      const original = await ok('admin', `/workflow/wf/definition/${state.originalDefinition}`);
      const model = structuredClone(typeof original.modelJson === 'string' ? JSON.parse(original.modelJson) : original.modelJson);
      const approvals = model.nodes.filter(node => node.type === 'APPROVAL');
      check('沿用开始财务结束三节点及两条原边', model.nodes.length === 3 && model.edges.length === 2 && approvals.length === 1
        && model.nodes.some(node => node.type === 'START') && model.nodes.some(node => node.type === 'END'));
      approvals[0].approverType = linked ? 'VARIABLE_USER' : 'USER';
      approvals[0].approverValue = linked ? 'hCorrectionApproverIds' : sessions.accounts.finance.userId;
      approvals[0].signType = 'ANY'; approvals[0].approveSelf = 'ALLOW';
      const processKey = `${label}-${linked ? 'linked' : 'seed'}-correction`;
      await ok('admin', '/workflow/wf/definition/save', 'POST', { processKey, processName: `${label} 财务补正`,
        modelJson: JSON.stringify(model), formId: null, description: note, startPermissionType: 'ALL' });
      const rows = jsonRows(`SELECT JSON_OBJECT('id',definition_id) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sqlText(processKey)} AND deleted=0`);
      check('本轮财务流程真实创建且唯一', rows.length === 1);
      state[key] = { id: rows[0].id, processKey }; await save();
      await ok('admin', `/workflow/wf/definition/deploy/${state[key].id}`, 'POST');
    }
    await ok('admin', '/auth/system/config', 'PUT', { ...state.originalConfig, configValue: state[key].processKey, remark: note });
    check('补正配置已通过真实接口切换', (await ok('admin', `/auth/system/config/${state.originalConfig.configId}`)).configValue === state[key].processKey);
  };
  const decide = async (id, linked, action = 'APPROVE') => {
    const row = await until(() => correction(id), value => Boolean(value?.instance), '补正真实审批实例');
    const tasks = await until(() => jsonRows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000
      AND instance_id=${sqlText(row.instance)} AND status='TODO'`), values => values.some(task => task.assignee === sessions.accounts.finance.userId), '独立财务补正待办');
    const task = tasks.find(value => value.assignee === sessions.accounts.finance.userId);
    check('补正实际财务独立于原申请人与经办人', sessions.accounts.finance.userId !== sessions.accounts.peer.userId
      && sessions.accounts.finance.userId !== sessions.accounts.admin.userId);
    const process = jsonRows(`SELECT JSON_OBJECT('definition',definition_id,'starter',CAST(start_user_id AS CHAR),
      'safe',NOT JSON_CONTAINS_PATH(variables,'one','$.grossAdjustment','$.hourlyRate','$.settlementAmount')) FROM wf_process_instance
      WHERE tenant_id=100000 AND instance_id=${sqlText(row.instance)}`)[0];
    check('补正使用冻结定义且流程变量不带金额', process.definition === state[linked ? 'linkedDefinition' : 'seedDefinition'].id
      && process.starter === sessions.accounts[linked ? 'peer' : 'admin'].userId && Number(process.safe) === 1);
    if (action === 'APPROVE') {
      const premature = await call('admin', `${pay}/corrections/${id}/pay`, 'POST', {});
      check('未经财务批准禁止补正发放', premature.body?.code === 'CORRECTION_NOT_APPROVED');
      const denied = await call('peer', '/workflow/wf/complete', 'POST', { taskId: task.id, action, comment: note, variables: {} });
      check('原员工不能代独立财务处理补正', denied.status === 403 || [403, 'FORBIDDEN'].includes(denied.body?.code));
    }
    await ok('finance', '/workflow/wf/complete', 'POST', { taskId: task.id, action, comment: note, variables: {} });
    await until(async () => {
      const current = correction(id);
      const slip = await ok('admin', `${pay}/slips/${current.slip}`);
      return { current, slip };
    }, value => action === 'APPROVE' ? value.current.status === 'APPLIED' && value.slip.status === 'SUBMITTED' : value.slip.status === 'CANCELLED', '财务真实回调应用结果');
    const history = jsonRows(`SELECT JSON_OBJECT('operator',CAST(operator_id AS CHAR),'action',action,'task',task_id) FROM wf_task_history
      WHERE tenant_id=100000 AND instance_id=${sqlText(row.instance)} AND action IN ('APPROVE','REJECT','COUNTERSIGN_APPROVE','COUNTERSIGN_REJECT')`);
    // The frozen ANY approval node records its real decision as COUNTERSIGN_*.
    check('独立财务实际审批历史唯一且动作准确', history.length === 1 && history[0].operator === sessions.accounts.finance.userId
      && history[0].task === task.id && history[0].action === 'COUNTERSIGN_' + action);
    await until(() => database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(row.instance)} AND status='TODO'`), value => value === '0', '补正待办全部收尾');
    return correction(id);
  };
  const payCorrection = async (id, amount, period) => {
    const row = correction(id), before = await ok('admin', `${pay}/slips/${row.slip}`);
    const snapshot = before.components.find(component => component.type === 'TAX_SNAPSHOT');
    const date = database(`SELECT CAST(end_date AS CHAR) FROM hr_payroll_period WHERE period_id=${sqlText(period.periodId)}`);
    const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
    const priorTax = year === 2026 ? 30180n : 0n;
    const cumulativeGross = (year === 2026 ? 5006003n : 0n)
      + (state.paid || []).filter(item => item.year === year).reduce((sum, item) => sum + hundredths(item.amount), 0n) + hundredths(amount);
    const taxable = cumulativeGross > BigInt(month) * 500000n ? cumulativeGross - BigInt(month) * 500000n : 0n;
    check('独立整数分按年重置累计且本组应预扣不超过已扣税', year >= 2026 && year <= 2030 && month >= 1 && month <= 12
      && taxable <= 3600000n && (taxable * 3n + 50n) / 100n <= priorTax);
    check('补正应发实发准确且累计已预扣保留、本期个税为零', hundredths(before.grossTotal) === hundredths(amount)
      && hundredths(before.netTotal) === hundredths(amount) && hundredths(before.currentTax) === 0n
      && hundredths(before.cumulativeTaxPaid) === priorTax && String(snapshot.payrollPeriodId) === String(period.periodId));
    check('补正税档仍为已批准的本轮七档快照', String(snapshot.slabId) === String(fixture.payroll.slabId) && snapshot.brackets.length === 7);
    await ok('admin', `${pay}/corrections/${id}/pay`, 'POST', {});
    const paid = await ok('admin', `${pay}/slips/${row.slip}`);
    check('财务批准后补正真实发放且封存摘要保持', paid.status === 'PAID' && paid.digestSha256 === before.digestSha256);
    const digest = identity(id);
    await pause(5100);
    await ok('admin', `${pay}/corrections/${id}/pay`, 'POST', {});
    check('补正重复发放不重复入账或改变工资原件', identity(id) === digest);
    state.paid ||= []; state.paid.push({ correctionId: id, slipId: row.slip, periodId: String(period.periodId), amount, tax: '0.00',
      year, priorTaxCents: String(priorTax), cumulativeGrossCents: String(cumulativeGross), deductionMonths: month,
      expectedLiabilityCents: String((taxable * 3n + 50n) / 100n) }); await save();
    return paid;
  };
  const seed = async period => {
    const input = { originalSlipId: fixture.payroll.paidSlipId, payrollPeriodId: String(period.periodId),
      grossAdjustment: '12.34', deductionAdjustment: '0.00', reason: `${note} 独立工资覆盖 ${period.periodId}` };
    const id = String(await ok('admin', pay + '/corrections', 'POST', input));
    state.corrections.push({ id, linked: false }); await save();
    await decide(id, false);
    return payCorrection(id, '12.34', period);
  };
  const restore = async () => {
    for (const item of state.corrections) {
      const row = correction(item.id);
      const slip = await ok('admin', `${pay}/slips/${row.slip}`);
      if (slip.status === 'PENDING') await decide(item.id, item.linked, 'REJECT');
      const terminal = await ok('admin', `${pay}/slips/${row.slip}`);
      check('本轮补正收尾保留真实付款提交或作废终态', ['PAID','SUBMITTED','CANCELLED'].includes(terminal.status));
    }
    if (state.originalConfig) {
      await ok('admin', '/auth/system/config', 'PUT', state.originalConfig);
      check('补正原配置和原流程定义恢复保持', (await ok('admin', `/auth/system/config/${state.originalConfig.configId}`)).configValue === state.originalConfig.configValue
        && hash(`SELECT * FROM wf_process_definition WHERE definition_id=${sqlText(state.originalDefinition)}`) === state.originalDefinitionHash);
    }
  };
  return { prepare, decide, seed, payCorrection, correction, identity, restore };
}
