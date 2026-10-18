import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function recoverSettlementReferral({ admin, api, successful, database, check }, previous) {
  assert.match(previous, /^[a-f0-9]{12}$/);
  const key = `h2as_${previous}_referral`, candidateName = `${key}_hire`;
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const read = () => rows(`SELECT JSON_OBJECT('offer',CAST(o.id AS CHAR),'status',o.status,'instance',o.process_instance_id,
    'referral',CAST(r.referral_id AS CHAR),'referralStatus',r.status) FROM hr_offer o JOIN hr_employee_referral r ON r.tenant_id=o.tenant_id AND r.candidate_id=o.candidate_id
    WHERE o.tenant_id=100000 AND o.offer_no=${sql(`${key}_offer`)} AND r.candidate_name=${sql(candidateName)};`)[0];
  const before = read(); assert.ok(before && ['APPROVING', 'APPROVED'].includes(before.status));
  const history = () => database(`SELECT history_id,operator_id,action,task_type FROM wf_task_history WHERE tenant_id=100000 AND instance_id=${sql(before.instance)} ORDER BY history_id;`);
  const originalHistory = history();
  check('只恢复指定失败录用的已通过真实审批', database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(before.instance)};`) === 'PASSED'
    && originalHistory.includes('COUNTERSIGN_APPROVE'));
  try {
    if (before.status === 'APPROVING') {
      const dead = rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status) FROM wf_callback_dead_letter WHERE tenant_id=100000
        AND business_type='OFFER' AND business_id=${before.offer} AND process_instance_id=${sql(before.instance)};`)[0];
      assert.ok(dead && dead.status === 'PENDING');
      successful(await api(admin, `/workflow/wf/callback/dlq/${dead.id}/replay`, { method: 'POST', body: {} }), '通过管理员真实入口重放原失败录用结果');
      const deadline = Date.now() + 120000;
      while (read().referralStatus !== 'HIRED' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
      check('原失败录用实际回写且保留重放记录', read().status === 'APPROVED' && read().referralStatus === 'HIRED'
        && database(`SELECT status FROM wf_callback_dead_letter WHERE tenant_id=100000 AND id=${dead.id};`) === 'REPLAYED');
    }
    check('原录用恢复不新增审批或奖金', history() === originalHistory && read().instance === before.instance
      && database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='HR_REFERRAL' AND source_biz_id=${sql(before.referral)};`) === '0');
    return { marker: previous, offerId: before.offer, referralId: before.referral, recovered: true };
  } finally {
    const accounts = rows(`SELECT JSON_OBJECT('id',CAST(u.user_id AS CHAR)) FROM sys_user u JOIN hr_employee e ON e.tenant_id=u.tenant_id AND e.user_id=u.user_id
      WHERE u.tenant_id=100000 AND u.nick_name=${sql(candidateName)} AND e.name=${sql(candidateName)};`);
    for (const account of accounts) {
      assert.match(account.id, /^[1-9]\d*$/);
      database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${account.id} AND nick_name=${sql(candidateName)};
        DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${account.id};`);
    }
  }
}

