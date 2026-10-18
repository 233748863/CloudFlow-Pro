import { e4Ui } from './e4-profile-ui.mjs';

export async function verifyE4MasterPages(context, tree, scoring) {
  const { check, prove, sessions, ok, marker, readTerritory, territories, waitFor } = context;
  const { screenshot, action, fit, close } = e4Ui(context);
  const page = sessions.manager.page;
  await prove([6, 7], async () => {
    await page.goto(context.origin + '/office/crm/territory', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '销售区域', level: 2, exact: true }).waitFor();
    const source = page.getByRole('row').filter({ hasText: tree.chain[1].actual.territoryCode });
    const target = page.getByRole('row').filter({ hasText: tree.dragDestination.actual.territoryCode });
    await source.waitFor();
    await screenshot('e4-territory-desktop.png', page);
    page.once('dialog', dialog => dialog.accept());
    await action(page, '/crm/territory', 'POST', () => source.dragTo(target), 'actual_drag_and_drop_saves_moved_branch');
    const moved = await territories('manager', tree.dragDestination.id);
    check('browser_drag_rewrites_entire_branch_path', moved.length === 5 && tree.chain.slice(1).every((sample, index) => {
      const current = moved.find(value => String(value.territoryId) === sample.id);
      return current?.levelPath === '/' + tree.dragDestination.id + '/' + tree.chain.slice(1, index + 2).map(value => value.id).join('/') + '/';
    }));
    await screenshot('e4-territory-moved-desktop.png', page);
    const editable = page.getByRole('row').filter({ hasText: tree.destination.actual.territoryCode });
    await editable.getByRole('button', { name: '编辑 / 移动', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑区域', exact: true });
    const code = marker + '_' + 'A'.repeat(49 - marker.length), name = '区域'.repeat(60);
    check('territory_editor_uses_exact_server_name_and_code_limits', await dialog.getByLabel('名称', { exact: true }).getAttribute('maxlength') === '120'
      && await dialog.getByLabel('编码', { exact: true }).getAttribute('maxlength') === '50');
    await dialog.getByLabel('名称', { exact: true }).fill(name);
    await dialog.getByLabel('编码', { exact: true }).fill(code);
    await action(page, '/crm/territory', 'POST', () => dialog.getByRole('button', { name: '保存', exact: true }).click(), 'territory_boundary_values_save_from_actual_page');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('row').filter({ hasText: code }).getByRole('button', { name: '编辑 / 移动', exact: true }).click();
    check('territory_long_name_and_code_reopen_without_truncation', await dialog.getByLabel('名称', { exact: true }).inputValue() === name
      && await dialog.getByLabel('编码', { exact: true }).inputValue() === code);
    await screenshot('e4-territory-long-name-editor.png', page, dialog);
    await close(dialog);
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '销售区域', level: 2, exact: true }).waitFor();
    await page.getByRole('row').filter({ hasText: code }).waitFor();
    check('territory_mobile_refresh_keeps_saved_name_and_code', await page.getByRole('row').filter({ hasText: code }).getByText(name, { exact: true }).isVisible());
    await fit(page, 'territory_mobile_preserves_document_width');
    await screenshot('e4-territory-mobile.png', page);
    check('territory_saved_boundary_values_are_returned_by_server', (await readTerritory(tree.destination)).territoryName === name);
  });
  await prove(9, async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(context.origin + '/office/crm/lead-score', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '线索评分规则', level: 2, exact: true }).waitFor();
    const rule = scoring.rules[0];
    const row = page.getByRole('row').filter({ hasText: rule.actual.ruleName });
    await row.waitFor();
    await screenshot('e4-score-rules-desktop.png', page);
    await row.getByRole('button', { name: '编辑', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '评分规则', exact: true });
    check('score_rule_editor_reads_saved_operator_and_amount', await dialog.getByRole('combobox', { name: '评分字段' }).inputValue() === 'annual_revenue'
      && await dialog.getByRole('combobox', { name: '比较方式' }).inputValue() === '=' && await dialog.getByLabel('匹配值', { exact: true }).inputValue() === '120.01');
    const newName = marker + '_' + '评'.repeat(119 - marker.length);
    check('score_rule_name_limit_matches_server', await dialog.getByLabel('规则名称', { exact: true }).getAttribute('maxlength') === '120');
    await dialog.getByLabel('规则名称', { exact: true }).fill(newName);
    await action(page, '/crm/lead-score/rule', 'POST', () => dialog.getByRole('button', { name: '保存', exact: true }).click(), 'score_rule_page_actual_save_succeeds');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('row').filter({ hasText: newName }).getByRole('button', { name: '编辑', exact: true }).click();
    check('score_rule_reopens_all_120_name_characters', await dialog.getByLabel('规则名称', { exact: true }).inputValue() === newName);
    await screenshot('e4-score-rule-reopened.png', page, dialog);
    await close(dialog);
    await page.setViewportSize({ width: 390, height: 960 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '线索评分规则', level: 2, exact: true }).waitFor();
    await page.getByRole('row').filter({ hasText: newName }).waitFor();
    check('score_rule_mobile_refresh_keeps_saved_full_name', await page.getByRole('row').filter({ hasText: newName }).getByText(newName, { exact: true }).isVisible());
    await fit(page, 'score_rules_mobile_preserves_document_width');
    await screenshot('e4-score-rules-mobile.png', page);
    const saved = await waitFor(() => ok('manager', '/crm/lead-score/rules'), values => values.some(value => value.ruleName === newName), 'Saved rule name did not persist');
    check('page_rule_rename_preserves_scoring_semantics', saved.find(value => String(value.ruleId) === rule.id).score === rule.actual.score);
  });
}
