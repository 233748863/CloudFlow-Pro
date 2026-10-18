import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tapB2Mobile } from './b2-mobile-browser.mjs';

export function createB2MobileMonitorVerifier({ page, database, check, caseTag }) {
  const labels = { RUNNING: '审批中', PASSED: '已通过', AUTO_PASSED: '自动通过', REJECTED: '已驳回',
    TERMINATED: '已终止', INVALIDATED: '已作废', CANCELLED: '发起人已撤销', WITHDRAWN: '审批人已撤回',
    TASK_BACK: '已回退', PAUSED: '已暂停', RESTARTED: '重新提交', PENDING: '等待外部处理', FAILED: '执行异常' };
  const checked = new Set();
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b2-mobile-monitor-' + caseTag);
  const counts = () => Object.fromEntries(database("SELECT status,COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND deleted=0 GROUP BY status ORDER BY status;")
    .split(/\r?\n/).filter(Boolean).map(line => { const [status, count] = line.split('\t'); return [status, Number(count)]; }));
  const matches = suffix => response => new URL(response.url()).pathname.endsWith('/workflow/wf/statistics/' + suffix)
    && response.request().method() === 'GET';
  return { checked, async observe(sample, status) {
    if (checked.has(status)) return;
    assert.match(sample.id, /^[a-f0-9-]{36}$/);
    await fs.mkdir(directory, { recursive: true });
    try {
      if (!checked.size) {
        await tapB2Mobile(page.getByRole('button', { name: '自动刷新 开', exact: true }));
        check('手机监控关闭自动刷新可触屏操作', await page.getByRole('button', { name: '自动刷新 关', exact: true }).isVisible());
      }
      const before = counts();
      const analysisPromise = page.waitForResponse(matches('analysis'));
      const metricsPromise = page.waitForResponse(matches('metrics'));
      await tapB2Mobile(page.getByRole('button', { name: '刷新工作流监控', exact: true }));
      const [analysisResponse, metricsResponse] = await Promise.all([analysisPromise, metricsPromise]);
      const [analysisBody, metricsBody] = await Promise.all([analysisResponse.json(), metricsResponse.json()]);
      assert.equal(analysisResponse.status(), 200); assert.equal(metricsResponse.status(), 200);
      assert.equal(analysisBody.code, 200); assert.equal(metricsBody.code, 200);
      const after = counts(), analysis = analysisBody.data, metrics = metricsBody.data;
      assert.deepEqual(after, before, 'Mobile monitor source records must remain stable while reading');
      check('手机真实分析接口与数据库状态数量一致' + status, Object.keys(labels).every(key => (analysis.byStatus[key] ?? 0) === (after[key] ?? 0))
        && after[status] > 0 && database("SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id='" + sample.id + "';") === status);
      const active = ['RUNNING', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED', 'PENDING'].reduce((total, key) => total + (after[key] ?? 0), 0);
      check('手机概览按实际活动与成功状态汇总' + status, metrics.totalInstances === Object.values(after).reduce((total, value) => total + value, 0)
        && metrics.runningInstances === active && metrics.completedInstances === (after.PASSED ?? 0) + (after.AUTO_PASSED ?? 0));
      const expected = Object.entries(labels).map(([key, label]) => ({ key, label, count: String(after[key] ?? 0) }));
      await page.waitForFunction(items => items.every(({ key, label, count }) => {
        const row = document.querySelector('[data-process-status="' + key + '"]');
        return row?.querySelector('dt')?.textContent === label && row.querySelector('dd')?.textContent === count;
      }), expected);
      check('手机十三种状态中文标签与实际数量完整显示' + status, await page.locator('[data-process-status]').count() === 13);
      const row = page.locator('[data-process-status="' + status + '"]');
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      check('手机状态行保持屏幕横向边界' + status, box && box.x >= 0 && box.x + box.width <= 391);
      await page.screenshot({ path: path.join(directory, status.toLowerCase() + '.png') });
      checked.add(status);
    } catch (error) {
      await page.screenshot({ path: path.join(directory, 'failure-' + status + '.png') }).catch(() => {});
      throw error;
    }
  }, async verifyRouteBoundary() {
    for (const route of ['/my-apps', '/workflow/design']) {
      await page.goto(new URL(route, page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true }).waitFor();
      check('手机既有入口限制已明确核对' + route, true);
    }
    console.log('B2_MOBILE_MONITOR_ACTUAL: ' + JSON.stringify({ states: checked.size, distributionRows: 13,
      realTouchRefresh: true, realMetricsAndAnalysis: true, viewport: '390x844', mobileBrowserEmulated: true,
      physicalPhoneTested: false, mobileApplicationsAvailable: false, mobileDesignerAvailable: false,
      draftIncludedInInstanceCounts: false, interfaceDoubles: 0 }));
  } };
}
