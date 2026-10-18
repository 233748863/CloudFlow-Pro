import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifySettlementAssetReminder(context) {
  const { admin, hr, finance, employee, api, successful, database, check, caseTag, userId, settlementId, assetId, itemId, directory, evidence, state } = context;
  for (const id of [userId, settlementId, assetId, itemId]) assert.match(String(id), /^[1-9]\d*$/);
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const root = `/hr/settlement/${settlementId}`; const endpoint = `${root}/assets/${itemId}/reminder`;
  for (const [label, actor] of [['人事', hr], ['财务', finance]]) {
    const list = successful(await api(actor, '/hr/settlement/list?pageNum=1&pageSize=20'), `${label}读取未筛选结算列表`);
    check(`${label}完整历史下仍能按编号倒序分页`, list.rows.length > 0 && list.rows.length <= 20 && list.rows.every((value, index) => index === 0 || BigInt(list.rows[index - 1].settlementId) > BigInt(value.settlementId)));
  }
  const row = successful(await api(hr, root), '提醒前读取结算'); const employeeId = String(row.employeeId);
  const read = async () => successful(await api(hr, endpoint), '读取真实OA资产和最近提醒');
  const configuredInterval = Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis' AND tenant_id=100000;"));
  const interval = Math.max(5000, configuredInterval) + 150; assert.ok(interval <= 60000, 'Unexpected repeat-submit interval');
  const send = async (body, actor = hr) => { await new Promise(resolve => setTimeout(resolve, interval)); return api(actor, endpoint, { method: 'POST', body }); };
  const fixtureUpdate = statement => database(statement.replaceAll(' SET ', ' SET update_time=update_time,'));
  const body = observed => ({ version: row.version, assetVersion: observed.assetVersion, lastReminderId: observed.latest?.id || '0' });
  const deny = (response, label) => check(label, response.status >= 400 && response.body?.code !== 200);
  const count = () => database(`SELECT COUNT(*) FROM oa_borrow_reminder_log WHERE tenant_id=100000 AND business_type='HR_ASSET_RETURN' AND business_id=${settlementId} AND resource_id=${assetId};`);
  const auditCount = () => database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='HR_ASSET_RETURN' AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.settlementId'))='${settlementId}';`);
  const eventCount = () => database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='MESSAGE_SEND' AND aggregate_id=${settlementId} AND aggregate_type='cloudflow-service-oa';`);
  const snapshot = () => [database(`SELECT * FROM hr_final_settlement WHERE settlement_id=${settlementId};`), database(`SELECT * FROM hr_final_settlement_item WHERE settlement_id=${settlementId} ORDER BY item_id;`), database(`SELECT * FROM oa_asset WHERE asset_id=${assetId};`)];
  const before = snapshot(); let observed = await read();
  check('计算及读取结算不自动发送提醒', count() === '0' && observed.latest == null && observed.canSend && row.canRemindAssets);
  deny(await api(finance, endpoint), '财务不能读取人事归还提醒');
  deny(await send(body(observed), finance), '财务不能代人事发送提醒');
  deny(await send(body(observed), employee), '员工不能发送归还提醒');
  deny(await send({ ...body(observed), userId }), '不能伪造提醒接收人');
  deny(await send({ ...body(observed), version: row.version + 1 }), '旧结算版本不能发送提醒');
  deny(await send({ ...body(observed), assetVersion: observed.assetVersion + 1 }), '资产版本变化不能发送提醒');
  deny(await send({ ...body(observed), lastReminderId: '-1' }), '提醒编号不能为负数');
  deny(await api(hr, `${root}/assets/9223372036854775807/reminder`, { method: 'POST', body: body(observed) }), '伪造结算资产明细被拒绝');
  const alter = async (update, restore, label) => {
    try { fixtureUpdate(update); deny(await send(body(observed)), label); }
    finally { fixtureUpdate(restore); }
  };
  await alter(`UPDATE hr_final_settlement SET tenant_id=100001 WHERE settlement_id=${settlementId};`, `UPDATE hr_final_settlement SET tenant_id=100000 WHERE settlement_id=${settlementId};`, '跨租户结算不能发送提醒');
  await alter(`UPDATE hr_final_settlement_item SET settlement_id=0 WHERE item_id=${itemId};`, `UPDATE hr_final_settlement_item SET settlement_id=${settlementId} WHERE item_id=${itemId};`, '其他结算的资产明细不能混入');
  await alter(`UPDATE oa_asset SET tenant_id=100001 WHERE asset_id=${assetId};`, `UPDATE oa_asset SET tenant_id=100000 WHERE asset_id=${assetId};`, '跨租户资产不能发送提醒');
  const responsibility = JSON.parse(database(`SELECT JSON_OBJECT('custodian',custodian_id,'owner',owner_id) FROM oa_asset WHERE asset_id=${assetId};`));
  const restoreAsset = `UPDATE oa_asset SET custodian_id=${responsibility.custodian ?? 'NULL'},owner_id=${responsibility.owner ?? 'NULL'} WHERE asset_id=${assetId};`;
  await alter(`UPDATE oa_asset SET custodian_id=NULL,owner_id=NULL WHERE asset_id=${assetId};`, restoreAsset, '已归还资产不能被提醒');
  await alter(`UPDATE oa_asset SET custodian_id=${userId},owner_id=1 WHERE asset_id=${assetId};`, restoreAsset, '保管和领用责任冲突不能发送提醒');
  for (const status of ['CONFIRMED', 'PAID']) {
    try { fixtureUpdate(`UPDATE hr_final_settlement SET status='${status}' WHERE settlement_id=${settlementId};`); check(`${status}阶段仍可由人事手动提醒`, (await read()).canSend); }
    finally { fixtureUpdate(`UPDATE hr_final_settlement SET status='DRAFT' WHERE settlement_id=${settlementId};`); }
  }
  await alter(`UPDATE hr_final_settlement SET status='CLOSED' WHERE settlement_id=${settlementId};`, `UPDATE hr_final_settlement SET status='DRAFT' WHERE settlement_id=${settlementId};`, '已关闭结算不能发送提醒');
  await alter(`UPDATE hr_final_settlement SET superseded_flag=1 WHERE settlement_id=${settlementId};`, `UPDATE hr_final_settlement SET superseded_flag=0 WHERE settlement_id=${settlementId};`, '已被替代结算不能发送提醒');
  await alter(`UPDATE hr_final_settlement SET settlement_kind='REVERSAL',reversal_of_id=${settlementId} WHERE settlement_id=${settlementId};`, `UPDATE hr_final_settlement SET settlement_kind='NORMAL',reversal_of_id=NULL WHERE settlement_id=${settlementId};`, '冲正结算不能发送提醒');
  try { database(`UPDATE sys_user SET status='1' WHERE user_id=${userId};`); check('员工账号停用仍可读取记录并说明无法接收', !(await read()).canSend); deny(await send(body(observed)), '停用账号不接受新提醒'); }
  finally { database(`UPDATE sys_user SET status='0' WHERE user_id=${userId};`); }
  const hrUserId = String(await hr.evaluate(async () => (await (await import('/src/services/api/auth.ts')).getInfo()).userId)); assert.match(hrUserId, /^[1-9]\d*$/);
  await alter(`UPDATE hr_employee SET user_id=${hrUserId} WHERE id=${employeeId};`, `UPDATE hr_employee SET user_id=${userId} WHERE id=${employeeId};`, '具有人事权限的离职本人同样回避');
  check('所有拒绝路径均未产生提醒或业务审计', count() === '0' && auditCount() === '0');
  const duplicateMarker = `asset_reminder_duplicate_${caseTag}`;
  try {
    database(`INSERT INTO hr_employee(tenant_id,employee_no,name,gender,employee_status,user_id,deleted,create_by) VALUES(100000,'${duplicateMarker}','${duplicateMarker}','UNKNOWN','REGULAR',${userId},0,'${duplicateMarker}');`);
    deny(await send(body(observed)), '同一账号关联多名员工时拒绝发送');
  } finally { database(`DELETE FROM hr_employee WHERE tenant_id=100000 AND employee_no='${duplicateMarker}' AND create_by='${duplicateMarker}';`); }
  const oa = state.services.find(service => service.name === 'oa'); assert.ok(oa && Number.isInteger(oa.port));
  for (const headers of [{}, { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-crm', 'X-Tenant-Id': '100000' }]) {
    const response = await fetch(`http://127.0.0.1:${oa.port}/inner/oa/asset/return-reminder?employeeId=${employeeId}&userId=${userId}&settlementId=${settlementId}&assetId=${assetId}`, { headers, signal: AbortSignal.timeout(30000) });
    check('内部归还提醒接口拒绝无身份或错误来源服务', response.status >= 400);
  }

  for (const [suffix, table, condition] of [
    ['log', 'oa_borrow_reminder_log', `NEW.business_type='HR_ASSET_RETURN' AND NEW.business_id=${settlementId}`],
    ['audit', 'sys_audit_log', `NEW.audit_field='HR_ASSET_RETURN' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_json,'$.settlementId'))='${settlementId}'`],
    ['message', 'outbox_event', `NEW.event_type='MESSAGE_SEND' AND NEW.aggregate_type='cloudflow-service-oa' AND NEW.aggregate_id=${settlementId}`],
  ]) {
    const trigger = `h2_ar_${suffix}_${caseTag}`;
    assert.equal(database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name='${trigger}';`), '0');
    const previous = [count(), auditCount(), eventCount()];
    try {
      database(`DELIMITER $$\nCREATE TRIGGER ${trigger} BEFORE INSERT ON ${table} FOR EACH ROW BEGIN IF ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Owned reminder rollback check'; END IF; END$$\nDELIMITER ;\n`);
      deny(await send(body(observed)), `${suffix}持久化失败明确拒绝发送`);
      check(`${suffix}失败整笔撤回提醒、业务审计和消息事件`, JSON.stringify(previous) === JSON.stringify([count(), auditCount(), eventCount()]));
    } finally { database(`DROP TRIGGER IF EXISTS ${trigger};`); }
  }
  const competition = await Promise.all([hr, admin].map(actor => send(body(observed), actor)));
  check('两名操作者同时提醒只成功一次', competition.filter(result => result.status === 200 && result.body?.code === 200).length === 1 && competition.filter(result => result.status >= 400).length === 1 && count() === '1');
  deny(await send(body(observed)), '同一最近提醒版本重复提交不再发送');
  observed = await read();
  check('最近提醒包含真实时间、经办人和归还内容', observed.latest && observed.latest.reminderTime && observed.latest.operatorId && observed.latest.content.includes(observed.assetCode));

  const output = path.join(directory, `h2-asset-reminder-ui-${caseTag}`); await fs.mkdir(output, { recursive: true });
  const errors = []; const captureError = error => errors.push(error.message); hr.on('pageerror', captureError);
  const longName = '归还员工' + '长'.repeat(96);
  const literal = value => `CONVERT(UNHEX('${Buffer.from(value).toString('hex')}') USING utf8mb4)`;
  try {
    fixtureUpdate(`UPDATE hr_employee SET name=${literal(longName)} WHERE tenant_id=100000 AND id=${employeeId};`);
    await hr.setViewportSize({ width: 1440, height: 1100 });
    await hr.goto(new URL('/hr/final-settlements', hr.url()).href, { waitUntil: 'domcontentloaded' });
    await hr.getByLabel('搜索结算单号').fill(row.settlementNo); await hr.getByRole('button', { name: '查看结算', exact: true }).click();
    const detail = hr.getByRole('dialog', { name: '离职结算详情', exact: true });
    await detail.getByRole('button', { name: '提醒归还', exact: true }).click();
    const dialog = hr.getByRole('dialog', { name: '资产归还提醒', exact: true });
    await dialog.getByText('站内提醒已提交', { exact: true }).waitFor();
    check('提醒页面完整显示100字符员工姓名', await dialog.getByText(longName, { exact: true }).count() === 1);
    const capture = async width => {
      const layout = await dialog.evaluate(element => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, content: element.scrollWidth, client: element.clientWidth,
        controls: [...element.querySelectorAll('button')].filter(control => control.getClientRects().length).map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })) }));
      check(`${width}px提醒窗口无横向裁切且按钮至少44px`, layout.document <= layout.viewport && layout.content <= layout.client && layout.controls.every(control => control.width >= 44 && control.height >= 44));
      await dialog.screenshot({ path: path.join(output, `reminder-${width}.png`) });
    };
    await capture(1440);
    await dialog.getByRole('button', { name: '发送站内提醒', exact: true }).click();
    await dialog.locator('[aria-busy="false"]').waitFor();
    for (let attempt = 0; attempt < 30 && count() !== '2'; attempt++) await new Promise(resolve => setTimeout(resolve, 200));
    check('电脑端明确手动发送新增一条提醒', count() === '2');
    await dialog.getByRole('button', { name: '读取最近提醒', exact: true }).click();
    await dialog.getByRole('button', { name: '发送站内提醒', exact: true }).waitFor({ state: 'visible' });
    await hr.setViewportSize({ width: 320, height: 1100 });
    let lost = false; const route = `**/api${endpoint}`;
    await hr.route(route, async request => { if (request.request().method() === 'POST' && !lost) { lost = true; const response = await request.fetch(); assert.equal(response.status(), 200); await request.abort('failed'); } else await request.continue(); });
    try {
      await dialog.getByRole('button', { name: '发送站内提醒', exact: true }).click();
      await dialog.getByText('发送结果尚待核实，已暂停重复发送。请读取最近提醒后再操作。', { exact: true }).waitFor();
      check('手机响应丢失只发送一次并暂停重复提交', lost && count() === '3' && await dialog.getByRole('button', { name: '发送站内提醒', exact: true }).isDisabled());
    } finally { await hr.unroute(route); }
    let failedRead = false;
    await hr.route(route, async request => { if (request.request().method() === 'GET' && !failedRead) { failedRead = true; await request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '隔离提醒读取故障' }) }); } else await request.continue(); });
    try { await dialog.getByRole('button', { name: '读取最近提醒', exact: true }).click(); await dialog.getByText('隔离提醒读取故障', { exact: true }).waitFor(); check('读取失败仍禁止重复发送', failedRead && await dialog.getByRole('button', { name: '发送站内提醒', exact: true }).isDisabled()); }
    finally { await hr.unroute(route); }
    await dialog.getByRole('button', { name: '读取最近提醒', exact: true }).click(); await dialog.getByText('站内提醒已提交', { exact: true }).waitFor();
    check('成功重读恢复最近提醒且不产生新消息', count() === '3'); await capture(320);
    check('发送提醒未截断100字符员工姓名', database(`SELECT CHAR_LENGTH(name) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId};`) === '100');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await detail.getByRole('button', { name: '关闭', exact: true }).click();
    await hr.goto(new URL('/hr/final-settlements', hr.url()).href, { waitUntil: 'domcontentloaded' });
    await hr.getByLabel('搜索结算单号').fill(row.settlementNo); await hr.getByRole('button', { name: '查看结算', exact: true }).click();
    await detail.getByRole('button', { name: '提醒归还', exact: true }).click();
    await dialog.getByText('站内提醒已提交', { exact: true }).waitFor();
    check('手机重新进入仍读取原三次提醒和完整姓名', count() === '3' && await dialog.getByText(longName, { exact: true }).count() === 1);
    await dialog.screenshot({ path: path.join(output, 'reminder-reloaded-320.png') });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await detail.getByRole('button', { name: '关闭', exact: true }).click();
  } finally { fixtureUpdate(`UPDATE hr_employee SET name=${literal(row.employeeName)} WHERE tenant_id=100000 AND id=${employeeId};`); hr.off('pageerror', captureError); }
  const messageQuery = `SELECT record_id FROM sys_message_record WHERE tenant_id=100000 AND receiver_id=${userId} AND biz_type='HR_ASSET_RETURN' AND biz_id='${settlementId}' AND channel_type='INTERNAL' AND send_status='SUCCESS' ORDER BY record_id;`;
  let messageIds = [];
  for (let attempt = 0; attempt < 80; attempt++) { messageIds = database(messageQuery).split(/\r?\n/).filter(Boolean); if (messageIds.length === 3) break; await new Promise(resolve => setTimeout(resolve, 500)); }
  check('三次人工提醒均经真实消息链路进入收件员工站内消息', messageIds.length === 3 && auditCount() === '3' && eventCount() === '3');
  const mine = successful(await api(employee, `/auth/system/message/mine/${messageIds[0]}`), '员工本人读取归还提醒');
  check('员工可读内容只包含归还业务信息', mine.content.includes(observed.assetCode) && !mine.content.includes('HR_ASSET_RETURN'));
  deny(await api(finance, `/auth/system/message/mine/${messageIds[0]}`), '其他员工不能读取该归还消息');
  check('归还提醒没有任何外部渠道记录', database(`SELECT COUNT(*) FROM sys_message_record WHERE biz_type='HR_ASSET_RETURN' AND biz_id='${settlementId}' AND channel_type<>'INTERNAL';`) === '0');
  check('提醒全过程未改变结算金额、来源核定、审批状态和资产', JSON.stringify(snapshot()) === JSON.stringify(before));
  check('提醒双端页面没有运行异常', errors.length === 0);
  check('三个故障触发器全部清理', database(`SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name IN ('h2_ar_log_${caseTag}','h2_ar_audit_${caseTag}','h2_ar_message_${caseTag}');`) === '0');
  evidence.assetReminder = true; evidence.assetReminderRollback = true; evidence.assetReminderLostResponse = true;
}
