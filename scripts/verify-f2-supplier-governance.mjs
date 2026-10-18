import assert from 'node:assert/strict';
import { verifyF2SupplierJobsAndReports } from './verify-f2-supplier-jobs-reports.mjs';

export async function verifyF2SupplierGovernance(ctx) {
  const { admin, other, employee, readonly, outsider, api, database, check, evidence, marker, quote, rows, waitFor,
    get, post, reject, today, shifted, month, createSupplier, supplier, changeSupplier, createPurchase, purchase,
    completeWorkflow, hits, saveCard, fourCriteria, confirmCard, messages, sleep } = ctx;
  const governed = await createSupplier('治理审批');
  const blockedPurchase = await createPurchase(governed, '黑名单前草稿');
  const bypassPurchase = await createPurchase(governed, '例外放行前草稿');
  const unblockedPurchase = await createPurchase(governed, '解黑前草稿');
  const decisionPath = `/oa/supplier/${governed.supplierId}/decisions`;
  const begin = async (action, extra = {}, target = governed) => {
    await post('/oa/supplier/' + target.supplierId + '/decisions', { action, reason: marker + '_' + action, ...extra });
    const pending = await waitFor(() => supplier(target.supplierId), value => value.instanceId && !value.instanceId.startsWith('F:'), '供应商未绑定真实审批实例');
    const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task
      WHERE tenant_id=100000 AND instance_id=${quote(pending.instanceId)} AND status='TODO';`), values => values.length > 0, '供应商真实审批待办未生成');
    check('AC-15 治理审批实际分配给独立审批人', tasks.every(value => value.assignee === '990000702'));
    return { pending, tasks };
  };
  const finish = async (pending, action) => {
    await completeWorkflow(pending.instanceId, action);
    return waitFor(() => supplier(pending.supplierId), value => value.instanceId == null, '供应商审批结果未回写');
  };
  for (const page of [readonly, employee, outsider]) {
    reject(await api(page, decisionPath, { method: 'POST', body: { action: 'BLACKLIST', reason: marker + '_越权' } }), 'AC-15 无治理权或跨租户不能拉黑');
  }
  reject(await api(admin, decisionPath, { method: 'POST', body: { action: 'BYPASS', reason: marker + '_过期放行', expireDate: shifted(-1) } }), 'AC-15 已过期的例外放行申请被拒绝');
  reject(await api(admin, decisionPath, { method: 'POST', body: { action: 'UNBLACKLIST', reason: marker + '_未拉黑' } }), 'AC-15 未拉黑供应商不能申请解黑');
  const black = await begin('BLACKLIST');
  check('AC-15 审批未结束前黑名单状态保持', black.pending.blacklistFlag === 0);
  reject(await api(admin, decisionPath, { method: 'POST', body: { action: 'BYPASS', reason: marker + '_审批中重复', expireDate: shifted(1) } }), 'AC-15 治理审批中禁止再次提交');
  const guarded = await changeSupplier(black.pending, { blacklistFlag: 1, blacklistReason: '伪造', bypassFlag: 1, instanceId: null });
  check('AC-15 普通编辑不能绕过待决审批修改准入事实', guarded.instanceId === black.pending.instanceId && guarded.blacklistFlag === 0 && guarded.bypassFlag === 0);
  reject(await api(employee, '/workflow/wf/complete', { method: 'POST', body: { taskId: black.tasks[0].id, action: 'APPROVE', comment: marker + '_越权审批' } }), 'AC-15 非审批人不能处理治理待办');
  const blacklisted = await finish(guarded, 'APPROVE');
  check('AC-15 实际审批通过后记录黑名单原因和申请人时间', blacklisted.blacklistFlag === 1
    && blacklisted.blacklistReason === marker + '_BLACKLIST' && String(blacklisted.blacklistBy) === '990000701' && blacklisted.blacklistTime);
  const beforeDuplicate = JSON.stringify(blacklisted);
  await sleep(5200);
  reject(await api(other, '/workflow/wf/complete', { method: 'POST', body: { taskId: black.tasks[0].id, action: 'APPROVE', comment: marker + '_重复审批' } }), 'AC-15 已结束审批不能重复办理');
  check('AC-15 重复办理未改变供应商状态', JSON.stringify(await supplier(governed.supplierId)) === beforeDuplicate);
  const blocked = await api(admin, `/oa/purchase/request/submit/${blockedPurchase.id}`, { method: 'POST', body: {} });
  reject(blocked, 'AC-11 已拉黑供应商的真实采购提交被拒绝');
  check('AC-11 黑名单拒绝原因和命中可追溯', blocked.body.msg.includes('黑名单') && blocked.body.msg.includes(blacklisted.blacklistReason) && (await purchase(blockedPurchase.id)).status === 'DRAFT'
    && hits(governed.supplierId, 'oa.supplier.blacklist.block').at(-1)?.result === 'BLOCK');
  const rejected = await begin('UNBLACKLIST', { reason: marker + '_驳回解黑' });
  const stillBlacklisted = await finish(rejected.pending, 'REJECT');
  check('AC-15 真实驳回保留黑名单及原原因', stillBlacklisted.blacklistFlag === 1 && stillBlacklisted.blacklistReason === blacklisted.blacklistReason);
  const bypass = await begin('BYPASS', { expireDate: today });
  const allowed = await finish(bypass.pending, 'APPROVE');
  check('AC-15 例外审批保留黑名单并准确冻结申请原因和截止日', allowed.blacklistFlag === 1 && allowed.bypassFlag === 1
    && allowed.bypassReason === marker + '_BYPASS' && allowed.bypassExpireDate === today && String(allowed.bypassBy) === '990000701');
  await post(`/oa/purchase/request/submit/${bypassPurchase.id}`);
  check('AC-11/18 有效期最后一天的批准放行可实际提交且留下BYPASSED命中', (await purchase(bypassPurchase.id)).status !== 'DRAFT'
    && hits(governed.supplierId, 'oa.supplier.blacklist.block').at(-1)?.result === 'BYPASSED');
  const unblack = await begin('UNBLACKLIST');
  const cleared = await finish(unblack.pending, 'APPROVE');
  check('AC-15 解黑审批通过后保留解黑原因及操作者', cleared.blacklistFlag === 0 && cleared.blacklistReason === marker + '_UNBLACKLIST'
    && String(cleared.blacklistBy) === '990000701' && cleared.blacklistTime);
  await post(`/oa/purchase/request/submit/${unblockedPurchase.id}`);
  check('AC-11 解黑后原采购草稿可实际提交', (await purchase(unblockedPurchase.id)).status !== 'DRAFT');
  const blackAgain = await begin('BLACKLIST', { reason: marker + '_重新拉黑' });
  const blockedAgain = await finish(blackAgain.pending, 'APPROVE');
  check('AC-15 重新拉黑撤销原例外放行', blockedAgain.blacklistFlag === 1 && blockedAgain.bypassFlag === 0);
  ctx.blacklistedSupplier = blockedAgain;
  const selectionSupplier = await createSupplier('页面批准放行');
  const selectionBlack = await begin('BLACKLIST', {}, selectionSupplier);
  const selectionBlocked = await finish(selectionBlack.pending, 'APPROVE');
  const selectionBypass = await begin('BYPASS', { expireDate: today }, selectionBlocked);
  ctx.activeBypassSupplier = await finish(selectionBypass.pending, 'APPROVE');
  check('AC-11 页面放行样本来自真实拉黑与例外审批', ctx.activeBypassSupplier.blacklistFlag === 1
    && ctx.activeBypassSupplier.bypassFlag === 1 && ctx.activeBypassSupplier.bypassExpireDate === today);
  evidence.governance = true; evidence.blacklist = true; evidence.bypass = true;

  const rated = await createSupplier('评级通知');
  await confirmCard(await saveCard(rated, month(-3), fourCriteria('95.00')));
  const relevantMessages = () => messages().filter(value => value.title === '供应商评级下降' && value.content.includes(rated.supplierName));
  check('AC-16 首次评级不会发降级通知', relevantMessages().length === 0);
  const lowered = await saveCard(rated, month(-2), fourCriteria('70.00'));
  await confirmCard(lowered);
  const first = await waitFor(relevantMessages, values => values.length === 1 && values[0].status === 'SUCCESS', '评级下降通知未实际送达');
  check('AC-16 降级提醒真实送到操作者的站内收件箱', first[0].recipient === '990000701' && first[0].channel === 'INTERNAL'
    && first[0].content.includes('EXCELLENT') && first[0].content.includes('WATCH'));
  const received = await get('/auth/system/message/mine/' + first[0].id);
  check('AC-16 收件人可实际读取降级内容', received.content.includes(rated.supplierName));
  await confirmCard(lowered);
  check('AC-9/16 重复确认不重复发降级提醒', relevantMessages().length === 1);
  await confirmCard(await saveCard(rated, month(-1), fourCriteria('95.00')));
  check('AC-16 升级不发降级提醒', relevantMessages().length === 1);
  await confirmCard(await saveCard(rated, month(-4), fourCriteria('50.00')));
  check('AC-9/16 旧周期评分确认不覆盖新评级且不发降级提醒', (await supplier(rated.supplierId)).standing === 'EXCELLENT' && relevantMessages().length === 1);
  ctx.notifiedSupplier = rated;
  evidence.downgrade = true;
  await verifyF2SupplierJobsAndReports(ctx);
}
