import assert from 'node:assert/strict';

export async function verifyF2SupplierJobsAndReports(ctx) {
  const { admin, employee, outsider, readonly, api, database, check, evidence, marker, quote, rows, waitFor, get, post,
    reject, today, shifted, month, cents, createSupplier, supplier, createQualification, verifyQualification,
    qualifications, cards, criteria, messages, principal, expired, expiredCertificate } = ctx;
  const trigger = async id => {
    const accepted = await post(`/auth/system/job/${id}/trigger`);
    check('AC-4/6 实际集中任务受理 ' + id, accepted.accepted === true && accepted.executeNo);
    const result = await waitFor(() => rows(`SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows,
      'actor',trigger_by,'report',report_time) FROM sys_job_log WHERE tenant_id=100000 AND execute_no=${quote(accepted.executeNo)};`)[0],
    value => value && value.status !== 'RUNNING', '供应商集中任务未返回终态', 180000);
    check('AC-4/6 实际集中任务成功回报 ' + id, result.status === 'SUCCESS' && result.report != null && result.actor === 'g_import_admin');
    return { ...accepted, ...result };
  };
  const dueSupplier = await createSupplier('资质提醒边界');
  const due = await verifyQualification(await createQualification(dueSupplier, '提前七天', { expireDate: shifted(7), reminderDays: 7 }));
  const future = await verifyQualification(await createQualification(dueSupplier, '尚有八天', { expireDate: shifted(8), reminderDays: 7 }));
  const lastDay = await verifyQualification(await createQualification(dueSupplier, '截止当天', { expireDate: today, reminderDays: 0 }));
  const permanent = await verifyQualification(await createQualification(dueSupplier, '长期证明', { longTermFlag: 1, expireDate: null }));
  const ownIds = [due, future, lastDay, permanent, expiredCertificate].map(value => String(value.qualificationId));
  const reminderLogs = () => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'qualification',CAST(qualification_id AS CHAR),
    'date',DATE_FORMAT(expire_date,'%Y-%m-%d'),'days',days_before,'recipient',CAST(recipient_id AS CHAR))
    FROM oa_supplier_qualification_reminder_log WHERE tenant_id=100000 AND qualification_id IN (${ownIds.join(',')}) ORDER BY id;`);
  await trigger(1653);
  const updated = await qualifications(dueSupplier.supplierId);
  check('AC-4 过期证件实际转为已过期，截止当天证件仍有效', (await qualifications(expired.supplierId))
    .find(value => value.qualificationId === expiredCertificate.qualificationId).verifyStatus === 'EXPIRED'
    && updated.find(value => value.qualificationId === lastDay.qualificationId).verifyStatus === 'VERIFIED');
  check('AC-5 扫描后最早有效日期仍为当天，过期主数据无旧日期', (await supplier(dueSupplier.supplierId)).qualificationExpireDate === today
    && (await supplier(expired.supplierId)).qualificationExpireDate == null);
  const logs = reminderLogs();
  check('AC-4 七天边界、当天及过期各一条提醒，长期和八天不提醒', logs.length === 3
    && [due, lastDay, expiredCertificate].every(value => logs.some(log => log.qualification === String(value.qualificationId)))
    && logs.every(value => value.recipient === '990000701'));
  const expiryNotices = () => messages().filter(value => value.title === '供应商资质到期提醒'
    && [due, lastDay, expiredCertificate].some(qualification => value.content.includes(qualification.certName)));
  const delivered = await waitFor(expiryNotices, values => values.length === 3 && values.every(value => value.status === 'SUCCESS'), '供应商资质提醒未实际送达');
  check('AC-4 到期提醒实际送达本租户指定人的站内收件箱', delivered.every(value => value.recipient === '990000701' && value.channel === 'INTERNAL'));
  for (const notice of delivered) await get('/auth/system/message/mine/' + notice.id);
  await trigger(1653);
  check('AC-4 重复扫描不重复写提醒或投递', JSON.stringify(reminderLogs()) === JSON.stringify(logs) && expiryNotices().length === 3);
  evidence.expiry = true;

  const months = Number(database("SELECT config_value FROM sys_config WHERE tenant_id=100000 AND config_key='sys.oa.supplier.scorePeriodMonths';"));
  assert.ok([1, 3, 12].includes(months));
  const [year, monthNumber] = today.split('-').map(Number);
  const currentStart = new Date(Date.UTC(year, Math.floor((monthNumber - 1) / months) * months, 1));
  const periodStart = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - months, 1)).toISOString().slice(0, 10);
  const periodEnd = new Date(currentStart.getTime() - 86400000).toISOString().slice(0, 10);
  const pendingSupplier = await createSupplier('周期待评分');
  const notStarted = await createSupplier('合作尚未开始', { cooperationStartDate: today });
  const disabled = await createSupplier('周期停用', { status: 'DISABLED' });
  await trigger(1654);
  const cycle = (await cards(pendingSupplier.supplierId)).rows.filter(value => value.periodStart === periodStart && value.periodEnd === periodEnd);
  check('FR-4/7 周期任务生成恰好一份上期草稿', cycle.length === 1 && cycle[0].status === 'DRAFT'
    && cycle[0].periodType === ({ 1: 'MONTHLY', 3: 'QUARTERLY', 12: 'YEARLY' })[months]);
  const defaults = await criteria(cycle[0].scorecardId);
  check('FR-4 任务生成的四维保留默认权重及唯一自动交付维度', defaults.length === 4
    && defaults.filter(value => value.dataSource === 'AUTO').length === 1
    && defaults.find(value => value.criteriaCode === 'DELIVERY_ON_TIME').dataSource === 'AUTO'
    && defaults.every(value => Number(value.weight) === (['DELIVERY_ON_TIME', 'QUALITY'].includes(value.criteriaCode) ? 0.3 : 0.2)));
  check('FR-7 停用和本期才开始合作的供应商不生成上期评分', (await cards(disabled.supplierId)).rows.length === 0
    && (await cards(notStarted.supplierId)).rows.length === 0);
  const scoreNotices = () => messages().filter(value => value.businessType === 'SUPPLIER_SCORING' && String(value.businessId) === String(pendingSupplier.supplierId));
  const scoredNotices = await waitFor(scoreNotices, values => values.length === 1 && values[0].status === 'SUCCESS', '周期评分提醒未实际投递');
  check('FR-7 周期通知包含准确起止日期并送达指定人', scoredNotices[0].recipient === '990000701' && scoredNotices[0].channel === 'INTERNAL'
    && scoredNotices[0].content.includes(periodStart) && scoredNotices[0].content.includes(periodEnd));
  await get('/auth/system/message/mine/' + scoredNotices[0].id);
  await trigger(1654);
  check('FR-4/7 重复周期任务不重复评分卡、维度或消息', (await cards(pendingSupplier.supplierId)).rows.filter(value => value.periodStart === periodStart && value.periodEnd === periodEnd).length === 1
    && (await criteria(cycle[0].scorecardId)).length === 4 && scoreNotices().length === 1);
  evidence.periodicJobs = true;

  const from = month(-4).start;
  const to = month(0).end;
  const report = await get('/oa/reports/suppliers?' + new URLSearchParams({ from, to }));
  check('AC-17 四类真实供应商报表均返回', ['standing', 'scores', 'expiry', 'purchases'].every(key => Array.isArray(report[key])));
  const distribution = rows("SELECT JSON_OBJECT('standing',standing,'color',indicator_color,'count',COUNT(*)) FROM oa_supplier WHERE tenant_id=100000 AND deleted=0 GROUP BY standing,indicator_color;");
  check('AC-17 分档分布与实际未删除供应商逐组对账', report.standing.length === distribution.length && distribution.every(expected => report.standing.some(value =>
    (value.standing ?? null) === expected.standing && (value.indicatorColor ?? null) === expected.color && Number(value.supplierCount) === expected.count)));
  const trend = report.scores.filter(value => String(value.supplierId) === String(principal.supplierId));
  check('AC-17 已确认评分趋势保留两个历史周期和准确分数', trend.length === 2 && trend.some(value => value.periodEnd === month(-2).end && cents(value.totalScore) === 9500n)
    && trend.some(value => value.periodEnd === month(0).end && cents(value.totalScore) === 7800n)
    && !report.scores.some(value => String(value.supplierId) === String(pendingSupplier.supplierId)));
  const amounts = report.purchases.filter(value => String(value.supplierId) === String(principal.supplierId));
  check('AC-17 两笔实际采购合计30.03元并对照当前78分', amounts.length === 1 && cents(amounts[0].purchaseAmount) === 3003n
    && Number(amounts[0].purchaseCount) === 2 && cents(amounts[0].score) === 7800n && amounts[0].standing === 'QUALIFIED');
  const expiryRow = report.expiry.find(value => String(value.qualificationId) === String(expiredCertificate.qualificationId));
  check('AC-17 预警清单保留过期证件、准确天数和已过期状态', expiryRow && expiryRow.remainingDays === -1 && expiryRow.verifyStatus === 'EXPIRED'
    && !report.expiry.some(value => String(value.qualificationId) === String(permanent.qualificationId)));
  const todayOnly = await get('/oa/reports/suppliers?' + new URLSearchParams({ from: today, to: today }));
  check('AC-17 单日采购包含当天两笔，评分按周期结束日筛选', todayOnly.purchases.some(value => String(value.supplierId) === String(principal.supplierId) && cents(value.purchaseAmount) === 3003n)
    && todayOnly.scores.every(value => value.periodEnd === today));
  const yesterday = await get('/oa/reports/suppliers?' + new URLSearchParams({ from: shifted(-1), to: shifted(-1) }));
  check('AC-17 前一天的采购统计不包含本轮当天采购', !yesterday.purchases.some(value => String(value.supplierId) === String(principal.supplierId)));
  for (const page of [employee, readonly]) reject(await api(page, '/oa/reports/suppliers'), 'AC-17 无报表权限账号不能读取经营汇总');
  const foreignReport = await get('/oa/reports/suppliers?' + new URLSearchParams({ from, to }), outsider);
  check('AC-17 外租户全部报表不包含本轮业务记录', Object.values(foreignReport).flat().every(value => !String(value.supplierName || '').includes(marker)));
  for (const range of [{ from: to, to: from }, { from: shifted(-366), to: today }]) {
    const rejectedRange = await api(admin, '/oa/reports/suppliers?' + new URLSearchParams(range));
    reject(rejectedRange, 'AC-17 倒置或超366天日期范围被拒绝', '查询期间必须为1至366天');
    check('AC-17 非法报表日期返回400业务拒绝', rejectedRange.status === 400 && rejectedRange.body.code === 400);
  }
  const maxRange = await get('/oa/reports/suppliers?' + new URLSearchParams({ from: shifted(-365), to: today }));
  check('AC-17 恰好366天的日期范围可查询', Array.isArray(maxRange.scores));
  ctx.reportRange = { from, to }; ctx.report = report; ctx.expirySupplier = dueSupplier;
  evidence.reports = true;
}
