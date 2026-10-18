import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  api, check, checks, database, directory, failureSummary, frontendUrl, jsonRows,
  logEvidence, openSessions, pause, prefix, registerLogMarker, saveFixture, saveResult,
  sqlText, success,
} from './batch-h/live-lib.mjs';

const route = '/workflow/wf';
const artifact = 'drafts-ui';
const fixture = { runId: randomUUID(), definitionIds: [], draftIds: [] };
const coverage = [];
const uiRequests = [];
const observations = [];
const pendingResponses = new Set();
const browserLeaks = [];
const browserErrors = [];
const timings = {};
const excluded = [
  'C子表及高级字段；本轮仅现有九类字段和只读默认值',
  '真实浏览器计时允许250毫秒调度误差，不证明零误差的严格5000/30000毫秒上界',
  '30天真实到期、清理任务竞争、首节点及删除故障注入、响应丢失和断网',
  '新建草稿同时冲突、提交与保存竞争、重复提交及用户/租户切换；双窗口仅验已有草稿同版本保存竞争',
  '日志仅查本次标记、三张日志表及本批次六服务out/err文件；不涵盖外部采集器、轮转归档和普通日志开关回归',
  '桌面Chromium；不覆盖移动端、其他浏览器、关闭浏览器后继续保存',
];
let sessions;
let stage = '初始化';
let failure;
let formContext;
let expected;
let references;
let approvalName;
let workflowName;
let browserAction;

function verify(label, condition, details) {
  check(label, condition, details);
  coverage.push(label);
}

async function waitFor(operation, predicate, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await operation();
    if (predicate(result)) return result;
    await pause(50);
  }
  const error = new Error(label);
  error.hAcceptance = true;
  error.code = 'H_UI_WAIT_TIMEOUT';
  throw error;
}

function request(actor, suffix, body, method = 'POST') {
  return api(sessions[actor].page, `${route}${suffix}`, { method, ...(body === undefined ? {} : { body }) });
}

function draftRows() {
  return jsonRows(`SELECT JSON_OBJECT('draftId',draft_id,'version',lock_version,'title',title,
    'values',CAST(form_data AS JSON),'assignees',CAST(node_assignees AS JSON),
    'lastSaveTime',DATE_FORMAT(last_save_time,'%Y-%m-%d %H:%i:%s'),
    'expireTime',DATE_FORMAT(expire_time,'%Y-%m-%d %H:%i:%s'),
    'updateTime',DATE_FORMAT(update_time,'%Y-%m-%d %H:%i:%s'),
    'retentionSeconds',TIMESTAMPDIFF(SECOND,last_save_time,expire_time)) FROM wf_form_draft
    WHERE tenant_id=${sqlText(sessions.employee5.account.tenantId)}
    AND user_id=${sqlText(sessions.employee5.account.userId)}
    AND definition_id=${sqlText(fixture.definitionIds[0])}`);
}

function editor(page) {
  return page.getByRole('dialog', { name: `发起流程 · ${workflowName}`, exact: true });
}

function field(page, identifier) {
  return editor(page).locator(`#field-${identifier}`);
}

async function nextSave(index, label) {
  return waitFor(() => observations.slice(index).find(entry => entry.label === label && entry.result), Boolean, '等待真实界面保存响应');
}

async function saved(page) {
  await waitFor(() => editor(page).getByRole('status').allTextContents(),
    contents => contents.some(content => /^已保存 /.test(content)), '等待界面确认已保存');
}

async function manualSave(page, label) {
  const index = observations.length;
  await editor(page).getByRole('button', { name: '保存草稿', exact: true }).click();
  const entry = await nextSave(index, label);
  success(entry.result, '真实界面手动保存');
  await saved(page);
  return entry;
}

