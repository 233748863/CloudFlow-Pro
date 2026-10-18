import assert from 'node:assert/strict';
import path from 'node:path';

const types = { ACTIVITY: '活动', FOLLOW_UP: '跟进', OPPORTUNITY: '商机阶段', QUOTE: '报价', RECEIVABLE: '回款', TICKET: '工单' };
const expectedStatus = {
  ACTIVITY: { PLANNED: '计划', IN_PROGRESS: '进行中', COMPLETED: '已完成' },
  OPPORTUNITY: { OPEN: '进行中' }, QUOTE: { DRAFT: '草稿' },
  RECEIVABLE: { PARTIAL_RECEIVED: '部分回款' }, TICKET: { OPEN: '待处理' },
};
const project = item => ({ type: item.type, sourceId: item.sourceId, title: item.title,
  content: item.content || null, status: item.status || null, eventTime: item.eventTime, ownerName: item.ownerName || null });

export async function verifyTimelineUi({ runtime, output, customerId, emptyCustomerId, expected, invitedId, uiRequests, screenshots }) {
  const { check, sessions } = runtime;
  const origin = new URL(sessions.sales.page.url()).origin;
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await sessions.sales.context.newPage();
    await page.setViewportSize(viewport);
    page.setDefaultTimeout(30000);
    page.on('pageerror', () => runtime.browserErrors.push('timeline_' + viewport.width));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/')) uiRequests.push({ path: url.pathname, method: response.request().method(), status: response.status() });
    });
    const section = page.locator('section.crm-ops-section').filter({ has: page.getByRole('heading', { name: '客户经营时间线', exact: true }) });
    const capture = async name => {
      const file = 'timeline-' + viewport.width + '-' + name + '.png';
      await page.screenshot({ path: path.join(output, file), fullPage: true, timeout: 60000 });
      screenshots.push(file);
    };
    const responseFor = (id, type = '', pageNum = 1) => page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/crm/activity/customer/' + id + '/timeline'
        && (url.searchParams.get('type') || '') === type
        && Number(url.searchParams.get('pageNum') || 1) === pageNum;
    });
    const inspect = async (pending, entries, pageNum, label) => {
      const response = await pending;
      const body = await response.json();
      check(label + '_response', response.status() === 200 && body.code === 200 && body.data.total === entries.length);
      const selected = entries.slice((pageNum - 1) * 20, pageNum * 20);
      assert.deepEqual(body.data.rows.map(project), selected.map(project), label + '_source_rows');
      check(label + '_source_rows', true);
      await section.waitFor({ state: 'visible' });
      await section.getByText('正在加载时间线', { exact: true }).waitFor({ state: 'hidden' });
      const records = section.locator('ol > li');
      if (selected.length) await records.first().waitFor();
      check(label + '_visible_count', await records.count() === selected.length);
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index];
        const record = records.nth(index);
        const title = item.type === 'FOLLOW_UP' ? { PHONE: '电话跟进', VISIT: '拜访跟进' }[item.title] : item.title;
        const content = item.type === 'OPPORTUNITY' ? { QUALIFIED: '已确认' }[item.content] : item.content;
        const text = await record.textContent();
        check(label + '_row_' + index + '_title_type_owner', Boolean(title) && text.includes(title) && text.includes(types[item.type]) && text.includes(item.ownerName || '系统'));
        check(label + '_row_' + index + '_server_time', await record.locator('time').textContent() === item.eventTime);
        if (content) check(label + '_row_' + index + '_content', text.includes(content));
        if (item.status) {
          const labelText = expectedStatus[item.type]?.[item.status];
          check(label + '_row_' + index + '_status', Boolean(labelText) && await record.locator('div.font-medium > span').textContent() === labelText);
        }
      }
      check(label + '_no_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      return selected;
    };
    const openTimeline = async id => {
      await page.goto(origin + '/office/crm/customer/' + id, { waitUntil: 'networkidle' });
      const pending = responseFor(id);
      await page.getByRole('tab', { name: '经营时间线', exact: true }).click();
      return pending;
    };
    try {
      const initial = openTimeline(customerId);
      await inspect(initial, expected, 1, 'ui_' + viewport.width + '_all_1');
      await capture('all-1');
      for (let pageNum = 2; pageNum <= Math.ceil(expected.length / 20); pageNum++) {
        const pending = responseFor(customerId, '', pageNum);
        await section.getByRole('button', { name: '下一页', exact: true }).click();
        await inspect(pending, expected, pageNum, 'ui_' + viewport.width + '_all_' + pageNum);
        await capture('all-' + pageNum);
      }
      check('ui_' + viewport.width + '_last_page_disabled', await section.getByRole('button', { name: '下一页', exact: true }).isDisabled());
      for (const type of Object.keys(types)) {
        const entries = expected.filter(item => item.type === type);
        const pending = responseFor(customerId, type);
        await section.getByLabel('时间线类型', { exact: true }).selectOption(type);
        await inspect(pending, entries, 1, 'ui_' + viewport.width + '_' + type + '_1');
        check('ui_' + viewport.width + '_' + type + '_reset_first_page', await section.getByRole('button', { name: '上一页', exact: true }).isDisabled());
        await capture(type.toLowerCase() + '-1');
        for (let pageNum = 2; pageNum <= Math.ceil(entries.length / 20); pageNum++) {
          const next = responseFor(customerId, type, pageNum);
          await section.getByRole('button', { name: '下一页', exact: true }).click();
          await inspect(next, entries, pageNum, 'ui_' + viewport.width + '_' + type + '_' + pageNum);
          await capture(type.toLowerCase() + '-' + pageNum);
        }
      }
      const activityEntries = expected.filter(item => item.type === 'ACTIVITY');
      const detailFixtures = [activityEntries.find(item => item.status === 'IN_PROGRESS'), activityEntries.find(item => item.sourceId === invitedId)];
      for (const [index, fixture] of detailFixtures.entries()) {
        assert.ok(fixture);
        const reset = responseFor(customerId, 'ACTIVITY');
        if (index === 0) await section.getByLabel('时间线类型', { exact: true }).selectOption('ACTIVITY');
        else await section.getByRole('button', { name: '刷新', exact: true }).click();
        await inspect(reset, activityEntries, 1, 'ui_' + viewport.width + '_detail_reset_' + index);
        const wantedPage = Math.floor(activityEntries.findIndex(item => item.sourceId === fixture.sourceId) / 20) + 1;
        for (let pageNum = 2; pageNum <= wantedPage; pageNum++) {
          const pending = responseFor(customerId, 'ACTIVITY', pageNum);
          await section.getByRole('button', { name: '下一页', exact: true }).click();
          await inspect(pending, activityEntries, pageNum, 'ui_' + viewport.width + '_detail_page_' + index + '_' + pageNum);
        }
        const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/activity/' + fixture.sourceId);
        await section.getByRole('button', { name: fixture.title, exact: true }).click();
        const response = await pending;
        const detail = await response.json();
        check('ui_' + viewport.width + '_detail_' + index + '_source', response.status() === 200 && detail.code === 200 && detail.data.activity.activityId === fixture.sourceId);
        const dialog = page.getByRole('dialog', { name: fixture.title, exact: true });
        await dialog.waitFor();
        check('ui_' + viewport.width + '_detail_' + index + '_subject', await dialog.getByLabel('主题', { exact: true }).inputValue() === fixture.title);
        check('ui_' + viewport.width + '_detail_' + index + '_write_scope', await dialog.getByLabel('主题', { exact: true }).isEditable() === (index === 0));
        await capture(index === 0 ? 'own-detail' : 'invited-detail');
        await dialog.getByRole('button', { name: '关闭', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        if (wantedPage > 1) {
          const first = responseFor(customerId, 'ACTIVITY');
          await section.getByRole('button', { name: '上一页', exact: true }).click();
          await inspect(first, activityEntries, 1, 'ui_' + viewport.width + '_detail_return_first_' + index);
        }
      }
      const empty = openTimeline(emptyCustomerId);
      await inspect(empty, [], 1, 'ui_' + viewport.width + '_empty');
      await section.getByText('暂无客户经营记录', { exact: true }).waitFor();
      check('ui_' + viewport.width + '_empty_pagination_disabled', await section.getByRole('button', { name: '上一页', exact: true }).isDisabled() && await section.getByRole('button', { name: '下一页', exact: true }).isDisabled());
      await capture('empty');
    } finally {
      await page.close();
    }
  }
  return true;
}
