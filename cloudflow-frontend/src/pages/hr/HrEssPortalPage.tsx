import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarClock,
  FileBadge,
  FileSignature,
  RefreshCcw,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrEssPortalSummary,
  getEssPortalSummary,
  markMessageRead,
  markAllMessagesRead,
} from '@/services/api/hr';
import { formatDateValue, formatDateTimeValue, formatMoneyValue, enumLabel } from './hrShared';

const certificateStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待审批',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  ISSUED: '已开具',
  CANCELLED: '已取消',
};

const SummaryCard: React.FC<{
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'sky' | 'emerald' | 'violet' | 'amber' | 'rose';
  onClick?: () => void;
}> = ({ title, value, hint, icon, tone = 'sky', onClick }) => {
  const toneClass: Record<string, string> = {
    sky: 'from-sky-500/15 to-sky-500/5 text-sky-700 dark:text-sky-200',
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-200',
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-200',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-700 dark:text-amber-200',
    rose: 'from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group relative flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br p-5 text-left shadow-sm transition hover:shadow-md disabled:cursor-default dark:border-slate-800 dark:from-slate-900 ${toneClass[tone]}`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 backdrop-blur dark:bg-slate-900/50">
        {icon}
      </div>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</div>
      {hint ? <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </button>
  );
};

const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  action,
  children,
}) => (
  <TableSurfaceCard className="p-5">
    <div className="mb-3 flex items-center justify-between">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {action}
    </div>
    {children}
  </TableSurfaceCard>
);

export const HrEssPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<HrEssPortalSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEssPortalSummary();
      setSummary(res);
    } catch (error) {
      toast.error(getErrorMessage(error, '员工自助门户加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remainingLeave = useMemo(() => {
    if (!summary?.leaveBalances?.length) return '0';
    const total = summary.leaveBalances.reduce((acc, item) => acc + Number(item.remainQuota || 0), 0);
    return total.toFixed(1);
  }, [summary]);

  const handleMarkOneRead = async (id: number) => {
    try {
      await markMessageRead(id);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '消息标记失败'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllMessagesRead();
      toast.success('全部消息已标记为已读');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '批量标记失败'));
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">员工自助门户</div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {summary?.employee?.name ? `${summary.employee.name} · ${summary.employee.employeeNo}` : '加载中...'}
          </div>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />刷新
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="假期余额"
          value={remainingLeave}
          hint="单位：天"
          icon={<CalendarClock className="h-5 w-5" />}
          tone="sky"
          onClick={() => navigate('/hr/ess/leave-balance')}
        />
        <SummaryCard
          title="最新工资条"
          value={summary?.latestSlip && Object.keys(summary.latestSlip).length ? formatMoneyValue((summary.latestSlip as any).netTotal) : '-'}
          hint={summary?.latestSlip && Object.keys(summary.latestSlip).length ? `期间 ${(summary.latestSlip as any).periodMonth ?? ''}` : '暂无'}
          icon={<Wallet className="h-5 w-5" />}
          tone="emerald"
          onClick={() => navigate('/hr/ess/slips')}
        />
        <SummaryCard
          title="待签合同"
          value={(summary?.pendingContracts?.length ?? 0).toString()}
          hint="点击进入电子合同"
          icon={<FileSignature className="h-5 w-5" />}
          tone="violet"
          onClick={() => navigate('/hr/ess/contract')}
        />
        <SummaryCard
          title="证明开具"
          value={(summary?.recentCertificates?.length ?? 0).toString()}
          hint="最近 5 条"
          icon={<FileBadge className="h-5 w-5" />}
          tone="amber"
          onClick={() => navigate('/hr/ess/certificates')}
        />
        <SummaryCard
          title="未读消息"
          value={(summary?.unreadCount ?? 0).toString()}
          hint="点击下方列表处理"
          icon={<Bell className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="假期余额明细">
          {summary?.leaveBalances?.length ? (
            <ul className="space-y-2 text-sm">
              {summary.leaveBalances.map((item) => (
                <li
                  key={`${item.leaveTypeId}-${item.year ?? ''}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200/70 px-3 py-2 dark:border-slate-800"
                >
                  <span className="text-slate-700 dark:text-slate-200">{item.leaveTypeName || item.leaveCode || `类型#${item.leaveTypeId}`}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    剩余 <strong className="text-emerald-600 dark:text-emerald-300">{Number(item.remainQuota || 0).toFixed(1)}</strong>
                    {' '}/ 共 {Number(item.totalQuota || 0).toFixed(1)} {item.unit || '天'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">暂无假期余额</div>
          )}
        </Section>

        <Section
          title="未读消息"
          action={
            summary?.unreadMessages?.length ? (
              <Button size="sm" variant="ghost" onClick={() => void handleMarkAllRead()}>
                全部已读
              </Button>
            ) : null
          }
        >
          {summary?.unreadMessages?.length ? (
            <ul className="space-y-2 text-sm">
              {summary.unreadMessages.map((msg) => (
                <li key={msg.id} className="rounded-lg border border-slate-200/70 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-800 dark:text-slate-100">{msg.title}</div>
                    <Button size="sm" variant="ghost" onClick={() => void handleMarkOneRead(msg.id)}>
                      标记已读
                    </Button>
                  </div>
                  {msg.summary ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{msg.summary}</div> : null}
                  {msg.createTime ? (
                    <div className="mt-1 text-xs text-slate-400">{formatDateTimeValue(msg.createTime)}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">
              <UserCheck className="mx-auto mb-1 h-5 w-5" />暂无未读消息
            </div>
          )}
        </Section>

        <Section title="最近证明开具">
          {summary?.recentCertificates?.length ? (
            <ul className="space-y-2 text-sm">
              {summary.recentCertificates.map((cert) => (
                <li key={cert.id} className="flex items-center justify-between rounded-lg border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {cert.requestNo} · {cert.certificateType}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{cert.purpose || '-'}</div>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{enumLabel(certificateStatusLabel, cert.status)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">暂无证明记录</div>
          )}
        </Section>

        <Section title="待签合同">
          {summary?.pendingContracts?.length ? (
            <ul className="space-y-2 text-sm">
              {summary.pendingContracts.map((contract: any) => (
                <li key={contract.id} className="rounded-lg border border-slate-200/70 p-3 dark:border-slate-800">
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {contract.contractNo || `合同#${contract.id}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {contract.contractType ? `${contract.contractType} · ` : ''}
                    生效 {formatDateValue(contract.startDate)} - {formatDateValue(contract.endDate)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-sm text-slate-400">暂无待签合同</div>
          )}
        </Section>
      </div>
    </div>
  );
};

export default HrEssPortalPage;
