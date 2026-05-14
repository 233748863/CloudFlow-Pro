import React, { useEffect, useState } from 'react';
import { BookOpenText, BookPlus, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
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
import { CrmPriceBook, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
};

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

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listPriceBooks({
        pageNum,
        pageSize: 10,
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

  return (
    <div className="space-y-4">
      <TablePageLayout
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={priceBookName} onChange={(e) => { setPageNum(1); setPriceBookName(e.target.value); }} placeholder="价目表名称" className="w-full sm:w-[220px]" />
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
              <Button size="sm" onClick={() => { setEditing(null); setForm(emptyPriceBook); setDialogOpen(true); }}><BookPlus size={14} className="mr-1.5" />新增价目表</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <TableHeader>
                  <tr>
                    <TableHead>价目表编号</TableHead>
                    <TableHead>价目表</TableHead>
                    <TableHead>生效周期</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.priceBookId}>
                      <td className="px-4 py-3 text-sm">{row.priceBookNo || '-'}</td>
                      <td className="px-4 py-3 text-sm"><div>{row.priceBookName}</div><div className="text-xs text-slate-500">{row.currency || 'CNY'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{formatDateOnly(row.startDate)}</div><div className="text-xs text-slate-500">至 {formatDateOnly(row.endDate)}</div></td>
                      <td className="px-4 py-3 text-sm">{row.ownerName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{statusLabelMap[row.status || ''] || row.status || '-'}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay((row as CrmPriceBook & { updateTime?: string }).updateTime) || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '编辑价目表', icon: <BookOpenText size={14} />, onClick: () => { setEditing(row); setForm(row); setDialogOpen(true); }, semantic: 'edit', isPrimary: true, permissionKey: 'crm:price-book:edit' },
                            { label: '删除价目表', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(row), semantic: 'delete', danger: true, permissionKey: 'crm:price-book:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">
                        <BookOpenText className="mx-auto mb-3 h-4 w-4" />
                        暂无价目表。下一步操作：先维护价目表周期与币种，再在报价中逐步接入价格基线。
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
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{statusLabelMap[item]}</SelectItem>)}
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
    </div>
  );
}
