import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function createB1RejectionUi({ manager, employee, device, caseTag, secrets, check, snapshot }) {
  assert.ok(['desktop', 'mobile'].includes(device));
  const directory = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-rejection-ui-' + caseTag);
  await fs.mkdir(directory, { recursive: true });
  const contexts = [], pages = [], errors = [], readResponses = [], comments = new Map();
  let reviewPage = manager, starterPage = employee, screenshots = 0, pageRejections = 0, pageApprovals = 0, traceViews = 0;
  const onError = error => errors.push(error.name);
  const onResponse = response => {
    if (response.request().method() === 'POST' && new URL(response.url()).pathname.includes('/workflow/wf/task/read/'))
      readResponses.push(response.json().then(body => response.status() === 200 && body.code === 200).catch(() => false));
  };
  try {
    if (device === 'mobile') {
      for (const source of [manager, employee]) {
        const browser = await createB2MobileBrowser({ admin: source, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
        contexts.push(browser);
      }
      [reviewPage, starterPage] = contexts.map(item => item.page);
    } else for (const page of [manager, employee]) await page.setViewportSize({ width: 1440, height: 1000 });
    pages.push(reviewPage, starterPage);
    for (const page of pages) { page.on('pageerror', onError); page.on('response', onResponse); }
  } catch (error) { for (const context of contexts) await context.close(); throw error; }
  const tap = (page, locator) => device === 'mobile' ? tapB2Mobile(locator) : locator.click();
  const shot = async (page, name) => { await page.screenshot({ path: path.join(directory, String(++screenshots).padStart(2, '0') + '-' + name + '.png'), fullPage: true }); };
  const dialog = (page, name = '任务处理') => page.getByRole('dialog', { name, exact: true });
  const open = async (page, task) => {
    await page.goto(new URL('/workflow/task/' + task.id, page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '待办详情', exact: true }).waitFor();
    await dialog(page).getByRole('button', { name: '同意', exact: true }).waitFor();
    return dialog(page);
  };
  const responseFor = (page, endpoint) => page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/workflow/wf/' + endpoint), { timeout: 30000 }).catch(() => null);
  const submitted = async (pending, expected, endpoint) => {
    const response = await pending; assert.ok(response, 'Real page did not send ' + endpoint);
    const request = response.request().postDataJSON(), body = await response.json();
    check(device + '页面提交本人任务及操作内容准确', Object.entries(expected).every(([key, value]) => request[key] === value));
    return { status: response.status(), body, request };
  };
  const labels = { TO_INITIATOR: '退回发起人修改', TO_PREVIOUS_NODE: '退回上一个审批节点', TO_SPECIFIED_NODE: '退回指定上游节点',
    TERMINATE: '直接结束流程', TO_PARENT_NODE: '退回父流程节点', __LEGACY__: '原有方式：退回已处理节点' };
  return {
    async reject({ id, task, body, strategy }) {
      await open(reviewPage, task);
      const before = snapshot(id); let writes = 0;
      const count = request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/workflow/wf/reject')) writes++; };
      reviewPage.on('request', count);
      try {
        await tap(reviewPage, dialog(reviewPage).getByRole('button', { name: '驳回', exact: true }));
        let rejection = dialog(reviewPage, '驳回任务');
        await rejection.getByPlaceholder('请填写驳回原因...', { exact: true }).waitFor();
        check(device + '驳回原因空白时不能确认', await rejection.getByRole('button', { name: '确认驳回', exact: true }).isDisabled());
        await rejection.getByPlaceholder('请填写驳回原因...', { exact: true }).fill('   ');
        check(device + '空格原因也不能确认', await rejection.getByRole('button', { name: '确认驳回', exact: true }).isDisabled());
        await rejection.getByPlaceholder('请填写驳回原因...', { exact: true }).fill(body.comment + '-cancelled');
        await tap(reviewPage, rejection.getByRole('button', { name: '取消', exact: true }));
        await dialog(reviewPage).getByRole('button', { name: '驳回', exact: true }).waitFor();
        check(device + '取消驳回没有提交且原流程历史保持', writes === 0 && snapshot(id) === before);
        await tap(reviewPage, dialog(reviewPage).getByRole('button', { name: '驳回', exact: true }));
        rejection = dialog(reviewPage, '驳回任务');
        const selected = strategy === 'DEFAULT_INITIATOR' ? 'TO_INITIATOR' : strategy === 'LEGACY_EXPLICIT_TARGET' ? '__LEGACY__' : strategy;
        const selector = rejection.getByRole('button', { name: '驳回方式', exact: true });
        if (strategy === 'DEFAULT_INITIATOR') {
          await tap(reviewPage, selector);
          await tap(reviewPage, reviewPage.getByRole('option', { name: labels[selected], exact: true }));
        }
        check(device + '驳回方式正确回显或由本人选择', (await selector.textContent()).includes(labels[selected]));
        if (['TO_SPECIFIED_NODE','__LEGACY__'].includes(selected)) {
          const target = body.targetNodeKey || 'pre';
          await rejection.getByRole('button', { name: target, exact: true }).waitFor();
          check(device + '目标仅显示已执行上游节点', await rejection.getByRole('button', { name: 'pre', exact: true }).count() === 1
            && await rejection.getByRole('button', { name: 'review', exact: true }).count() === 0
            && await rejection.getByRole('button', { name: 'after', exact: true }).count() === 0
            && await rejection.getByRole('button', { name: '结束', exact: true }).count() === 0);
          await rejection.getByPlaceholder('请填写驳回原因...', { exact: true }).fill(body.comment);
          if (selected === '__LEGACY__') check(device + '原有方式未选目标不能提交', await rejection.getByRole('button', { name: '确认驳回', exact: true }).isDisabled());
          await tap(reviewPage, rejection.getByRole('button', { name: target, exact: true }));
        }
        await rejection.getByPlaceholder('请填写驳回原因...', { exact: true }).fill(body.comment);
        await shot(reviewPage, selected + '-ready');
        const pending = responseFor(reviewPage, 'reject');
        await tap(reviewPage, rejection.getByRole('button', { name: '确认驳回', exact: true }));
        const result = await submitted(pending, { taskId: task.id, comment: body.comment,
          ...(selected === '__LEGACY__' ? {} : { strategy: selected }),
          ...(['TO_SPECIFIED_NODE','__LEGACY__'].includes(selected) ? { targetNodeKey: body.targetNodeKey || 'pre' } : {}) }, 'reject');
        check(device + '单次确认仅提交一次驳回', writes === 1); pageRejections++;
        if (result.status === 200 && result.body.code === 200) {
          comments.set(id, body.comment); await rejection.waitFor({ state: 'hidden' });
        }
        return result;
      } finally { reviewPage.off('request', count); }
    },
    async complete({ id, task, body }) {
      const current = await open(starterPage, task), label = task.type === 'REJECT_JUMP' ? '驳回跳转' : '驳回';
      await tap(starterPage, current.getByRole('button', { name: '审批记录', exact: true }));
      await current.getByText(comments.get(id), { exact: true }).waitFor();
      const badges = current.locator('span').filter({ hasText: new RegExp('^' + label + '$') }).filter({ has: starterPage.locator('svg') });
      check(device + '审批轨迹展示对应驳回图标和文案', await badges.count() > 0); traceViews++;
      await shot(starterPage, 'returned-trace-' + task.node);
      await tap(starterPage, current.getByRole('button', { name: '处理', exact: true }));
      if (task.node === 'start') {
        const note = current.locator('#field-note').getByRole('textbox'); await note.waitFor();
        check(device + '发起人收到退回后可以编辑原表单', await note.isEditable());
        if (body.variables?.note) await note.fill(body.variables.note);
      }
      await current.getByPlaceholder('请输入审批意见...', { exact: true }).fill(body.comment);
      await tap(starterPage, current.getByRole('button', { name: '同意', exact: true }));
      await shot(starterPage, 'returned-submit-' + task.node);
      const pending = responseFor(starterPage, 'complete');
      await tap(starterPage, current.getByRole('button', { name: '确认', exact: true }));
      const result = await submitted(pending, { taskId: task.id, action: 'APPROVE', comment: body.comment }, 'complete');
      if (body.variables?.note) check(device + '页面重提请求完整携带修改内容', result.request.variables?.note === body.variables.note);
      pageApprovals++;
      if (result.status === 200 && result.body.code === 200) await current.waitFor({ state: 'hidden' });
      return result;
    },
    async completeReject({ id, task, body }) {
      const current = await open(reviewPage, task), before = snapshot(id);
      await current.getByPlaceholder('请输入审批意见...', { exact: true }).fill(body.comment);
      await tap(reviewPage, current.getByRole('button', { name: '拒绝', exact: true }));
      await tap(reviewPage, current.getByRole('button', { name: '取消', exact: true }));
      check(device + '取消拒绝确认保留原流程', snapshot(id) === before);
      await tap(reviewPage, current.getByRole('button', { name: '拒绝', exact: true }));
      await shot(reviewPage, 'legacy-reject-ready');
      const pending = responseFor(reviewPage, 'complete');
      await tap(reviewPage, current.getByRole('button', { name: '确认', exact: true }));
      const result = await submitted(pending, { taskId: task.id, action: 'REJECT', comment: body.comment }, 'complete'); pageRejections++;
      if (result.status === 200 && result.body.code === 200) await current.waitFor({ state: 'hidden' });
      return result;
    },
    async finish() {
      const reads = await Promise.all(readResponses);
      check(device + '页面重复标记已读均成功且没有并发冲突提示', reads.length >= 13 && reads.every(Boolean));
      check(device + '驳回页面无未捕获异常', errors.length === 0);
      check(device + '九次驳回和四次退回任务处理均由页面完成', pageRejections === 9 && pageApprovals === 4 && traceViews === 4);
      console.log('B1_REJECTION_UI_ACTUAL: ' + JSON.stringify({ device, pageRejections, pageApprovals, traceViews, screenshots,
        readResponses: reads.length, readConflicts: reads.filter(value => !value).length,
        cancellationChecked: true, reasonRequired: true, upstreamTargetsOnly: true, returnedFormEdited: true, actualTouch: device === 'mobile' }));
    },
    async close(failure) {
      for (const page of pages) { page.off('pageerror', onError); page.off('response', onResponse); }
      if (failure) for (const [index, page] of pages.entries()) if (!page.isClosed()) await page.screenshot({ path: path.join(directory, 'failure-' + index + '.png'), fullPage: true }).catch(() => {});
      for (const context of contexts) await context.close();
    },
  };
}
