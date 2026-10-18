import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createB2MobileBrowser } from './b2-mobile-browser.mjs';

// Configuration persistence and UI validation only; no claim about MANUAL self-policy execution.
export async function verifyB1NodeDesignerUi({ admin, api, successful, database, check, caseTag, secrets, evidence }) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', 'b1-node-designer-' + caseTag);
  const marker = 'B1ND' + caseTag, base = '/workflow/wf', definitions = [];
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4) COLLATE utf8mb4_unicode_ci';
  const post = (url, body) => api(admin, url, { method: 'POST', body });
  const reviewer = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_manager' AND deleted=0 AND status='0';");
  assert.match(reviewer, /^[1-9][0-9]*$/);
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const stored = id => JSON.parse(database('SELECT model_json FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=' + sql(id) + ';'));
  const approval = id => ({ id, title: id === 'upstream' ? '上游审批' : '下游审批', type: 'APPROVAL', approverType: 'USER', approverValue: reviewer });
  const graph = subject => {
    const nodes = [{ id: 'start', title: '发起', type: 'START' }, approval('upstream'), subject, approval('downstream'), { id: 'end', title: '结束', type: 'END' }];
    return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: 'edge' + index, source: nodes[index].id, target: node.id })) };
  };
  let formId, mobile, failure, saves = 0, blocked = 0;
  const create = async (name, subject) => {
    const key = marker + '_' + name;
    const result = successful(await post(base + '/definition/save', { processKey: key, processName: key, formId,
      modelJson: JSON.stringify(graph(subject)), startPermissionType: 'ALL', startPermissionValue: '[]' }), '建立其他节点配置样本');
    const id = result.definitionId ?? result.id; assert.ok(id); definitions.push(id); return { id, key };
  };
  try {
    await fs.mkdir(directory, { recursive: true });
    const form = successful(await post(base + '/form/save', { formKey: marker, formName: marker, fieldsJson: '[{"id":"note","type":"TEXT","label":"说明"}]' }), '建立节点配置测试表单');
    formId = form.formId ?? form.id; assert.ok(formId);
    const child = await create('child', { ...approval('subject'), title: '子流程审批' });
    successful(await post(base + '/definition/deploy/' + child.id), '发布自有子流程供选择器读取');
    mobile = await createB2MobileBrowser({ admin, secrets, check, landingPath: '/tasks', landingHeading: '我的任务' });
    await admin.setViewportSize({ width: 1440, height: 1040 });
    for (const [device, page] of [['desktop', admin]]) {
      const errors = [], initialSaves = saves, initialBlocked = blocked;
      const onError = error => errors.push(error.name); page.on('pageerror', onError);
      const touch = async locator => locator.click();
      const panel = () => page.locator('.workflow-studio-panel').filter({ hasText: '节点设置' });
      const open = async () => {
        if (await panel().getByRole('button', { name: '关闭节点设置', exact: true }).isVisible()) return;
        const node = page.locator('[data-node-id="subject"]'); await node.waitFor({ timeout: 60000 }); await touch(node);
        await panel().getByRole('button', { name: '关闭节点设置', exact: true }).waitFor();
      };
      const choose = async (label, option) => {
        await touch(panel().getByRole('button', { name: label, exact: true }));
        await touch(page.getByRole('option', { name: option, exact: true }));
      };
      const fill = async (locator, value) => { await locator.fill(String(value)); await locator.press('Tab'); };
      const toolbarSave = async () => {
        await touch(panel().getByRole('button', { name: '关闭节点设置', exact: true }));
        await touch(page.locator('.workflow-studio-toolbar').getByRole('button', { name: '保存', exact: true }));
      };
      const invalid = async (id, message) => {
        const before = JSON.stringify(stored(id)); let requests = 0;
        const watch = request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/wf/definition/save')) requests++; };
        page.on('request', watch);
        try {
          await toolbarSave(); await page.getByText(message).first().waitFor();
          check(device + '非法配置在保存前拦截且原定义保持', requests === 0 && JSON.stringify(stored(id)) === before); blocked++;
          await open();
        } finally { page.off('request', watch); }
      };
      try {
        for (const type of ['APPROVAL', 'MANUAL', 'PARALLEL', 'COPY', 'TIMER', 'SUBPROCESS']) {
          const isTask = ['APPROVAL', 'MANUAL', 'PARALLEL'].includes(type), hasSelfPolicy = ['APPROVAL', 'PARALLEL'].includes(type), hasReject = type !== 'COPY';
          const subject = { id: 'subject', title: '目标' + type, type,
            ...(isTask ? { approverType: 'MULTI_LEVEL_MANAGER', directorLevel: 2, directorFallback: 'TOP_LEVEL' } : {}),
            ...(type === 'PARALLEL' ? { signType: 'ALL' } : {}),
            ...(type === 'COPY' ? { approverType: 'USER', approverValue: reviewer } : {}),
            ...(type === 'MANUAL' ? { props: { taskDescription: '核对交接清单', priority: 'NORMAL' } } : {}),
            ...(type === 'TIMER' ? { props: { timerType: 'DELAY', delayValue: 1, delayUnit: 'HOUR', timerAction: 'AUTO_PASS' } } : {}),
            ...(type === 'SUBPROCESS' ? { props: { subprocessId: child.key, waitForCompletion: true } } : {}) };
          const { id } = await create(device + '_' + type, subject);
          await page.goto(new URL('/workflow/design?id=' + id, page.url()).href, { waitUntil: 'domcontentloaded' }); await open();
          check(device + '-' + type + '按节点类型展示自审和驳回配置',
            await panel().getByRole('button', { name: '审批人是发起人本人时', exact: true }).count() === Number(hasSelfPolicy)
            && await panel().getByRole('button', { name: '驳回策略', exact: true }).count() === Number(hasReject));
          await fill(panel().getByPlaceholder('请输入节点名称', { exact: true }), '已保存' + type);
          if (isTask) {
            await fill(panel().getByLabel('主管层级', { exact: true }), '0');
            await invalid(id, /主管层级必须为 1—10 的整数/);
            await fill(panel().getByLabel('主管层级', { exact: true }), '2');
            if (hasSelfPolicy) await choose('审批人是发起人本人时', '自动跳过本人的审批');
            await touch(panel().getByText('允许的操作（默认全部允许）', { exact: true }));
            await touch(panel().getByRole('checkbox', { name: '催办：允许发起人发送提醒', exact: true }));
          }
          if (hasReject) {
            await choose('驳回策略', '退回指定上游节点');
            await invalid(id, /请选择有效的上游驳回目标/);
            await touch(panel().getByRole('button', { name: '目标节点', exact: true }));
            await page.getByRole('option').first().waitFor();
            const targets = (await page.getByRole('option').allTextContents()).map(text => text.trim()).sort();
            check(device + '-' + type + '目标选择只列发起和上游审批', JSON.stringify(targets) === JSON.stringify(['请选择上游节点', '发起', '上游审批'].sort()));
            await touch(page.getByRole('option', { name: '上游审批', exact: true }));
          }
          const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/wf/definition/save') && response.request().method() === 'POST').catch(() => null);
          await toolbarSave();
          const response = await pending; assert.ok(response, 'Valid node editor save must reach server');
          assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200); saves++;
          const persisted = () => stored(id).nodes.find(node => node.id === 'subject');
          check(device + '-' + type + '实际保存节点配置', persisted().title === '已保存' + type
            && (!isTask || (persisted().directorLevel === 2 && (hasSelfPolicy ? persisted().approveSelf === 'AUTO_SKIP' : !Object.hasOwn(persisted(), 'approveSelf')) && persisted().allowUrge === false))
            && (!hasReject || (persisted().rejectStrategy === 'TO_SPECIFIED_NODE' && persisted().rejectToNodeKey === 'upstream')));
          const saved = JSON.stringify(persisted());
          await page.reload({ waitUntil: 'domcontentloaded' }); await open();
          check(device + '-' + type + '重新打开保持保存结果', JSON.stringify(persisted()) === saved
            && await panel().getByPlaceholder('请输入节点名称', { exact: true }).inputValue() === '已保存' + type);
          if (isTask) check(device + '-' + type + '主管层级和适用的自审策略回显', await panel().getByLabel('主管层级', { exact: true }).inputValue() === '2'
            && (hasSelfPolicy ? (await panel().getByRole('button', { name: '审批人是发起人本人时', exact: true }).innerText()).includes('自动跳过本人的审批') : await panel().getByRole('button', { name: '审批人是发起人本人时', exact: true }).count() === 0));
          await page.screenshot({ path: path.join(directory, device + '-' + type + '.png'), fullPage: true });
        }
        check(device + '其他节点设计器无运行异常', errors.length === 0);
        console.log('B1_NODE_DESIGNER_UI: ' + JSON.stringify({ device, nodeTypes: 6, saves: saves - initialSaves, blocked: blocked - initialBlocked, pageErrors: errors.length, actualTouch: device === 'mobile', executionPolicyVerified: false }));
        evidence.b1NodeDesignerDesktop = true;
      } catch (error) { await page.screenshot({ path: path.join(directory, device + '-failure.png'), fullPage: true }).catch(() => {}); throw error; }
      finally { page.off('pageerror', onError); }
    }
    const originalModels = definitions.map(id => JSON.stringify(stored(id))), boundaryErrors = [];
    let editorRequests = 0;
    const watchRequest = request => { if (new URL(request.url()).pathname.includes('/wf/definition/')) editorRequests++; };
    const watchError = error => boundaryErrors.push(error.name);
    mobile.page.on('request', watchRequest); mobile.page.on('pageerror', watchError);
    try {
      for (const [name, route] of [['existing', '/workflow/design?id=' + child.id], ['new', '/workflow/design']]) {
        await mobile.page.goto(new URL(route, mobile.page.url()).href, { waitUntil: 'domcontentloaded' });
        const notice = mobile.page.getByText('此功能暂不支持移动端，请在电脑访问。', { exact: true });
        await notice.waitFor();
        check('手机' + name + '入口准确提示在电脑办理且没有编辑控件', await notice.isVisible() && await mobile.page.locator('.workflow-studio-toolbar,[data-node-id="subject"]').count() === 0);
        await mobile.page.reload({ waitUntil: 'domcontentloaded' }); await notice.waitFor();
        check('手机' + name + '入口刷新仍保持原范围', await notice.isVisible() && editorRequests === 0);
        await mobile.page.screenshot({ path: path.join(directory, 'mobile-boundary-' + name + '.png'), fullPage: true });
      }
      check('手机范围检查没有修改定义且没有页面异常', boundaryErrors.length === 0 && definitions.every((id, index) => JSON.stringify(stored(id)) === originalModels[index]));
      evidence.b1NodeDesignerMobileBoundary = true;
      console.log('B1_NODE_DESIGNER_MOBILE_BOUNDARY: ' + JSON.stringify({ routes: 2, refreshes: 2, actualTouch: true, editorRequests, editingSupported: false, unchanged: true, pageErrors: boundaryErrors.length }));
    } finally { mobile.page.off('request', watchRequest); mobile.page.off('pageerror', watchError); }
    console.log('B1_NODE_DESIGNER_ACTUAL: ' + JSON.stringify({ saves, blocked, nodeTypes: 6, designerDevices: 1, mobileBoundaryVerified: true, businessLaunches: 0, executionPolicyVerified: false }));
  } catch (error) { failure = error; }
  finally {
    try {
      if (mobile) await mobile.close();
      for (const id of definitions) database("UPDATE wf_process_definition SET status='ARCHIVED' WHERE tenant_id=100000 AND definition_id=" + sql(id) + ' AND process_key LIKE ' + sql(marker + '_%') + ';');
      check('其他节点设计器自有定义归档且原权限保持', grants() === originalGrants
        && database('SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id IN (SELECT definition_id FROM wf_process_definition WHERE process_key LIKE ' + sql(marker + '_%') + ');') === '0');
      evidence.b1NodeDesignerRestoration = true;
    } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'B1 node designer cleanup failed'); }
  }
  if (failure) throw failure;
}
