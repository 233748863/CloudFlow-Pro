import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { BookOpenText, BookPlus, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { CrmPriceBook, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCrmGenericStatusLabel } from '@/utils/enumLabels';

const statusOptions = ['ACTIVE', 'INACTIVE'];

const emptyPriceBook: CrmPriceBook = {
  priceBookName: '',
  currency: 'CNY',
  status: 'ACTIVE',
};

const formatDateOnly = (value?: string) => {
  const formatted = formatDateTimeDisplay(value);
  return formatted === '-' ? '-' : formatted.slice(0, 10);
};

export default function CrmPriceBookPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmPriceBook[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [priceBookName, setPriceBookName] = useState('');
  const [status, setStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CrmPriceBook>(emptyPriceBook);
  const [editing, setEditing] = useState<CrmPriceBook | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrmPriceBook | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const toolbarSummary = `第 ${pageNum} / ${totalPages} 页 · 共 ${total} 条`;
  const stats = useMemo(
    () => [
      { label: '价目表总数', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <BookOpenText size={18} />, tone: 'blue' },
      { label: '启用价目表', value: String(rows.filter((row) => row.status === 'ACTIVE').length), meta: '当前页统计', icon: <BookPlus size={18} />, tone: 'green' },
      { label: '币种数', value: String(new Set(rows.map((row) => row.currency).filter(Boolean)).size), meta: '当前页统计', icon: <BookOpenText size={18} />, tone: 'amber' },
      { label: '分页', value: `${pageNum}/${totalPages}`, meta: `每页 ${getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10)} 条`, icon: <RefreshCcw size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total, totalPages],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listPriceBooks({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        priceBookName: priceBookName || undefined,
        status: status === 'ALL' ? undefined : status,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载价目表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, priceBookName, status]);

  const savePriceBook = async () => {
    try {
      if (editing?.priceBookId) {
        await crmApi.editPriceBook({ ...form, priceBookId: editing.priceBookId });
        toast.success('价目表已更新');
      } else {
        await crmApi.addPriceBook(form);
        toast.success('价目表已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyPriceBook);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存价目表失败'));
    }
  };

  const removePriceBook = async (priceBook: CrmPriceBook) => {
    if (!priceBook.priceBookId) return;
    try {
      await crmApi.removePriceBook([priceBook.priceBookId]);
      toast.success('价目表已删除');
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除价目表失败'));
    }
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">PRICE BOOKS</p>
            <h2>价目表</h2>
            <span>维护报价基线、币种、生效周期和可用状态</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyPriceBook); setDialogOpen(true); }}>
              <BookPlus size={16} />
              新增价目表
            </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid admin-crm-stat-grid">
          {stats.map((stat) => (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon">{stat.icon}</div>
              <div><p>{stat.label}</p><strong>{stat.value}</strong><span>{stat.meta}</span></div>
            </article>
          ))}
        </section>
    </>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar admin-crm-toolbar">
          <div className="admin-users-filter-grid">
            <label className="admin-source-search">
              <span className="input-label">搜索价目表</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={priceBookName} onChange={(e) => { setPageNum(1); setPriceBookName(e.target.value); }} placeholder="价目表名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">状态</span>
              <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <div className="admin-users-toolbar-actions"><span className="admin-users-filter-count">{toolbarSummary}</span></div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="admin-crm-table-panel">
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1040px]">
              <thead>
                <tr>
                  <th>价目表编号</th>
                  <th>价目表</th>
                  <th>生效周期</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-slate-500">正在加载价目表...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500"><BookOpenText className="mx-auto mb-3 h-4 w-4" />暂无价目表</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.priceBookId}>
                    <td className="font-mono text-xs">{row.priceBookNo || '-'}</td>
                    <td><strong>{row.priceBookName}</strong><small>{row.currency || 'CNY'}</small></td>
                    <td><strong>{formatDateOnly(row.startDate)}</strong><small>至 {formatDateOnly(row.endDate)}</small></td>
                    <td>{row.ownerName || '-'}</td>
                    <td><span className={row.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-gray'}>{getCrmGenericStatusLabel(row.status)}</span></td>
                    <td>{formatDateTimeDisplay((row as CrmPriceBook & { updateTime?: string }).updateTime) || '-'}</td>
                    <td><div className="admin-users-row-actions"><button type="button" title="编辑价目表" onClick={() => { setEditing(row); setForm(row); setDialogOpen(true); }}><BookOpenText size={15} /></button><button type="button" className="danger" title="删除价目表" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0
    ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} />
    : null;

  return (
    <>
      <section className="admin-source-page admin-crm-page admin-crm-price-books-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑价目表' : '新增价目表'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void savePriceBook()}>保存</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>价目表名称</Label>
            <Input value={form.priceBookName || ''} onChange={(e) => setForm((prev) => ({ ...prev, priceBookName: e.target.value }))} placeholder="例如：标准订阅价目表" />
          </div>
          <div>
            <Label>币种</Label>
            <Input value={form.currency || 'CNY'} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder="CNY" />
          </div>
          <div>
            <Label>负责人</Label>
            <Input value={form.ownerName || ''} onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="价目表负责人" />
          </div>
          <div>
            <Label>开始日期</Label>
            <DatePicker className="h-11" type="date" value={form.startDate || ''} onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))} />
          </div>
          <div>
            <Label>结束日期</Label>
            <DatePicker className="h-11" type="date" value={form.endDate || ''} onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))} />
          </div>
          <div>
            <Label>状态</Label>
            <Select value={form.status || 'ACTIVE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>备注</Label>
            <Textarea value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="记录适用区域、定价策略、折扣边界等" rows={4} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除价目表"
        description={`确定删除价目表“${confirmDelete?.priceBookName || ''}”吗？`}
        confirmText="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete ? void removePriceBook(confirmDelete) : undefined}
      />
    </>
  );
}
