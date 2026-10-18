import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitForShellLayout } from './portal-checks/wait-shell-layout.mjs';
import { verifyF2SupplierCharts } from './verify-f2-supplier-charts.mjs';

export async function verifyF2SupplierInterface(ctx) {
  const { admin, browser, origin, api, successful, directory, caseTag, marker, check, database, quote, waitFor,
    evidence, supplier, principal, category, blacklistedSupplier, activeBypassSupplier, expiredCertificate, remember } = ctx;
  const agreement = admin.getByRole('button', { name: '同意并继续', exact: true });
  if (await agreement.isVisible()) await agreement.click();
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
    hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block', storageState: await admin.context().storageState(),
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await mobileContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const mobile = await mobileContext.newPage();
  const observations = [];
  const observe = (name, passed, actual) => observations.push({ name, passed: !!passed, actual });
  const shot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready);
    await waitForShellLayout(page);
    await page.screenshot({ path: path.join(directory, `f2-${name}-${caseTag}.png`), fullPage: false });
  };
  const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });
  const navigate = async (page, route) => {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    const identity = successful(await api(page, '/auth/info'), '供应商整页跳转后真实会话');
    check('F2 整页跳转后真实身份及租户保持', String(identity.user.userId) === '990000701'
      && identity.user.userName === 'g_import_admin' && String(identity.user.tenantId) === '100000');
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    if (token) await remember(token.replace(/^Bearer /, ''));
  };
  const openSupplier = async (page, value) => {
    await navigate(page, '/admin/supplier');
    await page.getByPlaceholder('搜索供应商名称', { exact: true }).fill(value.supplierName);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: value.supplierName });
    await row.getByRole('button', { name: '查看详情', exact: true }).click({ timeout: 60000 });
    const details = dialog(page, '供应商详情');
    await details.getByText('当前评分', { exact: true }).waitFor();
    return details;
  };
  const coreField = (form, label) => form.locator('.admin-dialog-field').filter({ has: form.page().getByText(label, { exact: true }) }).locator('input');
  const savedResponse = (page, endpoint, method = 'POST') => page.waitForResponse(response => new URL(response.url()).pathname === '/api' + endpoint && response.request().method() === method);
  try {
    for (const [screen, page, width] of [['desktop', admin, 1440], ['mobile', mobile, 390], ['mobileNarrow', mobile, 320]]) {
      await page.setViewportSize({ width, height: screen === 'desktop' ? 1000 : 844 });
      await navigate(page, '/admin/supplier');
      await page.getByRole('button', { name: '新增供应商', exact: true }).waitFor({ timeout: 60000 });
      const identity = successful(await api(page, '/auth/info'), '供应商页面真实会话');
      check('F2 ' + screen + '保留同一管理员身份及租户', identity.user.userName === 'g_import_admin' && String(identity.user.tenantId) === '100000');
      if (screen !== 'mobileNarrow') {
        await page.getByRole('button', { name: '新增供应商', exact: true }).click();
        const form = dialog(page, '新增供应商');
        const supplierName = marker + '_页面录入_' + screen;
        await coreField(form, '供应商名称').fill(supplierName);
        await coreField(form, '联系人').fill('页面联系人');
        await coreField(form, '联系电话').fill('13800138001');
        await coreField(form, '银行账号').fill('6222000000000042');
        await form.getByLabel('供应商编号', { exact: true }).fill(marker + '_UI_' + screen);
        await form.getByLabel('供应商分类', { exact: true }).selectOption(String(category.categoryId));
        await form.getByLabel('统一社会信用代码', { exact: true }).fill('UI' + caseTag.toUpperCase() + (screen === 'desktop' ? '0001' : '0002'));
        await form.getByLabel('注册资本（元）', { exact: true }).fill('12345.67');
        await form.getByLabel('默认税率（0–1）', { exact: true }).fill('0.13');
        await form.getByLabel('付款条件', { exact: true }).fill('月结30天');
        await form.getByLabel('地址', { exact: true }).fill('本机供应商园区42号');
        await form.getByLabel('联系邮箱', { exact: true }).fill('ui-supplier@example.invalid');
        await form.getByLabel('统一社会信用代码', { exact: true }).scrollIntoViewIfNeeded();
        await shot(page, 'profile-' + screen);
        const saving = savedResponse(page, '/oa/supplier');
        await form.getByRole('button', { name: '保存', exact: true }).click();
        const response = await saving;
        assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200);
        await form.waitFor({ state: 'hidden' });
        const id = database(`SELECT supplier_id FROM oa_supplier WHERE tenant_id=100000 AND supplier_name=${quote(supplierName)} AND deleted=0;`);
        assert.match(id, /^[1-9][0-9]*$/);
        const stored = await supplier(id);
        check('AC-1 ' + screen + '页面新增字段真实保存', stored.contactName === '页面联系人' && Number(stored.registerCapital) === 12345.67
          && Number(stored.taxRate) === 0.13 && stored.paymentTerms === '月结30天' && String(stored.categoryId) === String(category.categoryId));
        await page.getByPlaceholder('搜索供应商名称', { exact: true }).fill(supplierName);
        await page.getByRole('button', { name: '搜索', exact: true }).click();
        await page.getByRole('row').filter({ hasText: supplierName }).getByRole('button', { name: '编辑', exact: true }).click();
        const editForm = dialog(page, '编辑供应商');
        check('AC-1 ' + screen + '实际编辑表单按隐私规则显示四项资料',
          await coreField(editForm, '联系电话').inputValue() === '138****8001'
          && await coreField(editForm, '银行账号').inputValue() === '6222 **** 0042'
          && await editForm.getByLabel('地址', { exact: true }).inputValue() === '本机供应商园****'
          && await editForm.getByLabel('联系邮箱', { exact: true }).inputValue() === 'u***@example.invalid');
        await editForm.getByLabel('简称', { exact: true }).fill('页面修改_' + screen);
        await coreField(editForm, '联系电话').scrollIntoViewIfNeeded();
        await shot(page, 'private-edit-' + screen);
        const editing = savedResponse(page, '/oa/supplier', 'PUT');
        await editForm.getByRole('button', { name: '保存', exact: true }).click();
        const editResponse = await editing;
        assert.equal(editResponse.status(), 200); assert.equal((await editResponse.json()).code, 200);
        await editForm.waitFor({ state: 'hidden' });
        const completeValues = ctx.rows(`SELECT JSON_OBJECT('shortName',short_name,'address',address,'contactPhone',contact_phone,
          'contactEmail',contact_email,'bankAccount',bank_account) FROM oa_supplier WHERE tenant_id=100000 AND supplier_id=${id};`)[0];
        check('AC-1 ' + screen + '真实页面修改简称后四项完整原始资料保持', completeValues.shortName === '页面修改_' + screen
          && completeValues.address === '本机供应商园区42号' && completeValues.contactPhone === '13800138001'
          && completeValues.contactEmail === 'ui-supplier@example.invalid' && completeValues.bankAccount === '6222000000000042');
      }
      const details = await openSupplier(page, principal);
      await waitFor(() => details.locator('.oa-ops-metric').filter({ has: page.getByText('当前评分', { exact: true }) }).locator('strong').textContent(),
        value => value?.trim() === '78.00', '供应商页面未显示实际78分');
      observe('AC-9 ' + screen + '显示实际评分及合格档位', (await details.innerText()).includes('合格'));
      await details.getByText('当前评分', { exact: true }).scrollIntoViewIfNeeded();
      await shot(page, 'governance-' + screen);
      const scoreRow = details.getByRole('row').filter({ hasText: ctx.month(0).end }).filter({ hasText: '78.00' });
      await scoreRow.getByRole('button', { name: '查看维度', exact: true }).click();
      const score = dialog(page, '供应商周期评分');
      await score.getByLabel('维度编码', { exact: true }).first().waitFor();
      observe('AC-6/8 ' + screen + '确认后的四维只读并显示真实收货依据', await score.getByLabel('维度编码', { exact: true }).count() === 4
        && await score.getByLabel('维度得分', { exact: true }).nth(1).isDisabled() && (await score.innerText()).includes('基于2笔收货，及时1笔'));
      await shot(page, 'scoring-' + screen);
      const deliveryBasis = score.locator('[data-score-basis="DELIVERY_ON_TIME"]');
      await deliveryBasis.scrollIntoViewIfNeeded();
      const basisBounds = await deliveryBasis.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: innerWidth,
          contentWidth: element.scrollWidth, visibleWidth: element.clientWidth, text: element.textContent };
      });
      observe('AC-8 ' + screen + '实际收货计算依据完整换行且未横向裁切',
        basisBounds.left >= 0 && basisBounds.right <= basisBounds.width + 1
        && basisBounds.contentWidth <= basisBounds.visibleWidth + 1 && basisBounds.text.includes('基于2笔收货，及时1笔'), basisBounds);
      await shot(page, 'scoring-basis-' + screen);
      await score.getByLabel('维度得分', { exact: true }).last().scrollIntoViewIfNeeded();
      await shot(page, 'scoring-bottom-' + screen);
      await score.getByRole('button', { name: '关闭', exact: true }).click();

      await navigate(page, '/admin/reports/suppliers');
      await page.getByRole('heading', { name: '资质到期预警', exact: true }).waitFor({ timeout: 60000 });
      await verifyF2SupplierCharts(ctx, page, screen, shot, observe);
      const expirySection = page.locator('section.oa-ops-section').filter({ has: page.getByRole('heading', { name: '资质到期预警', exact: true }) });
      const expiryRow = (screen === 'desktop' ? expirySection.getByRole('row') : expirySection.locator('[data-report-record="expiry"]')).filter({ hasText: expiredCertificate.certName });
      await expiryRow.waitFor({ state: 'visible' });
      const statusCell = screen === 'desktop' ? expiryRow.getByRole('cell').last() : expiryRow.locator('[data-report-value="verifyStatus"]');
      await statusCell.scrollIntoViewIfNeeded();
      const status = (await statusCell.textContent()).trim();
      observe('AC-4/17 ' + screen + '资质预警使用已过期中文状态', status === '已过期', { displayedStatus: status });
      observe('AC-17 ' + screen + '四类报表均有可读标题', await page.getByRole('heading', { name: '供应商分档', exact: true }).count() === 1
        && await page.getByRole('heading', { name: '周期评分趋势', exact: true }).count() === 1
        && await page.getByRole('heading', { name: '采购金额与供应商评分', exact: true }).count() === 1);
      if (screen !== 'desktop') {
        observe('AC-4/17 ' + screen + '资质证件及到期日期完整显示',
          await expiryRow.locator('[data-report-value="certName"]').innerText() === expiredCertificate.certName
          && await expiryRow.locator('[data-report-value="expireDate"]').innerText() === expiredCertificate.expireDate
          && await expiryRow.locator('[data-report-value="remainingDays"]').innerText() === '-1');
        for (const [sectionKey, fieldCount] of [['standing', 2], ['scores', 6], ['expiry', 5], ['purchases', 5]]) {
          const records = page.locator(`[data-report-record="${sectionKey}"]`);
          const fields = await records.evaluateAll(elements => elements.map(element => Array.from(element.querySelectorAll('dd'), field => {
            const bounds = field.getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(field);
            return { text: field.textContent, visible: getComputedStyle(field).visibility === 'visible' && bounds.width > 0,
              fits: bounds.left >= 0 && bounds.right <= innerWidth + 1 && field.scrollWidth <= field.clientWidth + 1
                && Array.from(range.getClientRects()).every(rectangle => rectangle.left >= bounds.left - 1 && rectangle.right <= bounds.right + 1) };
          })));
          observe('AC-17 ' + screen + '完整显示' + sectionKey + '全部明细字段且文字无裁切',
            fields.length > 0 && fields.every(record => record.length === fieldCount && record.every(field => field.visible && field.fits)), fields);
        }
      }
      await shot(page, 'report-expiry-' + screen);
      if (screen !== 'desktop') {
        await page.locator('[data-report-record="purchases"]').first().scrollIntoViewIfNeeded();
        await shot(page, 'report-purchases-' + screen);
      }

      await navigate(page, '/office/purchase-request');
      await page.getByRole('button', { name: '新建采购', exact: true }).click({ timeout: 60000 });
      const purchase = dialog(page, '新建采购申请');
      await purchase.getByText('请选择供应商', { exact: true }).click();
      const blackOption = page.getByRole('option').filter({ hasText: blacklistedSupplier.supplierName });
      await blackOption.waitFor({ state: 'visible' });
      await blackOption.scrollIntoViewIfNeeded();
      const actual = await blackOption.evaluate(element => {
        const color = getComputedStyle(element).color;
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext('2d');
        context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        return { disabled: element.getAttribute('aria-disabled') === 'true', text: element.textContent,
          color, rgb: Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3) };
      });
      const color = actual.rgb;
      observe('AC-11 ' + screen + '黑名单供应商选择项禁用并标红', actual.disabled && actual.text.includes('黑名单')
        && color[0] >= color[1] + 30 && color[0] >= color[2] + 30, actual);
      await shot(page, 'blacklist-choice-' + screen);
      const bypassOption = page.getByRole('option').filter({ hasText: activeBypassSupplier.supplierName });
      await bypassOption.scrollIntoViewIfNeeded();
      const bypassChoice = await bypassOption.evaluate(element => ({ disabled: element.getAttribute('aria-disabled') === 'true',
        text: element.textContent }));
      observe('AC-11 ' + screen + '真实批准的有效例外可选择并显示截止日', !bypassChoice.disabled
        && bypassChoice.text.includes('已批准例外至 ' + activeBypassSupplier.bypassExpireDate), bypassChoice);
      await bypassOption.click();
      observe('AC-11 ' + screen + '点击有效例外后供应商选择实际更新',
        (await purchase.textContent()).includes(activeBypassSupplier.supplierName));
      await shot(page, 'approved-bypass-choice-' + screen);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      observe('F2 ' + screen + '页面根容器不产生横向溢出', !overflow);
    }
    await fs.writeFile(path.join(directory, `f2-ui-observations-${caseTag}.json`), JSON.stringify(observations, null, 2), { flag: 'wx' });
    for (const observation of observations) check(observation.name, observation.passed);
    evidence.desktop = true; evidence.mobile = true; evidence.mobileNarrow = true; evidence.reportCharts = true;
  } catch (error) {
    await fs.writeFile(path.join(directory, `f2-ui-observations-${caseTag}.json`), JSON.stringify(observations, null, 2), { flag: 'wx' }).catch(failure => {
      if (failure.code !== 'EEXIST') throw failure;
    });
    await shot(mobile, 'mobile-failure').catch(() => {});
    throw error;
  } finally { await mobileContext.close(); }
}