// Positions, hiring capacity, components and definitions are owned prerequisites.
// Recommendation, hiring, qualification, approvals and all postings use real APIs.
export async function prepareSettlementReferral({ admin, hr, employee, leader, api, successful, database, check,
  marker, employeeId, hrPerson, leaderPerson, periodId, endDate }) {
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
  const post = async (actor, endpoint, body) => successful(await api(actor, endpoint, { method: 'POST', body }), '办理组合内推真实业务');
  const waitFor = async (probe, accept, label) => {
    const deadline = Date.now() + 120000;
    do { const value = await probe(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 500)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const key = `${marker}_referral`, candidateName = `${key}_hire`, amount = '1234.56';
  const configured = [], definitions = [], configRoot = '/auth/system/config';
  const configure = async (configKey, configValue) => {
    const existing = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取原内推配置').records.find(row => row.configKey === configKey);
    configured.push({ configKey, existing });
    successful(await api(admin, configRoot, { method: existing ? 'PUT' : 'POST', body: { ...(existing || {}), configKey,
      configValue, configName: key, configType: 'N', configScope: '1' } }), '启用隔离内推审批');
  };
  const definition = (definitionId, nodes, edges) => {
    database(`INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,version,model_json,status,is_latest,deleted)
      VALUES(${sql(definitionId)},100000,${sql(definitionId)},${sql(definitionId)},1,${sql(JSON.stringify({ nodes, edges }))},'PUBLISHED',1,0);`);
    definitions.push(definitionId);
  };
  const tasks = instance => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR),'node',node_key) FROM wf_task
    WHERE tenant_id=100000 AND instance_id=${sql(instance)} AND status='TODO';`);
  let hiredUserId, capacity;
  try {
    capacity = rows(`SELECT JSON_OBJECT('limit',user_limit,'package',package_id,'users',(SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND deleted=0))
      FROM sys_tenant WHERE tenant_id=100000 AND deleted=0;`)[0];
    assert.ok(capacity && capacity.package === null && Number.isSafeInteger(capacity.limit) && Number.isSafeInteger(capacity.users));
    capacity.temporary = Math.max(capacity.limit, capacity.users + 1);
    database(`UPDATE sys_tenant SET user_limit=${capacity.temporary} WHERE tenant_id=100000 AND user_limit=${capacity.limit} AND package_id IS NULL;`);
    check('组合录用只为本次一个新账号准备自有测试名额', database('SELECT user_limit FROM sys_tenant WHERE tenant_id=100000;') === String(capacity.temporary));
    database(`INSERT INTO hr_position(tenant_id,position_code,position_name,status) VALUES(100000,${sql(key)},${sql(key)},1);`);
    const positionId = id(database(`SELECT id FROM hr_position WHERE tenant_id=100000 AND position_code=${sql(key)};`));
    database(`INSERT INTO hr_recruitment_requisition(tenant_id,requisition_no,title,dept_id,position_id,headcount,hired_count,status,create_by,deleted)
      VALUES(100000,${sql(key)},${sql(key)},100,${positionId},1,0,'RECRUITING',${sql(marker)},0);`);
    const requisitionId = id(database(`SELECT id FROM hr_recruitment_requisition WHERE tenant_id=100000 AND requisition_no=${sql(key)};`));
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const resume = successful(await api(employee, '/hr/referral/resume', { method: 'POST', file: {
      name: `${key}.pdf`, type: 'application/pdf', content: pdf.toString('base64') } }), '本人实际上传组合内推简历');
    const submitted = await post(employee, '/hr/referral', { candidateName, email: `${key}@example.invalid`,
      targetPositionId: positionId, resumeFileId: resume.fileId, referralReason: `${marker}结算组合实际推荐` });
    const referralId = id(submitted.referralId);
    const read = () => rows(`SELECT JSON_OBJECT('status',status,'bonus',bonus_status,'version',version,'instance',instance_id,
      'changeId',CAST(comp_change_id AS CHAR),'referrer',CAST(referrer_employee_id AS CHAR),'hireDate',CAST(hire_date AS CHAR))
      FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id=${referralId};`)[0];
    check('组合内推由同一借款员工实际提交', submitted.status === 'SUBMITTED' && read().referrer === employeeId);
    const downloaded = await api(employee, `/hr/referral/mine/${referralId}/resume`);
    check('组合内推私有简历实际内容一致且禁止缓存', downloaded.status === 200 && downloaded.cacheControl === 'no-store'
      && downloaded.sha256 === createHash('sha256').update(pdf).digest('hex'));
    const screened = successful(await api(hr, `/hr/referral/${referralId}/screening`, { method: 'PUT', body: {
      version: submitted.version, accepted: true, reason: `${key}初筛` } }), '人事实际初筛组合推荐');
    const candidateId = id(await post(hr, `/hr/referral/${referralId}/convert`, { version: screened.version, requisitionId }));
    const offerDefinitionId = `${key}_offer`;
    definition(offerDefinitionId, [{ id: 'start', type: 'START', title: '人事提交' },
      { id: 'admin', type: 'APPROVAL', title: '管理员审批', approverType: 'ROLE', approverValue: 'admin', signType: 'ANY', allowDelegate: false, allowAddSign: false },
      { id: 'end', type: 'END', title: '完成' }], [{ id: 'first', source: 'start', target: 'admin' }, { id: 'second', source: 'admin', target: 'end' }]);
    await configure('sys.hr.offer.processKey', offerDefinitionId);
    const offerNo = `${marker}_offer`; assert.ok(offerNo.length <= 30);
    const offerId = id(await post(hr, '/hr/recruitment/offers', { offerNo, candidateId, positionId,
      salary: '10000.00', expectedArrivalDate: endDate, expireDate: database('SELECT CURRENT_DATE + INTERVAL 30 DAY;') }));
    await post(hr, `/hr/recruitment/offers/${offerId}/submit`, {});
    const offer = await waitFor(() => rows(`SELECT JSON_OBJECT('instance',process_instance_id,'status',status) FROM hr_offer
      WHERE tenant_id=100000 AND id=${offerId};`)[0], value => Boolean(value?.instance), 'Actual referral offer instance missing');
    const adminId = id(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND status='0' AND deleted=0;"));
    const approval = await waitFor(() => tasks(offer.instance).find(task => task.assignee === adminId), Boolean, 'Logged-in administrator offer task missing');
    check('组合录用审批前尚未形成奖金或有效入职', read().bonus === 'NOT_APPLICABLE' && read().status !== 'HIRED');
    await post(admin, '/workflow/wf/complete', { taskId: approval.id, action: 'APPROVE', comment: key });
    await waitFor(read, value => value.status === 'HIRED', 'Actual referral employment not effective');
    const employment = rows(`SELECT after_data FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL'
      AND business_id=${referralId} AND operation_type='EMPLOYMENT_SOURCE' ORDER BY id;`);
    check('组合推荐保留唯一实际录用入职依据', employment.length === 1 && String(employment[0].offerId) === offerId
      && employment[0].instanceId === offer.instance && employment[0].hireDate === endDate);
    hiredUserId = id(employment[0].userId);
    check('组合录用实际建立员工和账号', database(`SELECT COUNT(*) FROM hr_employee e JOIN sys_user u ON u.tenant_id=e.tenant_id AND u.user_id=e.user_id
      WHERE e.tenant_id=100000 AND e.id=${id(employment[0].employeeId)} AND e.user_id=${hiredUserId} AND e.name=${sql(candidateName)} AND e.deleted=0;`) === '1');
    database(`INSERT INTO hr_comp_component(tenant_id,component_code,component_name,component_type,category,taxable,sort_order,status,version)
      VALUES(100000,${sql(key)},${sql(key)},'VARIABLE','OTHER',1,40,1,0);`);
    const componentId = id(database(`SELECT id FROM hr_comp_component WHERE tenant_id=100000 AND component_code=${sql(key)};`));
    const bonusDefinitionId = `${key}_bonus`;
    definition(bonusDefinitionId, [{ id: 'start', type: 'START', title: '核定奖金' },
      { id: 'leader', type: 'APPROVAL', title: '负责人审核', approverType: 'VARIABLE_USER', approverValue: 'responsibleApproverIds', allowDelegate: false, allowAddSign: false },
      { id: 'hr', type: 'APPROVAL', title: '人事复核', approverType: 'VARIABLE_USER', approverValue: 'hrApproverIds', allowDelegate: false, allowAddSign: false },
      { id: 'end', type: 'END', title: '完成' }], [{ id: 'first', source: 'start', target: 'leader' },
      { id: 'second', source: 'leader', target: 'hr' }, { id: 'third', source: 'hr', target: 'end' }]);
    await configure('sys.hr.referral.processKey', bonusDefinitionId);
    await configure('sys.hr.referral.approvalUsers', JSON.stringify({ responsibleUserId: leaderPerson.userId, hrUserId: hrPerson.userId }));
    check('组合奖金核定前当期尚未生成工资', database(`SELECT COUNT(*) FROM hr_salary_slip WHERE tenant_id=100000 AND employee_id=${employeeId}
      AND period_month=${sql(endDate.slice(0, 7))} AND deleted=0;`) === '0');
    await post(admin, `/hr/referral/${referralId}/bonus`, { version: read().version, amount, salaryComponentId: componentId,
      payrollPeriodId: periodId, conditionRemark: `${key}隔离测试已核对真实入职`, conditionsVerified: true });
    const pending = await waitFor(read, value => Boolean(value?.instance), 'Actual referral bonus instance missing');
    for (const [node, actor, person] of [['leader', leader, leaderPerson], ['hr', hr, hrPerson]]) {
      const current = await waitFor(() => tasks(pending.instance), value => value.length === 1 && value[0].node === node, 'Actual bonus approval task missing');
      check(`组合奖金${node}由既定独立审核人办理且未提前入薪`, current[0].assignee === person.userId && read().bonus === 'PENDING' && read().changeId === null);
      await post(actor, '/workflow/wf/complete', { taskId: current[0].id, action: 'APPROVE', comment: key });
    }
    const approved = await waitFor(read, value => value.bonus === 'APPROVED', 'Actual bonus approval callback incomplete');
    const changeId = id(approved.changeId);
    check('组合奖金两级审批生成唯一加密工资来源', database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000
      AND source_biz_type='HR_REFERRAL' AND source_biz_id=${sql(referralId)} AND id=${changeId} AND employee_id=${employeeId}
      AND change_amount NOT REGEXP '^[0-9]+([.][0-9]+)?$';`) === '1');
    return { referralId, candidateId, offerId, hiredUserId, hiredEmployeeId: id(employment[0].employeeId),
      componentId, changeId, periodId, amount, instanceId: pending.instance, employment };
  } finally {
    for (const definitionId of definitions) {
      for (const instance of rows(`SELECT JSON_OBJECT('id',instance_id) FROM wf_process_instance WHERE tenant_id=100000
        AND definition_id=${sql(definitionId)} AND status IN ('RUNNING','PAUSED','PENDING','FAILED','RESTARTED');`)) {
        await post(admin, '/workflow/wf/instance/terminate', { instanceId: instance.id, reason: `${key}隔离验证结束` });
      }
      database(`UPDATE wf_process_definition SET status='DRAFT',is_archived=1,is_latest=0 WHERE tenant_id=100000 AND definition_id=${sql(definitionId)};`);
    }
    for (const { configKey, existing } of configured.reverse()) {
      if (existing) successful(await api(admin, configRoot, { method: 'PUT', body: existing }), '恢复原内推配置');
      else {
        const added = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '读取临时内推配置').records.find(row => row.configKey === configKey);
        if (added) successful(await api(admin, `${configRoot}/${added.configId}`, { method: 'DELETE' }), '移除临时内推配置');
      }
      const restored = successful(await api(admin, `${configRoot}/list?configKey=${configKey}&pageSize=100`), '复核原内推配置').records.find(row => row.configKey === configKey);
      check('组合内推原审批配置已恢复', existing ? restored?.configValue === existing.configValue && restored.configScope === existing.configScope : !restored);
    }
    // Retain the real employment source for later payroll validation; revoke only the owned test account access.
    const accounts = rows(`SELECT JSON_OBJECT('id',CAST(u.user_id AS CHAR)) FROM sys_user u JOIN hr_employee e ON e.tenant_id=u.tenant_id AND e.user_id=u.user_id
      WHERE u.tenant_id=100000 AND e.name=${sql(candidateName)} AND u.nick_name=${sql(candidateName)};`);
    for (const account of accounts) {
      const userId = id(account.id); if (hiredUserId) assert.equal(userId, hiredUserId);
      database(`UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id=${userId} AND nick_name=${sql(candidateName)};
        DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${userId};`);
    }
    if (capacity?.temporary !== undefined) {
      database(`UPDATE sys_tenant SET user_limit=${capacity.limit} WHERE tenant_id=100000 AND user_limit=${capacity.temporary} AND package_id IS NULL;`);
      check('组合录用原租户账号额度已恢复', database('SELECT user_limit FROM sys_tenant WHERE tenant_id=100000;') === String(capacity.limit));
    }
  }
}