async function launch(page, restore = false, refresh = false) {
  browserAction = '进入流程发起页';
  if (refresh) await page.reload({ waitUntil: 'domcontentloaded' });
  else await page.goto('/workplace', { waitUntil: 'domcontentloaded' });
  browserAction = '填写流程目录搜索';
  await page.getByPlaceholder('流程模型名称、Key、描述信息').fill(workflowName);
  browserAction = '打开指定流程';
  await page.getByRole('button').filter({ hasText: workflowName }).click();
  browserAction = '等待草稿编辑弹窗';
  await editor(page).waitFor({ state: 'visible' });
  if (restore) {
    browserAction = '恢复已保存草稿';
    await editor(page).getByRole('button', { name: '恢复草稿', exact: true }).click();
    await saved(page);
  }
  browserAction = '等待草稿标题可编辑';
  await waitFor(() => editor(page).getByPlaceholder('可选，最多200字').isEnabled(), Boolean, '等待草稿可编辑');
  browserAction = undefined;
}

async function choose(page, identifier, name) {
  await field(page, identifier).getByRole('combobox').click();
  const picker = page.getByRole('dialog', { name: `选择${references[identifier].kind}`, exact: true });
  await picker.getByRole('searchbox').fill(name);
  await picker.getByRole('option').filter({ has: page.getByText(name, { exact: true }) }).first().click();
  await waitFor(() => field(page, identifier).getByRole('combobox').textContent(),
    content => content?.includes(name), `等待${identifier}显示选择结果`);
}

async function assertRestored(page, title, label) {
  verify(`${label}标题恢复`, await editor(page).getByPlaceholder('可选，最多200字').inputValue() === title);
  verify(`${label}文字数字日期选项多行文字恢复`,
    await field(page, 'text').locator('input').inputValue() === expected.text
    && Number(await field(page, 'number').locator('input').inputValue()) === expected.number
    && await field(page, 'date').locator('input[type="hidden"]').inputValue() === expected.date
    && (await field(page, 'date').getByRole('button').textContent()).includes(expected.date.replaceAll('-', '/'))
    && (await field(page, 'option').getByRole('button').textContent()).includes(expected.option)
    && await field(page, 'note').locator('textarea').inputValue() === expected.note);
  const displayed = await Promise.all(Object.keys(references).map(async identifier =>
    (await field(page, identifier).getByRole('combobox').textContent()).includes(references[identifier].name)));
  verify(`${label}员工部门岗位职位名称恢复`, displayed.every(Boolean));
  verify(`${label}审批人及只读默认值恢复`,
    (await editor(page).getByRole('combobox', { name: '请选择审批人', exact: true }).textContent()).includes(approvalName)
    && (await field(page, 'fixed').textContent()).includes('固定值')
    && await field(page, 'fixed').locator('input,textarea,[role="combobox"]').count() === 0);
}

