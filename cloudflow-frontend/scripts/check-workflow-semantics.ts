import assert from 'node:assert/strict';
import { runWorkflowGatewayChecks } from './check-workflow-gateways';
import { runRefundApprovalDisplayChecks } from './check-refund-approval-display';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeType, Role, TaskStatus, type User, type WorkflowGraphDefinition, type WorkflowGraphNode } from '../src/types';
import { WORKFLOW_TASK_TYPES, NODE_OPERATION_LABELS, REJECT_STRATEGY_LABELS, type RejectStrategy } from '../src/types/workflowSemantic';
import { TaskSemanticBadge, WORKFLOW_TASK_SEMANTICS, getTaskSemantic } from '../src/components/workflow/TaskSemanticBadge';
import { validateWorkflowSemantics } from '../src/components/workflow-builder/validateWorkflowSemantics';
import { getWorkflowUpstreamNodes, prepareWorkflowModelForSave } from '../src/utils/workflowGraph';
import { allowsNodeOperation, allowsRejection, canHandleWorkflowTask, canWithdrawWorkflowApproval, getTaskAgentMode, isTaskInCurrentTodo } from '../src/utils/workflowPermissions';
import { getWorkflowActionLabel, getWorkflowActionState, getWorkflowOperatorLabel, normalizeWorkflowTrace } from '../src/utils/workflowTrace';
import { mapBackendTaskToFrontend } from '../src/utils/mappers';
import { GatewayRoundProgress } from '../src/components/workflow/GatewayRoundProgress';
import type { WorkflowGatewayRound } from '../src/types/workflow';
import { getErrorStatus } from '../src/utils/errorMessage';
import { PROCESS_STATUSES, isProcessActive, isProcessSuccessful, isProcessTerminal } from '../src/utils/processStatus';

let checks = 0;
const check = (name: string, operation: () => void) => {
  try { operation(); checks++; }
  catch (cause) { throw new Error(name, { cause }); }
};

for (const policy of ['ALLOW', 'AUTO_SKIP', 'TO_DIRECT_LEADER', 'TO_DEPT_MANAGER']) {
  check(`manual outgoing ${policy} is removed while original model and approval remain`, () => {
    const source = JSON.stringify({ nodes: [{ id: 'work', type: 'MANUAL', approveSelf: policy, allowUrge: false, props: { taskDescription: '交接' } },
      { id: 'approval', type: 'APPROVAL', approveSelf: policy }, { id: 'sign', type: 'PARALLEL', signType: 'ALL', approveSelf: policy }], edges: [] });
    const saved = JSON.parse(prepareWorkflowModelForSave(source));
    assert.equal(Object.hasOwn(saved.nodes[0], 'approveSelf'), false);
    assert.equal(saved.nodes[0].allowUrge, false); assert.deepEqual(saved.nodes[0].props, { taskDescription: '交接' });
    assert.equal(saved.nodes[1].approveSelf, policy); assert.equal(saved.nodes[2].approveSelf, policy);
    assert.equal(JSON.parse(source).nodes[0].approveSelf, policy);
  });
}

