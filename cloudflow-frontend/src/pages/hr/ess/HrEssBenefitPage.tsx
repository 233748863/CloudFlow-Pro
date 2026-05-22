import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
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
  HrBenefitPayment,
  listBenefitPayments,
  generateBenefitPayments,
} from '@/services/api/hr';
import { normalizeRows, formatMoneyValue } from '../hrShared';

export const HrEssBenefitPage: React.FC = () => {
  const [rows, setRows] = useState<HrBenefitPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMonth, setPeriodMonth] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBenefitPayments({ pageSize: 200 });
      setRows(normalizeRows<HrBenefitPayment>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '社保福利加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleGenerate = async () => {
    if (!periodMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error('请填写格式为 YYYY-MM 的月份');
      return;
    }
    try {
      await generateBenefitPayments(periodMonth);
      toast.success(`${periodMonth} 已生成`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '生成失败'));
    }
  };

  const filtered = useMemo(() => {
    if (!periodMonth) return rows;
    return rows.filter((row) => row.periodMonth === periodMonth);
  }, [rows, periodMonth]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
        <ShieldCheck className="h-5 w-5" />社保公积金
      </div>
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder="YYYY-MM"
              value={periodMonth}
              onChange={(event) => setPeriodMonth(event.target.value)}
              className="w-32"
            />
            <Button onClick={() => void handleGenerate()}>生成当月明细</Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />刷新
            </Button>
          </div>
        }
        table={
          <TableSurfaceCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>期间</TableHead>
                  <TableHead>方案</TableHead>
                  <TableHead>缴费基数</TableHead>
                  <TableHead>公司缴纳</TableHead>
                  <TableHead>个人缴纳</TableHead>
                  <TableHead>分项</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
                ) : filtered.length ? filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.periodMonth}</TableCell>
                    <TableCell className="text-xs">{`方案 #${row.schemeId}`}</TableCell>
                    <TableCell>{formatMoneyValue(row.baseAmount)}</TableCell>
                    <TableCell>{formatMoneyValue(row.companyAmount)}</TableCell>
                    <TableCell>{formatMoneyValue(row.personalAmount)}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {row.items ? Object.entries(row.items).map(([k, v]) => `${k}:${formatMoneyValue(v)}`).join(' / ') : '-'}
                    </TableCell>
                    <TableCell>{row.status || '-'}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无明细</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />
    </div>
  );
};

export default HrEssBenefitPage;