async function prepare() {
  sessions = await openSessions(['admin1', 'employee5', 'sales8', 'tenantPeer5']);
  const queries = {
    employee: ["SELECT JSON_OBJECT('id',CAST(id AS CHAR),'name',name) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND employee_status NOT IN ('RESIGNED','LEFT','TERMINATED','SUSPENDED') ORDER BY id LIMIT 1", '员工'],
    department: ["SELECT JSON_OBJECT('id',CAST(dept_id AS CHAR),'name',dept_name) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 1", '部门'],
    post: ["SELECT JSON_OBJECT('id',CAST(post_id AS CHAR),'name',post_name) FROM sys_post WHERE tenant_id=100000 AND status='0' ORDER BY post_id LIMIT 1", '岗位'],
    position: ["SELECT JSON_OBJECT('id',CAST(id AS CHAR),'name',position_name) FROM hr_position WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1", '职位'],
  };
  references = Object.fromEntries(Object.entries(queries).map(([identifier, [statement, kind]]) =>
    [identifier, { ...jsonRows(statement)[0], kind }]));
  verify('九类字段引用现有本租户资料', Object.values(references).every(reference => reference.id && reference.name));
  const fields = [
    { id: 'text', type: 'TEXT', label: '必填文字', required: true },
    { id: 'number', type: 'NUMBER', label: '数字' }, { id: 'date', type: 'DATE', label: '日期' },
    { id: 'option', type: 'SELECT', label: '选项', options: ['甲', '乙'] },
    { id: 'note', type: 'TEXTAREA', label: '多行文字' },
    { id: 'employee', type: 'EMPLOYEE', label: '员工' }, { id: 'department', type: 'DEPT', label: '部门' },
    { id: 'post', type: 'POST', label: '岗位' }, { id: 'position', type: 'POSITION', label: '职位' },
    { id: 'fixed', type: 'TEXT', label: '只读默认值', readonly: true, defaultValue: '固定值' },
  ];
  workflowName = `${prefix} UI草稿 ${fixture.runId.slice(0, 8)}`;
  fixture.formId = success(await request('admin1', '/form/save', {
    formKey: `h_draft_ui_${fixture.runId}`, formName: workflowName, fieldsJson: JSON.stringify(fields), status: 'PUBLISHED',
  }), '真实接口创建独立九类字段表单');
  await saveFixture(artifact, fixture);
  const definition = success(await request('admin1', '/definition/save', {
    processKey: `h_draft_ui_${fixture.runId}`, processName: workflowName, formId: fixture.formId,
    modelJson: JSON.stringify({ nodes: [
      { id: 'start', type: 'START', title: '发起' },
      { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'INITIATOR_SELECTED', selectableScope: { roleIds: [8] } },
      { id: 'end', type: 'END', title: '结束' },
    ], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }),
    startPermissionType: 'ALL', startPermissionValue: '[]',
  }), '真实接口创建独立流程');
  fixture.definitionIds.push(definition.id);
  await saveFixture(artifact, fixture);
  success(await request('admin1', `/definition/deploy/${definition.id}`), '发布独立流程');
  formContext = success(await request('employee5', `/draft/context/${definition.id}`, undefined, 'GET'), '读取独立表单和审批范围');
  approvalName = formContext.assigneeNodes.find(node => node.nodeKey === 'approval')?.candidates
    .find(candidate => candidate.userId === sessions.sales8.account.userId)?.userName;
  verify('表单十字段含九类型且指定审批人可选', formContext.formDefinition.fields.length === 10
    && new Set(formContext.formDefinition.fields.map(entry => entry.type)).size === 9 && Boolean(approvalName));
  await observe(sessions.employee5.page, 'main');
}

async function catalogRows(actor) {
  const rows = [];
  let pageNum = 1;
  let total;
  do {
    const result = success(await request(actor, `/startable-definitions?pageNum=${pageNum}&pageSize=100`, undefined, 'GET'), '按本人权限读取流程目录');
    rows.push(...result.rows);
    total = result.total;
    if (result.rows.length === 0) break;
    pageNum += 1;
  } while ((pageNum - 1) * 100 < total);
  return rows;
}