check('18 task semantics exactly match the backend contract', () => assert.deepEqual(Object.keys(WORKFLOW_TASK_SEMANTICS).sort(), [...WORKFLOW_TASK_TYPES].sort()));
for (const taskType of WORKFLOW_TASK_TYPES) {
  check(`render task type ${taskType}`, () => {
    const rendered = renderToStaticMarkup(createElement(TaskSemanticBadge, { taskType }));
    assert.ok(rendered.includes(WORKFLOW_TASK_SEMANTICS[taskType].label));
    assert.ok(rendered.includes('<svg'));
  });
}
check('all task types have distinct icons', () => assert.equal(new Set(Object.values(WORKFLOW_TASK_SEMANTICS).map((semantic) => semantic.icon)).size, 18));
check('old trace without task type remains renderable', () => assert.equal(renderToStaticMarkup(createElement(TaskSemanticBadge, {})), ''));
check('unknown task type cannot resolve object prototype', () => assert.equal(getTaskSemantic('__proto__'), null));
check('desktop and mobile pending lists include both permitted proxy modes', () => {
  const user = { id: 'agent', role: Role.EMPLOYEE } as User;
  const task = mapBackendTaskToFrontend({ taskId: 'proxy-task', assignee: 'owner', proxyUserId: 'agent', agentSettingId: 'setting', agentMode: 'AGENT', status: 'TODO' });
  assert.equal(isTaskInCurrentTodo(task, user), true);
  assert.equal(isTaskInCurrentTodo({ ...task, agentMode: 'AGENT_ASSIST' }, user), true);
  assert.equal(isTaskInCurrentTodo({ ...task, proxyUserId: undefined, agentMode: undefined }, user), false);
  assert.equal(isTaskInCurrentTodo({ ...task, agentSettingId: undefined }, user), false);
  assert.equal(isTaskInCurrentTodo({ ...task, status: TaskStatus.APPROVED }, user), false);
});
for (const operation of Object.keys(NODE_OPERATION_LABELS) as Array<keyof typeof NODE_OPERATION_LABELS>) {
  check(`old missing permission allows ${operation}`, () => assert.equal(allowsNodeOperation(undefined, operation), true));
  check(`old omitted switch allows ${operation}`, () => assert.equal(allowsNodeOperation({}, operation), true));
  check(`explicit false blocks ${operation}`, () => assert.equal(allowsNodeOperation({ [operation]: false }, operation), false));
  check(`explicit true allows ${operation}`, () => assert.equal(allowsNodeOperation({ [operation]: true }, operation), true));
}
check('rollback switch does not forbid legacy terminate', () => assert.equal(allowsRejection({ allowRollback: false }), true));
for (const strategy of Object.keys(REJECT_STRATEGY_LABELS) as RejectStrategy[]) {
  check(`rollback switch distinguishes ${strategy}`, () => assert.equal(allowsRejection({ allowRollback: false }, strategy), strategy === 'TERMINATE'));
}

const graph: WorkflowGraphDefinition = {
  nodes: [
    { id: 'start', type: NodeType.START, title: '发起' },
    { id: 'split', type: NodeType.PARALLEL, title: '分支' },
    { id: 'first', type: NodeType.APPROVAL, title: '第一审批' },
    { id: 'sibling', type: NodeType.APPROVAL, title: '并行审批' },
    { id: 'second', type: NodeType.APPROVAL, title: '第二审批' },
    { id: 'end', type: NodeType.END, title: '结束' },
  ],
  edges: [
    { id: 'start-split', source: 'start', target: 'split' },
    { id: 'split-first', source: 'split', target: 'first', isDefault: true },
    { id: 'split-sibling', source: 'split', target: 'sibling', condition: 'amount > 100' },
    { id: 'first-second', source: 'first', target: 'second' },
    { id: 'second-end', source: 'second', target: 'end' },
    { id: 'sibling-end', source: 'sibling', target: 'end' },
  ],
};
const withNode = (patch: Partial<WorkflowGraphNode>): WorkflowGraphDefinition => ({
  ...graph, nodes: graph.nodes.map((node) => node.id === 'second' ? { ...node, ...patch } : node),
});
const valid = (name: string, patch: Partial<WorkflowGraphNode>) => check(name, () => assert.deepEqual(validateWorkflowSemantics(withNode(patch)), []));
const invalid = (name: string, patch: Partial<WorkflowGraphNode>) => check(name, () => assert.ok(validateWorkflowSemantics(withNode(patch)).length > 0));
check('upstream excludes self, downstream and sibling branch', () => assert.deepEqual(getWorkflowUpstreamNodes(graph, 'second').map((node) => node.id), ['start', 'split', 'first']));
valid('old graph needs no new fields', {});
valid('upstream rejection can be saved', { rejectStrategy: 'TO_SPECIFIED_NODE', rejectToNodeKey: 'first' });
for (const target of ['second', 'sibling', 'end', 'missing']) invalid(`invalid rejection target ${target}`, { rejectStrategy: 'TO_SPECIFIED_NODE', rejectToNodeKey: target });
for (const source of ['USER', 'USERS', 'USER_LIST', 'ROLE', 'DEPT', 'DEPT_MANAGER', 'DIRECT_LEADER', 'INITIATOR', 'VARIABLE_USER']) {
  valid(`old assignee source ${source} unchanged`, { approverType: source, approverValue: '1,2,3' });
}
for (const signType of ['ALL', 'ANY', 'PERCENT', 'SEQUENTIAL']) valid(`old sign mode ${signType} unchanged`, { signType });
valid('new multi-level manager', { approverType: 'MULTI_LEVEL_MANAGER', directorLevel: 10, directorFallback: 'FAIL' });
invalid('multi-level manager cap', { approverType: 'MULTI_LEVEL_MANAGER', directorLevel: 11 });
invalid('disabled selection is not a usable launch configuration', { approverType: 'INITIATOR_SELECTED', allowSelection: false });
valid('role and department selection scope', { approverType: 'INITIATOR_SELECTED', selectableScope: { roleIds: ['8'], deptIds: ['10'] } });

