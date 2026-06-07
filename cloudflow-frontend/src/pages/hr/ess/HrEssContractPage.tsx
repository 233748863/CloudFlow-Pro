import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, TableActionHead, TableHead, TableHeader } from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrContractSignature,
  HrRecord,
  listMyContracts,
  listMySignatures,
  requestContractSign,
  cancelContractSign,
} from '@/services/api/hr';
import { normalizeRows, formatDateValue, formatDateTimeValue, enumLabel, hasWorkflowStatus } from '../hrShared';

const signStatusLabel: Record<string, string> = {
  PENDING: '待签署',
  SIGNING: '审批中',
  SIGNED: '已签署',
  REJECTED: '已驳回',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
};

const REQUESTABLE_SIGN_STATUS = new Set(['', 'UNSIGNED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
const BLOCKED_CONTRACT_STATUS = new Set(['EXPIRED', 'TERMINATED']);

const SectionHeader: React.FC<{ title: string; aside?: React.ReactNode }> = ({ title, aside }) => (
  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    {aside}
  </div>
);

export const HrEssContractPage: React.FC = () => {
  const [contracts, setContracts] = useState<HrRecord[]>([]);
  const [signatures, setSignatures] = useState<HrContractSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, sigRes] = await Promise.all([listMyContracts(), listMySignatures()]);
      setContracts(Array.isArray(contractRes) ? contractRes : normalizeRows<HrRecord>(contractRes));
      setSignatures(normalizeRows<HrContractSignature>(sigRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '合同信息加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRequestSign = async (contractId: number) => {
    try {
      await requestContractSign(contractId);
      toast.success('已发起签署流程');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '发起失败'));
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelContractSign(id);
      toast.success('已取消');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '取消失败'));
    }
  };

  const canRequestSign = (row: any) => {
    const contractStatus = String(row?.status || '').trim().toUpperCase();
    const signStatus = String(row?.signStatus || '').trim().toUpperCase();
    if (BLOCKED_CONTRACT_STATUS.has(contractStatus)) {
      return false;
    }
    if (row?.endDate) {
      const endDate = new Date(`${row.endDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!Number.isNaN(endDate.getTime()) && endDate < today) {
        return false;
      }
    }
    return REQUESTABLE_SIGN_STATUS.has(signStatus);
  };

  return (
    <div className="space-y-4">
      <TableSurfaceCard>
        <SectionHeader
          title="我的合同"
          aside={
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>合同编号</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>生效期</TableHead>
                <TableHead>截止期</TableHead>
                <TableHead>签署状态</TableHead>
                <TableActionHead className="text-right">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                  </td>
                </tr>
              ) : contracts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-slate-400">暂无合同</td>
                </tr>
              ) : (
                contracts.map((row: any) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-sm">{row.contractNo || `#${row.id}`}</td>
                    <td className="px-4 py-3 text-sm">{row.contractType || '-'}</td>
                    <td className="px-4 py-3 text-sm">{formatDateValue(row.startDate)}</td>
                    <td className="px-4 py-3 text-sm">{formatDateValue(row.endDate)}</td>
                    <td className="px-4 py-3 text-sm">{enumLabel(signStatusLabel, row.signStatus) || row.status || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          { key: 'sign', label: '发起签署', semantic: 'submit', onClick: () => void handleRequestSign(row.id), hidden: !canRequestSign(row) },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>

      <TableSurfaceCard>
        <SectionHeader title="签署流转记录" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>合同 ID</TableHead>
                <TableHead>签署方</TableHead>
                <TableHead>方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>签署时间</TableHead>
                <TableHead>过期时间</TableHead>
                <TableActionHead className="text-right">操作</TableActionHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                  </td>
                </tr>
              ) : signatures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-sm text-slate-400">暂无签署记录</td>
                </tr>
              ) : (
                signatures.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3 text-sm">{row.contractId}</td>
                    <td className="px-4 py-3 text-sm">{row.signerType}</td>
                    <td className="px-4 py-3 text-sm">{row.signMethod || '-'}</td>
                    <td className="px-4 py-3 text-sm">{enumLabel(signStatusLabel, row.signStatus)}</td>
                    <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.signTime)}</td>
                    <td className="px-4 py-3 text-sm">{formatDateTimeValue(row.expireTime)}</td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          { key: 'cancel', label: '取消', semantic: 'void', onClick: () => void handleCancel(row.id), hidden: !hasWorkflowStatus(row.signStatus, 'PENDING') },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>
    </div>
  );
};

export default HrEssContractPage;