async function catalogChecks() {
  stage = '员工发起目录权限与最小数据';
  const managed = await request('employee5', '/definitions', undefined, 'GET');
  verify('员工仍无流程定义管理列表权限', managed.status === 403 && managed.body?.code === 403);
  const rows = await catalogRows('employee5');
  const allowed = new Set(['definitionId', 'processKey', 'processName', 'version', 'formId', 'category', 'tags', 'description', 'modelValid']);
  verify('员工发起目录包含本人可发起流程', rows.some(row => row.definitionId === fixture.definitionIds[0] && row.modelValid));
  verify('发起目录不返回完整模型或审批权限配置', rows.every(row => Object.keys(row).every(key => allowed.has(key))));
  verify('跨租户目录不包含本租户流程', !(await catalogRows('tenantPeer5')).some(row => fixture.definitionIds.includes(row.definitionId)));
  for (const identifier of Object.keys(references)) {
    const options = success(await request('employee5', `/draft/context/${fixture.definitionIds[0]}/references/${identifier}?pageNum=1&pageSize=100`, undefined, 'GET'), '本人流程字段的最小参考选项');
    verify(`${references[identifier].kind}选项仅返回编号名称且精确包含本租户引用`, options.rows.some(option => option.id === references[identifier].id && option.label === references[identifier].name)
      && options.rows.every(option => typeof option.id === 'string' && Object.keys(option).every(key => ['id', 'label', 'departmentId'].includes(key))));
  }
  const deniedField = await request('employee5', `/draft/context/${fixture.definitionIds[0]}/references/fixed`, undefined, 'GET');
  verify('普通文本字段不可枚举人员参考选项', deniedField.status === 400 && deniedField.body?.code === 'DRAFT_REFERENCE_UNAVAILABLE');
  const foreignField = await request('tenantPeer5', `/draft/context/${fixture.definitionIds[0]}/references/employee`, undefined, 'GET');
  verify('跨租户不能枚举他人流程中的字段选项', foreignField.status >= 400 && foreignField.status < 500 && !foreignField.body?.data);
  const supplied = {
    processKey: `h_catalog_${fixture.runId}`, processName: `${workflowName} 目录权限`,
    modelJson: JSON.stringify({ nodes: [{ id: 'start', type: 'START', title: '开始' }, { id: 'end', type: 'END', title: '结束' }],
      edges: [{ source: 'start', target: 'end' }] }), startPermissionType: 'ALL', startPermissionValue: '[]',
  };
  const first = success(await request('admin1', '/definition/save', supplied), '创建目录权限测试流程');
  fixture.definitionIds.push(first.id);
  await saveFixture(artifact, fixture);
  success(await request('admin1', `/definition/deploy/${first.id}`), '发布目录权限初始版本');
  const next = success(await request('admin1', '/definition/save', { ...supplied,
    startPermissionType: 'USER', startPermissionValue: JSON.stringify([sessions.admin1.account.userId]),
  }), '创建限制发起人的新版草稿');
  fixture.definitionIds.push(next.id);
  await saveFixture(artifact, fixture);
  const before = (await catalogRows('employee5')).filter(row => row.processKey === supplied.processKey);
  verify('未发布的新版本不遮蔽当前已发布版本', before.length === 1 && before[0].definitionId === first.id);
  success(await request('admin1', `/definition/deploy/${next.id}`), '发布受限的新版本');
  verify('新版撤销资格后不能回退旧版本进入目录', !(await catalogRows('employee5')).some(row => row.processKey === supplied.processKey));
  const administrative = (await catalogRows('admin1')).filter(row => row.processKey === supplied.processKey);
  verify('目录每个流程只返回最新已发布版本', administrative.length === 1 && administrative[0].definitionId === next.id);
}

