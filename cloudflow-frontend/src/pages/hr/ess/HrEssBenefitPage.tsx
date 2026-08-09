import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Coins, LoaderCircle, RefreshCcw, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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

  const companyTotal = rows.reduce((sum, row) => sum + Number(row.companyAmount ?? 0), 0);
  const personalTotal = rows.reduce((sum, row) => sum + Number(row.personalAmount ?? 0), 0);
  const generatedCount = rows.filter((row) => row.status).length;

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
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">ess benefit</p>
                  <h2>社保福利明细</h2>
                  <span>按月份查看和生成员工社保福利缴费明细。</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                  </Button>
                  <Button size="sm" onClick={() => { setGenMonth(''); setGenOpen(true); }}>
                    <ShieldCheck className="h-4 w-4" />生成当月明细
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><ShieldCheck size={18} /></span>
                  <div><p>明细总数</p><strong>{total}</strong><span>当前查询范围</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><Coins size={18} /></span>
                  <div><p>公司缴纳</p><strong>{formatMoneyValue(companyTotal)}</strong><span>当前页合计</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><Coins size={18} /></span>
                  <div><p>个人缴纳</p><strong>{formatMoneyValue(personalTotal)}</strong><span>当前页合计</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><RefreshCcw size={18} /></span>
                  <div><p>已生成</p><strong>{generatedCount}</strong><span>当前页有状态记录</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <form
                className="admin-users-filter-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery((q) => ({ ...q, pageNum: 1 }));
                }}
              >
                <label>
                  <span>月份</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input value={query.periodMonth} onChange={(event) => setQuery((q) => ({ ...q, periodMonth: event.target.value }))} className="cf-control" placeholder="按月份筛选 YYYY-MM" />
                  </div>
                </label>
                <div className="admin-users-toolbar-actions">
                  <Button type="submit" size="sm">查询</Button>
                  {hasFilters ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, periodMonth: '' }))}>
                      <RotateCcw className="h-4 w-4" />清空条件
                    </Button>
                  ) : null}
                  <span className="admin-users-filter-count">共 {total} 条</span>
                </div>
              </form>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[920px]">
                  <thead>
                    <tr>
                      <th>期间</th>
                      <th>方案</th>
                      <th>缴费基数</th>
                      <th>公司缴纳</th>
                      <th>个人缴纳</th>
                      <th>分项</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-sm text-cf-faint">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-sm text-cf-faint">暂无明细</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="text-sm">{row.periodMonth}</td>
                          <td className="text-xs">{`方案 #${row.schemeId}`}</td>
                          <td className="text-sm">{formatMoneyValue(row.baseAmount)}</td>
                          <td className="text-sm">{formatMoneyValue(row.companyAmount)}</td>
                          <td className="text-sm">{formatMoneyValue(row.personalAmount)}</td>
                          <td className="text-xs text-cf-subtle">
                            {row.items ? Object.entries(row.items).map(([k, v]) => `${k}:${formatMoneyValue(v)}`).join(' / ') : '-'}
                          </td>
                          <td className="text-sm">{row.status ? <DictBadge dictType="hr_ess_benefit_status" value={row.status} fallback="-" /> : <span className="text-cf-faint">-</span>}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
          pagination={pagination}
        />
      </section>

      <BaseDialog
        open={genOpen}
        title="生成当月社保福利明细"
        onClose={() => setGenOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenOpen(false)}>取消</Button>
            <Button onClick={() => void handleGenerate()} disabled={generating}>生成</Button>
          </div>
        }
      >
        <div className="admin-dialog-field">
          <Label>月份（YYYY-MM）</Label>
          <Input placeholder="YYYY-MM" value={genMonth} onChange={(event) => setGenMonth(event.target.value)} />
        </div>
      </BaseDialog>
    </>
  );
};

export default HrEssBenefitPage;