const weighted: Partial<WorkflowGraphNode> = {
  signType: 'WEIGHT', approverType: 'USER_LIST', approverValue: '1,2,3', weightSource: 'BY_CONFIG', passWeight: '5.00',
  assigneeWeights: [{ userId: '1', weight: '3.00' }, { userId: '2', weight: '2.00' }, { userId: '3', weight: '1.00' }],
};
valid('weighted threshold below total', weighted);
invalid('zero pass threshold', { ...weighted, passWeight: 0 });
invalid('unreachable pass threshold', { ...weighted, passWeight: 7 });
invalid('too many decimal places', { ...weighted, passWeight: '5.001' });
invalid('duplicate user weights', { ...weighted, assigneeWeights: [{ userId: '1', weight: 3 }, { userId: '1', weight: 2 }] });
valid('individual zero weight remains valid', { ...weighted, assigneeWeights: [{ userId: '1', weight: 3 }, { userId: '2', weight: 2 }, { userId: '3', weight: 0 }] });
invalid('zero total weight rejected', { ...weighted, assigneeWeights: [1, 2, 3].map((userId) => ({ userId, weight: 0 })) });
invalid('individual weight cap', { ...weighted, assigneeWeights: [{ userId: '1', weight: 10000 }] });
valid('equal weights', { ...weighted, weightSource: 'EQUAL', passWeight: 2, assigneeWeights: undefined });

for (const props of [{ timerType: 'DELAY', delayMinutes: 30 }, { timerType: 'SCHEDULE', scheduleTime: '2027-01-01 09:00:00' }]) {
  valid(`old timer ${props.timerType} unchanged`, { type: NodeType.TIMER, props });
}
for (const delayUnit of ['MINUTE', 'HOUR', 'DAY', 'WORKDAY']) valid(`timer unit ${delayUnit}`, { type: NodeType.TIMER, props: { timerType: 'DELAY', delayUnit, delayValue: 1 } });
for (const delayValue of [0, 36501, 1.5]) invalid(`timer delay bound ${delayValue}`, { type: NodeType.TIMER, props: { timerType: 'DELAY', delayValue } });
valid('one-shot cron', { type: NodeType.TIMER, props: { timerType: 'CRON_ONCE', cronExpression: '0 0 9 * * MON-FRI' } });
invalid('incomplete cron', { type: NodeType.TIMER, props: { timerType: 'CRON_ONCE', cronExpression: '0 9 * * MON-FRI' } });
valid('fixed time variable', { type: NodeType.TIMER, props: { timerType: 'FIXED_TIME', fixedTime: '${dueDate}' } });
invalid('fixed time missing', { type: NodeType.TIMER, props: { timerType: 'FIXED_TIME' } });
for (const timerAction of ['AUTO_PASS', 'AUTO_REJECT', 'NOTIFY_ONLY']) valid(`timer action ${timerAction}`, { type: NodeType.TIMER, props: { timerType: 'DELAY', delayValue: 1, timerAction } });

valid('old API node unchanged', { type: NodeType.SCRIPT, props: { scriptType: 'API', apiUrl: 'https://example.com' } });
valid('old Groovy node unchanged', { type: NodeType.SCRIPT, props: { scriptType: 'GROOVY', scriptContent: 'return 1' } });
const trigger = { triggerType: 'HTTP_CALLBACK', actionUrl: 'https://example.com/callback', actionHeaders: '{"Authorization":"****1234"}', actionBody: '{"amount":"${amount}"}', retryCount: 5, timeoutSeconds: 60 };
valid('HTTP trigger valid settings', { type: NodeType.SCRIPT, props: trigger });
invalid('HTTP trigger rejects invalid JSON', { type: NodeType.SCRIPT, props: { ...trigger, actionBody: '{' } });
invalid('HTTP trigger forbids credentials in URL', { type: NodeType.SCRIPT, props: { ...trigger, actionUrl: 'https://user:secret@example.com' } });
invalid('HTTP trigger forbids non-HTTP scheme', { type: NodeType.SCRIPT, props: { ...trigger, actionUrl: 'file:///etc/passwd' } });
invalid('trigger retry cap', { type: NodeType.SCRIPT, props: { ...trigger, retryCount: 6 } });
invalid('trigger timeout cap', { type: NodeType.SCRIPT, props: { ...trigger, timeoutSeconds: 61 } });
valid('message trigger recipients title and body', { type: NodeType.SCRIPT, props: { triggerType: 'MESSAGE', actionBody: { recipientIds: ['1'], title: '通知', content: '内容' } } });
invalid('message trigger cannot omit recipients', { type: NodeType.SCRIPT, props: { triggerType: 'MESSAGE', actionBody: { title: '通知', content: '内容' } } });

