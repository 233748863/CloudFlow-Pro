import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Ban, Edit, LoaderCircle, Plus, RefreshCcw, RotateCcw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  createMallItem,
  listMallItems,
  offShelfItem,
  onShelfItem,
  updateMallItem,
  type HrMallItem,
  type HrMallItemPayload,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';
import { useAuth } from '@/context/AuthContext';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const emptyForm: Partial<HrMallItemPayload> = {
  itemNo: '',
  itemName: '',
  category: '',
  pointPrice: 0,
  stock: 0,
  status: 'OFF_SHELF',
  approvalThreshold: 0,
  coverImage: '',
  detailHtml: '',
};

export const HrMallItemAdminPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEditItem = hasPermission?.('hr:benefit:mall:item:edit') ?? true;
  const [rows, setRows] = useState<HrMallItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ itemName: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [editing, setEditing] = useState<HrMallItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<HrMallItemPayload>>(emptyForm);

  const { getOptions: getStatusOptions } = useDict('hr_mall_item_status');
  const statusOptions = getStatusOptions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { pageNum: query.pageNum, pageSize: query.pageSize };
      if (query.itemName) params.itemName = query.itemName;
      if (query.status) params.status = query.status;
      const res = await listMallItems(params);
      setRows(normalizeRows<HrMallItem>(res));
      setTotal(res?.total ?? 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载商品失败'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: HrMallItem) => {
    setEditing(row);
    setForm({
      itemNo: row.itemNo,
      itemName: row.itemName,
      category: row.category ?? '',
      pointPrice: row.pointPrice,
      stock: row.stock,
      status: row.status,
      approvalThreshold: row.approvalThreshold,
      coverImage: row.coverImage ?? '',
      detailHtml: row.detailHtml ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.itemName?.trim()) {
      toast.error('请填写商品名称');
      return;
    }
    try {
      if (editing) {
        await updateMallItem(editing.id, form);
        toast.success('已更新');
      } else {
        await createMallItem(form as HrMallItemPayload);
        toast.success('已创建');
      }
      setOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleOnShelf = async (row: HrMallItem) => {
    try {
      await onShelfItem(row.id);
      toast.success('已上架');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '上架失败'));
    }
  };

  const handleOffShelf = async (row: HrMallItem) => {
    try {
      await offShelfItem(row.id);
      toast.success('已下架');
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '下架失败'));
    }
  };

  const hasFilters = Boolean(query.itemName || query.status);

  const onShelfCount = rows.filter((row) => row.status === 'ON_SHELF').length;
  const offShelfCount = rows.filter((row) => row.status === 'OFF_SHELF').length;
  const stockTotal = rows.reduce((sum, row) => sum + Number(row.stock ?? 0), 0);

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">mall item admin</p>
          <h2>积分商城商品</h2>
          <span>维护商品库存、积分价格、上架状态和审批阈值。</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
          {canEditItem ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />新增商品
            </Button>
          ) : null}
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <span className="admin-source-stat-icon"><Plus size={18} /></span>
          <div><p>商品总数</p><strong>{total}</strong><span>当前查询范围</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <span className="admin-source-stat-icon"><Send size={18} /></span>
          <div><p>上架商品</p><strong>{onShelfCount}</strong><span>当前页可兑换</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <span className="admin-source-stat-icon"><Ban size={18} /></span>
          <div><p>下架商品</p><strong>{offShelfCount}</strong><span>当前页待维护</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <span className="admin-source-stat-icon"><RefreshCcw size={18} /></span>
          <div><p>库存合计</p><strong>{stockTotal}</strong><span>当前页库存</span></div>
        </article>
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form
        className="admin-users-filter-grid"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery((q) => ({ ...q, pageNum: 1 }));
        }}
      >
        <label>
          <span>商品名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input value={query.itemName} onChange={(event) => setQuery((q) => ({ ...q, itemName: event.target.value }))} className="cf-control" placeholder="搜索商品名称" />
          </div>
        </label>
        <label>
          <span>状态</span>
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="cf-control"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <div className="admin-users-toolbar-actions">
          <Button type="submit" size="sm">查询</Button>
          {hasFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, itemName: '', status: '' }))}>
              <RotateCcw className="h-4 w-4" />清空条件
            </Button>
          ) : null}
          <span className="admin-users-filter-count">共 {total} 条</span>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
      <table className="unity-data-table admin-source-table min-w-[1080px]">
        <thead>
          <tr>
            <th>编号</th>
            <th>名称</th>
            <th>分类</th>
            <th>积分价</th>
            <th>库存</th>
            <th>销量</th>
            <th>审批阈值</th>
            <th>状态</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-10 text-center text-sm text-slate-400">暂无商品</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="font-mono text-xs">{row.itemNo}</td>
                <td className="text-sm font-medium">{row.itemName}</td>
                <td className="text-xs">{row.category ?? '-'}</td>
                <td className="text-sm">{row.pointPrice}</td>
                <td className="text-sm">{row.stock}</td>
                <td className="text-sm">{row.salesCount ?? 0}</td>
                <td className="text-sm">{row.approvalThreshold ?? 0}</td>
                <td className="text-sm"><DictLabel dictType="hr_mall_item_status" value={row.status} fallback="-" /></td>
                <td>
                  <div className="admin-users-row-actions">
                    {canEditItem ? (
                      <button type="button" title="编辑" aria-label="编辑" onClick={() => openEdit(row)}><Edit size={15} /></button>
                    ) : null}
                    {canEditItem && row.status === 'OFF_SHELF' ? (
                      <button type="button" title="上架" aria-label="上架" onClick={() => void handleOnShelf(row)}><Send size={15} /></button>
                    ) : null}
                    {canEditItem && row.status === 'ON_SHELF' ? (
                      <button type="button" className="danger" title="下架" aria-label="下架" onClick={() => void handleOffShelf(row)}><Ban size={15} /></button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
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
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={open}
        title={editing ? '编辑商品' : '新增商品'}
        width="wide"
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>商品编号</Label>
              <Input value={form.itemNo ?? ''} onChange={(e) => setForm({ ...form, itemNo: e.target.value })} placeholder="留空自动生成" />
            </div>
            <div className="admin-dialog-field">
              <Label>商品名称</Label>
              <Input value={form.itemName ?? ''} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>分类</Label>
              <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>积分价格</Label>
              <Input type="number" value={form.pointPrice ?? 0} onChange={(e) => setForm({ ...form, pointPrice: Number(e.target.value) })} />
            </div>
            <div className="admin-dialog-field">
              <Label>库存</Label>
              <Input type="number" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
            <div className="admin-dialog-field">
              <Label>审批阈值(超过自动转工作流)</Label>
              <Input type="number" value={form.approvalThreshold ?? 0} onChange={(e) => setForm({ ...form, approvalThreshold: Number(e.target.value) })} />
            </div>
          </div>
          <div className="admin-dialog-field">
            <Label>封面图 URL</Label>
            <Input value={form.coverImage ?? ''} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} />
          </div>
          <div className="admin-dialog-field">
            <Label>详情(HTML)</Label>
            <Textarea rows={6} value={form.detailHtml ?? ''} onChange={(e) => setForm({ ...form, detailHtml: e.target.value })} />
          </div>
      </BaseDialog>
    </>
  );
};

export default HrMallItemAdminPage;
