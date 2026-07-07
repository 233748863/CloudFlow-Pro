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
import { Button, Input } from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrEssPortalSummary,
  getEssPortalSummary,
  markMessageRead,
  markAllMessagesRead,
} from '@/services/api/hr';
import { formatDateValue, formatDateTimeValue, formatMoneyValue } from './hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const SummaryCard: React.FC<{
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'blue' | 'green' | 'violet' | 'amber';
  onClick?: () => void;
}> = ({ title, value, hint, icon, tone = 'blue', onClick }) => {
  const content = (
    <>
      <div className="admin-source-stat-icon">{icon}</div>
      <div><p>{title}</p><strong>{value}</strong>{hint ? <span>{hint}</span> : null}</div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`card admin-source-stat admin-source-tone-${tone} text-left`}>
        {content}
      </button>
    );
  }
  return (
    <article className={`card admin-source-stat admin-source-tone-${tone}`}>{content}</article>
  );
};

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

  const selfServiceRows = useMemo(() => {
    const leaveRows = (summary?.leaveBalances ?? []).map((item) => ({
      id: `leave-${item.leaveTypeId}-${item.year ?? ''}`,
      category: '假期余额',
      subject: item.leaveTypeName || item.leaveCode || `类型 #${item.leaveTypeId}`,
      detail: `剩余 ${Number(item.remainQuota || 0).toFixed(1)} / 共 ${Number(item.totalQuota || 0).toFixed(1)} ${item.unit || '天'}`,
      status: item.year ? String(item.year) : '当前',
      time: '-',
      action: null as React.ReactNode,
    }));

    const messageRows = (summary?.unreadMessages ?? []).map((msg) => ({
      id: `message-${msg.id}`,
      category: '未读消息',
      subject: msg.title,
      detail: msg.summary || '-',
      status: '未读',
      time: formatDateTimeValue(msg.createTime),
      action: (
        <Button size="sm" variant="ghost" onClick={() => void handleMarkOneRead(msg.id)}>
          标记已读
        </Button>
      ),
    }));

    const certificateRows = (summary?.recentCertificates ?? []).map((cert) => ({
      id: `certificate-${cert.id}`,
      category: '证明开具',
      subject: `${cert.requestNo} · ${cert.certificateType}`,
      detail: cert.purpose || '-',
      status: <DictLabel dictType="hr_certificate_status" value={String(cert.status ?? '')} fallback="-" />,
      time: formatDateTimeValue(cert.createTime),
      action: null as React.ReactNode,
    }));

    const contractRows = (summary?.pendingContracts ?? []).map((contract: any) => ({
      id: `contract-${contract.id}`,
      category: '待签合同',
      subject: contract.contractNo || `合同 #${contract.id}`,
      detail: (
        <>
          <DictLabel dictType="hr_contract_type" value={String(contract.contractType ?? '')} fallback="-" />
          {' · '}
          {formatDateValue(contract.startDate)} - {formatDateValue(contract.endDate)}
        </>
      ),
      status: <DictLabel dictType="contract_status" value={String(contract.status ?? '')} fallback="-" />,
      time: formatDateTimeValue(contract.createTime),
      action: null as React.ReactNode,
    }));

    return [...messageRows, ...contractRows, ...certificateRows, ...leaveRows];
  }, [summary]);

  async function handleMarkOneRead(id: number) {
    try {
      await markMessageRead(id);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '消息标记失败'));
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllMessagesRead();
      toast.success('全部消息已标记为已读');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '批量标记失败'));
    }
  }

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">EMPLOYEE SELF SERVICE</p>
          <h2>员工自助门户</h2>
          <span>集中查看假期、工资、合同、证明和站内消息</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <SummaryCard
          title="假期余额"
          value={remainingLeave}
          hint="单位：天"
          icon={<CalendarClock size={18} />}
          tone="blue"
          onClick={() => navigate('/hr/ess/leave-balance')}
        />
        <SummaryCard
          title="最新工资条"
          value={summary?.latestSlip && Object.keys(summary.latestSlip).length ? formatMoneyValue((summary.latestSlip as any).netTotal) : '-'}
          hint={summary?.latestSlip && Object.keys(summary.latestSlip).length ? `期间 ${(summary.latestSlip as any).periodMonth ?? ''}` : '暂无'}
          icon={<Wallet size={18} />}
          tone="green"
          onClick={() => navigate('/hr/ess/slips')}
        />
        <SummaryCard
          title="待签合同"
          value={(summary?.pendingContracts?.length ?? 0).toString()}
          hint="点击进入电子合同"
          icon={<FileSignature size={18} />}
          tone="violet"
          onClick={() => navigate('/hr/ess/contract')}
        />
        <SummaryCard
          title="证明开具"
          value={(summary?.recentCertificates?.length ?? 0).toString()}
          hint="最近 5 条"
          icon={<FileBadge size={18} />}
          tone="amber"
          onClick={() => navigate('/hr/ess/certificates')}
        />
      </section>
    </div>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div>
            <span className="input-label">未读消息</span>
            <div className="admin-source-search-field">
              <Bell size={16} />
              <Input className="h-[42px]" value={`${summary?.unreadCount ?? 0} 条`} readOnly aria-label="未读消息数量" />
            </div>
          </div>
        </div>
      </section>
  );

  const pageContent = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <div className="admin-recruitment-table-head">
        <div>
          <strong>自助事项</strong>
          <span>假期、消息、证明和合同统一进入一张个人事项表。</span>
        </div>
        <div className="admin-users-toolbar-actions">
          {summary?.unreadMessages?.length ? (
            <Button size="sm" variant="outline" onClick={() => void handleMarkAllRead()}>
              全部已读
            </Button>
          ) : null}
          <span className="admin-users-filter-count">{loading ? '同步中' : `${selfServiceRows.length} 条`}</span>
        </div>
      </div>
      <table className="unity-data-table admin-source-table min-w-[980px]">
        <thead>
          <tr>
            <th>事项类型</th>
            <th>标题</th>
            <th>内容</th>
            <th>状态</th>
            <th>时间</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-slate-400">加载中...</td>
            </tr>
          ) : selfServiceRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                <UserCheck className="mx-auto mb-1 h-5 w-5" />暂无自助事项
              </td>
            </tr>
          ) : (
            selfServiceRows.map((row) => (
              <tr key={row.id}>
                <td className="text-sm">{row.category}</td>
                <td className="max-w-[16rem] truncate text-sm font-medium">{row.subject}</td>
                <td className="max-w-[28rem] truncate text-xs">{row.detail}</td>
                <td className="text-sm">{row.status}</td>
                <td className="text-xs">{row.time}</td>
                <td className="text-right">{row.action}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default HrEssPortalPage;
