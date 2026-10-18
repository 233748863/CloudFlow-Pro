import { GitMerge } from 'lucide-react';
import type { WorkflowGatewayRound } from '@/types/workflow';

const states = {
  WAITING: { label: '等待汇聚', style: 'text-amber-800 dark:text-amber-200' },
  RELEASED: { label: '已汇聚', style: 'text-emerald-800 dark:text-emerald-200' },
  CANCELLED: { label: '已取消', style: 'text-cf-subtle' },
};

export const GatewayRoundProgress = ({ rounds }: { rounds?: WorkflowGatewayRound[] }) => {
  if (!rounds?.length) return null;
  return <section aria-label="分支汇聚进度" className="space-y-3 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-4 dark:border-slate-800">
    <h4 className="flex items-center gap-2 text-sm font-semibold text-cf-title"><GitMerge size={16} />分支汇聚进度</h4>
    <ul className="space-y-3">
      {rounds.map(round => {
        const state = states[round.status];
        return <li key={round.roundId} data-gateway-round={round.roundId} className="min-w-0 rounded-md bg-[var(--cf-surface-muted)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="break-words font-medium text-cf-title">{round.nodeName || round.nodeKey}</span>
            <span className={state?.style || 'text-cf-subtle'}>{state?.label || '状态不可用'}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cf-body">
            <span>{round.joinType === 'INCLUSIVE' ? '包含网关' : '并行网关'}</span>
            <span>已到达 {round.arrivedCount}/{round.expectedCount} 个分支</span>
          </div>
          <p className="mt-2 break-all text-xs text-cf-subtle">轮次 {round.roundId}</p>
          {round.createTime && <p className="mt-1 text-xs text-cf-subtle">分流时间 {round.createTime}</p>}
          {round.releasedTime && <p className="mt-1 text-xs text-cf-subtle">汇聚时间 {round.releasedTime}</p>}
        </li>;
      })}
    </ul>
  </section>;
};
