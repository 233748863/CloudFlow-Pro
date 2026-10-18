import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifySignaturePages(harness) {
  const { manager, api, successful, database, check, caseTag, directory, quote, scenario, groups, tasks, complete, finish, pending } = harness;
  for (const mobile of [false, true]) {
    const label = mobile ? '手机' : '电脑';
    const { instanceId, original } = await scenario(`ui-${mobile ? 'mobile' : 'desktop'}`);
    const type = mobile ? 'BEFORE' : 'AFTER';
    await manager.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    if (mobile) await manager.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 }));
    await manager.goto(new URL('/tasks', manager.url()).href);
    if (mobile) await manager.getByRole('heading', { name: '我的任务', exact: true }).waitFor();
    const row = manager.locator(`[data-task-id="${original.id}"]`);
    await row.waitFor();
    await row.click();
    const triggerButton = manager.getByRole('button', { name: '加签', exact: true });
    await triggerButton.waitFor();
    await triggerButton.click();
    const dialog = manager.getByRole('dialog', { name: '加签', exact: true });
    await dialog.getByRole('radio', { name: mobile ? /^前加签/ : /^后加签/ }).check();
    check(`${label}真实普通审批弹窗提供三种加签顺序`, await dialog.getByRole('radio').count() === 3);
    await dialog.getByRole('textbox', { name: '搜索加签人员' }).fill('g_holiday_hr');
    const member = dialog.getByRole('button').filter({ hasText: 'g_holiday_hr' });
    await member.click();
    await dialog.getByRole('textbox', { name: '加签原因' }).fill(`${caseTag}-${label}-审批补充`);
    const confirm = dialog.getByRole('button', { name: '确认加签', exact: true });
    await confirm.scrollIntoViewIfNeeded();
    const buttonBounds = await confirm.boundingBox();
    const panelBounds = await dialog.locator('.cf-dialog-panel').boundingBox();
    console.log(`H1_ADDSIGN_UI_BOUNDS: device=${mobile ? 'mobile' : 'desktop'}; button=${JSON.stringify(buttonBounds)}; panel=${JSON.stringify(panelBounds)}`);
    check(`${label}加签确认区44像素且弹窗在屏幕内`, buttonBounds.height >= 44 && buttonBounds.width >= 44 && panelBounds.x >= 0
      && panelBounds.x + panelBounds.width <= (mobile ? 390 : 1440) && panelBounds.height <= (mobile ? 844 : 1000));
    await manager.screenshot({ path: path.join(directory, `h1-addsign-${mobile ? 'mobile' : 'desktop'}-${caseTag}.png`), fullPage: true });
    if (!mobile) {
      const trigger = `h1_sign_ui_fault_${caseTag}`;
      assert.match(trigger, /^h1_sign_ui_fault_[a-f0-9]{12}$/);
      assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=${quote(trigger)};`), '0');
      let created = false;
      const before = JSON.stringify(tasks(instanceId));
      try {
        database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON wf_task_add_sign FOR EACH ROW BEGIN IF NEW.task_id=${quote(original.id)} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H1_OWNED_ADDSIGN_UI_FAULT'; END IF; END$$\nDELIMITER ;\n`);
        created = true;
        const failed = manager.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/addSign'));
        await confirm.click();
        check('电脑加签保存故障真实返回失败', (await failed).status() === 500);
        await dialog.getByRole('alert').waitFor();
        check('电脑加签保存失败保留选择、原因和原任务', await member.getAttribute('aria-pressed') === 'true'
          && await dialog.getByRole('textbox', { name: '加签原因' }).inputValue() === `${caseTag}-${label}-审批补充`
          && groups(instanceId).length === 0 && JSON.stringify(tasks(instanceId)) === before);
      } finally {
        if (created) database(`DROP TRIGGER ${trigger};`);
      }
      console.log('WAIT 保留服务端重复提交保护，等待5.1秒后重试原始内容');
      await new Promise(resolve => setTimeout(resolve, 5100));
    }
    const posts = [];
    const track = request => { if (request.method() === 'POST' && request.url().endsWith('/workflow/enhance/task/addSign')) posts.push(request); };
    manager.on('request', track);
    try {
      const submitted = manager.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/addSign'));
      await confirm.evaluate(element => { element.click(); element.click(); });
      check(`${label}重复点击只创建一次真实加签`, (await (await submitted).json()).code === 200 && posts.length === 1);
      await dialog.waitFor({ state: 'hidden' });
      check(`${label}页面选择的加签顺序真实落库`, groups(instanceId).length === 1 && groups(instanceId)[0].type === type
        && groups(instanceId)[0].users === '990000705');
    } finally {
      manager.off('request', track);
    }
    if (type === 'AFTER') successful(await complete(tasks(instanceId).find(task => task.id === original.id), 'ui-original-before-manage'), '电脑后加签原负责人先审批');
    check(`${label}原审批暂停期间仍保留完整加签组`, tasks(instanceId).find(task => task.id === original.id)?.status === 'SUSPENDED');
    const listed = successful(await api(manager, '/workflow/enhance/task/signatures/pending?pageNum=1&pageSize=20'), '读取本人进行中的加签');
    check(`${label}本人加签列表包含暂停原审批`, listed.rows.some(group => group.taskId === original.id));
    const manage = manager.getByRole('button', { name: '管理进行中的加签', exact: true });
    await manage.click();
    const pendingDialog = manager.getByRole('dialog', { name: '进行中的加签', exact: true });
    await pendingDialog.locator(`[data-task-id="${original.id}"]`).getByRole('button').click();
    const reduction = manager.getByRole('dialog', { name: '减签', exact: true });
    const target = reduction.getByRole('button').filter({ hasText: 'g_holiday_hr' });
    await target.waitFor();
    console.log(`H1_ADDSIGN_UI_MEMBERS: ${JSON.stringify(await reduction.locator('button').evaluateAll(buttons => buttons.map(button => ({ name: button.textContent, pressed: button.getAttribute('aria-pressed') }))))}`);
    check(`${label}减签只显示本组尚未处理人员`, await reduction.locator('button[aria-pressed]').count() === 1
      && await target.getAttribute('aria-pressed') === 'false');
    await target.click();
    await reduction.getByRole('textbox', { name: '减签原因' }).fill(`${caseTag}-${label}-移除待办`);
    await reduction.getByRole('button', { name: '确认减签', exact: true }).scrollIntoViewIfNeeded();
    await manager.screenshot({ path: path.join(directory, `h1-addsign-management-${mobile ? 'mobile' : 'desktop'}-${caseTag}.png`), fullPage: true });
    const reduced = manager.waitForResponse(response => response.url().endsWith('/workflow/enhance/task/removeSign'));
    await reduction.getByRole('button', { name: '确认减签', exact: true }).click();
    check(`${label}暂停原审批的减签入口调用真实服务成功`, (await (await reduced).json()).code === 200);
    await reduction.waitFor({ state: 'hidden' });
    await pendingDialog.waitFor();
    await pendingDialog.locator('[aria-busy="false"]').waitFor();
    await pendingDialog.locator(`[data-task-id="${original.id}"]`).waitFor({ state: 'hidden' });
    check(`${label}减签后保留管理弹窗并刷新人员组`, await pendingDialog.getByRole('alert').count() === 0);
    await pendingDialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    if (type === 'BEFORE') {
      pending(instanceId, '手机前加签减签后仍须原负责人审批');
      successful(await complete(tasks(instanceId).find(task => task.id === original.id), 'ui-restored-owner'), '手机恢复的原任务真实审批');
    }
    await finish(instanceId, `ui-${label}`);
    check(`${label}加减签页面无横向溢出`, await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
}
