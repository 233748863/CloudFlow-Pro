import assert from 'node:assert/strict';
import { decideRefundInInterface } from './verify-refund-approval-h3-ui.mjs';

export async function prepareRefundApproval(context) {
  const { admin, api, successful, session, database, check, caseTag, evidence } = context;
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const waitFor = async (read, accepts, label) => {
    const deadline = Date.now() + 60000;
    do {
      const result = await read();
      if (accepts(result)) return result;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const identifiers = [];
  for (const name of ['g_refund_finance', 'g_refund_reviewer', 'g_refund_reviewer_other']) {
    database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT 100000,100,${literal(name)},${literal(name)},password,'0',0,'0','isolated-refund-review',NOW() FROM sys_user
      WHERE tenant_id=100000 AND user_name='g_import_admin' AND NOT EXISTS
      (SELECT 1 FROM (SELECT user_name FROM sys_user WHERE tenant_id=100000) existing WHERE existing.user_name=${literal(name)});
      INSERT INTO sys_user_role (user_id,role_id,tenant_id) SELECT user_id,3,100000 FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)}
      AND NOT EXISTS (SELECT 1 FROM sys_user_role existing WHERE existing.user_id=sys_user.user_id AND existing.role_id=3 AND existing.tenant_id=100000);`);
    const user = rows(`SELECT JSON_OBJECT('id',user_id,'creator',create_by) FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)} AND deleted=0 AND status='0';`)[0];
    check(`${name}仅具有既有财务角色，且属于自建隔离账号`, Number.isSafeInteger(user?.id) && user.id > 0
      && ['isolated-refund-review', 'isolated-fixture'].includes(user.creator)
      && database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${user.id};`) === '3');
    identifiers.push(user.id);
  }
  const [financeId, reviewerId, otherReviewerId] = identifiers;
  const finance = await session('g_refund_finance', 'g_import_admin');
  const reviewer = await session('g_refund_reviewer', 'g_import_admin');
  const ownerId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0;"));
  const definition = rows("SELECT JSON_OBJECT('id',definition_id,'name',process_name,'status',status,'model',model_json,'version',version) FROM wf_process_definition WHERE tenant_id=100000 AND process_key='crm_refund_review' AND deleted=0 AND COALESCE(is_archived,0)=0 AND status='PUBLISHED' ORDER BY version DESC LIMIT 1;")[0];
  const model = typeof definition?.model === 'string' ? JSON.parse(definition.model) : definition?.model;
  check('实际生效模型采用正式种子的客户负责人首审及独立财务复核', definition?.id === 'crm_refund_review'
    && definition.name === '原收款退款双级审批' && model?.nodes?.length === 4 && model?.edges?.length === 3
    && model.nodes.some(node => node.id === 'customer_owner' && node.approverValue === 'customerOwnerApproverIds')
    && model.nodes.some(node => node.id === 'finance_review' && node.approverValue === 'financeReviewerIds' && node.signType === 'ANY'));
  evidence.workflowDefinition = 'formal_customer_owner_then_other_finance';
  evidence.refundDefinitionVersion = definition.version;
  const approved = id => {
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return rows(`SELECT JSON_OBJECT('id',approval_id,'no',approval_no,'reason',remark,'status',status,'instanceId',instance_id,'payload',payload_json,'applicant',applicant_id) FROM crm_approval WHERE tenant_id=100000 AND approval_id=${id};`)[0];
  };
  const tasks = instance => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee,'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(instance)} AND status='TODO';`);
  const record = async id => successful(await api(admin, `/crm/receivable/${id}`), '核对双级审批期间实际到账');
  const decide = (page, task, action, variables) => api(page, '/workflow/wf/complete', { method: 'POST', body: {
    taskId: task.id, action, comment: `退款双级实际办理_${caseTag}_${task.id}_${action}`, ...(variables ? { variables } : {}),
  } });
  const denied = (result, label, expectedCode) => {
    const message = result.body?.msg || result.body?.message || '';
    check(`${label} HTTP=${result.status} code=${result.body?.code} message=${message}`,
      expectedCode ? result.status === 400 && result.body?.code === expectedCode
      : ([400, 403, 404, 409, 503].includes(result.status) || result.status === 200 && result.body?.code === 500)
      && result.body?.code !== 200 && /无权|禁止|必须|退款|冻结|审批|办理|不能|权限|参与|变量|身份|财务/.test(message));
  };
  let guardChecksDone = false;
  const reviewedInterfaces = new Set();
  const review = async (page, task, action, stage, approval) => {
    const key = `${stage}-${action}`;
    if (reviewedInterfaces.has(key) || context.verifyRefundReviewInterface !== true) {
      successful(await decide(page, task, action), `${stage}实际办理退款审批`);
      return;
    }
    await decideRefundInInterface({ ...context, page, task, action, stage, approval });
    reviewedInterfaces.add(key);
    evidence.refundReviewInterfaces = [...reviewedInterfaces];
  };
  const complete = async (approvalId, action = 'APPROVE', rejectedStage = 'finance') => {
    assert.ok(['APPROVE', 'REJECT'].includes(action) && ['owner', 'finance'].includes(rejectedStage));
    const approval = await waitFor(() => approved(approvalId), value => Boolean(value?.instanceId), '真实退款流程实例未绑定');
    const policy = approval.payload.approvalPolicy;
    check('实际申请冻结三方独立身份和正式模型，保留另一财务候选', approval.applicant === financeId
      && JSON.stringify(policy.customerOwnerApproverIds) === JSON.stringify([String(ownerId)])
      && policy.financeReviewerIds.includes(String(reviewerId)) && policy.financeReviewerIds.includes(String(otherReviewerId))
      && !policy.financeReviewerIds.includes(String(financeId)) && !policy.financeReviewerIds.includes(String(ownerId))
      && policy.definitionId === definition.id && String(policy.definitionVersion) === String(definition.version));
    const before = await record(approval.payload.receivableId);
    const ownerTasks = await waitFor(() => tasks(approval.instanceId), value => value.some(task => task.node === 'customer_owner'), '客户业务负责人首审任务未生成');
    check('真实流程先只给客户负责人创建一项首审，财务尚无复核任务', ownerTasks.length === 1 && ownerTasks[0].assignee === ownerId);
    if (!guardChecksDone) {
      denied(await decide(finance, ownerTasks[0], 'APPROVE'), '申请财务不能自审首个节点');
      denied(await decide(reviewer, ownerTasks[0], 'APPROVE'), '其他财务也不能跳过客户负责人首审');
    }
    const rejectOwner = action === 'REJECT' && rejectedStage === 'owner';
    await review(admin, ownerTasks[0], rejectOwner ? 'REJECT' : 'APPROVE', 'owner', approval);
    let finalTask = ownerTasks[0];
    if (!rejectOwner) {
      const financeTasks = await waitFor(() => tasks(approval.instanceId), value => value.some(task => task.node === 'finance_review' && task.assignee === reviewerId), '首审通过后独立财务待办未生成');
      check('首审通过后累计到账不变，复核待办严格等于冻结财务名单', Number((await record(approval.payload.receivableId)).receivedAmount) === Number(before.receivedAmount)
        && approved(approvalId).status === 'PENDING' && financeTasks.every(task => task.node === 'finance_review')
        && JSON.stringify(financeTasks.map(task => String(task.assignee)).sort()) === JSON.stringify([...policy.financeReviewerIds].sort()));
      finalTask = financeTasks.find(task => task.assignee === reviewerId);
      if (!guardChecksDone) {
        denied(await decide(finance, finalTask, 'APPROVE'), '申请财务不能办理最终复核');
        denied(await decide(admin, finalTask, 'APPROVE'), '管理员身份不能让首审人代替另一财务', 'H_APPROVER_INVALID');
        denied(await decide(reviewer, finalTask, 'APPROVE', { financeReviewerIds: [String(financeId)] }), '财务不能改写冻结审批人', 'H_IDENTITY_OVERRIDE_FORBIDDEN');
        denied(await decide(reviewer, finalTask, 'APPROVE', { refundApproval: { refundAmount: '1.00' } }), '财务不能改写原收款或退款金额', 'H_IDENTITY_OVERRIDE_FORBIDDEN');
        guardChecksDone = true;
      }
      await review(reviewer, finalTask, action, 'finance', approval);
    }
    const final = await waitFor(() => approved(approvalId), value => value.status === (action === 'APPROVE' ? 'APPROVED' : 'REJECTED'), '双级真实审批结果尚未回写');
    check('第一名实际复核财务的同意或拒绝结束本次申请，其余候选不再待办', tasks(approval.instanceId).length === 0);
    const histories = rows(`SELECT JSON_OBJECT('node',node_key,'actor',operator_id,'represented',on_behalf_of_user_id,'action',action,'type',task_type,'time',DATE_FORMAT(create_time,'%Y-%m-%d %H:%i:%s')) FROM wf_task_history
      WHERE tenant_id=100000 AND instance_id=${literal(approval.instanceId)} AND operator_id IS NOT NULL AND action IN ('APPROVE','REJECT','COUNTERSIGN_APPROVE','COUNTERSIGN_REJECT') ORDER BY create_time,history_id;`);
    check('退款结果有实际本人办理历史，顺序正确且未使用代理或自动通过', histories.length === (rejectOwner ? 1 : 2)
      && histories.every(history => history.represented == null && !history.type.startsWith('AUTO_'))
      && histories.some(history => history.node === 'customer_owner' && history.actor === ownerId)
      && (rejectOwner || histories.some(history => history.node === 'finance_review' && history.actor === reviewerId)
        && histories.find(history => history.node === 'customer_owner').time <= histories.find(history => history.node === 'finance_review').time));
    if (action === 'REJECT') check('任一审批阶段拒绝均不扣减实际到账', Number((await record(approval.payload.receivableId)).receivedAmount) === Number(before.receivedAmount));
    evidence.refundWorkflowCallback = true; evidence.callbackTransport = 'redis_stream'; evidence.independentRefundStages = true;
    return { ...final, taskId: finalTask.id };
  };
  const setWorkflowFixture = enabled => database(`UPDATE wf_process_definition SET status='${enabled ? 'PUBLISHED' : 'DRAFT'}'
    WHERE tenant_id=100000 AND definition_id=${literal(definition.id)} AND process_name='原收款退款双级审批' AND version=${definition.version};`);
  return { finance, financeId, reviewer, reviewerId, otherReviewerId, definition, approved, complete, setWorkflowFixture, denied };
}
