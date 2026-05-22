import React, { useCallback, useEffect, useState } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { enumLabel, normalizeRows } from '../hrShared';

const statusLabel: Record<string, string> = {
  ON_SHELF: '上架中',
  OFF_SHELF: '已下架',
};

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
  const [rows, setRows] = useState<HrMallItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<HrMallItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<HrMallItemPayload>>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await listMallItems(params);
      setRows(normalizeRows<HrMallItem>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载商品失败'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">商品管理</div>
          <div className="mt-1 text-xs text-slate-500">维护积分商城 SKU,上下架与库存管理(HR 管理员入口)</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <Label className="text-xs text-slate-500">状态</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>刷新</Button>
          <Button onClick={openCreate}>新增商品</Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>积分价</TableHead>
              <TableHead>库存</TableHead>
              <TableHead>销量</TableHead>
              <TableHead>审批阈值</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-slate-400">加载中…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-slate-400">暂无商品</TableCell></TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.itemNo}</TableCell>
                  <TableCell className="font-medium">{row.itemName}</TableCell>
                  <TableCell className="text-xs">{row.category ?? '-'}</TableCell>
                  <TableCell>{row.pointPrice}</TableCell>
                  <TableCell>{row.stock}</TableCell>
                  <TableCell>{row.salesCount ?? 0}</TableCell>
                  <TableCell>{row.approvalThreshold ?? 0}</TableCell>
                  <TableCell>{enumLabel(statusLabel, row.status)}</TableCell>
                  <TableCell className="space-x-2 text-xs">
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>编辑</Button>
                    {row.status === 'OFF_SHELF' ? (
                      <Button size="sm" onClick={() => void handleOnShelf(row)}>上架</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void handleOffShelf(row)}>下架</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editing ? '编辑商品' : '新增商品'}
        width="wide"
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>商品编号</Label>
              <Input value={form.itemNo ?? ''} onChange={(e) => setForm({ ...form, itemNo: e.target.value })} placeholder="留空自动生成" />
            </div>
            <div>
              <Label>商品名称</Label>
              <Input value={form.itemName ?? ''} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
            </div>
            <div>
              <Label>分类</Label>
              <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>积分价格</Label>
              <Input type="number" value={form.pointPrice ?? 0} onChange={(e) => setForm({ ...form, pointPrice: Number(e.target.value) })} />
            </div>
            <div>
              <Label>库存</Label>
              <Input type="number" value={form.stock ?? 0} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
            </div>
            <div>
              <Label>审批阈值(超过自动转工作流)</Label>
              <Input type="number" value={form.approvalThreshold ?? 0} onChange={(e) => setForm({ ...form, approvalThreshold: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>封面图 URL</Label>
            <Input value={form.coverImage ?? ''} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} />
          </div>
          <div>
            <Label>详情(HTML)</Label>
            <Textarea rows={6} value={form.detailHtml ?? ''} onChange={(e) => setForm({ ...form, detailHtml: e.target.value })} />
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrMallItemAdminPage;
