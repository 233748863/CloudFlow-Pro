import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyC2DesignerPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c2-designer-pages-${fixture.runId}`); await fs.mkdir(output);
  const page = sessions.admin.page, pageErrors = [], cases = [];
  let failure, stage = 'setup', formId, savedVersion, formSaves = 0;
  const onError = error => pageErrors.push({ name: error.name });
  const onRequest = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/workflow/wf/form/save') formSaves++; };
  const allowed = { TEXT: '单行文本', NUMBER: '数字', AMOUNT: '金额', DATE: '日期', SELECT: '下拉选项', DICT_SELECT: '字典选择', SWITCH: '开关', EMPLOYEE: '员工选择', DEPT: '部门选择', UPLOAD_FILE: '文件上传' };
  const excluded = ['多行文本','Markdown文本','日期时间','时间','日期范围','多选下拉','单选组','复选组','岗位选择','职位选择','用户多选','部门多选','图片上传','说明文字','分隔线','分组','网格','标签页','折叠面板','明细子表'];
  const name = marker + '-subtable-designer', tableLabel = '设计费用明细';
  const initial = [{ id: 'anchor', type: 'TEXT', label: '主表说明' }];
  const privateDefault = marker + '-private-column-default'; secrets.add(privateDefault);
  const dictionary = JSON.parse(database("SELECT JSON_OBJECT('type',dict_type,'name',dict_name) FROM sys_dict_type WHERE tenant_id=100000 AND status='0' ORDER BY dict_id LIMIT 1"));
  const properties = page.locator('aside').filter({ has: page.getByRole('heading', { name: '字段属性', exact: true }) });
  const palette = page.locator('aside').filter({ has: page.getByRole('heading', { name: '字段组件', exact: true }) });
  const id = (scope, value) => scope.locator('[id=' + JSON.stringify(value) + ']');
  const article = label => page.getByRole('button', { name: '拖动' + label, exact: true }).locator('xpath=ancestor::article[1]');
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const readDesigner = async () => {
    await page.getByRole('button', { name: '查看定义', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '表单字段定义', exact: true });
    const fields = JSON.parse(await dialog.getByRole('textbox').inputValue());
    await dialog.press('Escape'); await dialog.waitFor({ state: 'hidden' }); return fields;
  };
  const stored = version => JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=${version}`));
  const open = async () => {
    await page.goto(new URL('/forms', page.url()).href, { waitUntil: 'domcontentloaded' });
    await page.locator('label').filter({ hasText: '当前表单' }).getByRole('button').click();
    await page.getByRole('option').filter({ has: page.getByText(name, { exact: true }) }).click();
    await waitFor(() => page.getByRole('textbox', { name: '表单名称', exact: true }).inputValue(), value => value === name, 'Owned subtable designer not loaded');
  };
  const select = async label => {
    await article(label).locator(':scope > div').first().getByRole('button').filter({ hasText: label }).click();
    await waitFor(() => properties.getByLabel('字段名称', { exact: true }).inputValue(), value => value === label, 'Subtable properties did not load');
  };
  const drag = async (source, destination) => {
    await source.scrollIntoViewIfNeeded(); await destination.scrollIntoViewIfNeeded();
    const start = await source.boundingBox(), end = await destination.boundingBox(); assert.ok(start && end);
    for (const [locator, box] of [[source,start],[destination,end]]) {
      assert.ok(await locator.evaluate((node, point) => {
        const hit=document.elementFromPoint(point.x,point.y); return Boolean(hit && node.contains(hit));
      }, {x:box.x+box.width/2,y:box.y+box.height/2}), 'Actual drag source and target must both be reachable');
    }
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 30 }); await page.mouse.up();
  };
  const blocksSave = async label => {
    const before = formSaves; await page.getByRole('button', { name: '保存表单', exact: true }).click();
    await page.locator('.form-builder-shell').getByRole('alert').waitFor();
    check(label, formSaves === before && await page.getByRole('button', { name: '确认保存版本', exact: true }).count() === 0);
  };
  try {
    const form = success(await api('admin', '/workflow/wf/form/save', { method: 'POST', body: { formKey: name, formName: name, fieldsJson: JSON.stringify(initial) } }), 'c2_designer_initial_form_saved');
    formId = form.formId || form.id; fixture.forms.push(formId); saveFixture();
    const initialVersion = form.version;
    await page.setViewportSize({ width: 1600, height: 1100 }); page.on('pageerror', onError); page.on('request', onRequest);
    await open(); stage = 'add-subtable';
    await palette.getByPlaceholder('搜索字段', { exact: true }).fill('明细子表');
    await drag(palette.getByRole('button', { name: '拖拽添加明细子表', exact: true }), page.locator('.form-builder-shell main').getByRole('button', { name: '将字段拖到这里，添加到当前容器末尾', exact: true }));
    await properties.getByLabel('字段名称', { exact: true }).fill(tableLabel);
    const tableId = await properties.getByLabel('字段标识', { exact: true }).inputValue();
    check('c2_designer_pointer_adds_empty_subtable', (await readDesigner()).some(field => field.id === tableId && field.type === 'SUB_TABLE' && field.columns.length === 0));
    await palette.getByPlaceholder('搜索字段', { exact: true }).fill('');
    await blocksSave('c2_designer_empty_columns_block_before_request');
    stage = 'allowed-types';
    for (const [type, label] of Object.entries(allowed)) check('c2_designer_allows_' + type, await palette.getByRole('button', { name: label, exact: true }).isEnabled() && await palette.getByRole('button', { name: '拖拽添加' + label, exact: true }).isEnabled());
    for (const label of excluded) check('c2_designer_excludes_' + label, await palette.getByRole('button', { name: label, exact: true }).isDisabled() && await palette.getByRole('button', { name: '拖拽添加' + label, exact: true }).isDisabled());
    const columns = {};
    for (const [type, label] of Object.entries(allowed)) {
      stage = 'column-properties-' + type;
      await palette.getByRole('button', { name: label, exact: true }).click();
      const columnId = await properties.getByLabel('字段标识', { exact: true }).inputValue(); columns[type] = columnId;
      await properties.getByLabel('字段名称', { exact: true }).fill('设计' + type);
      await properties.getByLabel('列宽（像素）', { exact: true }).fill(type === 'TEXT' ? '120' : type === 'UPLOAD_FILE' ? '800' : '200');
      if (type === 'TEXT') {
        await properties.getByRole('switch', { name: '必填', exact: true }).click();
        await properties.getByRole('switch', { name: '只读', exact: true }).click();
        await id(properties, `default-${tableId}.${columnId}`).fill(privateDefault);
      } else if (type === 'NUMBER' || type === 'AMOUNT') {
        await properties.getByLabel('最小值', { exact: true }).fill('0'); await properties.getByLabel('最大值', { exact: true }).fill('100');
        await properties.getByLabel('小数位数（0—18）', { exact: true }).fill('2');
        await id(properties, `default-${tableId}.${columnId}`).fill(type === 'NUMBER' ? '0' : '0.10');
      } else if (type === 'SELECT') await properties.locator('label').filter({ has: page.getByText('选项（每行一个）', { exact: true }) }).locator('textarea').fill('餐费\n交通费');
      else if (type === 'DICT_SELECT') {
        await properties.getByRole('combobox', { name: '选择数据字典', exact: true }).click();
        await page.getByRole('option').filter({ has: page.getByText(dictionary.name, { exact: true }) }).click();
      } else if (type === 'SWITCH') await id(properties, `default-${tableId}.${columnId}`).click();
      else if (type === 'UPLOAD_FILE') {
        check('c2_designer_file_column_locks_single_attachment', await properties.getByLabel('最多文件数', { exact: true }).isDisabled() && await properties.getByLabel('最多文件数', { exact: true }).inputValue() === '1');
        await properties.getByLabel('允许格式', { exact: true }).fill('.pdf,.png');
        await properties.getByLabel('单个文件上限（MB）', { exact: true }).fill('12');
      }
    }
    let tree = await readDesigner(), table = tree.find(field => field.id === tableId);
    check('c2_designer_all_ten_columns_created_in_table', table.columns.length === 10 && new Set(table.columns.map(column => column.type)).size === 10 && tree.length === 2);
    check('c2_designer_column_properties_preserved', table.columns.find(column => column.type === 'TEXT').readonly === true && table.columns.find(column => column.type === 'TEXT').required === true
      && table.columns.find(column => column.type === 'TEXT').defaultValue === privateDefault && table.columns.find(column => column.type === 'TEXT').width === 120
      && table.columns.find(column => column.type === 'UPLOAD_FILE').width === 800 && table.columns.find(column => column.type === 'UPLOAD_FILE').maxSize === 12
      && table.columns.find(column => column.type === 'UPLOAD_FILE').accept === '.pdf,.png' && table.columns.find(column => column.type === 'DICT_SELECT').dictType === dictionary.type
      && isDeepStrictEqual(table.columns.find(column => column.type === 'SELECT').options, ['餐费','交通费']) && table.columns.find(column => column.type === 'SWITCH').defaultValue === true);
    stage = 'copy-delete-reorder';
    await page.getByRole('button', { name: '复制设计NUMBER', exact: true }).click(); await properties.getByLabel('字段名称', { exact: true }).fill('设计平均样本');
    columns.AVG = await properties.getByLabel('字段标识', { exact: true }).inputValue();
    await id(properties, `default-${tableId}.${columns.AVG}`).fill('');
    await page.getByRole('button', { name: '复制设计SELECT', exact: true }).click(); await properties.getByLabel('字段名称', { exact: true }).fill('待删除列');
    await page.getByRole('button', { name: '删除待删除列', exact: true }).click();
    tree = await readDesigner(); table = tree.find(field => field.id === tableId);
    check('c2_designer_copy_and_delete_column_preserve_unique_ids', table.columns.length === 11 && new Set(table.columns.map(column => column.id)).size === 11 && !table.columns.some(column => column.label === '待删除列')
      && table.columns.find(column => column.id === columns.AVG).precision === 2 && columns.AVG !== columns.NUMBER);
    const beforeOrder = table.columns;
    await drag(page.getByRole('button', { name: '拖动设计TEXT', exact: true }), page.getByRole('button', { name: '拖动设计NUMBER', exact: true }));
    tree = await readDesigner(); table = tree.find(field => field.id === tableId);
    check('c2_designer_pointer_reorders_columns_without_value_changes', isDeepStrictEqual(table.columns, [beforeOrder[1], beforeOrder[0], ...beforeOrder.slice(2)]));
    stage = 'table-properties'; await select(tableLabel);
    await properties.getByLabel('最少行数', { exact: true }).fill('2'); await properties.getByLabel('最多行数', { exact: true }).fill('501');
    await blocksSave('c2_designer_above_hard_row_limit_blocks_before_request');
    await properties.getByLabel('最多行数', { exact: true }).fill('5');
    await properties.getByLabel('空表提示', { exact: true }).fill('请新增费用明细');
    for (const [property, label] of [['allowAdd','允许新增'],['allowDelete','允许删除'],['allowSort','允许排序'],['allowCopyRow','允许复制']]) {
      await properties.getByRole('switch', { name: label, exact: true }).click();
      check('c2_designer_disables_' + property, (await readDesigner()).find(field => field.id === tableId)[property] === false);
      await properties.getByRole('switch', { name: label, exact: true }).click();
    }
    const summaries = [['设计AMOUNT','SUM'],['设计NUMBER','COUNT'],['设计平均样本','AVG']];
    const summaryControl = label => properties.locator('label').filter({ has: page.getByText(label, { exact: true }) }).locator('select');
    for (const [label, aggregation] of summaries) await summaryControl(label).selectOption(aggregation);
    check('c2_designer_summaries_only_offer_numeric_columns', await properties.locator('select').count() === 4 && await summaryControl('设计TEXT').count() === 0);
    const designed = await readDesigner(); table = designed.find(field => field.id === tableId);
    check('c2_designer_table_settings_preserved', table.minRows === 2 && table.maxRows === 5 && table.emptyText === '请新增费用明细'
      && ['allowAdd','allowDelete','allowSort','allowCopyRow'].every(property => table[property] === true)
      && isDeepStrictEqual(table.summaryColumns, [{ columnId: columns.AMOUNT, aggregation:'SUM' }, { columnId: columns.NUMBER, aggregation:'COUNT' }, { columnId: columns.AVG, aggregation:'AVG' }]));
    stage = 'save-reload';
    const saving = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/form/save').catch(() => null);
    await page.getByRole('button', { name: '保存表单', exact: true }).click(); await page.getByRole('button', { name: '确认保存版本', exact: true }).click();
    const response = await saving; assert.ok(response, 'Actual subtable designer save response required'); const body = await response.json(); savedVersion = body.data?.version;
    requests.push({ actor:'admin',path:'/workflow/wf/form/save',method:'POST',status:response.status(),traceId:response.headers()['x-trace-id'],observedAt:Date.now(),realPage:true,device:'desktop' });
    check('c2_designer_save_preserves_all_settings_and_original_version', response.status() === 200 && body.code === 200 && savedVersion === initialVersion + 1 && isDeepStrictEqual(stored(savedVersion), designed) && isDeepStrictEqual(stored(initialVersion), initial));
    await open(); check('c2_designer_reload_matches_saved_definition', isDeepStrictEqual(await readDesigner(), designed));
    await page.screenshot({ path:path.join(output,'desktop-saved.png') });
    stage = 'preview';
    const beforePreview = formSaves;
    await page.getByRole('button', { name:'预览',exact:true }).click();
    const preview = page.getByRole('dialog', { name:'表单预览',exact:true }); await preview.waitFor();
    const input = (index, column) => id(preview, `input-${tableId}[${index}].${column}`);
    const readonlyText = id(preview, `field-${tableId}[0].${columns.TEXT}`);
    await waitFor(() => readonlyText.textContent(), value => value?.includes(privateDefault), 'Preview readonly default did not finish loading');
    check('c2_designer_preview_uses_minimum_and_readonly_default', await preview.getByRole('button', {name:'拖动第2行排序',exact:true}).count() === 1
      && (await readonlyText.textContent()).includes(privateDefault) && await readonlyText.locator('input,textarea,[role="textbox"]').count() === 0);
    await preview.getByRole('button', { name:'新增明细',exact:true }).click();
    for (let index=0;index<3;index++) {
      await input(index,columns.AMOUNT).fill(['0.10','0.20','0.30'][index]);
      await input(index,columns.NUMBER).fill(['1','','0'][index]); await input(index,columns.AVG).fill(['0.1','0.2',''][index]);
    }
    for (const layout of ['桌面布局','手机布局']) {
      await preview.getByRole('button',{name:layout,exact:true}).click();
      for (const [label,total] of [['设计AMOUNT · 合计','0.60'],['设计NUMBER · 计数','2'],['设计平均样本 · 平均','0.15']]) {
        const summary = preview.locator('[data-subtable-footer]').getByText(label + ' ' + total,{exact:true});
        await summary.waitFor(); check('c2_designer_' + layout + '_' + total + '_summary', await summary.count()===1);
      }
    }
    await page.screenshot({path:path.join(output,'desktop-mobile-preview.png')});
    await preview.getByRole('button',{name:'返回设计',exact:true}).click();
    check('c2_designer_preview_never_writes_form_or_changes_definition', formSaves === beforePreview && isDeepStrictEqual(await readDesigner(),designed) && isDeepStrictEqual(stored(savedVersion),designed));
    stage = 'schema-boundaries';
    const invalid = [
      ['empty_columns', table => {table.columns=[];}],
      ['duplicate_columns', table => {table.columns.push(structuredClone(table.columns[0]));}],
      ['excluded_column', table => {table.columns[0].type='TEXTAREA';}],
      ['nested_subtable', table => {table.columns.push({id:'nested',type:'SUB_TABLE',label:'非法嵌套',columns:[{id:'text',type:'TEXT',label:'文字'}]});}],
      ['text_summary', table => {table.summaryColumns=[{columnId:columns.TEXT,aggregation:'SUM'}];}],
      ['invalid_aggregation', table => {table.summaryColumns[0].aggregation='MEDIAN';}],
      ['too_many_rows', table => {table.maxRows=501;}],
      ['multiple_files', table => {table.columns.find(column=>column.type==='UPLOAD_FILE').maxCount=2;}],
    ];
    for (const [label,change] of invalid) {
      const fields=structuredClone(designed); change(fields.find(field=>field.id===tableId)); const key=name+'-'+label;
      const result=await api('admin','/workflow/wf/form/save',{method:'POST',body:{formKey:key,formName:key,fieldsJson:JSON.stringify(fields)}});
      const passed=result.status===400 && result.body?.code==='INVALID_REQUEST' && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_key=${sqlText(key)}`)==='0';
      cases.push({scenario:label,status:result.status,passed}); check('c2_designer_server_rejects_'+label,passed);
    }
    check('c2_designer_invalid_definitions_preserve_existing_versions', isDeepStrictEqual(stored(initialVersion),initial) && isDeepStrictEqual(stored(savedVersion),designed)
      && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)}`)==='2');
    check('c2_designer_no_browser_errors',pageErrors.length===0);
  } catch(error) {
    failure=error;
    if(!page.isClosed()) await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>undefined);
  } finally {
    page.off('pageerror',onError); page.off('request',onRequest);
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,formId,savedVersion,allowedTypes:10,excludedTypes:20,cases,pageErrors,devices:['desktop'],mobileLayoutPreviewOnly:true,realPages:true,fabricatedResponses:0,forcedModelWrites:0,failure:failure?{name:failure.name,message:String(failure.message).split('\n')[0]}:undefined},null,2));
    console.log(`C2_DESIGNER_PAGES: allowed_types=10; excluded_types=20; rejected_definitions=${cases.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if(failure) throw failure;
}
