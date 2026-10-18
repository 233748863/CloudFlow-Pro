import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyF5RfqAwards(ctx) {
  const { admin, manager, employee, api, successful, check, evidence, marker, database, sql, rows, get, post,
    reject, today, shifted, cents, waitFor, snapshot, completeWorkflow, rfq, main, secondQuote, firstQuote,
    fromPurchase, first, second, firstPrices, quoteBody, saveQuotation, ownerFile, invite } = ctx;
  const mainId = main.rfq.rfqId;
  const reason = marker + '_乙方交期更短且评分优秀，综合质量与项目交付要求选择此报价';
  const exportResult = await api(admin, '/oa/rfq/' + mainId + '/comparison/export');
  await fs.writeFile(path.join(ctx.directory, 'f5-export-response-' + ctx.caseTag + '.json'),
    JSON.stringify({ actualGateway: true, actualLogin: true, rfqId: mainId, response: exportResult }, null, 2), { flag: 'wx' });
  check('AC-10 实际导出返回Excel文件并禁止缓存', exportResult.status === 200 && exportResult.size > 1000
    && exportResult.contentType?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    && exportResult.disposition?.includes('.xlsx') && exportResult.cacheControl?.includes('no-store'));
  reject(await api(ctx.recorder, '/oa/rfq/' + mainId + '/comparison/export'), 'AC-10/17 仅报价权限不能导出比价文件');
  for (const [label, supplied, message] of [['空理由', '', '定标理由不能为空且不能超过500个字符'],
    ['非最低价理由不足', '交期合适', '非最低价定标需填写不少于20字的详细理由']]) {
    reject(await api(admin, '/oa/rfq/' + mainId + '/award', { method: 'POST', body: {
      quotationId: secondQuote.quotation.quotationId, reason: supplied } }), 'AC-11 ' + label + '被实际拒绝', message);
  }
  const startAward = async (target, quoted, proposalReason) => {
    const outcome = await post('/oa/rfq/' + target.rfq.rfqId + '/award', { quotationId: quoted.quotation.quotationId, reason: proposalReason });
    check('AC-11/12 按当前零元阈值进入真实定标审批', outcome === 'APPROVING'
      && Number(database("SELECT config_value FROM sys_config WHERE tenant_id=100000 AND config_key='sys.oa.rfq.awardApprovalThreshold';")) === 0);
    return waitFor(() => rfq(target.rfq.rfqId), value => value.rfq.instanceId && !value.rfq.instanceId.startsWith('F:'), 'F5 定标未绑定实际流程');
  };
  const pending = await startAward(main, secondQuote, reason);
  reject(await api(admin, '/oa/rfq/' + mainId + '/purchase', { method: 'POST', body: {} }),
    'AC-12 定标审批前不能生成采购', '询价定标完成后才能生成采购申请');
  check('AC-11 非最低价申请实际记录规则提醒', Number(database(`SELECT COUNT(*) FROM sys_business_rule_hit_record
    WHERE tenant_id=100000 AND rule_code='oa.rfq.non-lowest.award' AND business_id=${mainId};`)) > 0);
  await completeWorkflow(pending.rfq.instanceId, 'REJECT');
  const rejected = await waitFor(() => rfq(mainId), value => value.rfq.instanceId == null, 'F5 定标驳回未清空审批实例');
  check('AC-12 真实驳回保留比价与报价且不产生中标事实', rejected.rfq.status === 'COMPARING'
    && rejected.rfq.awardedSupplierId == null && rejected.rfq.awardedAmount == null
    && (await get('/oa/rfq/' + mainId + '/quotations')).length === 4);
  const retried = await startAward(rejected, secondQuote, reason + '，复核后再次申请');
  check('AC-12 定标驳回后重提使用新的实际流程', retried.rfq.instanceId !== pending.rfq.instanceId);
  await completeWorkflow(retried.rfq.instanceId);
  const awarded = await waitFor(() => rfq(mainId), value => value.rfq.status === 'AWARDED', 'F5 真实定标未回写中标状态');
  check('AC-11/12 实际审批后回写中标价80.04及申请人和时间', awarded.rfq.awardedSupplierId === second.supplierId
    && awarded.rfq.awardedQuotationId === secondQuote.quotation.quotationId && cents(awarded.rfq.awardedAmount) === 8004n
    && awarded.rfq.awardReason === reason + '，复核后再次申请' && String(awarded.rfq.awardBy) === '990000701' && awarded.rfq.awardTime);
  const purchase = await post('/oa/rfq/' + mainId + '/purchase');
  check('AC-12 中标结果实际生成唯一采购及完整明细', purchase.rfqId === mainId && purchase.supplierId === second.supplierId
    && cents(purchase.totalAmount) === 8004n && purchase.items.length === 2
    && purchase.items.every(value => main.items.some(item => item.itemId === value.rfqItemId && item.consumableId === value.consumableId)));
  const purchaseBefore = snapshot(`SELECT * FROM biz_purchase_request WHERE tenant_id=100000 AND id=${purchase.id};
    SELECT * FROM biz_purchase_item WHERE tenant_id=100000 AND purchase_id=${purchase.id} ORDER BY id;`);
  const repeated = await post('/oa/rfq/' + mainId + '/purchase');
  check('AC-12 重复生成采购返回原单并保持原明细', repeated.id === purchase.id && purchaseBefore === snapshot(`SELECT * FROM biz_purchase_request WHERE tenant_id=100000 AND id=${purchase.id};
    SELECT * FROM biz_purchase_item WHERE tenant_id=100000 AND purchase_id=${purchase.id} ORDER BY id;`)
    && database(`SELECT COUNT(*) FROM biz_purchase_request WHERE tenant_id=100000 AND rfq_id=${mainId} AND deleted=0;`) === '1');

  const sourcePurchaseNumber = database(`SELECT purchase_no FROM biz_purchase_request WHERE tenant_id=100000 AND id=${ctx.sourcePurchaseId};`);
  successful(await invite(fromPurchase, [first]), 'F5 来源采购询价邀请');
  const sourceQuote = await saveQuotation(quoteBody(fromPurchase, first, firstPrices, ownerFile));
  await post('/oa/rfq/quotations/' + sourceQuote.quotation.quotationId + '/submit');
  database(`UPDATE oa_purchase_rfq SET quote_deadline=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) WHERE tenant_id=100000 AND rfq_id=${fromPurchase.rfq.rfqId};`);
  await ctx.trigger('oaRfqDeadlineScan');
  const guarded = await startAward(fromPurchase, sourceQuote, marker + '_来源采购最低报价');
  const originalSupplier = await ctx.supplier(first.supplierId);
  successful(await api(admin, '/oa/supplier', { method: 'PUT', body: { ...originalSupplier, preventPurchaseFlag: 1 } }), 'F5 审批期间实际禁止供应商采购');
  try {
    await completeWorkflow(guarded.rfq.instanceId);
    const refused = await waitFor(() => rfq(fromPurchase.rfq.rfqId), value => value.rfq.instanceId == null, 'F5 审批后准入拒绝未清空待决状态');
    check('AC-3/12 审批期间供应商被禁止采购时中标不生效', refused.rfq.status === 'COMPARING'
      && refused.rfq.awardedSupplierId == null && refused.rfq.awardedAmount == null
      && database(`SELECT rfq_id IS NULL FROM biz_purchase_request WHERE tenant_id=100000 AND id=${ctx.sourcePurchaseId};`) === '1');
  } finally {
    const currentSupplier = await ctx.supplier(first.supplierId);
    successful(await api(admin, '/oa/supplier', { method: 'PUT', body: { ...currentSupplier, preventPurchaseFlag: originalSupplier.preventPurchaseFlag } }), 'F5 恢复原供应商采购设置');
  }
  const sourceRetry = await startAward(await rfq(fromPurchase.rfq.rfqId), sourceQuote, marker + '_恢复准入后重新申请来源采购');
  await completeWorkflow(sourceRetry.rfq.instanceId);
  await waitFor(() => rfq(fromPurchase.rfq.rfqId), value => value.rfq.status === 'AWARDED', 'F5 来源采购定标未完成');
  const updatedPurchase = await post('/oa/rfq/' + fromPurchase.rfq.rfqId + '/purchase');
  check('AC-12 定标实际更新来源草稿并保持原采购编号', String(updatedPurchase.id) === ctx.sourcePurchaseId
    && updatedPurchase.purchaseNo === sourcePurchaseNumber && updatedPurchase.status === 'DRAFT'
    && updatedPurchase.rfqId === fromPurchase.rfq.rfqId && cents(updatedPurchase.totalAmount) === 7468n
    && updatedPurchase.items.length === 2 && updatedPurchase.supplierId === first.supplierId);
  const sourceConverted = snapshot(`SELECT * FROM biz_purchase_request WHERE tenant_id=100000 AND id=${ctx.sourcePurchaseId};
    SELECT * FROM biz_purchase_item WHERE tenant_id=100000 AND purchase_id=${ctx.sourcePurchaseId} ORDER BY id;`);
  const sourceRepeated = await post('/oa/rfq/' + fromPurchase.rfq.rfqId + '/purchase');
  check('AC-12 重复回写来源采购保持原单和全部明细且只关联一次', String(sourceRepeated.id) === ctx.sourcePurchaseId
    && sourceConverted === snapshot(`SELECT * FROM biz_purchase_request WHERE tenant_id=100000 AND id=${ctx.sourcePurchaseId};
      SELECT * FROM biz_purchase_item WHERE tenant_id=100000 AND purchase_id=${ctx.sourcePurchaseId} ORDER BY id;`)
    && database(`SELECT COUNT(*) FROM biz_purchase_request WHERE tenant_id=100000 AND rfq_id=${fromPurchase.rfq.rfqId} AND deleted=0;`) === '1');
  const originalQuote = ctx.quoteSnapshot(firstQuote.quotation.quotationId);
  reject(await api(admin, '/oa/rfq/' + mainId + '/terminate', { method: 'POST', body: { failed: true, reason: marker + '_已定标不能流标' } }),
    'AC-12 已定标询价不能流标', '已结束或审批中的询价不能取消或流标');
  check('AC-12 定标和生成采购后原报价仍完整保持', ctx.quoteSnapshot(firstQuote.quotation.quotationId) === originalQuote);

  const failed = await ctx.createRfq('流标重开保留原轮次');
  successful(await invite(failed, [first]), 'F5 流标前实际邀请');
  const failedQuote = await saveQuotation(quoteBody(failed, first, firstPrices, ownerFile));
  await post('/oa/rfq/quotations/' + failedQuote.quotation.quotationId + '/submit');
  database(`UPDATE oa_purchase_rfq SET quote_deadline=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) WHERE tenant_id=100000 AND rfq_id=${failed.rfq.rfqId};`);
  await post('/oa/rfq/' + failed.rfq.rfqId + '/terminate', { failed: true, reason: marker + '_全部报价未符合本次安排' });
  const stopped = await rfq(failed.rfq.rfqId);
  const stoppedSnapshot = JSON.stringify({ detail: stopped, invitations: await ctx.invitationList(failed.rfq.rfqId),
    quote: await ctx.quotation(failedQuote.quotation.quotationId) });
  const restartedId = await post('/oa/rfq/' + failed.rfq.rfqId + '/restart', { deadline: shifted(4) });
  const restarted = await rfq(restartedId);
  check('AC-13 流标后实际创建新编号并仅复制物料要求', stopped.rfq.status === 'FAILED' && restarted.rfq.status === 'DRAFT'
    && restarted.rfq.rfqNo !== stopped.rfq.rfqNo && restarted.rfq.quoteDeadline === shifted(4) && restarted.items.length === 2
    && restarted.items.every(value => stopped.items.some(item => item.itemName === value.itemName && item.quantity === value.quantity))
    && (await ctx.invitationList(restartedId)).length === 0 && (await get('/oa/rfq/' + restartedId + '/quotations')).length === 0);
  check('AC-13 新轮次保留原流标单、原邀请及原报价', stoppedSnapshot === JSON.stringify({ detail: await rfq(failed.rfq.rfqId),
    invitations: await ctx.invitationList(failed.rfq.rfqId), quote: await ctx.quotation(failedQuote.quotation.quotationId) }));

  const query = new URLSearchParams({ from: today, to: today });
  const report = await get('/oa/reports/rfqs?' + query);
  const nonLowest = report.nonLowest.find(value => String(value.rfqId) === String(mainId));
  check('AC-20 非最低价报表实际列出80.04与74.68及完整理由', nonLowest && cents(nonLowest.awardedAmount) === 8004n
    && cents(nonLowest.lowestAmount) === 7468n && nonLowest.awardReason === awarded.rfq.awardReason);
  const responseRow = report.responses.find(value => value.supplierId === first.supplierId);
  check('AC-20 供应商三轮实际响应正确汇总100%', responseRow && Number(responseRow.invitedCount) === 3
    && Number(responseRow.respondedCount) === 3 && Number(responseRow.responseRate) === 100);
  const declinedRow = report.responses.find(value => value.supplierId === ctx.watch.supplierId);
  check('AC-20 已拒绝报价的供应商响应率为零', declinedRow && Number(declinedRow.invitedCount) === 1
    && Number(declinedRow.respondedCount) === 0 && Number(declinedRow.responseRate) === 0);
  const visibleCount = Number(database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=100000 AND deleted=0
    AND owner_id=990000701 AND create_time>=CURRENT_DATE AND create_time<DATE_ADD(CURRENT_DATE,INTERVAL 1 DAY);`));
  check('AC-20 询价统计覆盖本人当日可见询价', Number(report.summary[0].rfqCount) === visibleCount && visibleCount >= 4);
  reject(await api(employee, '/oa/reports/rfqs?' + query), 'AC-17/20 非授权员工不能读取询价合规报表');
  check('AC-17/20 外租户报表不包含本轮询价', !(await get('/oa/reports/rfqs?' + query, ctx.outsider)).nonLowest
    .some(value => String(value.rfqId) === String(mainId)));

  const fields = ['RFQ_SAVED', 'SUPPLIERS_INVITED', 'QUOTATION_SAVED', 'QUOTATION_SUBMITTED', 'QUOTATION_WITHDRAWN',
    'AWARD_REQUESTED', 'RFQ_AWARDED', 'AWARD_REJECTED', 'PURCHASE_CREATED', 'RFQ_TERMINATED'];
  const audits = rows(`SELECT JSON_OBJECT('id',CAST(audit_id AS CHAR),'field',audit_field,'actor',create_by,
    'before',JSON_EXTRACT(before_json,'$'),'after',JSON_EXTRACT(after_json,'$')) FROM sys_audit_log
    WHERE tenant_id=100000 AND audit_id>${ctx.auditBefore} AND audit_field IN (${fields.map(sql).join(',')}) ORDER BY audit_id;`);
  check('AC-19 邀请、报价、定标和流标均记录独立前后状态与真实操作者', fields.every(field => audits.some(value =>
    value.field === field && value.actor && value.before && value.after && value.after.operatorId
    && value.after.businessNo && value.after.businessId && value.after.businessType === 'OA_RFQ')));
  const approvals = audits.filter(value => value.field === 'RFQ_AWARDED' && String(value.after.businessId) === String(mainId));
  check('AC-19 定标审计唯一绑定真实审批人、实例和前后状态', approvals.length === 1
    && approvals[0].before.state.status === 'COMPARING' && approvals[0].after.state.status === 'AWARDED'
    && String(approvals[0].after.operatorId) === '990000702' && String(approvals[0].after.approval.approverId) === '990000702'
    && approvals[0].after.approval.instanceId === retried.rfq.instanceId && cents(approvals[0].after.state.awardedAmount) === 8004n);
  const converted = audits.filter(value => value.field === 'PURCHASE_CREATED' && String(value.after.businessId) === String(mainId));
  check('AC-19 重复采购转换只记录一次且保留实际原单前后值', converted.length === 1
    && !converted[0].before.state.purchase && converted[0].after.state.purchase.id === purchase.id
    && cents(converted[0].after.state.purchase.totalAmount) === 8004n && converted[0].after.state.purchase.items.length === 2);
  check('AC-19 报价提交审计绑定实际录入人和74.68元原明细', audits.some(value => value.field === 'QUOTATION_SUBMITTED'
    && String(value.after.operatorId) === ctx.recorderId && value.before.state.quotation.status === 'DRAFT'
    && value.after.state.quotation.status === 'SUBMITTED' && cents(value.after.state.quotation.totalAmount) === 7468n
    && value.after.state.items.length === 2));
  check('AC-19 审批中准入变化记录未生效原因及实际审批人', audits.some(value => value.field === 'AWARD_REJECTED'
    && String(value.after.businessId) === String(fromPurchase.rfq.rfqId) && value.after.state.instanceId == null
    && String(value.after.operatorId) === '990000702' && value.after.details.reason.includes('禁止')));
  await fs.writeFile(path.join(ctx.directory, `f5-audit-observations-${ctx.caseTag}.json`), JSON.stringify({
    fields, auditIds: audits.map(value => value.id), mainAwardAudit: approvals[0].id, purchaseAudit: converted[0].id,
    actualBeforeAfter: true, mainRfqId: mainId, sourceRfqId: fromPurchase.rfq.rfqId,
  }, null, 2), { flag: 'wx' });
  Object.assign(ctx, { main: awarded, purchase, restarted, stopped, report, awardReason: awarded.rfq.awardReason });
  evidence.export = true;
  evidence.award = true;
  evidence.purchase = true;
  evidence.awardRevalidation = true;
  evidence.restart = true;
  evidence.audit = true;
  evidence.reports = true;
}
