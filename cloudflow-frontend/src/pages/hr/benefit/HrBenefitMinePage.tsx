import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Gift, Coins, Package, History, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { getMyBenefitSummary, type HrBenefitMineSummary } from '@/services/api/hr';
import { formatDateTimeValue, formatMoneyValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import './HrBenefitMinePage.css';
import '../../../styles/features/admin-recruitment.css';

export const HrBenefitMinePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<HrBenefitMineSummary | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyBenefitSummary();
      setSummary(res);
    } catch (error) {
      toast.error(getErrorMessage(error, '我的福利加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const pointAccount = summary?.pointAccount as Record<string, unknown> | undefined;
  const ledgerRows = useMemo(() => {
    const activeBenefits = (summary?.activeBenefits ?? []).map((row: Record<string, unknown>, idx) => ({
      id: `benefit-${String(row.id ?? idx)}`,
      category: '在享福利',
      subject: String(row.schemeName ?? row.name ?? '-'),
      detail: String(row.benefitType ?? row.category ?? '福利方案'),
      amount: formatMoneyValue(row.amount ?? row.quotaAmount),
      status: String(row.statusDesc ?? row.status ?? '生效中'),
      time: `${String(row.startDate ?? '-')} ~ ${String(row.endDate ?? '长期')}`,
    }));

    const inFlightOrders = (summary?.inFlightOrders ?? []).map((row) => ({
      id: `order-${row.id}`,
      category: '在途订单',
      subject: row.orderNo || `订单 #${row.id}`,
      detail: `${row.items?.length ?? 0} 个商品`,
      amount: `${Number(row.totalPoints ?? 0).toLocaleString()} 分`,
      status: row.status ? <DictLabel dictType="hr_mall_order_status" value={row.status} fallback="-" /> : '-',
      time: formatDateTimeValue(row.createTime),
    }));

    const recentRequests = (summary?.recentRequests ?? []).map((row) => ({
      id: `request-${row.id}`,
      category: '历史申领',
      subject: row.requestNo || `申领 #${row.id}`,
      detail: row.requestType ? <DictLabel dictType="hr_benefit_request_type" value={row.requestType} fallback="-" /> : '-',
      amount: `${row.amount ? formatMoneyValue(row.amount) : '-'}${row.pointAmount ? ` / ${row.pointAmount} 分` : ''}`,
      status: row.status ? <DictLabel dictType="hr_benefit_request_status" value={row.status} fallback="-" /> : '-',
      time: formatDateTimeValue(row.createTime),
    }));

    return [...activeBenefits, ...inFlightOrders, ...recentRequests];
  }, [summary]);

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">my benefits</p>
          <h2>我的福利</h2>
          <span>查看个人积分账户、在享福利、在途订单和历史申领。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Coins size={18} /></span>
          <div><p>可用积分</p><strong>{Number(pointAccount?.availablePoints ?? 0).toLocaleString()}</strong><span>可兑换余额</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Gift size={18} /></span>
          <div><p>累计获得</p><strong>{Number(pointAccount?.totalEarned ?? 0).toLocaleString()}</strong><span>历史收入</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Package size={18} /></span>
          <div><p>累计消费</p><strong>{Number(pointAccount?.totalSpent ?? 0).toLocaleString()}</strong><span>历史支出</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><History size={18} /></span>
          <div><p>冻结积分</p><strong>{Number(pointAccount?.frozenPoints ?? 0).toLocaleString()}</strong><span>审批或占用中</span></div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
      <section className="admin-source-inline-toolbar admin-benefit-mine-toolbar">
        <div className="admin-benefit-mine-counts">
          <span>在享福利 <strong>{summary?.activeBenefits?.length ?? 0}</strong></span>
          <span>在途订单 <strong>{summary?.inFlightOrders?.length ?? 0}</strong></span>
          <span>历史申领 <strong>{summary?.recentRequests?.length ?? 0}</strong></span>
        </div>
      </section>
  );

  const pageTable = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <div className="admin-recruitment-table-head">
        <div>
          <strong>福利流水</strong>
          <span>在享福利、商城订单和历史申领合并为一张业务明细表。</span>
        </div>
        <span className="admin-users-filter-count">{loading ? '同步中' : `${ledgerRows.length} 条`}</span>
      </div>
      <table className="unity-data-table admin-source-table min-w-[980px]">
        <thead>
          <tr>
            <th>类型</th>
            <th>编号 / 名称</th>
            <th>业务内容</th>
            <th>金额 / 积分</th>
            <th>状态</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">加载中...</td>
            </tr>
          ) : ledgerRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">暂无福利明细</td>
            </tr>
          ) : (
            ledgerRows.map((row) => (
              <tr key={row.id}>
                <td className="text-sm">{row.category}</td>
                <td className="max-w-[16rem] truncate text-sm font-medium">{row.subject}</td>
                <td className="text-xs">{row.detail}</td>
                <td className="text-xs">{row.amount}</td>
                <td className="text-sm">{row.status}</td>
                <td className="text-xs">{row.time}</td>
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
        table={pageTable}
      />
    </section>
  );
};

export default HrBenefitMinePage;
