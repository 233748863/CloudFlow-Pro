import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Gauge, Goal, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Label, LoadingSpinner, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import CrmSalesTargetEditor, { salesTargetBasisLabel, salesTargetMoney } from '@/components/crm/CrmSalesTargetEditor';
import { useAuth } from '@/context/AuthContext';
import { getConfigIntSync } from '@/hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '@/constants/sysConfig';
import { crmApi, type CrmSalesTarget } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

export default function CrmSalesTargetPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('crm:sales-target:list');
  const [pageSize] = useState(() => getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10));
  const [rows, setRows] = useState<CrmSalesTarget[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [targetName, setTargetName] = useState('');
  const [basis, setBasis] = useState('TEAM_V2');
  const [currency, setCurrency] = useState('CNY');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [dimension, setDimension] = useState('ALL');
  const [editor, setEditor] = useState<{ id?: number }>();
  const [detail, setDetail] = useState<{ id: number; row?: CrmSalesTarget; error?: string }>();
  const [removing, setRemoving] = useState<CrmSalesTarget>();
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const generation = useRef(0);
  const detailGeneration = useRef(0);
  const removingOperation = useRef(false);

  const load = useCallback(async () => {
    if (!canRead) return;
    const current = ++generation.current;
    setRows([]); setTotal(0); setError('');
    if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}$/.test(year) || Number(year) < 1000) {
      setError('请选择三个大写字母的币种，并填写1000至9999的年份'); setLoading(false); return;
    }
    setLoading(true);
    try {
      const result = await crmApi.listSalesTargets({ pageNum, pageSize, targetName: targetName || undefined,
        dimensionType: dimension === 'ALL' ? undefined : dimension, targetYear: Number(year), calculationBasis: basis, currency });
      if (current === generation.current) { setRows(result.rows || []); setTotal(result.total || 0); }
    } catch (failure) { if (current === generation.current) setError(getErrorMessage(failure, '销售目标读取失败')); }
    finally { if (current === generation.current) setLoading(false); }
  }, [canRead, pageNum, pageSize, targetName, dimension, year, basis, currency]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);

  const closeEditor = useCallback(() => setEditor(undefined), []);
  const saved = (row: CrmSalesTarget) => {
    setEditor(undefined); setPageNum(1);
    setBasis(row.calculationBasis || 'TEAM_V2'); setCurrency(row.currency || 'CNY'); setYear(String(row.targetYear));
    if (row.calculationBasis === basis && row.currency === currency && String(row.targetYear) === year && pageNum === 1) void load();
  };
  const showDetail = async (id: number) => {
    const current = ++detailGeneration.current;
    setDetail({ id });
    try { const row = await crmApi.getSalesTarget(id); if (current === detailGeneration.current) setDetail({ id, row }); }
    catch (failure) { if (current === detailGeneration.current) setDetail({ id, error: getErrorMessage(failure, '目标详情读取失败') }); }
  };
  const remove = async () => {
    if (removingOperation.current || !removing?.salesTargetId || removing.version == null) return;
    removingOperation.current = true; setRemoveBusy(true); setRemoveError('');
    try {
      await crmApi.removeSalesTarget([removing.salesTargetId], [removing.version]);
      setRemoving(undefined); toast.success('销售目标已删除'); await load();
    } catch (failure) { setRemoveError(getErrorMessage(failure, '删除结果未确认，请核对目标后再操作')); }
    finally { removingOperation.current = false; setRemoveBusy(false); }
  };
  const refreshRemoval = async () => {
    if (removingOperation.current || !removing?.salesTargetId) return;
    removingOperation.current = true; setRemoveBusy(true);
    try { setRemoving(await crmApi.getSalesTarget(removing.salesTargetId)); setRemoveError('已读取最新记录，请核对名称、金额和版本后重新确认删除。'); }
    catch (failure) { setRemoveError(getErrorMessage(failure, '当前目标不可读取，请关闭后刷新列表核对')); }
    finally { removingOperation.current = false; setRemoveBusy(false); }
  };
  if (!canRead) return <p role="alert">无权查看销售目标。</p>;

  return <>
    <section className="admin-source-page admin-crm-page admin-crm-sales-targets-page [--cf-density-control-height:44px] [--cf-density-control-height-sm:44px] [&_button]:!min-h-[44px] [&_button]:!min-w-[44px]">
      <TablePageLayout
        actions={<header className="admin-source-header">
          <div><p className="admin-source-kicker">SALES TARGETS</p><h2>销售目标</h2><span>回款按所选口径及币种核算；团队历史分配不随人员或比例调整改写。</span></div>
          <div className="admin-source-controls">
            <Button className="min-h-[44px]" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCcw size={16} />刷新</Button>
            {hasPermission('crm:sales-target:add') && <Button className="min-h-[44px]" onClick={() => setEditor({})}><Goal size={16} />新增销售目标</Button>}
          </div>
        </header>}
        filters={<section className="card p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div><Label htmlFor="sales-target-search">搜索目标</Label><Input id="sales-target-search" className="min-h-[44px]" value={targetName} onChange={event => { setPageNum(1); setTargetName(event.target.value); }} type="search" placeholder="目标名称" /></div>
            <div><Label htmlFor="sales-target-basis">考核口径</Label><Select value={basis} onValueChange={value => { setPageNum(1); setBasis(value); }}>
              <SelectTrigger id="sales-target-basis" className="min-h-[44px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TEAM_V2">团队分成</SelectItem><SelectItem value="OWNER_V1">旧负责人口径</SelectItem></SelectContent>
            </Select></div>
            <div><Label htmlFor="sales-target-currency">考核币种</Label><Input id="sales-target-currency" className="min-h-[44px]" maxLength={3} value={currency} onChange={event => { setPageNum(1); setCurrency(event.target.value.toUpperCase()); }} /></div>
            <div><Label htmlFor="sales-target-dimension">维度</Label><Select value={dimension} onValueChange={value => { setPageNum(1); setDimension(value); }}>
              <SelectTrigger id="sales-target-dimension" className="min-h-[44px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部维度</SelectItem><SelectItem value="OWNER">个人</SelectItem><SelectItem value="DEPT">部门</SelectItem></SelectContent>
            </Select></div>
            <div><Label htmlFor="sales-target-year">年份</Label><Input id="sales-target-year" className="min-h-[44px]" inputMode="numeric" maxLength={4} value={year} onChange={event => { setPageNum(1); setYear(event.target.value); }} /></div>
          </div>
          <p className="mt-3 text-sm text-cf-subtle">{basis === 'TEAM_V2' ? '仅计真实逐笔到账及原分配退款；期初快照单列，缺少逐笔来源的旧累计不补造分配。' : '旧口径：按当前负责人及最后到账日期计累计到账，不表示当时的团队贡献。'}</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </section>}
        table={<InnerTableSurface className="admin-crm-table-panel">
          <table className="unity-data-table admin-source-table admin-crm-table min-w-[1120px]">
            <thead><tr><th>目标</th><th>维度对象</th><th>周期</th><th>口径及币种</th><th className="text-right">目标金额</th><th className="text-right">实际回款</th><th className="text-right">完成率</th><th className="text-right">差额</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={10} className="py-10 text-center"><LoadingSpinner />正在加载销售目标…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={10} className="py-10 text-center text-cf-subtle">{error ? '当前查询未取得结果' : '所选口径、币种及年份下暂无目标'}</td></tr>
                : rows.map(row => <tr key={row.salesTargetId}>
                  <td><strong>{row.targetName}</strong><small>{row.targetNo} · {row.status === 'ACTIVE' ? '启用' : '停用'}</small></td>
                  <td><strong>{row.dimensionType === 'OWNER' ? '个人' : '部门'}</strong><small>{row.ownerName || row.deptName || '—'}</small></td>
                  <td>{row.periodLabel}</td><td>{salesTargetBasisLabel(row.calculationBasis)} · {row.currency}</td>
                  <td className="text-right tabular-nums">{salesTargetMoney(row.targetAmount)}</td>
                  <td className="text-right tabular-nums">{salesTargetMoney(row.achievedAmount)}<small>期初：{salesTargetMoney(row.baselineAmount)}</small></td>
                  <td className="text-right tabular-nums">{salesTargetMoney(row.completionRate)}%</td>
                  <td className="text-right tabular-nums">{salesTargetMoney(row.gapAmount)}</td>
                  <td>{formatDateTimeDisplay(row.updateTime) || '—'}</td>
                  <td><div className="flex flex-wrap gap-1">
                    <Button className="min-h-[44px] min-w-[44px]" variant="ghost" aria-label="查看目标详情" onClick={() => row.salesTargetId && void showDetail(row.salesTargetId)}><Eye size={16} /></Button>
                    {hasPermission('crm:sales-target:edit') && <Button className="min-h-[44px] min-w-[44px]" variant="ghost" aria-label="编辑目标" onClick={() => row.salesTargetId && setEditor({ id: row.salesTargetId })}><Gauge size={16} /></Button>}
                    {hasPermission('crm:sales-target:remove') && <Button className="min-h-[44px] min-w-[44px]" variant="ghost" aria-label="删除目标" onClick={() => { setRemoving(row); setRemoveError(''); }}><Trash2 size={16} /></Button>}
                  </div></td>
                </tr>)}</tbody>
          </table>
        </InnerTableSurface>}
        pagination={total > 0 ? <Pagination total={total} page={pageNum} pageSize={pageSize} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} /> : undefined}
      />
    </section>
    {editor && <CrmSalesTargetEditor id={editor.id} onClose={closeEditor} onSaved={saved} />}
    {detail && <BaseDialog open title="销售目标详情" onClose={() => { detailGeneration.current++; setDetail(undefined); }} width="normal"
      panelClassName="[&_button]:!min-h-[44px] [&_button]:!min-w-[44px]">
      {detail.error ? <p role="alert">{detail.error}</p> : !detail.row ? <p role="status">正在读取目标详情…</p> : <div className="space-y-2 text-sm">
        <h4 className="font-semibold">{detail.row.targetName}</h4><p>{detail.row.targetNo} · 版本{detail.row.version}</p>
        <p>{detail.row.ownerName || detail.row.deptName} · {detail.row.periodLabel}</p>
        <p>{salesTargetBasisLabel(detail.row.calculationBasis)} · {detail.row.currency}</p>
        <p>目标金额：{salesTargetMoney(detail.row.targetAmount)}；实际回款：{salesTargetMoney(detail.row.achievedAmount)}</p>
        <p>完成率：{salesTargetMoney(detail.row.completionRate)}%；差额：{salesTargetMoney(detail.row.gapAmount)}</p>
        <p>期初快照：{salesTargetMoney(detail.row.baselineAmount)}，未计入本期团队回款。</p>
        <p className="whitespace-pre-wrap">{detail.row.remark}</p>
      </div>}
    </BaseDialog>}
    {removing && <BaseDialog open title="删除销售目标" width="narrow" onClose={() => { if (!removingOperation.current) setRemoving(undefined); }}
      panelClassName="[&_button]:!min-h-[44px] [&_button]:!min-w-[44px]"
      footer={<><Button className="min-h-[44px]" variant="outline" disabled={removeBusy} onClick={() => setRemoving(undefined)}>取消</Button>
        <Button className="min-h-[44px]" variant="destructive" disabled={removeBusy || removing.version == null} onClick={() => void remove()}>{removeBusy ? '正在处理…' : '确认删除目标'}</Button></>}>
      <p className="text-sm">确认删除“{removing.targetName}”？目标金额 {salesTargetMoney(removing.targetAmount)} {removing.currency}，版本{removing.version}。</p>
      {removeError && <><p role="alert" className="mt-3 text-sm">{removeError}</p><Button className="mt-3 min-h-[44px]" variant="outline" disabled={removeBusy} onClick={() => void refreshRemoval()}>重新读取目标后核对</Button></>}
    </BaseDialog>}
  </>;
}