async function restoreChecks() {
  stage = '必填未填手动保存';
  const page = sessions.employee5.page;
  await launch(page);
  const title = `${workflowName} 恢复标题`;
  await editor(page).getByPlaceholder('可选，最多200字').fill(title);
  const partial = await manualSave(page, 'main');
  verify('必填和审批人未填仍可点击保存草稿', !partial.supplied.formData.text
    && Object.keys(partial.supplied.nodeAssignees || {}).length === 0
    && partial.result.body.data.changed === true && draftRows().length === 1);
  const beforeInvalidSubmit = draftRows();
  await editor(page).getByRole('button', { name: '提交申请', exact: true }).click();
  await field(page, 'text').getByRole('alert').waitFor();
  verify('界面提交必填校验失败且草稿完整保留', JSON.stringify(draftRows()) === JSON.stringify(beforeInvalidSubmit));
  stage = '未完成草稿刷新恢复';
  await launch(page, true, true);
  verify('未完成草稿刷新后标题及空必填恢复', await editor(page).getByPlaceholder('可选，最多200字').inputValue() === title
    && await field(page, 'text').locator('input').inputValue() === '');
  const marker = registerLogMarker('真实界面九类字段正文');
  expected = { text: marker, number: 12.5, option: '甲', note: marker,
    ...Object.fromEntries(Object.entries(references).map(([identifier, reference]) => [identifier, reference.id])) };
  stage = '九类字段真实控件填写';
  await field(page, 'number').locator('input').fill(String(expected.number));
  await field(page, 'date').getByRole('button').click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  expected.date = await field(page, 'date').locator('input[type="hidden"]').inputValue();
  await field(page, 'option').getByRole('button').click();
  await page.getByRole('option', { name: expected.option, exact: true }).click();
  await field(page, 'note').locator('textarea').fill(expected.note);
  for (const [identifier, reference] of Object.entries(references)) {
    stage = `选择${reference.kind}`;
    await choose(page, identifier, reference.name);
  }
  stage = '选择审批人';
  await editor(page).getByRole('combobox', { name: '请选择审批人', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '请选择审批人', exact: true });
  await picker.getByRole('searchbox').fill(approvalName);
  await picker.getByRole('option').filter({ has: page.getByText(approvalName, { exact: true }) }).first().click();
  await field(page, 'text').locator('input').fill(expected.text);
  await manualSave(page, 'main');
  const row = draftRows()[0];
  verify('九类字段真实控件值及审批人精确落库', Object.entries(expected).every(([identifier, value]) =>
    String(row.values[identifier]) === String(value)) && row.values.fixed === '固定值'
    && String(row.assignees.approval?.[0]) === sessions.sales8.account.userId,
    { mismatchedFields: Object.entries(expected).filter(([identifier, value]) => String(row.values[identifier]) !== String(value)).map(([identifier]) => identifier),
      defaultMatches: row.values.fixed === '固定值', approverMatches: String(row.assignees.approval?.[0]) === sessions.sales8.account.userId });
  verify('有效保存保留期为2592000秒', row.retentionSeconds === 2592000);
  stage = '完整草稿刷新恢复';
  await launch(page, true, true);
  await assertRestored(page, title, '刷新后');
  stage = '草稿列表继续填写';
  await editor(page).getByRole('button', { name: /^我的草稿/ }).click();
  await page.waitForURL('**/workflow/drafts');
  await page.getByPlaceholder('流程名称或申请标题').fill(workflowName);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  const listed = page.getByRole('row').filter({ hasText: workflowName });
  await listed.getByText('可继续', { exact: true }).waitFor();
  verify('真实草稿列表显示标题保存时间及到期时间', (await listed.textContent()).includes(title)
    && (await listed.textContent()).includes(row.lastSaveTime) && (await listed.textContent()).includes(row.expireTime));
  await listed.getByRole('button', { name: '继续填写', exact: true }).click();
  await saved(page);
  await assertRestored(page, title, '列表继续填写后');
}

async function timingChecks() {
  const page = sessions.employee5.page;
  stage = '5秒变更自动保存';
  const before = draftRows()[0];
  const index = observations.length;
  expected.text += '-五秒';
  await field(page, 'text').locator('input').fill(expected.text);
  const editAt = await page.evaluate(() => window.__hDraftUiObservations.at(-1).at);
  await pause(4500);
  verify('变更4500毫秒观察点尚未触发保存', observations.length === index);
  const entry = await nextSave(index, 'main');
  success(entry.result, '5秒自动保存');
  await saved(page);
  timings.debounceMs = Math.round(entry.browserStartAt - editAt);
  verify('变更后5000毫秒触发保存（调度容差250毫秒）', timings.debounceMs >= 5000 && timings.debounceMs <= 5250,
    { elapsedMs: timings.debounceMs, toleranceMs: 250 });
  verify('5秒自动保存新值及版本写入真实数据库', draftRows()[0].values.text === expected.text
    && draftRows()[0].version === before.version + 1);
  stage = '连续编辑30秒自动保存';
  const continuousIndex = observations.length;
  const beforeContinuous = draftRows()[0];
  const edits = [];
  const startedAt = Date.now();
  for (let editIndex = 0; editIndex <= 16; editIndex++) {
    await pause(Math.max(0, startedAt + editIndex * 2000 - Date.now()));
    expected.text = `连续编辑-${fixture.runId}-${editIndex}`;
    await field(page, 'text').locator('input').fill(expected.text);
    edits.push(await page.evaluate(() => window.__hDraftUiObservations.at(-1).at));
  }
  const maximum = await nextSave(continuousIndex, 'main');
  success(maximum.result, '连续编辑上限自动保存');
  timings.continuousMs = Math.round(maximum.browserStartAt - edits[0]);
  timings.maximumEditGapMs = Math.round(Math.max(...edits.slice(1).map((at, offset) => at - edits[offset])));
  timings.editCount = edits.length;
  const priorEdit = edits.findLast(at => at <= maximum.browserStartAt);
  verify('持续编辑间隔不足5秒且保存时仍在编辑', timings.maximumEditGapMs < 5000
    && edits.at(-1) > maximum.browserStartAt && maximum.browserStartAt - priorEdit < 5000,
    { maximumEditGapMs: timings.maximumEditGapMs, editCount: edits.length });
  verify('持续编辑30000毫秒触发保存（调度容差250毫秒）', timings.continuousMs >= 30000 && timings.continuousMs <= 30250,
    { elapsedMs: timings.continuousMs, toleranceMs: 250 });
  verify('持续编辑期间真实数据库已保存中间值', draftRows()[0].version === beforeContinuous.version + 1
    && draftRows()[0].values.text === maximum.supplied.formData.text);
  await nextSave(observations.indexOf(maximum) + 1, 'main');
  await saved(page);
  verify('停止连续编辑后最终值自动保存', draftRows()[0].values.text === expected.text);
  stage = '无变化35秒不续期';
  const idleSnapshot = draftRows();
  const idleIndex = observations.length;
  const idleAt = Date.now();
  await pause(35000);
  timings.idleMs = Date.now() - idleAt;
  verify('无变化35秒不请求不写库不续期', observations.length === idleIndex
    && JSON.stringify(draftRows()) === JSON.stringify(idleSnapshot)
    && await editor(page).getByRole('button', { name: '保存草稿', exact: true }).isDisabled(), { observedMs: timings.idleMs });
}

