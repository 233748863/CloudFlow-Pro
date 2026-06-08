import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Coins, Package, History, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, TableHead, TableHeader } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import { getMyBenefitSummary, type HrBenefitMineSummary } from '@/services/api/hr';
import { formatDateTimeValue, formatMoneyValue } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';

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

  const filters = (
    <FilterBar
      stats={[
        { label: '在享福利', value: summary?.activeBenefits?.length ?? 0 },
        { label: '在途订单', value: summary?.inFlightOrders?.length ?? 0 },
      ]}
      actions={[
        <Button key="refresh" variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
      ]}
    />
  );

  const table = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <TableSurfaceCard>
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">可用积分</div>
              <div className="text-2xl font-semibold">
                {Number(pointAccount?.availablePoints ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </TableSurfaceCard>
        <TableSurfaceCard>
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">累计获得</div>
              <div className="text-2xl font-semibold">
                {Number(pointAccount?.totalEarned ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </TableSurfaceCard>
        <TableSurfaceCard>
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">累计消费</div>
              <div className="text-2xl font-semibold">
                {Number(pointAccount?.totalSpent ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </TableSurfaceCard>
        <TableSurfaceCard>
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">冻结积分</div>
              <div className="text-2xl font-semibold">
                {Number(pointAccount?.frozenPoints ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
        </TableSurfaceCard>
      </div>

      {loading ? (
        <TableSurfaceCard>
          <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
        </TableSurfaceCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              在享福利方案 · 共 {summary?.activeBenefits?.length ?? 0} 项
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <TableHeader>
                  <tr>
                    <TableHead>方案</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>额度</TableHead>
                    <TableHead>生效期</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(summary?.activeBenefits ?? []).length ? (
                    (summary?.activeBenefits ?? []).map((row: Record<string, unknown>, idx) => (
                      <tr key={String(row.id ?? idx)}>
                        <td className="px-4 py-2 text-sm font-medium">{String(row.schemeName ?? row.name ?? '-')}</td>
                        <td className="px-4 py-2 text-xs">{String(row.benefitType ?? row.category ?? '-')}</td>
                        <td className="px-4 py-2 text-xs">{formatMoneyValue(row.amount ?? row.quotaAmount)}</td>
                        <td className="px-4 py-2 text-xs">
                          {String(row.startDate ?? '-')} ~ {String(row.endDate ?? '长期')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-slate-400">暂无在享福利</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              在途订单 · 共 {summary?.inFlightOrders?.length ?? 0} 单
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <TableHeader>
                  <tr>
                    <TableHead>订单号</TableHead>
                    <TableHead>积分</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>下单时间</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(summary?.inFlightOrders ?? []).length ? (
                    (summary?.inFlightOrders ?? []).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 font-mono text-xs">{row.orderNo}</td>
                        <td className="px-4 py-2 text-sm">{Number(row.totalPoints ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm">{row.status ? <DictLabel dictType="hr_mall_order_status" value={row.status} fallback="-" /> : '-'}</td>
                        <td className="px-4 py-2 text-xs">{formatDateTimeValue(row.createTime)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-slate-400">暂无在途订单</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>

          <TableSurfaceCard className="lg:col-span-2">
            <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              历史申领 · 共 {summary?.recentRequests?.length ?? 0} 条
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <TableHeader>
                  <tr>
                    <TableHead>申请编号</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>金额 / 积分</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>申请时间</TableHead>
                    <TableHead>发放时间</TableHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(summary?.recentRequests ?? []).length ? (
                    (summary?.recentRequests ?? []).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 font-mono text-xs">{row.requestNo}</td>
                        <td className="px-4 py-2 text-sm">{row.requestType ? <DictLabel dictType="hr_benefit_request_type" value={row.requestType} fallback="-" /> : '-'}</td>
                        <td className="px-4 py-2 text-xs">
                          {row.amount ? formatMoneyValue(row.amount) : '-'}
                          {row.pointAmount ? ` / ${row.pointAmount} 分` : ''}
                        </td>
                        <td className="px-4 py-2 text-sm">{row.status ? <DictLabel dictType="hr_benefit_request_status" value={row.status} fallback="-" /> : '-'}</td>
                        <td className="px-4 py-2 text-xs">{formatDateTimeValue(row.createTime)}</td>
                        <td className="px-4 py-2 text-xs">{formatDateTimeValue(row.paidAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-sm text-slate-400">暂无历史申领</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />
    </div>
  );
};

export default HrBenefitMinePage;