const trace = normalizeWorkflowTrace({ historyDetails: WORKFLOW_TASK_TYPES.map((taskType, index) => ({
  historyId: String(index), taskId: String(index), nodeKey: `node-${index}`, nodeName: taskType, taskType,
  operatorId: '1', operatorName: '测试', action: taskType === 'WEIGHT_SIGN' ? 'COUNTERSIGN_REJECT' : taskType,
  createTime: '2026-09-06T09:00:00',
})), activeDetails: [{ nodeKey: 'timer', nodeName: '等待', nodeType: 'TIMER' }, { nodeKey: 'weight', nodeName: '票签', taskType: 'WEIGHT_SIGN', assignee: '2' }] });
check('mobile trace retains all 18 semantic types', () => assert.deepEqual(trace.filter((node) => node.type === 'HISTORY').map((node) => node.taskType), [...WORKFLOW_TASK_TYPES]));
check('mobile auto skip stays skipped', () => assert.equal(trace.find((node) => node.taskType === 'AUTO_SKIP')?.status, 'skipped'));
check('weight rejection stays a rejected vote', () => assert.equal(trace.find((node) => node.taskType === 'WEIGHT_SIGN' && node.type === 'HISTORY')?.status, 'rejected'));
check('delegate return is not a rejection', () => assert.equal(getWorkflowActionState('DELEGATE_RETURN'), 'finished'));
check('mobile timer action retains node kind', () => assert.equal(trace.find((node) => node.nodeKey === 'timer')?.nodeType, 'TIMER'));
check('mobile active task retains semantic type', () => assert.equal(trace.find((node) => node.nodeKey === 'weight')?.taskType, 'WEIGHT_SIGN'));
check('vote action has a separate readable label', () => assert.equal(getWorkflowActionLabel('COUNTERSIGN_REJECT'), '投票反对'));
check('process status count', () => assert.equal(Object.keys(PROCESS_STATUSES).length, 14));
check('timer cannot resume paused or failed instance directly', () => assert.ok(!isProcessActive('PAUSED') && !isProcessActive('FAILED')));
check('waiting process can finish timer', () => assert.equal(isProcessActive('PENDING'), true));
check('success process states are terminal', () => assert.ok(isProcessSuccessful('PASSED') && isProcessSuccessful('AUTO_PASSED') && isProcessTerminal('AUTO_PASSED')));
check('withdrawn task remains open', () => assert.equal(isProcessTerminal('WITHDRAWN'), false));
const agentTask = mapBackendTaskToFrontend({ taskId: 'agent-task', assignee: 21, assigneeName: '本人', proxyUserId: 22,
  agentSettingId: 'setting', agentMode: 'AGENT', version: 0, status: 'TODO', onBehalfOfUserId: 21, onBehalfOfUserName: '本人', operatorId: 22, operatorName: '代理人' });
const agentUser = { id: '22', role: Role.EMPLOYEE } as User;
const principalUser = { id: '21', role: Role.EMPLOYEE } as User;
const completedApproval = mapBackendTaskToFrontend({ taskId: 'completed', historyId: 'history', canWithdraw: true,
  operatorId: 22, onBehalfOfUserId: 21, status: 'COMPLETED' });
