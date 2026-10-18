import assert from 'node:assert/strict';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { createHash } from 'node:crypto';

// Only the approval definition is an isolated prerequisite. Enrollment, approvals,
// attendance, completion, private agreement and assessment use the real interfaces.
export async function prepareSettlementTraining({ admin, hr, employee, leader, api, successful, database, check,
  marker, employeeId, userId, hrPerson, leaderPerson, directory }) {
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
  const post = async (actor, endpoint, body) => successful(await api(actor, endpoint, { method: 'POST', body }), '办理组合培训真实业务');
  const waitFor = async (read, accepted, label) => {
    const deadline = Date.now() + 120000;
    do { const value = await read(); if (accepted(value)) return value; await new Promise(resolve => setTimeout(resolve, 500)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const key = `${marker}_training`, processKey = 'wf_hr_training_enrollment';
  const configRoot = '/auth/system/config', configKey = 'sys.hr.training.enrollmentProcessKey';
  const configured = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原培训审批配置').records.find(row => row.configKey === configKey);
  const journal = createOwnedRecoveryJournal(directory, `${key}-training`, { key, configKey, configured: configured ?? null });
  assert.equal(database(`SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(processKey)} AND status='PUBLISHED' AND deleted=0;`), '0', 'Do not replace existing training approval');
  const version = Number(database(`SELECT COALESCE(MAX(version),0)+1 FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(processKey)};`));
  const model = { nodes: [{ id: 'start', type: 'START', title: '员工报名' },
    { id: 'leader', type: 'APPROVAL', title: '部门负责人', approverType: 'USER', approverValue: leaderPerson.userId },
    { id: 'hr', type: 'APPROVAL', title: '人事审核', approverType: 'USER', approverValue: hrPerson.userId },
    { id: 'end', type: 'END', title: '完成' }], edges: [{ id: 'first', source: 'start', target: 'leader' },
    { id: 'second', source: 'leader', target: 'hr' }, { id: 'third', source: 'hr', target: 'end' }] };
  let changed = false, created = false;
  try {
    database(`INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES(${sql(key)},100000,${sql(key)},${sql(processKey)},${version},${sql(JSON.stringify(model))},'PUBLISHED',1,0);`); created = true;
    if (configured?.configValue !== processKey) {
      successful(await api(admin, configRoot, { method: configured ? 'PUT' : 'POST', body: { ...(configured || {}), configKey,
        configName: key, configValue: processKey, configType: 'N', configScope: '1' } }), '启用隔离培训审批'); changed = true;
    }
    const courseId = id(await post(admin, '/hr/training/courses', { courseCode: key, courseName: `${marker}组合培训`, mode: 'OFFLINE', durationHours: '8', status: 'PUBLISHED' }));
    const sessionId = id(await post(admin, '/hr/training/sessions', { courseId, sessionNo: key, capacity: 1,
      startTime: '2026-01-02 09:00:00', endTime: '2026-01-02 17:00:00', status: 'PLANNED' }));
    await post(admin, `/hr/training/sessions/${sessionId}/register`, {});
    const enrollmentId = id(await post(employee, '/hr/training/enrollments', { sessionId, enrollType: 'SELF', comment: key }));
    const read = () => rows(`SELECT JSON_OBJECT('status',status,'instance',process_instance_id,'employee',CAST(employee_id AS CHAR),'attended',attended,
      'completion',completion_status) FROM hr_training_enrollment WHERE tenant_id=100000 AND id=${enrollmentId};`)[0];
    const bound = await waitFor(read, value => Boolean(value?.instance), 'Training approval instance was not bound');
    check('培训报名实际属于借款员工且审批前尚未通过', bound.employee === employeeId && bound.status === 'PENDING');
    check('培训实际审批发起人沿用本人账号', database(`SELECT start_user_id FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(bound.instance)};`) === userId);
    for (const [node, actor, person] of [['leader', leader, leaderPerson], ['hr', hr, hrPerson]]) {
      const tasks = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task
        WHERE tenant_id=100000 AND instance_id=${sql(bound.instance)} AND node_key=${sql(node)} AND status='TODO';`), value => value.length === 1, 'Training approval task missing');
      check(`培训${node}待办属于实际审核人`, tasks[0].assignee === person.userId);
      await post(actor, '/workflow/wf/complete', { taskId: tasks[0].id, action: 'APPROVE', comment: key });
    }
    await waitFor(read, value => value.status === 'APPROVED', 'Actual training approval callback did not complete');
    check('培训真实审批回写只登记一名学员', database(`SELECT enrolled_count FROM hr_training_session WHERE tenant_id=100000 AND id=${sessionId};`) === '1');
    await post(admin, `/hr/training/sessions/${sessionId}/start`, {});
    await post(employee, `/hr/training/enrollments/${enrollmentId}/check-in`, {});
    await post(hr, `/hr/training/enrollments/${enrollmentId}/complete`, { completionStatus: 'PASSED', score: '90', comment: key });
    await post(admin, `/hr/training/sessions/${sessionId}/complete`, {});
    check('培训本人签到和人事结业记录完整保留', read().status === 'APPROVED' && read().attended === 1 && read().completion === 'PASSED');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const hash = createHash('sha256').update(pdf).digest('hex');
    const uploaded = successful(await api(hr, `/hr/training-recovery/agreements?enrollmentId=${enrollmentId}`, { method: 'POST',
      file: { name: `${key}.pdf`, content: pdf.toString('base64'), type: 'application/pdf' } }), '上传实际组合培训私有协议');
    const agreementFileId = id(uploaded.fileId), amount = '123.45';
    const recoveryId = id(await post(hr, '/hr/training-recovery', { enrollmentId, agreementFileId, assessedAmount: amount, assessmentReason: `${key}隔离测试核定` }));
    const detail = async () => successful(await api(hr, `/hr/training-recovery/${recoveryId}`), '读取实际组合培训核定');
    await post(hr, `/hr/training-recovery/${recoveryId}/confirm`, { version: (await detail()).version });
    const current = await detail();
    check('培训核定123.45元尚未收款也未占用结算', current.status === 'CONFIRMED' && current.assessedAmount === amount
      && current.collectedAmount === '0.00' && current.settlementId === null && current.confirmedBy !== null && current.confirmedTime !== null);
    const download = await api(hr, `/hr/training-recovery/${recoveryId}/agreement`);
    check('组合培训协议实际字节完整并禁止缓存', download.status === 200 && download.sha256 === hash && download.cacheControl?.split(',').every(value => value.trim() === 'no-store'));
    const denial = await api(admin, `/auth/system/file/${agreementFileId}/content`);
    check('组合培训协议不能经通用文件入口公开', denial.status === 403 && denial.body?.code !== 200);
    return { recoveryId, enrollmentId, sessionId, courseId, agreementFileId, hash, amount, instanceId: bound.instance,
      confirmedBy: String(current.confirmedBy), confirmedTime: current.confirmedTime, assessmentReason: current.assessmentReason };
  } finally {
    if (created) {
      for (const instance of rows(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sql(key)}
        AND status IN ('RUNNING','PAUSED','PENDING','FAILED','RESTARTED');`)) await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${key}隔离验证结束` });
      database(`UPDATE wf_process_definition SET status='DRAFT',is_archived=1,is_latest=0 WHERE tenant_id=100000 AND definition_id=${sql(key)};`);
    }
    if (changed) {
      if (configured) successful(await api(admin, configRoot, { method: 'PUT', body: configured }), '恢复原培训审批配置');
      else {
        const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取临时培训配置').records.find(row => row.configKey === configKey);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除临时培训配置');
      }
    }
    const restored = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '复核培训原配置').records.find(row => row.configKey === configKey);
    check('培训审批原配置恢复且保留实际审批历史', configured ? restored?.configValue === configured.configValue && restored.configScope === configured.configScope : !restored);
    journal('restored', { configuration: true, archivedDefinition: created });
  }
}

export function verifySettlementTrainingStage({ database, check, training, stage, settlementId, reversalId, row }) {
  const restored = ['restored', 'replacementDraft'].includes(stage), posted = ['posted', 'reversalPending'].includes(stage);
  const held = ['submitted', 'approved', 'confirmed'].includes(stage);
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  check(`组合培训${stage}核定金额协议和核定人保持`, database(`SELECT COUNT(*) FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${training.recoveryId}
    AND assessed_amount=${training.amount} AND agreement_file_id=${training.agreementFileId} AND enrollment_id=${training.enrollmentId}
    AND confirmed_by=${training.confirmedBy} AND assessment_reason=${sql(training.assessmentReason)};`) === '1');
  check(`组合培训${stage}仅在实际收付后确认收款`, database(`SELECT CONCAT(status,':',collected_amount,':',COALESCE(settlement_id,'NULL'))
    FROM hr_training_recovery WHERE tenant_id=100000 AND recovery_id=${training.recoveryId};`) === `${posted ? 'CLEARED:123.45' : 'CONFIRMED:0.00'}:${held || posted ? settlementId : 'NULL'}`);
  const count = database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000 AND source_biz_type='HR_TRAINING_RECOVERY'
    AND source_biz_id=${sql(training.recoveryId)} AND source_posted_flag=1;`);
  check(`组合培训${stage}保留准确实际入账条数`, count === (restored ? '2' : posted ? '1' : '0'));
  if (restored) check('组合培训冲正保留原收款及等额退回', database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000
    AND source_biz_type='HR_TRAINING_RECOVERY' AND source_biz_id=${sql(training.recoveryId)} AND source_posted_flag=1
    AND ((settlement_id=${settlementId} AND amount=123.45) OR (settlement_id=${reversalId} AND amount=-123.45));`) === '2');
  if (row && ['calculated', 'submitted', 'approved', 'confirmed', 'replacementDraft'].includes(stage)) {
    const item = row.items.find(value => value.sourceBizType === 'HR_TRAINING_RECOVERY' && String(value.sourceBizId) === training.recoveryId);
    check(`组合培训${stage}按真实核定和私有协议汇集`, item?.amount === training.amount && !item.posted
      && item.evidence.agreementHash === training.hash && String(item.evidence.enrollmentId) === training.enrollmentId
      && item.evidence.collectedAmount === '0.00' && item.evidence.collectionPostings.length === (restored ? 2 : 0));
  }
}
