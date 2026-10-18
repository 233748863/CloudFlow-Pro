import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  api, businessBlocked, check, checks, database, directory, failureSummary, jsonRows, logEvidence,
  openSessions, pause, prefix, registerLogMarker, saveFixture, saveResult, sqlText, success,
} from './batch-h/live-lib.mjs';

const route = '/workflow/wf';
let sessions;
const fixture = { runId: randomUUID(), definitionIds: [], draftIds: [] };

async function request(actor, suffix, body, method = 'POST') {
  return api(sessions[actor].page, `${route}${suffix}`, { method, ...(body === undefined ? {} : { body }) });
}

async function createDefinition(formId, keySuffix, selectable = true) {
  const nodes = [
    { id: 'start', type: 'START', title: '发起' },
    { id: 'approval', type: 'APPROVAL', title: '审批', approverType: selectable ? 'INITIATOR_SELECTED' : 'USER',
      ...(selectable ? { selectableScope: { roleIds: [8] } } : { approverIds: [sessions.sales8.account.userId] }) },
    { id: 'end', type: 'END', title: '结束' },
  ];
  const definition = success(await request('admin1', '/definition/save', {
    processKey: `h_draft_${fixture.runId.slice(0, 8)}_${keySuffix}`, processName: `${prefix} 草稿联验 ${keySuffix}`,
    formId, modelJson: JSON.stringify({ nodes, edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] }),
    startPermissionType: 'ALL', startPermissionValue: '[]',
  }), '创建验收流程定义');
  fixture.definitionIds.push(definition.id);
  await saveFixture('drafts', fixture);
  success(await request('admin1', `/definition/deploy/${definition.id}`), '发布验收流程定义');
  return definition.id;
}

function ownedDraft(draftId) {
  return jsonRows(`SELECT JSON_OBJECT('version',lock_version,'expireTime',DATE_FORMAT(expire_time,'%Y-%m-%d %H:%i:%s'),
    'lastSaveTime',DATE_FORMAT(last_save_time,'%Y-%m-%d %H:%i:%s')) FROM wf_form_draft
    WHERE tenant_id=100000 AND user_id=${sqlText(sessions.employee5.account.userId)} AND draft_id=${sqlText(draftId)}`)[0];
}

