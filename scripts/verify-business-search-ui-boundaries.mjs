import assert from 'node:assert/strict';

export async function verifyBusinessSearchUiBoundaries(context) {
  const { admin, api, successful, database, own, hidden, foreignRecords, check, evidence,
    caseTag, navigate, openSearch, query, waitFor, pause } = context;
  const employeeDialog = () => admin.getByRole('dialog', { name: '员工详情', exact: true });
  const publicationPanel = () => admin.getByRole('region', { name: '客户门户公开范围', exact: true });
  const groupLabels = { CUSTOMER: '客户', CONTRACT: '合同', EMPLOYEE: '员工', WORKFLOW_INSTANCE: '流程', TICKET: '工单', ASSET: '资产' };
  const currentIdentity = () => admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getCurrentUserSnapshot());
  const currentTenant = async () => String((await currentIdentity())?.tenantId ?? '');
  const switchTenant = async tenantId => {
    const originalUserId = String((await currentIdentity())?.id ?? '');
    assert.match(originalUserId, /^[1-9]\d*$/);
    const response = admin.waitForResponse(candidate => new URL(candidate.url()).pathname === '/api/auth/switchTenant'
      && candidate.request().method() === 'POST');
    const identityResponse = admin.waitForResponse(candidate => new URL(candidate.url()).pathname === '/api/auth/info'
      && candidate.request().method() === 'GET');
    await admin.locator(`.tenant-option[aria-label$="ID ${tenantId}"]`).dispatchEvent('click');
    const actual = await response;
    assert.equal(actual.status(), 200);
    assert.equal((await actual.json()).code, 200);
    const identity = await identityResponse;
    assert.equal(identity.status(), 200, '切换后的真实身份接口必须成功');
    const identityBody = await identity.json();
    assert.equal(identityBody.code, 200);
    check(`切换到租户${tenantId}保留原账号且清除原公司部门`, String(identityBody.data?.user?.userId) === originalUserId
      && String(identityBody.data?.user?.tenantId) === String(tenantId) && identityBody.data?.user?.deptId == null);
    await waitFor(async () => await currentTenant() === String(tenantId), '真实切换未更新当前租户身份');
  };
  const withDelayedResponse = async (pattern, matches, start, afterCapture, afterRelease) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let captured = false;
    let finished = false;
    let failure;
    const cancelled = [];
    const onFailure = request => { if (matches(new URL(request.url()))) cancelled.push(request.url()); };
    const handler = async route => {
      if (!matches(new URL(route.request().url()))) return route.continue();
      try {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        assert.equal((await response.json()).code, 200);
        captured = true;
        await gate;
        await route.fulfill({ response });
      } catch (error) { failure = error; }
      finally { finished = true; }
    };
    admin.on('requestfailed', onFailure);
    await admin.route(pattern, handler);
    try {
      await start();
      await waitFor(() => captured || Boolean(failure), '没有捕获待延迟的真实HTTP响应');
      if (failure) throw failure;
      await afterCapture();
      release();
      await waitFor(() => finished, '真实HTTP延迟响应没有释放');
      if (failure) throw failure;
      await pause(350);
      await afterRelease();
      await waitFor(() => cancelled.length > 0, '切换或关闭没有取消旧详情请求');
      check('迟到响应使用真实服务器数据且旧浏览器请求已取消', cancelled.length > 0);
    } finally {
      release();
      await admin.unroute(pattern, handler);
      admin.off('requestfailed', onFailure);
    }
  };

  await navigate(admin, '/hr/employees');
  const listResponse = admin.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/employees'
    && new URL(response.url()).searchParams.get('keyword') === hidden.EMPLOYEE.title);
  await admin.getByPlaceholder('姓名、工号、部门、岗位', { exact: true }).fill(hidden.EMPLOYEE.title);
  const listed = await listResponse;
  assert.equal(listed.status(), 200);
  const employeePage = await listed.json();
  assert.equal(employeePage.code, 200);
  const employeeRows = employeePage.data.rows || employeePage.data.records || [];
  check('员工详情测试的当前列表只含另一员工，不含搜索目标', employeeRows.length === 1
    && String(employeeRows[0].id) === hidden.EMPLOYEE.id && !employeeRows.some(row => String(row.id) === own.EMPLOYEE.id));
  await navigate(admin, own.EMPLOYEE.route);
  await waitFor(async () => await employeeDialog().isVisible() && (await employeeDialog().innerText()).includes(own.EMPLOYEE.title), '列表外员工详情没有打开');
  check('搜索员工不在当前列表时仍展示独立读取的正确详情', !(await employeeDialog().innerText()).includes(hidden.EMPLOYEE.title)
    && await admin.getByPlaceholder('姓名、工号、部门、岗位', { exact: true }).inputValue() === hidden.EMPLOYEE.title);
  await employeeDialog().getByRole('button', { name: '关闭弹窗', exact: true }).click();
  evidence.employeeOutsidePage = true;

  await navigate(admin, '/hr/employees');
  await withDelayedResponse(`**/api${hidden.EMPLOYEE.endpoint}`, address => address.pathname === `/api${hidden.EMPLOYEE.endpoint}`,
    () => navigate(admin, hidden.EMPLOYEE.route),
    async () => {
      await navigate(admin, own.EMPLOYEE.route);
      await waitFor(async () => await employeeDialog().isVisible() && (await employeeDialog().innerText()).includes(own.EMPLOYEE.title), '切换员工目标后详情未更新');
    },
    async () => check('旧员工详情迟到不能覆盖后来选择的搜索目标', (await employeeDialog().innerText()).includes(own.EMPLOYEE.title)
      && !(await employeeDialog().innerText()).includes(hidden.EMPLOYEE.title)));
  await employeeDialog().getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await navigate(admin, '/');
  await withDelayedResponse(`**/api${own.CONTRACT.endpoint}`, address => address.pathname === `/api${own.CONTRACT.endpoint}`,
    () => navigate(admin, own.CONTRACT.route),
    async () => {
      const loadingDialog = admin.getByRole('dialog').filter({ hasText: '正在加载合同详情' });
      await loadingDialog.getByRole('button', { name: '关闭', exact: true }).last().click();
      await loadingDialog.waitFor({ state: 'hidden' });
    },
    async () => check('合同详情加载中关闭后，真实迟到响应不会重新打开窗口', await admin.getByRole('dialog').count() === 0));
  evidence.detailLifecycle = true;

  const adminUserId = String((await currentIdentity())?.id ?? '');
  assert.match(adminUserId, /^[1-9]\d*$/);
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const originalForeignWorkflow = foreignRecords.WORKFLOW_INSTANCE;
  const switchedWorkflowId = `h5s_${caseTag}_switched`;
  const switchedWorkflow = { ...originalForeignWorkflow, id: switchedWorkflowId, title: `${originalForeignWorkflow.title}_switched`,
    number: `H5S_${caseTag}_switched`, route: `/workflow/search-instance/${switchedWorkflowId}`, endpoint: `/workflow/wf/instance/${switchedWorkflowId}` };
  database(`INSERT INTO wf_process_instance (instance_id,tenant_id,process_def_key,definition_id,business_key,title,start_user_id,start_user_name,
    status,start_time,end_time,process_no,dept_id,create_by)
    SELECT ${sql(switchedWorkflow.id)},tenant_id,process_def_key,definition_id,${sql(`search_${caseTag}_switched`)},${sql(switchedWorkflow.title)},
      ${adminUserId},'business-search-switched-fixture',status,start_time,end_time,${sql(switchedWorkflow.number)},dept_id,'business-search-fixture'
    FROM wf_process_instance WHERE tenant_id=100001 AND instance_id=${sql(originalForeignWorkflow.id)};`);
  const switchedRecords = { ...foreignRecords, WORKFLOW_INSTANCE: switchedWorkflow };
  await navigate(admin, '/');
  await admin.evaluate(marker => { window.h5SearchDocumentMarker = marker; }, caseTag);
  let searchControls;
  try {
    await withDelayedResponse('**/api/auth/system/search/business?**', address => address.pathname === '/api/auth/system/search/business'
      && address.searchParams.get('keyword') === own.CUSTOMER.title,
    async () => {
      searchControls = await openSearch(admin);
      await searchControls.field.fill(own.CUSTOMER.title);
    },
    async () => {
      await switchTenant(100001);
      await searchControls.dialog.waitFor({ state: 'hidden' });
    },
    async () => check('真实切换租户立即关闭搜索，旧租户迟到结果不会显示', await admin.getByRole('dialog', { name: '搜索功能', exact: true }).count() === 0
      && !(await admin.locator('body').innerText()).includes(own.CUSTOMER.title)));
    check('切换租户通过真实身份接口完成且没有整页刷新', await admin.evaluate(marker => window.h5SearchDocumentMarker === marker, caseTag));
    const foreignSearch = await query(admin, foreignRecords.CUSTOMER.title);
    console.log(`H5_SEARCH_SWITCHED_GROUPS: ${JSON.stringify(foreignSearch.data)}`);
    const workflowGroup = foreignSearch.data.groups.find(group => group.type === 'WORKFLOW_INSTANCE');
    check('切换公司后流程搜索仍按原发起人及办理范围过滤', workflowGroup?.state === 'AVAILABLE' && workflowGroup.items.length === 1
      && workflowGroup.items[0].id === switchedWorkflow.id && !workflowGroup.items.some(item => item.id === originalForeignWorkflow.id));
    const deniedWorkflow = await api(admin, originalForeignWorkflow.endpoint);
    check(`切换公司不会获得他人流程详情 HTTP=${deniedWorkflow.status} code=${deniedWorkflow.body?.code}`,
      deniedWorkflow.status === 403 && deniedWorkflow.body?.code === 'PERMISSION_DENIED' && deniedWorkflow.body?.data == null);
    const readableWorkflow = successful(await api(admin, switchedWorkflow.endpoint), '切换公司后本人流程原详情');
    check('切换公司后本人流程搜索与原详情范围一致', readableWorkflow.instanceId === switchedWorkflow.id);
    for (const record of Object.values(switchedRecords)) {
      check(`换租户后${record.type}只展示新租户搜索目标`, await foreignSearch.dialog.getByRole('group', { name: groupLabels[record.type], exact: true })
        .getByRole('option').filter({ hasText: record.title }).count() === 1
        && !(await foreignSearch.dialog.innerText()).includes(own[record.type].title));
    }
    await foreignSearch.dialog.getByRole('button', { name: '关闭搜索', exact: true }).click();
  } finally {
    if (await currentTenant() === '100001') await switchTenant(100000);
  }

  const termWriteDenied = await api(admin, '/oa/contract/terms', { method: 'POST', body: {
    contractId: Number(own.CONTRACT.id), termNo: 1, termCategory: 'SERVICE',
    termContent: `搜索草稿保护_${caseTag}`, responsibleParty: 'BOTH',
  } });
  check('保留原合同条款写入的负责人限制，不为草稿测试扩大写权限', termWriteDenied.status === 403
    && termWriteDenied.body?.code === 403 && termWriteDenied.body?.data == null);
  const fixtureTermId = database(`INSERT INTO oa_contract_fulfilment_term (tenant_id,contract_id,term_no,term_category,term_content,responsible_party,create_by)
    VALUES (100000,${own.CONTRACT.id},1,'SERVICE',${sql(`搜索草稿保护_${caseTag}`)},'BOTH','business-search-fixture');
    UPDATE oa_contract SET total_term_count=1 WHERE tenant_id=100000 AND contract_id=${own.CONTRACT.id}; SELECT LAST_INSERT_ID();`);
  assert.match(fixtureTermId, /^[1-9]\d*$/);
  const fixtureTerms = successful(await api(admin, `/oa/contract/${own.CONTRACT.id}/terms`), '真实读取草稿保护用隔离条款');
  check('隔离条款前置通过真实合同接口读取，未替换业务响应', fixtureTerms.length === 1 && String(fixtureTerms[0].termId) === fixtureTermId);
  const storedSelection = () => database(`SELECT COALESCE(portal_term_ids,'NULL') FROM oa_contract WHERE tenant_id=100000 AND contract_id=${own.CONTRACT.id};`);
  const beforeSelection = storedSelection();
  await navigate(admin, own.CONTRACT.route);
  let panel = publicationPanel();
  const choice = () => panel.getByRole('checkbox', { name: '公开条款 1', exact: true });
  await choice().check();
  await navigate(admin, hidden.CONTRACT.route);
  await pause(350);
  const protectedDialog = admin.getByRole('dialog').filter({ hasText: own.CONTRACT.title });
  check('同一身份切换搜索目标时保留当前合同未保存的公开草稿', await protectedDialog.isVisible() && await choice().isChecked()
    && !(await protectedDialog.innerText()).includes(hidden.CONTRACT.title)
    && await protectedDialog.getByRole('button', { name: '关闭', exact: true }).last().isDisabled());
  await panel.getByRole('button', { name: '放弃草稿', exact: true }).click();
  await panel.getByRole('button', { name: '确认放弃本地草稿', exact: true }).click();
  await waitFor(async () => !await choice().isChecked(), '明确放弃后公开草稿未清除');
  await navigate(admin, own.CONTRACT.route);
  panel = publicationPanel();
  await choice().check();
  try {
    await switchTenant(100001);
    await protectedDialog.waitFor({ state: 'hidden' });
    check('真实换租户时合同草稿保护不阻止清除旧身份详情', !(await admin.locator('body').innerText()).includes(own.CONTRACT.title)
      && await admin.getByRole('checkbox', { name: '公开条款 1', exact: true }).count() === 0);
  } finally {
    if (await currentTenant() === '100001') await switchTenant(100000);
  }
  panel = publicationPanel();
  await choice().waitFor();
  check('切回原租户重新鉴权读取合同，丢弃的本地草稿没有写入服务器', !await choice().isChecked() && storedSelection() === beforeSelection);
  await admin.getByRole('dialog').filter({ hasText: own.CONTRACT.title }).getByRole('button', { name: '关闭', exact: true }).last().click();
  evidence.draftProtection = true;
  evidence.tenantSwitch = true;
  console.log('H5_SEARCH_UI_BOUNDARIES: employee_outside_page=true; late_detail=true; close_pending=true; draft_protection=true; tenant_switch=real_auth_http; full_reload=false; api_doubles=0');
}
