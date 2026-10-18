import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyF1AssetLifecycle } from './verify-f1-asset-lifecycle.mjs';
import { verifyF1AssetTasks } from './verify-f1-asset-tasks.mjs';
import { verifyF1AssetInterface } from './verify-f1-asset-ui.mjs';

export async function verifyF1Assets(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, evidence } = context;
  assert.equal(state.verification?.mode, 'F1_ASSETS_INDEPENDENT');
  const marker = 'F1_' + caseTag;
  const quote = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (read, accept, label, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    do { const result = await read(); if (accept(result)) return result; await sleep(250); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const cents = value => {
    const text = String(value); assert.match(text, /^\d+(?:\.\d{1,2})?$/);
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const get = async (target, page = admin) => successful(await api(page, target), target);
  const post = async (target, body = {}, page = admin) => successful(await api(page, target, { method: 'POST', body }), target);
  const reject = (result, label) => check(label, [400, 401, 403, 404, 409].includes(result.status)
    || result.status === 200 && [400, 401, 403, 404, 409].includes(result.body?.code));
  const today = database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m-%d');");
  const shifted = (unit, amount) => {
    assert.ok(['DAY', 'MONTH', 'YEAR'].includes(unit) && Number.isInteger(amount));
    return database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${amount} ${unit}),'%Y-%m-%d');`);
  };
  const other = await session('g_import_other');
  const outsider = await session('g_import_tenant');
  const readonly = await session('g_import_readonly');
  const employee = await session('g_holiday_employee');
  const secretPath = path.join(directory, 'private/h3-core-secrets.json');
  const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
  for (const page of [admin, other, outsider, readonly, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  await fs.writeFile(secretPath, JSON.stringify([...secrets]));
  let sequence = 0;
  const createCategory = async (suffix, extra = {}) => {
    const categoryId = await post('/oa/asset/categories', { categoryName: marker + '_' + suffix,
      categoryCode: marker + '_' + suffix, parentId: 0, defaultDepreciationMethod: 'STRAIGHT_LINE',
      defaultUsefulLifeMonths: 60, defaultSalvageRate: '0.1000', maintenanceRequiredFlag: 1, status: 'ACTIVE', ...extra });
    return (await get('/oa/asset/categories')).find(value => String(value.categoryId) === String(categoryId));
  };
  const category = await createCategory('默认分类');
  assert.ok(category);
  const asset = id => get('/oa/asset/' + id);
  const schedules = id => get(`/oa/asset/${id}/depreciation`);
  const createAsset = async (suffix, extra = {}) => {
    const assetId = await post('/oa/asset', { name: marker + '_' + suffix, assetCode: marker + '_' + (++sequence),
      categoryId: category.categoryId, purchaseAmount: '10000.00', salvageValue: '1000.00', usefulLifeMonths: 60,
      availableFromDate: '2040-01-31', purchaseDate: today, depreciationFlag: 1, depreciationMethod: 'STRAIGHT_LINE',
      depreciationFrequency: 'MONTHLY', openingAccumulatedDepreciation: '0.00', location: '独立验收室', ...extra });
    return asset(assetId);
  };
  const changeAsset = async (value, extra) => {
    successful(await api(admin, '/oa/asset', { method: 'PUT', body: { ...value, ...extra } }), '修改资产');
    return asset(value.assetId);
  };
  const snapshot = id => database(`SELECT SHA2(CAST(JSON_ARRAY(schedule_id,period_no,period_date,depreciation_amount,accumulated_amount,net_value,status,post_time,post_by,version,create_by,create_time,update_by,update_time) AS CHAR),256) FROM oa_asset_depreciation_schedule WHERE tenant_id=100000 AND asset_id=${id} AND status='POSTED' ORDER BY period_no;`);
  const ctx = { ...context, marker, quote, rows, sleep, waitFor, cents, get, post, reject, today, shifted,
    other, outsider, readonly, employee, category, createCategory, createAsset, changeAsset, asset, schedules, snapshot };
  try {
    const child = await createCategory('子分类', { parentId: category.categoryId });
    const grandchild = await createCategory('孙分类', { parentId: child.categoryId });
    const alternate = await createCategory('备用分类', { defaultDepreciationMethod: 'SUM_OF_YEARS', defaultUsefulLifeMonths: 36, defaultSalvageRate: '0.2000', maintenanceRequiredFlag: 0 });
    ctx.alternate = alternate;
    const invalidLife = await api(admin, '/oa/asset/categories', { method: 'POST', body: { categoryCode: marker + '_寿命越界', categoryName: '寿命越界', defaultUsefulLifeMonths: 1201 } });
    check('AC-1 分类默认寿命与资产支持范围一致并在保存前拒绝', invalidLife.status === 400 && invalidLife.body?.msg === '默认寿命必须为1至1200个月'
      && database(`SELECT COUNT(*) FROM oa_asset_category WHERE tenant_id=100000 AND category_code=${quote(marker + '_寿命越界')};`) === '0');
    check('AC-1 分类树路径包含实际父级和本级编号', grandchild.levelPath === `/${category.categoryId}/${child.categoryId}/${grandchild.categoryId}/`);
    await post('/oa/asset/categories', { ...child, parentId: alternate.categoryId });
    check('AC-1 移动分类同步更新后代路径', (await get('/oa/asset/categories')).find(value => String(value.categoryId) === String(grandchild.categoryId)).levelPath
      === `/${alternate.categoryId}/${child.categoryId}/${grandchild.categoryId}/`);
    const cyclicCategory = await api(admin, '/oa/asset/categories', { method: 'POST', body: { ...alternate, parentId: grandchild.categoryId } });
    reject(cyclicCategory, 'AC-1 分类循环引用被拒绝');
    check('AC-1 分类循环引用返回明确业务提示', cyclicCategory.status === 400 && cyclicCategory.body?.msg === '分类存在循环引用');
    reject(await api(admin, `/oa/asset/categories/${child.categoryId}`, { method: 'DELETE' }), 'AC-1 被子分类引用的分类不能删除');
    const unused = await createCategory('待删除分类');
    successful(await api(admin, `/oa/asset/categories/${unused.categoryId}`, { method: 'DELETE' }), '实际删除空分类');
    check('AC-1 删除分类确实保存标记且列表不再显示', database(`SELECT deleted FROM oa_asset_category WHERE category_id=${unused.categoryId};`) === '1'
      && !(await get('/oa/asset/categories')).some(value => String(value.categoryId) === String(unused.categoryId)));
    const deletedAsset = await createAsset('待删除资产');
    successful(await api(admin, '/oa/asset/' + deletedAsset.assetId, { method: 'DELETE' }), '实际删除闲置未过账资产');
    check('AC-1 删除资产确实保存标记并取消未来折旧', database(`SELECT deleted FROM oa_asset WHERE asset_id=${deletedAsset.assetId};`) === '1'
      && database(`SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE asset_id=${deletedAsset.assetId} AND status<>'CANCELLED';`) === '0');
    reject(await api(admin, '/oa/asset/' + deletedAsset.assetId), 'AC-1 已删除资产不能读取');
    check('AC-1 已删除资产不再出现在台账', Number((await get('/oa/asset/list?name=' + encodeURIComponent(deletedAsset.name))).total) === 0);
    const defaults = await createAsset('分类默认值', { depreciationMethod: null, usefulLifeMonths: null, salvageValue: null, maintenanceRequiredFlag: null });
    check('AC-1 未覆盖的分类默认值在真实保存后生效', defaults.depreciationMethod === 'STRAIGHT_LINE' && defaults.usefulLifeMonths === 60
      && cents(defaults.salvageValue) === 100000n && defaults.maintenanceRequiredFlag === 1);
    reject(await api(admin, `/oa/asset/categories/${category.categoryId}`, { method: 'DELETE' }), 'AC-1 被资产引用的分类不能删除');
    evidence.categories = true; evidence.deletion = true;

    const expected = { STRAIGHT_LINE: ['1800', '1800', '1800', '1800', '1800'],
      DOUBLE_DECLINING: ['4000', '2400', '1440', '580', '580'], SUM_OF_YEARS: ['3000', '2400', '1800', '1200', '600'] };
    for (const [method, amounts] of Object.entries(expected)) for (const frequency of ['MONTHLY', 'QUARTERLY', 'YEARLY']) {
      const current = await createAsset(method + '_' + frequency, { depreciationMethod: method, depreciationFrequency: frequency });
      const plan = await schedules(current.assetId);
      assert.equal(plan.length, { MONTHLY: 60, QUARTERLY: 20, YEARLY: 5 }[frequency]);
      const totals = [0n, 0n, 0n, 0n, 0n];
      for (const period of plan) {
        const [year, month] = period.periodDate.split('-').map(Number);
        totals[Math.floor(((year - 2040) * 12 + month - 2) / 12)] += cents(period.depreciationAmount);
      }
      check(`AC-2 ${method}/${frequency} 五个折旧年金额符合独立预期`, totals.every((total, index) => total === cents(amounts[index])));
      check(`AC-3 ${method}/${frequency} 完整累计及净值逐分平衡`, cents(plan.at(-1).netValue) === 100000n
        && cents(plan.at(-1).accumulatedAmount) + cents(plan.at(-1).netValue) === cents(current.purchaseAmount));
    }
    const tiny = await createAsset('三分钱尾差', { purchaseAmount: '0.03', salvageValue: '0.00', usefulLifeMonths: 13, depreciationFrequency: 'QUARTERLY' });
    const tinyPlan = await schedules(tiny.assetId);
    check('AC-3 非整年三分钱完整保留且末期日期正确', tinyPlan.reduce((sum, row) => sum + cents(row.depreciationAmount), 0n) === 3n && tinyPlan.at(-1).periodDate === '2041-02-28');
    const opening = await createAsset('期初累计', { openingAccumulatedDepreciation: '1000.00' });
    const openingPlan = await schedules(opening.assetId);
    check('AC-3 期初累计只计一次且余额完整平衡', openingPlan.reduce((sum, row) => sum + cents(row.depreciationAmount), 0n) === 800000n
      && cents(openingPlan.at(-1).accumulatedAmount) === 900000n);
    const beforePreview = database(`SELECT SHA2(CAST(JSON_ARRAY(schedule_id,depreciation_amount,version,status) AS CHAR),256) FROM oa_asset_depreciation_schedule WHERE asset_id=${opening.assetId} ORDER BY period_no;`);
    assert.deepEqual(await get(`/oa/asset/${opening.assetId}/depreciation/preview`), openingPlan);
    check('AC-3 预览不写入或改动原计划', beforePreview === database(`SELECT SHA2(CAST(JSON_ARRAY(schedule_id,depreciation_amount,version,status) AS CHAR),256) FROM oa_asset_depreciation_schedule WHERE asset_id=${opening.assetId} ORDER BY period_no;`));
    evidence.annualAmounts = true; evidence.preview = true;

    const historical = await createAsset('历史保护', { availableFromDate: shifted('MONTH', -2) });
    ctx.historical = historical;
    const concurrent = await Promise.all([post(`/oa/asset/${historical.assetId}/depreciation/post`, {}, admin), post(`/oa/asset/${historical.assetId}/depreciation/post`, {}, other)]);
    check('AC-4/5 两人同时过账仅入两期且不提前计提', concurrent.reduce((sum, value) => sum + value, 0) === 2
      && (await schedules(historical.assetId)).filter(value => value.status === 'POSTED').length === 2);
    const history = snapshot(historical.assetId);
    const posted = await asset(historical.assetId);
    check('AC-4 过账后累计折旧、净值和下次日期准确', cents(posted.accumulatedDepreciation) === 30000n
      && cents(posted.netBookValue) === 970000n && posted.nextDepreciationDate > today);
    await post(`/oa/asset/${historical.assetId}/depreciation/generate`);
    check('AC-8 重复生成完整保留已过账行及审计字段', history === snapshot(historical.assetId));
    reject(await api(admin, '/oa/asset', { method: 'PUT', body: { ...posted, purchaseAmount: '11000.00' } }), 'AC-8 已过账金额不能通过普通编辑更改');
    reject(await api(admin, '/oa/asset/' + historical.assetId, { method: 'DELETE' }), 'AC-8 已过账资产不能删除');
    check('AC-8 拒绝修改后原历史仍保持', history === snapshot(historical.assetId));
    const completed = await createAsset('完整结束', { purchaseAmount: '10.03', salvageValue: '0.03', usefulLifeMonths: 1, availableFromDate: shifted('MONTH', -2) });
    check('AC-6 最后一期实际过账一次', await post(`/oa/asset/${completed.assetId}/depreciation/post`) === 1);
    const final = await asset(completed.assetId);
    check('AC-6 折旧完成清除下次日期并停止再过账', final.depreciationCompletedFlag === 1 && final.nextDepreciationDate == null
      && cents(final.netBookValue) === 3n && await post(`/oa/asset/${completed.assetId}/depreciation/post`, {}, other) === 0);
    const early = await createAsset('提前达到残值', { salvageValue: '9900.00', depreciationMethod: 'DOUBLE_DECLINING', availableFromDate: shifted('YEAR', -1) });
    check('AC-6 提前达到残值仅记账首年十二期', await post(`/oa/asset/${early.assetId}/depreciation/post`) === 12);
    const earlyCompleted = await asset(early.assetId);
    const earlyPlan = await schedules(early.assetId);
    const earlyHistory = snapshot(early.assetId);
    check('AC-6 达到残值立即完成并取消后续四十八期零金额计划', earlyCompleted.depreciationCompletedFlag === 1 && earlyCompleted.nextDepreciationDate == null
      && cents(earlyCompleted.netBookValue) === 990000n && earlyPlan.filter(row => row.status === 'CANCELLED').length === 48
      && !earlyPlan.some(row => row.status === 'PLANNED') && await post(`/oa/asset/${early.assetId}/depreciation/post`, {}, other) === 0
      && snapshot(early.assetId) === earlyHistory);
    evidence.posting = true; evidence.history = true;

    for (const target of [`/oa/asset/${historical.assetId}`, `/oa/asset/${historical.assetId}/depreciation`, `/oa/asset/${historical.assetId}/repairs`]) {
      reject(await api(outsider, target), 'AC-19 外租户不能读取 ' + target);
      reject(await api(readonly, target), 'AC-19 无资产权限不能读取 ' + target);
    }
    reject(await api(readonly, `/oa/asset/${historical.assetId}/depreciation/post`, { method: 'POST', body: {} }), 'AC-5 无权限不能过账');
    reject(await api(outsider, `/oa/asset/${historical.assetId}/depreciation/post`, { method: 'POST', body: {} }), 'AC-5 外租户不能过账');
    evidence.permissions = true;
    await verifyF1AssetLifecycle(ctx);
    await verifyF1AssetTasks(ctx);
    await verifyF1AssetInterface(ctx);
    const summary = (await get('/oa/reports/assets')).summary[0];
    const totals = rows("SELECT JSON_OBJECT('purchase',CAST(COALESCE(SUM(purchase_amount),0) AS CHAR),'accumulated',CAST(COALESCE(SUM(accumulated_depreciation),0) AS CHAR),'net',CAST(COALESCE(SUM(net_book_value),0) AS CHAR)) FROM oa_asset WHERE tenant_id=100000 AND deleted=0;")[0];
    check('AC-18 实际台账报表三项金额与数据库逐分一致', cents(summary.purchaseAmount) === cents(totals.purchase)
      && cents(summary.accumulatedDepreciation) === cents(totals.accumulated) && cents(summary.netBookValue) === cents(totals.net));
    evidence.ledger = true;
  } catch (error) {
    await admin.screenshot({ path: path.join(directory, `f1-assets-failure-${caseTag}.png`), fullPage: true }).catch(() => {});
    throw error;
  }
}