export function verifySettlementReferralStage({ database, check, referral, payroll, stage, settlementId, reversalId, row }) {
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(value => JSON.parse(value));
  const audit = operation => rows(`SELECT after_data FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='HR_REFERRAL'
    AND business_id=${referral.referralId} AND operation_type=${sql(operation)} ORDER BY id;`);
  const posted = ['posted', 'reversalPending'].includes(stage), restored = ['restored', 'replacementDraft'].includes(stage);
  const state = rows(`SELECT JSON_OBJECT('status',bonus_status,'payDate',CAST(bonus_pay_date AS CHAR),'changeId',CAST(comp_change_id AS CHAR))
    FROM hr_employee_referral WHERE tenant_id=100000 AND referral_id=${referral.referralId};`)[0];
  check(`组合奖金${stage}仅在实际付款后标记已付`, state.status === (posted ? 'PAID' : 'APPROVED')
    && (posted ? Boolean(state.payDate) : state.payDate === null) && state.changeId === referral.changeId);
  check(`组合奖金${stage}唯一工资来源和入职证据完整保留`, database(`SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=100000
    AND source_biz_type='HR_REFERRAL' AND source_biz_id=${sql(referral.referralId)};`) === '1'
    && JSON.stringify(audit('EMPLOYMENT_SOURCE')) === JSON.stringify(referral.employment));
  const paid = audit('BONUS_PAID'), returned = audit('BONUS_SETTLEMENT_RETURNED');
  check(`组合奖金${stage}未重复付款或提前退回`, paid.length === (posted || restored ? 1 : 0) && returned.length === (restored ? 1 : 0));
  if (posted || restored) check('组合奖金实际发放关联本工资和结算单', String(paid[0].salarySlipId) === payroll.salaryId
    && String(paid[0].compChangeId) === referral.changeId && String(paid[0].settlementId) === settlementId
    && paid[0].amount === referral.amount && typeof paid[0].paymentEventId === 'string' && paid[0].paymentEventId.length > 0);
  if (restored) check('组合奖金冲正关联原付款并恢复待发', String(returned[0].originalSettlementId) === settlementId
    && String(returned[0].reversalSettlementId) === reversalId && String(returned[0].salarySlipId) === payroll.salaryId
    && String(returned[0].compChangeId) === referral.changeId && returned[0].amount === referral.amount
    && returned[0].originalPaymentEventId === paid[0].paymentEventId && JSON.stringify(returned[0].originalPayment) === JSON.stringify(paid[0]));
  if (row && ['calculated', 'submitted', 'approved', 'confirmed', 'replacementDraft'].includes(stage)) {
    const wage = row.items.find(item => item.sourceBizType === 'HR_SALARY_SLIP' && String(item.sourceBizId) === payroll.salaryId);
    const components = wage?.evidence.components.filter(item => item.sourceBizType === 'HR_REFERRAL') || [];
    check(`组合奖金${stage}仅通过同一工资汇入1234.56元`, components.length === 1 && String(components[0].referralId) === referral.referralId
      && String(components[0].changeId) === referral.changeId && Number(components[0].amount) === 1234.56
      && !row.items.some(item => item.sourceBizType === 'HR_REFERRAL') && wage.amount === payroll.netAmount);
  }
}
