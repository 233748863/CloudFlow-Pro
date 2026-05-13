import React, { useEffect, useState } from 'react';
import { Boxes, PackagePlus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { CrmProduct, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
};

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

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listProducts({
        pageNum,
        pageSize: 10,
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

  return (
    <div className="space-y-4">
      <TablePageLayout
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={productName} onChange={(e) => { setPageNum(1); setProductName(e.target.value); }} placeholder="产品名称" className="w-full sm:w-[220px]" />
              <Input value={category} onChange={(e) => { setPageNum(1); setCategory(e.target.value); }} placeholder="产品分类" className="w-full sm:w-[220px]" />
              <div className="w-full sm:w-[180px]">
                <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                  <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusOptions.map((item) => <SelectItem key={item} value={item}>{statusLabelMap[item]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCcw size={14} className="mr-1.5" />刷新</Button>
              <Button size="sm" onClick={() => { setEditing(null); setForm(emptyProduct); setDialogOpen(true); }}><PackagePlus size={14} className="mr-1.5" />新增产品</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <TableHeader>
                  <tr>
                    <TableHead>产品编号</TableHead>
                    <TableHead>产品</TableHead>
                    <TableHead>分类 / 规格</TableHead>
                    <TableHead>标准价</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.productId}>
                      <td className="px-4 py-3 text-sm">{row.productNo || '-'}</td>
                      <td className="px-4 py-3 text-sm"><div>{row.productName}</div><div className="text-xs text-slate-500">{row.unit || '-'} / {row.currency || 'CNY'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{row.category || '-'}</div><div className="text-xs text-slate-500">{row.spec || '-'}</div></td>
                      <td className="px-4 py-3 text-sm">{Number(row.standardPrice || 0).toLocaleString('zh-CN')}</td>
                      <td className="px-4 py-3 text-sm">{row.ownerName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{statusLabelMap[row.status || ''] || row.status || '-'}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay((row as CrmProduct & { updateTime?: string }).updateTime) || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '编辑产品', icon: <Boxes size={14} />, onClick: () => { setEditing(row); setForm(row); setDialogOpen(true); }, semantic: 'edit', isPrimary: true },
                            { label: '删除产品', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(row), semantic: 'delete', danger: true },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-sm text-slate-500">
                        <Boxes className="mx-auto mb-3 h-4 w-4" />
                        暂无产品。下一步操作：先维护产品主数据，再在报价中逐步接入行项目选择。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>
        )}
        pagination={total > 0 ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} /> : null}
      />

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
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{statusLabelMap[item]}</SelectItem>)}
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
    </div>
  );
}