async function run() {
  sessions = await openSessions(['admin1', 'employee5', 'peer5', 'sales8', 'tenantPeer5']);
  const references = {
    employee: jsonRows("SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND employee_status NOT IN ('RESIGNED','LEFT','TERMINATED','SUSPENDED') ORDER BY id LIMIT 1")[0]?.id,
    department: jsonRows("SELECT JSON_OBJECT('id',CAST(dept_id AS CHAR)) FROM sys_dept WHERE tenant_id=100000 AND deleted=0 AND status='0' ORDER BY dept_id LIMIT 1")[0]?.id,
    post: jsonRows("SELECT JSON_OBJECT('id',CAST(post_id AS CHAR)) FROM sys_post WHERE tenant_id=100000 AND status='0' ORDER BY post_id LIMIT 1")[0]?.id,
    position: jsonRows('SELECT JSON_OBJECT(\'id\',CAST(id AS CHAR)) FROM hr_position WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1')[0]?.id,
  };
  check('九类字段引用有效的本租户基础资料', Object.values(references).every(Boolean));
  const fields = [
    { id: 'text', type: 'TEXT', required: true }, { id: 'number', type: 'NUMBER' },
    { id: 'date', type: 'DATE' }, { id: 'option', type: 'SELECT', options: ['甲', '乙'] },
    { id: 'note', type: 'TEXTAREA' }, { id: 'employee', type: 'EMPLOYEE' },
    { id: 'department', type: 'DEPT' }, { id: 'post', type: 'POST' }, { id: 'position', type: 'POSITION' },
    { id: 'fixed', type: 'TEXT', readonly: true, defaultValue: '固定值' },
  ];
  fixture.formId = success(await request('admin1', '/form/save', {
    formKey: `h_draft_${fixture.runId}`, formName: `${prefix} 九类字段草稿联验`, fieldsJson: JSON.stringify(fields), status: 'PUBLISHED',
  }), '创建九类字段表单');
  const definitionId = await createDefinition(fixture.formId, 'main');
  const context = success(await request('employee5', `/draft/context/${definitionId}`, undefined, 'GET'), '读取草稿上下文');
  check('上下文包含九类字段与审批人候选', context.formDefinition.fields.length === 10
    && context.assigneeNodes.some(node => node.nodeKey === 'approval'));
  const marker = registerLogMarker('草稿九类字段敏感正文');
  let command = { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash,
    title: `${prefix} 九类字段恢复`, formData: {}, nodeAssignees: {} };
  let saved = success(await request('employee5', '/draft', command), '必填缺失保存草稿');
  fixture.draftIds.push(saved.draftId);
  await saveFixture('drafts', fixture);
  check('草稿保存不生成流程实例', Number(database(`SELECT COUNT(*) FROM wf_process_instance WHERE definition_id=${sqlText(definitionId)}`)) === 0);
  const partial = ownedDraft(saved.draftId);
  businessBlocked(await request('employee5', '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }),
    /FORM_INVALID_DATA|VALIDATION_ERROR|REQUEST_REJECTED|必填|校验/, '必填缺失提交被拒绝');
  check('提交失败草稿及版本完整保留', ownedDraft(saved.draftId)?.version === partial.version);
  command = { ...command, draftId: saved.draftId, expectedVersion: saved.lockVersion,
    formData: { text: marker, number: 12.5, date: '2026-09-14', option: '甲', note: marker, ...references },
    nodeAssignees: { approval: [sessions.sales8.account.userId] } };
  saved = success(await request('employee5', '/draft', command), '保存九类字段');
  command.expectedVersion = saved.lockVersion;
  const detail = success(await request('employee5', `/draft/${saved.draftId}`, undefined, 'GET'), '恢复九类字段');
  check('九类字段、只读默认值及审批人精确恢复', Object.entries(command.formData).every(([key, value]) => String(detail.formData[key]) === String(value))
    && detail.formData.fixed === '固定值' && detail.nodeAssignees.approval[0] === sessions.sales8.account.userId);
  const beforeUnchanged = ownedDraft(saved.draftId);
  const unchanged = success(await request('employee5', '/draft', command), '无变化保存');
  check('无变化保存不写库不续期', unchanged.changed === false && JSON.stringify(ownedDraft(saved.draftId)) === JSON.stringify(beforeUnchanged));
  for (const actor of ['peer5', 'admin1', 'tenantPeer5']) {
    businessBlocked(await request(actor, `/draft/${saved.draftId}`, undefined, 'GET'), /DRAFT_NOT_FOUND|不存在|不可访问/, `${actor}不能读取他人草稿`);
    businessBlocked(await request(actor, '/draft', { ...command, title: `${prefix} 非本人覆盖 ${actor}` }), /DRAFT_NOT_FOUND|DRAFT_UNAVAILABLE|不存在|不可访问|不可发起/, `${actor}不能覆盖他人草稿`);
    businessBlocked(await request(actor, `/draft/${saved.draftId}?expectedVersion=${saved.lockVersion}`, undefined, 'DELETE'), /DRAFT_NOT_FOUND|不存在|不可访问/, `${actor}不能删除他人草稿`);
  }
  businessBlocked(await request('employee5', '/draft', { ...command, userId: sessions.peer5.account.userId }), /DRAFT_INVALID_DATA|REQUEST_REJECTED|参数/, '伪造所属人字段被拒绝');
  businessBlocked(await request('employee5', '/draft', { ...command, formData: { ...command.formData, fixed: '伪造' } }), /FORM_INVALID_DATA|REQUEST_REJECTED|只读|参数/, '只读字段伪造被拒绝');
  const race = await Promise.all([
    request('employee5', '/draft', { ...command, title: `${prefix} 并发甲` }),
    request('employee5', '/draft', { ...command, title: `${prefix} 并发乙` }),
  ]);
  check('并发保存恰好一个成功', race.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  businessBlocked(race.find(result => result.status !== 200 || result.body?.code !== 200), /DRAFT_CONFLICT|版本|冲突/, '并发旧版本被拒绝');
  saved = success(race.find(result => result.status === 200 && result.body?.code === 200));
  command.expectedVersion = saved.lockVersion;
  const starts = await Promise.all([
    request('employee5', '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }),
    request('employee5', '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }),
  ]);
  const instances = starts.map(result => success(result, '并发提交草稿'));
  fixture.instanceId = instances[0].instanceId || instances[0].processInstanceId;
  check('重复提交返回同一真实实例', Boolean(fixture.instanceId)
    && instances.every(result => (result.instanceId || result.processInstanceId) === fixture.instanceId));
  check('成功提交只消费原草稿', !ownedDraft(saved.draftId)
    && Number(database(`SELECT COUNT(*) FROM wf_process_instance WHERE definition_id=${sqlText(definitionId)}`)) === 1);
  const newDraft = success(await request('employee5', '/draft', {
    ...command, draftId: undefined, expectedVersion: 0, title: `${prefix} 新草稿`,
  }), '提交后保存新草稿');
  fixture.draftIds.push(newDraft.draftId);
  success(await request('employee5', '/start', { draftId: saved.draftId, expectedVersion: saved.lockVersion }), '旧提交重试');
  check('旧提交重试不删除新草稿', Boolean(ownedDraft(newDraft.draftId)));
  businessBlocked(await request('employee5', '/draft', { ...command, title: `${prefix} 旧保存重试` }), /DRAFT_NOT_FOUND|不存在|不可访问/, '旧保存不能覆盖新草稿');
  const currentForm = success(await request('admin1', `/form/${fixture.formId}`, undefined, 'GET'), '读取待修改表单');
  success(await request('admin1', '/form/save', { ...currentForm, formName: `${prefix} 已变更配置`, fieldsJson: JSON.stringify([...fields, { id: 'extra', type: 'TEXT' }]) }), '原地修改表单配置');
  const listed = success(await request('employee5', `/draft/list?definitionId=${definitionId}&pageNum=1&pageSize=10`, undefined, 'GET'), '查看草稿状态');
  check('表单原地修改令既有草稿STALE', listed.rows.some(row => row.draftId === newDraft.draftId && row.availability === 'STALE'));
  businessBlocked(await request('employee5', `/draft/${newDraft.draftId}`, undefined, 'GET'), /DRAFT_STALE|已变化|变化/, '配置变化阻止静默恢复');
  success(await request('employee5', `/draft/${newDraft.draftId}?expectedVersion=${newDraft.lockVersion}`, undefined, 'DELETE'), '删除本人已失效草稿');
  const sensitive = logEvidence();
  await pause(1500);
  for (const entry of sensitive.markers) {
    for (const [table, columns] of [
      ['sys_log', ['params', 'exception']],
      ['sys_api_error_log', ['request_params', 'exception_message', 'exception_stack']],
      ['sys_audit_log', ['before_val', 'after_val', 'before_json', 'after_json', 'diff_json']],
    ]) {
      const predicate = columns.map(column => `LOCATE(${sqlText(entry.marker)},COALESCE(${column},''))>0`).join(' OR ');
      check(`持久化日志没有草稿正文 ${table}`, Number(database(`SELECT COUNT(*) FROM ${table} WHERE tenant_id=100000 AND (${predicate})`)) === 0);
    }
  }
  let scannedFiles = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(out|err)\.log$/.test(entry.name)) continue;
    const contents = await fs.readFile(path.join(directory, entry.name), 'utf8');
    scannedFiles++;
    check(`服务日志不包含草稿正文 ${entry.name}`, sensitive.markers.every(item => !contents.includes(item.marker)));
  }
  check('实际检查六服务日志及浏览器日志', scannedFiles >= 6 && sensitive.browserLeaks.length === 0);
  await saveFixture('drafts', fixture);
}

try {
  await run();
  await saveResult('drafts', null, { fixture, businessChecks: checks.length,
    excluded: ['C子表', '模拟30天到期及任务竞争', '首节点/删除故障注入'] });
  console.log(`PASS H草稿真实联验 ${checks.length} 项`);
} catch (error) {
  console.log(JSON.stringify(failureSummary(error)));
  try { await saveFixture('drafts', fixture); await saveResult('drafts', error); } catch {}
  process.exitCode = 1;
} finally {
  await sessions?.browser.close();
}
