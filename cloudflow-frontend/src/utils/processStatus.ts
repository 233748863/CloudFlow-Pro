export const PROCESS_STATUSES = {
  DRAFT: { label: '草稿', tone: 'neutral' },
  RUNNING: { label: '审批中', tone: 'warning' },
  PASSED: { label: '已通过', tone: 'good' },
  AUTO_PASSED: { label: '自动通过', tone: 'good' },
  REJECTED: { label: '已驳回', tone: 'critical' },
  TERMINATED: { label: '已终止', tone: 'critical' },
  INVALIDATED: { label: '已作废', tone: 'critical' },
  CANCELLED: { label: '发起人已撤销', tone: 'neutral' },
  WITHDRAWN: { label: '审批人已撤回', tone: 'warning' },
  TASK_BACK: { label: '已回退', tone: 'warning' },
  PAUSED: { label: '已暂停', tone: 'warning' },
  RESTARTED: { label: '重新提交', tone: 'warning' },
  PENDING: { label: '等待外部处理', tone: 'warning' },
  FAILED: { label: '执行异常', tone: 'critical' },
} as const;

export type ProcessStatus = keyof typeof PROCESS_STATUSES;

export const getProcessStatusLabel = (status?: string) =>
  PROCESS_STATUSES[status as ProcessStatus]?.label ?? status ?? '未知';

export const getProcessStatusClass = (status?: string) => {
  const tone = PROCESS_STATUSES[status as ProcessStatus]?.tone ?? 'neutral';
  const colors = {
    good: 'text-[var(--cf-chart-good)]',
    warning: 'text-[var(--cf-chart-warning)]',
    critical: 'text-[var(--cf-chart-critical)]',
    neutral: 'text-cf-muted',
  };
  return `border border-current bg-[var(--cf-surface-muted)] ${colors[tone]}`;
};

export const isProcessSuccessful = (status?: string) => status === 'PASSED' || status === 'AUTO_PASSED';

export const isProcessActive = (status?: string) =>
  ['RUNNING', 'WITHDRAWN', 'TASK_BACK', 'RESTARTED', 'PENDING'].includes(status ?? '');

export const isProcessTerminal = (status?: string) =>
  ['PASSED', 'AUTO_PASSED', 'REJECTED', 'TERMINATED', 'INVALIDATED', 'CANCELLED'].includes(status ?? '');