async function concurrentChecks() {
  stage = '同身份双窗口保存竞争';
  const page = sessions.employee5.page;
  const second = await sessions.employee5.context.newPage();
  await observe(second, 'second');
  await launch(second, true);
  const initial = draftRows()[0];
  const index = observations.length;
  await Promise.all([
    field(page, 'text').locator('input').fill('双窗口甲'),
    field(second, 'text').locator('input').fill('双窗口乙'),
  ]);
  await Promise.all([
    editor(page).getByRole('button', { name: '保存草稿', exact: true }).click(),
    editor(second).getByRole('button', { name: '保存草稿', exact: true }).click(),
  ]);
  const race = await Promise.all([nextSave(index, 'main'), nextSave(index, 'second')]);
  const successful = race.filter(entry => entry.result.status === 200 && entry.result.body?.code === 200);
  verify('双窗口使用同一草稿同一旧版本竞争且仅一方成功', race.every(entry =>
    entry.supplied.draftId === initial.draftId && entry.supplied.expectedVersion === initial.version)
    && successful.length === 1);
  const loser = race.find(entry => entry !== successful[0]);
  const rejected = loser.result;
  verify('过期版本返回明确草稿冲突', rejected.status !== 429
    && (rejected.status >= 400 && rejected.status < 500 || rejected.body?.code !== 200)
    && /DRAFT_CONFLICT|版本|冲突/.test(`${rejected.body?.code} ${rejected.body?.msg || rejected.body?.message}`));
  const losingPage = loser.label === 'main' ? page : second;
  await editor(losingPage).getByRole('alert').filter({ hasText: /其他窗口|冲突|版本|更新/ }).waitFor();
  verify('冲突界面保留本窗口输入并阻止覆盖', await field(losingPage, 'text').locator('input').inputValue() === loser.supplied.formData.text
    && await editor(losingPage).getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
  const rows = draftRows();
  verify('双窗口竞争后仅一行且只递增一次版本', rows.length === 1 && rows[0].version === initial.version + 1
    && rows[0].values.text === successful[0].supplied.formData.text);
  const afterRace = observations.length;
  await pause(6000);
  verify('冲突后自动保存不重试覆盖赢家', observations.length === afterRace && JSON.stringify(draftRows()) === JSON.stringify(rows));
  await storageCheck(page);
  await storageCheck(second);
  await second.close();
  await page.goto('/workplace', { waitUntil: 'domcontentloaded' });
}

async function storageCheck(page) {
  const markers = logEvidence().markers.map(entry => entry.marker);
  const stored = await page.evaluate(sensitive => {
    const contains = storage => Object.values(storage).some(value => sensitive.some(marker => value.includes(marker)));
    return { local: contains(localStorage), session: contains(sessionStorage) };
  }, markers);
  verify('草稿敏感正文未写入浏览器持久和会话存储', !stored.local && !stored.session);
}

async function sensitiveRejections() {
  stage = '敏感失败路径真实接口';
  const row = draftRows()[0];
  const baseline = JSON.stringify(draftRows());
  const command = { definitionId: fixture.definitionIds[0], draftId: row.draftId, expectedVersion: row.version,
    loadedContextHash: formContext.contextHash, title: row.title, formData: row.values, nodeAssignees: row.assignees };
  for (const kind of ['非法JSON', '类型错误', '超长标题', '草稿提交混传正文']) {
    const marker = registerLogMarker(kind);
    let result;
    if (kind === '非法JSON') {
      result = await api(sessions.employee5.page, `${route}/draft`, { method: 'POST',
        rawBody: `{"definitionId":"${fixture.definitionIds[0]}","formData":{"text":"${marker}",}}` });
    } else if (kind === '类型错误') {
      result = await request('employee5', '/draft', { ...command, expectedVersion: { invalid: marker } });
    } else if (kind === '超长标题') {
      result = await request('employee5', '/draft', { ...command, title: marker.padEnd(201, '超') });
    } else {
      result = await request('employee5', '/start', { draftId: row.draftId, expectedVersion: row.version, variables: { note: marker } });
    }
    verify(`${kind}真实请求明确拒绝且响应不回显标记`,
      (result.status >= 400 && result.status < 500 && result.status !== 429
        || result.status === 200 && result.body?.code != null && result.body.code !== 200)
      && /INVALID|REJECTED|VALIDATION|参数|格式|类型|长度|草稿|混|请求/.test(`${result.body?.code} ${result.body?.msg || result.body?.message}`)
      && !JSON.stringify(result).includes(marker));
  }
  verify('四类敏感失败请求不改变原草稿', JSON.stringify(draftRows()) === baseline);
}

async function scanLogs() {
  stage = '敏感日志只读核验';
  await pause(3000);
  const sensitive = logEvidence();
  for (const [table, columns] of [
    ['sys_log', ['params', 'exception']],
    ['sys_api_error_log', ['request_params', 'exception_message', 'exception_stack']],
    ['sys_audit_log', ['before_val', 'after_val', 'before_json', 'after_json', 'diff_json']],
  ]) {
    const predicate = sensitive.markers.flatMap(entry => columns.map(column =>
      `LOCATE(${sqlText(entry.marker)},COALESCE(${column},''))>0`)).join(' OR ');
    verify(`持久化${table}未记录五类草稿敏感标记`, sensitive.markers.length === 5
      && Number(database(`SELECT COUNT(*) FROM ${table} WHERE ${predicate}`)) === 0);
  }
  const scanned = [];
  const services = new Set();
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const matched = /^(gateway|auth|workflow|oa|crm|hr)-.*\.(out|err)\.log$/.exec(entry.name);
    if (!entry.isFile() || !matched) continue;
    const contents = await fs.readFile(path.join(directory, entry.name), 'utf8');
    scanned.push({ name: entry.name, bytes: Buffer.byteLength(contents) });
    if (contents.length > 0) services.add(matched[1]);
    verify(`服务日志无本轮草稿正文 ${entry.name}`, sensitive.markers.every(item => !contents.includes(item.marker)));
  }
  verify('六服务日志均有真实非空文件并完成扫描', services.size === 6, { files: scanned });
  verify('真实双窗口控制台及异常日志无敏感标记', browserLeaks.length === 0 && sensitive.browserLeaks.length === 0);
  verify('真实界面运行无未捕获异常', browserErrors.length === 0, { errors: browserErrors });
}

