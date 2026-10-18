import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

// All writes originate from real page controls; service responses are never replaced.
export async function verifyC4VersionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture,
  secrets, requests, output, formId, name, taskId, values, readRows }) {
  const cases = [], pageErrors = [], removers = [], mobiles = [];
  let stage = 'historical-tasks', failure, activePage, rollback, recording = false, pageWriteAttempts = 0;
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 120)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const track = (page, actor, device) => {
    const error = value => pageErrors.push({ actor, device, name: value.name });
    const request = value => {
      if (value.method() === 'POST' && /^\/api\/workflow\/wf\/form\/(save|[^/]+\/rollback\/\d+)$/.test(new URL(value.url()).pathname)) pageWriteAttempts++;
    };
    const response = value => {
      const endpoint = new URL(value.url()).pathname;
      if (recording && value.request().method() === 'POST' && /^\/api\/workflow\/wf\/form\/(save|[^/]+\/rollback\/\d+)$/.test(endpoint))
        requests.push({ actor, device, path: endpoint.slice(4), method: 'POST', status: value.status(),
          traceId: value.headers()['x-trace-id'], observedAt: Date.now(), realPage: true });
    };
    page.on('pageerror', error); page.on('request', request); page.on('response', response);
    removers.push(() => { page.off('pageerror', error); page.off('request', request); page.off('response', response); });
  };
  const openForm = async (page, formName) => {
    await page.goto(new URL('/forms', page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.locator('label').filter({ hasText: '当前表单' }).getByRole('button').click();
    await page.getByRole('option').filter({ has: page.getByText(formName, { exact: true }) }).click();
    await waitFor(() => page.getByRole('textbox', { name: '表单名称', exact: true }).inputValue(), value => value === formName, 'Version form did not load');
  };
  const pagePost = async (page, endpoint, action, label) => {
    recording = true;
    const pending = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/workflow/wf' + endpoint).catch(() => undefined);
    try {
      await action(); const response = await pending;
      check(label + '_response', Boolean(response) && response.status() === 200);
      const body = await response.json(); check(label + '_success', body.code === 200); return body.data;
    } finally { recording = false; }
  };
  try {
    const mobile = await createB2MobileBrowser({ admin: sessions.employee.page, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
    mobiles.push(mobile);
    for (const device of ['desktop', 'mobile']) {
      const page = device === 'desktop' ? sessions.employee.page : mobile.page;
      activePage = page; track(page, 'employee', device);
      if (device === 'desktop') await page.setViewportSize({ width: 1440, height: 1040 });
      await page.goto(new URL('/workflow/task/' + taskId, page.url()).href, { waitUntil: 'domcontentloaded' });
      const task = page.getByRole('dialog', { name: '任务处理', exact: true }); await task.waitFor();
      const input = field => task.locator('[id=' + JSON.stringify('input-' + field) + ']');
      await input('note').waitFor();
      check('c4_pages_' + device + '_original_text_control', await input('note').evaluate(element => element.tagName === 'INPUT' && element.type === 'text')
        && await input('note').inputValue() === values.note && await input('note').isEditable());
      check('c4_pages_' + device + '_deleted_field_preserved', await input('obsolete').inputValue() === values.obsolete);
      check('c4_pages_' + device + '_old_layout_preserved', await input('inside').inputValue() === values.inside);
      for (let index = 0; index < values.items.length; index++) {
        for (const column of ['note', 'obsolete', 'amount'])
          check('c4_pages_' + device + '_old_row_' + index + '_' + column, await input('items[' + index + '].' + column).inputValue() === values.items[index][column]);
      }
      check('c4_pages_' + device + '_new_fields_absent', await task.locator('#field-extra').count() === 0
        && await task.locator('[id="field-items[0].tax"]').count() === 0);
      if (device === 'mobile') {
        await tapB2Mobile(input('note'));
        check('c4_pages_mobile_original_text_touch_focus', await input('note').evaluate(element => element === document.activeElement));
      }
      await page.screenshot({ path: path.join(output, device + '-historical-task.png') });
      cases.push({ label: 'historical-task', device, originalVersion: 1, latestVersion: 6, rows: 2 });
    }

    const page = sessions.admin.page; activePage = page; track(page, 'admin', 'desktop');
    await page.setViewportSize({ width: 1600, height: 1100 }); await openForm(page, name);
    stage = 'version-selector';
    const selector = page.getByRole('button', { name: '查看表单版本', exact: true });
    await waitFor(() => selector.textContent(), value => value.includes('v6'), 'Latest version selector missing');
    await selector.click(); await page.getByRole('option', { name: 'v1 · 只读', exact: true }).click();
    const preview = page.getByRole('region', { name: '历史表单只读预览', exact: true }); await preview.waitFor();
    await waitFor(() => preview.locator('[role="status"][aria-label="正在加载字段"]').count(), value => value === 0, 'Historical preview controls still loading');
    await waitFor(() => preview.locator('#field-note').textContent(), value => value.includes('原默认值'), 'Historical preview field did not finish loading');
    check('c4_pages_selector_previews_original_default', (await preview.locator('#field-note').textContent()).includes('原默认值')
      && await preview.locator('#field-obsolete').count() === 1 && await preview.locator('#field-extra').count() === 0);
    check('c4_pages_history_preview_is_readonly', await preview.locator('input,textarea,[role="combobox"]').count() === 0);
    await page.screenshot({ path: path.join(output, 'historical-readonly-preview.png') });
    await preview.getByRole('button', { name: '返回最新版编辑', exact: true }).click();
    check('c4_pages_return_to_latest_editor', await preview.count() === 0 && (await selector.textContent()).includes('v6'));

    stage = 'history-difference';
    await page.getByRole('button', { name: '版本历史', exact: true }).click();
    const history = page.getByRole('dialog', { name: '表单版本历史', exact: true }); await history.waitFor();
    const records = history.locator('article').filter({ has: page.getByRole('button', { name: /^查看 v/ }) });
    await waitFor(() => records.count(), value => value === 6, 'History records missing');
    check('c4_pages_history_six_records_and_creator', isDeepStrictEqual(await records.getByRole('button', { name: /^查看 v/ }).allTextContents(), [6, 5, 4, 3, 2, 1].map(value => '查看 v' + value))
      && (await records.allTextContents()).every(value => value.includes(sessions.admin.account.userId) && /\d{4}-\d{2}-\d{2}/.test(value)));
    check('c4_pages_latest_rollback_disabled', await history.getByRole('button', { name: '回滚 v6', exact: true }).isDisabled());
    const firstRecord = records.filter({ has: page.getByRole('button', { name: '查看 v1', exact: true }) });
    await firstRecord.getByRole('button', { name: '与最新版比较', exact: true }).click();
    const difference = history.getByRole('region', { name: '表单版本差异', exact: true }); await difference.waitFor();
    const expected = [['新增', 'extra', 'good'], ['新增', 'items.tax', 'good'], ['删除', 'obsolete', 'critical'], ['删除', 'items.obsolete', 'critical'],
      ['修改', 'note', 'warning'], ['修改', 'items.note', 'warning'], ['布局', 'layout', 'warning']];
    check('c4_pages_difference_has_seven_changes', await difference.locator('article').count() === expected.length);
    for (const [kind, field, token] of expected) {
      const article = difference.locator('article').filter({ has: page.locator('h4').filter({ hasText: new RegExp('^' + kind + '.*\\s' + field.replaceAll('.', '\\.') + '$') }) });
      check('c4_pages_difference_' + field + '_label_and_semantic_color', await article.count() === 1 && await article.evaluate((element, key) => {
        const label = element.querySelector('h4 > span'), expectedColor = 'var(--cf-chart-' + key + ')';
        return element.style.borderLeftColor === expectedColor && label.style.color === expectedColor
          && getComputedStyle(element).borderLeftColor === getComputedStyle(label).color;
      }, token));
    }
    const changedText = difference.locator('article').filter({ has: page.locator('h4').filter({ hasText: /^修改.*\snote$/ }) });
    check('c4_pages_difference_before_after_type', (await changedText.textContent()).includes('TEXT') && (await changedText.textContent()).includes('SELECT'));
    await page.screenshot({ path: path.join(output, 'version-difference.png') });
    await history.getByLabel('变更前版本', { exact: true }).fill('1'); await history.getByLabel('变更后版本', { exact: true }).fill('1');
    await history.getByRole('button', { name: '比较版本', exact: true }).focus();
    await history.getByRole('button', { name: '比较版本', exact: true }).press('Enter');
    await difference.getByText('两个版本的字段和布局相同', { exact: true }).waitFor();
    check('c4_pages_same_version_difference_empty', await difference.locator('article').count() === 0);
    cases.push({ label: 'history-and-difference', records: 6, changes: expected.length, sameVersionCompared: true });

    stage = 'rollback-confirmation';
    const before = readRows(), requestCount = pageWriteAttempts;
    await history.getByRole('button', { name: '回滚 v1', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '确认回滚至 v1', exact: true }); await confirm.waitFor();
    await confirm.getByRole('button', { name: '取消回滚', exact: true }).click(); await confirm.waitFor({ state: 'hidden' });
    check('c4_pages_rollback_cancel_preserves_rows', isDeepStrictEqual(readRows(), before) && pageWriteAttempts === requestCount);
    await history.getByRole('button', { name: '回滚 v1', exact: true }).click(); await confirm.waitFor();
    await confirm.getByLabel('回滚说明', { exact: true }).fill('页面核对后还原原表单');
    rollback = await pagePost(page, '/form/' + formId + '/rollback/1', () => confirm.getByRole('button', { name: '确认并创建新版本', exact: true }).click(), 'c4_pages_confirmed_rollback');
    await confirm.waitFor({ state: 'hidden' });
    await waitFor(() => records.count(), value => value === 7, 'Rollback history did not refresh');
    check('c4_pages_rollback_refreshes_history', (await records.first().textContent()).includes('v7') && (await records.first().textContent()).includes('回滚自v1')
      && (await records.first().textContent()).includes('页面核对后还原原表单'));
    await history.press('Escape'); await history.waitFor({ state: 'hidden' });
    check('c4_pages_rollback_refreshes_selector', (await selector.textContent()).includes('v7'));
    await openForm(page, name); check('c4_pages_rollback_survives_reload', (await selector.textContent()).includes('v7'));
    cases.push({ label: 'rollback', cancelPreserved: true, version: rollback.version, source: rollback.rollbackFromVersion });

    stage = 'save-change-log';
    const saveName = name + '-save-dialog', original = [{ id: 'note', type: 'TEXT', label: '保存说明测试' }];
    const form = success(await api('admin', '/workflow/wf/form/save', { method: 'POST', body: { formKey: saveName, formName: saveName, fieldsJson: JSON.stringify(original) } }), 'c4_pages_save_dialog_fixture');
    fixture.forms.push(form.formId); saveFixture(); await openForm(page, saveName);
    const field = page.getByRole('button', { name: '拖动保存说明测试', exact: true }).locator('xpath=ancestor::article[1]');
    await field.locator(':scope > div').first().getByRole('button').filter({ hasText: '保存说明测试' }).click();
    const properties = page.locator('aside').filter({ has: page.getByRole('heading', { name: '字段属性', exact: true }) });
    await properties.getByLabel('字段名称', { exact: true }).fill('修改后的说明字段');
    const rows = () => database('SELECT JSON_OBJECT(\'version\',version,\'fields\',fields_json,\'changeLog\',change_log) FROM wf_form_definition WHERE tenant_id=100000 AND form_id=' + sqlText(form.formId) + ' ORDER BY version').split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const saveBefore = rows(), saveRequestsBefore = pageWriteAttempts;
    await page.getByRole('button', { name: '保存表单', exact: true }).click();
    const saveDialog = page.getByRole('dialog', { name: '保存表单版本', exact: true }); await saveDialog.waitFor();
    check('c4_pages_change_log_dialog_limit', await saveDialog.getByLabel('本次变更说明', { exact: true }).getAttribute('maxlength') === '500');
    await saveDialog.getByRole('button', { name: '继续编辑', exact: true }).click();
    check('c4_pages_save_cancel_keeps_version', isDeepStrictEqual(rows(), saveBefore) && pageWriteAttempts === saveRequestsBefore);
    await page.getByRole('button', { name: '保存表单', exact: true }).click();
    await saveDialog.getByLabel('本次变更说明', { exact: true }).fill('经管理员核对后修改字段名称');
    const saved = await pagePost(page, '/form/save', () => saveDialog.getByRole('button', { name: '确认保存版本', exact: true }).click(), 'c4_pages_save_dialog_confirm');
    const retained = rows();
    check('c4_pages_change_log_persisted_and_original_kept', saved.version === 2 && saved.changeLog === '经管理员核对后修改字段名称'
      && retained.length === 2 && isDeepStrictEqual(retained[0], saveBefore[0]) && retained[1].changeLog === saved.changeLog);
    await saveDialog.waitFor({ state: 'hidden' }); await openForm(page, saveName);
    await page.getByRole('button', { name: '版本历史', exact: true }).click(); await history.waitFor();
    await history.getByText('经管理员核对后修改字段名称', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'saved-change-log.png') });
    cases.push({ label: 'save-change-log', cancelPreserved: true, version: saved.version });
    check('c4_pages_no_browser_exceptions', pageErrors.length === 0); stage = 'complete';
  } catch (error) {
    failure = error; let message = String(error.message).split('\n')[0];
    for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
    await fs.writeFile(path.join(output, 'pages-failure-stage.json'), JSON.stringify({ stage, name: error.name, message }));
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'pages-failure.png') }).catch(() => undefined);
  } finally {
    removers.forEach(remove => remove()); for (const mobile of mobiles) await mobile.close();
    await fs.writeFile(path.join(output, 'pages-result.json'), JSON.stringify({ passed: !failure, stage, cases, pageErrors, realPages: true, fabricatedResponses: 0 }, null, 2));
    console.log('C4_VERSION_PAGES: cases=' + cases.length + '; browser_errors=' + pageErrors.length + '; passed=' + !failure);
  }
  if (failure) throw new Error('C4 version pages failed; see safe pages-failure-stage.json');
  return rollback;
}
