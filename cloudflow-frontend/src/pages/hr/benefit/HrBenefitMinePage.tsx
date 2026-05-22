import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Coins, Package, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { getMyBenefitSummary, type HrBenefitMineSummary } from '@/services/api/hr';
import { enumLabel, formatDateTimeValue, formatMoneyValue } from '../hrShared';

const requestStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  APPROVING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PAID: '已发放',
  CANCELLED: '已取消',
};

const requestTypeLabel: Record<string, string> = {
  BENEFIT_CLAIM: '福利申领',
  POINT_TOPUP: '积分充值',
  POINT_ADJUST: '积分调整',
};

const orderStatusLabel: Record<string, string> = {
  PENDING: '待处理',
  APPROVING: '审批中',
  APPROVED: '已通过',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">我的福利</div>
          <div className="mt-1 text-xs text-slate-500">
            在享方案 · 积分账户 · 在途订单 · 历史申领一站式查看
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadSummary()} disabled={loading}>
          刷新
        </Button>
      </div>

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
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              在享福利方案 · 共 {summary?.activeBenefits?.length ?? 0} 项
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>方案</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>额度</TableHead>
                  <TableHead>生效期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.activeBenefits ?? []).length ? (
                  (summary?.activeBenefits ?? []).map((row: Record<string, unknown>, idx) => (
                    <TableRow key={String(row.id ?? idx)}>
                      <TableCell className="font-medium">{String(row.schemeName ?? row.name ?? '-')}</TableCell>
                      <TableCell className="text-xs">{String(row.benefitType ?? row.category ?? '-')}</TableCell>
                      <TableCell className="text-xs">{formatMoneyValue(row.amount ?? row.quotaAmount)}</TableCell>
                      <TableCell className="text-xs">
                        {String(row.startDate ?? '-')} ~ {String(row.endDate ?? '长期')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      暂无在享福利
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>

          <TableSurfaceCard>
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              在途订单 · 共 {summary?.inFlightOrders?.length ?? 0} 单
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>积分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>下单时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.inFlightOrders ?? []).length ? (
                  (summary?.inFlightOrders ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.orderNo}</TableCell>
                      <TableCell>{Number(row.totalPoints ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{enumLabel(orderStatusLabel, row.status)}</TableCell>
                      <TableCell className="text-xs">{formatDateTimeValue(row.createTime)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      暂无在途订单
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>

          <TableSurfaceCard className="lg:col-span-2">
            <div className="px-4 py-3 text-sm font-semibold text-slate-800">
              历史申领 · 共 {summary?.recentRequests?.length ?? 0} 条
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>申请编号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>金额 / 积分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>申请时间</TableHead>
                  <TableHead>发放时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary?.recentRequests ?? []).length ? (
                  (summary?.recentRequests ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.requestNo}</TableCell>
                      <TableCell>{enumLabel(requestTypeLabel, row.requestType)}</TableCell>
                      <TableCell className="text-xs">
                        {row.amount ? formatMoneyValue(row.amount) : '-'}
                        {row.pointAmount ? ` / ${row.pointAmount} 分` : ''}
                      </TableCell>
                      <TableCell>{enumLabel(requestStatusLabel, row.status)}</TableCell>
                      <TableCell className="text-xs">{formatDateTimeValue(row.createTime)}</TableCell>
                      <TableCell className="text-xs">{formatDateTimeValue(row.paidAt)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-400">
                      暂无历史申领
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        </div>
      )}
    </div>
  );
};

export default HrBenefitMinePage;
