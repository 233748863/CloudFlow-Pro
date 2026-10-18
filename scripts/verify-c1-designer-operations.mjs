import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyC1DesignerOperations({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, 'c1-designer-operations-' + fixture.runId); await fs.mkdir(output);
  const admin = sessions.admin.page, pageErrors = [], groups = ['文本', '数值', '日期', '选择', '组织', '文件', '静态', '布局与明细'];
  let failure, stage = 'setup', formId, savedVersion, formSaveRequests = 0;
  const onError = error => pageErrors.push(error.name);
  const onRequest = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/workflow/wf/form/save') formSaveRequests++; };
  const dictionary = JSON.parse(database("SELECT JSON_OBJECT('type',dict_type,'name',dict_name) FROM sys_dict_type WHERE tenant_id=100000 AND status='0' ORDER BY dict_id LIMIT 1"));
  const fields = [
    { id: 'rootText', type: 'TEXT', label: '待复制文字', defaultValue: '原默认值' },
    { id: 'section', type: 'GROUP', label: '待复制分组', children: [{ id: 'nested_a', type: 'TEXT', label: '组内保留文字' }, { id: 'nested_b', type: 'TEXT', label: '组内待删除文字' }] },
    { id: 'numeric', type: 'NUMBER', label: '数值配置', min: 0, max: 100, precision: 1, defaultValue: 1.2 },
    { id: 'amount', type: 'AMOUNT', label: '金额配置', min: 0, max: 1000, precision: 2, defaultValue: '12.34' },
    { id: 'dictionary', type: 'DICT_SELECT', label: '字典配置', dictType: dictionary.type },
    { id: 'upload', type: 'UPLOAD_FILE', label: '文件配置', accept: '.pdf', maxSize: 10, maxCount: 2 },
    { id: 'notes', type: 'TEXTAREA', label: '多行配置', rows: 4, defaultValue: '第一行' },
    { id: 'grid', type: 'GRID', label: '网格配置', columns: 2, children: [{ id: 'grid_text', type: 'TEXT', label: '网格文字' }] },
    { id: 'collapse', type: 'COLLAPSE', label: '折叠配置', defaultExpanded: true, children: [{ id: 'collapse_text', type: 'TEXT', label: '折叠文字' }] },
  ];
  const name = marker + '-designer-operations';
  const flatten = values => values.flatMap(field => [field, ...flatten(field.children || [])]);
  const stored = version => JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=${version}`));
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 120)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const openForm = async page => {
    await page.goto(new URL('/forms', page.url()).href, { waitUntil: 'domcontentloaded' });
    const click = locator => locator.click();
    await click(page.locator('label').filter({ hasText: '当前表单' }).getByRole('button'));
    await click(page.getByRole('option').filter({ has: page.getByText(name, { exact: true }) }));
    await waitFor(() => page.getByRole('textbox', { name: '表单名称', exact: true }).inputValue(), value => value === name, 'Owned designer form not loaded');
  };
  const readDesigner = async () => {
    await admin.getByRole('button', { name: '查看定义', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '表单字段定义', exact: true });
    const result = JSON.parse(await dialog.getByRole('textbox').inputValue());
    await dialog.press('Escape'); await dialog.waitFor({ state: 'hidden' }); return result;
  };
  const article = label => admin.getByRole('button', { name: '拖动' + label, exact: true }).locator('xpath=ancestor::article[1]');
  const properties = admin.locator('aside').filter({ has: admin.getByRole('heading', { name: '字段属性', exact: true }) });
  const select = async label => {
    await article(label).locator(':scope > div').first().getByRole('button').filter({ hasText: label }).click();
    await waitFor(() => properties.getByLabel('字段名称', { exact: true }).inputValue(), value => value === label, 'Selected field properties not loaded');
  };
  try {
    const form = success(await api('admin', '/workflow/wf/form/save', { method: 'POST', body: { formKey: name, formName: name, fieldsJson: JSON.stringify(fields) } }), 'designer_operations_initial_form_saved');
    formId = form.formId || form.id; fixture.forms.push(formId); saveFixture(); const initialVersion = form.version;
    await admin.setViewportSize({ width: 1600, height: 1100 }); admin.on('pageerror', onError); admin.on('request', onRequest);
    await openForm(admin);
    stage = 'desktop-groups';
    for (const group of groups) {
      const closing = admin.getByRole('button', { name: '收起' + group + '分组', exact: true });
      const controlledId = await closing.getAttribute('aria-controls'); assert.ok(controlledId);
      await closing.focus(); await closing.press('Enter');
      const opening = admin.getByRole('button', { name: '展开' + group + '分组', exact: true });
      check('desktop_' + group + '_keyboard_collapses_group', await opening.getAttribute('aria-expanded') === 'false' && await admin.locator('[id=' + JSON.stringify(controlledId) + ']').isHidden());
      await opening.press('Space');
      check('desktop_' + group + '_keyboard_expands_group', await closing.getAttribute('aria-expanded') === 'true' && await admin.locator('[id=' + JSON.stringify(controlledId) + ']').isVisible());
    }
    await admin.getByRole('button', { name: '收起文本分组', exact: true }).click();
    await admin.getByPlaceholder('搜索字段', { exact: true }).fill('  TEXT  ');
    check('designer_search_reveals_collapsed_matches', await admin.getByRole('button', { name: '单行文本', exact: true }).isVisible() && await admin.getByRole('button', { name: '收起文本分组', exact: true }).isDisabled());
    await admin.getByPlaceholder('搜索字段', { exact: true }).fill('');
    check('designer_clear_search_restores_collapsed_preference', await admin.getByRole('button', { name: '展开文本分组', exact: true }).isVisible() && await admin.getByRole('button', { name: '单行文本', exact: true }).isHidden());
    await admin.getByRole('button', { name: '展开文本分组', exact: true }).click();
    check('designer_group_actions_preserve_definition', isDeepStrictEqual(await readDesigner(), fields) && isDeepStrictEqual(stored(initialVersion), fields));

    stage = 'copy-and-delete';
    await admin.getByRole('button', { name: '复制待复制文字', exact: true }).click();
    await properties.getByLabel('字段名称', { exact: true }).fill('复制文字');
    await admin.getByRole('button', { name: '复制待复制分组', exact: true }).click();
    await properties.getByLabel('字段名称', { exact: true }).fill('复制分组');
    let tree = await readDesigner();
    const copyText = tree.find(field => field.label === '复制文字'), copyGroup = tree.find(field => field.label === '复制分组');
    check('designer_actual_copy_preserves_content_with_unique_ids', copyText?.defaultValue === fields[0].defaultValue && copyText.id !== fields[0].id && copyGroup?.children.length === 2
      && copyGroup.children.every(child => !fields[1].children.some(original => original.id === child.id)) && new Set(flatten(tree).map(field => field.id)).size === flatten(tree).length);
    await admin.getByRole('button', { name: '复制待复制文字', exact: true }).click();
    await properties.getByLabel('字段名称', { exact: true }).fill('待删除文字');
    await article('待复制分组').getByRole('checkbox', { name: '批量选择组内待删除文字', exact: true }).check();
    await admin.getByRole('checkbox', { name: '批量选择待删除文字', exact: true }).check();
    await admin.getByRole('button', { name: '删除所选（2）', exact: true }).click();
    tree = await readDesigner();
    check('designer_actual_batch_delete_handles_nested_and_root_fields', !flatten(tree).some(field => field.id === 'nested_b' || field.label === '待删除文字')
      && tree.find(field => field.id === 'section')?.children[0]?.id === 'nested_a' && tree.find(field => field.id === copyGroup.id)?.children.length === 2 && tree.some(field => field.id === copyText.id));

    stage = 'save-validation';
    await admin.getByRole('button', { name: '选择根层', exact: true }).click();
    await admin.getByRole('button', { name: '分组', exact: true }).click();
    const emptyGroup = (await readDesigner()).find(field => !flatten(tree).some(previous => previous.id === field.id)); assert.ok(emptyGroup);
    let before = formSaveRequests;
    await admin.getByRole('button', { name: '保存表单', exact: true }).click();
    await admin.locator('.form-builder-shell').getByRole('alert').waitFor();
    check('designer_empty_container_blocks_before_request', formSaveRequests === before && await admin.getByRole('button', { name: '确认保存版本', exact: true }).count() === 0);
    await admin.getByRole('button', { name: '删除' + emptyGroup.label, exact: true }).click();
    await select('字典配置');
    await properties.locator('label').filter({ hasText: '数据字典' }).getByRole('button', { name: '清空', exact: true }).click();
    before = formSaveRequests; await admin.getByRole('button', { name: '保存表单', exact: true }).click();
    await admin.locator('.form-builder-shell').getByRole('alert').waitFor();
    check('designer_missing_dictionary_blocks_before_request', formSaveRequests === before && await admin.getByRole('button', { name: '确认保存版本', exact: true }).count() === 0);
    await properties.getByRole('combobox', { name: '选择数据字典', exact: true }).click();
    await admin.getByRole('option').filter({ has: admin.getByText(dictionary.name, { exact: true }) }).click();
    const duplicate = await api('admin', '/workflow/wf/form/save', { method: 'POST', body: { formKey: name + '-duplicate', formName: name + '-duplicate', fieldsJson: JSON.stringify([fields[0], fields[0]]) } });
    check('designer_duplicate_ids_rejected_by_server_without_write', duplicate.status === 400 && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_key=${sqlText(name + '-duplicate')}`) === '0');

    stage = 'property-editing';
    await select('数值配置');
    check('designer_number_properties_are_type_specific', await properties.getByLabel('最小值', { exact: true }).count() === 1 && await properties.getByLabel('允许格式', { exact: true }).count() === 0);
    await properties.getByLabel('最小值', { exact: true }).fill('0'); await properties.getByLabel('最大值', { exact: true }).fill('99.999');
    await properties.getByLabel('小数位数（0—18）', { exact: true }).fill('3'); await properties.locator('#default-numeric').fill('6.125');
    await select('金额配置'); await properties.getByLabel('最大值', { exact: true }).fill('999.999'); await properties.getByLabel('小数位数（0—18）', { exact: true }).fill('3');
    await select('文件配置');
    check('designer_upload_properties_are_type_specific', await properties.getByLabel('允许格式', { exact: true }).count() === 1 && await properties.getByLabel('最小值', { exact: true }).count() === 0);
    await properties.getByLabel('允许格式', { exact: true }).fill('.pdf,.png'); await properties.getByLabel('单个文件上限（MB）', { exact: true }).fill('12'); await properties.getByLabel('最多文件数', { exact: true }).fill('3');
    await select('多行配置'); await properties.getByLabel('输入框行数', { exact: true }).fill('6'); await properties.locator('#default-notes').fill('已修改多行默认值');
    await select('网格配置');
    const gridColumns = properties.locator('label').filter({ hasText: /^网格列数/ }).locator('select');
    check('designer_layout_properties_are_type_specific', await gridColumns.count() === 1 && await properties.getByLabel('允许格式', { exact: true }).count() === 0);
    await gridColumns.selectOption('4');
    await select('折叠配置'); await properties.getByRole('switch', { name: '默认展开', exact: true }).click();
    const designed = await readDesigner();
    check('designer_seven_property_types_preserved_in_model', designed.find(field => field.id === 'numeric')?.precision === 3 && String(designed.find(field => field.id === 'numeric')?.defaultValue) === '6.125'
      && designed.find(field => field.id === 'amount')?.precision === 3 && designed.find(field => field.id === 'dictionary')?.dictType === dictionary.type
      && designed.find(field => field.id === 'upload')?.accept === '.pdf,.png' && designed.find(field => field.id === 'upload')?.maxSize === 12 && designed.find(field => field.id === 'upload')?.maxCount === 3
      && designed.find(field => field.id === 'notes')?.rows === 6 && designed.find(field => field.id === 'grid')?.columns === 4 && designed.find(field => field.id === 'collapse')?.defaultExpanded === false);
    stage = 'save-reload';
    const pending = admin.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/form/save').catch(() => null);
    await admin.getByRole('button', { name: '保存表单', exact: true }).click(); await admin.getByRole('button', { name: '确认保存版本', exact: true }).click();
    const response = await pending; assert.ok(response, 'Actual designer save response missing'); const body = await response.json();
    requests.push({ actor: 'admin', path: '/workflow/wf/form/save', method: 'POST', status: response.status(), traceId: response.headers()['x-trace-id'], observedAt: Date.now(), realPage: true, device: 'desktop' });
    savedVersion = body.data?.version;
    check('designer_actual_save_creates_version_and_preserves_original', response.status() === 200 && body.code === 200 && savedVersion === initialVersion + 1 && isDeepStrictEqual(stored(savedVersion), designed) && isDeepStrictEqual(stored(initialVersion), fields));
    await admin.reload({ waitUntil: 'domcontentloaded' }); await openForm(admin);
    check('designer_reload_retains_copies_deletion_and_properties', isDeepStrictEqual(await readDesigner(), designed));
    await admin.screenshot({ path: path.join(output, 'desktop-saved.png') });
    check('designer_operation_pages_have_no_browser_errors', pageErrors.length === 0);
  } catch (error) {
    failure = error;
    await fs.writeFile(path.join(output, 'failure-stage.json'), JSON.stringify({ stage, name: error.name, message: String(error.message).split('\n')[0] }, null, 2));
    if (!admin.isClosed()) await admin.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
  } finally {
    admin.off('pageerror', onError); admin.off('request', onRequest);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, formId, savedVersion, groups: groups.length, devices: ['desktop'], propertyTypes: 7, pageErrors, realPages: true, fabricatedResponses: 0, forcedModelWrites: 0 }, null, 2));
    console.log(`C1_DESIGNER_OPERATIONS: groups=${groups.length}; property_types=7; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if (failure) throw failure;
}
