import assert from 'node:assert/strict';

export async function verifyF3ProjectTimesheets(ctx) {
  const { admin, employee, manager, readonly, outsider, api, successful, check, evidence, marker, database, rows,
    get, post, remove, reject, today, shifted, week, cents, snapshot, waitFor, completeWorkflow,
    primary, secondary, effortTask, secondTask, groupTask, templateProject, createProject, createTask, addEmployee, put } = ctx;
  const identity = await get('/oa/timesheets/employee', employee);
  check('AC-1/2 工时身份来自唯一在职员工及实际职位职级', String(identity.id) === '990000707'
    && String(identity.userId) === '990000707' && String(identity.jobLevelId) === '990000731');
  const createType = async suffix => {
    const typeId = await post('/oa/activity-catalog/types', { typeCode: marker + '_' + suffix,
      typeName: marker + '_' + suffix, billableDefaultFlag: 1, sortNo: 1, status: 'ACTIVE' });
    const type = (await get('/oa/activity-catalog/types')).find(value => String(value.typeId) === String(typeId));
    check('AC-1 活动类型经真实入口保存', type?.typeCode === marker + '_' + suffix);
    return type;
  };
  const createRate = async (type, costingRate, billingRate, extra = {}) => {
    const costId = await post('/oa/activity-catalog/costs', { activityTypeId: type.typeId, employeeId: 0,
      jobLevelId: 0, costingRate, billingRate, currency: 'CNY', effectiveStart: shifted(-365),
      effectiveEnd: null, status: 'ACTIVE', ...extra });
    return (await get('/oa/activity-catalog/costs?typeId=' + type.typeId)).find(value => String(value.costId) === String(costId));
  };
  const personalType = await createType('员工优先活动');
  const levelType = await createType('职级优先活动');
  const defaultType = await createType('默认单价活动');
  for (const type of [personalType, levelType, defaultType]) await createRate(type, '100.01', '150.03');
  for (const type of [personalType, levelType]) await createRate(type, '120.02', '200.05', { jobLevelId: identity.jobLevelId });
  let personalRate = await createRate(personalType, '130.03', '250.07', { employeeId: identity.id });
  for (const extra of [{ employeeId: identity.id, jobLevelId: identity.jobLevelId },
    { effectiveStart: today }, { effectiveStart: today, effectiveEnd: shifted(-1) }]) {
    reject(await api(admin, '/oa/activity-catalog/costs', { method: 'POST', body: {
      activityTypeId: defaultType.typeId, employeeId: 0, jobLevelId: 0, costingRate: '10.00', billingRate: '20.00',
      currency: 'CNY', effectiveStart: shifted(-365), status: 'ACTIVE', ...extra } }), 'AC-1 单价范围冲突、日期重叠或倒置被拒绝');
  }
  for (const page of [employee, readonly]) {
    reject(await api(page, '/oa/activity-catalog/costs'), 'AC-11 普通账号不能读取内部单价目录');
    reject(await api(page, '/oa/activity-catalog/employees'), 'AC-11 普通账号不能读取单价员工候选');
    reject(await api(page, '/oa/activity-catalog/job-levels'), 'AC-11 普通账号不能读取单价职级候选');
  }
  const detail = (type = personalType, target = primary, task = effortTask, hours = '1.00', extra = {}) => ({
    projectId: target.projectId, taskId: task.taskId, activityTypeId: type.typeId, workDate: today,
    hours, billableFlag: 1, description: marker + '_实际工作', ...extra,
  });
  const body = (details, previous = null) => ({ timesheet: { ...previous, startDate: previous?.startDate || week.start, endDate: previous?.endDate || week.end,
    employeeId: 990000701, employeeName: '不能替换实际员工' }, details });
  const sheet = (id, page = employee) => get('/oa/timesheets/' + id, page);
  const saveSheet = async (details, previous = null) => sheet(await post('/oa/timesheets', body(details, previous), employee));
  const sheetSnapshot = id => snapshot(`SELECT * FROM oa_timesheet WHERE tenant_id=100000 AND timesheet_id=${id};
    SELECT * FROM oa_timesheet_detail WHERE tenant_id=100000 AND timesheet_id=${id} ORDER BY detail_id;`);
  const rawDetails = id => rows(`SELECT JSON_OBJECT('id',CAST(detail_id AS CHAR),'task',CAST(task_id AS CHAR),
    'hours',hours,'costingRate',costing_rate,'billingRate',billing_rate,'costingAmount',costing_amount,
    'billingAmount',billing_amount,'billableFlag',billable_flag) FROM oa_timesheet_detail
    WHERE tenant_id=100000 AND timesheet_id=${id} AND deleted=0 ORDER BY detail_id;`);
  const availableTasks = await get('/oa/timesheets/projects/' + primary.projectId + '/tasks', employee);
  check('AC-19 工时任务候选包括具体任务且排除分组', availableTasks.some(value => value.taskId === effortTask.taskId)
    && availableTasks.every(value => value.isGroupFlag === 0 && value.status !== 'CANCELLED'));
  for (const [label, invalid] of [
    ['分组任务', detail(personalType, primary, groupTask)],
    ['跨项目任务', detail(personalType, primary, secondTask)],
    ['非本人项目', detail(personalType, templateProject, effortTask)],
    ['未来工作日', detail(personalType, primary, effortTask, '1.00', { workDate: shifted(1) })],
    ['零工时', detail(personalType, primary, effortTask, '0.00')],
    ['三位小数', detail(personalType, primary, effortTask, '1.001')],
    ['时段不一致', detail(personalType, primary, effortTask, '2.00', { fromTime: '09:00:00', toTime: '10:00:00' })],
    ['无来源负数', detail(personalType, primary, effortTask, '-1.00')],
  ]) reject(await api(employee, '/oa/timesheets', { method: 'POST', body: body([invalid]) }), 'AC-2/6/19 ' + label + '被真实拒绝');
  const limit = Number(database("SELECT config_value FROM sys_config WHERE tenant_id=100000 AND config_key='sys.oa.timesheet.maxDailyHours';"));
  check('AC-2 独立环境使用原24小时默认上限', limit === 24);
  reject(await api(employee, '/system/rules/effective/oa.timesheet.daily-hours'),
    'AC-2/11 员工填报不获得规则管理查看权限');
  reject(await api(employee, '/system/rules/hit-records', { method: 'POST', body: {
    ruleCode: 'oa.timesheet.daily-hours', businessType: 'TIMESHEET', businessId: 1,
    thresholdValue: 8, actualValue: 24, effect: 'WARN', hitResult: 'WARN' } }),
  'AC-2/11 员工不能直接伪造规则命中记录');
  const longDayRecords = database("SELECT COUNT(*) FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND rule_code='oa.timesheet.daily-hours' AND actual_value=24 AND effect='WARN';");
  const fullDay = await saveSheet([detail(defaultType, primary, effortTask, '24.00')]);
  check('AC-2 普通员工保存24小时工时且真实追加长工时提醒记录',
    Number(fullDay.timesheet.totalHours) === 24 && Number(database("SELECT COUNT(*) FROM sys_business_rule_hit_record WHERE tenant_id=100000 AND rule_code='oa.timesheet.daily-hours' AND actual_value=24 AND effect='WARN';")) === Number(longDayRecords) + 1);
  reject(await api(employee, '/oa/timesheets', { method: 'POST', body: body([detail(defaultType, primary, effortTask, '0.01')]) }),
    'AC-2 两张草稿合计超过24小时被拒绝');
  await remove('/oa/timesheets/' + fullDay.timesheet.timesheetId, employee);
  check('AC-2 草稿删除实际标记主表并释放全部明细', database(`SELECT deleted FROM oa_timesheet WHERE tenant_id=100000
    AND timesheet_id=${fullDay.timesheet.timesheetId};`) === '1' && rawDetails(fullDay.timesheet.timesheetId).length === 0);
  const concurrent = await Promise.all(['甲', '乙'].map(suffix => api(employee, '/oa/timesheets', { method: 'POST',
    body: body([detail(defaultType, primary, effortTask, '13.00', { description: marker + '_同时填报_' + suffix })]) })));
  const accepted = concurrent.filter(value => value.status === 200 && value.body?.code === 200);
  check('AC-2 两张13小时并发请求只有一张实际保存', accepted.length === 1);
  for (const response of concurrent.filter(value => !accepted.includes(value))) reject(response, 'AC-2 并发超限请求得到业务拒绝');
  for (const response of accepted) await remove('/oa/timesheets/' + successful(response, '并发工时'), employee);
  const missingType = await createType('未配置单价');
  const unpriced = await saveSheet([detail(missingType)]);
  const unpricedBefore = sheetSnapshot(unpriced.timesheet.timesheetId);
  reject(await api(employee, '/oa/timesheets/' + unpriced.timesheet.timesheetId + '/submit', { method: 'POST', body: {} }),
    'AC-1/5 未配置有效单价的工时不能提交', '工作日期未匹配到有效单价，请联系管理者配置');
  check('AC-5 缺价提交失败后原草稿和明细保持', sheetSnapshot(unpriced.timesheet.timesheetId) === unpricedBefore);
  await remove('/oa/timesheets/' + unpriced.timesheet.timesheetId, employee);

  const main = await saveSheet([detail(personalType, primary, effortTask, '1.25'),
    detail(levelType, primary, effortTask, '2.50'), detail(defaultType, secondary, secondTask, '0.75', { billableFlag: 0 })]);
  const mainId = main.timesheet.timesheetId;
  const beforeSubmit = rawDetails(mainId);
  check('AC-1 员工、职级、默认三个优先级均从实际明细匹配', beforeSubmit.length === 3
    && beforeSubmit.map(value => cents(value.costingRate)).join(',') === '13003,12002,10001'
    && beforeSubmit.map(value => cents(value.billingRate)).join(',') === '25007,20005,15003');
  check('AC-3 两套单价分别逐笔取整且不可计费项为零', beforeSubmit.map(value => cents(value.costingAmount)).join(',') === '16254,30005,7501'
    && beforeSubmit.map(value => cents(value.billingAmount)).join(',') === '31259,50013,0');
  check('AC-2 工时所属员工由登录身份确定', String(main.timesheet.employeeId) === '990000707' && Number(main.timesheet.totalHours) === 4.5);
  check('AC-11 员工明细隐藏成本单价及金额且计费金额仍可读', main.timesheet.costingAmount == null
    && main.details.every(value => value.costingRate == null && value.costingAmount == null)
    && cents(main.timesheet.billingAmount) === 81272n);
  personalRate = await createRate(personalType, '140.04', '270.08', { ...personalRate, costingRate: '140.04', billingRate: '270.08' });
  const submit = async value => {
    await post('/oa/timesheets/' + value.timesheet.timesheetId + '/submit', {}, employee);
    return waitFor(() => sheet(value.timesheet.timesheetId), candidate => candidate.timesheet.status === 'APPROVING'
      && candidate.timesheet.instanceId && !candidate.timesheet.instanceId.startsWith('F:'), '工时未绑定真实审批实例');
  };
  const finish = async (value, decision = 'APPROVE', requiredApprovers = ['990000702']) => {
    await completeWorkflow(value.timesheet.instanceId, decision, { requiredApprovers });
    return waitFor(() => sheet(value.timesheet.timesheetId), candidate => candidate.timesheet.status ===
      (decision === 'REJECT' ? 'REJECTED' : 'APPROVED'), '工时真实审批未回写终态');
  };
  const historicalProject = await createProject('退出成员补报');
  const historicalTask = await createTask(historicalProject, '原参与期间任务');
  const historicalMember = await addEmployee(historicalProject, { joinDate: shifted(-14), leaveDate: shifted(-7) });
  const historicalPeriod = { startDate: shifted(-14), endDate: shifted(-7) };
  const membersBefore = JSON.stringify(await get('/oa/project/' + historicalProject.projectId + '/members'));
  reject(await api(admin, '/oa/project/member', { method: 'POST', body: {
    projectId: historicalProject.projectId, userId: 990000707, joinDate: shifted(-6), leaveDate: shifted(-7) } }),
  'AC-2 新增成员退出日期早于加入日期被拒绝', '退出日期不能早于加入日期');
  for (const [changes, message] of [
    [{ joinDate: shifted(-6) }, '退出日期不能早于加入日期'],
    [{ projectId: primary.projectId }, '成员不能更换所属项目'],
    [{ userId: 990000705 }, '成员不能更换员工'],
  ]) {
    reject(await api(admin, '/oa/project/member', { method: 'PUT', body: { ...historicalMember, ...changes } }),
    'AC-2 成员维护拒绝非法期间、跨项目及更换员工', message);
  }
  reject(await api(outsider, '/oa/project/member', { method: 'PUT', body: historicalMember }),
    'AC-2/11 外租户不能修改实际参与期间');
  check('AC-2 非法成员维护拒绝后原参与记录完整保持', membersBefore ===
    JSON.stringify(await get('/oa/project/' + historicalProject.projectId + '/members')));
  const historicalCandidates = await get('/oa/timesheets/projects?' + new URLSearchParams({ from: historicalPeriod.startDate, to: historicalPeriod.endDate }), employee);
  check('AC-2 用户确认的退出成员可选原参与期间项目', historicalCandidates.some(value => value.projectId === historicalProject.projectId)
    && !(await get('/oa/timesheets/projects?' + new URLSearchParams({ from: today, to: today }), employee)).some(value => value.projectId === historicalProject.projectId));
  const historicalTasks = await get('/oa/timesheets/projects/' + historicalProject.projectId + '/tasks?'
    + new URLSearchParams({ from: historicalPeriod.startDate, to: historicalPeriod.endDate }), employee);
  check('AC-19 退出成员可读取原参与期间的具体任务候选', historicalTasks.some(value => value.taskId === historicalTask.taskId));
  for (const date of [shifted(-15), shifted(-6)]) {
    reject(await api(employee, '/oa/timesheets', { method: 'POST', body: body([
      detail(defaultType, historicalProject, historicalTask, '0.25', { workDate: date })], { startDate: date, endDate: date }) }),
    'AC-2 加入前或退出后工时被拒绝', '只能填报本人在工作日期参与的有效项目');
  }
  const historicalSheet = await saveSheet([detail(defaultType, historicalProject, historicalTask, '0.25', { workDate: historicalPeriod.startDate }),
    detail(defaultType, historicalProject, historicalTask, '0.25', { workDate: historicalPeriod.endDate })], historicalPeriod);
  check('AC-2 加入日和退出日均可真实补填', Number(historicalSheet.timesheet.totalHours) === 0.5);
  await put('/oa/project/member', { ...historicalMember, joinDate: shifted(-13) });
  const historicalBefore = sheetSnapshot(historicalSheet.timesheet.timesheetId);
  reject(await api(employee, '/oa/timesheets/' + historicalSheet.timesheet.timesheetId + '/submit', { method: 'POST', body: {} }),
    'AC-2 提交时重新校验变更后的实际参与日期', '只能填报本人在工作日期参与的有效项目');
  check('AC-2 参与期间变化导致提交失败时原草稿完整保持', sheetSnapshot(historicalSheet.timesheet.timesheetId) === historicalBefore);
  const alteredMember = (await get('/oa/project/' + historicalProject.projectId + '/members')).find(value => value.id === historicalMember.id);
  await put('/oa/project/member', { ...alteredMember, joinDate: historicalPeriod.startDate });
  await finish(await submit(historicalSheet));
  check('AC-2/4 退出成员补报通过真实经理审批', (await sheet(historicalSheet.timesheet.timesheetId)).timesheet.status === 'APPROVED');
  const currentMember = (await get('/oa/project/' + historicalProject.projectId + '/members')).find(value => value.id === historicalMember.id);
  await put('/oa/project/member', { ...currentMember, leaveDate: null });
  const resumedMember = (await get('/oa/project/' + historicalProject.projectId + '/members')).find(value => value.id === historicalMember.id);
  check('AC-2 清空退出日期实际保存并恢复当前期间的填报候选', resumedMember.leaveDate == null
    && (await get('/oa/timesheets/projects?' + new URLSearchParams({ from: today, to: today }), employee))
      .some(value => value.projectId === historicalProject.projectId));
  await put('/oa/project/member', { ...resumedMember, leaveDate: historicalPeriod.endDate });
  check('AC-2 恢复原退出日期后当前期间候选准确排除', !(await get('/oa/timesheets/projects?'
    + new URLSearchParams({ from: today, to: today }), employee)).some(value => value.projectId === historicalProject.projectId));
  evidence.memberPeriods = true;
  ctx.historicalProject = historicalProject;
  ctx.historicalTask = historicalTask;
  ctx.historicalPeriod = historicalPeriod;
  const pending = await submit(main);
  const submittedDetails = rawDetails(mainId);
  check('AC-5 提交前重新匹配最新单价并锁定真实明细', cents(submittedDetails[0].costingRate) === 14004n
    && cents(submittedDetails[0].costingAmount) === 17505n && cents(submittedDetails[0].billingAmount) === 33760n);
  const pendingBefore = sheetSnapshot(mainId);
  personalRate = await createRate(personalType, '999.99', '1999.99', { ...personalRate, costingRate: '999.99', billingRate: '1999.99' });
  check('AC-5 后续改单价不会改变已提交的原工时和金额', sheetSnapshot(mainId) === pendingBefore);
  const approved = await finish(pending, 'APPROVE', ['990000701', '990000702']);
  const reviewed = await sheet(mainId, manager);
  check('AC-3/4 两位项目经理完成审批后总成本550.11和计费837.73准确', reviewed.timesheet.status === 'APPROVED'
    && cents(reviewed.timesheet.costingAmount) === 55011n && cents(reviewed.timesheet.billingAmount) === 83773n
    && Number(reviewed.timesheet.billableHours) === 3.75);
  check('AC-5 审批后逐项保留提交时的金额快照', JSON.stringify(rawDetails(mainId)) === JSON.stringify(submittedDetails));
  const immutable = sheetSnapshot(mainId);
  reject(await api(employee, '/oa/timesheets', { method: 'POST', body: body(approved.details, approved.timesheet) }), 'AC-6 已审批工时不能修改');
  reject(await api(employee, '/oa/timesheets/' + mainId, { method: 'DELETE' }), 'AC-6 已审批工时不能删除');
  check('AC-6 修改和删除拒绝后原审批单与明细逐字保持', sheetSnapshot(mainId) === immutable);
  for (const page of [readonly, outsider]) reject(await api(page, '/oa/timesheets/' + mainId), 'AC-11 他人或外租户不能读取本人工时');
  const ownList = await get('/oa/timesheets?pageNum=1&pageSize=100', employee);
  check('AC-11 员工列表仅含本人工时且隐藏内部成本', ownList.rows.length > 0
    && ownList.rows.every(value => String(value.employeeId) === '990000707' && value.costingAmount == null));
  const rejectedDraft = await saveSheet([detail(defaultType, primary, effortTask, '0.50', { description: marker + '_驳回重提' })]);
  const rejectedPending = await submit(rejectedDraft);
  const rejected = await finish(rejectedPending, 'REJECT');
  check('AC-4 驳回保存经理意见且不计入已审批汇总', rejected.timesheet.rejectReason === marker + '_实际审批');
  const retried = await saveSheet(rejected.details, rejected.timesheet);
  const retriedPending = await submit(retried);
  check('AC-4 驳回重提生成新的真实流程实例', retriedPending.timesheet.instanceId !== rejectedPending.timesheet.instanceId);
  await finish(retriedPending, 'REJECT');
  await remove('/oa/timesheets/' + rejectedDraft.timesheet.timesheetId, employee);
  const sourceDetail = reviewed.details.find(value => String(value.detailId) === submittedDetails[0].id);
  reject(await api(employee, '/oa/timesheets', { method: 'POST', body: body([{ ...sourceDetail, detailId: null,
    hours: '-1.26', reversalOfDetailId: sourceDetail.detailId }]) }), 'AC-6 累计冲正不得超过原工时', '累计冲正工时超过原明细工时');
  const reversal = async (parts, previous = null) => saveSheet(parts.map(value => ({ ...value.source, detailId: null,
    hours: value.hours, reversalOfDetailId: value.source.detailId, description: marker + '_冲正原工时' })), previous);
  ctx.hourTypes = { personalType, levelType, defaultType };
  ctx.approvedSheet = reviewed;
  ctx.sheet = sheet;
  ctx.sheetSnapshot = sheetSnapshot;
  ctx.saveSheet = saveSheet;
  ctx.hourDetail = detail;
  ctx.rawHourDetails = rawDetails;
  ctx.submitSheet = submit;
  ctx.finishSheet = finish;
  ctx.reverseHours = reversal;
  evidence.catalog = true;
  evidence.ratePriority = true;
  evidence.dailyLimits = true;
  evidence.timesheets = true;
  evidence.frozenRates = true;
  evidence.approval = true;
  evidence.concurrency = true;
}
