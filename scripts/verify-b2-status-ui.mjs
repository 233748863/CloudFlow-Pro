import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only browser verification against the same real instances used by the state action checks.
export function createB2StatusUiVerifier({ page, check, caseTag }) {
  const labels = {
    DRAFT: '草稿', RUNNING: '审批中', PASSED: '已通过', AUTO_PASSED: '自动通过', REJECTED: '已驳回',
    TERMINATED: '已终止', INVALIDATED: '已作废', CANCELLED: '发起人已撤销', WITHDRAWN: '审批人已撤回',
    TASK_BACK: '已回退', PAUSED: '已暂停', RESTARTED: '重新提交', PENDING: '等待外部处理', FAILED: '执行异常'
  };
  const checked = new Set();
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b2-state-ui-' + caseTag);
  const matches = (response, title, status) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/workflow/wf/my-instances') && response.request().method() === 'GET'
      && url.searchParams.get('params[keyword]') === title && url.searchParams.get('params[status]') === status;
  };
  return {
    checked,
    async observe(sample, status) {
      if (checked.has(status)) return;
      assert.ok(labels[status]);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(new URL('/my-apps', page.url()).href, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('流程标题、编号或摘要').waitFor();
      if (checked.size === 0) {
        for (const label of Object.values(labels)) await page.getByRole('button', { name: label, exact: true }).waitFor();
        check('真实我的申请页面提供十四种状态筛选', true);
      }
      await page.getByPlaceholder('流程标题、编号或摘要').fill(sample.key);
      const searchPromise = page.waitForResponse(response => matches(response, sample.key, null));
      await page.getByRole('button', { name: '应用筛选', exact: true }).click();
      const searchResponse = await searchPromise;
      assert.equal(searchResponse.status(), 200); assert.equal((await searchResponse.json()).code, 200);
      const responsePromise = page.waitForResponse(response => matches(response, sample.key, status));
      await page.getByRole('button', { name: labels[status], exact: true }).click();
      const response = await responsePromise, body = await response.json();
      assert.equal(response.status(), 200); assert.equal(body.code, 200);
      const records = body.data.rows ?? body.data.records;
      check('页面实际请求准确筛出' + status, body.data.total === 1 && records.length === 1
        && records[0].instanceId === sample.id && records[0].status === status);
      const row = page.locator('[data-task-id]').filter({ hasText: sample.key });
      await row.waitFor(); await row.getByText(labels[status], { exact: true }).waitFor();
      check('页面显示真实实例及对应中文状态' + status, await row.count() === 1);
      await fs.mkdir(directory, { recursive: true });
      await page.screenshot({ path: path.join(directory, status.toLowerCase() + '.png'), fullPage: true });
      const other = status === 'RUNNING' ? 'PASSED' : 'RUNNING';
      const excludedPromise = page.waitForResponse(result => matches(result, sample.key, other));
      await page.getByRole('button', { name: labels[other], exact: true }).click();
      const excludedResponse = await excludedPromise, excluded = await excludedResponse.json();
      assert.equal(excludedResponse.status(), 200); assert.equal(excluded.code, 200);
      await row.waitFor({ state: 'hidden' });
      check('页面切换其他状态排除当前实例' + status, excluded.data.total === 0
        && (excluded.data.rows ?? excluded.data.records).length === 0);
      checked.add(status);
    }
  };
}
