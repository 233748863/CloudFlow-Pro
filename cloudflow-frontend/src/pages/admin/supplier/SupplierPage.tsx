import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Edit, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supplierApi, Supplier } from '@/services/api/purchase';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const createDefaultForm = (): Supplier => ({
  supplierName: '',
  contactName: '',
  contactPhone: '',
  bankName: '',
  bankAccount: '',
  status: 'ACTIVE',
});

const statusBadge = (status?: string) => (
  <DictBadge dictType="oa_supplier_status" value={String(status || 'ACTIVE')} fallback="启用" />
);

const SupplierPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_supplier_status');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchName, setSearchName] = useState('');
  const [searchParams, setSearchParams] = useState({
    supplierName: '',
    status: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [showDialog, setShowDialog] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Supplier>(createDefaultForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    void fetchSuppliers();
  }, [searchParams]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const result = await supplierApi.list(searchParams);
      setSuppliers(result.records || result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取供应商列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const activeCount = useMemo(() => suppliers.filter((item) => item.status !== 'DISABLED').length, [suppliers]);

  const handleSearch = () => {
    setSearchParams((prev) => ({ ...prev, supplierName: searchName.trim(), pageNum: 1 }));
  };

  const handleReset = () => {
    setSearchName('');
    setSearchParams({ supplierName: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const openAdd = () => {
    setCurrentSupplier(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const openEdit = (supplier: Supplier) => {
    setCurrentSupplier(supplier);
    setFormData({ ...createDefaultForm(), ...supplier });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.supplierName.trim()) {
      toast.error('请输入供应商名称');
      return;
    }
    try {
      if (currentSupplier?.supplierId) {
        await supplierApi.edit(formData);
        toast.success('更新成功');
      } else {
        await supplierApi.add(formData);
        toast.success('创建成功');
      }
      setShowDialog(false);
      await fetchSuppliers();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supplierApi.remove([deleteId]);
      toast.success('删除成功');
      setDeleteId(null);
      await fetchSuppliers();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <FilterBar
            search={{
              value: searchName,
              onChange: setSearchName,
              onSubmit: handleSearch,
              placeholder: '搜索供应商名称',
            }}
            filters={[
              <div key="status" className="w-full sm:w-[160px]">
                <Select
                  value={searchParams.status || 'ALL'}
                  onValueChange={(value) => setSearchParams((prev) => ({
                    ...prev,
                    status: value === 'ALL' ? '' : value,
                    pageNum: 1,
                  }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>,
            ]}
            stats={[
              { label: '', value: `第 ${searchParams.pageNum} / ${totalPages} 页` },
              { label: '', value: `共 ${total} 条` },
              { label: '', value: `当前页启用 ${activeCount}` },
            ]}
            actions={[
              <Button key="search" variant="outline" size="sm" onClick={handleSearch}>搜索</Button>,
              <Button key="reset" variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1.5" />
                清空条件
              </Button>,
              <Button key="add" size="sm" onClick={openAdd} disabled={!hasPermission('oa:supplier:add')}>
                <Plus size={14} className="mr-1.5" />
                新增供应商
              </Button>,
            ]}
          />
        )}
        table={(<TableSurfaceCard>
          <div className="min-h-[38rem] overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <TableHeader className="sticky top-0 z-10">
                <tr>
                  <TableHead className="px-4 py-3 text-left">供应商</TableHead>
                  <TableHead className="px-4 py-3 text-left">联系人</TableHead>
                  <TableHead className="px-4 py-3 text-left">开户信息</TableHead>
                  <TableHead className="px-4 py-3 text-left">状态</TableHead>
                  <TableActionHead className="w-36 px-4 py-3 text-right">操作</TableActionHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">正在加载供应商...</td></tr>
                ) : suppliers.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-sm text-slate-500">暂无供应商</td></tr>
                ) : suppliers.map((item) => (
                  <tr key={item.supplierId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.supplierName}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.createTime || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      <div>{item.contactName || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.contactPhone || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                      <div>{item.bankName || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.bankAccount || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(item.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        align="end"
                        actions={[
                          { label: '编辑', icon: <Edit size={14} />, onClick: () => openEdit(item), tone: 'primary', permissionKey: 'oa:supplier:edit' },
                          { label: '删除', icon: <Trash2 size={14} />, onClick: () => setDeleteId(item.supplierId!), tone: 'danger', permissionKey: 'oa:supplier:remove' },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableSurfaceCard>)}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showDialog}
        title={currentSupplier ? '编辑供应商' : '新增供应商'}
        onClose={() => setShowDialog(false)}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={currentSupplier ? !hasPermission('oa:supplier:edit') : !hasPermission('oa:supplier:add')}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">供应商名称</label>
            <Input value={formData.supplierName} onChange={(event) => setFormData((prev) => ({ ...prev, supplierName: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">状态</label>
            <Select value={formData.status || 'ACTIVE'} onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">联系人</label>
            <Input value={formData.contactName || ''} onChange={(event) => setFormData((prev) => ({ ...prev, contactName: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">联系电话</label>
            <Input value={formData.contactPhone || ''} onChange={(event) => setFormData((prev) => ({ ...prev, contactPhone: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">开户行</label>
            <Input value={formData.bankName || ''} onChange={(event) => setFormData((prev) => ({ ...prev, bankName: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">银行账号</label>
            <Input value={formData.bankAccount || ''} onChange={(event) => setFormData((prev) => ({ ...prev, bankAccount: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="删除供应商"
        message="删除后该供应商不再出现在采购申请选择列表。"
        confirmText="删除"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};

export default SupplierPage;


