import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Real editor controls, saves and reloads; no request interception or external callback execution.
export async function verifyB2DesignerUi({ admin, api, successful, database, check, caseTag, evidence }) {
  const marker = 'B2DU' + caseTag, base = '/workflow/wf';
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (url, body) => api(admin, url, { method: 'POST', body });
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b2-designer-' + caseTag);
  const definitions = [], errors = [];
  const onError = error => errors.push(error.name);
  const people = ['g_import_admin', 'g_holiday_employee', 'g_holiday_manager'].map(name => {
    const person = rows("SELECT JSON_OBJECT('id',CAST(user_id AS CHAR),'name',nick_name) FROM sys_user WHERE tenant_id=100000 AND deleted=0 AND status='0' AND user_name=" + sql(name) + ';')[0];
    assert.ok(person?.id && person.name); return person;
  });
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const beforeGrants = grants();
  const panel = () => admin.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
  const openNode = async () => {
    await admin.locator('[data-node-id="subject"]').waitFor({ timeout: 60000 });
    await admin.locator('[data-node-id="subject"]').click();
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).waitFor();
  };
  const choose = async (label, option) => {
    await panel().getByRole('button', { name: label, exact: true }).click();
    await admin.getByRole('option', { name: option, exact: true }).click();
  };
  const fill = async (label, value) => {
    const control = panel().getByLabel(label, { exact: true });
    await control.fill(String(value)); await control.press('Tab');
  };
  let formId, failure, saves = 0;
  const begin = async (name, node) => {
    const model = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'subject', title: name, ...node }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ id: 'start-subject', source: 'start', target: 'subject' }, { id: 'subject-end', source: 'subject', target: 'end' }] };
    const saved = successful(await post(base + '/definition/save', { processKey: marker + '-' + name, processName: marker + '-' + name, formId,
      modelJson: JSON.stringify(model), startPermissionType: 'ALL', startPermissionValue: '[]' }), '建立自有设计器初始流程');
    const id = saved.definitionId ?? saved.id; assert.ok(id); definitions.push(id);
    await admin.goto(new URL('/workflow/design?id=' + id, admin.url()).href, { waitUntil: 'domcontentloaded' });
    await openNode(); return id;
  };
  const stored = id => JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';')).nodes.find(node => node.id === 'subject');
  const save = async (id, label, accepts) => {
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).click();
    const responsePromise = admin.waitForResponse(response => response.url().includes('/wf/definition/save') && response.request().method() === 'POST', { timeout: 60000 });
    await admin.locator('.workflow-studio-toolbar').getByRole('button', { name: '保存', exact: true }).click();
    const response = await responsePromise, body = await response.json();
    assert.equal(response.status(), 200); assert.equal(body.code, 200); saves++;
    check(label + '通过真实编辑器保存落库', accepts(stored(id)));
    await admin.reload({ waitUntil: 'domcontentloaded' }); await openNode();
    check(label + '重新加载后数据库配置保持', accepts(stored(id)));
    await admin.screenshot({ path: path.join(directory, String(saves).padStart(2, '0') + '-' + label + '.png'), fullPage: true });
  };
  const sameNumber = (value, expected) => Number(value) === expected;
  admin.on('pageerror', onError);
  try {
    await fs.mkdir(directory, { recursive: true });
    await admin.setViewportSize({ width: 1440, height: 1040 });
    const form = successful(await post(base + '/form/save', { formKey: marker, formName: marker,
      fieldsJson: JSON.stringify([{ id: 'amount', type: 'NUMBER', label: '金额' }, { id: 'plannedTime', type: 'TEXT', label: '计划时刻' }]) }), '建立设计器验证表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const timer = await begin('timer', { type: 'TIMER', props: { timerType: 'DELAY', delayValue: 1, delayUnit: 'HOUR', timerAction: 'AUTO_PASS' } });
    await panel().getByText(/正常扫描间隔为 3 分钟，到期触发误差不超过 3 分钟/).waitFor();
    check('真实定时面板展示三分钟精度及人工结束说明', await panel().getByText(/管理员可填写原因提前结束等待/).isVisible());
    const units = [['MINUTE', '分钟', 2, 'AUTO_PASS', '自动通过并继续'], ['HOUR', '小时', 1, 'AUTO_REJECT', '按驳回策略退回'],
      ['DAY', '自然日', 3, 'NOTIFY_ONLY', '仅通知，继续等待人工结束'], ['WORKDAY', '工作日', 8, 'AUTO_PASS', '自动通过并继续']];
    for (const [unit, label, amount, action, actionLabel] of units) {
      await choose('延迟单位', label); await fill('延迟数量', amount); await choose('到期动作', actionLabel);
      await save(timer, 'timer-' + unit, node => node.props.timerType === 'DELAY' && node.props.delayUnit === unit
        && sameNumber(node.props.delayValue, amount) && node.props.timerAction === action);
      check(unit + '定时控件回显', await panel().getByLabel('延迟数量', { exact: true }).inputValue() === String(amount)
        && (await panel().getByRole('button', { name: '延迟单位', exact: true }).innerText()).includes(label));
    }
    const calendar = rows("SELECT JSON_OBJECT('id',CAST(calendar_id AS CHAR),'name',calendar_name) FROM sys_holiday_calendar WHERE tenant_id=100000 AND deleted=0 AND status='ENABLED' ORDER BY calendar_id LIMIT 1;")[0];
    assert.ok(calendar?.id && calendar.name);
    await choose('工作日日历', calendar.name);
    await save(timer, 'timer-calendar', node => String(node.props.calendarId) === calendar.id);
    check('显式工作日日历重新加载后回显', (await panel().getByRole('button', { name: '工作日日历', exact: true }).innerText()).includes(calendar.name));
    await choose('工作日日历', '按发起员工自动匹配');
    await save(timer, 'timer-auto-calendar', node => node.props.calendarId == null);
    await choose('定时类型', '等待指定时刻');
    await panel().getByRole('checkbox', { name: '使用流程时间变量', exact: true }).check();
    await fill('固定时间变量', '${plannedTime}');
    await save(timer, 'timer-fixed-variable', node => node.props.timerType === 'FIXED_TIME' && node.props.fixedTime === '${plannedTime}');
    check('固定时间变量重新加载后回显', await panel().getByLabel('固定时间变量', { exact: true }).inputValue() === '${plannedTime}');
    await panel().getByRole('checkbox', { name: '使用流程时间变量', exact: true }).uncheck();
    await panel().locator('.cf-date-trigger').click();
    await admin.getByRole('button', { name: '明天', exact: true }).click();
    await admin.getByRole('button', { name: '确定', exact: true }).click();
    const picked = await panel().locator('.cf-date-picker input[type="hidden"]').inputValue();
    assert.match(picked, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    const tomorrow = new Date(Date.now() + (24 + 8) * 3600000).toISOString().slice(0, 10);
    assert.equal(picked.slice(0, 10), tomorrow);
    await save(timer, 'timer-fixed-picker', node => node.props.fixedTime === picked);
    check('具体固定时刻重新加载后回显', await panel().locator('.cf-date-picker input[type="hidden"]').inputValue() === picked);
    await choose('定时类型', '时间表达式的下次时刻'); await fill('定时时间表达式', '0 0 9 * * MON-FRI');
    await save(timer, 'timer-cron', node => node.props.timerType === 'CRON_ONCE' && node.props.cronExpression === '0 0 9 * * MON-FRI');
    check('单次时间表达式重新加载后回显', await panel().getByLabel('定时时间表达式', { exact: true }).inputValue() === '0 0 9 * * MON-FRI');
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).click();

    const trigger = await begin('trigger', { type: 'SCRIPT', props: { triggerType: 'HTTP_CALLBACK', scriptType: 'API', actionUrl: 'https://example.com/unused',
      actionMethod: 'POST', callAsync: true, failStrategy: 'BLOCK', retryCount: 0, timeoutSeconds: 10 } });
    check('触发面板明确展示空白名单私网和重定向限制', await panel().getByText(/空白名单拒绝全部请求/).isVisible()
      && await panel().getByText(/内网地址需明确登记/).isVisible() && await panel().getByText(/不会跟随重定向/).isVisible());
    await fill('触发请求地址', 'https://example.com/b2/' + caseTag); await choose('请求方法', 'POST');
    await fill('触发请求头', JSON.stringify({ 'Content-Type': 'application/json', Accept: 'application/json' }));
    await fill('触发请求体', JSON.stringify({ note: marker })); await fill('允许引用的变量名', 'amount');
    await panel().getByLabel('插入的变量名', { exact: true }).fill('amount');
    await panel().getByRole('button', { name: '插入字段', exact: true }).click();
    await panel().getByRole('checkbox', { name: '异步调用（后台执行，完成后继续流程）', exact: true }).uncheck();
    await fill('触发重试次数', 2); await fill('触发超时秒数', 11); await choose('最终失败时', '记录失败后继续');
    await save(trigger, 'trigger-http', node => node.props.triggerType === 'HTTP_CALLBACK' && node.props.actionUrl === 'https://example.com/b2/' + caseTag
      && node.props.actionMethod === 'POST' && JSON.parse(node.props.actionBody).amount === '${amount}' && node.props.allowedVariables.includes('amount')
      && node.props.callAsync === false && sameNumber(node.props.retryCount, 2) && sameNumber(node.props.timeoutSeconds, 11) && node.props.failStrategy === 'SKIP');
    const headers = JSON.parse(await panel().getByLabel('触发请求头', { exact: true }).inputValue());
    check('触发请求头正文同步重试与超时真实回显', headers['Content-Type'] === 'application/json' && headers.Accept === 'application/json'
      && JSON.parse(await panel().getByLabel('触发请求体', { exact: true }).inputValue()).amount === '${amount}'
      && await panel().getByLabel('触发重试次数', { exact: true }).inputValue() === '2'
      && await panel().getByLabel('触发超时秒数', { exact: true }).inputValue() === '11'
      && !(await panel().getByRole('checkbox', { name: '异步调用（后台执行，完成后继续流程）', exact: true }).isChecked()));
    await choose('执行方式', '调用已登记的内部服务'); await choose('请求方法', 'GET'); await choose('最终失败时', '进入死信队列后继续');
    await panel().getByRole('checkbox', { name: '异步调用（后台执行，完成后继续流程）', exact: true }).check();
    await save(trigger, 'trigger-inner', node => node.props.triggerType === 'INNER_SERVICE' && node.props.actionMethod === 'GET'
      && node.props.callAsync === true && node.props.failStrategy === 'TO_DLQ');
    await choose('执行方式', '发送系统消息');
    await fill('触发请求体', JSON.stringify({ recipientIds: [people[1].id], title: marker, content: marker }));
    await fill('触发消息标题', marker + '-title'); await fill('触发消息正文', marker + '-content'); await choose('最终失败时', '停止流程并告警');
    await save(trigger, 'trigger-message', node => {
      const body = typeof node.props.actionBody === 'string' ? JSON.parse(node.props.actionBody) : node.props.actionBody;
      return node.props.triggerType === 'MESSAGE' && node.props.failStrategy === 'BLOCK' && body.title === marker + '-title'
        && body.content === marker + '-content' && body.recipientIds.length === 1 && String(body.recipientIds[0]) === people[1].id;
    });
    check('系统消息标题与正文重新加载后回显', await panel().getByLabel('触发消息标题', { exact: true }).inputValue() === marker + '-title'
      && await panel().getByLabel('触发消息正文', { exact: true }).inputValue() === marker + '-content');
    await panel().getByRole('button', { name: '关闭节点设置', exact: true }).click();

    const signing = await begin('signing', { type: 'PARALLEL', approverType: 'USER', approverValue: people.map(person => person.id).join(','),
      signType: 'ALL', approveSelf: 'ALLOW', rejectStrategy: 'TERMINATE' });
    await panel().getByRole('button', { name: '全签（所有人同意）', exact: true }).click();
    await admin.getByRole('option', { name: '票签（按权重通过）', exact: true }).click();
    await fill('通过所需权重', 2); await choose('票权来源', '每人 1.00 票');
    await save(signing, 'signing-equal', node => node.signType === 'WEIGHT' && sameNumber(node.passWeight, 2) && node.weightSource === 'EQUAL');
    await choose('票权来源', '按人员配置票权');
    for (let index = 0; index < people.length; index++) {
      await panel().getByRole('button', { name: '添加票权', exact: true }).click();
      await panel().getByRole('combobox', { name: '选择票权对应人员', exact: true }).nth(index).click();
      const picker = admin.getByRole('dialog', { name: '选择票权对应人员', exact: true });
      await picker.getByRole('searchbox').fill(people[index].name);
      const bounds = await picker.boundingBox(), viewport = admin.viewportSize();
      check('第' + (index + 1) + '个人员列表完整位于屏幕内', bounds && viewport && bounds.x >= 0 && bounds.y >= 0
        && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
      await picker.getByRole('option').filter({ hasText: people[index].name }).click();
      await picker.waitFor({ state: 'hidden' });
      await fill('第 ' + (index + 1) + ' 项权重', [3, 2, 1][index]);
    }
    await fill('通过所需权重', 5);
    await save(signing, 'signing-config', node => node.signType === 'WEIGHT' && node.weightSource === 'BY_CONFIG' && sameNumber(node.passWeight, 5)
      && node.assigneeWeights.length === 3 && people.every((person, index) => node.assigneeWeights.some(weight => String(weight.userId) === person.id && sameNumber(weight.weight, [3, 2, 1][index]))));
    check('票签三人权重及阈值重新加载后回显', await panel().getByLabel('通过所需权重', { exact: true }).inputValue() === '5'
      && await panel().getByLabel('第 1 项权重', { exact: true }).inputValue() === '3'
      && await panel().getByLabel('第 2 项权重', { exact: true }).inputValue() === '2'
      && await panel().getByLabel('第 3 项权重', { exact: true }).inputValue() === '1');
    await admin.setViewportSize({ width: 390, height: 844 });
    for (const person of [people[1], people[0]]) {
      await panel().getByRole('combobox', { name: '选择票权对应人员', exact: true }).first().click();
      const picker = admin.getByRole('dialog', { name: '选择票权对应人员', exact: true });
      await picker.getByRole('searchbox').fill(person.name);
      await picker.getByRole('option').filter({ hasText: person.name }).click();
      await picker.waitFor({ state: 'hidden' });
      check('手机人员弹窗可实际选择并回显' + person.name,
        (await panel().getByRole('combobox', { name: '选择票权对应人员', exact: true }).first().innerText()).includes(person.name));
    }
    await admin.screenshot({ path: path.join(directory, 'mobile-person-selector.png'), fullPage: true });
    check('手机选人检查恢复原人员且未覆盖已保存配置', stored(signing).assigneeWeights.length === 3
      && people.every((person, index) => stored(signing).assigneeWeights.some(weight => String(weight.userId) === person.id && sameNumber(weight.weight, [3, 2, 1][index]))));
    await admin.setViewportSize({ width: 1440, height: 1040 });
    const levels = successful(await api(admin, '/hr/organization/levels'), '读取实际HR职级选项');
    assert.ok(levels.length > 0, 'Designer job-level selection requires an actual HR level');
    await choose('票权来源', '按 HR 职级配置票权');
    await panel().getByRole('button', { name: '添加票权', exact: true }).click();
    await choose('第 1 项职级', levels[0].levelName); await fill('第 1 项权重', 2); await fill('通过所需权重', 2);
    await save(signing, 'signing-level', node => node.weightSource === 'BY_JOB_LEVEL' && node.assigneeWeights.length === 1
      && String(node.assigneeWeights[0].jobLevelId) === String(levels[0].id) && sameNumber(node.assigneeWeights[0].weight, 2));
    check('HR职级票权真实选项重新加载后回显', (await panel().getByRole('button', { name: '第 1 项职级', exact: true }).innerText()).includes(levels[0].levelName));
    check('设计器实际编辑保存全程无浏览器运行异常', errors.length === 0);
    evidence.b2DesignerSettings = true;
    console.log('B2_DESIGNER_UI_ACTUAL: ' + JSON.stringify({ definitions: definitions.length, realEditorSaves: saves, timerTypes: 3, delayUnits: 4,
      timerActions: 3, triggerTypes: 3, weightSources: 3, configuredUsers: 3, callbackExecutions: 0, desktopBrowser: true,
      mobilePersonSelector: true, mobileBrowser: false }));
  } catch (error) {
    failure = error;
    await admin.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
  }
  finally {
    admin.off('pageerror', onError);
    try {
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND deleted=0 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '%') + ';');
      check('设计器验证仅停用自有定义且原授权保持', grants() === beforeGrants);
      evidence.b2DesignerRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Designer verification cleanup failed'); }
  }
  if (failure) throw failure;
}