async function observe(page, label) {
  await page.addInitScript(() => {
    window.__hDraftUiObservations = [];
    document.addEventListener('input', event => {
      const identifier = event.target.closest?.('[id^="field-"]')?.id;
      if (identifier === 'field-text') {
        window.__hDraftUiObservations.push({ identifier, at: performance.timeOrigin + performance.now() });
      }
    }, true);
  });
  const inspect = (content, source) => {
    for (const entry of logEvidence().markers) {
      if (content.includes(entry.marker)) browserLeaks.push({ label, source, markerLabel: entry.label });
    }
  };
  page.on('console', message => inspect(message.text(), `console:${message.type()}`));
  page.on('pageerror', error => {
    inspect(error.message, 'pageerror');
    browserErrors.push({ label, type: error.name });
  });
  const byRequest = new WeakMap();
  page.on('request', outgoing => {
    const url = new URL(outgoing.url());
    if (url.origin !== frontendUrl || url.pathname !== '/api/workflow/wf/draft' || outgoing.method() !== 'POST') return;
    let supplied;
    try { supplied = outgoing.postDataJSON(); } catch { return; }
    if (!fixture.definitionIds.includes(supplied?.definitionId)) return;
    const entry = { label, sentAt: Date.now(), supplied, metadata: { method: 'POST', path: url.pathname } };
    observations.push(entry);
    byRequest.set(outgoing, entry);
  });
  page.on('response', response => {
    const entry = byRequest.get(response.request());
    if (!entry) return;
    const pending = (async () => {
      try {
        const payload = await response.json();
        entry.browserStartAt = response.request().timing().startTime;
        entry.result = { status: response.status(), body: payload };
        entry.metadata.status = response.status();
        entry.metadata.code = /^[A-Z0-9_-]{1,64}$/.test(String(payload?.code)) ? payload.code : null;
        entry.metadata.expectedVersion = entry.supplied.expectedVersion;
        entry.metadata.resultVersion = payload?.data?.lockVersion;
        entry.metadata.changed = payload?.data?.changed;
        const draftId = payload?.data?.draftId;
        if (draftId && !fixture.draftIds.includes(draftId)) fixture.draftIds.push(draftId);
        uiRequests.push({ ...entry.metadata, label, sentAt: entry.sentAt });
      } catch {
        entry.result = { status: response.status(), body: null };
        uiRequests.push({ ...entry.metadata, label, unreadable: true });
      }
    })();
    pendingResponses.add(pending);
    void pending.finally(() => pendingResponses.delete(pending));
  });
}

