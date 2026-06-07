import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, RefreshCcw, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrSalarySlip,
  listSalarySlips,
  confirmSalarySlip,
  generateSalarySlips,
} from '@/services/api/hr';
import { normalizeRows, formatMoneyValue, formatDateTimeValue } from '../hrShared';
import { DictBadge } from '@/components/common/DictBadge';

export const HrEssSalarySlipPage: React.FC = () => {
  const [rows, setRows] = useState<HrSalarySlip[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ periodMonth: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [detail, setDetail] = useState<HrSalarySlip | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.periodMonth) params.periodMonth = query.periodMonth;
      const res = await listSalarySlips(params);
      setRows(normalizeRows<HrSalarySlip>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '工资条加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

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
    if (!genMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error('请填写格式为 YYYY-MM 的月份');
      return;
    }
    setGenerating(true);
    try {
      await generateSalarySlips(genMonth);
      toast.success(`${genMonth} 工资条已生成`);
      setGenOpen(false);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '工资条生成失败'));
    } finally {
      setGenerating(false);
    }
  };

  const hasFilters = Boolean(query.periodMonth);

  const filters = (
    <FilterBar
      search={{
        value: query.periodMonth,
        onChange: (value) => setQuery((q) => ({ ...q, periodMonth: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '按月份筛选 YYYY-MM',
        widthClassName: 'w-full sm:w-[200px]',
      }}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, periodMonth: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="gen" size="sm" onClick={() => { setGenMonth(''); setGenOpen(true); }}>
          <Wallet className="mr-1.5 h-4 w-4" />生成月度工资条
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>月份</TableHead>
              <TableHead>应发</TableHead>
              <TableHead>个税</TableHead>
              <TableHead>实发</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>已确认</TableHead>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-slate-400">暂无工资条</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.periodMonth}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.grossTotal)}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.taxAmount)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-300">{formatMoneyValue(row.netTotal)}</td>
                  <td className="px-4 py-3 text-sm"><DictBadge dictType="salary_slip_status" value={row.status || ''} /></td>
                  <td className="px-4 py-3 text-sm">{row.employeeConfirmed ? '是' : '否'}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'detail', label: '查看', semantic: 'view', onClick: () => setDetail(row) },
                        { key: 'confirm', label: '确认', semantic: 'confirm', onClick: () => void handleConfirm(row), hidden: !!row.employeeConfirmed },
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
  );

  const pagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((q) => ({ ...q, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, pageNum: 1 }))}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} pagination={pagination} />

      <BaseDialog
        open={genOpen}
        title="生成月度工资条"
        onClose={() => setGenOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenOpen(false)}>取消</Button>
            <Button onClick={() => void handleGenerate()} disabled={generating}>生成</Button>
          </div>
        }
      >
        <div className="space-y-2">
          <Label>月份（YYYY-MM）</Label>
          <Input placeholder="YYYY-MM" value={genMonth} onChange={(event) => setGenMonth(event.target.value)} />
        </div>
      </BaseDialog>

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
