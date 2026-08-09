import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { CheckCircle2, Eye, LoaderCircle, RefreshCcw, RotateCcw, Search, Wallet } from 'lucide-react';
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
  const confirmedCount = rows.filter((row) => row.employeeConfirmed).length;
  const netTotal = rows.reduce((sum, row) => sum + Number(row.netTotal ?? 0), 0);
  const taxTotal = rows.reduce((sum, row) => sum + Number(row.taxAmount ?? 0), 0);

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
                  <p className="admin-source-kicker">salary slip</p>
                  <h2>工资条</h2>
                  <span>查看月度工资条、确认实发记录，并生成指定月份工资条。</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                  </Button>
                  <Button size="sm" onClick={() => { setGenMonth(''); setGenOpen(true); }}>
                    <Wallet className="h-4 w-4" />生成月度工资条
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><Wallet size={18} /></span>
                  <div><p>工资条总数</p><strong>{total}</strong><span>当前查询范围</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><CheckCircle2 size={18} /></span>
                  <div><p>已确认</p><strong>{confirmedCount}</strong><span>当前页确认数</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><Wallet size={18} /></span>
                  <div><p>实发合计</p><strong>{formatMoneyValue(netTotal)}</strong><span>当前页合计</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><RotateCcw size={18} /></span>
                  <div><p>个税合计</p><strong>{formatMoneyValue(taxTotal)}</strong><span>当前页合计</span></div>
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
                    <Input
                      value={query.periodMonth}
                      onChange={(event) => setQuery((q) => ({ ...q, periodMonth: event.target.value }))}
                      className="cf-control"
                      placeholder="YYYY-MM"
                    />
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
                <table className="unity-data-table admin-source-table min-w-[840px]">
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>应发</th>
                      <th>个税</th>
                      <th>实发</th>
                      <th>状态</th>
                      <th>已确认</th>
                      <th className="text-right">操作</th>
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
                        <td colSpan={7} className="py-10 text-center text-sm text-cf-faint">暂无工资条</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          <td className="text-sm">{row.periodMonth}</td>
                          <td className="text-sm">{formatMoneyValue(row.grossTotal)}</td>
                          <td className="text-sm">{formatMoneyValue(row.taxAmount)}</td>
                          <td className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{formatMoneyValue(row.netTotal)}</td>
                          <td className="text-sm"><DictBadge dictType="salary_slip_status" value={row.status || ''} /></td>
                          <td className="text-sm">{row.employeeConfirmed ? '是' : '否'}</td>
                          <td>
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="查看" aria-label="查看" onClick={() => setDetail(row)}><Eye size={15} /></button>
                              {!row.employeeConfirmed ? (
                                <button type="button" data-tooltip="确认" aria-label="确认" onClick={() => void handleConfirm(row)}><CheckCircle2 size={15} /></button>
                              ) : null}
                            </div>
                          </td>
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
        title="生成月度工资条"
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

      <BaseDialog
        open={!!detail}
        title={`工资条 · ${detail?.periodMonth ?? ''}`}
        onClose={() => setDetail(null)}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        {detail ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-cf-subtle">应发合计</Label>
                <div className="text-lg font-semibold">{formatMoneyValue(detail.grossTotal)}</div>
              </div>
              <div>
                <Label className="text-xs text-cf-subtle">扣除合计</Label>
                <div className="text-lg font-semibold">{formatMoneyValue(detail.deductionTotal)}</div>
              </div>
              <div>
                <Label className="text-xs text-cf-subtle">个税</Label>
                <div>{formatMoneyValue(detail.taxAmount)}</div>
              </div>
              <div>
                <Label className="text-xs text-cf-subtle">福利</Label>
                <div>{formatMoneyValue(detail.benefitAmount)}</div>
              </div>
              <div>
                <Label className="text-xs text-cf-subtle">发放日期</Label>
                <div>{detail.payDate || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-cf-subtle">确认时间</Label>
                <div>{formatDateTimeValue(detail.confirmedTime)}</div>
              </div>
            </div>
            {detail.components ? (
              <div className="admin-dialog-field">
                <Label className="text-xs text-cf-subtle">分项明细</Label>
                <div className="card mt-1 overflow-hidden">
                  {Object.entries(detail.components).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs last:border-b-0 dark:border-slate-800">
                      <span className="text-cf-muted">{key}</span>
                      <span className="font-medium">{formatMoneyValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </BaseDialog>
    </>
  );
};

export default HrEssSalarySlipPage;
