import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, RefreshCcw, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrBenefitPayment,
  listBenefitPayments,
  generateBenefitPayments,
} from '@/services/api/hr';
import { normalizeRows, formatMoneyValue } from '../hrShared';
import { DictBadge } from '@/components/common/DictBadge';

export const HrEssBenefitPage: React.FC = () => {
  const [rows, setRows] = useState<HrBenefitPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState({ periodMonth: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });

  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.periodMonth) params.periodMonth = query.periodMonth;
      const res = await listBenefitPayments(params);
      setRows(normalizeRows<HrBenefitPayment>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '社保福利加载失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const handleGenerate = async () => {
    if (!genMonth.match(/^\d{4}-\d{2}$/)) {
      toast.error('请填写格式为 YYYY-MM 的月份');
      return;
    }
    setGenerating(true);
    try {
      await generateBenefitPayments(genMonth);
      toast.success(`${genMonth} 已生成`);
      setGenOpen(false);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '生成失败'));
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
          <ShieldCheck className="mr-1.5 h-4 w-4" />生成当月明细
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>期间</TableHead>
              <TableHead>方案</TableHead>
              <TableHead>缴费基数</TableHead>
              <TableHead>公司缴纳</TableHead>
              <TableHead>个人缴纳</TableHead>
              <TableHead>分项</TableHead>
              <TableHead>状态</TableHead>
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
                <td colSpan={7} className="py-16 text-center text-sm text-slate-400">暂无明细</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.periodMonth}</td>
                  <td className="px-4 py-3 text-xs">{`方案 #${row.schemeId}`}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.baseAmount)}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.companyAmount)}</td>
                  <td className="px-4 py-3 text-sm">{formatMoneyValue(row.personalAmount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.items ? Object.entries(row.items).map(([k, v]) => `${k}:${formatMoneyValue(v)}`).join(' / ') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">{row.status ? <DictBadge dictType="hr_ess_benefit_status" value={row.status} fallback="-" /> : <span className="text-slate-400">-</span>}</td>
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
        title="生成当月社保福利明细"
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
    </div>
  );
};

export default HrEssBenefitPage;