try {
  await prepare();
  await catalogChecks();
  await restoreChecks();
  await timingChecks();
  await concurrentChecks();
  await sensitiveRejections();
  verify('全部保存及失败提交未生成流程实例', Number(database(`SELECT COUNT(*) FROM wf_process_instance
    WHERE definition_id=${sqlText(fixture.definitionIds[0])}`)) === 0);
  await scanLogs();
  stage = '完成';
} catch (error) {
  failure = error;
  const operation = /^[A-Za-z.]+:/.exec(String(error?.message || ''))?.[0];
  console.log(JSON.stringify({ stage, browserAction, operation, ...failureSummary(error), errorType: error?.name }));
  if (sessions?.employee5?.page && ['/workplace', '/workflow/drafts'].includes(new URL(sessions.employee5.page.url()).pathname)) {
    await sessions.employee5.page.screenshot({ path: path.join(directory, 'private', 'drafts-ui-failure.png') }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  try {
    await sessions?.browser.close();
    await Promise.allSettled([...pendingResponses]);
  } catch (error) {
    failure ||= error;
    process.exitCode = 1;
  }
  try {
    await saveFixture(artifact, fixture);
    await saveResult(artifact, failure, { fixture, stage, browserAction, businessChecks: coverage.length,
      totalChecks: checks.length, timings, uiRequests, excluded,
      safety: { realBrowser: true, mockedResponses: false, modifiedClock: false, businessWrites: '真实API', businessDatabase: '只读SELECT' } });
    console.log(`${failure ? 'FAIL' : 'PASS'} H草稿真实浏览器 ${coverage.length} 项业务检查；总检查 ${checks.length} 项`);
  } catch (error) {
    console.log(JSON.stringify({ stage: '验收结果落盘', ...failureSummary(error) }));
    process.exitCode = 1;
  }
}
