import assert from 'node:assert/strict';

export async function verifyHrAppraisalBoundaries(context) {
  const { admin, hr, employee, peer, first, second, reviewer, draft, positions, api, successful, database, check, caseTag, evidence } = context;
  const root = '/hr/appraisal-cycle';
  const post = (actor, route, body, method = 'POST') => api(actor, route, { method, body });
  const read = async (actor, route) => successful(await api(actor, route), route);
  const rejected = (response, label, statuses = [400, 403, 404, 409, 422]) => check(`${label} HTTP=${response.status} code=${response.body?.code}`, statuses.includes(response.status) && response.body?.code !== 200);
  const newCycle = async (method, suffix, formula) => {
    const cycleName = `H2边界_${suffix}_${caseTag}`;
    const cycleId = String(successful(await post(hr, root, { ...draft, cycleName, scopePositionIds: [positions[0]], evaluationMethod: method,
      finalScoreMode: formula ? 'FORMULA' : 'WEIGHTED_AVG', finalScoreFormula: formula || '',
      scoreConfig: { minScore: '0', maxScore: '100', kraWeight: method === 'MIXED' ? '0.6' : null, goalWeight: method === 'MIXED' ? '0.4' : null } }), `创建${suffix}周期`));
    const detail = () => read(admin, `${root}/${cycleId}`);
    const version = async () => (await detail()).cycle.version;
    const advance = async (targetStatus, extra = {}) => successful(await post(hr, `${root}/${cycleId}/transition`, { version: await version(), targetStatus, ...extra }), `${suffix}进入${targetStatus}`);
    if (method !== 'GOAL_BASED') successful(await post(hr, `${root}/${cycleId}/kras`, { version: await version(), kras: [
      { kraName: '交付质量', weight: '0.75', description: '' }, { kraName: '协作成果', weight: '0.25', description: '' },
    ] }, 'PUT'), '配置真实成果领域');
    const preview = await read(hr, `${root}/${cycleId}/preview`);
    check(`${suffix}参评名单只有指定员工`, preview.employees.length === 1 && String(preview.employees[0].employeeId) === first.employeeId);
    await advance('ONGOING', { previewDigest: preview.digest });
    const kras = (await detail()).kras;
    for (const [index, score] of ['80', '40'].entries()) {
      successful(await post(hr, `${root}/${cycleId}/goals`, { version: await version(), objectiveName: `${suffix}目标${index + 1}_${caseTag}`,
        kraId: method === 'GOAL_BASED' ? null : kras[index].kraId,
        nodes: [{ key: `goal-${index}`, parentKey: null, assigneeType: 'EMPLOYEE', assigneeId: first.employeeId,
          weight: method === 'GOAL_BASED' ? ['0.25', '0.75'][index] : '1', targetValue: score }] }, 'PUT'), '下达真实权重目标');
    }
    await advance('SCORING');
    const goals = (await detail()).goals;
    for (const [index, goal] of goals.entries()) successful(await post(hr, `${root}/${cycleId}/goal-score`, { version: await version(), assignmentId: goal.assignmentId, score: ['80', '40'][index], summary: `${suffix}真实达成依据` }), '逐叶子目标登记真实分数');
    return { cycleId, cycleName, detail, version, advance, goals };
  };
  const finish = async cycle => {
    if ((await cycle.detail()).cycle.status === 'SCORING') await cycle.advance('CALIBRATING');
    const current = await cycle.detail();
    const result = current.results[0];
    successful(await post(hr, `${root}/${cycle.cycleId}/calibration`, { version: current.cycle.version, appraisalResultId: result.appraisalResultId,
      resultVersion: result.version, finalScore: result.calculatedScore, grade: 'A', reason: '复核真实来源，保留原分' }), '校准单员工周期');
    await cycle.advance('COMPLETED');
  };
  for (const [method, expected] of [['KRA_WEIGHTED', 70], ['MIXED', 66]]) {
    const cycle = await newCycle(method, method);
    const calculated = successful(await post(hr, `${root}/${cycle.cycleId}/calculate`, { version: await cycle.version() }), `${method}真实计算`);
    check(`${method}从真实表计算精确为${expected}`, calculated.results.length === 1 && Number(calculated.results[0].calculatedScore) === expected && calculated.results[0].error == null);
    await finish(cycle);
    check(`${method}完成后本人获得对应最终分`, Number((await read(employee, `${root}/mine/${cycle.cycleId}`)).results[0].finalScore) === expected);
  }
  evidence.allMethods = true;
  const customerConfig = await post(hr, root, { ...draft, cycleName: `客户停用_${caseTag}`, finalScoreMode: 'FORMULA', finalScoreFormula: '${goalScore}+${customerScore}*0' });
  rejected(customerConfig, '客户变量即使乘0也明确拒绝配置', [400]);
  check('客户停用返回明确原因', /客户评分已停用/.test(customerConfig.body?.msg || customerConfig.body?.message || ''));
  const cycle = await newCycle('GOAL_BASED', '本人受邀', '${goalScore}*0.5+${selfScore}*0.25+${peerScore}*0.25');
  const goal = cycle.goals[0];
  const invite = async (person, source, weight = '20') => String(successful(await post(hr, '/hr/performance/360/invite', { objectiveId: goal.objectiveId, assignmentId: goal.assignmentId,
    evaluateeId: first.employeeId, evaluators: [{ evaluatorId: person.employeeId, evaluatorSource: source, weight }] }), '发出真实员工邀请')[0]);
  const selfId = await invite(first, 'SELF');
  const peerId = await invite(second, 'PEER');
  const hrId = await invite(reviewer, 'PEER');
  const invitationPath = identifier => `${root}/invitations/mine/${identifier}`;
  const response = (actor, identifier, body) => post(actor, `${invitationPath(identifier)}/response`, body);
  const own = await read(employee, `${root}/invitations/mine?keyword=${encodeURIComponent(cycle.cycleName)}`);
  check('本人邀请列表只有自己的邀请', own.total === 1 && String(own.rows[0].invitationId) === selfId);
  const ownDetail = await read(employee, invitationPath(selfId));
  check('邀请详情不返回员工编号或其他评价人及评分', ownDetail.evaluateeName === first.username && !['tenantId', 'evaluatorId', 'evaluatorUserId', 'sourceScores', 'responses', 'employeeId'].some(key => key in ownDetail));
  rejected(await api(peer, invitationPath(selfId)), '他人即使有同一权限也不能查看邀请', [403]);
  rejected(await response(peer, selfId, { version: ownDetail.version, score: '99', commentText: '冒名' }), '不能为其他受邀人提交评分', [403]);
  rejected(await response(employee, selfId, { version: ownDetail.version + 99, score: '0', commentText: '过期版本' }), '本人评分拒绝过期版本', [409]);
  rejected(await response(employee, selfId, { version: ownDetail.version, score: '0', commentText: '客户端指定身份', evaluatorId: second.employeeId }), '本人评分拒绝客户端指定身份字段', [400]);
  rejected(await response(employee, selfId, { version: ownDetail.version, score: '0.001', commentText: '超精度' }), '本人评分拒绝超过两位小数', [400]);
  rejected(await response(employee, selfId, { version: ownDetail.version, score: '101', commentText: '超上界' }), '本人评分拒绝超核定上界', [400]);
  const submitted = await Promise.all([response(employee, selfId, { version: ownDetail.version, score: '0', commentText: '零分是真实评分' }), response(employee, selfId, { version: ownDetail.version, score: '0', commentText: '零分是真实评分' })]);
  check('同一邀请并发提交只保存一次且零分有效', submitted.filter(result => result.status === 200 && result.body?.code === 200).length === 1
    && database(`SELECT COUNT(*) FROM hr_perf_evaluator_response WHERE tenant_id=100000 AND evaluator_id=${selfId} AND score=0;`) === '1');
  const saved = await read(employee, invitationPath(selfId));
  check('提交后仍能读取本人实际结果用于丢失响应核对', saved.status === 'SUBMITTED' && Number(saved.score) === 0 && saved.commentText === '零分是真实评分' && saved.version > ownDetail.version);
  rejected(await response(employee, selfId, { version: saved.version, score: '10', commentText: '重写已经提交的评分' }), '本人不能重写已提交评分', [409]);
  successful(await post(hr, `/hr/performance/360/evaluator/${hrId}/cancel`, {}), 'HR取消尚未提交邀请');
  const cancelled = await read(hr, invitationPath(hrId));
  check('被取消邀请保留可核对状态', cancelled.status === 'CANCELLED' && cancelled.score == null);
  rejected(await response(hr, hrId, { version: cancelled.version, score: '70', commentText: '已取消评分' }), '被取消邀请不能提交', [409]);
  assert.equal(await invite(reviewer, 'PEER', '21'), hrId);
  rejected(await response(hr, hrId, { version: cancelled.version, score: '70', commentText: '重邀前版本' }), '重新邀请后旧版本不能提交', [409]);
  for (const [actor, identifier, score] of [[peer, peerId, '90'], [hr, hrId, '70']]) {
    const record = await read(actor, invitationPath(identifier));
    successful(await response(actor, identifier, { version: record.version, score, commentText: '由受邀本人核实提交' }), '受邀同事本人提交评分');
  }
  const calculated = successful(await post(hr, `${root}/${cycle.cycleId}/calculate`, { version: await cycle.version() }), '真实自评及多同事来源计算');
  check('目标50、自评0、两位同事平均80的公式总分精确为45', Number(calculated.results[0].calculatedScore) === 45);
  const customerId = database(`INSERT INTO hr_perf_evaluator (tenant_id,objective_id,assignment_id,evaluatee_id,evaluator_id,evaluator_source,weight,status,create_by)
    VALUES (100000,${goal.objectiveId},${goal.assignmentId},${first.employeeId},${first.employeeId},'CUSTOMER',20,'PENDING','appraisal-fixture'); SELECT LAST_INSERT_ID();`);
  rejected(await response(employee, customerId, { version: 0, score: '50', commentText: '伪造客户' }), '本人入口拒绝员工编号冒充客户', [400]);
  rejected(await post(hr, '/hr/performance/360/response', { evaluatorId: customerId, score: '50' }), '旧入口拒绝周期客户评分', [400]);
  database(`INSERT INTO hr_perf_evaluator_response (tenant_id,evaluator_id,objective_id,evaluatee_id,evaluator_source,score,create_by) VALUES (100000,${customerId},${goal.objectiveId},${first.employeeId},'CUSTOMER',50,'appraisal-fixture'); UPDATE hr_perf_evaluator SET status='SUBMITTED' WHERE tenant_id=100000 AND id=${customerId};`);
  const stopped = successful(await post(hr, `${root}/${cycle.cycleId}/calculate`, { version: await cycle.version() }), '读取含客户历史来源时的停用原因');
  check('已有客户来源也不能进入周期计算且不覆盖原分', stopped.results[0].calculatedScore == null && /客户评分已停用/.test(stopped.results[0].error)
    && Number((await cycle.detail()).results[0].calculatedScore) === 45);
  successful(await post(hr, `/hr/performance/360/evaluator/${customerId}/cancel`, {}), '授权人员明确取消不可用客户来源');
  assert.equal(await invite(reviewer, 'PEER', '22'), hrId);
  rejected(await post(hr, `${root}/${cycle.cycleId}/transition`, { version: await cycle.version(), targetStatus: 'CALIBRATING' }), '计算后来源变化不能直接进入校准', [409]);
  const reinvited = await read(hr, invitationPath(hrId));
  successful(await response(hr, hrId, { version: reinvited.version, score: '70', commentText: '重新受邀后本人确认' }), '重新受邀后恢复真实评分');
  successful(await post(hr, `${root}/${cycle.cycleId}/calculate`, { version: await cycle.version() }), '按最新来源重新计算');
  const raceVersion = await cycle.version();
  const race = await Promise.all([post(hr, `${root}/${cycle.cycleId}/transition`, { version: raceVersion, targetStatus: 'CALIBRATING' }), post(admin, `/hr/performance/360/evaluator/${peerId}/cancel`, {})]);
  check('阶段推进与来源取消并发不能同时成功', race.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  if ((await cycle.detail()).cycle.status === 'SCORING') successful(await post(hr, `${root}/${cycle.cycleId}/calculate`, { version: await cycle.version() }), '取消先完成时按剩余有效来源重新计算');
  await finish(cycle);
  rejected(await response(employee, selfId, { version: saved.version, score: '10', commentText: '已完成回改' }), '完成后本人入口不能修改任何评分', [409]);
  evidence.invitations = true;
  evidence.concurrent = true;

  const legacyId = String(successful(await post(admin, '/hr/performance/objectives', { objectiveNo: `legacy_${caseTag}`, cycleName: `旧绩效_${caseTag}`, cycleStartDate: '2026-07-01', cycleEndDate: '2026-09-30', objectiveName: `旧目标_${caseTag}`, ownerEmployeeId: first.employeeId }), '旧入口正常创建非周期目标'));
  const legacyInvite = async (person, source) => post(hr, '/hr/performance/360/invite', { objectiveId: legacyId, evaluateeId: first.employeeId, evaluators: [{ evaluatorId: person.employeeId, evaluatorSource: source, weight: '100' }] });
  const legacySelfId = String(successful(await legacyInvite(first, 'SELF'), '旧目标正常邀请员工')[0]);
  rejected(await response(employee, legacySelfId, { version: 0, score: '75', commentText: '新权限越权旧业务' }), '本人新权限不能编辑旧绩效邀请', [400]);
  rejected(await api(employee, invitationPath(legacySelfId)), '本人新列表不暴露旧绩效详情', [403]);
  const legacyHrId = String(successful(await legacyInvite(reviewer, 'PEER'), '旧360邀请保留')[0]);
  successful(await post(hr, '/hr/performance/360/response', { evaluatorId: legacyHrId, score: '75', commentText: '旧360正常评分' }), '旧360员工来源仍能提交');
  const legacyScore = successful(await post(hr, `/hr/performance/360/aggregate?objectiveId=${legacyId}&evaluateeId=${first.employeeId}`, {}), '旧360正常聚合');
  check('旧绩效聚合仍为75且cycle_id保持为空', Number(legacyScore.score) === 75 && database(`SELECT COALESCE(cycle_id,'NULL') FROM hr_performance_objective WHERE id=${legacyId};`) === 'NULL');
  rejected(await legacyInvite(first, 'CUSTOMER'), '旧目标同样不能创建客户来源邀请', [400]);
  const legacyCustomerId = database(`INSERT INTO hr_perf_evaluator (tenant_id,objective_id,evaluatee_id,evaluator_id,evaluator_source,status,create_by) VALUES (100000,${legacyId},${first.employeeId},${first.employeeId},'CUSTOMER','PENDING','appraisal-fixture'); SELECT LAST_INSERT_ID();`);
  rejected(await post(hr, '/hr/performance/360/response', { evaluatorId: legacyCustomerId, score: '50' }), '旧客户邀请也不能继续评分', [400]);
  database(`INSERT INTO hr_perf_evaluator_response (tenant_id,evaluator_id,objective_id,evaluatee_id,evaluator_source,score,create_by) VALUES (100000,${legacyCustomerId},${legacyId},${first.employeeId},'CUSTOMER',50,'appraisal-fixture'); UPDATE hr_perf_evaluator SET status='SUBMITTED' WHERE tenant_id=100000 AND id=${legacyCustomerId};`);
  rejected(await post(hr, `/hr/performance/360/aggregate?objectiveId=${legacyId}&evaluateeId=${first.employeeId}`, {}), '旧客户分数明确拒绝参与聚合', [400]);
  check('停用拒绝保留旧聚合结果不覆盖', database(`SELECT score FROM hr_performance_result WHERE tenant_id=100000 AND objective_id=${legacyId} AND employee_id=${first.employeeId};`) === '75.00');
  const ruleId = String(successful(await post(admin, '/hr/performance/distribution/rules', { objectiveId: legacyId, ruleName: `旧分布_${caseTag}`, distribution: [{ grade: 'B', percent: 100 }], enforceMode: 'WARN', status: 'ACTIVE' }), '旧目标分布规则可创建'));
  check('旧分布规则保持原目标关联', database(`SELECT CONCAT(objective_id,':',COALESCE(cycle_id,'NULL')) FROM hr_perf_distribution_rule WHERE id=${ruleId};`) === `${legacyId}:NULL`);
  const resultId = database(`SELECT id FROM hr_performance_result WHERE tenant_id=100000 AND objective_id=${legacyId} AND employee_id=${first.employeeId};`);
  assert.match(resultId, /^[1-9]\d*$/);
  const interview = { objectiveId: legacyId, resultId, evaluateeId: first.employeeId, interviewerId: reviewer.employeeId,
    interviewTime: '2026-09-25 15:30:00', location: '隔离旧面谈回归', durationMinutes: 30, consensus: `面谈_${caseTag}`, status: 'DRAFT' };
  rejected(await post(employee, '/hr/performance/interviews', interview), '本人受邀权限不能新增旧绩效面谈', [403]);
  const interviewId = String(successful(await post(admin, '/hr/performance/interviews', interview), '旧绩效面谈创建保留'));
  successful(await post(admin, `/hr/performance/interviews/${interviewId}`, { ...interview, version: 0, consensus: '旧面谈更新共识', employeeFeedback: '已核对旧绩效结果' }, 'PUT'), '旧绩效面谈修改保留');
  successful(await post(admin, `/hr/performance/interviews/${interviewId}/confirm`, {}), '旧绩效面谈确认保留');
  const interviews = await read(admin, `/hr/performance/interviews?objectiveId=${legacyId}`);
  check('旧面谈创建修改确认后仍可读取真实结果', interviews.some(row => String(row.id) === interviewId && row.status === 'CONFIRMED' && row.consensus === '旧面谈更新共识' && row.employeeFeedback === '已核对旧绩效结果'));
  check('旧面谈仍关联原目标和评分且不改写原分', database(`SELECT CONCAT(interview.objective_id,':',interview.result_id,':',result.score) FROM hr_performance_interview interview JOIN hr_performance_result result ON result.id=interview.result_id AND result.tenant_id=interview.tenant_id WHERE interview.id=${interviewId} AND interview.tenant_id=100000;`) === `${legacyId}:${resultId}:75.00`);
  const removedInterviewId = String(successful(await post(admin, '/hr/performance/interviews', { ...interview, consensus: '验证旧草稿删除' }), '创建待删除旧面谈草稿'));
  successful(await post(admin, `/hr/performance/interviews/${removedInterviewId}`, undefined, 'DELETE'), '旧绩效面谈草稿删除保留');
  check('旧面谈草稿按既有逻辑删除且已确认记录不受影响', database(`SELECT CONCAT((SELECT deleted FROM hr_performance_interview WHERE id=${removedInterviewId} AND tenant_id=100000),':',(SELECT status FROM hr_performance_interview WHERE id=${interviewId} AND tenant_id=100000 AND deleted=0));`) === '1:CONFIRMED');
  const reviewId = String(successful(await post(admin, '/hr/talent/reviews', { reviewNo: `ap_review_${caseTag}`, reviewName: `回归人才盘点_${caseTag}`, reviewYear: 2026, cycleType: 'ANNUAL', scopeType: 'GLOBAL', status: 'DRAFT' }), '旧人才盘点创建保留'));
  const meeting = { sessionNo: `ap_meeting_${caseTag}`, sessionName: `回归盘点会议_${caseTag}`, scheduledAt: '2026-09-25 14:00:00', location: '隔离回归', facilitatorId: reviewer.employeeId, participants: [first.employeeId, reviewer.employeeId], agenda: '核实旧会议', status: 'PLANNED' };
  const meetingId = String(successful(await post(admin, `/hr/talent/reviews/${reviewId}/calibration-sessions`, meeting), '旧人才盘点会议创建保留'));
  successful(await post(admin, `/hr/talent/calibration-sessions/${meetingId}`, { ...meeting, minutes: '旧会议纪要', status: 'COMPLETED' }, 'PUT'), '旧人才盘点会议修改保留');
  check('旧会议仍绑定review_id并保持cycle_id为空', database(`SELECT CONCAT(review_id,':',COALESCE(cycle_id,'NULL'),':',minutes) FROM hr_talent_calibration_session WHERE id=${meetingId};`) === `${reviewId}:NULL:旧会议纪要`);
  const meetings = await read(admin, `/hr/talent/reviews/${reviewId}/calibration-sessions`);
  check('旧会议列表仍能读取真实新建会议', meetings.rows.some(row => String(row.id) === meetingId));
  const employeeWrites = database("SELECT m.perms FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE rm.role_id=5 AND rm.tenant_id=100000 AND (m.perms LIKE 'hr:appraisal:%' OR m.perms='hr:performance:edit') ORDER BY m.perms;");
  assert.deepEqual(employeeWrites.split(/\r?\n/), ['hr:appraisal:own', 'hr:appraisal:respond']);
  check('EMPLOYEE绩效权限精确为本人读取及本人受邀评分', true);
  evidence.customerDisabled = true;
  evidence.legacy = true;
  console.log('H2_APPRAISAL_BOUNDARIES: own_invitation=true; no_impersonation=true; legacy_write_denied=true; zero_score=true; concurrent=true; three_methods=true; customer_disabled=true; legacy_regression=true');
  return { invitationCycleId: cycle.cycleId, invitationCycleName: cycle.cycleName };
}