check('done mapper retains the real approval history identifier', () => assert.equal(completedApproval.historyId, 'history'));
check('actual operator can withdraw an eligible completed approval', () => assert.equal(canWithdrawWorkflowApproval(completedApproval, agentUser.id), true));
check('principal cannot withdraw an approval performed by an agent', () => assert.equal(canWithdrawWorkflowApproval(completedApproval, principalUser.id), false));
check('unrelated user cannot withdraw completed approval', () => assert.equal(canWithdrawWorkflowApproval(completedApproval, '23'), false));
check('missing current user cannot withdraw completed approval', () => assert.equal(canWithdrawWorkflowApproval(completedApproval, undefined), false));
check('invalidated history cannot expose withdrawal', () => assert.equal(canWithdrawWorkflowApproval({ ...completedApproval, canWithdraw: false }, agentUser.id), false));
check('missing backend eligibility cannot expose withdrawal', () => assert.equal(canWithdrawWorkflowApproval({ ...completedApproval, canWithdraw: undefined }, agentUser.id), false));
check('missing history identifier cannot expose withdrawal', () => assert.equal(canWithdrawWorkflowApproval({ ...completedApproval, historyId: undefined }, agentUser.id), false));
check('task owner is never treated as the actual history operator', () => assert.equal(canWithdrawWorkflowApproval({ ...completedApproval, operatorId: undefined, assigneeId: agentUser.id }, agentUser.id), false));
check('task mapper keeps zero lock version', () => assert.equal(agentTask.version, 0));
check('task mapper preserves proxy and attribution identifiers', () => assert.deepEqual([agentTask.proxyUserId, agentTask.onBehalfOfUserId, agentTask.operatorId], ['22', '21', '22']));
check('eligible agent can operate', () => assert.equal(canHandleWorkflowTask(agentTask, agentUser), true));
check('principal keeps own handling rights', () => assert.equal(canHandleWorkflowTask(agentTask, principalUser), true));
check('unrelated employee cannot operate', () => assert.equal(canHandleWorkflowTask(agentTask, { ...agentUser, id: '23' }), false));
check('assistant cannot operate', () => assert.equal(canHandleWorkflowTask({ ...agentTask, agentMode: 'AGENT_ASSIST' }, agentUser), false));
check('assistant administrator cannot bypass assigned assistant mode', () => assert.equal(canHandleWorkflowTask({ ...agentTask, agentMode: 'AGENT_ASSIST' }, { ...agentUser, role: Role.ADMIN }), false));
check('principal can still decide after assigning assistant', () => assert.equal(canHandleWorkflowTask({ ...agentTask, agentMode: 'AGENT_ASSIST' }, principalUser), true));
check('expired proxy cannot use administrator override', () => assert.equal(canHandleWorkflowTask({ ...agentTask, agentMode: undefined }, { ...agentUser, role: Role.ADMIN }), false));
check('proxy without setting has no agent authority', () => assert.equal(canHandleWorkflowTask({ ...agentTask, agentSettingId: undefined }, agentUser), false));
check('completed task has no agent actions', () => assert.equal(getTaskAgentMode({ ...agentTask, status: TaskStatus.APPROVED }, agentUser.id), undefined));
check('owner is not shown the received proxy controls', () => assert.equal(getTaskAgentMode(agentTask, principalUser.id), undefined));
check('trace shows real operator and principal', () => assert.equal(getWorkflowOperatorLabel(agentTask), '代理人（代本人办理）'));
check('normal delegation retains actual actor only', () => assert.equal(getWorkflowOperatorLabel({ operatorName: '受委派人' }), '受委派人'));
check('assistant history uses readable action', () => assert.equal(getWorkflowActionLabel('AGENT_ASSIST'), '提交协办意见'));
check('agent return history uses readable action', () => assert.equal(getWorkflowActionLabel('AGENT_RETURN'), '归还原审批人'));
check('normalized request errors retain HTTP conflict status', () => assert.equal(getErrorStatus(Object.assign(new Error('版本变更'), { status: 409 })), 409));
check('network failure is not a version conflict', () => assert.equal(getErrorStatus(new Error('网络失败')), undefined));
check('gateway progress with no activations is absent', () => assert.equal(renderToStaticMarkup(createElement(GatewayRoundProgress, { rounds: [] })), ''));
for (const [status, label] of [['WAITING', '等待汇聚'], ['RELEASED', '已汇聚'], ['CANCELLED', '已取消']] as const) {
  check(`gateway ${status} renders real arrival count and round separately`, () => {
    const round: WorkflowGatewayRound = { roundId: `round-${status}`, nodeKey: 'split', nodeName: '<unsafe>', joinNodeKey: 'join', joinType: 'INCLUSIVE',
      status, arrivedCount: status === 'RELEASED' ? 2 : 1, expectedCount: 2 };
    const markup = renderToStaticMarkup(createElement(GatewayRoundProgress, { rounds: [round] }));
    assert.ok(markup.includes(label) && markup.includes(round.roundId) && markup.includes('个分支') && markup.includes('&lt;unsafe&gt;'));
    assert.ok(!markup.includes('<unsafe>'));
  });
}
check('withdrawal history uses the readable approval action', () => assert.equal(getWorkflowActionLabel('WITHDRAW'), '撤回本人审批'));
checks += runWorkflowGatewayChecks();
checks += runRefundApprovalDisplayChecks();
console.log(`PASS: ${checks} frontend workflow semantic checks`);
