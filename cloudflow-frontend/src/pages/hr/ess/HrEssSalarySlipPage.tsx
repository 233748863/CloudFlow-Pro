import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrSalarySlip,
  listSalarySlips,
  confirmSalarySlip,
  generateSalarySlips,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';
import { formatMoneyValue, formatDateTimeValue } from '../hrShared';
import { getSalarySlipStatusLabel } from '@/utils/enumLabels';


export const HrEssSalarySlipPage: React.FC = () => {
  const [rows, setRows] = useState<HrSalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMonth, setPeriodMonth] = useState('');
  const [detail, setDetail] = useState<HrSalarySlip | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSalarySlips({ pageSize: 200 });
      setRows(normalizeRows<HrSalarySlip>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '工资条加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirm = async (row: HrSalarySlip) => {
    try {
      await confirmSalarySlip(row.id);
      toast.success('已确认');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '工资条确认失败'));
    }
  };

  const handleGenerate = async () => {
    if (!periodMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error('请填写格式为 YYYY-MM 的月份');
      return;
    }
    setGenerating(true);
    try {
      await generateSalarySlips(periodMonth);
      toast.success(`${periodMonth} 工资条已生成`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '工资条生成失败'));
    } finally {
      setGenerating(false);
    }
  };

  const filtered = useMemo(() => {
    if (!periodMonth) return rows;
    return rows.filter((row) => row.periodMonth === periodMonth);
  }, [rows, periodMonth]);

  return (
    <div className="p-6">
      <TablePageLayout
        actions={
          <div className="flex items-center gap-2">
            <Input
              placeholder="YYYY-MM"
              value={periodMonth}
              onChange={(event) => setPeriodMonth(event.target.value)}
              className="w-32"
            />
            <Button onClick={() => void handleGenerate()} disabled={generating}>
              <Wallet className="mr-2 h-4 w-4" />生成月度工资条
            </Button>
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
                  <TableHead>月份</TableHead>
                  <TableHead>应发</TableHead>
                  <TableHead>个税</TableHead>
                  <TableHead>实发</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>已确认</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell>
                  </TableRow>
                ) : filtered.length ? (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.periodMonth}</TableCell>
                      <TableCell>{formatMoneyValue(row.grossTotal)}</TableCell>
                      <TableCell>{formatMoneyValue(row.taxAmount)}</TableCell>
                      <TableCell className="font-semibold text-emerald-600 dark:text-emerald-300">
                        {formatMoneyValue(row.netTotal)}
                      </TableCell>
                      <TableCell>{getSalarySlipStatusLabel(row.status)}</TableCell>
                      <TableCell>{row.employeeConfirmed ? '是' : '否'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setDetail(row)}>查看</Button>
                          {!row.employeeConfirmed ? (
                            <Button size="sm" variant="outline" onClick={() => void handleConfirm(row)}>
                              <CheckCircle2 className="mr-1 h-3 w-3" />确认
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无工资条</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        }
      />

      <BaseDialog
        open={!!detail}
        title={`工资条 · ${detail?.periodMonth ?? ''}`}
        onClose={() => setDetail(null)}
        width="wide"
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">应发合计</Label>
                <div className="text-lg font-semibold">{formatMoneyValue(detail.grossTotal)}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">扣除合计</Label>
                <div className="text-lg font-semibold">{formatMoneyValue(detail.deductionTotal)}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">个税</Label>
                <div>{formatMoneyValue(detail.taxAmount)}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">福利</Label>
                <div>{formatMoneyValue(detail.benefitAmount)}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">发放日期</Label>
                <div>{detail.payDate || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-slate-500">确认时间</Label>
                <div>{formatDateTimeValue(detail.confirmedTime)}</div>
              </div>
            </div>
            {detail.components ? (
              <div>
                <Label className="text-xs text-slate-500">分项明细</Label>
                <div className="mt-1 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  {Object.entries(detail.components).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between border-b border-slate-100 py-1 text-xs last:border-0 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-300">{key}</span>
                      <span className="font-medium">{formatMoneyValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export default HrEssSalarySlipPage;
