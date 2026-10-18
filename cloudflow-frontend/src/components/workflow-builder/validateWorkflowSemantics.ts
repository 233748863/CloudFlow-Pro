import type { WorkflowGraphDefinition } from '@/types';
import { NODE_OPERATION_LABELS, REJECT_STRATEGY_LABELS } from '@/types/workflowSemantic';
import { getWorkflowUpstreamNodes } from '@/utils/workflowGraph';

const decimalCents = (value: unknown, maximum: number, allowZero: boolean): number | null => {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value ?? ''))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number <= maximum && (allowZero ? number >= 0 : number > 0) ? Math.round(number * 100) : null;
};

const jsonObject = (value: unknown): Record<string, unknown> | null => {
  if (value == null || value === '') return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const validateWorkflowSemantics = (graph: WorkflowGraphDefinition): Array<{ nodeId: string; message: string }> => {
  const errors: Array<{ nodeId: string; message: string }> = [];
  for (const node of graph.nodes) {
    const error = (message: string) => errors.push({ nodeId: node.id, message: `节点“${node.title || node.id}”：${message}` });
    const props = node.props && typeof node.props === 'object' ? node.props as Record<string, unknown> : {};
    if (node.rejectStrategy && !Object.hasOwn(REJECT_STRATEGY_LABELS, node.rejectStrategy)) error('驳回策略无效');
    if (node.rejectStrategy === 'TO_SPECIFIED_NODE' && !getWorkflowUpstreamNodes(graph, node.id).some((candidate) => candidate.id === node.rejectToNodeKey)) {
      error('请选择有效的上游驳回目标，不能选择当前节点、下游或并行兄弟分支');
    }
    if (node.approveSelf && !['ALLOW', 'AUTO_SKIP', 'TO_DIRECT_LEADER', 'TO_DEPT_MANAGER'].includes(node.approveSelf)) error('自审策略无效');
    for (const key of Object.keys(NODE_OPERATION_LABELS)) {
      if (node[key] != null && typeof node[key] !== 'boolean') error(`${NODE_OPERATION_LABELS[key as keyof typeof NODE_OPERATION_LABELS]}的开关值无效`);
    }
    if (node.approverType === 'MULTI_LEVEL_MANAGER') {
      const level = node.directorLevel ?? 1;
      if (!Number.isInteger(level) || level < 1 || level > 10) error('主管层级必须为 1—10 的整数');
      if (node.directorFallback && !['TOP_LEVEL', 'SKIP', 'FAIL'].includes(node.directorFallback)) error('主管层级不足策略无效');
    }
    if (node.approverType === 'INITIATOR_SELECTED') {
      if (node.allowSelection === false) error('发起人自选节点必须开启选人');
      for (const [key, ids] of Object.entries(node.selectableScope ?? {})) {
        if (!['roleIds', 'deptIds'].includes(key) || !Array.isArray(ids) || ids.some((identifier) => !/^\d+$/.test(String(identifier)) || Number(identifier) <= 0)) error('选人范围必须为有效角色或部门');
      }
    }
    if (node.signType === 'WEIGHT') {
      const threshold = decimalCents(node.passWeight, 99999999.99, false);
      if (threshold == null) error('通过权重必须大于 0、最多两位小数且不超过 99999999.99');
      const source = node.weightSource ?? 'EQUAL';
      if (!['EQUAL', 'BY_CONFIG', 'BY_JOB_LEVEL'].includes(source)) error('票权来源无效');
      const configured = new Map<string, number>();
      if (source !== 'EQUAL') {
        const rows = node.assigneeWeights ?? [];
        if (rows.length === 0) error('请配置人员或职级对应的票权');
        for (const row of rows) {
          const key = source === 'BY_CONFIG' ? 'userId' : 'jobLevelId';
          const identifier = String(row[key] ?? '');
          const weight = decimalCents(row.weight, 9999.99, true);
          if (!/^\d+$/.test(identifier) || Number(identifier) <= 0) error('每项票权都必须选择人员或职级');
          if (Object.keys(row).some((name) => name !== key && name !== 'weight')) error('票权来源与配置项不一致');
          if (configured.has(identifier)) error('同一人员或职级不能重复配置票权');
          if (weight == null) error('单人票权必须为 0.00—9999.99，最多两位小数');
          configured.set(identifier, weight ?? 0);
        }
      }
      if (['USER', 'USERS', 'USER_LIST'].includes(String(node.approverType)) && typeof node.approverValue === 'string') {
        const selected = node.approverValue.split(',').map((value) => value.trim()).filter(Boolean);
        if (selected.length > 0 && source !== 'BY_JOB_LEVEL') {
          if (source === 'BY_CONFIG' && selected.some((identifier) => !configured.has(identifier))) error('每位参与人都需要配置票权');
          const total = selected.reduce((sum, identifier) => sum + (source === 'EQUAL' ? 100 : configured.get(identifier) ?? 0), 0);
          if (total === 0 || total > 9999999999 || threshold != null && threshold > total) error('参与人总权重必须大于 0、最多 99999999.99，且不少于通过阈值');
        }
      }
    }
    if (node.type === 'TIMER') {
      if (props.delayValue != null && (!Number.isInteger(Number(props.delayValue)) || Number(props.delayValue) < 1 || Number(props.delayValue) > 36500)) error('延迟数量必须为 1—36500 的整数');
      if (props.delayUnit != null && !['MINUTE', 'HOUR', 'DAY', 'WORKDAY'].includes(String(props.delayUnit))) error('延迟单位无效');
      if (props.timerType === 'FIXED_TIME' && !String(props.fixedTime ?? '').trim()) error('请设置固定时间或时间变量');
      if (props.timerType === 'CRON_ONCE') {
        const expression = String(props.cronExpression ?? '').trim();
        if (!['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly'].includes(expression) && expression.split(/\s+/).length !== 6) error('时间表达式需要秒、分、时、日、月、星期六项');
      }
      if (props.timerAction != null && !['AUTO_PASS', 'AUTO_REJECT', 'NOTIFY_ONLY'].includes(String(props.timerAction))) error('定时到期动作无效');
    }
    if (node.type === 'SCRIPT') {
      if (props.triggerType != null && !['HTTP_CALLBACK', 'INNER_SERVICE', 'MESSAGE'].includes(String(props.triggerType))) error('触发类型无效');
      if (props.failStrategy != null && !['BLOCK', 'SKIP', 'TO_DLQ'].includes(String(props.failStrategy))) error('触发失败策略无效');
      for (const [key, minimum, maximum] of [['retryCount', 0, 5], ['timeoutSeconds', 1, 60]] as const) {
        if (props[key] != null && (!Number.isInteger(Number(props[key])) || Number(props[key]) < minimum || Number(props[key]) > maximum)) error(`${key === 'retryCount' ? '重试次数' : '超时秒数'}必须为 ${minimum}—${maximum} 的整数`);
      }
      if (props.triggerType) {
        for (const [key, label] of [['actionHeaders', '请求头'], ['actionBody', '请求体']]) {
          if (jsonObject(props[key]) === null) error(`${label}必须为合法 JSON 对象`);
        }
        if (props.triggerType === 'MESSAGE') {
          const body = jsonObject(props.actionBody);
          if (!body || !Array.isArray(body.recipientIds) || body.recipientIds.length === 0 || !String(body.title ?? '').trim() || !String(body.content ?? '').trim()) error('消息必须设置接收人、标题和正文');
        } else {
          const url = String(props.actionUrl ?? props.apiUrl ?? '').trim();
          if (!url) error('请填写请求地址');
          else if (!url.includes('${')) {
            try {
              const parsed = new URL(url);
              if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) error('请求地址仅允许 HTTP(S)，不能携带登录凭据或片段');
            } catch { error('请求地址格式无效'); }
          }
        }
      }
    }
  }
  return errors;
};
