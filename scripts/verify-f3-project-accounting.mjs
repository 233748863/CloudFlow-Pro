import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyF3ProjectAccounting(ctx) {
  const { admin, manager, employee, outsider, api, check, evidence, marker, quote, rows, database, get, post, put,
    reject, today, shifted, cents, waitFor, snapshot, project, taskList, completeWorkflow, primary, secondary,
    effortTask, groupTask, approvedSheet, sheetSnapshot, reverseHours, submitSheet, finishSheet,
    saveSheet, hourDetail, hourTypes } = ctx;
  const initial = await project(primary.projectId);
  const second = await project(secondary.projectId);
  check('AC-7 两个项目只汇总自身的已批准明细', cents(initial.laborCostAmount) === 47510n && cents(initial.billableAmount) === 83773n
    && Number(initial.actualHours) === 3.75 && cents(second.laborCostAmount) === 7501n && cents(second.billableAmount) === 0n && Number(second.actualHours) === 0.75);
  const tasks = await taskList(primary.projectId);
  check('AC-7/19 具体任务与父分组均准确累计3.75小时', [effortTask, groupTask].every(target =>
    Number(tasks.find(value => value.taskId === target.taskId)?.actualHours) === 3.75));
  check('AC-8 零计费项目保留负毛利并不显示无意义比例', cents(second.grossMargin) === -7501n && second.grossMarginRate == null);
  await put('/oa/project', { ...initial, otherCostAmount: '10.02' }, manager);

  const supplierName = marker + '_成本采购供应商';
  await post('/oa/supplier', { supplierName, supplierCode: marker + '_COST_SUPPLIER', supplierType: 'MANUFACTURER', status: 'ACTIVE', currency: 'CNY' });
  const suppliers = (await get('/oa/supplier/list?' + new URLSearchParams({ supplierName, pageNum: '1', pageSize: '100' }))).records;
  const supplier = suppliers.find(value => value.supplierCode === marker + '_COST_SUPPLIER');
  assert.ok(supplier?.supplierId);
  const materialName = marker + '_成本采购耗材';
  await post('/oa/consumable', { name: materialName, model: 'F3', unit: '个', brand: marker,
    lowStockThreshold: 0, targetStock: 0, warnEnabled: 0, storageLocation: '项目成本验收区' });
  const materials = await get('/oa/consumable/list?' + new URLSearchParams({ name: materialName, pageSize: '100' }));
  const material = (materials.records || materials.rows).find(value => value.name === materialName);
  assert.ok(material?.consumableId);
  const purchaseReason = marker + '_项目真实采购';
  await post('/oa/purchase/request', { projectId: primary.projectId, supplierId: supplier.supplierId,
    reason: purchaseReason, expectedDate: shifted(1) + ' 12:00:00', items: [{ consumableId: material.consumableId, quantity: 3, unitPrice: '10.01' }] });
  const purchaseIds = rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM biz_purchase_request
    WHERE tenant_id=100000 AND reason=${quote(purchaseReason)} AND deleted=0;`);
  check('AC-9 项目采购从真实申请入口唯一保存', purchaseIds.length === 1);
  const purchaseId = purchaseIds[0].id;
  const purchase = () => get('/oa/purchase/request/' + purchaseId);
  check('AC-9 采购草稿尚不增加已完成采购成本', cents((await project(primary.projectId)).purchaseCostAmount) === 0n);
  await post('/oa/purchase/request/submit/' + purchaseId);
  const pendingPurchase = await waitFor(purchase, value => value.instanceId && !value.instanceId.startsWith('F:'), '项目采购未绑定真实审批');
  await completeWorkflow(pendingPurchase.instanceId, 'APPROVE', { allowTransfer: true });
  const approvedPurchase = await waitFor(purchase, value => value.status === 'APPROVED', '项目采购真实审批尚未回写');
  check('AC-9 审批通过而未完成收货仍不计采购成本', cents((await project(primary.projectId)).purchaseCostAmount) === 0n);
  const receiptCommand = { operationKey: randomUUID(), purchaseVersion: approvedPurchase.version, remark: marker + '_实际入库',
    items: [{ itemId: approvedPurchase.items[0].id, quantity: 3 }] };
  const receipt = await post('/oa/purchase/request/' + purchaseId + '/receipt', receiptCommand);
  const received = await waitFor(() => project(primary.projectId), value => cents(value.purchaseCostAmount) === 3003n, '实际收货未回写项目采购成本');
  check('AC-9 三件10.01元的真实收货回写30.03元', (await purchase()).status === 'RECEIVED' && receipt.ledgerIds.length === 1
    && cents(received.actualCostAmount) === 51515n && cents(received.grossMargin) === 32258n && Number(received.grossMarginRate) === 0.3851);
  const repeated = await post('/oa/purchase/request/' + purchaseId + '/receipt', receiptCommand);
  check('AC-9 重复收货保持原台账与原项目成本', JSON.stringify(repeated.ledgerIds) === JSON.stringify(receipt.ledgerIds)
    && cents((await project(primary.projectId)).purchaseCostAmount) === 3003n);
  evidence.purchase = true;

  const createContract = async (target, suffix) => post('/oa/contract', { contractNo: marker + '_CONTRACT_' + suffix,
    contractName: marker + '_项目合同_' + suffix, contractType: 'SERVICE', counterpartyName: marker + '_合同相对方',
    amount: '1000.00', currency: 'CNY', projectId: target.projectId, startDate: shifted(-30), endDate: shifted(30) });
  const primaryContract = await createContract(primary, 'PRIMARY');
  const secondContract = await createContract(secondary, 'SECOND');
  const createInvoice = async (suffix, direction, amount) => {
    const invoiceNo = marker + '_INVOICE_' + suffix;
    await post('/oa/invoice', { invoiceNo, invoiceCode: marker + '_CODE', invoiceDirection: direction, invoiceType: 'NORMAL',
      contractId: primaryContract, grossAmount: amount, taxAmount: '0.01', invoiceDate: today, remark: marker + '_实际登记' });
    const matched = (await get('/oa/invoice/list?' + new URLSearchParams({ invoiceNo, pageNum: '1', pageSize: '100' }))).rows.filter(value => value.invoiceNo === invoiceNo);
    check('AC-9 发票经实际登记入口保存', matched.length === 1 && matched[0].status === 'REGISTERED');
    return matched[0];
  };
  const outputInvoice = await createInvoice('OUTPUT', 'OUTPUT', '123.45');
  await createInvoice('INPUT', 'INPUT', '99.99');
  check('AC-9 销项开票123.45元回写，进项发票不增加对客开票', cents((await project(primary.projectId)).billedAmount) === 12345n);
  await put('/oa/invoice', { ...outputInvoice, contractId: secondContract });
  check('AC-9 发票改关联后同步更新原项目和新项目', cents((await project(primary.projectId)).billedAmount) === 0n
    && cents((await project(secondary.projectId)).billedAmount) === 12345n);
  const movedInvoice = await get('/oa/invoice/' + outputInvoice.invoiceId);
  await put('/oa/invoice', { ...movedInvoice, contractId: primaryContract });
  await post('/oa/invoice/' + outputInvoice.invoiceId + '/void', { remark: marker + '_实际作废' });
  check('AC-9 真实作废后原开票金额从项目汇总扣除', cents((await project(primary.projectId)).billedAmount) === 0n
    && (await get('/oa/invoice/' + outputInvoice.invoiceId)).status === 'VOID');
  ctx.finalInvoice = await createInvoice('FINAL', 'OUTPUT', '123.45');
  const unlinkedDetail = await get('/oa/project/' + primary.projectId + '/detail');
  check('AC-9 无直接合同或客户关联的项目详情可读且发票摘要为空',
    unlinkedDetail.project.contractId == null && unlinkedDetail.project.customerId == null
    && unlinkedDetail.linkSummary.invoiceSummary === '未关联合同/客户发票');
  await put('/oa/project', { ...unlinkedDetail.project, contractId: primaryContract }, manager);
  const linkedDetail = await get('/oa/project/' + primary.projectId + '/detail');
  check('AC-9 关联合同后项目详情只统计该合同的实际发票', String(linkedDetail.project.contractId) === String(primaryContract)
    && linkedDetail.linkSummary.invoiceSummary === '发票 3 张，全额核销 0 张，部分核销 0 张'
    && cents(linkedDetail.project.billedAmount) === 12345n);
  evidence.invoice = true;

  const reportQuery = new URLSearchParams({ from: today, to: today });
  const report = await get('/oa/reports/projects?' + reportQuery, manager);
  const current = await project(primary.projectId);
  const costRow = report.costs.find(value => String(value.projectId) === String(primary.projectId));
  check('AC-21 成本报表与项目实际人力、采购、其他、计费及开票逐项一致', costRow &&
    ['laborCostAmount', 'purchaseCostAmount', 'otherCostAmount', 'actualCostAmount', 'billableAmount', 'billedAmount', 'grossMargin']
      .every(field => cents(costRow[field]) === cents(current[field])) && Number(costRow.grossMarginRate) === Number(current.grossMarginRate));
  const labor = report.labor.filter(value => String(value.projectId) === String(primary.projectId) && String(value.employeeId) === '990000707');
  check('AC-21 人力投入按项目、员工和活动汇总1.25及2.50小时', labor.length === 2
    && labor.some(value => String(value.activityTypeId) === String(hourTypes.personalType.typeId) && Number(value.hours) === 1.25)
    && labor.some(value => String(value.activityTypeId) === String(hourTypes.levelType.typeId) && Number(value.hours) === 2.5));
  check('AC-21 实际已审批工时计入本人本期填报率', report.filing.some(value => String(value.projectId) === String(primary.projectId)
    && String(value.userId) === '990000707' && Number(value.submittedFlag) === 1));
  const foreignReport = await get('/oa/reports/projects?' + reportQuery, outsider);
  check('AC-21 外租户报表不含本轮项目', Object.values(foreignReport).flat().every(value => !String(value.projectName || '').includes(marker)));
  const employeeReport = await get('/oa/reports/projects/effort?' + reportQuery, employee);
  check('AC-11/21 员工投入报表不包含成本分区', !Object.hasOwn(employeeReport, 'costs')
    && employeeReport.labor.some(value => String(value.projectId) === String(primary.projectId)));
  reject(await api(employee, '/oa/reports/projects?' + reportQuery), 'AC-11 员工不能读取管理者成本报表');
  const privateFields = new Set(['costingRate', 'costingAmount', 'laborCostAmount', 'actualCostAmount', 'estimatedCost',
    'grossMargin', 'grossMarginRate', 'laborAmount', 'totalAmount', 'costExecutionRate']);
  const concealed = value => value == null || typeof value !== 'object' || Object.entries(value).every(([key, nested]) =>
    privateFields.has(key) ? nested == null : concealed(nested));
  for (const endpoint of ['/oa/project/list?pageNum=1&pageSize=100', '/oa/project/' + primary.projectId,
    '/oa/project/' + primary.projectId + '/detail', '/oa/project/' + primary.projectId + '/cost-summary', '/oa/timesheets/projects']) {
    check('AC-11 项目读取入口按实际权限隐藏内部成本 ' + endpoint, concealed(await get(endpoint, employee)));
  }
  check('AC-11 投入报表的所有返回字段均不泄露内部成本', concealed(employeeReport));
  evidence.costPrivacy = true;
  evidence.reports = true;

  const projectSnapshot = target => snapshot(`SELECT * FROM oa_project WHERE tenant_id=100000 AND project_id=${target.projectId};
    SELECT * FROM oa_project_task WHERE tenant_id=100000 AND project_id=${target.projectId} ORDER BY task_id;`);
  const stableBefore = projectSnapshot(primary);
  await get('/oa/project/' + primary.projectId + '/detail');
  await post('/oa/timesheets/projects/' + primary.projectId + '/recalculate');
  check('AC-10 无事实变化的详情读取和重算保持项目与任务版本', projectSnapshot(primary) === stableBefore);
  const recalculated = await post('/oa/timesheets/projects/recalculate');
  check('AC-10 全量手动入口按本租户全部项目重算', Number(recalculated) >= 2 && projectSnapshot(primary) === stableBefore);
  reject(await api(employee, '/oa/timesheets/projects/recalculate', { method: 'POST', body: {} }), 'AC-10 无管理权限不能触发成本全量重算');
  const allJobId = database("SELECT job_id FROM sys_job WHERE tenant_id=100000 AND handler_name='oaProjectCostRecalculate';");
  assert.match(allJobId, /^[1-9][0-9]*$/);
  const accepted = await post('/auth/system/job/' + allJobId + '/trigger');
  check('AC-10 全量重算由真实任务平台受理', accepted.accepted === true && accepted.executeNo);
  const completed = await waitFor(() => rows(`SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows,'reported',report_time)
    FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${quote(accepted.executeNo)};`)[0], value => value && value.status !== 'RUNNING', '项目成本重算任务未完成', 180000);
  check('AC-10 全量重算真实完成并上报项目数量', completed.status === 'SUCCESS' && completed.reported && Number(completed.affected) >= 2);
  check('AC-10 全量任务重复计算后仍与原事实一致', projectSnapshot(primary) === stableBefore);
  evidence.recalculation = true;

  const originalSnapshot = sheetSnapshot(approvedSheet.timesheet.timesheetId);
  const personalSource = approvedSheet.details.find(value => value.activityTypeId === hourTypes.personalType.typeId);
  const levelSource = approvedSheet.details.find(value => value.activityTypeId === hourTypes.levelType.typeId);
  const defaultSource = approvedSheet.details.find(value => value.activityTypeId === hourTypes.defaultType.typeId);
  const partial = await reverseHours([{ source: personalSource, hours: '-0.33' }]);
  const duplicateBody = { timesheet: { startDate: approvedSheet.timesheet.startDate, endDate: approvedSheet.timesheet.endDate },
    details: [{ ...personalSource, detailId: null, hours: '-0.93', reversalOfDetailId: personalSource.detailId, description: marker + '_冲正超额预约' }] };
  reject(await api(employee, '/oa/timesheets', { method: 'POST', body: duplicateBody }), 'AC-6 草稿已占用冲正额度时不得重复超额', '累计冲正工时超过原明细工时');
  await finishSheet(await submitSheet(partial));
  const partialProject = await project(primary.projectId);
  check('AC-6 部分冲正按原锁定单价抵减46.21成本和89.13计费', cents(partialProject.laborCostAmount) === 42889n
    && cents(partialProject.billableAmount) === 74860n && Number(partialProject.actualHours) === 3.42);
  const remaining = await reverseHours([{ source: personalSource, hours: '-0.92' }, { source: levelSource, hours: '-2.50' }, { source: defaultSource, hours: '-0.75' }]);
  await finishSheet(await submitSheet(remaining), 'APPROVE', ['990000701', '990000702']);
  const cleared = await project(primary.projectId);
  check('AC-6/8 全部冲正逐分归零且毛利率清空', cents(cleared.laborCostAmount) === 0n && cents(cleared.billableAmount) === 0n
    && Number(cleared.actualHours) === 0 && cents(cleared.grossMargin) === -4005n && cleared.grossMarginRate == null
    && cents((await project(secondary.projectId)).laborCostAmount) === 0n);
  check('AC-6 部分及全部冲正均保留原审批单和原始金额', sheetSnapshot(approvedSheet.timesheet.timesheetId) === originalSnapshot);
  const finalSheet = await saveSheet([hourDetail(hourTypes.defaultType, primary, effortTask, '1.00', { description: marker + '_最终实际投入' })]);
  await finishSheet(await submitSheet(finalSheet));
  const finalProject = await project(primary.projectId);
  check('AC-7/8 冲正后新工时独立增加100.01成本和150.03计费', cents(finalProject.laborCostAmount) === 10001n
    && cents(finalProject.actualCostAmount) === 14006n && cents(finalProject.billableAmount) === 15003n && cents(finalProject.grossMargin) === 997n
    && cents(finalProject.billedAmount) === 12345n && Number(finalProject.actualHours) === 1);
  const audits = rows(`SELECT JSON_OBJECT('name',audit_name,'field',audit_field,'actor',create_by,
    'before',JSON_EXTRACT(before_json,'$'),'after',JSON_EXTRACT(after_json,'$')) FROM sys_audit_log WHERE tenant_id=100000
    AND audit_id>${ctx.auditBefore} AND audit_field IN ('TIMESHEET_SUBMITTED','TIMESHEET_APPROVED','TIMESHEET_REJECTED',
    'COST_CONFIGURED','PROJECT_RECALCULATED','PROJECTS_RECALCULATED');`);
  check('NFR 单价配置、工时提交审批及成本重算均保留操作者与前后状态', ['TIMESHEET_SUBMITTED','TIMESHEET_APPROVED',
    'TIMESHEET_REJECTED','COST_CONFIGURED','PROJECT_RECALCULATED','PROJECTS_RECALCULATED']
    .every(action => audits.some(value => value.field === action && value.actor && value.before && value.after
      && (value.after.operatorId || value.after.job?.executeNo))));
  check('NFR 单价修改记录真实130.03至140.04的前后值', audits.some(value => value.field === 'COST_CONFIGURED'
    && cents(value.before.state?.costingRate ?? 0) === 13003n && cents(value.after.state?.costingRate ?? 0) === 14004n));
  const mainSubmission = audits.find(value => value.field === 'TIMESHEET_SUBMITTED'
    && String(value.after.businessId) === String(approvedSheet.timesheet.timesheetId));
  check('NFR 原工时提交记录草稿、已提交及锁定明细金额', mainSubmission?.before.state.timesheet.status === 'DRAFT'
    && mainSubmission.after.state.timesheet.status === 'SUBMITTED' && mainSubmission.after.state.details.length === 3
    && cents(mainSubmission.after.state.timesheet.costingAmount) === 55011n
    && cents(mainSubmission.after.state.timesheet.billingAmount) === 83773n);
  const mainApprovals = audits.filter(value => value.field === 'TIMESHEET_APPROVED'
    && String(value.after.businessId) === String(approvedSheet.timesheet.timesheetId));
  check('NFR 原工时唯一审批记录绑定实际经理、流程及前后状态', mainApprovals.length === 1
    && mainApprovals[0].before.state.timesheet.status === 'APPROVING' && mainApprovals[0].after.state.timesheet.status === 'APPROVED'
    && ['990000701', '990000702'].includes(String(mainApprovals[0].after.approval.approverId))
    && String(mainApprovals[0].after.operatorId) === String(mainApprovals[0].after.approval.approverId)
    && mainApprovals[0].after.approval.processInstanceId === mainApprovals[0].before.state.timesheet.instanceId
    && cents(mainApprovals[0].after.state.timesheet.costingAmount) === 55011n);
  check('NFR 驳回记录实际经理意见和状态', audits.some(value => value.field === 'TIMESHEET_REJECTED'
    && value.before.state.timesheet.status === 'APPROVING' && value.after.state.timesheet.status === 'REJECTED'
    && value.after.state.timesheet.rejectReason === marker + '_实际审批'
    && String(value.after.approval.approverId) === '990000702'));
  check('NFR 成本重算记录真实项目、任务及最终金额', audits.some(value => value.field === 'PROJECT_RECALCULATED'
    && String(value.after.businessId) === String(primary.projectId) && value.before.state.project && value.after.state.tasks.length > 0
    && cents(value.after.state.project.actualCostAmount) === 14006n && cents(value.after.state.project.billableAmount) === 15003n));
  check('NFR 全量重算记录绑定实际任务执行编号与完成项目', audits.some(value => value.field === 'PROJECTS_RECALCULATED'
    && value.before.state.status === 'PENDING' && value.after.state.status === 'COMPLETED'
    && value.after.state.projectIds.map(String).includes(String(primary.projectId)) && value.after.state.failedProjectIds.length === 0
    && value.after.job?.executeNo === accepted.executeNo && value.after.job.handlerName === 'oaProjectCostRecalculate'));
  evidence.audit = true;
  ctx.primary = finalProject;
  ctx.finalSheet = await ctx.sheet(finalSheet.timesheet.timesheetId, manager);
  ctx.projectSnapshot = projectSnapshot;
  evidence.reversal = true;
  evidence.accounting = true;
}
