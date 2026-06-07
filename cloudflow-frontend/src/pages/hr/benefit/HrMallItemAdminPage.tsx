import React, { useCallback, useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { LoaderCircle, Plus, RefreshCcw, RotateCcw } from 'lucide-react';
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
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ itemName: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [editing, setEditing] = useState<HrMallItem | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<HrMallItemPayload>>(emptyForm);

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

  const filters = (
    <FilterBar
      search={{
        value: query.itemName,
        onChange: (value) => setQuery((q) => ({ ...q, itemName: value })),
        onSubmit: () => setQuery((q) => ({ ...q, pageNum: 1 })),
        placeholder: '搜索商品名称',
        widthClassName: 'w-full sm:w-[200px]',
      }}
      filters={[
        <div key="status" className="w-full sm:w-36">
          <Select value={query.status || '__all'} onValueChange={(v) => setQuery((q) => ({ ...q, pageNum: 1, status: v === '__all' ? '' : v }))}>
            <SelectTrigger className="h-10"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">全部状态</SelectItem>
              {Object.entries(statusLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${total} 条` }]}
      actions={[
        ...(hasFilters
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => setQuery((q) => ({ ...q, pageNum: 1, itemName: '', status: '' }))}>
                <RotateCcw className="mr-1.5 h-4 w-4" />清空条件
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
        <Button key="add" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />新增商品
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>积分价</TableHead>
              <TableHead>库存</TableHead>
              <TableHead>销量</TableHead>
              <TableHead>审批阈值</TableHead>
              <TableHead>状态</TableHead>
              <TableActionHead className="text-right">操作</TableActionHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-sm text-slate-400">暂无商品</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 font-mono text-xs">{row.itemNo}</td>
                  <td className="px-4 py-3 text-sm font-medium">{row.itemName}</td>
                  <td className="px-4 py-3 text-xs">{row.category ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.pointPrice}</td>
                  <td className="px-4 py-3 text-sm">{row.stock}</td>
                  <td className="px-4 py-3 text-sm">{row.salesCount ?? 0}</td>
                  <td className="px-4 py-3 text-sm">{row.approvalThreshold ?? 0}</td>
                  <td className="px-4 py-3 text-sm">{enumLabel(statusLabel, row.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <TableRowActions
                      align="end"
                      actions={[
                        { key: 'edit', label: '编辑', semantic: 'edit', permissionKey: 'hr:benefit:mall:item:edit', onClick: () => openEdit(row) },
                        { key: 'onShelf', label: '上架', semantic: 'submit', permissionKey: 'hr:benefit:mall:item:edit', onClick: () => void handleOnShelf(row), hidden: row.status !== 'OFF_SHELF' },
                        { key: 'offShelf', label: '下架', semantic: 'void', permissionKey: 'hr:benefit:mall:item:edit', onClick: () => void handleOffShelf(row), hidden: row.status !== 'ON_SHELF' },
                      ]}
                    />
                  </td>
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
