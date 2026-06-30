import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Boxes, PackagePlus, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
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
import { CrmProduct, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCrmGenericStatusLabel } from '@/utils/enumLabels';

const statusOptions = ['ACTIVE', 'INACTIVE'];

const emptyProduct: CrmProduct = {
  productName: '',
  standardPrice: 0,
  currency: 'CNY',
  status: 'ACTIVE',
};

export default function CrmProductPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmProduct[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CrmProduct>(emptyProduct);
  const [editing, setEditing] = useState<CrmProduct | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrmProduct | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const toolbarSummary = `第 ${pageNum} / ${totalPages} 页 · 共 ${total} 条`;
  const stats = useMemo(
    () => [
      { label: '产品总数', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <Boxes size={18} />, tone: 'blue' },
      { label: '启用产品', value: String(rows.filter((row) => row.status === 'ACTIVE').length), meta: '当前页统计', icon: <PackagePlus size={18} />, tone: 'green' },
      { label: '分类数', value: String(new Set(rows.map((row) => row.category).filter(Boolean)).size), meta: '当前页统计', icon: <Boxes size={18} />, tone: 'amber' },
      { label: '分页', value: `${pageNum}/${totalPages}`, meta: `每页 ${getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10)} 条`, icon: <RefreshCcw size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total, totalPages],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listProducts({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        productName: productName || undefined,
        category: category || undefined,
        status: status === 'ALL' ? undefined : status,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载产品失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, productName, category, status]);

  const saveProduct = async () => {
    try {
      if (editing?.productId) {
        await crmApi.editProduct({ ...form, productId: editing.productId });
        toast.success('产品已更新');
      } else {
        await crmApi.addProduct(form);
        toast.success('产品已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyProduct);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存产品失败'));
    }
  };

  const removeProduct = async (product: CrmProduct) => {
    if (!product.productId) return;
    try {
      await crmApi.removeProduct([product.productId]);
      toast.success('产品已删除');
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除产品失败'));
    }
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">PRODUCT CATALOG</p>
            <h2>产品管理</h2>
            <span>维护产品主数据、分类规格、标准价和可用状态</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyProduct); setDialogOpen(true); }}>
              <PackagePlus size={16} />
              新增产品
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
              <span className="input-label">搜索产品</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={productName} onChange={(e) => { setPageNum(1); setProductName(e.target.value); }} placeholder="产品名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">产品分类</span>
              <Input value={category} onChange={(e) => { setPageNum(1); setCategory(e.target.value); }} placeholder="产品分类" />
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
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1080px]">
              <thead>
                <tr>
                  <th>产品编号</th>
                  <th>产品</th>
                  <th>分类 / 规格</th>
                  <th>标准价</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-slate-500">正在加载产品...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500"><Boxes className="mx-auto mb-3 h-4 w-4" />暂无产品</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.productId}>
                    <td className="font-mono text-xs">{row.productNo || '-'}</td>
                    <td><strong>{row.productName}</strong><small>{row.unit || '-'} / {row.currency || 'CNY'}</small></td>
                    <td><strong>{row.category || '-'}</strong><small>{row.spec || '-'}</small></td>
                    <td>{Number(row.standardPrice || 0).toLocaleString('zh-CN')}</td>
                    <td>{row.ownerName || '-'}</td>
                    <td><span className={row.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-gray'}>{getCrmGenericStatusLabel(row.status)}</span></td>
                    <td>{formatDateTimeDisplay((row as CrmProduct & { updateTime?: string }).updateTime) || '-'}</td>
                    <td><div className="admin-users-row-actions"><button type="button" title="编辑产品" onClick={() => { setEditing(row); setForm(row); setDialogOpen(true); }}><Boxes size={15} /></button><button type="button" className="danger" title="删除产品" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button></div></td>
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
      <section className="admin-source-page admin-crm-page admin-crm-products-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑产品' : '新增产品'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveProduct()}>保存</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>产品名称</Label>
            <Input value={form.productName || ''} onChange={(e) => setForm((prev) => ({ ...prev, productName: e.target.value }))} placeholder="例如：企业协同套件" />
          </div>
          <div>
            <Label>产品分类</Label>
            <Input value={form.category || ''} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="例如：SaaS / 服务包" />
          </div>
          <div>
            <Label>规格型号</Label>
            <Input value={form.spec || ''} onChange={(e) => setForm((prev) => ({ ...prev, spec: e.target.value }))} placeholder="例如：专业版 / 年付" />
          </div>
          <div>
            <Label>计量单位</Label>
            <Input value={form.unit || ''} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} placeholder="例如：套 / 年 / 次" />
          </div>
          <div>
            <Label>标准价</Label>
            <Input type="number" value={String(form.standardPrice || 0)} onChange={(e) => setForm((prev) => ({ ...prev, standardPrice: Number(e.target.value || 0) }))} placeholder="标准销售价" />
          </div>
          <div>
            <Label>币种</Label>
            <Input value={form.currency || 'CNY'} onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))} placeholder="CNY" />
          </div>
          <div>
            <Label>负责人</Label>
            <Input value={form.ownerName || ''} onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))} placeholder="产品负责人" />
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
            <Textarea value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="记录产品适用场景、报价注意项、交付边界等" rows={4} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除产品"
        description={`确定删除产品“${confirmDelete?.productName || ''}”吗？`}
        confirmText="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete ? void removeProduct(confirmDelete) : undefined}
      />
    </>
  );
}
