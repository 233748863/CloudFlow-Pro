import assert from 'node:assert/strict';

export async function verifyF2SupplierCharts(ctx, page, screen, shot, observe) {
  const range = ctx.reportRange;
  await page.getByLabel('开始日期', { exact: true }).fill(range.from);
  const loaded = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/oa/reports/suppliers' && url.searchParams.get('from') === range.from && url.searchParams.get('to') === range.to;
  });
  await page.getByLabel('结束日期', { exact: true }).fill(range.to);
  const response = await loaded;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  assert.equal(payload.code, 200);
  const report = payload.data;
  const sections = title => page.locator('section.oa-ops-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const readRows = section => section.locator('tbody tr').evaluateAll(elements => elements.map(element => Array.from(element.querySelectorAll('td'), cell => cell.textContent.trim())));
  const pie = sections('供应商分档分布图');
  const pieImage = pie.getByRole('img', { name: '供应商分档饼图', exact: true });
  await pieImage.locator('canvas').waitFor();
  await pieImage.scrollIntoViewIfNeeded();
  const colors = await ctx.waitFor(() => pieImage.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const source = element.querySelector('canvas');
    const pixels = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
    const sample = document.createElement('canvas'); sample.width = 1; sample.height = 1;
    const context = sample.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    return Object.fromEntries(['good', 'warning', 'critical'].map(semantic => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = styles.getPropertyValue('--cf-chart-' + semantic).trim(); context.fillRect(0, 0, 1, 1);
      const expected = context.getImageData(0, 0, 1, 1).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 200 && [0, 1, 2].every(channel => Math.abs(pixels[index + channel] - expected[channel]) <= 4)) count++;
      }
      return [semantic, count];
    }));
  }), values => Object.values(values).every(count => count > 20), '供应商饼图未完成实际语义色绘制');
  observe('AC-17/FR-8.1 ' + screen + '分档饼图实际绘制红黄绿三种语义色', Object.values(colors).every(count => count > 20), colors);
  await shot(page, 'report-pie-' + screen);
  await pie.getByRole('button', { name: '查看数据表', exact: true }).click();
  const names = { EXCELLENT: '优秀', QUALIFIED: '合格', WATCH: '观察', ELIMINATED: '淘汰' };
  const total = report.standing.reduce((sum, row) => sum + Number(row.supplierCount), 0);
  const expectedDistribution = report.standing.map(row => [names[row.standing] || '未评分', String(row.supplierCount), (Number(row.supplierCount) / total * 100).toFixed(2) + '%']);
  observe('AC-17/FR-8.1 ' + screen + '饼图每档数量与百分比均与真实报表一致', JSON.stringify(await readRows(pie)) === JSON.stringify(expectedDistribution));
  await pie.getByRole('button', { name: '查看图表', exact: true }).click();

  const trend = sections('供应商评分趋势图');
  await trend.getByLabel('评分供应商', { exact: true }).selectOption(String(ctx.principal.supplierId));
  await trend.getByLabel('评分周期', { exact: true }).selectOption('MONTHLY');
  await trend.getByRole('img', { name: '供应商周期评分折线图', exact: true }).locator('canvas').waitFor();
  await trend.scrollIntoViewIfNeeded();
  await shot(page, 'report-trend-' + screen);
  await trend.getByRole('button', { name: '查看数据表', exact: true }).click();
  const expectedTrend = report.scores.filter(row => String(row.supplierId) === String(ctx.principal.supplierId) && row.periodType === 'MONTHLY')
    .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)).map(row => [row.periodEnd, Number(row.totalScore).toFixed(2)]);
  observe('AC-17/FR-8.2 ' + screen + '所选供应商折线保留95分和78分两个真实周期', expectedTrend.length === 2
    && JSON.stringify(await readRows(trend)) === JSON.stringify(expectedTrend) && expectedTrend[0][1] === '95.00' && expectedTrend[1][1] === '78.00');
  const another = report.scores.find(row => String(row.supplierId) !== String(ctx.principal.supplierId) && row.periodType === 'MONTHLY');
  assert.ok(another);
  await trend.getByLabel('评分供应商', { exact: true }).selectOption(String(another.supplierId));
  const alternateTrend = report.scores.filter(row => String(row.supplierId) === String(another.supplierId) && row.periodType === 'MONTHLY')
    .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)).map(row => [row.periodEnd, Number(row.totalScore).toFixed(2)]);
  observe('AC-17/FR-8.2 ' + screen + '切换供应商后趋势仅显示对应的真实评分', JSON.stringify(await readRows(trend)) === JSON.stringify(alternateTrend));
  await trend.getByRole('button', { name: '查看图表', exact: true }).click();
  observe('AC-17 ' + screen + '新增图表及筛选在视口内完整排列', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
