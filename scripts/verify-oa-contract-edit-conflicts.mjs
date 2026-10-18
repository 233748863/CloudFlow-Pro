import assert from 'node:assert/strict';
import path from 'node:path';

// Only real business requests; lost-response checks forward the actual save before aborting delivery.
export async function verifyContractTermEditConflicts({ admin, api, successful, database, check, caseTag, state, evidence }) {
  const marker = 'F4_CONFLICT_' + caseTag;
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const date = offset => database("SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL " + offset + " DAY),'%Y-%m-%d');");
  const contractId = String(successful(await api(admin, '/oa/contract', { method: 'POST', body: {
    contractNo: marker, contractName: marker, counterpartyName: marker, contractType: 'SERVICE',
    amount: '0.00', currency: 'CNY', startDate: date(0), endDate: date(60),
    requiresFulfilmentFlag: 1, fulfilmentDeadline: date(30),
  } }), '真实创建编辑冲突合同'));
  assert.match(contractId, /^[1-9][0-9]*$/);
  const list = async () => successful(await api(admin, '/oa/contract/' + contractId + '/terms'), '读取冲突合同条款');
  const read = async id => (await list()).find(term => String(term.termId) === String(id));
  const write = body => api(admin, '/oa/contract/terms', { method: 'POST', body });
  const create = async number => String(successful(await write({
    contractId: Number(contractId), termNo: number, termCategory: 'SERVICE',
    termContent: marker + '_term_' + number, requirement: marker + '_initial_' + number,
    responsibleParty: 'OUR', deadlineDate: date(7), sortNo: number,
  }), '真实创建待竞争条款'));
  const auditCount = () => Number(database("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='TERM_SAVED'"
    + " AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=" + sql(contractId) + ';'));
  const traceCount = () => Number(database("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=100000 AND business_type='CONTRACT'"
    + ' AND business_id=' + contractId + " AND event_type='TERM_SAVED';"));
  const rejectedVersions = [];
  const main = await create(1);
  const original = await read(main);
  const beforeRaceAudits = auditCount(); const beforeRaceTraces = traceCount();
  const raced = await Promise.all([
    write({ ...original, requirement: marker + '_race_a' }),
    write({ ...original, requirement: marker + '_race_b' }),
  ]);
  const success = result => result.status === 200 && result.body?.code === 200;
  check('相同条款同版本同时修改只有一次成功', raced.filter(success).length === 1);
  rejectedVersions.push(raced.find(result => !success(result)));
  const winner = await read(main);
  check('竞争后只保存一份完整修改且版本仅增加一次',
    [marker + '_race_a', marker + '_race_b'].includes(winner.requirement)
    && winner.version === original.version + 1);
  check('竞争失败没有新增业务审计或时间线', auditCount() === beforeRaceAudits + 1 && traceCount() === beforeRaceTraces + 1);
  const stale = await write({ ...original, requirement: marker + '_stale' });
  rejectedVersions.push(stale);
  check('旧版本再次提交不覆盖竞争胜出的内容', !success(stale) && JSON.stringify(await read(main)) === JSON.stringify(winner));
  successful(await write({ ...winner, requirement: marker + '_reviewed' }), '核对新版本后真实保存');
  check('核对最新版本后可保存且不丢失条款定义', (await read(main)).requirement === marker + '_reviewed');

  const second = await create(2);
  const firstSnapshot = await read(main); const secondSnapshot = await read(second);
  await Promise.all([
    write({ ...firstSnapshot, requirement: marker + '_independent_1' }).then(result => successful(result, '第一条独立保存')),
    write({ ...secondSnapshot, requirement: marker + '_independent_2' }).then(result => successful(result, '第二条独立保存')),
  ]);
  check('不同条款同时修改完整保留两份内容且总条款数不变',
    (await read(main)).requirement === marker + '_independent_1'
    && (await read(second)).requirement === marker + '_independent_2' && (await list()).length === 2);

  const fulfilled = await create(3); const beforeFulfilled = await read(fulfilled);
  successful(await api(admin, '/oa/contract/terms/' + fulfilled + '/confirm', {
    method: 'POST', body: { fulfilledDate: date(0), evidenceRemark: marker },
  }), '真实确认后检查旧编辑');
  const fulfilledFacts = await read(fulfilled);
  const afterFulfilled = await write({ ...beforeFulfilled, requirement: marker + '_overwrite_fulfilled' });
  rejectedVersions.push(afterFulfilled);
  check('旧编辑不能覆盖已确认履约的内容或完成事实',
    !success(afterFulfilled) && JSON.stringify(await read(fulfilled)) === JSON.stringify(fulfilledFacts));

  const waived = await create(4); const beforeWaived = await read(waived);
  successful(await api(admin, '/oa/contract/terms/' + waived + '/waive', {
    method: 'POST', body: { waivedReason: marker + '_agreed' },
  }), '真实豁免后检查旧编辑');
  const waivedFacts = await read(waived);
  const afterWaived = await write({ ...beforeWaived, requirement: marker + '_overwrite_waived' });
  rejectedVersions.push(afterWaived);
  check('旧编辑不能覆盖已豁免的内容或原因',
    !success(afterWaived) && JSON.stringify(await read(waived)) === JSON.stringify(waivedFacts));

  const removed = await create(5); const beforeRemoved = await read(removed);
  successful(await api(admin, '/oa/contract/terms/' + removed, { method: 'DELETE' }), '真实删除后检查旧编辑');
  const removalAuditCount = auditCount();
  const deletedSave = await write({ ...beforeRemoved, requirement: marker + '_resurrect' });
  check('旧编辑不能复活已删除条款或增加保存审计',
    !success(deletedSave) && !(await read(removed)) && auditCount() === removalAuditCount);

  await admin.setViewportSize({ width: 320, height: 1000 });
  const open = async () => {
    await admin.goto(new URL('/office/contracts', admin.url()).href, { waitUntil: 'domcontentloaded' });
    await admin.getByPlaceholder('合同名称', { exact: true }).fill(marker);
    const row = admin.getByRole('row').filter({ hasText: marker });
    await row.waitFor();
    await row.getByRole('button', { name: '查看详情', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: marker, exact: true }); await dialog.waitFor();
    await dialog.getByRole('row').filter({ hasText: marker + '_term_1' }).getByRole('button', { name: '编辑', exact: true }).click();
    const editor = admin.getByRole('dialog', { name: '履约条款', exact: true }); await editor.waitFor(); return editor;
  };
  let editor = await open();
  const draft = marker + '_phone_draft';
  await editor.getByLabel('履约要求', { exact: true }).fill(draft);
  const beforeRemote = await read(main);
  successful(await write({ ...beforeRemote, requirement: marker + '_remote' }), '页面编辑期间实际完成另一份修改');
  const remoteFacts = await read(main); const remoteAudits = auditCount();
  const responseWait = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/oa/contract/terms'
    && response.request().method() === 'POST');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const response = await responseWait;
  rejectedVersions.push({ status: response.status(), body: await response.json() });
  await editor.getByRole('button', { name: '保存', exact: true }).waitFor();
  await admin.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')]
    .some(button => button.textContent === '保存' && !button.disabled));
  check('手机旧页面保存失败时保留编辑框和原草稿',
    await editor.isVisible() && await editor.getByLabel('履约要求', { exact: true }).inputValue() === draft);
  check('手机旧页面失败没有改动服务器最新内容与审计',
    JSON.stringify(await read(main)) === JSON.stringify(remoteFacts) && auditCount() === remoteAudits);
  const conflictNotice = admin.getByText('记录已修改，请刷新核对最新条款后重试', { exact: true });
  await conflictNotice.first().waitFor();
  check('手机明确提示核对最新条款后重试', await conflictNotice.first().isVisible());
  await admin.screenshot({ path: path.join(state.run, 'f4-term-conflict-' + caseTag + '-320.png'), fullPage: true });
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  editor = await open();
  check('重新读取条款后显示另一份真实保存的最新结果',
    await editor.getByLabel('履约要求', { exact: true }).inputValue() === remoteFacts.requirement);
  const lostDraft = marker + '_saved_response_lost';
  await editor.getByLabel('履约要求', { exact: true }).fill(lostDraft);
  let writes = 0; let forwarded;
  const interceptor = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    forwarded = await route.fetch();
    assert.equal(forwarded.status(), 200);
    assert.equal((await forwarded.json()).code, 200);
    await route.abort('failed');
  };
  const pattern = '**/api/oa/contract/terms';
  await admin.route(pattern, interceptor);
  try {
    const failedRequest = admin.waitForEvent('requestfailed', { predicate: request =>
      new URL(request.url()).pathname === '/api/oa/contract/terms' && request.method() === 'POST' });
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await failedRequest;
    await admin.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')]
      .some(button => button.textContent === '保存' && !button.disabled));
    check('真实保存成功但响应丢失后保留手机草稿',
      forwarded && writes === 1 && await editor.isVisible()
      && await editor.getByLabel('履约要求', { exact: true }).inputValue() === lostDraft);
  } finally { await admin.unroute(pattern, interceptor); }
  check('丢响应时真实业务只更新一次且只增加一次保存审计',
    (await read(main)).requirement === lostDraft && (await read(main)).version === remoteFacts.version + 1
    && auditCount() === remoteAudits + 1);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  editor = await open();
  check('只读重新打开可恢复丢失响应对应结果且不重复保存',
    await editor.getByLabel('履约要求', { exact: true }).inputValue() === lostDraft
    && auditCount() === remoteAudits + 1 && writes === 1);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  console.log('F4_TERM_EDIT_CONFLICT_CODES: ' + rejectedVersions.map(result => result.status + '/' + result.body?.code).join(','));
  check('版本冲突明确返回409及刷新提示，不能作为普通服务异常',
    rejectedVersions.every(result => result.status === 409 && result.body?.code === 409
      && result.body?.msg?.includes('记录已修改')));
  evidence.editConflicts = true;
}
