import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, RefreshCcw, Send, XCircle } from 'lucide-react';
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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
  SIGNED: '已签署',
  REJECTED: '已驳回',
  EXPIRED: '已过期',
  CANCELLED: '已取消',
};

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
        <FileSignature className="h-5 w-5" />电子合同
      </div>

      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">我的合同</div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className="mr-1 h-3 w-3" />刷新
            </Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>生效期</TableHead>
                  <TableHead>截止期</TableHead>
                  <TableHead>签署状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length ? contracts.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.contractNo || `#${row.id}`}</TableCell>
                    <TableCell>{row.contractType || '-'}</TableCell>
                    <TableCell>{formatDateValue(row.startDate)}</TableCell>
                    <TableCell>{formatDateValue(row.endDate)}</TableCell>
                    <TableCell>{enumLabel(signStatusLabel, row.signStatus) || row.status || '-'}</TableCell>
                    <TableCell>
                      {!row.signStatus || row.signStatus === 'UNSIGNED' || row.signStatus === 'PENDING' ? (
                        <Button size="sm" variant="outline" onClick={() => void handleRequestSign(row.id)}>
                          <Send className="mr-1 h-3 w-3" />发起签署
                        </Button>
                      ) : <span className="text-xs text-slate-400">-</span>}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无合同</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <TableSurfaceCard className="p-5">
        <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">签署流转记录</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>合同 ID</TableHead>
              <TableHead>签署方</TableHead>
              <TableHead>方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>签署时间</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signatures.length ? signatures.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.contractId}</TableCell>
                <TableCell>{row.signerType}</TableCell>
                <TableCell>{row.signMethod || '-'}</TableCell>
                <TableCell>{enumLabel(signStatusLabel, row.signStatus)}</TableCell>
                <TableCell>{formatDateTimeValue(row.signTime)}</TableCell>
                <TableCell>{formatDateTimeValue(row.expireTime)}</TableCell>
                <TableCell>
                  {hasWorkflowStatus(row.signStatus, 'PENDING') ? (
                    <Button size="sm" variant="ghost" onClick={() => void handleCancel(row.id)}>
                      <XCircle className="mr-1 h-3 w-3" />取消
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无签署记录</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>
    </div>
  );
};

export default HrEssContractPage;
